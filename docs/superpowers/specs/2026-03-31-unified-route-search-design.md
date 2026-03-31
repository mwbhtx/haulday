# Unified Route Search Pipeline — Design Spec

## Goal

Replace the two divergent route search services (`routes.service.ts` and `round-trip.service.ts`) with a single, clean pipeline that can be called from an HTTP handler or a future background worker. Remove the one-way/round-trip distinction — a search either has a destination or it doesn't.

## Context

The current codebase has two separate search endpoints with duplicated logic, different feature sets, and inconsistent behavior:
- One-way is missing driver profile filters (hazmat, TWIC, team, weight)
- Round-trip hardcodes a 500-mile search radius
- `suggested_departure` is missing from 2-leg round trips
- `depart_by` is computed but never used in one-way search
- `getTimingSlack` pre-filter duplicates work the simulator already does
- `specMiles` is threaded through everywhere but always 0
- `firm_profit` and `estimated_total_profit` are always the same value
- `local-to-utc.ts` exists only to support time params we're removing

This spec unifies everything into one pipeline with one input type, one output type, and one code path.

## Architecture Constraint

The pipeline must be a callable function — not coupled to HTTP. A future background worker (Phase 2: pre-computation on order ingest) will call the same function with the same input type.

---

## Endpoint

`GET /routes/:companyId/search`

Replaces both `/routes/:companyId/search` and `/routes/:companyId/search-round-trip`.

### Required Parameters

| Param | Type | Description |
|-------|------|-------------|
| `origin_lat` | number | Driver's current/starting latitude |
| `origin_lng` | number | Driver's current/starting longitude |
| `departure_date` | string (YYYY-MM-DD) | When the driver wants to leave |

### Optional Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `destination_lat` | number | — | Where the driver wants to end up |
| `destination_lng` | number | — | (omit for no destination) |
| `search_radius_miles` | number | 150 | Max deadhead to pickup, capped at 500 by backend |
| `legs` | number | 1 | Number of loads to chain (1-3) |
| `max_deadhead_pct` | number | — | Max deadhead as % of total miles |
| `max_layover_hours` | number | — | Max idle time between legs |
| `max_trip_days` | number | 10 | Max trip duration in days |
| `trailer_types` | string (pipe-delimited) | from settings | Trailer type filter |
| `max_weight` | number | from settings | Max load weight |
| `hazmat_certified` | boolean | from settings | Can haul hazmat |
| `twic_card` | boolean | from settings | Has TWIC card |
| `team_driver` | boolean | from settings | Team driver |
| `cost_per_mile` | number | — | Flat cost override (skips detailed model) |
| `diesel_price_per_gallon` | number | from settings | Fuel cost |
| `maintenance_per_mile` | number | from settings | Maintenance cost |
| `tires_per_mile` | number | from settings | Tire cost |
| `truck_payment_per_day` | number | from settings | Daily truck payment |
| `insurance_per_day` | number | from settings | Daily insurance |
| `per_diem_per_day` | number | from settings | Daily per diem |
| `avg_mpg` | number | from settings | Average fuel economy |
| `avg_driving_hours_per_day` | number | from settings | Target driving hours (6-11) |
| `work_start_hour` | number | from settings (default 6) | Daily work start |
| `work_end_hour` | number | from settings (default 16) | Daily work end |

### Removed Parameters

- `depart_by_time` — work hours handle this
- `home_by`, `home_by_time` — destination + work hours handle this
- `risk` — removed entirely
- `origin_city`, `origin_state` — not needed for search logic

---

## Pipeline Steps

### Step 1: Resolve Config

Merge query params → user settings (DynamoDB) → haulvisor-core defaults into a single typed config object. This includes cost model, driver profile, and work hours.

**Function:** `resolveSearchConfig(query, userSettings) → SearchConfig`

### Step 2: Compute Departure Timestamp

Convert `departure_date` + `work_start_hour` into a Unix ms timestamp.

**Rules:**
- If `departure_date` is today and now < `work_end_hour` → `max(now, work_start_hour)` today
- If `departure_date` is today and now >= `work_end_hour` → `work_start_hour` tomorrow
- If `departure_date` is in the future → `work_start_hour` on that date

**Function:** `computeDepartureTimestamp(departureDate, workStartHour, workEndHour) → number`

Note: All timestamps are UTC. No timezone conversion needed — `departure_date` is a date the driver picks in their local context, and `work_start_hour` is their local work schedule. The simulation only needs relative elapsed time from the departure timestamp, and pickup/delivery windows from orders are already stored as UTC.

### Step 3: Query Candidates

SQL query with:
- `ST_DWithin` radius filter (search_radius_miles, capped at 500)
- `order_status = 'open'`
- All four date fields non-null
- Driver profile filters (trailer type, hazmat, TWIC, team, weight)
- **Pickup reachability pre-filter:** `pickup_date_late >= departure_timestamp + (deadhead_miles / avg_speed_mph) * interval`
- **No candidate limit** — the reachability filter scopes the result set

The same SQL is reused for each leg, anchored to the previous leg's delivery point. For legs 2+, the departure timestamp is estimated as `departure_timestamp + elapsed simulation time so far` (rough estimate for the SQL filter; the simulator is the authority).

**Function:** `queryCandidates(postgres, origin, radiusMeters, profile, departureTimestamp, avgSpeedMph) → OrderRow[]`

### Step 4: Build Chains

Enumerate candidate combinations for the requested leg count (1, 2, or 3). For each combination:

- Skip if any order appears twice
- Build a `TripLeg[]` array: deadhead → load segments → deadhead → load segments → ...
- If destination is provided and differs from the last delivery point, append a trailing deadhead leg to the destination
- No trailing deadhead if destination is not provided or matches the last delivery

**Function:** `buildTripLegs(orders, deadheadPerLeg, destination?) → TripLeg[]`

### Step 5: Simulate Each Chain

Call `simulateTrip()` from haulvisor-core with the full TripLeg array and work hours settings. The departure timestamp anchors the simulation to real wall-clock time.

- If `feasible === false` (any pickup/delivery window violated) → discard the chain
- The simulator is the **sole authority** on feasibility. No pre-filter.

### Step 6: Cost Each Chain

Call `calculateProfit()` from haulvisor-core with the chain's segments and cost model settings. Use `sim.summary.total_days` for calendar day costing. Apply the daily cost correction if simulator days exceed the cost model's estimate.

Single profit calculation — no firm/total distinction.

### Step 7: Apply Filters

- `max_deadhead_pct` — reject chains where deadhead % exceeds threshold
- `max_layover_hours` — reject chains where wait time between any two legs exceeds threshold (available from simulator phases)
- `max_trip_days` — reject chains exceeding trip day limit

### Step 8: Sort and Return

Sort by `daily_net_profit` descending. No result count limit for now (the SQL pre-filter and simulator keep the set manageable). Tag legs with top lane ranks.

---

## Unified Output Type

Replace both `RouteChain` and `RoundTripChain` in haulvisor-core with a single type:

```typescript
interface RouteChain {
  rank: number;
  total_pay: number;
  total_miles: number;
  total_deadhead_miles: number;
  estimated_deadhead_cost: number;
  profit: number;                        // replaces firm_profit / estimated_total_profit
  rate_per_mile: number;
  legs: RouteLeg[];
  deadhead_pct: number;
  effective_rpm: number;
  estimated_days: number;
  daily_net_profit: number;
  cost_breakdown: RouteCostBreakdown;
  timeline?: TripPhase[];
  trip_summary?: TripSimulationSummary;
  suggested_departure?: string;          // ISO 8601
}
```

The `RouteLeg` type unifies `RouteLeg` and `RoundTripLeg`:

```typescript
interface RouteLeg {
  leg_number: number;
  order_id: string;
  origin_city: string;
  origin_state: string;
  origin_lat: number;
  origin_lng: number;
  destination_city: string;
  destination_state: string;
  destination_lat: number;
  destination_lng: number;
  pay: number;
  miles: number;
  deadhead_miles: number;
  trailer_type?: string;
  weight?: number;
  pickup_date_early?: string;
  pickup_date_late?: string;
  delivery_date_early?: string;
  delivery_date_late?: string;
  tarp_height?: string;
  lane_rank?: number;
}
```

### Removed fields:
- `type: 'firm'` — all legs are firm, field is meaningless
- `risk_score` — removed
- `lane_confidence` — removed
- `timing_valid` — simulator handles this, not a per-leg field
- `firm_profit` / `estimated_total_profit` — collapsed to `profit`

---

## Code Structure

### New Files (backend)

| File | Purpose |
|------|---------|
| `api/src/routes/route-search.service.ts` | Unified service: `searchRoutes()` orchestrator |
| `api/src/routes/route-search.engine.ts` | Pure functions: `resolveSearchConfig`, `computeDepartureTimestamp`, `buildTripLegs`, `evaluateChain` |
| `api/src/routes/route-search.sql.ts` | `buildCandidatesSql`, `queryCandidates` — SQL logic isolated |
| `api/src/routes/route-search.engine.spec.ts` | Unit tests for pure functions |
| `api/src/routes/route-search.sql.spec.ts` | Tests for SQL builder |

### Removed Files (backend)

| File | Why |
|------|-----|
| `api/src/routes/routes.service.ts` | Replaced by `route-search.service.ts` |
| `api/src/routes/round-trip.service.ts` | Replaced by `route-search.service.ts` |
| `api/src/routes/round-trip.service.spec.ts` | Replaced by new tests |
| `api/src/routes/suggested-departure.ts` | Logic absorbed into `computeDepartureTimestamp` |
| `api/src/routes/local-to-utc.ts` | No more time params |
| `api/src/routes/dto/round-trip-search.dto.ts` | Replaced by unified DTO |

### Modified Files (backend)

| File | Change |
|------|--------|
| `api/src/routes/routes.controller.ts` | Remove round-trip endpoint, update search to use new service |
| `api/src/routes/routes.module.ts` | Update providers |
| `api/src/routes/dto/route-search.dto.ts` | Add all params (driver profile, cost model, departure_date) |

### Modified Files (haulvisor-core)

| File | Change |
|------|--------|
| `src/types/routes.ts` | Unified `RouteChain` and `RouteLeg` types |
| `src/types/round-trip.ts` | Delete — absorbed into `routes.ts` |
| `src/types/index.ts` | Remove round-trip re-export |

### Modified Files (frontend)

| File | Change |
|------|--------|
| `src/core/hooks/use-routes.ts` | Single search hook, no one-way/round-trip split |
| `src/features/routes/components/search-form.tsx` | Remove mode toggle, destination field instead |
| Mobile/desktop views | Update to use unified `RouteChain` type |

---

## Tests

### `route-search.engine.spec.ts`

**`resolveSearchConfig`:**
- Query params override user settings
- User settings override defaults
- Missing everything falls back to haulvisor-core defaults
- `search_radius_miles` capped at 500

**`computeDepartureTimestamp`:**
- Future date → work_start_hour on that date
- Today before work_end → max(now, work_start_hour)
- Today after work_end → tomorrow at work_start_hour
- Edge: departure_date is today, exactly at work_start_hour

**`buildTripLegs`:**
- Single order, no destination → load legs only, no trailing deadhead
- Single order with destination different from delivery → trailing deadhead appended
- Single order with destination same as delivery → no trailing deadhead
- Multi-leg → deadhead + load + deadhead + load pattern
- Order with stopoffs → split into segments

**`evaluateChain`:**
- Feasible chain → returns scored result
- Infeasible chain (window violation) → returns null
- Daily cost correction when simulator days > cost model estimate
- Deadhead % calculation includes trailing deadhead

### `route-search.sql.spec.ts`

**`buildCandidatesSql`:**
- Base query shape with no driver filters
- Trailer type filter adds correct SQL clause
- Hazmat/TWIC/team filters add exclusion clauses
- Weight filter adds parameterized clause
- Pickup reachability clause present

---

## Frontend Changes (high level)

- Remove one-way / round-trip mode toggle
- Single search form: origin (required), destination (optional, defaults to home base from settings), departure date (required, defaults to tomorrow)
- If user clears destination → no trailing deadhead in results
- If destination = origin → "round trip" behavior without calling it that
- Single API hook calling one endpoint
- All views consume unified `RouteChain` type

---

## What This Spec Does NOT Cover

- **Road distance integration** — Haversine remains for now. Swapping to Mapbox road distances is a separate spec.
- **Pre-computation on order ingest** — Phase 2. This spec ensures the pipeline is callable from a background worker, but doesn't build that worker.
- **Scoring/ranking model** — Currently sort by daily net profit. A composite scoring model is a separate concern.
- **Settings persistence fix** — `work_start_hour`/`work_end_hour` not being saved to DynamoDB is a separate bug fix.
