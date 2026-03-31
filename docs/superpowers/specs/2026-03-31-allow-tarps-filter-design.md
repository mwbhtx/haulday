# No Tarps Filter — Design Spec

## Goal

Add a "No Tarps" boolean filter to the route search pipeline. When checked, orders requiring a tarp (`tarp_height` is non-null and non-empty) are excluded from candidate results before any route analysis runs. The preference persists in user settings and can be overridden per-search via the All Filters dropdown.

## Default Behaviour

`no_tarps` defaults to `false` — tarp loads are included unless the user opts in to filtering them out. Checking "No Tarps" applies the constraint.

---

## Backend (`haulvisor-backend`)

### `DriverProfile` interface (`route-search.engine.ts`)

Add:
```typescript
no_tarps: boolean;
```

### `resolveSearchConfig` (`route-search.engine.ts`)

Pick `no_tarps` with the standard `pick()` helper:
```typescript
no_tarps: pick<boolean>('no_tarps', false),
```
Resolution order: query param → user settings → default `false`.

### SQL builder (`route-search.sql.ts`)

Add a condition mirroring the `hazmat_certified` pattern:
```typescript
if (profile.no_tarps) {
  conditions.push(`(tarp_height IS NULL OR tarp_height = '')`);
}
```
This filters at the database level before any chain-building or cost analysis runs.

### DTO (`dto/route-search.dto.ts`)

Add optional field:
```typescript
@IsOptional()
@Transform(({ value }) => value === 'true' || value === '1')
no_tarps?: boolean;
```

---

## Frontend (`haulvisor`)

### Search Form — All Filters dropdown (`search-form.tsx`)

- Add `noTarps` state, initialised from `settings.no_tarps ?? false`
- Add to the driver capability checkbox array:
  ```typescript
  { label: "No Tarps", checked: noTarps, key: "no_tarps", setter: setNoTarps }
  ```
- Include `no_tarps: noTarps` in the search params object sent to the API

### User Settings (`desktop-settings-view.tsx`)

- Add `noTarps` state, initialised from `settings.no_tarps ?? false`
- Add a `CertToggle` in the driver profile section:
  ```tsx
  <CertToggle label="No Tarps" checked={noTarps} onChange={() => handleBoolToggle("no_tarps", noTarps, setNoTarps)} />
  ```

### Mobile Filters Sheet (`screens/filters-sheet.tsx`)

- Add `no_tarps` to the `AdvancedFilters` interface (alongside `legs`, `homeBy`, `trailerType`)
- Add a toggle rendered with the same style as other bool filters
- Propagate through `mobile-routes-view.tsx` → `buildAndFireSearch` → search params

---

## Data Flow

```
User checks "No Tarps" (search form or settings)
  → no_tarps: true included in RouteSearchParams
  → Backend DTO receives no_tarps
  → resolveSearchConfig picks no_tarps into DriverProfile
  → buildCandidatesSql: if no_tarps, WHERE tarp_height IS NULL OR tarp_height = ''
  → Only tarp-free orders returned as candidates
  → Chain-building and scoring run on filtered set
```

---

## Out of Scope

- No changes to `haulvisor-core` (no shared type changes needed)
- No changes to the TARP badge display on route detail — badge still shows when a tarp leg is present in results from other users' searches
- No migration needed — `no_tarps` absent from settings is treated as `false`
