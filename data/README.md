# data — source of truth for D1

`worker/scripts/seed.ts` turns these files into `worker/seed.sql`
(gitignored); `npm run seed` applies schema + seed to the local D1, and
`npm run seed:remote -w worker` to production. The site never shows a
number or a name that is not a row here.

| File | Table | Notes |
|---|---|---|
| `goals/<slug>.yaml` | `goals` | `eligibility` is a JSON rule evaluated by `worker/src/ranking.ts`; grammar below. The seed rejects a rule outside it. `status` lifecycle below. |
| `actions/<slug>.yaml` | `actions` | One file per action; `goal` names the goal slug. `form_schema`, `prompt_template` and `doc_format` drive the §4 generator; shape below. |
| `members.csv` | `members` | One row per sitting member. Flags (`hasc`, `conferee`, `rc243`, `jrd_april_2026`, `btb_cosponsor`, `target_2028`) stay empty until sourced. |
| `positions/<goal>.csv` | `positions` | Append-only; every row needs `source_url` and `source_date`. |
| `states.csv` | `states` | One row per state; `holdings_status` is `held`, `none` or `unknown` (empty = unknown). `held` needs `israel_bonds_usd`, `holdings_date` and `holdings_source`; `none` needs date and source; empty fields render as "not yet sourced". Rows come from `draft-holding`, below. |

## Seeding (PRD §7.3)
Every `npm run seed` deletes and re-inserts the five data tables above
from these files; user tables (`receipts`, `reports`, `screenings`,
`blocks`, `generations`, `digest_runs`) are untouched. Publishing a data
change is a merged PR plus a deploy; there is no admin UI.

## Adding a position (PRD §7.1)
Run `npm run draft-position -w worker -- <bioguide_id> <url> [goal-slug]`
with `ANTHROPIC_API_KEY` set. It fetches the page, asks a Haiku-class
model for the member's stated position with a verbatim quote and date,
verifies the quote against the page by code, and prints one row in the
`positions/<goal>.csv` column order (`changed_by` = `draft-position`).
Read the quote it prints, then paste the row at the end of the file in a
PR; the script never writes here. No row is printed when the quote is not
verbatim on the page or the page shows no date — find a better source
rather than hand-filling those columns. The loader rejects any row without
`source_url` and `source_date`.

## Adding a state holding (state-holdings-sweep §1)
Run `npm run draft-holding -w worker -- <STATE> <url>` with
`ANTHROPIC_API_KEY` set, on the treasurer's investment report or the
pension system's holdings disclosure (HTML or plain text; no PDF). It
prints one `states.csv` row for that state with `holdings_status` `held`
(amount verified as a figure inside the verbatim quote) or `none`, the
as-of date and `holdings_source` = the URL, keeping the row's treasurer,
campaign and comment-date cells. Replace the state's row in a PR and add
the URLs to `docs/research/state-israel-bonds.md`. The loader rejects an
amount without a source and date, a past `next_comment_date`, and a
`campaign_url` without a `campaign_name`.

## Provenance (2026-11-04)
`members.csv` holds every sitting member of the 119th Congress (539 rows:
433 representatives, 6 delegates, 100 senators; vacant seats have no row),
imported on 2026-11-04 from `unitedstates/congress-legislators`
`legislators-current.yaml` (public domain) by
`npm run import-members -w worker [path-to-yaml]` (downloads the file when
no path is given). The dataset supplies
`party`, `chamber`, `state`, `district`, `dc_phone` (the office number)
and `contact_form_url`; `district_phone`, `money_url`,
`district_office_address`, `district_office_city` and every flag
column stay as they are in the file and are empty until sourced. The
`name` column keeps the file's value for rows that already exist (common
name, e.g. "Lou Correa"); new rows take the dataset's `official_full`.
Re-running the import refreshes the dataset columns, adds new members and
prints members no longer in the roster as `stale:`; it never deletes a
row. Goal `decision_date` values are maintainer placeholders to be
replaced with sourced dates before launch.

## Goal status lifecycle (PRD §2)
`upcoming` → `active` → `completed` | `expired`. The overview and the
ranking show only `active` goals; `completed`/`expired` goals appear in
the Outcomes strip and must carry `outcome_note`. A goal authored as
`upcoming` with a predecessor naming it in `successor_slug` is flipped to
`active` by the loader on the first seed after the predecessor closes,
so retiring a goal is one YAML edit. `summary` is at most 60 words;
`our_picks` holds at most three `{name, rationale, source_url, signal,
signal_date}` rows; `sources` holds `{title, url}` rows; `decider` is the
one-line "who decides" shown on the detail page.

## Prep pages (PRD §3)
`prep_md` is maintainer-written markdown rendered at `/goals/<slug>/prep`;
leave it empty for no page. The seed rejects it unless it has exactly these
`##` headings, in this order, each with text: **Where things stand** (must
contain an ISO date, e.g. `*As of 2026-11-04.*`), **Timeline**, **What to
say in 30 seconds**, **Likely pushback and answers**, **What counts as a
win**, **Sources**. "Our pick and why" is not a heading: it comes from
`our_picks` and leads the page for a goal that has them. Every date, vote
count or name in `prep_md` must be a row in this directory or be followed by
`[VERIFY: what to confirm and where]`; markers render as yellow chips and
are removed when the primary source is read. The `sources` rows are listed
under the Sources section.

## Eligibility rule grammar (PRD §5.1)
One key per object. `{"always": true}` · `{"all": [rule, …]}` ·
`{"any": [rule, …]}` · `{"house": {field: value, …}}` (every field must
match the House member; `{}` means "a House member exists") ·
`{"senator": {…}}` (at least one senator matches) ·
`{"state": {"nonempty": [field, …]}}` (any listed state field is set).
Fields a rule may test, with the value each accepts:
- house: `party` (`D`/`R`/`I`), `hasc`, `conferee`, `btb_cosponsor`
  (`0`/`1`), `rc243` (string).
- senator: `party` (`D`/`R`/`I`), `jrd_april_2026` (string).
- state: any `states.csv` column except `state`.
Score = `priority` × urgency (2 when `decision_date` is ≤14 days away,
1.5 when ≤45, else 1; a past or empty date scores 1). Ties go to the
earlier decision date, then the slug. The top two are shown; a single
eligible goal is paired with the state goal.

## Action form, prompt and document format (PRD §4)
- `form_schema.fields[]`: `name` (the only keys `/api/generate` accepts),
  `label`, `max` (characters; the Worker rejects longer values and strips
  markup, URLs, emails, phones and control characters), `required`,
  optional `multiline` and `hint`. The schema is the only path into the
  prompt.
- `prompt_template`: action-specific guidance appended to the fixed system
  prompt. It may name what to open with and what to close on; it must not
  restate numbers (those come from the fact block built by code).
- `doc_format`: `kind` (`call_script | letter | public_comment`),
  `min_words`, `max_words`, `mentions` (phrases, one of which the output
  must contain, e.g. the section number) and `ask` (the exact ask phrase
  the output must contain). The deterministic output check in
  `worker/src/generate.ts` enforces all of them; a failed check
  regenerates once, then refuses.
