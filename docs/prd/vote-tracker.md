# District-routed vote tracker — PRD
Status: APPROVED 2026-11-04 (auto) · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
Members of Congress move on constituent pressure tied to a specific roll
call, and that pressure dissipates when no vote is scheduled. No US tool
combines a public per-member whip count with district-routed constituent
contact for one named vote: 5 Calls and Resistbot are topic-first and never
show where a member stands or what their office said; petitions are
list-building. The nearest live, least-watched decision is the NDAA FY2027
conference on Section 224 (the US–Israel defense-technology integration
initiative), Nov–Dec 2026. A resident of Orange, CA is in CA-46 (Correa,
voted to keep aid) or CA-40 (Republican) depending on the street, and
today has no way to learn which lever they hold.

## Goals / Non-goals
- Goals:
  1. One vote, one date window: every House Democrat's position with a
     dated source, sorted uncommitted first, counts computed from the rows.
  2. Route a visitor by full street address to their House member and
     senators and give them one specific ask with a personalised script.
  3. Turn a private commitment into a related harder action in the same
     session, then into a named list of three people the user recruits.
  4. Show real own-side participation per district from completed-action
     receipts, never from sign-ups.
- Non-goals:
  - Persuading opponents. Moral-emotional contagion stays inside the
    aligned network; this mobilizes the 74% of Democrats already opposed.
  - Petitions, form emails, auto-dialing or faxing. The tool never contacts
    an office on a user's behalf.
  - State and local levers (CalSTRS, city investment policy) in v1: a
    static page lists the top three, nothing interactive.
  - Accounts, logins, reminders by email or SMS in v1.
  - Any count or tally produced by an LLM (CLAUDE.md §Don'ts).

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/civic-action-levers/levers-and-actions.md`,
`docs/research/civic-action-levers/decision-points.md`,
`docs/research/civic-action-levers/organizing-channels-and-tools.md`,
`docs/research/civic-action-levers/behavioral-science-and-virality.md`,
`docs/research/civic-action-levers/speaker-vote-context.md`.
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Zip → reps, curated script, auto-dial, many topics | 5 Calls | adapt | Keep address → member + script; drop auto-dial and the topic list. One vote, not an issue menu. |
| Text → letter/fax to every rep | Resistbot | reject | Offices unplugged fax machines; form volume is tallied for/against only; CMF rates form contact lowest. |
| Per-legislator page with direct-contact buttons; legislators in for / undecided / against columns | Na Pressão (CUT, Brazil) | adopt | The visible whip count plus a per-target channel is the mechanism credited with the PEC da Blindagem defeat (Senate committee killed it 3 days after). |
| One-way channel, dated daily missions, one commanding voice | "Exército do Lula" WhatsApp channel | adapt | Daily dated mission at the top of the page during the window; spread by deep links into the user's own groups, since we own no channel. |
| Bill explainer bundled with legislators' numbers | Finance Bill GPT (Kenya) | adapt | Bundle the explainer and official office numbers; never crowdsource private numbers (harassment, data-protection breach, and the bill passed anyway). |
| Paid-creator petition | Change.org "choose a new speaker" | reject | Monetized list-building with no delivery plan; public token support licenses non-action (Kristofferson et al. 2014). |
| Nominate three named people + 24-hour deadline + documented act | Ice Bucket Challenge; vote tripling | adopt | Relational organizing dressed as a game; captains with named lists +13 pts (Turnout Nation), vote tripling +4.5–10 pts in primaries. |
| Show own side's participation is large | Hager et al. 2022 | adopt | Left-leaning supporters act more when told their side's turnout is large; hide counts until they are. |
| Reflection prompt after an action | Han 2016 | adopt | Cheapest retention mechanic with experimental support for follow-up attendance. |
| Verified-constituent polls, 14-day silence badges | CivicView, citizensunited.app | reject | Verification unproven; we display receipts of hard actions, not polls of opinion. |

## Users
1. **Constituent of a Democratic House member** (CA-46, Correa). Needs: who
   is my member, where do they stand, what do I say, by when. Primary user;
   default copy is written for them.
2. **Constituent of a Republican House member** (CA-40). No House lever on
   this vote. Gets the two senators, a plain "no House lever in your
   district" line, and the static state/local page. Must not be made to
   feel their action is pointless: senators are a real target.
3. **Captain**: a user who commits to a named list of three. Needs a
   checklist that survives reload and a deadline.
4. **Reporter**: a user who called and records what the office said. Needs
   a 10-second form; their report is evidence, never a position change.
5. **Maintainer** (owner): the only one who changes a member's position,
   always with a source link; writes the daily mission.

## Expected behavior
### 1. Vote page and whip count
1. The landing page is one vote: title ("Strip Section 224 from the FY2027
   NDAA"), what it does in ≤60 words, who decides (conferees, then the
   floor), the window (Nov–Dec 2026; "floor date TBD" until known), and
   four count tiles: For stripping · Uncommitted · Against · Unknown.
   Tiles are computed at build time from the positions file.
2. Below: one row per House Democrat, plus every conferee of either party
   flagged "conferee". Columns: name, state-district, position, source
   (link + date), DC phone, district phone, one-line script keyed to the
   position, latest office-response report (date + ≤140 chars, labelled
   "unverified"). Sort: conferees first, then uncommitted, unknown,
   against, for. Filter by state.
3. A position changes only through the maintainer, with a source URL and
   date required; the change is appended to a log (who, when, old → new,
   source). User reports never change a position; they sit beside it.
4. First run: every position starts Unknown except members with a cited
   public statement (Khanna: For). A "prior vote" column shows Roll Call
   243 (Jul 15, 2026): Aye / No / Present / Absent.
5. The table and tiles render as static HTML; with JavaScript off they are
   still readable and the phone numbers are still `tel:` links.

### 2. Address routing and the ask
1. One address field, full street address required (Orange, CA is split
   across two districts; zip alone is refused with a one-line reason).
   Resolves to the House district and both senators. The address is sent
   only to the district lookup and never stored; the district is kept in
   local browser state.
2. Result card: "Your representative: X — position Y (source)." and "Your
   senators: Padilla, Schiff." House ask: vote to strip Section 224 in
   conference, or tell the conferees to. Senate ask: thank them for the
   April 2026 arms-sale votes, hold on Section 224, and condition the
   December leadership vote on it.
3. Republican district: the card shows the senators, the line "No House
   lever on this vote in CA-40", and links the static state/local page
   (CalSTRS/CalPERS public comment, the 2026 pension-divestment bill,
   donating to challengers).
4. Script: ≤80 words with the user's name, city, and one personal line they
   type (CMF: a personal story helps for 79% of staff, 18% receive one).
   Copy to clipboard and `tel:` links only; nothing is dialed or sent.
5. Unresolvable address: offer retry and a manual district picker.

### 3. Commitment funnel and captains
1. Private first. After the script, one choice: "I'll call by <date>".
   Stored locally and privately; no public counter moves, no share prompt
   appears.
2. Same screen, immediately: the related hard ask. "Can you get to the
   district office? Five to ten constituents meeting staff is the most
   effective contact there is." The user requests a slot in the next
   district-office visit for their district (listed by a captain) or, after
   the call, reports what the office said (§4.4).
3. Captain list: "Name three people in your district you'll ask to call by
   <deadline>." Three first names plus how they'll reach each (no phone
   numbers), deadline ≤48 hours, a checklist that persists across reload,
   and a downloadable calendar reminder (.ics). No server-side reminders.
4. After the first completed action, one optional line: "What did making
   that call mean to you?" Stored privately; never shown publicly.
5. Marking a call done, a visit attended, or a list filled creates a
   receipt: district, action type, date. No names, no addresses.

### 4. Receipts, missions and sharing
1. Per-district counters from receipts: calls made, visits held, captains
   active. Shown on the member's row and on the user's result card ("N
   constituents in CA-46 called this week"). Hidden until N ≥ 5; small
   numbers signal that nobody is acting.
2. Daily mission: maintainer-written, dated, one target, one ask; pinned
   at the top during the window; expires at its date.
3. Sharing exists only after a completed action. The share unit is the
   receipt ("Four of us met Correa's staff today. Who's next?") with a
   pre-filled deep link to the district card, offered through the device
   share sheet (WhatsApp, Signal, iMessage). No "I signed" badge, no share
   affordance before an action is complete.
4. Office-response report after a call: one pick (will vote to strip ·
   undecided · will keep · didn't answer · other ≤140 chars). Shown as the
   latest unverified evidence on the row; the maintainer reviews before
   any position change.
5. Abuse limits: receipts and reports rate-limited per device hash; a
   report containing a phone number or street-address pattern is rejected;
   no crowdsourced staff numbers anywhere.

## Data & contracts
- `data/votes/ndaa-fy27-s224.yaml`: id, title, summary (≤60 words), body,
  window_start, window_end, floor_date (nullable), ask_house, ask_senate.
- `data/members.csv`: bioguide_id, name, party, state, district, dc_phone,
  district_phone, conferee (bool), prior_vote_rc243 (aye|no|present|absent).
  Seeded from the unitedstates/congress legislators file plus the Clerk's
  Roll Call 243 page.
- `data/positions/ndaa-fy27-s224.csv`: append-only; bioguide_id, position
  (for|uncommitted|against|unknown), source_url, source_date, changed_by,
  changed_at. Latest row per member wins. Changes land as PRs; a lint
  rejects a non-unknown position without source_url and source_date.
- Receipts store: receipts(id, district, action: call|visit|list_filled|
  report, created_at, device_hash). Reports store: reports(id, bioguide_id,
  outcome, note ≤140, created_at, device_hash, hidden bool).
- Commitments, captain lists and reflections: browser-local only
  (localStorage), no server copy in v1.
- District lookup: Census Geocoder (no key) returning the congressional
  district for the map in force for the 119th Congress (see Open question
  2); senators from `data/members.csv` by state.
- Counters: derived by deterministic code from the receipts store; tiles
  from the positions file at build time.

## Spec delta
- ADDED `docs/specs/vote-tracker.md`: the whole spec (Purpose; Behavior
  from §1–§4 above; Data & contracts; Invariants).

## Acceptance criteria
- [ ] Landing shows the vote, window, and four tiles whose numbers equal
      the latest-row counts in the positions file (a test compares them).
- [ ] Every House Democrat has a row; every non-unknown position has a
      source link and date; a position row without them fails the lint.
- [ ] A full street address in Orange, CA resolves to CA-46 or CA-40 under
      the 119th Congress map; zip-only input is refused with a message.
- [ ] Republican-district result shows both senators, the "no House lever"
      line, and the state/local page.
- [ ] The script contains the user's name, city and personal line; copy and
      `tel:` links work; nothing auto-dials or sends.
- [ ] A commitment changes no public counter and shows no share prompt;
      both appear only after an action is marked complete.
- [ ] A captain list needs three names and a deadline ≤48 h; it persists
      across reload; the .ics downloads.
- [ ] A district counter is hidden below 5 receipts and equals the receipt
      count at or above 5.
- [ ] A report cannot change a position; a report containing a phone
      number or street address is rejected; a device cannot file more than
      5 reports an hour.
- [ ] Table, tiles and `tel:` links work with JavaScript disabled.
- [ ] Performance budget: landing page ≤100 KB transferred, LCP ≤1.5 s on
      a mid-range phone over 4G; address lookup ≤2 s p95. The PR for §1
      copies these into CLAUDE.md §Performance budgets.

## Rollout & metrics
- No feature flag; one vote only. Launch when ≥50 positions are
  non-unknown and the conference window is confirmed.
- Measured from receipts and the positions log, by deterministic code:
  commitments → completed calls; captains with lists filled; visits held
  per district; reports per uncommitted member; positions moved from
  unknown/uncommitted to for, with source dates.
- Success for this vote: at least one report on every uncommitted
  conferee, and one district-office visit held in CA-46 before the floor
  vote.

## State (updated 2026-11-04)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [ ] 1. Vote page and whip count
  - [ ] 2. Address routing and the ask
  - [ ] 3. Commitment funnel and captains
  - [ ] 4. Receipts, missions and sharing
- Completed: none.
- Folded: none.
- Branch / open PRs: none.
- Remaining: all.
- Decisions since last update: see Open questions (all proposals adopted).
- Next action: `/implement-prd-section docs/prd/vote-tracker.md` (§1).

## Open questions
1. Which vote first? Proposal: NDAA FY2027 Section 224 conference. It is
   the least-watched live decision with identifiable owners (conferees).
   The December Senate leader vote is a secret caucus ballot with no roll
   call, so a whip count cannot be verified; the next appropriations
   amendment window is 2027. The tool is built so a second vote is a new
   YAML file, not a rebuild.
2. Which district map for a lame-duck vote? Proposal: the conference
   happens before Jan 3, 2027, so route by the 119th Congress map; switch
   to the post-Prop 50 map for the next vote. Research only records the
   post-Prop 50 split of Orange; the build confirms Orange's 119th-map
   districts against the Census Geocoder before seeding copy.
3. Conferees not yet named? Proposal: until they are, flag House Armed
   Services Democrats as the targets and label them "likely conferee".
4. Stack. Proposal: static site (Astro or Eleventy) on Cloudflare Pages;
   one small worker with D1 for receipts and reports; data as CSV/YAML in
   the repo edited by PR, with the positions lint in `scripts/`. Not
   blocking: no acceptance criterion depends on it.
5. Unconfirmed research facts the seed touches: Khanna's amendment failed
   by voice vote on June 4, 2026; the Senate text carries a matching
   provision; the April 2026 Senate vote tallies. Proposal: positions
   start Unknown except members with a cited public statement; the seed
   PR links each source so the maintainer can reject it.
6. Report moderation. Proposal: reports show immediately with an
   "unverified" label; the maintainer can hide one; positions stay
   maintainer-only.

## Changes
- 2026-11-04 — created (APPROVED, auto: every question carries a proposal, none blocking).
