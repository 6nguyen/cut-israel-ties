# Repo setup follow-ups as a PRD — PRD
Status: APPROVED 2026-10-02 (auto) · Owner: George Nguyen · Last updated: 2026-10-02

## Problem
After `adopt` (or `bootstrap.sh`) the repo still needs setup work:
- fill in `CLAUDE.md`;
- add quiet-check targets and `CI_TARGETS`;
- write area maps;
- migrate old PRDs when there are any.

Today these steps are printed once in the terminal. Nothing in the repo
records them, so a later Claude session doesn't know setup is unfinished
and the owner has to remember each command. Writing the steps into
`CLAUDE.md` would fix discovery, but it would cost tokens on every request
and go stale once setup is done.

## Goals / Non-goals
- Goals:
  - Setup steps live in a PRD the existing tools already run:
    `/implement-prd-section` and `/handoff` track progress, and the PRD is
    archived when done.
  - A fresh session knows setup is pending from one `CLAUDE.md` line.
  - That line disappears automatically when the setup PRD is archived,
    leaving `CLAUDE.md` exactly as it was before.
  - The same mechanism serves `adopt` and `bootstrap.sh`.
- Non-goals:
  - Unattended setup. Each section is still a PR the owner merges, and
    `CLAUDE.md` content is reviewed by the owner.
  - Changing what the setup steps do (`/area-maps`, `/migrate-prds` stay
    as they are).
  - Repos adopted before this ships: they are only covered if a re-run of
    adopt has other changes to make (Open question 2).

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Post-install checklist issue | GitHub repo templates, Renovate onboarding PR | adapt | A checklist that lives with the repo and closes when done. Ours is a PRD, so the existing skills drive it. |
| Setup wizard in the CLI | `create-next-app`, `npm init` | reject | It's done once at install time, but our steps need repo-specific judgment over several sessions. |
| Persistent TODO in agent config | ad hoc `CLAUDE.md` notes | reject | It costs tokens on every request and nothing removes it. |

## Users
Repo owners who just ran `adopt` or `bootstrap.sh`, and the Claude sessions
that work in those repos afterwards.

## Expected behavior
### 1. Pointer removal on archive
1. A PRD pointer is one `CLAUDE.md` line containing the marker
   `<!-- prd-pointer: docs/prd/<name>.md -->`.
2. When `/implement-prd-section` archives a PRD (Ship step), it deletes
   every line in the root `CLAUDE.md` that carries that PRD's marker, in
   the same commit as the `git mv`. The same applies to a PRD archived as
   `SUPERSEDED` or `DROPPED`.
3. The rule is stated once in `docs/prd/README.md` §Lifecycle and in the
   lifecycle spec, so a manual archive follows it too.
4. Pointer lines are the only lines in `CLAUDE.md` that any process removes
   automatically; nothing else there is touched.

### 2. Adopt writes the setup PRD
1. Adopt copies `claude-home/templates/repo-setup.md` to
   `docs/prd/repo-setup.md`.
   - Status is `APPROVED <today> (adopt)`.
   - The PRD index gets a row for it.
   - It has no spec delta ("none — setup only"), so `/implement-prd-section`
     folds nothing.
2. Its `## State (updated 2026-10-02)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [~] 1. Pointer removal on archive · feat/repo-setup-pointer-removal-on-archive · PR #30
  - [ ] 2. Adopt writes the setup PRD
  - [ ] 3. Bootstrap writes the setup PRD · after prd-lifecycle-spec §2
- Branch / open PRs: feat/repo-setup-pointer-removal-on-archive (PR #30)
- Completed: PRD drafted; §1 pointer marker + removal in the archive step
  (skill §3, `docs/prd/README.md` §Lifecycle, lifecycle spec).
- Folded: §1 (prd-lifecycle §Behavior 6–7, §Data & contracts, §Invariants).
- Remaining: §2-3.
- Next action: merge PR #30, then `/implement-prd-section
  docs/prd/repo-setup.md` (next: §2. Adopt writes the setup PRD).

## Open questions
1. Name of the setup PRD? Proposal: `docs/prd/repo-setup.md`. The same name
   works for adopt and bootstrap, and its archive name
   (`YYYY-MM-repo-setup.md`) shows when setup finished.
2. Should a re-run of adopt on a repo adopted before this shipped write a
   setup PRD? Proposal: only when the run has other changes to create or
   merge. Otherwise an already set-up repo would get a setup PRD out of
   nowhere, and a no-op run would stop being "nothing to adopt".
3. Removal as a final setup section instead of a lifecycle rule? Proposal:
   make it a lifecycle rule (§1). A dedicated section would be a one-line
   PR, and it would rely on the model remembering; the archive step already
   runs on every shipped PRD.

## Changes
- 2026-10-02 — created; APPROVED (auto, no blocking questions). It
  supersedes the printed next steps and the migrate-prds §5 printed hint;
  the count now decides the setup PRD's migrate section.
- 2026-10-02 — §1 built: the archive step deletes pointer lines with a
  guarded `grep -vF` (no marker → `CLAUDE.md` untouched). migrate-prds
  `move.sh` is unchanged: it archives PRDs that predate pointers.
