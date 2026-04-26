"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/platform/web/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/platform/web/components/ui/tabs";
import { FilterBar, type FilterBarValues } from "../../components/FilterBar";
import { RoutesList } from "../../components/RoutesList";
import { DrilldownPanel } from "../../components/DrilldownPanel";
import { EngineInspectors } from "../../components/EngineInspectors";
import { EmptyState } from "../../components/EmptyState";
import { HowItWorks } from "../../components/HowItWorks";
import { useDiscoveredRoutes } from "../../hooks/use-routes";
import { useTopRoutes } from "../../hooks/use-top-routes";
import { useRouteDiscoveryStore } from "../../store";
import type { RoutesQuery } from "../../api";

type TabId = "search" | "leaderboard";

export function DesktopRouteDiscoveryView() {
  const [tab, setTab] = useState<TabId>("search");
  const [query, setQuery] = useState<RoutesQuery | null>(null);
  const { data, isLoading, error } = useDiscoveredRoutes(query);
  const { data: topData, isLoading: topLoading } = useTopRoutes();
  const selectedRowIndex = useRouteDiscoveryStore((s) => s.selectedRowIndex);
  const resetSelection = useRouteDiscoveryStore((s) => s.resetSelection);

  const searchRows = data?.rows ?? [];
  const topRows = topData?.rows ?? [];
  const activeRows = tab === "search" ? searchRows : topRows;
  const selectedRoute = selectedRowIndex !== null ? activeRows[selectedRowIndex] ?? null : null;

  const handleTabChange = (value: string) => {
    resetSelection();
    setTab(value as TabId);
  };

  useEffect(() => {
    resetSelection();
  }, [query, resetSelection]);

  const handleSearch = (values: FilterBarValues) => {
    setQuery({ city: values.city, state: values.state, radius_miles: values.radius_miles });
  };

  const regionQuery = query
    ? { city: query.city, state: query.state, radius_miles: query.radius_miles }
    : null;

  const laneQuery =
    selectedRoute?.orders[0]
      ? {
          origin_lat: selectedRoute.orders[0].origin_anchor.lat,
          origin_lng: selectedRoute.orders[0].origin_anchor.lng,
          destination_lat: selectedRoute.orders[0].destination_anchor.lat,
          destination_lng: selectedRoute.orders[0].destination_anchor.lng,
          radius_miles: query?.radius_miles ?? 100,
        }
      : null;

  const legQuery =
    selectedRoute && selectedRoute.orders.length >= 2
      ? {
          drop_lat: selectedRoute.orders[0].destination_anchor.lat,
          drop_lng: selectedRoute.orders[0].destination_anchor.lng,
          pickup_lat: selectedRoute.orders[1].origin_anchor.lat,
          pickup_lng: selectedRoute.orders[1].origin_anchor.lng,
          radius_miles: query?.radius_miles ?? 100,
        }
      : null;

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-7xl">
      <header>
        <h1 className="text-2xl font-semibold">Route Discovery</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recurring route patterns flowing through any city in your operating area, drawn from your historical orders.
        </p>
      </header>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList variant="line">
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="leaderboard">Top Routes</TabsTrigger>
        </TabsList>

        {/* ── Search tab ── */}
        <TabsContent value="search" className="mt-6 space-y-6">
          <HowItWorks />

          <p className="text-sm text-muted-foreground">
            Enter a location and radius, then click Search to find routes in a specific area.
          </p>

          <FilterBar onSearch={handleSearch} />

          {error && (
            <div className="text-sm text-destructive">
              Failed to load routes. {(error as Error).message}
            </div>
          )}

          {isLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3 space-y-2">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
              <div className="lg:col-span-2">
                <Skeleton className="h-96 w-full" />
              </div>
            </div>
          )}

          {!isLoading && data && searchRows.length === 0 && query && (
            <EmptyState city={query.city} state={query.state} radiusMiles={query.radius_miles} />
          )}

          {!isLoading && data && searchRows.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3">
                <RoutesList routes={searchRows} />
              </div>
              <div className="lg:col-span-2">
                <div key={selectedRoute?.route_id ?? "empty"} className="animate-in slide-in-from-right-4 duration-200">
                  <DrilldownPanel route={selectedRoute} radiusMiles={query?.radius_miles ?? 100} />
                </div>
              </div>
            </div>
          )}

          {query && (
            <EngineInspectors regionQuery={regionQuery} laneQuery={laneQuery} legQuery={legQuery} />
          )}
        </TabsContent>

        {/* ── Top Routes (leaderboard) tab ── */}
        <TabsContent value="leaderboard" className="mt-6">
          {topLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3 space-y-2">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
              <div className="lg:col-span-2">
                <Skeleton className="h-96 w-full" />
              </div>
            </div>
          )}

          {!topLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3">
                <RoutesList routes={topRows} />
              </div>
              <div className="lg:col-span-2">
                <div key={selectedRoute?.route_id ?? "empty"} className="animate-in slide-in-from-right-4 duration-200">
                  <DrilldownPanel route={selectedRoute} radiusMiles={100} />
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
