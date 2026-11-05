# Action router

## Purpose
Turns a street address into the visitor's House district and senators and
the two open goals where their call matters most this week. It stops at the
two goal cards: the goal overview, prep pages, generated documents and
receipts are later capabilities and are still stubs.

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
11. **Act page.** `/goals/<slug>/act/<action>` (active goals only) renders
   the action's `form_schema` fields (first name 40, city 60, "why this
   matters to you" 280 multiline, optional affiliation 80) with live
   counts and a Turnstile widget. `?target=<bioguide_id>` (state code
   for treasurer actions) preselects the target; otherwise the island
   loads the stored district's targets for the goal and offers a radio
   list, or "Enter your address" with nothing stored. Nothing submits
   until every required field is present and within its limit.
12. **Generation.** `POST /api/generate` runs the §4.8 guardrails in
   order, all before any Opus call: request shape → action and goal
   active → target on file for the action's scope → field shape and
   stripping (markup, URLs, emails, phones, control characters) → API
   key present (else 503 `unconfigured`) → Turnstile → device block →
   global daily cap → per-device and per-IP limits → `claude-haiku-5-5`
   screen (`ok | off_topic | injection | harmful`, logged by device hash
   and class only). Then `claude-opus-5-5` streams a JSON `{subject,
   body, facts_used}` built from a fixed system prompt (the only task,
   the exact section/vote wording and ask phrase from `doc_format`, the
   action's `prompt_template`, cached prefix) plus a `<facts>` block
   assembled by code from D1 (target, committee role, stated position,
   prior vote, goal ask, decision date, window, our pick; treasurer
   actions: bonds held, campaign, next comment date) and the user's
   `<user_fields>`, both labelled untrusted. The page shows the body as
   it streams.
13. **Output check and uniqueness.** Deterministic, after each draft:
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
   request (shingles, hashes, tokens; empty shingles on refusal). One
   "Regenerate" button.
14. **Receipt, share, report.** The output screen offers copy, download
   `.txt`, `tel:` links for every phone on file, the contact-form link
   for letters and comments, and "I did it" → `POST /api/receipt`
   (goal, action, target, stored state/district, device hash). Only
   after a receipt: "Share" (device share sheet with the goal deep
   link, clipboard fallback), the office-response picker (`will_support
   · undecided · opposed · no_answer · other` + note ≤140) →
   `POST /api/report`, a reflection line that never leaves the page, and
   a link to `/donate`. Reports never change a position row.

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
- Browser storage: `localStorage` `cut-ties:place` = `{state, district}`;
  `sessionStorage` `cut-ties:route` = last route response;
  `localStorage` `cut-ties:device` = random per-browser id (the Worker
  stores only its SHA-256).
- `POST /api/generate` body `{action, target, fields, device,
  turnstile?}` (`device` 8–128 chars). Success is `text/event-stream`:
  `status {stage: drafting|redrafting}`, `delta {text}`, `reset
  {reason}`, `done {subject, body, facts_used, words, target: {id, name,
  role, phones[], contact_form_url}}` or `error {error: refused |
  upstream, message}`. Rejections are JSON `{error, message}`: 400
  `bad_json | bad_request | no_action | no_target | bad_fields`, 403
  `turnstile | blocked`, 422 `screened`, 429 `limit_hour | limit_day |
  limit_action | limit_ip`, 503 `unconfigured | capacity`, 502
  `upstream`. Limits (`LIMITS` in `worker/src/generate.ts`): 5 per
  device per hour, 20 per day, 3 per device per action per day, 30 per
  IP per day, `MAX_GENERATIONS_PER_DAY` (default 500) globally,
  `max_tokens` 1500; three screened-out attempts in 24 h block the
  device for 24 h.
- `POST /api/receipt` `{goal, action, target, state?, district?,
  device}` → `{id}`; `POST /api/report` `{goal, target, outcome, note?,
  device}` → `{id}` (note sanitised to ≤140 chars). Both 400
  `bad_request | no_action | no_target | bad_outcome`.
- Anthropic is called through the injected `fetch` (raw Messages API,
  no SDK): `claude-opus-5-5` streaming with `output_config` JSON schema
  and `cache_control` on the system prefix; `claude-haiku-5-5`
  non-streaming for the screen. `ANTHROPIC_API_KEY` and
  `MAX_GENERATIONS_PER_DAY` come from `worker/.dev.vars` (template:
  `worker/.dev.vars.example`).
- D1 tables added for §4 (`worker/schema.sql`): `generations`
  (action_id, target_id, shingles BLOB, device_hash, ip_hash, tokens,
  model), `screenings` (device_hash, action_id, class), `blocks`
  (device_hash, until), `receipts`, `reports` (outcome CHECK, `hidden`).
  No table holds user text or a document.
- Action YAML (`data/actions/<slug>.yaml`): `form_schema.fields[]`
  (`name, label, max, required, multiline?, hint?`), `prompt_template`
  (action guidance appended to the system prompt) and `doc_format`
  (`kind, min_words, max_words, mentions[], ask`); `mentions` and `ask`
  are the exact phrases the output check requires.

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
- [ ] Without `ANTHROPIC_API_KEY`, `/api/generate` returns 503
      `unconfigured` and makes no Anthropic call; every 400/403/429/503
      rejection and every screened-out input also makes no Opus call
      (`worker/test/generate.test.ts`).
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
Landing ≤100 KB transferred (measured 2026-11-04: 7 KB gzip for HTML,
CSS and the page's JS chunks, fonts excluded; `/goals` 6 KB,
`/goals/<slug>` 7 KB); LCP ≤1.5 s on a mid-range phone
over 4G; `/api/route` ≤2 s p95; infra cost excluding LLM and domain
= $0/month.
