"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Button } from "@/platform/web/components/ui/button";
import { Calendar } from "@/platform/web/components/ui/calendar";
import { Slider } from "@/platform/web/components/ui/slider";
import { cn } from "@/core/utils";
import { LEG_OPTIONS, DEFAULT_LEGS_ROUND_TRIP } from "@mwbhtx/haulvisor-core";

export interface AdvancedFilters {
  legs: number;
  homeBy: string;
  trailerType: string;
  noTarps: boolean;
  searchRadius: number;
}

interface FiltersSheetProps {
  onBack: () => void;
  onApply: (filters: AdvancedFilters) => void;
  initialFilters?: Partial<AdvancedFilters>;
}

function formatHomeBy(iso: string): string {
  if (!iso) return "Any";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Collapsible filter row — shows label + current value, tap to expand */
function FilterRow({
  label,
  value,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-white/5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-4"
      >
        <span className="text-base text-muted-foreground">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-base font-medium">{value}</span>
          <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, overflow: "visible" }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-4 pb-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FiltersSheet({ onBack, onApply, initialFilters }: FiltersSheetProps) {
  const [legs, setLegs] = useState(initialFilters?.legs ?? DEFAULT_LEGS_ROUND_TRIP);
  const [homeBy, setHomeBy] = useState(initialFilters?.homeBy ?? "");
  const [trailerType, setTrailerType] = useState(initialFilters?.trailerType ?? "");
  const [noTarps, setNoTarps] = useState(initialFilters?.noTarps ?? false);
  const [searchRadius, setSearchRadius] = useState(initialFilters?.searchRadius ?? 250);

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggle = (row: string) => setExpandedRow((prev) => (prev === row ? null : row));

  const handleBack = () => {
    onApply({ legs, homeBy, trailerType, noTarps, searchRadius });
  };

  const selectedDate = homeBy ? new Date(homeBy + "T00:00:00") : undefined;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button type="button" onClick={handleBack} className="flex items-center justify-center h-9 w-9 rounded-full bg-white shrink-0">
          <ArrowLeft className="h-5 w-5 text-black" />
        </button>
        <h1 className="text-base font-semibold">Filters</h1>
      </div>

      {/* Filter rows */}
      <div className="flex-1 overflow-y-auto">
        <FilterRow
          label="Number of Legs"
          value={String(legs)}
          expanded={expandedRow === "legs"}
          onToggle={() => toggle("legs")}
        >
          <div className="flex gap-2">
            {LEG_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLegs(n)}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-sm font-medium border transition-colors",
                  legs === n
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-white/10 text-muted-foreground hover:text-foreground",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </FilterRow>

        <FilterRow
          label="Home By"
          value={formatHomeBy(homeBy)}
          expanded={expandedRow === "homeBy"}
          onToggle={() => toggle("homeBy")}
        >
          <div className="rounded-lg border border-white/10 overflow-hidden mt-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              disabled={{ before: new Date() }}
              onSelect={(day: Date | undefined) => {
                if (day) {
                  const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                  setHomeBy(iso);
                }
              }}
              defaultMonth={selectedDate}
            />
            {homeBy && (
              <div className="border-t border-white/10 px-3 py-2">
                <Button
                  size="default"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => setHomeBy("")}
                >
                  Clear Date
                </Button>
              </div>
            )}
          </div>
        </FilterRow>

        {/* No Tarps */}
        <button
          type="button"
          onClick={() => setNoTarps((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-4 border-b border-white/5"
        >
          <span className="text-base text-muted-foreground">No Tarps</span>
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded border transition-colors",
              noTarps ? "border-primary bg-primary text-primary-foreground" : "border-white/20",
            )}
          >
            {noTarps && <span className="text-sm font-bold">✓</span>}
          </div>
        </button>

        <FilterRow
          label="Search Radius"
          value={`${searchRadius} mi`}
          expanded={expandedRow === "searchRadius"}
          onToggle={() => toggle("searchRadius")}
        >
          <div className="space-y-3 pt-2">
            <Slider
              value={[searchRadius]}
              min={50}
              max={350}
              step={25}
              onValueChange={([v]) => setSearchRadius(v)}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>50 mi</span>
              <span>350 mi</span>
            </div>
          </div>
        </FilterRow>
      </div>

    </motion.div>
  );
}
