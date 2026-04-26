"use client";

import type { DiscoveredRoute } from "@/core/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/platform/web/components/ui/card";
import { Button } from "@/platform/web/components/ui/button";
import { useRouteDiscoveryStore } from "../store";
import { DiscoveredRouteMap } from "./DiscoveredRouteMap";
import { ReliabilityTable } from "./ReliabilityTable";
import { EconomicsHistograms } from "./EconomicsHistograms";

interface Props {
  route: DiscoveredRoute | null;
  radiusMiles: number;
}

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

export function DrilldownPanel({ route, radiusMiles }: Props) {
  const setActiveOrder = useRouteDiscoveryStore((s) => s.setActiveOrder);

  if (!route) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Select a route to view its drilldown.
        </CardContent>
      </Card>
    );
  }

  const startCity = route.orders[0]?.origin_anchor.display_city ?? "home";
  const startState = route.orders[0]?.origin_anchor.display_state ?? "";
  const start = `${startCity}${startState ? `, ${startState}` : ""}`;
  const legCount = route.orders.length;
  const totalPay = route.total_pay.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const reliabilityPct = Math.round(route.composite_reliability * 100);
  const deadheadPct = Math.round(route.all_in_deadhead_pct);
  const days = route.estimated_days.toFixed(1);
  const rpm = route.all_in_gross_rpm.toFixed(2);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Route detail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          From{" "}
          <span className="font-medium text-foreground">{start}</span>, you'd
          run{" "}
          <span className="font-medium text-foreground">
            {legCount} loads over ~{days} days
          </span>
          , earning{" "}
          <span className="font-medium text-foreground">
            {totalPay} total gross
          </span>{" "}
          at{" "}
          <span className="font-medium text-foreground">${rpm}/mi all-in</span>
          . Only{" "}
          <span className="font-medium text-foreground">
            {deadheadPct}% of miles are empty
          </span>
          . Based on history, there's a{" "}
          <span className="font-medium text-foreground">
            {reliabilityPct}% chance
          </span>{" "}
          all {legCount} loads are available within their 3-day windows.
        </p>

        <DiscoveredRouteMap
          orders={route.orders}
          onClickOrder={(i) => {
            setActiveOrder(i);
            scrollToId("route-discovery-leg-deadhead");
          }}
          onClickAnchor={() => scrollToId("route-discovery-region-inspector")}
        />

        <div>
          <h3 className="text-sm font-semibold mb-2">Per-order reliability</h3>
          <ReliabilityTable route={route} />
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2">Economics</h3>
          <EconomicsHistograms route={route} radiusMiles={radiusMiles} />
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => scrollToId("route-discovery-region-inspector")}
          >
            → Inspect region
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => scrollToId("route-discovery-lane-density")}
          >
            → View order density
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => scrollToId("route-discovery-leg-deadhead")}
          >
            → View deadhead distribution
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
