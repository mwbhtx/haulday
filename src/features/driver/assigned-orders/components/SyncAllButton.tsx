"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/platform/web/components/ui/button";
import { ApiError } from "@/core/services/api";
import {
  listAssignedOrders,
  refreshAssignedOrders,
  syncAllAssignedOrders,
} from "../api";
import type { ActiveSyncTask, SyncAllResponse } from "../types";
import { useSyncAllState } from "../hooks/useSyncAllState";

export interface SyncAllButtonProps {
  activeSyncTask: ActiveSyncTask | null;
  nextSyncAvailableAt: string | null;
  onSyncStarted: (resp: SyncAllResponse) => void;
  onSyncFinished: () => void;
}

const ERROR_DWELL_MS = 3_000;

function formatRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds >= 60) return `${Math.ceil(seconds / 60)}m`;
  return `${seconds}s`;
}

export function SyncAllButton({
  activeSyncTask,
  nextSyncAvailableAt,
  onSyncStarted,
  onSyncFinished,
}: SyncAllButtonProps) {
  const [isPosting, setIsPosting] = useState(false);
  const [refreshCount, setRefreshCount] = useState<number | null>(null);
  const [errorDwell, setErrorDwell] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    },
    [],
  );

  const { state, enabled, remainingMs, progress } = useSyncAllState({
    activeSyncTask,
    nextSyncAvailableAt,
    onFinished: onSyncFinished,
  });

  async function handleClick() {
    if (!enabled || isPosting) return;
    setIsPosting(true);
    setRefreshCount(null);
    try {
      // Stage 1: refresh the assigned-orders list from the carrier.
      // Fire-and-forget on the backend; poll the list to detect when the
      // scraper finishes.
      await refreshAssignedOrders();
      await waitForAssignedOrdersToStabilize(setRefreshCount);

      // Stage 2: fan out order-detail fetches for every assigned order.
      const resp = await syncAllAssignedOrders();
      onSyncStarted(resp);
    } catch (err) {
      let msg = "Sync failed";
      if (err instanceof ApiError) {
        if (err.status === 429) msg = "Cooldown still active";
        else if (err.status === 409) msg = "Sync already in progress";
        else if (err.status === 422) msg = "No orders found on your carrier";
      }
      setErrorDwell(msg);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(
        () => setErrorDwell(null),
        ERROR_DWELL_MS,
      );
    } finally {
      setIsPosting(false);
    }
  }

  /**
   * Wait for the backend's assigned-orders list to finish updating after a
   * /refresh trigger. Polls every 5s; considers the list "stable" once two
   * consecutive checks return the same count. Caps at ~3 min so a silent
   * scraper failure doesn't lock the user out. Reports the live count to
   * the caller via onCount so the button label can show progress.
   */
  async function waitForAssignedOrdersToStabilize(
    onCount: (n: number) => void,
  ) {
    const POLL_MS = 5_000;
    const MAX_POLLS = 36; // ~3 min total
    let lastCount = -1;
    let stableCount = 0;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      try {
        const data = await listAssignedOrders();
        onCount(data.orders.length);
        if (data.orders.length === lastCount) {
          stableCount++;
          // Stable (even at 0) — sync-all will decide; surfacing 422
          // faster than timing out gives the user a clearer error.
          if (stableCount >= 2) return;
        } else {
          stableCount = 0;
        }
        lastCount = data.orders.length;
      } catch {
        // ignore transient errors — continue polling
      }
    }
  }

  let icon: React.ReactNode;
  let label: string;
  if (errorDwell) {
    icon = <AlertTriangle className="h-4 w-4" />;
    label = errorDwell;
  } else if (isPosting && state !== "in_flight") {
    // Stage 1 — refresh + wait-for-stable. Before sync-all task is created.
    icon = <Loader2 className="h-4 w-4 animate-spin" />;
    label = refreshCount != null
      ? `Syncing orders… (${refreshCount} found)`
      : "Syncing orders…";
  } else if (state === "in_flight" && progress) {
    icon = <Loader2 className="h-4 w-4 animate-spin" />;
    label = `Syncing ${progress.completed}/${progress.total}`;
  } else if (state === "just_finished") {
    icon = <Check className="h-4 w-4" />;
    label = "Synced";
  } else if (state === "failed") {
    icon = <AlertTriangle className="h-4 w-4" />;
    label = "Sync failed";
  } else if (state === "cooldown") {
    icon = <RotateCw className="h-4 w-4" />;
    label = `Available in ${formatRemaining(remainingMs)}`;
  } else {
    icon = <RotateCw className="h-4 w-4" />;
    label = "Sync Orders";
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={!enabled || isPosting || !!errorDwell}
      aria-live="polite"
      className="gap-2"
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}
