# Research — how the work gets done

PRDs in `docs/prd/` plan work: what gets built, in what order, how far along
it is. Files here hold the evidence behind those plans: tool and model
comparisons, cost arithmetic, design proposals, market studies. Specced in
`docs/specs/research.md` (template repo only).

Rules:
- One file per question: `<topic>.md`, no `research-` prefix and no date in
  the name. Images used only here go in `assets/`. A study made of several
  files (rounds, teardowns) is one folder `<topic>/`: every file in it has
  the header, and the index has one row for the folder.
- Header, lines 1 to 3:
  ```
  # <Title>
  Researched: YYYY-MM-DD · Informs: <prd links or "none yet">
  Supersedes: <file> (<what>)          ← or `Superseded by: <file> on YYYY-MM-DD (<what>)`, optional
  ```
- A new direction is a new file. An old file is never rewritten to match
  newer findings; it only gains the `Superseded by` line. The newer file has
  a `## What changed from <file>` section.
- A design proposal whose decisions are made gets `Decided in <prd> on
  YYYY-MM-DD.` and is not edited after.
- Builds (`/implement-prd-section`) never read this folder. A PRD links the
  research it relies on and states every decision itself.
- Everything below the header is free-form.

## Index
| Research | Question | Researched | Informs |
|---|---|---|---|
| [civic-action-levers](civic-action-levers/) | Which citizen actions actually move US aid, ties and military partnership with Israel at each level of government; which channels and behavioral mechanics make a civic-action tool work | 2026-11-04 | [action-router](../prd/action-router.md) |
| [senate-leader-candidates](senate-leader-candidates.md) | Who could replace Schumer as Senate Democratic leader in the December 2026 vote or condition their vote; each name's stated position on NDAA §1217 and a new MOU; Instagram, TikTok and web attention with copied counts; a ranked top three for `our_picks` | 2026-11-04 | [action-router](../prd/action-router.md) |
| [social-platform-trends](social-platform-trends.md) | What is topical on TikTok, Instagram and search about the election and actions against the US–Israel partnership as of 2026-11-04; which asks have live tools; what a nationwide product must route to | 2026-11-04 | [action-router](../prd/action-router.md) |
| [ui-design-brief](ui-design-brief.md) | Which free design tool to use for the site's UI and the Google Stitch prompts for its style guide and every page, with image-sourcing rules | 2026-11-04 | [action-router](../prd/action-router.md) |
