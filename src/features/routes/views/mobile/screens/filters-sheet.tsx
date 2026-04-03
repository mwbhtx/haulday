"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Calendar } from "@/platform/web/components/ui/calendar";
import { Slider } from "@/platform/web/components/ui/slider";
import { cn } from "@/core/utils";
import { DEFAULT_MAX_TRIP_DAYS, DEFAULT_NUM_ORDERS, ORDER_COUNT_OPTIONS } from "@mwbhtx/haulvisor-core";

export interface AdvancedFilters {
  numOrders: number;
  departureDate: string;
  daysOut: number;
}

interface FiltersSheetProps {
  onBack: () => void;
  onApply: (filters: AdvancedFilters) => void;
  initialFilters?: Partial<AdvancedFilters>;
}

function formatDate(iso: string): string {
  if (!iso) return "Tomorrow";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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
          <svg
            className={cn("h-5 w-5 text-muted-foreground transition-transform", expanded && "rotate-180")}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4">{children}</div>
      )}
    </div>
  );
}

export function FiltersSheet({ onBack, onApply, initialFilters }: FiltersSheetProps) {
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const [numOrders, setNumOrders] = useState(initialFilters?.numOrders ?? DEFAULT_NUM_ORDERS);
  const [departureDate, setDepartureDate] = useState(initialFilters?.departureDate ?? tomorrow);
  const [daysOut, setDaysOut] = useState(initialFilters?.daysOut ?? DEFAULT_MAX_TRIP_DAYS);

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const toggle = (row: string) => setExpandedRow((prev) => (prev === row ? null : row));

  const handleBack = () => {
    onApply({ numOrders, departureDate, daysOut });
  };

  const returnLabel = (() => {
    const d = new Date(departureDate + "T00:00:00");
    d.setDate(d.getDate() + daysOut);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  })();

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

      <div className="flex-1 overflow-y-auto">

        {/* Number of Orders */}
        <FilterRow
          label="Number of Orders"
          value={numOrders === 0 ? "Any" : String(numOrders)}
          expanded={expandedRow === "numOrders"}
          onToggle={() => toggle("numOrders")}
        >
          <div className="flex gap-2 mt-1">
            {ORDER_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNumOrders(n)}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-sm font-medium border transition-colors",
                  numOrders === n
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-white/10 text-muted-foreground hover:text-foreground",
                )}
              >
                {n === 0 ? "Any" : String(n)}
              </button>
            ))}
          </div>
        </FilterRow>

        {/* Departure Date */}
        <FilterRow
          label="Departure Date"
          value={formatDate(departureDate)}
          expanded={expandedRow === "departure"}
          onToggle={() => toggle("departure")}
        >
          <div className="rounded-lg border border-white/10 overflow-hidden mt-3">
            <Calendar
              mode="single"
              selected={new Date(departureDate + "T00:00:00")}
              disabled={{ before: new Date() }}
              onSelect={(day: Date | undefined) => {
                if (day) {
                  const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                  setDepartureDate(iso);
                }
              }}
              defaultMonth={new Date(departureDate + "T00:00:00")}
            />
          </div>
        </FilterRow>

        {/* Days Out */}
        <FilterRow
          label="Days Out"
          value={`${daysOut} days`}
          expanded={expandedRow === "daysOut"}
          onToggle={() => toggle("daysOut")}
        >
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Max trip length</span>
              <span className="font-semibold">{daysOut} {daysOut === 1 ? "day" : "days"}</span>
            </div>
            <Slider
              value={[daysOut]}
              min={1}
              max={10}
              step={1}
              onValueChange={([v]) => setDaysOut(v)}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>1 day</span>
              <span>10 days</span>
            </div>
            <p className="text-sm text-muted-foreground">Home by {returnLabel}</p>
          </div>
        </FilterRow>

      </div>
    </motion.div>
  );
}
