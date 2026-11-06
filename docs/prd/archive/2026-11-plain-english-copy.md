# Plain-English copy — PRD
Status: SHIPPED 2026-11-06 (PR #46) · Owner: George Nguyen · Last updated: 2026-11-06

## Problem
The site is for people who want to act and are new to how Congress works.
Its goal titles and page labels are written for people who already know
the process: "Put your House Democrat on the record before the caucus
vote", "Strip the Israel integration section from the NDAA", "House and
Senate conferees are reconciling the FY27 NDAA". Neither leadership goal
names Hakeem Jeffries or Chuck Schumer, while "replace Jeffries and
Schumer" is the frame that spread after the 2026-11-03 midterms (The New
Republic, 2026-11-05; Democracy Now, 2026-11-06: five senators-elect
refusing to back Schumer; a Change.org petition against Jeffries as
Speaker past 830k signatures). A visitor who arrives from that feed
cannot match what they saw to any goal on the site. The owner's examples
on 2026-11-06: "Kick out Hakeem Jeffries" and "Stop Israel Integration
into the US Military", with the details carrying the rest.

## Goals / Non-goals
- Goals: every goal title names the person or thing people already talk
  about; every summary, "what we want", ask line and prep page reads for
  someone who has never heard of a conference committee; page labels say
  what the block is for in everyday words; the leadership goals name
  Jeffries and Schumer and ask for the same condition in both chambers.
- Non-goals: changing what the site asks for (the targets and conditions
  are unchanged); changing the words a caller reads to a staffer where a
  rule or test pins them ("integration section", section numbers, the
  `doc_format` ask and mention phrases stay); measuring social trends in
  product (queued under `## Next`); any new page or data column.

## Research (what the best products do → adopt / adapt / reject)
Relies on: [social-platform-trends](../research/social-platform-trends.md)
(2026-11-04: "Section 1217 does not travel"; the frames that do are
"stop the deadly merger" and "replace Schumer"),
[leader-call-scripts](../research/leader-call-scripts.md).
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Goal named after the person, details explain the mechanism | Indivisible replace-Schumer push, Change.org Jeffries petition | adopt | It is the frame people arrive with; the mechanism goes in "What is going on" |
| Policy named by its effect, not its bill section | Adalah "Stop the Deadly Merger" | adopt | "Integration into the US military" travels; "§1217" does not |
| Bill section numbers kept in the words said to staff | 5 Calls scripts | adopt | Staff log the section; the caller needs the number in the script, not in the title |
| Trend-driven goal creation | none with evidence | reject for now | Numbers from a feed are not a sourced row; a watch routine is queued instead |

## Users
First-time callers who saw a post, not a bill. They need the name they
recognise in the title, one paragraph on what is actually being decided
and by whom, and the exact words to say. Returning callers lose nothing:
the asks, targets and scripts are the same.

## Expected behavior
### 1. Goals and actions in plain English
1. Goal titles: `house-caucus` "Kick out Hakeem Jeffries"; `senate-leader`
   "Kick out Chuck Schumer"; `ndaa-1217` "Stop Israel's integration into
   the US military"; `ndaa-report-vote` "Block the military bill if Israel
   integration stays in"; `state-bonds` "Get your state's money out of
   Israel Bonds".
2. Every `summary`, `what_we_want`, `decider`, `this_week`, `detail_md`
   and `prep_md` is rewritten so that no sentence needs the reader to
   know "conferees", "conference report", "caucus", "FY27", "NDAA" or
   "MOU" (each is introduced once in plain words where it first matters;
   `prep_md` keeps its six headings and dates). `detail_md` is filled for
   the goals that had none (house-caucus, state-bonds). Each leadership
   goal's summary and detail name the incumbent and say who votes.
3. `house-caucus` carries the same condition as `senate-leader`: vote for
   a new leader unless the incumbent commits, in public, to stripping the
   integration section (`ask_text` plain; `doc_format` ask "vote only for
   a leader", mentions `integration section` and `leader`). The House
   non-self ask variants in `data/script_blocks/leadership.yaml` are
   rewritten to that ask; self variants keep "commit in public or step
   aside". This is leadership-routing §3.1's copy half, done here; its
   `{{leader_line}}` and commitment rows stay there.
4. Action `ask_text` lines read in plain words ("final military bill",
   "renewing them"); `prompt_template` and `standard_template` keep the
   terms staff log.
5. New `sources` rows: house-caucus gets The New Republic (replace
   Jeffries and Schumer); senate-leader gets Democracy Now (senators-elect
   against Schumer). No tally or count on any page comes from those rows;
   they are links.

### 2. Site labels in plain English
1. Category chips: `federal_vote` "Vote in Congress", `leadership` "Who
   leads the Democrats"; `state` and `electoral` unchanged.
2. Landing: label "Call your people in Congress · US military ties with
   Israel"; subline "One site to end US aid to Israel and get the US
   military out of its wars. Enter your address. We find the people who
   represent you in Congress and give you the exact words to say when you
   call."; goals block "What you can change / What's being decided right
   now". The H1 and the default meta description keep their meaning with
   "the people who represent you in Congress" for "your members of
   Congress".
3. `/goals`: "Everything being decided right now", "Biggest lever first."
4. `/goals/<slug>`: "The basics / What is going on", "What we are asking
   for", "Who makes the call, and when", "Who we would back instead",
   "Your move / What you can do", "Your people in Congress / Who to call";
   the empty sources line reads "No sources linked yet. Nothing on this
   page is guessed by a model; every claim gets a link as we find it."
5. `/goals/<slug>/prep`: "Our picks / Who we would back instead", "What
   to ask for, in one line", "Make the call / Get your script"; the
   no-picks line and the picks footnote lose "maintainer scan" and
   "sourced rows" wording.
6. `/results` and islands: "Who to call" replaces "Your targets"
   everywhere; the delegation line reads "Your people in Congress for
   <where>: …".

## Data & contracts
None. Same ids, slugs, columns, endpoints and placeholders. The
house-caucus `doc_format` ask and mentions change (a data value the seed
validates, not a schema).

## Spec delta
- MODIFIED `docs/specs/goal-pages.md` §Behavior 2, 4, 7 and §Performance: label text ("The situation" → "The basics / What is going on", "What we want" → "What we are asking for", "Who decides and when" → "Who makes the call, and when", "Our pick" → "Who we would back instead", "Your targets" → "Who to call", "The ask, same for every caller" → "What to ask for, in one line").
- MODIFIED `docs/specs/action-router.md` §Behavior 5: the delegation line is "Your people in Congress for <where>: …".
- MODIFIED `docs/specs/district-counters.md` §Behavior 6 and `docs/specs/electoral-record.md` §Behavior 2: "Your targets" → "Who to call".

## Acceptance criteria
- [ ] `/` shows the five titles in §1.1 on their cards and chips "Vote in Congress" / "Who leads the Democrats".
- [ ] `/goals/house-caucus` and `/goals/senate-leader` name Jeffries and Schumer in the title, summary and "What is going on", and state the same condition.
- [ ] No goal page or prep page uses "conferees", "conference report", "caucus vote", "FY27" or "MOU" without saying what it is in the same sentence.
- [ ] The house-caucus call script, for every seed and target, contains "vote only for a leader" and "integration section" and stays within 60–120 words (worker `compose` and `standard` tests).
- [ ] The ndaa-1217 script still says "drop the integration section" and names sections 219 and 1217 (unchanged tests).
- [ ] `prd-lint`, `doc-lint`, `tsc`, `test` and `build` pass; landing stays ≤100 KB transferred (copy-only change).

## Rollout & metrics
No flag. Ships on the next deploy. Signal: receipts per goal on the
leadership goals versus the week before (district counters), read by the
maintainer, not shown.

## State (updated 2026-11-06, PR #46)
- Sections:
  - [x] 1. Goals and actions in plain English · PR #46 merged
  - [x] 2. Site labels in plain English · PR #46 merged
- Completed: §1–2, data, web and specs rewritten and merged (PR #46).
- Folded: §Spec delta applied to goal-pages, action-router, district-counters, electoral-record.
- Branch / open PRs: none.
- Files changed (file:line map): data/goals/*.yaml, data/actions/*.yaml (ask_text; house-caucus prompt + doc_format), data/script_blocks/leadership.yaml (askh1–4, askhs1–3, cx1/cx3/cx7), web/src/lib/goals.ts:42, web/src/components/Target.tsx:7, Results.tsx:28,66, PrepAction.tsx:53, GoalTargets.tsx:41, web/src/pages/index.astro, goals/index.astro, goals/[slug].astro, goals/[slug]/prep.astro, layouts/Base.astro:4, pages/card.png.ts:7, worker/test/goals.test.ts:90.
- Tests run + result: worker vitest 45 passed; CI green on PR #46.
- Remaining: none.
- Decisions since last update: titles name the incumbent; precise terms stay in the words said to staff; "trending" is reported press, not measured platform data (see Open questions).
- Known failures / blockers: none.
- Next action: none (shipped, archived).
## Open questions
1. Social-trend evidence is press reporting, not platform data: no public
   hashtag or view counts for "Jeffries"/"Schumer" were obtainable
   logged-out on 2026-11-06. Proposal: ship the titles on the press
   record and queue a weekly trend-watch routine (`## Next`) that proposes
   title changes as PRs, never edits data on its own.
2. "Kick out" is blunter than the condition the site actually asks for
   (a new leader unless the incumbent commits in public). Proposal: keep
   the blunt title, since the condition sits one line below in "What we
   are asking for" and in every script; revisit if reports show callers
   dropping the condition.

## Changes
- 2026-11-06 — created and built on feat/plain-english-copy in one PR; both open questions resolved by their proposals.
- 2026-11-06 — PR #46 merged with both sections; SHIPPED and archived.
