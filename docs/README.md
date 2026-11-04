# Where docs go

Decide by who reads a doc and when. `doc-lint.sh` checks it.

| Kind | Goes to |
|---|---|
| Current truth: contracts, architecture, design rules, budgets | `docs/specs/<capability>.md` |
| Orientation for agents editing a directory | `<dir>/CLAUDE.md`, listed under root `## Area maps` |
| Work not yet done: features, plans with items left | `docs/prd/<name>.md` |
| Evidence, studies, settled proposals, decision logs | `docs/research/<topic>.md` (a study keeps its folder) |
| Finished, superseded or dropped plans | `docs/prd/archive/YYYY-MM-<name>.md` |
| Procedures an agent runs | `.claude/skills/<name>/SKILL.md` |
| How-to for one directory's tool | that directory's `README.md` |
| How-to for humans with no owning directory | `docs/guides/<task>.md` (created on first need) |
| Tool-written records | where the tool writes them, listed in `docs/.doc-allow` |
| Images and HTML a doc uses | `assets/` beside that doc |

Only this file, `FEATURES.md` (generated) and `.doc-allow` sit directly in
`docs/`. `docs/.doc-allow` holds one `<glob>  # <reason>` per line.
Existing docs: `/migrate-prds inventory` lists them as `doc:<kind>` rows.
