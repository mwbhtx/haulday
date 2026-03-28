# Unified Trip Simulator

**Date:** 2026-03-27
**Status:** Approved
**Scope:** `@mwbhtx/haulvisor-core` (shared package), backend route services, frontend route inspector

## Problem

Trip duration and segment timing are calculated in three independent places that have diverged:

1. **`transit-time.ts`** (`estimateTransitHours`) — full HOS simulation used by the cost model. Properly models 11h driving limit, 14h on-duty window, 30-min breaks after 8h, 10h rest, dwell, and fueling. But it only sees total miles and a hardcoded stop count.

2. **`cost-model.ts`** (`estimateTripDays`) — wraps transit-time but hardcodes `stops: 2` regardless of actual leg count. A 3-leg route with 6 stops gets the same dwell estimate as a 1-leg route.

3. **`route-inspector.tsx`** (`loadedDriveHours` / `dhDriveHours`) — completely different math. Uses 15-min breaks every 4h (not 30-min after 8h per FMCSA), no dwell time, no fueling stops, hardcoded speeds (52/55 mph) that differ from the backend's configurable `avg_speed_mph`.

Additionally, `round-trip.service.ts` patches over the cost model's estimate with its own calendar-day adjustment after the fact, creating a fourth source of timing logic.

The result: the `estimated_days` shown on a route card, the `daily_net_profit` derived from it, and the segment timeline shown in the route inspector all come from different calculations and can disagree.

## Goals

1. **Single function** — one `simulateTrip()` function that every consumer calls. Cost model, route services, and the frontend inspector all use the same output.

2. **Maximum baseline accuracy** — research-backed defaults that model a realistic solo OTR driver day. Not theoretical HOS maximums, not worst-case detention. A solid average that a driver looks at and thinks "yeah, that's reasonable."

3. **Duration-based, not clock-based** — the timeline shows how long each phase takes, not what time of day things happen. We don't know when the driver departs. The only real timestamps are pickup/delivery windows from the orders themselves.

4. **Backend returns the full timeline** — the frontend just renders it. No local simulation, no divergence.

5. **Documented, typed defaults** — every default constant carries metadata (label, description, source, unit) so the frontend can render tooltips and settings labels dynamically.

## Research-Backed Defaults

All values are based on industry data and can be overridden per-user via their profile settings.

| Parameter | Value | Rationale |
|---|---|---|
| Loaded speed | 50 mph | Highway is 60-65 but real-world door-to-door with city approach, traffic, maneuvering is lower. Industry data shows 500-600 mi/day over ~10-11h on-duty. |
| Deadhead speed | 55 mph | Empty trucks run faster and take more direct routes. |
| Avg driving hours/day | 8h | FMCSA max is 11h. Real-world solo OTR averages 500-600 mi/day. At 50-55 mph that's ~9-11h on-road but ~8h effective driving after stops and delays. User-configurable. |
| Loading time (at shipper) | 2.5h | Industry average dwell at shipper is 2-3.5h. Includes check-in, dock assignment, loading, paperwork. |
| Unloading time (at receiver) | 2h | Receivers tend to be slightly faster. Includes check-in, unloading, sign-off. |
| Fueling stop interval | 500 mi | Typical tank range for a Class 8 truck. |
| Fueling stop duration | 0.5h | Fill up, DEF, walk around, restroom. |
| HOS driving limit | 11h | FMCSA 395.3(a)(3)(i). |
| HOS on-duty window | 14h | FMCSA 395.3(a)(2). |
| HOS break trigger | 8h driving | FMCSA 395.3(a)(3)(ii) — 30-min break required. |
| HOS mandatory break | 0.5h | 30 minutes. |
| HOS mandatory rest | 10h | FMCSA 395.3(a)(1). |

**Sources:**
- FMCSA Hours of Service Regulations: https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations
- FMCSA Driver Detention Study: https://www.fmcsa.dot.gov/research-and-analysis/impact-driver-detention-time-safety-and-operations
- AtoB OTR Driver Mileage: https://www.atob.com/blog/how-many-miles-do-otr-drivers-average
- Schneider Daily Miles Data: https://schneiderjobs.com/blog/how-many-miles-do-truckers-drive
- DataDocks Dwell Time: https://datadocks.com/posts/dwell-time-in-trucking
- FreightWaves Miles/Day: https://ratings.freightwaves.com/miles-driven-per-day-by-truck-drivers/

## Default Constants Structure

Every default is exported with metadata so the frontend can dynamically render tooltips, settings labels, and "how we calculated this" explanations.

```typescript
/** Metadata wrapper for a model default */
export interface ModelDefault<T = number> {
  /** The default value */
  value: T;
  /** Short human-readable label (for settings UI) */
  label: string;
  /** Longer explanation (for tooltips) */
  description: string;
  /** Where the value comes from (for "how we calculated this" UI) */
  source?: string;
  /** Display unit */
  unit: string;
}

export const TRIP_DEFAULTS = {
  loaded_speed_mph: {
    value: 50,
    label: 'Loaded Speed',
    description:
      'Average door-to-door speed for a loaded truck, accounting for city approach, traffic, and maneuvering.',
    source:
      'Industry average; highway speeds are 60-65 but real-world loaded door-to-door is lower.',
    unit: 'mph',
  },
  deadhead_speed_mph: {
    value: 55,
    label: 'Deadhead Speed',
    description: 'Average speed when driving empty (bobtail or empty trailer).',
    unit: 'mph',
  },
  avg_driving_hours_per_day: {
    value: 8,
    label: 'Avg Driving Hours / Day',
    description:
      'Typical solo driver driving hours per day. FMCSA max is 11h, but real-world OTR solo average is lower.',
    source: 'FMCSA HOS data; real-world OTR averages 500-600 mi/day.',
    unit: 'hours',
  },
  loading_hours: {
    value: 2.5,
    label: 'Loading Time',
    description:
      'Average time at shipper for check-in, dock assignment, loading, and paperwork.',
    source: 'Industry average dwell time at shipper facilities is 2-3.5 hours.',
    unit: 'hours',
  },
  unloading_hours: {
    value: 2,
    label: 'Unloading Time',
    description:
      'Average time at receiver for check-in, unloading, and paperwork.',
    source: 'Receivers tend to be slightly faster than shippers.',
    unit: 'hours',
  },
  fueling_interval_miles: {
    value: 500,
    label: 'Fueling Interval',
    description: 'Miles between fueling stops based on typical Class 8 tank range.',
    unit: 'miles',
  },
  fueling_stop_hours: {
    value: 0.5,
    label: 'Fueling Stop Duration',
    description: 'Time per fueling stop including fill-up, DEF, restroom.',
    unit: 'hours',
  },
} as const satisfies Record<string, ModelDefault>;
```

HOS constants remain as internal non-configurable values (they're federal law, not preferences).

## Data Structures

### Input

```typescript
/** A single leg in the trip — either a paid load or a deadhead repositioning */
export interface TripLeg {
  kind: 'load' | 'deadhead';
  miles: number;
  /** Load weight in lbs (0 for deadhead) */
  weight_lbs: number;
  origin_city: string;
  destination_city: string;
  /** Order date windows (loads only) */
  pickup_date_early?: string;   // ISO 8601
  pickup_date_late?: string;
  delivery_date_early?: string;
  delivery_date_late?: string;
}

/** Settings that override defaults — backed by user profile */
export interface TripSimulationSettings {
  loaded_speed_mph?: number;
  deadhead_speed_mph?: number;
  avg_driving_hours_per_day?: number;
  loading_hours?: number;
  unloading_hours?: number;
  fueling_interval_miles?: number;
  fueling_stop_hours?: number;
}

export interface TripSimulationInput {
  legs: TripLeg[];
  settings?: TripSimulationSettings;
}
```

### Output

```typescript
export type TripPhaseKind =
  | 'deadhead'    // driving empty
  | 'driving'     // driving loaded
  | 'loading'     // at shipper facility
  | 'unloading'   // at receiver facility
  | 'rest'        // 10h mandatory HOS rest
  | 'break'       // 30-min HOS break
  | 'fuel'        // fueling stop
  | 'waiting';    // waiting for pickup or delivery window to open

export interface TripPhase {
  kind: TripPhaseKind;
  /** How long this phase takes */
  duration_hours: number;
  /** Miles covered (deadhead and driving phases only) */
  miles?: number;
  /** Origin city (deadhead, driving, loading phases) */
  origin_city?: string;
  /** Destination city (deadhead, driving, unloading phases) */
  destination_city?: string;
  /** Index into the input legs array — ties this phase back to a specific order */
  leg_index?: number;
  /** For waiting phases: why we're waiting */
  waiting_for?: 'pickup_window' | 'delivery_window';
}

export interface TripSimulationSummary {
  total_days: number;
  total_hours: number;
  driving_hours: number;
  deadhead_hours: number;
  loading_hours: number;
  unloading_hours: number;
  rest_hours: number;
  break_hours: number;
  fuel_hours: number;
  waiting_hours: number;
  total_miles: number;
  loaded_miles: number;
  deadhead_miles: number;
}

export interface TripSimulationResult {
  /** Ordered list of phases — the full trip timeline */
  phases: TripPhase[];
  /** Aggregated summary metrics */
  summary: TripSimulationSummary;
}
```

## Algorithm

`simulateTrip(input: TripSimulationInput): TripSimulationResult`

The function walks through each leg in order, simulating the driver's clock forward. It produces phases as it goes.

### Phase generation per leg

For each leg in the input:

1. **If `kind === 'deadhead'`:** Simulate driving at `deadhead_speed_mph`. Split into driving chunks using the existing HOS engine logic (driving cap, break trigger, on-duty window). Emit `deadhead` phases for driving, `rest`/`break`/`fuel` phases as needed.

2. **If `kind === 'load'`:**
   a. **Waiting for pickup window:** If this load has `pickup_date_early` and we can determine the elapsed time since the trip anchor point (first leg's `pickup_date_early`), check if the driver would arrive before the window opens. If so, emit a `waiting` phase with `waiting_for: 'pickup_window'`.
   b. **Loading:** Emit a `loading` phase with `duration_hours` from settings.
   c. **Driving loaded:** Simulate driving at `loaded_speed_mph`. Split at HOS limits just like deadhead. Emit `driving` phases for driving, `rest`/`break`/`fuel` phases as needed. Each `driving` phase carries `leg_index` to tie it back to the order.
   d. **Unloading:** Emit an `unloading` phase with `duration_hours` from settings.

3. **Waiting for delivery window:** If the load has `delivery_date_early` and the driver would arrive before it opens, emit a `waiting` phase with `waiting_for: 'delivery_window'` before the unloading phase.

### Elapsed time tracking

The simulator tracks elapsed hours from the trip anchor point (the `pickup_date_early` of the first load leg, if available). This is used solely to determine wait durations when comparing against date windows on subsequent legs. It does not produce clock timestamps in the output.

If no date windows exist on any leg, no `waiting` phases are generated — the simulator just chains durations.

### HOS engine

The existing HOS simulation logic from `transit-time.ts` is preserved but refactored to emit phases instead of just accumulating totals. The core loop remains:

1. Determine the largest drivable chunk before hitting a limit (driving cap, on-duty window, break trigger, fuel interval).
2. Drive that chunk, emit a `driving` or `deadhead` phase.
3. Handle the limit: emit `rest`, `break`, or `fuel` phase.
4. Repeat until the leg's miles are consumed.

The `avg_driving_hours_per_day` setting continues to scale the effective driving cap and on-duty window proportionally, exactly as today.

### Summary computation

After all phases are generated, the summary is computed by summing durations across phase kinds. `total_days` = `Math.max(1, Math.ceil(total_hours / 24))`.

## Integration Changes

### `@mwbhtx/haulvisor-core` (shared package)

**New file: `trip-simulator.ts`**
- Exports `simulateTrip()`, types, and `TRIP_DEFAULTS`
- Pure function, no side effects

**Modified: `transit-time.ts`**
- Refactor the HOS driving loop into a shared internal helper (`driveSegment()`) that emits phases
- `simulateTrip()` calls this helper directly
- `estimateTransitHours()` and its convenience wrappers (`estimateTransitDays`, `estimateTransitHoursForMiles`, `estimateTransitionHours`) are preserved for backward compatibility — they call the same helper and aggregate the phases into the existing `TransitBreakdown` shape
- No behavior change for existing callers; new code should prefer `simulateTrip()`

**Modified: `cost-model.ts`**
- `estimateTripDays()` becomes a thin wrapper: constructs a minimal `TripSimulationInput` and returns `simulateTrip(input).summary.total_days`
- `calculateCosts()` optionally accepts a pre-computed `TripSimulationResult` to avoid double-computing when the caller already has it

**Modified: `defaults.ts`**
- Add `DEFAULT_LOADED_SPEED_MPH = 50` (new — loaded vs deadhead distinction)
- Add `DEFAULT_LOADING_HOURS = 2.5` and `DEFAULT_UNLOADING_HOURS = 2`
- Keep `DEFAULT_AVG_SPEED_MPH = 55` as the deadhead speed
- All new constants use the `ModelDefault` wrapper for metadata

### Backend route services

**Modified: `routes.service.ts` — `buildChain()`**
- Construct `TripLeg[]` from the order chain (deadhead legs + load legs with date windows)
- Call `simulateTrip()` once
- Use `result.summary.total_days` for cost calculation
- Attach `result.phases` to the `RouteChain` response

**Modified: `round-trip.service.ts` — `buildScoredFields()`**
- Same pattern: construct `TripLeg[]`, call `simulateTrip()`, use the result
- Remove the manual calendar-day adjustment hack (the simulator handles date windows natively)
- `getTimingSlack()` can use `simulateTrip()` for a pair of legs to check feasibility

### API response types

**Modified: `RouteChain` and `RoundTripChain`**
- Add `timeline: TripPhase[]` field
- Add `trip_summary: TripSimulationSummary` field
- `estimated_days` continues to exist (populated from `summary.total_days`) for backward compat

### Frontend

**Modified: `route-inspector.tsx`**
- Delete `computeSegments()`, `loadedDriveHours()`, `dhDriveHours()`, `DH_SPEED_MPH`, `LOADED_SPEED_MPH` entirely
- Render `chain.timeline` directly — map each `TripPhase` to the appropriate UI row
- Import `TRIP_DEFAULTS` from `@mwbhtx/haulvisor-core` for the assumptions footer

**Modified: `location-sidebar.tsx`**
- Can optionally show `trip_summary.waiting_hours` to surface dead time at a glance

## What This Does NOT Cover

- **Departure time optimization** — the model does not suggest when to leave. It assumes the driver departs and drives at their normal pace.
- **Traffic or weather adjustments** — out of scope. The defaults represent fair-weather averages.
- **Team driver support** — this models solo drivers only. Team driving (no rest stops) would be a separate mode.
- **Drop-and-hook vs live load distinction** — both use the same loading/unloading defaults for now. Could be refined later if order data includes this.

## Testing Strategy

- Unit tests for `simulateTrip()` with known inputs and expected phase sequences
- Regression tests: existing `estimateTransitHours()` tests should produce equivalent results when run through the new simulator
- Edge cases: zero-mile deadheads, single-leg trips, legs with no date windows, legs where the driver arrives after the delivery window closes
- Integration test: a full round-trip chain (like the Houston-Sealy-Flagstaff-Vegas-Waco-Houston example from brainstorming) produces a reasonable ~6 day timeline
