# Leadership routing — reach every caucus vote a visitor has — PRD
Status: SHIPPED 2026-11-06 (PR pending) · Owner: George Nguyen · Last updated: 2026-11-06

## Problem
Two votes decide who leads the Democrats in the 120th Congress. One is the
House Democratic Caucus leadership election, where the winner is the
Speaker nominee in a majority and Minority Leader otherwise; the date in
our data is a placeholder, 2026-11-18. The other is the Senate Democratic
Conference leader election: press says December, our placeholder is
2027-01-05. Both are secret ballots cast by the members-elect of the 120th
Congress. The goals `house-caucus` and `senate-leader` exist, but on the
data and code as of 2026-11-06 the router misses most of the calls a
visitor could make:
1. **The Senate card is hidden.** Results show exactly two cards. The
   current scores are `ndaa-1217` 4.5 (priority 3, 34 days out),
   `house-caucus` 4 (priority 2, 12 days) and `senate-leader` 2 (priority
   2, 60 days). So anyone with a Democratic representative never sees the
   Senate card, and the three-call case (D rep plus two Democratic-caucus
   senators, in 21 states) never appears on `/results`.
2. **Independents are dropped.** The rule `{"senator": {"party": "D"}}` and
   the filter `m.party === 'D'` in `worker/src/route.ts` both skip King
   (ME) and Sanders (VT), who caucus with Democrats and vote for the leader.
   Maine gets no Senate call, and Vermont gets one instead of two.
3. **The wrong people get called.** Every row's `not_returning` is empty,
   though the 2026-11-03 results are in. Retiring and defeated members are
   targeted for a ballot they won't cast. Members-elect, who will cast it,
   aren't in `data/` at all, for example Senator-elect Stratton (IL), named
   in `docs/research/senate-leader-candidates.md`.
4. **The House ask is off-target.** The House goal's ask is an NDAA vote
   pledge, not a condition on the leadership ballot. Neither goal tells a
   non-leader's office that the incumbent leader has not made the
   commitment. Only NY-8 and New York callers get the "commit or step
   aside" ask, from `leader-call-scripts` (archived, PR #34).

## Goals / Non-goals
- Goals: (1) every visitor sees, on `/results`, a call for each seat
  that will vote in a Democratic leadership election for them, so up to
  three calls; (2) targets are the 120th-Congress caucus: returning
  members plus members-elect, never a departing member; (3) members who
  caucus with Democrats are targeted whatever their party label; (4) both
  goals ask for the same thing, a leadership ballot conditioned on a
  public commitment to strip the integration section, and tell
  non-leaders' offices, from a sourced row, whether Jeffries or Schumer
  has made it.
- Non-goals: the Speaker floor vote of 2027-01-03. The caucus ballot is the
  lever, and a floor ask could hand the gavel to a Republican. Also out:
  calls from non-constituents, which offices discard; member pages for
  members-elect; deputy leadership races; whip counts for leadership
  goals; an unconditional "vote against" ask (the owner chose the
  conditional form on 2026-11-06, Open question 1); any change to
  federal (NDAA) targeting, because departing members still vote in the
  lame duck.

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/leader-call-scripts.md`,
`docs/research/senate-leader-candidates.md`.
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| One card per issue that lists every office to call | 5 Calls | Adopt | One leadership card with the House and Senate calls together keeps "two actions" and shows all three numbers |
| Members-elect listed with their transition or campaign contact before swearing-in | Ballotpedia, Indivisible post-election toolkits | Adapt | We list only Democratic-caucus members-elect, only with a sourced called race, and never route them to the switchboard, which can't reach them |
| Patch-through toll-free line that asks for ZIP | advocacy call tools | Reject | A ZIP splits districts, and patching costs money; we already resolve a street address to exact seats |
| Naming the leader in every caller's ask | post-midterm reels | Adapt | Named only through a sourced commitment row, so the line flips when the fact changes and no LLM decides it |

## Users
- **Most visitors:** have a Democratic rep and one or two
  Democratic-caucus senators, and today see one leadership call.
- **Maine and Vermont visitors:** King and Sanders are their caucus votes.
- **Visitors whose seat changes hands on 2027-01-03:** the member-elect
  is the call. If the race isn't called yet, there is no call for that
  seat, and the card says why.
- **NY-8 and New York visitors:** keep the incumbent self-ask from PR #34.
- **Visitors with no Democratic-caucus seat:** no leadership card. The
  NDAA and state cards fill both slots, as today.

## Expected behavior

### 1. Caucus and incoming-member data
1. `data/members.csv` gains a `caucus` column, `D | R | empty`. The seed
   derives an empty cell from `party` when the party is `D` or `R`. An
   `I` row needs an explicit value: King and Sanders are `D`. An `I` row
   left empty fails the seed and names the member, so a new independent
   can't silently drop out.
2. `not_returning` is hand-set to `1` from the 2026-11-03 results for
   every member who retired, lost or ran for another office. Each change
   carries a source URL in the commit body (AP or the state election
   office). The roster import already preserves this column.
3. New `data/members_elect.csv` holds one row per member-elect whose race
   is called, with columns
   `elect_id,name,party,caucus,chamber,state,district,replaces,contact_url,phone,source_url,source_date`.
   - `elect_id` is `<STATE>-<district | S>-<surname-kebab>`, for example
     `IL-S-stratton`.
   - `replaces` is the bioguide id of the member whose seat this is, and
     that member must have `not_returning` or `left_office` set.
   - `contact_url` is the member-elect's own site, https.
   - `phone` is optional (ten digits) and only from the member-elect's own
     site.
   - `source_url` and `source_date` point to the called race.

   Only Democratic-caucus rows are needed, but any caucus is accepted.
   The seed fails, naming the row, on:
   - a duplicate `elect_id`;
   - a `replaces` that is unknown, in a different chamber, state or
     district, or that names a returning member;
   - two rows for one `replaces`;
   - a bad phone, URL or date;
   - any row still present after 2027-01-10, because by then the roster
     import carries them.

### 2. Router: one leadership slot, the incoming caucus
1. **Incoming delegation.** For each of the visitor's seats (the House
   seat and each Senate seat), the incoming member is:
   - the sitting member, if not `not_returning` and not `left_office`;
   - otherwise the `members_elect.csv` row whose `replaces` is that
     member;
   - otherwise nobody (the race is uncalled).
2. **Leadership eligibility and targets** use the incoming delegation. Both
   field sets gain `caucus`. The goals' rules become
   `{"house": {"caucus": "D"}}` and `{"senator": {"caucus": "D"}}`. The
   target filter is `caucus === 'D'` (replacing `party === 'D'`) and runs
   on the incoming delegation. Federal and state goals keep the sitting
   delegation unchanged.
3. **One shared slot.** When both leadership goals are eligible, they take
   one slot: the higher-scoring goal is the card, and the other rides on
   it as `also`. The slot's score is the higher of the two. A single
   eligible leadership goal is a card on its own, as today. The H1 stays
   "Your two actions this week".
4. **The leadership card** shows a "House" block (its target and CTA to
   `house-caucus-call`), then a "Senate" block (its targets and CTA to
   `senate-leader-call`), each with that goal's decision date. A
   member-elect target shows:
   - the role "Representative-elect" or "Senator-elect";
   - the line "Takes office 2027-01-03, replaces <name>";
   - a `tel:` link only when `phone` is filled, otherwise "Contact" linking
     to `contact_url`. Never the switchboard.
5. **An uncalled seat** that would have a Democratic-caucus vote shows the
   line "<Chamber> seat: race not called yet." instead of a target. A seat
   won by the other caucus shows nothing.
6. **The counts line** (`district-counters.md`) and receipts use the
   target's id: a bioguide id, or an `elect_id` for a member-elect.
   `target_id` columns are free text, so no schema change is needed.

### 3. One ask for both chambers, with the leader named by a sourced row
1. `house-caucus` becomes a leadership ask:
   - **title:** set by `plain-english-copy.md` ("Kick out Hakeem
     Jeffries"), which also shipped the ask, `doc_format` and script-block
     changes in this item; what remains of §3 is items 2–3;
   - **what_we_want / ask_text:** "Ask your representative to vote only
     for a leader who commits, in public, to stripping the integration
     section."
   - **action `doc_format`:** ask phrase "vote only for a leader",
     mentions `integration section` and `leader`;
   - **`prep_md`:** rewritten to match.

   The ids stay the same. The House non-self ask variants in
   `data/script_blocks/leadership.yaml` are rewritten to that ask. The
   self variants keep "commit in public or step aside".
2. **Leader commitment rows.** The incumbent leaders' commitment is a row
   in `data/positions/house-caucus.csv` (J000294) and
   `data/positions/senate-leader.csv` (S000148): `for` means committed in
   public to stripping the section, `uncommitted` or `against` means not.
   The files are append-only and every row is sourced, as today. With no
   row, the incumbent counts as `uncommitted`, and no line claims a
   source.
3. **New placeholder `{{leader_line}}`,** filled by deterministic code for
   non-self targets of a leadership action:
   - `uncommitted` or `against` with a sourced row: "<Leader name> has not
     made that commitment, so I am asking <target_role> <target_name> to
     vote for someone else unless that changes."
   - no row: "<Leader name> has not said so in public, so I am asking
     <target_role> <target_name> to vote for someone else unless that
     changes."
   - `for`: "<Leader name> has made that commitment in public."

   The line has no digits and no pronouns. The ask slot's non-self
   variants carry it. `checkOutput` and the block seed rules apply
   unchanged.

## Data & contracts
- `data/members.csv` + `caucus` (last column). D1 `members` + `caucus TEXT`.
- New `data/members_elect.csv` (§1.3). New D1 table `members_elect` with
  the same columns, seeded by `worker/scripts/seed.ts`.
- `Repo` gains `membersElect(state)`. `assembleDelegation` returns
  `incoming: {house, senators}`, where each item is a member row or an
  elect row with `elect: true, replaces_name`.
- `GoalCard` + optional `also: GoalCard` (one level only, leadership
  only). A target's `role` adds `Representative-elect | Senator-elect`
  and `elect?: {replaces_name, takes_office: '2027-01-03', contact_url}`.
  Target `phone` may be null only for an elect target.
- Ranking field sets: house + `caucus: 'party'`, senator + `caucus:
  'party'`, both limited to `D | R`.
- `FIXED_PLACEHOLDERS` + `leader_line`. In `leadership.yaml`, `when` is
  unchanged.
- No new browser storage and no endpoint changes beyond the body shape
  above.

## Spec delta
- MODIFIED `docs/specs/action-router.md` §Behavior 5: "exactly two cards" → "two slots; a leadership slot can hold both leadership goals as one card with House and Senate blocks (`also`)".
- MODIFIED `docs/specs/action-router.md` §Behavior 7: leadership goals target "only Democratic members" → "the incoming delegation's `caucus = D` seats, a member-elect replacing a departing member, an uncalled seat shown as a line"; `not_returning` keeps its slot for federal goals only.
- MODIFIED `docs/specs/action-router.md` §Data & contracts: `GoalCard.also`, elect targets, ranking `caucus` field, leadership rules evaluated on the incoming delegation.
- MODIFIED `docs/specs/member-pages.md` §Data & contracts: `members.csv` + `caucus` with the derive and fail rules.
- ADDED `docs/specs/member-pages.md` §Data & contracts: `data/members_elect.csv`, its columns, seed checks and the 2027-01-10 expiry.
- MODIFIED `docs/specs/personalised-documents.md` §Behavior 5: `{{leader_line}}` for non-self targets of leadership actions, filled from the incumbent's commitment row.
- MODIFIED `docs/specs/goal-pages.md` §Behavior: `house-caucus` title and ask are the leadership condition.

## Acceptance criteria
- [ ] An address in a state with two Democratic senators and a Democratic
      House seat shows one leadership card with three targets: House
      block 1, Senate block 2. The NDAA card is the other slot.
- [ ] A Maine address shows King in the Senate block. A Vermont address
      shows Welch and Sanders.
- [ ] A seat whose member has `not_returning`, with a Democratic-caucus
      member-elect row, shows the member-elect with "Takes office
      2027-01-03, replaces <name>", and never the departing member, on a
      leadership card. The same visitor's NDAA card still shows the
      departing member.
- [ ] A member-elect with no `phone` shows "Contact", never a `tel:` link
      or the switchboard.
- [ ] An uncalled seat shows "<Chamber> seat: race not called yet." A seat
      flipped to the other caucus shows no leadership target.
- [ ] A visitor with a Republican House seat and no Democratic-caucus
      senator sees no leadership card, same as today.
- [ ] The seed fails, naming the row, for: an `I` member with empty
      `caucus`; an elect row whose `replaces` is returning, unknown or in
      another seat; two elect rows for one seat; any elect row after
      2027-01-10.
- [ ] With no commitment row for J000294, a non-NY-8 House target's script
      carries "Hakeem S. Jeffries has not said so in public…" and never
      claims a source. Adding a sourced `uncommitted` row switches it to
      "has not made that commitment". Adding `for` switches it to "has
      made that commitment in public". The same holds for S000148 on
      Senate scripts.
- [ ] Jeffries' and Schumer's own constituents still get the self ask and
      never `{{leader_line}}`. 300 seeds per target pass `checkOutput`.
- [ ] The House action's scripts carry "vote only for a leader" and
      "integration section". No House non-self variant still asks for an
      NDAA vote pledge.
- [ ] `/api/route` ≤2 s p95. The results page stays within its current
      budget (9.9 KB gzipped HTML + JS/CSS, `office-visits.md` measure)
      +2 KB.

## Rollout & metrics
- **Order:** §1 first. Fill `caucus` and `not_returning`, then the
  Democratic-caucus `members_elect.csv` rows, before §2 deploys, or §2
  shows uncalled lines everywhere. §3 can ship before or after §2.
- **Deadline:** the House caucus date (2026-11-18 placeholder). §1 and §2
  must ship before it to matter.
- **Maintainer work:** research routine 1 (`maintainer-research-routines.md`)
  can propose `not_returning` and elect rows. A human merges every row,
  as today.
- **Measure:** the share of leadership-card views with ≥2 targets, and
  call receipts per leadership card, against before.

## State (updated 2026-11-06, §2–3 shipped)
- Sections:
  - [x] 1. Caucus and incoming-member data · PR #48 merged
  - [x] 2. Router: one leadership slot, the incoming caucus · feat/leadership-routing-router-and-ask
  - [x] 3. One ask for both chambers, with the leader named by a sourced row · feat/leadership-routing-router-and-ask
- Completed: PRD, §1, §2, §3.
- Folded: §1 (member-pages.md §Data & contracts); §2–3 (action-router.md
  Behavior 5/7, Data & contracts, Invariants; personalised-documents.md
  Behavior 5; goal-pages.md Behavior 2 and Invariants).
- Branch / open PRs: feat/leadership-routing-router-and-ask (§2 + §3 in one PR).
- Files changed (file:line map): `worker/src/types.ts` (`ElectSeat`, `IncomingSeat`,
  `UncalledSeat`, `Incoming`, `TAKES_OFFICE`, `Delegation.incoming`);
  `worker/src/repo.ts` (`incomingSeat`, `assembleDelegation` with elects);
  `worker/src/ranking.ts` (`ruleInput`, `caucus` field, `Slot`, `slots`, `topTwo`
  returns slots); `worker/src/route.ts` (`electCard`, `GoalCard.chamber/also/uncalled`,
  `TargetCard.elect`); `worker/src/generate.ts` (`LeaderRow`, elect `Target`,
  `incumbentIds`, `pickLeader`, `leaderLine`, `resolveTarget` elect ids);
  `worker/src/standard.ts` (`leader_line`, elect seed targets); `worker/src/load.ts`,
  `worker/src/index.ts` (report `known` for elect ids); `data/goals/house-caucus.yaml`,
  `data/goals/senate-leader.yaml` (caucus rules); `data/positions/house-caucus.csv`,
  `data/positions/senate-leader.csv` (new, header only); `data/script_blocks/leadership.yaml`
  (`{{leader_line}}`, trimmed asks); `data/README.md` (grammar);
  `web/src/components/Results.tsx` (`Card`, `Block`), `web/src/components/Target.tsx`
  (elect line, Contact link); tests `worker/test/leadership.test.ts` (new),
  `web/src/components/Results.test.tsx` (new), fixtures/route/goals/electoral/ranking
  expectations updated for the incoming delegation.
- Tests run + result: quiet-check tsc PASS, test PASS (worker), test-web PASS
  (78), build PASS; results page 28.1 KB gzipped by the transitive-chunk
  measure vs 27.8 KB on main (+0.3 KB; budget +2 KB).
- Remaining: none.
- Decisions since last update: leader-line wording shortened and three ask
  variants trimmed to fit `max_words` 120 (see Changes); TX-21 and PA-1 route
  fixtures now expect `senate-leader` / `house-caucus` because Talarico and
  Harvie are incoming Democrats; the all-Republican case strips elect rows.
- Known failures / blockers: none.
- Next action: merge the §2–3 PR; archived.
## Open questions
1. Name Jeffries and Schumer to every Democratic office, and how?
   Answered by the owner on 2026-11-06: conditional. The leader is named
   through a sourced commitment row, with "vote for someone else unless
   that changes" (§3).
2. Do non-voting delegates (DC, PR, VI) get the House leadership call?
   Proposal: yes. Caucus rules let delegates vote in caucus elections, and
   they have `party = D` and `caucus = D` like any member.
   [VERIFY: the House Democratic Caucus rule, before §2 ships.]
3. Does a member-elect without a phone get a call script or an email?
   Proposal: the same call script, with "Contact" as the channel. The
   script reads the same aloud or pasted into a form, and adding an email
   action is a new action id, out of scope.
4. Should the shared card order House or Senate first? Proposal: House
   first, because its caucus vote is sooner.

## Changes
- 2026-11-06 — created. Open question 1 answered by the owner before
  creation; no blocking questions, so APPROVED 2026-11-06 (auto).
- 2026-11-06 — §1 built: `caucus` column (derive/fail rules), `members_elect.csv`
  + D1 table + `Repo.membersElect`, seed checks with the 2027-01-10 expiry,
  `not_returning` set from the 2026-11-03 results. Kevin Kiley (CA-3, `I` in
  the roster) is hand-set `caucus = R`, the same rule the PRD gives for
  King and Sanders. Spec delta for `member-pages.md` folded.
- 2026-11-06 — §2 and §3 built on one branch and one PR (both touch
  `route.ts`, `standard.ts` and `leadership.yaml`, so two PRs would have
  conflicted). Deviation from §3.3 wording: the non-`for` leader lines
  end "Until that changes, the vote should go to someone else." instead
  of "so I am asking <target_role> <target_name> to vote for someone else
  unless that changes", and the House/Senate ask variants drop "from the
  NDAA" / "and say so before the vote" / "and who that is" — the
  longest combination for a four-word name was 122 words against the
  120-word `max_words` of the call script. Dates in the elect line are
  formatted like every other date on the page ("Takes office Jan 3,
  2027, replaces <name>"). Spec deltas for `action-router.md`,
  `personalised-documents.md` and `goal-pages.md` folded.
