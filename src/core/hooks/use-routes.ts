"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchApi } from "@/core/services/api";
import type { RouteSearchResult } from "@mwbhtx/haulvisor-core";

export interface RouteSearchParams {
  origin_lat: number;
  origin_lng: number;
  departure_date: string;
  destination_lat?: number;
  destination_lng?: number;
  destination_city?: string;
  search_radius_miles?: number;
  max_trip_days?: number;
  num_orders?: number;
  trailer_types?: string;
  max_weight?: number;
  hazmat_certified?: boolean;
  twic_card?: boolean;
  team_driver?: boolean;
  no_tarps?: boolean;
  ignore_radius?: boolean;
  origin_radius_miles?: number;
  dest_radius_miles?: number;
  cost_per_mile?: number;
  avg_mpg?: number;
  avg_driving_hours_per_day?: number;
  work_start_hour?: number;
  work_end_hour?: number;
  max_deadhead_pct?: number;
  min_daily_profit?: number;
  min_rpm?: number;
  max_interleg_deadhead_miles?: number;
  /** Cache-bust token — forces a new search even with identical params */
  _t?: number;
}

export interface SearchProgress {
  total_orders: number;
  pairs_total: number;
  pairs_checked: number;
  pairs_pruned: number;
  pairs_simulated: number;
  routes_found: number;
  elapsed_ms: number;
}

interface SearchPollResponse {
  status: "running" | "complete" | "failed";
  progress: SearchProgress;
  result?: RouteSearchResult;
  error?: string;
}

export function useRouteSearch(companyId: string, params: RouteSearchParams | null) {
  const [data, setData] = useState<RouteSearchResult | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetched, setIsFetched] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<SearchProgress | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paramsKeyRef = useRef<string>("");

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const paramsKey = params ? JSON.stringify(params) : "";

  useEffect(() => {
    if (!companyId || !params || paramsKey === paramsKeyRef.current) return;
    paramsKeyRef.current = paramsKey;

    stopPolling();
    setIsLoading(true);
    setIsFetched(false);
    setError(null);
    setProgress(null);

    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "_t" || value == null) continue;
      qs.set(key, String(value));
    }

    fetchApi<{ search_id: string }>(`routes/${companyId}/search?${qs.toString()}`, {
      method: "POST",
    })
      .then(({ search_id }) => {
        pollRef.current = setInterval(async () => {
          try {
            const resp = await fetchApi<SearchPollResponse>(
              `routes/${companyId}/search/${search_id}`,
            );

            setProgress(resp.progress);

            if (resp.status === "complete" && resp.result) {
              stopPolling();
              setData(resp.result);
              setIsLoading(false);
              setIsFetched(true);
            } else if (resp.status === "failed") {
              stopPolling();
              setError(new Error(resp.error || "Search failed"));
              setIsLoading(false);
              setIsFetched(true);
            }
          } catch (err) {
            stopPolling();
            setError(err instanceof Error ? err : new Error(String(err)));
            setIsLoading(false);
            setIsFetched(true);
          }
        }, 1500);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
        setIsFetched(true);
      });

    return () => stopPolling();
  }, [companyId, paramsKey]);

  return { data, isLoading, isFetched, error, progress };
}
