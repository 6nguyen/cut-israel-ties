# Research — how the work gets done

PRDs in `docs/prd/` plan work: what gets built, in what order, how far along
it is. Files here hold the evidence behind those plans: tool and model
comparisons, cost arithmetic, design proposals, market studies. Specced in
`docs/specs/research.md` (template repo only).

Rules:
- One file per question: `<topic>.md`, no `research-` prefix and no date in
  the name. Images used only here go in `assets/`. A study made of several
  files (rounds, teardowns) is one folder `<topic>/`: every file in it has
  the header, and the index has one row for the folder.
- Header, lines 1 to 3:
  ```
  # <Title>
  Researched: YYYY-MM-DD · Informs: <prd links or "none yet">
  Supersedes: <file> (<what>)          ← or `Superseded by: <file> on YYYY-MM-DD (<what>)`, optional
  ```
- A new direction is a new file. An old file is never rewritten to match
  newer findings; it only gains the `Superseded by` line. The newer file has
  a `## What changed from <file>` section.
- A design proposal whose decisions are made gets `Decided in <prd> on
  YYYY-MM-DD.` and is not edited after.
- Builds (`/implement-prd-section`) never read this folder. A PRD links the
  research it relies on and states every decision itself.
- Everything below the header is free-form.

## Index
| Research | Question | Researched | Informs |
|---|---|---|---|
| [reference-docs](reference-docs.md) | Where contracts, architecture, maps, plans and how-tos go, and how to split big reference docs | 2026-10-02 | [migrate-docs](../prd/archive/2026-10-migrate-docs.md) |
| [feature-list](feature-list.md) | Which features exist and in what lifecycle state, kept in one generated list | 2026-10-02 | [feature-list](../prd/archive/2026-10-feature-list.md) |
