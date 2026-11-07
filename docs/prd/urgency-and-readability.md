# Urgency and readability — PRD
Status: APPROVED 2026-11-06 (auto) · Owner: George Nguyen · Last updated: 2026-11-06

## Problem
Seven owner findings from using the live site on 2026-11-06, in one
change because they touch the same three screens (result cards,
`/results`, the act page) and the site chrome around them:
1. The section headlines (`headline-lg`/`headline-md`: "Our picks are not
   set yet", the result-card title "Stop Israel's integration into the US
   military") are set in Syne 800, the style guide's headline face. The
   owner finds it hard to read and wants the hero face, Bebas Neue, on
   H2s too.
2. Scripts keep redrafting: the model overshoots the 60–120-word call
   budget by a few words ("word count 122 is outside 60–120") and the
   output check sends it back, until the user sees "Try different
   wording". 120 is tighter than a 60-second call needs.
3. The two result goals must be the ones with the most impact and the
   nearest deadline. Today `score = priority × urgency` with urgency in
   three coarse steps (2 within 14 days, 1.5 within 45, else 1): a goal
   deciding in 15 days scores the same as one deciding in 45, and the
   `priority` field is nowhere explained as impact.
4. Nothing on the result cards, `/results` or the act page drives
   urgency. A card shows "Decision: Nov 18" in small label type; the act
   page shows no date at all until the commitment step. The owner wants a
   clock the visitor can watch tick (days, hours, minutes, seconds), in
   the style guide's rotated dashed "COUNTDOWN" stamp.
5. The address field only "completes" once a full address is typed. The
   typeahead combobox exists (`action-router.md` §1, archived
   `address-autocomplete` PRD) but it renders only when the Pages build
   sets `PUBLIC_SUGGEST_PROVIDER`, which the live build does not: neither
   `.env.example`, `docs/guides/deploy.md` nor CI mentions it. What the
   owner sees is the browser's own saved-address fill, which triggers only
   on a previously entered address.
6. The site has no logo: no favicon (the tab shows the browser default),
   a text-only wordmark in the header and a text-only share card. The
   owner supplied a 1024 × 1024 PNG mark (green fists breaking a rope,
   "CUT THE TIES", on an opaque white square) at
   `web/src/assets/logo-1024.png`.
7. The "Who to call" list on `/results` is one bordered box with
   rule-separated rows; the style guide's spec 06 (Target Chips) gives
   each person their own white card with the ink outline and brutal
   shadow, a 40 px party badge, a Bebas Neue name, a mono role line and
   a square call button. The live page reads as a table, not a deck of
   targets.

## Goals / Non-goals
- Goals: headlines readable at a glance on a phone, in one display face;
  a first draft passes the length check far more often; the ranking
  formula weights every nearer deadline more, stated once in the spec as
  impact × urgency; a ticking countdown on the three screens; the
  typeahead switched on in production; the logo in the browser tab, the
  header and the share card; every target rendered as a spec 06 card
  wherever `Target` renders.
- Non-goals: a redesign of the type scale; countdown on the prep page,
  goal detail or `/goals` overview (cheap follow-up, not asked for); a
  self-hosted address provider; re-running the ranking evaluation study;
  redrawing the logo (a transparent or SVG version is a later asset
  swap, not this change).

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| One condensed display face for every heading level, humanist sans for body | Resistbot, protest poster vernacular in the Stitch guide | Adopt | Bebas Neue on h1 and h2; Inter stays the body face; Syne is dropped |
| Live DD:HH:MM:SS countdown to the vote | ActBlue end-of-quarter forms, campaign "polls close in" banners | Adapt | Ticks every second in the browser; wording says "Expected" until the date is sourced, so a placeholder never reads as confirmed |
| Continuous urgency decay rather than buckets | Issue trackers' due-date scoring (Linear, Jira SLA) | Adopt | Linear ramp from 90 days out to the day itself, multiplied by impact so a bigger goal still wins unless the smaller one is much nearer |
| Word budget with 30 % headroom above the target length | 5 Calls scripts (~120–150 words) | Adopt | 60–160 keeps a 60-second call and stops the overshoot loop |
| Autocomplete from the third character | Mapbox Search JS, Geoapify demos | Adopt | Already built; needs the provider token in the Pages env |
| Favicon set generated from one source mark (ico + PNG sizes + apple-touch + manifest) | Every production site; `realfavicongenerator` checklist | Adopt | Generated once by a script with `sharp` (already a web dependency) and committed to `web/public/` |
| One card per legislator with party badge, name, role and a one-tap call button | 5 Calls, Resistbot, the Stitch spec 06 chip | Adopt | Spec 06 as drawn, with the site's party colours (acid/crimson/hazard) instead of the guide's blue |

## Users
A first-time visitor on a phone, mid-scroll, deciding in seconds whether
to call. They need the headline legible without zoom, the deadline as a
clock not a date, one tap to pick their address, and a recognisable tab
icon to find the site again. The maintainer needs to confirm a decision
date with one YAML field and regenerate icons with one command.

## Expected behavior
### 1. Readable headlines
1. `--font-syne` is removed. `headline-lg` and `headline-md` (and
   `.prose-cut h2, h3`, and the footer line that used `font-syne`) render
   in Bebas Neue (`--font-condensed`), uppercase, weight 400,
   `letter-spacing: 0.02em`. Bebas Neue is condensed, so the font sizes
   grow by one step (`headline-lg` 36 → 40 px, `headline-md` 24 → 28 px,
   mobile sizes likewise); line heights stay tight (1.0–1.05).
2. The Google Fonts request drops `Syne`; no family is added, so the
   landing transfer size falls (one family fewer).
3. `display-xl`/`display-lg` (hero h1s) are unchanged. The Stitch export
   under `design/stitch/` is a dated reference and is not edited; the
   token change is recorded in the spec.

### 2. Script length 60–160
1. Every `call_script` `doc_format` in `data/actions/*.yaml` sets
   `max_words: 160`; `min_words` stays 60. The electoral action builder
   (`worker/src/electoral.ts`) and the `parseFormat` default
   (`worker/src/generate.ts`) use 160.
2. The system prompt's length line, the output check, the standard-script
   composition check and the `generation-cost` token budget
   (`call_max_tokens: 700` covers 160 words) read the format; no other
   code changes.
3. A draft between 121 and 160 words now passes on the first check instead
   of triggering a redraft.

### 3. Ranking by impact and deadline
1. `priority` is documented as **impact** (1 = state, 2 = leadership, 3 =
   federal vote today; 1–5 allowed) in `data/README.md` and the spec. The
   YAML key, D1 column and sort orders are unchanged.
2. Urgency becomes continuous: with `days` the whole days from today
   (UTC date) to `decision_date`, `urgency = 1 + 2 × max(0, 1 −
   min(days, 90) / 90)`. It is 3.0 on the decision day, 2.0 at 45 days,
   1.0 at 90 days or more, and 1.0 for a past or empty date. Values are
   rounded to 3 decimals so ties are stable.
3. `score = impact × urgency`, ties by earlier decision date then slug,
   unchanged. Because urgency spans only 1–3, impact still dominates: an
   impact-3 goal a year out (3.0) ties an impact-1 goal deciding today
   (3.0) and the tie goes to the nearer date; an impact-3 goal within 45
   days (≥ 6.0) beats any impact-2 goal whatever its date (≤ 6.0, tie at
   the limit). With the seeded placeholders and today = 2026-11-06,
   `ndaa-1217` (3 × 2.244 = 6.73) still leads `house-caucus` (2 × 2.733 =
   5.47) and `senate-leader` (2 × 1.667 = 3.33).
4. The "Priority n" chip on `/goals` reads "Impact n".
5. Each result card carries the countdown (§4), which is the user-facing
   "why this one".

### 4. Deadline countdown
1. Goals gain an optional `decision_at` (ISO 8601 with offset, e.g.
   `2026-11-18T09:00:00-05:00`) and an optional `decision_date_confirmed`
   (default false). When `decision_at` is empty the countdown targets
   `decision_date` at 09:00 America/New_York (the start of a legislative
   day). Ranking (§3) keeps using `decision_date` only.
2. A `Countdown` Preact island (`client:load`; deterministic, no LLM)
   renders the time left to the target as four Bebas Neue groups, `DD HH
   MM SS` with Space Mono unit labels, re-rendered every second from the
   browser clock. Server render shows the same markup computed at build
   time so there is no layout shift; the island takes over on hydrate.
   The label line says "Decides <Mon d>" when `decision_date_confirmed`
   is true and "Expected <Mon d>" otherwise.
3. The clock *is* the style guide's protest stamp (mockup B, owner pick
   2026-11-06): a block rotated −4°, white fill, 5 px dashed crimson
   border (heavier than the guide's 3 px so it matches the stamp's size),
   the digits inside, no drop shadow. Two ink effects, both CSS/SVG and
   no image: a radial `mask-image` (opaque centre, fading to ~40 % at
   the left and right ends, after the guide's
   `radial-gradient(circle, black 70%, rgba(0,0,0,.6))`) so the ends
   look under-inked, and an SVG `feTurbulence` + `feDisplacementMap`
   filter (base frequency 0.9, scale 3) so the dashes and digits read
   grainy. `prefers-reduced-motion` keeps both; they are static.
4. Result card: the stamp overlaps the hero's top-right corner (hero gets
   extra top padding so the title clears it) and replaces the "Decision:
   <date>" label for an upcoming date; electoral cards keep the primary
   and filing-deadline lines.
5. `/results`: the same stamp, one size up, pinned to the top-right of
   the page header block above the H1, for the soonest upcoming target
   among the two slots with that goal's title in the label line; hidden
   when neither slot has an upcoming date.
6. Act page `/goals/<slug>/act/<action>`: the same stamp at the top-right
   of the H1 block, with the goal's own target. On viewports under 640 px
   the stamp sits below the H1 instead of overlapping it.
7. Edge cases: a target more than 99 days out shows `DD` as the full day
   count (three digits) rather than overflowing; a past target renders
   nothing (cards keep the existing "Decision: <date>" label); an empty
   date renders nothing; `prefers-reduced-motion` drops the seconds group
   and ticks once a minute; the clock never shows a placeholder date as
   confirmed.

### 5. Address autocomplete while typing
1. The owner creates a Geoapify key (free tier, 3 000 requests/day) or a
   Mapbox public token, URL-restricted to `cutthetiesmovement.org` and the
   Pages preview domain, and sets `PUBLIC_SUGGEST_PROVIDER` and
   `PUBLIC_SUGGEST_TOKEN` in the Pages build environment.
2. `.env.example` gains both lines; `docs/guides/deploy.md` gains the step
   (where to create the token, the URL restriction, the daily quota and
   what the build warns when the token is missing).
3. No application code changes: with the provider set, the field is the
   `action-router.md` §1 combobox (three characters + 250 ms idle →
   up to five suggestions, keyboard and tap pick, on-device district
   placement). Quota exhaustion (429) closes the list with no message, as
   specced.

### 6. Logo and tab icon
1. Source: `web/src/assets/logo-1024.png` (committed with this PRD). A
   script `web/scripts/icons.ts` (`npm run icons -w web`) uses `sharp` to
   write and commit `web/public/favicon.ico` (16 + 32 + 48),
   `favicon-32.png`, `apple-touch-icon.png` (180, opaque), `icon-192.png`,
   `icon-512.png` and `site.webmanifest` (name, theme colour ink,
   background newsprint). The PNG's white square stays: every icon target
   is a filled square anyway.
2. `Base.astro` `<head>` links the icon set (`icon` ico + 32 px PNG,
   `apple-touch-icon`, `manifest`) on every page.
3. Header: a 32 × 32 mark (the 192 px PNG, `width`/`height` set) with a
   2 px ink border and the brutal shadow, left of the "Cut the Ties"
   wordmark, inside the existing home link. The border turns the white
   square into a deliberate tile on the newsprint background.
4. Share cards: `cardSvg` (goal and default cards) composites the mark at
   120 px in the top-right corner, inside the ink frame, via `sharp`
   `composite` so the PNG never has to be inlined in the SVG.
5. Nothing else carries the mark (no watermark on scripts or flyers in
   this change).

### 7. Target cards (spec 06)
1. `Target` (`web/src/components/Target.tsx`) renders one card per
   person instead of a rule-separated `<li>`: paper background, 2 px ink
   border, `shadow-brutal-sm`, 14 px padding, `hover:bg-hazard/10`.
   Cards stack with a 12 px gap. The change applies everywhere `Target`
   renders: the result cards (`Results.tsx` `Block`) and the goal page's
   "Who to call" island (`GoalTargets.tsx`).
2. The enclosing "Who to call (n)" box goes: the label becomes a
   `label-code` line above the stack, and the `Counts` line moves below
   the stack, unchanged in content.
3. Card header row, left to right: a 40 × 40 party badge (2 px ink
   border, `shadow-brutal-sm`, Bebas Neue 20 px; D acid, R crimson,
   other hazard, as today); the name in Bebas Neue 24 px uppercase on
   its own line, with the role line in Space Mono 12 px uppercase
   beneath it ("Senator · VA", "Representative · KY-04",
   "Representative-elect · NY-10"); then the existing prior-vote line
   as the mono status line. The call button becomes a 44 × 44 acid
   square (2 px ink border, `shadow-brutal-sm`, inline phone SVG,
   `aria-label="Call <name>"`, `hover:bg-ink hover:text-acid`); the
   contact variant for a member-elect is a hazard square with an arrow
   glyph and `aria-label="Contact <name>"`.
4. Everything the row carries today keeps its place under the header
   row inside the card, in this order: elect line, district line
   (district phone stays a text link), position chip + source, holdings
   line, visit line, "On the record" block.
5. Leadership cards keep one stack per chamber block under the block's
   label; electoral and state cards keep their single stack.

## Data & contracts
- `data/goals/*.yaml`: new optional `decision_at` (ISO 8601 with offset)
  and `decision_date_confirmed: true|false` (default false). Seed copies
  them to new nullable D1 columns `decision_at TEXT` and
  `decision_date_confirmed INTEGER` (`worker/schema.sql`); `GET
  /api/route` and `GET /api/goals` include both on each goal. The seed
  rejects a `decision_at` whose date part differs from `decision_date`.
- `data/actions/*.yaml` `doc_format.max_words`: 120 → 160 on the five call
  actions; `parseFormat` default 120 → 160.
- `worker/src/ranking.ts` `urgency()`: linear ramp `1 + 2 × max(0, 1 −
  min(days, 90)/90)`, rounded to 3 decimals; past/empty = 1.
- Pages build env: `PUBLIC_SUGGEST_PROVIDER=geoapify|mapbox`,
  `PUBLIC_SUGGEST_TOKEN=<public key>` (documented, owner-set).
- `web/src/styles/global.css` tokens: `--font-syne` removed; headline
  utilities use `--font-condensed`. `web/src/layouts/Base.astro` font
  request and `<head>` icon links updated.
- Static assets: `web/public/favicon.ico`, `favicon-32.png`,
  `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`,
  `site.webmanifest`, generated by `web/scripts/icons.ts` from
  `web/src/assets/logo-1024.png` and committed.
- No new persisted client state.

## Spec delta
- MODIFIED `docs/specs/action-router.md` §Data & contracts: ADDED a "Type tokens" bullet (display and headline Bebas Neue; body Inter 400/600; labels Space Mono; Syne removed 2026-11).
- MODIFIED `docs/specs/action-router.md` §Data & contracts Ranking: "score = priority × urgency (2 when ≤14 days, 1.5 when ≤45, else 1)" → "score = impact (`priority`, 1–5) × urgency (1 + 2 × max(0, 1 − min(days, 90)/90), rounded to 3 decimals; past or empty date = 1)".
- MODIFIED `docs/specs/action-router.md` §Behavior 5 (Results): ADDED the page-top countdown strip and the per-card ticking countdown replacing the "Decision: <date>" label for upcoming dates; `decision_date_confirmed` false → "Expected".
- MODIFIED `docs/specs/action-router.md` §Data & contracts route response: goal rows carry `decision_at` and `decision_date_confirmed`.
- MODIFIED `docs/specs/personalised-documents.md` §Behavior 1 (Act page): ADDED the countdown strip between the ask H1 and the form.
- MODIFIED `docs/specs/personalised-documents.md` §Data & contracts `doc_format`: default `max_words` 120 → 160; the five call actions set 160.
- MODIFIED `docs/specs/goal-pages.md` §Behavior 1: "Priority n" chip → "Impact n"; §Data & contracts: `decision_at` and `decision_date_confirmed` fields; share card carries the logo mark.
- MODIFIED `docs/specs/member-pages.md` §Data & contracts: share card carries the logo mark.
- MODIFIED `docs/specs/action-router.md` §Behavior 5 (Results): targets box → one spec 06 card per target (party badge, Bebas name, mono role line, square call button); "Who to call (n)" label above the stack, `Counts` line below it.
- MODIFIED `docs/specs/goal-pages.md` §Behavior 2 (goal detail "Who to call" island): the same target cards.
- MODIFIED `docs/specs/deployment.md` §Data & contracts: ADDED the `PUBLIC_SUGGEST_*` Pages build variables and the token-restriction rule; ADDED the committed icon set and `npm run icons -w web`.

## Acceptance criteria
- [ ] On `/results` and `/goals/<slug>/prep` the section and card headlines render in Bebas Neue; no request to Google Fonts contains `Syne`; landing transfer stays ≤100 KB and LCP ≤1.5 s on a mid-range phone over 4G.
- [ ] A generated call script of 121–160 words is accepted on the first check; 161 words and 59 words are refused with the "outside 60–160" reason; worker tests updated to 160 pass.
- [ ] Standard-script composition tests still pass with `max_words: 160` (longest combination check).
- [ ] `urgency()` unit test: 0 days → 3, 45 → 2, 90 → 1, 120 → 1, −1 → 1, empty → 1, 12 → 2.733, 34 → 2.244; with today = 2026-11-06 and the seeded goals a Democratic House district gets `ndaa-1217` (6.73) then `house-caucus` (5.47); moving `house-caucus.decision_date` to today (2 × 3 = 6) still loses to `ndaa-1217` (6.73), and moving `ndaa-1217` to 2027-03-01 (3 × 1 = 3) lets `house-caucus` lead.
- [ ] `Countdown` component test: target 12 days 3 h 4 min 5 s ahead renders `12 03 04 05` and "Expected Nov 18" (unconfirmed) or "Decides Nov 18" (confirmed); past, empty and 120-day targets render as §4.7; the island re-renders once a second (fake timers).
- [ ] `/results` shows one page-wide countdown naming the sooner of the two slots' goals; hidden when neither has an upcoming target.
- [ ] The act page shows the strip for its goal; a past target shows nothing.
- [ ] Every digit in a countdown is computed from `decision_at`/`decision_date` by `Countdown`; no LLM output feeds it.
- [ ] `/goals` cards read "Impact n"; `/api/goals` and `/api/route` goal rows include `decision_at` and `decision_date_confirmed`; seed accepts a goal without either (null/false) and rejects a `decision_at` on a different day than `decision_date`.
- [ ] `.env.example` and `docs/guides/deploy.md` document `PUBLIC_SUGGEST_PROVIDER`/`PUBLIC_SUGGEST_TOKEN`; a Pages build with the provider and no token logs the existing warning.
- [ ] On production with the token set: typing "1600 Penn" shows up to five suggestions within 2 s; picking one routes with `{state, district, by_suggestion: true}` and the typed text never reaches the Worker (network tab).
- [ ] `/favicon.ico`, `/favicon-32.png`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png` and `/site.webmanifest` return 200 on the Pages preview; the tab shows the mark in Chrome, Safari and Firefox; `npm run icons -w web` regenerates byte-identical files from the committed source.
- [ ] The header mark is ≤8 KB transferred (192 px PNG) and the landing budget still holds; `/card.png` and a goal card show the mark in the top-right corner.
- [ ] On `/results` each target is its own card with a 2 px ink border and `shadow-brutal-sm`; the party badge is 40 px with border and shadow; the name renders in Bebas Neue uppercase with the role on a mono line beneath; the call control is a 44 px acid square with `aria-label="Call <name>"` and a working `tel:` href; the "Who to call (n)" line sits above the stack and the `Counts` line below it (component test on a D/DD fixture delegation).
- [ ] The goal page's "Who to call" island shows the same cards; the elect, district, position, holdings, visit and "On the record" lines all still render inside the card (existing `Target.test.ts` cases pass unchanged).
- [ ] Infra cost stays $0/month: the provider's free tier covers the site's daily suggestion volume; the deploy guide names the quota and the 429 behavior.

## Rollout & metrics
No feature flag; §1–§4, §6 and §7 ship with the normal merge deploy. §5 is a
deploy-time switch: nothing changes until the owner sets the token. Watch
the weekly report digest for the generate refusal rate (`word_count`
class) before and after §2, and the share of routes marked
`by_suggestion` after §5.

## State (updated 2026-11-06, PR #57)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [x] 1. Readable headlines
  - [x] 6. Logo and tab icon
  - [x] 2. Script length 60–160
  - [x] 3. Ranking by impact and deadline
  - [x] 4. Deadline countdown
  - [x] 7. Target cards (spec 06)
  - [x] 5. Address autocomplete while typing · docs and build warning shipped; the owner still creates the provider token and sets the Pages env (`docs/guides/deploy.md` step 13), no code waits on it
- Completed: §1 4f7932a · §6 ece0fcf · §2 0bec199 · §3 bdd0d22 · §4 20bd5a2 · §7 3197a8c · §5 + spec deltas (this commit)
- Folded: new `docs/specs/countdown-stamp.md` and `target-cards.md`; spec deltas applied to `docs/specs/action-router.md`, `personalised-documents.md`, `goal-pages.md`, `member-pages.md`, `deployment.md`; archive on merge
- Branch / open PRs: `docs/urgency-and-readability-prd` (PR #57, one commit per section)
- Files changed (file:line map): `web/src/styles/global.css:16-46`, `web/src/layouts/Base.astro:27-41`, `web/src/assets/logo-1024.png`, `web/scripts/icons.ts`, `web/public/` icon set, `web/test/icons.test.ts`, `web/src/pages/goals/[slug]/card.png.ts` (`renderCard`), `web/src/pages/card.png.ts`, `web/src/pages/m/[id]/card.png.ts`, `data/actions/*.yaml` doc_format, `data/goals/*.yaml` `decision_at`/`decision_date_confirmed`, `worker/schema.sql`, `worker/scripts/migrate.ts`, `worker/scripts/seed-remote.ts:44-59`, `worker/src/generate.ts`, `worker/src/ranking.ts`, `worker/src/route.ts` (`decision_at`, `decision_date_confirmed`, TargetCard `state`/`district`), `web/src/components/Countdown.tsx`, `Results.tsx`, `Target.tsx`, `GoalTargets.tsx`, `Counts.tsx`, `web/src/pages/goals/[slug]/act/[action].astro`, `web/src/pages/goals/index.astro`, `web/vitest.config.ts`, `docs/guides/deploy.md`
- Tests run + result: `prd-lint`, `doc-lint`, `tsc` 0 errors, `test` (worker) 341 passed / 24 files, `test-web` 130 passed / 20 files, `build` ok; visual checks of the act page, `/results` (desktop and 375 px) and `/goals/house-caucus` in the browser pane
- Remaining: none in code; owner sets `PUBLIC_SUGGEST_PROVIDER` / `PUBLIC_SUGGEST_TOKEN`
- Decisions since last update: H2 face is Bebas Neue, not Inter 700 (owner, 2026-11-06); urgency is a continuous ramp, not a ≤7-day step (owner); countdown ticks DD HH MM SS with the style-guide stamp (owner); mockup B picked with a 5 px border, edge fade and grain (owner); canvas at https://claude.ai/artifact/DJS4hDyCq8fdBDz931JXNn
- Known failures / blockers: none
- Next action: owner merges PR #57; archive this PRD to `docs/prd/archive/` and drop the index row

## Open questions
1. Geoapify or Mapbox? Proposal: Geoapify (no card on file, 3 000/day
   free, attribution line already supported); Mapbox if volume passes
   that.
2. Should the countdown also sit on the goal detail and prep pages?
   Proposal: not in this change; queue it under `## Next` if wanted after
   seeing the three screens.
3. The logo PNG has an opaque white square. Proposal: keep it as a bordered
   tile (§6.3); if the owner later supplies a transparent PNG or SVG the
   header and card swap the file with no other change.

## Changes
- 2026-11-06 — created; no blocking questions → APPROVED (auto).
- 2026-11-06 — owner review: §1 H2 face Bebas Neue (was Inter 700); §3
  continuous urgency ramp (was a ≤7-day step); §4 ticking DD HH MM SS
  with the protest stamp, three mockups on the canvas (was a days-left
  strip); §6 logo and tab icon added; `decision_at` field added.
- 2026-11-06 — owner picked mockup B (the stamp is the clock) with a
  heavier 5 px border, an edge fade and a grain filter; §4.3–4.6
  rewritten for one stamp on all three screens.
- 2026-11-06 — §7 added: every target becomes a spec 06 card (own ink
  outline and shadow) on `/results` and the goal page.
- 2026-11-06 — build deviations: the header mark is `mark-64.png` (the
  192 px PNG is 19 KB, past the 8 KB budget in §6.3; the 64 px one is
  under); production D1 gains `decision_at` and
  `decision_date_confirmed` through a new add-column step in
  `seed-remote` (`worker/scripts/migrate.ts`), since `schema.sql` only
  runs at provisioning; the stamp label wraps and the H1 reserves 400 px
  (`/results`) / 340 px (act page) from the `md` breakpoint, not 1024 px,
  so the stamp never overlaps the H1 at 768–1024 px; web vitest now
  collects `.tsx` tests (it only matched `.ts` before); the target
  card's role line is built from new `state` / `district` fields on
  `TargetCard` rather than parsed from the name.
- 2026-11-07 — the icon test compares decoded pixels, not bytes: the
  Linux sharp binary quantises the palette differently from macOS, so
  the byte-equal check failed in CI (run 42330477243).
