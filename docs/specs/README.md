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
| [action-router.md](action-router.md) | Address → delegation → two ranked goal cards, return visit, targets per goal | `web/src/pages/index.astro`, `web/src/pages/results.astro`, `worker/src/route.ts`, `worker/src/ranking.ts` |
| [goal-pages.md](goal-pages.md) | Goals overview, goal detail and prep pages, goal lifecycle, donate/about/privacy, state goal copy | `web/src/pages/goals/`, `web/src/pages/donate.astro`, `worker/src/prep.ts`, `worker/src/state-copy.ts` |
| [personalised-documents.md](personalised-documents.md) | Act page → screened, generated document → receipt and report | `web/src/components/ActForm.tsx`, `worker/src/generate.ts`, `worker/src/anthropic.ts` |
| [standard-scripts.md](standard-scripts.md) | Deterministic fallback document: per-action template or seeded script-block composition, leader line, same output check | `worker/src/standard.ts`, `worker/src/compose.ts`, `data/script_blocks/` |
| [maintainer-tooling.md](maintainer-tooling.md) | Draft a sourced position row, weekly report digest by email, seed `data/` into D1 | `worker/scripts/draft-position.ts`, `worker/src/digest.ts`, `worker/scripts/seed.ts` |
| [deployment.md](deployment.md) | Merge → Worker + D1 seed + Pages deploy, PR previews, rollback, variable table | `.github/workflows/deploy.yml`, `worker/scripts/render-deploy-config.ts`, `web/functions/api/[[path]].ts` |
| [on-device-districts.md](on-device-districts.md) | Browser location → district on the device, per-state TopoJSON built from TIGER/Line | `scripts/build-districts.ts`, `web/src/lib/pip.ts`, `web/public/districts/` |
| [commitment-funnel.md](commitment-funnel.md) | Private commitment and captain list after a receipt, "Your week" checklist, `.ics` reminder, share after a completed list | `web/src/components/Funnel.tsx`, `web/src/components/YourWeek.tsx`, `web/src/lib/commitments.ts`, `web/src/lib/ics.ts` |
| [member-pages.md](member-pages.md) | Roster import, member page with contact and position, whip count table, sitemap | `worker/scripts/import-members.ts`, `worker/src/whip.ts`, `web/src/pages/m/`, `web/src/pages/goals/[slug]/whip.astro` |
| [target-cards.md](target-cards.md) | One spec 06 card per target (badge, name, role line, call square) on `/results` and the goal page | `web/src/components/Target.tsx`, `web/src/components/GoalTargets.tsx` |
| [countdown-stamp.md](countdown-stamp.md) | Ticking DD HH MM SS stamp on result cards, `/results` and the act page from `decision_at` / `decision_date` | `web/src/components/Countdown.tsx`, `data/goals/` |
| [district-counters.md](district-counters.md) | This week's receipt counts per district and state on cards and member pages, hidden below a threshold; receipt abuse limits and `ip_hash` | `worker/src/counts.ts`, `web/src/components/Counts.tsx` |
| [electoral-record.md](electoral-record.md) | One-seat sourced record before a 2028 primary: member's positions and votes, primary date and filing deadline, one ask | `worker/src/electoral.ts`, `worker/scripts/make-primary-goal.ts`, `data/elections.csv` |
| [decision-feed.md](decision-feed.md) | Public `.ics` feed of decision dates, subscribe line on `/goals` and goal pages | `web/src/pages/feeds/decisions.ics.ts`, `web/src/components/SubscribeLine.astro`, `web/src/lib/ics.ts` |
| [office-visits.md](office-visits.md) | List a district-office visit, maintainer approval from the digest, "I'll come" with the contact handed only to joiners, personal-data screen | `worker/src/visits.ts`, `web/src/components/Visits.tsx`, `web/src/components/VisitForm.tsx`, `web/src/lib/visits.ts` |

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
