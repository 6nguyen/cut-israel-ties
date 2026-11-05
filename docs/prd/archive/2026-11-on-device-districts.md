# On-device district lookup — PRD
Status: SHIPPED 2026-11-04 (PR #29) · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
Routing sends the visitor's street address to the Census Geocoder
through the Worker (`docs/specs/action-router.md` §Data & contracts).
The Worker never logs it, but a third party still receives every
address, `/privacy` has to say so, and the geocoder is a single point of
failure outside Cloudflare. The archived action-router PRD (Open
question 4) accepted the proxy for v1 and queued an on-device lookup.

## Goals / Non-goals
- Goals: a visitor can get their district without any address leaving
  the device, using the browser's location and district geometry
  downloaded per state; the address path stays as the fallback and for
  visitors who decline location; the landing page budget is unchanged
  because geometry loads only after a state is known.
- Non-goals: on-device address geocoding (no free dataset small enough);
  state legislative districts; offline use.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Browser geolocation plus point-in-polygon in the client | several privacy-minded civic apps | adopt | no address leaves the device; geometry is public domain |
| Shipping all 435 districts in one file | naive implementations | reject | 10 MB+; per-state files after a coarse state lookup keep each load ≤300 KB |
| Sending coordinates to a server for lookup | most "find my rep" APIs | reject | coordinates are as identifying as an address |

## Users
Visitors on phones (where location is one tap) who would rather not
type an address; privacy-conscious visitors who read `/privacy`.

## Expected behavior
### 1. District geometry build
1. `scripts/build-districts.ts` downloads the Census TIGER/Line 119th
   Congress district shapefile, simplifies it (Visvalingam, tolerance
   chosen so no district under 50 km² loses a vertex that changes a
   test point's result), and writes `web/public/districts/<STATE>.json`
   (TopoJSON, gzip ≤300 KB each; at-large states are a single polygon)
   plus `web/public/districts/states.json` (coarse state outlines,
   ≤150 KB gzip). The build is run by the maintainer and the output
   committed; a checksum file records the source vintage.
2. `web/src/lib/pip.ts` resolves a point to `{state, district}`: state
   outline first, then that state's file, ray-casting point-in-polygon
   over the (multi)polygons. A point on a border returns the first
   match; a point in no polygon returns `null`.

### 2. "Use my location" path
1. The landing form gains a second control under the address field:
   "Use my location instead" (hidden when `navigator.geolocation` is
   absent). Tapping it asks the browser for a one-time position with
   `maximumAge: 0` and `enableHighAccuracy: false`.
2. Resolution happens entirely in the browser; the island then calls
   `POST /api/route` with `{state, district}` (the contract already
   accepts it) so the result page, targets and ranking are unchanged.
3. Denied or failed position: the address field is focused with one
   line "No location shared. Enter an address instead."; `null` from
   the lookup (coastal or border points): "We couldn't place that point.
   Enter an address." Both paths keep the manual state and district
   picker.
4. Coordinates are never stored, never sent, and never logged;
   `sessionStorage` holds only the resolved `{state, district}` as
   today.

### 3. Privacy page and copy
1. `/privacy` explains both paths in two sentences each: location stays
   on the device and resolves against public district maps; an address
   is sent to the Census Geocoder through this site's server and not
   kept.
2. The landing helper line reads "Full street address, or use your
   location: nothing is stored."

## Data & contracts
- `web/public/districts/*.json` (committed build output, ~50 files),
  `scripts/build-districts.ts`, `web/src/lib/pip.ts`.
- No Worker change: `POST /api/route {state, district}` is the existing
  contract.
- Client: the address island gains the location control; no new
  storage keys.

## Spec delta
- MODIFIED `docs/specs/action-router.md` §Behavior 1 (landing) and
  §Behavior 2 (routing): the location path and its failure copy.
- MODIFIED `docs/specs/action-router.md` §Invariants: "no coordinate
  is ever sent or logged" joins the address invariant.
- ADDED `docs/specs/on-device-districts.md`: geometry build, lookup,
  vintage and size rules.

## Acceptance criteria
- [ ] 50 fixture points (one per state, including a split city and an
      at-large state) resolve on-device to the district the Census
      Geocoder returns for the same point (test against recorded
      geocoder answers, not live calls).
- [ ] During the location path no request carries latitude, longitude
      or an address (network assertion); the only API call is
      `/api/route` with `{state, district}`.
- [ ] Denied permission and a point outside every polygon each show the
      stated copy and keep the address form usable.
- [ ] Every per-state file is ≤300 KB gzip and `states.json` ≤150 KB;
      the build fails above those sizes.
- [ ] Performance budget: landing ≤100 KB transferred (geometry loads
      only after tapping the control); lookup ≤500 ms on a mid-range
      phone after the file is cached; `/api/route` unchanged ≤2 s p95.

## Rollout & metrics
Ships enabled; the control is additive. Metrics: share of routes by
location versus address (a boolean on the route request, no
coordinates); null-resolution rate.

## State (updated 2026-11-04)
- Status: SHIPPED
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [x] 1. District geometry build · PR #29
  - [x] 2. "Use my location" path · PR #29
  - [x] 3. Privacy page and copy · PR #29
- Completed: §1–3 merged to main via PR #29 (integration of the feature branch, PR #23).
- Folded: §1–3: `docs/specs/on-device-districts.md` added; `action-router.md` §Behavior 1 and 3, §Data & contracts, §Invariants.
- Branch / open PRs: none (PR #23 superseded by PR #29).
- Files changed: `scripts/build-districts.ts` (new); `web/public/districts/`
  (51 state files, `states.json`, `manifest.json`, TIGER2025 CD119);
  `web/src/lib/pip.ts`, `pip.test.ts`, `districts.fixture.json` (new);
  `web/src/lib/api.ts:6` (`by_location`); `web/src/components/AddressForm.tsx`
  (hasGeo/addressRef state, hydration effect, `locate()`, the control,
  helper line); `web/src/pages/privacy.astro` (location bullet);
  `package.json` (mapshaper devDependency); specs as under Folded.
- Tests run: test-web 8 passed (52 fixture points resolve; 52 warm lookups
  1 ms, cold 39 ms incl. decode); test, tsc, build, prd-lint, doc-lint PASS.
  Landing gzip: HTML 3.9 KB + CSS 4.7 KB + island chunks ≈18.5 KB
  (baseline ≈18.0 KB; +0.5 KB from the handler and Vite's preload helper);
  `pip` chunk 1.0 KB and geometry load only after the tap.
- Remaining: none.
- Next action: none; archived.
## Open questions
1. Should the location path become the default on phones? Proposal: no
   for v1; the address field stays first, the control second, until
   the null-resolution rate is known.
2. Geometry vintage after redistricting (the 2026 California map).
   Proposal: the checksum file names the TIGER vintage; the build is
   rerun when a state's map changes, as a `data/`-style PR.

## Changes
- 2026-11-04 — created (APPROVED, auto: every question carries a
  proposal, none blocking). Replaces `## Next` row 5.
- 2026-11-04 — §1–§3 built on `feat/on-device-districts` (PR #23).
  Geometry: TIGER2025 per-state `tl_2025_<fips>_cd119.zip` (the national
  `tl_2025_us_cd119.zip` named in §1 does not exist; TIGER ships CD files
  per state), mapshaper Visvalingam interval 30 m for districts and
  1000 m for state outlines, `keep-shapes`; 52 files, 3.7 MB raw,
  largest TX 117 KB gzip, `states.json` 35 KB gzip; against a 1 m
  reference build 4 of 20,493 random points differ (0.02 %). Fixture: 52
  points (50 capitols, DC, Philadelphia) recorded from the geocoder with
  vintage `ACS2025_Current`, because `Current_Current` now returns the
  120th Congress maps (2026 redistricting). Finding: the Worker's address
  path reads whichever CD layer the geocoder returns, so it already
  answers 120th districts in redistricted states; follow-up PRD: pin the
  Worker to a vintage, or move `data/` to the 120th Congress and rebuild
  with `--vintage 2026 --congress 120`. `by_location` is sent (the Worker
  ignores unknown fields); nothing records it yet.
- 2026-11-04 — SHIPPED via PR #29 (the integration PR that merged PR #23 with the other seven PRD branches); archived. Follow-ups outside this PRD: rerun `scripts/build-districts.ts --vintage 2026 --congress 120` when `data/` moves to the 120th Congress.
