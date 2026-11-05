# Action router

## Purpose
Turns a street address into the visitor's House district and senators and
the two open goals where their call matters most this week. It stops at the
two goal cards, then the goal overview, goal detail and prep pages; the
generated documents and receipts are later capabilities and are still
stubs.

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
11. **Prep page (`/goals/<slug>/prep`).** Built for every published goal
   with a non-empty `prep_md` (never for `upcoming` goals); the goal page
   links to it ("Prep: what to say"). Hero with a "Take action" anchor;
   for a `leadership` goal the page leads with "Our picks": up to three
   `our_picks` in order (name, rationale, source link, signal, signal date,
   plus "as of" the latest signal date) and "The ask, same for every
   caller" = `what_we_want` followed by "Our first pick: <name>." (just
   `what_we_want` with no picks; a leadership goal with no picks says so
   instead of naming anyone). Then the six `prep_md` sections as numbered
   blocks (where things stand, timeline, what to say in 30 seconds, likely
   pushback and answers, what counts as a win, sources; the goal's
   `sources` rows are listed under Sources). `[VERIFY: …]` markers render
   as visible chips. The "Take action" island reads the stored
   `{state, district}`, calls `GET /api/goals/<slug>/targets` and links each
   target to `/goals/<slug>/act/<action>?target=<bioguide_id>` for every
   action of the goal (no `target` for a target without a bioguide id; no
   stored place shows "Enter your address" plus a plain link to the first
   action). A closed goal has no Take action block.

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
  `our_picks` (≤3 rows with name, rationale, source_url), `prep_md` (when
  non-empty: exactly the six `##` headings of `worker/src/prep.ts` in
  order, each non-empty, "Where things stand" carrying an ISO date),
  `sources`
  (`{title, url}` rows), `successor_slug` targets, and that every
  position row carries a source. `goals.status` also allows `upcoming`;
  `goals.decider` is the one-line "who decides".
- The static site reads `data/` at build through the Worker's loader
  (Vite alias `@worker` → `worker/src`, `web/src/lib/goals.ts`), so
  pages and API agree on every row and on the lifecycle. Share cards are
  rendered at build by `sharp` from an SVG template; absolute share URLs
  need `SITE_URL` in the Pages build environment.
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
- [ ] Every goal with `prep_md` has `/goals/<slug>/prep` with all six
      sections and no `upcoming` goal has one; a `prep_md` missing a
      heading, out of order, with an empty section or an undated "Where
      things stand" fails the seed (`worker/test/prep.test.ts`); a
      leadership goal with `our_picks` shows them in order before any
      section, and the ask names the first pick; every date, count or name
      in `prep_md` is a `data/` row or carries a `[VERIFY: …]` marker.

## Performance budget
Landing ≤100 KB transferred (measured 2026-11-04: 7 KB gzip for HTML,
CSS and the page's JS chunks, fonts excluded; `/goals` 6 KB,
`/goals/<slug>` 7 KB, `/goals/<slug>/prep` HTML 4-5 KB gzip); LCP ≤1.5 s on a mid-range phone
over 4G; `/api/route` ≤2 s p95; infra cost excluding LLM and domain
= $0/month.
