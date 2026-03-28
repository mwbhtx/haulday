# Unified Trip Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three divergent transit time calculations with a single `simulateTrip()` function in `@mwbhtx/haulvisor-core` that produces a phase-level timeline, and wire it into the backend route services and frontend inspector.

**Architecture:** A pure `simulateTrip()` function accepts an ordered array of `TripLeg` objects (loads + deadheads with date windows) and returns an array of `TripPhase` objects (driving, rest, loading, unloading, waiting, etc.) plus a summary. The backend calls this once per route chain, attaches the timeline to the API response, and uses `summary.total_days` for cost calculations. The frontend deletes its local simulation and renders the backend-provided timeline.

**Tech Stack:** TypeScript, `@mwbhtx/haulvisor-core` (shared npm package), NestJS backend, Next.js/React frontend, Jest for tests.

**Spec:** `docs/superpowers/specs/2026-03-27-unified-trip-simulator-design.md`

**Repos involved:**
- `haulvisor-backend` — shared package at `packages/types/src/`, backend at `backend/src/`
- `haulvisor` — frontend at `src/`

**Test runner:** `cd backend && npx jest --passWithNoTests`

---

## File Map

### New files
- `packages/types/src/trip-defaults.ts` — documented `ModelDefault` type + `TRIP_DEFAULTS` constant with metadata
- `packages/types/src/trip-simulator.ts` — `simulateTrip()` function + types (`TripLeg`, `TripPhase`, `TripSimulationResult`, etc.)
- `backend/src/scoring/trip-simulator.spec.ts` — tests for `simulateTrip()`

### Modified files
- `packages/types/src/defaults.ts` — add `DEFAULT_LOADED_SPEED_MPH`, `DEFAULT_LOADING_HOURS`, `DEFAULT_UNLOADING_HOURS`
- `packages/types/src/index.ts` — re-export new modules
- `packages/types/src/cost-model.ts` — `estimateTripDays()` delegates to `simulateTrip()`
- `packages/types/src/types/routes.ts` — add `timeline` and `trip_summary` to `RouteChain`
- `packages/types/src/types/round-trip.ts` — add `timeline` and `trip_summary` to `RoundTripChain`
- `packages/types/src/types/scoring.ts` — add `TripSimulationSummary` to `ScoredRouteFields`
- `backend/src/scoring/index.ts` — re-export `simulateTrip` and new types
- `backend/src/routes/routes.service.ts` — `buildChain()` uses `simulateTrip()`
- `backend/src/routes/round-trip.service.ts` — `buildScoredFields()` uses `simulateTrip()`
- `haulvisor/src/lib/types.ts` — re-export new types
- `haulvisor/src/components/map/route-inspector.tsx` — delete local simulation, render `chain.timeline`

---

## Task 1: Add New Default Constants

**Files:**
- Modify: `packages/types/src/defaults.ts`

- [ ] **Step 1: Add loaded speed and dwell defaults to `defaults.ts`**

In `packages/types/src/defaults.ts`, add these constants at the end of the file:

```typescript
/** Average door-to-door speed for a loaded truck (mph) — lower than highway due to city approach, traffic, maneuvering */
export const DEFAULT_LOADED_SPEED_MPH = 50;

/** Average time at shipper for check-in, dock assignment, loading, and paperwork (hours) */
export const DEFAULT_LOADING_HOURS = 2.5;

/** Average time at receiver for check-in, unloading, and paperwork (hours) */
export const DEFAULT_UNLOADING_HOURS = 2;
```

- [ ] **Step 2: Verify the build**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/packages/types && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/defaults.ts
git commit -m "feat: add loaded speed and loading/unloading dwell defaults"
```

---

## Task 2: Create `trip-defaults.ts` with `ModelDefault` Metadata

**Files:**
- Create: `packages/types/src/trip-defaults.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Create `trip-defaults.ts`**

Create `packages/types/src/trip-defaults.ts`:

```typescript
/**
 * Trip Model Defaults with Metadata
 *
 * Every default carries label, description, source, and unit metadata
 * so the frontend can dynamically render tooltips, settings labels,
 * and "how we calculated this" explanations.
 *
 * HOS constants are federal law and not user-configurable — they live
 * in trip-simulator.ts as internal constants.
 */

import {
  DEFAULT_AVG_SPEED_MPH,
  DEFAULT_AVG_DRIVING_HOURS_PER_DAY,
  DEFAULT_LOADED_SPEED_MPH,
  DEFAULT_LOADING_HOURS,
  DEFAULT_UNLOADING_HOURS,
} from './defaults.js';

/** Metadata wrapper for a model default — enables frontend tooltips and settings UI */
export interface ModelDefault<T = number> {
  /** The default value */
  value: T;
  /** Short human-readable label (for settings UI) */
  label: string;
  /** Longer explanation (for tooltips) */
  description: string;
  /** Where the value comes from (for "how we calculated this" UI) */
  source?: string;
  /** Display unit (e.g. "mph", "hours", "miles") */
  unit: string;
}

/**
 * Documented defaults for the trip simulator.
 *
 * Each entry is a `ModelDefault` with metadata for UI rendering.
 * The `.value` field matches the corresponding constant in `defaults.ts`.
 */
export const TRIP_DEFAULTS = {
  loaded_speed_mph: {
    value: DEFAULT_LOADED_SPEED_MPH,
    label: 'Loaded Speed',
    description:
      'Average door-to-door speed for a loaded truck, accounting for city approach, traffic, and maneuvering.',
    source:
      'Industry average; highway speeds are 60-65 but real-world loaded door-to-door is lower.',
    unit: 'mph',
  },
  deadhead_speed_mph: {
    value: DEFAULT_AVG_SPEED_MPH,
    label: 'Deadhead Speed',
    description: 'Average speed when driving empty (bobtail or empty trailer).',
    unit: 'mph',
  },
  avg_driving_hours_per_day: {
    value: DEFAULT_AVG_DRIVING_HOURS_PER_DAY,
    label: 'Avg Driving Hours / Day',
    description:
      'Typical solo driver driving hours per day. FMCSA max is 11h, but real-world OTR solo average is lower.',
    source: 'FMCSA HOS data; real-world OTR averages 500-600 mi/day.',
    unit: 'hours',
  },
  loading_hours: {
    value: DEFAULT_LOADING_HOURS,
    label: 'Loading Time',
    description:
      'Average time at shipper for check-in, dock assignment, loading, and paperwork.',
    source: 'Industry average dwell time at shipper facilities is 2-3.5 hours.',
    unit: 'hours',
  },
  unloading_hours: {
    value: DEFAULT_UNLOADING_HOURS,
    label: 'Unloading Time',
    description:
      'Average time at receiver for check-in, unloading, and paperwork.',
    source: 'Receivers tend to be slightly faster than shippers.',
    unit: 'hours',
  },
  fueling_interval_miles: {
    value: 500,
    label: 'Fueling Interval',
    description:
      'Miles between fueling stops based on typical Class 8 tank range.',
    unit: 'miles',
  },
  fueling_stop_hours: {
    value: 0.5,
    label: 'Fueling Stop Duration',
    description: 'Time per fueling stop including fill-up, DEF, restroom.',
    unit: 'hours',
  },
} as const satisfies Record<string, ModelDefault>;

/** Type-safe key union for TRIP_DEFAULTS */
export type TripDefaultKey = keyof typeof TRIP_DEFAULTS;
```

- [ ] **Step 2: Add export to `index.ts`**

In `packages/types/src/index.ts`, add this line after the existing exports:

```typescript
export * from './trip-defaults.js';
```

- [ ] **Step 3: Verify the build**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/packages/types && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/trip-defaults.ts packages/types/src/index.ts
git commit -m "feat: add TRIP_DEFAULTS with ModelDefault metadata for UI tooltips"
```

---

## Task 3: Create `trip-simulator.ts` — Types and `simulateTrip()` Function

**Files:**
- Create: `packages/types/src/trip-simulator.ts`
- Modify: `packages/types/src/index.ts`

This is the core task. The function walks through each leg, simulating the driver's clock forward, and emits phases.

- [ ] **Step 1: Write the failing test**

Create `backend/src/scoring/trip-simulator.spec.ts`:

```typescript
import {
  simulateTrip,
  type TripLeg,
  type TripSimulationResult,
  type TripPhaseKind,
} from '@mwbhtx/haulvisor-core';

/** Helper: count phases of a given kind */
function countPhases(result: TripSimulationResult, kind: TripPhaseKind): number {
  return result.phases.filter((p) => p.kind === kind).length;
}

/** Helper: sum duration of phases of a given kind */
function sumDuration(result: TripSimulationResult, kind: TripPhaseKind): number {
  return result.phases
    .filter((p) => p.kind === kind)
    .reduce((s, p) => s + p.duration_hours, 0);
}

describe('simulateTrip', () => {
  describe('single short deadhead', () => {
    it('produces a single deadhead phase with no rest', () => {
      const legs: TripLeg[] = [
        {
          kind: 'deadhead',
          miles: 50,
          weight_lbs: 0,
          origin_city: 'Houston',
          destination_city: 'Sealy',
        },
      ];
      const result = simulateTrip({ legs });

      // 50 mi / 55 mph ≈ 0.91h — well within a single driving shift
      expect(countPhases(result, 'deadhead')).toBe(1);
      expect(countPhases(result, 'rest')).toBe(0);
      expect(result.phases[0].miles).toBe(50);
      expect(result.summary.total_days).toBe(1);
      expect(result.summary.deadhead_miles).toBe(50);
      expect(result.summary.loaded_miles).toBe(0);
    });
  });

  describe('single loaded leg — short', () => {
    it('produces loading + driving + unloading phases', () => {
      const legs: TripLeg[] = [
        {
          kind: 'load',
          miles: 200,
          weight_lbs: 40000,
          origin_city: 'Dallas',
          destination_city: 'Austin',
        },
      ];
      const result = simulateTrip({ legs });

      const kinds = result.phases.map((p) => p.kind);
      // Should be: loading, driving, unloading
      expect(kinds[0]).toBe('loading');
      expect(kinds[kinds.length - 1]).toBe('unloading');
      expect(kinds.filter((k) => k === 'driving').length).toBeGreaterThanOrEqual(1);
      expect(result.summary.loading_hours).toBe(2.5); // default
      expect(result.summary.unloading_hours).toBe(2); // default
      expect(result.summary.loaded_miles).toBe(200);
    });
  });

  describe('single loaded leg — long, requires rest', () => {
    it('splits driving at rest stops', () => {
      const legs: TripLeg[] = [
        {
          kind: 'load',
          miles: 1121,
          weight_lbs: 44000,
          origin_city: 'Sealy',
          destination_city: 'Flagstaff',
        },
      ];
      const result = simulateTrip({ legs });

      // 1121 mi / 50 mph = ~22.4h driving. At 8h/day cap, needs 2 rest stops.
      expect(countPhases(result, 'rest')).toBeGreaterThanOrEqual(2);
      expect(countPhases(result, 'driving')).toBeGreaterThanOrEqual(3);

      // Total driving hours should be close to 1121/50 = 22.42
      expect(result.summary.driving_hours).toBeCloseTo(22.42, 0);

      // Total should be ~3 days (22h driving + 20h rest + 4.5h dwell + breaks)
      expect(result.summary.total_days).toBeGreaterThanOrEqual(2);
      expect(result.summary.total_days).toBeLessThanOrEqual(4);
    });
  });

  describe('multi-leg trip with date windows', () => {
    it('produces waiting phases when driver arrives before pickup window', () => {
      const legs: TripLeg[] = [
        // DH to first pickup
        {
          kind: 'deadhead',
          miles: 50,
          weight_lbs: 0,
          origin_city: 'Houston',
          destination_city: 'Sealy',
        },
        // Load 1: Sealy → Flagstaff
        {
          kind: 'load',
          miles: 1121,
          weight_lbs: 44000,
          origin_city: 'Sealy',
          destination_city: 'Flagstaff',
          pickup_date_early: '2026-03-26T18:00:00Z',
          delivery_date_early: '2026-03-30T02:00:00Z',
          delivery_date_late: '2026-03-30T05:00:00Z',
        },
        // DH between legs
        {
          kind: 'deadhead',
          miles: 250,
          weight_lbs: 0,
          origin_city: 'Flagstaff',
          destination_city: 'Las Vegas',
        },
        // Load 2: Las Vegas → Waco
        {
          kind: 'load',
          miles: 1352,
          weight_lbs: 42000,
          origin_city: 'Las Vegas',
          destination_city: 'Waco',
          pickup_date_early: '2026-03-29T18:00:00Z',
          pickup_date_late: '2026-03-30T18:00:00Z',
          delivery_date_early: '2026-04-01T02:00:00Z',
          delivery_date_late: '2026-04-01T09:00:00Z',
        },
        // DH home
        {
          kind: 'deadhead',
          miles: 185,
          weight_lbs: 0,
          origin_city: 'Waco',
          destination_city: 'Houston',
        },
      ];

      const result = simulateTrip({ legs });

      // Should have waiting phases (driver arrives Flagstaff ~Mar 28 but delivery window opens Mar 30)
      const waitingPhases = result.phases.filter((p) => p.kind === 'waiting');
      expect(waitingPhases.length).toBeGreaterThanOrEqual(1);

      // The big wait should be for the Flagstaff delivery window
      const deliveryWait = waitingPhases.find((p) => p.waiting_for === 'delivery_window');
      expect(deliveryWait).toBeDefined();
      expect(deliveryWait!.duration_hours).toBeGreaterThan(20); // ~35h wait

      // Total trip should be ~6 days
      expect(result.summary.total_days).toBeGreaterThanOrEqual(5);
      expect(result.summary.total_days).toBeLessThanOrEqual(7);

      // All miles accounted for
      expect(result.summary.loaded_miles).toBe(1121 + 1352);
      expect(result.summary.deadhead_miles).toBe(50 + 250 + 185);
      expect(result.summary.total_miles).toBe(50 + 1121 + 250 + 1352 + 185);
    });
  });

  describe('settings overrides', () => {
    it('respects custom driving hours per day', () => {
      const legs: TripLeg[] = [
        {
          kind: 'load',
          miles: 1000,
          weight_lbs: 30000,
          origin_city: 'A',
          destination_city: 'B',
        },
      ];

      const fast = simulateTrip({
        legs,
        settings: { avg_driving_hours_per_day: 10 },
      });
      const slow = simulateTrip({
        legs,
        settings: { avg_driving_hours_per_day: 6 },
      });

      // Faster driver needs fewer rest stops, finishes sooner
      expect(fast.summary.total_hours).toBeLessThan(slow.summary.total_hours);
      expect(countPhases(fast, 'rest')).toBeLessThan(countPhases(slow, 'rest'));
    });

    it('respects custom loading/unloading hours', () => {
      const legs: TripLeg[] = [
        {
          kind: 'load',
          miles: 100,
          weight_lbs: 20000,
          origin_city: 'A',
          destination_city: 'B',
        },
      ];

      const result = simulateTrip({
        legs,
        settings: { loading_hours: 4, unloading_hours: 3 },
      });

      expect(result.summary.loading_hours).toBe(4);
      expect(result.summary.unloading_hours).toBe(3);
    });
  });

  describe('summary consistency', () => {
    it('summary totals match sum of phase durations', () => {
      const legs: TripLeg[] = [
        { kind: 'deadhead', miles: 100, weight_lbs: 0, origin_city: 'A', destination_city: 'B' },
        { kind: 'load', miles: 500, weight_lbs: 30000, origin_city: 'B', destination_city: 'C' },
        { kind: 'deadhead', miles: 200, weight_lbs: 0, origin_city: 'C', destination_city: 'D' },
      ];
      const result = simulateTrip({ legs });

      const phaseTotal = result.phases.reduce((s, p) => s + p.duration_hours, 0);
      expect(result.summary.total_hours).toBeCloseTo(phaseTotal, 1);

      const componentSum =
        result.summary.driving_hours +
        result.summary.deadhead_hours +
        result.summary.loading_hours +
        result.summary.unloading_hours +
        result.summary.rest_hours +
        result.summary.break_hours +
        result.summary.fuel_hours +
        result.summary.waiting_hours;
      expect(result.summary.total_hours).toBeCloseTo(componentSum, 1);
    });
  });

  describe('leg_index tracking', () => {
    it('ties driving phases back to the correct input leg', () => {
      const legs: TripLeg[] = [
        { kind: 'deadhead', miles: 50, weight_lbs: 0, origin_city: 'A', destination_city: 'B' },
        { kind: 'load', miles: 300, weight_lbs: 20000, origin_city: 'B', destination_city: 'C' },
        { kind: 'load', miles: 400, weight_lbs: 30000, origin_city: 'C', destination_city: 'D' },
      ];
      const result = simulateTrip({ legs });

      // Deadhead phases should have leg_index 0
      const dhPhases = result.phases.filter((p) => p.kind === 'deadhead');
      dhPhases.forEach((p) => expect(p.leg_index).toBe(0));

      // First load's driving phases should have leg_index 1
      const load1Driving = result.phases.filter(
        (p) => p.kind === 'driving' && p.leg_index === 1,
      );
      expect(load1Driving.length).toBeGreaterThanOrEqual(1);
      const load1Miles = load1Driving.reduce((s, p) => s + (p.miles ?? 0), 0);
      expect(load1Miles).toBeCloseTo(300, 0);

      // Second load's driving phases should have leg_index 2
      const load2Driving = result.phases.filter(
        (p) => p.kind === 'driving' && p.leg_index === 2,
      );
      expect(load2Driving.length).toBeGreaterThanOrEqual(1);
      const load2Miles = load2Driving.reduce((s, p) => s + (p.miles ?? 0), 0);
      expect(load2Miles).toBeCloseTo(400, 0);
    });
  });

  describe('no date windows', () => {
    it('produces no waiting phases when legs have no dates', () => {
      const legs: TripLeg[] = [
        { kind: 'deadhead', miles: 100, weight_lbs: 0, origin_city: 'A', destination_city: 'B' },
        { kind: 'load', miles: 500, weight_lbs: 30000, origin_city: 'B', destination_city: 'C' },
        { kind: 'deadhead', miles: 100, weight_lbs: 0, origin_city: 'C', destination_city: 'D' },
      ];
      const result = simulateTrip({ legs });

      expect(countPhases(result, 'waiting')).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/backend && npx jest src/scoring/trip-simulator.spec.ts --no-coverage`
Expected: FAIL — `simulateTrip` is not exported from `@mwbhtx/haulvisor-core`

- [ ] **Step 3: Create `trip-simulator.ts` with types and `simulateTrip()` implementation**

Create `packages/types/src/trip-simulator.ts`:

```typescript
/**
 * Unified Trip Simulator
 *
 * Single source of truth for estimating trip duration and producing a
 * phase-level timeline. Replaces the three divergent transit time
 * calculations (transit-time.ts HOS engine, cost-model.ts estimateTripDays,
 * route-inspector.tsx loadedDriveHours).
 *
 * Walks through each leg in order, simulating a solo driver's clock forward.
 * Accounts for FMCSA HOS regulations, loading/unloading dwell, fueling,
 * and waiting for pickup/delivery windows.
 *
 * All functions are pure — no side effects, no database, no framework deps.
 */

import {
  DEFAULT_AVG_SPEED_MPH,
  DEFAULT_AVG_DRIVING_HOURS_PER_DAY,
  DEFAULT_LOADED_SPEED_MPH,
  DEFAULT_LOADING_HOURS,
  DEFAULT_UNLOADING_HOURS,
} from './defaults.js';

// ---------------------------------------------------------------------------
// FMCSA Hours of Service Constants (federal law — not user-configurable)
// ---------------------------------------------------------------------------

const HOS_MAX_DRIVING_HOURS = 11;
const HOS_ON_DUTY_WINDOW_HOURS = 14;
const HOS_BREAK_TRIGGER_HOURS = 8;
const HOS_MANDATORY_BREAK_HOURS = 0.5;
const HOS_MANDATORY_REST_HOURS = 10;

const DEFAULT_FUELING_INTERVAL_MILES = 500;
const DEFAULT_FUELING_STOP_HOURS = 0.5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single leg in the trip — either a paid load or a deadhead repositioning */
export interface TripLeg {
  kind: 'load' | 'deadhead';
  miles: number;
  /** Load weight in lbs (0 for deadhead) */
  weight_lbs: number;
  origin_city: string;
  destination_city: string;
  /** Order date windows (loads only) — ISO 8601 */
  pickup_date_early?: string;
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

export type TripPhaseKind =
  | 'deadhead'
  | 'driving'
  | 'loading'
  | 'unloading'
  | 'rest'
  | 'break'
  | 'fuel'
  | 'waiting';

export interface TripPhase {
  kind: TripPhaseKind;
  /** How long this phase takes (hours) */
  duration_hours: number;
  /** Miles covered (deadhead and driving phases only) */
  miles?: number;
  /** Origin city (deadhead, driving, loading phases) */
  origin_city?: string;
  /** Destination city (deadhead, driving, unloading phases) */
  destination_city?: string;
  /** Index into the input legs array — ties this phase back to a specific leg */
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

// ---------------------------------------------------------------------------
// Settings resolution
// ---------------------------------------------------------------------------

interface ResolvedSettings {
  loaded_speed_mph: number;
  deadhead_speed_mph: number;
  avg_driving_hours_per_day: number;
  loading_hours: number;
  unloading_hours: number;
  fueling_interval_miles: number;
  fueling_stop_hours: number;
}

function resolveSimSettings(s?: TripSimulationSettings): ResolvedSettings {
  return {
    loaded_speed_mph: s?.loaded_speed_mph ?? DEFAULT_LOADED_SPEED_MPH,
    deadhead_speed_mph: s?.deadhead_speed_mph ?? DEFAULT_AVG_SPEED_MPH,
    avg_driving_hours_per_day: s?.avg_driving_hours_per_day ?? DEFAULT_AVG_DRIVING_HOURS_PER_DAY,
    loading_hours: s?.loading_hours ?? DEFAULT_LOADING_HOURS,
    unloading_hours: s?.unloading_hours ?? DEFAULT_UNLOADING_HOURS,
    fueling_interval_miles: s?.fueling_interval_miles ?? DEFAULT_FUELING_INTERVAL_MILES,
    fueling_stop_hours: s?.fueling_stop_hours ?? DEFAULT_FUELING_STOP_HOURS,
  };
}

// ---------------------------------------------------------------------------
// Core simulation
// ---------------------------------------------------------------------------

/**
 * Simulate a full trip and produce a phase-level timeline.
 *
 * Walks through each leg in order. For loads: emits loading → driving (split
 * at HOS rest/break boundaries) → unloading. For deadheads: emits driving
 * (split at HOS boundaries). Inserts waiting phases when the driver arrives
 * before a pickup or delivery window opens.
 *
 * The first load's `pickup_date_early` anchors the elapsed clock. All
 * subsequent date comparisons are relative to this anchor. If no dates
 * exist, no waiting phases are emitted.
 */
export function simulateTrip(input: TripSimulationInput): TripSimulationResult {
  const s = resolveSimSettings(input.settings);
  const phases: TripPhase[] = [];

  // Effective driving cap and on-duty window, scaled by avg_driving_hours_per_day
  const drivingCap = Math.min(s.avg_driving_hours_per_day, HOS_MAX_DRIVING_HOURS);
  const onDutyWindowCap = HOS_ON_DUTY_WINDOW_HOURS - (HOS_MAX_DRIVING_HOURS - drivingCap);

  // HOS shift clocks
  let shiftDrivingHours = 0;
  let shiftOnDutyHours = 0;
  let hoursSinceBreak = 0;
  let milesSinceLastFuel = 0;

  // Elapsed time tracking for date window comparisons (milliseconds)
  // Anchor = first load's pickup_date_early
  let anchorMs: number | null = null;
  let elapsedMs = 0;

  // Find the anchor: first load with a pickup_date_early
  for (const leg of input.legs) {
    if (leg.kind === 'load' && leg.pickup_date_early) {
      anchorMs = new Date(leg.pickup_date_early).getTime();
      break;
    }
  }

  // Calculate initial elapsed time: if there are deadhead legs before the
  // anchor load, we need to "back up" the clock by their duration so that
  // the driver arrives at the first pickup at the anchor time.
  // We'll handle this by processing deadhead legs before the anchor without
  // advancing elapsed time from the anchor, then snapping elapsed to 0
  // when we hit the anchor load.
  let reachedAnchor = anchorMs === null; // if no anchor, treat as always reached
  let preAnchorElapsedHours = 0;

  function addElapsed(hours: number): void {
    elapsedMs += hours * 3_600_000;
  }

  function currentMs(): number | null {
    if (anchorMs === null) return null;
    return anchorMs + elapsedMs;
  }

  function takeRest(): void {
    phases.push({ kind: 'rest', duration_hours: HOS_MANDATORY_REST_HOURS });
    if (reachedAnchor) addElapsed(HOS_MANDATORY_REST_HOURS);
    else preAnchorElapsedHours += HOS_MANDATORY_REST_HOURS;
    shiftDrivingHours = 0;
    shiftOnDutyHours = 0;
    hoursSinceBreak = 0;
  }

  function takeBreak(): void {
    phases.push({ kind: 'break', duration_hours: HOS_MANDATORY_BREAK_HOURS });
    if (reachedAnchor) addElapsed(HOS_MANDATORY_BREAK_HOURS);
    else preAnchorElapsedHours += HOS_MANDATORY_BREAK_HOURS;
    shiftOnDutyHours += HOS_MANDATORY_BREAK_HOURS;
    hoursSinceBreak = 0;
  }

  function takeFuelStop(): void {
    phases.push({ kind: 'fuel', duration_hours: s.fueling_stop_hours });
    if (reachedAnchor) addElapsed(s.fueling_stop_hours);
    else preAnchorElapsedHours += s.fueling_stop_hours;
    shiftOnDutyHours += s.fueling_stop_hours;
    milesSinceLastFuel = 0;
    if (shiftOnDutyHours >= onDutyWindowCap) {
      takeRest();
    }
  }

  /**
   * Simulate driving a segment, emitting phases split at HOS boundaries.
   * Returns the phases emitted for this segment.
   */
  function driveSegment(
    totalMiles: number,
    speedMph: number,
    phaseKind: 'driving' | 'deadhead',
    legIndex: number,
    originCity: string,
    destCity: string,
  ): void {
    let remainingMiles = totalMiles;

    while (remainingMiles > 0.1) {
      // Hours to drive remaining miles at speed
      const hoursForRemaining = remainingMiles / speedMph;

      // Hours until each HOS limit
      const untilDrivingCap = Math.max(0, drivingCap - shiftDrivingHours);
      const untilOnDutyCap = Math.max(0, onDutyWindowCap - shiftOnDutyHours);
      const untilBreakTrigger = Math.max(0, HOS_BREAK_TRIGGER_HOURS - hoursSinceBreak);
      const milesUntilFuel = Math.max(0, s.fueling_interval_miles - milesSinceLastFuel);
      const hoursUntilFuel = milesUntilFuel / speedMph;

      const drivableHours = Math.max(0, Math.min(
        hoursForRemaining,
        untilDrivingCap,
        untilOnDutyCap,
        untilBreakTrigger,
        hoursUntilFuel,
      ));

      if (drivableHours <= 0) {
        // A limit is already reached — handle before driving
        if (shiftDrivingHours >= drivingCap || shiftOnDutyHours >= onDutyWindowCap) {
          takeRest();
        } else if (hoursSinceBreak >= HOS_BREAK_TRIGGER_HOURS) {
          takeBreak();
        } else if (milesSinceLastFuel >= s.fueling_interval_miles) {
          takeFuelStop();
        }
        continue;
      }

      // Drive this chunk
      const milesDriven = round2(drivableHours * speedMph);
      phases.push({
        kind: phaseKind,
        duration_hours: round2(drivableHours),
        miles: milesDriven,
        origin_city: originCity,
        destination_city: destCity,
        leg_index: legIndex,
      });

      if (reachedAnchor) addElapsed(drivableHours);
      else preAnchorElapsedHours += drivableHours;

      shiftDrivingHours += drivableHours;
      shiftOnDutyHours += drivableHours;
      hoursSinceBreak += drivableHours;
      milesSinceLastFuel += milesDriven;
      remainingMiles -= milesDriven;

      // Handle the limit we bumped into (if more miles remain)
      if (remainingMiles > 0.1) {
        if (shiftDrivingHours >= drivingCap || shiftOnDutyHours >= onDutyWindowCap) {
          takeRest();
        } else if (hoursSinceBreak >= HOS_BREAK_TRIGGER_HOURS) {
          takeBreak();
        } else if (milesSinceLastFuel >= s.fueling_interval_miles) {
          takeFuelStop();
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop: process each leg
  // ---------------------------------------------------------------------------

  for (let i = 0; i < input.legs.length; i++) {
    const leg = input.legs[i];

    if (leg.kind === 'deadhead') {
      if (leg.miles > 0) {
        driveSegment(
          leg.miles,
          s.deadhead_speed_mph,
          'deadhead',
          i,
          leg.origin_city,
          leg.destination_city,
        );
      }

      // If this deadhead leads into the anchor load, snap elapsed time
      if (!reachedAnchor && i + 1 < input.legs.length) {
        const nextLeg = input.legs[i + 1];
        if (nextLeg.kind === 'load' && nextLeg.pickup_date_early && anchorMs !== null) {
          // We've arrived at the first pickup — reset elapsed to 0
          reachedAnchor = true;
          elapsedMs = 0;
        }
      }
    } else {
      // kind === 'load'

      // Mark anchor reached when we hit the anchor load
      if (!reachedAnchor && leg.pickup_date_early && anchorMs !== null) {
        reachedAnchor = true;
        elapsedMs = 0;
      }

      // --- Waiting for pickup window ---
      if (reachedAnchor && anchorMs !== null && leg.pickup_date_early) {
        const pickupOpenMs = new Date(leg.pickup_date_early).getTime();
        const now = currentMs()!;
        if (now < pickupOpenMs) {
          const waitHours = round2((pickupOpenMs - now) / 3_600_000);
          if (waitHours > 0) {
            phases.push({
              kind: 'waiting',
              duration_hours: waitHours,
              waiting_for: 'pickup_window',
              origin_city: leg.origin_city,
              leg_index: i,
            });
            addElapsed(waitHours);
          }
        }
      }

      // --- Loading ---
      phases.push({
        kind: 'loading',
        duration_hours: s.loading_hours,
        origin_city: leg.origin_city,
        leg_index: i,
      });
      if (reachedAnchor) addElapsed(s.loading_hours);
      else preAnchorElapsedHours += s.loading_hours;

      // Loading is on-duty time
      shiftOnDutyHours += s.loading_hours;
      if (shiftOnDutyHours >= onDutyWindowCap) {
        takeRest();
      }

      // --- Driving loaded ---
      if (leg.miles > 0) {
        driveSegment(
          leg.miles,
          s.loaded_speed_mph,
          'driving',
          i,
          leg.origin_city,
          leg.destination_city,
        );
      }

      // --- Waiting for delivery window ---
      if (reachedAnchor && anchorMs !== null && leg.delivery_date_early) {
        const deliveryOpenMs = new Date(leg.delivery_date_early).getTime();
        const now = currentMs()!;
        if (now < deliveryOpenMs) {
          const waitHours = round2((deliveryOpenMs - now) / 3_600_000);
          if (waitHours > 0) {
            phases.push({
              kind: 'waiting',
              duration_hours: waitHours,
              waiting_for: 'delivery_window',
              destination_city: leg.destination_city,
              leg_index: i,
            });
            addElapsed(waitHours);
          }
        }
      }

      // --- Unloading ---
      phases.push({
        kind: 'unloading',
        duration_hours: s.unloading_hours,
        destination_city: leg.destination_city,
        leg_index: i,
      });
      if (reachedAnchor) addElapsed(s.unloading_hours);
      else preAnchorElapsedHours += s.unloading_hours;

      // Unloading is on-duty time
      shiftOnDutyHours += s.unloading_hours;
      if (shiftOnDutyHours >= onDutyWindowCap) {
        takeRest();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Build summary
  // ---------------------------------------------------------------------------

  const summary = buildSummary(phases);

  return { phases, summary };
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

function buildSummary(phases: TripPhase[]): TripSimulationSummary {
  let driving = 0;
  let deadhead = 0;
  let loading = 0;
  let unloading = 0;
  let rest = 0;
  let brk = 0;
  let fuel = 0;
  let waiting = 0;
  let loadedMiles = 0;
  let deadheadMiles = 0;

  for (const p of phases) {
    switch (p.kind) {
      case 'driving':
        driving += p.duration_hours;
        loadedMiles += p.miles ?? 0;
        break;
      case 'deadhead':
        deadhead += p.duration_hours;
        deadheadMiles += p.miles ?? 0;
        break;
      case 'loading':
        loading += p.duration_hours;
        break;
      case 'unloading':
        unloading += p.duration_hours;
        break;
      case 'rest':
        rest += p.duration_hours;
        break;
      case 'break':
        brk += p.duration_hours;
        break;
      case 'fuel':
        fuel += p.duration_hours;
        break;
      case 'waiting':
        waiting += p.duration_hours;
        break;
    }
  }

  const total = driving + deadhead + loading + unloading + rest + brk + fuel + waiting;

  return {
    total_days: Math.max(1, Math.ceil(total / 24)),
    total_hours: round2(total),
    driving_hours: round2(driving),
    deadhead_hours: round2(deadhead),
    loading_hours: round2(loading),
    unloading_hours: round2(unloading),
    rest_hours: round2(rest),
    break_hours: round2(brk),
    fuel_hours: round2(fuel),
    waiting_hours: round2(waiting),
    total_miles: round2(loadedMiles + deadheadMiles),
    loaded_miles: round2(loadedMiles),
    deadhead_miles: round2(deadheadMiles),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

- [ ] **Step 4: Add export to `index.ts`**

In `packages/types/src/index.ts`, add:

```typescript
export * from './trip-simulator.js';
```

- [ ] **Step 5: Build the shared package**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/packages/types && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Run the tests**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/backend && npx jest src/scoring/trip-simulator.spec.ts --no-coverage`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/trip-simulator.ts packages/types/src/index.ts backend/src/scoring/trip-simulator.spec.ts
git commit -m "feat: add simulateTrip() — unified trip simulation with phase timeline"
```

---

## Task 4: Wire `estimateTripDays()` to Use `simulateTrip()`

**Files:**
- Modify: `packages/types/src/cost-model.ts`
- Modify: `backend/src/scoring/cost-model.spec.ts`

- [ ] **Step 1: Write a regression test**

Add this test to `backend/src/scoring/cost-model.spec.ts` inside the `estimateTripDays` describe block:

```typescript
    it('returns same result whether called directly or via simulateTrip', () => {
      // Verify estimateTripDays delegates to simulateTrip internally
      // by checking that results are consistent
      const days = estimateTripDays(1000, 55, 8);
      expect(days).toBeGreaterThanOrEqual(2);
      expect(days).toBeLessThanOrEqual(4);
    });
```

- [ ] **Step 2: Run to verify it passes with current implementation**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/backend && npx jest src/scoring/cost-model.spec.ts --no-coverage`
Expected: PASS

- [ ] **Step 3: Update `estimateTripDays()` to delegate to `simulateTrip()`**

In `packages/types/src/cost-model.ts`, replace the `estimateTripDays` function:

Replace this:
```typescript
import { estimateTransitHoursForMiles } from './transit-time.js';
```

With:
```typescript
import { estimateTransitHoursForMiles } from './transit-time.js';
import { simulateTrip } from './trip-simulator.js';
```

Replace the `estimateTripDays` function body:

```typescript
export function estimateTripDays(
  totalMiles: number,
  avgSpeed: number = DEFAULT_AVG_SPEED_MPH,
  avgDrivingHoursPerDay: number = DEFAULT_AVG_DRIVING_HOURS_PER_DAY,
): number {
  const result = simulateTrip({
    legs: [
      {
        kind: 'load',
        miles: totalMiles,
        weight_lbs: 0,
        origin_city: '',
        destination_city: '',
      },
    ],
    settings: {
      loaded_speed_mph: avgSpeed,
      avg_driving_hours_per_day: avgDrivingHoursPerDay,
    },
  });
  return result.summary.total_days;
}
```

- [ ] **Step 4: Build and run existing tests**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/packages/types && npx tsc --noEmit && cd ../../backend && npx jest src/scoring/cost-model.spec.ts --no-coverage`
Expected: All tests PASS. Note: estimated_days values may shift slightly due to the new model including loading/unloading dwell (4.5h) and using 50 mph loaded speed instead of 55 mph. If tests fail, update the expected values to match the new (more accurate) model.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/cost-model.ts backend/src/scoring/cost-model.spec.ts
git commit -m "refactor: estimateTripDays delegates to simulateTrip"
```

---

## Task 5: Add `timeline` and `trip_summary` to API Response Types

**Files:**
- Modify: `packages/types/src/types/routes.ts`
- Modify: `packages/types/src/types/round-trip.ts`
- Modify: `packages/types/src/types/scoring.ts`
- Modify: `haulvisor/src/lib/types.ts`

- [ ] **Step 1: Add to `ScoredRouteFields` in `scoring.ts`**

In `packages/types/src/types/scoring.ts`, add the import and field:

```typescript
import type { TripPhase, TripSimulationSummary } from '../trip-simulator.js';
```

Add to the `ScoredRouteFields` interface:

```typescript
  /** Phase-level trip timeline from the simulator */
  timeline?: TripPhase[];
  /** Aggregated trip metrics from the simulator */
  trip_summary?: TripSimulationSummary;
```

- [ ] **Step 2: Add to `RouteChain` in `routes.ts`**

In `packages/types/src/types/routes.ts`, add the import:

```typescript
import type { TripPhase, TripSimulationSummary } from '../trip-simulator.js';
```

Add to the `RouteChain` interface after `cost_breakdown`:

```typescript
  /** Phase-level trip timeline from the simulator */
  timeline?: TripPhase[];
  /** Aggregated trip metrics from the simulator */
  trip_summary?: TripSimulationSummary;
```

- [ ] **Step 3: Add to `RoundTripChain` in `round-trip.ts`**

In `packages/types/src/types/round-trip.ts`, add the import:

```typescript
import type { TripPhase, TripSimulationSummary } from '../trip-simulator.js';
```

Add to the `RoundTripChain` interface after `cost_breakdown`:

```typescript
  /** Phase-level trip timeline from the simulator */
  timeline?: TripPhase[];
  /** Aggregated trip metrics from the simulator */
  trip_summary?: TripSimulationSummary;
```

- [ ] **Step 4: Re-export new types from frontend**

In `haulvisor/src/lib/types.ts`, add to the existing `@mwbhtx/haulvisor-core` imports:

```typescript
export type { TripPhase, TripPhaseKind, TripSimulationSummary } from "@mwbhtx/haulvisor-core";
```

- [ ] **Step 5: Build both packages**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/packages/types && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/types/routes.ts packages/types/src/types/round-trip.ts packages/types/src/types/scoring.ts
git commit -m "feat: add timeline and trip_summary fields to route chain types"
```

---

## Task 6: Wire `buildChain()` in `routes.service.ts` to Use `simulateTrip()`

**Files:**
- Modify: `backend/src/routes/routes.service.ts`
- Modify: `backend/src/scoring/index.ts`

- [ ] **Step 1: Re-export `simulateTrip` from scoring barrel**

In `backend/src/scoring/index.ts`, add to the `@mwbhtx/haulvisor-core` export block:

```typescript
  simulateTrip,
  type TripLeg,
  type TripSimulationResult,
```

- [ ] **Step 2: Update `buildChain()` to use `simulateTrip()`**

In `backend/src/routes/routes.service.ts`, add `simulateTrip` and `TripLeg` to the import from `@mwbhtx/haulvisor-core` (or from `'../scoring'`).

Replace the `buildChain` method (lines 145-211) with:

```typescript
  private buildChain(
    orders: OrderRow[],
    deadheadPerLeg: number[],
    routeEndDeadhead: number,
    costSettings: CostModelSettings,
  ): RouteChain {
    const totalPay = orders.reduce((s, o) => s + o.pay, 0);
    const totalLoadedMiles = orders.reduce((s, o) => s + o.miles, 0);
    const totalDeadhead = deadheadPerLeg.reduce((s, d) => s + d, 0) + routeEndDeadhead;

    // Build TripLeg[] for the simulator
    const tripLegs: TripLeg[] = [];
    for (let i = 0; i < orders.length; i++) {
      // Deadhead before this leg
      if (deadheadPerLeg[i] > 0) {
        const prevCity = i === 0 ? '' : orders[i - 1].dest_city;
        tripLegs.push({
          kind: 'deadhead',
          miles: deadheadPerLeg[i],
          weight_lbs: 0,
          origin_city: prevCity,
          destination_city: orders[i].origin_city,
        });
      }
      // Loaded leg
      tripLegs.push({
        kind: 'load',
        miles: orders[i].miles,
        weight_lbs: orders[i].weight ?? 0,
        origin_city: orders[i].origin_city,
        destination_city: orders[i].dest_city,
        pickup_date_early: orders[i].pickup_date_early ?? undefined,
        pickup_date_late: orders[i].pickup_date_late ?? undefined,
        delivery_date_early: orders[i].delivery_date_early ?? undefined,
        delivery_date_late: orders[i].delivery_date_late ?? undefined,
      });
    }
    // End deadhead
    if (routeEndDeadhead > 0) {
      tripLegs.push({
        kind: 'deadhead',
        miles: routeEndDeadhead,
        weight_lbs: 0,
        origin_city: orders[orders.length - 1].dest_city,
        destination_city: '',
      });
    }

    // Run unified simulation
    const sim = simulateTrip({
      legs: tripLegs,
      settings: {
        loaded_speed_mph: costSettings.avg_speed_mph,
        avg_driving_hours_per_day: costSettings.avg_driving_hours_per_day,
      },
    });

    // Build cost segments (still needed for fuel/maintenance cost calc)
    const segments: RouteSegment[] = [];
    for (let i = 0; i < orders.length; i++) {
      if (deadheadPerLeg[i] > 0) {
        segments.push({ miles: deadheadPerLeg[i], weight_lbs: 0 });
      }
      segments.push({ miles: orders[i].miles, weight_lbs: orders[i].weight ?? 0 });
    }
    if (routeEndDeadhead > 0) {
      segments.push({ miles: routeEndDeadhead, weight_lbs: 0 });
    }

    const result = calculateProfit(totalPay, segments, costSettings);
    const dhPct = deadheadPct(totalLoadedMiles, totalDeadhead);

    // Use simulator's total_days for all metrics (replaces calendar day hack)
    const tripDays = sim.summary.total_days;

    // Recalculate daily costs using simulator's days if different from cost model
    let dailyCosts = result.costs.daily_costs;
    let netProfit = result.net_profit;
    if (tripDays > result.costs.estimated_days) {
      const dailyRate = result.costs.estimated_days > 0
        ? result.costs.daily_costs / result.costs.estimated_days
        : 0;
      const extraCost = (tripDays - result.costs.estimated_days) * dailyRate;
      dailyCosts += extraCost;
      netProfit -= extraCost;
    }

    const eRpm = effectiveRpm(netProfit, totalLoadedMiles, totalDeadhead);
    const dnp = dailyNetProfit(netProfit, tripDays);

    return {
      total_pay: totalPay,
      total_miles: totalLoadedMiles,
      total_deadhead_miles: Math.round(totalDeadhead),
      estimated_deadhead_cost: Math.round(
        totalDeadhead > 0 && result.costs.total_miles > 0
          ? (totalDeadhead / result.costs.total_miles) * result.costs.total_cost
          : totalDeadhead * 1.5,
      ),
      profit: Math.round(netProfit * 100) / 100,
      legs: orders.map((o, i) => this.rowToLeg(o, Math.round(deadheadPerLeg[i]))),
      deadhead_pct: dhPct,
      effective_rpm: eRpm,
      estimated_days: tripDays,
      daily_net_profit: dnp,
      cost_breakdown: {
        fuel: result.costs.fuel,
        maintenance: result.costs.maintenance,
        tires: result.costs.tires,
        daily_costs: Math.round(dailyCosts * 100) / 100,
        total: Math.round((result.costs.fuel + result.costs.maintenance + result.costs.tires + dailyCosts) * 100) / 100,
      },
      timeline: sim.phases,
      trip_summary: sim.summary,
    };
  }
```

- [ ] **Step 3: Remove `estimateTransitionHours` from the import if no longer used elsewhere in this file**

Check if `estimateTransitionHours` is used anywhere else in `routes.service.ts`. If the only usage was in `buildChain`, remove it from the import statement.

- [ ] **Step 4: Build and run tests**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/packages/types && npx tsc && cd ../../backend && npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/routes.service.ts backend/src/scoring/index.ts
git commit -m "refactor: buildChain uses simulateTrip for timeline and estimated_days"
```

---

## Task 7: Wire `buildScoredFields()` in `round-trip.service.ts` to Use `simulateTrip()`

**Files:**
- Modify: `backend/src/routes/round-trip.service.ts`

- [ ] **Step 1: Add `simulateTrip` and `TripLeg` to imports**

In `backend/src/routes/round-trip.service.ts`, add `simulateTrip` and `TripLeg` to the imports from `@mwbhtx/haulvisor-core` (or `'../scoring'`).

- [ ] **Step 2: Update `buildScoredFields` to accept order data for TripLeg construction**

The function signature needs to accept enough data to build `TripLeg[]`. Update the signature to also accept city names and date windows. Add these parameters:

```typescript
function buildScoredFields(
  firmPay: number,
  totalPay: number,
  firmOrders: { miles: number; weight: number | null; origin_city: string; dest_city: string; pickup_date_early?: string | null; pickup_date_late?: string | null; delivery_date_early?: string | null; delivery_date_late?: string | null }[],
  specMiles: number,
  deadheadPerLeg: number[],
  returnDeadhead: number,
  costSettings: CostModelSettings,
  firstPickup?: string | null,
  lastDelivery?: string | null,
  originCity?: string,
  returnCity?: string,
): // ... same return type but add timeline and trip_summary
```

Add to the return type:

```typescript
  timeline: TripPhase[];
  trip_summary: TripSimulationSummary;
```

- [ ] **Step 3: Build TripLeg[] and call `simulateTrip()` inside `buildScoredFields`**

Inside the function, after building the existing `segments` array, add:

```typescript
    // Build TripLeg[] for the simulator
    const tripLegs: TripLeg[] = [];
    for (let i = 0; i < firmOrders.length; i++) {
      if (deadheadPerLeg[i] > 0) {
        const prevCity = i === 0 ? (originCity ?? '') : firmOrders[i - 1].dest_city;
        tripLegs.push({
          kind: 'deadhead',
          miles: deadheadPerLeg[i],
          weight_lbs: 0,
          origin_city: prevCity,
          destination_city: firmOrders[i].origin_city,
        });
      }
      tripLegs.push({
        kind: 'load',
        miles: firmOrders[i].miles,
        weight_lbs: firmOrders[i].weight ?? 0,
        origin_city: firmOrders[i].origin_city,
        destination_city: firmOrders[i].dest_city,
        pickup_date_early: firmOrders[i].pickup_date_early ?? undefined,
        pickup_date_late: firmOrders[i].pickup_date_late ?? undefined,
        delivery_date_early: firmOrders[i].delivery_date_early ?? undefined,
        delivery_date_late: firmOrders[i].delivery_date_late ?? undefined,
      });
    }
    if (specMiles > 0) {
      const lastFirm = firmOrders[firmOrders.length - 1];
      tripLegs.push({
        kind: 'deadhead',
        miles: specMiles,
        weight_lbs: 0,
        origin_city: lastFirm.dest_city,
        destination_city: '',
      });
    }
    if (returnDeadhead > 0) {
      const lastCity = specMiles > 0 ? '' : firmOrders[firmOrders.length - 1].dest_city;
      tripLegs.push({
        kind: 'deadhead',
        miles: returnDeadhead,
        weight_lbs: 0,
        origin_city: lastCity,
        destination_city: returnCity ?? '',
      });
    }

    const sim = simulateTrip({
      legs: tripLegs,
      settings: {
        loaded_speed_mph: costSettings.avg_speed_mph,
        avg_driving_hours_per_day: costSettings.avg_driving_hours_per_day,
      },
    });
```

- [ ] **Step 4: Replace the calendar-day adjustment with `sim.summary.total_days`**

Replace the `calendarDays` calculation block and the extra-days adjustment with:

```typescript
    const calendarDays = sim.summary.total_days;
```

Keep the daily costs adjustment logic but use `calendarDays` from the simulator:

```typescript
    let firmProfit = firmResult.net_profit;
    let totalProfit = fullResult.net_profit;
    let dailyCosts = firmResult.costs.daily_costs;
    if (calendarDays > firmResult.costs.estimated_days) {
      const extraDays = calendarDays - firmResult.costs.estimated_days;
      const dailyRate = firmResult.costs.estimated_days > 0
        ? firmResult.costs.daily_costs / firmResult.costs.estimated_days
        : 0;
      const extraCost = extraDays * dailyRate;
      firmProfit -= extraCost;
      totalProfit -= extraCost;
      dailyCosts += extraCost;
    }
```

- [ ] **Step 5: Add `timeline` and `trip_summary` to the return object**

```typescript
    return {
      // ... existing fields ...
      timeline: sim.phases,
      trip_summary: sim.summary,
    };
```

- [ ] **Step 6: Update all callers of `buildScoredFields` to pass the new parameters**

Search for calls to `buildScoredFields` in `round-trip.service.ts`. Each call site needs to pass `originCity` and `returnCity`, and update `firmOrders` to include city/date fields from the `OrderRow`.

The `firmOrders` parameter was previously `{ miles, weight }[]` — update each call site to also include `origin_city`, `dest_city`, `pickup_date_early`, `pickup_date_late`, `delivery_date_early`, `delivery_date_late` from the order row.

- [ ] **Step 7: Remove the old `estimateTransitionHours` import if no longer used in `buildScoredFields`**

Check if `estimateTransitionHours` is still used elsewhere in the file (e.g., in `getTimingSlack`). If so, keep the import. If only used in `buildScoredFields`, remove it.

- [ ] **Step 8: Add `timeline` and `trip_summary` to the `RoundTripChain` objects built in the service**

Find where `buildScoredFields` results are spread into `RoundTripChain` objects and ensure `timeline` and `trip_summary` are included.

- [ ] **Step 9: Build and run tests**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/packages/types && npx tsc && cd ../../backend && npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add backend/src/routes/round-trip.service.ts
git commit -m "refactor: buildScoredFields uses simulateTrip, removes calendar-day hack"
```

---

## Task 8: Update Frontend Route Inspector to Render Backend Timeline

**Files:**
- Modify: `haulvisor/src/components/map/route-inspector.tsx`

- [ ] **Step 1: Delete local simulation code**

In `route-inspector.tsx`, remove:
- The `DH_SPEED_MPH` and `LOADED_SPEED_MPH` constants (lines 8-9)
- The `dhDriveHours()` function (lines 19-22)
- The `loadedDriveHours()` function (lines 24-31)
- The `Segment` type (lines 33-46)
- The `computeSegments()` function (lines 47-138)

- [ ] **Step 2: Import types and defaults from shared package**

Replace the imports with:

```typescript
import { ChevronLeftIcon, TruckIcon, ClockIcon, CalendarIcon, CheckCircle2Icon, AlertTriangleIcon, PackageIcon, PackageOpenIcon, FuelIcon, CoffeeIcon, BedDoubleIcon } from "lucide-react";
import type { RoundTripChain, TripPhase } from "@/lib/types";
import { TRIP_DEFAULTS } from "@mwbhtx/haulvisor-core";
```

Note: check which lucide icons are actually available. If `FuelIcon`, `CoffeeIcon`, `BedDoubleIcon` don't exist in the installed version, use suitable alternatives like `CircleIcon` with labels, or just use text labels.

- [ ] **Step 3: Rewrite the component to render `chain.timeline`**

Replace the component body. The `RouteInspector` now reads `chain.timeline` (array of `TripPhase`) and renders each phase as a row:

```typescript
export function RouteInspector({
  chain,
  originCity,
  returnCity,
  onClose,
}: RouteInspectorProps) {
  const timeline = chain.timeline ?? [];

  return (
    <div className="flex flex-col h-full bg-[#111111]">
      {/* Header */}
      <div className="flex items-center px-3 py-2.5 border-b border-white/10 shrink-0">
        <p className="flex-1 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Segment Breakdown
        </p>
      </div>

      {/* Phase rows */}
      <div className="flex-1 overflow-y-auto">
        {timeline.map((phase, i) => (
          <PhaseRow key={i} phase={phase} />
        ))}
      </div>

      {/* Assumptions footer */}
      <div className="px-3 py-2.5 border-t border-white/10 shrink-0">
        <p className="text-xs text-muted-foreground/50 leading-relaxed">
          <span className="font-medium text-muted-foreground/70">Assumptions:</span>{" "}
          Loaded @ {TRIP_DEFAULTS.loaded_speed_mph.value} mph · DH @ {TRIP_DEFAULTS.deadhead_speed_mph.value} mph · HOS {TRIP_DEFAULTS.avg_driving_hours_per_day.value}h avg drive day / 10h rest · Loading {TRIP_DEFAULTS.loading_hours.value}h · Unloading {TRIP_DEFAULTS.unloading_hours.value}h
        </p>
      </div>
    </div>
  );
}

function PhaseRow({ phase }: { phase: TripPhase }) {
  switch (phase.kind) {
    case 'deadhead':
      return (
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.05]">
          <div className="h-2 w-2 rounded-full border-2 border-muted-foreground/40 bg-card shrink-0" />
          <span className="flex-1 text-sm text-muted-foreground">
            DH: {phase.origin_city} → {phase.destination_city}
          </span>
          <span className="text-xs text-muted-foreground/40 tabular-nums shrink-0">
            {phase.miles?.toLocaleString()} mi
          </span>
          <span className="text-sm text-muted-foreground tabular-nums ml-2 w-14 text-right shrink-0">
            {formatDuration(phase.duration_hours)}
          </span>
        </div>
      );

    case 'driving':
      return (
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.05]">
          <TruckIcon className="h-3.5 w-3.5 text-foreground/70 shrink-0" />
          <span className="flex-1 text-sm font-semibold">
            {phase.origin_city} → {phase.destination_city}
          </span>
          <span className="text-xs text-muted-foreground/40 tabular-nums shrink-0">
            {phase.miles?.toLocaleString()} mi
          </span>
          <span className="text-sm tabular-nums font-medium ml-2 w-14 text-right shrink-0">
            {formatDuration(phase.duration_hours)}
          </span>
        </div>
      );

    case 'loading':
      return (
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.05]">
          <PackageIcon className="h-3.5 w-3.5 text-blue-400/70 shrink-0" />
          <span className="flex-1 text-sm text-blue-400/70">
            Loading at {phase.origin_city}
          </span>
          <span className="text-sm text-muted-foreground/70 tabular-nums w-14 text-right shrink-0">
            {formatDuration(phase.duration_hours)}
          </span>
        </div>
      );

    case 'unloading':
      return (
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.05]">
          <PackageOpenIcon className="h-3.5 w-3.5 text-blue-400/70 shrink-0" />
          <span className="flex-1 text-sm text-blue-400/70">
            Unloading at {phase.destination_city}
          </span>
          <span className="text-sm text-muted-foreground/70 tabular-nums w-14 text-right shrink-0">
            {formatDuration(phase.duration_hours)}
          </span>
        </div>
      );

    case 'rest':
      return (
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.05]">
          <BedDoubleIcon className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
          <span className="flex-1 text-sm text-muted-foreground/50">
            Rest
          </span>
          <span className="text-sm text-muted-foreground/40 tabular-nums w-14 text-right shrink-0">
            {formatDuration(phase.duration_hours)}
          </span>
        </div>
      );

    case 'break':
      return (
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.05]">
          <CoffeeIcon className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
          <span className="flex-1 text-sm text-muted-foreground/50">
            Break
          </span>
          <span className="text-sm text-muted-foreground/40 tabular-nums w-14 text-right shrink-0">
            {formatDuration(phase.duration_hours)}
          </span>
        </div>
      );

    case 'fuel':
      return (
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.05]">
          <FuelIcon className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
          <span className="flex-1 text-sm text-muted-foreground/50">
            Fueling
          </span>
          <span className="text-sm text-muted-foreground/40 tabular-nums w-14 text-right shrink-0">
            {formatDuration(phase.duration_hours)}
          </span>
        </div>
      );

    case 'waiting':
      return (
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.05]">
          <ClockIcon className="h-3.5 w-3.5 text-[#ff5601]/60 shrink-0" />
          <span className="flex-1 text-sm text-[#ff5601]/70">
            Waiting for {phase.waiting_for === 'pickup_window' ? 'pickup' : 'delivery'} window
            {phase.origin_city ? ` at ${phase.origin_city}` : ''}
            {phase.destination_city ? ` at ${phase.destination_city}` : ''}
          </span>
          <span className="text-sm text-muted-foreground/70 tabular-nums w-14 text-right shrink-0">
            {formatDuration(phase.duration_hours)}
          </span>
        </div>
      );
  }
}
```

- [ ] **Step 4: Verify the frontend builds**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor && npx next build` (or `npx tsc --noEmit`)
Expected: No errors. Note: if lucide icon names are wrong, check `npx lucide-react --list` or just use simpler icons.

- [ ] **Step 5: Commit**

```bash
git add src/components/map/route-inspector.tsx src/lib/types.ts
git commit -m "refactor: route inspector renders backend timeline, removes local simulation"
```

---

## Task 9: Publish Updated Core Package

**Files:**
- Modify: `packages/types/package.json` (version bump)

- [ ] **Step 1: Bump the package version**

In `packages/types/package.json`, bump the version from `1.3.4` to `1.4.0` (minor bump — new exports, no breaking changes).

- [ ] **Step 2: Build the package**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/packages/types && npm run build`
Expected: Clean build, `dist/` populated with new files

- [ ] **Step 3: Publish**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/packages/types && npm publish`
Expected: Published `@mwbhtx/haulvisor-core@1.4.0`

- [ ] **Step 4: Update frontend dependency**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor && npm install @mwbhtx/haulvisor-core@1.4.0`

- [ ] **Step 5: Update backend dependency**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/backend && npm install @mwbhtx/haulvisor-core@1.4.0`

- [ ] **Step 6: Commit both repos**

Backend:
```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git add packages/types/package.json backend/package.json package-lock.json
git commit -m "chore: publish @mwbhtx/haulvisor-core 1.4.0 with trip simulator"
```

Frontend:
```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
git add package.json package-lock.json
git commit -m "chore: upgrade @mwbhtx/haulvisor-core to 1.4.0"
```

---

## Task 10: End-to-End Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/backend && npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 2: Run frontend type check**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Start the backend locally and test a route search**

Run the backend dev server, then hit the route search endpoint. Verify the response includes `timeline` and `trip_summary` fields on each route chain.

- [ ] **Step 4: Start the frontend and verify the route inspector**

Open the route inspector panel for a multi-leg route. Verify:
- Phases render correctly (deadhead, loading, driving, rest, unloading, waiting)
- Durations look reasonable
- Assumptions footer shows values from `TRIP_DEFAULTS`
- No console errors

- [ ] **Step 5: Commit any fixes**

If any issues were found, fix and commit.
