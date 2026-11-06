# Goal and action id registry

Every `goals/<slug>.yaml` and `actions/<slug>.yaml` carries an `id` that
`receipts`, `reports`, `generations`, `screenings` and `positions` in D1
reference. An id is assigned once, never changed and never reused: when a
file is removed, flip its row to `retired` (keep the id); the next id for a
kind is the highest ever used, live or retired, plus one. `npm run
make-primary-goal -w worker` assigns and appends ids here; a hand-written
goal or action takes the next id and adds its row in the same PR. The
loader (`worker/src/load.ts`) refuses a YAML id that is missing, not an
integer, duplicated, retired, unregistered or registered to another slug,
and `worker/test/ids.test.ts` fails when this table and `data/` disagree
(stable-data-ids §1-3).

| kind | id | slug | status | since |
|---|---|---|---|---|
| goal | 1 | house-caucus | live | 2026-11-05 |
| goal | 2 | ndaa-1217 | live | 2026-11-05 |
| goal | 3 | ndaa-report-vote | live | 2026-11-05 |
| goal | 4 | senate-leader | live | 2026-11-05 |
| goal | 5 | state-bonds | live | 2026-11-05 |
| action | 1 | house-caucus-call | live | 2026-11-05 |
| action | 2 | ndaa-1217-call | live | 2026-11-05 |
| action | 3 | ndaa-report-vote-call | live | 2026-11-05 |
| action | 4 | senate-leader-call | live | 2026-11-05 |
| action | 5 | state-bonds-call | live | 2026-11-05 |
