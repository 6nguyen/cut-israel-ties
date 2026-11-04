---
name: session-report
description: Answer a question about the session-analyzer scorecard (cost, speed, owner effort, rule compliance, experiments, top 3). Reads the newest weekly report file, or runs `session-analyzer report` for another scope. Optional; the weekly report needs no model.
---

# /session-report

Low effort, any model, spawn nothing. The numbers come from code; never
recompute, estimate or extrapolate them.

1. No scope given: `ls -t ~/.claude-archive/reports/*.md | head -1`, then read
   that file (≤60 lines).
   Scope given (`--since D|-Nd`, `--session ID`, `--pr N`, or two scopes to
   compare): run `session-analyzer report <scope>` or
   `session-analyzer compare A B` and read only its output.
2. Answer the question from those lines only, quoting the numbers. Line
   meanings: `claude-home/tools/session-analyzer/README.md`.
3. Acting on a TOP 3 item is the owner's decision: suggest
   `session-analyzer apply R<n>` (or `--dry-run` first); never run apply or
   revert unless asked. `needs-session` items are the only ones that need a
   model session.
