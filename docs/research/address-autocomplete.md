# Address autocomplete: why the live field failed and how other sites fill usable addresses
Researched: 2026-11-06 · Informs: [address-autocomplete](../prd/address-autocomplete.md)

## Question
Every address tried on the live landing page on 2026-11-06 failed ("We
could not place that address", then "Bot check failed"). Why, and how do
sites that need a usable street address collect one: which suggestion
providers return coordinates inside a $0/month budget, whose terms allow
the use, and what the field itself should do?

## What failed on 2026-11-06 (diagnosis)
Reproduced in code, not from the screenshots alone:
- **"We could not place that address" = `unresolved` from `parseCensus`.**
  The Census Geocoder still matched every address tried (1000 N Main St,
  Santa Ana; 2830 N Glassell St, Orange; both CA-46 under
  `ACS2025_Current`, 0.2–0.9 s from a Cloudflare edge worker in LAX), but
  the `119th Congressional Districts` layer now carries `BASENAME: "46"`,
  `GEOID: "0646"`, `CDSESSN: "119"` and no `CD119` field. The parser read
  only `CD<nnn>`, so every match became `unresolved`. The
  `geographies/coordinates` endpoint (Missouri re-query) has the same
  shape. Fixed in PR #39 (reads `BASENAME`, then `GEOID`, then `CD<nnn>`).
- **"Bot check failed" on the retry = consumed Turnstile token.** Tokens
  are single-use; `AddressForm` rendered the widget once and never called
  `turnstile.reset()`, so the second submit reused the first token. Fixed
  in PR #39 (reset on every error, wait ≤4 s for the fresh token).
- Ruled out: Cloudflare egress blocked by Census (edge probe answered
  200 JSON), missing User-Agent (Census answers without one), production
  secrets (`GEOCODER_URL` unset, `TURNSTILE_SECRET` set), the 8 s
  timeout (p50 0.4 s).

What remains after the fix: the live path still depends on one upstream
with no SLA and a field layout that changed without notice, and the
visitor gets no feedback until after submit. A typeahead that shows real
addresses while typing removes both.

## Sources
| Source | Checked | What it settles |
|---|---|---|
| [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing) | 2026-11-06 | Places API (New), Essentials tier: Autocomplete Requests 10,000 free/month then $2.83/1k; Place Details Essentials 10,000 free then $5/1k; Geocoding 10,000 free then $5/1k; session SKU unlimited |
| [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies) | 2026-11-06 | "Google Maps" attribution required; lat/lng cacheable ≤30 days; **"Don't use Place latitude and longitude as input for point-in-polygon analysis"**; a selected street address is exempt from content terms only for that transaction and not for other lookup services |
| [Mapbox pricing](https://www.mapbox.com/pricing) | 2026-11-06 | Temporary Geocoding 100,000 requests free/month then $0.75/1k; Search Box 500 sessions / 50,000 requests free (preview); Address Autofill 1,000 sessions free then $12.50/1k; permanent results need a card |
| [Mapbox Geocoding API v6](https://docs.mapbox.com/api/search/geocoding/) | 2026-11-06 | `autocomplete=true` default, each keystroke is one request; `country`, `types`, `proximity=ip`, `limit` ≤10; 1,000 requests/minute; temporary results "not allowed to be cached" |
| [Geoapify pricing](https://www.geoapify.com/pricing/) and [autocomplete docs](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/) | 2026-11-06 | Free: 3,000 credits/day, 5 requests/s, no card, commercial use allowed, "Powered by Geoapify" link required; one autocomplete request = 1 credit; `filter=countrycode:us`, `bias=proximity:`; results carry `lat`/`lon` |
| [Radar pricing](https://radar.com/pricing) | 2026-11-06 | "Radar does not currently offer a free tier"; quotes only |
| [HERE pricing](https://www.here.com/get-started/pricing) | 2026-11-06 | No figures on the page; third-party guides claim 30,000/month with a card on file (unverified) |
| [Smarty pricing](https://www.smarty.com/pricing) | 2026-11-06 | 42-day trial of 1,000 lookups; cheapest plan $552/year; no free tier |
| [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) | 2026-11-06 | Autocomplete "is not yet supported by Nominatim and you must not implement such a service on the client side using the API"; 1 request/s |
| [Photon (komoot) public API](https://photon.komoot.io/) | 2026-11-06 | "extensive usage will be throttled", no availability guarantee; typeahead is a feature of the software, the public terms do not address it |
| [Census Geocoder](https://geocoding.geo.census.gov/geocoder/) | 2026-11-06 | No suggestion endpoint; one-line address and coordinate lookups only; probed shape above |
| [5 Calls FAQ](https://old.5calls.org/faq) | 2026-11-06 | Asks for a street address or cross streets when a ZIP spans districts; its provider is not disclosed |
| [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) | reference | Keyboard and screen-reader contract for a suggestion list under a text field |

## Findings
1. **Two free tiers fit a civic tool's volume; one of them forbids the
   design.** Google's Essentials SKUs give 10,000 autocomplete requests a
   month, which is 1,000–2,000 visitors typing (5–10 keystrokes each after
   debounce), and its policy forbids feeding a suggestion's coordinates
   into point-in-polygon analysis, which is exactly how this site resolves
   a district without a server. Mapbox Geocoding v6 gives 100,000
   temporary requests a month (10–20× the headroom) at 1,000
   requests/minute, returns coordinates and the state code, filters to US
   addresses and biases by the visitor's IP. Geoapify gives roughly
   90,000 credits a month with no card, but its 5 requests/second is a
   shared ceiling: a few dozen visitors typing at once hit it.
2. **"Temporary" results are the right fit.** Mapbox forbids caching
   temporary results; the site never stores an address or a coordinate
   (`action-router.md` invariants), so the suggestion is used once, in
   memory, in the browser. Permanent geocoding would need a card and is
   not needed.
3. **The OSM public services are out.** Nominatim bans client-side
   autocomplete outright; Photon's public instance has no guarantee and
   throttles, and self-hosting breaks the $0 budget. Radar, HERE and Smarty
   have no usable free tier.
4. **Suggestions let the browser skip the Worker and Census entirely.** A
   picked suggestion carries `lon`/`lat`; the existing on-device
   point-in-polygon (`on-device-districts.md`, `/districts/<STATE>.json`,
   CA 324 KB, TX 376 KB) gives `{state, district}` with no address leaving
   the device toward our server. Census stays as the path for free text
   (Enter without picking) and when a point lands in no polygon.
5. **The field behavior most sites converge on**: start after 3
   characters and ~250 ms idle; at most 5 suggestions; one request per
   debounced edit, previous request aborted; results restricted to one
   country and to street addresses; the picked label fills the field;
   Enter without a pick submits the typed text; Escape closes; arrows move;
   the provider's attribution sits under the list; a failed or slow
   suggestion request is silent (the field still submits). Google and
   Mapbox bill Search Box by session token; the plain Geocoding v6 call
   bills per request, so a session token is unnecessary.
6. **Ad blockers and privacy lists** block some provider hosts; the field
   must work unchanged with zero suggestions.

## Verdicts
| Option | Verdict | Why |
|---|---|---|
| Mapbox Geocoding v6 forward, `autocomplete=true`, `country=us`, `types=address`, `proximity=ip`, `limit=5` | **adopt** as the default provider | 100,000 free/month, 1,000 req/min, coordinates + `region_code`, temporary use matches "never stored" |
| Geoapify Address Autocomplete | **adapt** as the second provider behind the same adapter | No card, commercial OK, coordinates; 5 req/s shared ceiling and attribution link; the flag switches to it if Mapbox terms or limits bite |
| Google Places Autocomplete (New) | reject | Policy forbids point-in-polygon on its coordinates; 10,000/month cap per SKU |
| Radar, HERE, Smarty | reject | No usable free tier (Radar none; HERE unverified and card; Smarty trial only) |
| Nominatim, Photon public | reject | Nominatim bans autocomplete; Photon public has no guarantee; self-hosting costs money |
| Census Geocoder | keep as fallback | No suggestions, but free and already integrated; serves free text and no-polygon points |
| Provider SDK / widget on the landing page | reject | Landing budget is ≤100 KB; a `fetch`-based combobox is ≤3 KB gzip |
| On-device point-in-polygon for the picked suggestion | adopt | Reuses `resolvePoint`; removes Census from the happy path; the Worker never sees the address |
