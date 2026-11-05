# data — source of truth for D1

`worker/scripts/seed.ts` turns these files into `worker/seed.sql`
(gitignored); `npm run seed` applies schema + seed to the local D1, and
`npm run seed:remote -w worker` to production. The site never shows a
number or a name that is not a row here.

| File | Table | Notes |
|---|---|---|
| `goals/<slug>.yaml` | `goals` | `eligibility` is a JSON rule evaluated by `worker/src/ranking.ts`; grammar below. The seed rejects a rule outside it. `status` lifecycle below. |
| `actions/<slug>.yaml` | `actions` | One file per action; `goal` names the goal slug. |
| `members.csv` | `members` | One row per sitting member. Flags (`hasc`, `conferee`, `rc243`, `jrd_april_2026`, `btb_cosponsor`, `target_2028`) stay empty until sourced. |
| `positions/<goal>.csv` | `positions` | Append-only; every row needs `source_url` and `source_date`. |
| `states.csv` | `states` | One row per state; empty fields render as "not yet sourced". |

## Provenance (2026-11-04)
`members.csv` holds only the six fixture delegations the §1 tests need
(CA-46, CA-23, TX-35, TX-21, PA-1, PA-2). Name, party, chamber, state and
district are from the 119th Congress roster; `dc_phone` is the Capitol
switchboard until each office number is sourced; every position flag is
empty. Goal `decision_date` values are maintainer placeholders to be
replaced with sourced dates before launch. Filling the full roster is a
maintainer task (§7 tooling).

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
