# One master feature list with lifecycle state
Researched: 2026-10-02 · Informs: [feature-list](../prd/archive/2026-10-feature-list.md)

## Question
Every repo built from llm-repo-template should have one list that tells a
human or an agent which features exist and where each one is in its life:
shipped, pinned (built, next iteration queued), planned, in progress,
deprecated. Today that state is scattered across five places: PRD line 2
`Status:`, the PRD `## State` `Sections:` markers, the `docs/prd/README.md`
index (open changes), the `docs/specs/README.md` index ("the feature set")
and `docs/prd/archive/`. The owner's hand-written `docs/PRD.md` in
hypertrophy-goals (hg) shows the shape they like: one file, a `## Shipped`
section with `###` per capability, an inline `PINNED` marker, and an ordered
`## Planned` list. This file decides the design.

## Recommendation in one paragraph
Generate `docs/FEATURES.md` with `scripts/features.sh`; never hand-edit it.
It is a pure view joined from the records that already carry the truth:
specs (what works today), open PRD Status lines and `Sections:` progress
(what is changing), each PRD's `## Spec delta` (which capability a change
targets, and whether it retires one), the archive (what was removed), and
one new hand-maintained input, a short ordered `## Next` table in
`docs/prd/README.md` for ideas that have no PRD yet. Six states, all
derived: PLANNED, BUILDING, PINNED, SHIPPED, DEPRECATED, REMOVED. Agents
load it on demand through one root `CLAUDE.md` Repo map line, not on every
request. `features.sh --check` runs inside `prd-lint.sh`, so a stale file
fails the same gate every PRD commit already passes.

## 1. What existing practice does

| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| `specs/` = current truth, `changes/` = open proposals, `changes/archive/` = done; status view generated from the folders | OpenSpec (`openspec list`, `openspec view`, `openspec status`) | Adopt | Our docs/specs + docs/prd + archive already mirror it; the missing piece is exactly OpenSpec's generated dashboard. |
| REMOVED delta that empties a spec retires the capability and deletes its file | OpenSpec concepts (`retire_capabilities`) | Adopt | Gives deprecated and removed a home without adding a status line to specs. |
| Numbered `specs/NNN-feature/` folders per feature, no global state view | GitHub spec-kit | Reject | Numbering adds nothing for status; spec-kit has no product-level state list to copy. |
| Deprecated (still works, going away) then Removed, as two separate entries | Keep a Changelog | Adapt | Take the two-step vocabulary; reject a hand CHANGELOG, since the archive plus git log already hold history. |
| Per-change fragments, the shared file is built from them, because a shared hand-edited file conflicts on every parallel PR | towncrier, changesets, reno | Adopt (principle) | The PRD Status line is our fragment; the master list must be built, not edited, or every PRD PR conflicts on it. |
| Project statuses Backlog / Planned / In Progress / Paused / Completed / Canceled, set by hand, not changed automatically when issues finish | Linear | Adapt | Same categories; reject manual status (Linear itself notes it does not auto-complete, which is drift) and reject Paused (split the PRD instead, see §3). |
| Freely customizable feature statuses (Candidate, Launched, plus custom) | Productboard | Reject | A template needs a fixed vocabulary that scripts and lint can check. |
| Exploring / In design / Preview / GA phases on a board generated over issues | GitHub public roadmap | Adapt | Keep "board is a view over the records"; reject Preview/GA maturity stages, which need user cohorts these repos do not have. |
| No backlog: pitches that are not bet on are discarded, old ones revived only on purpose | Basecamp Shape Up | Adapt | The `## Next` table is capped (≤10 rows) and ordered; dropped ideas are deleted, not parked. |
| Status lives in each record; the index is generated (`adr generate toc`) | ADRs, adr-tools | Adopt | Same rule: status in the PRD, list generated. |
| Proposal status (provisional, implementable, implemented, deferred, rejected, withdrawn, replaced) kept apart from feature stage (alpha, beta, stable), in machine-read `kep.yaml` validated by tooling | Kubernetes KEPs | Adopt / reject | Adopt the split between change status (PRD Status) and capability state (master list), and tool validation; reject alpha/beta/stable stages. |
| Required `spec.lifecycle` (experimental, production, deprecated) with a taxonomy the org must keep strict | Backstage catalog | Adapt | Deprecated as a first-class state checked by lint; reject experimental. |
| Lifecycle stages Define, Develop, Production, Cleanup, Archived, derived from observed metrics | Unleash flags | Adopt (principle) | State derived from evidence, not typed; the stages map almost one to one onto ours. |
| Generated tables Feature / Default / Stage / Since / Until, removed gates on a separate page | Kubernetes feature gates docs | Adapt | Take an `Updated` date column and a short Removed tail; skip Default/Until. |

## 2. Hand-maintained versus generated

Hand-maintained file (the hg model):
- Drift: high. Every status change must be made twice, once in the PRD and
  once in the master; nothing fails when they disagree. hg already shows it:
  `PINNED` is a free-text marker whose next iteration lives in a different
  section with no link back except prose ("top of the pin list").
- Merge conflicts: every PRD PR edits the same file, which is exactly the
  failure that pushed changelog tooling to fragments.
- Token cost per read: lowest possible (one file), same as generated.

Generated from records:
- Drift: none by construction, as long as a check fails when the committed
  file differs from a fresh run.
- Conflicts: rows are one line each, sorted deterministically; a conflict is
  resolved by re-running the script, never by hand.
- Token cost: one file of ≤2k tokens versus today's reconstruction (two
  indexes plus line 2 and the State block of every open PRD, roughly 5k to
  15k tokens, and an agent still cannot see removed features without
  opening the archive, which it must never do).
- Cost: one script (~150 lines of bash/awk, same style as `prd-lint.sh`) and
  one stricter `## Spec delta` grammar.

Not committing the file at all (generate on demand) also has zero drift,
but GitHub then shows humans nothing, and every agent read pays a script
run. Committed plus `--check` gives both.

Decision: generated and committed, with exactly one new hand input (the
`## Next` table), which lives beside the PRD index it feeds, so the master
file itself is 100% generated and `--check` is a plain diff.

## 3. State vocabulary

Six capability states. Each is derived; none is typed by hand.

| State | Meaning | Derived from |
|---|---|---|
| PLANNED | Not built, queued | A `## Next` row with no spec target, or an open PRD with Status `DRAFT`/`APPROVED`, no `[x]`/`[~]` section, whose delta ADDs a whole new spec |
| BUILDING | Being built or changed now | An open PRD with Status `BUILDING` (lint makes any `[x]`/`[~]` section imply it). A spec link in the row means the current version still works |
| PINNED | Shipped, next iteration queued but not started | Spec exists, and an open non-BUILDING PRD MODIFIES it or a `## Next` row targets it |
| SHIPPED | Works today, nothing queued | Spec exists, nothing open targets it |
| DEPRECATED | Still works, removal decided | Spec exists, and an open PRD's delta has a whole-file `REMOVED \`docs/specs/<x>.md\`` |
| REMOVED | Gone | No spec; an archived `SHIPPED` PRD carries that whole-file REMOVED. Last 10 shown |

Precedence when several changes target one spec: DEPRECATED > BUILDING >
PINNED > SHIPPED.

Mapping onto PRD Status (the PRD vocabulary is unchanged):
- `DRAFT`, `APPROVED` → PLANNED (new capability) or PINNED (existing spec).
- `BUILDING` → BUILDING.
- `SHIPPED` → the PRD is archived; the capability shows as SHIPPED through
  its spec, or REMOVED if the PRD retired it.
- `SUPERSEDED by`, `DROPPED` → not listed. They never shipped; the archive
  holds them.

Where deprecated and removed live:
- Deprecating is a change, so it is a PRD whose `## Spec delta` is one
  whole-file `REMOVED` entry (OpenSpec's retire rule). While that PRD is
  open the capability is DEPRECATED and its spec stays as is, which keeps
  the "no status line in specs" rule intact.
- Shipping that PRD folds the delta, which means `git rm` of the spec file
  and its specs index row. The archived PRD is then the only record; the
  generator (a script, not an agent) reads the archive's deltas to list the
  last 10 REMOVED rows with dates. Older removals live only in the archive.
- Partial removal (one § of a spec) is ordinary MODIFIED/REMOVED § work and
  makes the capability PINNED or BUILDING, not DEPRECATED.

Pinned in practice: hg's `Onboarding PINNED` plus "Wire the sculpt into the
engine (top of the pin list)" becomes spec `onboarding.md` plus a `## Next`
row targeting it, so PINNED is computed and the link between the pinned
feature and its next iteration is explicit.

No Paused state: a BUILDING PRD that stops is split with `migrate-prds
split` (fold what merged, the rest becomes an APPROVED change PRD), which
turns it into PINNED. Lint warns when a BUILDING PRD's State date is older
than 30 days.

## 4. The file

Location: `docs/FEATURES.md`. Upper case marks it as a top-level read like
README or CHANGELOG; it sits beside `prd/`, `specs/` and `research/`.

Shape (whole file):

```markdown
# Features
<!-- generated by scripts/features.sh from docs/specs, docs/prd, docs/prd/archive; do not edit -->
2 building · 1 pinned · 3 planned · 9 shipped · 0 deprecated · 1 removed

| Feature | State | What it does | Spec | Change | Updated |
|---|---|---|---|---|---|
| workout-logger | BUILDING | Log sets from your last session, rest timer, PRs | [spec](specs/workout-logger.md) | [train-tab-v2](prd/train-tab-v2.md) 2/5 | 2026-09-30 |
| onboarding | PINNED | Mirror, Sculpt and commitment gauge set the goal | [spec](specs/onboarding.md) | Next #1 | 2026-08-19 |
| photo-silhouette | PLANNED | 3 photos set Mirror params automatically | - | Next #3 | - |
| data-platform | SHIPPED | Ingest weight, Health, Hevy, DEXA on a $0 Mac host | [spec](specs/data-platform.md) | - | 2026-07-02 |
| bia-import | REMOVED | VeSync BIA ingestion | - | [archive](prd/archive/2026-09-retire-bia.md) | 2026-09-12 |
```

Columns:
- Feature: spec file stem; for a not-yet-specced change, the PRD stem; for
  a Next idea, its slug.
- State: one of the six.
- What it does: the specs index `Capability` cell, else the PRD H1 title,
  else the Next row's idea text; cut at 60 characters.
- Spec: link, or `-` when nothing works yet (PLANNED, REMOVED).
- Change: open PRD link plus Status token or `Sections:` progress `k/n`, or
  `Next #n`, or the archive link for REMOVED, or `-`.
- Updated: PRD `Last updated`, else the last git commit date of the spec
  (`git log -1 --format=%as`), else `-`.

Sort: state in the order BUILDING, PINNED, DEPRECATED, PLANNED (Next order,
then PRDs by name), SHIPPED (by name), REMOVED (newest first, max 10).
Deterministic, so two runs on the same tree are byte-identical.

Size budget: ≤60 rows and ≤2k tokens (about 30 tokens per row). Over 60
rows the script fails `--check` with "split capabilities or trim REMOVED";
a repo that big should be grouping specs anyway.

How agents load it: on demand, never through `@import`. One root
`CLAUDE.md` Repo map line: "`docs/FEATURES.md`: generated feature list and
lifecycle state; read before proposing a PRD or answering what exists."
Every line of an always-loaded file is paid on every request, and most build
sessions only need their own PRD range. Consumers that must read it: PRD
creation (overlap check and the Spec delta target), `migrate-prds
inventory`, and `/handoff` (prints the row it changed).

New hand input, in `docs/prd/README.md`:

```markdown
## Next (ideas without a PRD, in intended order; ≤10)
| # | Idea | Targets | Notes |
|---|---|---|---|
| 1 | Wire the sculpt into the engine | onboarding | [research](../research/sculpt-engine.md) |
| 2 | Settings cleanup | settings | |
```

`Targets` is an existing spec stem (makes it PINNED) or `new` (PLANNED).
Writing the PRD deletes the row in the same commit; dropping an idea deletes
it (Shape Up: no parked backlog).

## 5. What keeps it true

`scripts/features.sh` (copied by `bootstrap.sh` and `adopt.sh`):
- default: rewrite `docs/FEATURES.md`.
- `--check`: exit 1 with `docs/FEATURES.md: stale, run scripts/features.sh`
  when a fresh render differs.
- `--json`: same rows for skills and the session analyzer.

Inputs and their parse rules:
- `docs/specs/*.md` (minus README) and the specs index rows.
- `docs/prd/*.md` line 2 `Status:` and `Last updated`, `Sections:` markers
  (via `state.sh get`), and `## Spec delta` entries.
- `docs/prd/README.md` `## Next` rows.
- `docs/prd/archive/*.md` line 2 and `## Spec delta` (script only).

Lint additions (`prd-lint.sh`, which already runs before every PRD commit):
1. Spec delta grammar: each entry starts `ADDED|MODIFIED|REMOVED` then a
   backticked `docs/specs/<x>.md`, then an optional `§`. No `§` means whole
   file. `none — <reason>` stays allowed.
2. Status consistency: an `[x]` or `[~]` section requires Status `BUILDING`;
   Status `BUILDING` with State older than 30 days prints a split warning.
3. Specs index and `docs/specs/*.md` match one to one (no orphan file, no
   dead row).
4. Every `## Next` row's `Targets` is an existing spec stem or `new`; ≤10
   rows.
5. When `docs/FEATURES.md` exists, run `features.sh --check`.

Writers that regenerate in the same commit: `state.sh set` (progress
changes), the ship step of `/implement-prd-section` (archive, fold, spec
add or delete), `/handoff`, and `migrate-prds fold`/`split`. A
`quiet-check.sh features` target runs `--check` for CI.

Merge conflicts: two open PRs that change different rows touch different
lines; a conflict on the same row or the header counts line is resolved by
re-running the script, which the conflict message itself can say via the
generated comment line.

Spec home for the capability itself: a new `docs/specs/feature-list.md`
(template only) plus 3 lines in `docs/prd/README.md` §Lifecycle, which
bootstrap keeps.

## 6. Migrating a hand-written master PRD (hg `docs/PRD.md`)

Run inside the existing `migrate-prds` flow, after `adopt`:
1. Inventory: `inventory.sh` learns the marker grammar `SHIPPED`, `PINNED`,
   `PLANNED` on `###` headings and in `## Shipped` / `## Planned` sections,
   and lists each heading as a candidate capability with a proposed class.
2. Product-level sections (Vision, Glossary, Users/personas, Non-goals,
   Key artifacts) are not features. They fold into `docs/specs/product.md`:
   Vision as Purpose, personas and glossary copy rules as Behavior and
   Invariants, non-goals as Invariants ("No ETA during goal selection"),
   key artifacts as Data & contracts links.
3. Each `###` under `## Shipped` folds into one `docs/specs/<capability>.md`
   with `migrate-prds fold` (data-platform, analysis-engine, report,
   app-shell, onboarding, workout-logger, quality-gates), plus a specs
   index row.
4. `PINNED` headings fold the same way; their queued follow-up becomes a
   `## Next` row with `Targets: <that spec>` (or a PRD if work is about to
   start). The pin is then derived.
5. `## Planned` items become `## Next` rows in the same order. Multi-bullet
   design notes move to `docs/research/<topic>.md` and the row links them,
   because PRD authors may read research while builds never do. Items over
   the 10-row cap go to the owner to drop or promote.
6. The original `docs/PRD.md` is `git mv`d to
   `docs/prd/archive/YYYY-MM-master-prd.md` with Status `SUPERSEDED by
   docs/FEATURES.md`, and its root `CLAUDE.md` pointer is replaced by the
   FEATURES line.
7. Run `scripts/features.sh`; acceptance is that every `###` heading of the
   old file maps to exactly one row (or to `product.md`), and that
   `prd-lint.sh` passes.

## Open points for the PRD that adopts this
- Whether the specs index and the PRD index should later be generated too,
  leaving the READMEs with rules and templates only. Proposal: yes, in a
  second step, once `What it does` and `Owner surfaces` move into a fixed
  line in each spec or PRD; until then the indexes are inputs.
- Whether `BUILDING` should be set by `/implement-prd-section` on the first
  section. Proposal: yes; lint rule 2 then never fires in normal use.

## Sources
- OpenSpec concepts (specs, changes, archive, delta, retire): https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md
- OpenSpec CLI (`list`, `view`, `status` derived from folders): https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md
- GitHub spec-kit spec-driven method: https://github.com/github/spec-kit/blob/main/spec-driven.md
- Keep a Changelog categories, summarized: https://www.releasepad.io/blog/keep-a-changelog/
- Changelog fragments to stop merge conflicts: https://jmbhughes.com/blog/towncrier/ and https://github.com/kornia/kornia/pull/4513
- Linear project statuses: https://linear.app/changelog/2024-03-19-custom-statuses-for-projects
- Productboard feature statuses: https://support.productboard.com/hc/en-us/articles/360058171114-Customize-status-values-for-features
- GitHub public roadmap phases: https://github.com/github/roadmap
- Shape Up, The Betting Table (no backlog): https://basecamp.com/shapeup/2.2-chapter-08
- ADR status lifecycle and adr-tools TOC: https://github.com/henu-wang/architecture-decision-records
- KEP process and statuses: https://github.com/kubernetes/enhancements/blob/master/keps/sig-architecture/0000-kep-process/README.md and https://github.com/kubernetes/enhancements/blob/master/keps/NNNN-kep-template/kep.yaml
- Backstage descriptor format (`spec.lifecycle`): https://backstage.io/docs/features/software-catalog/descriptor-format/
- Unleash feature flag lifecycle: https://docs.getunleash.io/concepts/feature-flags
- Kubernetes feature gates and deprecation policy: https://kubernetes.io/docs/reference/deprecation-policy/ and https://kubernetes.io/docs/reference/command-line-tools-reference/feature-gates-removed
