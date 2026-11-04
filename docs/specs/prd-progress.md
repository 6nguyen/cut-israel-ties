# PRD progress tracking

## Purpose
`/implement-prd-section` and `/handoff` keep a `Sections:` list in each PRD's
`## State` block, so the skill picks the next section to build and works out
its line range itself, and section status moves from todo to done without
manual edits. It does not schedule across PRDs, start the next section after
a merge, or run as a hook, daemon or CI job.

## Behavior
1. **No RANGE given.** Reconcile (3) first, then pick the first match:
   the first `[~]` item (resume, reusing its branch); else the first `[ ]`
   item; else print "all sections done or blocked", list each `[!]` reason
   and stop, with no branch or commit. The skill prints
   `picked §<heading> (L<a>-<b>) — <todo|in progress>` and continues as if
   that RANGE had been passed. RANGE runs from the heading line to the line
   before the next heading of the same or higher level (or EOF).
2. **RANGE given.** The section containing RANGE becomes `[~]`. If RANGE
   matches no item, the skill warns once and proceeds without touching the
   list.
3. **Reconcile** (every run of either skill). One
   `gh pr list --state all --search "<n1> <n2> …" --json number,state` for
   the `[~]` items that carry `PR #n`. MERGED → `[x] · PR #n merged`;
   CLOSED without merge → `[ ] · PR #n closed <date>`; OPEN → unchanged.
   Without `gh`, an item whose branch is in `git branch --merged main`
   becomes `[x]`, and the skill says once that PR state was skipped. Edits
   go into the run's first commit; no commit if nothing changed.
4. **Start.** The first commit sets the item to `[~] · <branch>`.
5. **Finish.** After `gh pr create`, the skill appends `· PR #n` to the item
   and sets State `Next action` to "merge PR #n, then
   `/implement-prd-section <prd>` (next: §<next todo heading>)".
6. **Backfill** (State exists, no `Sections:`). One item per `###` heading
   under `## Expected behavior` that names a phase or step; else one per
   `##` heading between `## Expected behavior` and `## Data & contracts`.
   Items are in heading order. Items named in State "Completed" are `[x]`.
   The owner confirms or reorders the list once, and it lands in the first
   commit.
7. **Bootstrap** (no `## State`, no RANGE).
   - Status `SHIPPED` → stop with "nothing to pick". `DRAFT` → stop with
     "not approved". Neither creates a branch or a commit.
   - Otherwise items come from the Backfill rule (6), all `[ ]`.
   - One Bash call gathers evidence: branches named after the PRD,
     `gh pr list --state all` searched by PRD basename, and
     `git log --oneline main -- PRD`. A branch or PR whose head is
     `<type>/<prd-basename>-<section-slug>` marks its item: `[x]` if
     merged, `[~]` if open or branch-only. Anything else for the PRD is
     shown as "unmapped" and never placed into an item.
   - The owner confirms once, and State lands in the first commit. The
     skill never assumes nothing is built and never reads code or diffs to
     decide.
   - With RANGE given, a State block is added from the template instead.
8. **Last section done.** When no `[ ]` or `[~]` item is left, State
   `Remaining` is "none". This triggers the fold and archive steps of the
   lifecycle (`prd-lifecycle.md` §Behavior 5–6).
9. **Edge cases.** An item that prefix-matches no heading → stop, print
   unmatched items next to the current headings, ask; never guess. Two
   `[~]` items → resume the first and warn in the pick line. `[!]` without
   a reason → treated as `[ ]` with a warning. A section blocked mid-build
   → `[!] · blocked: <reason>`, stop with the report; later runs skip it.

## Data & contracts
`Sections:` is the first bullet of `## State`:
```
- Sections:
  - [x] Phase 1 — rtk (Bash output) · PR #9 merged
  - [~] Phase 2 — minimal-code ladder · feat/token-tooling-phase-2 · PR #12
  - [ ] Phase 3 — re-evaluate
  - [!] Phase 4 — example · blocked: waiting on E1 verdict
```
- Markers: `[ ]` todo · `[~]` in progress · `[x]` done (merged) · `[!]`
  blocked (reason required).
- Item text is the heading text without `#`s and matches a heading by
  prefix. Annotations follow ` · ` and are ignored when matching.
- Line numbers are never stored.
- `[x]` requires a merge. One item per `###`; no nesting.
- New branches are `feat/<prd-basename>-<section-slug>` (≤40 chars), which
  is what Bootstrap's evidence mapping relies on.
- Owner surfaces: `claude-home/skills/implement-prd-section` §0a/§3,
  `claude-home/skills/handoff` step 2, the State template in
  `docs/prd/README.md`.

## Invariants (regression checklist)
- [ ] A run without RANGE on a PRD with a Sections list picks the first
      `[~]`, else the first `[ ]`, and prints the pick line with the correct
      range.
- [ ] A merged `[~] · PR #n` flips to `[x] · PR #n merged` in the next
      run's first commit; a closed, unmerged PR flips back to `[ ]`.
- [ ] Without `gh`, reconcile uses `git branch --merged main` and says so.
- [ ] All items `[x]`/`[!]` → stop with the blocked reasons, no branch.
- [ ] A renamed heading stops the run and lists both sides.
- [ ] A State-less approved PRD with a merged
      `feat/<basename>-<section-slug>` PR proposes that item `[x]`, asks
      once, and writes State in the first commit.
- [ ] A State-less `SHIPPED` or `DRAFT` PRD stops with one line, no branch
      or commit.
- [ ] Preconditions plus pick plus reconcile take ≤2 Bash calls and read no
      diffs, logs or PR bodies.

## Performance budget
Pick and reconcile cost one `grep` of the headings plus the State block the
skill already loads (≤2 Bash calls); Bootstrap adds one Bash call.
