# Maintainer tooling

## Purpose
Keeps `data/` the only source of truth while a single maintainer runs the
site: a CLI that drafts a sourced position row from a web page, a nightly
digest that tells the maintainer what constituents reported, and a seed
that pushes every data file into D1. The model proposes; code verifies
and counts; the maintainer approves by committing. There is no admin UI
and nothing here writes to `data/` or to `positions`.

## Behavior
1. **Draft a position** — `npm run draft-position -w worker --
   <bioguide_id> <url> [goal-slug]` (goal defaults to `ndaa-1217`). The
   script fetches the URL, strips tags, scripts, styles and comments,
   caps the text at 60k characters and asks Haiku (`claude-haiku-5-5`,
   structured output) for the member's stated position on that goal with
   one verbatim quote and the page's date. Code then checks the quote
   appears verbatim on the page (whitespace- and quote-glyph-insensitive,
   at least 12 characters) and the date is `YYYY-MM-DD`. On success it
   prints the quote, date and reason to stderr and one CSV row to stdout
   in the `data/positions/<goal>.csv` column order; the maintainer pastes
   it into that file in a PR. Any failure (position `unknown`, quote not
   on the page, no usable date, unreadable reply) prints
   `# no stated position: <reason>` and no row. Exit codes: 64 usage,
   78 no `ANTHROPIC_API_KEY`, 65 unknown goal slug.
2. **Lint** — the loader (`loadRows`) throws on a positions row without
   `source_url` or `source_date`, so the seed and every test fail before a
   sourceless row reaches D1. For `states.csv` (`checkStates`) it throws on
   a row with `israel_bonds_usd` but no `holdings_source` or
   `holdings_date`, an amount that is not a positive whole number, a
   `holdings_status` outside `held | none | unknown` or inconsistent with
   the amount (`held` needs one, `none` and `unknown` carry none, `none`
   needs source and date), a `next_comment_date` before the seed date, or
   a `campaign_url` without a `campaign_name`. An empty `holdings_status`
   cell reads as `unknown`.
3. **Nightly digest** — a Worker cron (`0 9 * * *` UTC) runs `runDigest`:
   reports created after the last recorded run (first run: the past 24 h),
   screenings in the same window, devices blocked at run time and every
   `pending` visit listing (office-visits), and the `generations` token
   sums since the last run and since the 1st of the month. With no new
   reports and no pending listing nothing is sent (the run is still
   recorded) unless the month's LLM spend crossed 80% of
   `LLM_MONTHLY_BUDGET_USD` since the last run (spend before the last
   run < 80% ≤ spend now, arithmetic over the two sums, so it fires once
   a month): then the table alone goes out, no model call, subject
   `[cut-ties] LLM budget 80% · YYYY-MM-DD`. Otherwise one email goes to
   `MAINTAINER_EMAIL` via Cloudflare Email Routing: subject `[cut-ties] N
   report(s)[ · M visit listing(s) to review][ · LLM budget 80%] ·
   YYYY-MM-DD`; body = Haiku prose (3–6 sentences from the counts table)
   followed by `---` and the code-rendered table (member, goal × outcome
   counts, screened-out classes, blocked devices, then the "LLM spend"
   block: since last run — documents, redrafts, standard scripts, $;
   month to date — $ of $budget and the per cent; today's cap; per
   action — documents, redraft share, output-check failure classes,
   standard scripts; every figure from `costUsd` / `dailyCap` over
   `tokensSince` sums), then `---` and the
   pending listings, each with signed approve / reject / hide / delete
   links to `https://<DIGEST_FROM domain>/api/visits/review?token=…`
   (7-day HMAC tokens from `VISITS_REVIEW_SECRET`; unset → the block
   names the listings and says to set it); attachment
   `reports-YYYY-MM-DD.csv` with the raw rows. The prose is dropped for the table alone when the model
   reply contains any digit run not present in the counts, on any API
   error, or when `ANTHROPIC_API_KEY` is unset. `MAINTAINER_EMAIL` unset
   → the job logs and exits without reading or recording anything.
4. **Seed** — `npm run seed -w worker` (`seed:remote` for production)
   deletes and re-inserts `goals`, `actions`, `members`, `positions` and
   `states` from `data/` on every run, so a merged data PR plus a deploy
   is the whole publishing flow. User tables (`receipts`, `reports`,
   `screenings`, `blocks`, `generations`, `digest_runs`) are never touched
   by the seed.
   `seed:remote` applies `seed.sql` only (FK checks deferred to the end
   of the batch); `schema:remote` applies `schema.sql`, which drops every
   table, once at provisioning (`docs/specs/deployment.md`).
5. **Draft a holding** — `npm run draft-holding -w worker -- <STATE>
   <url>` is `draft-position` for `states.csv`: it fetches the treasurer
   report or pension disclosure (HTML or plain text; a PDF body is
   refused with a reason, no PDF parser ships), asks Haiku for the
   state's Israel-bond holding in whole USD, its as-of date, the deciding
   body and a verbatim quote, and code checks that the quote is on the
   page, that the amount is a dollar figure inside the quote
   (`amountsIn`: `$12.5 million`, `$62,000,000`, `1.2 billion`), that the
   date is `YYYY-MM-DD` and that the decider text appears on the page
   (else the existing row's decider, else empty). On success it prints
   the quote, amount, date and decider to stderr and one `states.csv` row
   to stdout in the file's column order, carrying the state's existing
   treasurer, campaign and comment-date cells, with `holdings_source` =
   the URL and `holdings_status` = `held` or `none`; the maintainer
   replaces that state's row in a PR. Any failure (status `unknown`,
   quote not on the page, no date, amount not in the quote, PDF,
   unreadable reply) prints `# no sourced holding: <reason>` and no row.
   Exit codes: 64 usage, 65 not a two-letter state code, 78 no
   `ANTHROPIC_API_KEY`.

## Data & contracts
- `worker/scripts/draft-position.ts` (CLI) → `worker/src/draft-position.ts`
  (`draftPosition(fetch, apiKey, {bioguide, memberName?, url, goal,
  goalAsk?})` → `{kind:'row', row, quote, date, reason}` or
  `{kind:'none', reason}`). Row columns:
  `bioguide_id,position,source_url,source_date,changed_by` with
  `changed_by = draft-position`; `position` ∈ for | uncommitted | against.
- `worker/src/draft-shared.ts` holds what both draft tools share:
  `fetchPageText` (HTML stripped or plain text, PDF → `unsupported`),
  `stripTags`, `normalise`, `quoteAppears`, `csvCell`, `DRAFT_MODEL`.
  `worker/scripts/draft-holding.ts` (CLI) → `worker/src/draft-holding.ts`
  (`draftHolding(fetch, apiKey, {state, url, existing?})` →
  `{kind:'row', row, status, amount, date, decider, quote, reason}` or
  `{kind:'none', reason}`; `STATES_HEADER` is the `states.csv` header).
- `worker/src/digest.ts`: `buildDigest(reports, members, goals, since, now)`
  (pure; counts member × goal × outcome, CSV header
  `bioguide_id,member,goal_slug,outcome,note,created_at,device_hash`),
  `buildSpend(windowSums, spentMonth, budget, cap, actions)` and
  `spendTable` (pure; `BUDGET_ALERT_SHARE` 0.8), `digestTable`,
  `digestProse` (its digit check also admits the spend block's figures),
  `buildMime` (multipart/mixed, UTF-8 text + base64 CSV), `runDigest(deps,
  env)` with injected `repo`, `fetch`, `now` and `send`; its result
  carries `alert: 'budget80' | null`. The budget and ceiling come from
  `LLM_MONTHLY_BUDGET_USD` and `MAX_GENERATIONS_PER_DAY`. `worker/src/index.ts` exports `scheduled` and the default
  `{ fetch, scheduled }`.
- Repo methods: `reportsSince(since)` (non-hidden, `created_at > since`),
  `screeningsSince(since)`, `tokensSince(iso)` (generation-cost §1; shared
  with the daily cap), `activeBlocks(now)` (`until > now`),
  `lastDigestRun()`, `recordDigestRun(at, count)`; D1 table
  `digest_runs(ran_at TEXT PRIMARY KEY, report_count INTEGER)`. The run
  is recorded after a successful send, so a failed send is retried next
  night with the same window.
- `wrangler.jsonc`: `triggers.crons = ["0 9 * * *"]`, `send_email`
  binding `DIGEST_MAIL`, vars `MAINTAINER_EMAIL` (empty = digest off) and
  `DIGEST_FROM` (a verified Email Routing sender). `cloudflare:email` is
  imported lazily inside the sender so tests never load it.
- `parseCsv` (`worker/src/load.ts`) reads RFC 4180 quoted cells, so the
  digest attachment and any quoted data cell round-trip.
- Visit review: `reviewSection`, `signReview`, `verifyReview` in
  `worker/src/visits.ts`; Repo `pendingVisits()`; the link handler is
  `GET /api/visits/review` (docs/specs/office-visits.md §Behavior 2).

## Invariants (regression checklist)
- [ ] `draft-position` never writes a file; its only outputs are stdout,
      stderr and the exit code.
- [ ] A row is printed only when the quote is found verbatim on the fetched
      page and the date is `YYYY-MM-DD`; a model position outside
      for | uncommitted | against yields no row.
- [ ] `loadRows` throws `has no source` for a positions row lacking
      `source_url` or `source_date`.
- [ ] Every count in the digest comes from `buildDigest` and every dollar
      figure and cap from `buildSpend` over `cost.ts`; the model sees
      only the rendered table (no notes, no device hashes) and any number
      it adds that is not in the table discards its prose.
- [ ] No new reports → no email and no model call, except the one
      table-only mail the month the spend crosses 80% of the budget; the
      next run with nothing new sends nothing
      (`worker/test/digest.test.ts`).
- [ ] The digest never reads or writes `positions`; `/api/report` never
      changes a position.
- [ ] Tests run with no network: the page and the Anthropic endpoint are
      stubbed, the sender is injected.
- [ ] The seed rewrites only the five data tables and leaves user tables.
- [ ] `draft-holding` never writes a file; a row is printed only when the
      quote is verbatim on the page, the date is `YYYY-MM-DD` and, for
      `held`, the amount is a dollar figure inside the quote; a PDF URL
      prints no row and never reaches the model.
- [ ] `loadRows` throws for a `states.csv` row with an amount and no
      source or date, a past `next_comment_date`, or a `campaign_url`
      without a `campaign_name`.

## Performance budget
Infra cost excluding LLM and domain stays $0/month: one cron invocation
and at most one Email Routing message per day, one Haiku call per digest
and one per `draft-position` or `draft-holding` run (Haiku, ≤60k characters
of page text, about $0.01 per run).
