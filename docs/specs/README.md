# Specs — what the app does today

One file per capability: `<capability>.md`. Together they describe the app
as shipped: behavior, contracts and invariants, with no history. Proposals
live in `docs/prd/` as change PRDs; shipping one folds its `## Spec delta`
into these files in the same PR (lifecycle in `docs/prd/README.md`).

Rules:
- No status line, rounds, research or changes log. Reasons and history stay
  in the archived PRD (`docs/prd/archive/`).
- Each file stays under ~4k tokens; past that, split it by sub-capability.
- A bug fix that changes specced behavior edits the spec directly in the fix
  PR and gives the reason in the commit body.
- Tests are the spec you can run. A spec says what and why, not how.

## Index (the feature set)
| Spec | Capability | Owner surfaces |
|---|---|---|
| [adopt](adopt.md) | Bring the per-repo layer into an existing repo as a PR | `claude-home/adopt.sh`, `claude-home/lib/`, `scripts/bootstrap.sh` |
| [area-maps](area-maps.md) | Per-directory `CLAUDE.md` maps: format, measure, write, audit | `claude-home/skills/area-maps`, CLAUDE.md §Area maps |
| [doc-placement](doc-placement.md) | Where each kind of doc goes (`docs/README.md`) | `docs/README.md`, `adopt.sh`, `migrate-prds` inventory |
| [feature-list](feature-list.md) | Generated `docs/FEATURES.md`: every feature with its derived lifecycle state, plus the `## Next` queue | `features.sh`, `docs/prd/README.md` §Next |
| [prd-lifecycle](prd-lifecycle.md) | Change PRDs, spec deltas, fold and archive | `docs/prd/README.md`, `implement-prd-section`, `handoff`, `bootstrap.sh` |
| [prd-fold](prd-fold.md) | Fold shipped PRDs and reference docs into specs, split half-built PRDs | `claude-home/skills/migrate-prds` (`fold.sh`, `sections.py`) |
| [prd-migration](prd-migration.md) | Inventory existing PRDs and docs, move them into place with history and links kept | `claude-home/skills/migrate-prds` |
| [prd-progress](prd-progress.md) | PRD `Sections:` tracking: auto-pick, reconcile, backfill, bootstrap | `claude-home/skills/implement-prd-section`, `claude-home/skills/handoff`, `docs/prd/README.md` State template |
| [research](research.md) | `docs/research/`: evidence behind PRDs, header and supersede rules, never read by builds | `docs/research/README.md`, prd-lint, `implement-prd-section`, `adopt.sh`, `bootstrap.sh` |

## Template (copy for a new capability)

```markdown
# <Capability>

## Purpose
One paragraph: what this does for the user and where it stops.

## Behavior
Numbered, screen by screen or command by command: what the user sees, what
they can do, what happens next, edge cases (empty data, offline, first run).

## Data & contracts
Endpoints, models, settings keys, file formats, persisted state.

## Invariants (regression checklist)
- [ ] Checkbox list a tester can verify without reading code.

## Performance budget
The numbers this capability must hold (from CLAUDE.md §Performance budgets).
```
