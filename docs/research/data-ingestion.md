# Data ingestion: pipelines or a research agent for the next 45 days
Researched: 2026-11-04 · Informs: [member-pages](../prd/member-pages.md), [state-holdings-sweep](../prd/state-holdings-sweep.md), [office-visits](../prd/office-visits.md), [on-device-districts](../prd/on-device-districts.md), [primary-2028](../prd/primary-2028.md)

Question: which backend data does the site need for the eight open PRDs,
how fresh must each kind be, and should any of it arrive through a
scheduled deterministic ingestion pipeline, or through a research agent
that drafts rows for the maintainer to commit. Horizon: the 45 days to
2026-12-19, which covers every live decision the goals target.

## Decision
**No scheduled ingestion pipeline. Four one-shot deterministic importers
plus one scheduled research agent, both feeding `data/` through PRs.**

- A *pipeline* (cron, fetch, parse, write the database) is justified when
  a source changes often, is machine-readable, and is reachable without a
  bot wall. In this window no needed source meets all three: the
  structured ones (roster, district shapes, past roll calls) change once
  or not at all before 2026-12-19, and the ones that change weekly
  (member positions, caucus dates, the NDAA text, state bond holdings)
  are prose on news sites, press releases, PDFs and two sites that block
  scripts. Building and babysitting crons for that is cost with no
  freshness gain.
- The site's rule that no number or name reaches a page without a sourced
  `data/` row ([data/README.md](../../data/README.md)) already makes the
  maintainer's PR the publishing step. Anything that writes D1 directly
  would bypass it.
- So: deterministic code where the source is structured (a script the
  maintainer runs once, output committed, checksum recorded), and a
  research agent where the source is prose (drafts rows and a dated
  research snapshot; the quote-verifying CLIs decide what becomes a row).

## What the goals need and when
Live decisions inside the window, from the sources checked 2026-11-04:
| Decision | Date | Status of the date | Goal |
|---|---|---|---|
| House Democratic caucus leadership vote | 2026-11-18 (possibly 11-19) | reported by Bloomberg Government, ABC, Punchbowl; not final | `house-caucus` (placeholder in YAML already 11-18) |
| Senate Democratic leader vote | "early December", secret ballot, senators-elect included | Roll Call, NBC; no date published | `senate-leader` (placeholder 2027-01-05 is late; move to ~2026-12-08 once published) |
| FY27 NDAA compromise text | December; House passed H.R. 8800 216–212 on 2026-07-22, Senate cloture on S. 4784 failed 50–46 on 07-14, no conferees named, "four corners" negotiating | ndaa.ai tracker (updated 10-01), CRS IN12704; Senate returns week of 11-09, funding deadline 12-11, Senate out 12-21 | `ndaa-1217` → `ndaa-report-vote` |
| State Israel-bond rollovers | Illinois: $20M matured 2026-11-01; next dates unsourced | one Substack citing no primary record | `state-bonds` |

## Inventory: every data kind, its source, its cadence, who fetches it
| Data (PRD) | Source | How it changes in 45 days | Fetch method | Schedule |
|---|---|---|---|---|
| Roster, ~541 rows (`member-pages` §1) | `unitedstates/congress-legislators` `legislators-current.yaml`, public domain | Commits to the file land about monthly (2026-07-15, 08-18, 09-02, 09-24, 10-05); mid-window changes are deaths, resignations, special-election seatings (Brown, OH). The 120th Congress seats 2027-01-03, after the window | `import-members.ts` as specced: one HTTPS GET of the raw file, pinned by commit SHA, idempotent merge, stale rows printed | One-shot now; rerun by hand when a seat changes and once on 2027-01-04 |
| District offices (`office-visits`) | `legislators-district-offices.yaml`, same repo | Last touched 2026-07-12; quarterly at best | Same importer, second file, two new columns | One-shot with the roster |
| Prior-vote flags `rc243`, `jrd_april_2026` (`member-pages` OQ1) | House Clerk `clerk.house.gov/evs/2026/roll243.xml` (200, 95 KB, clean XML); Senate `vote_119_2_00081.xml` and the second JRD | Historical; never change | Clerk: a small `import-rollcall.ts` that maps XML to `members.csv` flags or `positions` rows with `source_url` = the XML. Senate: **senate.gov returns 403 to every non-browser client and GovTrack's bulk mirror also 403s**; the Congress.gov API has a House roll-call endpoint only. Senate rows are read in the browser pane and typed into the `data/` PR with the URL | One-shot; the same script ingests the December NDAA floor votes the day they happen |
| Positions on §219/§1217, ~540 members (`member-pages` §2–3) | Press, Dear Colleague letters, member statements, constituent reports via `/api/report` | Weekly, then daily around 11-18 and the December text; no structured source exists anywhere | Research agent finds candidate URLs; `draft-position` verifies the quote by code; maintainer pastes rows | Agent run twice a week to 12-19, plus the day after each decision |
| Goal dates, `this_week`, `prep_md` VERIFY chips | Caucus notices, floor schedules, Roll Call, Punchbowl, CRS | Event-driven | Research agent proposes YAML edits with sources | Same agent run |
| `our_picks` signals (Senate leader; Next #1) | Public IG/TikTok pages, press | Weekly until the vote | Agent snapshot, counts copied as rendered (`senate-leader-candidates.md` method). No automated IG/TikTok fetching: both block it and forbid it in their terms | Weekly to the vote, then stop |
| State holdings, 50 rows (`state-holdings-sweep`) | Treasurer and pension disclosures, PDFs, FOIA responses | Report cadence is quarterly or annual; the PRD already rejects automatic refresh | Agent sweep in batches of ten, campaign states first; `draft-holding` verifies | Two batches before 12-19 (IL, NY, PA, TX, FL, MD, MN, MI, WA, NC, then the next ten) |
| District geometry (`on-device-districts`) | Census TIGER 2025 `www2.census.gov/geo/tiger/TIGER2025/CD/tl_2025_<fips>_cd119.zip`, 56 files, public domain | Static until a state redraws (California 2026 map is the one to watch) | `build-districts.ts` as specced, vintage checksum committed | One-shot |
| `elections.csv` (`primary-2028`) | State election calendars | Nothing decided before 2028 filing windows | Defer; outside the window | None now |
| Receipts, reports, counts (`district-counters`, `commitment-funnel`) | The site's own D1 | Live | Already internal; no ingestion | n/a |

## Crawling and ingestion guidelines applied
What the practice at our scale (one maintainer, tens of fetches a week,
$0 infra) takes from the larger projects (Open States: bills scraped
several times a day but legislators hand-curated; `congress-legislators`:
hand-curated, scripts assist; GovTrack: bulk JSON mirror behind a bot
wall now) and from current scraping guidance:
1. **Prefer a file to a crawl.** Roster, offices and shapes are single
   public-domain files. Fetch by pinned URL, record the SHA-256 and the
   upstream commit or vintage next to the output. No HTML parsing.
2. **Identify and throttle.** A fixed `User-Agent` naming the project and
   a contact URL, one request per second per host, back off on 429/503
   and honour `Retry-After`. Conditional GET (`If-None-Match`,
   `If-Modified-Since`) on any URL fetched twice.
3. **Do not fight bot walls.** senate.gov and govtrack.us 403 scripted
   clients; Instagram and TikTok block and forbid automation. Those are
   read by a person or the agent in a browser and the value copied with
   the URL and date. Two or three Senate roll calls in 45 days do not
   justify evasion, and evasion would put the site's credibility at risk.
4. **Provenance per row, not per batch.** Every row keeps `source_url`
   and `source_date` (already enforced by the loader); importer output
   adds a `fetched_at` and source checksum in the PR body. Raw fetches
   are kept in the PR branch only when the source is a PDF that may move.
5. **The model proposes, code verifies, a person commits.** Unchanged
   from `maintainer-tooling.md`: `draft-position` and `draft-holding`
   refuse a row without a verbatim quote and a date; whip counts and
   tallies are SQL over committed rows. The research agent never gets a
   write path to `data/` or D1.
6. **Idempotent, re-runnable, no deletes.** Importers merge on
   `bioguide_id` and print stale rows; the seed is the only thing that
   rewrites a table, and only from committed files.

## The research agent, concretely
- **What:** a scheduled Claude Code routine (cloud, `docs/research/` and
  `data/` write access on a branch, no deploy permissions) with one
  prompt per sweep type: (a) positions and dates for the three federal
  goals, (b) Senate-leader candidate signals, (c) state holdings batch.
- **Output:** a new dated snapshot file under `docs/research/` when
  findings change (never an edit to an old one; `Supersedes` line and
  `## What changed`), the CSV/YAML rows it could verify through the
  CLIs, a PR whose body lists what it could not verify as `VERIFY`
  items. The maintainer merges; the deploy workflow publishes.
- **Cadence:** (a) Tuesday and Friday 14:00 UTC through 2026-12-19, plus
  a manual run the morning after 11-18, after the compromise text is
  filed and after each floor vote; (b) weekly until the Senate vote;
  (c) twice total. Every run is bounded (≤100 tool calls) and reports in
  ≤15 lines.
- **Cost:** roughly 15 agent runs at a few dollars each, against two to
  three days of engineering for crons that would still need the same
  human verification step for positions. After 12-19 the cadence drops
  to weekly for the state sweep and stops for the federal goals until
  the next named vote.

## What this does not change
- The deterministic scripts the PRDs already specify (`import-members`,
  `build-districts`, `draft-holding`) are still built; they are one-shot
  tools, not pipelines. `import-rollcall.ts` is the one addition and
  belongs in `member-pages` §1 as a sub-step (proposal, not yet in the
  PRD).
- Reports from constituents remain the only live position signal the
  site collects itself; they never change a position row without a
  source (`maintainer-tooling.md` invariants).

## Revisit when
- A named vote is scheduled more than 45 days out with weekly roll calls
  (an appropriations cycle): then a House-only roll-call cron via the
  Congress.gov API (`/house-vote`, 5,000 requests/hour with a key) pays
  for itself.
- senate.gov publishes an API or drops the bot wall for its XML.
- The state sweep finds that more than five states publish
  machine-readable holdings on a schedule.

## Sources
- House Democratic leadership election dates: Bloomberg Government (Nov. 18–19), Punchbowl News 2026-11-02, ABC live blog 2026-11-04.
- Senate Democratic leader vote "early December": Roll Call 2026-11-04 (https://rollcall.com/2026/11/04/will-be-reelected-as-majority-leader-schumer-says/); NBC.
- NDAA status: https://ndaa.ai/guides/fy2027-ndaa-status (updated 2026-10-01); CRS IN12704 (https://www.congress.gov/crs-product/IN12704, 403 to scripted fetch, read via search summary).
- Illinois holdings and 2026-11-01 maturity: https://letsaddressillinois.substack.com/p/the-nyc-comptroller-is-ditching-israel (2026-10-21; no primary record cited).
- Other state holdings reporting: Truthout, Waging Nonviolence 2026-02, Mondoweiss 2026-06, AFSC divest list (all campaign-side; figures undated or mixed dates).
- `congress-legislators` commit history for `legislators-current.yaml` and `legislators-district-offices.yaml` (GitHub API, read 2026-11-04).
- Clerk roll 243 XML: https://clerk.house.gov/evs/2026/roll243.xml (200). Senate XML `vote_119_2_00081.xml` and GovTrack `data/congress/119/votes/2026/s81/data.json`: 403 to curl with and without a browser user agent, 2026-11-04.
- Congress.gov API endpoint list (`HouseRollCallVoteEndpoint.md`, no Senate equivalent): https://github.com/LibraryOfCongress/api.congress.gov/tree/main/Documentation; rate limit 5,000/hour.
- TIGER 2025 CD119 directory: https://www2.census.gov/geo/tiger/TIGER2025/CD/ (56 state and territory zips).
- Google Civic Information Representatives API turndown (April 2025) and the Governance Project's decision not to offer an API: https://groups.google.com/g/google-civicinfo-api/c/9fwFn-dhktA.
- Open States data practice ("bill & vote data is collected multiple times a day via our scrapers while legislator data is curated"): https://open.pluralpolicy.com/about.
- Scraping practice (conditional GET, per-host rate, Retry-After, robots cadence): scrapfly.io and dev.to guides, 2026.
