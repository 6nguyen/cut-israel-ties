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
| [action-router.md](action-router.md) | Address → delegation → ranked goals, goal pages, prep, donate/about | `web/src/pages/`, `worker/src/route.ts`, `worker/src/ranking.ts`, `worker/src/prep.ts` |
| [personalised-documents.md](personalised-documents.md) | Act page → screened, generated document → receipt and report | `web/src/components/ActForm.tsx`, `worker/src/generate.ts`, `worker/src/anthropic.ts` |

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
