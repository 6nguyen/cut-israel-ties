# Countdown stamp

## Purpose
Puts a ticking clock on every open decision the visitor can still act
on, so the result cards, `/results` and the act page say "DD HH MM SS
until this is decided" instead of a bare date. Every digit is
arithmetic on the goal's sourced `decision_at` / `decision_date`
(`web/src/components/Countdown.tsx`); nothing comes from an LLM. It
stops at display: no reminders, no notifications, and no stamp on the
goal detail or prep pages (`urgency-and-readability` open question 2).

## Behavior
1. **The stamp.** The style guide's protest stamp (mockup B, owner pick
   2026-11-06): rotated −4°, 5 px dashed crimson border on paper, a
   radial mask so the left and right ends look under-inked, an
   feTurbulence + displacement grain filter, no shadow. Line one in
   Space Mono: "Countdown · <title> · Decides <Mon d>" (title only on the
   page-wide stamp; "Expected" when `decision_date_confirmed` is false).
   Line two in Bebas Neue: `DD D HH H MM M SS S`, two digits each (three
   past 99 days), ticking once a second from the browser clock.
   `role="timer"`, `aria-live="off"`, an `aria-label` naming days, hours
   and minutes left and the date; the label line wraps and the stamp is
   capped at 320 px (`md`) / 380 px (`lg`).
2. **Target.** `decision_at` (ISO 8601 with offset) wins; a bare
   `decision_date` counts to 09:00 America/New_York on that day; the
   date in the label is that New York calendar day. A past, empty or
   malformed target renders nothing, and a running stamp disappears the
   second its target passes.
3. **Result cards (`/results`).** Each card wears its own soonest
   upcoming target's stamp at its top-right, replacing the
   "Decision: <date>" line (which stays only for past dates); a split
   leadership card names the chamber ("House"/"Senate") in the label.
   The page header carries one `lg` stamp naming the goal for the
   soonest target across both slots, to the right of the H1 from 768 px
   (the H1 reserves 400 px) and above it below that.
4. **Act page (`/goals/<slug>/act/<action>`).** The goal's stamp sits to
   the right of the ask H1 from 768 px (340 px reserved) and between the
   H1 and the form below that; no stamp when the goal has no upcoming
   date.
5. **Reduced motion.** Under `prefers-reduced-motion: reduce` the seconds
   group is dropped and the clock ticks once a minute.

## Data & contracts
- `data/goals/*.yaml`: `decision_date` (YYYY-MM-DD), optional
  `decision_at` (ISO 8601 with offset; the seed fails when its calendar
  day differs from `decision_date`), `decision_date_confirmed`
  (`true|false`, default false). Columns `goals.decision_at` and
  `goals.decision_date_confirmed` in `worker/schema.sql`; production D1
  gets them through `seed-remote`'s migrate step (`deployment.md`
  Behavior 3).
- `POST /api/route` goal rows and `GET /api/goals` carry `decision_at`
  and `decision_date_confirmed` (`action-router.md` Data & contracts).
- Ranking uses the same date for urgency (`action-router.md` Ranking).
- Component: `Countdown({at, date, confirmed, title, size, id, class,
  now})`; helpers `targetOf`, `partsLeft`, `monthDay`, `zonedTime`
  (`web/src/components/Countdown.test.tsx`); `soonest()` in
  `Results.tsx` picks the target for a card or the page.

## Invariants (regression checklist)
- [ ] `decision_at` beats `decision_date`; a bare date targets 09:00
      New York in both EST and EDT.
- [ ] Digits are two wide, three past 99 days, never negative; the
      label says "Decides" only when `decision_date_confirmed` is true.
- [ ] A past, empty or malformed target renders no stamp; a running
      stamp unmounts when its target passes.
- [ ] The clock re-renders once a second; under reduced motion once a
      minute with no seconds group.
- [ ] A result card with an upcoming date shows the stamp and no
      "Decision:" line; a past date shows the line and no stamp
      (`web/src/components/Results.test.tsx`).
- [ ] At 1024 px the `/results` H1 never overlaps the page stamp; at
      375 px nothing scrolls horizontally.

## Performance budget
Part of the landing/results budget (≤100 KB transferred, LCP ≤1.5 s):
the component is one island with no dependencies; the grain filter is
an inline SVG, no image.
