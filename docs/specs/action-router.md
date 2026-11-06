# Action router

## Purpose
Turns a street address into the visitor's House district and senators and
the two open goals where their call matters most this week. It stops at the
two goal cards. The goal overview, goal detail and prep pages, `/donate`,
`/about` and `/privacy` are in `goal-pages.md`; the act page, generated
documents, receipts and reports are in `personalised-documents.md`.

## Behavior
1. **Landing (`/`).** One address field ("Street address, city, state"),
   the button "Find my actions", the line "Full street address, or use
   your location: nothing is stored." and a link to
   all goals. Below it, every active goal as a card linking to
   `/goals/<slug>`. Under the field, only when the browser offers
   `navigator.geolocation`, the control "Use my location instead"
   (`on-device-districts.md`).
   A return visitor with a stored district and an open
   commitment or captain list sees the "Your week" card above the field
   (`commitment-funnel.md` §5) instead of the redirect in §6.
2. **ZIP or partial input.** A bare ZIP (`\d{5}(-\d{4})?`) is refused
   before any lookup with "A ZIP code is not enough: many cities are split
   between districts. Enter your street address." Input shorter than eight
   characters or without a house number is refused as incomplete. Neither
   calls the geocoder.
3. **Lookup.** The Worker sends the address to the Census Geocoder
   (`geographies/onelineaddress`, benchmark `Public_AR_Current`, vintage
   = Worker var `DISTRICT_VINTAGE`, `ACS2025_Current` = 119th map until
   2027-01-03) and reads the district layer and state; `VINTAGE_OVERRIDES`
   re-queries Missouri once by coordinates (`on-device-districts.md`).
   At-large districts (`00`, `98`) are district 0. The location path
   never reaches the geocoder: the browser resolves a one-time position
   against `/districts/*.json` and posts `{state, district, by_location:
   true}`. A denied or failed position shows "No location shared. Enter
   an address instead."; a point in no polygon shows "We couldn't place
   that point. Enter an address."; both focus the address field and open
   the state + district picker.
4. **Unresolved.** No match returns 404 `unresolved` with "retry, or pick
   your state and district"; the page shows the message, keeps the field
   and opens a state + district picker that posts `{state, district}` and
   skips the geocoder. A state/district with no members in `data/` returns
   404 `no_delegation`.
5. **Results (`/results`).** Header `<STATE-NN> · change address`, H1
   "Your two actions this week", one line naming the delegation, then
   exactly two cards: category chip, title, decision date, summary, the
   targets for that goal (party, role, name, phone as `tel:`, position
   chip, prior-vote line, source link when a position is sourced), the
   ask text and a CTA to `/goals/<goal>/act/<action>`. Zero eligible goals
   shows a message and a link to `/goals`. One column at 390 px, two at
   ≥1024 px. "Change address" clears the stored district and returns to
   `/`. Under each card's targets box the `Counts` island adds one line
   ("12 constituents in TX-35 called this week", else the state line,
   else nothing) from `GET /api/counts`; buckets below the threshold
   arrive as 0 and the line waits for the response (`district-counters.md`).
6. **Return visit.** The browser keeps only `{state, district}` in
   `localStorage` (`cut-ties:place`); `/` redirects straight to `/results`,
   which re-posts the stored pair, unless an open commitment or captain
   list keeps the visitor on `/` (§1). The last route response is cached in
   `sessionStorage` (`cut-ties:route`) for the immediate navigation only.
7. **Targets per goal.** Federal goals target the representative and both
   senators; leadership goals target only Democratic members of the
   relevant chamber; state goals target the state treasurer row. A row
   with `left_office` is never a target; `not_returning` keeps its slot.
   Phone is the DC number, then the first in-state office from
   `data/district_offices.csv` as `district_city`/`district_phone`
   (a hand-filled phone has no city); the switchboard only otherwise.

## Data & contracts
- `POST /api/route` body `{address, turnstile?}` or `{state, district,
  turnstile?}`. 200 `{state, district, house, senators, state_row, goals}`
  where `goals` is at most two `GoalCard`s (`worker/src/route.ts`).
  Errors: 400 `bad_json | zip_only | incomplete | missing`, 403
  `turnstile`, 404 `unresolved | no_delegation`, 502 `upstream`; every
  error body is `{error, message}`.
- Turnstile is verified when `TURNSTILE_SECRET` is set and skipped
  otherwise (local dev). `GEOCODER_URL` overrides the Census base URL.
- Ranking (`worker/src/ranking.ts`): eligibility rule JSON (`always`,
  `all`, `any`, `house{field: value}`, `senator{…}`, `state{nonempty:
  […]}`) evaluated against the delegation; score = priority × urgency
  (2 when the decision is ≤14 days away, 1.5 when ≤45, else 1; past or
  empty date = 1); ties by earlier decision date then slug. One eligible
  goal is padded with the state goal. A rule may test only the §5.1
  inputs (house: party, hasc, conferee, rc243, btb_cosponsor; senator:
  party, jrd_april_2026; state: any column but `state`) with typed values
  (party `D|R|I`, flags `0|1`, text strings); `parseRule` rejects
  anything else, so the seed fails before a bad rule can silently
  exclude a goal. Grammar: `data/README.md`.
- Goal/action `id`s come from YAML and `data/ids.md`, never file order; a
  missing, duplicate, retired or unregistered id fails the seed.
- Browser storage: `localStorage` `cut-ties:place` = `{state, district}`;
  `sessionStorage` `cut-ties:route` = last route response;
  `localStorage` `cut-ties:device` = random per-browser id (the Worker
  stores only its SHA-256).
- `by_location: true` on the route body marks a location-path route; the
  Worker ignores unknown fields, so it is a metric placeholder until one
  reads it. No new storage key: the location path saves only the resolved
  `{state, district}`.

- Goal pages, `GET /api/goals`, the goal lifecycle, seed validation of
  goal rows and the donation config are in `goal-pages.md`; a `GoalCard`
  and a `TargetCard` share the row shapes defined there.

## Invariants (regression checklist)
- [ ] The address is never logged, stored or echoed: the only outbound
      request carrying it is the geocoder call, and the response body
      does not contain it (`worker/test/route.test.ts`).
- [ ] A ZIP-only submission never reaches the geocoder.
- [ ] Exactly two cards for a resolved district, each with ≥1 target;
      an all-Republican delegation gets the NDAA goal plus the state goal.
- [ ] Leadership-goal targets are Democrats only.
- [ ] Every number and name on a card traces to a `data/` row; nothing is
      computed by an LLM. Every dollar amount a state target shows equals
      the `states.csv` cell (`web/src/components/Target.test.ts`); a
      `none` state shows "holds none" with a source link and an `unknown`
      state links the research file.
- [ ] `/api/route` never writes to D1.
- [ ] Fixture delegations D/DD, D/RR, R/DD, R/RR, R/DR, D/DR (one in a
      split city) resolve to the goals in `worker/test/fixtures.ts`.
- [ ] A goal YAML whose rule names an unknown field, a wrong value type
      or an unknown key fails `npm run seed` and `parseRule`.
- [ ] Adding, renaming or removing a goal/action file moves no other id
      (`worker/test/ids.test.ts`).
- [ ] No coordinate is ever sent or logged: during the location path the
      only requests are `GET /districts/<name>.json` (no query string) and
      `POST /api/route {state, district, by_location}`
      (`web/src/lib/pip.test.ts` asserts the loader names).


## Performance budget
Landing ≤100 KB transferred (measured 2026-11-04: 7 KB gzip for HTML,
CSS and the page's JS chunks, fonts excluded); LCP ≤1.5 s on a mid-range phone
over 4G; `/api/route` ≤2 s p95; infra cost excluding LLM and domain
= $0/month.
