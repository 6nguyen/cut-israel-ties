# Area maps

## Purpose
An area map is a short `<area>/CLAUDE.md` that holds one directory's
purpose, contracts and anti-patterns, so agents working there don't re-derive
the architecture by reading code. The global `area-maps` skill measures
which directories earn a map, writes one, and audits stale ones. It does not
document code line by line or replace a directory's README.

## Behavior
1. **Map file.** `<area>/CLAUDE.md` with a `## Purpose` heading (the scripts
   use it to tell maps from other CLAUDE.md files), ≤4k tokens, from the
   skill's `references/template.md`.
   - Purpose goes in the first two lines.
   - Contracts are explicit (never "handle carefully").
   - Anti-patterns come from real incidents or review findings, not
     hypotheticals.
2. **Index.** The project CLAUDE.md `## Area maps` section starts with the
   directive "Before editing code under a mapped area, read its map." and
   lists one line per map: `- <area>: <path> — <one-line purpose>`.
   Cross-cutting invariants go to `## Hard gotchas`, never a new section.
3. **`/area-maps measure [path]`** runs `scripts/measure.sh` and prints a
   table (directory · ~tokens · files · verdict) sorted by path.
   - Directories are evaluated deepest first: a directory's area is its
     tokens minus those claimed by a deeper flagged or mapped directory. A
     map covers its subtree; a covered directory is flagged only past the
     split threshold.
   - Directories under 20k are not listed; a footer gives the remainder.
   - Excluded: `.git`, `node_modules`, build output, `ops/`, test or
     fixture data (`tests`, `test`, `fixtures`, `__tests__`, `*.jsonl`,
     `*.xz`), and `docs` directories (PRDs, specs and research are indexed
     by their own READMEs).
   - Verdicts: `none` (<20k), `map` (20–64k), `split` (>64k), `has-map`,
     `map-over-cap` (map >4k).
   - Read-only; output is byte-identical across runs on the same tree.
4. **`/area-maps write <dir>`**:
   1. Reads the directory's entry points, README and recent `git log`.
   2. Drafts the map.
   3. Asks the owner up to 4 capture questions, only for what the code
      can't answer (invariants with an incident behind them, out-of-scope
      boundaries).
   4. Writes the map and adds the index line.
   5. Runs `measure.sh` to confirm the map is ≤4k tokens.

   Under 20k tokens it says so and stops, unless the owner confirms a
   responsibility boundary justifies a map anyway.
5. **`/area-maps audit`** runs `scripts/audit.sh`: each map with the commit
   count and changed files in its area since the map last changed (working
   tree vs the map's last commit, plus untracked files; a new uncommitted map
   is listed as such). For maps with changes it proposes edits as a diff for
   the owner. It never rewrites silently.
6. **Keeping maps current.** Global CLAUDE.md §Quality bar: a change to a
   mapped area's contracts, entry points or invariants updates its map in
   the same PR. `/handoff` checks it; `/implement-prd-section` loads the map
   once in step 1 (Claude Code also attaches it when files under the area
   are read).
7. **Template repos.** The session-analyzer map
   (`claude-home/tools/session-analyzer/CLAUDE.md`) and its index line are
   template-only; `scripts/bootstrap.sh` removes both with `claude-home/`.

## Data & contracts
- `claude-home/skills/area-maps/`: `SKILL.md`, `scripts/measure.sh`,
  `scripts/audit.sh` (bash 3.2+, POSIX tools), `references/template.md`,
  `references/capture.md`, `LICENSE` (upstream MIT notice, attribution to
  crafter-station/intent-layer).
- `claude-home/install.sh` links every `claude-home/skills/*/` into
  `~/.claude/skills/`.
- Map marker: a `## Purpose` heading in `<dir>/CLAUDE.md`.
- `measure.sh` exit codes: 0 on success (including an empty directory),
  non-zero with an error for a nonexistent path.

## Invariants (regression checklist)
- [ ] After `claude-home/install.sh`, `~/.claude/skills/area-maps` is a
      symlink into the clone.
- [ ] `measure.sh .` on this repo shows `claude-home/tools/session-analyzer`
      as `has-map`, no `sa` row and no `tests` directory.
- [ ] Two consecutive `measure.sh` runs produce identical output.
- [ ] `measure.sh` on an empty directory prints an empty table and exits 0;
      on a nonexistent path it prints an error and exits non-zero.
- [ ] Every map is ≤4k tokens per `measure.sh`, has Purpose in its first two
      lines, and copies no command table from its README.
- [ ] CLAUDE.md has no `## Intent Layer` section; `## Area maps` has the
      directive plus one line per map.
- [ ] A fresh session asked to change `sa/report.py` has the map in context
      without being told about it.
- [ ] `audit` on a branch that edits `sa/` lists the session-analyzer map as
      changed-since; on `main` it reports nothing stale.
- [ ] `claude-home/skills/area-maps/LICENSE` carries the upstream MIT
      notice.
- [ ] `bash -n` passes on `measure.sh` and `audit.sh`.

## Performance budget
- `measure.sh` <2 s on this repo.
- `SKILL.md` ≤80 lines; each map ≤4k tokens.
- CLAUDE.md grows by ≤1 line per map.
