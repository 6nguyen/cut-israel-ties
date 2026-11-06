# Member pages and whip count

## Purpose
Gives every sitting member of Congress a static public page that says where
they stand on each active goal and how to reach them, and gives every
federal goal a "where everyone stands" table whose counts come from the
sourced rows in `data/positions/`. It also fills `data/members.csv` from
the public roster so both pages, the router and the whip counts cover all
435 representatives, 6 delegates and 100 senators. It stops at display:
positions are entered by the maintainer tooling (`maintainer-tooling.md`),
never by this capability, and nothing here calls an LLM.

## Behavior
1. **Roster import (`npm run import-members -w worker`).** Reads the
   `unitedstates/congress-legislators` `legislators-current.yaml` file
   (from the path passed as the first argument, or downloaded when none is
   given), takes each person's last term, and merges it into
   `data/members.csv`. Rows for a `bioguide_id` already in the file keep
   their `name` (the file's common name wins over the dataset's
   `official_full`, so "Lou Correa" stays), their `district_phone`,
   `money_url` and every flag column (`hasc`, `conferee`, `rc243`,
   `jrd_april_2026`, `btb_cosponsor`, `target_2028`); `party`, `chamber`,
   `state`, `district`, `dc_phone` and `contact_form_url` are refreshed
   from the dataset when it has a value. New members get the dataset's
   name and empty flags. Members in the file but not in the roster are
   kept and printed under `stale:` so the maintainer decides; the script
   never deletes a row. Rows are sorted by state, House before Senate,
   district, name, and the script is idempotent (a second run changes no
   bytes). At-large seats, DC and the territories keep district `0`;
   senators keep an empty district.
2. **Seed checks.** `loadRows` rejects `members.csv` when a `bioguide_id`
   repeats, a senator carries a district, a House district is outside the
   state's seat count (`worker/src/districts.ts`, labelled by
   `SEATS_CONGRESS`, 119 today; the 2020 apportionment holds through the
   120th), a
   single-seat state uses a district other than `0`, or a state code is
   unknown. The error names the file and the row.
3. **Member page (`/m/<bioguide_id>`).** One static page per member,
   built from `data/`. Hero: party and seat chip (`CA-46`, `TX at large`,
   `VT` for a senator), chamber chip, title "Rep./Del./Sen. Name", a
   `tel:` button for the DC office, a `tel:` button for the district
   office and a contact-form link when those columns are filled. Below,
   one block per active goal whose targets include the member (same
   first-action scope rule as the result cards): goal title linking to
   `/goals/<slug>`, the newest sourced position as a chip (`for`,
   `uncommitted`, `against`, `unknown`) with its source link and date, or
   "No sourced statement yet"; the member's prior-vote and role flags
   spelled out ("NDAA conferee", "House Armed Services Committee member",
   "Roll call 243 …", "April 2026 joint resolutions of disapproval …",
   "Block the Bombs Act cosponsor") or "No recorded vote yet" when every
   flag is empty; the action's ask text and a "Call →" button to
   `/goals/<slug>/act/<action>?target=<bioguide_id>`, which preselects
   this member on the act page. A member no active goal targets sees "No
   open decision" and the contact buttons. All of this renders without
   JavaScript.
4. **Your representative.** One inline script reads the stored
   `cut-ties:place` (`{state, district}`); when it matches the page's
   state and, for a representative, district, a "Your representative"
   chip appears and the buttons read "Call now →". Nothing is sent
   anywhere.
5. **Latest constituent report.** The same script calls
   `GET /api/members/<bioguide_id>/reports?goal=<slug>` for each goal block
   and, when `latest` is non-null, shows one line: "Latest call: office
   said they are undecided — "<note>" (<date>; reported by a constituent,
   unverified)". A report never changes the position chip or any count;
   those come only from `data/positions/`.
6. **Share card (`/m/<bioguide_id>/card.png`).** 1200×630 PNG built like
   the goal cards: category stripe, "<Name> on <goal title>" and the
   position line ("Rep. Lou Correa (D, CA-46): unknown on …"). Members
   without an open goal get "Rep./Sen. Name" and "no open decision right
   now". The page's Open Graph tags point at it.
7. **Unknown ids.** The build emits only sitting members; any other
   `/m/…` path (and any unknown goal path) is served the static 404 page
   ("Nothing on file at this address", link to `/goals`).
8. **Whip table (`/goals/<slug>/whip`).** Exists for every published goal
   whose first action targets a chamber (`house`, `senate` or `both`;
   state-scope goals have none). Hero: category chip, "Where everyone
   stands", goal title, "Updated <date>" from the newest `source_date` in
   that goal's positions (or "never — no sourced position yet") and the
   decision date while open. Four tiles — For, Uncommitted, Against,
   Unknown — count every voting member the goal targets, using each
   member's newest position row; delegates are listed but never counted.
   Then the filter links and the table: member (link to `/m/…`), seat,
   position chip, source date linking to the source, role (`conferee`,
   `HASC`, `delegate, no floor vote`), DC phone as `tel:`, and a "Call"
   button to the act page with `?target=` while the goal is open.
9. **Sort and default view.** Rows sort conferees first, then HASC
   members, then by position (`uncommitted`, `unknown`, `against`,
   `for`), then state, House before Senate, district, name; delegates
   last. The default page shows the movable set: for a House or
   both-chambers goal, House Democrats and Independents plus every
   conferee; for a Senate goal, Senate Democrats and Independents plus
   conferees. Leadership goals target one party's caucus, so their table
   is that caucus.
10. **Filters.** Every filter is a pre-rendered page reached by a plain
    link, so filtering works with JavaScript disabled: `/whip/all` (every
    targeted member), `/whip/<STATE>`, `/whip/<STATE>/<PARTY>` and
    `/whip/party/<PARTY>`. An explicit state or party filter applies to
    the full target set, not just the movable set. A shared link of the
    form `?state=TX&party=R` (or `?all`) is mapped onto the matching page
    by a three-line inline script; without JavaScript that link shows the
    default view with the filter links.
11. **Closed goals.** A `completed` or `expired` goal keeps its table and
    counts; a status chip and an "Outcome" block with the `outcome_note`
    and decision date sit above the tiles, and the "Call" column is empty.
12. **Goal detail link.** The goal page's sidebar shows "Where everyone
    stands →" for every goal that has a whip table.
13. **Sitemap and robots.** `/sitemap.xml` lists `/`, `/goals`, `/about`,
    `/donate`, `/privacy`, every published goal, prep page, whip page and
    member page, absolute when `SITE_URL` is set at build. `/robots.txt`
    allows everything except `/api/` and names the sitemap.

## Data & contracts
- `data/members.csv`: one row per sitting member, columns unchanged
  (`bioguide_id,name,party,chamber,state,district,dc_phone,district_phone,
  contact_form_url,hasc,conferee,rc243,jrd_april_2026,btb_cosponsor,
  target_2028,money_url,district_office_address,district_office_city`;
  the last two are empty until sourced, see office-visits). Provenance
  and the merge rules in `data/README.md`.
- `worker/scripts/import-members.ts` — `rosterRows(yaml)`, `merge(existing,
  roster) → {rows, stale, added}`, `toCsv(rows)`; the CLI prints the row
  counts and the `stale:` list.
- `worker/src/districts.ts` — `HOUSE_SEATS` (119th apportionment plus the
  six delegate seats), `isDelegate(member)`, `districtError(state,
  district)`.
- `worker/src/whip.ts` — `whipTargets(goal, action, members)`,
  `latestPosition(positions, bioguideId, goalId)`, `whipRows(...)`,
  `whipCounts(rows)` (skips delegates), `updatedAt(positions, goalId)`,
  `applyFilters(rows, {state, party, all})`. The web pages import these
  through `web/src/lib/members.ts`; no page computes a count itself.
- `GET /api/members/:bioguide_id/reports?goal=<slug>` → `{latest: {outcome,
  note, created_at} | null}`: the newest non-hidden report for that member
  and goal. 404 `no_member` / `no_goal`, 400 `no_goal` when `goal` is
  missing. `Repo.latestReport(bioguideId, goalId)` backs it in D1 and the
  in-memory repo.
- Pages: `web/src/pages/m/[id].astro`, `web/src/pages/m/[id]/card.png.ts`,
  `web/src/pages/goals/[slug]/whip.astro`,
  `web/src/pages/goals/[slug]/whip/[...filter].astro` (shared component
  `web/src/components/WhipTable.astro`), `web/src/pages/sitemap.xml.ts`,
  `web/src/pages/404.astro`, `web/public/robots.txt`.

## Invariants (regression checklist)
- [ ] `/m/C001110` with JavaScript disabled shows the NDAA block with a
      position chip, a source link or "No sourced statement yet", and a
      `tel:` button.
- [ ] `/m/NOPE000` is the 404 page.
- [ ] The four tiles on `/goals/ndaa-1217/whip` sum to the number of
      non-delegate members the goal targets and equal the per-position
      counts a test computes from `data/positions/ndaa-1217.csv`.
- [ ] The default House view contains no Republican who is not a conferee
      and every conferee; `/whip/TX/R` lists only Texas Republicans;
      `/whip/all` lists every targeted member, delegates last and tagged.
- [ ] Posting a report for a member changes the "Latest call" line on
      their page and nothing else on it or on the whip table.
- [ ] Running the import twice in a row leaves `members.csv` byte-identical;
      a fixture member keeps its name and flags; a member missing from the
      roster is printed under `stale:` and still in the file.
- [ ] A `members.csv` row with `TX,37`, `WY,1`, a duplicate id or a senator
      with a district fails the seed with a message naming the row.
- [ ] `/sitemap.xml` lists every `/m/` and `/whip` page; `/robots.txt`
      disallows `/api/`.

## Performance budget
- Member page ≤100 KB transferred (measured 2026-11-04: `/m/C001110` HTML
  2.7 KB gzipped + 4.7 KB CSS; the share card is loaded only by link
  previews). LCP ≤1.5 s on a mid-range phone over 4G.
- House whip page ≤150 KB transferred (measured: default view 11.4 KB
  gzipped HTML, `/whip/all` 23.2 KB).
- Zero LLM calls at build or request time; infra cost unchanged at
  $0/month (static pages, one D1 read per report lookup).
