"use client";

import type { DiscoveredRoute } from "@/core/types";
import { useRouteDiscoveryStore } from "../store";
import { LEG_COLORS } from "@/core/utils/route-colors";

interface Props {
  route: DiscoveredRoute;
  onHoverOrder?: (i: number | null) => void;
}

export function ReliabilityTable({ route, onHoverOrder }: Props) {
  const activeOrderIndex = useRouteDiscoveryStore((s) => s.activeOrderIndex);
  const setActiveOrder = useRouteDiscoveryStore((s) => s.setActiveOrder);

  return (
    <div className="overflow-x-auto" role="region" aria-label="Per-order reliability breakdown">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="px-2 py-1 font-medium">#</th>
            <th scope="col" className="px-2 py-1 font-medium">Origin → Dest</th>
            <th scope="col" className="px-2 py-1 font-medium text-right">Rate (orders/day)</th>
            <th scope="col" className="px-2 py-1 font-medium text-right">Reliability (W=3)</th>
          </tr>
        </thead>
        <tbody>
          {route.orders.map((o, i) => {
            const selected = activeOrderIndex === i;
            const color = LEG_COLORS[i % LEG_COLORS.length];
            return (
              <tr
                key={`order-${i}`}
                onClick={() => setActiveOrder(i)}
                onMouseEnter={() => onHoverOrder?.(i)}
                onMouseLeave={() => onHoverOrder?.(null)}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                aria-selected={selected}
                style={
                  selected
                    ? { backgroundColor: `${color}1f`, borderLeft: `3px solid ${color}` }
                    : undefined
                }
              >
                <td className="px-2 py-1">{i + 1}</td>
                <td className="px-2 py-1">
                  {o.origin_anchor.display_city ?? "?"},{" "}
                  {o.origin_anchor.display_state ?? "?"}
                  {" → "}
                  {o.destination_anchor.display_city ?? "?"},{" "}
                  {o.destination_anchor.display_state ?? "?"}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {o.rate_per_day.toFixed(2)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {Math.round(o.reliability * 100)}%
                </td>
              </tr>
            );
          })}
          <tr className="border-t font-semibold">
            <td colSpan={3} className="px-2 py-1 text-right">
              Total composite reliability
            </td>
            <td className="px-2 py-1 text-right tabular-nums">
              {Math.round(route.composite_reliability * 100)}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
