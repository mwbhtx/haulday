# Mobile Routes Experience & Architecture Refactor

**Date:** 2026-03-28
**Status:** Approved

## Overview

Full project architecture refactor into a feature-based module structure with a shared core, plus a complete mobile redesign of the routes page using an Uber-inspired sequential flow. The architecture is designed to support a future React Native mobile app.

## Goals

- Refactor project into industry-standard feature-based architecture
- Separate data/logic (hooks, services) from presentation (views) for cross-platform reuse
- Redesign mobile routes experience as a sequential screen flow (not responsive desktop)
- Add mobile bottom tab navigation
- Add backend-persisted recent searches

---

## 1. Project Architecture

### New Folder Structure

```
src/
  core/                           # Platform-agnostic, zero UI imports
    hooks/                        # Data hooks (useRoutes, useOrders, useAnalytics, useSettings)
    services/                     # API client, auth service, storage abstractions
    types/                        # Re-exports from @mwbhtx/haulvisor-core + app-specific types
    utils/                        # Pure functions (formatters, validators, cn())

  features/
    routes/
      hooks/                      # useRecentSearches, useRouteFilters, useMobileRouteNav
      views/
        desktop/                  # DesktopRoutesView (current map+sidebar layout)
        mobile/                   # MobileRoutesView (new Uber-like flow)
          screens/                # Individual screen components
      components/                 # Shared route components (RouteCard, RouteDetail, etc.)

    orders/
      hooks/
      views/
        desktop/
        mobile/                   # (future)
      components/

    dashboard/
      hooks/
      views/
        desktop/
        mobile/                   # (future)
      components/

    settings/
      hooks/
      views/
        desktop/
        mobile/                   # (future)
      components/

    admin/
      hooks/
      views/
      components/

  platform/
    web/
      components/
        ui/                       # shadcn primitives (Button, Card, Dialog, etc.)
        layouts/                  # AppShell, DesktopNav, MobileBottomNav
      hooks/                      # useIsMobile, useMediaQuery (web-specific)

  app/                            # Next.js app router - thin shells only
    (app)/
      routes/page.tsx
      orders/page.tsx
      dashboard/page.tsx
      settings/page.tsx
      admin/page.tsx
      layout.tsx                  # App layout - picks DesktopNav or MobileBottomNav
    login/page.tsx
    layout.tsx                    # Root layout (providers)
```

### Dependency Rules

- `core/` has no imports from `features/`, `platform/`, or `app/`
- `features/` can import from `core/` and from `platform/web/components/ui/` (UI primitives), but not from other features
- `platform/` can import from `core/` only
- `app/` can import from everything (composition layer)
- Page files are thin shells (~20 lines max): detect platform, render the correct view

---

## 2. Mobile Routes Flow

### Screen Navigation

Managed by local state (no URL changes) for a native app feel:

```typescript
type MobileScreen =
  | { type: 'home' }
  | { type: 'search' }
  | { type: 'filters' }
  | { type: 'results' }
  | { type: 'detail', routeId: string }
```

### Screen 1: Home

- **Top:** Search bar (rounded, placeholder "Search Routes", filter icon aligned right inside bar)
- **Below:** "Recent Searches" label, vertical list of recent searches
  - Each item: trip type badge + "Origin -> Destination" (e.g., "One-way - Dallas -> Houston")
  - Tap to immediately re-run search with saved parameters
- Tapping the search bar -> Screen 2 (Search Sheet)
- Tapping the filter icon -> Screen 3 (Filters Sheet)

### Screen 2: Search Sheet

- Full-screen overlay, slides up
- Header: "Plan Your Route" with back arrow
- Contents:
  - Trip type toggle (One-way / Round-trip)
  - Origin field (Mapbox geocoder)
  - Destination field (Mapbox geocoder)
  - "Search Routes" button (full-width, prominent)
- Tapping Search -> saves to recent searches, closes sheet, shows Screen 4

### Screen 3: Filters Sheet

- Full-screen overlay or bottom sheet
- All advanced filters in scrollable form:
  - Trailer type
  - Max idle days
  - Deadhead %
  - Home-by date
  - Number of legs
  - Sort preference
- "Apply Filters" button at bottom
- Closes back to previous screen (home or results)

### Screen 4: Results

- **Top:** Persistent bar showing current search ("Plan Your Route: Dallas -> Houston") with filter icon
- Tapping bar reopens Search Sheet to modify
- **Below:** Vertical scrollable list of route cards
  - Each card: origin -> destination, total miles, daily profit, number of legs, trip type badge
  - No maps on cards
- Tap a card -> Screen 5

### Screen 5: Route Detail

- Full-screen slide-in from right
- Back button returns to results
- **Tabbed content:**
  - **Overview** - profit metrics, total miles, deadhead %, dates
  - **Segments** - individual leg details (pickup, delivery, miles, rate)
  - **Timeline** - chronological view of the route
- No map (optional "View on Map" as future addition)

### Transitions

- Framer Motion slide animations between screens
- Back gestures / back button navigate the screen stack

---

## 3. Mobile Bottom Navigation

- Fixed to bottom of viewport, mobile only (< 768px)
- 4 tabs with icons and labels:
  - **Routes** (Search icon) -> `/routes`
  - **Orders** (Clipboard icon) -> `/orders`
  - **Dashboard** (BarChart icon) -> `/dashboard`
  - **Settings** (Gear icon) -> `/settings`
- Active tab highlighted
- Dark theme styling consistent with app (`#111111` background area)
- Admin page accessed from within Settings (not a tab)
- Desktop nav (current top header) stays unchanged

---

## 4. Recent Searches

### Data Model

```typescript
interface RecentSearch {
  id: string
  userId: string
  tripMode: 'one_way' | 'round_trip'
  origin: { label: string; coordinates: [number, number] }
  destination: { label: string; coordinates: [number, number] }
  filters: {
    trailerType?: string
    maxIdle?: number
    deadheadPercent?: number
    homeBy?: string
    legs?: number
    sort?: string
  }
  searchedAt: string  // ISO timestamp
}
```

### Behavior

- Saved automatically when a search is executed
- Max 20 per user (oldest dropped when exceeded)
- Flat list sorted by most recent
- Display: trip type badge + "Origin -> Destination"
- Tap re-runs with all saved parameters including advanced filters
- Available on both mobile and desktop
- Deduplicated: same origin + destination + trip type updates timestamp and filters

### Backend Requirement

- New endpoints needed in `haulvisor-backend`: `GET /recent-searches` and `POST /recent-searches`
- Not implemented as part of this design - flagged for backend work

### Hook

- `useRecentSearches()` in `features/routes/hooks/`
- Wraps React Query for fetch and save

---

## 5. App Layout & Platform Detection

### `useIsMobile` Hook

- Location: `platform/web/hooks/use-is-mobile.ts`
- Uses `window.innerWidth < 768` with resize listener
- Single source of truth - replaces all scattered `isMobile` state in individual components

### App Layout (`app/(app)/layout.tsx`)

- Detects mobile via `useIsMobile`
- **Desktop:** Renders current `AppShell` with top nav
- **Mobile:** Renders content area + `MobileBottomNav`, no top nav (each mobile view manages its own header)
- Content area gets bottom padding on mobile for nav bar clearance

### Page Shells

```tsx
// app/(app)/routes/page.tsx
export default function RoutesPage() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileRoutesView /> : <DesktopRoutesView />
}
```

Pages are just platform switches. All logic lives in views and hooks.

---

## 6. Migration Map

### Core

| Current | New |
|---------|-----|
| `lib/hooks/use-routes.ts` | `core/hooks/use-routes.ts` |
| `lib/hooks/use-orders.ts` | `core/hooks/use-orders.ts` |
| `lib/hooks/use-analytics.ts` | `core/hooks/use-analytics.ts` |
| `lib/hooks/use-settings.ts` | `core/hooks/use-settings.ts` |
| `lib/api.ts` | `core/services/api.ts` |
| `lib/auth.ts` | `core/services/auth.ts` |
| `lib/types.ts` | `core/types/index.ts` |
| `lib/utils.ts` | `core/utils/index.ts` |

### Platform

| Current | New |
|---------|-----|
| `components/ui/*` | `platform/web/components/ui/*` |
| `components/layout/app-shell.tsx` | `platform/web/components/layouts/app-shell.tsx` |
| (new) | `platform/web/components/layouts/mobile-bottom-nav.tsx` |
| (new) | `platform/web/hooks/use-is-mobile.ts` |

### Features - Routes

| Current | New |
|---------|-----|
| `components/map/route-map.tsx` | `features/routes/components/route-map.tsx` |
| `components/map/search-form.tsx` | `features/routes/components/search-form.tsx` |
| `components/map/location-sidebar.tsx` | `features/routes/views/desktop/location-sidebar.tsx` |
| `components/map/mobile-carousel.tsx` | **Removed** - replaced by new mobile views |
| `components/map/route-inspector.tsx` | `features/routes/components/route-inspector.tsx` |
| (new) | `features/routes/views/desktop/desktop-routes-view.tsx` |
| (new) | `features/routes/views/mobile/mobile-routes-view.tsx` |
| (new) | `features/routes/views/mobile/screens/*` |
| (new) | `features/routes/hooks/use-recent-searches.ts` |
| (new) | `features/routes/hooks/use-mobile-route-nav.ts` |
| (new) | `features/routes/components/route-card.tsx` |

### Features - Orders

| Current | New |
|---------|-----|
| `components/orders/*` | `features/orders/components/*` |
| Orders page logic | `features/orders/views/desktop/desktop-orders-view.tsx` |

### Features - Dashboard

| Current | New |
|---------|-----|
| `components/dashboard/*` | `features/dashboard/components/*` |
| Dashboard page logic | `features/dashboard/views/desktop/desktop-dashboard-view.tsx` |

### Auth

| Current | New |
|---------|-----|
| `components/auth-provider.tsx` | `core/services/auth-provider.tsx` |
| `components/providers.tsx` | `core/services/providers.tsx` |

### Removed

- `components/map/mobile-carousel.tsx` - replaced by new mobile views
- Scattered `isMobile` state in individual components - replaced by `useIsMobile` hook

---

## Out of Scope

- React Native app (future)
- Mobile redesign for Orders, Dashboard, Settings pages (future)
- Backend endpoint implementation for recent searches (flagged for haulvisor-backend)
- Map view within mobile route detail (future "View on Map" button)
