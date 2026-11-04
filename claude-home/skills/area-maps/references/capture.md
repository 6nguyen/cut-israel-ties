# Capturing a map

## Draft from the repo first
1. Entry points: grep the build/CLI/route registration, read those ranges.
2. Area README, module docstrings, `git log --oneline -30 -- <area>`.
   Reverts and "fix:" commits are where anti-patterns come from.
3. The PRD(s) whose Changes log names this area, if any (only the relevant
   lines).

## Then ask the owner (≤4 questions, only what the repo can't answer)
Skip any question the draft already answers with evidence.
- "What is explicitly NOT this area's job, and where does that live?"
- "What must never be violated here? What broke the last time it was?"
- "What do agents or new engineers get wrong here repeatedly?"
- "Anything that looks dead or deprecated but isn't?"

## Before saving
- [ ] `## Purpose` heading, purpose in its first two lines
- [ ] `measure.sh` shows `has-map`, not `map-over-cap`
- [ ] Every contract names its enforcer (file, test, type) or says "unenforced"
- [ ] Anti-patterns are real (point at a commit/PR/incident when you can)
- [ ] Nothing repeated from an ancestor map, the root CLAUDE.md or the README
- [ ] Index line added to the root CLAUDE.md `## Area maps`
