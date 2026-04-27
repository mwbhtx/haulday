"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/platform/web/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/platform/web/components/ui/table";
import { Skeleton } from "@/platform/web/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/platform/web/components/ui/tooltip";
import { useAnalyticsTopStates } from "@/core/hooks/use-analytics";
import type { AnalyticsSide } from "@/core/types";

const currency2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const OPENED_PER_DAY_TOOLTIP =
  "Loads whose opened_at timestamp falls inside the selected window, divided by window length in days. Window-averaged. Sub-hour windows are normalized as if the window were one hour.";

const DIVERSITY_TOOLTIP =
  "Shannon entropy of the partner distribution, in nats. Higher = more diverse partners (robust); lower = concentrated (brittle). 0 means all loads go to (or come from) a single partner. e^H ≈ effective number of partners.";

export function TopStatesTable({
  companyId,
  side,
  from,
  to,
}: {
  companyId: string;
  side: AnalyticsSide;
  from?: string;
  to?: string;
}) {
  const { data, isLoading, isError } = useAnalyticsTopStates(
    companyId,
    side,
    from,
    to,
  );

  const title =
    side === "origin" ? "Top Origin States" : "Top Destination States";
  const diversityHeader =
    side === "origin" ? "Outbound Diversity" : "Inbound Diversity";

  const rows = data ?? [];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <TooltipProvider>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 text-right">#</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>Opened/day</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {OPENED_PER_DAY_TOOLTIP}
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="text-right">$/mi</TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>{diversityHeader}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {DIVERSITY_TOOLTIP}
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : isError || rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No data available
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, i) => (
                  <TableRow key={r.state}>
                    <TableCell className="text-right tabular-nums">{i + 1}</TableCell>
                    <TableCell>{r.state}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.loads_per_day.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.median_rate_per_mile === null ? "—" : currency2.format(r.median_rate_per_mile)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.entropy_h.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
