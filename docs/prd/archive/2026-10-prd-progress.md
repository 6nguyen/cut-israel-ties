# PRD progress tracking (auto-pick next section) — PRD
Status: SHIPPED 2026-10-01 (PR #18) · Owner: George Nguyen · Last updated: 2026-10-01

## Problem
`/implement-prd-section` needs a line range on every call: with no RANGE it
asks for one and stops (`claude-home/skills/implement-prd-section/SKILL.md:12`).
The owner has to open the PRD, work out which section comes next, and copy
its line numbers. Those numbers change whenever the PRD is edited. The skill
can't work out the next section itself because `## State` is prose (see
`docs/prd/token-tooling.md` §State): "Completed" and "Remaining" are
sentences, not a list keyed to headings. The State block is also only
written by the session that builds a section. Nothing marks a section done
once its PR merges, so State lags until someone edits it by hand.

## Goals / Non-goals
- Goals:
  1. `/implement-prd-section <prd>` with no RANGE picks the next section
     deterministically from State and resolves its line range itself.
  2. Every section transition (todo → in progress → PR open → done) is
     written to State by the skills, without manual edits.
  3. No extra context cost: the pick costs one `grep` of the headings plus
     the State block the skill already loads. No diffs, logs or PR bodies
     are read.
- Non-goals:
  - No hook, daemon, cron or CI job. The loop runs whenever a skill runs
    (reconcile-on-run), because that is when State is read.
  - No auto-starting the next section after a merge. The owner still calls
    the skill.
  - No scheduling across PRDs ("which PRD next").
  - The explicit-RANGE path behaves as it does today.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Checkbox task lists with progress | GitHub task lists, Linear sub-issues | Adopt | Readable as plain markdown and trivially parseable by grep |
| Reconcile desired vs observed state on each run | Kubernetes controllers, `terraform plan` | Adopt | Gives an update loop without a background process; self-heals missed updates |
| Keyed by stable name, not position | Make targets, Taskfile tasks | Adopt | Line numbers drift; heading text is stable enough, and a rename is detectable |
| In-session todo list | Claude Code TodoWrite | Reject as store | Dies with the session; the repo (State in git) is the memory |

## Users
- **Owner:** types `/implement-prd-section docs/prd/x.md` and gets the
  right next section, or a one-line reason why there isn't one.
- **Implementing agent:** gets a resolved RANGE and a State block it can
  update mechanically.
- **`/handoff`:** keeps the list current when a session ends mid-section.

## Expected behavior
1. **No RANGE given.** One Bash call: `grep -n '^##' PRD` plus the State
   block. Reconcile first (step 3), then pick the first match:
   1. the first `[~]` item: resume it, reusing its branch under existing
      rule 0b.2;
   2. the first `[ ]` item;
   3. none: print "all sections done or blocked", list each `[!]` reason,
      and stop.

   Print one line: `picked §<heading> (L<a>-<b>) — <todo|in progress>`, then
   continue as if that RANGE had been passed.
2. **RANGE given.** The skill behaves as it does today and also marks the
   section containing RANGE as `[~]`. If RANGE matches no listed section, it
   warns once and proceeds.
3. **Reconcile** (every run of `/implement-prd-section` and `/handoff`):
   - Collect every `[~]` item that has a `PR #n`. One call:
     `gh pr list --state all --search "<n1> <n2> …" --json number,state`.
   - MERGED → `[x] · PR #n merged`. CLOSED without merge → `[ ]` with the
     note `· PR #n closed <date>`. OPEN → unchanged.
   - Fallback without `gh` (offline or not authenticated): an item whose
     branch appears in `git branch --merged main` → `[x]`. Say once that
     PR state was skipped.
   - Reconcile edits go into the run's first commit. No commit if nothing
     changed.
4. **Start.** The first commit sets the item to `[~] · <branch>`.
5. **Finish** (skill step 3, after `gh pr create`): append `· PR #n` to the
   item. Set State `Next action` to "merge PR #n, then
   `/implement-prd-section <prd>` (next: §<next todo heading>)". The owner
   merges; the next run's reconcile turns the item `[x]`. Together, Finish
   and Reconcile form the update loop.
6. **Backfill.** A PRD with a `## State` block but no `Sections:` list gets
   one built on the next run:
   - one item per build-unit heading: the `###` headings under
     `## Expected behavior` that name phases or steps, or else the `##`
     headings between `## Expected behavior` and `## Data & contracts`;
   - items named in State "Completed" are marked `[x]`;
   - the list is shown to the owner, who confirms it once; it lands in the
     first commit.
7. **Last section done.** When reconcile leaves no `[ ]` or `[~]` items,
   State `Remaining` is set to "none". spec-lifecycle uses this as the
   "final section shipped" trigger (`docs/prd/spec-lifecycle.md` rule 5),
   if that PRD ships.
8. **Bootstrap** (v1.1). A PRD with no `## State` block, run without
   RANGE, gets State built instead of a stop:
   - Status `SHIPPED` → stop with "nothing to pick" (suggest archiving);
     `DRAFT` → stop with "not approved". No branch, no commit.
   - Items come from the Backfill heading rule (6), all `[ ]`.
   - One Bash call gathers evidence: branches named after the PRD,
     `gh pr list --state all` searched by PRD basename, and
     `git log --oneline main -- PRD`. A branch/PR whose head is
     `<type>/<prd-basename>-<section-slug>` marks its item: merged `[x]`,
     open `[~]`. Anything else for the PRD is shown as "unmapped".
   - The owner confirms or edits the list once; State lands in the first
     commit. The skill never assumes nothing is built and never reads code
     or diffs to decide.

### Edge cases
- **No item matches a heading by prefix** (heading renamed or removed):
  stop, print the current headings next to the unmatched items, and ask.
  Never guess.
- **Two `[~]` items:** resume the first and warn in the pick line.
- **PRD without `## State`:** with RANGE, add State as today; without
  RANGE, bootstrap (rule 8).
- **`[!]` item without a reason:** treat it as `[ ]` and warn.
- **Section blocked mid-build:** the agent sets `[!] · blocked: <reason>`
  and stops with the usual report. The next run skips it.

## Data & contracts
A `Sections:` list is the first bullet of `## State`:
```
- Sections:
  - [x] Phase 1 — rtk (Bash output) · PR #9 merged
  - [~] Phase 2 — minimal-code ladder · feat/token-tooling-phase-2 · PR #12
  - [ ] Phase 3 — re-evaluate
  - [!] Phase 4 — example · blocked: waiting on E1 verdict
```
- Markers: `[ ]` todo · `[~]` in progress · `[x]` done (merged) · `[!]`
  blocked (a reason is required).
- Item text is the heading text, without the `#`s. It matches a heading by
  prefix, so heading suffixes such as "(starts only after …)" are tolerated.
- Annotations follow ` · ` and are ignored when matching.
- RANGE is resolved at run time: from the heading's line to the line before
  the next heading of the same or higher level. Line numbers are never
  stored.
- Order in the list is build order. The owner may reorder items.
- The list counts toward State's ≤30-line cap; one line per item.

Surfaces changed in the build:
- `claude-home/skills/implement-prd-section/SKILL.md`: arguments (RANGE
  optional), a new §0a "Pick & reconcile", §3 Finish, and the
  `argument-hint` (`[startLine-endLine]`).
- `claude-home/skills/handoff/SKILL.md`: step 2 reconciles and keeps
  `Sections:` current.
- `docs/prd/README.md`: the template's State block gains `Sections:`.

## Acceptance criteria
- [ ] `/implement-prd-section docs/prd/token-tooling.md` (no RANGE)
      backfills Sections with Phase 1 `[x]`. After confirmation it picks the
      next unfinished phase and prints the pick line with the correct line
      range.
- [ ] With an item `[~] · PR #n` whose PR is merged, the next run (either
      skill) flips it to `[x] · PR #n merged` in its first commit.
- [ ] A closed, unmerged PR flips its item back to `[ ]` with a closed note.
- [ ] With `gh` unavailable, reconcile falls back to
      `git branch --merged main` and says so in one line.
- [ ] Explicit RANGE behaves as today, apart from marking the matching item
      `[~]`.
- [ ] A PRD whose items are all `[x]`/`[!]` stops with the blocked reasons.
      It does not create a branch.
- [ ] A renamed heading stops the run and lists both sides. Nothing is
      guessed.
- [ ] Preconditions plus pick plus reconcile take ≤2 Bash calls and read no
      diffs, logs or PR bodies.
- [ ] The finish step leaves `Next action` naming the PR to merge and the
      next section.
- [ ] The README template and `/handoff` both document and maintain
      `Sections:`.
- [ ] A State-less approved PRD with a merged
      `feat/<basename>-<section-slug>` PR, run without RANGE, proposes that
      item `[x]` and the rest `[ ]`, asks once, then writes State in the
      first commit.
- [ ] A State-less PRD with Status `SHIPPED` or `DRAFT` stops with one line
      and creates no branch or commit.

## Rollout & metrics
- Ships as edits to two skills and the README template. No migration step:
  existing PRDs (token-tooling, spec-lifecycle, adopt-existing-repo) are
  backfilled on their next run.
- Metric: across the next 10 `/implement-prd-section` runs on PRDs that
  have a Sections list, the owner passes RANGE 0 times and corrects a pick
  0 times.

## Open questions
1. Should `[x]` require a merge, or is "PR open and all section ACs green"
   enough? Proposal: require the merge. An unmerged PR can still change in
   review, and reconcile picks up the merge for free.
2. When a phase has sub-steps, should there be one item per `###`, or
   nested items? Proposal: `###` only. Nesting complicates the matching
   rules and the 30-line cap; split a big phase into more `###` headings
   instead.
3. Who orders the list during backfill? Proposal: heading order, then the
   owner reorders at the one-time confirmation.

## Changes
- 2026-10-01 — created; APPROVED (auto), no blocking questions. Proposals 1–3 adopted as decisions.
- 2026-10-01 — built: implement-prd-section §0a Pick & reconcile + §3 Finish step 4, handoff step 2 reconcile, README template `Sections:`. ACs are verified on the first real runs (token-tooling backfill).
- 2026-10-01 — v1.1: PRDs without `## State` are bootstrapped (rule 8) instead of stopping for RANGE. Inferred from branch/PR names, confirmed once by the owner; no retroactive sweep of old PRDs, no code reading. Edge case "PRD without State" updated, 2 ACs added.
- 2026-10-01 — archived under the spec lifecycle; current behavior folded into
  `docs/specs/prd-progress.md`.
