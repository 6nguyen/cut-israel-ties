# Call follow-through — PRD
Status: APPROVED 2026-11-05 (auto) · Owner: George Nguyen · Last updated: 2026-11-05

## Problem
The funnel ends at one receipt. The office-response picker has
`no_answer` but nothing follows it, although voicemail is tallied daily
and callers who reach a full mailbox give up. The commitment reminder
defaults to 17:00 local, which for a Pacific caller is 20:00 ET, after the
DC office closes. Each goal holds three targets (representative and two
senators) but the receipt screen never offers the next one, and the
district counter the site already computes is shown on `/results`, not
at the moment the caller has just acted. Published evidence is thin on
every one of these, but each lever is device-only, costs nothing to run
and keeps the private-first order of the funnel. The decision these
calls aim at is the December NDAA compromise on §219/224/1217 and the
funding bill due 2026-12-11.

## Goals / Non-goals
Goals:
- A `no_answer` outcome turns into a second attempt with a time the
  office is open.
- Reminders and call buttons respect office hours, computed in code from
  sourced hours or the DC default.
- After the private steps, one tap opens the next target for the same goal.
- The caller sees "one of N" from the existing counts endpoint right after
  the receipt, thresholded as today.
- Decision dates are available as a calendar subscription that needs no
  identifier.

Non-goals:
- Web Push, SMS, email or any stored push endpoint (a device identifier;
  needs a privacy-page change and its own PRD).
- Streaks, badges or any public act before the private steps.
- Browser `Notification` prompts (no return trigger).
- A second automated reminder (SDAN 2021 found no effect).
- Changing script length or tone.
- An Atom feed: `data/` holds no sourced update stream to publish.

## Research
Relies on [action-conversion-levers](../research/action-conversion-levers.md),
[roster-and-district-offices](../research/roster-and-district-offices.md)
(hours field) and
[civic-action-levers](../research/civic-action-levers/) §behavioral.
| Finding | Decision |
|---|---|
| 5 Calls: callers phone after hours; voicemail tallied daily, fills on big days | Voicemail line on `no_answer`; retry at an open time |
| Plan-making +4.1 pts (Nickerson & Rogers 2010); implementation intentions d≈0.15–0.35 after bias correction | Keep the commitment step; move its default inside office hours |
| SDAN 2021: a second nudge did nothing, the confirm tap predicted attendance | No extra reminder; keep "Done / Still on?" |
| No published next-office or repeat-call rates anywhere | Build the chain, instrument it with existing per-device receipts |
| Google Calendar refreshes a subscribed feed every 12–24 h | Feed carries a visible "updated" line; one-shot `.ics` stays for the user's own commitment |
| iOS web push only for installed web apps; endpoint is a persistent identifier | Web Push out of scope |

## Users
- A caller who got voicemail or a busy line and would try once more if
  told when.
- A West Coast caller whose 17:00 reminder lands after the DC office closes.
- A caller who has just finished one call and has two more targets.

## Expected behavior

### 1. Voicemail and busy follow-up
- On the receipt screen, choosing `no_answer` shows two lines under the
  picker: "Voicemail counts. Offices tally messages daily; say your street
  address so yours is logged." and a "Try again" button.
- "Try again" stores a local commitment of kind `retry` for the same goal
  and target (existing `cut-ties:commitments` store, new `kind` field,
  default `call`) due at the next open slot (§2) and offers the existing
  "Add reminder (.ics)" built from it. The retry shows on "Your week" as
  "Try <office> again by <due>" with the same Done / Not yet controls.
- A retry never posts anything; nothing counts until the user files a new
  receipt. At most one open retry per goal and target.

### 2. Office hours
- `web/src/lib/hours.ts` exports `nextOpenSlot(now, office)` and
  `isOpen(now, office)`. DC offices use Mon–Fri 09:00–18:00
  America/New_York. A district office uses its sourced `hours` string when
  it parses (`Mon-Fri 9-5`, `9:00 AM - 5:00 PM`, day ranges) in the
  office's state time zone, else the DC default shifted to that zone.
  Unparseable hours fall back the same way and are counted in a build
  warning, never shown.
- The commitment default moves from "next weekday 17:00 local" to "next
  weekday 10:00 local" (10:00 anywhere in the US, Hawaii included, falls
  inside DC hours), still capped at the decision date. The retry due time
  is `nextOpenSlot` for the chosen office, at least 60 minutes ahead.
- Each `tel:` button on the act page and member page carries an
  "Open now" or "Closed · opens <weekday> <time>" chip computed from the
  user's clock. When the DC office is closed and the member has a district
  office that is open or has no hours, the district number is listed
  first with "DC office closed; district office answers in office hours."
- All of it is client-side arithmetic on `Date` and `Intl` with fixed
  tables; no network call and no LLM.

### 3. Next-office chain
- After the commitment and captain steps are answered or skipped, and
  before "Share", the receipt screen shows "Next: <Sen./Rep. Name>" for
  each target of the same goal that has no receipt from this device today
  (local receipt log keyed by goal, action and target, 24 h). The button
  opens `/goals/<slug>/act/<action>?target=<bioguide_id>` with the
  address and place already known; the user generates and calls as today.
- When every target has a receipt the slot reads "All three called this
  week." Generation limits are unchanged (3 per action per device per day
  fits exactly one call per target).
- The local log is cleared by "Start over" with everything else.

### 4. "One of N" echo
- Right after a receipt posts, the receipt screen fetches `GET /api/counts`
  once for the goal and place and renders one line: "You're one of <N>
  constituents in <STATE-NN> who called this week", else the state line
  when the district bucket is below threshold, else "Counted." The island
  reuses the `Counts` component; thresholding and caching are the
  endpoint's, unchanged.
- The line sits between the captain step and "Share" so it reinforces the
  private act, not the share.

### 5. Decision-date feed
- The web build writes `web/public/feeds/decisions.ics`: one all-day
  event per `upcoming` or `active` goal with a decision date, SUMMARY
  "Decision: <goal title>", URL and DESCRIPTION the goal deep link,
  `X-WR-CALNAME: Cut the ties — decision dates`, `REFRESH-INTERVAL` and
  `X-PUBLISHED-TTL` of one day, UIDs stable per goal. A moved date changes
  the event; a closed goal drops out.
- `/goals` footer and each goal page offer "Subscribe to decision dates"
  as a `webcal://` link plus a plain `https://` copy, with "Updated
  <build date>; Google Calendar may lag a day." No parameter, no identifier.

## Data & contracts
- `cut-ties:commitments` entries gain `kind: 'call' | 'retry'` and
  `target` (bioguide id); readers default missing `kind` to `call`.
- New `localStorage` key `cut-ties:receipts` `[{goal, action, target,
  at}]`, pruned to 24 h, never sent.
- `web/src/lib/hours.ts` and its table of state time zones (deterministic
  fixtures in `web/src/lib/hours.test.ts`).
- `web/public/feeds/decisions.ics` generated by an Astro endpoint at
  build; no Worker change.
- Reads `district_offices` hours and the office phone from the roster
  PRD when present; works with DC hours alone when absent.

## Spec delta
- MODIFIED `docs/specs/commitment-funnel.md` §Behavior 1 (Commitment line): default time becomes next weekday 10:00 local.
- MODIFIED `docs/specs/commitment-funnel.md` §Behavior 4 (Share waits): the next-office slot and the counter line precede Share.
- MODIFIED `docs/specs/commitment-funnel.md` §Behavior 5 (Your week): retry items and their copy.
- MODIFIED `docs/specs/commitment-funnel.md` §Data & contracts: `kind`, `target`, `cut-ties:receipts`.
- MODIFIED `docs/specs/personalised-documents.md` §Behavior 4: `no_answer` shows the voicemail line and "Try again"; receipt screen order is commitment, captain list, next office, counter line, share.
- MODIFIED `docs/specs/district-counters.md` §Behavior 6 (Where it shows): add the receipt screen.
- MODIFIED `docs/specs/member-pages.md` §Behavior 3 (Member page): open/closed chip and district-first ordering when DC is closed.
- MODIFIED `docs/specs/action-router.md` §Behavior 8 and 9 (Goals overview, Goal detail): the decision-date feed link.
- MODIFIED `docs/specs/action-router.md` §Data & contracts: `web/public/feeds/decisions.ics`.

## Acceptance criteria
- [ ] Choosing `no_answer` then "Try again" creates one `retry` commitment due at an open slot ≥60 min ahead; a second tap creates none; "Your week" shows it with Done / Not yet.
- [ ] Hours fixtures: Pacific 20:00 Monday → DC closed, next slot Tuesday 09:00 ET; Hawaii 10:00 local inside DC hours; a district office with `Mon-Fri 9-5` in Mountain time opens at 09:00 MT; an unparseable string falls back to the DC default and raises a build warning count.
- [ ] New commitment default is next weekday 10:00 local, capped at the decision date; existing stored commitments are untouched.
- [ ] After a receipt with the commitment and captain steps skipped, the next-office buttons list the two remaining targets; after three receipts the slot reads "All three called this week"; "Share" never renders above them.
- [ ] The counter line renders the district text when the bucket is ≥ threshold, the state text when only the state bucket is, and "Counted." otherwise, in a mocked fetch.
- [ ] `feeds/decisions.ics` validates (one VEVENT per open goal with a date, stable UIDs) and a closed goal is absent from the next build.
- [ ] Landing ≤100 KB transferred and LCP ≤1.5 s unchanged; act page bundle grows ≤4 KB gzip; no new request to the Worker beyond the single counts call; no new server-side identifier; infra $0.
- [ ] `scripts/quiet-check.sh test-web` and `build` green.

## Rollout & metrics
- Order: §2 (hours library) first because §1 depends on it; then §1, §3,
  §4 together on the receipt screen; §5 last.
- Metrics, all from existing rows and code: receipts per device per goal
  per day (chain depth, from `receipts` grouped by device hash),
  `no_answer` share before and after, receipts whose hour falls inside DC
  hours before and after the default change. Digest adds one line each.
- Stop rule: if receipts per device per goal do not rise within four
  weeks, keep the hours work and remove the chain copy.

## State (updated 2026-11-05)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [~] 2. Office hours
  - [~] 1. Voicemail and busy follow-up
  - [~] 3. Next-office chain
  - [~] 4. "One of N" echo
  - [~] 5. Decision-date feed
- Completed: §1–§5 built on the branch, awaiting the integration PR: hours library, 10:00 default, open/closed chips; voicemail retry; next-office chain over a local receipt log; first-person counts echo; `/feeds/decisions.ics` with subscribe lines on `/goals` and goal pages.
- Folded: none.
- Branch / open PRs: `feat/call-follow-through` (no PR; the orchestrator integrates).
- Remaining: nothing on this branch; district-office hours arrive with the roster PRD's `district_offices.csv`.
- Decisions since last update: see `## Changes` 2026-11-05.
- Known failures / blockers: district-office hours come from the roster PRD; §2 ships with the DC default alone if that PRD is not merged.
- Next action: the orchestrator's integration PR; then archive this PRD once the spec deltas are folded (they already are in `docs/specs/`).

## Open questions
- Should the retry default to the district office when the DC mailbox was
  full? Proposal: offer both numbers on the retry item, DC first; no
  automatic switch.
- Should the feed also carry the "Your week" commitments? Proposal: no;
  those hold a goal and a date chosen by the user and stay one-shot.

## Changes
- 2026-11-05: created from the action-conversion research.
- 2026-11-05 (§2): every funnel time anchor (default, decision-date cap, 7-day cap, "New date" input) moves to one constant `DUE_HOUR = 10`; a 17:00 cap would have put a Pacific caller's decision-day reminder after DC closed. Stored commitments are untouched.
- 2026-11-05 (§2): `hours.ts` ships with the DC default and a unit-tested parser (`Mon-Fri 9-5`, `9:00 AM - 5:00 PM`, day ranges, `;`/`,` segments, "closed" segments); `district_offices.csv` and its `hours` column come from the roster PRD. `hoursWarnings.unparseable` / `countUnparseable()` are the build-warning hooks for that build; nothing reads them yet.
- 2026-11-05 (§2): the act page reorders the two Worker-listed numbers (DC, district) when DC is closed; the member page is static HTML, so its chips hydrate but the DC-first order stays. Results-card "Call" buttons (`Target.tsx`) get no chip: the PRD names the act and member pages.
- 2026-11-05 (§1): the retry row stores `who` ("Rep. Correa") so "Your week" names the office without a roster lookup; the item links to the act page with `?target=`, where both numbers show DC first (the Proposal: no automatic switch). The retry is due at the DC office's next open slot ≥60 min ahead; the "Try again" button is rendered outside the report form so it survives "Send".
- 2026-11-05 (§3): the local log is keyed by goal, action and target (two actions on one goal do not share receipts). The slot is empty for a goal with one target and reads "All of your targets called this week." for two; "All three called this week." only when the goal lists three.
- 2026-11-05 (§4): the echo mounts after the private steps are answered or skipped (not the instant the receipt posts), so the line never competes with the commitment question; a failed or empty `/api/counts` reads "Counted." (the only place the island renders on a failure). State-scope goals query the state bucket alone.
- 2026-11-05 (§5): the feed gets its own spec (`docs/specs/decision-feed.md`; `action-router.md` was at its size cap). The feed is an Astro endpoint emitted into `dist/feeds/decisions.ics` at build, not a committed `web/public/` file (nothing to keep in sync by hand). The `webcal://` link needs a host and shows only when `SITE_URL` is set; local builds get the https path alone. The build date is the build's UTC day.
- 2026-11-05 (budget): the receipt-screen additions (retry, next office, counts echo) live in `ReceiptExtras.tsx`, imported once a receipt exists; statically they put the act page's chunk graph at +4.1 KB gzip against the 4 KB budget. Measured after the split: +3.85 KB gzip on the act page's static graph (ActForm 5.86→5.80, commitments 1.13→2.12 with the reminder builder and ics, hours 1.96, OpenChip 0.31, Vite preload helper 0.65); ReceiptExtras 0.88 + Counts 1.22 load after the receipt.
