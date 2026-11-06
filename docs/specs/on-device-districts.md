# On-device districts

## Purpose
Lets a visitor get their House district from the browser's location
without any coordinate or address leaving the device: public district
geometry is downloaded per state and the point is placed on the device,
then the existing `POST /api/route {state, district}` takes over. It
covers the geometry build, the lookup and the landing control; the
address path, routing and results stay in `action-router.md`.

## Behavior
1. **Geometry build (maintainer).** `npx tsx scripts/build-districts.ts
   [--cache DIR] [--vintage 2025] [--congress 119] [--interval 30]
   [--state-interval 1000] [--out web/public/districts]
   [--override MO=2025:119]... [--fixture PATH]` downloads one Census
   TIGER/Line shapefile per state
   (`TIGER<vintage>/CD/tl_<vintage>_<fips>_cd<congress>.zip`; the
   Census publishes no national CD file) into a cache outside the repo,
   two attempts per file, unzips it as data, drops the `ZZ` (undefined,
   water) rows and writes with mapshaper (Visvalingam, `interval` metres,
   `keep-shapes`): `<out>/<STATE>.json` (TopoJSON, one layer
   `districts`, property `district`; `00` and `98` become 0, so an
   at-large state and DC are one polygon with district 0),
   `states.json` (every state dissolved to one outline, layer `states`,
   property `state`) and `manifest.json` (source, congress, overrides,
   build date, tolerances, size gates, bytes/gzip/sha256 and source URL
   per file). A repeatable `--override STATE=VINTAGE:CONGRESS` takes that
   state's shapefile from another vintage (Missouri in the cd120 set:
   voters repealed the 2025 map on 2026-11-03, Census cd120 still carries
   it, so MO comes from `2025:119`); the manifest records it under
   `overrides` and in the file's `source`. The build fails when a state
   file exceeds 300 KB gzip, `states.json` exceeds 150 KB gzip, or any
   point in the set's fixture (`--fixture`; default
   `web/src/lib/districts.fixture.json` for the 119th,
   `districts.fixture.<congress>.json` otherwise) stops resolving to its
   recorded district. `--gate off` skips the size gates for tolerance
   experiments only. Output is committed; a later Congress goes to
   `web/public/districts-<congress>/` beside the active set until the
   flip. Rerun it as a `data/`-style PR when a state's map changes.
2. **Lookup (`web/src/lib/pip.ts`).** `resolvePoint(lon, lat, load?)`
   loads `states` first, keeps the outlines whose ring contains the point
   (or, when none does because the coarse outline shaved a coastline, the
   outlines whose bbox contains it), then loads each candidate state's
   file in turn and returns the first district whose rings contain the
   point (even-odd ray casting over every ring of a polygon or
   multipolygon, bbox pre-check). A point on a shared border returns the
   first match in file order; a point in no polygon returns `null`, as do
   non-finite coordinates. Decoded files are kept in memory for the page
   lifetime. `resolveInState(state, lon, lat, load?)` serves a picked
   address suggestion (`action-router.md` §3): the suggestion already
   names its state, so only that state's file is loaded, never `states`;
   a point outside every district of that state, a name that is not two
   capital letters or a non-finite coordinate returns `null`, and the
   caller falls back to the Census path. The default loader is `GET
   <DISTRICTS_DIR>/<name>.json`
   with no query string, where `ACTIVE_CONGRESS` (build-time constant in
   `pip.ts`, `119` today) picks `/districts` for 119 and
   `/districts-<n>` for any later set; the inactive set is never
   requested. The 2027-01-03 flip sets it to `120` in the same PR as
   `DISTRICT_VINTAGE=Current_Current` (`action-router.md` §3).
3. **Landing control.** Under the address field, only when
   `navigator.geolocation` exists at hydration, the button "Use my
   location instead". Tapping it asks for one position (`maximumAge: 0`,
   `enableHighAccuracy: false`, 20 s timeout), resolves it on the device,
   then calls `POST /api/route {state, district, by_location: true}`,
   saves `{state, district}` and goes to `/results` exactly like the
   address path.
4. **Failures.** Denied, timed out or unavailable position: "No location
   shared. Enter an address instead."; `null` from the lookup: "We
   couldn't place that point. Enter an address." Both focus the address
   field, open the state + district picker and leave the address form
   usable. A failed geometry download counts as `null`.
5. **Copy.** The landing helper line reads "Full street address, or use
   your location: nothing is stored." `/privacy` explains the location
   path (stays on the device, compared with public district maps, no
   coordinate sent or kept) next to the address path.

## Data & contracts
- `web/public/districts/<STATE>.json` × 51 (50 states + DC),
  `states.json`, `manifest.json`: TopoJSON with `transform`, layer
  `districts` / `states`; geometry `Polygon` or `MultiPolygon`. Static
  assets, cached by the CDN; no API. `web/public/districts-120/` is the
  same contract for the 120th Congress (TIGER2026 cd120, Missouri from
  TIGER2025 cd119), shipped beside cd119 until `ACTIVE_CONGRESS` flips;
  cd119 is deleted one deploy after the flip, never in it.
- `manifest.json` `{source, congress, overrides{<STATE>{vintage,
  congress}}, built, simplify{method, interval_m, state_interval_m,
  keep_shapes}, limits{state_gzip, states_gzip}, files{<name>{bytes,
  gzip, sha256, source}}}`; it is the vintage record the PRD asks for
  (the cd119 manifest predates `overrides` and `source`).
- Geocoder vintages (probed 2026-11-05, `geographies/coordinates`,
  benchmark `Public_AR_Current`): `ACS2025_Current` answers with the
  119th-Congress layer (the 2024 maps the sitting members hold),
  `Current_Current` with the 120th (2026 maps; Austin TX-10 not TX-37,
  downtown Kansas City MO-4 not MO-5). The Worker reads
  `DISTRICT_VINTAGE` (default `ACS2025_Current`); `VINTAGE_OVERRIDES`
  = `{MO: 'ACS2025_Current'}` because the 120th layer carries Missouri's
  repealed 2025 map, so after the flip a Missouri answer from
  `Current_Current` is re-queried once by coordinates on the override
  vintage: one extra subrequest, the address sent to Census once.
- `web/src/lib/districts.fixture.json` `{recorded, source, note,
  points[{label, lat, lon, state, district}]}`: 52 points (every state
  capitol, the US Capitol as DC district 0, a Philadelphia split-city
  point) with the Census Geocoder's answer, recorded once with
  `geographies/coordinates`, benchmark `Public_AR_Current`, vintage
  `ACS2025_Current`, district = `GEOID[2:]` (`98` → 0).
  `districts.fixture.120.json`: the same 52 points plus Austin, Kansas
  City, Salt Lake City, Memphis and Toledo, answered by
  `Current_Current` (Missouri by `ACS2025_Current`). Re-record with
  `scripts/probe-districts.ts --record <file> --set <n>`; tests and
  builds never call the network.
- `scripts/probe-districts.ts` and `scripts/probe-points.json` (510
  seeded points, 10 per state inside the cd119 outlines, mulberry32 seed
  2026): `--set 119|120` resolves every point on-device and through the
  set's geocoder vintage (overrides applied) and exits 1 on a mismatch;
  `--compare` lists points whose answer differs between the two
  vintages; `--generate` rewrites the points; `--record` a fixture.
- `web/src/lib/pip.ts` exports `ACTIVE_CONGRESS`, `DISTRICTS_DIR`,
  `decode`, `pointInRing`, `contains`, `locateAll`, `resolvePoint`,
  `fetchLoader`, `clearCache` and the `Topology`, `Shape`, `Loader`,
  `Place` types; the island imports it dynamically so the landing bundle
  does not carry it.
- Route body: `{state, district, by_location: true, turnstile?}`; the
  Worker ignores `by_location` today (metric placeholder, see
  `action-router.md` §Data & contracts). No new browser storage key.
- `mapshaper` is a root devDependency used only by the build script.

## Invariants (regression checklist)
- [ ] Every fixture point resolves on the device to the recorded
      geocoder district (`web/src/lib/pip.test.ts`, also a build gate),
      in both sets against their own fixture.
- [ ] On-device and Worker answer the same district for every fixture
      point of the active set; Missouri resolves to the 2022 map on both
      (`districts-120/MO.json` is cd119; `VINTAGE_OVERRIDES.MO`).
- [ ] `probe-districts.ts --set 119` and `--set 120` print zero
      mismatches (last run 2026-11-05: 510/510 each; Georgia 0/60
      points differ between vintages).
- [ ] Only `DISTRICTS_DIR` of the active set is requested; the other
      directory is never fetched (`pip.test.ts` asserts the URL).
- [ ] The lookup loads `states` first, then one state file, and never a
      name carrying a coordinate (`pip.test.ts` asserts the loader names).
- [ ] No request during the location path or a suggestion pick carries
      latitude, longitude or an address: only `GET /districts/<name>.json`
      and `POST /api/route {state, district, by_location | by_suggestion}`
      (`web/src/lib/pip.test.ts`, `web/src/components/AddressForm.test.tsx`).
- [ ] Open water, a point abroad and `NaN` return `null`; the page shows
      "We couldn't place that point. Enter an address." and the picker.
- [ ] Denying permission shows "No location shared. Enter an address
      instead." with the address field focused and the picker open.
- [ ] The control is absent when `navigator.geolocation` is absent.
- [ ] Every state file ≤300 KB gzip, `states.json` ≤150 KB gzip, 52
      entries in `manifest.json`; the build exits non-zero above a gate.
- [ ] `manifest.json` names the TIGER vintage, the Congress, the
      overrides and the tolerance of the committed output.

## Performance budget
Landing ≤100 KB transferred (geometry and `pip.ts` load only after the
control is tapped; the island's own chunk grows by under 1 KB gzip; the
inactive set costs nothing on the wire, ≈1.2 MB gzip of static hosting).
Lookup ≤500 ms on a mid-range phone once the files are cached (the test
asserts 52 warm lookups under 500 ms in Node). Per-state file ≤300 KB
gzip, `states.json` ≤150 KB gzip. `/api/route` unchanged, ≤2 s p95.
