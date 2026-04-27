"use client";

import { Skeleton } from "@/platform/web/components/ui/skeleton";
import { useAnalyticsStats } from "@/core/hooks/use-analytics";

interface StatCardProps {
  title: string;
  value: string;
  indicator?: "green" | "red";
}

function StatCard({ title, value, indicator }: StatCardProps) {
  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        {indicator && (
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              indicator === "green" ? "bg-green-500" : "bg-red-500"
            }`}
          />
        )}
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
      </div>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 px-4 py-3">
      <Skeleton className="h-3 w-24 mb-2" />
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

export function StatsCards({ companyId }: { companyId: string }) {
  const { data, isLoading, isError } = useAnalyticsStats(companyId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Active Orders" value="—" />
        <StatCard title="Avg Rate / Mile" value="—" indicator="green" />
        <StatCard title="Avg Pay / Order" value="—" />
        <StatCard title="Orders Added" value="—" indicator="green" />
        <StatCard title="Orders Removed" value="—" indicator="red" />
      </div>
    );
  }

  const hasData = data.total_open > 0 || data.orders_removed > 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <StatCard
        title="Total Active Orders"
        value={hasData ? data.total_open.toLocaleString() : "—"}
      />
      <StatCard
        title="Avg Rate / Mile"
        value={hasData && data.avg_rate_per_mile > 0 ? `$${data.avg_rate_per_mile.toFixed(2)}` : "—"}
        indicator="green"
      />
      <StatCard
        title="Avg Pay / Order"
        value={
          hasData && data.avg_pay > 0
            ? `$${data.avg_pay.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
            : "—"
        }
      />
      <StatCard
        title="Orders Added"
        value={hasData ? data.orders_added.toLocaleString() : "—"}
        indicator="green"
      />
      <StatCard
        title="Orders Removed"
        value={hasData ? data.orders_removed.toLocaleString() : "—"}
        indicator="red"
      />
    </div>
  );
}
