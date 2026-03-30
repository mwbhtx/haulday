# Shared Mercer Auth Session Cache — Design Spec

## Problem

Every Lambda invocation (available-orders-scraper and order-details-scraper) performs a full Keycloak PKCE login against Mercer's auth server. With 3 concurrent order-details Lambdas processing stale refresh batches, that's 3+ separate logins in quick succession. This adds ~5-10 seconds of latency per invocation and puts unnecessary load on Mercer's auth infrastructure.

## Solution

A shared DynamoDB-backed session cache that stores Playwright's `storageState` (cookies + localStorage) after a successful Keycloak login. Subsequent Lambda invocations check the cache first and skip auth if a valid session exists. If the cached session is stale, the Lambda falls back to fresh auth transparently.

## Architecture

### Shared Module: `lambdas/shared/session-cache.ts`

Two functions consumed by any Lambda that authenticates with Mercer:

- **`getCachedSession()`** — reads from DynamoDB, returns Playwright-compatible storage state JSON if the entry exists and hasn't expired (TTL check is handled by DynamoDB, but we also check `created_at` client-side as a safety margin). Returns `null` if missing or expired.
- **`cacheSession(storageState)`** — writes the Playwright storage state JSON to DynamoDB with a 20-minute TTL.
- **`deleteCachedSession()`** — removes a stale entry when auth validation fails.

### Integration Flow

Current flow in both scrapers:
```
browser.newContext() → authenticateMercer(page, credentials) → scrape
```

New flow:
```
cachedState = getCachedSession()
if (cachedState)
  context = browser.newContext({ storageState: cachedState })
  page = context.newPage()
  validate session (load page, check for login redirect)
  if redirected to login:
    deleteCachedSession()
    do fresh authenticateMercer(page, credentials)
    cacheSession(context.storageState())
else
  context = browser.newContext()
  page = context.newPage()
  authenticateMercer(page, credentials)
  cacheSession(context.storageState())
proceed with scrape
```

### Session Validation

After creating a context with cached cookies, navigate to the Mercer job board URL. If the page redirects to Keycloak login (detected by URL containing the Keycloak auth domain), the session is stale. This check costs one page load (~2-3 seconds) but avoids mid-scrape failures.

### Fallback Behavior

When a cached session is invalid:
1. Delete the stale cache entry from DynamoDB
2. Perform fresh Keycloak PKCE auth on the current page
3. Cache the new session state
4. Continue with the scrape as normal

No scrape ever fails due to a bad cached session — fallback is transparent.

### DynamoDB Table

- **Table name:** `haulvisor-mercer-sessions`
- **Partition key:** `session_key` (String) — value: `"mercer-auth"`
- **Attributes:**
  - `storage_state` — JSON string from `context.storageState()`
  - `created_at` — ISO 8601 timestamp
  - `ttl` — Unix epoch timestamp, 20 minutes from creation (DynamoDB TTL)
- **TTL attribute:** `ttl`

Single-row table. DynamoDB TTL automatically cleans up expired entries.

### TTL: 20 Minutes

Keycloak sessions typically last 30-60 minutes. A 20-minute cache TTL provides aggressive reuse while staying well under the expiry window. A scrape takes ~9 seconds, so even a 19-minute-old session will remain valid for the duration.

### Infrastructure Changes

- **New DynamoDB table:** `haulvisor-mercer-sessions` with TTL enabled (Terraform)
- **IAM policy addition:** `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:DeleteItem` on the new table (added to existing scraper role)

### Lambdas Affected

- **available-orders-scraper** — uses session cache for Keycloak auth
- **order-details-scraper** — uses session cache for Keycloak auth
- **stale-order-refresh** — not affected (no Playwright, no auth)

## Out of Scope

- Multi-company session caching (only Mercer)
- Session refresh/extension (just let it expire and re-auth)
- Metrics on cache hit/miss rate (can be added later via CloudWatch if needed)
