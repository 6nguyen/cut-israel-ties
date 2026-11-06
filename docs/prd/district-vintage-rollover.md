# District map rollover to the 120th Congress — PRD
Status: APPROVED 2026-11-05 (auto) · Owner: George Nguyen · Last updated: 2026-11-05

## Problem
Ten states (AL, CA, FL, LA, MO, NC, OH, TN, TX, UT) elected their 2026
House under different lines than the 119th Congress sits on. The Worker
geocodes with `Public_AR_Current` / `Current_Current`, which already
returns 120th-Congress districts, while `data/members.csv` holds 119th
members keyed by state and district: a downtown Austin address returns
TX-10 instead of TX-37 and resolves to the wrong sitting member today.
The on-device TopoJSON is still cd119, so the two paths disagree. Census
published `tl_2026_<fips>_cd120.zip` on 2026-10-06, but its Missouri
file carries the 2025 map that voters repealed on 2026-11-03; Missouri
keeps the 2022 lines. Through 2027-01-03 the right target is the sitting
member (December NDAA compromise, funding due 2026-12-11); from
2027-01-04 it is the new one. Both paths must flip together, after the
roster does.

## Goals / Non-goals
Goals:
- Today: every path resolves to the 119th map the sitting members hold.
- By 2026-12-15: cd120 geometry built, Missouri taken from cd119, both
  sets shipped and checked against the geocoder.
- 2027-01-03/04: one dated flip of Worker and on-device lookup, gated on
  the roster import.
- Missouri resolves to the 2022 map on both paths after the flip.

Non-goals:
- 2030 reapportionment or seat-count changes (none before 2033).
- Court outcomes still pending (TX, CA, NC, UT, FL, TN, LA, AL): a later
  change is a rerun of §2, not a new design.
- Cartographic-boundary files (expected April 2027; TIGER suffices).

## Research
Relies on [district-vintage-rollover](../research/district-vintage-rollover.md)
and the TIGER paragraphs of [data-ingestion](../research/data-ingestion.md).
| Finding | Decision |
|---|---|
| `Current_Current` returns the 120th today; `ACS2025_Current` the 119th | Pin the Worker to `ACS2025_Current` now, `Current_Current` on flip |
| cd120 shapefiles live since 2026-10-06; `build-districts.ts` already takes `--vintage 2026 --congress 120` | Build now, ship beside cd119 |
| Census cd120 Missouri = repealed 2025 map; geocoder 120th returns it too | Per-state override on both paths: MO stays on cd119 / `ACS2025_Current` |
| Georgia: 2 of 29 probe points differed between vintages, unexplained | Resolve in the pre-flip probe before cutover |
| Both sets gzip to ~1.25 MB each; CA cd120 zip +12% | Ship both until the flip; CA checked against the 300 KB gate |
| Louisiana House general 2026-12-12 | No effect on geometry; roster PRD handles the seat |

## Users
- A user in a redrawn district who must reach the member who actually
  votes in December, then the new one in January.
- The maintainer, who flips one constant on one date.

## Expected behavior

### 1. Pin the Worker to the sitting Congress
- `worker/src/geocode.ts` reads `DISTRICT_VINTAGE` (Worker var, default
  `ACS2025_Current`) and a fixed `VINTAGE_OVERRIDES` map, today
  `{MO: 'ACS2025_Current'}`, applied by the state the geocoder returns:
  when the state has an override and the answer came from another
  vintage, the Worker re-queries the coordinates with the override
  vintage (one extra subrequest for Missouri only).
- The geocode fixture and tests record both vintages for Austin and
  Kansas City so the pin is asserted, not assumed.

### 2. cd120 geometry with a Missouri override
- `scripts/build-districts.ts` gains `--out DIR` (default
  `web/public/districts`) and repeatable `--override MO=2025:119`
  (state = vintage:congress). The override state's shapefile is fetched
  from the override vintage; `manifest.json` records `overrides` and the
  per-state `source` URL.
- The maintainer builds cd120 into `web/public/districts-120/` with
  `--vintage 2026 --congress 120 --override MO=2025:119`; cd119 stays in
  place. `districts.fixture.json` gains a sibling
  `districts.fixture.120.json` recorded with `Current_Current` plus the
  Austin, Kansas City, Salt Lake, Memphis and Toledo points; the build
  gates each set against its own fixture.
- `scripts/probe-districts.ts` takes 10 fixed points per state (seeded,
  committed as a fixture), resolves each on-device for the named set and
  through the geocoder vintage that set should match, and prints
  mismatches; the Georgia question is closed by this run before §3.

### 3. Dated flip
- `web/src/lib/pip.ts` reads `ACTIVE_CONGRESS` (build-time constant,
  `119` today) to pick the directory; the results header and the seed
  checks in `worker/src/districts.ts` label the seat table by congress
  (counts unchanged).
- The cutover PR, opened 2027-01-03 and merged only after the roster PR
  that sets `left_office` on departed members has merged
  (roster-freshness §4): `ACTIVE_CONGRESS=120`,
  `DISTRICT_VINTAGE=Current_Current` in `wrangler.toml`, overrides
  unchanged, fixture 120 as the gate. The same PR deletes
  `web/public/districts/` cd119 files one deploy later, never in the flip.
- `docs/guides/deploy.md` gets a dated checklist entry for the flip and
  the rollback (revert the PR; both sets are still deployed).

## Data & contracts
- Worker vars: `DISTRICT_VINTAGE` (string, default `ACS2025_Current`).
- `web/public/districts-120/` (51 state files, `states.json`,
  `manifest.json` with `congress: 120`, `overrides`), same TopoJSON
  contract as `on-device-districts.md`.
- `web/src/lib/districts.fixture.120.json`, `scripts/probe-districts.ts`
  and its fixture `scripts/probe-points.json`.
- `build-districts.ts` flags `--out`, `--override`.

## Spec delta
- MODIFIED `docs/specs/action-router.md` §Behavior 3 (Lookup): vintage from `DISTRICT_VINTAGE`, the Missouri override and its one extra subrequest.
- MODIFIED `docs/specs/on-device-districts.md` §Behavior 1 (Geometry build): `--out`, `--override`, `overrides` in the manifest, one fixture per set.
- MODIFIED `docs/specs/on-device-districts.md` §Behavior 2 (Lookup): `ACTIVE_CONGRESS` picks the directory.
- MODIFIED `docs/specs/on-device-districts.md` §Data & contracts: the `districts-120` set, the 120 fixture, the probe script.
- MODIFIED `docs/specs/on-device-districts.md` §Invariants: "on-device and Worker answer the same district for every fixture point of the active set; Missouri resolves to the 2022 map on both".
- MODIFIED `docs/specs/member-pages.md` §Behavior 2 (Seed checks): seat counts labelled by congress.
- MODIFIED `docs/specs/deployment.md` §Behavior: `DISTRICT_VINTAGE` in the config table; the flip in the checklist.

## Acceptance criteria
- [ ] With the pin, Austin resolves to TX-37 and downtown Kansas City to MO-5 through `/api/route`; the test asserts both vintages' answers from the recorded fixture.
- [ ] `districts-120/manifest.json` records `congress: 120`, `overrides: {MO: ...}`, every state file ≤300 KB gzip (CA included, or its interval raised and recorded), `states.json` ≤150 KB gzip.
- [ ] The probe prints zero mismatches for the cd119 set against `ACS2025_Current` and for the cd120 set against `Current_Current` (Missouri against `ACS2025_Current`); Georgia's two points are explained or the set is rebuilt.
- [ ] Flipping `ACTIVE_CONGRESS` and `DISTRICT_VINTAGE` in one PR changes every fixture-120 point and no cd119 test; reverting restores the old answers with no rebuild.
- [ ] Landing ≤100 KB transferred: the active set loads only its own state file; the inactive directory is never requested. `/api/route` p95 ≤2 s including the Missouri re-query. Static hosting cost $0 with both sets (≈+1.25 MB gzip).
- [ ] `scripts/quiet-check.sh test`, `test-web` and `build` green.

## Rollout & metrics
- §1 now (one line plus tests, ships with the next deploy). §2 by
  2026-12-15. §3 on 2027-01-03, after the roster PR.
- Metrics: probe mismatch count per run (0); `/api/route` p95 before and
  after the Missouri re-query; bytes served from each set during the
  overlap week.

## State (updated 2026-11-05)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [ ] 1. Pin the Worker to the sitting Congress
  - [ ] 2. cd120 geometry with a Missouri override
  - [ ] 3. Dated flip
- Completed: none.
- Folded: none.
- Branch / open PRs: none.
- Remaining: all; §1 half a day, §2 one day, §3 half a day on 2027-01-03.
- Decisions since last update: none.
- Known failures / blockers: §3 waits for roster-freshness §4 and the 2027-01-03 date; Georgia probe result open.
- Next action: /implement-prd-section docs/prd/district-vintage-rollover.md §1.

## Open questions
- Keep cd119 geometry after the flip for a "who voted in December" view?
  Proposal: no; the whip table keeps positions by member, not by map.
- Should Missouri's override come from a data file instead of code?
  Proposal: code for now (one state, one line); move to `data/` if a
  second court order lands.

## Changes
- 2026-11-05: created from the district rollover research.
