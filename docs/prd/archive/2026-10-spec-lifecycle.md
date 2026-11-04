# Spec lifecycle (living specs + archived change PRDs) — PRD
Status: SHIPPED 2026-10-01 (PR #17) · Owner: George Nguyen · Last updated: 2026-10-01

## Problem
The owner's intent is that the docs can rebuild the app: a set of documents
that describes the current feature set, plus enhancement PRDs that are
archived once shipped, with their effect folded into the current-state docs.
The template doesn't do that. `docs/prd/README.md` defines one living PRD per
feature, and that file does two jobs: it describes current behavior and it
carries new proposals. Evidence from hypertrophy-goals (2026-10-01):
- **Long, mixed files.** Enhancements are appended as "Rounds" inside the
  feature PRD (`home.md`: Round 2026-09-27, Round 2026-09-29). Files run to
  525–872 lines (`onboarding-v2.md` 872, `progress-report-v2.md` 705,
  `logger-session-polish.md` 695) and mix shipped behavior, approved rounds,
  drafts and history.
- **`archive/` is only for overflow.** It holds just the trimmed `## Changes`
  logs (2 files). No shipped proposal has ever been archived.
- **Stale files stay in place.** Superseded or folded PRDs still sit in
  `docs/prd/` (`data-page-v2.md`, `home-rolling-window.md`), and most statuses
  are stuck at BUILDING.
- **No current-state answer.** Nothing answers "what does the app do today"
  in one place.
- **Token cost.** `implement-prd-section` loads PRD line ranges, so agents
  pay tokens for history, and can build against a round that a later round
  superseded.

## Goals / Non-goals
- Goals:
  1. `docs/specs/` describes the app as shipped today: behavior, contracts
     and invariants, with no history.
  2. Every behavior change starts as a change PRD in `docs/prd/` with an
     explicit spec delta.
  3. Shipping a change folds its delta into `docs/specs/` and archives the
     PRD in the same PR.
  4. An implementing agent loads only the PRD range plus the spec sections
     the change touches.
- Non-goals:
  - Rebuilding the app from specs alone. Tests remain the spec you can
    actually run; specs say what and why, not how.
  - Migrating hypertrophy-goals. That gets its own session, one capability
    per PR, after this ships.
  - Tooling to apply deltas automatically. The fold is a short, owner-visible
    edit; a script can come later if the fold proves error-prone.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| `specs/` (current truth) + `changes/<id>/` with spec deltas; `archive` merges the delta and moves the change | OpenSpec | Adopt | Matches the owner's intent exactly |
| ADDED / MODIFIED / REMOVED delta headings per requirement | OpenSpec | Adopt | Makes the fold mechanical and reviewable |
| Proposal frozen once accepted; reference docs are the living truth | Rust RFCs, PEPs, Kubernetes KEPs | Adopt | Archived PRDs are never edited |
| Immutable records, superseded rather than edited | ADRs | Adapt | Binding decisions move into the spec; the archived PRD keeps the reasoning |
| One folder per feature (spec/plan/tasks), no merged current spec | GitHub Spec Kit, Kiro | Reject | This is today's model, and it causes the drift above |
| Point-in-time design docs, not maintained | Google design docs | Reject | Can't rebuild from docs nobody maintains |

## Users
- **Owner:** reviews change PRDs, reads `docs/specs/README.md` to see the
  feature set.
- **Implementing agents** (`/implement-prd-section`): load a PRD range plus
  the target spec sections.
- **Fresh sessions:** rebuild context from specs + State instead of
  conversation history.

## Expected behavior
1. **Spec files.** `docs/specs/<capability>.md` has these sections: Purpose
   · Behavior · Data & contracts · Invariants (regression checklist) ·
   Performance budget.
   - No status line, rounds, research or changes log.
   - Each file stays under ~4k tokens; past that, split by sub-capability.
   - `docs/specs/README.md` holds the spec template and a one-row-per-
     capability index. That index is the app's feature set.
2. **Change PRDs.** `docs/prd/<change>.md` uses today's template plus a
   required `## Spec delta` section.
   - Each entry names a `docs/specs/<file>.md` § heading and is ADDED,
     MODIFIED (old → new) or REMOVED.
   - A brand-new capability's delta is ADDED: the whole spec file.
3. **Behavior-preserving work** (refactors, fixes that restore specced
   behavior) needs no PRD and no spec change, as today.
4. **Fixes that change behavior.** A bug fix that changes specced behavior
   updates the spec directly in the fix PR and gives the reason in the
   commit body. No PRD is needed unless the owner asks for one.
5. **Ship.** When the change's final section ships (State: Remaining empty),
   the same PR:
   - applies the delta to `docs/specs/`;
   - sets the PRD status to `SHIPPED YYYY-MM-DD (PR #n)`;
   - `git mv`s it to `docs/prd/archive/YYYY-MM-<change>.md`;
   - moves its index row out of `docs/prd/README.md`.
6. **Partial ships.** A multi-PR change folds each section's delta when that
   section merges, and notes it in State (`Folded: §…`). The PRD is archived
   with the last one.
7. **Superseded or abandoned PRDs** move to `archive/` with status
   `SUPERSEDED by …` / `DROPPED` and no fold.
8. **`archive/` is history only.** Agents never load it (existing rule).
   The `## Changes` overflow rule goes away, because short-lived PRDs don't
   accumulate long logs.
9. **`/implement-prd-section`.**
   - Step 1 also loads the spec sections the PRD's `## Spec delta` names, and
     only those.
   - Finish step: fold the delta (rule 6); if this is the final section,
     archive (rule 5).
10. **`/handoff`.** Its checklist adds "spec delta folded for every section
    merged this session".
11. **Bootstrap and adopt.** `scripts/bootstrap.sh` keeps `docs/specs/`.
    The planned `adopt.sh` (`docs/prd/adopt-existing-repo.md`) creates it.
12. **Global rules.** `claude-home/CLAUDE.md` §PRD-first says: change PRDs
    carry a spec delta; shipping folds it into `docs/specs/` and archives the
    PRD in the same PR.

## Data & contracts
- New files: `docs/specs/README.md` (template + index),
  `docs/specs/area-maps.md` (dogfood fold of the template's shipped
  `area-maps` PRD).
- Moved: `docs/prd/area-maps.md` → `docs/prd/archive/2026-10-area-maps.md`.
- Edited:
  - `docs/prd/README.md`: lifecycle, Spec delta section, index of open
    changes only.
  - `claude-home/CLAUDE.md` §PRD-first.
  - `claude-home/skills/implement-prd-section/SKILL.md` steps 1 and 3.
  - `claude-home/skills/handoff/SKILL.md`.
  - The area-map index line in root `CLAUDE.md`, only if it points at the
    PRD.

## Acceptance criteria
- [x] `docs/specs/README.md` exists with the spec template and an index;
      `bootstrap.sh` leaves it in place for new repos.
- [x] The `docs/prd/README.md` template has `## Spec delta` with the
      ADDED / MODIFIED / REMOVED format and a worked one-line example.
- [x] Dogfood: `docs/specs/area-maps.md` describes the shipped area-maps
      feature with no reference to rounds, status or history, and is under
      4k tokens. `docs/prd/archive/2026-10-area-maps.md` is the moved PRD,
      with status SHIPPED.
- [x] `implement-prd-section` step 1 lists the spec sections named by the
      delta. A dry read of a sample delta PRD loads ≤ (PRD range + named
      spec sections) and nothing from `archive/`.
- [x] `implement-prd-section` finish step folds per section and archives on
      the final section.
- [x] `/handoff` checks that folds are done.
- [x] `claude-home/CLAUDE.md` §PRD-first states the lifecycle in ≤3 lines.
      The global file grows by ≤3 lines net.
- [x] No test suites are touched; this is a docs/skill-only change.

## Rollout & metrics
- Ships to all repos on `git pull` (claude-home is symlinked).
- Existing repos keep working: with no `docs/specs/`, the skill skips the
  spec load and the fold, and warns once.
- Metric: tokens loaded in step 1 of `/implement-prd-section` before and
  after on the first migrated hypertrophy capability. session-analyzer
  already records per-request context.

## State (updated 2026-10-01, PR #17)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [~] Expected behavior · feat/spec-lifecycle-expected-behavior · PR #17
- Completed: Expected behavior 1–12, all acceptance criteria.
- Folded: n/a (this PRD predates `## Spec delta`; it adds no app capability).
- Branch / open PRs: `feat/spec-lifecycle-expected-behavior` · PR #17.
- Files changed: `docs/specs/README.md` (new: rules, index, template),
  `docs/specs/area-maps.md` (new, fold), `docs/prd/README.md` (lifecycle,
  `## Spec delta`, `Folded:` State line, open-only index, overflow rule
  removed), `docs/prd/archive/2026-10-area-maps.md` (moved, SHIPPED),
  `claude-home/CLAUDE.md` §PRD-first (+3), `implement-prd-section` step 1
  + finish step 2/4, `handoff` step 2, `scripts/bootstrap.sh` (strip
  template specs), `adopt-existing-repo.md` (copy `docs/specs/README.md`),
  `TEMPLATE.md`, `README.md` (one-line pointers).
- Tests run + result: none (docs/skill-only; no suite touched). `bash -n
  scripts/bootstrap.sh` ok; spec-strip loop dry-run in a scratch clone
  leaves only `docs/specs/README.md` with an empty index.
- Remaining: none.
- Decisions since last update: bootstrap strips template-own specs (they
  describe `claude-home/`, which bootstrap deletes); `prd-progress.md`
  stays in `docs/prd/` (shipped pre-lifecycle) until the migration session.
- Known failures / blockers: none.
- Next action: owner merges the PR; migrate hypertrophy-goals in its own session.

## Open questions
None open. Decisions below are logged under Changes.

## Changes
- 2026-10-01 — created (DRAFT).
- 2026-10-01 — APPROVED by the owner; open-question proposals adopted: OQ1 folder is `docs/specs/`; OQ2 archive files are date-prefixed (`YYYY-MM-<change>.md`); OQ3 `research-*.md` moves to `docs/research/` in the hypertrophy migration session, not here.
- 2026-10-01 — built in one PR. Bootstrap also strips the template's own
  spec files (they describe `claude-home/`). `prd-progress` is listed as
  "shipped before this lifecycle, not yet folded" instead of being archived
  here. SHIPPED and archived.
