# No Tarps Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "No Tarps" boolean filter that, when enabled, excludes orders requiring a tarp from route search candidates at the database level.

**Architecture:** Backend adds `no_tarps` to `DriverProfile`, `resolveSearchConfig`, and the SQL builder — mirroring the existing `hazmat_certified` pattern exactly. Frontend adds the toggle to the All Filters popover (search-form.tsx), User Settings (desktop-settings-view.tsx), and the mobile FiltersSheet. `no_tarps` defaults to `false`.

**Tech Stack:** TypeScript, NestJS, PostgreSQL, React, TanStack Query

**Spec:** `docs/superpowers/specs/2026-03-31-allow-tarps-filter-design.md`

---

## Phase 1: Backend (`/Users/matthewbennett/Documents/GitHub/haulvisor-backend`)

### Task 1: Add `no_tarps` to DriverProfile, SQL builder, engine, and DTO

**Files:**
- Modify: `api/src/routes/route-search.engine.ts`
- Modify: `api/src/routes/route-search.sql.ts`
- Modify: `api/src/routes/route-search.sql.spec.ts`
- Modify: `api/src/routes/dto/route-search.dto.ts`

**Context:**

`DriverProfile` is defined in `api/src/routes/route-search.engine.ts` around line 69:
```typescript
export interface DriverProfile {
  trailer_types: string[];
  max_weight: number | null;
  hazmat_certified: boolean;
  twic_card: boolean;
  team_driver: boolean;
}
```

`resolveSearchConfig` in the same file builds `driver_profile` around line 148:
```typescript
driver_profile: {
  trailer_types: ...,
  max_weight: ...,
  hazmat_certified: pick<boolean>('hazmat_certified', false),
  twic_card: pick<boolean>('twic_card', false),
  team_driver: pick<boolean>('team_driver', false),
},
```

`buildCandidatesSql` in `api/src/routes/route-search.sql.ts` applies profile filters around line 26:
```typescript
if (!profile.hazmat_certified) {
  conditions.push(`(hazmat IS NULL OR hazmat = FALSE)`);
}
if (!profile.twic_card) {
  conditions.push(`(twic IS NULL OR twic = FALSE)`);
}
if (!profile.team_driver) {
  conditions.push(`(team_load IS NULL OR team_load = FALSE)`);
}
```

`baseProfile` in `api/src/routes/route-search.sql.spec.ts` is defined as:
```typescript
const baseProfile: DriverProfile = {
  trailer_types: [],
  max_weight: null,
  hazmat_certified: false,
  twic_card: false,
  team_driver: false,
};
```

- [ ] **Step 1: Add two failing tests to `route-search.sql.spec.ts`**

Open `api/src/routes/route-search.sql.spec.ts`. Add `no_tarps: false` to `baseProfile` (it's the first thing you'll need to fix to make TypeScript happy). Then add these two tests at the end of the `describe` block:

```typescript
it('should exclude tarp orders when no_tarps is true', () => {
  const { sql } = buildCandidatesSql({ ...baseProfile, no_tarps: true });
  expect(sql).toContain("tarp_height IS NULL OR tarp_height = ''");
});

it('should not exclude tarp orders when no_tarps is false', () => {
  const { sql } = buildCandidatesSql({ ...baseProfile, no_tarps: false });
  expect(sql).not.toContain('tarp_height');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/api
npx jest route-search.sql --no-coverage
```

Expected: compilation error — `no_tarps` does not exist on `DriverProfile`.

- [ ] **Step 3: Add `no_tarps` to `DriverProfile` in `route-search.engine.ts`**

In the `DriverProfile` interface, add after `team_driver`:
```typescript
no_tarps: boolean;
```

In `resolveSearchConfig`, inside the `driver_profile` object, add after `team_driver`:
```typescript
no_tarps: pick<boolean>('no_tarps', false),
```

- [ ] **Step 4: Add the SQL condition in `route-search.sql.ts`**

After the `team_driver` block (around line 33), add:
```typescript
if (profile.no_tarps) {
  conditions.push(`(tarp_height IS NULL OR tarp_height = '')`);
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/api
npx jest route-search.sql --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6: Add `no_tarps` to the DTO**

In `api/src/routes/dto/route-search.dto.ts`, in the `// ── Optional: driver profile ──` section, add after `team_driver`:

```typescript
@IsOptional()
@Transform(({ value }) => value === 'true' || value === '1')
no_tarps?: boolean;
```

- [ ] **Step 7: Build to verify compilation**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend/api
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git add api/src/routes/route-search.engine.ts \
        api/src/routes/route-search.sql.ts \
        api/src/routes/route-search.sql.spec.ts \
        api/src/routes/dto/route-search.dto.ts
git commit -m "feat: add no_tarps filter to driver profile and SQL builder"
```

---

## Phase 2: Frontend (`/Users/matthewbennett/Documents/GitHub/haulvisor`)

### Task 2: Add `no_tarps` to All Filters popover and search params

**Files:**
- Modify: `src/features/routes/components/search-form.tsx`

**Context:**

`AllFiltersPopover` is a self-contained component in `search-form.tsx` starting around line 962. It manages local state for driver profile toggles and auto-saves to user settings on change.

The relevant state and effect (around lines 972–1016):
```typescript
const [hazmat, setHazmat] = useState(false);
const [twic, setTwic] = useState(false);
const [team, setTeam] = useState(false);

useEffect(() => {
  ...
  setHazmat(settings.hazmat_certified ?? false);
  setTwic(settings.twic_card ?? false);
  setTeam(settings.team_driver ?? false);
  ...
}, [settings]);

const activeCount = [
  trailerLabels.length > 0,
  maxWeight !== "",
  hazmat,
  twic,
  team,
  workDays.length > 0 && workDays.length < 7,
].filter(Boolean).length;
```

The checkbox array (around lines 1096–1099):
```typescript
{ label: "Hazmat", checked: hazmat, key: "hazmat_certified", setter: setHazmat },
{ label: "TWIC Card", checked: twic, key: "twic_card", setter: setTwic },
{ label: "Team Driver", checked: team, key: "team_driver", setter: setTeam },
```

The `driverProfile` object (around line 514) passed into search params:
```typescript
const driverProfile = settings ? {
  ...
  hazmat_certified: settings.hazmat_certified ?? undefined,
  twic_card: settings.twic_card ?? undefined,
  team_driver: settings.team_driver ?? undefined,
  ...
} : {};
```

- [ ] **Step 1: Add `noTarps` state and sync in `AllFiltersPopover`**

In `AllFiltersPopover`, after `const [team, setTeam] = useState(false);` add:
```typescript
const [noTarps, setNoTarps] = useState(false);
```

In the `useEffect` that syncs from settings, after `setTeam(settings.team_driver ?? false);` add:
```typescript
setNoTarps(settings.no_tarps ?? false);
```

- [ ] **Step 2: Add `noTarps` to `activeCount`**

Replace the `activeCount` array to include `noTarps`:
```typescript
const activeCount = [
  trailerLabels.length > 0,
  maxWeight !== "",
  hazmat,
  twic,
  team,
  noTarps,
  workDays.length > 0 && workDays.length < 7,
].filter(Boolean).length;
```

- [ ] **Step 3: Add "No Tarps" to the checkbox array**

In the `.map((cert) => ...)` array, add after `team_driver`:
```typescript
{ label: "No Tarps", checked: noTarps, key: "no_tarps", setter: setNoTarps },
```

- [ ] **Step 4: Add `no_tarps` to `driverProfile` in `SearchFilters`**

In the `driverProfile` object (around line 514), after `team_driver`:
```typescript
no_tarps: settings.no_tarps ?? undefined,
```

- [ ] **Step 5: Build to verify**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
npm run build 2>&1 | tail -20
```

Expected: clean build, all 9 routes generated.

- [ ] **Step 6: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
git add src/features/routes/components/search-form.tsx
git commit -m "feat: add No Tarps toggle to All Filters popover"
```

---

### Task 3: Add `no_tarps` to User Settings

**Files:**
- Modify: `src/features/settings/views/desktop/desktop-settings-view.tsx`

**Context:**

State declarations around line 86:
```typescript
const [hazmatCertified, setHazmatCertified] = useState(false);
const [twicCard, setTwicCard] = useState(false);
const [teamDriver, setTeamDriver] = useState(false);
```

Settings sync in `useEffect` around line 143:
```typescript
setHazmatCertified(settings.hazmat_certified ?? false);
setTwicCard(settings.twic_card ?? false);
setTeamDriver(settings.team_driver ?? false);
```

CertToggle renders around line 509:
```tsx
<CertToggle label="Hazmat Certified" checked={hazmatCertified} onChange={() => handleBoolToggle("hazmat_certified", hazmatCertified, setHazmatCertified)} />
<CertToggle label="TWIC Card" checked={twicCard} onChange={() => handleBoolToggle("twic_card", twicCard, setTwicCard)} />
<CertToggle label="Team Driver" checked={teamDriver} onChange={() => handleBoolToggle("team_driver", teamDriver, setTeamDriver)} />
```

- [ ] **Step 1: Add `noTarps` state**

After `const [teamDriver, setTeamDriver] = useState(false);` add:
```typescript
const [noTarps, setNoTarps] = useState(false);
```

- [ ] **Step 2: Sync from settings**

In the `useEffect` sync block, after `setTeamDriver(settings.team_driver ?? false);` add:
```typescript
setNoTarps(settings.no_tarps ?? false);
```

- [ ] **Step 3: Add CertToggle**

After the "Team Driver" `CertToggle`, add:
```tsx
<CertToggle label="No Tarps" checked={noTarps} onChange={() => handleBoolToggle("no_tarps", noTarps, setNoTarps)} />
```

- [ ] **Step 4: Build to verify**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
npm run build 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
git add src/features/settings/views/desktop/desktop-settings-view.tsx
git commit -m "feat: add No Tarps toggle to User Settings"
```

---

### Task 4: Add `no_tarps` to mobile FiltersSheet and mobile-routes-view

**Files:**
- Modify: `src/features/routes/views/mobile/screens/filters-sheet.tsx`
- Modify: `src/features/routes/views/mobile/mobile-routes-view.tsx`

**Context:**

`AdvancedFilters` interface in `filters-sheet.tsx`:
```typescript
export interface AdvancedFilters {
  legs: number;
  homeBy: string;
  trailerType: string;
}
```

`FiltersSheet` state:
```typescript
const [legs, setLegs] = useState(initialFilters?.legs ?? DEFAULT_LEGS_ROUND_TRIP);
const [homeBy, setHomeBy] = useState(initialFilters?.homeBy ?? "");
const [trailerType, setTrailerType] = useState(initialFilters?.trailerType ?? "");
```

`handleBack` calls `onApply` with all filter state:
```typescript
const handleBack = () => {
  onApply({ legs, homeBy, trailerType });
};
```

In `mobile-routes-view.tsx`, `advancedFilters` is initialized with:
```typescript
const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
  legs: DEFAULT_LEGS_ROUND_TRIP,
  homeBy: "",
  trailerType: "",
});
```

And `buildAndFireSearch` sends it as search params (around line 90):
```typescript
const params: RouteSearchParams = {
  ...
  legs: filters.legs,
  ...driverProfile,
  ...(filters.trailerType ? { trailer_types: filters.trailerType } : {}),
};
```

`handleRecentTap` restores filters:
```typescript
const filters: AdvancedFilters = {
  legs: search.filters.legs ?? DEFAULT_LEGS_ROUND_TRIP,
  homeBy: search.filters.homeBy ?? "",
  trailerType: search.filters.trailerType ?? "",
};
```

- [ ] **Step 1: Update `AdvancedFilters` interface**

In `filters-sheet.tsx`, update the interface:
```typescript
export interface AdvancedFilters {
  legs: number;
  homeBy: string;
  trailerType: string;
  noTarps: boolean;
}
```

- [ ] **Step 2: Add `noTarps` state in `FiltersSheet`**

After `const [trailerType, setTrailerType] = useState(initialFilters?.trailerType ?? "");` add:
```typescript
const [noTarps, setNoTarps] = useState(initialFilters?.noTarps ?? false);
```

- [ ] **Step 3: Include `noTarps` in `handleBack`**

```typescript
const handleBack = () => {
  onApply({ legs, homeBy, trailerType, noTarps });
};
```

- [ ] **Step 4: Add the toggle UI in `FiltersSheet`**

The mobile filter sheet uses `FilterRow` collapsible rows. "No Tarps" is a simple boolean toggle — render it as a tappable row without a collapsible body, directly below the existing `FilterRow` blocks, before the closing `</div>` of the scroll container:

```tsx
{/* No Tarps */}
<button
  type="button"
  onClick={() => setNoTarps((v) => !v)}
  className="flex w-full items-center justify-between px-4 py-4 border-b border-white/5"
>
  <span className="text-base text-muted-foreground">No Tarps</span>
  <div
    className={cn(
      "flex h-6 w-6 items-center justify-center rounded border transition-colors",
      noTarps ? "border-primary bg-primary text-primary-foreground" : "border-white/20",
    )}
  >
    {noTarps && <span className="text-sm font-bold">✓</span>}
  </div>
</button>
```

- [ ] **Step 5: Update `mobile-routes-view.tsx` — initialize `advancedFilters`**

Update the initial state:
```typescript
const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
  legs: DEFAULT_LEGS_ROUND_TRIP,
  homeBy: "",
  trailerType: "",
  noTarps: false,
});
```

- [ ] **Step 6: Pass `no_tarps` in `buildAndFireSearch`**

In the `params` object inside `buildAndFireSearch`, add after the `trailerType` override:
```typescript
...(filters.noTarps ? { no_tarps: true } : {}),
```

- [ ] **Step 7: Update `handleRecentTap` to restore `noTarps`**

```typescript
const filters: AdvancedFilters = {
  legs: search.filters.legs ?? DEFAULT_LEGS_ROUND_TRIP,
  homeBy: search.filters.homeBy ?? "",
  trailerType: search.filters.trailerType ?? "",
  noTarps: false,
};
```

(Recent searches don't persist `noTarps` — default to `false` on restore.)

- [ ] **Step 8: Build to verify**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
npm run build 2>&1 | tail -20
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
git add src/features/routes/views/mobile/screens/filters-sheet.tsx \
        src/features/routes/views/mobile/mobile-routes-view.tsx
git commit -m "feat: add No Tarps toggle to mobile filters sheet"
```
