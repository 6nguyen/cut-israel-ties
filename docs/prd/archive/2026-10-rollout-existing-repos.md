# Rollout to existing repos — PRD
Status: SHIPPED 2026-10-04 (PR #69) · Owner: George · Last updated: 2026-10-04

## Problem
Every piece of the per-repo layer ships with fixture tests: adopt (98), PRD
guard (49), migrate-prds, prd-lint. None of it has run against a real repo.
The two repos that need it test opposite extremes:

- **hypertrophy-goals** has 643 commits and 30 files in `docs/prd/`. Most
  have no `Status:` on line 2, none has a State block, and statuses are
  free-form (BUILDING, SHIPPING, FOLDED, ON HOLD, IN PROGRESS). Line 2 of
  `data-page-v2.md` reads `**SUPERSEDED by …**`. There are 8 research files,
  a 167-line `docs/PRD.md` outside `docs/prd/`, and 126 lines of
  `CLAUDE.md`. Two archived files, 5 days of in-flight branches and
  worktrees round it out.
- **video-index-search** has 9 commits and one real PRD
  (`footage-index.md`) in a non-template shape (prose status on line 3). It
  has a second main user, an 81-line `CLAUDE.md`, an existing
  `.claude/settings.json` and skills, and 4 open branches.

Mock repos would only re-test what the fixtures already cover. The real
repos are the acceptance test, and each defect they expose becomes a
minimal fixture in the template, so the next adopter is covered too.

## Goals / Non-goals
- Goals: both repos run the full lifecycle (`prd-lint` clean, every open
  PRD has State, shipped work folded into `docs/specs/`, `repo-setup.md`
  archived); every template defect found is fixed here with a regression
  fixture; nothing in either repo's product code changes.
- Non-goals: a standing mock-repo harness (fixtures per defect are cheaper
  and sharper); rewriting PRD content beyond what migration requires;
  `docs/plans/` and other non-PRD docs (inventory may list them, move
  only on an owner decision); bootstrap (no new repo needs it now).

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Dry run before every migration | Rails/Django migrations, `terraform plan` | adopt | Phase 1 is read-only on both repos. |
| Canary on the small target first | staged rollouts | adopt | video-index-search goes first; its defects are cheap to see. |
| One codemod PR per concern | large-repo migrations (Stripe, Airbnb TS) | adopt | adopt, move and each fold group are separate PRs, each reviewable. |
| Golden-repo e2e harness | create-react-app, cookiecutter CI | reject | Costs more than per-defect fixtures for two adopters. |

## Users
George owns both repos and merges every PR. Jasmine Pak is the main user
of the video-index-search tool (not an owner): PRs there must read on
their own, since she follows the repo.

## Expected behavior
All work in a target repo runs from an up-to-date `main` with a clean
tree; dirty or detached → stop and report. Template commands run from this
clone (`adopt`, `/migrate-prds`, `/implement-prd-section`).

**Defect rule (every section).** When a template script or skill does the
wrong thing on a real repo, stop that target's step. Fix it here on its own
`fix/` branch, adding the smallest fixture under the owning test
(`adopt_test.sh`, `migrate_test.sh`, `prd_guard_test.sh`) that reproduces
it, then re-run the target step after the fix merges. Hand-patching the
target's output to get past a defect is not allowed. A target repo's own
quirk, such as an odd PRD shape the spec already handles, is fixed in the
target PR.

### 1. Dry runs
Read-only on both repos: `adopt <repo> --dry-run` and
`migrate-prds/scripts/inventory.sh <repo>`. The output goes into State as
a per-file action count, any warned/skipped surprises and the inventory
class counts. No branch, no write. Each surprise is either a defect (rule
above) or noted as expected.

### 2. video-index-search
1. `adopt` with `--no-github`, which opens `chore/adopt-llm-template`. The
   PR body says which settings were skipped and why. Owner merges.
2. `/implement-prd-section docs/prd/repo-setup.md` in that repo, until
   `repo-setup.md` archives. Its Migrate item handles the shape of
   `footage-index.md`: Status line on line 2, State with `Sections:` from
   its 8 build steps, the steps already done marked `[x]`. Research stays a
   research file.
3. Done when `prd-lint.sh` passes, the index lists `footage-index`, and
   neither the open branches nor `CLAUDE.md` content was touched beyond
   adopt's documented merges.

### 3. hypertrophy-goals adopt and move
1. `adopt` (GitHub settings allowed: George owns it). Owner merges.
2. `/migrate-prds inventory`, owner confirms classes once, `move`.
   `docs/PRD.md` is classed by the owner; the default proposal is
   `unknown` (stays put). FOLDED/SUPERSEDED files go to archive with their
   status unchanged. Files with an open branch or PR keep their basename.
3. Research split (`split-research-docs.md` §2, which must be merged
   first). The 8 `docs/prd/research-2026-09-*.md` files are classed
   `research` and move to `docs/research/<topic>.md` in the same move PR.
   At the confirmation, the owner also reclasses as `research`:
   `docs/plans/launch-legal.md` and the markdown studies under
   `docs/design/logger-market/` and `docs/design/logger-rounds/`.
   Contracts (`*-contract.md`), wireframes (`*.html`) and
   `docs/prd/mockups/` stay where they are. Each moved research file gets
   the research header in the same PR.
4. Done when the move PR merges with every link rewritten (`relink.sh`
   reports no new breakage), no file content changed except paths and
   research headers, and no `docs/prd/research-*` file is left.

### 4. hypertrophy-goals fold
`/migrate-prds fold` per capability group of shipped PRDs, one PR per
group, then `split` for partial ones. Each remaining open PRD gets State.
The work spans several sessions, with State here tracking which groups
are folded. Done when `repo-setup.md` archives and `prd-lint.sh` passes
with 0 violations.

## Data & contracts
No new contracts. Template changes come only from the defect rule, and
each defect adds a MODIFIED entry below.

## Spec delta
- MODIFIED `docs/specs/adopt.md` §Behavior 8 (output): with `--no-github`
  the PR body names the skipped settings. Folded
  (fix/adopt-pr-body-skipped-settings).
- MODIFIED `docs/specs/area-maps.md` §Behavior 3 (excluded): `docs`
  directories are not measured. Folded (fix/area-maps-skip-docs).
None planned. Defect fixes add entries here, for example
`MODIFIED docs/specs/adopt.md §Behavior …`, in their own fix PRs.
- MODIFIED `docs/specs/prd-migration.md` §Behavior 1 (candidates): any
  `*.md` directly in `docs/prd/` is a candidate; `docs/prd/research-*.md`
  never is. Folded (fix/adopt-count-docs-prd-prds).
- MODIFIED `docs/specs/adopt.md` §Behavior 8 (N): also counts PRDs with
  State but no `Status:` on line 2. Folded (fix/adopt-count-docs-prd-prds).
- MODIFIED `docs/specs/prd-lifecycle.md` PRD lint: when `docs/specs/`
  exists, a PRD with an `[x]` Sections item needs `## Spec delta`. The
  repo-setup template's Migrate item requires a split or a Spec delta
  plus fold for active PRDs with merged sections. Folded
  (fix/prd-lint-spec-delta).
- MODIFIED `docs/specs/prd-migration.md` §Behavior 1 (status, class):
  `IN PROGRESS` / `ON HOLD` read as phrases; `FOLDED`/`SUPERSEDED` →
  shipped; `IN PROGRESS`/`ON HOLD`/`PROPOSED`/`SHIPPING` join the active
  statuses; a file named only `prd` gathers no evidence. Folded
  (fix/inventory-status-phrases).
- MODIFIED `docs/specs/adopt.md` §Behavior (CLAUDE.md row): the copied
  skeleton's repo map names `docs/specs/`; the repo-setup template's §1
  and acceptance require it. Folded (fix/claude-md-specs-pointer).

- MODIFIED `docs/specs/adopt.md` §Behavior 8 (N): `docs/prd/research-*.md`
  files are research, not PRDs, and are not counted (defect 7). Folded
  (feat/rollout-existing-repos-hg-adopt).
- MODIFIED `docs/specs/research.md` §Behavior 1 (layout) and
  `docs/specs/prd-migration.md` §Behavior 2 (move, commit 4): a study made
  of several files is one folder `docs/research/<topic>/`, each file with
  the header, and the index has one row for the folder (defect 8).
  Folded (feat/rollout-existing-repos-hg-adopt).
- MODIFIED `docs/specs/adopt.md` §Data & contracts (setup PRD template): the
  Area maps item writes maps for the directories the owner picks from
  `/area-maps measure`, not for every one it lists; with Migrate PRDs,
  maps that already exist elsewhere move to `<dir>/CLAUDE.md` in the
  move PR (defect 10). Folded (fix/setup-prd-area-maps-owner-picks).
- MODIFIED `docs/specs/prd-migration.md` §Behavior 2 (move): commit 6
  replaces only a `- ` line under `## Area maps` that names the map; a
  prose line keeps its rewritten path and the entry is appended. A last
  commit regenerates `docs/FEATURES.md` when it exists and is stale. A
  renamed basename is warned only when no other tracked file has that
  basename (defect 11). Folded (fix/migrate-move-map-prose-features).
- MODIFIED `docs/specs/prd-migration.md` §Behavior 2 (move): a `shipped`
  row whose status is `FOLDED` or `SUPERSEDED` moves straight to its
  `docs/prd/archive/` destination with its status unchanged, and commit 3
  drops its `docs/prd/README.md` index row; fold no longer lists it
  (defect 12). Folded (fix/migrate-move-archives-folded-pointers).
- MODIFIED `docs/specs/prd-fold.md` §Behavior 2 (split): `fold.sh reclass
  <prd> shipped|active` rewrites a partial row that is not yet split.
  `shipped` sets its Destination to `docs/prd/archive/<last-commit
  YYYY-MM>-<name>.md`, so `groups --write` and fold take it; `active` sets
  its current path and the migration leaves it alone. A recorded split
  point for it is dropped. Refused (exit 2): a row that is not partial or
  is already split, or another class (defect 13). Folded
  (fix/migrate-fold-topic-branches).
- MODIFIED `docs/specs/prd-fold.md` §Behavior 1-2: `fold.sh archive` and
  `split` run on any `docs/migrate-prds-<topic>` branch, so one PR can
  bundle several capability groups and splits by topic; other branches
  are still refused (exit 2) (defect 14).
- MODIFIED `docs/specs/prd-fold.md` §Behavior 3 (`relink.sh --sections`):
  a citation of a section folded into a spec becomes `docs/specs/<cap>.md`
  with no `§` label (the section the text landed in is the model's
  choice, so `§Data & contracts` was often wrong). A bare mention of the
  doc becomes the spec that received most of its sections (ties: the
  first in doc order); `docs/specs/README.md` only when no section went
  to a spec. A `<doc>:<line>` quote is listed unresolved and left for
  `archive-doc` (defect 15). Folded (fix/migrate-fold-topic-branches).
- MODIFIED `docs/specs/prd-migration.md` §Behavior 1 (candidates): an
  implementation plan (a `*-implementation.md` name, or a `PRD:` header
  naming a `docs/prd/` file in the first 5 lines) outside `docs/prd/` is
  never a candidate, even with a `Status:` line; it stays a doc row
  classed `impl-plan` (defect 16). Folded (fix/migrate-fold-topic-branches).
- MODIFIED `docs/specs/prd-fold.md` §Behavior (groups, archive): an impl
  plan whose plan row reads `merge <stem>` leaves with that PRD's group:
  `groups` counts it (`(+<k> impl plans)`), `archive` moves it in the same
  moves commit to `docs/prd/archive/<YYYY-MM>-<name>.md` with `Status:
  MERGED <date> into <archived prd>` and rewrites references; the plan
  counts it as a doc left until it moves (defect 17). Folded
  (fix/migrate-fold-topic-branches).
- MODIFIED `docs/specs/prd-fold.md` §Behavior (split --check): the Spec
  delta passes when it names `<cap>.md`, any existing `docs/specs/*.md`, or
  an ADDED `docs/specs/*.md`; a capability already split by size (progress →
  progress, progress-charts, passport) folds into the spec that owns the
  rest (defect 18). Folded (fix/migrate-fold-topic-branches).
- MODIFIED `docs/specs/prd-fold.md` §Behavior (relink --sections): in a doc
  whose `##` headings are numbered (`## 3. LLM token usage`), a numeric
  reference resolves by its leading number and is consumed whole:
  `§1.3`, `§2.6`, `§4-6`, and `plan|part|phase|section N [§…]` after the
  path (`plan 3 §4-6` → section 3). A chain naming more than one
  top-level section (`§1.3, §2.6`, `§1-3`) is listed unresolved (defect
  19). Folded (fix/migrate-fold-topic-branches).
- MODIFIED `docs/specs/prd-fold.md` §Behavior (relink --sections): a
  citation inside a markdown heading is never rewritten; it is listed
  `unresolved: <file>:<n>: <citation> (heading)`, because a heading is a
  section's key in the plan's `## Sections` table and its anchor (defect
  20). Folded (fix/migrate-fold-topic-branches).
- MODIFIED `docs/specs/prd-fold.md` §Behavior 2 (split): `split` lists
  every file that cites the PRD's path (links and plain mentions, outside
  the archive, the plan, the PRD index and `FEATURES.md`) as `cite: <file>
  (<n>)`, and `next:` says to repoint the ones about shipped behavior to
  the spec; after the split that path holds only the unbuilt rest (defect
  21). Folded (fix/migrate-fold-topic-branches).
- MODIFIED `docs/specs/prd-fold.md` §Behavior 1 (fold): one topic PR is
  open at a time; topics already open together are merged into one
  `docs/migrate-prds-bundle` branch and the originals closed (defect 22).
  Folded (docs/rollout-hg-bundle).
- MODIFIED `docs/specs/prd-fold.md` §Behavior 1 (master list): links are
  relinked to the archive path, then live citations of folded content
  name the spec (defect 23). Folded (docs/rollout-hg-final).
- MODIFIED `docs/specs/prd-migration.md` §Behavior (inventory class): an
  active status whose text says shipped or landed is `partial` (defect
  24). Folded (docs/rollout-hg-final).

## Acceptance criteria
- [x] Phase 1 output for both repos is recorded in State, with zero writes
      (`git status` clean, no new branches).
- [x] video-index-search: adopt PR merged with no GitHub settings applied;
      `repo-setup.md` archived; `prd-lint.sh` 0 violations; 4 pre-existing
      branches untouched. (2026-10-04: archive/2026-10-repo-setup.md,
      prd-lint PASS; nothing pushed to the 4 branches.)
- [x] hypertrophy-goals: adopt and move PRs merged; `git log --follow`
      on a moved PRD shows its pre-move history; no PRD with an open branch
      was renamed.
- [x] hypertrophy-goals: no `docs/prd/research-*` file is left; the
      research files sit in `docs/research/` with headers and an index,
      and `git log --follow` on one shows its pre-move history.
- [x] hypertrophy-goals: every shipped group folded, `repo-setup.md`
      archived, `prd-lint.sh` 0 violations. (2026-10-04 passthrough:
      inventory shipped 31, active 9, unknown 0.)
- [x] Every defect found has a merged template fix with a fixture that
      fails before the fix; the full adopt/migrate/prd-guard suites pass.
- [x] Budgets hold on the real repos: adopt full local run < 5 s
      (`docs/specs/adopt.md`), inventory of hypertrophy-goals < 2 s excl.
      `gh` (`docs/specs/prd-migration.md`). Measured numbers go in State.

## Rollout & metrics
Order: §1 → §2 → §3 → §4. §2 is the canary: a defect there blocks §3.
Metrics: defects found per repo, PRs per repo, and post-adopt PRD
commits rejected by `prd-lint`. A rejection is the guard working, not a
defect.

## State (updated 2026-10-04)
- Sections:
  - [x] 1. Dry runs · PR #46 merged
  - [x] 2. video-index-search · video-index-search#5–#8 merged; follow-ups bundled in video-index-search#12
  - [x] 3. hypertrophy-goals adopt and move · hg#207, hg#208, hg#209 merged
  - [x] 4. hypertrophy-goals fold · hg#211, hg#212, hg#217, hg#218 merged
- Completed: PRD written; defects 1–24 fixed (PR #40, #41, #43, #45, #46,
  #47, #53, #60, #62, #63, #64, #66, #67, #68). §2 video-index-search:
  adopt, repo-setup §1–§4, footage-index migrated in place and folded. §3
  hypertrophy-goals: adopt, repo-setup §1–§3, move (hg#209). §4 all
  groups folded (hg#211, hg#212, hg#217, hg#218); repo-setup archived; CI
  lint blocking.
- Folded: Spec delta defects 1–24.
- Measured: adopt dry run 0.22 s (video-index-search); hg inventory 0.59 s
  without `gh`.
- Branch / open PRs: docs/archive-rollout · PR #69.
- Remaining: none.
- Known failures / blockers: none.
- Next action: merge PR #69.
## Open questions
1. Apply GitHub settings (branch protection, delete-on-merge) to
   video-index-search? Proposal: no, run with `--no-github`; the PR body
   tells the owners what to apply if they want it. (2026-10-02: George is
   the sole owner, so he may apply them by re-running `adopt` without
   `--no-github` after the adopt PR merges.)
2. `docs/PRD.md` in hypertrophy-goals? Proposal: inventory proposes
   `unknown` and the owner decides at the §3 confirmation; it is not
   moved by default.
3. Mock repos at all? Proposal: no standing harness. Each defect becomes a
   minimal fixture in the owning suite, which is a mock repo scoped to
   exactly that failure.

## Changes
- 2026-10-02 — created; APPROVED (auto): no blocking questions, proposals
  1–3 adopted as decisions.
- 2026-10-02 — §2 canary dry run found defect 1: `footage-index.md`
  (prose status on line 3, own State) was not a PRD candidate, so adopt
  wrote no Migrate item. Fixed in fix/adopt-count-docs-prd-prds.
- 2026-10-02 — defect 2: `adopt --no-github` opened its PR without saying
  which GitHub settings were skipped (§2.1). Fixed in
  fix/adopt-pr-body-skipped-settings.
- 2026-10-02 — corrected: Jasmine Pak is the main user of
  video-index-search, not a co-owner; George owns it. Open question 1 now
  notes George may apply the GitHub settings later.
- 2026-10-02 — defect 3: on video-index-search `/area-maps measure`
  recommended a map for `docs/` (PRD, research, decision log; no code).
  `measure.sh` now skips `docs` directories; new `area-maps` quiet-check
  target. Fixed in fix/area-maps-skip-docs.
- 2026-10-02 — defect 4: on video-index-search, `footage-index.md` (steps
  1 and 3 merged) was migrated in place with no `## Spec delta`, so
  `docs/specs/` stayed empty and would never fill. prd-lint now requires
  a Spec delta once a section merges (when `docs/specs/` exists), and the
  repo-setup Migrate item names split or Spec delta plus fold. Fixed in
  fix/prd-lint-spec-delta.
- 2026-10-02 — defect 5: the hypertrophy-goals dry run classed three
  in-progress or on-hold PRDs as shipped (status read as `IN` / `ON`),
  left a `FOLDED` PRD in place, classed `SHIPPING` as shipped, and gave
  `docs/PRD.md` every PRD-related PR as evidence (shipped, against open
  question 2). Fixed in fix/inventory-status-phrases.
- 2026-10-02 — defect 6: video-index-search's `CLAUDE.md` never pointed
  at `docs/specs/`, because the template skeleton's repo map lacks it and
  repo-setup §1 did not ask for it. Fixed in fix/claude-md-specs-pointer.
- 2026-10-02 — §1 done for both repos. video-index-search setup
  follow-ups (fold re-land, specs pointer, State refresh) bundled in
  video-index-search#12.
- 2026-10-02 — §3 waits for split-research-docs.md, so hypertrophy-goals
  adopts with `docs/research/` instead of being migrated twice. §3 gains
  the research split step and its acceptance item.
- 2026-10-02 — §3 adopt (hypertrophy-goals#206) found defect 7: N in the
  setup PRD's Migrate item was 37 because it counted the 8
  `docs/prd/research-*.md` files. #206 is closed and adopt re-runs after
  the fix merges, since hand-patching the target is not allowed.
- 2026-10-02 — §3 owner confirmation: research also takes
  `docs/design/ux-parity.md` and `docs/design/female-body-source.md`;
  `docs/prd/research-2026-09.md` becomes `competitive-digest.md`; the
  multi-file studies `logger-market/` and `logger-rounds/` move as
  folders (defect 8: the research rule allowed only one file per
  question). `docs/PRD.md` stays in place. The owner asked for two new
  template features first, each researched before its PRD: a master
  feature-status list in every repo, and a home for reference docs
  (contracts, architecture, orientation maps, plans). Their tooling then
  runs on hypertrophy-goals, so the move waits for them.
- 2026-10-02 — §3 adopt re-run dry run found defect 9: hypertrophy-goals
  still has `origin/chore/adopt-llm-template` from closed #206, and adopt
  would have reused it and pushed on top of a closed PR. adopt now picks
  `chore/adopt-llm-template-<n>` when every PR for the branch is closed
  or merged, and reuses a branch only for an open PR. Fixed in
  fix/adopt-stale-branch-open-prs-only (PR #60).
- 2026-10-03 — §3 hypertrophy-goals repo-setup found defect 10: the
  setup PRD's Area maps item and its acceptance criterion asked for a map
  on every directory `/area-maps measure` lists, 31 in hypertrophy-goals,
  while the area-maps skill maps a directory only when the owner points
  at it. The template now asks for the directories the owner picks, and
  says existing maps move to `<dir>/CLAUDE.md` in the migrate move PR,
  which already classes them as `map`. Fixed in
  fix/setup-prd-area-maps-owner-picks.
- 2026-10-03 — §3 hypertrophy-goals move found defect 11, three faults in
  move.sh. Commit 6 replaced the first line under `## Area maps` that
  named the old map, so a prose sentence lost its second half to a
  bullet. Moving PRDs left `docs/FEATURES.md` stale, failing prd-lint on
  the move PR. Moving `docs/perf/README.md` warned on 45 mentions of
  `README.md` meant for other READMEs. Commit 6 now replaces only bullet
  lines, a final commit regenerates FEATURES.md, and basename warnings
  skip a basename other tracked files share. Fixed in
  fix/migrate-move-map-prose-features.
- 2026-10-03 — hg#209 lint found defect 12: move.sh moved every `shipped`
  row to `docs/prd/` for a later fold, including FOLDED/SUPERSEDED
  pointers whose content already lives in another PRD (§3 step 2 says
  they go to archive). `docs/prd/home-rolling-window.md`, a FOLDED
  pointer to `home.md`, stayed in `docs/prd/`, failed prd-lint and had no
  fold path (no spec of its own). Move now archives such rows and drops
  their index row.
- 2026-10-03 — hg §4 split proposals found defect 13: 11 of hg's 20
  `partial` PRDs were fully built behind stale BUILDING/APPROVED status
  lines and 2 had nothing built, but no phase after inventory could change
  a plan row's class, and `groups --write` refuses partial rows. Added
  `fold.sh reclass`; the split step now reclasses all-shipped and
  nothing-shipped PRDs before recording split points.
- 2026-10-03 — PR #65 merged before its defect 13 commits were pushed
  to it, so they moved to fix/migrate-fold-topic-branches. Global git
  rule added: check a PR is still open before pushing more to its branch.
- 2026-10-03 — hg §4 found defect 14: archive and split demanded
  `docs/migrate-prds-<cap>` / `-split-<name>` branches, forcing 17 hg PRs
  that each touch the specs and PRD indexes and `docs/FEATURES.md`, so
  every merge conflicts the rest. They now take any `docs/migrate-prds-*`
  branch; hg folds in one PR per topic.
- 2026-10-03 — hg §4 found defect 15: `relink.sh --sections` on the two
  home design docs rewrote 22 code and doc citations to
  `docs/specs/README.md` (bare mentions of a doc whose sections all went
  to one spec) and labelled persona-copy citations `§Data & contracts`
  though the rule lives in Behavior. Spec targets now take no `§` label;
  a bare mention goes to the doc's main spec. It also rewrote a research
  note's `home-v2.md:13` quote to a spec line that does not hold it; line
  quotes are now left for `archive-doc`.
- 2026-10-03 — the hg final passthrough found defect 24: two hg PRDs
  inventoried `active` had shipped every round (`ios-logger-gestures`,
  "BUILDING — landed 2026-09-07"; `settings-cleanup`, "APPROVED — shipped
  on iOS"). Their branches never carried the PRD basename, so no merged
  evidence was found, and the status word alone said active. They were
  folded and archived in hg#218 (new docs/specs/profile.md). Inventory now
  reads the whole status text: "shipped"/"landed" makes the row
  `partial`, so the owner sees it before the move.
- 2026-10-03 — hg §4 found defect 23: the master-list step said "links
  rewritten (`scripts/relink.sh`)" without the arguments. Run as
  `relink.sh docs/PRD.md docs/specs/product.md`, relink treated the spec
  as the moved file and rewrote its own sibling links (`README.md` →
  `../README.md`). Caught by its `broken:` lines and redone as a move to
  the archive path plus a hand repoint of five glossary citations. The
  skill now names both arguments and the repoint. hg#218 also carried
  contracts.md, the master list, the PRD README sync, plan deletion and
  blocking CI in one PR, so the owner merges one branch.
- 2026-10-03 — hg §4 found defect 22: the five hg topic PRs (hg#212–216)
  were opened together off one main. Each rewrote the shared PRD and spec
  indexes, `FEATURES.md` and the CLAUDE.md binding-docs line, and three
  archived docs another topic still cited, so after hg#212 merged the
  other four conflicted. Bundled into hg#217 (one merge commit per topic,
  indexes resolved to the files on disk, about 110 split-PRD citations
  repointed); hg#213–216 closed. The skill now keeps one topic PR open at
  a time and documents the bundle recovery.
- 2026-10-03 — hg §4 found defect 21: after `split` the PRD's path holds
  only the change PRD, but code comments, guides and other PRDs still cite
  it for shipped behavior (hg's performance-plan and test-personas: 66
  files). `split` kept those references silently. It now lists them so
  the model repoints the shipped ones to the spec.
- 2026-10-03 — hg §4 found defect 20: `relink.sh --sections` on
  `security-and-llm-plan.md` rewrote architecture.md's heading `## LLM
  backend (docs/security-and-llm-plan.md plan 3 §4-6)`, so its `##
  Sections` row no longer matched and `archive-doc` refused the doc as
  unmapped. Citations in headings are now listed, never rewritten.
- 2026-10-03 — hg §4 found defect 19: `relink.sh --sections` on
  `security-and-llm-plan.md` (numbered headings) rewrote `§1.3` to
  `docs/specs/security.md.3` (the ref stopped at the dot) and sent every
  `plan 3 §4-6` mention (the LLM section) to the bare target, security,
  leaving `plan 3 §4-6` dangling after it. Numeric refs and `plan N`
  qualifiers now resolve to the numbered section and are consumed whole.
- 2026-10-03 — hg §4 found defect 18: `split --check` required the
  literal `docs/specs/<cap>.md` in the change PRD's Spec delta, but the
  progress group's specs were split by capability to stay under 16 KB and
  the stamps delivery rest folds into `passport.md`. The check now accepts
  any existing or ADDED spec.
- 2026-10-03 — hg §4 found defect 17: the inventory classes impl plans
  `merge <prd>`, but no fold step executed it; feature-tour's plan was
  archived by hand-editing its plan row. `fold.sh archive` now moves a
  group's merged impl plans beside their PRD.
- 2026-10-03 — hg §4 found defect 16: `docs/plans/feature-tour-implementation.md`
  carried `Status: PROPOSED` and a `PRD:` header, so the `Status:` rule
  made it a PRD candidate; it was moved to `docs/prd/` as an active PRD
  instead of merging into its PRD. Impl plans are now excluded from
  candidates and fall to the doc rows' impl-plan class.
- 2026-10-04 — SHIPPED and archived (PR #69): hg#218 and #68 merged, so
  §4 is done. Final passthroughs: video-index-search PASS; hypertrophy-goals
  PASS apart from allowed cases (DRAFT and ON HOLD PRDs without Spec delta,
  planned paths, template constants in copied scripts). Suites: adopt 160,
  migrate-prds 267, prd-guard 73, doc-lint 31, features 45, all passing.
  Budgets: adopt dry run 0.22 s on video-index-search, hg inventory 0.59 s
  without `gh`. Unticked boxes from the hg PRDs (reduced-motion sweep on a
  phone, fresh-install Health check) stay in hg's archive notes. hg
  performance-plan Q3 belongs to hg's PRD (owner 2026-10-04: deferred
  until the app is usable without data or sync bugs).
