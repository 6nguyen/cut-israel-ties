# session-analyzer

Zero-token metrics store for Claude Code transcripts (PRD:
hypertrophy-goals `docs/prd/session-analyzer.md`, steps 2-5). Python 3 stdlib
only.

## Install

`claude-home/install.sh` (idempotent) does three things for this tool:

- links `session-analyzer` to `~/.local/bin/` (override: `SA_BIN_DIR`);
- installs `~/Library/LaunchAgents/com.claude.session-analyzer.plist`
  (nightly 02:30, `ProcessType=Background`, `LowPriorityIO`) and loads it;
- installs `com.claude.session-report.plist` (weekly, Monday 08:00:
  `session-analyzer weekly`);
- merges one PreToolUse(Bash) hook per `claude-home/hooks/*.py` (guarded:
  a missing file exits 0), present only after an `enforce-rule` PR merges;
- merges one `SessionEnd` hook (`<bin> hook`) into `~/.claude/settings.json`,
  writing `settings.json.bak-<timestamp>` first. No other key is touched; a
  second run finds the hook and writes nothing.

## Commands

| Command | Does |
|---|---|
| `ingest [--session ID…] [--force]` | index rows + skeletons for changed sessions (incremental by byte offset) |
| `pin LABEL (--session ID… \| --since D --until D) [--days N≤30 \| --until-decision]` | xz copy of raw transcripts + `subagents/` (never `tool-results/`) |
| `unpin LABEL` / `decide LABEL OUTCOME` | re-ingest, then delete the pin (decide also logs to `reports/decisions.log`) |
| `pins` / `status` | list pins / sizes, free space, row counts |
| `reindex` | rebuild every non-text row from skeletons; titles/descriptions from raw where it still exists |
| `install-hook SETTINGS --command C [--event E --matcher M --mark S --conflict P…]` | install.sh: idempotent hook merge (present by `--mark` substring); any existing hook containing a `--conflict` pattern → one WARN line, nothing written |
| `hook` | SessionEnd: spawns a detached `ingest --session ID`, prints nothing, exits 0 |
| `nightly` | launchd: ingest changed, expire pins, enforce cap, day-12 alert, monthly `VACUUM` |
| `report [--session ID… \| --pr N [--repo o/r] \| --since D\|-Nd [--until D] \| --window TS] [--json]` | §7 scorecard (≤60 lines, byte-identical per index state). Read-only, except the incremental `prs` cache refresh via `gh pr list` (`--no-refresh`, `--no-cache-write`, `--db PATH` = never write) |
| `compare A B` | side by side; A/B = session ids/prefixes (comma list), `pr:N`, `D..D`, `-7d`, `window:TS` |
| `mark LABEL --expect METRIC[:up\|down] [--at TS]` | start an experiment; METRIC = `CRE/EOU`, `lead/EOU`, `owner/EOU`. One live experiment per metric (else refused) |
| `verdicts` | live/decided experiments with the §6.9 verdict line (read-only) |
| `apply R<n> [--since D] [--dry-run] [--no-refresh]` | apply recommendation R<n> (from the newest weekly sidecar, or recomputed for `--since`): git target → worktree off origin/main, branch `chore/sa-R<n>-<slug>`, push, `gh pr create` with the evidence; `~/.claude` target → `.bak-sa-<ts>` backup then write; `connector-off` → prints the owner step. Always writes the `mark` |
| `revert R<n>\|E<k>` | run the template's inverse the same way (a PR for git targets) and mark the experiment reverted |
| `weekly` | launchd: ingest, PR refresh, record verdicts, write `reports/YYYY-Www.md` + `.json` (0600), notify |

## Environment

| Var | Default | Use |
|---|---|---|
| `SESSION_ANALYZER_HOME` | `~/.claude-archive` | archive root |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | transcripts to ingest |
| `SESSION_ANALYZER_MIN_FREE_GB` | `10` | free-space floor (tests only) |
| `SESSION_ANALYZER_NOTIFY_CMD` | osascript | notification override (`0` = off) |
| `SESSION_ANALYZER_GH` | `gh` | gh binary for the PR fetch (`0` = off; tests) |
| `SESSION_ANALYZER_TEMPLATE_REPO` | this checkout | git root for `template` targets (tests: temp repo) |
| `SESSION_ANALYZER_NOW` | wall clock | fixed "now" (tests) |
| `CLAUDE_HOME` | `~/.claude` | where static-overhead sizes are measured at ingest |

## Analyzer (step 3)

- `sa/analyze.py`: CRE + context aggregates, cache rebuilds (write >150k with
  read <50k, non-first request), compliance 5.1-5.15 with counterfactual
  CRE, waste counters (hashed paths/commands only; tool-result tokens by
  tool — Bash/Read/Grep/Glob/other — and Bash re-runs of the same command
  within 3 calls with no edit between, the rtk over-filtering signal), static overhead
  (sizes measured at ingest, `sa/rules_map.json` for rule text), windows
  (130M estimated ceiling until ≥2 limit windows ≥50M in the last 30 d),
  per-PR time ledger, latency dividend (omitted if R² < 0.3), EOU attribution.
- `sa/gh.py`: the only network call. EOU buckets, exclusions, docs-only,
  revert / fix-forward penalty. A PR counts toward a scope that holds ≥50%
  of its branch CRE; EOU is always share-weighted.
- Ledger, windows and attribution are computed at report time (not stored).

## Owner actions (step 4)

- `sa/owner.py`: at ingest, regex cues over the assistant's last message
  (question, offer, hand-off + rule-table pattern ids) and the owner's turn
  (correction, resume, done, yes, merged, question, imperative, enumerated
  answers, screenshot) become booleans in the skeleton (`_ao`/`_uo`/`_opat`).
  `classify()` is a pure ordered rule list over those features: decision,
  redirect, manual_step, resume, new_request. AskUserQuestion/ExitPlanMode
  answers are `ask` turns, always decision. The text is never stored.
- `sa/owner_rules.json`: hand-off patterns, `infeasible` flags (device, App
  Store UI, credentials, sudo, system dialogs: not penalized) and minutes
  (2 per manual step, 1 per approval). Editing it needs `reindex`.
- Hand-off still open (`ho`, `hpats`): after an assistant hand-off, the
  count of owner turns since it (capped at 3) until a `!` command, "done",
  "merged" or a long new instruction closes it. A short turn while it is open
  is a manual step on the hand-off's pattern.
- Report `OWNER` line: the **binding** metric is total owner actions/EOU, a
  plain count of owner turns (prompts + AskUserQuestion answers) minus each
  session's opening prompt and slash commands; no classifier involved. The
  per-class split follows it prefixed `experimental:` with the last blind
  held-out accuracy (0.65), then owner time and the top 3 manual patterns
  with the CRE of the cheapest request where the agent ran that step itself
  (`unknown` if it never has). `compare` labels the split rows `exp.`.
- Fixture `tests/fixtures/owner_labeled.jsonl`: 238 hand-labeled live turns,
  features + label only (`make_owner_fixture.py`, needs a local index with
  those sessions). Every label has been used for tuning (all-label accuracy
  0.765), so the test is a regression floor (0.745), not the PRD §9 gate.
- **The split becomes non-experimental only after ≥0.90 agreement on ≥100
  blind-labeled turns from sessions started on or after
  `owner.FRESH_EVAL_SINCE` (2026-10-01).** Until then, act on the total.

## Guarantees

- **Privacy:** `index.db` holds token counts, tool names, byte sizes and
  labels; skeletons replace every non-allow-listed string with its length.
  The only text kept is the session title and agent description, in the
  index only, and only while raw exists. Pins are local, `0600`/`0700`,
  and always expire (`--days` ≤ 30; `--until-decision` notified at 30 d and
  deleted at 37 d). Nothing is uploaded.
- **Disk:** archive ≤ 1 GB (over it, the oldest pin is expired early after a
  re-ingest), pins ≤ 500 MB (`pin` refuses past it). Below 10 GB free,
  every write path logs one line to stderr and exits 0 having written nothing.
  No temp files: xz is streamed, SQLite uses `temp_store=MEMORY`. The log
  rotates at 1 MB (2 files).
- **Capture:** the hook and nightly job never call a model or network API,
  and a session still not ingested 12 days after it was written raises one
  macOS notification.

## For later steps

`sa.store.connect()` opens and migrates `index.db` (append to
`store.MIGRATIONS`; never edit a shipped entry). Register a subcommand in
`sa.cli.COMMANDS`. The `Extractor` in `sa.ingest` reads skeleton records
only, so anything derived there is re-derivable with `reindex`. Bump
`sa.PARSER_VERSION` when a label changes; the next ingest rebuilds the
sessions that still have raw transcripts.

## Tests

`scripts/quiet-check.sh session-analyzer` (stdlib `unittest`; fixtures in
`tests/fixtures/`, regenerate with `tests/fixtures/make_fixtures.py`).

## Recommendations and experiments (step 5)

- `sa/recommend.py`: ≤3 deterministic candidates (score = CRE saved − cost,
  minutes at the window exchange rate; ties by key). Tighten: violated rules
  ≥5% of scope CRE, 429 stalls in limited windows. Loosen: over-tight rules,
  and headroom windows while serialization or compaction+reorient is ≥5% of
  lead time. Drop: standing no-effect rules. Rules without a catalog patch
  are `needs-session` and rank below catalog items. Candidates on a metric
  with a live experiment are held back.
- `sa/catalog.py`: templates `set-key`, `deny-read`, `drop-rule`,
  `shorten-rule`, `enforce-rule`, `agent-model`, `connector-off`. Each
  patch stores an undo; inverse(patch(x)) is byte-identical (tested). The
  owner's checkout is never touched; the commit goes in a temporary worktree
  under `<home>/work/`.
- `sa/verdict.py`: arms = attributed PRs merged in 28 days before vs since
  the mark. Seeded bootstrap (1,000 resamples, seed 20260930); needs ≥10 PRs
  and ≥5 EOU per arm. REVERT if any axis (CRE, lead, total owner
  actions/EOU) has CI lower bound >+10%; KEEP if the expected metric's CI is
  <0; else INCONCLUSIVE, which becomes REVERT-for-simplicity at 2× the first
  evaluation's PR count. Final verdicts append to `reports/verdicts.md`.
  Standing check: rules followed ≥80% over 4 weeks whose CRE/EOU difference
  CI spans 0. `AUDIT` line: analyzer build + read CRE vs KEEP savings.
- Shared rule lines: `drop-rule`/`shorten-rule` never remove or alter a
  CLAUDE.md line that another rule's anchor also owns; drop removes only the
  rule's exclusive lines, and a rule with none is refused and never
  recommended.
- Effective window: `rules_map.json` `effective_since` (default
  2026-09-29, per-rule overrides). Compliance counts only sessions that
  started on/after it; the standing check (and so any drop) needs the whole
  4-week span after it plus ≥10 attributed PRs and ≥5 EOU, else the report
  prints the rule under `insufficient data`.
