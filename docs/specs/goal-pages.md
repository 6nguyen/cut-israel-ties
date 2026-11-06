# Goal pages

## Purpose
The public pages behind the two result cards: the goals overview, each
goal's detail and prep pages, the goal lifecycle that decides which goals
are published, and the static `/donate`, `/about` and `/privacy` pages.
Address lookup, ranking and the result cards are in `action-router.md`;
the act page is in `personalised-documents.md`. Split out of
`action-router.md` on 2026-11-05; the behavior numbers below were 8–15
there.

## Behavior
1. **Goals overview (`/goals`).** Every `active` goal as a card in
   priority order: category chip, "Priority n" chip, title, summary (≤60
   words, enforced at seed), "We want" sentence, decision date or "not yet
   scheduled", CTA to `/goals/<slug>`. Below, an "Outcomes" strip lists
   every `completed` and `expired` goal with its `outcome_note` and
   decision date (empty state: "No goal has closed yet"). Two columns at
   ≥768 px. The footer, and each goal page's aside, carry the
   decision-date feed link (`decision-feed.md`).
2. **Goal detail (`/goals/<slug>`).** Hero (category chip, status chip
   when closed, title, summary, decision date); "The basics / What is
   going on" (`detail_md` rendered as markdown, else the summary); "What
   we are asking for"; "Who makes the call, and when" (`decider`, decision
   date, window end); "Who we would back instead" block when `our_picks` is non-empty (first pick: name, rationale,
   source link, signal date); the goal's actions as buttons to
   `/goals/<slug>/act/<action>`; partner campaign link when `partner_url`
   is set; sources list (`sources` rows) or a "not yet sourced" line.
   A "Where everyone stands →" link opens `/goals/<slug>/whip` for goals
   that have a whip table (`member-pages.md`). The
   sidebar's "Who to call" island reads the stored `{state, district}`
   and calls `GET /api/goals/<slug>/targets`; with nothing stored it shows
   "Enter your address" linking to `/`. A non-empty target list carries
   the same counter line as a result card (`district-counters.md`). A closed goal shows its outcome
   block instead of targets and actions. Every page carries Open Graph
   and Twitter share metadata with a 1200×630 card at
   `/goals/<slug>/card.png` (other pages use `/card.png`).
3. **Goal lifecycle.** `upcoming → active → completed | expired`. An
   `upcoming` goal has no page, is absent from `/api/goals` and from the
   ranking. When the goal naming it in `successor_slug` is `completed` or
   `expired`, the loader flips it to `active` on the next seed and build,
   so retiring a goal is one YAML edit and no code change.
4. **Prep page (`/goals/<slug>/prep`).** Built for every published goal
   with a non-empty `prep_md` (never for `upcoming` goals); the goal page
   links to it ("Prep: what to say"). Hero with a "Take action" anchor;
   for a `leadership` goal the page leads with "Our picks / Who we would
   back instead": up to three
   `our_picks` in order (name, rationale, source link, signal, signal date,
   plus "as of" the latest signal date) and "What to ask for, in one
   line" = `what_we_want` followed by "Our first pick: <name>." (just
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
5. **Donate (`/donate`).** States "This site is built and paid for by
    George Nguyen, one person, not a PAC or organisation. Donations are not
    tax-deductible and are not political contributions to any candidate.",
    then "Running it costs about $N a month" (formatted by code from
    `MONTHLY_COST_USD`, default $15) and four Stripe Payment Link buttons
    (one-time $5 / $20 / $50, monthly $5) that open in a new tab with
    `rel="noopener noreferrer"`. A link that is unset or not `https://`
    renders a disabled button reading "link not configured". The header
    carries a Donate button and the footer the self-funding line with a
    Donate link on every page.
6. **About and privacy.** `/about` says who runs the site (one person,
    not a PAC), what it does, who pays and links to `/donate` and
    `/privacy`. `/privacy` lists what is stored (district only in the
    browser and on the server, never the address; receipts without
    identity; shingle hashes, not document text) and what is sent where
    (address → Census Geocoder through the Worker, not logged; when
    `PUBLIC_SUGGEST_PROVIDER` is set, that bullet instead names the
    provider and the three paths: the characters typed go from the
    browser to the provider to suggest addresses, a picked address stays
    in the browser, which sends only state and district, and a submit
    without a pick goes to the Census geocoder through the Worker as
    before; `none` keeps today's bullet; form fields
    → Anthropic, not retained by the site; Turnstile; Stripe handles
    payments in its own tab). A "District-office visits" bullet names the
    organiser's contact link as personal data they chose to share, handed
    only to people who say they will come, deletable with the listing
    (docs/specs/office-visits.md).
7. **State goal copy.** The treasurer target (results card and the goal
    page's "Who to call") carries one holdings line built by code from
    the `states.csv` row's `holdings_status`: `held` → "Israel Bonds:
    holds $<israel_bonds_usd> (as of <holdings_date>)" with a "source"
    link to `holdings_source`; `none` → "Israel Bonds: holds none (as of
    <holdings_date>)" with the same source link; `unknown` → "Israel
    Bonds: not yet sourced" with a "help us find it" link to the research
    file on GitHub (`RESEARCH_URL`). The state action's ask replaces
    `{decider}` with the row's `decider` when set, else "your state
    treasurer" (static pages, which have no state, always show the
    fallback). `worker/src/state-copy.ts`: `holdingsLine`, `fillAsk`,
    `moneyUsd`.
8. **Electoral goal.** A `category: electoral` goal is a one-seat sourced
    record ranked at priority 1 with an "On the record" block and
    primary/filing-deadline dates; see `electoral-record.md`.

## Data & contracts
- `GET /api/goals` lists active goals in rank order without eligibility
  rules. `GET /api/goals/:slug/targets?state=XX&district=N` → `{targets:
  TargetCard[]}` for one active goal, same rules as the results cards;
  400 `missing`, 404 `no_goal` (unknown, upcoming or closed) or
  `no_delegation`.
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
- Donation config is read at build, not by the Worker (the pages are
  static): `MONTHLY_COST_USD`
  (number, default 15) and `STRIPE_LINKS` (JSON
  `{once_5, once_20, once_50, monthly_5}` of Stripe Payment Link URLs,
  default `{}`). Set both in the Pages build environment, like `SITE_URL`;
  parsing is `web/src/lib/donate.ts`. Invalid values fall back to the
  defaults.

## Invariants (regression checklist)
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
`/goals` ≤100 KB transferred (measured 2026-11-04: 6 KB gzip for HTML,
CSS and JS chunks, fonts excluded; `/goals/<slug>` 7 KB,
`/goals/<slug>/prep` 4–5 KB, `/donate` 1.4 KB); LCP ≤1.5 s on a mid-range
phone over 4G; every page is static, so no Worker call is on the render
path except the "Who to call" and "Take action" islands.
