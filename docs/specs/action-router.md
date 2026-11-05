# Action router

## Purpose
Turns a street address into the visitor's House district and senators and
the two open goals where their call matters most this week. It stops at the
two goal cards, plus the goal overview, `/donate`, `/about` and
`/privacy`; prep pages, generated documents and receipts are later
capabilities and are still stubs.

## Behavior
1. **Landing (`/`).** One address field ("Street address, city, state"),
   the button "Find my actions", the line "Full street address needed:
   cities are split between districts. Nothing is stored." and a link to
   all goals. Below it, every active goal as a card linking to
   `/goals/<slug>`.
2. **ZIP or partial input.** A bare ZIP (`\d{5}(-\d{4})?`) is refused
   before any lookup with "A ZIP code is not enough: many cities are split
   between districts. Enter your street address." Input shorter than eight
   characters or without a house number is refused as incomplete. Neither
   calls the geocoder.
3. **Lookup.** The Worker sends the address to the Census Geocoder
   (`geographies/onelineaddress`, benchmark `Public_AR_Current`, vintage
   `Current_Current`) and reads the 119th Congressional District and state.
   At-large districts (`00`, `98`) are district 0.
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
   `/`.
6. **Return visit.** The browser keeps only `{state, district}` in
   `localStorage` (`cut-ties:place`); `/` redirects straight to `/results`,
   which re-posts the stored pair. The last route response is cached in
   `sessionStorage` (`cut-ties:route`) for the immediate navigation only.
7. **Targets per goal.** Federal goals target the representative and both
   senators; leadership goals target only Democratic members of the
   relevant chamber; state goals target the state treasurer row. Role,
   phone and position come from `data/` rows (phone falls back to the
   Capitol switchboard until office numbers are sourced).
8. **Goals overview (`/goals`).** Every `active` goal as a card in
   priority order: category chip, "Priority n" chip, title, summary (≤60
   words, enforced at seed), "We want" sentence, decision date or "not yet
   scheduled", CTA to `/goals/<slug>`. Below, an "Outcomes" strip lists
   every `completed` and `expired` goal with its `outcome_note` and
   decision date (empty state: "No goal has closed yet"). Two columns at
   ≥768 px.
9. **Goal detail (`/goals/<slug>`).** Hero (category chip, status chip
   when closed, title, summary, decision date); "The situation"
   (`detail_md` rendered as markdown, else the summary); "What we want";
   "Who decides and when" (`decider`, decision date, window end); "Our
   pick" block when `our_picks` is non-empty (first pick: name, rationale,
   source link, signal date); the goal's actions as buttons to
   `/goals/<slug>/act/<action>`; partner campaign link when `partner_url`
   is set; sources list (`sources` rows) or a "not yet sourced" line. The
   sidebar's "Your targets" island reads the stored `{state, district}`
   and calls `GET /api/goals/<slug>/targets`; with nothing stored it shows
   "Enter your address" linking to `/`. A closed goal shows its outcome
   block instead of targets and actions. Every page carries Open Graph
   and Twitter share metadata with a 1200×630 card at
   `/goals/<slug>/card.png` (other pages use `/card.png`).
10. **Goal lifecycle.** `upcoming → active → completed | expired`. An
   `upcoming` goal has no page, is absent from `/api/goals` and from the
   ranking. When the goal naming it in `successor_slug` is `completed` or
   `expired`, the loader flips it to `active` on the next seed and build,
   so retiring a goal is one YAML edit and no code change.
11. **Donate (`/donate`).** States "This site is built and paid for by
    George Nguyen, one person, not a PAC or organisation. Donations are not
    tax-deductible and are not political contributions to any candidate.",
    then "Running it costs about $N a month" (formatted by code from
    `MONTHLY_COST_USD`, default $15) and four Stripe Payment Link buttons
    (one-time $5 / $20 / $50, monthly $5) that open in a new tab with
    `rel="noopener noreferrer"`. A link that is unset or not `https://`
    renders a disabled button reading "link not configured". The header
    carries a Donate button and the footer the self-funding line with a
    Donate link on every page.
12. **About and privacy.** `/about` says who runs the site (one person,
    not a PAC), what it does, who pays and links to `/donate` and
    `/privacy`. `/privacy` lists what is stored (district only in the
    browser and on the server, never the address; receipts without
    identity; shingle hashes, not document text) and what is sent where
    (address → Census Geocoder through the Worker, not logged; form fields
    → Anthropic, not retained by the site; Turnstile; Stripe handles
    payments in its own tab).

## Data & contracts
- `POST /api/route` body `{address, turnstile?}` or `{state, district,
  turnstile?}`. 200 `{state, district, house, senators, state_row, goals}`
  where `goals` is at most two `GoalCard`s (`worker/src/route.ts`).
  Errors: 400 `bad_json | zip_only | incomplete | missing`, 403
  `turnstile`, 404 `unresolved | no_delegation`, 502 `upstream`; every
  error body is `{error, message}`.
- Turnstile is verified when `TURNSTILE_SECRET` is set and skipped
  otherwise (local dev). `GEOCODER_URL` overrides the Census base URL.
- `GET /api/goals` lists active goals in rank order without eligibility
  rules. `GET /api/goals/:slug/targets?state=XX&district=N` → `{targets:
  TargetCard[]}` for one active goal, same rules as the results cards;
  400 `missing`, 404 `no_goal` (unknown, upcoming or closed) or
  `no_delegation`.
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
- D1 tables `goals`, `actions`, `members`, `positions`, `states`
  (`worker/schema.sql`) are regenerated from `data/` by
  `npm run seed -w worker`; the seed validates slugs, categories,
  priorities, summary length (≤60 words), `outcome_note` on closed goals,
  `our_picks` (≤3 rows with name, rationale, source_url), `sources`
  (`{title, url}` rows), `successor_slug` targets, and that every
  position row carries a source. `goals.status` also allows `upcoming`;
  `goals.decider` is the one-line "who decides".
- The static site reads `data/` at build through the Worker's loader
  (Vite alias `@worker` → `worker/src`, `web/src/lib/goals.ts`), so
  pages and API agree on every row and on the lifecycle. Share cards are
  rendered at build by `sharp` from an SVG template; absolute share URLs
  need `SITE_URL` in the Pages build environment.
- Donation config is read at build, not by the Worker (the pages are
  static; this replaces the PRD's "Worker vars"): `MONTHLY_COST_USD`
  (number, default 15 from the PRD estimate) and `STRIPE_LINKS` (JSON
  `{once_5, once_20, once_50, monthly_5}` of Stripe Payment Link URLs,
  default `{}`). Set both in the Pages build environment, like `SITE_URL`;
  parsing is `web/src/lib/donate.ts`. Invalid values fall back to the
  defaults.
- Browser storage: `localStorage` `cut-ties:place` = `{state, district}`;
  `sessionStorage` `cut-ties:route` = last route response.

## Invariants (regression checklist)
- [ ] The address is never logged, stored or echoed: the only outbound
      request carrying it is the geocoder call, and the response body
      does not contain it (`worker/test/route.test.ts`).
- [ ] A ZIP-only submission never reaches the geocoder.
- [ ] Exactly two cards for a resolved district, each with ≥1 target;
      an all-Republican delegation gets the NDAA goal plus the state goal.
- [ ] Leadership-goal targets are Democrats only.
- [ ] Every number and name on a card traces to a `data/` row; nothing is
      computed by an LLM.
- [ ] `/api/route` never writes to D1.
- [ ] Fixture delegations D/DD, D/RR, R/DD, R/RR, R/DR, D/DR (one in a
      split city) resolve to the goals in `worker/test/fixtures.ts`.
- [ ] A goal YAML whose rule names an unknown field, a wrong value type
      or an unknown key fails `npm run seed` and `parseRule`.
- [ ] Flipping a goal to `completed`/`expired` in YAML moves its
      `upcoming` successor to `active` on the next load, the ranking picks
      it up, and a closed goal without `outcome_note` fails the seed
      (`worker/test/goals.test.ts`).
- [ ] An `upcoming` goal has no page, no act page and is absent from
      `/api/goals`; `/api/goals/:slug/targets` returns Democrats only for
      leadership goals and the treasurer row for state goals.

## Performance budget
Landing ≤100 KB transferred (measured 2026-11-04: 7 KB gzip for HTML,
CSS and the page's JS chunks, fonts excluded; `/goals` 6 KB,
`/goals/<slug>` 7 KB, `/donate` 1.4 KB); LCP ≤1.5 s on a mid-range phone
over 4G; `/api/route` ≤2 s p95; infra cost excluding LLM and domain
= $0/month.
