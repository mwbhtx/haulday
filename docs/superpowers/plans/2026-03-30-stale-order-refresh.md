# Stale Order Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily stale-order refresh Lambda that detects open orders with past pickup dates and re-queues them for detail scraping, plus admin panel visibility for both this job and the existing available-orders scraper.

**Architecture:** New lightweight Lambda in haulvisor-mercer (no Playwright), triggered by EventBridge every 30 min, self-gating against a per-company config stored on the `haulvisor-companies` DynamoDB record. The existing available-orders-scraper gets a small addition to write scan results to the company record. The haulvisor-core types are extended with new fields. The admin panel gets two icon-triggered popovers.

**Tech Stack:** TypeScript, AWS Lambda (zip, not container), EventBridge, DynamoDB, SNS, Terraform, React/Next.js, Tailwind CSS

---

## File Structure

### haulvisor-core (shared types)
- **Modify:** `src/types/company.ts` — add `StaleOrderRefreshConfig`, `LastStaleRefresh`, `LastAvailableOrdersScan` interfaces and fields to `CompanyRegistration`

### haulvisor-mercer (new Lambda + scraper change)
- **Create:** `lambdas/stale-order-refresh/package.json`
- **Create:** `lambdas/stale-order-refresh/tsconfig.json`
- **Create:** `lambdas/stale-order-refresh/esbuild.lambda.mjs`
- **Create:** `lambdas/stale-order-refresh/jest.config.ts`
- **Create:** `lambdas/stale-order-refresh/src/index.ts` — Lambda handler
- **Create:** `lambdas/stale-order-refresh/src/gate.ts` — self-gating logic (should I run?)
- **Create:** `lambdas/stale-order-refresh/src/stale-orders.ts` — DynamoDB query for stale orders
- **Create:** `lambdas/stale-order-refresh/src/publish.ts` — SNS publish for each stale order
- **Create:** `lambdas/stale-order-refresh/src/__tests__/gate.spec.ts`
- **Create:** `lambdas/stale-order-refresh/src/__tests__/stale-orders.spec.ts`
- **Modify:** `lambdas/available-orders-scraper/src/index.ts` — write `last_available_orders_scan` to company record after scrape
- **Modify:** `infrastructure/lambda.tf` — add stale-order-refresh Lambda
- **Modify:** `infrastructure/eventbridge.tf` — add 30-min schedule rule
- **Modify:** `infrastructure/iam.tf` — add DynamoDB Query, UpdateItem, SNS Publish permissions
- **Modify:** `infrastructure/alerting.tf` — add CloudWatch alarm

### haulvisor-backend (DTO extension)
- **Modify:** `api/src/companies/dto/data-sync-settings.dto.ts` — add `stale_order_refresh_config` validation
- **Modify:** `api/src/companies/companies.service.ts` — handle `stale_order_refresh_config` in `setDataSyncSettings()`

### haulvisor (frontend admin panel)
- **Modify:** `src/features/admin/views/desktop/desktop-admin-view.tsx` — add `Company` interface fields, two popover components, two icon columns in table

---

### Task 1: Extend haulvisor-core CompanyRegistration type

**Files:**
- Modify: `../haulvisor-core/src/types/company.ts`

- [ ] **Step 1: Add new interfaces and fields**

```typescript
// Add after FetchSchedule interface, before CompanyRegistration:

export interface StaleOrderRefreshConfig {
  enabled: boolean;
  timezone: string; // e.g. "America/Chicago"
  run_time: string; // "HH:mm" 24hr format
}

export interface LastStaleRefresh {
  timestamp: string; // ISO 8601
  stale_count: number;
}

export interface LastAvailableOrdersScan {
  timestamp: string; // ISO 8601
  total_orders: number;
  new_orders: number;
}
```

Add to `CompanyRegistration`:
```typescript
  stale_order_refresh_config?: StaleOrderRefreshConfig;
  last_stale_refresh?: LastStaleRefresh;
  last_available_orders_scan?: LastAvailableOrdersScan;
```

- [ ] **Step 2: Rebuild haulvisor-core**

Run: `cd ../haulvisor-core && npm run build`
Expected: Clean build, new types in `dist/types/company.d.ts`

- [ ] **Step 3: Commit**

```bash
cd ../haulvisor-core
git add src/types/company.ts
git commit -m "feat: add stale order refresh and scan result types to CompanyRegistration"
```

---

### Task 2: Create stale-order-refresh Lambda scaffold

**Files:**
- Create: `lambdas/stale-order-refresh/package.json`
- Create: `lambdas/stale-order-refresh/tsconfig.json`
- Create: `lambdas/stale-order-refresh/esbuild.lambda.mjs`
- Create: `lambdas/stale-order-refresh/jest.config.ts`

- [ ] **Step 1: Create package.json**

Create `lambdas/stale-order-refresh/package.json`:
```json
{
  "name": "stale-order-refresh",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "node esbuild.lambda.mjs",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.700.0",
    "@aws-sdk/client-sns": "^3.700.0",
    "@aws-sdk/lib-dynamodb": "^3.700.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.145",
    "@types/jest": "^30.0.0",
    "esbuild": "^0.24.0",
    "jest": "^30.3.0",
    "ts-jest": "^29.4.6",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Copy from `lambdas/available-orders-scraper/tsconfig.json` (or create a minimal one):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create esbuild.lambda.mjs**

Copy the pattern from available-orders-scraper, adjusting entry point:
```javascript
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outdir: 'dist',
  format: 'esm',
  sourcemap: true,
  banner: {
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
  external: [
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/lib-dynamodb',
    '@aws-sdk/client-sns',
  ],
});

console.log('Build complete');
```

- [ ] **Step 4: Create jest.config.ts**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.spec.ts'],
};

export default config;
```

- [ ] **Step 5: Install dependencies**

Run: `cd lambdas/stale-order-refresh && npm install`

- [ ] **Step 6: Commit**

```bash
cd ../.. # back to haulvisor-mercer root
git add lambdas/stale-order-refresh/package.json lambdas/stale-order-refresh/tsconfig.json lambdas/stale-order-refresh/esbuild.lambda.mjs lambdas/stale-order-refresh/jest.config.ts
git commit -m "chore: scaffold stale-order-refresh Lambda package"
```

---

### Task 3: Implement self-gating logic with tests

**Files:**
- Create: `lambdas/stale-order-refresh/src/gate.ts`
- Create: `lambdas/stale-order-refresh/src/__tests__/gate.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `lambdas/stale-order-refresh/src/__tests__/gate.spec.ts`:

```typescript
import { shouldRun } from '../gate.js';
import type { StaleOrderRefreshConfig, LastStaleRefresh } from '@mwbhtx/haulvisor-core';

describe('shouldRun', () => {
  const config: StaleOrderRefreshConfig = {
    enabled: true,
    timezone: 'America/Chicago',
    run_time: '06:00',
  };

  it('returns false when disabled', () => {
    expect(shouldRun({ ...config, enabled: false }, undefined, new Date('2026-03-30T12:00:00Z'))).toBe(false);
  });

  it('returns false when current time is before run_time in configured timezone', () => {
    // 2026-03-30T10:00:00Z = 05:00 CT (CDT, UTC-5) — before 06:00
    expect(shouldRun(config, undefined, new Date('2026-03-30T10:00:00Z'))).toBe(false);
  });

  it('returns true when current time is after run_time and never ran', () => {
    // 2026-03-30T12:00:00Z = 07:00 CT — after 06:00
    expect(shouldRun(config, undefined, new Date('2026-03-30T12:00:00Z'))).toBe(true);
  });

  it('returns false when already ran today in configured timezone', () => {
    const lastRefresh: LastStaleRefresh = {
      timestamp: '2026-03-30T11:30:00Z', // 06:30 CT — same calendar day
      stale_count: 5,
    };
    // 2026-03-30T14:00:00Z = 09:00 CT — same day
    expect(shouldRun(config, lastRefresh, new Date('2026-03-30T14:00:00Z'))).toBe(false);
  });

  it('returns true when last ran yesterday in configured timezone', () => {
    const lastRefresh: LastStaleRefresh = {
      timestamp: '2026-03-29T11:30:00Z', // yesterday
      stale_count: 3,
    };
    // 2026-03-30T12:00:00Z = 07:00 CT today — after run_time, different day
    expect(shouldRun(config, lastRefresh, new Date('2026-03-30T12:00:00Z'))).toBe(true);
  });

  it('handles timezone boundary correctly (late UTC = next day in some TZ)', () => {
    const pacificConfig: StaleOrderRefreshConfig = {
      enabled: true,
      timezone: 'America/Los_Angeles',
      run_time: '06:00',
    };
    // 2026-03-31T05:00:00Z = Mar 30 10:00 PM PT (PDT, UTC-7) — still Mar 30
    // run_time is 06:00, current local time is 22:00, already past run_time
    // If last ran on Mar 30, should NOT run again
    const lastRefresh: LastStaleRefresh = {
      timestamp: '2026-03-30T14:00:00Z', // Mar 30 07:00 PT
      stale_count: 2,
    };
    expect(shouldRun(pacificConfig, lastRefresh, new Date('2026-03-31T05:00:00Z'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd lambdas/stale-order-refresh && npx jest --no-cache`
Expected: FAIL — `Cannot find module '../gate.js'`

- [ ] **Step 3: Implement gate.ts**

Create `lambdas/stale-order-refresh/src/gate.ts`:

```typescript
import type { StaleOrderRefreshConfig, LastStaleRefresh } from '@mwbhtx/haulvisor-core';

/**
 * Get the current calendar date string (YYYY-MM-DD) in a given timezone.
 */
function dateInTimezone(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone }); // en-CA gives YYYY-MM-DD
}

/**
 * Get the current time as total minutes since midnight in a given timezone.
 */
function minutesInTimezone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return (hour === 24 ? 0 : hour) * 60 + minute;
}

/**
 * Determine whether the stale-order-refresh job should run.
 *
 * Rules:
 * 1. Config must be enabled
 * 2. Current time (in configured TZ) must be >= run_time
 * 3. Must not have already run today (in configured TZ)
 */
export function shouldRun(
  config: StaleOrderRefreshConfig,
  lastRefresh: LastStaleRefresh | undefined,
  now: Date = new Date(),
): boolean {
  if (!config.enabled) return false;

  const { timezone, run_time } = config;

  // Check if current time is past run_time
  const currentMinutes = minutesInTimezone(now, timezone);
  const [runH, runM] = run_time.split(':').map(Number);
  const runMinutes = runH * 60 + runM;
  if (currentMinutes < runMinutes) return false;

  // Check if already ran today
  if (lastRefresh) {
    const todayStr = dateInTimezone(now, timezone);
    const lastRunStr = dateInTimezone(new Date(lastRefresh.timestamp), timezone);
    if (todayStr === lastRunStr) return false;
  }

  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd lambdas/stale-order-refresh && npx jest --no-cache`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lambdas/stale-order-refresh/src/gate.ts lambdas/stale-order-refresh/src/__tests__/gate.spec.ts
git commit -m "feat: implement stale-order-refresh self-gating logic with tests"
```

---

### Task 4: Implement stale orders DynamoDB query with tests

**Files:**
- Create: `lambdas/stale-order-refresh/src/stale-orders.ts`
- Create: `lambdas/stale-order-refresh/src/__tests__/stale-orders.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `lambdas/stale-order-refresh/src/__tests__/stale-orders.spec.ts`:

```typescript
import { filterStaleOrderIds } from '../stale-orders.js';

describe('filterStaleOrderIds', () => {
  const today = '2026-03-30';

  it('returns order IDs with pickup_date_early before today', () => {
    const items = [
      { order_id: 'A', order_status: 'open', pickup_date_early: '2026-03-28T10:00:00Z' },
      { order_id: 'B', order_status: 'open', pickup_date_early: '2026-03-30T10:00:00Z' },
      { order_id: 'C', order_status: 'open', pickup_date_early: '2026-03-25T08:00:00Z' },
    ];
    expect(filterStaleOrderIds(items, today)).toEqual(['A', 'C']);
  });

  it('excludes closed orders', () => {
    const items = [
      { order_id: 'A', order_status: 'closed', pickup_date_early: '2026-03-28T10:00:00Z' },
      { order_id: 'B', order_status: 'open', pickup_date_early: '2026-03-28T10:00:00Z' },
    ];
    expect(filterStaleOrderIds(items, today)).toEqual(['B']);
  });

  it('returns empty array when no stale orders', () => {
    const items = [
      { order_id: 'A', order_status: 'open', pickup_date_early: '2026-03-31T10:00:00Z' },
    ];
    expect(filterStaleOrderIds(items, today)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(filterStaleOrderIds([], today)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd lambdas/stale-order-refresh && npx jest --no-cache`
Expected: FAIL — `Cannot find module '../stale-orders.js'`

- [ ] **Step 3: Implement stale-orders.ts**

Create `lambdas/stale-order-refresh/src/stale-orders.ts`:

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ORDERS_TABLE = process.env.ORDERS_TABLE ?? 'haulvisor-orders';
const COMPANY_ID = process.env.COMPANY_ID ?? 'mercer-local-dev';

const client = new DynamoDBClient({
  ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {}),
});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

interface OrderItem {
  order_id: string;
  order_status?: string;
  pickup_date_early?: string;
}

/**
 * Pure filtering function — given a list of order items and today's date (YYYY-MM-DD),
 * returns the order IDs that are open and have pickup_date_early before today.
 */
export function filterStaleOrderIds(items: OrderItem[], todayDateStr: string): string[] {
  return items
    .filter((item) =>
      item.order_status === 'open' &&
      item.pickup_date_early &&
      item.pickup_date_early.slice(0, 10) < todayDateStr
    )
    .map((item) => item.order_id);
}

/**
 * Query all open orders for the company and return those with stale pickup dates.
 * Uses paginated queries to handle large result sets.
 */
export async function getStaleOrderIds(todayDateStr: string): Promise<string[]> {
  const allItems: OrderItem[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: ORDERS_TABLE,
        KeyConditionExpression: 'company_id = :cid',
        FilterExpression: 'order_status = :open',
        ExpressionAttributeValues: {
          ':cid': COMPANY_ID,
          ':open': 'open',
        },
        ProjectionExpression: 'order_id, order_status, pickup_date_early',
        ExclusiveStartKey: lastKey,
      }),
    );
    allItems.push(...((result.Items as OrderItem[]) ?? []));
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return filterStaleOrderIds(allItems, todayDateStr);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd lambdas/stale-order-refresh && npx jest --no-cache`
Expected: All tests PASS (filterStaleOrderIds is pure, no DynamoDB mocking needed)

- [ ] **Step 5: Commit**

```bash
git add lambdas/stale-order-refresh/src/stale-orders.ts lambdas/stale-order-refresh/src/__tests__/stale-orders.spec.ts
git commit -m "feat: implement stale order detection query with tests"
```

---

### Task 5: Implement SNS publish module

**Files:**
- Create: `lambdas/stale-order-refresh/src/publish.ts`

- [ ] **Step 1: Create publish.ts**

```typescript
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const SNS_TOPIC_ARN = process.env.SNS_ORDER_REQUESTS_TOPIC_ARN!;
const COMPANY_ID = process.env.COMPANY_ID ?? 'mercer-local-dev';

const sns = new SNSClient({
  region: process.env.AWS_REGION_OVERRIDE || process.env.AWS_REGION || 'us-east-1',
});

/**
 * Publish stale order IDs to the SNS topic so the existing order-details-scraper
 * re-fetches their details (which updates pickup dates).
 *
 * Each order gets its own SNS message to match how TasksService.createAndPublish() works.
 * The order-details-scraper SQS subscription filters on company_id + task_type.
 */
export async function publishStaleOrders(orderIds: string[]): Promise<void> {
  for (const orderId of orderIds) {
    const messageBody = JSON.stringify({
      task_id: `stale-refresh-${orderId}-${Date.now()}`,
      company_id: COMPANY_ID,
      order_id: orderId,
      task_type: 'fetch_order_details',
    });

    await sns.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Message: messageBody,
        MessageAttributes: {
          company_id: {
            DataType: 'String',
            StringValue: COMPANY_ID,
          },
          task_type: {
            DataType: 'String',
            StringValue: 'fetch_order_details',
          },
        },
      }),
    );
  }

  console.log(`Published ${orderIds.length} stale order(s) to SNS`);
}
```

- [ ] **Step 2: Commit**

```bash
git add lambdas/stale-order-refresh/src/publish.ts
git commit -m "feat: add SNS publish module for stale order IDs"
```

---

### Task 6: Implement Lambda handler

**Files:**
- Create: `lambdas/stale-order-refresh/src/index.ts`

- [ ] **Step 1: Create the handler**

```typescript
import type { Handler, ScheduledEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { CompanyRegistration } from '@mwbhtx/haulvisor-core';
import { shouldRun } from './gate.js';
import { getStaleOrderIds } from './stale-orders.js';
import { publishStaleOrders } from './publish.js';

const COMPANIES_TABLE = process.env.COMPANIES_TABLE ?? 'haulvisor-companies';
const COMPANY_ID = process.env.COMPANY_ID ?? 'mercer-local-dev';

const client = new DynamoDBClient({
  ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {}),
});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const handler: Handler<ScheduledEvent> = async () => {
  // 1. Read company config
  const result = await docClient.send(
    new GetCommand({
      TableName: COMPANIES_TABLE,
      Key: { company_id: COMPANY_ID },
    }),
  );
  const company = result.Item as CompanyRegistration | undefined;

  if (!company?.stale_order_refresh_config) {
    console.log('No stale_order_refresh_config found. Skipping.');
    return;
  }

  // 2. Check gate
  const now = new Date();
  if (!shouldRun(company.stale_order_refresh_config, company.last_stale_refresh, now)) {
    console.log('Gate check failed — not time to run or already ran today. Skipping.');
    return;
  }

  // 3. Query stale orders
  const todayStr = now.toLocaleDateString('en-CA', {
    timeZone: company.stale_order_refresh_config.timezone,
  });
  const staleOrderIds = await getStaleOrderIds(todayStr);

  console.log(`Found ${staleOrderIds.length} stale open order(s) with pickup before ${todayStr}`);

  // 4. Publish to SNS
  if (staleOrderIds.length > 0) {
    await publishStaleOrders(staleOrderIds);
  }

  // 5. Write last_stale_refresh to company record
  await docClient.send(
    new UpdateCommand({
      TableName: COMPANIES_TABLE,
      Key: { company_id: COMPANY_ID },
      UpdateExpression: 'SET last_stale_refresh = :lr, updated_at = :now',
      ExpressionAttributeValues: {
        ':lr': {
          timestamp: now.toISOString(),
          stale_count: staleOrderIds.length,
        },
        ':now': now.toISOString(),
      },
    }),
  );

  console.log(JSON.stringify({
    level: 'info',
    tag: 'stale-refresh-complete',
    stale_count: staleOrderIds.length,
    today: todayStr,
  }));
};
```

- [ ] **Step 2: Verify build**

Run: `cd lambdas/stale-order-refresh && npm run build`
Expected: Build completes, `dist/index.js` created

- [ ] **Step 3: Commit**

```bash
git add lambdas/stale-order-refresh/src/index.ts
git commit -m "feat: implement stale-order-refresh Lambda handler"
```

---

### Task 7: Add Terraform infrastructure for stale-order-refresh

**Files:**
- Modify: `infrastructure/lambda.tf`
- Modify: `infrastructure/eventbridge.tf`
- Modify: `infrastructure/iam.tf`
- Modify: `infrastructure/alerting.tf`

- [ ] **Step 1: Add Lambda function to lambda.tf**

Append to `infrastructure/lambda.tf`:

```hcl
# Stale order refresh — triggered by EventBridge (no container, zip deployment)
resource "aws_lambda_function" "stale_order_refresh" {
  function_name = "haulvisor-mercer-stale-order-refresh"
  role          = aws_iam_role.scraper.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  filename      = "${path.module}/../lambdas/stale-order-refresh/dist/index.zip"
  timeout       = 60
  memory_size   = 256

  environment {
    variables = {
      COMPANY_ID                     = var.company_id
      COMPANIES_TABLE                = "haulvisor-companies"
      ORDERS_TABLE                   = "haulvisor-orders"
      SNS_ORDER_REQUESTS_TOPIC_ARN   = data.aws_ssm_parameter.sns_topic_arn.value
      AWS_REGION_OVERRIDE            = var.aws_region
    }
  }

  tags = {
    Name = "haulvisor-mercer-stale-order-refresh"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}
```

- [ ] **Step 2: Add EventBridge rule to eventbridge.tf**

Append to `infrastructure/eventbridge.tf`:

```hcl
# Stale order refresh — check every 30 minutes (Lambda self-gates)
resource "aws_cloudwatch_event_rule" "stale_order_refresh" {
  name                = "haulvisor-mercer-stale-order-refresh"
  description         = "Trigger stale order refresh check every 30 minutes"
  schedule_expression = "rate(30 minutes)"

  tags = {
    Name = "haulvisor-mercer-stale-order-refresh"
  }
}

resource "aws_cloudwatch_event_target" "stale_order_refresh" {
  rule = aws_cloudwatch_event_rule.stale_order_refresh.name
  arn  = aws_lambda_function.stale_order_refresh.arn
}

resource "aws_lambda_permission" "stale_order_refresh_eventbridge" {
  statement_id  = "AllowEventBridgeInvokeStaleRefresh"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.stale_order_refresh.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.stale_order_refresh.arn
}
```

- [ ] **Step 3: Expand IAM policy in iam.tf**

In `infrastructure/iam.tf`, update the `aws_iam_role_policy.scraper` policy to add three new statements. Add these to the `Statement` array:

```hcl
      {
        Sid    = "DynamoDBQueryOrders"
        Effect = "Allow"
        Action = "dynamodb:Query"
        Resource = "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/haulvisor-orders"
      },
      {
        Sid    = "DynamoDBCompaniesReadWrite"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:UpdateItem"
        ]
        Resource = "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/haulvisor-companies"
      },
      {
        Sid    = "SNSPublishOrderRequests"
        Effect = "Allow"
        Action = "sns:Publish"
        Resource = data.aws_ssm_parameter.sns_topic_arn.value
      }
```

- [ ] **Step 4: Add CloudWatch alarm to alerting.tf**

Append to `infrastructure/alerting.tf`:

```hcl
# CloudWatch alarm: stale-order-refresh errors
resource "aws_cloudwatch_metric_alarm" "stale_order_refresh_errors" {
  alarm_name          = "haulvisor-mercer-stale-order-refresh-errors"
  alarm_description   = "Stale order refresh Lambda is failing"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.stale_order_refresh.function_name
  }

  alarm_actions = [aws_sns_topic.lambda_failures.arn]
  ok_actions    = [aws_sns_topic.lambda_failures.arn]
}
```

- [ ] **Step 5: Commit**

```bash
git add infrastructure/lambda.tf infrastructure/eventbridge.tf infrastructure/iam.tf infrastructure/alerting.tf
git commit -m "infra: add stale-order-refresh Lambda, EventBridge rule, IAM, and alerting"
```

---

### Task 8: Add last_available_orders_scan write to available-orders-scraper

**Files:**
- Modify: `lambdas/available-orders-scraper/src/index.ts`

- [ ] **Step 1: Add DynamoDB import and write logic**

At the top of `lambdas/available-orders-scraper/src/index.ts`, add imports:

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
```

Add DynamoDB client setup after the `PUSH_MODE` constant:

```typescript
const COMPANIES_TABLE = process.env.COMPANIES_TABLE ?? 'haulvisor-companies';

const ddbClient = new DynamoDBClient({
  ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {}),
});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

async function writeLastScanToCompany(totalOrders: number, newOrders: number): Promise<void> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: COMPANIES_TABLE,
        Key: { company_id: COMPANY_ID },
        UpdateExpression: 'SET last_available_orders_scan = :scan, updated_at = :now',
        ExpressionAttributeValues: {
          ':scan': {
            timestamp: new Date().toISOString(),
            total_orders: totalOrders,
            new_orders: newOrders,
          },
          ':now': new Date().toISOString(),
        },
      }),
    );
    console.log('Wrote last_available_orders_scan to company record');
  } catch (err) {
    // Non-fatal — log but don't fail the scrape
    console.error('Failed to write last_available_orders_scan:', err);
  }
}
```

- [ ] **Step 2: Call writeLastScanToCompany after each successful scrape**

In the handler function, after the scheduled scrape's `console.log(JSON.stringify({...}))` block (around line 251), add:

```typescript
    await writeLastScanToCompany(totalOrders, newOrders);
```

Also add it after the SQS trigger's log block (around line 209):

```typescript
      await writeLastScanToCompany(totalOrders, newOrders);
```

- [ ] **Step 3: Add COMPANIES_TABLE env var to lambda.tf**

In `infrastructure/lambda.tf`, add to the `available_orders_scraper` environment variables:

```hcl
      COMPANIES_TABLE      = "haulvisor-companies"
```

- [ ] **Step 4: Commit**

```bash
git add lambdas/available-orders-scraper/src/index.ts infrastructure/lambda.tf
git commit -m "feat: write last_available_orders_scan to company record after scrape"
```

---

### Task 9: Extend backend DTO and service for stale_order_refresh_config

**Files:**
- Modify: `../haulvisor-backend/api/src/companies/dto/data-sync-settings.dto.ts`
- Modify: `../haulvisor-backend/api/src/companies/companies.service.ts`

- [ ] **Step 1: Add DTO classes for stale_order_refresh_config**

In `../haulvisor-backend/api/src/companies/dto/data-sync-settings.dto.ts`, add a new nested DTO class before `DataSyncSettingsDto`:

```typescript
class StaleOrderRefreshConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @IsIn(VALID_TIMEZONES, { message: 'timezone must be a valid US timezone' })
  timezone!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'run_time must be HH:mm format' })
  run_time!: string;
}
```

Add to `DataSyncSettingsDto`:

```typescript
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => StaleOrderRefreshConfigDto)
  stale_order_refresh_config?: StaleOrderRefreshConfigDto;
```

- [ ] **Step 2: Handle stale_order_refresh_config in companies.service.ts**

In `../haulvisor-backend/api/src/companies/companies.service.ts`, in the `setDataSyncSettings()` method, add handling for the new field. Add this block alongside the existing `if` blocks:

```typescript
    if (settings.stale_order_refresh_config !== undefined) {
      setParts.push('stale_order_refresh_config = :sorc');
      exprValues[':sorc'] = settings.stale_order_refresh_config;
    }
```

Also update the method signature's `settings` parameter type to include:

```typescript
    stale_order_refresh_config?: {
      enabled: boolean;
      timezone: string;
      run_time: string;
    };
```

- [ ] **Step 3: Commit**

```bash
cd ../haulvisor-backend
git add api/src/companies/dto/data-sync-settings.dto.ts api/src/companies/companies.service.ts
git commit -m "feat: accept stale_order_refresh_config in data sync settings API"
```

---

### Task 10: Add admin panel popovers and icon columns

**Files:**
- Modify: `src/features/admin/views/desktop/desktop-admin-view.tsx`

- [ ] **Step 1: Extend the Company interface**

In `desktop-admin-view.tsx`, add to the `Company` interface (around line 51):

```typescript
  stale_order_refresh_config?: {
    enabled: boolean;
    timezone: string;
    run_time: string;
  };
  last_stale_refresh?: {
    timestamp: string;
    stale_count: number;
  };
  last_available_orders_scan?: {
    timestamp: string;
    total_orders: number;
    new_orders: number;
  };
```

- [ ] **Step 2: Add RefreshClockIcon and SearchIcon imports**

Update the lucide-react import to add `RefreshCwIcon` and `SearchIcon`:

```typescript
import { ChevronDownIcon, CheckIcon, ClockIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
```

- [ ] **Step 3: Create StaleRefreshPopover component**

Add before the `CompanySelect` component (around line 313):

```typescript
function StaleRefreshPopover({
  company,
  onSave,
}: {
  company: Company;
  onSave: (companyId: string, config: Company["stale_order_refresh_config"]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(
    company.stale_order_refresh_config ?? { enabled: false, timezone: "America/Chicago", run_time: "06:00" },
  );
  const [saving, setSaving] = useState(false);

  function resetAndOpen() {
    setConfig(company.stale_order_refresh_config ?? { enabled: false, timezone: "America/Chicago", run_time: "06:00" });
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(company.company_id, config);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const last = company.last_stale_refresh;
  const tz = config.timezone;

  return (
    <Popover open={open} onOpenChange={(v) => (v ? resetAndOpen() : setOpen(false))}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center rounded p-1 transition-colors hover:bg-accent ${company.stale_order_refresh_config?.enabled ? "text-primary" : "text-muted-foreground"}`}
          title="Stale order refresh"
        >
          <RefreshCwIcon className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Stale Order Refresh</h4>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Enabled</label>
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              onClick={() => setConfig({ ...config, enabled: !config.enabled })}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${config.enabled ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${config.enabled ? "translate-x-4" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Timezone */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Timezone</label>
            <Select value={config.timezone} onValueChange={(v) => setConfig({ ...config, timezone: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((t) => (
                  <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Run time */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Run after</label>
            <input
              type="time"
              className="h-8 w-full rounded border bg-background px-2 text-sm"
              value={config.run_time}
              onChange={(e) => setConfig({ ...config, run_time: e.target.value })}
            />
          </div>

          {/* Last run */}
          <div className="rounded-md border p-2 space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Last Run</div>
            {last ? (
              <>
                <div className="text-sm">
                  {new Date(last.timestamp).toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {last.stale_count === 0 ? "No stale orders found" : `${last.stale_count} stale order${last.stale_count === 1 ? "" : "s"} queued`}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Never run</div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={saving} onClick={handleSave}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Create LastScanPopover component**

Add right after `StaleRefreshPopover`:

```typescript
function LastScanPopover({ company }: { company: Company }) {
  const scan = company.last_available_orders_scan;
  const tz = company.fetch_schedule?.timezone ?? "America/Chicago";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center rounded p-1 transition-colors hover:bg-accent ${scan ? "text-primary" : "text-muted-foreground"}`}
          title="Last available orders scan"
        >
          <SearchIcon className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="start">
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Last Available Orders Scan</h4>
          {scan ? (
            <div className="space-y-2">
              <div className="text-sm">
                {new Date(scan.timestamp).toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border p-2 text-center">
                  <div className="text-lg font-semibold tabular-nums">{scan.total_orders.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="rounded-md border p-2 text-center">
                  <div className="text-lg font-semibold tabular-nums">{scan.new_orders.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">New</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Never run</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 5: Add table columns and popover cells**

In the `<TableHeader>`, add two new `<TableHead>` elements before the "Actions" column (before line 714):

```tsx
                  <TableHead>Stale Refresh</TableHead>
                  <TableHead>Last Scan</TableHead>
```

In the `<TableBody>` map, add two new `<TableCell>` elements before the Actions cell (before line 822):

```tsx
                    <TableCell>
                      <StaleRefreshPopover
                        company={company}
                        onSave={async (companyId, config) => {
                          try {
                            await fetchApi(`companies/${companyId}/data-sync-settings`, {
                              method: "PUT",
                              body: JSON.stringify({ stale_order_refresh_config: config }),
                            });
                            setCompanies((prev) =>
                              prev.map((c) =>
                                c.company_id === companyId
                                  ? { ...c, stale_order_refresh_config: config }
                                  : c,
                              ),
                            );
                            toast.success("Stale refresh config updated");
                          } catch {
                            toast.error("Failed to update stale refresh config");
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <LastScanPopover company={company} />
                    </TableCell>
```

- [ ] **Step 6: Verify the frontend builds**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor && npm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/views/desktop/desktop-admin-view.tsx
git commit -m "feat: add stale refresh and last scan popovers to admin panel"
```

---

### Task 11: Run all tests and verify

- [ ] **Step 1: Run stale-order-refresh tests**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-mercer/lambdas/stale-order-refresh && npx jest --no-cache`
Expected: All tests PASS

- [ ] **Step 2: Run existing mercer tests to verify no regressions**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-mercer && npm test`
Expected: All workspace tests PASS

- [ ] **Step 3: Verify frontend builds**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor && npm run build`
Expected: Build succeeds with no errors
