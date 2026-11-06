# District-office visits

## Purpose
Lets one constituent list a visit to a member's district office and lets
others say they will come, so the ask arrives in person and in company. The
site hosts the listing and the head count only; coordination happens in the
organiser's own channel (a link or handle), which the site hands to a device
only after that device has asked to come. Nothing is public until a
maintainer approves it from the weekly digest. Stops short of office
addresses (the office's own site has them), of any directory of people, and
of any public act before the private one: a visit is reached from the
captain screen and the member page, never as a first step.

## Behavior
1. **Listing (organiser).** `VisitForm` (Preact island inside `Visits` on
   `/m/<bioguide>`, opened by "Organise one" or by `#organise`; the captain
   screen's saved step links to `/m/<target>#organise`): member fixed to
   the page, office city (read-only when `members.district_office_city` is
   set; typed otherwise, letters only), date from today on, start and end
   times (end after start), one contact (an `https://` URL or one
   `@handle`, ≤200 chars), a note ≤140 chars. Turnstile when
   `PUBLIC_TURNSTILE_SITE_KEY` is set. Submit → `POST /api/visits` stores
   the row as `pending`; the form shows "Listed. It shows here once a
   maintainer has checked it". The device remembers the listing id so the
   page can offer "Remove my listing" once it is visible. No edits: remove
   and list again.
2. **Review (maintainer).** The weekly digest carries every `pending`
   listing (member, city, window, contact, note, listed-at) with four
   signed links: approve, reject, hide, delete. A listing alone is enough
   to send the mail when there are no reports. `GET /api/visits/review?token=`
   applies the action and answers plain text; approve makes the row
   visible on the next request, reject and delete remove the row and its
   requests, hide keeps an approved row off every page. Tokens are
   `<id>.<action>.<expiry ms>.<HMAC-SHA256 hex>` signed with
   `VISITS_REVIEW_SECRET`, valid 14 days; bad, foreign or expired → 403;
   secret unset → 503 and the digest says so instead of printing links.
3. **Finding.** `GET /api/visits?member=` returns approved, unexpired
   listings (a listing expires 12 h after `ends_at`) with their stored
   request count and never the contact or device hash. Shown as
   "Visit <city> on <date>" plus "with N others" from two requests: on
   the member page (`Visits`), on each member row of the results cards
   and the goal page's target list (`VisitLine` in `Target.tsx`, one fetch
   per member per page). No listing → "No visit listed yet. Organise one",
   plus the goal's partner link when `partner_url` is set.
4. **Joining.** "I'll come" → `POST /api/visits/:id/request` with the
   device id; the Worker stores (listing, device hash) once (idempotent)
   and the reply, alone among all responses, carries `contact_url`. The
   device stores `{v:1, id, member, name, city, starts_at, ends_at,
   contact_url}` under `cut-ties:visits`; the page swaps the button for
   "Contact the organiser ↗" and "Withdraw". "Your week" on the front page
   lists each joined visit with the same two controls, even when no
   address is stored, and the open-items gate (`hasOpenItems`) counts a
   joined visit. Withdraw → `DELETE /api/visits/:id/request` and the
   device record goes; "Start over" clears the key too.
5. **Safety.** Submit refuses (400 `pii`) a contact or note holding a
   phone number (7+ digits with separators), an email, a street address
   (number, words, street suffix) or a PO box; the raw note is screened
   before `sanitize` so nothing is silently stripped. Per device: one
   `pending` listing at a time (429), five requests per 24 h (429).
   `DELETE /api/visits/:id` by the creating device removes the listing and
   every request on it; another device gets 403. `/privacy` names the
   contact link as personal data the organiser chose to share, handed
   only to people who said they will come, deletable with the listing.
6. **Pause.** `VISITS_ENABLED="0"`: `POST /api/visits` and
   `POST …/request` answer 503 `paused`; `GET /api/visits` returns an
   empty list; the islands then show the empty state and the form reports
   "Visit listings are paused for now".

## Data & contracts
- D1 `visits(id, bioguide_id, office_city, starts_at, ends_at,
  contact_url, note, status pending|approved|rejected|hidden,
  device_hash, created_at, reviewed_at)`; `visit_requests(id, visit_id →
  visits ON DELETE CASCADE, device_hash, created_at, UNIQUE(visit_id,
  device_hash))`. Times are office-local `YYYY-MM-DDTHH:MM` strings.
  `members.district_office_address`, `members.district_office_city`
  (last two CSV columns, empty until sourced).
- `worker/src/visits.ts`: `personalData(text) → 'phone'|'email'|'address'|null`,
  `validContact`, `visitWindow(date, start, end, now)`, `expired(ends_at, now)`,
  `publicVisit(row, requests)`, `signReview` / `verifyReview`,
  `reviewSection(pending, name, origin, secret, now)` (the digest block;
  origin is `https://<DIGEST_FROM domain>`), `VISIT_LIMITS`.
- Repo: `insertVisit`, `visit`, `approvedVisits(bioguide)` (with counts),
  `pendingVisits`, `pendingVisitCount(device)`, `setVisitStatus`,
  `deleteVisit` (cascades), `hasVisitRequest`, `visitRequestsSince`,
  `insertVisitRequest`, `deleteVisitRequest`.
- Routes (`worker/src/index.ts`): `GET /api/visits?member=` →
  `{visits: VisitPublic[]}`; `POST /api/visits {member, city?, date,
  start, end, contact, note?, device, turnstile?}` → `{id, status:
  'pending'}` or 400 `bad_request|no_member|bad_time|bad_contact|pii|
  bad_city`, 403 `turnstile`, 429, 503; `GET /api/visits/review?token=`;
  `POST /api/visits/:id/request {device}` → `VisitPublic & {contact_url}`
  or 404/429/503; `DELETE /api/visits/:id/request {device}`;
  `DELETE /api/visits/:id {device}` → 200/403/404. CORS allows DELETE.
- `GoalCard.partner_url` (`worker/src/route.ts`) feeds the empty line.
- Web: `web/src/lib/visits.ts` (`visitsFor` cache, `visitLine`, `fmtWhen`,
  `joinVisit`, `withdrawVisit`, `deleteListing`, `listed`/`markListed`
  under `cut-ties:visits-listed`); `web/src/lib/commitments.ts`
  (`VISITS_KEY`, `JoinedVisit`, `loadVisits`, `addVisit`, `removeVisit`,
  `joinedVisit`); islands `Visits.tsx`, `VisitForm.tsx`; `VisitLine`.
- Env: `VISITS_ENABLED` (var, default on), `VISITS_REVIEW_SECRET`
  (secret); both in `.env.example` and the deployment table.

## Invariants (regression checklist)
- [ ] A fresh listing is absent from `GET /api/visits` and every page until
      an approve link is opened; a rejected one leaves no row.
- [ ] No response other than `POST /api/visits/:id/request` carries
      `contact_url`; no built page under `web/dist` contains the string
      (`web/test/dist-crawl.test.ts`).
- [ ] The 20-string fixture in `worker/test/visits.test.ts`: 10 refused,
      10 accepted; the API answers 400 `pii` for every refused one.
- [ ] Count line reads "with N others" only from N = 2; the request count
      is computed by the Worker from stored rows, never typed or modelled.
- [ ] Withdraw removes the server row and the device's copy of the contact.
- [ ] Creator delete cascades requests; another device gets 403.
- [ ] `VISITS_ENABLED=0` → POST 503, list empty, nothing else changes.
- [ ] `/privacy` has the "District-office visits" bullet.

## Performance budget
Member page 12.8 KB and results page 9.9 KB gzipped (HTML + its JS/CSS),
both under the 100 KB landing budget; `/api/visits` is one indexed D1 read
per member (`visits_member`) and must stay ≤300 ms p95; infra cost
unchanged at $0/month.
