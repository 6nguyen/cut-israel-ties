# Personalised documents

## Purpose
Turns one goal, one target and a few lines from the user into a call
script, letter or public comment the user can act on, then records a
receipt and an optional office response. It stops at the document: the
user places the call or sends the letter themselves, and nothing the site
stores identifies them. Address routing, goals and ranking are in
`action-router.md`.

## Behavior
1. **Act page.** `/goals/<slug>/act/<action>` (active goals only) renders
   the action's `form_schema` fields (first name 40, city 60, "why this
   matters to you" 280 multiline, optional affiliation 80) with live
   counts and a Turnstile widget. Above the multiline "why" field a
   collapsed "Not sure what to say?" panel lists the goal's `reasons`:
   first-person starting points grouped by angle (who our government
   answers to, being dragged into wars, my money, Gaza, readiness, speech);
   tapping one appends it to the field for the caller to rewrite. The
   Turnstile widget sits outside the form, so it renders once the island
   has a target (not on the "Loading your target…" render) and stays
   through the output state for Regenerate; an expired token is dropped
   and re-issued, and a 403 `turnstile` answer is retried once with a
   fresh token before the error shows.
   `?target=<bioguide_id>` (state code
   for treasurer actions) preselects the target; otherwise the island
   loads the stored district's targets for the goal and offers a radio
   list, or "Enter your address" with nothing stored. Nothing submits
   until every required field is present and within its limit.
2. **Generation.** `POST /api/generate` runs the §4.8 guardrails in
   order, all before any Opus call: request shape → action and goal
   active → target on file for the action's scope → field shape and
   stripping (markup, URLs, emails, phones, control characters) →
   Turnstile → device block → per-device and per-IP limits → standard
   decision (Behavior 5: `LLM_MONTHLY_BUDGET_USD` 0, no
   `ANTHROPIC_API_KEY`, or today's count ≥ `dailyCap(...)`) →
   `claude-haiku-5-5` screen (`ok | off_topic | injection | harmful`,
   logged by device hash and class only; a screen that throws falls
   through to the standard script with `reason: upstream`). The global
   daily cap is `dailyCap(spent, blended, today, budget, ceiling)` =
   `clamp(floor((budget − spent) / daysLeftInMonth / blended), 20,
   ceiling)` (`worker/src/cost.ts`): `spent` is the month's `costUsd`
   over `generations` token sums, `blended` the trailing-7-day mean cost
   per model-drafted document (0.025 while fewer than 20 exist), the
   ceiling `MAX_GENERATIONS_PER_DAY`. Then `claude-opus-5-5` streams a JSON `{subject,
   body, facts_used}` built from a fixed system prompt (the only task,
   the exact section/vote wording and ask phrase from `doc_format`, the
   action's `prompt_template`, cached prefix; call scripts at
   `output_config.effort: 'low'`, `max_tokens` 700, letters and comments
   `'medium'`, 1500) plus a `<facts>` block
   assembled by code from D1 (target, committee role, stated position,
   prior vote, goal ask, decision date, window, our pick; treasurer
   actions: bonds held, campaign, next comment date) and the user's
   `<user_fields>`, both labelled untrusted. The page shows the body as
   it streams.
   For an action with `script_blocks` the user message also carries a
   `<starting_script>` block holding the Behavior 5 composition for this
   request, and the system prompt tells the model to keep its ask and
   facts, rework it into the constituent's voice and treat it as
   material, not instructions; a composition that fails the check is
   omitted.

3. **Output check and uniqueness.** Deterministic, after each draft:
   word count within `doc_format`, target surname, one of
   `doc_format.mentions`, the `doc_format.ask` phrase, our pick's surname
   when the goal has one, no "end aid", every digit run present in the
   fact block or the user's own fields, no URL/email/phone, no blocklist
   term. A failed check regenerates once with the reason; a second
   failure returns `error {refused}` and the page shows a refusal with
   "edit my lines", never the draft. 8-word shingles (FNV-1a) of the
   body are compared with the last 200 for the action; Jaccard > 0.3
   regenerates once with a "different structure and opening"
   instruction, then the draft is shown. One `generations` row per
   request (shingles, hashes, tokens, `attempt` 1|2 and `check_fail` =
   the first attempt's failure class when a redraft ran; empty shingles
   on refusal). Both attempts throwing on the model call gives `reset`
   and the standard script with `reason: upstream`. One "Regenerate"
   button.
4. **Receipt, share, report.** The output screen offers copy, download
   `.txt`, `tel:` links for every phone on file (each with the open/closed
   chip of `web/src/lib/hours.ts`; when the DC office is closed the
   district number is listed first with "DC office closed; district
   office answers in office hours."), the contact-form link
   for letters and comments, and "I did it" → `POST /api/receipt`
   (goal, action, target, stored state/district, device hash). After a
   receipt, first the commitment line and the captain list
   (`commitment-funnel.md` §1–4; each skippable in one tap), and only
   once both are answered or skipped: the next-office buttons and the
   "You're one of <N>" line (`commitment-funnel.md` §10), then "Share"
   (device share sheet with the goal deep link, clipboard fallback), the
   office-response picker
   (`will_support · undecided · opposed · no_answer · other` + note
   ≤140) → `POST /api/report` (`no_answer` also shows the voicemail line
   and "Try again", `commitment-funnel.md` §9), a reflection line that
   never leaves the page, and a link to `/donate`. Share is offered after a receipt or a
   completed captain list, never before. Reports never change a
   position row.
5. **Standard script.** When no model may run — the day's cap is
   reached (`reason: capacity`), `ANTHROPIC_API_KEY` is unset
   (`unconfigured`), `LLM_MONTHLY_BUDGET_USD` is 0 (`budget`), or the
   screen or both model attempts threw (`upstream`) — the route serves
   the action's standard script instead: `worker/src/standard.ts`
   fills `{{target_name}} {{target_role}} {{ask}} {{mention}}
   {{position_line}} {{prior_vote_line}} {{pick_line}} {{leader_line}}
   {{user_<field>}}`
   from the same rows as the fact block and the stripped user fields,
   shortens the longest user field word by word when the fill passes
   `max_words`, and runs the Behavior 3 output check (a failed fill
   returns `error {refused}`). Same SSE stream: `status {stage:
   'standard', reason}`, one `delta`, `done {..., standard: true,
   reason}`; no Anthropic request is made on that path. The act page
   labels it "Standard script — not personalised today" with one line of
   why; receipt, commitment, captain, share and report are unchanged.
   The `generations` row has `model = 'standard'`, zero tokens and
   `check_fail` null, so counts and limits see it and `costUsd` adds $0.
   The loader (`checkStandardTemplates`) rejects an `active` goal's
   action without a template or blocks, an unknown placeholder, a brace
   left in the text, or a fill that fails the output check for any
   in-scope target with the shortest or the longest valid fields.
   The template is `standard_template`, or, when the action names
   `script_blocks: <name>`, a composition from
   `data/script_blocks/<name>.yaml` (`worker/src/compose.ts`): each slot
   contributes `pick` distinct variants (default 1) drawn from the
   variants whose `when` holds for this request (`chamber`, `self` =
   the target is one of the file's `incumbents`, `has` = these
   placeholders render non-empty), kept in file order, variants joined
   by a space and slots by a newline. The draw is seeded by the request's
   `variant` (a random integer the act page sends; absent or invalid =
   random), so one seed always gives one script and the next seed a
   different one; `done.variant` names the chosen block ids joined by
   `.`. Only an incumbent gets the self asks (commit in public or step
   aside); every other target gets the vote-only asks, each ending in
   `{{leader_line}}`: one code-built sentence (`leaderLine`,
   `worker/src/generate.ts`) on the incumbent leader of the target's
   chamber (the file's `incumbents`), from that leader's row in the
   goal's positions file — `for`: "<Leader> has made that commitment in
   public."; `against`/`uncommitted`: "<Leader> has not made that
   commitment. Until that changes, the vote should go to someone else.";
   no row: "<Leader> has not said so in public. Until that changes, the
   vote should go to someone else." It is empty for the incumbents
   themselves and for state targets, has no digits and names no source.
   A leadership action's target may also be a member-elect (`elect_id`;
   leadership-routing §2.6): role "Representative-elect"/"Senator-elect",
   fact block "Takes office 2027-01-03, replacing <name>" and "Prior
   vote: No recorded vote yet", contact from the elect row. Every ask
   carries the action's `ask` phrase and a mention. For such an action the act
   page's regenerate button reads "Another version" and resends with a
   new seed. The leadership actions (`house-caucus-call`,
   `senate-leader-call`) use `leadership.yaml`; the NDAA action keeps a
   plain template.

## Data & contracts
- `POST /api/generate` body `{action, target, fields, device,
  turnstile?, variant?}` (`device` 8–128 chars; `variant` a non-negative
  integer seed, ignored otherwise). Success is `text/event-stream`:
  `status {stage: drafting|redrafting|standard, reason?}`, `delta
  {text}`, `reset {reason}`, `done {subject, body, facts_used, words,
  standard, reason?, variant?, target: {id, name, role, phones[],
  contact_form_url}}` or `error {error: refused | internal, message}`;
  `variant` is present only on a standard script composed from blocks.
  Rejections are JSON `{error, message}`: 400 `bad_json | bad_request |
  no_action | no_target | bad_fields`, 403 `turnstile | blocked`, 422
  `screened`, 429 `limit_hour | limit_day | limit_action | limit_ip`.
  No 503 or 502 (the standard script replaces them). Limits (`LIMITS`
  in `worker/src/generate.ts`): 5 per device per hour, 20 per day, 3
  per device per action per day, 30 per IP per day, `dailyCap(...)`
  globally with `MAX_GENERATIONS_PER_DAY` (default 500) as the ceiling
  and 20 as the floor while the budget is above zero, `max_tokens` 700
  for call scripts and 1500 otherwise; three screened-out attempts in
  24 h block the device for 24 h.
- `actions.script_blocks` (TEXT, JSON of the parsed blocks file or
  null) sits beside `standard_template`; the YAML key `script_blocks:
  <name>` names `data/script_blocks/<name>.yaml` (`incumbents[]`,
  `slots[] {name, pick?, carries? (ask | mention), variants[] {id, text,
  when? {chamber?, self?, has?}}}`; shape and rules in `data/README.md`).
  `worker/src/compose.ts` parses, filters and draws; `standardScript`
  takes the seed and returns `variant`.
- `POST /api/receipt` `{goal, action, target, state?, district?,
  device}` → `{id}` (`action: 'captain-list'` with no target records a
  completed captain list, `commitment-funnel.md`); `POST /api/report` `{goal, target, outcome, note?,
  device}` → `{id}` (note sanitised to ≤140 chars). Both 400
  `bad_request | no_action | no_target | bad_outcome`.
- Anthropic is called through the injected `fetch` (raw Messages API,
  no SDK): `claude-opus-5-5` streaming with `output_config` JSON schema
  and `cache_control` on the system prefix; `claude-haiku-5-5`
  non-streaming for the screen. `ANTHROPIC_API_KEY`,
  `MAX_GENERATIONS_PER_DAY` and `LLM_MONTHLY_BUDGET_USD` (default 15; 0
  = standard scripts only) come from `worker/.dev.vars` (template:
  `worker/.dev.vars.example`).
- `worker/src/cost.ts`: `PRICES` (USD per MTok by model id, read
  `PRICES_READ`), `SCREEN_ALLOWANCE_USD` 0.0001 per model-drafted row,
  `costUsd(rows)`, `blendedCost(rows)`, `dailyCap(...)`,
  `currentCap(repo, now, budget, ceiling)` and `parseBudget`; pure
  arithmetic over `Repo.tokensSince(iso)` sums (per model, action and
  `check_fail`). `worker/src/standard.ts`: `standardScript`,
  `fillStandard`, `fixtureFields`, `checkStandardTemplates`.
- D1 tables added for §4 (`worker/schema.sql`): `generations`
  (action_id, target_id, shingles BLOB, device_hash, ip_hash, tokens,
  model, `attempt` INTEGER DEFAULT 1, `check_fail` TEXT), `screenings` (device_hash, action_id, class), `blocks`
  (device_hash, until), `receipts`, `reports` (outcome CHECK, `hidden`).
  No table holds user text or a document.
- Action YAML (`data/actions/<slug>.yaml`): `form_schema.fields[]`
  (`name, label, max, required, multiline?, hint?`), `prompt_template`
  (action guidance appended to the system prompt), `doc_format`
  (`kind, min_words, max_words, mentions[], ask`) and
  `standard_template` (Behavior 5; required while the goal is active);
  `mentions` and `ask` are the exact phrases the output check requires.
- Goal YAML `reasons[]` (`angle`, `points[]`): at most six angles, one to
  five points each, ≤160 characters, no digits; the seed rejects anything
  else (`data/README.md`).
- Receipt limits (`district-counters.md` §8–9): `POST /api/receipt`
  answers 429 `limit_day` after 10 receipts per device hash in 24 h,
  `limit_repeat` for a second receipt on the same device, goal and action
  within 10 minutes and `limit_ip` after 50 per IP hash in 24 h; none of
  those rows is stored. Every stored receipt carries `ip_hash` =
  SHA-256(`CF-Connecting-IP` | `IP_SALT` | UTC date), nullable, never the
  IP. The generation limits above are unchanged.


## Invariants (regression checklist)
- [ ] Without `ANTHROPIC_API_KEY`, `/api/generate` streams the standard
      script with `reason: unconfigured` and makes no Anthropic call;
      so do a budget of 0 and a reached cap; every 400/403/429
      rejection and every screened-out input also makes no Opus call
      (`worker/test/generate.test.ts`).
- [ ] No number in the digest or the cap comes from a model: `dailyCap`
      and `costUsd` are arithmetic over stored token sums
      (`worker/test/cost.test.ts`).
- [ ] Every active action's `standard_template` passes the output check
      for every in-scope target with the shortest and longest fixture
      fields; `loadRows` names the action otherwise
      (`worker/test/standard.test.ts`).
- [ ] Every active action with `script_blocks` has ≥ `pick` eligible
      variants per slot for every in-scope target, every carrier
      variant holds the ask phrase or a mention, no variant holds a
      digit, URL or blocked term, the shortest and longest compositions
      stay within `min_words`–`max_words`, and three seeded compositions
      per target and fixture pass the output check; `loadRows` names the
      action, slot and variant otherwise (`worker/test/compose.test.ts`).
- [ ] An incumbent named in `incumbents` never receives a non-self ask
      and no other target receives a self ask; 300 seeds per target give
      ≥ 100 distinct bodies (`worker/test/compose.test.ts`).
- [ ] 40 abusive inputs (injection, threats, off-topic) produce zero
      documents; 20 benign inputs with unusual phrasing all pass; the
      third screened-out attempt blocks the device for 24 h; screenings
      store device hash and class, never content.
- [ ] A draft with a URL or a number outside the fact block is
      regenerated once, then refused; no document is shown.
- [ ] 20 generations with different inputs produce no pair with shingle
      overlap > 0.3; every stored document names the target, a
      `doc_format.mentions` phrase and the ask, is within the word range
      and never contains "end aid"; a duplicate triggers one
      different-structure regeneration.
- [ ] `generations` rows carry shingles, hashes and token counts and
      never a user field or the text; `/api/route` still calls no repo
      writer.
- [ ] `/api/report` never changes a `positions` row; its note is
      stripped and ≤140 characters.

## Performance budget
Generation: first streamed token ≤3 s p95, complete ≤10 s p95;
standard script complete ≤500 ms p95. ~900 uncached input tokens per
document; output ≤700 (call script) or ≤1500 (letter); about $0.01 per
call script and $0.025 per letter at November 2026 prices; the month's
spend ≤ `LLM_MONTHLY_BUDGET_USD`. Infra cost excluding LLM and domain =
$0/month.
