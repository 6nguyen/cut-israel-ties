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
| [data-ingestion](data-ingestion.md) | Which data the eight open PRDs need, how fresh each kind must be, and whether to build scheduled ingestion pipelines or run a research agent for the 45 days to 2026-12-19; sources, bot walls and crawling rules checked | 2026-11-04 | [member-pages](../prd/member-pages.md), [state-holdings-sweep](../prd/state-holdings-sweep.md), [office-visits](../prd/office-visits.md), [on-device-districts](../prd/on-device-districts.md) |
| [senate-leader-candidates](senate-leader-candidates.md) | Who could replace Schumer as Senate Democratic leader in the December 2026 vote or condition their vote; each name's stated position on NDAA §1217 and a new MOU; Instagram, TikTok and web attention with copied counts; a ranked top three for `our_picks` | 2026-11-04 | [action-router](../prd/action-router.md) |
| [social-platform-trends](social-platform-trends.md) | What is topical on TikTok, Instagram and search about the election and actions against the US–Israel partnership as of 2026-11-04; which asks have live tools; what a nationwide product must route to | 2026-11-04 | [action-router](../prd/action-router.md) |
| [ui-design-brief](ui-design-brief.md) | Which free design tool to use for the site's UI and the Google Stitch prompts for its style guide and every page, with image-sourcing rules | 2026-11-04 | [action-router](../prd/action-router.md) |
| [state-israel-bonds](state-israel-bonds.md) | Which of the 50 states hold Israel bonds in the treasury or the main pension system, how much as of what date, who decides the rollover, with the source document per state | 2026-11-04 | [state-holdings-sweep](../prd/state-holdings-sweep.md) |
| [generation-cost](generation-cost.md) | What one generated call script or letter costs on Claude Opus 5.5 with the current prompt, what the 500-a-day cap would bill against the $15 donate figure, and which levers (budget-derived cap, standard script fallback, effort, caching, cheaper models, Batch) are worth adopting | 2026-11-05 | [generation-cost](../prd/generation-cost.md) |
| [roster-and-district-offices](roster-and-district-offices.md) | How complete the `unitedstates/congress-legislators` district-office and contact-form data is, how the roster changes week to week and over the 2027-01-03 transition, which fallbacks exist for House and Senate contact pages, and what a weekly refresh costs | 2026-11-05 | [roster-freshness](../prd/roster-freshness.md), [call-follow-through](../prd/call-follow-through.md) |
| [action-conversion-levers](action-conversion-levers.md) | Which device-only, account-free mechanics (voicemail retry, office hours, next-office chain, "one of N" echo, calendar feeds, web push) have evidence for raising call completion and repeat calls, and which to reject | 2026-11-05 | [call-follow-through](../prd/call-follow-through.md) |
| [district-vintage-rollover](district-vintage-rollover.md) | Which states vote under new House maps in 2026, when Census ships cd120 TIGER files, which Census Geocoder vintage returns which Congress, and how and when both district paths must flip to the 120th | 2026-11-05 | [district-vintage-rollover](../prd/district-vintage-rollover.md) |
| [leader-call-scripts](leader-call-scripts.md) | What the post-midterm "call Jeffries and Schumer" reels tell callers to say and do, which lines belong in the leadership call scripts, and how to turn them into blocks that combine in hundreds of ways | 2026-11-06 | [leader-call-scripts](../prd/archive/2026-11-leader-call-scripts.md) |
| [social-distribution-kickoff](social-distribution-kickoff.md) | Which platform, format and account hygiene to use for a stitch-based short-form account that drives traffic to the live site without linking to the maintainers; how the site gets cited by Google AI Overviews, AI Mode and other AI answers; which hashtags and ranking signals are documented; which large accounts and orgs to ask for shares or Collabs, in what order, with what offer | 2026-11-06 | none yet |
| [address-autocomplete](address-autocomplete.md) | Why every live address failed on 2026-11-06, which suggestion providers return coordinates inside the $0 budget and allow the use, and what the field should do | 2026-11-06 | [address-autocomplete](../prd/archive/2026-11-address-autocomplete.md) |
