# Departure & Return Time Filters + Bookmark Fix

**Date:** 2026-03-30

## Overview

Add departure date/time ("Leave By") and return time ("Home By" time) filters to the route search. All route results are simulated from the departure date/time to determine if route requirements (delivery, pickup, home by) can be met. Also restore the bookmark icon on the route detail panel.

## 1. New Filter: "Leave By"

### UI
- New pill in the search filter bar: **"Leave By: Any"**
- Popover contains:
  - Calendar date picker (same pattern as existing "Home By")
  - Time preset dropdown: **"Any"** (default) + hourly from **5:00 AM to 9:00 PM** (17 slots)
- Pill label updates to show selection, e.g. "Leave By: Mar 30, 8:00 AM"
- Clear button resets both date and time

### Query Parameters
- `depart_by` — date string `YYYY-MM-DD`
- `depart_by_time` — time string in UTC `HH:00` (e.g. `"13:00"`), or omitted when "Any"

### Timezone Conversion
- Display times in the **origin city's local timezone**
- Use `geo-tz` package (offline lat/lng → IANA timezone lookup)
- Convert selected local hour to UTC before sending to backend

## 2. Updated Filter: "Home By" (add time)

### UI
- Existing "Home By" calendar pill stays as-is
- Add time preset dropdown below/beside the calendar within the same popover
- Same options: "Any" (default) + 5:00 AM–9:00 PM hourly
- Pill label updates to include time when set, e.g. "Home By: Apr 2, 5:00 PM"

### Query Parameters
- `home_by` — stays as `YYYY-MM-DD` (existing, unchanged)
- `home_by_time` — new, time string in UTC `HH:00`, or omitted when "Any"

### Timezone Conversion
- Display times in the **home/return location's timezone**
- Same `geo-tz` approach as Leave By

## 3. Time Preset Options

Shared constant for both filters:

```typescript
const TIME_PRESETS = [
  { label: "Any", value: "" },
  { label: "5:00 AM", value: "05:00" },
  { label: "6:00 AM", value: "06:00" },
  { label: "7:00 AM", value: "07:00" },
  { label: "8:00 AM", value: "08:00" },
  { label: "9:00 AM", value: "09:00" },
  { label: "10:00 AM", value: "10:00" },
  { label: "11:00 AM", value: "11:00" },
  { label: "12:00 PM", value: "12:00" },
  { label: "1:00 PM", value: "13:00" },
  { label: "2:00 PM", value: "14:00" },
  { label: "3:00 PM", value: "15:00" },
  { label: "4:00 PM", value: "16:00" },
  { label: "5:00 PM", value: "17:00" },
  { label: "6:00 PM", value: "18:00" },
  { label: "7:00 PM", value: "19:00" },
  { label: "8:00 PM", value: "20:00" },
  { label: "9:00 PM", value: "21:00" },
];
```

Values are stored in 24-hour local format in the UI state. Converted to UTC only when building query params.

## 4. Timezone Utility

### Package
- `geo-tz` — offline timezone lookup from coordinates, no API calls

### Helper Function
```typescript
// src/core/utils/local-to-utc.ts
import { find as geoTzFind } from "geo-tz";

export function localHourToUtc(
  localHour: string,   // "08:00" (24h local)
  lat: number,
  lng: number,
): string {
  // 1. geoTzFind(lat, lng) → IANA timezone (e.g. "America/Chicago")
  // 2. Build a Date in that timezone for today at localHour
  // 3. Convert to UTC, return "HH:00"
}
```

## 5. Filter State Changes

### New Fields in Filter State
Add to existing filter state (persisted in sessionStorage `"hv-route-filters"`):

```typescript
depart_by: string;       // "YYYY-MM-DD" or ""
depart_by_time: string;  // "08:00" (local) or "" for Any
home_by_time: string;    // "17:00" (local) or "" for Any
```

### Query Param Construction
In `use-routes.ts`, when building URLSearchParams:
- Include `depart_by` when set
- Include `depart_by_time` as UTC-converted value when not "Any"
- Include `home_by_time` as UTC-converted value when not "Any"
- Origin lat/lng used for Leave By timezone; home base lat/lng for Home By timezone

## 6. Bookmark Icon Fix

### Problem
The `RouteDetailPanel` accepts `isWatchlisted` and `onToggleWatchlist` props, but `desktop-routes-view.tsx` does not pass them (lines 296-304). The watchlist state lives in `route-list.tsx`.

### Solution
Lift the watchlist state (or expose it via callback) so `desktop-routes-view.tsx` can pass `isWatchlisted` and `onToggleWatchlist` to `RouteDetailPanel`. Options:

**Option A (recommended):** Have `RouteList` expose the current watchlist set and toggle function via a callback/ref prop, so the parent can wire it into `RouteDetailPanel`.

**Option B:** Lift watchlist state up to `desktop-routes-view.tsx` and pass it down to both `RouteList` and `RouteDetailPanel`.

Either way, the result is `RouteDetailPanel` receives both props and the bookmark icon renders above "Route Summary".

## 7. Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `geo-tz` dependency |
| `src/core/utils/local-to-utc.ts` | **New** — timezone conversion helper |
| `src/features/routes/components/search-form.tsx` | Add "Leave By" pill, add time dropdown to "Home By" pill |
| `src/core/hooks/use-routes.ts` | Send new query params (`depart_by`, `depart_by_time`, `home_by_time`) |
| `src/features/routes/views/desktop/desktop-routes-view.tsx` | Wire watchlist props to `RouteDetailPanel`; add new filter state fields |
| `src/features/routes/views/desktop/route-list.tsx` | Expose watchlist state to parent |
| Filter state type (wherever defined) | Add `depart_by`, `depart_by_time`, `home_by_time` fields |

## 8. Out of Scope

- Backend implementation of `depart_by`, `depart_by_time`, `home_by_time` query handling
- Mobile view updates (will follow separately)
- Time zone display label in the UI (future nice-to-have)
