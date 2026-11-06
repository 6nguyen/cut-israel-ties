# Leader call scripts — composable blocks for the leadership goals — PRD
Status: SHIPPED 2026-11-06 (PR #34) · Owner: George Nguyen · Last updated: 2026-11-06

## Problem
The two leadership goals (`house-caucus`, `senate-leader`) carry one
`standard_template` each, so every caller without a configured model
reads the same text to the same staffer, and offices discount repeated
scripts as a campaign. The post-midterm "call Jeffries and Schumer" reels
(`docs/research/leader-call-scripts.md`) carry talking points our scripts
lack: the once-only timing of the leadership votes, why the leader's vote
is worth more than one seat, call-and-call-again closers, and a different
ask for the two leaders' own constituents (NY-8 and New York), who are
asked to make the commitment in public or step aside. Today Hakeem
Jeffries and Chuck Schumer get the same script as any other Democrat, and
the model path receives no talking points at all.

## Goals / Non-goals
- Goals: (1) thousands of distinct, checked scripts per target for the
  leadership goals, built by code from reusable blocks plus the caller's
  own fields; (2) a target-aware ask for the incumbent leaders; (3) the
  same blocks seed the model draft, so a configured key improves the
  draft without changing the talking points; (4) a visible "Another
  version" control on the standard script; (5) nothing left to do once
  `ANTHROPIC_API_KEY` is set.
- Non-goals: new actions or goals (ids unchanged); digits, tallies or
  seat counts in blocks (the output check forbids digits not in the
  facts); the insults, impeachment, Iran and healthcare lines from the
  reels; transcripts in the repo (third-party speech); per-member block
  editing by non-maintainers.

## Research (what the best products do → adopt / adapt / reject)
Relies on: [leader-call-scripts](../research/leader-call-scripts.md).
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Slot-based script assembly (opener, reason, ask, close) with per-slot variants | 5 Calls (fixed), Resistbot (letter variants), the reels' own structure | Adopt | Hundreds of combinations from tens of lines; every combination still passes the deterministic check |
| Conditioned variants (chamber, "is this the leader", "has an affiliation") | Mail-merge rules in every CRM | Adopt | The leaders' own constituents need a different ask; a block that names an empty field reads wrong |
| Seeded random pick, reproducible | Any A/B tooling | Adopt | The browser sends a seed; the receipt and tests can replay the exact script |
| Talking points fed to the model as a starting draft | Resistbot "based on this letter" | Adopt | The model reworks a checked script into the caller's voice instead of inventing the argument |
| Once-only timing and leader-power framing | The reels | Adopt | Matches the decision windows; written without numbers |
| Donor/lobby framing | The reels | Adapt | One civil line: the commitment should come from constituents, not campaign funders |
| Insults, impeachment, unrelated demands | The reels | Reject | Civil-tone rule, blocklist, off-goal asks dilute the whip count |

## Users
- A caller in any district with a Democratic representative or senator,
  reading the standard script from a phone. Needs: one screen, 60–120
  words, the target's name early, a yes-or-no ask, a line to say if a
  staffer pushes back.
- A caller in NY-8 or New York calling Jeffries or Schumer directly.
  Needs: an ask that fits the person on the other end.
- A caller with a key configured: the model draft should carry the same
  talking points and ask in the caller's own words.
- The maintainer: edit one YAML file to change the talking points; the
  seed fails before a bad block can reach a caller.

## Expected behavior
### 1. Script blocks file
`data/script_blocks/leadership.yaml` holds `incumbents` (the leaders
whose own constituents get the self ask: `J000294`, `S000148`) and an
ordered list of `slots`. Each slot has a `name`, a `pick` count (default
1), optional `carries` (`ask`, `mention`: every eligible variant of a
carrying slot must contain the action's `doc_format.ask` phrase or one of
its `mentions`), and `variants`, each with an `id`, a `text` that may use
the standard placeholders (`{{target_name}}`, `{{target_role}}`,
`{{user_<field>}}`, `{{position_line}}`, `{{prior_vote_line}}`,
`{{pick_line}}`) and an optional `when` with `chamber: house | senate`,
`self: true | false` (the target is an incumbent) and `has: [names]`
(placeholders that must render non-empty). Slots: opener, context,
argument, record, why, ask, close. An action YAML names the file with
`script_blocks: leadership`; `standard_template` is then optional and
ignored.

### 2. Composition
`worker/src/compose.ts` builds a template from the blocks for one target:
for each slot it filters the variants eligible for the target and the
caller's fields, then picks `pick` distinct variants with a seeded PRNG
(mulberry32 over the request's `variant` seed); slot texts join with a
newline, variants within a slot with a space. The composed template goes
through the existing `fillStandard` (facts, user fields, word budget) and
`checkOutput`. The same seed and inputs always give the same script. A
caller never sees block ids; the `done` event carries a `variant` string
(the chosen ids) for receipts and tests.

### 3. Serving
- Standard path (no key, cap, budget, upstream failure): unchanged
  events; the body is the composed script; `done.variant` is set. The act
  page's "Regenerate" button reads "Another version" while the standard
  script is shown and posts a fresh random `variant`. The existing
  per-device limit still applies, so a caller gets at most three versions
  per action per day.
- Model path: the user message gains a `<starting_script>` block after
  `<user_fields>` holding the composed, filled script; the system prompt
  tells the model to keep its ask and facts, rework it into the
  constituent's voice and keep or drop arguments as fits. Output check,
  retries and telemetry are unchanged. Actions without `script_blocks`
  behave exactly as before.
- The self ask: when the target id is in `incumbents`, only `self: true`
  variants (and unconditioned ones) are eligible; the ask asks the leader
  to make the commitment in public or step aside, with the chamber's
  mention phrase and ask phrase intact. Other targets get the existing
  "on the record" / "vote only for a leader" asks with more varied
  framing.

### 4. Seed check
`checkScriptBlocks` runs inside `loadRows`, so `npm run seed`, `--check`
and every test fail on: unknown slot keys or `when` keys, duplicate
variant ids, unknown placeholders, digits, URLs or blocklist words in any
text, an incumbent id not in `members`, a carrying slot with an eligible
variant missing the ask or mention phrase, a slot with fewer eligible
variants than `pick` for any in-scope target, a combination whose fixed
text cannot fit the action's word range with the shortest or longest
fixture fields, or a seeded composition that fails the output check for
any in-scope target. Error messages name the action, target and slot.

## Data & contracts
- `data/script_blocks/<name>.yaml` (shape in §1; documented in
  `data/README.md`); Action YAML `+ script_blocks: <name>`.
- `worker/schema.sql` `actions`: `+ script_blocks TEXT`; the loader
  inlines the file's JSON into that column, so D1 and `MemoryRepo` carry
  the blocks with the action.
- `worker/src/types.ts` `Action.script_blocks: string | null`.
- `worker/src/compose.ts`: `parseBlocks`, `eligible`, `compose(blocks,
  ctx, seed) → {template, ids}`, `combinations(blocks, ctx)`.
- `worker/src/standard.ts`: `standardScript(..., seed)` composes when
  `action.script_blocks` is set; `checkScriptBlocks`.
- `POST /api/generate` body `+ variant?: integer` (random when absent);
  SSE `done + variant?: string`; `GenerateInput.variant`,
  `GenerateContext.variant`.
- No new env var, limit, table or id.

## Spec delta
- MODIFIED `docs/specs/personalised-documents.md` §Behavior 2: the user message gains `<starting_script>` for actions with `script_blocks`; the system prompt's rework rule.
- MODIFIED `docs/specs/personalised-documents.md` §Behavior 5: the standard script is composed from `script_blocks` when the action names them (slots, eligibility, seed, self ask, "Another version").
- MODIFIED `docs/specs/personalised-documents.md` §Data & contracts: `variant` in the request and the `done` event; `script_blocks` column, YAML key and file shape; `compose.ts`.
- MODIFIED `docs/specs/personalised-documents.md` §Invariants: every composition for every in-scope target passes the output check at seed time; blocks contain no digits; an incumbent target never receives a non-self ask.

## Acceptance criteria
- [ ] `combinations` ≥ 500 for Jeffries, Schumer and for a non-leader House and Senate Democrat; 300 random seeds per target all pass `checkOutput` and produce ≥ 100 distinct bodies.
- [ ] Jeffries' and Schumer's scripts ask them to commit in public or step aside and still contain the action's ask phrase and a mention; another Democrat's script never does.
- [ ] The same seed, target and fields give the same body; two seeds give different bodies for the same caller.
- [ ] No key: `/api/generate` streams the composed script with `done.variant` set and makes no Anthropic call; the act page shows "Another version", and pressing it changes the body.
- [ ] Key configured: the Anthropic request's user message contains `<starting_script>` with the composed script; the NDAA action's request does not.
- [ ] Removing a variant so a slot has fewer eligible variants than `pick` for any target, adding a digit, an unknown placeholder or a `when` typo fails `loadRows` with a message naming the action and slot.
- [ ] The NDAA, electoral and state actions' standard scripts are byte-identical to today.
- [ ] Performance budget unchanged: standard script ≤500 ms p95; first streamed token ≤3 s p95; infra $0/month.

## Rollout & metrics
No flag; one nullable column (`schema:remote` applies it). Measure after
go-live: distinct `variant` share per action per day, receipt rate after
composed scripts versus the 2026-11-05 single template, and the share of
"Another version" presses (second and third generations per device).

## State (updated 2026-11-06)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [x] 1. Script blocks file
  - [x] 2. Composition
  - [x] 3. Serving
  - [x] 4. Seed check
- Completed: see Changes.
- Folded: none.
- Branch / open PRs: none (PR #34).
- Remaining: none (the fifth reel stays untranscribed; the other four cover its points).
- Decisions since last update: none.
- Known failures / blockers: the fifth reel is login-walled and was not
  transcribed; the other four cover the same points.
- Next action: none; archived.

## Open questions
1. Should the self ask also cover the deputy leaders' constituents?
   Proposal: no; the reels and the goals name the two leaders only, and
   adding ids to `incumbents` is a one-line data change later.
2. Should block ids be shown to callers for feedback? Proposal: no; they
   ride on `done.variant` for receipts and tests only.

## Changes
- 2026-11-06 — created; no blocking questions, APPROVED 2026-11-06 (auto);
  built in the same PR.
- 2026-11-06 — SHIPPED (PR #34): all four sections merged in one PR; spec
  delta folded into `docs/specs/personalised-documents.md`; archived.
