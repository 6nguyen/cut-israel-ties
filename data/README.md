# data — source of truth for D1

`worker/scripts/seed.ts` turns these files into `worker/seed.sql`
(gitignored); `npm run seed` applies schema + seed to the local D1, and
`npm run seed:remote -w worker` to production. The site never shows a
number or a name that is not a row here.

| File | Table | Notes |
|---|---|---|
| `ids.md` | (registry) | `kind \| id \| slug \| status \| since`: every goal and action id ever published. Ids are assigned once, never changed, never reused after a file is removed (its row turns `retired`); the next id is the highest ever used plus one. The loader refuses a YAML id that is missing, duplicated, retired, unregistered or on another slug (stable-data-ids §1-2). |
| `goals/<slug>.yaml` | `goals` | `id` from `ids.md`. `eligibility` is a JSON rule evaluated by `worker/src/ranking.ts`; grammar below. The seed rejects a rule outside it. `status` lifecycle below. |
| `actions/<slug>.yaml` | `actions` | One file per action; `id` from `ids.md`; `goal` names the goal slug. `form_schema`, `prompt_template` and `doc_format` drive the §4 generator; `standard_template` or `script_blocks` the no-model script; shape below. |
| `members.csv` | `members` | One row per sitting member. Flags (`hasc`, `conferee`, `rc243`, `jrd_april_2026`, `btb_cosponsor`, `target_2028`) stay empty until sourced. |
| `positions/<goal>.csv` | `positions` | Append-only; every row needs `source_url` and `source_date`. |
| `states.csv` | `states` | One row per state; `holdings_status` is `held`, `none` or `unknown` (empty = unknown). `held` needs `israel_bonds_usd`, `holdings_date` and `holdings_source`; `none` needs date and source; empty fields render as "not yet sourced". Rows come from `draft-holding`, below. |
| `elections.csv` | (folded into `goals`) | `state,district,primary_date,filing_deadline,source_url`: one row per 2028 primary target, ISO dates, `source_url` the state election office page. The seed copies them into the electoral goal's `decision_date`, `window_end` and `sources` (primary-2028 §1). Header-only until a target exists. |

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

## Provenance (2026-11-05)
`members.csv` holds every sitting member of the 119th Congress (539 rows:
433 representatives, 6 delegates, 100 senators; vacant seats have no row),
imported on 2026-11-05 from `unitedstates/congress-legislators`
`legislators-current.yaml` (public domain, raw `main` at commit
`97261713f5dcd1b846050130cea77eded642268b`) plus the Senate directory
`https://www.senate.gov/general/contact_information/senators_cfm.xml`
(fetched the same day) by
`npm run import-members -w worker [path-to-yaml] [--senate-xml <path|url>]`
(downloads the roster when no path is given). The dataset supplies
`party`, `chamber`, `state`, `district`, `dc_phone` (the office number),
`contact_form_url` and `contact_kind` (`form` from the roster or the
Senate XML, `homepage` for the 14 senators whose office lists no form,
`zip_gate` for `<house site>/contact`, which usually asks for a ZIP
first); `money_url`, `district_office_address`, `district_office_city`,
`not_returning` (hand-set from election results) and every flag column
stay as they are in the file and are empty until sourced. `district_phone`
is empty for every row and is derived at seed time from
`district_offices.csv`; a hand-filled value wins. `left_office` is set by
the import, never by hand, on or after 2027-01-03 when a member drops out
of the roster. The `name` column keeps the file's value for rows that
already exist (common name, e.g. "Lou Correa"); new rows take the
dataset's `official_full`. Re-running the import refreshes the dataset
columns, adds new members and prints members no longer in the roster as
`stale:` (or `left:` once `left_office` is set); it never deletes a row.
The weekly `roster` workflow (`.github/workflows/roster.yml`) runs both
importers and opens a data PR when anything changed.

`district_offices.csv` (1,306 rows, 535 of 539 members) is generated from
`unitedstates/congress-legislators` `legislators-district-offices.yaml`
(licence CC0-1.0; fetched 2026-11-05 from raw `main` at the same commit
`97261713f5dcd1b846050130cea77eded642268b`, the file's own last change
being `d0fa668f` of 2026-07-12) by `npm run import-offices -w worker
[path-to-yaml]`. One row per office, sorted by `bioguide_id` then
`office_id`; offices of people not in `members.csv` are dropped; phones
are normalised to `NNN-NNN-NNNN` and cleared when not ten digits (none
were). 253 offices carry `hours`. The four members without an office row
(Gallagher CA, Wahab CA, Blair GA, Graham SC, all seated in 2026) need a
hand-entered row sourced from the member's site; new members after
2027-01-03 will likewise have no office rows for about two months.

Goal `decision_date` values are maintainer placeholders to be
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
`reasons` holds at most six `{angle, points[]}` groups (one to five points
each, at most 160 characters, no digits): first-person starting points the
act form shows above its "why this matters to you" field, written from
different angles (who our government answers to, being dragged into wars, my
money, Gaza, readiness, speech) so a caller can put the gripe in their own
words without memorising the case. They carry no figures; numbers come from
sourced rows.

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
  (`0`/`1`), `rc243` (string), `target_2028` (`0`/`1`), `state` (two
  letters), `district` (integer; `0` = at large). An `electoral` goal's rule
  is exactly `{"house": {"target_2028": 1, "state": "XX", "district": N}}`.
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
- `standard_template` or `script_blocks` (one of the two while the goal
  is `active`): the script served when no model may run
  (`docs/specs/personalised-documents.md` §5). `script_blocks: <name>`
  names `script_blocks/<name>.yaml`:
  - `incumbents`: bioguide ids whose script asks them to commit or step
    aside (`when: {self: true}` variants).
  - `slots[]`, in output order: `name`, `pick` (variants per slot,
    default 1), `carries` (`ask` and/or `mention`: every variant of the
    slot must hold the `doc_format.ask` phrase / a `mentions` phrase),
    `variants[] {id, text, when?}`. `when` keys: `chamber` (`house |
    senate`), `self` (target is an incumbent), `has` (placeholder names
    that must render non-empty, e.g. `user_affiliation`).
  - `text` uses the same placeholders as `standard_template`
    (`{{target_name}} {{target_role}} {{ask}} {{mention}}
    {{position_line}} {{prior_vote_line}} {{pick_line}} {{user_<field>}}`).
    No digits (the output check rejects numbers outside the fact
    block), no URLs, emails or handles, no blocked terms.
  - The seed check composes every target in scope with the shortest,
    one-word and longest fixture fields and fails on a slot with fewer
    eligible variants than `pick`, a composition outside
    `min_words`–`max_words`, or one that fails the output check.

## Adding a 2028 primary target (primary-2028 §1)
A target is a House member whose seat gets an `electoral` goal: a sourced
record of their positions and votes on every goal this site tracked, the
primary date and filing deadline, and one ask (who is running against them).
No candidate name, no pick and no advocacy word appears anywhere; the seed
rejects `vote for`, `vote against`, `support`, `oppose`, `elect`, `defeat`
and `re-elect` in electoral copy (Open question 1 is unanswered).
`target_2028 = 1` is set only in a data/ PR that cites a recorded roll call:
the member's `rc243` cell must be filled in the same PR, and the PR body
links the clerk's roll-call page. Steps, all in one data/ PR:
1. `members.csv`: set `rc243` (if empty) and `target_2028` to `1`.
2. `elections.csv`: add `state,district,primary_date,filing_deadline,source_url`
   from the state election office; both dates ISO, deadline on or before
   the primary.
3. `npm run make-primary-goal -w worker -- <STATE> <district> [roll-call-url]`
   writes `goals/primary-<st>-<d>.yaml` (category `electoral`, status
   `upcoming`, priority 1, eligibility above) and
   `actions/primary-<st>-<d>-call.yaml` from the templates in
   `worker/src/electoral.ts`, each with the next free `id` from `ids.md`,
   and appends both `live` rows to `ids.md`. It refuses without steps 1
   and 2.
4. `npm test -w worker` (loader, ranking and forbidden-phrase checks), then
   flip `status` to `active` in a later data/ PR when the federal goal it
   follows closes; priority 1 keeps it below every active federal and state
   goal until then.

