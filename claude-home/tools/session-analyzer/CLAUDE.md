# session-analyzer — area map

## Purpose
Owns the zero-token metrics pipeline for Claude Code transcripts: capture →
text-free skeletons + `index.db` → deterministic report, recommendations and
experiment verdicts. Does NOT own the rules it scores (`claude-home/CLAUDE.md`)
or the install wiring (`claude-home/install.sh`). Commands, env vars and
metric definitions: `README.md` (read the section you need, not the file).

## Entry points
- `session-analyzer` → `sa/cli.py` `COMMANDS` (name → (configure_parser, run)).
- `sa/capture.py`: SessionEnd hook + nightly launchd job.
- `sa/ingest.py`: raw → `sa/skeleton.py` → `Extractor` → rows (`sa/store.py`).
- `sa/analyze.py` → `sa/report.py`: the scorecard. `sa/recommend.py` →
  `sa/catalog.py` (patches), `sa/verdict.py` (experiments).

## Contracts & invariants
- Stdlib only (Python 3). No new dependencies.
- No model calls anywhere. `sa/gh.py` is the only network call; its `runner`
  is injectable and tests replace it.
- Privacy: nothing outside the `sa/skeleton.py` allow-list is stored. Text
  becomes its length. `sa/owner.py` keeps booleans and rule ids, never text.
- Determinism: `analyze`/`report`/`recommend`/`verdict` never read the wall
  clock (use `SESSION_ANALYZER_NOW`) and never draw an unseeded random
  number. The same index state gives byte-identical report output.
- `Extractor` reads skeleton records only, so `reindex` reproduces every
  non-text row. A label change bumps `sa.PARSER_VERSION`.
- `store.MIGRATIONS` is append-only. Never edit a shipped entry.
- Every catalog patch has an undo, and inverse(patch(x)) is byte-identical.
  Git targets go through a temp worktree under `<home>/work/`, never the
  owner's checkout.
- Write paths check the free-space floor (`sa/disk.py`). Below it they log
  one line and exit 0 having written nothing. No temp files.
- `install-hook --conflict`: at most one PreToolUse(Bash) hook may return
  `updatedInput` (rewriter conflict → WARN, settings untouched).
- Hooks and launchd jobs print nothing and exit 0. They must never block
  or fail a Claude Code session.

## Patterns
- New subcommand: `configure_parser` + `run` in the module that owns the
  logic, then one `COMMANDS` entry in `sa/cli.py`, then a test in `tests/`.
- New stored field: skeleton allow-list (if raw-derived) → `Extractor` →
  new migration → bump `PARSER_VERSION` → `reindex` test.
- New recommendation: a `sa/catalog.py` template with its inverse test,
  then a candidate in `sa/recommend.py` with its evidence numbers.
- Tests: `scripts/quiet-check.sh session-analyzer`. Fixtures are generated
  (`tests/fixtures/make_*.py`). Regenerate them, don't hand-edit.

## Anti-patterns
- Tuning `sa/owner.py` cues against `tests/fixtures/owner_labeled.jsonl` and
  calling the split validated: every label there was already used for tuning.
  Only blind labels from sessions started on/after `owner.FRESH_EVAL_SINCE`
  count.
- Recommending or dropping a rule from compliance before its
  `rules_map.json` `effective_since`, or removing a CLAUDE.md line another
  rule's anchor also owns.
- Doing arithmetic in an LLM layer (e.g. a skill summarizing the report):
  numbers come from `sa/` only.
