# Electoral record

## Purpose
Gives one House seat whose member carries `target_2028 = 1` a goal that is
a sourced record before the 2028 primary: the member's positions and votes
on every goal this site tracked, the primary date and filing deadline, and
one ask. It stops there: no candidate name, no pick, no advocacy word and no
disclosure line (primary-2028 §2 is blocked on counsel's answer), and the
goal ranks below every open federal and state goal.

## Behavior
1. **Goal shape.** Category `electoral`, priority 1, eligibility exactly
   `{"house": {"target_2028": 1, "state": "XX", "district": N}}`, status
   `upcoming` until the federal goal it follows closes. It is eligible only
   for that seat; a seat goal at priority 1 ranks below every open federal
   and state goal and leads a delegation's cards only once those are closed
   or ineligible (then `topTwo` pads it with the state goal as usual).
2. **Target.** Its one target is the seat's House member. The results card
   and the goal page's "Who to call" add an "On the record" block: for
   every goal this site tracked (active or closed, never upcoming or
   electoral) that named the member, one line with the goal title and
   decision date, the newest position chip with a "source · <date>" link
   (`source_url`, `source_date`) or "no sourced statement", and the
   recorded-vote line. An empty record says "No goal this site tracked has
   named this member yet." Every value is a `data/` row; no LLM.
3. **Dates.** The card's date lines read "Primary: <decision_date>" and
   "Filing deadline: <window_end> · source"; the goal page's hero and "Who
   decides and when" use the same labels instead of "Decision" and
   "window closes".
4. **Ask.** "Ask the office who is running against them in the 2028
   primary and say why you're asking." (a `call` action of the usual shape,
   `data/actions/primary-<st>-<d>-call.yaml`).
5. **Member pages** skip electoral goals in their whip tables; the member
   page itself is unchanged.
6. **Adding a target** is a data/ PR citing a recorded roll call
   (`data/README.md` §Adding a 2028 primary target): `members.csv` gets
   `rc243` and `target_2028 = 1`, `elections.csv` the seat's row, and
   `npm run make-primary-goal -w worker -- <STATE> <district>
   [roll-call-url]` writes the goal and action files from the templates in
   `worker/src/electoral.ts`; it refuses without the flag, the roll call or
   the elections row, and never overwrites a file.

## Data & contracts
- `data/elections.csv` (`state, district, primary_date, filing_deadline,
  source_url`) is not a table: the seed copies the seat's row into the
  electoral goal's `decision_date`, `window_end` and a `sources` entry
  titled "Primary date and filing deadline" (`applyElections`), and rejects
  a non-ISO date, a deadline after the primary, a non-https source, an
  unknown seat, a duplicate row, or an electoral goal with no row. The file
  is header-only until a target exists.
- House rule fields (`worker/src/ranking.ts` `HOUSE_FIELDS`) gained
  `target_2028` (0/1), `state` (text) and `district` (non-negative
  integer); `electoralSeat(eligibility)` reads the seat.
- `checkElectoral` (seed and tests): the seat's member exists with
  `target_2028 = 1` and a non-empty `rc243`, priority is 1, `our_picks` is
  empty, and no goal or action copy contains `vote for`, `vote against`,
  `support`, `oppose`, `elect`, `defeat` or `re-elect` (`FORBIDDEN`,
  word-bounded so "election" and "electoral" pass).
- `make-primary-goal.ts` (body in `worker/src/make-primary-goal.ts`) takes
  the next free goal and action `id` from `data/ids.md`, appends both
  `live` rows there, then writes the YAML with `id` as its first line
  (`goalYaml(id, …)`, `actionYaml(id, …)`); it refuses a slug the registry
  already lists as live.
- `Repo.trackedGoals()` returns every non-upcoming goal; `recordFor`
  builds `RecordLine {goal_slug, goal_title, goal_status, decision_date,
  position, source_url, source_date, vote}` newest decision first.
- `/api/route` and `/api/goals/:slug/targets` add `election: {primary_date,
  filing_deadline, source_url}` to an electoral goal card and
  `record: RecordLine[]` to its target (`TargetCard.record`,
  `GoalCard.election`).

## Invariants (regression checklist)
- [ ] An electoral goal never outranks an open federal or state goal and is
      never shown to another seat (`worker/test/electoral.test.ts`).
- [ ] Every record line, primary date and filing deadline shown is a
      `data/` row with a source; nothing is computed by an LLM.
- [ ] Neither the goal copy, its action, the rendered target nor any built
      `web/dist/goals/primary-*` page contains an advocacy word
      (`worker/test/electoral.test.ts`, `web/test/electoral.test.ts`).
- [ ] `data/elections.csv` keeps its header and every row passes the seed
      checks; a target without `target_2028 = 1` and `rc243` fails the seed.

## Performance budget
Unchanged from `action-router.md`: landing ≤100 KB, `/api/route` ≤2 s p95.
The record adds one indexed goals query per electoral route.
