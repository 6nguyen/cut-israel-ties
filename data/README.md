# data — source of truth for D1

`worker/scripts/seed.ts` turns these files into `worker/seed.sql`
(gitignored); `npm run seed` applies schema + seed to the local D1, and
`npm run seed:remote -w worker` to production. The site never shows a
number or a name that is not a row here.

| File | Table | Notes |
|---|---|---|
| `goals/<slug>.yaml` | `goals` | `eligibility` is a JSON rule evaluated by `worker/src/ranking.ts` (keys: `always`, `all`, `any`, `house`, `senator`, `state`). |
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
