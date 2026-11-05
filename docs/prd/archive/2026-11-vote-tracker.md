# Address-routed vote tracker — PRD
Status: SUPERSEDED by action-router · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
Members of Congress move on constituent pressure tied to a specific roll
call, and that pressure dissipates when no vote is scheduled. No US tool
combines a public per-member whip count with address-routed constituent
contact for one named vote: 5 Calls and Resistbot are topic-first and never
show where a member stands or what their office said; the "call your reps"
content circulating on TikTok is ceasefire-era and generic; the one live
call tool on the current decision (Adalah's NDAA campaign) has no script, no
count and no per-member status; petitions are list-building. The nearest
live, least-watched decision is the NDAA FY2027 conference on the US–Israel
defense-technology integration section (House §219 / Senate §1217, formerly
§224), Nov–Dec 2026. Every one of the 435 House districts and 50 states has
a different set of levers on it (a Democratic House member, a conferee, a
senator who voted on the April 2026 arms sales, a pension fund holding
Israel bonds), and no one can enter an address and learn which they hold.

## Goals / Non-goals
- Goals:
  1. One vote, one date window: every House member's and senator's position
     with a dated source, sorted uncommitted first, counts computed from
     the rows.
  2. Route a visitor anywhere in the US by full street address to their
     House member, two senators and state, and give them the one ask that
     applies to each, with a personalised script. No district is a dead
     end: a Republican-district user gets senators; a two-Republican-senator
     user gets the state lever and the 2028 list.
  3. Turn a private commitment into a related harder action in the same
     session, then into a named list of three people the user recruits.
  4. Show real own-side participation per district and state from
     completed-action receipts, never from sign-ups.
- Non-goals:
  - Persuading opponents. Moral-emotional contagion stays inside the
    aligned network; this mobilizes the 74% of Democrats already opposed.
  - Petitions, form emails, auto-dialing or faxing. The tool never contacts
    an office on a user's behalf.
  - Interactive state and local campaigns in v1: the state page is a
    data-driven static card (holdings, who decides, the live campaign's
    link), nothing more.
  - "End aid" as the ask. The $3.8B grant line is already contested by the
    administration; the ask names the section, the sales and the 2028 MOU.
  - Accounts, logins, reminders by email or SMS in v1.
  - Any count or tally produced by an LLM (CLAUDE.md §Don'ts).

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/civic-action-levers/levers-and-actions.md`,
`docs/research/civic-action-levers/decision-points.md`,
`docs/research/civic-action-levers/organizing-channels-and-tools.md`,
`docs/research/civic-action-levers/behavioral-science-and-virality.md`,
`docs/research/civic-action-levers/speaker-vote-context.md`,
`docs/research/social-platform-trends.md`.
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Zip → reps, curated script, auto-dial, many topics | 5 Calls | adapt | Keep address → member + script; drop auto-dial and the topic list. One vote, not an issue menu. |
| Text → letter/fax to every rep | Resistbot | reject | Offices unplugged fax machines; form volume is tallied for/against only; CMF rates form contact lowest. |
| Per-legislator page with direct-contact buttons; legislators in for / undecided / against columns | Na Pressão (CUT, Brazil) | adopt | The visible whip count plus a per-target channel is the mechanism credited with the PEC da Blindagem defeat. |
| Patch-through call tool on one dated decision, "send to three people" | Adalah Justice Project, Stop the Deadly Merger | adapt | Same decision; add what it lacks: a script, a per-member status, a count, and a receipt. Link to their phonebanks rather than duplicating them. |
| Per-member money card as the shared visual unit; ZIP lookup; pledge | Track AIPAC | adapt | Their red/black card is the grammar people already share on Instagram and TikTok. Our share unit copies the form (one member, one number, one source, one date) but the number is a position or a receipt count, never a dollar figure we did not source ourselves; link their page for money. |
| One-way channel, dated daily missions, one commanding voice | "Exército do Lula" WhatsApp channel | adapt | Daily dated mission at the top of the page during the window; spread by deep links into the user's own groups, since we own no channel. |
| Bill explainer bundled with legislators' numbers | Finance Bill GPT (Kenya) | adapt | Bundle the explainer and official office numbers; never crowdsource private numbers. |
| Paid-creator petition | Change.org "choose a new speaker" | reject | Monetized list-building with no delivery plan; public token support licenses non-action (Kristofferson et al. 2014). |
| Nominate three named people + 24-hour deadline + documented act | Ice Bucket Challenge; vote tripling | adopt | Relational organizing dressed as a game; captains with named lists +13 pts (Turnout Nation), vote tripling +4.5–10 pts in primaries. |
| Show own side's participation is large | Hager et al. 2022 | adopt | Left-leaning supporters act more when told their side's turnout is large; hide counts until they are. |
| Reflection prompt after an action | Han 2016 | adopt | Cheapest retention mechanic with experimental support for follow-up attendance. |
| Public, indexable topic page per subject | TikTok `/discover/<slug>` | adopt | A stable public URL per member and per vote ranks in search; Instagram tag pages are login-walled, so distribution there is creators and cards, not tags. |
| Verified-constituent polls, 14-day silence badges | CivicView, citizensunited.app | reject | Verification unproven; we display receipts of hard actions, not polls of opinion. |

## Users
1. **Constituent of a Democratic House member** (about 215 districts).
   Needs: who is my member, where do they stand, what do I say, by when.
   Primary user; default copy is written for them.
2. **Constituent of a Republican House member** (about 220 districts). No
   House lever on this vote unless the member is a conferee or voted Aye
   on Roll Call 243 (104 Republicans did). Gets the senators, a plain line
   saying which House lever they hold or none, and the state card. Must
   not be made to feel their action is pointless: senators are a real
   target.
3. **Resident of a state with two Republican senators** (about 20 states).
   Gets the House row if it applies, the state card, and the 2028 list.
4. **Captain**: a user who commits to a named list of three. Needs a
   checklist that survives reload and a deadline.
5. **Reporter**: a user who called and records what the office said. Needs
   a 10-second form; their report is evidence, never a position change.
6. **Maintainer** (owner): the only one who changes a member's position,
   always with a source link; writes the daily mission.

## Expected behavior
### 1. Vote page and whip count
1. The landing page is one vote: title ("Strip the US–Israel integration
   section from the FY2027 NDAA"), what it does in ≤60 words, the section
   numbers in both chambers, who decides (conferees, then each floor), the
   window (Nov–Dec 2026; "floor date TBD" until known), and four count
   tiles per chamber: For stripping · Uncommitted · Against · Unknown.
   Tiles are computed at build time from the positions file.
2. Below: one row per House member and senator, conferees flagged
   "conferee", Armed Services members flagged "committee". Columns: name,
   party, state-district, position, source (link + date), DC phone,
   district phone, prior votes (House: Roll Call 243; Senate: the April
   2026 JRD votes), Block the Bombs cosponsor (House), one-line script
   keyed to the position, latest office-response report (date + ≤140
   chars, labelled "unverified"). Sort: conferees first, then committee,
   uncommitted, unknown, against, for. Filter by state and party. Default
   view is House Democrats plus every conferee; "show all" expands.
3. A position changes only through the maintainer, with a source URL and
   date required; the change is appended to a log (who, when, old → new,
   source). User reports never change a position; they sit beside it.
4. First run: every position starts Unknown except members with a cited
   public statement. Prior-vote columns are seeded from the Clerk's and
   Senate roll-call pages, never inferred.
5. Every member row has a stable public URL (`/m/<bioguide_id>`) and the
   vote has one (`/v/<vote_id>`); both render without JavaScript, with
   `tel:` links live, and carry share metadata (title, one-line status,
   card image).

### 2. Address routing and the ask
1. One address field, full street address required (many cities sit in
   two districts; zip alone is refused with a one-line reason). Resolves
   to the House district, both senators and the state. The address is sent
   only to the district lookup and never stored; district and state are
   kept in local browser state.
2. Result card, three rows, one ask each, each ask chosen by the target's
   data:
   - House: position + source. Ask by position: Unknown/Uncommitted →
     "vote to strip §219 in conference, or tell the conferees to";
     Against → "explain your vote; I'll remember it in the primary" (2028
     list flag shown if the member is on it); For → thank and ask them to
     sign the removal letter; Republican non-conferee → "no House lever on
     this vote in <district>" plus the Roll Call 243 result for the member.
   - Senators (each separately): JRD Yes in April 2026 → thank, ask them
     to hold on §1217 and to condition the December leadership vote on
     it; JRD No → ask for a position on §1217 and name the April vote;
     Republican → ask for a position on §1217, cite the 104 House
     Republicans who voted to cut.
   - State: the state card (§2.3).
3. State card: from `data/states.csv`: Israel-bond holdings in the state
   treasury and pension funds (amount, date, source), who decides
   (treasurer / comptroller / board), the live campaign and its link if
   one exists, the next public-comment date if known. States with no data
   show "no holdings data yet" and the treasurer's contact; no state shows
   a number without a source.
4. Script: ≤80 words with the user's name, city, and one personal line they
   type (CMF: a personal story helps for 79% of staff, 18% receive one).
   Copy to clipboard and `tel:` links only; nothing is dialed or sent.
   Copy never says "end aid"; it names the section, the sales and the 2028
   MOU.
5. Unresolvable address: offer retry and a manual state + district picker.

### 3. Commitment funnel and captains
1. Private first. After the script, one choice: "I'll call by <date>".
   Stored locally and privately; no public counter moves, no share prompt
   appears.
2. Same screen, immediately: the related hard ask. "Can you get to the
   district office? Five to ten constituents meeting staff is the most
   effective contact there is." The user requests a slot in the next
   district-office visit for their district (listed by a captain) or, if
   none is listed, joins the partner phonebank for the nearest moveable
   member (linked, not hosted) or, after the call, reports what the office
   said (§4.4).
3. Captain list: "Name three people in your district you'll ask to call by
   <deadline>." Three first names plus how they'll reach each (no phone
   numbers), deadline ≤48 hours, a checklist that persists across reload,
   and a downloadable calendar reminder (.ics). No server-side reminders.
4. After the first completed action, one optional line: "What did making
   that call mean to you?" Stored privately; never shown publicly.
5. Marking a call done, a visit attended, or a list filled creates a
   receipt: district, state, target (house | senate | state), action type,
   date. No names, no addresses.

### 4. Receipts, missions and sharing
1. Per-district and per-state counters from receipts: calls made, visits
   held, captains active. Shown on the member's row and on the user's
   result card ("N constituents in TX-35 called this week"). Hidden until
   N ≥ 5; small numbers signal that nobody is acting.
2. Daily mission: maintainer-written, dated, one target, one ask; pinned
   at the top during the window; expires at its date. A mission may name
   a state ("Maryland: pension board meets Thursday") as well as a member.
3. Sharing exists only after a completed action. The share unit is the
   receipt ("Four of us met Casar's staff today. Who's next?") rendered as
   a card in the per-member grammar (member, one line, source, date), with
   a pre-filled deep link to the member page, offered through the device
   share sheet (WhatsApp, Signal, iMessage) and as an image download for
   Instagram. No "I signed" badge, no share affordance before an action is
   complete.
4. Office-response report after a call: one pick (will vote to strip ·
   undecided · will keep · didn't answer · other ≤140 chars). Shown as the
   latest unverified evidence on the row; the maintainer reviews before
   any position change.
5. Abuse limits: receipts and reports rate-limited per device hash; a
   report containing a phone number or street-address pattern is rejected;
   no crowdsourced staff numbers anywhere.

## Data & contracts
- `data/votes/ndaa-fy27-integration.yaml`: id, title, summary (≤60 words),
  body, section_house ("219"), section_senate ("1217"), former_section
  ("224"), window_start, window_end, floor_date (nullable), ask_house (by
  position), ask_senate (by prior-vote class), removal_letter_url.
- `data/members.csv`: bioguide_id, name, party, chamber, state, district
  (House only), dc_phone, district_phone, conferee (bool), armed_services
  (bool), prior_vote_rc243 (aye|no|present|absent|n/a), jrd_april_2026
  (yes|no|absent|n/a), btb_cosponsor (bool), target_2028 (bool, source
  URL), money_url (Track AIPAC or FEC page; no figure stored). Seeded from
  the unitedstates/congress legislators file, the Clerk's Roll Call 243
  page, the Senate roll-call pages for the April 2026 JRDs, the H.R. 3565
  cosponsor list, and the American Priorities target list.
- `data/positions/ndaa-fy27-integration.csv`: append-only; bioguide_id,
  position (for|uncommitted|against|unknown), source_url, source_date,
  changed_by, changed_at. Latest row per member wins. Changes land as PRs;
  a lint rejects a non-unknown position without source_url and
  source_date.
- `data/states.csv`: state, treasurer_name, treasurer_phone,
  israel_bonds_usd (nullable), holdings_date, holdings_source,
  decider (treasurer|comptroller|board), campaign_name, campaign_url,
  next_comment_date (nullable). A row with israel_bonds_usd and no
  holdings_source fails the lint. Seeded for MD, NC, NY, MN, MI, CA, and
  "unknown" for the rest.
- Receipts store: receipts(id, state, district, target, action: call|visit|
  list_filled|report, created_at, device_hash). Reports store: reports(id,
  bioguide_id, outcome, note ≤140, created_at, device_hash, hidden bool).
- Commitments, captain lists and reflections: browser-local only
  (localStorage), no server copy in v1.
- District lookup: Census Geocoder (no key, all 50 states + DC + PR)
  returning the congressional district for the map in force for the 119th
  Congress (Open question 2); senators and state row from the CSVs.
- Counters: derived by deterministic code from the receipts store; tiles
  from the positions file at build time.

## Spec delta
- ADDED `docs/specs/vote-tracker.md`: the whole spec (Purpose; Behavior
  from §1–§4 above; Data & contracts; Invariants).

## Acceptance criteria
- [ ] Landing shows the vote, both section numbers, window, and per-chamber
      tiles whose numbers equal the latest-row counts in the positions
      file (a test compares them).
- [ ] Every House member and senator has a row; every non-unknown position
      has a source link and date; a position row without them fails the
      lint; every prior-vote cell traces to a roll-call page.
- [ ] Three test addresses resolve correctly under the 119th map: a split
      city (Orange, CA → CA-46 or CA-40 by street), a Democratic district
      in a two-Republican-senator state (TX-35), and a Republican district
      in a two-Democratic-senator state (CA-40). Zip-only input is refused
      with a message.
- [ ] The result card shows a House ask, two senator asks and a state card
      for every resolved address; the ask text matches the target's data
      class (position, JRD vote, party) per §2.2.
- [ ] A state with no holdings data shows "no holdings data yet" and a
      treasurer contact; no state shows a dollar figure without a source.
- [ ] The script contains the user's name, city and personal line, never
      the phrase "end aid"; copy and `tel:` links work; nothing auto-dials
      or sends.
- [ ] A commitment changes no public counter and shows no share prompt;
      both appear only after an action is marked complete.
- [ ] A captain list needs three names and a deadline ≤48 h; it persists
      across reload; the .ics downloads.
- [ ] A district or state counter is hidden below 5 receipts and equals
      the receipt count at or above 5.
- [ ] A report cannot change a position; a report containing a phone
      number or street address is rejected; a device cannot file more than
      5 reports an hour.
- [ ] Member and vote pages, tiles and `tel:` links work with JavaScript
      disabled; each member page carries share metadata and a card image.
- [ ] Performance budget: landing page ≤100 KB transferred, LCP ≤1.5 s on
      a mid-range phone over 4G; address lookup ≤2 s p95; a member page
      ≤60 KB. The PR for §1 copies these into CLAUDE.md §Performance
      budgets.

## Rollout & metrics
- No feature flag; one vote only. Launch when ≥50 House positions are
  non-unknown, every senator's April JRD vote is seeded, and the conference
  window is confirmed.
- Measured from receipts and the positions log, by deterministic code:
  commitments → completed calls; captains with lists filled; visits held
  per district; reports per uncommitted member; positions moved from
  unknown/uncommitted to for, with source dates; share-link arrivals per
  member page.
- Success for this vote: at least one report on every uncommitted conferee,
  receipts from at least 25 states, and one district-office visit held in
  at least five districts before the floor vote.

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
- Decisions since last update: rewritten nationwide (see Changes); all
  Open-question proposals adopted.
- Next action: `/implement-prd-section docs/prd/vote-tracker.md` (§1).

## Open questions
1. Which vote first? Proposal: the NDAA FY2027 integration section
   conference. It is the least-watched live decision with identifiable
   owners (conferees). The December Senate leader vote is a secret caucus
   ballot with no roll call, so a whip count cannot be verified; it enters
   only as a condition in the senator ask. The next appropriations
   amendment window is 2027. A second vote is a new YAML file, not a
   rebuild.
2. Which district map for a lame-duck vote? Proposal: the conference
   happens before Jan 3, 2027, so route by the 119th Congress map
   everywhere (several states redistricted mid-decade: CA, TX, MO, NC, OH
   at least); switch to the 120th map for the next vote. The build
   confirms the Geocoder's map vintage before seeding copy.
3. Conferees not yet named? Proposal: until they are, flag House and Senate
   Armed Services members as the targets and label them "likely conferee".
4. Section numbers. The research of 2026-11-04 records the House section
   as §219 and the Senate's as §1217, formerly §224. Proposal: store all
   three in the vote file and show the current pair; the seed PR verifies
   against the enrolled texts.
5. Stack. Proposal: static site (Astro or Eleventy) on Cloudflare Pages;
   one small worker with D1 for receipts and reports; data as CSV/YAML in
   the repo edited by PR, with the positions and states lints in
   `scripts/`. Not blocking: no acceptance criterion depends on it.
6. State data coverage. Proposal: seed the six states with published
   holdings and leave the rest "unknown"; a `## Next` idea covers a
   per-state research sweep. The product never estimates a holding.
7. Money column. Track AIPAC's per-member figures are disputed (The
   Intercept, The Bulwark). Proposal: link, never store, a dollar figure;
   `money_url` points at their page or the FEC committee page.
8. Report moderation. Proposal: reports show immediately with an
   "unverified" label; the maintainer can hide one; positions stay
   maintainer-only.

## Changes
- 2026-11-04 — created (APPROVED, auto: every question carries a proposal, none blocking).
- 2026-11-04 — rewritten nationwide: routing covers all 435 districts and
  100 senators; asks keyed to member data (position, Roll Call 243, April
  2026 JRD votes, 2028 target list); state card driven by `data/states.csv`
  instead of a CA-only page; section renumbered 224 → 219/1217; "end aid"
  copy dropped; public per-member pages and share cards added. Source:
  `docs/research/social-platform-trends.md`.
- 2026-11-04 — SUPERSEDED by `action-router.md`: the site carries any goal; the NDAA whip count becomes the NDAA goal page; per-member pages, captains and counters move to `## Next`.
