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
   counts and a Turnstile widget. `?target=<bioguide_id>` (state code
   for treasurer actions) preselects the target; otherwise the island
   loads the stored district's targets for the goal and offers a radio
   list, or "Enter your address" with nothing stored. Nothing submits
   until every required field is present and within its limit.
2. **Generation.** `POST /api/generate` runs the §4.8 guardrails in
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
   request (shingles, hashes, tokens; empty shingles on refusal). One
   "Regenerate" button.
4. **Receipt, share, report.** The output screen offers copy, download
   `.txt`, `tel:` links for every phone on file, the contact-form link
   for letters and comments, and "I did it" → `POST /api/receipt`
   (goal, action, target, stored state/district, device hash). After a
   receipt, first the commitment line and the captain list
   (`commitment-funnel.md` §1–4; each skippable in one tap), and only
   once both are answered or skipped: "Share" (device share sheet with
   the goal deep link, clipboard fallback), the office-response picker
   (`will_support · undecided · opposed · no_answer · other` + note
   ≤140) → `POST /api/report`, a reflection line that never leaves the
   page, and a link to `/donate`. Share is offered after a receipt or a
   completed captain list, never before. Reports never change a
   position row.

## Data & contracts
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
  device}` → `{id}` (`action: 'captain-list'` with no target records a
  completed captain list, `commitment-funnel.md`); `POST /api/report` `{goal, target, outcome, note?,
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
- Receipt limits (`district-counters.md` §8–9): `POST /api/receipt`
  answers 429 `limit_day` after 10 receipts per device hash in 24 h,
  `limit_repeat` for a second receipt on the same device, goal and action
  within 10 minutes and `limit_ip` after 50 per IP hash in 24 h; none of
  those rows is stored. Every stored receipt carries `ip_hash` =
  SHA-256(`CF-Connecting-IP` | `IP_SALT` | UTC date), nullable, never the
  IP. The generation limits above are unchanged.


## Invariants (regression checklist)
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
Generation: first streamed token ≤3 s p95, complete ≤10 s p95;
`max_tokens` 1500; ~1.2k cached input + ~400 output tokens per document.
Infra cost excluding LLM and domain = $0/month.
