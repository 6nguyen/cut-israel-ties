# Split research out of docs/prd — PRD
Status: SHIPPED 2026-10-02 (PR #52) · Owner: George Nguyen · Last updated: 2026-10-02

## Problem
`docs/prd/` holds two kinds of file. PRDs plan work: what gets built, in
what order, and how far along it is. Research files (`research-*.md`)
inform how that work is done: model and tool comparisons, cost arithmetic,
design proposals. The template treats the second kind as an exception to
the first. prd-lint, `detect.sh` and `/implement-prd-section` each carry a
`research-*` skip rule, and research that doesn't use the prefix has no
home at all. On video-index-search, the research is split across
`docs/analysis.md`, `docs/sources.md`, `docs/design-p0.md` and
`docs/prd/research-labeling-model.md`, and nothing says how a newer study
relates to an older one. Moving files also breaks relative links. When
`docs/prd.md` became `docs/prd/footage-index.md` in the "Add
llm-repo-template boilerplate" commit, its links to `analysis.md` and
`assets/pipeline.png` broke, and they are still broken on main.

## Goals / Non-goals
- Goals:
  - `docs/prd/` holds only PRDs. Research lives in `docs/research/`.
  - Research files say when they were written, which PRDs they inform, and
    what they supersede or are superseded by.
  - A PRD links the research it relies on and states every decision the
    build needs, so a build never has to read research.
  - Adopt, migrate and repo-setup produce this layout, and moving a file
    keeps its relative links working.
  - video-index-search moves to the layout before hypertrophy-goals adopts.
- Non-goals:
  - A lint for research files. Research stays free-form apart from its
    header, because forcing structure on it was the problem.
  - Moving `docs/decisions.md` or other repo-wide logs. They aren't
    research, and the repo map already points at them.
  - Rewriting links outside markdown files.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Separate RFC or design-doc folder next to the spec | Rust RFCs, Kubernetes KEPs, Python PEPs | adapt | They keep proposals apart from the reference docs. We keep the proposal (PRD) apart from the evidence behind it instead. |
| Superseded-by header on old documents | IETF RFCs ("Obsoletes" / "Obsoleted by"), PEPs | adopt | The old reasoning stays readable, and no reader mistakes it for current. |
| Architecture decision records, one file per decision | adr-tools, MADR | reject | The PRD's Changes log and Open questions already record decisions. A third place would drift. |

## Users
- **The owner** reads research when deciding open questions and writing
  PRD contracts.
- **Agents** write research during planning sessions and never read it
  during a build.
- **Other readers** of a target repo (for video-index-search, the tool's
  main user) read research to understand why the tool works as it does.

## Expected behavior

### 1. Layout and lint
1. `docs/research/` holds one markdown file per question, named
   `<topic>.md` (no `research-` prefix). A `docs/research/README.md`
   explains the folder and lists the files in an index. Supporting images
   used only by research go in `docs/research/assets/`.
2. Every research file has this header on lines 1 to 3:
   ```
   # <Title>
   Researched: YYYY-MM-DD · Informs: <prd links or "none yet">
   ```
   One more optional header line follows when it applies, either
   `Supersedes: <file> (<what>)` or `Superseded by: <file> on YYYY-MM-DD
   (<what>)`. A file that revisits an earlier one has a `## What changed
   from <file>` section. A design proposal whose decisions have been made
   gets a line `Decided in <prd> on YYYY-MM-DD.` and is not edited after.
3. A new direction of research is a new file. An old file is never
   rewritten to match newer findings. It only gains the `Superseded by`
   line.
4. The PRD template's `## Research` section links the research files it
   relies on, and keeps the adopt / adapt / reject table as the summary.
5. prd-lint drops its `research-*.md` exception. A `docs/prd/research-*.md`
   file is reported as "research belongs in docs/research/" instead of
   failing the PRD shape checks.
6. `/implement-prd-section` lists `docs/research/` under "Do NOT read". The
   global `CLAUDE.md` says long-form research goes to `docs/research/`.
7. `adopt` copies `docs/research/README.md` with its index rows removed,
   and skips it when the file exists. The `CLAUDE.md` skeleton's repo map
   names `docs/research/`.

### 2. Migration and link rewriting
1. `detect.sh` skips `docs/research/`. A `docs/prd/research-*.md` file is
   no longer skipped. The inventory gives it the class `research`, with the
   destination `docs/research/<topic>.md`. The topic is the basename with
   the `research-` prefix and a leading `YYYY-MM-` date removed, because
   the header carries the date (`research-2026-09-cardio.md` →
   `cardio.md`). A name that ends up empty (`research-2026-09.md`) gets the
   destination `docs/research/?.md`, which the owner must replace before
   `move` runs.
2. The owner may change any `unknown` row in `migration-plan.md` to class
   `research` with a `docs/research/` destination. That is the only way a
   file outside `docs/prd/` becomes research.
3. The move phase moves `research` rows with `git mv`, the same way it
   moves PRDs, and adds each moved file to the `docs/research/README.md`
   index. It does not add a header. The owner or a later session adds it.
4. Every move (PRD or research) rewrites relative markdown links in two
   places: inside the moved file, so its links still resolve from the new
   folder, and in every other tracked `*.md` file that links to the moved
   file. External URLs, anchors-only links and links inside fenced code are
   untouched. A link that did not resolve before the move is reported, not
   changed.
5. The repo-setup Migrate item names `docs/research/` as the destination
   for research, and its acceptance line requires no `docs/prd/research-*`
   files.

### 3. video-index-search
1. `docs/analysis.md` and `docs/sources.md` merge into
   `docs/research/build-vs-buy.md`. The sources become its `## Sources`.
2. `docs/prd/research-labeling-model.md` moves to
   `docs/research/labeling-model.md` and gains `Supersedes:
   build-vs-buy.md (labeling model pricing)`. `build-vs-buy.md` gains the
   matching `Superseded by` line.
3. `docs/design-p0.md` moves to `docs/research/design-p0.md`. Its status
   stays "awaiting owner review" until D1 to D12 are decided.
4. `docs/assets/pipeline.png` stays where it is, because the PRD uses it.
   The two broken links in `footage-index.md` are fixed by the link check
   from §2.
5. `docs/decisions.md` stays in `docs/`. `CLAUDE.md` and `README.md` point
   at `docs/research/`.

## Data & contracts
- Research header: line 1 `# <Title>`, line 2
  `Researched: YYYY-MM-DD · Informs: <links | none yet>`, optional line 3
  `Supersedes: …` or `Superseded by: …`.
- `migration-plan.md`: a new class value `research`. Its destination must
  be under `docs/research/`.
- prd-lint: the default file set is every `docs/prd/*.md` except
  `README.md` and `migration-plan.md`. A `research-*.md` file there produces
  one violation with the message above.
- Link rewrite: `scripts/relink.sh <old> <new>` in migrate-prds. It is
  called once per move, prints each rewritten `file:line`, and exits 1 when
  it reports a link that was already broken.

## Spec delta
- ADDED `docs/specs/research.md`. The whole file covers the folder, the
  header, supersede rules and the build-time no-read rule.
- MODIFIED `docs/specs/prd-lifecycle.md` §Data & contracts (PRD lint): the
  default set excludes `README.md` and `migration-plan.md` only →
  `docs/prd/research-*.md` is a violation pointing at `docs/research/`.
- MODIFIED `docs/specs/prd-migration.md` §Behavior 1: `docs/prd/research-*.md`
  is no longer skipped, and the class `research` is added; §Behavior (move):
  research rows move to `docs/research/` and every move runs `relink.sh`.
- MODIFIED `docs/specs/adopt.md` §Behavior (table): `docs/research/README.md`
  is copied with index rows removed, and the CLAUDE.md skeleton names
  `docs/research/`.

## Acceptance criteria
- [x] A fresh `adopt` on an empty repo creates `docs/research/README.md`,
      and its `CLAUDE.md` repo map names `docs/research/`.
- [x] prd-lint reports `docs/prd/research-x.md` with "research belongs in
      docs/research/" and nothing else for that file.
- [x] The inventory classes a `docs/prd/research-*.md` fixture as
      `research` with a `docs/research/` destination, strips a leading
      `YYYY-MM-` from the topic, gives `research-2026-09.md` the `?`
      destination, and ignores files already in `docs/research/`.
- [x] `move` refuses to run while any destination is `docs/research/?.md`.
- [x] After a move, every relative link in and to the moved file resolves.
      A fixture link that was broken before the move is reported with its
      `file:line` and left unchanged.
- [x] `git log --follow` on a moved research file shows its history from
      before the move.
- [x] video-index-search has no `research-*` file in `docs/prd/`, every
      relative link in `docs/` resolves, and prd-lint reports 0 violations.
- [x] Budgets: inventory of hypertrophy-goals stays under 2 s without `gh`
      (`docs/specs/prd-migration.md`), and `relink.sh` on that repo takes
      under 1 s per move.
- [x] adopt, migrate-prds and prd-guard suites pass, and each new fixture
      fails before its fix.

## Rollout & metrics
This PRD lands before §3 of `rollout-existing-repos.md`, so hypertrophy-goals
gets the layout at adoption instead of being migrated twice. That repo is
the real test of §2: 8 dated `research-2026-09-*.md` files (one with no
topic), a legal memo in `docs/plans/`, and market and design-round studies
in `docs/design/`. Rollout §3 lists which of those the owner reclasses. Build order is
§1, §2, then §3 (the video-index-search PR). Measured: the number of broken
links found by `relink.sh` on each real repo, and research files moved.

## State (updated 2026-10-02)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [x] 1. Layout and lint · PR #51 merged
  - [~] 2. Migration and link rewriting · feat/split-research-docs-migration · PR #52
  - [~] 3. video-index-search · docs/research-split · video-index-search#13
- Completed: §1 (PR #51). §2 built: `research` class with dated-topic
  stripping and `?.md`, move refuses unnamed or outside destinations,
  research index commit, `relink.sh` (wraps the existing `relink.py`),
  broken-link report, fenced code untouched, move re-run index fix.
  §3 built in video-index-search#13: 3 moves + sources merge, headers,
  research index, 40 relative links 0 broken, prd-lint 0 violations,
  `git log --follow` reaches fbffc52, relink 0.10 s for 3 moves.
- Folded: §1 (research.md; prd-lifecycle; adopt), §2 (prd-migration). §3 has no spec delta.
- Branch / open PRs: feat/split-research-docs-migration (PR #52), video-index-search#13
- Remaining: none (archived in PR #52).
- Next action: merge PR #52 and video-index-search#13, then `/implement-prd-section docs/prd/archive/2026-10-rollout-existing-repos.md` (next: §3 hypertrophy-goals adopt and move).
## Open questions
1. Should a build ever read research? Proposal: no. The PRD has to state
   every decision a build needs. If a build stalls for lack of research,
   the fix is to move that fact into the PRD, and the case is logged here.
2. Do design proposals count as research? Proposal: yes. They inform how
   work is done, and the `Decided in` line marks them as history once the
   PRD holds the decisions.
3. Should research files written before this change get the header?
   Proposal: only when they are moved. The move phase doesn't write
   headers, so the session that moves them adds them in the same PR.

## Changes
- 2026-10-02 — created; APPROVED (auto): no blocking questions, proposals
  1–3 are the decisions.
- 2026-10-02 — §2 names research by topic without a date prefix, and
  `move` waits for the owner to name a dateless file (seen in
  hypertrophy-goals).
- 2026-10-02 — §1 built. The PRD template's `## Research` section opens
  with a `Relies on:` line (behavior 4), and bootstrap keeps
  `docs/research/README.md` like the other READMEs.
- 2026-10-02 — §2 built. `relink.sh` wraps the existing `relink.py`, which
  `move` and `fold` already share, rather than a new rewriter; it reports
  `rewrote <file> (<n>)` per file (not per line) like `move`. Research
  index rows land in their own fourth move commit. Inventory `Counts:`
  gains `research`. Fixed in passing: a `move` re-run appended duplicate
  index rows for already-moved files (the old test matched the commit
  message only). Measured on hypertrophy-goals: inventory 1.2 s, relink
  0.85 s per move.
- 2026-10-02 — §3 built in video-index-search#13. `relink.sh` reports
  broken links only inside moved files, so the links that broke in
  `footage-index.md` when `docs/prd.md` moved (it was not moved again here)
  were found by a whole-repo link check and fixed by hand, along with two
  schema links broken the same way. relink rewrites targets but not link
  text; it warned on each stale text, fixed by hand. Archived in PR #52.
