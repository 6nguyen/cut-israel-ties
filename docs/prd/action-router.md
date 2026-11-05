# Action router — PRD
Status: APPROVED 2026-11-04 (auto) · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
Three decisions on the US–Israel military partnership land in the next 45
days, and the levers on them differ by address: the NDAA FY2027 conference
on the integration section (House §219 / Senate §1217) touches every
member; the December Senate Democratic leader vote touches only states with
a Democratic senator; the Nov 18–19 House Democratic caucus vote touches
only Democratic districts. The content circulating on TikTok and Instagram
is generic "call your reps" with no named vote; the one live call tool
(Adalah's) has no script, no per-member status and no count; form letters
are discounted by offices. Nobody can enter an address and get the two
things that matter for them this week, with a script an office will
believe. [Supersedes `archive/2026-11-vote-tracker.md`: one vote, one
whip count; this PRD is the site that carries any goal.]

## Goals / Non-goals
- Goals:
  1. Address in, top two goals out, in under ten seconds, for any US
     address, chosen by deterministic rules from the user's members and
     state.
  2. Every goal has an overview card, a detail page and, where the ask
     needs preparation, a briefing page with a unified position ("our
     pick") so users act as one front.
  3. Every written or spoken ask is personalised by Claude from the user's
     own words and the target's sourced facts, so no two documents read
     alike and none invents a fact.
  4. Goals and actions live in a database with a status lifecycle; a
     completed or expired goal is replaced by its successor without a
     code change.
  5. Running cost near zero outside the Anthropic API; donations easy and
     the self-funding plain.
- Non-goals:
  - Contacting offices on a user's behalf (no auto-dial, fax, form
    submission). The user places the call or sends the letter.
  - Accounts, logins, email or SMS reminders.
  - Per-member public pages, whip-count tables, captain lists, district
    counters, office-visit coordination (queued in `## Next`).
  - Persuading opponents; the audience is the already-opposed.
  - Any number shown to users computed by an LLM (CLAUDE.md §Don'ts).
  - Candidate endorsements for elected office in v1 (Open question 7).

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/social-platform-trends.md`,
`docs/research/civic-action-levers/levers-and-actions.md`,
`docs/research/civic-action-levers/decision-points.md`,
`docs/research/civic-action-levers/organizing-channels-and-tools.md`,
`docs/research/civic-action-levers/behavioral-science-and-virality.md`,
`docs/research/civic-action-levers/speaker-vote-context.md`.
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| ZIP → reps, curated script, many topics | 5 Calls | adapt | Address → members, but two goals, not an issue menu; script generated per user, not curated. |
| Patch-through call tool on one dated decision, "send to three" | Adalah, Stop the Deadly Merger | adapt | Same decision; add script, target facts, receipt. Link their phonebanks. |
| Per-member money card as the shared unit | Track AIPAC | adapt | Share card copies the form (one target, one line, one source, one date); money is linked, never stored. |
| Dated daily mission, one voice | Exército do Lula | adapt | A goal's "this week" line is maintainer-written and dated; expires. |
| Form letter / fax blast | Resistbot | reject | Tallied for/against only; CMF rates it lowest. Personal letters and calls only. |
| Paid petition | Change.org | reject | List-building; public token support licenses non-action. |
| Public indexable topic page | TikTok `/discover/<slug>` | adopt | Stable public `/goals/<slug>` URLs with share metadata; Instagram tags are login-walled, so cards + creators carry it there. |
| Show own side's participation | Hager et al. 2022 | defer | Counters need volume; queued with captains. |
| Reflection prompt after action | Han 2016 | adopt | One optional line after a receipt, stored nowhere. |

## Users
1. **Visitor with an address** (anyone in the US). Needs the two things to
   do this week and the words to do them with. Default copy.
2. **Resident of an all-Republican delegation** (~20 states, GOP House
   seat). Only the NDAA goal applies federally; gets it plus the state
   goal. Must not hit a dead end.
3. **Returning visitor**: district and state remembered in the browser;
   lands on their goals, sees what changed.
4. **Creator / sharer**: needs a link and a card that work in a bio or a
   story without a login.
5. **Maintainer** (owner): edits goals, actions, positions and picks as
   files in the repo; approves LLM-drafted position changes; reads the
   report digest.

## Expected behavior
### 1. Landing and address routing
1. `/` shows one line on what the site is, the address field, a line
   "Built and paid for by one person; donations keep it up" linking
   `/donate`, and a link to `/goals`.
2. Full street address required; ZIP-only is refused with a one-line
   reason (split cities). The Worker proxies the Census Geocoder, never
   logs or stores the address, and returns state, district, the three
   member rows and the state row. The browser keeps `{state, district}`
   in localStorage; nothing else about the user is stored server-side.
3. Result: exactly two goal cards, chosen by §5 ranking, each with the
   user's targets for that goal (name, position, prior vote, phone), the
   one-line ask, and a CTA to the action. A third line links "all goals".
   If only one goal is eligible, the second card is the state goal; if
   none, the page says so and shows the overview.
4. Unresolvable address: retry plus manual state + district picker.
5. Return visit: skips the field, shows the cards for the stored district
   with a "change address" link.

### 2. Goals overview and detail
1. `/goals`: every `active` goal as a card: category tag, title, issue in
   ≤60 words, "what we want" in one sentence, decision date, CTA. Order
   by priority. Below: an "Outcomes" strip of `completed` and `expired`
   goals with their outcome note (wins stay visible).
2. `/goals/<slug>`: situation (maintainer markdown), what we want, who
   decides and when, "our pick" block if the goal has one (name, one
   paragraph rationale, source link), the user's targets if an address
   is stored else "enter your address", the goal's actions as buttons,
   related partner campaign link, sources. Share metadata and a card
   image per goal.
3. When a goal's status becomes `completed` or `expired`, its successor
   (if set) becomes `active` on the next deploy, and the overview and
   ranking pick it up with no code change.

### 3. Prep and briefing pages
1. `/goals/<slug>/prep` exists for every goal with `prep_md`. Sections:
   where things stand (dated), timeline, what to say in 30 seconds,
   likely pushback and answers, our pick and why, what counts as a win,
   sources. Maintainer-written; the LLM does not write it.
2. For a goal whose ask is a choice (a leadership vote), the prep page
   leads with our picks: up to three candidates in order, each with a
   one-paragraph rationale, a source link and the dated signal that put
   them there (declared or reported interest; stated position on the
   section; attention on Instagram, TikTok and the web as counted by the
   maintainer from sourced rows, never by an LLM). The unified ask names
   the condition ("vote only for a leader who will strip §1217 and oppose
   a new MOU") and the first pick; the action's prompt uses the same
   wording so every generated doc asks for the same thing. Picks are
   maintainer-set in YAML and dated; the page shows the date.
3. The prep page links to the action with the user's targets carried
   over.

### 4. Actions and personalised documents
1. `/act/<action-slug>?target=<id>`: a form built from the action's
   `form_schema` (always: first name, city; call scripts add one line
   "why this matters to you" and an optional occupation or affiliation;
   letters and public comments add a second personal line and a
   relationship to the target, e.g. "voted for you in 2024"). Turnstile
   widget. Nothing submits until the form is valid.
2. Generate: the Worker builds the prompt from the action's template, the
   target's fact block from D1 (name, party, position + source date, prior
   votes, committee, deadline, section numbers, the goal's unified ask),
   and the user's fields, and calls Claude (Open question 2). Output is
   streamed to the page. Form of the document follows `doc_format`: call
   script ≤120 words in the user's register; letter 180–260 words with
   subject line; public comment ≤300 words.
3. Rules the prompt enforces and a deterministic check verifies: the doc
   names the target and the section/vote; every date, vote and number in
   it appears in the fact block (digits not in the block → regenerate
   once, then show with a warning); the phrase "end aid" never appears;
   no template sentences (the uniqueness check below).
4. Uniqueness: the Worker stores 8-gram shingles (hashed) of each output,
   not the text. A new output whose shingle overlap with any of the last
   200 for the same action exceeds 0.3 is regenerated once with a
   "different structure and opening" instruction. Users see one
   "regenerate" button.
5. Output screen: the doc, copy, download (.txt), `tel:` links for the
   target, the contact-form link for letters, and two buttons: "I did it"
   (creates a receipt) and "Share" (device share sheet with the goal deep
   link and card; only after a receipt).
6. After "I did it": optional one-pick office response (will support ·
   undecided · opposed · no answer · other ≤140 chars) and one optional
   reflection line (not stored). Reports show on the maintainer digest,
   never change a position.
7. Limits: 5 generations per device per hour, 20 per day, 3 per device
   per action per day; per-IP 30 per day; a global daily cap
   (`MAX_GENERATIONS_PER_DAY`) past which the endpoint returns 503 with a
   "come back tomorrow" message; Turnstile token required; max_tokens
   1500.
8. Misuse guardrails, in order, all before any Opus call:
   1. Input shape: each user field has a max length (first name 40, city
      60, personal lines 280); fields are plain text (markup, URLs, email
      addresses, phone numbers and control characters are stripped);
      the target id and action slug must exist in D1; the form schema is
      the only path to the prompt.
   2. Screen: a `claude-haiku-5-5` call with a fixed system prompt
      classifies the user fields as `ok`, `off_topic` (not about this
      goal or the user's reason to care), `injection` (instructions to
      the model, role play, requests to ignore rules, requests for a
      different document), or `harmful` (threats, slurs, doxxing, content
      targeting a person's protected traits). Anything but `ok` returns a
      one-line reason and no generation; the attempt is logged by device
      hash and class, never by content.
   3. Prompt structure: the system prompt states the only task (write
      this `doc_format` for this goal to this target), the fact block and
      user fields are passed as data inside delimited blocks and labelled
      as untrusted, and the model is told to use the user's lines as
      material, not as instructions.
   4. Output check (deterministic, after generation): names the target
      and section; word count in `doc_format` range; no digits outside
      the fact block; no URLs, phone numbers or email addresses; a
      blocklist of threat and slur terms; the ask wording present. A
      failed check regenerates once, then shows a refusal.
   5. Abuse response: three screened-out attempts from one device in a
      day block generation for that device for 24 hours; the digest
      lists blocked devices and classes.

### 5. Goal ranking (deterministic)
1. Inputs: house member (party, hasc, conferee, rc243, btb_cosponsor),
   senators[2] (party, jrd_april_2026), state row, today's date.
2. Each goal has `eligibility` (a rule over those inputs, stored as JSON,
   evaluated by code) and `priority` (integer). Score = priority ×
   urgency, urgency = 2 if decision_date within 14 days, 1.5 within 45,
   1 otherwise. Ties → earlier decision date.
3. Seed rules: NDAA → always eligible (house member or senators exist);
   Senate leader → any Democratic senator; House caucus → Democratic
   house member; State bonds → state row has holdings or a campaign.
4. Top two shown. A unit test fixes the result for six delegations:
   D/DD, D/RR, R/DD, R/RR, R/DR, D/DR.

### 6. Donations and about
1. `/donate`: "This site is built and paid for by George Nguyen, one
   person, not a PAC or organisation. Donations are not tax-deductible
   and are not political contributions to any candidate." Monthly cost
   line (deterministic, from a config value). Stripe Payment Link buttons
   (one-time $5 / $20 / $50, monthly $5) that open in a new tab. The
   donate link sits in the header and after every receipt.
2. `/about` and `/privacy`: who runs it, what is stored (district only,
   receipts without identity, shingle hashes), what is sent where
   (address → Census; form fields → Anthropic, not retained by the site).

### 7. Maintainer tooling (LLM-assisted, maintainer-approved)
1. `scripts/draft-position.ts <bioguide> <url>`: fetches the URL, asks
   Claude for the member's stated position on the goal with a verbatim
   quote and date, prints a positions row; the maintainer pastes it into
   `data/positions/<goal>.csv` in a PR. The lint rejects a row without
   source_url and source_date.
2. `scripts/digest.ts`: nightly (cron Worker) summary of new reports by
   member and goal, grouped by outcome, sent to the maintainer by email
   (Cloudflare Email Routing) with the raw rows attached. Haiku-class
   model; counts computed by code, the LLM only writes the prose.
3. `scripts/seed.ts`: upserts `data/*.yaml|csv` into D1 on every deploy;
   the repo is the source of truth, there is no admin UI.

## Data & contracts
- Source of truth: `data/goals/<slug>.yaml`, `data/actions/<slug>.yaml`,
  `data/members.csv`, `data/positions/<goal>.csv` (append-only),
  `data/states.csv`. `scripts/seed.ts` loads them into D1.
- D1 tables:
  - `goals(id, slug, category federal_vote|leadership|state|electoral,
    title, summary, what_we_want, status upcoming|active|completed|expired,
    outcome_note, window_start, window_end, decision_date, priority,
    eligibility json, our_picks json[{name, rationale, source_url,
    signal, signal_date}] (≤3, ordered), sources json[{title, url}],
    decider text, successor_slug, this_week text, this_week_date,
    detail_md, prep_md, partner_url, updated_at)`
  - `actions(id, goal_id, slug, type call|letter|public_comment,
    target_scope house|senate|state, order, ask_text, form_schema json,
    prompt_template, doc_format json{kind, min_words, max_words})`
  - `members(bioguide_id, name, party, chamber, state, district, dc_phone,
    district_phone, contact_form_url, hasc, conferee, rc243,
    jrd_april_2026, btb_cosponsor, target_2028, money_url)`
  - `positions(id, bioguide_id, goal_id, position for|uncommitted|against|
    unknown, source_url, source_date, changed_by, changed_at)`
  - `states(state, treasurer_name, treasurer_phone, decider,
    israel_bonds_usd, holdings_date, holdings_source, campaign_name,
    campaign_url, next_comment_date)`
  - `receipts(id, goal_id, action_id, target_id, state, district,
    created_at, device_hash)`
  - `reports(id, bioguide_id, goal_id, outcome, note, created_at,
    device_hash, hidden)`
  - `generations(id, action_id, target_id, shingles blob, created_at,
    device_hash, input_tokens, output_tokens, model)` — no document text.
- Worker endpoints: `POST /api/route {address}` → `{state, district,
  house, senators[], state_row, goals[2]}`; `GET /api/goals`; `GET
  /api/goals/:slug/targets?state&district` → `{targets[]}`; `POST
  /api/generate {action, target, fields, turnstile}` (SSE stream); `POST
  /api/receipt`; `POST /api/report`. All JSON, no cookies, device hash =
  SHA-256 of a random localStorage id.
- Claude call: `claude-opus-5-5`, adaptive thinking default, effort
  `medium`, streaming, `cache_control` on the system prompt + action
  template (stable prefix), fact block and user fields last, server-side
  fallback `"default"` enabled, `max_tokens` 1500. Structured output
  `{subject?, body, facts_used[]}` via `output_config.format`.
- `screenings(id, device_hash, action_id, class, created_at)` — no
  content; `blocks(device_hash, until)`.
- Config: `MONTHLY_COST_USD`, `STRIPE_LINKS` json, `ANTHROPIC_API_KEY`,
  `TURNSTILE_SECRET`, `MAX_GENERATIONS_PER_DAY` as Worker secrets/vars.

## Infrastructure and frontend
| Layer | Choice | Cost |
|---|---|---|
| Frontend | Astro (static pages, one Svelte/Preact island each for the address form and the generator), Tailwind | $0 |
| Hosting | Cloudflare Pages | $0 |
| API | One Cloudflare Worker (Hono router), cron trigger for the digest | $0 (100k req/day free) |
| DB | Cloudflare D1 (SQLite), seeded from repo files | $0 (5 GB, 5M reads/day free) |
| Bot protection | Cloudflare Turnstile on the generate endpoint | $0 |
| Geocoding | Census Geocoder via the Worker | $0 |
| Email | Cloudflare Email Routing (digest to the maintainer) | $0 |
| Donations | Stripe Payment Links | 2.9% + 30¢ per donation |
| Domain | one .org/.us | ~$10–15/yr |
| LLM | Anthropic API, Opus 5.5: ~1.2k cached input + ~400 output per doc ≈ $0.01; digest and drafts negligible | ~$10 per 1,000 docs |
Estimated steady state: ≤$15/month at 1,000 docs/month; the `/donate`
page shows the real number from `MONTHLY_COST_USD`.

## Spec delta
- ADDED `docs/specs/action-router.md`: the whole spec (Purpose; Behavior
  from §1–§7; Data & contracts; Invariants; Performance budget). §4 is
  folded into `docs/specs/personalised-documents.md` (spec size limit).

## Acceptance criteria
- [ ] Six fixture addresses (D/DD, D/RR, R/DD, R/RR, R/DR, D/DR
      delegations, one in a split city) resolve under the 119th map and
      return exactly two goals matching the ranking table; ZIP-only is
      refused; an all-Republican delegation gets NDAA + state.
- [ ] The address never appears in Worker logs or D1 (a test greps the
      log sink after a routed request).
- [ ] `/goals` lists every active goal in priority order and every
      completed/expired goal with an outcome note; flipping a goal's
      status in YAML and reseeding moves its successor to active.
- [ ] Every goal with `prep_md` renders `/goals/<slug>/prep`; a goal
      with `our_picks` shows up to three picks in order with rationale,
      source, signal and date, and the same ask wording naming the first
      pick appears in its generated docs (string test on 20 generations).
- [ ] 20 generations for the same action and target with different user
      inputs: no two share >0.3 shingle overlap; every doc names the
      target and section; no digits outside the fact block; "end aid"
      absent; call scripts ≤120 words; letters 180–260 words.
- [ ] Generate without a valid Turnstile token, past 5/hour, past the
      per-action or per-IP limit, past the global cap, or from a blocked
      device returns 429/403/503 and no Anthropic call is made (mock
      asserts zero calls).
- [ ] A fixture of 40 abusive inputs (prompt injection, requests for a
      different document, off-topic, threats, slurs, doxxing, URLs and
      phone numbers in fields) produces zero generated documents and
      zero Opus calls; 20 benign inputs with unusual phrasing all pass
      the screen. The third screened-out attempt blocks the device.
- [ ] A generated doc that fails the output check (seeded by a mocked
      model reply with a URL and an out-of-block number) is regenerated
      once and then refused; nothing failing is shown as a document.
- [ ] "Share" is absent before a receipt and present after; the share
      payload is the goal deep link; a report cannot change a position.
- [ ] `/donate` shows the self-funding statement, the computed monthly
      cost and working Stripe links; the statement is in the header and
      after every receipt.
- [ ] `positions.csv` row without source fails the lint;
      `draft-position.ts` output always includes a verbatim quote and
      date or says "no stated position".
- [ ] Performance budget: landing ≤100 KB transferred, LCP ≤1.5 s on a
      mid-range phone over 4G; `/api/route` ≤2 s p95; first streamed
      token of a generation ≤3 s p95, complete ≤10 s p95; infra cost
      excluding LLM and domain = $0/month. The PR for §1 copies these
      into CLAUDE.md §Performance budgets.

## Rollout & metrics
- Launch when: the three goals and the state goal are seeded with prep
  pages; every member row has prior votes; ≥50 House positions on the
  NDAA goal are non-unknown; Stripe link live; Turnstile on.
- Measured by code from D1: routes per day; goal cards → action opens →
  generations → receipts (funnel per goal); receipts per state; reports
  per uncommitted member; generation cost per receipt (tokens × price);
  donations (from Stripe) vs `MONTHLY_COST_USD`.
- Success for the window: receipts from ≥30 states; ≥1 report on every
  uncommitted conferee; generation cost per receipt ≤$0.05.

## State (updated 2026-11-04)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [x] 1. Landing and address routing · PR #8 merged
  - [x] 5. Goal ranking (deterministic) · PR #9 merged
  - [~] 2. Goals overview and detail · feat/action-router-goals-overview · PR #10
  - [~] 4. Actions and personalised documents · feat/action-router-actions-docs · PR #13
  - [~] 3. Prep and briefing pages · feat/action-router-prep-pages · PR #12
  - [~] 6. Donations and about · feat/action-router-donate-about · PR #11
  - [~] 7. Maintainer tooling (LLM-assisted, maintainer-approved) · feat/action-router-maintainer-tooling · PR #14
- Completed: §1 (PR #8), §5 (PR #9).
- Folded: §1, §5, §2, §4, §3, §6, §7 (`docs/specs/action-router.md`; §4 in
  `docs/specs/personalised-documents.md`).
- Branch / open PRs: feat/action-router-goals-overview (PR #10).
- Tests run: tsc PASS, test PASS (53 vitest), build PASS; browser check
  of `/goals`, `/goals/ndaa-1217` (no address, CA-46, TX-21 on the Senate
  goal), card PNG, 375 px layout. Landing 7 KB gzip, `/goals` 6 KB,
  detail 7 KB.
- Remaining: §4, §3, §6, §7.
- Decisions since last update: `upcoming` status + loader promotion
  implements §2.3 (one YAML edit retires a goal); `decider` and
  `sources` columns added so "who decides" and sources are data rows,
  not page copy; share cards are built from an SVG template by `sharp`
  (system font fallback until a licence-safe face is vendored).
- Next action: merge PR #10, then /implement-prd-section
  docs/prd/action-router.md (next: §4. Actions and personalised documents).
## Open questions
1. Senate leader vote: date and challenger unknown. Decided 2026-11-04:
   the goal ships with up to three picks (`our_picks`), chosen by a
   maintainer scan of Instagram, TikTok and the web (declared interest,
   stated position on §1217, attention), each with source and signal
   date; the unified ask names the condition and the first pick. The
   scan is a research task (`docs/research/senate-leader-candidates.md`,
   queued in `## Next`). decision_date = 2026-12-15 placeholder, flagged
   VERIFY in prep_md.
2. Model for personalisation. Decided 2026-11-04: `claude-opus-5-5` at
   effort `medium` for documents; `claude-haiku-5-5` for the input
   screen, digest and position drafts; misuse guardrails and per-device,
   per-action, per-IP and global limits as in §4.7–4.8. Revisit the
   model from measured cost per receipt.
3. Uniqueness threshold 0.3 Jaccard on 8-gram shingles over the last 200
   docs per action. Decided 2026-11-04 as proposed: ship it, tune from
   the 20-generation test.
4. Address privacy: the Census Geocoder sees the address. Decided 2026-11-04 as proposed:
   proxy via the Worker with no logging, state it on `/privacy`; evaluate
   an on-device district lookup (shapefile in the browser) in `## Next`.
5. House caucus goal is secondary per research. Decided 2026-11-04 as proposed: keep it,
   priority 1 (NDAA 3, Senate leader 2, state 1), so a Democratic
   district with two Republican senators still gets two federal goals.
6. Section numbers (§219/§1217, formerly §224) unverified against
   enrolled text. Decided 2026-11-04 as proposed: store all three; the
   seed PR verifies.
7. Candidate endorsement. "Our pick" for elected office (2028 primaries)
   may make the site's spending express advocacy with FEC reporting
   consequences for an individual. Decided 2026-11-04 as proposed: v1
   picks are limited to leadership votes and policy positions; the 2028
   goal stays in
   `## Next` until the owner has checked the rules. Not blocking: no
   v1 goal needs a candidate pick.
8. Prep page for the NDAA goal needs the Khanna letter signer list, which
   is unpublished. Proposal: ask for a position, record it via reports.

## Changes
- 2026-11-04 — created (APPROVED, auto: every question carries a
  proposal, none blocking). Supersedes `archive/2026-11-vote-tracker.md`.
  Owner decisions: Cloudflare + Astro + Worker + D1; Stripe Payment
  Link; v1 funnel is receipt + share only.
- 2026-11-04 — owner answered questions 1–7: Senate leader goal carries
  up to three maintainer-ranked picks from a social/web scan (§3.2,
  `our_picks`); misuse guardrails and tighter generation limits added
  (§4.7–4.8, `screenings`/`blocks`, three acceptance tests); 3–7
  decided as proposed. UI design brief: `docs/research/ui-design-brief.md`.
- 2026-11-04 — §1 built: Astro + Tailwind + Preact site, Hono Worker with
  D1 seeded from `data/`, `POST /api/route` (Turnstile, Census Geocoder,
  no address logging) and the §5 ranking engine; landing + results pages;
  `tsc`/`test`/`build` quiet-check targets in CI; perf budgets copied to
  CLAUDE.md; spec folded to `docs/specs/action-router.md`.
- 2026-11-04 — §5 reviewed: `parseRule` now enforces the §5.1 input
  allowlist and value types (party `D|R|I`, flags `0|1`, text), so a bad
  seed rule fails at seed time instead of silently excluding a goal;
  grammar documented in `data/README.md`; 3 tests added.
- 2026-11-04 — §2 built: `/goals` overview (priority-ordered cards +
  Outcomes strip) and `/goals/<slug>` detail (situation markdown, what we
  want, decider and date, our-pick block, stored-district targets via
  `GET /api/goals/:slug/targets`, action buttons, partner link, sources,
  share metadata + build-time card PNG). Contract additions: goal status
  `upcoming` (hidden until its predecessor closes; the loader promotes the
  successor, §2.3), `goals.sources` and `goals.decider`; the seed now
  enforces summary ≤60 words and `outcome_note` on closed goals. The web
  build reads `data/` through the Worker loader. 10 tests added.
- 2026-11-04 — §4 built: `POST /api/generate` (guardrails §4.8 in order,
  Haiku screen, Opus streaming via raw Messages API with JSON schema and
  cached prefix, deterministic output check, shingle uniqueness, one
  `generations` row per request), `POST /api/receipt`, `POST
  /api/report`, D1 tables `generations/screenings/blocks/receipts/
  reports`, `worker/.dev.vars.example`, the `ActForm` island on the
  existing `/goals/<slug>/act/<action>` page. Decisions: §4.1's
  `/act/<action>?target=` becomes `?target=<bioguide_id>` (state code
  for treasurer actions) on the existing route, with the stored
  district's targets as the chooser when absent; a failed output check
  regenerates once then refuses (supersedes §4.3's "show with a
  warning"); digit runs typed by the user in their own fields are
  allowed alongside the fact block, since "voted for you in 2024" is
  the user's material; `doc_format` gains `mentions[]` and `ask` so the
  section/vote and ask-phrase checks are data, not code; `generations`
  also stores an IP hash for the per-IP limit; without
  `ANTHROPIC_API_KEY` the endpoint returns 503 `unconfigured`. 23 tests
  added (`worker/test/generate.test.ts`, 40 abusive + 22 benign screen
  fixtures); spec folded.
- 2026-11-04 — §3 built: `/goals/<slug>/prep` for every published goal
  with `prep_md` (ndaa-1217, senate-leader, house-caucus, state-bonds;
  none for `upcoming`). `prep_md` must carry six `##` sections in order
  (where things stand, dated; timeline; what to say in 30 seconds; likely
  pushback and answers; what counts as a win; sources), enforced at load
  (`worker/src/prep.ts`); "our pick" is rendered from `our_picks`, which
  leads the page for leadership goals with the unified ask
  (`unifiedAsk`: `what_we_want` + first pick) and a "picks not set yet"
  state while `our_picks` is empty. `[VERIFY: …]` markers in `prep_md`
  render as visible chips. "Take action" island carries each stored-district
  target to `/goals/<slug>/act/<action>?target=<bioguide_id>`; "Prep" link
  added to the goal page. Open: `our_picks` still empty pending the
  maintainer's paste from `docs/research/senate-leader-candidates.md`
  (Open question 1); the act-page "Prep" link is left to §4; Open question
  8 handled in the NDAA pushback answers (ask for a position, record via
  reports). 6 tests added.
- 2026-11-04 — §6 built: `/donate` (self-funding statement, deterministic
  monthly cost line, four Stripe Payment Link buttons opening in a new
  tab), `/about` and `/privacy` (stored vs sent-where, incl. the Census
  proxy wording from Open question 4); the Donate button in the header and
  the footer line already existed. Deviation: `MONTHLY_COST_USD` and
  `STRIPE_LINKS` are build-time env read by Astro
  (`web/src/lib/donate.ts`), not Worker vars, because the pages are
  static; defaults are $15 and disabled buttons ("link not configured").
  The "after every receipt" link belongs to the §4 receipt screen.
- 2026-11-04 — §7 built: `worker/scripts/draft-position.ts <bioguide>
  <url> [goal]` (Haiku proposes position + verbatim quote + date, code
  verifies the quote on the page, prints one `positions/<goal>.csv` row,
  never writes); nightly digest (`worker/src/digest.ts`, cron `0 9 * * *`,
  `scheduled` export) counts new reports by member × goal × outcome in
  code, Haiku writes prose only (dropped if it adds a number), one email
  via Email Routing with the raw rows as CSV; seed documented as a full
  delete+insert of the five data tables. Deviations: the row follows the
  real positions header (`bioguide_id,position,source_url,source_date,
  changed_by`; the goal picks the file) rather than a goal column; a
  `digest_runs` table records each run so "since last run" survives
  restarts; `parseCsv` now reads RFC 4180 quoted cells; new vars
  `MAINTAINER_EMAIL`, `DIGEST_FROM` and binding `DIGEST_MAIL`. Spec:
  `docs/specs/maintainer-tooling.md`.
