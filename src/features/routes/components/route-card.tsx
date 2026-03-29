"use client";

import { MapPin, TrendingUp } from "lucide-react";
import { cn } from "@/core/utils";
import { routeProfitColor } from "@/core/utils/rate-color";
import { getOriginCity, getDestCity, getDailyProfit, getNetProfit, getNetPerMile, getEstimatedDays, getRouteStates, formatCurrency, formatRpm } from "@/core/utils/route-helpers";
import type { RouteChain, RoundTripChain } from "@/core/types";

interface RouteCardProps {
  chain: RouteChain | RoundTripChain;
  isRoundTrip: boolean;
  onClick: () => void;
  className?: string;
}

export function RouteCard({ chain, isRoundTrip, onClick, className }: RouteCardProps) {
  const routeStates = getRouteStates(chain);
  const dailyProfit = getDailyProfit(chain);
  const netProfit = getNetProfit(chain);
  const netPerMile = getNetPerMile(chain);
  const estDays = getEstimatedDays(chain);
  const color = dailyProfit !== null ? routeProfitColor(dailyProfit) : "text-muted-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border border-white/10 bg-card p-4 transition-colors active:bg-muted/50",
        className,
      )}
    >
      {/* Row 1: Route states + trip type */}
      <div className="flex items-center gap-2.5 mb-2">
        <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="text-base font-medium">
          {routeStates}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {isRoundTrip ? "Round trip" : "One way"}
        </span>
      </div>

      {/* Row 2: Key metrics */}
      <div className="flex items-center gap-4 text-base mb-1">
        {dailyProfit !== null && (
          <span className="flex items-center gap-1.5">
            <TrendingUp className={cn("h-5 w-5", color)} />
            <span className={cn("font-semibold", color)}>
              {formatCurrency(dailyProfit)}/day
            </span>
          </span>
        )}
        {netProfit !== null && (
          <span className={cn("font-semibold", color)}>
            {formatCurrency(netProfit)}
          </span>
        )}
        {netPerMile !== null && (
          <span className={cn("font-semibold", color)}>
            {formatRpm(netPerMile)}
          </span>
        )}
      </div>

      {/* Row 3: Est. days */}
      {estDays !== null && (
        <div className="text-sm text-muted-foreground">
          {estDays % 1 === 0 ? estDays : estDays.toFixed(1)} {estDays === 1 ? "Day" : "Days"} est.
        </div>
      )}
    </button>
  );
}
