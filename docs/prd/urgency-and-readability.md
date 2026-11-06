# Urgency and readability — PRD
Status: APPROVED 2026-11-06 (auto) · Owner: George Nguyen · Last updated: 2026-11-06

## Problem
Five owner findings from using the live site on 2026-11-06, in one change
because they touch the same three screens (result cards, `/results`, the
act page):
1. The section headlines (`headline-lg`/`headline-md`: "Our picks are not
   set yet", the result-card title "Stop Israel's integration into the US
   military") are set in Syne 800, the style guide's headline face. The
   owner finds it hard to read. The style guide names no alternative, so
   this change picks one.
2. Scripts keep redrafting: the model overshoots the 60–120-word call
   budget by a few words ("word count 122 is outside 60–120") and the
   output check sends it back, until the user sees "Try different
   wording". 120 is tighter than a 60-second call needs.
3. The two result goals must be the ones with the most impact and the
   nearest deadline. Today `score = priority × urgency` with urgency in
   three coarse steps (2 within 14 days, 1.5 within 45, else 1), the
   `priority` field is nowhere explained as impact, and the user is never
   told why a goal is on top.
4. Nothing on the result cards, `/results` or the act page drives
   urgency. A card shows "Decision: Nov 18" in small label type; the act
   page shows no date at all until the commitment step.
5. The address field only "completes" once a full address is typed. The
   typeahead combobox exists (`action-router.md` §1, archived
   `address-autocomplete` PRD) but it renders only when the Pages build
   sets `PUBLIC_SUGGEST_PROVIDER`, which the live build does not: neither
   `.env.example`, `docs/guides/deploy.md` nor CI mentions it. What the
   owner sees is the browser's own saved-address fill, which triggers only
   on a previously entered address.

## Goals / Non-goals
- Goals: headlines readable at a glance on a phone; a first draft passes
  the length check far more often; the ranking formula is stated once, in
  the spec, as impact × deadline, and each card says how many days are
  left; a visible countdown on the three screens; the typeahead switched
  on in production.
- Non-goals: a redesign of the type scale or the hero display face (Bebas
  Neue stays on `display-*` h1s; one token flips it if the owner wants
  that next); countdown on the prep page, goal detail or `/goals`
  overview (cheap follow-up, not asked for); a self-hosted address
  provider; re-running the ranking evaluation study.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Geometric display font for titles, humanist sans for everything else | Resistbot, 5 Calls | Adopt | Bebas on the h1 only; Inter (already the body face) for section and card headlines |
| Count-down strip on every advocacy screen ("3 days until the vote") | ActBlue forms, ActionNetwork petitions | Adapt | Days-left strip, but marked "expected" until the date is sourced; a false precise countdown costs trust |
| Word budget with 30 % headroom above the target length | 5 Calls scripts (~120–150 words) | Adopt | 60–160 keeps a 60-second call and stops the overshoot loop |
| Autocomplete from the third character | Mapbox Search JS, Geoapify demos | Adopt | Already built; needs the provider token in the Pages env |

## Users
A first-time visitor on a phone, mid-scroll, deciding in seconds whether
to call. They need the headline legible without zoom, the deadline as a
number of days not a date, and one tap to pick their address. The
maintainer needs to confirm a decision date with one YAML field.

## Expected behavior
### 1. Readable headlines
1. `--font-syne` is removed. `headline-lg` and `headline-md` (and
   `.prose-cut h2, h3`) render in Inter 700 with `letter-spacing:
   -0.01em`; sizes and line heights are unchanged.
2. The Google Fonts request drops `Syne` and adds Inter 700
   (`Inter:wght@400;600;700`). No font file is added, so the landing
   transfer size falls (one family fewer).
3. `display-xl`/`display-lg` stay Bebas Neue (hero h1s only). The Stitch
   export under `design/stitch/` is a dated reference and is not edited;
   the token change is recorded in the spec.

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
2. Urgency gains a step so a decision this week beats one next month at
   equal impact: 3 within 7 days, 2 within 14, 1.5 within 45, else 1;
   past or empty date = 1. `score = impact × urgency`, ties by earlier
   decision date then slug, unchanged.
3. The "Priority n" chip on `/goals` reads "Impact n".
4. Each result card carries the countdown strip (§4), which is the
   user-facing "why this one".

### 4. Deadline countdown
1. A `Countdown` Preact component (deterministic, no LLM): given
   `decision_date` and the browser's local date it renders
   "N days left · Decides <Mon d>" (N ≥ 2), "Decides tomorrow",
   "Decides today", or nothing when the date is empty or past (past dates
   keep the existing "Decision: <date>" label on cards). While
   `decision_date_confirmed` is false the strip says "N days left ·
   Expected <Mon d>".
2. Result card: the strip replaces the "Decision: <date>" label under the
   title; hazard background, ink text, `label-code` type, full card width.
   Electoral cards keep the primary and filing-deadline lines.
3. `/results`: above the H1, one page-wide strip for the soonest upcoming
   decision among the two slots ("Next deadline: N days left · <goal
   title>"), hidden when neither slot has an upcoming date.
4. Act page `/goals/<slug>/act/<action>`: the same strip between the H1
   and the form, with the goal's own date. It is an island
   (`client:load`) because the page is static and "today" is the
   browser's.
5. Edge cases: a date more than 365 days out renders "Decides <Mon d,
   yyyy>" without a day count; a past date on the act page renders
   nothing; the strip never shows a placeholder date as confirmed.

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

## Data & contracts
- `data/goals/*.yaml`: new optional `decision_date_confirmed: true|false`
  (default false). Seed copies it to a new nullable D1 column
  `decision_date_confirmed INTEGER` (`worker/schema.sql`); `GET
  /api/route` and `GET /api/goals` include it on each goal.
- `data/actions/*.yaml` `doc_format.max_words`: 120 → 160 on the five call
  actions; `parseFormat` default 120 → 160.
- `worker/src/ranking.ts` `urgency()`: adds the ≤7-day step (3).
- Pages build env: `PUBLIC_SUGGEST_PROVIDER=geoapify|mapbox`,
  `PUBLIC_SUGGEST_TOKEN=<public key>` (documented, owner-set).
- `web/src/styles/global.css` tokens: `--font-syne` removed; headline
  utilities use `--font-sans` 700. `web/src/layouts/Base.astro` font
  request updated.
- No new persisted client state.

## Spec delta
- MODIFIED `docs/specs/action-router.md` §Data & contracts: ADDED a "Type tokens" bullet (display Bebas Neue h1 only; headline Inter 700; body Inter 400/600; labels Space Mono; Syne removed 2026-11).
- MODIFIED `docs/specs/action-router.md` §Data & contracts Ranking: "score = priority × urgency (2 when ≤14 days, 1.5 when ≤45, else 1)" → "score = impact (`priority`, 1–5) × urgency (3 when ≤7 days, 2 when ≤14, 1.5 when ≤45, else 1)".
- MODIFIED `docs/specs/action-router.md` §Behavior 5 (Results): ADDED the page-top "Next deadline" strip and the per-card countdown strip replacing the "Decision: <date>" label for upcoming dates; `decision_date_confirmed` false → "Expected".
- MODIFIED `docs/specs/action-router.md` §Data & contracts route response: goal rows carry `decision_date_confirmed`.
- MODIFIED `docs/specs/personalised-documents.md` §Behavior 1 (Act page): ADDED the countdown strip between the ask H1 and the form.
- MODIFIED `docs/specs/personalised-documents.md` §Data & contracts `doc_format`: default `max_words` 120 → 160; the five call actions set 160.
- MODIFIED `docs/specs/goal-pages.md` §Behavior 1: "Priority n" chip → "Impact n"; §Data & contracts: `decision_date_confirmed` field.
- MODIFIED `docs/specs/deployment.md` §Data & contracts: ADDED the `PUBLIC_SUGGEST_*` Pages build variables and the token-restriction rule.

## Acceptance criteria
- [ ] On `/results` and `/goals/<slug>/prep` the section and card headlines render in Inter 700; no request to Google Fonts contains `Syne`; landing transfer stays ≤100 KB and LCP ≤1.5 s on a mid-range phone over 4G.
- [ ] A generated call script of 121–160 words is accepted on the first check; 161 words and 59 words are refused with the "outside 60–160" reason; worker tests updated to 160 pass.
- [ ] Standard-script composition tests still pass with `max_words: 160` (longest combination check).
- [ ] With today = 2026-11-06 and the seeded goals, a Democratic House district gets `ndaa-1217` (3 × 1.5) and `house-caucus` (2 × 2) in that order; moving `house-caucus.decision_date` to within 7 days flips the order (2 × 3 = 6 > 4.5). Unit test in `worker/test` covers the four urgency steps and boundaries (7, 14, 45 days, past, empty).
- [ ] A result card whose goal decides in 12 days shows "12 days left · Expected Nov 18" (unconfirmed) or "12 days left · Decides Nov 18" (confirmed); tomorrow/today/past/empty/>365-day cases render as §4.1 and §4.5 (component test).
- [ ] `/results` shows one "Next deadline" strip naming the sooner of the two slots' goals; hidden when neither has an upcoming date.
- [ ] The act page shows the strip for its goal; a past date shows nothing.
- [ ] Every number in a strip is computed from `decision_date` by `Countdown`; no LLM output feeds it.
- [ ] `/goals` cards read "Impact n"; `/api/goals` and `/api/route` goal rows include `decision_date_confirmed`; seed accepts a goal without the field (false).
- [ ] `.env.example` and `docs/guides/deploy.md` document `PUBLIC_SUGGEST_PROVIDER`/`PUBLIC_SUGGEST_TOKEN`; a Pages build with the provider and no token logs the existing warning.
- [ ] On production with the token set: typing "1600 Penn" shows up to five suggestions within 2 s; picking one routes with `{state, district, by_suggestion: true}` and the typed text never reaches the Worker (network tab).
- [ ] Infra cost stays $0/month: the provider's free tier covers the site's daily suggestion volume; the deploy guide names the quota and the 429 behavior.

## Rollout & metrics
No feature flag; §1–§4 ship with the normal merge deploy. §5 is a
deploy-time switch: nothing changes until the owner sets the token. Watch
the weekly report digest for the generate refusal rate (`word_count`
class) before and after §2, and the share of routes marked
`by_suggestion` after §5.

## State (updated 2026-11-06, PR #n)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [ ] 1. Readable headlines
  - [ ] 2. Script length 60–160
  - [ ] 3. Ranking by impact and deadline
  - [ ] 4. Deadline countdown
  - [!] 5. Address autocomplete while typing · blocked: owner creates the provider token and sets the Pages env; the docs part can merge first
- Completed: none
- Folded: none
- Branch / open PRs: `docs/urgency-and-readability-prd` (this PRD)
- Files changed (file:line map): `web/src/styles/global.css:16-46`, `web/src/layouts/Base.astro:29`, `data/actions/*.yaml` doc_format, `worker/src/generate.ts:50,298`, `worker/src/electoral.ts:217`, `worker/src/ranking.ts:117-130`, `web/src/components/Results.tsx:43-44,93`, `web/src/pages/goals/[slug]/act/[action].astro:20`, `web/src/pages/goals/index.astro`, `worker/schema.sql:30`, `.env.example`, `docs/guides/deploy.md`
- Tests run + result: none yet
- Remaining: §1–§5
- Decisions since last update: none
- Known failures / blockers: §5 needs the owner's token
- Next action: `/implement-prd-section` §1

## Open questions
1. Should the hero h1s (`display-xl`/`display-lg`, Bebas Neue: "Your two
   actions this week", the goal page title) also change? Proposal: keep
   Bebas Neue on the h1 only; it is one token (`--font-condensed`) to flip
   later if the owner wants it, so not blocking.
2. Geoapify or Mapbox? Proposal: Geoapify (no card on file, 3 000/day
   free, attribution line already supported); Mapbox if volume passes
   that.
3. Should the countdown also sit on the goal detail and prep pages?
   Proposal: not in this change; queue it under `## Next` if wanted after
   seeing the three screens.

## Changes
- 2026-11-06 — created; no blocking questions → APPROVED (auto).
