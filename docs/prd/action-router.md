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
   leads with the pick and the unified ask wording; the action's prompt
   uses the same wording so every generated doc asks for the same thing.
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
7. Limits: 5 generations per device per hour, 20 per day; Turnstile token
   required; prompt never includes user-supplied URLs; max_tokens 1500.

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
    title, summary, what_we_want, status active|completed|expired,
    outcome_note, window_start, window_end, decision_date, priority,
    eligibility json, our_pick json{name, rationale, source_url},
    successor_slug, this_week text, this_week_date, detail_md, prep_md,
    partner_url, updated_at)`
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
  house, senators[], state_row, goals[2]}`; `GET /api/goals`; `POST
  /api/generate {action, target, fields, turnstile}` (SSE stream); `POST
  /api/receipt`; `POST /api/report`. All JSON, no cookies, device hash =
  SHA-256 of a random localStorage id.
- Claude call: `claude-opus-5-5`, adaptive thinking default, effort
  `medium`, streaming, `cache_control` on the system prompt + action
  template (stable prefix), fact block and user fields last, server-side
  fallback `"default"` enabled, `max_tokens` 1500. Structured output
  `{subject?, body, facts_used[]}` via `output_config.format`.
- Config: `MONTHLY_COST_USD`, `STRIPE_LINKS` json, `ANTHROPIC_API_KEY`,
  `TURNSTILE_SECRET` as Worker secrets/vars.

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
  from §1–§7; Data & contracts; Invariants; Performance budget).

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
      with `our_pick` shows the pick and the same ask wording appears in
      its generated docs (string test on 20 generations).
- [ ] 20 generations for the same action and target with different user
      inputs: no two share >0.3 shingle overlap; every doc names the
      target and section; no digits outside the fact block; "end aid"
      absent; call scripts ≤120 words; letters 180–260 words.
- [ ] Generate without a valid Turnstile token, or past 5/hour, returns
      429/403 and no Anthropic call is made (mock asserts zero calls).
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
  - [ ] 1. Landing and address routing
  - [ ] 5. Goal ranking (deterministic)
  - [ ] 2. Goals overview and detail
  - [ ] 4. Actions and personalised documents
  - [ ] 3. Prep and briefing pages
  - [ ] 6. Donations and about
  - [ ] 7. Maintainer tooling (LLM-assisted, maintainer-approved)
- Completed: none.
- Folded: none.
- Branch / open PRs: none.
- Remaining: all.
- Decisions since last update: supersedes vote-tracker; stack, donations
  and funnel scope decided with the owner (see Changes).
- Next action: scaffold repo (Astro + Worker + D1 + `data/`) as §1.

## Open questions
1. Senate leader vote: date and challenger unknown. Proposal: goal ships
   with `our_pick` empty and the unified ask "commit publicly to vote
   only for a leader who will strip §1217 and oppose a new MOU"; the
   maintainer sets the pick when a challenger declares. decision_date
   = 2026-12-15 placeholder, flagged VERIFY in prep_md.
2. Model for personalisation. Proposal: `claude-opus-5-5` at effort
   `medium` (quality is what keeps docs credible; ~$0.01/doc). Digest and
   position drafts on `claude-haiku-5-5`. Revisit from measured cost per
   receipt.
3. Uniqueness threshold 0.3 Jaccard on 8-gram shingles over the last 200
   docs per action. Proposal: ship it, tune from the 20-generation test.
4. Address privacy: the Census Geocoder sees the address. Proposal:
   proxy via the Worker with no logging, state it on `/privacy`; evaluate
   an on-device district lookup (shapefile in the browser) in `## Next`.
5. House caucus goal is secondary per research. Proposal: keep it,
   priority 1 (NDAA 3, Senate leader 2, state 1), so a Democratic
   district with two Republican senators still gets two federal goals.
6. Section numbers (§219/§1217, formerly §224) unverified against
   enrolled text. Proposal: store all three; the seed PR verifies.
7. Candidate endorsement. "Our pick" for elected office (2028 primaries)
   may make the site's spending express advocacy with FEC reporting
   consequences for an individual. Proposal: v1 picks are limited to
   leadership votes and policy positions; the 2028 goal stays in
   `## Next` until the owner has checked the rules. Not blocking: no
   v1 goal needs a candidate pick.
8. Prep page for the NDAA goal needs the Khanna letter signer list, which
   is unpublished. Proposal: ask for a position, record it via reports.

## Changes
- 2026-11-04 — created (APPROVED, auto: every question carries a
  proposal, none blocking). Supersedes `archive/2026-11-vote-tracker.md`.
  Owner decisions: Cloudflare + Astro + Worker + D1; Stripe Payment
  Link; v1 funnel is receipt + share only.
