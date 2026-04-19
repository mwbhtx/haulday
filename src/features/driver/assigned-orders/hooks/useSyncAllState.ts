"use client";

import { useEffect, useRef, useState } from "react";
import { getTask } from "../api";
import type { ActiveSyncTask } from "../types";

export type SyncAllState =
  | "ready"
  | "in_flight"
  | "just_finished"
  | "cooldown"
  | "failed";

export interface UseSyncAllStateOptions {
  activeSyncTask: ActiveSyncTask | null;
  /**
   * ISO timestamp when the next sync becomes available, or `null` when the
   * user has never synced (treated as "ready immediately").
   */
  nextSyncAvailableAt: string | null;
  onFinished: () => void;
}

export interface UseSyncAllStateResult {
  state: SyncAllState;
  enabled: boolean;
  remainingMs: number;
  progress: { completed: number; total: number } | null;
}

const POLL_INTERVAL_MS = 3_000;
const JUST_FINISHED_DWELL_MS = 3_000;
const FAILED_DWELL_MS = 3_000;

/**
 * Cadence for the cooldown countdown — slower when the user doesn't need
 * sub-minute precision, faster as we approach zero.
 */
export function computeCadence(remainingMs: number): number {
  if (remainingMs <= 10_000) return 1_000;
  if (remainingMs <= 60_000) return 5_000;
  return 60_000;
}

function targetMsFromIso(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function useSyncAllState(
  opts: UseSyncAllStateOptions,
): UseSyncAllStateResult {
  const { activeSyncTask, nextSyncAvailableAt, onFinished } = opts;

  const initialTarget = targetMsFromIso(nextSyncAvailableAt);
  const initialState: SyncAllState = activeSyncTask
    ? "in_flight"
    : initialTarget > Date.now()
      ? "cooldown"
      : "ready";
  const [state, setState] = useState<SyncAllState>(initialState);
  const [activeTask, setActiveTask] = useState<ActiveSyncTask | null>(activeSyncTask);
  const [now, setNow] = useState<number>(() => Date.now());

  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const targetMsRef = useRef<number>(initialTarget);

  // Re-sync when caller passes a new active task (e.g. after a successful POST).
  // We key on task_id so unchanged references don't churn the polling loop.
  const incomingTaskId = activeSyncTask?.task_id ?? null;
  useEffect(() => {
    setActiveTask(activeSyncTask);
    if (activeSyncTask) {
      setState("in_flight");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingTaskId]);

  // Reset clock target whenever the cooldown anchor changes.
  useEffect(() => {
    targetMsRef.current = targetMsFromIso(nextSyncAvailableAt);
    setNow(Date.now());
  }, [nextSyncAvailableAt]);

  // Poll task while in_flight.
  useEffect(() => {
    if (state !== "in_flight" || !activeTask) return;
    const id = setInterval(async () => {
      try {
        const latest = await getTask(activeTask.task_id);
        setActiveTask(latest);
        if (latest.task_status === "completed") {
          setState("just_finished");
          onFinishedRef.current();
          setTimeout(() => setState("cooldown"), JUST_FINISHED_DWELL_MS);
        } else if (latest.task_status === "failed") {
          setState("failed");
          setTimeout(() => setState("cooldown"), FAILED_DWELL_MS);
        }
      } catch {
        // Transient error — keep polling.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // We deliberately key on task_id (not the activeTask object) so progress
    // updates from setActiveTask don't tear down the polling interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, activeTask?.task_id]);

  // Cadence-driven clock for cooldown / ready resolution.
  useEffect(() => {
    if (state === "in_flight" || state === "just_finished" || state === "failed") {
      return;
    }
    const remaining = Math.max(0, targetMsRef.current - Date.now());
    const cadence = computeCadence(remaining);
    const id = setInterval(() => setNow(Date.now()), cadence);
    return () => clearInterval(id);
  }, [state, now]);

  const remainingMs = Math.max(0, targetMsRef.current - now);

  // Resolve ready vs cooldown from the clock.
  useEffect(() => {
    if (state === "in_flight" || state === "just_finished" || state === "failed") {
      return;
    }
    if (remainingMs > 0 && state !== "cooldown") setState("cooldown");
    if (remainingMs === 0 && state !== "ready") setState("ready");
  }, [remainingMs, state]);

  const progress = activeTask
    ? { completed: activeTask.orders_completed, total: activeTask.orders_total }
    : null;

  return {
    state,
    enabled: state === "ready",
    remainingMs,
    progress,
  };
}
