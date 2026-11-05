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
   [--state-interval 1000]` downloads one Census TIGER/Line shapefile per
   state (`TIGER<vintage>/CD/tl_<vintage>_<fips>_cd<congress>.zip`; the
   Census publishes no national CD file) into a cache outside the repo,
   two attempts per file, unzips it as data, drops the `ZZ` (undefined,
   water) rows and writes with mapshaper (Visvalingam, `interval` metres,
   `keep-shapes`): `web/public/districts/<STATE>.json` (TopoJSON, one
   layer `districts`, property `district`; `00` and `98` become 0, so an
   at-large state and DC are one polygon with district 0),
   `states.json` (every state dissolved to one outline, layer `states`,
   property `state`) and `manifest.json` (source, congress, build date,
   tolerances, size gates, bytes/gzip/sha256 per file). The build fails
   when a state file exceeds 300 KB gzip, `states.json` exceeds 150 KB
   gzip, or any point in `web/src/lib/districts.fixture.json` stops
   resolving to its recorded district. `--gate off` skips the size gates
   for tolerance experiments only. Output is committed; rerun it as a
   `data/`-style PR when a state's map or the Congress changes.
2. **Lookup (`web/src/lib/pip.ts`).** `resolvePoint(lon, lat, load?)`
   loads `states` first, keeps the outlines whose ring contains the point
   (or, when none does because the coarse outline shaved a coastline, the
   outlines whose bbox contains it), then loads each candidate state's
   file in turn and returns the first district whose rings contain the
   point (even-odd ray casting over every ring of a polygon or
   multipolygon, bbox pre-check). A point on a shared border returns the
   first match in file order; a point in no polygon returns `null`, as do
   non-finite coordinates. Decoded files are kept in memory for the page
   lifetime. The default loader is `GET /districts/<name>.json` with no
   query string.
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
  assets, cached by the CDN; no API.
- `manifest.json` `{source, congress, built, simplify{method,
  interval_m, state_interval_m, keep_shapes}, limits{state_gzip,
  states_gzip}, files{<name>{bytes, gzip, sha256}}}`; it is the vintage
  record the PRD asks for.
- `web/src/lib/districts.fixture.json` `{recorded, source, note,
  points[{label, lat, lon, state, district}]}`: 52 points (every state
  capitol, the US Capitol as DC district 0, a Philadelphia split-city
  point) with the Census Geocoder's answer, recorded once with
  `geographies/coordinates`, benchmark `Public_AR_Current`, vintage
  `ACS2025_Current` (the vintage that still carries the 119th
  Congressional Districts layer; `Current_Current` returns the 120th),
  district = `GEOID[2:]` (`98` → 0). Re-record by calling that endpoint
  for the same points; tests and builds never call it.
- `web/src/lib/pip.ts` exports `decode`, `pointInRing`, `contains`,
  `locateAll`, `resolvePoint`, `fetchLoader`, `clearCache` and the
  `Topology`, `Shape`, `Loader`, `Place` types; the island imports it
  dynamically so the landing bundle does not carry it.
- Route body: `{state, district, by_location: true, turnstile?}`; the
  Worker ignores `by_location` today (metric placeholder, see
  `action-router.md` §Data & contracts). No new browser storage key.
- `mapshaper` is a root devDependency used only by the build script.

## Invariants (regression checklist)
- [ ] Every fixture point resolves on the device to the recorded
      geocoder district (`web/src/lib/pip.test.ts`, also a build gate).
- [ ] The lookup loads `states` first, then one state file, and never a
      name carrying a coordinate (`pip.test.ts` asserts the loader names).
- [ ] No request during the location path carries latitude, longitude
      or an address: only `GET /districts/<name>.json` and `POST
      /api/route {state, district, by_location}`.
- [ ] Open water, a point abroad and `NaN` return `null`; the page shows
      "We couldn't place that point. Enter an address." and the picker.
- [ ] Denying permission shows "No location shared. Enter an address
      instead." with the address field focused and the picker open.
- [ ] The control is absent when `navigator.geolocation` is absent.
- [ ] Every state file ≤300 KB gzip, `states.json` ≤150 KB gzip, 52
      entries in `manifest.json`; the build exits non-zero above a gate.
- [ ] `manifest.json` names the TIGER vintage, the Congress and the
      tolerance of the committed output.

## Performance budget
Landing ≤100 KB transferred (geometry and `pip.ts` load only after the
control is tapped; the island's own chunk grows by under 1 KB gzip).
Lookup ≤500 ms on a mid-range phone once the files are cached (the test
asserts 52 warm lookups under 500 ms in Node). Per-state file ≤300 KB
gzip, `states.json` ≤150 KB gzip. `/api/route` unchanged, ≤2 s p95.
