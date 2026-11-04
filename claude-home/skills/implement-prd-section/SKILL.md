---
name: implement-prd-section
description: Build ONE approved PRD section into ONE PR with minimal context — loads only the PRD line range, its State block and the area map, applies the token-workflow caps, ends with State updated and a ≤15-line report. Use for any PRD-scoped implementation step.
argument-hint: <docs/prd/feature.md> [startLine-endLine] [type/branch-name] [model] [medium|high]
---

# implement-prd-section

Arguments: `$ARGUMENTS` → `PRD [RANGE] [BRANCH] [MODEL] [EFFORT]`.
If PRD is missing, ask for it and stop. An argument matching `^\d+-\d+$` is
RANGE; one containing `/` is BRANCH. RANGE omitted → §0a picks it (no
`## State` block → §0a.0 bootstraps one first).

**State edits.** `S=~/.claude/skills/implement-prd-section/scripts/state.sh`.
Read State with `$S get PRD`. Write it only by putting the whole new block
(starting `## State`) in a scratch file and running `$S set PRD <file>`;
it changes nothing outside the block, and inserts one if absent. Never edit
the State block by hand or with an ad-hoc text replace. A non-zero exit
leaves the PRD untouched: read the message, fix the input, never work
around it.

**PRD lint.** Before every commit that touches a PRD, run
`~/.claude/skills/implement-prd-section/scripts/features.sh` when
`docs/FEATURES.md` exists (it regenerates the file; stage it), then
`~/.claude/skills/implement-prd-section/scripts/prd-lint.sh PRD`. A
violation stops the commit: fix the PRD (usually restore the lost text
from the previous commit, `git show HEAD:PRD`), never commit around it.

**Doc lint.** Before every commit, after staging, run
`~/.claude/skills/implement-prd-section/scripts/doc-lint.sh --only $(git diff --cached --name-only)`.
A violation stops the commit: put the doc where `docs/README.md` says, or
allowlist it in `docs/.doc-allow` with a `# reason`.

## 0. Preconditions (one Bash call)
- `git status --short` must be clean.
- `grep -n "^##" PRD` (all heading levels) to confirm RANGE lands inside one
  section, resolve picked sections, and find `## State`. If the PRD has no
  State block and RANGE was given, add one from the template in
  `docs/prd/README.md` as the first commit.
- Same call: `git branch --show-current`, `$S get PRD`, and
  `git branch --merged main` (local, no network).

## 0a. Pick & reconcile (≤1 more Bash call; never read diffs, logs, PR bodies)
`Sections:` is the first bullet of State: one line per build unit,
`- [ ] <heading text> · <annotations>`. Markers: `[ ]` todo · `[~]` in
progress · `[x]` done (merged) · `[!]` blocked (reason required). Item text
matches a heading by prefix; text after ` · ` is ignored for matching. Line
numbers are never stored.

0. **Bootstrap** (no `## State` block, RANGE omitted). Never assume nothing
   is built and never read code or diffs to find out; infer, then confirm.
   - Status gate (line 2 of the PRD): `SHIPPED` → print "shipped before
     State existed; nothing to pick (archive it if the repo has
     `docs/prd/archive/`)" and stop. `DRAFT` → print "not approved" and
     stop. Neither creates a branch or a commit.
   - Items: build the list with the Backfill heading rule (1), all `[ ]`.
   - Evidence, one Bash call: `git branch -a --list "*<prd-basename>*"`,
     `gh pr list --state all --search "<prd-basename> in:title,head"
     --json number,state,headRefName,title`, and
     `git log --oneline main -- PRD`. A branch or PR maps to an item only
     when its head is `<type>/<prd-basename>-<section-slug>` (rule 0b.3)
     and the slug matches that item's heading. MERGED → `[x] · PR #n
     merged`; OPEN → `[~] · <branch> · PR #n`; a local branch with no PR →
     `[~] · <branch>`. Without `gh`, a branch in `git branch --merged main`
     → `[x]`, said once. Anything for this PRD that maps to no item is
     listed as "unmapped".
   - Show the proposed list plus unmapped evidence; the owner confirms or
     edits markers once. Never place an unmapped PR into an item.
   - Write State from the `docs/prd/README.md` template with that list
     (`$S set`) as the first commit, then continue at rule 2.
1. **Backfill** (State exists, no `Sections:`): one item per `###` heading
   under `## Expected behavior` that names a phase or step; else one per `##`
   heading between `## Expected behavior` and `## Data & contracts`. Heading
   order. Items named in State "Completed" → `[x]`. Show the list, ask the
   owner to confirm or reorder once, then continue; it lands in the first
   commit.
2. **Match**: every item must prefix-match a current heading. Any unmatched
   → stop, print unmatched items next to the current headings, ask. Never
   guess.
3. **Reconcile**: collect `[~]` items carrying `PR #n`; one call
   `gh pr list --state all --search "<n1> <n2> …" --json number,state`.
   MERGED → `[x] · PR #n merged`. CLOSED → `[ ] · PR #n closed <date>`.
   OPEN → unchanged. `gh` fails (offline/unauthenticated) → an item whose
   branch is in `git branch --merged main` → `[x]`; say once "PR state
   skipped, used git branch --merged". No `[ ]`/`[~]` left → State
   `Remaining: none`. Edits go into the run's first commit; none if nothing
   changed.
4. **Pick** (RANGE omitted), first match: first `[~]` (resume; rule 0b.2
   reuses its branch; if a second `[~]` exists, append "warn: 2 in progress"
   to the pick line) → first `[ ]` → none: print "all sections done or
   blocked", list each `[!]` reason, stop (no branch, no commit). `[!]`
   without a reason is treated as `[ ]` with a warning.
   RANGE = heading line to the line before the next heading of the same or
   higher level (or EOF). Print one line and continue as if RANGE was passed:
   `picked §<heading> (L<a>-<b>) — <todo|in progress>`
5. **RANGE given**: the item whose section contains RANGE is the current
   item. No match → warn once and proceed without touching `Sections:`.
6. **Start**: the first commit sets the current item to `[~] · <BRANCH>`
   (keep an existing `· PR #n`).

## 0b. Resolve BRANCH (deterministic; never read diffs/PRs/logs to decide)
First match wins:
1. BRANCH given → use it.
2. The current `Sections:` item is `[~] · <branch>` (or, without a list,
   State names a branch and says this section is in progress), the branch
   exists and is not merged into `main` → reuse it. This is the
   "feedback on an open PR's own feature stays on it" case.
3. Otherwise → new branch `feat/<prd-basename>-<section-slug>` (section
   heading at RANGE, kebab-case, ≤40 chars total). Never reuse a branch for a
   different section, even if it is the current one.
State the choice in one line ("reusing X — State: in progress" / "new X")
and continue; ask only if rule 2 matches a branch whose State is ambiguous.

Cut/sync: new → `git switch -q main && git pull -q && git switch -c BRANCH`;
existing → `git fetch -q && git switch -q BRANCH && git merge -q origin/main`.
Record BRANCH in State's
`Branch / open PRs` line in the first commit.

## 1. Load exactly this, nothing more (one Bash call, several `sed -n`)
- `sed -n RANGE PRD` — the contract being built.
- The PRD's State block (`$S get`), `## Acceptance criteria` and
  `## Spec delta`.
- The spec sections the delta names, and only those (`grep -n "^#"` each
  named `docs/specs/<file>.md`, then `sed -n` the § ranges; an ADDED whole
  file loads nothing). No `docs/specs/` → skip, say "no docs/specs, spec
  load + fold skipped" once.
- The area map for the code being touched (`<area>/CLAUDE.md`, listed in
  the project CLAUDE.md §Area maps; skip if none). Claude Code also
  attaches it when you read files under it, so don't re-read it later.
- Do NOT read: `docs/research/`, other PRDs, `docs/prd/archive/`,
  memory files, screenshots you did not take.

## 2. Build under the caps (global CLAUDE.md spawn recipe applies verbatim)
- ≤100 tool calls, ≤200k context. Grep first, then read each file once by
  line range; batch reads.
- Stay inside the section's scope. Touching a layer the section doesn't name
  (e.g. backend during a client-only section) needs the owner's OK first.
- Build/test only through `scripts/quiet-check.sh <target>`.
- Follow the project CLAUDE.md Hard gotchas and Quality bar. Behavior change
  ⇒ tests + PRD updated in the same PR (Changes log entry).
- Screenshots: take them, `SendUserFile` them, report paths. Never `Read`
  an image you produced.
- UI automation (simulator/browser taps and navigation): retry a failing step
  at most twice, then note it as a follow-up in State and move on.
- Approaching a cap: commit, push, update State, stop with the report.

## 3. Finish
1. `scripts/quiet-check.sh` for every target the diff touches. Quote the
   RESULT lines. Measure the PRD's performance budget and quote the number.
2. Update the PRD State block (`$S set`) and the `## Changes` log.
   **Fold:** apply this section's `## Spec delta` entries to `docs/specs/`
   (ADDED → insert/create, MODIFIED → replace old with new, REMOVED →
   delete; update the `docs/specs/README.md` index for new/removed files)
   and add `Folded: §<section>` to State.
   **Archive** if no other `[ ]`/`[~]` item remains (Remaining: none): Status
   `SHIPPED <today> (PR #n)` (n = this PR; set after `gh pr create` in step
   4), `git mv` to `docs/prd/archive/<YYYY-MM>-<basename>.md`, remove its row
   from the `docs/prd/README.md` index, and delete its pointer lines from the
   root `CLAUDE.md` (only lines containing the marker; no marker → file
   untouched):
   `m='<!-- prd-pointer: docs/prd/<basename>.md -->'; grep -qF "$m" CLAUDE.md && { grep -vF "$m" CLAUDE.md > CLAUDE.md.tmp; mv CLAUDE.md.tmp CLAUDE.md; }`
   Archived PRDs are never edited again.
3. Commit (imperative summary, what + why + QA evidence), push over HTTPS
   (`git -c credential.helper='!gh auth git-credential' push -u origin BRANCH`),
   `gh pr create` with the PR body ending in the attribution line.
4. Append `· PR #n` to the current `Sections:` item (archived PRD: write
   the PR number into its Status line instead and skip the rest) and set State
   `Next action: merge PR #n, then /implement-prd-section <PRD> (next:
   §<first [ ] heading, or "none">)`. Commit + push. Section blocked
   mid-build instead → set `[!] · blocked: <reason>` and stop with the report.
   The next run's reconcile flips the merged item to `[x]`.
5. Report ≤15 lines: PR URL · files:lines touched · how to run · what is left.

Model/effort when the caller does not specify: cheaper model + medium for
copy, fixtures, tours, wording, mechanical sweeps; strongest model + high for
sync, concurrency, decoding, new screens, engine changes. (Evidence
2026-09-28: a Sonnet-medium build of a decode-sensitive section skipped the
perf gate and shipped a crash; don't route that class down.)
