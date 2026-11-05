# District map rollover to the 120th Congress
Researched: 2026-11-05 · Informs: [district-vintage-rollover](../prd/district-vintage-rollover.md)

## Summary
- **Census already shipped cd120.** `TIGER2026/CD/tl_2026_<fips>_cd120.zip` (56 files) went up 2026-10-06. The geocoder's default `Current_Current` vintage already returns "120th Congress" districts (probed 2026-11-05). No waiting and no bridge shapefiles needed.
- **Live bug today:** `worker/src/geocode.ts:58-59` uses `Public_AR_Current` + `Current_Current`, so in redrawn states the Worker returns a 2026-map district number that `members.csv` (119th, 2024 map, keyed state+district) resolves to the wrong sitting member. Fix now: `vintage=ACS2025_Current` (still 119th/2024 map) until 2027-01-03.
- **Missouri trap:** Census cd120 carries the 2025 map that voters repealed on 2026-11-03 (Prop A, ~62-38). Missouri keeps the 2022 map. Use cd119 geometry for MO in the cd120 build.
- **Redrawn states in cd120 (10):** AL, CA, FL, LA, MO (wrong, see above), NC, OH, TN, TX, UT. Probes also found 2 of 29 random Georgia points differing; unexplained, check before cutover.
- **Plan:** (1) now: switch Worker to `ACS2025_Current`. (2) By 2026-12-15: build cd120 with `--vintage 2026 --congress 120`, MO from cd119, ship both sets (~+1.2 MB gzip). (3) 2027-01-03 (swearing-in): date-gated flip of on-device set and Worker to `Current_Current`, after the roster import. (4) 2027-01-04: rerun `import-members`.
- **Open until 2026-12-12:** Louisiana's House general is 2026-12-12 under a new map; its seats are undecided until then.
- Cost: $0. Both sets are static files; tiles grow ~2% per redrawn state.

## 1. Which states changed maps for 2026
Seat counts are the number of seats the sources say the plan targets or reworks, not a count of changed lines. "In force" is for the Nov 3, 2026 election; all dates as reported by sources observed 2026-11-05.

| State | Map used 2026 | Seats changed (per source) | Status 2026-11-05 |
|---|---|---|---|
| TX | 2025 legislative map | 5 R-leaning | Federal racial-gerrymander ruling stayed by SCOTUS (Dec 2025); injunction reversed Apr 27; merits pending |
| CA | Prop 50 map (Nov 2025) | 5 made more D | Upheld by 3-judge panel, SCOTUS denied GOP application Feb 4; *Tangipa* pending |
| MO | **2022 map** (2025 map blocked) | 1 (KC, MO-5) if it had stood | Prop A repealed the 2025 map 2026-11-03; 2022 lines stay for 2028 |
| NC | 2025 map | 1 (NC-1; NC-3 reconfigured) | Federal panel allowed; *Gallop v. Hirsch* pending |
| OH | Commission map, Oct 2025 | 2 (OH-1, OH-9; Toledo/Akron/Cincinnati) | No live challenge; locked to 2032 |
| UT | Court-adopted "Map 1" (Nov 2025) | 1 new D-leaning seat (Salt Lake) | State Supreme Court argument Oct 5; GOP repeal measure failed to qualify |
| FL | Revised map signed May 4, 2026 | up to 4 R-leaning | Preliminary injunction denied May 26; no trial date |
| TN | Map signed May 7, 2026 | 1 (Memphis TN-9) | Two federal challenges; injunction denied |
| LA | SB 121 map (May 29, 2026, post-*Callais*) | 1 (LA-6) | House primary moved to Nov 3, **general Dec 12**; challenge pending |
| AL | 2023 legislative map restored (SCOTUS order Jun 2) | 1 (Milligan district removed) | Appeals pending |
| GA | Unchanged | 0 | Special session (Jun 17) declined to redraw; 2028 may change |
| VA, IN, MD, KS, CO, SC, MS, WI, IL, NY | Unchanged | 0 | VA amendment voided 4-3 May 8; IN Senate rejected 31-19; others no new map |

Cross-check: Census's own cd120 differs from cd119 in exactly the ten states a GitHub tracker lists (AL CA FL LA MO NC OH TN TX UT). My geocoder probe (30 random points per state, `Current_Current` vs `ACS2025_Current`) found differences in every one of those plus GA (2/29), and none in VA, IN, NY (0/87).

| State | Probe differing points |
|---|---|
| UT 21/30, TN 11/30, NC 6/30, TX 5/28, CA 5/18, OH 5/29, LA 5/27, FL 4/11, MO 3/30, AL 3/30 | GA 2/29, VA 0, IN 0, NY 0 |

Sources disagree on a few details (Wikipedia vs PolicyMap on Alabama/Missouri legal posture); the table follows the more recent source where they conflict. This builds on `data-ingestion.md`, which flagged only California; ten states are affected.

## 2. When Census publishes cd120
Directory and file dates observed on `www2.census.gov/geo/tiger/` 2026-11-05.

| Product | cd | Files published | Notes |
|---|---|---|---|
| TIGER2022/CD | 118 | files 2023-05-09 (dir 2022-11-01) | first cd118 vintage, late |
| TIGER2023/CD | 118 | 2023-11-22 | dir 2023-12-13 |
| TIGER2024/CD | 119 | files 2025-06-27 (dir 2024-09-25; press release 2024-09-30 "includes the new 119th") | first cd119 vintage; files re-dated 2025-06-27 |
| TIGER2025/CD | 119 | 2025-09-22 (dir 2026-05-12) | what we built from |
| **TIGER2026/CD** | **120** | **2026-10-06**, 56 files | boundaries "as submitted by state liaisons, in effect for 2026, effective 2026-01-01" per Census |
| GENZ2024 `cb_2024_us_cd119_*` | 119 | 2025-04-10 | cartographic, 20m/5m/500k |
| GENZ2025 `cb_2025_us_cd119_*` | 119 | 2026-04-23 | no GENZ2026 yet; expect cb cd120 about April 2027 |

- Pattern: cd119 appeared in the vintage published the fall of the election year (Sept 2024), cd120 likewise (Oct 2026). Expected month for cd120: already out (October 2026). Cartographic cd120: about April 2027.
- `tl_rd22_*` redistricting files: not found on the server (only `TIGER_RD18/`, 2022-12-05, and `TGRGDBRD18/`). Not verified; not needed.
- Known caveat: the Census "effective 2026-01-01" cutoff means cd120 may not match court rulings after submission. Missouri proves it (below). AL, FL, LA, TN were enacted or restored after Jan 1 yet appear in cd120, so liaisons resubmitted; verify each against a state source before trusting.

## 3. Census Geocoder behaviour
Probed `geocoding.geo.census.gov/geocoder/geographies/coordinates`, 2026-11-05.

| benchmark | vintage | Congressional layer returned |
|---|---|---|
| Public_AR_Current | Current_Current | 120th Congress (new maps) |
| Public_AR_Current | ACS2025_Current | 119th Congress (2024 maps) |
| Public_AR_Current | ACS2024_Current | 119th Congress |
| Public_AR_ACS2026 | ACS2026_ACS2026 | returned States only for my coordinate query; layer unchecked |
| Public_AR_Census2020 | Census2020_Census2020 | not probed |

- Austin (-97.7431, 30.2672): `Current_Current` = TX-10 (4810), `ACS2025_Current` = TX-37 (4837). Downtown KC: MO-4 (2904) vs MO-5 (2905). LA, Cleveland, Raleigh, SLC points matched in both.
- So between now and 2027-01-03 `Current_Current` answers with the 2026 map; for a redrawn-state user the worker matches the wrong `members.csv` row.
- When the geocoder added cd119 after the 2024 election: not verifiable; Census publishes no geocoder release notes I could find. Observed only that cd119 sits under the ACS2024/ACS2025 vintages today.
- The 120th switch for `Current_Current` has already happened (by 2026-11-05; exact date unknown).
- Missouri via geocoder 120th: returns the repealed 2025 lines, so MO is wrong on both paths after cutover. Handle MO as a special case on both paths (use 2022 map: Worker `ACS2025_Current` for MO).

## 4. What fails, and bridge sources
| Choice | Failure for a redrawn-state user |
|---|---|
| Stay on cd119 after 2027-01-03 | Wrong member: district number resolves to the old (2024) district's member while the new member was elected from the 2026 lines (all of TX, CA, NC, OH, UT, FL, TN, LA, AL redrawn areas) |
| Switch to cd120 before 2027-01-03 | Wrong member: sitting 119th member differs from the new-map district (the current Worker bug). No shapefile risk, since cd120 exists |
| Switch Worker only | Worker and on-device disagree for the same address (the cross-check in the route/device paths breaks); flip both on one date |
| Use cd120 as published for MO | Wrong: 2025 map repealed 2026-11-03 |

- Shapefile gap risk is gone; no bridge needed. If a cd120 file proves wrong (MO; possibly others), the replacement is the state's own 2026 plan. Candidate publishers (URLs not fetched or verified; confirm each before use): Texas Legislative Council (`data.capitol.texas.gov`), California Citizens Redistricting Commission/Statewide Database (`statewidedatabase.org`), North Carolina General Assembly (`ncleg.gov`), Ohio Redistricting Commission (`redistricting.ohio.gov`), Utah Legislature GIS (`le.utah.gov`), Florida House/Senate redistricting sites, Tennessee and Louisiana legislature sites, Alabama Reapportionment Office.
- Provenance: Census TIGER is public domain and the established source (`data-ingestion.md`); a state legislature or SoS shapefile with a URL and retrieval date would be acceptable as a second, named source, never a blog or tracker. Not re-checked against `data/README.md` beyond its members provenance section (2026-11-04 import, public-domain source, URL per row).
- Roster: `members.csv` has only 119th members. New members cannot be keyed until sworn in 2027-01-03; the import (`data-ingestion.md`: rerun 2027-01-04) is the gating step, so flip the district sets and the roster in the same release or fall back to "your member changes Jan 3".

## 5. Cost and size
- `web/public/districts/`: 53 files, 3.8 MB on disk, 1.25 MB gzipped total (state files plus `states.json` and `manifest.json`); largest TX 368 KB raw, CA 320 KB, GA 144 KB, LA 136 KB. Per-state gate is 300 KB gzip, `states.json` 150 KB.
- cd120 zips are within about 2% of cd119 for the changed states (TX 4.32 vs 4.21 MB, CA 4.35 vs 3.89 MB (+12%), MO 0.68 vs 0.74 MB). CA is the one to watch against the gate.
- Shipping both vintages for the Jan 3 flip: about +1.25 MB gzip, +3.8 MB raw; still static files on GitHub Actions + static hosting at $0. Drop cd119 after the flip.
- `build-districts.ts` already accepts `--vintage 2026 --congress 120` (URL `TIGER${vintage}/CD/tl_${vintage}_${fips}_cd${congress}.zip`, field `CD120FP`); MO needs `--vintage 2025 --congress 119` as an override. The script has no per-state override today; that is a small change for the PRD.

## Not verified
- Date the geocoder added cd119 and the date `Current_Current` flipped to cd120.
- Georgia's 2/29 differing points (could be geometry tweaks or a real change).
- Exact count of changed districts per state (sources give targeted seats).
- Whether cd120 AL/FL/LA/TN match the maps in force; `tl_rd22_*` files; state shapefile URLs above.
- Prop A result is from news reports (certification pending).

## Sources
All observed 2026-11-05.
- https://www2.census.gov/geo/tiger/ and `TIGER2022/CD/`, `TIGER2023/CD/`, `TIGER2024/CD/`, `TIGER2025/CD/`, `TIGER2026/CD/`, `GENZ2024/shp/`, `GENZ2025/shp/` (directory listings)
- https://geocoding.geo.census.gov/geocoder/ (benchmarks, vintages, coordinate probes)
- https://www.census.gov/newsroom/press-releases/2024/geospatial-data.html (TIGER 2024 with 119th)
- https://catalog.data.gov/dataset/tiger-line-shapefile-2026-state-kansas-120th-congressional-district
- https://github.com/zakank08/bellwether/issues/5 (ten redrawn states in cd120, opened 2026-10-20; not official)
- https://www.policymap.com/blog/redistricting-tracker (as of 2026-09-25)
- https://en.wikipedia.org/wiki/2025%E2%80%932026_United_States_redistricting
- https://ballotpedia.org/Redistricting_ahead_of_the_2026_elections (not readable; listed only)
- https://missouriindependent.com/2026/11/03/missouri-voters-reject-trump-backed-congressional-map-dealing-gop-redistricting-defeat/
- https://fox2now.com/news/missouri/missouri-voters-reject-proposition-a-states-2022-congressional-map-remains-in-place/
- https://www.npr.org/2026/11/03/nx-s1-6028028/missouri-redistricting-ballot-measure (headline only; fetch timed out)
- https://wjla.com/news/nation-world/georgia-republicans-refuse-to-redistrict-after-gov-brian-kemp-calls-special-session-house-speaker-jon-burns-2028-election-supreme-court-voting-rights-act
- https://www.congress.gov/crs-product/IF13082
- `scripts/build-districts.ts:36-57`, `worker/src/geocode.ts:58-59`, `docs/research/data-ingestion.md:51`, `data/README.md:47-59`, `web/public/districts/manifest.json`
