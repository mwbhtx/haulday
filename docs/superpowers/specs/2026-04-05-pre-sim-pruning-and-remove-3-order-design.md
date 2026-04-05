# Pre-Simulation Pruning Filters & Remove 3-Order Routes — Design Spec

## Goals

1. **Pre-simulation pruning:** Add four configurable filters that eliminate unprofitable or undesirable route pairs _before_ calling `simulateTrip()`, cutting compute by 50-80%. Applied in two stages: fast arithmetic pre-sim, exact thresholds post-sim.
2. **Remove 3-order routes:** Strip all 3-order logic from backend, frontend, and core. Simplify `ORDER_COUNT_OPTIONS` to `[1, 2]`. Punt 3-order support for at least a year.

## Context

The 2-order search enumerates up to 19,900 candidate pairs and runs a full HOS-compliant `simulateTrip()` on each. Many pairs are obviously bad — high deadhead, low pay, unprofitable at any speed. Currently nothing filters these before simulation.

The 3-order path delegates to OR-Tools but is unused in practice and adds complexity. Removing it simplifies the codebase and focuses effort on making 1- and 2-order routes excellent.

---

## Part 1: Pre-Simulation Pruning Filters

### New Query Parameters

| Param | Type | Range | Default | Description |
|-------|------|-------|---------|-------------|
| `max_deadhead_pct` | number | 0–100 | none (Any) | Max deadhead as % of total miles |
| `min_daily_profit` | number | ≥ 0 | none (Any) | Minimum $/day to include |
| `min_rpm` | number | ≥ 0 | none (Any) | Minimum gross rate per mile (pay / total miles) |
| `max_interleg_deadhead_miles` | number | 1–500 | 500 | Max deadhead between order A delivery → order B pickup |

All default to "Any" (no filter applied) so existing behavior is unchanged when params are omitted.

### Frontend Dropdown Options

Placed inside the existing advanced filters popover in `search-form.tsx`.

**Max Deadhead %:**

| Value | Label |
|-------|-------|
| 25 | 25% |
| 30 | 30% |
| 35 | 35% |
| 40 | 40% |
| 45 | 45% |
| 50 | 50% |
| undefined | Any |

**Min $/Day:**

| Value | Label |
|-------|-------|
| 100 | $100 |
| 200 | $200 |
| 300 | $300 |
| 400 | $400 |
| 500 | $500 |
| undefined | Any |

**Min Rate/Mile:**

| Value | Label |
|-------|-------|
| 1.00 | $1.00 |
| 1.50 | $1.50 |
| 2.00 | $2.00 |
| 2.50 | $2.50 |
| 3.00 | $3.00 |
| undefined | Any |

**Max Deadhead Between Loads:**

| Value | Label |
|-------|-------|
| 50 | 50 mi |
| 100 | 100 mi |
| 150 | 150 mi |
| 200 | 200 mi |
| 300 | 300 mi |
| 500 | 500 mi |
| undefined | Any (500 mi cap) |

All dropdowns default to "Any" (rightmost/last option). When "Any" is selected, the param is omitted from the query string.

### Backend: Two-Stage Filtering

#### Stage 1 — Pre-Simulation (fast arithmetic, no simulation cost)

Applied in the 2-order pair loop in `route-search.service.ts`, before adding a pair to `sequences`. Uses data already available: order pay, order miles, haversine × ROAD_CORRECTION_FACTOR deadhead.

For each candidate pair (order A, order B):

```
originDeadhead = haversine(origin, A.pickup) × ROAD_CORRECTION_FACTOR
interlegDeadhead = haversine(A.delivery, B.pickup) × ROAD_CORRECTION_FACTOR
totalDeadhead = originDeadhead + interlegDeadhead
totalLoaded = A.miles + B.miles
totalMiles = totalLoaded + totalDeadhead
totalPay = A.pay + B.pay
```

**Checks (skip pair if any fail):**

1. **max_interleg_deadhead_miles:** `interlegDeadhead > threshold` → skip. Replaces the current hardcoded 500mi cap.

2. **max_deadhead_pct:** `(totalDeadhead / totalMiles) × 100 > threshold` → skip.

3. **min_rpm:** `totalPay / totalMiles < threshold` → skip.

4. **min_daily_profit:** Use `quickNetProfit(totalPay, totalLoaded, totalDeadhead, cost_per_mile)` for fast net profit estimate. Rough day estimate: `totalMiles / (avg_speed_mph × avg_driving_hours_per_day)`, minimum 1. If `quickProfit / roughDays < threshold` → skip.

The pre-sim estimates are intentionally conservative (haversine underestimates road miles, rough day estimate is optimistic). A pair that fails these loose checks will definitely fail the exact post-sim check. A pair that barely passes may still be filtered post-sim — that's fine, the goal is to eliminate the obvious losers cheaply.

#### Stage 2 — Post-Simulation (exact values from simulator)

After `evaluateChain()` returns a scored `EvaluatedChain`, apply exact thresholds:

- `chain.deadhead_pct > max_deadhead_pct` → discard
- `chain.daily_net_profit < min_daily_profit` → discard
- `chain.rate_per_mile < min_rpm` → discard

Inter-leg deadhead does not need a post-sim check — it was already precise from the distance matrix used in pre-sim.

#### Single-Order Routes (num_orders = 1)

Pre-sim pruning is simpler for single-order routes since there is no inter-leg deadhead. Apply:

- **max_deadhead_pct:** `originDeadhead / (order.miles + originDeadhead) × 100 > threshold` → skip candidate
- **min_rpm:** `order.pay / (order.miles + originDeadhead) < threshold` → skip
- **min_daily_profit:** Same quick estimate with single order values

Post-sim filters apply identically.

### haulvisor-core Changes

**`src/search-defaults.ts`** — Add:

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

Export these from `src/index.ts`.

---

## Part 2: Remove 3-Order Route Support

### haulvisor-core

**`src/search-defaults.ts`:**
- Change `ORDER_COUNT_OPTIONS` from `[0, 1, 2, 3] as const` to `[1, 2] as const`
- Remove any comments referencing 3-order or "Any" behavior

### haulvisor-backend

**`api/src/routes/dto/route-search.dto.ts`:**
- Change `num_orders` validation: `@Min(1) @Max(2)` (was `@Max(3)`)

**`api/src/routes/route-search.service.ts`:**
- Remove the `else` branch (lines 172-198) that delegates to `this.routeSolver.solve()` for `num_orders >= 3`
- Clamp `num_orders` to max 2 in case an old client sends 3: `config.num_orders = Math.min(config.num_orders ?? 2, 2)`
- Remove `RouteSolverService` from constructor injection if it's only used for 3-order routes

**`api/src/routes/route-search.engine.ts`:**
- `SearchConfig.num_orders` type changes from `number | null` to `1 | 2`
- `resolveSearchConfig`: default `num_orders` to 2, clamp to max 2, no null
- `computeTierLimits`: remove the `numOrders: null` (Any) case — always 1 or 2

### haulvisor (frontend)

**`src/features/routes/components/search-form.tsx`:**
- Remove "Any" (0) and "3" from the num orders selector
- Only show options for 1 and 2
- Default remains 2

---

## File Changes

### haulvisor-core (publish first)

| File | Change |
|------|--------|
| `src/search-defaults.ts` | `ORDER_COUNT_OPTIONS = [1, 2]`, add 4 filter option arrays and `DEFAULT_MAX_INTERLEG_DEADHEAD_MILES` |
| `src/index.ts` | Export new constants |

### haulvisor-backend

| File | Change |
|------|--------|
| `api/src/routes/dto/route-search.dto.ts` | Add 4 new optional params (`max_deadhead_pct`, `min_daily_profit`, `min_rpm`, `max_interleg_deadhead_miles`), change `num_orders` max to 2 |
| `api/src/routes/route-search.service.ts` | Pre-sim pruning in 2-order pair loop using new thresholds, post-sim filtering on scored chains, remove OR-Tools branch, clamp num_orders to 2 |
| `api/src/routes/route-search.engine.ts` | Add filter fields to `SearchConfig`, update `resolveSearchConfig` to accept new params, change `num_orders` type to `1 \| 2`, remove null/Any handling from `computeTierLimits` |

### haulvisor (frontend)

| File | Change |
|------|--------|
| `src/features/routes/components/search-form.tsx` | 4 new dropdowns in advanced filters popover, remove "Any"/3 from num orders selector |
| `src/core/hooks/use-routes.ts` | Add 4 new optional params to `RouteSearchParams` |

### Build Order

1. haulvisor-core — publish new version
2. `npm update @mwbhtx/haulvisor-core` in backend and frontend
3. haulvisor-backend — deploy
4. haulvisor — deploy

---

## What This Spec Does NOT Cover

- **Road distance replacement** — haversine × 1.3 remains for pre-sim estimates. OpenRouteService integration is a separate spec.
- **Pre-computation on order ingest** — Phase 2 architecture. This spec ensures filters work with live search.
- **Persisting filter preferences to DynamoDB** — these filters use session state only for now. Persistence is a separate concern.
- **`work_start_hour` / `work_end_hour` DynamoDB persistence bug** — separate fix.
- **OR-Tools removal** — if `RouteSolverService` is used elsewhere, it stays. We only remove the 3-order call path.
