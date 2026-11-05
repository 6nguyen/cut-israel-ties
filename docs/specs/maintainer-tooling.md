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
   sourceless row reaches D1.
3. **Nightly digest** — a Worker cron (`0 9 * * *` UTC) runs `runDigest`:
   reports created after the last recorded run (first run: the past 24 h),
   screenings in the same window and devices blocked at run time. With no
   new reports nothing is sent (the run is still recorded). Otherwise one
   email goes to `MAINTAINER_EMAIL` via Cloudflare Email Routing:
   subject `[cut-ties] N report(s) · YYYY-MM-DD`; body = Haiku prose
   (3–6 sentences from the counts table) followed by `---` and the
   code-rendered table (member, goal × outcome counts, screened-out
   classes, blocked devices); attachment `reports-YYYY-MM-DD.csv` with
   the raw rows. The prose is dropped for the table alone when the model
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

## Data & contracts
- `worker/scripts/draft-position.ts` (CLI) → `worker/src/draft-position.ts`
  (`draftPosition(fetch, apiKey, {bioguide, memberName?, url, goal,
  goalAsk?})` → `{kind:'row', row, quote, date, reason}` or
  `{kind:'none', reason}`). Row columns:
  `bioguide_id,position,source_url,source_date,changed_by` with
  `changed_by = draft-position`; `position` ∈ for | uncommitted | against.
- `worker/src/digest.ts`: `buildDigest(reports, members, goals, since, now)`
  (pure; counts member × goal × outcome, CSV header
  `bioguide_id,member,goal_slug,outcome,note,created_at,device_hash`),
  `digestTable`, `digestProse`, `buildMime` (multipart/mixed, UTF-8 text +
  base64 CSV), `runDigest(deps, env)` with injected `repo`, `fetch`, `now`
  and `send`. `worker/src/index.ts` exports `scheduled` and the default
  `{ fetch, scheduled }`.
- Repo methods: `reportsSince(since)` (non-hidden, `created_at > since`),
  `screeningsSince(since)`, `activeBlocks(now)` (`until > now`),
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

## Invariants (regression checklist)
- [ ] `draft-position` never writes a file; its only outputs are stdout,
      stderr and the exit code.
- [ ] A row is printed only when the quote is found verbatim on the fetched
      page and the date is `YYYY-MM-DD`; a model position outside
      for | uncommitted | against yields no row.
- [ ] `loadRows` throws `has no source` for a positions row lacking
      `source_url` or `source_date`.
- [ ] Every count in the digest comes from `buildDigest`; the model sees
      only the counts table (no notes, no device hashes) and any number it
      adds that is not in the counts discards its prose.
- [ ] No new reports → no email and no model call.
- [ ] The digest never reads or writes `positions`; `/api/report` never
      changes a position.
- [ ] Tests run with no network: the page and the Anthropic endpoint are
      stubbed, the sender is injected.
- [ ] The seed rewrites only the five data tables and leaves user tables.

## Performance budget
Infra cost excluding LLM and domain stays $0/month: one cron invocation
and at most one Email Routing message per day, one Haiku call per digest
and one per `draft-position` run.
