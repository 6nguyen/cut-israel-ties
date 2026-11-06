# Address autocomplete — PRD
Status: APPROVED 2026-11-06 (auto) · Owner: George Nguyen · Last updated: 2026-11-06

## Problem
The landing field takes a free-text street address and gives no feedback
until after submit. On 2026-11-06 every address tried on the live site
failed: the Census Geocoder had renamed the district field (`CD119` →
`BASENAME`/`GEOID`), so every match parsed as `unresolved`, and the retry
reused a consumed Turnstile token ("Bot check failed"). Both are fixed in
PR #39, but the shape of the failure stays: the only live path runs
through one upstream with no SLA and no notice of changes, the visitor
cannot tell a typo from an outage, and the address travels through our
Worker to reach it. Sites that need a usable address show real
suggestions while the visitor types and let them pick one. Evidence and
provider comparison: `docs/research/address-autocomplete.md`.

## Goals / Non-goals
Goals:
- While typing, the visitor sees up to five real US street addresses and
  picks one; a picked address always routes.
- A picked address never reaches our server: the browser resolves the
  district from the suggestion's coordinates with the on-device lookup
  that the location path already uses, and posts `{state, district}`.
- Free text still works exactly as today (Census through the Worker), and
  the field works unchanged when suggestions are blocked, slow or
  exhausted.
- Infra cost stays $0/month and the landing stays ≤100 KB transferred.

Non-goals:
- No map, no provider SDK or widget on the page, no session tokens.
- No autofill of city/state/ZIP into separate fields: there is one field.
- No storage of the typed text, suggestions or coordinates anywhere.
- Not fixing Census field drift here: PR #39 did that and the parser keeps
  all three field names.

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/address-autocomplete.md` (providers, terms,
limits, the 2026-11-06 diagnosis).
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Suggest after 3 characters and ~250 ms idle, ≤5 results, abort the previous request | Mapbox and Geoapify docs, WAI-ARIA combobox pattern | adopt | One request per debounced edit keeps a visitor at 5–10 requests; the list stays readable on a phone |
| Mapbox Geocoding v6 forward with `autocomplete=true`, `country=us`, `types=address`, `proximity=ip`, `limit=5`, temporary results | Mapbox pricing and API docs | adopt as default provider | 100,000 free requests/month, 1,000 requests/minute, returns coordinates and `region_code`; temporary results are never stored, which is already an invariant |
| Geoapify Address Autocomplete, `filter=countrycode:us` | Geoapify docs | adapt as the second provider behind the same adapter | No card, commercial use allowed, coordinates; 5 requests/s shared ceiling and a "Powered by Geoapify" link; the flag switches to it if Mapbox terms or limits bite |
| Google Places Autocomplete (New) | Google pricing and Places policies | reject | Policy forbids point-in-polygon on its coordinates; 10,000 requests/month per SKU |
| Radar, HERE, Smarty | vendor pricing pages | reject | No usable free tier |
| Nominatim, public Photon | OSMF usage policy, photon.komoot.io | reject | Nominatim bans client-side autocomplete; Photon public has no guarantee |
| Resolve the picked suggestion's coordinates on the device | this site's location path (`on-device-districts.md`) | adopt | Removes Census and the Worker from the happy path; the Worker sees only `{state, district}` |
| Enter without picking submits the typed text to the existing path | every address form reviewed | adopt | Suggestions are a help, never a gate; the Census path and the picker remain |
| Provider attribution under the list | Mapbox and Geoapify terms | adopt | Required by both providers' terms when results show |
| Silent failure of the suggestion request | ad-blocked and offline behavior of the sites reviewed | adopt | A blocked provider must not cost a route |

## Users
- A first-time visitor on a phone: types a few characters, taps the
  right line, lands on `/results`. Copy stays the existing one line.
- A visitor whose ad blocker or network blocks the provider: never sees
  a list, submits free text as today, never sees an error about
  suggestions.
- A screen-reader or keyboard user: the field is a WAI-ARIA combobox;
  the count of suggestions is announced, arrows move, Enter picks,
  Escape closes.
- The maintainer: one Pages build variable per provider; `none` restores
  today's field without a deploy of code.

## Expected behavior
### 1. Field
The landing address input (`action-router.md` §1) becomes a
combobox (`role="combobox"`, `aria-expanded`, `aria-controls`,
`aria-activedescendant`, `autocomplete="off"` on the input, `aria-live`
count). Placeholder, button, helper line, "Use my location instead" and
the goal cards are unchanged. The field renders identically when the
provider flag is `none`.
### 2. Suggesting
After the third character and 250 ms without a
keystroke, the browser requests at most five US street-address
suggestions from the configured provider, aborting any request still in
flight. No request fires for a bare ZIP (no letter in the text) or for
text under three characters. Suggestions show under the field as a
list of full one-line addresses ("1000 N Main St, Santa Ana, California
92701, United States" shortened to street, city, state ZIP), with the
provider's attribution line under the list while it is open. Arrow
keys move the highlight, Enter or tap picks, Escape or blur closes.
A request that fails, times out (2 s) or returns 429 closes the list
silently; the field keeps working.
### 3. Picking
A pick fills the field with the suggestion's label and
starts the route: the browser loads `/districts/<STATE>.json` for the
suggestion's state (the same loader as the location path) and runs the
point-in-polygon on the suggestion's coordinates, then posts
`{state, district, by_suggestion: true}` to `/api/route` and goes to
`/results`. The typed text, the suggestion and the coordinates leave
memory when the page unloads; none is stored. A point in no polygon
falls through to step 4 with the suggestion's label as the address.
### 4. Free text
Submit without a pick (Enter with no highlight, or the
button) runs today's path unchanged: ZIP-only and incomplete refusals
before any request (§2), then `POST /api/route {address, turnstile}`
to the Census Geocoder. The unresolved message becomes "We could not
place that address. Pick one of the suggestions, check the address, or
pick your state and district." when suggestions are enabled; it stays
today's text when the flag is `none`.
### 5. Retry
Any failed submit resets Turnstile and the next submit waits
for a fresh token (PR #39), so "Bot check failed" is shown only when the
challenge itself fails.
### 6. Privacy copy
`/privacy` says: as you type, the characters you type
go from your browser to <provider> to suggest addresses; the address
you pick stays in your browser, which works out your district and
sends only your state and district to our server; if you submit without
picking, the address goes to the US Census Bureau's geocoder through
our server as before. The provider name comes from the flag; `none`
restores the current paragraph.
### 7. Location path, picker, return visit
Unchanged
(`on-device-districts.md` §2, `action-router.md` §4, §6).

## Data & contracts
- Pages build env: `PUBLIC_SUGGEST_PROVIDER` = `none | mapbox | geoapify`
  (default `none`), `PUBLIC_SUGGEST_TOKEN` = the provider's public token.
  The token is URL-restricted to the site's origins in the provider
  console; a missing token with a provider set behaves as `none` and the
  build warns.
- `web/src/lib/suggest.ts`: `suggest(q: string, signal: AbortSignal):
  Promise<Suggestion[]>`, `Suggestion = { label: string; state: string;
  lon: number; lat: number }`. One adapter per provider maps the response
  and drops results without a house number or a two-letter state.
  - Mapbox: `GET https://api.mapbox.com/search/geocode/v6/forward?q=…&autocomplete=true&country=us&types=address&limit=5&proximity=ip&access_token=…`;
    `state` from `properties.context.region.region_code`, coordinates from
    `geometry.coordinates`.
  - Geoapify: `GET https://api.geoapify.com/v1/geocode/autocomplete?text=…&filter=countrycode:us&limit=5&apiKey=…`;
    keep features with `properties.housenumber`; `state` from
    `properties.state_code`; `lon`/`lat` from properties.
- `web/src/components/AddressForm.tsx`: the combobox, debounce, abort,
  keyboard handling, attribution line; picking calls `resolvePoint(lon,
  lat)` from `web/src/lib/pip.ts`, then the existing `go({state,
  district, by_suggestion: true})`.
- `POST /api/route` body may carry `by_suggestion: true`; like
  `by_location`, the Worker ignores it until a metric reads it. No new
  Worker code, no new storage key, no D1 change.
- Provider accounts: Mapbox account with no card on file (overage is then
  impossible; suggestions stop at the cap and the field falls back to free
  text), or a Geoapify account (no card). Monthly usage is read in the
  provider console.

## Spec delta
- MODIFIED `docs/specs/action-router.md` §Behavior 1: the address field is
  a combobox that suggests up to five US street addresses after three
  characters and 250 ms idle when `PUBLIC_SUGGEST_PROVIDER` is set, with
  the provider's attribution under the open list; unchanged when `none`.
- MODIFIED `docs/specs/action-router.md` §Behavior 2: the ZIP-only and
  incomplete refusals apply to free-text submits; a bare ZIP or text under
  three characters also never triggers a suggestion request.
- MODIFIED `docs/specs/action-router.md` §Behavior 3: a picked suggestion
  is resolved on the device from its coordinates (`/districts/<STATE>.json`
  point-in-polygon) and posted as `{state, district, by_suggestion:
  true}`; the Census lookup serves free-text submits and a suggestion
  whose point lies in no polygon.
- MODIFIED `docs/specs/action-router.md` §Behavior 4: unresolved message
  gains "Pick one of the suggestions" when suggestions are enabled.
- MODIFIED `docs/specs/action-router.md` §Data & contracts: `by_suggestion`
  on the route body (metric placeholder), the two Pages build variables,
  `web/src/lib/suggest.ts` contract.
- MODIFIED `docs/specs/action-router.md` §Invariants: "the only outbound
  request carrying the address is the geocoder call" → "the only
  outbound requests carrying typed text are the suggestion calls from the
  browser to the configured provider and, for a free-text submit, the
  Worker's geocoder call; a picked suggestion never reaches the Worker:
  the route body carries only `{state, district, by_suggestion}`
  (`web/src/lib/suggest.test.ts`, `worker/test/route.test.ts`)".
- ADDED `docs/specs/action-router.md` §Invariants: suggestion requests
  never fire for a bare ZIP, text under three characters, or when the
  provider flag is `none`; a failed suggestion request never shows an
  error or blocks a submit.
- MODIFIED `docs/specs/on-device-districts.md` §Behavior 2: the
  point-in-polygon also serves the coordinates of a picked address
  suggestion; the "no coordinate leaves the device" invariant covers both
  entries.
- MODIFIED `docs/specs/goal-pages.md` §`/privacy` (the address bullet):
  the provider sentence from Expected behavior 6, keyed on the flag.
- MODIFIED `docs/specs/action-router.md` §Performance budget: landing ≤100
  KB including the combobox (≤3 KB gzip added, no third-party script);
  suggestions ≤800 ms p95 from the browser.

## Acceptance criteria
- [ ] With `PUBLIC_SUGGEST_PROVIDER=mapbox`, typing `1000 N Main St, Santa`
      shows ≤5 US street-address suggestions after the third character and
      250 ms idle; the network panel shows one provider request per
      debounced edit and aborted earlier ones.
- [ ] Picking "1000 N Main St, Santa Ana, CA 92701" lands on `/results`
      for CA-46; the only requests after the pick are `GET
      /districts/CA.json` and `POST /api/route` with body `{state: "CA",
      district: 46, by_suggestion: true, turnstile}`; no request carries
      the address.
- [ ] Typing `92701` or `12 Ma` fires no suggestion request; submitting
      `92701` shows the ZIP refusal before any request.
- [ ] Submitting free text without a pick resolves through the Census path
      and lands on `/results`; with the provider host blocked (offline or
      blocklisted) the list never opens, no error about suggestions is
      shown, and the free-text submit still works.
- [ ] A provider 429 or a 2 s timeout closes the list silently.
- [ ] Keyboard: ArrowDown highlights the first suggestion, Enter picks it,
      Escape closes the list; a screen reader hears the suggestion count
      and the highlighted line (`role="combobox"` checks in
      `web/src/components/AddressForm.test.tsx`).
- [ ] The provider's attribution is visible whenever the list is open.
- [ ] After a failed submit (for example a forced 404), the next submit
      succeeds without a reload (Turnstile reset, PR #39).
- [ ] `PUBLIC_SUGGEST_PROVIDER=none` (or a missing token) renders today's
      field, messages and privacy paragraph byte-for-byte except the
      combobox attributes.
- [ ] `/privacy` names the configured provider and the three data paths
      (typed characters → provider; picked address → device only; free
      text → Census via our server).
- [ ] Landing transfer ≤100 KB with the combobox (measured and quoted in
      the PR); the page loads no third-party script for suggestions.
- [ ] Infra cost stays $0/month: the provider account has no card on file
      and the first month's usage is quoted in the PR that flips the flag.
- [ ] `/api/route` unchanged: p95 ≤2 s, no D1 writes, `by_suggestion`
      ignored.

## Rollout & metrics
- Flag: `PUBLIC_SUGGEST_PROVIDER` ships as `none`; the maintainer creates
  the provider account (no card), URL-restricts the token to
  `cutthetiesmovement.org` and the `*.pages.dev` previews, sets both
  variables in the Pages build environment (GitHub Actions variables →
  `deploy-web`), and flips the flag in a config-only PR.
- Rollback: set the flag to `none`; no code change.
- Measure: share of routes by entry (`by_suggestion`, `by_location`,
  address, picker) once a metric reads the placeholders; `/api/route` 404
  `unresolved` rate before and after (expected to fall toward the free-text
  share only); provider monthly requests against the free tier (console).

## State (updated 2026-11-06, PR #44)
- Sections: (build order)
  - [~] 1. Field · combobox, debounce, abort, keyboard, attribution, flag `none` path · `feat/address-autocomplete-field` · PR #44
  - [ ] 2. Suggesting · `web/src/lib/suggest.ts` with the Mapbox and Geoapify adapters and tests
  - [ ] 3. Picking · on-device resolve, `by_suggestion`, no-polygon fallthrough
  - [ ] 4. Free text · message copy, spec fold
  - [ ] 6. Privacy copy · `/privacy` paragraph keyed on the flag, `goal-pages.md` fold
- Completed: —
- Folded: §1 Field
- Branch / open PRs: `feat/address-autocomplete-field` (§1, PR #44)
- Files changed: `web/src/lib/suggest.ts` (new), `web/src/components/AddressForm.tsx`,
  `web/src/pages/index.astro`, `web/src/lib/suggest.test.ts`,
  `web/src/components/AddressForm.test.tsx`, `docs/specs/action-router.md`
- Tests run + result: `quiet-check test-web` PASS (77 passed, 2 skipped; 8 new
  in suggest.test.ts, 5 in AddressForm.test.tsx); `quiet-check build` PASS;
  landing 33.3 KB gzip (HTML + CSS + reached JS), combobox +1.4 KB gzip
- Remaining: §2, §3, §4, §6; manual: provider account, token restriction,
  Pages variables, flag flip PR
- Decisions since last update: `none` renders today's input untouched (no
  combobox role) so street-address autofill keeps working; the combobox
  attributes appear only with a provider; a §1 pick fills the field and
  closes the list, §3 adds the on-device resolve; `AddressForm` takes
  `suggester`/`timings` props as the test seam
- Known failures / blockers: none
- Next action: merge PR #44, then `/implement-prd-section
  docs/prd/address-autocomplete.md` (next: §2. Suggesting)
## Open questions
1. Provider terms for on-device use of temporary results. Mapbox forbids
   caching temporary geocoding results; this design uses each result once,
   in memory, and stores nothing. Proposal: build on Mapbox; during the
   Suggesting section re-read the Mapbox Terms of Service section on
   temporary geocoding and, if it forbids any derived use, flip the flag to
   `geoapify` before launch (same adapter contract, no behavior change).
2. What happens past the free tier. Proposal: keep no card on the
   provider account, so overage cannot bill; past the cap the provider
   returns errors, the list stays closed and the field falls back to free
   text; the maintainer reads usage monthly and raises a PRD change if
   volume nears 100,000 requests a month.
3. Should a pick skip Turnstile, since the Worker only receives `{state,
   district}`? Proposal: no; every route post keeps the token as today
   (PR #39 makes retries work), and the question returns if the challenge
   measurably costs picks.
4. Shortening labels. Proposal: show "street, city, ST ZIP" built from the
   provider's structured fields, never the provider's full formatted
   string; a result missing any of those fields is dropped.

## Changes
- 2026-11-06 — created; APPROVED (auto): no blocking questions, proposals
  1–4 are the decisions.
- 2026-11-06 — §1 Field built: `web/src/lib/suggest.ts` (flag, gate,
  debounce/abort loop; adapter table filled by §2), the combobox in
  `AddressForm.tsx`, `index.astro` reads the flag at build. `none` keeps
  today's input byte-for-byte (no combobox role, so browser street-address
  autofill still works). Spec folded. Landing 33.3 KB gzip, +1.4 KB.
