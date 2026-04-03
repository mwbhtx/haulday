# OR-Tools Route Solver Pipeline — Architecture & Session Notes

*Written April 2, 2026. Covers all changes made to the haulvisor pipeline during this session.*

---

## Overview

Haulvisor's route search works by finding chains of 1–3 freight orders that a driver can haul back-to-back within a trip budget (departure date + max days out). The pipeline has five stages:

```
User search request
  → SQL candidate query (PostGIS, time windows)
  → DynamoDB distance cache lookup (road miles + minutes)
  → OR-Tools TSPTW solver (finds feasible order sequences)
  → simulateTrip (precise HOS/profit validation per sequence)
  → Ranked results returned to frontend
```

Each stage is a separate Lambda or service. This document covers the full pipeline as it stands after today's session.

---

## Stage 1 — SQL Candidate Query

**File:** `haulvisor-backend/api/src/routes/route-search.sql.ts`

The SQL query fetches orders that are reachable from the driver's origin within the trip budget. Key filters applied:

- **Pickup reachability**: `pickup_date_late_utc >= departure_ts` — order hasn't expired
- **Forward reachability**: Order pickup must be reachable from origin by its late pickup window (haversine estimate at avg_speed_mph)
- **Backward reachability** (`$9`): Order's delivery must be reachable back to destination before `end_ts` — prevents fetching orders that would strand the driver too far away
- **ST_DWithin radius filter**: Limits pickup coordinates to within `search_radius_miles` of origin
- **Driver profile filters** (appended dynamically):
  - `hazmat IS NULL OR hazmat = FALSE` — excluded when driver not certified
  - `trailer_type = ANY($N)` — when trailer types specified
  - `weight IS NULL OR weight <= $N` — when max weight set
  - `tarp_height IS NULL` / tarp regex — when `no_tarps = true`
- **LIMIT 200** — caps result set size (`MAX_CANDIDATES_PER_LEG` constant)

**Assumption:** The SQL uses haversine (straight-line) distance for reachability estimates, which underestimates road distance. This means some candidates will fail the time window check in OR-Tools — that's intentional (OR-Tools uses actual road times from the distance cache).

---

## Stage 2 — DynamoDB Distance Cache

**Service:** `haulvisor-backend/api/src/routes/driving-distance.service.ts`  
**Lambda:** `haulvisor-distance-precompute-worker`  
**Table:** `haulvisor-distance-cache` (DynamoDB)

### Cache Key Format

```
v1:{lat_rounded_2dp},{lng_rounded_2dp}:{lat_rounded_2dp},{lng_rounded_2dp}
```

Example: `v1:41.88,-87.63:39.09,-84.51`

Coordinates are rounded to 2 decimal places (~1.1km precision) so nearby pickup/delivery points share cache entries.

**Must match** between TypeScript (`DrivingDistanceService.cacheKey`) and Python (`handler.py cache_key()`). Both round with `round(n * 100) / 100`.

### Cache Population

The `distance-precompute-worker` Lambda is triggered by the DynamoDB stream on the orders table (`dynamo-to-pg-orders-stream` Lambda). When a new order arrives or coordinates change, the worker pre-computes road distances for:
- Origin → pickup
- Delivery → destination
- All pickup-to-pickup and delivery-to-pickup pairs (for chaining)

### Cache Miss Fallback

When a pair isn't cached yet (new order, cold cache), `handler.py` falls back to haversine estimation:

```python
def haversine_minutes(lat1, lng1, lat2, lng2, speed_mph):
    # Straight-line miles / avg_speed → minutes
```

This is an underestimate (no road detours), so it makes OR-Tools slightly optimistic about reachability. Routes that pass OR-Tools with haversine times will be precisely validated by `simulateTrip` downstream.

---

## Stage 3 — OR-Tools TSPTW Solver

**Lambda:** `haulvisor-route-solver` (Docker/ECR, Python + OR-Tools)  
**File:** `haulvisor-backend/lambdas/route-solver/handler.py`

### What it does

Takes N order candidates and finds up to `max_solutions` (default 50) feasible sequences of 1–3 orders that a driver can complete within their trip budget, respecting each order's pickup time window.

### Input

```json
{
  "origin": { "lat": 41.88, "lng": -87.63 },
  "destination": { "lat": 41.88, "lng": -87.63 },
  "departure_ts": 1743600000000,
  "end_ts": 1744204800000,
  "candidates": [{ "order_id": "...", "origin_lat": ..., "pickup_date_early_utc": "...", ... }],
  "distances": { "v1:41.88,-87.63:39.09,-84.51": { "miles": 302, "duration_minutes": 330 } },
  "avg_speed_mph": 55,
  "loading_buffer_minutes": 270,
  "max_solutions": 50,
  "min_legs": 1,
  "max_legs": 3
}
```

### The TSPTW Model

OR-Tools models this as a **Vehicle Routing Problem with Time Windows (VRPTW)** with one vehicle (the driver).

**Nodes:**
- Node 0: Start depot (driver's origin). Time window = (0, 0) — departs exactly at minute 0.
- Nodes 1..N: Each candidate order. Time window = order's pickup window expressed in minutes from departure.
- Node N+1: End depot (driver's destination). Time window = (0, end_minutes).

**Time dimension:**
- `time_callback(from, to)` = `time_matrix[from][to] + service_times[from]`
- `time_matrix[i][j]` = road minutes from delivery point of order i to pickup of order j (or from origin/to destination for depot nodes)
- `service_times[node]` = `loading_buffer_minutes + (order_miles / avg_speed_mph * 60)` — time spent picking up, hauling, and delivering the order

**The disjunction fix (critical):**

Without disjunctions, OR-Tools treats this as a standard TSP and tries to visit **all N nodes** in one route. With 59–144 candidates (each requiring 800+ minutes of service), no feasible all-nodes solution exists → 0 sequences returned on every search.

The fix adds an optional flag to each order node:

```python
DROP_PENALTY = max_time * 10  # very large — strongly prefer visiting
for i in range(N):
    routing.AddDisjunction([manager.NodeToIndex(i + 1)], DROP_PENALTY)
```

This makes each order node *optional* — OR-Tools can skip it with a large penalty. The penalty is large enough that OR-Tools will include nodes whenever their time windows allow, but will drop them rather than declare infeasible. This turns the problem from "find a route visiting all N orders" to "find the best subset of orders that fits in the trip budget."

**The capacity fix:**

A counter dimension caps routes at `max_legs` orders:

```python
def order_count_callback(from_index):
    return 1 if 1 <= manager.IndexToNode(from_index) <= N else 0

routing.AddDimensionWithVehicleCapacity(count_idx, 0, [max_legs], True, "Orders")
```

This prevents OR-Tools from chaining 10+ orders in a single "solution" — each sequence is capped at 3 orders (or the user's selected count).

**Solution collection:**

```python
def on_solution():
    # Walk the route and collect order_ids
    if len(seq) >= min_legs:
        collected.append(seq)
    if len(collected) >= max_solutions:
        routing.solver().FailSearch()  # stop after collecting enough
```

`FailSearch()` terminates the search once `max_solutions` have been collected. Each OR-Tools solution callback fires when a new feasible route is found during local search.

**Solver parameters:**
- First solution strategy: `PATH_CHEAPEST_ARC` — builds initial solution greedily
- Metaheuristic: `GUIDED_LOCAL_SEARCH` — explores neighborhood to find diverse sequences
- Time limit: 4 seconds

**Assumption:** The solver finds diverse sequences by exploring the solution space during guided local search. The sequences are not ranked by OR-Tools — ranking happens in `simulateTrip` (Stage 4). OR-Tools just needs to find enough feasible sequences to give `simulateTrip` good candidates to work with.

### min_legs / max_legs

`min_legs` and `max_legs` come from the `num_orders` query parameter (see Frontend section). When `num_orders` is null/0 (Any): `min_legs=1, max_legs=3`. When set to 1/2/3: `min_legs=max_legs=num_orders` — only exact-length chains are returned.

### Deployment

- Docker image built with `--provenance=false` flag (prevents BuildKit from creating an OCI manifest list, which Lambda doesn't support — Lambda requires Docker v2 Schema 2 manifests)
- Image pushed to ECR (`haulvisor-route-solver`)
- Lambda configured with `image_uri`, 1024MB memory, 30s timeout

---

## Stage 4 — simulateTrip (HOS/Profit Validation)

**File:** `haulvisor-backend/api/src/routes/route-search.engine.ts`

For each sequence OR-Tools returns, `simulateTrip` runs a precise simulation:

- Drives from origin to pickup 1, observing HOS (11-hour driving / 14-hour on-duty limits)
- Picks up order, hauls to delivery, picks up order 2 (if any), etc.
- Tracks wall-clock time, driving hours, on-duty hours
- Applies HOS rest breaks (10-hour sleeper berth when limits hit)
- Calculates profit: `total_pay - (deadhead_cost + fuel_cost + maintenance + tires + truck_payment_per_day * estimated_days + ...)`
- Returns `EvaluatedChain` with profit, daily net profit, rate/mile, deadhead %, timeline

Only chains that pass HOS validation (delivery before `end_ts`, no impossible driving) are returned.

**Cost model inputs** (from `CostModelSettings` in haulvisor-core):
- `cost_per_mile` — aggregated variable cost (fuel, tires, maintenance rolled together or separate)
- `avg_driving_hours_per_day` — affects estimated trip days
- `avg_speed_mph` — affects drive time estimates

---

## Stage 5 — Search Config Resolution

**File:** `haulvisor-backend/api/src/routes/route-search.engine.ts` → `resolveSearchConfig()`

Query parameters take precedence over user settings, which take precedence over hardcoded defaults. The `pick()` helper implements this:

```typescript
const pick = <T>(key: string, fallback: T): T =>
  (q<T>(key) ?? s<T>(key) ?? fallback);
```

Key defaults:
| Parameter | Default | Source |
|-----------|---------|--------|
| `search_radius_miles` | 250 miles | `DEFAULT_SEARCH_RADIUS` (capped at 500) |
| `max_trip_days` | 10 days | `DEFAULT_MAX_TRIP_DAYS` |
| `avg_speed_mph` | 55 mph | `DEFAULT_AVG_SPEED_MPH` |
| `work_start_hour` | 6 (6 AM) | `DEFAULT_WORK_START_HOUR` |
| `work_end_hour` | 20 (8 PM) | `DEFAULT_WORK_END_HOUR` |
| `max_idle_hours` | 0 (any) | opt-in via settings |
| `num_orders` | null (any) | user-selectable |

`num_orders: null` means "any count 1–3, let OR-Tools decide." `num_orders: 1/2/3` is an exact filter.

---

## Frontend Filter: Number of Orders

**Desktop:** `search-form.tsx` — `NumOrdersPill` component in the filter bar  
**Mobile:** `filters-sheet.tsx` — "Number of Orders" FilterRow  
**Hook:** `use-routes.ts` — `num_orders?: number` in `RouteSearchParams`

The filter is an "Any / 1 / 2 / 3" selector:
- **Any (0)** — default, OR-Tools finds chains of any length 1–3
- **1** — only single-order routes returned
- **2** — only 2-order chains
- **3** — only 3-order chains

`0` is never sent to the API (omitted from the query string). Values 1–3 are sent as `?num_orders=N`.

**Terminology clarification:** These are "orders" (freight loads), not "legs." A single order can itself have multiple stopoffs (e.g., multi-stop delivery), but the filter controls how many separate orders are chained together in a back-to-back trip.

The filter state is persisted to `sessionStorage` under `hv-route-filters` so it survives page refreshes.

---

## Infrastructure Changes

### ECR + Lambda Bootstrap Problem

The Terraform configuration for `haulvisor-route-solver` has an important ordering dependency:

1. ECR repository must exist before Lambda can reference it
2. Lambda needs an image to exist in ECR at creation time (Lambda Docker functions can't be created with an empty repo)
3. The GitHub deploy role needed `ecr:*` permissions before it could create the ECR repo via Terraform

**Solution implemented:**
- Added `ecr:*` to `github_deploy` IAM policy in `github-oidc.tf`
- Added `depends_on = [aws_iam_role_policy.github_deploy]` to the ECR resource in `lambda-route-solver.tf` (ensures IAM propagates before ECR creation)
- First image was pushed manually locally before Terraform created the Lambda function

**Important gotcha:** IAM session tokens are cached during a GitHub Actions run. Updating a role's own policy in Terraform doesn't take effect in the same run (the session token was issued with old permissions). The fix was to run `aws iam put-role-policy` manually before triggering the CI run that creates the ECR/Lambda resources.

### Docker Manifest Format

Lambda requires Docker v2 Schema 2 manifests. BuildKit's default multi-platform build produces an OCI manifest index, which Lambda rejects with `InvalidParameterValueException: Source image ... does not exist`.

**Fix:** Build with `--provenance=false`:

```bash
docker build --platform linux/amd64 --provenance=false -t ${ECR_URI}:latest .
```

This disables BuildKit's attestation manifest and produces a plain Docker v2 manifest (size ~2076 bytes). The OCI format produces a manifest list (size ~856 bytes) that Lambda can't pull.

### VPC Config Bug

`lambda-distance-precompute.tf` had a `vpc_config` block referencing `data.aws_subnets.private` — a data source that was never defined. The RDS instance uses `publicly_accessible = true`, so the Lambda doesn't need VPC access. The `vpc_config` block was removed.

---

## haulvisor-core Package Changes

**Repo:** `github.com/mwbhtx/haulvisor-core`  
**Version at end of session:** v1.6.43

Changes made to `src/search-defaults.ts`:

```typescript
// Added:
export const ORDER_COUNT_OPTIONS = [0, 1, 2, 3] as const;
export const DEFAULT_NUM_ORDERS = 0;

// Removed (OR-Tools determines chain length from time windows — no need for UI control over this):
// export const MAX_LEGS = 3;
// export const LEG_OPTIONS = [1, 2, 3] as const;
// export const DEFAULT_LEGS_ROUND_TRIP = 2;
// export const DEFAULT_LEGS_ONE_WAY = 1;
```

The `LEG_OPTIONS` / `MAX_LEGS` constants were removed because OR-Tools with the disjunction + capacity approach handles chain length automatically. `ORDER_COUNT_OPTIONS` replaces them with an "Any" option (0) as the default, meaning the solver decides.

---

## Backend API Changes Summary

### `route-search.dto.ts`
Added `num_orders?: number` (1–3, optional). When omitted → any chain length.

### `route-search.engine.ts`
- Added `num_orders: number | null` to `SearchConfig` interface
- `resolveSearchConfig` reads `num_orders` from query params only (not from user settings — it's a per-search parameter, not a stored preference)

### `route-search.service.ts`
- Passes `min_legs: config.num_orders ?? 1` and `max_legs: config.num_orders ?? 3` to route solver

### `route-search.sql.spec.ts`
Tests updated:
- `"should have a LIMIT 200 clause"` — checks `LIMIT` anywhere in SQL (not `LIMIT 200` specifically, since OR-Tools handles count)
- `"should include backward reachability filter"` — checks for `$9` (the `end_ts` parameter for return-trip feasibility)
- `"should allow hazmat when certified"` — checks `not.toContain('hazmat IS NULL OR hazmat = FALSE')` instead of checking for absence of `hazmat` (the SELECT always includes `hazmat` as a column)

### `route-search.service.ts` — `orderToLeg`
Added `stopoffs: row.stopoffs ?? undefined` — stopoff data from SQL is now passed through to `TripLeg`, so multi-stop orders show their intermediate stops in the route detail UI.

### Removed `avg_mpg` from DTO and frontend
`avg_mpg` was in the DTO and frontend driver profile but was never used in `CostModelSettings` or any cost calculation. Removed as dead code.

---

## GitHub Actions CI Changes

Added two new deploy jobs to `haulvisor-backend/.github/workflows/deploy.yml`:

**`deploy-distance-precompute-worker`** — Standard Node.js Lambda zip deployment (same pattern as other lambdas):
```yaml
cd lambdas/distance-precompute-worker
npm run build
cd dist && zip -r ../lambda.zip .
aws lambda update-function-code --function-name haulvisor-distance-precompute-worker --zip-file ...
```

**`deploy-route-solver`** — Docker/ECR deployment:
```yaml
docker build -t $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG -t ...:latest .
docker push $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG
docker push $ECR_REGISTRY/$ECR_REPO:latest
aws lambda update-function-code --function-name haulvisor-route-solver --image-uri ...:$IMAGE_TAG
```

Note: The CI build uses `$IMAGE_TAG = ${{ github.sha }}` (specific commit SHA) for the Lambda update, but also pushes `:latest` for the initial bootstrap case. The Lambda `ignore_changes = [image_uri]` Terraform lifecycle rule means Terraform doesn't overwrite the Lambda's image URI after CI deploys it.

---

## Key Assumptions & Gotchas

1. **OR-Tools time unit is minutes** (not seconds, not milliseconds). All times are in minutes from departure. `departure_ts` and `end_ts` are epoch milliseconds from the TypeScript side, converted to minutes by `ts_ms_to_minutes`.

2. **Service time includes the haul itself.** `service_times[node] = loading_buffer_minutes + (order_miles / avg_speed_mph * 60)`. The 270-minute `loading_buffer_minutes` covers pickup wait, loading, delivery window, and unloading. This means the time window constraint is: "arrive at pickup between early and late, then service_time elapses before you arrive at the next order's pickup."

3. **OR-Tools finds sequences; simulateTrip ranks them.** OR-Tools optimizes for "minimize total time at end depot" (i.e., get home fastest). It does not optimize for profit. Profit ranking happens entirely in `simulateTrip`.

4. **The distance cache is eventually consistent.** New orders start with haversine estimates until the precompute worker populates real road distances. Searches during this window may have slightly inflated viability (haversine < road distance), but `simulateTrip` will apply HOS correctly based on the actual road distance stored on the order.

5. **Disjunction penalty scale matters.** `DROP_PENALTY = max_time * 10`. If this is too low, OR-Tools will happily drop nodes to minimize the "penalty + cost" objective, returning many single-order routes. If too high relative to the time objective, it functions identically to no disjunction (infeasible). `max_time * 10` is well above any real transit cost but below infinity.

6. **`num_orders` is a search filter, not a user setting.** It's intentionally not stored in user settings (unlike trailer type, hazmat, etc.). It defaults to "Any" on every fresh search.

7. **ECR lifecycle policy keeps last 5 images.** Older Docker images are automatically expired. The `:latest` tag always points to the most recent push. Lambda update-function-code uses the specific SHA tag so CI deploys are deterministic even if `:latest` changes mid-deploy.
