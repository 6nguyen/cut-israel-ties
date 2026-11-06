# Commitment funnel

## Purpose
After a receipt, asks the user for one private commitment (a call by a
date) and one captain list (three first names they will ask to call),
keeps both only in the browser, shows them as a checklist on the next
visit and offers a share only after the private steps. It stops at the
device: the Worker learns that a list was completed in a district, never
who was on it. The receipt itself and the share sheet are in
`personalised-documents.md`; the landing page in `action-router.md`.

## Behavior
1. **Commitment line.** On the receipt screen, before any share
   affordance, one line: "Will you call by <date>?" for a letter or
   comment, "Will you call again before the vote?" for a call. A date
   input (10:00 local; 10:00 anywhere in the US falls inside DC office
   hours, `call-follow-through`) defaults to the next weekday, never
   later than the goal's decision date; the user may move it up to seven days out
   (a repeat call may use the whole window to the decision date). "Yes,
   I'll call" stores the commitment locally and moves on; "Skip" is one
   tap. Nothing is sent and no counter moves.
2. **Captain list.** Next, "Name three people in <STATE-NN> you'll ask to
   call by <due>" (the district is omitted when none is stored): three
   first-name fields (≤20 characters; letters, spaces, hyphens and
   apostrophes) each with a channel (text · in person · call). A field
   holding a digit or `@` is refused inline with "First name only: no
   numbers or @." and the list cannot be saved; an invalid list is never
   written. "Save my three" stores the list locally and shows "Add
   reminder (.ics)" and "Copy a message"; "Skip" is one tap. The list
   exists only after a receipt (it is the related hard ask, never the
   first step).
3. **Reminder and message.** The `.ics` is built in the browser: one
   event at the due time (15 minutes, display alarm 15 minutes before)
   titled "Call about: <goal>", with the goal deep link as URL and
   description. It holds no name. "Copy a message" puts on the clipboard
   one line naming the goal and the date plus the goal deep link, for
   the user's own groups.
4. **Share waits.** "Share" and "Your other action" appear on the receipt
   screen only after both steps are answered or skipped; the receipt
   share text is unchanged.
5. **Your week (`/`).** A visitor with a stored district and any open
   commitment or captain list sees a "Your week" card above the address
   field instead of being redirected to `/results`. Each open commitment
   shows "You said you'd call about <goal> by <due>" (goal linked to its
   act page) with "Done" (removes it) and "Not yet" (hides it this
   visit). The captain list shows the three names with a checkbox each;
   ticking is local. The third tick posts one receipt (`action:
   captain-list`, no target, no names); only then the card shows
   "Counted: one list for <STATE-NN>, no names." and "Share". A failed
   post keeps the list and says so. The card's footer links to
   `/results`, offers "Change address" (clears the place and route cache,
   keeps every commitment) and "Start over" (clears the place and every
   commitment and list).
6. **Overdue and closed.** An item past its due time reads "Still on?"
   with "Done", "New date" (a date input, 10:00 local) and "Drop"
   (deletes it locally). On load, items whose goal is no longer active
   are removed and the card shows one line per goal: "<title>:
   <outcome_note>" (or "the window closed" / "closed"); a goal no longer
   listed yields "One goal is no longer listed; its item was dropped." A
   list that already posted its receipt is removed silently.
7. **Act page nudge.** The act page of a goal with an open commitment
   shows "You said you'd call by <due>" above the form.
8. **Share after a list.** The share after a completed list uses the
   device share sheet (clipboard fallback: line + link) with the text
   "Three of us in <STATE-NN> are calling <Surname> before <Mon D>. Who's
   next?" and the goal deep link. When the browser can share files, a
   1200×630 PNG drawn on the device from the goal-card template is
   attached; it carries the goal title, the district and the date only.

## Data & contracts
- `localStorage` `cut-ties:commitments` = `[{v: 1, goal, action, target,
  due}]` (one per goal; `due` ISO); `cut-ties:captain` = `{v: 1, goal,
  due, people: [{name, channel: text|in_person|call, done}] ×3, who?,
  receipted?}` where `who` is the target official's surname for the
  share line and `receipted` marks a list whose receipt posted. Records
  with another `v`, a wrong shape or an invalid name are ignored.
  `cut-ties:device` (`web/src/lib/store.ts`) is shared with the receipt
  flow. Nothing in these keys is ever sent.
- Deadline rules (`web/src/lib/commitments.ts`, `DUE_HOUR = 10`): default
  = next weekday 10:00 local, capped at the decision date's 10:00; editable
  maximum =
  min(now + 7 days, decision date), or the decision date alone for a
  repeat call; a missing decision date means no cap.
- `POST /api/receipt` accepts `{goal, action: 'captain-list', state?,
  district?, device}`: the goal must be active, `target` must be absent
  (else 400 `bad_request`), and the row is written with `kind
  'captain-list'`, `action_id NULL`, `target_id NULL`. Ordinary receipts
  are unchanged and carry `kind 'action'`.
- `receipts` (`worker/schema.sql`): `action_id` and `target_id` are
  nullable; `kind TEXT NOT NULL DEFAULT 'action' CHECK (kind IN
  ('action','captain-list'))`; a CHECK ties `kind = 'action'` to both
  ids present and `'captain-list'` to both absent, so the FK still
  guards every ordinary receipt. Index `receipts_kind_goal (kind,
  goal_id, state, district)` serves a later per-goal/district count.
  Decision over a synthetic `action_id` value: an FK column cannot hold
  a string, and a fake `actions` row would leak into action listings.
- `.ics` (`web/src/lib/ics.ts`): RFC 5545 with CRLF line ends, 75-octet
  folding, TEXT escaping; `VCALENDAR` (VERSION 2.0, PRODID) › `VEVENT`
  (UID, DTSTAMP, DTSTART/DTEND in UTC, SUMMARY, DESCRIPTION, URL) ›
  `VALARM` (DISPLAY, `-PT15M`). File name `call-<goal>.ics`.
- Islands: `web/src/components/Funnel.tsx` (steps 1–4, rendered by
  `ActForm.tsx` after a receipt), `web/src/components/YourWeek.tsx`
  (steps 5–8, mounted above `AddressForm` on `/` with every published
  goal's `{slug, title, status, decision_date, outcome_note}` as props).

## Invariants (regression checklist)
- [ ] After a receipt the commitment line renders before any "Share";
      "Share" is absent until both steps are answered or skipped
      (`web/src/components/funnel.test.ts`).
- [ ] A captain field with a digit or `@` is refused and nothing is
      stored; the whole flow makes no request carrying a name.
- [ ] Two ticks post nothing; the third posts exactly one receipt with
      `action: captain-list`, no `target`, no names; the Worker stores
      `kind 'captain-list'` with null ids (`worker/test/generate.test.ts`).
- [ ] The `.ics` parses (CRLF, ≤75 octets per line, required properties
      in order), carries the goal link and no name (`web/src/lib/ics.test.ts`).
- [ ] The default deadline is the next weekday 10:00 local and never
      later than the decision date (`web/src/lib/commitments.test.ts`).
- [ ] A return visit with an open item shows "Your week" above the
      address field and does not redirect; "Change address" keeps the
      items; "Start over" clears them; a closed goal's item is dropped
      with its outcome line.
- [ ] No public act precedes the private one: no counter, badge or share
      appears before the commitment line.

## Performance budget
Landing ≤100 KB transferred with the island (measured 2026-11-04: 24.0
KB gzip for `index.html`, CSS, both islands and the Preact runtime);
LCP ≤1.5 s; no new Worker endpoint.
