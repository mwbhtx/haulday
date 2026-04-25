import type { RouteChain } from "@/core/types";
import type { RouteSortKey } from "@mwbhtx/haulvisor-core";

export type SortKey = RouteSortKey;

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "daily_profit", label: "$/Day" },
  { key: "profit", label: "Profit" },
  { key: "all_in_gross_rpm", label: "$/mi all-in" },
];

export function sortRouteChains(chains: RouteChain[], sortBy: SortKey): RouteChain[] {
  const sorted = [...chains];
  switch (sortBy) {
    case "profit": sorted.sort((a, b) => b.profit - a.profit); break;
    case "daily_profit": sorted.sort((a, b) => b.daily_net_profit - a.daily_net_profit); break;
    case "all_in_gross_rpm": sorted.sort((a, b) => b.all_in_gross_rpm - a.all_in_gross_rpm); break;
  }
  return sorted;
}
