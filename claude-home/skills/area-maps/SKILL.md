---
name: area-maps
description: Measure a repo for area maps, write one, or audit stale ones. Area maps are ≤4k-token <dir>/CLAUDE.md files holding an area's purpose, contracts and anti-patterns, indexed in the root CLAUDE.md §Area maps. Use when asked to add/update an area map or intent layer, when agents keep re-exploring the same directory, or to check maps after a feature lands.
argument-hint: measure [path] | write <dir> | audit
---

# area-maps

`$ARGUMENTS` → `MODE [PATH]`. No mode: run `measure`, show the table, and
ask which directory (if any) to write. Scripts are in this skill's
`scripts/` directory. They do all the counting; never estimate tokens
yourself.

## measure [path]
Run `scripts/measure.sh <path or repo root>` and show its table verbatim.
Verdicts: `map` (20–64k tokens, unmapped): worth a map. `split` (>64k):
map its subdirectories instead. `has-map`: fine. `map-over-cap` (map >4k):
trim it. Directories under 20k aren't listed and don't get maps. Test and
fixture directories are excluded. Map one only if the owner points at it.

## write <dir>
1. Run `measure.sh`. If `<dir>` isn't listed as `map` or `split`, say so
   and stop, unless the owner confirms a responsibility boundary justifies
   a map anyway.
2. Draft from the repo per `references/capture.md` (one Bash call, several
   `sed -n` ranges; read each file once). Follow `references/template.md`.
3. Ask the owner only the capture questions the draft can't answer from
   evidence (≤4, one AskUserQuestion call).
4. Write `<dir>/CLAUDE.md`. Add the index line to the root CLAUDE.md
   `## Area maps` (replace `- (none yet)`). Repo-wide invariants go to
   `## Hard gotchas`, not the map.
5. Re-run `measure.sh` and quote the `has-map` row (it must not say
   `map-over-cap`).
6. Behavior-preserving docs change: commit on the current feature branch,
   or a `docs/` branch off `main`. No test runs.

## audit
Run `scripts/audit.sh`. For each map it lists, read the changed files'
diffs since the map's commit (`git diff <sha> -- <file>`, only the hunks
you need) and propose map edits as a diff for the owner. Never rewrite a
map silently. Maps it doesn't list are current.

## Rules
- A map records intent: what grep can't tell an agent. No file
  inventories, no copied README tables.
- Maps load automatically when files under them are read. Don't Read a map
  that's already in context.
- Global rule: a change to a mapped area's contracts, entry points or
  invariants updates its map in the same PR.

Adapted from crafter-station/skills `intent-layer` (MIT; see `LICENSE`).
