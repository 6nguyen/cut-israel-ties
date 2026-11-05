# Generation cost and the standard script — PRD
Status: APPROVED 2026-11-05 (auto) · Owner: George Nguyen · Last updated: 2026-11-05

## Problem
One generated call script costs about $0.02 on `claude-opus-5-5` and the
global cap is 500 a day, so a busy day can cost $10 and a busy month
$300, while `/donate` tells users the site "costs about $15 a month"
(`MONTHLY_COST_USD` default). At $0.02 a document, $15 is ~25 documents a
day. Nothing in the Worker knows what it has spent: `generations` stores
tokens per row, but no code turns them into dollars, the digest never
mentions spend, and the cap is a constant. When the cap is hit, or
`ANTHROPIC_API_KEY` is unset, or Anthropic errors twice, the act page
shows a 503 and the person leaves without a script, on exactly the day
the vote is close. The `cache_control` marker on the system prompt also
does nothing: the rendered prompt is ~500 tokens and the cache minimum
is 512, so the spec's "~1.2k cached input" is wrong. Evidence:
`docs/research/generation-cost.md`.

## Goals / Non-goals
- Goals: the month's LLM spend never exceeds a budget the owner sets in
  one variable; the owner sees yesterday's and the month's spend in the
  digest without opening a dashboard; a person who asks for a script
  always leaves with one (personalised when the budget allows, a
  code-built standard script otherwise); call scripts cost about half
  what they cost today with no change the output check cannot catch.
- Non-goals: moving documents to a smaller model (decided on data, see
  Open questions); prompt caching (worth ≤$0.002 per hit at this volume,
  and hits are rare); an opt-in "skip personalisation" link on the act
  page (personalised messages carry more weight with staff; the standard
  script is a fallback, not a default); the Batch API (interactive
  requests); storing screen-call tokens (a fixed allowance covers them).

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/generation-cost.md`.
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Budget-derived rate limit computed from measured cost | API gateways (Kong, Cloudflare AI Gateway spend caps) | Adopt | A constant cap is wrong in both directions; the measured blended cost from `generations` makes the cap follow reality |
| Spend line in the operator's daily report | Every paid API dashboard | Adapt | No dashboard: the figure goes into the nightly digest the maintainer already reads, computed by code |
| Degrade to a template, never to an error | Resistbot (falls back to fixed letters), 5 Calls (scripts are fixed text) | Adopt | A code-built standard script from the same facts keeps the call happening at $0 |
| Lower reasoning effort for short, checked outputs | Claude API `effort` guidance | Adopt | Output tokens are ~80% of the bill; the deterministic output check already gates quality |
| Smaller model for the common case | Many chat products | Defer | Decide on redraft-rate data this PRD starts collecting |
| Prompt caching | Claude API | Reject | Below the 512-token minimum today; padding to reach it saves ≤$0.002 per hit |

## Users
- Constituents: unchanged flow; on a capped or unconfigured day they see
  a labelled standard script instead of an error, and the receipt,
  commitment and captain steps follow as usual.
- Maintainer: sets `LLM_MONTHLY_BUDGET_USD` once; reads spend and the
  day's cap in the digest; sees redraft rate per action to decide the
  model question.

## Expected behavior
### 1. Budget-derived daily cap
- New Worker var `LLM_MONTHLY_BUDGET_USD` (default 15, the same default
  as `MONTHLY_COST_USD`). `0` means no model calls: every request gets
  the standard script (§4).
- New module `worker/src/cost.ts`: `PRICES` (USD per million tokens, in
  and out, keyed by model id, with the date they were read), `costUsd(rows)`
  summing `input_tokens × in + output_tokens × out` over `generations`
  rows plus a fixed `SCREEN_ALLOWANCE_USD = 0.0001` per row, and
  `dailyCap(spentMonthToDate, blended, today, budget, ceiling)` =
  `clamp(floor((budget − spent) / daysLeftInMonth / blended), 20, ceiling)`.
  `blended` is the trailing-7-day mean `costUsd` per generation, or
  `0.025` while fewer than 20 generations exist. `ceiling` is
  `MAX_GENERATIONS_PER_DAY` (unchanged default 500), now a hard upper
  bound rather than the cap itself.
- The §4.8 guardrail "global daily cap" compares today's count with
  `dailyCap(...)`. The repo gains `tokensSince(iso)` returning per-model
  token sums so the cap and the digest share one query. The floor of 20
  means the first day of a month, or a month already over budget, still
  serves 20 personalised documents, then standard scripts.
- Pure functions; no LLM touches any number.

### 2. Cost telemetry in the digest
- The digest's code-rendered table gains a block "LLM spend": yesterday
  (documents, redrafts, $), month to date ($ of $budget), today's cap,
  and per action: documents, redraft share, output-check failure classes.
  Numbers come from `costUsd` and `generations`; the Haiku prose may
  restate them (the existing digit check keeps it honest).
- The digest is also sent when there are no reports but spend passed 80%
  of the budget for the first time this month (subject
  `[cut-ties] LLM budget 80% · YYYY-MM-DD`), so the maintainer hears
  before the standard script takes over.

### 3. Cheaper call scripts
- `docRequest` sets `output_config.effort` to `'low'` and `max_tokens`
  to `700` when `fmt.kind === 'call_script'` (60–120-word bodies);
  letters and public comments keep `'medium'` and `1500`.
- `generations` gains `attempt INTEGER NOT NULL DEFAULT 1` and
  `check_fail TEXT` (the failure class of attempt 1 when a redraft ran,
  else null) so the redraft rate per action is measurable.
- The `cache_control` marker stays (harmless, and a longer
  `prompt_template` may cross 512 tokens); the spec's cost sentence is
  corrected (Spec delta).

### 4. Standard script when capped or unconfigured
- Each action YAML gains `standard_template` (plain text with
  `{{target_name}}`, `{{target_role}}`, `{{ask}}`, `{{mention}}`,
  `{{position_line}}`, `{{prior_vote_line}}`, `{{user_<field>}}`
  placeholders; the loader rejects unknown placeholders and a missing
  template on an `active` goal's action). `worker/src/standard.ts`
  fills it from the same `factBlock` inputs and the shaped user fields
  (stripped text only), then runs the same output check as a generated
  draft; a template that fails the check is a seed error, never a
  runtime fallback.
- `POST /api/generate` returns the standard script, through the same
  SSE stream (`status {stage: 'standard', reason: capacity | unconfigured
  | upstream | budget}` then one `delta` and `done {..., standard: true}`),
  when: the day's cap is reached, `ANTHROPIC_API_KEY` is unset,
  `LLM_MONTHLY_BUDGET_USD` is 0, or both model attempts failed with a
  502-class error. 503 `capacity | unconfigured` and 502 `upstream` are
  no longer emitted by this route. Per-device, per-IP and Turnstile
  guards, the screen call (when a key exists) and the device block
  still apply before it.
- The act page labels the result "Standard script — not personalised
  today" with one line of why, and the receipt, commitment, captain,
  share and report steps are unchanged. A standard script writes a
  `generations` row with `model = 'standard'` and zero tokens, so counts
  and limits see it.

## Data & contracts
- Worker var `LLM_MONTHLY_BUDGET_USD` (default 15; `.env.example`,
  `worker/wrangler.jsonc` vars, `worker/src/types.ts`, the
  `env-example` test).
- `worker/src/cost.ts`: `PRICES`, `costUsd`, `dailyCap`,
  `SCREEN_ALLOWANCE_USD`; `Repo.tokensSince(iso): {model, input, output,
  count, redrafts}[]`.
- `worker/schema.sql` `generations`: `+ attempt INTEGER NOT NULL DEFAULT
  1`, `+ check_fail TEXT`; `model` may be `'standard'`.
- Action YAML: `+ standard_template` (required when the goal is
  `active`); `worker/src/standard.ts` `fillStandard(template, facts,
  fields)`; loader checks.
- `/api/generate` SSE: `status.stage` gains `standard` with `reason`;
  `done` gains `standard: boolean`; 503 `capacity | unconfigured` and
  502 `upstream` removed from this route's rejections.
- Digest table gains the "LLM spend" block; a budget-80% send.

## Spec delta
- MODIFIED `docs/specs/personalised-documents.md` §Behavior 2: "API key present (else 503 `unconfigured`)" and "global daily cap" → key missing, cap reached, budget 0 or upstream failure fall through to the standard script (§Behavior 5); the cap is `dailyCap(...)`, bounded by `MAX_GENERATIONS_PER_DAY`.
- ADDED `docs/specs/personalised-documents.md` §Behavior 5 "Standard script": the §4 text above (template, placeholders, same output check, SSE shape, labelling, `generations` row).
- MODIFIED `docs/specs/personalised-documents.md` §Data & contracts: SSE `status.stage` and `done.standard`; rejections lose 503 `capacity | unconfigured` and 502 `upstream`; `generations` columns `attempt`, `check_fail`; `LLM_MONTHLY_BUDGET_USD`; `cost.ts` and `standard.ts` entries; call scripts at `effort: 'low'`, `max_tokens` 700.
- MODIFIED `docs/specs/personalised-documents.md` §Performance budget: "~1.2k cached input + ~400 output tokens per document" → "~900 uncached input tokens; output ≤700 (call script) or ≤1500 (letter); about $0.01 per call script and $0.025 per letter at November 2026 prices; the month's spend ≤ `LLM_MONTHLY_BUDGET_USD`".
- MODIFIED `docs/specs/personalised-documents.md` §Invariants: "Without `ANTHROPIC_API_KEY`, `/api/generate` returns 503 `unconfigured`" → "… streams the standard script with `reason: unconfigured` and makes no Anthropic call"; add "no number in the digest or the cap comes from a model".
- MODIFIED `docs/specs/maintainer-tooling.md` §Behavior 3: the table gains the "LLM spend" block; the budget-80% send; "with no new reports and no pending listing nothing is sent" → "… unless the 80% threshold was crossed".
- MODIFIED `docs/specs/deployment.md` §Configuration table: add `LLM_MONTHLY_BUDGET_USD` to the Worker vars row (code default 15).

## Acceptance criteria
- [ ] With `LLM_MONTHLY_BUDGET_USD=15` and an empty `generations` table on the 1st, the cap is `clamp(floor(15 / 30 / 0.025), 20, 500)` = 20; with $14 spent on the 28th it is 20 (floor); with $0 spent on the 15th and a measured blended cost of $0.01 it is 93.
- [ ] `costUsd` on a fixture of 10 rows (two models, one redraft) equals the hand-computed figure to the cent; a `generations` row with `model='standard'` adds $0.
- [ ] The digest for a day with 12 documents and 3 redrafts shows "LLM spend" with those counts, the dollar figure from the fixture prices, month to date, the budget and today's cap; the prose contains no digit run absent from the table.
- [ ] Crossing 80% of the budget sends the digest once that month even with zero reports; the next night with no reports sends nothing.
- [ ] A call-script request is sent with `effort: 'low'`, `max_tokens: 700`; a letter request with `'medium'`, `1500`; a redraft writes `attempt = 2` and `check_fail` on the first row's class.
- [ ] Cap reached: `/api/generate` streams `status {stage: 'standard', reason: 'capacity'}`, one `delta`, `done {standard: true}`; the body names the target, contains the mention and ask phrases, is 60–120 words, and no Anthropic request is made. Same for `unconfigured` (no key) and `budget` (budget 0); two 5xx replies from Anthropic give `reason: 'upstream'`.
- [ ] The act page shows "Standard script — not personalised today" and the receipt → commitment → captain → share → report sequence works unchanged; "I did it" records a receipt.
- [ ] Seeding an `active` goal's action without `standard_template`, or with an unknown placeholder, or whose filled text fails the output check for any fixture target, fails `loadRows` with a message naming the action.
- [ ] Per-device, per-IP, Turnstile and block guards still reject before a standard script is served; a screened-out field still returns 422.
- [ ] Performance budget: first streamed token ≤3 s p95 and complete ≤10 s p95 unchanged for generated documents; the standard script completes ≤500 ms p95; `/api/route` ≤2 s p95 unaffected; infra cost excluding LLM and domain $0/month; the month's LLM spend ≤ `LLM_MONTHLY_BUDGET_USD` + one day's cap × blended cost.

## Rollout & metrics
- No flag: ships behind the existing var defaults. Migration: two
  nullable/defaulted columns on `generations` (`schema:remote` applies
  them; existing rows read as attempt 1).
- Measure for the first 30 days after go-live: $/document by kind,
  redraft share per action, standard-script share and its `reason`
  split, receipt rate after standard vs generated scripts. These answer
  Open question 1.

## State (updated 2026-11-05)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [ ] 1. Budget-derived daily cap
  - [ ] 3. Cheaper call scripts
  - [ ] 4. Standard script when capped or unconfigured
  - [ ] 2. Cost telemetry in the digest
- Completed: none.
- Folded: none.
- Branch / open PRs: none.
- Remaining: all four sections; §1 and §3 are small Worker changes, §4
  adds a YAML field to five actions and a UI label, §2 extends the
  digest.
- Decisions since last update: none.
- Known failures / blockers: none; needs no owner provisioning
  (`LLM_MONTHLY_BUDGET_USD` has a code default).
- Next action: /implement-prd-section docs/prd/generation-cost.md (§1).

## Open questions
1. Should call scripts move to `claude-sonnet-5-5` (about half the cost
   again)? Proposal: not now; decide after 30 days of §3 data if the
   redraft share at `effort: 'low'` stays under 15% and receipt rates
   after generated and standard scripts differ by less than five points
   (if they do not differ, the model matters less than the fallback).
2. Should the 80% warning also email at 100%? Proposal: no; at 100% the
   standard script serves everyone and the daily digest already shows
   it, so a second alert adds nothing the maintainer can act on.

## Changes
- 2026-11-05 — created; no blocking questions, so APPROVED (auto) at PR creation; proposals in Open questions are the decisions.
