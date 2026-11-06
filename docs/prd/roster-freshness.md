# Roster freshness and district offices — PRD
Status: BUILDING · Owner: George Nguyen · Last updated: 2026-11-05

## Problem
`data/members.csv` is refreshed only when a maintainer runs
`import-members` by hand, and it holds no district office at all: 0 of
539 rows have a `district_phone`, so every "district office" button the
specs promise falls back to the Capitol switchboard, and 95 rows carry a
contact form. The 119th Congress changed seats about 33 times in 22
months (deaths, resignations, specials, appointments), so a hand-run
import leaves a dead phone line on a member page for weeks. On
2027-01-03 the whole House and a third of the Senate turn over at once;
the importer keeps departed members as "stale" rows and the site would
keep routing calls to them. Between now and then the NDAA integration
sections (§219/224, deferred to the December compromise), the funding
deadline of 2026-12-11 and the 2028 MOU are decided by the sitting
members, so the target must stay the sitting member until the day the
new Congress is sworn in, and switch the next day.

## Goals / Non-goals
Goals:
- Every member page and act page offers the district office phone(s),
  address and hours when the public dataset has them (535 of 539 members,
  1,306 offices).
- A senator or representative without a contact form still gets a
  working "write" link.
- The roster and offices refresh themselves weekly at $0, as a PR the
  maintainer merges, never a silent write.
- Departing members are marked, stay the target through 2027-01-03, and
  drop out of routing the day after.

Non-goals:
- Prefilled contact forms (House forms sit behind ZIP or address checks).
- Verifying each House form URL by hand; the fallback is a link pattern.
- Members-elect: the dataset never lists them before swearing-in.
- Committee rosters, staff or leadership calendars (other PRDs).

## Research
Relies on [roster-and-district-offices](../research/roster-and-district-offices.md)
and the roster paragraphs of [data-ingestion](../research/data-ingestion.md).
| Finding | Decision |
|---|---|
| `legislators-district-offices.yaml` covers 535/539 members, 1,306 offices, most members have 2–5 | Store offices as rows in a new `data/district_offices.csv`, not one column |
| 253 offices carry `hours`; all carry phone, address, lat/lng | Keep `hours` optional; the call-follow-through PRD reads it |
| Senate XML `senators_cfm.xml` returned 200 to plain curl; 14 senators have no form because the XML's `email` equals their homepage | Second source for senators; link the homepage when no form exists |
| Every House member has `terms[-1].url`; `<url>/contact` returned 200 for 11/11 sampled, usually a ZIP gate | Link `<url>/contact` labelled as a form behind a ZIP check |
| ~33 seat events in 22 months, same-day commits, longest quiet stretch ~10 weeks; offices file lags 2–5 months | Weekly diff PR; daily for the week after 2027-01-03 |
| raw.githubusercontent serves ETags; GitHub Actions cron is free on a public repo | `If-None-Match`, open a PR only on a non-empty diff |
| Departing members stay in the file until the election-results commit (2025-01-04 02:03 UTC precedent); members-elect never appear | Manual `not_returning` flag now; `left_office` set by the import after 2027-01-03 |
| github.io mirror lagged `main` by six weeks | Fetch raw `main` and pin the SHA in the PR |

## Users
- A constituent who calls after 18:00 ET and needs the local office.
- A constituent whose senator's page has no form today.
- The maintainer, who merges one PR a week instead of remembering to run
  two scripts.

## Expected behavior

### 1. District offices as rows
- `npm run import-offices -w worker [path]` reads
  `legislators-district-offices.yaml` (downloaded from raw `main` when no
  path is given) and writes `data/district_offices.csv` with columns
  `bioguide_id, office_id, city, state, zip, address, suite, building,
  phone, fax, hours, lat, lng`. Rows sort by `bioguide_id`, then
  `office_id`; the script is idempotent and never keeps a row whose
  `bioguide_id` is not in `members.csv`.
- `loadRows` loads the file into a `district_offices` table (same
  columns, `bioguide_id` foreign to `members`), rejects an unknown
  `bioguide_id`, an unknown state code or a phone that is not ten digits
  after stripping punctuation, and derives each member's `district_phone`
  in memory as the first office phone in file order when the CSV column
  is empty (a hand-filled column still wins).
- The member page's contact block lists every office: city, phone as
  `tel:`, address, hours when present. The act page's target card and the
  results card show the DC number, then "District: <city> <phone>" for the
  first office in the member's `state`.

### 2. Contact-form fallback
- `import-members` takes a second optional source, the Senate directory
  XML; a senator whose roster term has no `contact_form` gets the XML
  `email` value when it differs from the homepage, else the homepage URL
  with `contact_kind = homepage`.
- A House member without a form gets `terms[-1].url + '/contact'` with
  `contact_kind = zip_gate`. `members.csv` gains the `contact_kind`
  column (`form · zip_gate · homepage`); the import fills it and keeps a
  hand-set value.
- Member and act pages label the link by kind: "Contact form", "Contact
  form (asks for your ZIP)", "Office website". A link is never shown
  without a kind.

### 3. Weekly roster diff
- `.github/workflows/roster.yml` runs Mondays 09:00 UTC and on
  `workflow_dispatch`: fetches the roster and offices files from raw
  `main` with `If-None-Match` from a cached ETag, runs `import-members`
  (both sources) and `import-offices`, runs `loadRows` as a check, and
  opens or updates one PR `chore/roster-<date>` only when `git diff` is
  non-empty. The PR body lists added, changed and `stale:` members, the
  upstream commit SHA, and the bytes fetched.
- From 2027-01-03 to 2027-01-10 inclusive the schedule is daily; the
  workflow reads the window from a constant so the maintainer can move it.
- A 304 on both files ends the run with no PR; a non-200 other than 304
  fails the run (the digest's existing failure path reports it).

### 4. Departing members
- `members.csv` gains `not_returning` (`1` or empty, hand-set from
  election results) and `left_office` (ISO date, set by the import when a
  member drops out of the roster, never set before 2027-01-03).
- A `not_returning` member keeps every target slot and the member page
  shows one line under the hero: "Leaves office 2027-01-03. Votes on the
  NDAA and the funding bill until then."
- A row with `left_office` is excluded from routing targets, from the
  whip table and from the member build (its URL returns the existing
  unknown-id behaviour); its row stays so positions and receipts keep
  resolving. The import prints `left:` instead of `stale:` for these.
- Before 2027-01-03 a member missing from the roster is still printed
  under `stale:` with no column change; the maintainer decides.

## Data & contracts
- New `data/district_offices.csv` (columns in §1), provenance line in
  `data/README.md` naming the upstream file, licence CC0 and the fetch SHA.
- `members.csv` new columns: `contact_kind`, `not_returning`,
  `left_office`. `district_phone` keeps its meaning; empty means "derive".
- `schema.sql`: `district_offices` table; `members` gains the three
  columns. `seed.ts` deletes and reinserts offices with members.
- `worker/scripts/import-offices.ts`; `import-members.ts` gains
  `--senate-xml <path|url>` and the fallback rules in §2.
- Worker: `Repo.offices(bioguide_id)`; route and member builds read
  offices through `loadRows`, no new endpoint.
- Workflow needs only `GITHUB_TOKEN` with `pull-requests: write`.

## Spec delta
- MODIFIED `docs/specs/member-pages.md` §Behavior 1 (Roster import): add the Senate XML source, `contact_kind`, `not_returning` and `left_office` rules, and the `left:` print.
- MODIFIED `docs/specs/member-pages.md` §Behavior 3 (Member page): the contact block lists every district office with hours; departing line; contact link labelled by kind.
- MODIFIED `docs/specs/member-pages.md` §Behavior 7 (Unknown ids): a `left_office` member is not built.
- MODIFIED `docs/specs/member-pages.md` §Data & contracts: `data/district_offices.csv`, the three new `members.csv` columns, `import-offices.ts`.
- MODIFIED `docs/specs/action-router.md` §Behavior 7 (Targets per goal): a `left_office` row is never a target; district phone shown after the DC number; the switchboard fallback applies only when neither exists.
- MODIFIED `docs/specs/maintainer-tooling.md` §Behavior: new item "Weekly roster PR" describing the workflow, its window and its failure path.
- MODIFIED `docs/specs/deployment.md` §Behavior: the roster workflow listed beside the deploy workflow.

## Acceptance criteria
- [ ] After `import-offices`, `district_offices.csv` has ≥1,250 rows and every `bioguide_id` exists in `members.csv`; `loadRows` passes.
- [ ] Member pages for a sampled senator and representative list each office with a working `tel:` link; a member with no office shows only the DC number.
- [ ] Every one of 539 members has a non-empty contact link with a kind; 0 rows have an empty `contact_kind`.
- [ ] Running the workflow twice against the same upstream SHA opens no second PR; a fixture diff opens one PR whose body lists the changed members.
- [ ] A `not_returning` member still appears as a target and shows the departing line; a `left_office` member is absent from `/results`, the whip table and the sitemap, and `loadRows` still resolves positions pointing at them.
- [ ] Landing stays ≤100 KB transferred; member pages grow ≤2 KB gzip each; `/api/route` p95 unchanged (≤2 s); infra cost stays $0.
- [ ] `scripts/quiet-check.sh test` and `build` green; new tests cover the import rules in §1, §2 and §4.

## Rollout & metrics
- Order: §1, §2 in one PR; §3 after; §4 last (the flag columns can land
  earlier, empty).
- Metrics (digest, deterministic): count of members with ≥1 office, with
  each `contact_kind`, with `not_returning`; last roster PR date.
- Watch: the week of 2027-01-03, daily runs produce PRs; the 2027-01-04
  run sets `left_office` on departed members and the next deploy drops
  them from routing.

## State (updated 2026-11-05)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [~] 1. District offices as rows
  - [~] 2. Contact-form fallback
  - [~] 3. Weekly roster diff
  - [~] 4. Departing members
- Completed: none merged; all four sections built on `feat/roster-freshness`, awaiting the integration PR.
- Folded: spec delta applied in `docs/specs/member-pages.md`,
  `action-router.md` §7, `maintainer-tooling.md` §6, `deployment.md` §8
  (same branch; the final integration PR archives this file).
- Branch / open PRs: `feat/roster-freshness` merged into `integ/next-steps`; integration PR #32 (https://github.com/6nguyen/cut-the-ties/pull/32) to `main`, the only PR for this feature.
- Remaining: first scheduled run of `roster.yml`; hand-entered office rows for the 4 members with none (Gallagher, Wahab, Blair, Graham).
- Decisions since last update: see `## Changes` 2026-11-05.
- Known failures / blockers: Senate XML must be re-tested from a GitHub Actions runner (200 observed only from a residential IP; the workflow only warns when it fails). The member page is 4.7 KB gzip, over the 2.7 KB figure measured on 2026-11-04 before other features landed; budget is the landing page's, not this one's.
- Next action: integration PR; then `workflow_dispatch` the roster workflow once and merge its first data PR.

## Open questions
- Should the results card show the district number first for users whose
  local time is after 18:00 ET? Proposal: no, that is the
  call-follow-through PRD's office-hours rule; here the order is fixed.
- Should the weekly PR auto-merge when only phones changed? Proposal: no;
  the maintainer merges, the digest nags after 7 days open.

## Changes
- 2026-11-05: created from the roster research.
- 2026-11-05: open questions decided per their proposals: results-card order is fixed (DC number, then "District: <city> <phone>"); the roster PR never auto-merges.
- 2026-11-05: the 7-day nag is a comment the workflow posts on its own open PR, not a Worker-digest line (the Worker holds no GitHub token).
- 2026-11-05: the importer downloads from raw `main` of `unitedstates/congress-legislators` (replacing the github.io mirror) and the workflow records the upstream commit SHA in the PR body.
- 2026-11-05: office phones are normalised to `NNN-NNN-NNNN`; a phone that is not ten digits is cleared and printed, the row kept (none in the 2026-11-05 file). `checkOffices` enforces the same rule at seed time.
- 2026-11-05: `district_phone` is derived at load time (first office in file order) rather than written into `members.csv`, so a hand-filled cell always wins and the derived value never shows up as a diff.
- 2026-11-05: the results/act card's district line is the first office in the member's own state with a phone; a hand-filled `district_phone` stands in without a city. The Capitol switchboard (`SWITCHBOARD` in `route.ts`, 202-224-3121) is shown only when neither number exists; the spec's "falls back to the switchboard" was not in code before this.
- 2026-11-05: a hand-set contact link is kept only when its `contact_kind` is filled; a senator without a form and without a Senate XML source falls back to the term `url` as `homepage`. Schiff (S001150) lost the form link the roster dropped and now shows `homepage` per the rules; not hand-restored.
- 2026-11-05: `left_office` members are dropped in `assembleDelegation`, `targetsFor`, `whipTargets` and the web `members()` helper (page, sitemap, share card, whip tables) so every surface agrees; the row stays in `data/` for positions and receipts.
- 2026-11-05: the loader check is `npm run check-data -w worker` (`seed.ts --check`, no write); the workflow needs `contents: write` as well as `pull-requests: write`; a Senate XML fetch failure in the workflow is a warning, not a failure; one open `chore/roster-*` PR is reused.
- 2026-11-05: Rollout metrics (digest line "4 members without an office row") not built; not in Expected behavior.
