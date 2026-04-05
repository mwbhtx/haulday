# Pre-Simulation Pruning & Remove 3-Order Routes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four configurable route quality filters (max deadhead %, min $/day, min RPM, max inter-leg deadhead) that prune candidate pairs before simulation, and remove all 3-order route support.

**Architecture:** Changes span three repos in dependency order: haulvisor-core (shared constants/types) → haulvisor-backend (DTO, pruning logic, 3-order removal) → haulvisor (frontend dropdowns, query params). The backend applies filters in two stages: fast arithmetic pre-simulation, exact thresholds post-simulation.

**Tech Stack:** TypeScript, NestJS (backend), Next.js/React (frontend), @mwbhtx/haulvisor-core (shared package)

**Spec:** `docs/superpowers/specs/2026-04-05-pre-sim-pruning-and-remove-3-order-design.md`

---

## File Map

### haulvisor-core (`/Users/matthewbennett/Documents/GitHub/haulvisor-core`)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/search-defaults.ts` | Modify | Add filter option arrays, change `ORDER_COUNT_OPTIONS` to `[1, 2]` |
| `src/index.ts` | No change | Already re-exports `search-defaults.ts` via `export *` |

### haulvisor-backend (`/Users/matthewbennett/Documents/GitHub/haulvisor-backend`)

| File | Action | Responsibility |
|------|--------|----------------|
| `api/src/routes/dto/route-search.dto.ts` | Modify | Add 4 new optional query params, cap `num_orders` at 2 |
| `api/src/routes/route-search.engine.ts` | Modify | Add filter fields to `SearchConfig`, update `resolveSearchConfig`, change `num_orders` type to `1 \| 2`, update `computeTierLimits` |
| `api/src/routes/route-search.service.ts` | Modify | Pre-sim pruning in pair loop, post-sim filtering, remove OR-Tools branch, remove `RouteSolverService` injection |
| `api/src/routes/routes.module.ts` | Modify | Remove `RouteSolverService` from providers |
| `api/src/routes/route-search.engine.spec.ts` | Modify | Add tests for new `resolveSearchConfig` fields, updated `computeTierLimits` |

### haulvisor (`/Users/matthewbennett/Documents/GitHub/haulvisor`)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/hooks/use-routes.ts` | Modify | Add 4 new optional params to `RouteSearchParams` |
| `src/features/routes/components/search-form.tsx` | Modify | 4 new dropdowns in `AllFiltersPopover`, clean up `numOrders > 0` guards, remove "Any"/3 from `NumOrdersPill` |

---

## Task 1: haulvisor-core — Add filter options and remove 3-order

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-core/src/search-defaults.ts`

- [ ] **Step 1: Update `ORDER_COUNT_OPTIONS` and add filter option arrays**

In `src/search-defaults.ts`, make these changes:

1. Change `ORDER_COUNT_OPTIONS`:

```typescript
// OLD:
export const ORDER_COUNT_OPTIONS = [0, 1, 2, 3] as const;
/** Default number of chained orders (0 = any, let OR-Tools decide) */
export const DEFAULT_NUM_ORDERS = 2;

// NEW:
export const ORDER_COUNT_OPTIONS = [1, 2] as const;
/** Default number of chained orders */
export const DEFAULT_NUM_ORDERS = 2;
```

2. Add the following at the end of the file (after the `TIME_PRESETS` block):

```typescript
// ── Pruning filter options ──────────────────────────────────────────────────

export const MAX_DEADHEAD_PCT_OPTIONS = [
  { value: 25, label: '25%' },
  { value: 30, label: '30%' },
  { value: 35, label: '35%' },
  { value: 40, label: '40%' },
  { value: 45, label: '45%' },
  { value: 50, label: '50%' },
] as const;

export const MIN_DAILY_PROFIT_OPTIONS = [
  { value: 100, label: '$100' },
  { value: 200, label: '$200' },
  { value: 300, label: '$300' },
  { value: 400, label: '$400' },
  { value: 500, label: '$500' },
] as const;

export const MIN_RPM_OPTIONS = [
  { value: 1.00, label: '$1.00' },
  { value: 1.50, label: '$1.50' },
  { value: 2.00, label: '$2.00' },
  { value: 2.50, label: '$2.50' },
  { value: 3.00, label: '$3.00' },
] as const;

export const MAX_INTERLEG_DEADHEAD_OPTIONS = [
  { value: 50,  label: '50 mi' },
  { value: 100, label: '100 mi' },
  { value: 150, label: '150 mi' },
  { value: 200, label: '200 mi' },
  { value: 300, label: '300 mi' },
  { value: 500, label: '500 mi' },
] as const;

/** Hardcoded cap for inter-leg deadhead when no filter is set */
export const DEFAULT_MAX_INTERLEG_DEADHEAD_MILES = 500;
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-core
npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 3: Commit and push**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-core
git add src/search-defaults.ts
git commit -m "feat: add pruning filter options, remove 3-order from ORDER_COUNT_OPTIONS"
git push origin main
```

CI auto-publishes. Wait for the new version to appear before proceeding.

- [ ] **Step 4: Update consumers**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npm update @mwbhtx/haulvisor-core

cd /Users/matthewbennett/Documents/GitHub/haulvisor
npm update @mwbhtx/haulvisor-core
```

---

## Task 2: Backend — Add filter params to DTO and cap num_orders

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/dto/route-search.dto.ts`

- [ ] **Step 1: Add 4 new optional params and change num_orders max**

In `route-search.dto.ts`:

1. Change `num_orders` validation from `@Max(3)` to `@Max(2)`:

```typescript
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  num_orders?: number;
```

2. Add 4 new optional params after the `dest_radius_miles` block (before the cost model section):

```typescript
  // ── Optional: route quality filters ────────────────────────────────────────

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  max_deadhead_pct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  min_daily_profit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  min_rpm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  max_interleg_deadhead_miles?: number;
```

- [ ] **Step 2: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git add api/src/routes/dto/route-search.dto.ts
git commit -m "feat: add route quality filter params to DTO, cap num_orders at 2"
```

---

## Task 3: Backend — Update SearchConfig and resolveSearchConfig

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/route-search.engine.ts`
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/route-search.engine.spec.ts`

- [ ] **Step 1: Write tests for new resolveSearchConfig fields**

Add to `route-search.engine.spec.ts`, inside the existing `describe('resolveSearchConfig', ...)` block:

```typescript
  it('should resolve pruning filter params from query', () => {
    const config = resolveSearchConfig(
      { max_deadhead_pct: 35, min_daily_profit: 200, min_rpm: 2.0, max_interleg_deadhead_miles: 150 },
      {},
    );
    expect(config.max_deadhead_pct).toBe(35);
    expect(config.min_daily_profit).toBe(200);
    expect(config.min_rpm).toBe(2.0);
    expect(config.max_interleg_deadhead_miles).toBe(150);
  });

  it('should leave pruning filters undefined when not set', () => {
    const config = resolveSearchConfig({}, {});
    expect(config.max_deadhead_pct).toBeUndefined();
    expect(config.min_daily_profit).toBeUndefined();
    expect(config.min_rpm).toBeUndefined();
    expect(config.max_interleg_deadhead_miles).toBeUndefined();
  });

  it('should default num_orders to 2 when not set', () => {
    const config = resolveSearchConfig({}, {});
    expect(config.num_orders).toBe(2);
  });

  it('should clamp num_orders to max 2', () => {
    const config = resolveSearchConfig({ num_orders: 3 }, {});
    expect(config.num_orders).toBe(2);
  });
```

Also add a new test for `computeTierLimits`:

```typescript
describe('computeTierLimits', () => {
  it('should allocate tiers for num_orders=1 with destination', () => {
    const tiers = computeTierLimits(true, 1);
    expect(tiers.tier4_limit).toBe(0);
    expect(tiers.tier1_limit).toBeGreaterThan(0);
  });

  it('should allocate tiers for num_orders=2 with destination', () => {
    const tiers = computeTierLimits(true, 2);
    expect(tiers.tier4_limit).toBeGreaterThan(0);
  });

  it('should reallocate tiers 3+4 when no destination', () => {
    const tiers = computeTierLimits(false, 2);
    expect(tiers.tier3_limit).toBe(0);
    expect(tiers.tier4_limit).toBe(0);
    expect(tiers.tier1_limit + tiers.tier2_limit).toBe(500);
  });
});
```

Add `computeTierLimits` to the import at the top of the spec file:

```typescript
import {
  resolveSearchConfig,
  computeDepartureTimestamp,
  buildTripLegs,
  evaluateChain,
  computeTierLimits,
  type SearchConfig,
  type OrderRow,
} from './route-search.engine';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npx jest route-search.engine.spec --no-coverage
```

Expected: New tests fail (missing fields on SearchConfig, computeTierLimits signature change).

- [ ] **Step 3: Update SearchConfig and resolveSearchConfig**

In `route-search.engine.ts`:

1. Change the `SearchConfig` interface — replace `num_orders: number | null` and add filter fields:

```typescript
export interface SearchConfig {
  search_radius_miles: number;
  max_trip_days: number;
  origin_radius_miles: number;
  dest_radius_miles: number;
  work_start_hour: number;
  work_end_hour: number;
  cost_settings: CostModelSettings;
  driver_profile: DriverProfile;
  avg_speed_mph: number;
  origin_lat: number;
  origin_lng: number;
  num_orders: 1 | 2;
  cost_per_mile: number;
  // Pruning filters (undefined = no filter)
  max_deadhead_pct?: number;
  min_daily_profit?: number;
  min_rpm?: number;
  max_interleg_deadhead_miles?: number;
}
```

2. In `resolveSearchConfig`, change the `num_orders` line and add filter fields at the end of the return:

```typescript
    num_orders: Math.min(pick<number>('num_orders', 2), 2) as 1 | 2,
    cost_per_mile: pick<number>('cost_per_mile', DEFAULT_COST_PER_MILE),
    // Pruning filters — only set when explicitly provided
    max_deadhead_pct: q<number>('max_deadhead_pct'),
    min_daily_profit: q<number>('min_daily_profit'),
    min_rpm: q<number>('min_rpm'),
    max_interleg_deadhead_miles: q<number>('max_interleg_deadhead_miles'),
```

3. Update `computeTierLimits` signature — change `numOrders: number | null` to `numOrders: 1 | 2`:

```typescript
export function computeTierLimits(
  hasDestination: boolean,
  numOrders: 1 | 2,
): TierConfig {
```

Remove the comment about `null = any`. The function body stays the same — the `numOrders === 1` branch already handles 1, and the default handles 2.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npx jest route-search.engine.spec --no-coverage
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git add api/src/routes/route-search.engine.ts api/src/routes/route-search.engine.spec.ts
git commit -m "feat: add pruning filter fields to SearchConfig, change num_orders to 1|2"
```

---

## Task 4: Backend — Pre-sim pruning and post-sim filtering in service

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/route-search.service.ts`

- [ ] **Step 1: Add quickNetProfit import**

Add `quickNetProfit` to the import from `@mwbhtx/haulvisor-core`:

```typescript
import {
  RouteChain,
  RouteLeg,
  RouteSearchResult,
  METERS_PER_MILE,
  MS_PER_DAY,
  haversine,
  quickNetProfit,
} from '@mwbhtx/haulvisor-core';
```

- [ ] **Step 2: Add pre-sim pruning to the 2-order pair loop**

Replace the existing 2-order pair loop block (the `} else if (config.num_orders === 2) {` branch, lines ~155-171) with:

```typescript
    } else {
      // 2-order routes: brute-force pairs with pre-simulation pruning.
      const maxInterlegDh = config.max_interleg_deadhead_miles ?? 500;
      sequences = [];
      let preSimSkipped = 0;
      for (const a of candidates) {
        // Pre-compute origin deadhead for order A (used by all pairs starting with A)
        const originDh = haversine(config.origin_lat, config.origin_lng, a.origin_lat, a.origin_lng) * ROAD_CORRECTION_FACTOR;
        for (const b of candidates) {
          if (a.order_id === b.order_id) continue;
          // b's pickup must be after a's earliest delivery (basic time ordering)
          if (b.pickup_date_late_utc && a.delivery_date_early_utc && b.pickup_date_late_utc <= a.delivery_date_early_utc) continue;

          // Inter-leg deadhead
          const interlegDh = haversine(a.dest_lat, a.dest_lng, b.origin_lat, b.origin_lng) * ROAD_CORRECTION_FACTOR;
          if (interlegDh > maxInterlegDh) continue;

          // Pre-sim pruning: fast arithmetic checks
          const totalDeadhead = originDh + interlegDh;
          const totalLoaded = a.miles + b.miles;
          const totalMiles = totalLoaded + totalDeadhead;
          const totalPay = a.pay + b.pay;

          // Max deadhead %
          if (config.max_deadhead_pct != null) {
            const dhPct = (totalDeadhead / totalMiles) * 100;
            if (dhPct > config.max_deadhead_pct) { preSimSkipped++; continue; }
          }

          // Min RPM (gross)
          if (config.min_rpm != null) {
            if (totalPay / totalMiles < config.min_rpm) { preSimSkipped++; continue; }
          }

          // Min daily profit (quick estimate)
          if (config.min_daily_profit != null) {
            const qnp = quickNetProfit(totalPay, totalLoaded, totalDeadhead, config.cost_per_mile);
            const roughDays = Math.max(1, totalMiles / (config.avg_speed_mph * (config.cost_settings.avg_driving_hours_per_day ?? 8)));
            if (qnp / roughDays < config.min_daily_profit) { preSimSkipped++; continue; }
          }

          sequences.push([a.order_id, b.order_id]);
        }
      }
      this.logger.log(`Search: 2-order brute-force — ${sequences.length} pairs (${preSimSkipped} pre-sim pruned) from ${candidates.length} candidates`);
    }
```

Note: This also removes the `else` branch for 3+ orders (OR-Tools). The `if (config.num_orders === 1)` branch stays, and this `else` handles `num_orders === 2`.

- [ ] **Step 3: Add pre-sim pruning for single-order routes**

In the `if (config.num_orders === 1)` branch, replace the simple map with pruning:

```typescript
    if (config.num_orders === 1) {
      sequences = [];
      let preSimSkipped = 0;
      for (const c of candidates) {
        const originDh = haversine(config.origin_lat, config.origin_lng, c.origin_lat, c.origin_lng) * ROAD_CORRECTION_FACTOR;
        const totalMiles = c.miles + originDh;

        if (config.max_deadhead_pct != null) {
          const dhPct = (originDh / totalMiles) * 100;
          if (dhPct > config.max_deadhead_pct) { preSimSkipped++; continue; }
        }

        if (config.min_rpm != null) {
          if (c.pay / totalMiles < config.min_rpm) { preSimSkipped++; continue; }
        }

        if (config.min_daily_profit != null) {
          const qnp = quickNetProfit(c.pay, c.miles, originDh, config.cost_per_mile);
          const roughDays = Math.max(1, totalMiles / (config.avg_speed_mph * (config.cost_settings.avg_driving_hours_per_day ?? 8)));
          if (qnp / roughDays < config.min_daily_profit) { preSimSkipped++; continue; }
        }

        sequences.push([c.order_id]);
      }
      this.logger.log(`Search: single-order — ${sequences.length} candidates (${preSimSkipped} pre-sim pruned)`);
```

- [ ] **Step 4: Add post-simulation filtering**

After the `evaluateChain()` call in the simulation loop (after `if (!result) { simFailCount++; continue; }`), add post-sim filtering before pushing to `chains`:

```typescript
      // Post-sim exact filtering
      if (config.max_deadhead_pct != null && result.deadhead_pct > config.max_deadhead_pct) continue;
      if (config.min_daily_profit != null && result.daily_net_profit < config.min_daily_profit) continue;
      if (config.min_rpm != null && result.rate_per_mile < config.min_rpm) continue;
```

Place this between the `if (!result)` check and the `chains.push({...})` call.

- [ ] **Step 5: Remove RouteSolverService injection**

1. Remove `RouteSolverService` from the constructor:

```typescript
  constructor(
    private readonly postgres: PostgresService,
    private readonly settingsService: SettingsService,
    private readonly companiesService: CompaniesService,
    private readonly drivingDistance: DrivingDistanceService,
  ) {}
```

2. Remove the import:

```typescript
// Remove this line:
import { RouteSolverService } from './route-solver.service';
```

- [ ] **Step 6: Verify build**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npx tsc --noEmit
npx jest route-search.engine.spec --no-coverage
```

Expected: Clean compile and all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git add api/src/routes/route-search.service.ts
git commit -m "feat: add pre-sim pruning and post-sim filtering, remove 3-order OR-Tools branch"
```

---

## Task 5: Backend — Remove RouteSolverService from module

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/routes.module.ts`

- [ ] **Step 1: Remove RouteSolverService from providers**

Change `routes.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RouteSearchService } from './route-search.service';
import { DrivingDistanceService } from './driving-distance.service';
import { SettingsModule } from '../settings/settings.module';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [SettingsModule, CompaniesModule],
  controllers: [RoutesController],
  providers: [RouteSearchService, DrivingDistanceService],
})
export class RoutesModule {}
```

- [ ] **Step 2: Verify build and all tests**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npx tsc --noEmit
npx jest --no-coverage
```

Expected: Clean compile, all tests pass. If anything references `RouteSolverService`, investigate — it should only have been used for the 3-order path.

- [ ] **Step 3: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git add api/src/routes/routes.module.ts
git commit -m "chore: remove RouteSolverService from routes module (3-order support removed)"
```

---

## Task 6: Frontend — Add filter params to RouteSearchParams

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor/src/core/hooks/use-routes.ts`

- [ ] **Step 1: Add 4 new optional params**

Add these fields to the `RouteSearchParams` interface, after the `work_end_hour` line:

```typescript
  // Route quality filters
  max_deadhead_pct?: number;
  min_daily_profit?: number;
  min_rpm?: number;
  max_interleg_deadhead_miles?: number;
```

- [ ] **Step 2: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
git add src/core/hooks/use-routes.ts
git commit -m "feat: add route quality filter params to RouteSearchParams"
```

---

## Task 7: Frontend — Add filter dropdowns and clean up num orders

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor/src/features/routes/components/search-form.tsx`

- [ ] **Step 1: Add imports for new constants**

Update the import from `@mwbhtx/haulvisor-core` to include the new option arrays:

```typescript
import { TRAILER_CATEGORIES, expandTrailerCodes, codesToLabels, DEFAULT_MAX_TRIP_DAYS, DEFAULT_COST_PER_MILE, ORDER_COUNT_OPTIONS, DEFAULT_NUM_ORDERS, DEFAULT_ORIGIN_RADIUS_MILES, DEFAULT_DEST_RADIUS_MILES, MAX_DEADHEAD_PCT_OPTIONS, MIN_DAILY_PROFIT_OPTIONS, MIN_RPM_OPTIONS, MAX_INTERLEG_DEADHEAD_OPTIONS } from "@mwbhtx/haulvisor-core";
```

- [ ] **Step 2: Add state for the 4 new filters in SearchFilters**

In the `SearchFilters` function, after the `destRadius` state declaration (line ~462), add:

```typescript
  const [maxDeadheadPct, setMaxDeadheadPct] = useState<number | undefined>(undefined);
  const [minDailyProfit, setMinDailyProfit] = useState<number | undefined>(undefined);
  const [minRpm, setMinRpm] = useState<number | undefined>(undefined);
  const [maxInterlegDh, setMaxInterlegDh] = useState<number | undefined>(undefined);
```

- [ ] **Step 3: Add filter params to fireSearch and all onSearch calls**

In the `fireSearch` callback, add the new params to the `onSearch({...})` call:

```typescript
    onSearch({
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      departure_date: departureDate,
      ...(destination ? { destination_lat: destination.lat, destination_lng: destination.lng, destination_city: destination.name.split(",")[0] } : {}),
      max_trip_days: daysOut,
      num_orders: numOrders,
      origin_radius_miles: originRadius,
      ...(destination ? { dest_radius_miles: destRadius } : {}),
      ...(maxDeadheadPct != null ? { max_deadhead_pct: maxDeadheadPct } : {}),
      ...(minDailyProfit != null ? { min_daily_profit: minDailyProfit } : {}),
      ...(minRpm != null ? { min_rpm: minRpm } : {}),
      ...(maxInterlegDh != null ? { max_interleg_deadhead_miles: maxInterlegDh } : {}),
      ...driverProfile,
    });
```

Note: this also replaces `...(numOrders > 0 ? { num_orders: numOrders } : {})` with `num_orders: numOrders` since numOrders is now always 1 or 2.

Apply the same `num_orders: numOrders` simplification to the other two `onSearch` calls in the `useEffect` blocks (~lines 514-526 and ~lines 540-549). These also need the 4 new filter params spread in.

- [ ] **Step 4: Add the new filters to fireSearch dependencies**

Update the `useCallback` dependency array for `fireSearch`:

```typescript
  }, [origin, destination, departureDate, daysOut, numOrders, originRadius, destRadius, maxDeadheadPct, minDailyProfit, minRpm, maxInterlegDh, profileKey, onClearSearch]);
```

And add them to the auto-search `useEffect`:

```typescript
  }, [departureDate, daysOut, numOrders, originRadius, destRadius, maxDeadheadPct, minDailyProfit, minRpm, maxInterlegDh]);
```

- [ ] **Step 5: Remove "Any" (0) label from NumOrdersPill**

In the `NumOrdersPill` component, change the label logic:

```typescript
// OLD:
const label = value === 0 ? "Any" : `${value}`;

// NEW:
const label = `${value}`;
```

And in the button rendering inside the same component, remove the "Any" case:

```typescript
// OLD:
{n === 0 ? "Any" : String(n)}

// NEW:
{String(n)}
```

- [ ] **Step 6: Add 4 filter dropdowns to AllFiltersPopover**

In the `AllFiltersPopover` component, add a new "Route Quality" section at the end of the `<div className="space-y-5">` container, after the "Certifications" section and before the closing `</div>`:

The `AllFiltersPopover` is a self-contained component that manages its own state and saves to settings. However, the route quality filters are session-only (not saved to DynamoDB) — they need to be lifted to `SearchFilters` state. The simplest approach: pass them as props.

First, update `AllFiltersPopover` to accept the filter state:

```typescript
function AllFiltersPopover({
  maxDeadheadPct, setMaxDeadheadPct,
  minDailyProfit, setMinDailyProfit,
  minRpm, setMinRpm,
  maxInterlegDh, setMaxInterlegDh,
}: {
  maxDeadheadPct: number | undefined;
  setMaxDeadheadPct: (v: number | undefined) => void;
  minDailyProfit: number | undefined;
  setMinDailyProfit: (v: number | undefined) => void;
  minRpm: number | undefined;
  setMinRpm: (v: number | undefined) => void;
  maxInterlegDh: number | undefined;
  setMaxInterlegDh: (v: number | undefined) => void;
}) {
```

Then update the call site in the desktop layout:

```typescript
<AllFiltersPopover
  maxDeadheadPct={maxDeadheadPct} setMaxDeadheadPct={setMaxDeadheadPct}
  minDailyProfit={minDailyProfit} setMinDailyProfit={setMinDailyProfit}
  minRpm={minRpm} setMinRpm={setMinRpm}
  maxInterlegDh={maxInterlegDh} setMaxInterlegDh={setMaxInterlegDh}
/>
```

Update the `activeCount` calculation to include the new filters:

```typescript
  const activeCount = [
    trailerLabels.length > 0,
    maxWeight !== "",
    hazmat,
    twic,
    team,
    noTarps,
    maxDeadheadPct != null,
    minDailyProfit != null,
    minRpm != null,
    maxInterlegDh != null,
  ].filter(Boolean).length;
```

Add the Route Quality section inside the popover content, after the Certifications section:

```tsx
          {/* Route Quality */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Route Quality</p>
            <div className="space-y-3">
              {/* Max Deadhead % */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Max DH %</span>
                <select
                  value={maxDeadheadPct ?? ''}
                  onChange={(e) => setMaxDeadheadPct(e.target.value ? Number(e.target.value) : undefined)}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Any</option>
                  {MAX_DEADHEAD_PCT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {/* Min $/Day */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Min $/Day</span>
                <select
                  value={minDailyProfit ?? ''}
                  onChange={(e) => setMinDailyProfit(e.target.value ? Number(e.target.value) : undefined)}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Any</option>
                  {MIN_DAILY_PROFIT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {/* Min Rate/Mile */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Min $/Mi</span>
                <select
                  value={minRpm ?? ''}
                  onChange={(e) => setMinRpm(e.target.value ? Number(e.target.value) : undefined)}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Any</option>
                  {MIN_RPM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {/* Max Between-Load DH */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Max DH Between</span>
                <select
                  value={maxInterlegDh ?? ''}
                  onChange={(e) => setMaxInterlegDh(e.target.value ? Number(e.target.value) : undefined)}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Any</option>
                  {MAX_INTERLEG_DEADHEAD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
```

- [ ] **Step 7: Verify dev build**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
npm run build
```

Expected: Clean build, no type errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
git add src/features/routes/components/search-form.tsx src/core/hooks/use-routes.ts
git commit -m "feat: add route quality filter dropdowns, remove Any/3 from num orders"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 2: Run frontend build**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
npm run build
```

Expected: Clean build.

- [ ] **Step 3: Verify no remaining references to 3-order or "Any" order count**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
grep -r "numOrders > 0" src/ || echo "Clean"
grep -r "n === 0" src/features/routes/components/search-form.tsx || echo "Clean"
```

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
grep -r "routeSolver\|RouteSolver" api/src/routes/route-search.service.ts || echo "Clean"
grep -r "num_orders.*null" api/src/routes/route-search.engine.ts || echo "Clean"
```

Expected: All grep checks return "Clean".
