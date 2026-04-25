import type { RouteChain } from "@/core/types";

export interface ExportOrigin {
  lat: number;
  lng: number;
  city?: string;
  state?: string;
}

export interface ExportDest {
  lat: number;
  lng: number;
  city?: string;
}

const HEADERS = [
  "route_rank",
  "search_origin_city",
  "search_dest_city",
  "order_ids",
  "gross_pay",
  "loaded_miles",
  "deadhead_miles",
  "deadhead_pct",
  "profit",
  "rate_per_mile",
  "all_in_net_rpm",
  "effective_cost_per_mile",
  "all_in_gross_rpm",
  "gross_per_day",
  "daily_net_profit",
  "estimated_days",
  "estimated_deadhead_cost",
  "cost_total",
  // Per-leg breakdown (max 2 legs; leg2 columns empty for single-leg routes)
  "deadhead_leg1_miles",
  "deadhead_leg1_duration_s",
  "deadhead_leg1_provider",
  "deadhead_leg1_fallback",
  "deadhead_leg2_miles",
  "deadhead_leg2_duration_s",
  "deadhead_leg2_provider",
  "deadhead_leg2_fallback",
  "loaded_miles_leg1",
  "loaded_miles_leg2",
  "haversine_leg1_miles",
  "haversine_leg2_miles",
  "deadhead_haversine_leg1_miles",
  "deadhead_haversine_leg2_miles",
  // Return leg: last delivery → destination filter
  "final_return_haversine_miles",
  "destination_deadhead_miles",
  "destination_deadhead_duration_s",
  "destination_deadhead_provider",
  "destination_deadhead_fallback",
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

export function buildRoutesCsvFilename(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 19).replace(/:/g, "-");
  return `routes_${iso}.csv`;
}

export function buildRoutesCsv(
  routes: RouteChain[],
  origin?: ExportOrigin,
  dest?: ExportDest,
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

    // Final return leg: last delivery → destination filter
    const lastLeg = route.legs[route.legs.length - 1];
    const final_return_haversine =
      dest && lastLeg
        ? haversine(lastLeg.destination_lat, lastLeg.destination_lng, dest.lat, dest.lng)
        : null;

    const row = [
      csvCell(route.rank),
      csvCell(origin?.city && origin?.state ? `${origin.city}, ${origin.state}` : (origin?.city ?? "")),
      csvCell(dest?.city ?? ""),
      csvCell(orderIds),
      csvCell(route.gross_pay),
      csvCell(route.loaded_miles),
      csvCell(route.deadhead_miles),
      csvCell(route.deadhead_pct),
      csvCell(route.profit),
      csvCell(route.rate_per_mile),
      csvCell(route.all_in_net_rpm),
      csvCell(route.effective_cost_per_mile),
      csvCell(route.all_in_gross_rpm),
      csvCell(route.gross_per_day),
      csvCell(route.daily_net_profit),
      csvCell(route.estimated_days),
      csvCell(route.estimated_deadhead_cost),
      csvCell(route.cost_breakdown.total),
      csvCell(leg1?.deadhead_miles),
      csvCell(leg1?.deadhead_duration_seconds),
      csvCell(leg1?.deadhead_provider),
      csvCell(leg1?.deadhead_fallback != null ? String(leg1.deadhead_fallback) : null),
      csvCell(leg2?.deadhead_miles),
      csvCell(leg2?.deadhead_duration_seconds),
      csvCell(leg2?.deadhead_provider),
      csvCell(leg2?.deadhead_fallback != null ? String(leg2.deadhead_fallback) : null),
      csvCell(leg1?.miles),
      csvCell(leg2?.miles),
      csvCell(haversine_leg1 != null ? Math.round(haversine_leg1 * 10) / 10 : null),
      csvCell(haversine_leg2 != null ? Math.round(haversine_leg2 * 10) / 10 : null),
      csvCell(deadhead_haversine_leg1 != null ? Math.round(deadhead_haversine_leg1 * 10) / 10 : null),
      csvCell(deadhead_haversine_leg2 != null ? Math.round(deadhead_haversine_leg2 * 10) / 10 : null),
      csvCell(final_return_haversine != null ? Math.round(final_return_haversine * 10) / 10 : null),
      csvCell(route.destination_deadhead_miles),
      csvCell(route.destination_deadhead_duration_seconds),
      csvCell(route.destination_deadhead_provider),
      csvCell(route.destination_deadhead_fallback != null ? String(route.destination_deadhead_fallback) : null),
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
  origin?: ExportOrigin,
  dest?: ExportDest,
): void {
  const csv = buildRoutesCsv(routes, origin, dest);
  // BOM so Excel auto-detects UTF-8
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildRoutesCsvFilename();
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
