import { describe, it, expect } from "vitest";
import { buildRoutesCsv, buildRoutesCsvFilename } from "../export-csv";
import type { RouteChain } from "@/core/types";

const LEG1 = {
  leg_number: 1,
  order_id: "ORD-A",
  origin_city: "Dallas",
  origin_state: "TX",
  origin_lat: 32.7767,
  origin_lng: -96.7970,
  destination_city: "Atlanta",
  destination_state: "GA",
  destination_lat: 33.7490,
  destination_lng: -84.3880,
  pay: 1500,
  miles: 780,
  deadhead_miles: 150,
  stopoffs: [
    {
      sequence: 1,
      type: "pickup" as const,
      company_name: "Acme Mfg",
      address_1: "123 Main St",
      city: "Dallas",
      state: "TX",
      zip: "75001",
      early_date_local: "2026-04-25 08:00",
      late_date_local: "2026-04-25 10:00",
      early_date_utc: "2026-04-25T13:00:00Z",
      late_date_utc: "2026-04-25T15:00:00Z",
      iana_timezone: "America/Chicago",
    },
    {
      sequence: 2,
      type: "dropoff" as const,
      company_name: "BigBox DC",
      address_1: "99 Oak Ave",
      city: "Atlanta",
      state: "GA",
      zip: "30301",
      early_date_local: "2026-04-26 14:00",
      late_date_local: "2026-04-26 16:00",
      early_date_utc: "2026-04-26T18:00:00Z",
      late_date_utc: "2026-04-26T20:00:00Z",
      iana_timezone: "America/New_York",
    },
  ],
};

const LEG2 = {
  leg_number: 2,
  order_id: "ORD-B",
  origin_city: "Atlanta",
  origin_state: "GA",
  origin_lat: 33.7490,
  origin_lng: -84.3880,
  destination_city: "Miami",
  destination_state: "FL",
  destination_lat: 25.7617,
  destination_lng: -80.1918,
  pay: 1500,
  miles: 660,
  deadhead_miles: 20,
  stopoffs: [],
};

function makeChain(overrides: Partial<RouteChain> = {}): RouteChain {
  return {
    rank: 1,
    total_pay: 3000,
    total_miles: 800,
    total_deadhead_miles: 150,
    estimated_deadhead_cost: 90,
    profit: 900,
    rate_per_mile: 3.75,
    deadhead_pct: 15.8,
    effective_rpm: 1.12,
    effective_cost_per_mile: 2.63,
    estimated_days: 2,
    daily_net_profit: 450,
    gross_rpm_total: 3.15,
    gross_per_day: 1500,
    cost_breakdown: { total: 2100 },
    legs: [LEG1],
    ...overrides,
  };
}

/** Parse a CSV row into its cells, handling quoted fields */
function parseCsvRow(row: string): string[] {
  const cells: string[] = [];
  let i = 0;
  while (i < row.length) {
    if (row[i] === '"') {
      i++;
      let cell = "";
      while (i < row.length) {
        if (row[i] === '"' && row[i + 1] === '"') { cell += '"'; i += 2; }
        else if (row[i] === '"') { i++; break; }
        else { cell += row[i++]; }
      }
      cells.push(cell);
      if (row[i] === ",") i++;
    } else {
      const end = row.indexOf(",", i);
      if (end === -1) { cells.push(row.slice(i)); break; }
      cells.push(row.slice(i, end));
      i = end + 1;
    }
  }
  return cells;
}

function getHeaders(csv: string): string[] {
  return csv.split("\r\n")[0].split(",");
}

function getDataRow(csv: string, rowIdx = 0): Record<string, string> {
  const headers = getHeaders(csv);
  const cells = parseCsvRow(csv.split("\r\n")[rowIdx + 1]);
  return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
}

describe("buildRoutesCsvFilename", () => {
  it("formats engine + timestamp with dashes instead of colons", () => {
    expect(buildRoutesCsvFilename("v2", new Date("2026-04-24T14:32:15Z"))).toBe("routes_v2_2026-04-24T14-32-15.csv");
  });

  it("defaults to v1", () => {
    expect(buildRoutesCsvFilename("v1", new Date("2026-01-01T00:00:00Z"))).toBe("routes_v1_2026-01-01T00-00-00.csv");
  });
});

describe("buildRoutesCsv — structure", () => {
  it("produces a header row plus one row per route", () => {
    const csv = buildRoutesCsv([makeChain({ rank: 1 }), makeChain({ rank: 2 })], "v1");
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("route_rank");
    expect(lines[0]).toContain("stopoffs_json");
    expect(lines[0]).toContain("deadhead_leg1_miles");
    expect(lines[0]).toContain("haversine_leg1_miles");
  });

  it("joins order_ids with semicolons for multi-leg routes", () => {
    const chain = makeChain({ legs: [{ ...LEG1, stopoffs: [] }, LEG2] });
    const row = getDataRow(buildRoutesCsv([chain], "v1"));
    expect(row.order_ids).toBe("ORD-A;ORD-B");
  });

  it("wraps cells that contain commas in double quotes", () => {
    const csv = buildRoutesCsv([makeChain()], "v1");
    expect(csv).toContain('"Dallas,TX -> Atlanta,GA"');
  });

  it("escapes embedded double quotes as double-double-quotes", () => {
    const chain = makeChain({
      legs: [{
        ...LEG1,
        stopoffs: [{
          sequence: 1, type: "pickup" as const, company_name: 'He said "hello"',
          address_1: "1 Way", city: "Dallas", state: "TX", zip: "75001",
          early_date_local: "2026-04-25 08:00", late_date_local: "2026-04-25 10:00",
          early_date_utc: null, late_date_utc: null, iana_timezone: null,
        }],
      }],
    });
    expect(buildRoutesCsv([chain], "v1")).toContain('""');
  });
});

describe("buildRoutesCsv — stopoffs", () => {
  it("stopoffs_json round-trips and includes leg_number + order_id", () => {
    const row = getDataRow(buildRoutesCsv([makeChain()], "v1"));
    const parsed = JSON.parse(row.stopoffs_json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ leg_number: 1, order_id: "ORD-A", type: "pickup" });
    expect(parsed[1]).toMatchObject({ leg_number: 1, order_id: "ORD-A", type: "dropoff" });
  });

  it("produces empty stopoffs_json array for routes with no stopoffs", () => {
    const row = getDataRow(buildRoutesCsv([makeChain({ legs: [{ ...LEG1, stopoffs: [] }] })], "v1"));
    expect(row.stopoffs_json).toBe("[]");
  });
});

describe("buildRoutesCsv — legs_summary", () => {
  it("builds legs_summary using city,state per leg plus final destination", () => {
    const chain = makeChain({ legs: [{ ...LEG1, stopoffs: [] }, LEG2] });
    const row = getDataRow(buildRoutesCsv([chain], "v1"));
    expect(row.legs_summary).toBe("Dallas,TX -> Atlanta,GA -> Miami,FL");
  });
});

describe("buildRoutesCsv — per-leg deadhead", () => {
  it("breaks out deadhead_leg1_miles and deadhead_leg2_miles", () => {
    const chain = makeChain({ legs: [{ ...LEG1, stopoffs: [] }, LEG2] });
    const row = getDataRow(buildRoutesCsv([chain], "v1"));
    expect(row.deadhead_leg1_miles).toBe("150");
    expect(row.deadhead_leg2_miles).toBe("20");
  });

  it("leaves deadhead_leg2_miles empty for single-leg routes", () => {
    const row = getDataRow(buildRoutesCsv([makeChain()], "v1"));
    expect(row.deadhead_leg2_miles).toBe("");
  });

  it("emits loaded_miles_leg1 and loaded_miles_leg2", () => {
    const chain = makeChain({ legs: [{ ...LEG1, stopoffs: [] }, LEG2] });
    const row = getDataRow(buildRoutesCsv([chain], "v1"));
    expect(row.loaded_miles_leg1).toBe("780");
    expect(row.loaded_miles_leg2).toBe("660");
  });
});

describe("buildRoutesCsv — haversine columns", () => {
  it("haversine_leg1_miles is a positive number less than routed miles", () => {
    const row = getDataRow(buildRoutesCsv([makeChain()], "v1"));
    const h = parseFloat(row.haversine_leg1_miles);
    expect(h).toBeGreaterThan(0);
    // Dallas→Atlanta straight-line is ~720mi; routed is 780 — haversine should be less
    expect(h).toBeLessThan(780);
  });

  it("haversine_leg2_miles is populated for 2-leg routes and empty for 1-leg", () => {
    const chain2 = makeChain({ legs: [{ ...LEG1, stopoffs: [] }, LEG2] });
    const row2 = getDataRow(buildRoutesCsv([chain2], "v1"));
    expect(parseFloat(row2.haversine_leg2_miles)).toBeGreaterThan(0);

    const row1 = getDataRow(buildRoutesCsv([makeChain()], "v1"));
    expect(row1.haversine_leg2_miles).toBe("");
  });

  it("deadhead_haversine_leg1_miles is populated when origin is provided", () => {
    // Origin ~30 miles north of Dallas
    const origin = { lat: 33.0, lng: -96.7970 };
    const row = getDataRow(buildRoutesCsv([makeChain()], "v1", origin));
    const h = parseFloat(row.deadhead_haversine_leg1_miles);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(100); // short deadhead
  });

  it("deadhead_haversine_leg1_miles is empty when origin is not provided", () => {
    const row = getDataRow(buildRoutesCsv([makeChain()], "v1"));
    expect(row.deadhead_haversine_leg1_miles).toBe("");
  });

  it("deadhead_haversine_leg2_miles is populated for 2-leg routes", () => {
    const chain = makeChain({ legs: [{ ...LEG1, stopoffs: [] }, LEG2] });
    const row = getDataRow(buildRoutesCsv([chain], "v1"));
    // Atlanta→Atlanta deadhead (same coords) should be ~0 or very small
    const h = parseFloat(row.deadhead_haversine_leg2_miles);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(5);
  });
});
