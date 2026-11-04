# Repo setup follow-ups as a PRD — PRD
Status: SHIPPED 2026-10-02 (PR #35) · Owner: George Nguyen · Last updated: 2026-10-02

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
2. Its State block's `Sections:` list holds these items, all `[ ]`, each a
   `###` section under Expected behavior:
   1. **CLAUDE.md:** the model drafts the repo map, commands, budgets and
      gotchas from the code, and the owner reviews them in the PR.
   2. **quiet-check targets:** the model proposes `TARGETS` and
      `CI_TARGETS` from the build files it finds, then runs
      `scripts/quiet-check.sh list` and each target once.
   3. **Area maps:** `/area-maps measure`, then `write` for each directory
      it recommends (none recommended → the section is done).
   4. **Migrate PRDs:** present only when adopt's count of PRDs without
      State (§5 of migrate-prds) is above 0. The section names the count,
      runs the `/migrate-prds` phases in order and is done when
      `docs/prd/migration-plan.md` is gone.
3. Adopt appends one pointer line to `CLAUDE.md`, at the end so the
   original bytes stay a prefix:
   `Setup pending: when no other task is given or when asked to continue setup, run /implement-prd-section docs/prd/repo-setup.md. <!-- prd-pointer: docs/prd/repo-setup.md -->`
4. Both appear in the action table: `created docs/prd/repo-setup.md`, and
   `CLAUDE.md` as `created` or `merged` as today. `--dry-run` shows the same
   rows.
5. Adopt's printed next steps shrink to one line: "after merging, run
   /implement-prd-section docs/prd/repo-setup.md (or start a Claude session
   and say 'continue setup')". The "N PRDs without State" line from
   migrate-prds §5 moves into the PRD (item 2.4) and is no longer printed.
6. Idempotence:
   - `docs/prd/repo-setup.md` already present → unchanged.
   - An archived `docs/prd/archive/*-repo-setup.md` present → setup is
     done, nothing is written for it.
   - The pointer line is added only together with a newly created setup
     PRD.
   - A second run is still "nothing to adopt".
7. The setup PRD is written only when adopt has something else to create or
   merge (Open question 2).

### 3. Bootstrap writes the setup PRD
1. `scripts/bootstrap.sh` writes the same PRD and pointer as adopt, minus
   item 2.4. It does this after its cleanup of the template's PRDs (needs
   `prd-lifecycle-spec` §2 Clean bootstrap merged first) and before it
   removes `claude-home/`, which holds the template.
2. Its final `next:` line becomes the same one-liner as adopt's.

## Data & contracts
- New `claude-home/templates/repo-setup.md`: the setup PRD template, with
  `{{DATE}}` and a `{{MIGRATE}}` block that is dropped when the count is 0.
  It is template-only, and adopt and bootstrap never copy the
  `claude-home/templates/` directory itself.
- Pointer marker: `<!-- prd-pointer: docs/prd/<name>.md -->`, one per line,
  in the root `CLAUDE.md` only.
- `claude-home/skills/implement-prd-section/SKILL.md` §3 Archive gains the
  pointer deletion. `docs/prd/README.md` §Lifecycle 4–5 says the same.
- `TEMPLATE.md` "Existing repo" and "New repo" describe the setup PRD in
  place of the manual follow-up list.

## Spec delta
- MODIFIED `docs/specs/prd-lifecycle.md`:
  - §Behavior 6 Ship and §Behavior 7 Superseded or dropped: also delete the
    PRD's pointer lines from `CLAUDE.md`.
  - §Data & contracts: add the pointer marker format.
  - §Invariants: after archive no pointer to the PRD remains.
- MODIFIED `docs/specs/adopt.md`:
  - §Behavior 3 Plan: add the row `docs/prd/repo-setup.md` (absent → created
    from the template, migrate section only when N > 0; present or archived
    → unchanged) and the `CLAUDE.md` pointer append.
  - §Behavior 8 Output: next steps "fill in `CLAUDE.md` … run
    `/area-maps`, plus N PRDs without State …" → one line pointing at the
    setup PRD.
  - §Invariants: existing `CLAUDE.md` keeps its original bytes as a prefix
    (unchanged wording, now also covering the pointer); "the PRD hint
    appears only when…" → "the setup PRD has the migrate section only when
    PRDs without State exist; the action table is the same either way".
- MODIFIED `docs/specs/prd-lifecycle.md` §Behavior 10 New repos:
  bootstrap also writes the setup PRD and pointer (no migrate section).

## Acceptance criteria
- [x] Empty repo adopt: `docs/prd/repo-setup.md` exists with Status
      APPROVED, 3 `[ ]` items and no migrate section; it has a PRD index
      row; `CLAUDE.md` ends with exactly one pointer line; the printed
      next steps are one line.
- [x] Repo with 2 PRDs without State: the setup PRD has a 4th item naming
      2 PRDs; the action table is identical to the empty-repo table.
- [x] Existing `CLAUDE.md`: its original bytes are a prefix of the result.
- [x] Re-run before merge, after merge, and after the setup PRD is
      archived: "nothing to adopt", no diff.
- [x] `--dry-run` table equals the real run's table.
- [x] Archiving a PRD with `/implement-prd-section` removes its pointer
      lines, and only those; a `CLAUDE.md` with no pointer is byte-identical
      after the archive.
- [x] Bootstrap: a new repo gets the setup PRD (3 items) and the pointer;
      no template PRDs remain.
- [ ] A fresh Claude session in an adopted repo, asked "continue setup",
      runs `/implement-prd-section docs/prd/repo-setup.md` (manual check,
      recorded in the PR).
- [x] `scripts/quiet-check.sh adopt` covers the scripted criteria and
      passes; adopt full run stays <5 s.

## Rollout & metrics
- Pilot: adopt hypertrophy-goals (or a scratch repo) and drive setup to
  archive.
- Success: after archive, `CLAUDE.md` has no pointer and no setup text; the
  owner typed no setup command other than "continue setup".

## State (updated 2026-10-02)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [x] 1. Pointer removal on archive · PR #30 merged
  - [x] 2. Adopt writes the setup PRD · PR #31 merged
  - [x] 3. Bootstrap writes the setup PRD · feat/repo-setup-bootstrap-writes-setup-prd · PR #35
- Branch / open PRs: `feat/repo-setup-bootstrap-writes-setup-prd` (§3)
- Completed: PRD drafted; §1 pointer removal on archive; §2 adopt writes
  the setup PRD (`claude-home/templates/repo-setup.md`, `adopt.sh`
  `decide_setup`/`setup_prd`/`add_index_row`, one-line next steps); §3
  bootstrap writes the setup PRD, index row and pointer via the shared
  `claude-home/lib/setup-prd.sh` (adopt sources it too).
- Folded: §1 (prd-lifecycle §Behavior 6–7, §Data & contracts, §Invariants);
  §2 (adopt §Behavior 3 + 8, §Data & contracts, §Invariants); §3
  (prd-lifecycle §Behavior 10; adopt §Data & contracts gains the lib).
- Tests run + result: `scripts/quiet-check.sh adopt` 104 passed (6 new
  bootstrap checks, all failing on the old script); adopt full run on an
  empty repo 0.40 s (budget <5 s).
- Remaining: none. Manual "continue setup" check is the owner's, recorded
  on the shipping PR.
- Next action: merge PR #35 (none left after).

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
- 2026-10-02 — restored §2 item 2 through Rollout, which PR #30's State
  edit overwrote (it matched the inline "`## State`" in §2 item 2). That
  text now reads "State block" so it no longer looks like a heading.
- 2026-10-02 — §2 built. Template placeholders are `{{DATE}}`, `{{SOURCE}}`
  (adopt/bootstrap), `{{OWNER}}`, `{{N}}` and a `{{MIGRATE}}` line prefix.
  Rows: a live setup PRD → `unchanged`; archived → `unchanged … (archived)`;
  absent with nothing else to adopt → `skipped`. An existing
  `docs/prd/README.md` gets the index row only if it has an `## Index`
  table.
- 2026-10-02 — §3 built: bootstrap writes the setup PRD (no migrate
  section), its index row and the pointer after its docs cleanup and
  before removing `claude-home/`; its `next:` line is adopt's one-liner.
  The setup-PRD helpers moved from `adopt.sh` to
  `claude-home/lib/setup-prd.sh`, sourced by both. SHIPPED and archived.
