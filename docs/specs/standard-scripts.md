# Standard scripts

## Purpose
Serves a deterministic call script, letter or comment when no model may
run: a per-action template or a seeded composition from script blocks,
filled from the same sourced rows as the generated document and held to
the same output check. The user never sees an error where a script
would do. Generation, its guardrails, receipts and reports are in
`personalised-documents.md`.

## Behavior
1. **When it runs.** When no model may run — the day's cap is reached
   (`reason: capacity`), `ANTHROPIC_API_KEY` is unset (`unconfigured`),
   `LLM_MONTHLY_BUDGET_USD` is 0 (`budget`), or the screen or both model
   attempts threw (`upstream`) — the route serves the action's standard
   script instead: `worker/src/standard.ts` fills `{{target_name}}
   {{target_role}} {{ask}} {{mention}} {{position_line}} {{prior_vote_line}}
   {{pick_line}} {{leader_line}} {{user_<field>}}` from the same rows as the
   fact block and the stripped user fields, shortens the longest user field
   word by word when the fill passes `max_words`, and runs the output check of
   `personalised-documents.md` Behavior 3 (a failed fill returns `error {refused}`). Same SSE stream:
   `status {stage: 'standard', reason}`, one `delta`, `done {..., standard:
   true, reason}`; no Anthropic request is made on that path. The act page
   labels it "Standard script — not personalised today" with one line of
   why; receipt, commitment, captain, share and report are unchanged. The
   `generations` row has `model = 'standard'`, zero tokens and `check_fail`
   null, so counts and limits see it and `costUsd` adds $0. The loader
   (`checkStandardTemplates`) rejects an `active` goal's action without a
   template or blocks, an unknown placeholder, a brace left in the text, or
   a fill that fails the output check for any in-scope target with the
   shortest or the longest valid fields.
2. **Composition from blocks.** The template is `standard_template`, or,
   when the action names `script_blocks: <name>`, a composition from
   `data/script_blocks/<name>.yaml` (`worker/src/compose.ts`): each slot
   contributes `pick` distinct variants (default 1) drawn from the variants
   whose `when` holds for this request (`chamber`, `self` = the target is
   one of the file's `incumbents`, `has` = these placeholders render non-
   empty), kept in file order, variants joined by a space and slots by a
   newline. The draw is seeded by the request's `variant` (a random integer
   the act page sends; absent or invalid = random), so one seed always gives
   one script and the next seed a different one; `done.variant` names the
   chosen block ids joined by `.`.
3. **Self asks and the leader line.** Only an incumbent gets the self asks
   (commit in public or step aside); every other target gets the vote-only
   asks, each ending in `{{leader_line}}`: one code-built sentence
   (`leaderLine`, `worker/src/generate.ts`) on the incumbent leader of the
   target's chamber (the file's `incumbents`), from that leader's row in the
   goal's positions file — `for`: "<Leader> has made that commitment in
   public."; `against`/`uncommitted`: "<Leader> has not made that
   commitment. Until that changes, the vote should go to someone else."; no
   row: "<Leader> has not said so in public. Until that changes, the vote
   should go to someone else." It is empty for the incumbents themselves and
   for state targets, has no digits and names no source.
4. **Members-elect and the button.** A leadership action's target may also
   be a member-elect (`elect_id`; leadership-routing §2.6): role
   "Representative-elect"/"Senator-elect", fact block "Takes office
   2027-01-03, replacing <name>" and "Prior vote: No recorded vote yet",
   contact from the elect row. Every ask carries the action's `ask` phrase
   and a mention. For such an action the act page's regenerate button reads
   "Another version" and resends with a new seed. The leadership actions
   (`house-caucus-call`, `senate-leader-call`) use `leadership.yaml`; the
   NDAA action keeps a plain template.

## Data & contracts
- `actions.script_blocks` (TEXT, JSON of the parsed blocks file or
  null) sits beside `standard_template`; the YAML key `script_blocks:
  <name>` names `data/script_blocks/<name>.yaml` (`incumbents[]`,
  `slots[] {name, pick?, carries? (ask | mention), variants[] {id, text,
  when? {chamber?, self?, has?}}}`; shape and rules in `data/README.md`).
  `worker/src/compose.ts` parses, filters and draws; `standardScript`
  takes the seed and returns `variant`.
- `worker/src/standard.ts`: `standardScript`, `fillStandard`,
  `fixtureFields`, `checkStandardTemplates`. `standard_template`
  (Behavior 1) is required in an active action's YAML while the goal is
  active; the SSE events it emits are those of `POST /api/generate`
  (`personalised-documents.md` §Data & contracts).

## Invariants (regression checklist)
- [ ] Every active action's `standard_template` passes the output check
      for every in-scope target with the shortest and longest fixture
      fields; `loadRows` names the action otherwise
      (`worker/test/standard.test.ts`).
- [ ] Every active action with `script_blocks` has ≥ `pick` eligible
      variants per slot for every in-scope target, every carrier
      variant holds the ask phrase or a mention, no variant holds a
      digit, URL or blocked term, the shortest and longest compositions
      stay within `min_words`–`max_words`, and three seeded compositions
      per target and fixture pass the output check; `loadRows` names the
      action, slot and variant otherwise (`worker/test/compose.test.ts`).
- [ ] An incumbent named in `incumbents` never receives a non-self ask
      and no other target receives a self ask; 300 seeds per target give
      ≥ 100 distinct bodies (`worker/test/compose.test.ts`).

## Performance budget
Standard script complete ≤500 ms p95; no Anthropic request on that path,
so $0 per document.
