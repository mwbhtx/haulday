# Async Brute-Force Route Search — Design Spec

## Goal

Replace the radius-based, tier-heuristic search with a brute-force approach that checks every open order in the database. The simulator is the sole feasibility authority — no geographic radius, no tier ranking, no candidate caps. If two orders can be feasibly chained within the driver's time constraints, they appear in results.

## Why

The current pipeline has multiple heuristic layers (radius filter, tier ranking, candidate pool cap, leg-2 candidate query) that can silently exclude profitable routes. A $5/mile order 400 miles from origin paired with a nearby second order could be the best route available, but gets dropped because it's outside the pickup radius or didn't make the tier cut. By removing all heuristic filters and letting the simulator decide, we eliminate an entire class of "missed route" bugs.

## Architecture

The search becomes async because checking every pair of open orders takes 10-60+ seconds depending on order volume. The flow:

1. **Client starts a search** → `POST /routes/:companyId/search` → returns `{ search_id }`
2. **Backend spawns a background job** in the same Node process
3. **Job pulls all open orders**, enumerates pairs, applies pre-sim arithmetic pruning, runs `simulateTrip()` on survivors
4. **Job yields to event loop** every N pairs via `setImmediate` to keep the server responsive
5. **Client polls for results** → `GET /routes/:companyId/search/:searchId` → returns status + progress + results when done

---

## Endpoints

### `POST /routes/:companyId/search`

Accepts the same `RouteSearchDto` body/query params as today. Returns immediately:

```json
{ "search_id": "uuid" }
```

### `GET /routes/:companyId/search/:searchId`

Returns current job state:

```json
{
  "status": "running",
  "progress": {
    "total_orders": 3200,
    "pairs_total": 450000,
    "pairs_checked": 125000,
    "pairs_pruned": 98000,
    "pairs_simulated": 27000,
    "routes_found": 42,
    "elapsed_ms": 8500
  }
}
```

When complete:

```json
{
  "status": "complete",
  "progress": { ... },
  "result": {
    "routes": [ ... ],
    "origin": { ... },
    "order_url_template": "..."
  }
}
```

On failure:

```json
{
  "status": "failed",
  "error": "description"
}
```

---

## SQL: Pull All Open Orders

Replace the tiered candidate query with a simple query that pulls every qualifying open order:

```sql
SELECT
  order_id, origin_city, origin_state, dest_city, dest_state,
  ST_Y(origin_point::geometry) AS origin_lat, ST_X(origin_point::geometry) AS origin_lng,
  ST_Y(dest_point::geometry) AS dest_lat, ST_X(dest_point::geometry) AS dest_lng,
  pay::real, miles::real, rate_per_mile::real, trailer_type, weight::real,
  stopoffs, tarp_height, hazmat, twic, team_load,
  pickup_date_early_utc, pickup_date_late_utc, delivery_date_early_utc, delivery_date_late_utc,
  pickup_date_early_local, pickup_date_late_local, delivery_date_early_local, delivery_date_late_local
FROM orders
WHERE company_id = $1
  AND order_status = 'open'
  AND origin_point IS NOT NULL
  AND dest_point IS NOT NULL
  AND pickup_date_early_utc IS NOT NULL
  AND pickup_date_late_utc IS NOT NULL
  AND delivery_date_early_utc IS NOT NULL
  AND delivery_date_late_utc IS NOT NULL
  AND pickup_date_late_utc >= to_timestamp($2::bigint / 1000.0)
  [driver profile filters: hazmat, twic, team, no_tarps, max_weight, trailer_types]
```

**What's removed vs current:**
- No `ST_DWithin` radius filter
- No tier ranking CTE
- No candidate pool cap
- No leg-2 candidate query
- No distance matrix pre-computation

**What stays:**
- `order_status = 'open'`
- All four date fields non-null
- `pickup_date_late_utc >= departure_timestamp` (order must be pickable up after departure)
- Driver profile filters (trailer type, hazmat, TWIC, team, weight, no tarps)

---

## Job Processing Pipeline

### For `num_orders = 1`:

```
for each order:
  originDh = haversine(origin, order.pickup) × 1.3
  pre-sim checks (max_deadhead_pct, min_rpm, min_daily_profit)
  if passes → simulateTrip() → post-sim filters → add to results
  yield every 1000 orders
```

### For `num_orders = 2`:

```
for each order A:
  originDh_A = haversine(origin, A.pickup) × 1.3
  for each order B (B ≠ A):
    time ordering check (B.pickup_late > A.delivery_early)
    interlegDh = haversine(A.delivery, B.pickup) × 1.3
    pre-sim checks (all 4 filters + quickNetProfit > 0)
    if passes → simulateTrip() → post-sim filters → add to results
  yield every 1000 pairs
```

### Chunking

After every 1,000 iterations (orders for single, pairs for 2-order):

```typescript
await new Promise(resolve => setImmediate(resolve));
```

This yields to the Node event loop so HTTP requests, health checks, and other searches are not blocked.

### Pre-sim pruning (same as current, applied before simulateTrip)

These are the 4 user-configurable filters plus a hard floor:

1. `quickNetProfit(totalPay, loadedMiles, deadheadMiles, cost_per_mile) <= 0` → skip (hard floor, always applied)
2. `max_deadhead_pct` → skip if deadhead % exceeds threshold
3. `min_rpm` → skip if gross RPM below threshold
4. `min_daily_profit` → skip if estimated daily profit below threshold
5. `max_interleg_deadhead_miles` → skip if inter-leg deadhead exceeds threshold (2-order only)

### Post-sim filtering (same as current, applied after simulateTrip)

1. `estimated_days > max_trip_days` → discard
2. `deadhead_pct > max_deadhead_pct` → discard
3. `daily_net_profit < min_daily_profit` → discard
4. `rate_per_mile < min_rpm` → discard

### Result sorting and cap

Sort by `daily_net_profit` descending. Return top 50 results (raised from 15 since we're doing more work to find them).

---

## Job Storage

In-memory `Map<string, SearchJob>` inside a `SearchJobStore` service:

```typescript
interface SearchJob {
  id: string;
  status: 'running' | 'complete' | 'failed';
  progress: SearchProgress;
  result?: RouteSearchResult;
  error?: string;
  created_at: number;
  completed_at?: number;
}

interface SearchProgress {
  total_orders: number;
  pairs_total: number;
  pairs_checked: number;
  pairs_pruned: number;
  pairs_simulated: number;
  routes_found: number;
  elapsed_ms: number;
}
```

**Cleanup:** Jobs older than 10 minutes are deleted on each new `POST` or `GET`. No persistence needed — if the server restarts, stale jobs are simply gone and the client starts a new search.

**Concurrency:** A user can only have one active search per company. Starting a new search cancels the previous one (sets a `cancelled` flag the worker checks each chunk).

---

## Frontend Changes

### `use-routes.ts`

Replace the single `useQuery` with a two-phase hook:

1. **Start search:** `useMutation` → `POST /routes/:companyId/search` → get `search_id`
2. **Poll for results:** `useQuery` with `refetchInterval: 1000` → `GET /routes/:companyId/search/:searchId`
   - While `status === 'running'`: keep polling, expose `progress` for UI
   - When `status === 'complete'`: stop polling, return `result`
   - When `status === 'failed'`: stop polling, return error

The hook's external interface stays the same: `{ data, isLoading, error }`. Callers don't need to know about the async internals.

### Search UI

While `status === 'running'`, show the progress info. Minimum viable: a text line like "Checking 125,000 / 450,000 pairs — 42 routes found" below the search bar. Can be enhanced to a progress bar later.

---

## File Changes

### Backend

| File | Action | Responsibility |
|------|--------|----------------|
| `api/src/routes/route-search.jobs.ts` | **Create** | `SearchJobStore` service — job map, cleanup, cancel. `runBruteForceSearch()` — the async worker function |
| `api/src/routes/route-search.sql.ts` | Modify | Add `buildAllOrdersSql()` — simple query with no radius/tiers |
| `api/src/routes/route-search.service.ts` | Modify | `startSearch()` returns search_id, `getSearchResult()` returns job state. Delegates to job store. |
| `api/src/routes/routes.controller.ts` | Modify | Add `POST /:companyId/search` and `GET /:companyId/search/:searchId` |
| `api/src/routes/routes.module.ts` | Modify | Add `SearchJobStore` to providers |
| `api/src/routes/dto/route-search.dto.ts` | No change | Same params |
| `api/src/routes/route-search.engine.ts` | No change | `evaluateChain`, `buildTripLegs` reused as-is |

### Frontend

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/hooks/use-routes.ts` | Modify | Replace single useQuery with start-mutation + polling-query pattern |
| `src/features/routes/components/search-form.tsx` | Minor | No structural change — `onSearch` still fires with same params |
| `src/features/routes/views/desktop/desktop-routes-view.tsx` | Modify | Show progress text while search is running |

### No changes to haulvisor-core

---

## What Gets Removed

- `buildTieredCandidatesSql()` — no longer called (can keep in file for reference or delete)
- `buildLeg2CandidatesSql()` — no longer called
- `computeTierLimits()` — no longer called
- `CANDIDATE_POOL` constant — no longer used
- Distance matrix (`buildDistanceMatrix()`) — deadhead is computed inline per pair
- The synchronous `search()` method in `route-search.service.ts` — replaced by `startSearch()` / `getSearchResult()`

## What Stays

- `evaluateChain()` — still the scoring function
- `buildTripLegs()` — still builds the simulator input
- `resolveSearchConfig()` — still resolves params from query + settings + defaults
- `computeDepartureTimestamp()` — still computes departure
- All pre-sim and post-sim filtering logic (just moved into the job worker)
- `orderToLeg()` — still maps DB rows to RouteLeg

---

## What This Spec Does NOT Cover

- **WebSocket streaming** — polling is simpler and sufficient for now. Can add SSE/WS later if poll latency matters.
- **Lambda offloading** — if search times grow beyond ~60s or multiple concurrent users cause event loop pressure, move the worker to a Lambda. The job store interface stays the same.
- **Result caching** — a completed search is stored in memory for 10 minutes. No persistent cache. If the user changes a filter, a new search starts.
- **3-order routes** — still removed. This spec only covers 1-order and 2-order brute-force.
