# District-office visits — PRD
Status: APPROVED 2026-11-04 · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
In-person constituent visits are the most influential contact a member's
office receives (94–99% of staff, Congressional Management Foundation;
`docs/research/civic-action-levers/organizing-channels-and-tools.md`),
and the research funnel names the visit as the "related hard ask" after
a call. The site offers no way to find or join one. Hosting visit
listings means holding user-submitted time, place and a contact, which
the site has so far avoided entirely (no identity, no names server-side).

## Goals / Non-goals
- Goals: a visitor who has called can see upcoming district-office
  visits for their district and request a slot; a captain can list one;
  the maintainer approves every listing before it is visible; nothing
  identifies a requester to anyone but the organiser.
- Non-goals: hosting chat or coordination (the organiser's own channel
  does that); visits outside district offices (town halls, protests);
  anything for members without a district office listed.

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/civic-action-levers/organizing-channels-and-tools.md`,
`docs/research/civic-action-levers/behavioral-science-and-virality.md`.
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Organiser-listed events with moderation | Mobilize, Action Network | adapt | moderation yes; accounts and email no |
| Open event creation without review | Facebook events | reject | infiltration and doxxing risk (India farmers' groups) |
| Linking out to partner phonebanks when no visit exists | vote-tracker PRD §3.2 | adopt | keeps the hard ask available everywhere |

## Users
Captains who will organise five to ten constituents; visitors who have
already called and will go if someone else is organising it.

## Expected behavior
### 1. Listing a visit
1. On the captain screen (`commitment-funnel.md` §1.3) and on a member
   page, "Organise a district-office visit" opens a form: member (from
   the roster), office (from `members.district_phone` and a new
   `district_office_address` column), date and time window, how to
   reach the organiser (one URL or handle: Signal group link, WhatsApp
   invite, Instagram handle; no phone numbers, no emails), ≤140-char
   note. Turnstile protects the submit.
2. The listing is stored `pending`; the nightly digest
   (`docs/specs/maintainer-tooling.md`) includes pending listings and
   the maintainer approves or rejects each by a signed link in the
   email. Only `approved` listings render.
3. A listing expires after its time window; the organiser cannot edit
   it, only submit a new one.

### 2. Finding and joining a visit
1. Result cards, goal target lists and member pages show "Visit
   <office city> on <date> with N others" when an approved visit exists
   for the member and the visitor's district; the count is requests,
   shown from 2.
2. "I'll come" stores a request (device hash, listing id) and reveals
   the organiser's contact link; the visitor goes to the organiser's
   channel for everything else. A request can be withdrawn from "Your
   week".
3. No approved visit → the card shows "No visit listed yet. Organise
   one" (link to §1) and, where the goal has a `partner_url`, the
   partner phonebank link.

### 3. Safety
1. A listing whose note or contact contains a phone number, email or
   street address pattern is rejected at submit.
2. Per device: one pending listing at a time, five requests per day.
3. The maintainer can hide any listing after approval; hidden listings
   drop their requests' visibility immediately.
4. The organiser's contact link is personal data: `/privacy` names it,
   the device that created a listing can delete it (`DELETE
   /api/visits/:id`, device hash must match), and the maintainer deletes
   on request from the digest. Deleting a listing deletes its requests.

## Data & contracts
- `visits(id, bioguide_id, office_city, starts_at, ends_at,
  contact_url, note, status pending|approved|rejected|hidden,
  device_hash, created_at, reviewed_at)`; `visit_requests(id, visit_id,
  device_hash, created_at)`.
- `members.district_office_address`, `members.district_office_city`
  (from the roster import or a `data/` PR).
- Endpoints: `POST /api/visits`, `GET /api/visits?member=<id>`, `DELETE
  /api/visits/:id` (creating device only), `POST
  /api/visits/:id/request`, `DELETE /api/visits/:id/request`, `GET
  /api/visits/review?token=` (maintainer, signed).

## Spec delta
- ADDED `docs/specs/office-visits.md`.
- MODIFIED `docs/specs/maintainer-tooling.md` §Behavior digest: adds
  pending listings and approve/reject links.
- MODIFIED `docs/specs/action-router.md` §Behavior privacy page: the
  organiser contact link as declared, deletable personal data.

## Acceptance criteria
- [ ] A submitted listing is invisible until approved; an approve link
      from the digest makes it visible within one request; a reject
      leaves no trace on any page.
- [ ] A note or contact field with a phone number, email or street
      address is refused at submit (fixture of 20).
- [ ] "I'll come" reveals the contact link only after the request is
      stored; the count shows from 2 requests; withdrawing removes it.
- [ ] The organiser's contact link is never in a page that is not
      behind a request (crawl test of every static page).
- [ ] The creating device can delete its listing and its requests
      vanish with it; another device gets 403; `/privacy` names the
      contact link.
- [ ] Performance budget: pages unchanged (≤100 KB); visits requests
      ≤300 ms p95; infra cost unchanged at $0/month.

## Rollout & metrics
Behind a `VISITS_ENABLED` var so the maintainer can pause listings.
Metrics: listings submitted, approved, requested; requests per approved
listing; share of districts with any listing.

## State (updated 2026-11-04)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [ ] 1. Listing a visit
  - [ ] 2. Finding and joining a visit
  - [ ] 3. Safety
- Completed: none.
- Folded: none.
- Branch / open PRs: none.
- Remaining: all.
- Next action: /implement-prd-section docs/prd/office-visits.md (§1),
  after member-pages and commitment-funnel merge.

## Open questions
1. Decided 2026-11-04: host listings, gated by maintainer approval from
   the digest, with coordination in the organiser's own channel. Revisit
   after the first ten listings (owner).
2. Decided 2026-11-04: the organiser's contact link is personal data;
   `/privacy` names it and §3.4 makes it deletable (owner).
3. Review latency. Proposal: the nightly digest is enough for v1; an
   immediate email per listing can follow.

## Changes
- 2026-11-04 — created (DRAFT: questions 1 and 2 were blocking).
  Replaces the office-visits part of `## Next` row 2.
- 2026-11-04 — APPROVED: owner decided to host listings behind the
  digest gate and to treat the contact link as deletable personal data
  (§3.4, privacy spec delta, new acceptance criterion).
