"use client";

import type { DiscoveredRoute } from "@/core/types";
import { useRouteDiscoveryStore } from "../store";
import { useLaneDensity } from "../hooks/use-lane-density";

interface Props {
  route: DiscoveredRoute;
  radiusMiles: number;
}

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const fmtRpm = (n: number) => `$${n.toFixed(2)}/mi`;

export function EconomicsHistograms({ route, radiusMiles }: Props) {
  const activeOrderIndex = useRouteDiscoveryStore((s) => s.activeOrderIndex);
  const order = route.orders[activeOrderIndex] ?? route.orders[0];

  const laneQuery = order
    ? {
        origin_lat: order.origin_anchor.lat,
        origin_lng: order.origin_anchor.lng,
        destination_lat: order.destination_anchor.lat,
        destination_lng: order.destination_anchor.lng,
        radius_miles: radiusMiles,
      }
    : null;

  const { data, isLoading } = useLaneDensity(laneQuery);

  if (!order) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">Median pay</div>
          <div className="text-xl font-semibold">{fmtMoney(order.median_pay)}</div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">Median RPM</div>
          <div className="text-xl font-semibold">{fmtRpm(order.median_rpm)}</div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">Median loaded miles</div>
          <div className="text-xl font-semibold tabular-nums">
            {order.median_loaded_miles.toLocaleString()}
          </div>
        </div>
        <div className="rounded border p-3 col-span-3">
          <div className="text-xs text-muted-foreground">Sample size (90d)</div>
          <div className="text-xl font-semibold tabular-nums">
            {isLoading ? "…" : data?.total_count?.toLocaleString() ?? "—"}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        v1 displays per-order medians and sample size in lieu of full pay/RPM histograms.
        Full distributions will land when the backend payload includes histogram bins.
      </p>
    </div>
  );
}
