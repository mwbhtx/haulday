"use client";

import { useState, useMemo } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Skeleton } from "@/platform/web/components/ui/skeleton";
import { RouteCard } from "@/features/routes/components/route-card";
import type { RouteChain } from "@/core/types";
import type { SearchProgress } from "@/core/hooks/use-routes";
import { type SortKey, SORT_OPTIONS, sortRouteChains } from "@/features/routes/utils/sort-options";
interface ResultsScreenProps {
  searchText: string;
  chains: RouteChain[];
  isLoading: boolean;
  progress: SearchProgress | null;
  onCancel: () => void;
  onSearchBarTap: () => void;
  onFiltersTap: () => void;
  onRouteSelect: (chain: RouteChain) => void;
}

export function ResultsScreen({
  searchText,
  chains,
  isLoading,
  progress,
  onCancel,
  onSearchBarTap,
  onFiltersTap,
  onRouteSelect,
}: ResultsScreenProps) {
  const [sortBy, setSortBy] = useState<SortKey>("daily_profit");
  const sortedChains = useMemo(() => {
    return sortRouteChains(chains, sortBy);
  }, [chains, sortBy]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Search bar */}
      <div className="px-4 pt-4 pb-2">
        <div
          role="button"
          tabIndex={0}
          onClick={onSearchBarTap}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSearchBarTap(); }}
          className="flex w-full items-center gap-3 rounded-full border border-white/10 bg-card px-4 py-3 text-left cursor-pointer"
        >
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <span className="flex-1 text-base truncate">{searchText}</span>
        </div>
      </div>

      {/* Search progress */}
      {isLoading && (
        <div className="px-4 pt-1 pb-2 space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            {progress && progress.pairs_total > 0 ? (
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (progress.pairs_checked / progress.pairs_total) * 100)}%` }}
              />
            ) : (
              <div className="h-full w-1/3 bg-primary rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]" />
            )}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {progress && progress.pairs_total > 0 ? (
                <>Analyzing {progress.pairs_checked.toLocaleString()} / {progress.pairs_total.toLocaleString()} routes</>
              ) : (
                "Warming up the search engine..."
              )}
            </p>
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
            >
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sort bar */}
      {!isLoading && chains.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2">
          <span className="text-sm text-muted-foreground mr-0.5">Sort</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortBy(opt.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                sortBy === opt.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-input hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onFiltersTap}
            className="ml-auto flex items-center justify-center h-9 w-9 rounded-full bg-white shrink-0"
          >
            <SlidersHorizontal className="h-5 w-5 text-black" />
          </button>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 space-y-2">
        {isLoading && (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </>
        )}

        {!isLoading && chains.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground/70 mb-1">No routes found</p>
            <p className="text-sm text-muted-foreground/40">Try adjusting your search or filters</p>
          </div>
        )}

        {!isLoading &&
          sortedChains.map((chain, i) => (
            <RouteCard
              key={i}
              chain={chain}
              onClick={() => onRouteSelect(chain)}
            />
          ))}
      </div>
    </div>
  );
}
