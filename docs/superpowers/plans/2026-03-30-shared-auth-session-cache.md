# Shared Auth Session Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache Playwright auth sessions in DynamoDB so concurrent Mercer Lambdas share one Keycloak login instead of each authenticating independently.

**Architecture:** A shared module (`lambdas/shared/session-cache.ts`) provides get/put/delete for Playwright storage state in a DynamoDB table with 20-min TTL. Both scraper Lambdas check cache before auth, fall back to fresh login if stale.

**Tech Stack:** TypeScript, AWS DynamoDB, Playwright, Terraform

---

## File Structure

### haulvisor-mercer
- **Create:** `lambdas/shared/session-cache.ts` — get/put/delete cached Playwright storage state
- **Modify:** `lambdas/available-orders-scraper/src/index.ts` — use session cache for auth
- **Modify:** `lambdas/order-details-scraper/src/index.ts` — use session cache for auth (batch + direct paths)
- **Modify:** `infrastructure/iam.tf` — add DynamoDB permissions for sessions table
- **Create:** `infrastructure/dynamodb.tf` — new sessions table with TTL

---

### Task 1: Create session-cache shared module

**Files:**
- Create: `lambdas/shared/session-cache.ts`

- [ ] **Step 1: Create session-cache.ts**

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const SESSIONS_TABLE = process.env.SESSIONS_TABLE ?? 'haulvisor-mercer-sessions';
const SESSION_KEY = 'mercer-auth';
const SESSION_TTL_MINUTES = 20;

const client = new DynamoDBClient({
  ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {}),
});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

/**
 * Retrieve cached Playwright storage state from DynamoDB.
 * Returns the storage state JSON string if fresh, null if missing or expired.
 */
export async function getCachedSession(): Promise<string | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: SESSIONS_TABLE,
        Key: { session_key: SESSION_KEY },
      }),
    );

    if (!result.Item?.storage_state) return null;

    // Client-side TTL check as safety margin (DynamoDB TTL can lag)
    const createdAt = new Date(result.Item.created_at as string).getTime();
    const ageMinutes = (Date.now() - createdAt) / 60_000;
    if (ageMinutes >= SESSION_TTL_MINUTES) {
      console.log(`Cached session is ${ageMinutes.toFixed(0)}m old (TTL: ${SESSION_TTL_MINUTES}m), treating as expired.`);
      return null;
    }

    console.log(`Using cached session (${ageMinutes.toFixed(0)}m old)`);
    return result.Item.storage_state as string;
  } catch (err) {
    console.error('Failed to read session cache:', err);
    return null;
  }
}

/**
 * Store Playwright storage state in DynamoDB with a 20-minute TTL.
 */
export async function cacheSession(storageState: string): Promise<void> {
  try {
    const now = new Date();
    const ttl = Math.floor(now.getTime() / 1000) + SESSION_TTL_MINUTES * 60;

    await docClient.send(
      new PutCommand({
        TableName: SESSIONS_TABLE,
        Item: {
          session_key: SESSION_KEY,
          storage_state: storageState,
          created_at: now.toISOString(),
          ttl,
        },
      }),
    );
    console.log('Cached new auth session');
  } catch (err) {
    console.error('Failed to write session cache:', err);
  }
}

/**
 * Delete a stale cached session.
 */
export async function deleteCachedSession(): Promise<void> {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: SESSIONS_TABLE,
        Key: { session_key: SESSION_KEY },
      }),
    );
    console.log('Deleted stale session cache');
  } catch (err) {
    console.error('Failed to delete session cache:', err);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lambdas/shared/session-cache.ts
git commit -m "feat: add shared session cache module for Mercer auth"
```

---

### Task 2: Add Terraform infrastructure for sessions table

**Files:**
- Create: `infrastructure/dynamodb.tf`
- Modify: `infrastructure/iam.tf`

- [ ] **Step 1: Create dynamodb.tf with sessions table**

Create `infrastructure/dynamodb.tf`:

```hcl
resource "aws_dynamodb_table" "sessions" {
  name         = "haulvisor-mercer-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "session_key"

  attribute {
    name = "session_key"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name = "haulvisor-mercer-sessions"
  }
}
```

- [ ] **Step 2: Add DynamoDB permissions for sessions table to iam.tf**

In `infrastructure/iam.tf`, add a new statement to the `aws_iam_role_policy.scraper` policy's Statement array:

```hcl
      {
        Sid    = "DynamoDBSessions"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem"
        ]
        Resource = aws_dynamodb_table.sessions.arn
      }
```

- [ ] **Step 3: Add SESSIONS_TABLE env var to both scraper Lambdas in lambda.tf**

In `infrastructure/lambda.tf`, add to both `available_orders_scraper` and `order_details_scraper` environment variables:

```hcl
      SESSIONS_TABLE       = aws_dynamodb_table.sessions.name
```

- [ ] **Step 4: Commit**

```bash
git add infrastructure/dynamodb.tf infrastructure/iam.tf infrastructure/lambda.tf
git commit -m "infra: add DynamoDB sessions table and IAM permissions"
```

---

### Task 3: Integrate session cache into available-orders-scraper

**Files:**
- Modify: `lambdas/available-orders-scraper/src/index.ts`

The current auth flow (inside `runScrape()`, around lines 93-104) is:

```typescript
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  userAgent: '...',
});
const page = await context.newPage();
page.setDefaultNavigationTimeout(60_000);
page.setDefaultTimeout(30_000);
await authenticateMercer(page, credentials);
await page.close();
```

- [ ] **Step 1: Add session cache import**

Add to the top of the file, alongside the other shared imports:

```typescript
import { getCachedSession, cacheSession, deleteCachedSession } from '../../shared/session-cache.js';
```

- [ ] **Step 2: Replace auth flow with cache-aware flow**

Replace the context creation + auth block inside `runScrape()` with:

```typescript
    // Try cached session first
    const cachedState = await getCachedSession();
    let context;
    let needsFreshAuth = true;

    if (cachedState) {
      context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        storageState: JSON.parse(cachedState),
      });
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(60_000);
      page.setDefaultTimeout(30_000);

      // Validate session — navigate to Available Orders page and check for login redirect
      const loginUrl = process.env.MERCER_URL || 'https://mercerweb.mercer-trans.com/MercerWeb/AvailableLoads.faces';
      await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 60_000 });
      const isLoginPage = page.url().includes('keycloak') || page.url().includes('/auth/realms/');

      if (isLoginPage) {
        console.log('Cached session is stale, performing fresh auth...');
        await deleteCachedSession();
        await authenticateMercer(page, credentials);
        const newState = JSON.stringify(await context.storageState());
        await cacheSession(newState);
      } else {
        console.log('Cached session is valid, skipping auth.');
        needsFreshAuth = false;
      }
      await page.close();
    } else {
      context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(60_000);
      page.setDefaultTimeout(30_000);
      await authenticateMercer(page, credentials);
      const newState = JSON.stringify(await context.storageState());
      await cacheSession(newState);
      await page.close();
    }
```

Note: the `credentials` variable is already defined earlier in `runScrape()`. The rest of the function (scraping) remains unchanged — it uses `context` which now has valid auth cookies either way.

- [ ] **Step 3: Commit**

```bash
git add lambdas/available-orders-scraper/src/index.ts
git commit -m "feat: use shared session cache in available-orders-scraper"
```

---

### Task 4: Integrate session cache into order-details-scraper

**Files:**
- Modify: `lambdas/order-details-scraper/src/index.ts`

Two auth paths need updating: `handleSqsBatch()` (line ~111-122) and `handleDirectInvocation()` (line ~198-219).

- [ ] **Step 1: Add session cache import**

Add to the top of the file:

```typescript
import { getCachedSession, cacheSession, deleteCachedSession } from '../../shared/session-cache.js';
```

- [ ] **Step 2: Extract shared auth-with-cache helper**

Add a helper function after the imports to avoid duplicating the cache logic:

```typescript
/**
 * Create an authenticated browser context, using cached session if available.
 * Returns the context with valid auth cookies.
 */
async function createAuthenticatedContext(
  browser: import('playwright-chromium').Browser,
  credentials: { username: string; password: string },
): Promise<import('playwright-chromium').BrowserContext> {
  const cachedState = await getCachedSession();

  if (cachedState) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      storageState: JSON.parse(cachedState),
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(60_000);
    page.setDefaultTimeout(30_000);

    // Validate session
    const loginUrl = process.env.MERCER_URL || 'https://mercerweb.mercer-trans.com/MercerWeb/AvailableLoads.faces';
    await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 60_000 });
    const isLoginPage = page.url().includes('keycloak') || page.url().includes('/auth/realms/');

    if (isLoginPage) {
      console.log('Cached session is stale, performing fresh auth...');
      await deleteCachedSession();
      await authenticateMercer(page, credentials);
      const newState = JSON.stringify(await context.storageState());
      await cacheSession(newState);
    } else {
      console.log('Cached session is valid, skipping auth.');
    }
    await page.close();
    return context;
  }

  // No cached session — fresh auth
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(60_000);
  page.setDefaultTimeout(30_000);
  await authenticateMercer(page, credentials);
  const newState = JSON.stringify(await context.storageState());
  await cacheSession(newState);
  await page.close();
  return context;
}
```

- [ ] **Step 3: Update handleSqsBatch to use createAuthenticatedContext**

In `handleSqsBatch()`, replace lines 111-122 (from `const context = await browser.newContext(` through `await page.close()`) with:

```typescript
    const context = await createAuthenticatedContext(browser, credentials);
```

- [ ] **Step 4: Update handleDirectInvocation to use createAuthenticatedContext**

In `handleDirectInvocation()`, replace lines 209-219 (from `const context = await browser.newContext(` through `await authenticateMercer(page, credentials);`) with:

```typescript
    const context = await createAuthenticatedContext(browser, credentials);
```

Then update the scrapeOrderDetail call — it currently uses `page` from the old code, but now we need to open a new page from the context:

```typescript
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(60_000);
    page.setDefaultTimeout(30_000);
    await scrapeOrderDetail(page, orderId, undefined, unitId);
```

- [ ] **Step 5: Commit**

```bash
git add lambdas/order-details-scraper/src/index.ts
git commit -m "feat: use shared session cache in order-details-scraper"
```

---

### Task 5: Update deploy workflow and verify

- [ ] **Step 1: Run all mercer tests**

Run: `cd /Users/matthewbennett/Documents/GitHub/haulvisor-mercer && npm test`
Expected: All tests pass

- [ ] **Step 2: Commit any fixes if needed and push**

```bash
git push
```
