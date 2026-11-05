# Member pages and whip count — PRD
Status: SHIPPED 2026-11-04 (PR #29) · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
The site only shows a member inside a visitor's own two goal cards, after
an address. There is no public, linkable page per member and no table of
where every member stands on a goal, so a journalist, organiser or
search engine cannot find "where does Rep. X stand on NDAA §1217" and the
positions data (`data/positions/`) has no public surface beyond the
cards. `data/members.csv` also holds 12 fixture rows, so even the cards
work for three states only. The superseded vote-tracker PRD
(`archive/2026-11-vote-tracker.md` §1) specified this surface; the
research gap statement names a public whip count per named vote as the
thing no existing tool offers.

## Goals / Non-goals
- Goals: a stable `/m/<bioguide_id>` page for every sitting member,
  rendered without JavaScript, with share metadata; a per-goal whip
  table `/goals/<slug>/whip` sorted by movability; the full 119th
  Congress roster imported by script from a sourced dataset, never typed
  by hand; both surfaces indexed by search engines.
- Non-goals: per-district counters on the row (own PRD,
  `district-counters.md`); user-editable positions (positions stay
  maintainer-sourced); member photos (licence and weight); state
  legislators.

## Research (what the best products do → adopt / adapt / reject)
Relies on: `docs/research/civic-action-levers/organizing-channels-and-tools.md`
(Na Pressão whip count, CMF findings).
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Public whip count sorted by "uncommitted" | Na Pressão (Brazil) | adopt | the one surface that turns positions into pressure |
| One stable URL per legislator with office numbers | 5 Calls, GovTrack | adopt | SEO and shareability; `tel:` links live |
| Crowd-edited positions | wikis | reject | every position needs a maintainer-verified source (`draft-position`) |
| Member photos and bios | GovTrack | reject | weight and licence; the page is about the position, not the person |

## Users
Organisers and journalists arrive from search or a shared link and want
the position, its source and the phone number in one screen. Returning
visitors with a stored district see their own members highlighted.

## Expected behavior
### 1. Roster import
1. `worker/scripts/import-members.ts` downloads the
   `unitedstates/congress-legislators` `legislators-current.yaml`
   (public domain) and writes every sitting member to `data/members.csv`
   in the existing column order: bioguide id, name, party, chamber,
   state, district, DC phone, contact form URL. District and state
   phones stay empty unless the dataset has them; flag columns are left
   as they are for existing rows and empty for new ones.
2. The script is idempotent and never deletes a row that is in the file
   but not in the dataset; it prints such rows as "stale" for the
   maintainer. Running it is a PR like any `data/` change.
3. The seed rejects a members file with a duplicate bioguide id, a
   district outside the state's count, or a senator with a district.

### 2. Member page
1. `/m/<bioguide_id>` shows name, party, chamber, state and district,
   the DC phone as a `tel:` link, the contact form link, and one block
   per active goal the member is a target for: the goal title, the
   member's position (for · uncommitted · against · unknown) with its
   source link and date, the prior-vote flags that goal uses (`rc243`,
   `jrd_april_2026`, `btb_cosponsor`, `hasc`, `conferee`) spelled out,
   and the one-line ask from the goal's first action with a "Call" CTA
   to the act page with this member preselected.
2. Below: the latest unverified office response for this member and
   goal, from `reports` (outcome, date, note ≤140 chars), labelled
   "reported by a constituent, unverified"; absent when `hidden`.
3. If the visitor's stored district matches, the page says "your
   representative" and the CTA reads "Call now".
4. Unknown id → 404 page with a link to `/goals`. Members with no active
   goal still get a page (contact details and "no open decision").
5. Share metadata: title "<name> on <goal title>", description = position
   line, card PNG rendered at build like the goal cards.

### 3. Whip count table
1. `/goals/<slug>/whip` lists every member the goal targets (by the
   goal's `target_scope` and eligibility rule) with position, source
   date, state-district, party, phone and a "Call" link. Four count
   tiles above it: for · uncommitted · against · unknown, computed at
   build from `positions` by code.
2. Sort: conferees, then committee members, then uncommitted, unknown,
   against, for; filter by state and party; default view is the goal's
   movable set (House Democrats plus every conferee for the NDAA goal),
   "show all" expands. Filters are query-string driven and work without
   JavaScript.
3. The goal detail page links the table ("Where everyone stands"); a
   closed goal keeps its table with the outcome note on top.

### 4. Build, sitemap and freshness
1. `/sitemap.xml` lists goals, prep, whip and member pages; `robots.txt`
   allows all.
2. Pages are static; a `positions.csv` merge rebuilds them through the
   deploy workflow (`deploy.md`). "Updated <date>" on the table is the
   newest `source_date` in the goal's positions file.

## Data & contracts
- `data/members.csv`: ~540 rows after import; columns unchanged.
- New `worker/scripts/import-members.ts`; new seed checks (§1.3).
- `GET /api/members/:bioguide_id/reports?goal=<slug>` → `{latest}` for
  §2.2 (the only runtime call on a member page; everything else is
  static).
- Pages: `web/src/pages/m/[id].astro`,
  `web/src/pages/goals/[slug]/whip.astro`, `web/src/pages/sitemap.xml.ts`.

## Spec delta
- ADDED `docs/specs/member-pages.md`: member page, whip table, roster
  import, sitemap.
- MODIFIED `docs/specs/action-router.md` §Behavior goal detail: adds the
  "Where everyone stands" link.

## Acceptance criteria
- [ ] After `import-members.ts`, `members.csv` has one row per sitting
      member (435 + 6 delegates + 100), seeds without error, and the six
      fixture delegations still resolve.
- [ ] `/m/C001110` renders the NDAA block with position, source and a
      `tel:` link with JavaScript disabled; an unknown id returns 404.
- [ ] `/goals/ndaa-1217/whip` tiles equal the counts a test computes
      from `positions/ndaa-1217.csv`; default view is House Democrats
      plus conferees; `?state=TX&party=R` filters without JavaScript.
- [ ] A report posted for a member appears on their page within one
      request and never changes the position shown.
- [ ] Every number on both pages traces to a `data/` row; no LLM is
      called at build or request time.
- [ ] Performance budget: a member page ≤100 KB transferred, LCP ≤1.5 s
      on a mid-range phone over 4G; the whip table for the House ≤150 KB
      transferred; infra cost unchanged at $0/month.

## Rollout & metrics
No flag. Metrics: search impressions for `/m/` and `/whip` URLs after
four weeks; share-card requests; "Call" clicks from member pages versus
from result cards.

## State (updated 2026-11-04)
- Status: SHIPPED
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [x] 1. Roster import · PR #29
  - [x] 2. Member page · PR #29
  - [x] 3. Whip count table · PR #29
  - [x] 4. Build, sitemap and freshness · PR #29
- Completed: §1–4 merged to main via PR #29 (integration of the feature branch, PR #25).
- Folded: §1–4: `docs/specs/member-pages.md` added; `docs/specs/action-router.md` goal-detail link; `docs/specs/README.md` row.
- Branch / open PRs: none (PR #25 superseded by PR #29).
- Files changed: `worker/scripts/import-members.ts` (new, §1); `worker/src/districts.ts` (new), `worker/src/load.ts` `checkMembers` (§1.3 seed checks); `data/members.csv` (539 rows), `data/README.md` §Provenance; `worker/src/whip.ts` (new: targets, rows, counts, filters); `worker/src/types.ts` (`Repo.latestReport`, `LatestReport`, appended), `worker/src/repo.ts` (D1 + memory `latestReport`, appended), `worker/src/index.ts` (`GET /api/members/:bioguide_id/reports` before `notFound`); `worker/test/members.test.ts` (new), `worker/test/{route,goals,generate}.test.ts` (roster-aware expectations: unknown state `ZZ`, sourced office phone); `web/src/lib/members.ts`, `web/src/pages/m/[id].astro`, `web/src/pages/m/[id]/card.png.ts`, `web/src/components/WhipTable.astro`, `web/src/pages/goals/[slug]/whip.astro`, `web/src/pages/goals/[slug]/whip/[...filter].astro`, `web/src/pages/goals/[slug].astro:89` (link), `web/src/pages/sitemap.xml.ts`, `web/src/pages/404.astro`, `web/public/robots.txt`.
- Tests run + result: quiet-check prd-lint, doc-lint, tsc, test (worker vitest incl. new members.test.ts: seed checks, import merge, whip counts/sort/filters, reports endpoint), test-web, build — all PASS. Sizes: `/m/C001110` 2.7 KB gz HTML + 4.7 KB gz CSS (budget 100 KB); `/goals/ndaa-1217/whip` 11.4 KB gz, `/whip/all` 23.2 KB gz (budget 150 KB).
- Remaining: none.
- Next action: none; archived.
## Open questions
1. Which prior-vote flags the import can fill. Proposal: none; `rc243`
   and the April 2026 JRD votes are seeded from the Clerk's and Senate
   roll-call pages in a separate `data/` PR with sources, never inferred.
2. Delegates (DC, PR, territories) on the whip table. Proposal: include
   them on member pages, exclude from whip counts (no floor vote).

## Changes
- 2026-11-04 — created (APPROVED, auto: every question carries a
  proposal, none blocking). Replaces `## Next` row 1.
- 2026-11-04 — §1–4 built together on feat/member-pages (PR #25). Decisions:
  the import keeps the file's `name` for existing rows (dataset
  `official_full` only for new rows); query-string filters became
  pre-rendered filter pages (`/whip/all`, `/whip/<ST>`, `/whip/<ST>/<P>`,
  `/whip/party/<P>`) because the static host cannot read a query string,
  with a 3-line script mapping `?state=&party=` links onto them; delegates
  shown last with "no floor vote", excluded from tiles (open question 2);
  default view generalised to the targeted chamber's Democrats and
  Independents plus conferees.
- 2026-11-04 — SHIPPED via PR #29 (the integration PR that merged PR #25 with the other seven PRD branches); archived. Follow-ups outside this PRD: prior-vote flags (open question 1) come in a separate sourced `data/` PR.
