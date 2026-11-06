# Decision-date feed

## Purpose
Puts every open decision date on the user's own calendar so the vote week
arrives as a reminder rather than a news item. One public `.ics` feed,
built with the site, holds the dates alone; it carries no user commitment
(those stay in "Your week", `commitment-funnel.md`), no parameter and no
identifier. It stops at dates: no agenda, no whip count, no per-user feed.

## Behavior
1. **Feed.** `/feeds/decisions.ics` is a published calendar
   (`X-WR-CALNAME: Cut the ties — decision dates`) with one all-day event
   per `upcoming` or `active` goal that has a decision date, soonest first:
   SUMMARY "Decision: <goal title>", URL and DESCRIPTION the goal deep
   link. `REFRESH-INTERVAL` and `X-PUBLISHED-TTL` are one day. UIDs are
   per goal (`decision-<slug>@cut-the-ties`), so a moved date updates the
   event in a subscribed calendar and a closed or undated goal drops out
   at the next build.
2. **Subscribe line.** The `/goals` footer and each goal page's aside
   read "Subscribe to decision dates" as a `webcal://<host>/feeds/decisions.ics`
   link plus an "https copy", followed by "Updated <build date>; Google
   Calendar may lag a day." A build without `SITE_URL` has no host, so it
   shows the https path alone.
3. **Freshness.** The feed is rebuilt with every deploy; nothing refreshes
   between builds. The build date is the build's UTC day.

## Data & contracts
- `web/src/pages/feeds/decisions.ics.ts`: Astro endpoint emitted into
  `dist/feeds/decisions.ics` at build (`text/calendar; charset=utf-8`);
  not a committed `web/public/` file. No Worker change.
- `feedGoals()` (`web/src/lib/goals.ts`): `status in (upcoming, active)`
  and `decision_date` set, ordered by date then slug.
- `buildFeed(events, stamp)` (`web/src/lib/ics.ts`): `DTSTART;VALUE=DATE`
  / `DTEND;VALUE=DATE` (next day), lines folded at 75 bytes, CRLF.
- `web/src/components/SubscribeLine.astro`: the two links and the date.

## Invariants (regression checklist)
- [ ] Every VEVENT is an `upcoming` or `active` goal with a date; UIDs
      are stable across builds and the same input is byte-identical apart
      from `DTSTAMP` (`web/src/lib/ics.test.ts`, `web/src/lib/feed.test.ts`).
- [ ] The feed URL takes no parameter; the page sends nothing when the
      link is clicked.
- [ ] `/goals` and every goal page render `[data-subscribe]` with the
      "may lag a day" sentence.

## Performance budget
Static file; adds nothing to any page's script bundle. Goal pages stay
within the landing budget (≤100 KB transferred).
