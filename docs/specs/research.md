# Research

## Purpose
`docs/research/` holds the evidence behind PRD decisions, apart from the PRDs
that plan the work. PRDs say what gets built; research says how it is best
done and why. A build reads the PRD, never the research.

## Behavior
1. **Layout.** One markdown file per question, `docs/research/<topic>.md`,
   with no `research-` prefix. `docs/research/README.md` states the rules and
   indexes every file (columns Research, Question, Researched, Informs).
   Images used only by research live in `docs/research/assets/`. A study
   made of several files (rounds, teardowns) is one folder
   `docs/research/<topic>/`; every file in it has the header, and the index
   has one row for the folder.
2. **Header.** Line 1 `# <Title>`, line 2
   `Researched: YYYY-MM-DD · Informs: <prd links | none yet>`. One optional
   line 3: `Supersedes: <file> (<what>)` or
   `Superseded by: <file> on YYYY-MM-DD (<what>)`. Below the header the
   file is free-form; there is no research lint.
3. **Evolution.** A new direction is a new file. An old file is never
   rewritten to match newer findings; it only gains `Superseded by`. A file
   that revisits an earlier one has a `## What changed from <file>` section.
4. **Decided proposals.** A design proposal whose decisions have been made
   gets `Decided in <prd> on YYYY-MM-DD.` and is not edited after.
5. **PRD link.** The PRD template's `## Research` section opens with
   `Relies on:` links to the research files and keeps the adopt / adapt /
   reject table as the summary. The PRD states every decision a build needs.
6. **Builds never read research.** `/implement-prd-section` lists
   `docs/research/` under "Do NOT read". If a build stalls for lack of a
   research fact, that fact moves into the PRD.
7. **Not in `docs/prd/`.** prd-lint reports a `docs/prd/research-*.md` file
   as `<file>:1: research belongs in docs/research/` and runs no other check
   on it; it is in the default file set.
8. **New repos.** `adopt` copies `docs/research/README.md` with its index
   rows removed (skipped when present); `bootstrap.sh` keeps it and empties
   its index. The `CLAUDE.md` skeleton's repo map names `docs/research/`.
9. **Global rule.** `claude-home/CLAUDE.md` §Agents sends long-form agent
   research to `docs/research/<topic>.md`.

## Data & contracts
- Paths: `docs/research/<topic>.md`, `docs/research/<topic>/<file>.md`
  (study folder), `docs/research/README.md`,
  `docs/research/assets/`.
- Header lines as in Behavior 2; `·` separates the two line-2 fields.

## Invariants (regression checklist)
- [ ] prd-lint: `docs/prd/research-x.md` → exactly one violation, the
      research message.
- [ ] Fresh `adopt` creates `docs/research/README.md` with an empty index,
      and the repo map names `docs/research/`.
- [ ] `bootstrap.sh` leaves `docs/research/README.md` as the only file in
      `docs/research/`.
- Covered by `scripts/quiet-check.sh prd-guard` and `adopt`.
