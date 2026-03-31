# Search Radius Filter Design

**Date:** 2026-03-31
**Status:** Approved

## Overview

Add a search radius slider to the All Filters popover (desktop) and mobile filters sheet so users can control how far from their origin the system searches for candidate loads. Saves persistently to user settings. Backend default raised from 150 → 250 miles.

## Background

The route search engine queries candidate loads within a configurable radius (`search_radius_miles`) of the search origin. For multi-leg routes, each subsequent leg is queried within the same radius of the previous leg's delivery point. The default was 150mi but 250mi is more appropriate for long-haul trucking. The field `preferred_radius_miles` already exists in user Settings and `search_radius_miles` already exists in `RouteSearchParams`, but neither is currently wired to the actual search query.

## Design

### Slider spec
- Range: 50–350 miles
- Step: 25 miles
- Default: 250 miles
- Persists to: `preferred_radius_miles` in user settings

### Desktop — AllFiltersPopover (`search-form.tsx`)
- Add a "Search Radius" section above or below the existing filters
- Single-value `Slider` component (same pattern as `DaysOutPill`)
- Display current value as `{radius} mi` next to the label
- Saves to settings via `save({ preferred_radius_miles: value })` on change (same debounce pattern as max weight or immediate save on release)
- Counts toward the `activeCount` badge when value differs from default (250)

### Desktop — `driverProfile` wiring (`search-form.tsx`)
- Add `search_radius_miles: settings.preferred_radius_miles ?? undefined` to the `driverProfile` object so it flows into every `fireSearch()` call automatically

### Mobile — FiltersSheet + mobile-routes-view
- Add `searchRadius: number` to the `AdvancedFilters` interface (default 250)
- Add a radius row to `FiltersSheet` using the existing `FilterRow` pattern with a `Slider`
- Seed from `settings.preferred_radius_miles ?? 250` on open
- Pass as `search_radius_miles` in `buildAndFireSearch` params

### Backend — `route-search.engine.ts`
- Change `DEFAULT_SEARCH_RADIUS` from 150 → 250

## What Does Not Change
- Backend `MAX_SEARCH_RADIUS` stays at 500 (safety cap)
- The Settings page "Max Deadhead" field already writes to `preferred_radius_miles` — no changes needed, it stays in sync automatically
- No changes to the SQL candidate query structure
