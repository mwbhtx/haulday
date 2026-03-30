import type { RouteChain, RoundTripChain } from "@/core/types";
import type { RouteSortKey } from "@mwbhtx/haulvisor-core";

export type SortKey = RouteSortKey;

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "daily_profit", label: "$/Day" },
  { key: "profit", label: "Profit" },
  { key: "deadhead", label: "Deadhead" },
];

export function sortRouteChains(chains: RouteChain[], sortBy: SortKey): RouteChain[] {
  const sorted = [...chains];
  switch (sortBy) {
    case "profit": sorted.sort((a, b) => b.profit - a.profit); break;
    case "daily_profit": sorted.sort((a, b) => b.daily_net_profit - a.daily_net_profit); break;
    case "deadhead": sorted.sort((a, b) => a.deadhead_pct - b.deadhead_pct); break;
  }
  return sorted;
}

export function sortRoundTripChains(chains: RoundTripChain[], sortBy: SortKey): RoundTripChain[] {
  const sorted = [...chains];
  switch (sortBy) {
    case "profit": sorted.sort((a, b) => b.firm_profit - a.firm_profit); break;
    case "daily_profit": sorted.sort((a, b) => b.daily_net_profit - a.daily_net_profit); break;
    case "deadhead": sorted.sort((a, b) => a.deadhead_pct - b.deadhead_pct); break;
  }
  return sorted;
}
