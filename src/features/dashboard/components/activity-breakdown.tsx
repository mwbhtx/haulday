"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/platform/web/components/ui/card";
import { Skeleton } from "@/platform/web/components/ui/skeleton";
import { useAnalyticsHistory, useAnalyticsStats } from "@/core/hooks/use-analytics";

interface StatRowProps {
  label: string;
  sublabel?: string;
  value: string;
  valueColor?: string;
}

function StatRow({ label, sublabel, value, valueColor }: StatRowProps) {
  return (
    <div className="flex flex-col gap-1 bg-card px-4 py-3">
      <p className="text-xs font-medium text-foreground">{label}</p>
      {sublabel && (
        <p className="text-[11px] text-muted-foreground leading-tight">{sublabel}</p>
      )}
      <span className={`text-xl font-bold tabular-nums mt-1 ${valueColor ?? ""}`}>
        {value}
      </span>
    </div>
  );
}

export function ActivityBreakdown({
  companyId,
  from,
  to,
  bucket,
}: {
  companyId: string;
  from?: string;
  to?: string;
  bucket?: string;
}) {
  const { data: history, isLoading: historyLoading } = useAnalyticsHistory(
    companyId,
    from,
    to,
    bucket,
  );
  const { data: stats, isLoading: statsLoading } = useAnalyticsStats(
    companyId,
    from,
    to,
  );

  const isLoading = historyLoading || statsLoading;

  const derived = (() => {
    if (!history || history.length === 0 || !stats) return null;

    // Peak active
    let peakActive = 0;
    let peakPeriod = "";
    for (const h of history) {
      if (h.active_orders > peakActive) {
        peakActive = h.active_orders;
        peakPeriod = h.period;
      }
    }

    // Format peak time
    let peakTimeLabel = "";
    if (peakPeriod) {
      try {
        const d = new Date(peakPeriod);
        const isToday = new Date().toDateString() === d.toDateString();
        peakTimeLabel = isToday
          ? "Today " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
          : d.toLocaleDateString([], { month: "short", day: "numeric" }) +
            " " +
            d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      } catch {
        peakTimeLabel = peakPeriod;
      }
    }

    // Avg per hour (total added / number of hours in the range)
    const totalAdded = stats.orders_added;
    const totalRemoved = stats.orders_removed;
    const periods = history.length || 1;
    const avgPerPeriod = Math.round(totalAdded / periods);

    // Net change
    const netChange = totalAdded - totalRemoved;

    // Removal rate
    const removalRate = totalAdded > 0
      ? ((totalRemoved / totalAdded) * 100).toFixed(1)
      : "0.0";

    // Fill ratio (active / added)
    const fillRatio = totalAdded > 0
      ? ((stats.total_open / totalAdded) * 100).toFixed(1)
      : "0.0";

    return { peakActive, peakTimeLabel, avgPerPeriod, netChange, removalRate, fillRatio };
  })();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Activity Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !derived ? (
          <div className="flex items-center justify-center text-muted-foreground py-4">
            No data available
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-px border border-border rounded-lg overflow-hidden">
            <StatRow
              label="Peak Active"
              sublabel={derived.peakTimeLabel}
              value={derived.peakActive.toLocaleString()}
              valueColor="text-positive"
            />
            <StatRow
              label="Avg / Hour"
              sublabel="Last Period"
              value={derived.avgPerPeriod.toLocaleString()}
            />
            <StatRow
              label="Net Change"
              sublabel="Added − Removed"
              value={`${derived.netChange >= 0 ? "+" : ""}${derived.netChange.toLocaleString()}`}
              valueColor={derived.netChange >= 0 ? "text-positive" : "text-negative"}
            />
            <StatRow
              label="Removal Rate"
              sublabel="Removed / Added"
              value={`${derived.removalRate}%`}
            />
            <StatRow
              label="Fill Ratio"
              sublabel="Active / Added"
              value={`${derived.fillRatio}%`}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
