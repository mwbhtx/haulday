import type { RouteChain } from "@/core/types";

export type RouteEngine = "v1" | "v2" | "v3";

export interface ExportOrigin {
  lat: number;
  lng: number;
}

const HEADERS = [
  "route_rank",
  "engine",
  "order_ids",
  "total_pay",
  "total_miles",
  "total_deadhead_miles",
  "deadhead_pct",
  "profit",
  "rate_per_mile",
  "effective_rpm",
  "effective_cost_per_mile",
  "gross_rpm_total",
  "gross_per_day",
  "daily_net_profit",
  "estimated_days",
  "estimated_deadhead_cost",
  "cost_total",
  // Per-leg breakdown (max 2 legs; leg2 columns empty for single-leg routes)
  "deadhead_leg1_miles",
  "deadhead_leg2_miles",
  "loaded_miles_leg1",
  "loaded_miles_leg2",
  "haversine_leg1_miles",
  "haversine_leg2_miles",
  "deadhead_haversine_leg1_miles",
  "deadhead_haversine_leg2_miles",
  "legs_summary",
  "stopoffs_json",
];

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Haversine great-circle distance in miles between two lat/lng points */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function buildLegsSummary(chain: RouteChain): string {
  if (chain.legs.length === 0) return "";
  const parts = chain.legs.map((leg) => `${leg.origin_city},${leg.origin_state}`);
  const last = chain.legs[chain.legs.length - 1];
  parts.push(`${last.destination_city},${last.destination_state}`);
  return parts.join(" -> ");
}

function buildStopoffsJson(chain: RouteChain): string {
  try {
    const stopoffs = chain.legs.flatMap((leg) =>
      (leg.stopoffs ?? []).map((s) => ({
        leg_number: leg.leg_number,
        order_id: leg.order_id,
        ...s,
      }))
    );
    return JSON.stringify(stopoffs);
  } catch {
    console.warn("export-csv: failed to serialize stopoffs");
    return "[]";
  }
}

export function buildRoutesCsvFilename(engine: RouteEngine, now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 19).replace(/:/g, "-");
  return `routes_${engine}_${iso}.csv`;
}

export function buildRoutesCsv(
  routes: RouteChain[],
  engine: RouteEngine,
  origin?: ExportOrigin,
): string {
  const rows: string[] = [HEADERS.join(",")];
  for (const route of routes) {
    const leg1 = route.legs[0];
    const leg2 = route.legs[1];
    const orderIds = route.legs.map((l) => l.order_id).join(";");

    const haversine_leg1 = leg1
      ? haversine(leg1.origin_lat, leg1.origin_lng, leg1.destination_lat, leg1.destination_lng)
      : null;
    const haversine_leg2 = leg2
      ? haversine(leg2.origin_lat, leg2.origin_lng, leg2.destination_lat, leg2.destination_lng)
      : null;

    // Deadhead haversine: leg1 = search origin → leg1 pickup; leg2 = leg1 drop → leg2 pickup
    const deadhead_haversine_leg1 =
      origin && leg1
        ? haversine(origin.lat, origin.lng, leg1.origin_lat, leg1.origin_lng)
        : null;
    const deadhead_haversine_leg2 =
      leg1 && leg2
        ? haversine(leg1.destination_lat, leg1.destination_lng, leg2.origin_lat, leg2.origin_lng)
        : null;

    const row = [
      csvCell(route.rank),
      csvCell(engine),
      csvCell(orderIds),
      csvCell(route.total_pay),
      csvCell(route.total_miles),
      csvCell(route.total_deadhead_miles),
      csvCell(route.deadhead_pct),
      csvCell(route.profit),
      csvCell(route.rate_per_mile),
      csvCell(route.effective_rpm),
      csvCell(route.effective_cost_per_mile),
      csvCell(route.gross_rpm_total),
      csvCell(route.gross_per_day),
      csvCell(route.daily_net_profit),
      csvCell(route.estimated_days),
      csvCell(route.estimated_deadhead_cost),
      csvCell(route.cost_breakdown.total),
      csvCell(leg1?.deadhead_miles),
      csvCell(leg2?.deadhead_miles),
      csvCell(leg1?.miles),
      csvCell(leg2?.miles),
      csvCell(haversine_leg1 != null ? Math.round(haversine_leg1 * 10) / 10 : null),
      csvCell(haversine_leg2 != null ? Math.round(haversine_leg2 * 10) / 10 : null),
      csvCell(deadhead_haversine_leg1 != null ? Math.round(deadhead_haversine_leg1 * 10) / 10 : null),
      csvCell(deadhead_haversine_leg2 != null ? Math.round(deadhead_haversine_leg2 * 10) / 10 : null),
      csvCell(buildLegsSummary(route)),
      // stopoffs_json always contains commas — quote it explicitly
      `"${buildStopoffsJson(route).replace(/"/g, '""')}"`,
    ];
    rows.push(row.join(","));
  }
  return rows.join("\r\n");
}

export function downloadRoutesCsv(
  routes: RouteChain[],
  engine: RouteEngine,
  origin?: ExportOrigin,
): void {
  const csv = buildRoutesCsv(routes, engine, origin);
  // BOM so Excel auto-detects UTF-8
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildRoutesCsvFilename(engine);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
