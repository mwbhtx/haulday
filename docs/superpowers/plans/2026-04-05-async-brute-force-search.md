# Async Brute-Force Route Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace radius-based heuristic search with async brute-force that checks every open order, using the simulator as the sole feasibility authority.

**Architecture:** Client POSTs to start a search (gets `search_id`), backend spawns an async job that pulls all open orders and enumerates pairs with `setImmediate` chunking. Client polls a GET endpoint for progress/results. The `useRouteSearch` hook is rewritten internally but keeps the same external interface (`data`, `isLoading`, `isFetched`).

**Tech Stack:** TypeScript, NestJS (backend), React Query (frontend), `@mwbhtx/haulvisor-core` (shared)

**Spec:** `docs/superpowers/specs/2026-04-05-async-brute-force-search-design.md`

---

## File Map

### Backend (`/Users/matthewbennett/Documents/GitHub/haulvisor-backend`)

| File | Action | Responsibility |
|------|--------|----------------|
| `api/src/routes/search-job.store.ts` | **Create** | In-memory job store: create, get, cancel, cleanup |
| `api/src/routes/search-job.worker.ts` | **Create** | Async brute-force worker: query all orders, enumerate pairs, pre-sim prune, simulate, yield between chunks |
| `api/src/routes/route-search.sql.ts` | Modify | Add `buildAllOrdersSql()` — simple query, no radius/tiers |
| `api/src/routes/route-search.service.ts` | Modify | Replace `search()` with `startSearch()` and `getSearchResult()` |
| `api/src/routes/routes.controller.ts` | Modify | Add `POST /:companyId/search` and `GET /:companyId/search/:searchId` |
| `api/src/routes/routes.module.ts` | Modify | Add `SearchJobStore` to providers |

### Frontend (`/Users/matthewbennett/Documents/GitHub/haulvisor`)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/hooks/use-routes.ts` | Modify | Rewrite to POST-start + poll-GET pattern, same external interface |
| `src/features/routes/views/desktop/desktop-routes-view.tsx` | Modify | Show progress text while searching |
| `src/features/routes/views/mobile/mobile-routes-view.tsx` | Modify | Show progress text while searching |

---

## Task 1: Backend — SearchJobStore service

**Files:**
- Create: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/search-job.store.ts`

- [ ] **Step 1: Create the job store**

```typescript
// api/src/routes/search-job.store.ts
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { RouteSearchResult } from '@mwbhtx/haulvisor-core';

export interface SearchProgress {
  total_orders: number;
  pairs_total: number;
  pairs_checked: number;
  pairs_pruned: number;
  pairs_simulated: number;
  routes_found: number;
  elapsed_ms: number;
}

export interface SearchJob {
  id: string;
  userId: string;
  companyId: string;
  status: 'running' | 'complete' | 'failed';
  progress: SearchProgress;
  result?: RouteSearchResult;
  error?: string;
  created_at: number;
  cancelled: boolean;
}

const JOB_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class SearchJobStore {
  private readonly jobs = new Map<string, SearchJob>();

  create(userId: string, companyId: string): SearchJob {
    // Cancel any existing job for this user + company
    for (const [id, job] of this.jobs) {
      if (job.userId === userId && job.companyId === companyId && job.status === 'running') {
        job.cancelled = true;
      }
    }

    this.cleanup();

    const job: SearchJob = {
      id: randomUUID(),
      userId,
      companyId,
      status: 'running',
      progress: {
        total_orders: 0,
        pairs_total: 0,
        pairs_checked: 0,
        pairs_pruned: 0,
        pairs_simulated: 0,
        routes_found: 0,
        elapsed_ms: 0,
      },
      created_at: Date.now(),
      cancelled: false,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): SearchJob | undefined {
    return this.jobs.get(id);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (now - job.created_at > JOB_TTL_MS) {
        this.jobs.delete(id);
      }
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git add api/src/routes/search-job.store.ts
git commit -m "feat: add SearchJobStore for async route search jobs"
```

---

## Task 2: Backend — Add buildAllOrdersSql to SQL module

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/route-search.sql.ts`

- [ ] **Step 1: Add the buildAllOrdersSql function**

Add this function at the end of `route-search.sql.ts`:

```typescript
/**
 * Build a simple query that pulls ALL qualifying open orders.
 * No radius filter, no tier ranking, no candidate cap.
 *
 * Params:
 *   $1 = company_id
 *   $2 = departure_ts (epoch ms)
 *   extraParams follow driver profile filters
 */
export function buildAllOrdersSql(
  profile: DriverProfile,
): {
  sql: string;
  extraParams: unknown[];
} {
  const conditions: string[] = [
    `company_id = $1`,
    `order_status = 'open'`,
    `origin_point IS NOT NULL`,
    `dest_point IS NOT NULL`,
    `pickup_date_early_utc IS NOT NULL`,
    `pickup_date_late_utc IS NOT NULL`,
    `delivery_date_early_utc IS NOT NULL`,
    `delivery_date_late_utc IS NOT NULL`,
    `pickup_date_late_utc >= to_timestamp($2::bigint / 1000.0)`,
  ];

  let paramIndex = 3;
  const extraParams: unknown[] = [];

  if (!profile.hazmat_certified) {
    conditions.push(`(hazmat IS NULL OR hazmat = FALSE)`);
  }
  if (!profile.twic_card) {
    conditions.push(`(twic IS NULL OR twic = FALSE)`);
  }
  if (!profile.team_driver) {
    conditions.push(`(team_load IS NULL OR team_load = FALSE)`);
  }
  if (profile.no_tarps) {
    conditions.push(`(tarp_height IS NULL OR NOT (tarp_height ~ '^[1-9][0-9]*$'))`);
  }
  if (profile.max_weight != null) {
    conditions.push(`(weight IS NULL OR weight <= $${paramIndex})`);
    extraParams.push(profile.max_weight);
    paramIndex++;
  }
  if (profile.trailer_types.length > 0) {
    conditions.push(`trailer_type = ANY($${paramIndex}::text[])`);
    extraParams.push(profile.trailer_types);
    paramIndex++;
  }

  const sql = `
SELECT
  order_id, origin_city, origin_state, dest_city, dest_state,
  ST_Y(origin_point::geometry) AS origin_lat, ST_X(origin_point::geometry) AS origin_lng,
  ST_Y(dest_point::geometry)   AS dest_lat,   ST_X(dest_point::geometry)   AS dest_lng,
  pay::real, miles::real, rate_per_mile::real, trailer_type, weight::real,
  stopoffs, tarp_height, hazmat, twic, team_load,
  pickup_date_early_utc, pickup_date_late_utc, delivery_date_early_utc, delivery_date_late_utc,
  pickup_date_early_local, pickup_date_late_local, delivery_date_early_local, delivery_date_late_local
FROM orders
WHERE ${conditions.join('\n  AND ')}
`;

  return { sql, extraParams };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git add api/src/routes/route-search.sql.ts
git commit -m "feat: add buildAllOrdersSql for brute-force search (no radius/tiers)"
```

---

## Task 3: Backend — Async brute-force worker

**Files:**
- Create: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/search-job.worker.ts`

- [ ] **Step 1: Create the worker**

This is the core of the brute-force search. It reuses `evaluateChain` and `buildTripLegs` from `route-search.engine.ts`.

```typescript
// api/src/routes/search-job.worker.ts
import {
  RouteChain,
  RouteLeg,
  RouteSearchResult,
  MS_PER_DAY,
  haversine,
  quickNetProfit,
} from '@mwbhtx/haulvisor-core';
import { Logger } from '@nestjs/common';
import type { SearchJob } from './search-job.store';
import {
  evaluateChain,
  type OrderRow,
  type SearchConfig,
} from './route-search.engine';
import type { PostgresService } from '../postgres/postgres.service';
import type { CompaniesService } from '../companies/companies.service';
import { buildAllOrdersSql } from './route-search.sql';

const CHUNK_SIZE = 1000;
const MAX_ROUTES_RETURNED = 50;
const TOP_LANES_LIMIT = 20;
const ROAD_CORRECTION_FACTOR = 1.3;

interface WorkerInput {
  job: SearchJob;
  config: SearchConfig;
  departureTs: number;
  destination?: { lat: number; lng: number; city?: string };
  companyId: string;
  postgres: PostgresService;
  companies: CompaniesService;
  userSettings: Record<string, unknown>;
  originLat: number;
  originLng: number;
}

/**
 * Yield to the event loop so other requests aren't blocked.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

function orderToLeg(row: OrderRow, legNumber: number, deadheadMiles: number): RouteLeg {
  return {
    leg_number:               legNumber,
    order_id:                 row.order_id,
    origin_city:              row.origin_city,
    origin_state:             row.origin_state,
    origin_lat:               row.origin_lat,
    origin_lng:               row.origin_lng,
    destination_city:         row.dest_city,
    destination_state:        row.dest_state,
    destination_lat:          row.dest_lat,
    destination_lng:          row.dest_lng,
    pay:                      row.pay,
    miles:                    row.miles,
    trailer_type:             row.trailer_type,
    deadhead_miles:           Math.round(deadheadMiles),
    weight:                   row.weight ?? undefined,
    pickup_date_early_utc:    row.pickup_date_early_utc ?? undefined,
    pickup_date_late_utc:     row.pickup_date_late_utc ?? undefined,
    delivery_date_early_utc:  row.delivery_date_early_utc ?? undefined,
    delivery_date_late_utc:   row.delivery_date_late_utc ?? undefined,
    pickup_date_early_local:  row.pickup_date_early_local ?? undefined,
    pickup_date_late_local:   row.pickup_date_late_local ?? undefined,
    delivery_date_early_local: row.delivery_date_early_local ?? undefined,
    delivery_date_late_local:  row.delivery_date_late_local ?? undefined,
    tarp_height:              row.tarp_height ?? undefined,
    stopoffs:                 row.stopoffs ?? undefined,
  };
}

export async function runBruteForceSearch(input: WorkerInput): Promise<void> {
  const logger = new Logger('BruteForceWorker');
  const { job, config, departureTs, destination, companyId, postgres, companies, userSettings, originLat, originLng } = input;
  const startTime = Date.now();

  try {
    // Step 1: Pull ALL open orders
    const { sql, extraParams } = buildAllOrdersSql(config.driver_profile);
    const orders = await postgres.query<OrderRow>(sql, [companyId, departureTs, ...extraParams]);

    job.progress.total_orders = orders.length;
    logger.log(`Brute-force [${job.id.slice(0, 8)}]: ${orders.length} open orders`);

    if (orders.length === 0) {
      const company = await companies.findOne(companyId);
      job.result = {
        routes: [],
        origin: {
          city: (userSettings.home_base_city as string) || '',
          state: (userSettings.home_base_state as string) || '',
          lat: originLat,
          lng: originLng,
        },
        order_url_template: company?.order_url_template,
      };
      job.status = 'complete';
      job.progress.elapsed_ms = Date.now() - startTime;
      return;
    }

    // Step 2: Compute pairs total
    if (config.num_orders === 1) {
      job.progress.pairs_total = orders.length;
    } else {
      job.progress.pairs_total = orders.length * (orders.length - 1);
    }

    // Step 3: Enumerate and evaluate
    const chains: RouteChain[] = [];
    let checked = 0;
    let pruned = 0;
    let simulated = 0;

    const maxInterlegDh = config.max_interleg_deadhead_miles ?? 500;
    const avgDrivingHours = config.cost_settings.avg_driving_hours_per_day ?? 8;

    if (config.num_orders === 1) {
      for (let i = 0; i < orders.length; i++) {
        if (job.cancelled) return;

        const c = orders[i];
        const originDh = haversine(originLat, originLng, c.origin_lat, c.origin_lng) * ROAD_CORRECTION_FACTOR;
        const totalMiles = c.miles + originDh;
        checked++;

        // Pre-sim pruning
        let skip = false;

        // Hard floor: must be profitable
        if (quickNetProfit(c.pay, c.miles, originDh, config.cost_per_mile) <= 0) { skip = true; }

        if (!skip && config.max_deadhead_pct != null) {
          if ((originDh / totalMiles) * 100 > config.max_deadhead_pct) skip = true;
        }
        if (!skip && config.min_rpm != null) {
          if (c.pay / totalMiles < config.min_rpm) skip = true;
        }
        if (!skip && config.min_daily_profit != null) {
          const qnp = quickNetProfit(c.pay, c.miles, originDh, config.cost_per_mile);
          const roughDays = Math.max(1, totalMiles / (config.avg_speed_mph * avgDrivingHours));
          if (qnp / roughDays < config.min_daily_profit) skip = true;
        }

        if (skip) {
          pruned++;
        } else {
          simulated++;
          const deadheads = [originDh];
          const lastOrder = c;
          const destMiles = destination
            ? haversine(lastOrder.dest_lat, lastOrder.dest_lng, destination.lat, destination.lng) * ROAD_CORRECTION_FACTOR
            : undefined;

          const result = evaluateChain(
            [c], deadheads, destination,
            config.cost_settings, config.work_start_hour, config.work_end_hour,
            departureTs, destMiles,
          );

          if (result) {
            if (result.estimated_days <= config.max_trip_days
              && (config.max_deadhead_pct == null || result.deadhead_pct <= config.max_deadhead_pct)
              && (config.min_daily_profit == null || result.daily_net_profit >= config.min_daily_profit)
              && (config.min_rpm == null || result.rate_per_mile >= config.min_rpm)) {
              chains.push({
                ...result,
                rank: 0,
                legs: [orderToLeg(c, 1, originDh)],
              });
            }
          }
        }

        // Update progress + yield
        if (checked % CHUNK_SIZE === 0) {
          job.progress.pairs_checked = checked;
          job.progress.pairs_pruned = pruned;
          job.progress.pairs_simulated = simulated;
          job.progress.routes_found = chains.length;
          job.progress.elapsed_ms = Date.now() - startTime;
          await yieldToEventLoop();
        }
      }
    } else {
      // 2-order brute-force
      for (let i = 0; i < orders.length; i++) {
        if (job.cancelled) return;

        const a = orders[i];
        const originDh = haversine(originLat, originLng, a.origin_lat, a.origin_lng) * ROAD_CORRECTION_FACTOR;

        for (let j = 0; j < orders.length; j++) {
          if (i === j) continue;
          const b = orders[j];
          checked++;

          // Time ordering
          if (b.pickup_date_late_utc && a.delivery_date_early_utc && b.pickup_date_late_utc <= a.delivery_date_early_utc) {
            pruned++;
            continue;
          }

          const interlegDh = haversine(a.dest_lat, a.dest_lng, b.origin_lat, b.origin_lng) * ROAD_CORRECTION_FACTOR;
          if (interlegDh > maxInterlegDh) { pruned++; continue; }

          const totalDeadhead = originDh + interlegDh;
          const totalLoaded = a.miles + b.miles;
          const totalMiles = totalLoaded + totalDeadhead;
          const totalPay = a.pay + b.pay;

          // Hard floor: must be profitable
          let skip = false;
          if (quickNetProfit(totalPay, totalLoaded, totalDeadhead, config.cost_per_mile) <= 0) { skip = true; }

          if (!skip && config.max_deadhead_pct != null) {
            if ((totalDeadhead / totalMiles) * 100 > config.max_deadhead_pct) skip = true;
          }
          if (!skip && config.min_rpm != null) {
            if (totalPay / totalMiles < config.min_rpm) skip = true;
          }
          if (!skip && config.min_daily_profit != null) {
            const qnp = quickNetProfit(totalPay, totalLoaded, totalDeadhead, config.cost_per_mile);
            const roughDays = Math.max(1, totalMiles / (config.avg_speed_mph * avgDrivingHours));
            if (qnp / roughDays < config.min_daily_profit) skip = true;
          }

          if (skip) {
            pruned++;
          } else {
            simulated++;
            const deadheads = [originDh, interlegDh];
            const lastOrder = b;
            const destMiles = destination
              ? haversine(lastOrder.dest_lat, lastOrder.dest_lng, destination.lat, destination.lng) * ROAD_CORRECTION_FACTOR
              : undefined;

            const result = evaluateChain(
              [a, b], deadheads, destination,
              config.cost_settings, config.work_start_hour, config.work_end_hour,
              departureTs, destMiles,
            );

            if (result) {
              if (result.estimated_days <= config.max_trip_days
                && (config.max_deadhead_pct == null || result.deadhead_pct <= config.max_deadhead_pct)
                && (config.min_daily_profit == null || result.daily_net_profit >= config.min_daily_profit)
                && (config.min_rpm == null || result.rate_per_mile >= config.min_rpm)) {
                chains.push({
                  ...result,
                  rank: 0,
                  legs: [orderToLeg(a, 1, originDh), orderToLeg(b, 2, interlegDh)],
                });
              }
            }
          }

          // Update progress + yield
          if (checked % CHUNK_SIZE === 0) {
            job.progress.pairs_checked = checked;
            job.progress.pairs_pruned = pruned;
            job.progress.pairs_simulated = simulated;
            job.progress.routes_found = chains.length;
            job.progress.elapsed_ms = Date.now() - startTime;
            await yieldToEventLoop();
          }
        }
      }
    }

    // Final progress update
    job.progress.pairs_checked = checked;
    job.progress.pairs_pruned = pruned;
    job.progress.pairs_simulated = simulated;
    job.progress.routes_found = chains.length;
    job.progress.elapsed_ms = Date.now() - startTime;

    // Step 4: Sort and cap
    chains.sort((a, b) => b.daily_net_profit - a.daily_net_profit);

    // Step 5: Tag top lanes
    const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);
    const laneRows = await postgres.query<{ lane: string }>(
      `SELECT origin_state || '\u2192' || dest_state AS lane, COUNT(*)::int AS cnt
       FROM orders
       WHERE company_id = $1 AND opened_at >= $2
       GROUP BY lane ORDER BY cnt DESC LIMIT ${TOP_LANES_LIMIT}`,
      [companyId, thirtyDaysAgo],
    );
    const topLanes = new Map<string, number>();
    laneRows.forEach((r, i) => topLanes.set(r.lane, i + 1));

    for (const chain of chains) {
      for (const leg of chain.legs) {
        const laneKey = `${leg.origin_state}\u2192${leg.destination_state}`;
        const rank = topLanes.get(laneKey);
        if (rank != null) leg.lane_rank = rank;
      }
    }

    const routes = chains.slice(0, MAX_ROUTES_RETURNED).map((chain, i) => ({ ...chain, rank: i + 1 }));
    const company = await companies.findOne(companyId);

    job.result = {
      routes,
      origin: {
        city: (userSettings.home_base_city as string) || '',
        state: (userSettings.home_base_state as string) || '',
        lat: originLat,
        lng: originLng,
      },
      order_url_template: company?.order_url_template,
    };
    job.status = 'complete';
    job.progress.elapsed_ms = Date.now() - startTime;

    logger.log(`Brute-force [${job.id.slice(0, 8)}]: complete — ${chains.length} routes found, ${simulated} simulated, ${pruned} pruned in ${job.progress.elapsed_ms}ms`);

  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
    job.progress.elapsed_ms = Date.now() - startTime;
    logger.error(`Brute-force [${job.id.slice(0, 8)}]: failed — ${job.error}`);
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git add api/src/routes/search-job.worker.ts
git commit -m "feat: add async brute-force search worker with setImmediate chunking"
```

---

## Task 4: Backend — Rewrite service and controller for async search

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/route-search.service.ts`
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/routes.controller.ts`
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/routes.module.ts`

- [ ] **Step 1: Rewrite route-search.service.ts**

Replace the entire file:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { MS_PER_DAY } from '@mwbhtx/haulvisor-core';
import { PostgresService } from '../postgres/postgres.service';
import { SettingsService } from '../settings/settings.service';
import { CompaniesService } from '../companies/companies.service';
import { RouteSearchDto } from './dto/route-search.dto';
import {
  resolveSearchConfig,
  computeDepartureTimestamp,
} from './route-search.engine';
import { SearchJobStore, type SearchJob } from './search-job.store';
import { runBruteForceSearch } from './search-job.worker';

@Injectable()
export class RouteSearchService {
  private readonly logger = new Logger(RouteSearchService.name);

  constructor(
    private readonly postgres: PostgresService,
    private readonly settingsService: SettingsService,
    private readonly companiesService: CompaniesService,
    private readonly jobStore: SearchJobStore,
  ) {}

  async startSearch(
    companyId: string,
    userId: string,
    query: RouteSearchDto,
  ): Promise<{ search_id: string }> {
    const userSettings = await this.settingsService.getSettings(userId);
    const config = resolveSearchConfig(query as unknown as Record<string, unknown>, userSettings);

    const departureTs = computeDepartureTimestamp(
      query.departure_date,
      config.work_start_hour,
      config.work_end_hour,
      query.origin_lat,
      query.origin_lng,
    );

    const destination = query.destination_lat != null && query.destination_lng != null
      ? { lat: query.destination_lat, lng: query.destination_lng, city: query.destination_city }
      : undefined;

    const job = this.jobStore.create(userId, companyId);

    this.logger.log(`Search [${job.id.slice(0, 8)}]: started for company ${companyId}`);

    // Fire and forget — the worker runs in the background
    runBruteForceSearch({
      job,
      config,
      departureTs,
      destination,
      companyId,
      postgres: this.postgres,
      companies: this.companiesService,
      userSettings,
      originLat: query.origin_lat,
      originLng: query.origin_lng,
    }).catch(err => {
      this.logger.error(`Search [${job.id.slice(0, 8)}]: unhandled error`, err);
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
    });

    return { search_id: job.id };
  }

  getSearchResult(searchId: string): SearchJob | undefined {
    return this.jobStore.get(searchId);
  }
}
```

- [ ] **Step 2: Rewrite routes.controller.ts**

Replace the entire file:

```typescript
import { Controller, Get, Post, Param, Query, Req, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { assertCompanyAccess } from '../auth/company-access.guard';
import { RequestUser } from '@mwbhtx/haulvisor-core';
import { RouteSearchService } from './route-search.service';
import { RouteSearchDto } from './dto/route-search.dto';

@Controller('routes')
export class RoutesController {
  constructor(
    private readonly routeSearchService: RouteSearchService,
  ) {}

  @Post(':companyId/search')
  @Roles('admin', 'user', 'demo')
  async startSearch(
    @Param('companyId') companyId: string,
    @Query() query: RouteSearchDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    assertCompanyAccess(req.user, companyId);
    return this.routeSearchService.startSearch(companyId, req.user.userId, query);
  }

  @Get(':companyId/search/:searchId')
  @Roles('admin', 'user', 'demo')
  async getSearch(
    @Param('companyId') companyId: string,
    @Param('searchId') searchId: string,
    @Req() req: Request & { user: RequestUser },
  ) {
    assertCompanyAccess(req.user, companyId);
    const job = this.routeSearchService.getSearchResult(searchId);
    if (!job) throw new NotFoundException('Search not found');

    return {
      status: job.status,
      progress: job.progress,
      ...(job.status === 'complete' && job.result ? { result: job.result } : {}),
      ...(job.status === 'failed' && job.error ? { error: job.error } : {}),
    };
  }
}
```

- [ ] **Step 3: Update routes.module.ts**

Replace the entire file:

```typescript
import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RouteSearchService } from './route-search.service';
import { SearchJobStore } from './search-job.store';
import { SettingsModule } from '../settings/settings.module';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [SettingsModule, CompaniesModule],
  controllers: [RoutesController],
  providers: [RouteSearchService, SearchJobStore],
})
export class RoutesModule {}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npx tsc --noEmit
```

If there are unused import warnings for `DrivingDistanceService`, that's expected — it's no longer used. Fix any errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git add api/src/routes/route-search.service.ts api/src/routes/routes.controller.ts api/src/routes/routes.module.ts
git commit -m "feat: replace sync search with async brute-force job dispatch"
```

---

## Task 5: Frontend — Rewrite useRouteSearch hook

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor/src/core/hooks/use-routes.ts`

- [ ] **Step 1: Rewrite the hook**

Replace the entire file. The hook's external interface stays the same (`data`, `isLoading`, `isFetched`, `error`) plus a new `progress` field. Internally it POSTs to start, then polls for results.

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchApi } from "@/core/services/api";
import type { RouteSearchResult } from "@mwbhtx/haulvisor-core";

export interface RouteSearchParams {
  origin_lat: number;
  origin_lng: number;
  departure_date: string;
  destination_lat?: number;
  destination_lng?: number;
  destination_city?: string;
  search_radius_miles?: number;
  max_trip_days?: number;
  num_orders?: number;
  // Driver profile
  trailer_types?: string;
  max_weight?: number;
  hazmat_certified?: boolean;
  twic_card?: boolean;
  team_driver?: boolean;
  no_tarps?: boolean;
  ignore_radius?: boolean;
  // Search radius
  origin_radius_miles?: number;
  dest_radius_miles?: number;
  // Cost model
  cost_per_mile?: number;
  avg_mpg?: number;
  avg_driving_hours_per_day?: number;
  // Work hours
  work_start_hour?: number;
  work_end_hour?: number;
  // Route quality filters
  max_deadhead_pct?: number;
  min_daily_profit?: number;
  min_rpm?: number;
  max_interleg_deadhead_miles?: number;
}

export interface SearchProgress {
  total_orders: number;
  pairs_total: number;
  pairs_checked: number;
  pairs_pruned: number;
  pairs_simulated: number;
  routes_found: number;
  elapsed_ms: number;
}

interface SearchPollResponse {
  status: 'running' | 'complete' | 'failed';
  progress: SearchProgress;
  result?: RouteSearchResult;
  error?: string;
}

export function useRouteSearch(companyId: string, params: RouteSearchParams | null) {
  const [data, setData] = useState<RouteSearchResult | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetched, setIsFetched] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<SearchProgress | null>(null);

  const searchIdRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paramsKeyRef = useRef<string>("");

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Serialize params for comparison
  const paramsKey = params ? JSON.stringify(params) : "";

  useEffect(() => {
    if (!companyId || !params || paramsKey === paramsKeyRef.current) return;
    paramsKeyRef.current = paramsKey;

    // New search
    stopPolling();
    setIsLoading(true);
    setIsFetched(false);
    setError(null);
    setProgress(null);

    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value != null) qs.set(key, String(value));
    }

    // Start the search
    fetchApi<{ search_id: string }>(`routes/${companyId}/search?${qs.toString()}`, {
      method: 'POST',
    })
      .then(({ search_id }) => {
        searchIdRef.current = search_id;

        // Poll for results
        pollRef.current = setInterval(async () => {
          try {
            const resp = await fetchApi<SearchPollResponse>(
              `routes/${companyId}/search/${search_id}`,
            );

            setProgress(resp.progress);

            if (resp.status === 'complete' && resp.result) {
              stopPolling();
              setData(resp.result);
              setIsLoading(false);
              setIsFetched(true);
            } else if (resp.status === 'failed') {
              stopPolling();
              setError(new Error(resp.error || 'Search failed'));
              setIsLoading(false);
              setIsFetched(true);
            }
          } catch (err) {
            stopPolling();
            setError(err instanceof Error ? err : new Error(String(err)));
            setIsLoading(false);
            setIsFetched(true);
          }
        }, 1000);
      })
      .catch(err => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
        setIsFetched(true);
      });

    return () => stopPolling();
  }, [companyId, paramsKey]);

  return { data, isLoading, isFetched, error, progress };
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
npm run build
```

Fix any type errors. The consumers (`desktop-routes-view.tsx`, `mobile-routes-view.tsx`) destructure `{ data, isLoading, isFetched }` which are all still present. The new `progress` field is additive.

- [ ] **Step 3: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
git add src/core/hooks/use-routes.ts
git commit -m "feat: rewrite useRouteSearch for async POST+poll pattern"
```

---

## Task 6: Frontend — Show progress in desktop view

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor/src/features/routes/views/desktop/desktop-routes-view.tsx`

- [ ] **Step 1: Extract progress from the hook and show it**

In `desktop-routes-view.tsx`, update the hook destructure at line 57:

```typescript
  const { data, isLoading, isFetched, progress } = useRouteSearch(activeCompanyId ?? "", searchParams);
```

Then, where the loading state is shown to the user (in the `RouteList` area or above it), add progress text. Find where `isLoading` is used to show a loading state and add a progress line nearby. Add this component inline above the `RouteList`:

```tsx
{isLoading && progress && progress.pairs_total > 0 && (
  <div className="px-4 py-2 text-sm text-muted-foreground">
    Checking {progress.pairs_checked.toLocaleString()} / {progress.pairs_total.toLocaleString()} pairs
    {progress.routes_found > 0 && ` — ${progress.routes_found} routes found`}
  </div>
)}
```

Place this just before the `<RouteList ...>` component in the JSX.

- [ ] **Step 2: Verify build**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
npm run build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
git add src/features/routes/views/desktop/desktop-routes-view.tsx
git commit -m "feat: show search progress in desktop view while brute-force runs"
```

---

## Task 7: Frontend — Show progress in mobile view

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor/src/features/routes/views/mobile/mobile-routes-view.tsx`

- [ ] **Step 1: Extract progress and show it**

Update the hook call (around line 59):

```typescript
  const routeQuery = useRouteSearch(activeCompanyId ?? "", searchParams);
  const { progress } = routeQuery;
```

Find where the mobile loading state is rendered and add progress text nearby:

```tsx
{routeQuery.isLoading && progress && progress.pairs_total > 0 && (
  <div className="px-4 py-2 text-sm text-muted-foreground">
    Checking {progress.pairs_checked.toLocaleString()} / {progress.pairs_total.toLocaleString()} pairs
    {progress.routes_found > 0 && ` — ${progress.routes_found} routes found`}
  </div>
)}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
npm run build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
git add src/features/routes/views/mobile/mobile-routes-view.tsx
git commit -m "feat: show search progress in mobile view"
```

---

## Task 8: Final verification and push

- [ ] **Step 1: Verify backend compiles**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npx tsc --noEmit
```

- [ ] **Step 2: Verify frontend builds**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
npm run build
```

- [ ] **Step 3: Push both repos**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git push origin main

cd /Users/matthewbennett/Documents/GitHub/haulvisor
git push origin main
```
