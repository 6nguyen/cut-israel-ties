# Area map template

File: `<area>/CLAUDE.md`. Claude Code loads it on demand when a session or
agent reads files under `<area>/`. The `## Purpose` heading is what
`measure.sh` and `audit.sh` use to tell a map apart from other CLAUDE.md
files. Cap: 4k tokens (~16 KB); aim for 1–2k.

```markdown
# <Area name> — area map

## Purpose
<1–2 sentences: what this area owns.> Does NOT own: <boundary, with where
that lives instead>. <Pointer to the area's README for commands/reference.>

## Entry points
- `<file>`: <what calls it / what it starts>

## Contracts & invariants
- <Must always be true. Name the enforcing file or test where one exists.>

## Patterns
- <Recurring task>: <steps in order, file by file>

## Anti-patterns
- <A mistake that actually happened (incident, review finding, reverted PR)
  and what to do instead>

## Related
- <Other map or doc>: `<relative path>`
```

Rules:
- Record intent: what grep can't tell an agent. Don't list every file or
  copy command tables, env tables or metric definitions from a README.
  Point at the section instead.
- Contracts are explicit and checkable. "Handle carefully" is not a contract.
- A fact that applies to several maps goes in the lowest common ancestor,
  or in the root CLAUDE.md `## Hard gotchas` if it is repo-wide. Never
  repeat it per map.
- One index line per map in the root CLAUDE.md `## Area maps`:
  `- <area>: <path> — <one-line purpose>`.
