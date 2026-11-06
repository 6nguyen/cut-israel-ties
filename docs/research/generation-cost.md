# What one generated document costs, and what the daily cap should be
Researched: 2026-11-05 · Informs: [generation-cost](../prd/generation-cost.md)

## Summary
- One call script costs about **$0.02** on `claude-opus-5-5` (range $0.009–$0.034; a redraft doubles it). The Haiku screen and the nightly digest are noise (<$0.0001 per request, ~$0.001 per day).
- The default global cap of **500 generations a day** can spend **~$10 a day, ~$300 a month**. The donate page tells users the site "costs about $15 a month" (`MONTHLY_COST_USD` default). At $0.02 a document, $15 buys ~750 documents a month, ~25 a day. The cap and the stated cost disagree by an order of magnitude.
- The `cache_control` marker on the system prompt is almost certainly a no-op: the rendered prompt is ~500 tokens and the Opus 5.5 cache minimum is 512. Nothing is lost (no write, no premium), but the spec's "~1.2k cached input" claim is wrong and caching cannot be the lever at this volume.
- Output tokens are ~80% of the bill, and on Opus 5.5 thinking cannot be disabled: `effort: 'medium'` is the one knob. Call scripts are 60–120 words; `effort: 'low'` should cut the per-document cost by roughly half with no visible change the output check would not catch.
- The cheapest document is the one not generated: when the cap is hit or the key is missing the user gets a 503 today. A code-built standard script from the same `<facts>` block costs $0 and keeps the call happening.

## 1. Price table (Claude API, as cached in the `claude-api` skill 2026-10-06)
| Model | Input $/MTok | Output $/MTok | Cache read | Cache write (5 min) | Cache minimum |
|---|---:|---:|---:|---:|---:|
| `claude-opus-5-5` (document) | 4.00 | 20.00 | 0.20 (0.05×) | 5.00 (1.25×) | 512 tokens |
| `claude-sonnet-5-5` | 2.00 | 10.00 | 0.20 | 2.50 | 512 tokens |
| `claude-haiku-5-5` (screen, digest, drafts) | 0.10 | 0.50 | ~0.01 | ~0.125 | 512 tokens |
Thinking tokens bill as output tokens and count against `max_tokens`. Opus 5.5 cannot run without thinking; `effort` (`low` … `max`, default `medium`) is the only control. Haiku 5.5 has no server-side refusal fallback (the Worker already handles a `refusal` stop). Batch API (50% off) does not apply to an interactive request.

## 2. What one request sends
Measured from `worker/src/generate.ts` and `data/actions/ndaa-1217-call.yaml` (tokens ≈ words × 1.35):
| Piece | Where | Size | Cached? |
|---|---|---:|---|
| System prompt (rules + register + `prompt_template`, 86 words) | `systemPrompt()` | ~500 tokens | marked `ephemeral`, but under the 512 minimum → silently not cached |
| `<facts>` block (target, position, prior vote, dates, ask) | user message | ~250–400 tokens | no (per target) |
| `<user_fields>` (what the person typed) | user message | 0–150 tokens | no |
| Output: JSON `{subject, body (60–120 words), facts_used}` | `max_tokens: 1500` | ~250 visible + thinking | — |
| Screen call (`claude-haiku-5-5`, `effort: 'low'`, `max_tokens: 200`) | once per request | ~350 in / ~40 out | — |

## 3. Cost per document
| Case | Input | Output (incl. thinking) | Cost |
|---|---:|---:|---:|
| Call script, medium effort, typical | 900 × $4 = $0.0036 | 800 × $20 = $0.016 | **$0.020** |
| Call script, output hits `max_tokens` 1500 | $0.0036 | $0.030 | $0.034 |
| Call script, thinking minimal | $0.0036 | 260 × $20 = $0.005 | $0.009 |
| Letter / public comment (150–250 words) | $0.0036 | ~1,000 × $20 = $0.020 | $0.024 |
| Redraft after overlap or output-check failure (second attempt) | ×2 | ×2 | $0.040 |
| Screen (Haiku) | 350 × $0.10 | 40 × $0.50 | $0.00006 |
| Nightly digest prose (Haiku, 600 out) | — | — | ~$0.001 / day |
Working figure: **$0.02 per completed document**, **$0.025 blended** with a 25% redraft rate. The `generations` table already stores `input_tokens`, `output_tokens` and `model` per row, so the real number is computable by code once traffic exists.

## 4. Cap arithmetic
| Daily cap | Worst-case $/day | $/month | Fits `MONTHLY_COST_USD` = |
|---:|---:|---:|---:|
| 500 (today's default) | 10.00 | 300 | 300 |
| 100 | 2.00 | 60 | 60 |
| 25 | 0.50 | 15 | 15 (the donate-page default) |
| budget-derived | budget ÷ days ÷ blended cost | = budget | any |
A fixed cap is wrong in both directions: too high and a viral day costs twenty times the stated budget; too low and the site turns people away on the one day that matters. The cap should be computed by code from a budget variable and the measured blended cost, with a floor so the first day is never zero.

## 5. Levers, ranked by $ saved per document
| Lever | Saving | Quality risk | Verdict |
|---|---:|---|---|
| Budget-derived daily cap (`LLM_MONTHLY_BUDGET_USD`, measured cost from `generations`) | bounds the month | none | adopt |
| Code-built standard script when capped or unconfigured (same `<facts>`, no model) | $0.02 on every turned-away request; keeps the call | lower personalisation, clearly labelled | adopt |
| `effort: 'low'` for call scripts (60–120 words) | ~$0.008–0.010 (thinking tokens) | low; the output check (`names target`, exact phrases, digits) still gates | adopt, measure redraft rate |
| `max_tokens` 1500 → 700 for call scripts | caps the worst case at $0.018 | a cut-off body fails the check and redrafts | adopt with the effort change |
| `claude-sonnet-5-5` for call scripts | ~50% | unmeasured on this prompt | defer: open question, decide on redraft-rate data |
| Prompt caching (pad the system prompt past 512, or move `<facts>` into it) | ≤$0.002 per hit, hits only when the same action repeats within 5 min | none | reject at this volume; fix the spec sentence instead |
| `claude-haiku-5-5` for documents | ~97% | high: the facts-only and exact-phrase rules are where small models slip | reject |
| Batch API | 50% | n/a (interactive) | reject |

## 6. Telemetry that must exist before any of this is tuned
- Per-day sums of `input_tokens`, `output_tokens` by `model` from `generations` × the price table in code → dollars, in the nightly digest and month-to-date. Deterministic; the digest's Haiku prose may only restate numbers the table already shows (the existing digit check enforces that).
- Redraft rate (second-attempt share) and output-check failure classes per action, so the effort and model decisions are made on data.

## Sources
- Price table and cache minimums: Claude API model and prompt-caching references bundled in the `claude-api` skill (cached 2026-10-06); verify against https://docs.claude.com/en/docs/about-claude/pricing before relying on a cent.
- `worker/src/generate.ts` (`LIMITS`, `docRequest`, `systemPrompt`, `screenSystemPrompt`, two-attempt loop), `worker/src/anthropic.ts` (models), `worker/src/digest.ts`, `web/src/lib/donate.ts` (`DEFAULT_MONTHLY_COST_USD = 15`), `.env.example` (`MAX_GENERATIONS_PER_DAY=500`), `docs/specs/personalised-documents.md` §Performance budget.
