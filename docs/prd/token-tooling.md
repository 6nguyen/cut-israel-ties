# Token tooling (rtk, ponytail, caveman) — PRD
Status: APPROVED · Phase 1 LIVE (experiment E1, verdict pending) · Owner: George Nguyen · Last updated: 2026-10-01

## Problem
Every byte a tool returns is re-read on every later request. `quiet-check.sh`
already trims build/test output, but ad-hoc Bash (`git`, `ls`, `find`, `gh`,
`grep`) still returns raw output, and agents still write more code than the
task needs. Three third-party tools claim to fix parts of this: rtk (Bash
output compression), ponytail (minimal-code rules), caveman (terse prose +
an input-compressing proxy). The authors' own benchmarks are the only
evidence so far: rtk reports 60–90% smaller Bash output, ponytail −22% tokens
(Haiku, 12 tasks), caveman −33% input. None of these numbers was measured on
our sessions, and adopting all three at once would make it impossible to
tell which one helped, or which one hurt quality.

## Goals / Non-goals
- Goals:
  1. Lower CRE/EOU (session-analyzer) with no regression in lead time or
     owner actions/EOU, the axes `sa/verdict.py` already guards.
  2. Install each adopted tool through `claude-home/install.sh`, so every
     repo on the machine gets it, idempotently and with a one-command off
     switch.
  3. Roll the tools out one at a time, each behind a `session-analyzer mark`
     experiment, and keep or revert each one on its verdict.
- Non-goals:
  - The caveman skill. The Concise output style and the global CLAUDE.md
    §Communication rules already give terse prose, and the skill adds about
    1k tokens of overhead per session.
  - The caveman proxy. It overlaps rtk, and it sits in the path of all API
    traffic, including the key. It is reconsidered only per Open question 3.
  - Compressing Read/Grep/Glob results. Neither rtk nor ponytail covers
    them, and the area maps already target re-exploration.
  - Writing our own compressor. If rtk fails its experiment, we revert it.
    We don't fork it.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| PreToolUse(Bash) rewrite to a filtering CLI | rtk | Adopt | Deterministic, local, no model call, no per-turn prompt cost |
| `rtk init -g` edits settings.json itself | rtk | Adapt | install.sh owns every settings.json write; it merges the hook via `session-analyzer install-hook` instead |
| Minimal-code decision ladder (skip → reuse → stdlib → minimum) | ponytail | Adapt | Fold it into the CLAUDE.md §Quality bar as ≤3 lines; don't inject a ruleset every turn (decided 2026-10-01) |
| Terse-prose skill | caveman | Reject | Duplicates the Concise style and §Communication; fixed overhead per session |
| Local proxy compressing tool results before the API | caveman | Reject (for now) | Overlaps rtk on Bash output; MITM on all API traffic; double compression hides what the model saw |
| Keep originals recoverable after compression | caveman proxy, quiet-check | Adopt | A filtered failure must still be reachable without a re-run |

## Users
- **Owner (George):** runs `install.sh` once per machine, reads the weekly
  report, and decides KEEP/REVERT. Needs a single kill switch and a clear
  verdict line.
- **Agents (main thread + subagents):** see filtered Bash output. They need
  full failure detail when a command fails, and a way to get raw output
  when the filtered view isn't enough.

## Expected behavior
### Phase 1 — rtk (Bash output)
1. `install.sh` checks for `rtk` on PATH and a version at or above the
   pinned minimum.
   - Missing or too old: print one `WARN:` line with the install command
     (`brew install rtk`), skip the hook, and exit 0. The installer never
     installs binaries.
   - Present: merge one PreToolUse(Bash) hook via
     `session-analyzer install-hook`. The hook runs our wrapper, which
     applies the kill switch (step 5) and the pass-through rules (step 3),
     then delegates to rtk's own native hook, `rtk hook claude` (rtk ≥ 0.50.0;
     the older `hooks/claude/rtk-rewrite.sh` is gone). Re-running
     the installer changes nothing. `jq` is required too; the same
     missing-tool WARN rule applies.
   - At most one PreToolUse(Bash) hook may return `updatedInput`. If
     settings.json already has another hook from a known rewriter, print a
     WARN and skip adding ours (see the 2026-10-01 entry under Changes).
2. The hook rewrites a Bash command to its `rtk` form only when rtk has a
   filter for that command. Everything else passes through unchanged.
3. Pass-through, never rewritten:
   - `scripts/quiet-check.sh …`, which is already summarized.
   - Pipelines and redirects whose output the agent shaped itself
     (`| head`, `| tail`, `> file`, `sed -n`).
   - Any command prefixed with `RTK_RAW=1`, the agent's escape hatch.
4. When the command fails, the agent sees the exit code and full stderr. If
   rtk truncated stdout, the output names a recall hash
   (`[+N hidden: rtk recall <hash>]`), and `rtk recall <hash>` returns the
   full copy, so the agent recalls it instead of re-running the command.
5. Kill switch: `touch ~/.claude/token-tooling.off`. Every phase's hook
   checks this file and exits 0 without rewriting. `rm` turns the hooks
   back on. No reinstall either way.
6. On the day the hook first lands, `install.sh` prints the exact command
   to start the experiment:
   `session-analyzer mark rtk --expect CRE/EOU:down`.
   The owner runs it. The installer never starts experiments itself.

### Phase 2 — minimal-code ladder (starts only after Phase 1 has a final verdict; CLAUDE.md lines, not the plugin — decided 2026-10-01)
7. Add ≤3 lines to the `claude-home/CLAUDE.md` §Quality bar. Before writing
   code: (a) skip it if the task doesn't need it, (b) reuse existing code,
   (c) use the stdlib or a native feature, (d) only then write the minimum.
   Validation, security and accessibility are never cut.
8. Add a `sa/rules_map.json` entry with `effective_since` = merge date, so
   compliance and recommendations start from that date (area-map
   anti-pattern).
9. Owner runs `session-analyzer mark ponytail-ladder --expect CRE/EOU:down`.

### Phase 3 — re-evaluate (no code by default)
10. After both verdicts, the weekly report decides whether Phase 3 is
    needed. The caveman proxy is reconsidered only per Open question 3.

### Edge cases
- rtk is upgraded and drops or renames a filter: the command passes
  through raw. That is the safe failure.
- The hook binary is missing, for example after the owner uninstalls rtk:
  the wrapper checks `command -v rtk` and exits 0.
- A catalog `enforce-rule` hook (today `sa-quiet-check-guard.py`) blocks
  the same command. Both hooks see the original command, and the block
  wins (deny > allow). The rewrite is discarded and the agent gets the
  guard's message. Verified 2026-10-01; see Changes.
- rtk's hook returns `permissionDecision: "allow"` only when one of the
  owner's allow rules matches the rewritten command. Otherwise it returns
  no decision and the normal prompt appears. Claude Code checks deny and ask
  rules against the rewritten input, so rtk can't widen permissions.
- Subagents inherit `~/.claude/settings.json` hooks, so they get the same
  filtering with no extra setup.

## Data & contracts
- `claude-home/install.sh`: one new line calling
  `claude-home/token-tooling/install-rtk.sh` (steps 1, 6), which merges
  `claude-home/token-tooling/rtk-hook.sh` (steps 3, 5). No other
  settings.json writes. Tests: `scripts/quiet-check.sh token-tooling`.
- Kill switch: the file `~/.claude/token-tooling.off`. It covers all
  phases.
- `claude-home/CLAUDE.md` §Quality bar: +≤3 lines (Phase 2).
- `sa/rules_map.json`: +1 entry (Phase 2).
- session-analyzer:
  - Report tool-result size per tool name (Bash vs Read/Grep/Glob) so the
    effect of Phase 1 is visible directly, not only through CRE. The
    skeleton already keeps text lengths. If the per-tool split isn't
    stored, add it per the area map's "New stored field" pattern.
  - Count "same command re-run within N turns" as a quality signal for
    over-filtering. Hashed commands only; privacy is unchanged.
- The session-analyzer area map is updated in the same PR as any analyzer
  change.

## Acceptance criteria
- [ ] Running `install.sh` twice leaves settings.json byte-identical to
      after the first run. Without rtk on PATH it prints exactly one WARN
      line and exits 0.
- [ ] `git status`, `git log`, `ls -R` and `gh pr list` are rewritten to
      their rtk form. `scripts/quiet-check.sh session-analyzer`,
      `git log | head -5` and `RTK_RAW=1 git status` are not.
- [ ] With the quiet-check guard installed, raw `pytest -q` in a repo that
      has `scripts/quiet-check.sh` is still blocked with the guard's
      message, whether or not rtk has a filter for it.
- [ ] Adding a second hook that returns `updatedInput` makes `install.sh`
      print a WARN and leave settings.json unchanged.
- [ ] A failing command (`git checkout no-such-branch`) shows its exit code
      and full stderr.
- [ ] Truncated output names a recall hash, and `rtk recall <hash>` returns
      the full output.
- [ ] With `~/.claude/token-tooling.off` present, nothing is rewritten.
      Removing the file restores rewriting without reinstalling.
- [ ] The hook adds ≤50 ms p95 to a Bash call (performance budget,
      measured over 100 calls; the PR quotes the number).
- [ ] rtk makes no network calls: telemetry is off or absent, verified and
      noted in the PR.
- [ ] The session-analyzer report shows tool-result tokens by tool, and the
      re-run counter. `scripts/quiet-check.sh session-analyzer` passes.
- [ ] Each phase has a recorded verdict in `reports/verdicts.md`. A REVERT
      verdict is applied (hook or lines removed) within one week.

## Rollout & metrics
- Order: Phase 1 → its final verdict → Phase 2. `mark` allows one live
  experiment per metric, and running two at once would confound them.
- Primary metric: CRE/EOU down, with the expected direction declared at
  `mark`.
- Guards (already in `sa/verdict.py`): REVERT if CRE, lead time or owner
  actions/EOU has a CI lower bound above +10%.
- Secondary metrics, read-only: Bash tool-result tokens per session, and
  the re-run rate. If the re-run rate rises by more than 10%, rtk is
  hiding information agents need. Investigate before the verdict.
- Duration: what `verdict.py` needs (≥10 PRs and ≥5 EOU per arm). At
  current throughput that is about 4 weeks per phase.

## State (updated 2026-10-01, PR #9 merged)
- Completed: Phase 1 merged (PR #9); hook installed in ~/.claude/settings.json;
  rewriting confirmed live (`git status` → rtk compact output); experiment
  E1 `rtk` (CRE/EOU:down) marked 2026-10-01, minutes before install.
- Branch / open PRs: none for Phase 1. This State update: `docs/token-tooling-state`.
- Files: `claude-home/token-tooling/rtk-hook.sh` (wrapper),
  `claude-home/token-tooling/install-rtk.sh` (RTK_MIN, conflict check),
  `claude-home/install.sh` (tail block), `sa/analyze.py` `waste()`
  (RESULT_TOOLS, RERUN_WINDOW), `sa/report.py` WASTE line,
  `sa/settings_merge.py` `merge(conflicts=)`, `sa/cli.py` install-hook
  `--mark/--conflict`, `tests/test_rtk.py`.
- Tests: quiet-check session-analyzer PASS (96); token-tooling PASS (10, 1
  bench skip). Hook p95 22.6 ms rewrite / 8.0 ms pass-through (budget 50).
- Baseline (pre-E1, all data): tool-result tok Bash 11% · Read 35% · other
  53%; Bash re-runs ≤3 calls 0.1% of 4832.
- Remaining: ~4 weeks of data (≥10 PRs, ≥5 EOU per arm) → verdict in
  `reports/verdicts.md` → Phase 2 (CLAUDE.md ladder lines).
- Decisions: hooks hot-reload mid-session (no restart needed); E1 start gap
  vs install is minutes, accepted.
- Known gaps: AC3 (quiet-check guard interplay) untested — no guard hook in
  `claude-home/hooks/` yet.
- Next action: watch the weekly report's re-run rate; if it rises >10%,
  investigate before the E1 verdict.

## Open questions
1. ~~Is the rtk rewrite combined with an enforce hook well defined?~~
   Closed 2026-10-01, see Changes.
2. ~~Phase 2: CLAUDE.md lines or the ponytail plugin?~~ Closed
   2026-10-01: lines. The plugin is only revisited if the lines get an
   INCONCLUSIVE verdict.
3. Reconsider the caveman proxy only if, after Phase 1, Read/Grep/Glob
   results are more than 40% of tool-result tokens and the area maps
   haven't brought that down. Is 40% the right threshold?
4. ~~Pinned minimum rtk version, and how the hook learns which commands rtk
   filters?~~ Closed 2026-10-01: delegate to `rtk hook claude`; minimum
   0.50.0 (first version tested).

## Changes
- 2026-10-01 — created (DRAFT).
- 2026-10-01 — OQ1 verified against the Claude Code hooks reference and
  guide, and rtk `hooks/claude/rtk-rewrite.sh` (hook-version 4):
  - All matching hooks run in parallel, and their decisions combine as
    deny > defer > ask > allow. Exit 2 counts as deny.
  - When several hooks return `updatedInput`, the last one to finish wins,
    which is non-deterministic.
  - `sa-quiet-check-guard.py` only exits 0 or 2 and never rewrites, so the
    combination is well defined: the guard checks the original command and
    its block wins.
  - Binding rule: at most one PreToolUse(Bash) hook may rewrite input.
  - rtk auto-allows only when the owner's allow rules match, and deny/ask
    rules are re-checked against the rewritten input.
  - rtk telemetry is opt-in (off by default).
- 2026-10-01 — OQ2 decided by owner: Phase 2 ships as CLAUDE.md lines.
- 2026-10-01 — Phase 1 built. rtk 0.50.0 ships a native `rtk hook claude`
  (no `rtk-rewrite.sh`), so the wrapper delegates to it. rtk reports
  truncation as a recall hash, not a file: step 4 and its criterion were
  reworded (owner decision). OQ4 closed. Analyzer: tool-result tokens by
  tool and the Bash re-run counter (window 3 calls, reset by an edit or
  commit) are computed from existing columns, so no migration was needed.
