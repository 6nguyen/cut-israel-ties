# Roster freshness and district offices
Researched: 2026-11-05 · Informs: [roster-freshness](../prd/roster-freshness.md), [call-follow-through](../prd/call-follow-through.md)

## Summary
- **District offices fill the gap.** `legislators-district-offices.yaml` covers 535 of 539 current members; 532 have a phone and 533 a street address. The 4 without any entry are all recent seatings (Gallagher CA, Graham Nordone SC-S, Blair GA, Wahab CA). It is multi-office (1,306 offices, up to 9 per member), so one `district_phone` column loses data: store offices as rows.
- **Contact forms are Senate-only in the dataset.** 88 of 539 carry `contact_form` (86 senators, 2 reps). The House side is a different problem: the Clerk feed has no form URL. Fallback is `<member url>/contact`, and many House sites put a ZIP gate in front of it.
- **Transition: nothing changes before 2027-01-03.** Departing members stay in `legislators-current.yaml` until the election-results commit (2025-01-04 02:03 UTC last cycle). Members-elect are never in it. The district-offices file lost 1,684 lines in that commit and took about 8 weeks to refill (466 legislators on 2025-01-04, 535 on 2025-03-05).
- **Target through December is the sitting member**, since terms end at noon on 2027-01-03. Do not switch to members-elect early.
- **Refresh: weekly fetch, commit only on diff.** About 33 roster events in 22 months, clustered; commits land the same day or next. Monthly would miss a death or seating for up to 4 weeks, weekly costs nothing.
- **Cost: $0** (two raw GETs, 1.4 MB, scheduled Action). Pin by SHA; prefer raw `main` over the `github.io` mirror, which was last built 2026-09-24.

## 1. `legislators-district-offices.yaml`
Observed 2026-11-05, raw `main`, 325,108 bytes. Top level: list of `{id: {bioguide, govtrack, thomas?}, offices: [...]}`.

| Field | Offices with it (of 1,306) |
|---|---|
| `id` (`<bioguide>-<city>`), `city`, `state` | 1,306 |
| `zip` | 1,305 |
| `address` (street) | 1,304 |
| `phone` | 1,274 |
| `suite` | 1,027 |
| `latitude`, `longitude` | 1,287 |
| `fax` | 486 |
| `hours` | 253 |
| `building` | 176 |

There is no `suburb` field in this file (absent in all 1,306 offices). Offices per member: 1 (196 members), 2 (154), 3 (75), 4 (44), 5 (21), 6 (26), 7 (14), 8 (3), 9 (2).

- **Coverage vs 539:** 535 members have entries, 0 entries for non-members. Missing: Gallagher (CA, sworn 2026-06-11), Graham Nordone (SC senator, sworn 2026-07-14), Blair (GA, 2026-09-01), Wahab (CA, 2026-09-02). Three more have offices but none with a phone. Only 253 of 1,306 offices have `hours` (19%), so do not promise hours.
- **Last commit:** 2026-07-12 ("Sen. Graham died", J. Tauberer). Before it: a 2026-06-10 batch by Casey Dreier adding offices for Armstrong, Fuller, Mejia and geocodes.
- **Who and how often:** by commit author, Tauberer (GovTrack) 56 of the last 100, Dreier 24, O'Neill 10, Willis 4. Roughly 18 distinct commit dates in 2025-01..2026-07 (42 commits since 2025-01-01), and gaps of up to 5 months. New members' offices are added by hand, by volunteers, weeks to months after seating; Tauberer's `sweep.py` only deletes departed members. `geocode_offices.py` adds lat/long with a Google key.
- **Can it fill `district_phone` and `district_office_address`?** Yes for ~99%. Rule needed for multi-office members: store all rows (new `district_offices` table keyed by `bioguide_id`, with lat/lng for nearest-office by ZIP centroid) and fill the CSV columns from the first office only as a display fallback. The 4 missing plus any 2027 newcomers need a hand-entered row from the member's site (a data PR, sourced).
- **Existing CSV state (this worktree):** 539 rows, 95 `contact_form_url`, 0 `district_phone`, 0 office addresses by my count (the brief said 94 and 12; recount before the importer PR).

## 2. Contact-form coverage
| Chamber | Members | With `terms[-1].contact_form` | Source of the value |
|---|---|---|---|
| Senate | 100 | 86 | `senate_contacts.py` copies `<email>` from `senators_cfm.xml` **only if** it differs from the member's homepage |
| House | 439 | 2 | `house_contacts.py` reads the Clerk `MemberData.xml`, which has no URL field; `contact_forms.py` maps only forms present in `unitedstates/contact-congress` |

- The 14 senators without a value (Graham Nordone included) are those whose XML `email` equals their homepage: the Senate has no form to give, so link the homepage. In the XML, 84 of 100 `email` values differ from `website`; the yaml has 86 (the script's comparison is against `terms[-1].url`, not `website`; I did not trace the 2-row difference).
- **House pattern:** every current rep has `terms[-1].url` (439 of 439, `https://<name>.house.gov`). I fetched `<url>/contact` for 11 evenly spaced members with a browser UA: all returned 200. Only 4 landed on a form directly (`/contact`); 6 redirected to `address_authentication` or `zip_authentication?form=/contact` (the form is behind a ZIP or address check), and 1 to a `forms` subdomain. The pattern works as a link, not as a prefilled form; it is unverified for the other 428.
- **Fallbacks, observed 2026-11-05:**
  - `https://clerk.house.gov/xml/lists/MemberData.xml`: 200, 557,204 bytes, `publish-date November 3, 2026`, `bioguideID`, DC `phone`, office room, `elected-date`, `sworn-date`. No contact form, no district office.
  - `https://www.senate.gov/general/contact_information/senators_cfm.xml`: **200** with plain curl, with and without a browser UA, 52,533 bytes, 100 members, `bioguide_id`, DC address, phone, `email` (form or homepage), `class`. This contradicts the earlier "403 to every client" note in `data-ingestion.md` for this file only; `senate.gov/legislative/LIS/roll_call_votes/...xml` still returns 403. Re-test from a GitHub Actions runner before relying on it (cloud IPs are what bot walls block).
- **Conclusion:** the roster importer already gets what the dataset has. For Senate forms, add the XML as a second source (200 locally). For House, the reliable value is the homepage `url`; a per-member verified form list is a manual or research-agent task, not a fetch.

## 3. The 120th Congress transition
| Date | What the repo did |
|---|---|
| 2022-11 to 2022-12 | Single commit 2023-01-03 "Merge 2022 Election Update"; bioguide IDs and offices imported from the Clerk's unofficial member-elect file; new-member urls 2023-01-08; contacts 2023-02-05 |
| 2024-11-13 to 2024-12-18 | Special-election and resignation commits (Gaetz, Schiff, Kim, Armstrong); House contacts run 2024-12-17 |
| 2025-01-04 02:03 UTC | "2024 Election Results" from `clerk.house.gov/xml/lists/unofficial-119-member-elect-data.xml`, birthdays from Wikipedia; `legislators-current.yaml` +4,510/-4,913 lines; district offices -1,684; defeated and retired members moved to historical |
| 2025-01-05 | `house_contacts.py` and `senate_contacts.py` rerun; missing House urls added |
| 2025-02-02, 03-05 | Offices sweep, then volunteer batch (#993): 463 then 535 legislators |

- **When do departing members leave `current`?** Not before the election-results commit, i.e. the evening of swearing-in day. Today 472 terms end 2027-01-03 and 33 and 32 senators end 2031 and 2029. Two Senate terms (Husted OH, Moody FL) carry a placeholder end of 2026-11-03 (`end-type: special-election`); they are still seated, so do not treat that end date as "left".
- **Members-elect:** the dataset never lists them early. The House Clerk publishes `unofficial-<n>-member-elect-data.xml`; the 119th file's last-modified is 2024-12-30, three days before swearing-in, and the 120th URL returns 404 today (2026-11-05). Ballotpedia pages return 202 to scripts but are not a stable data source. Before the Clerk file appears, a "who lost" list is a manual, sourced `data/` edit; the AP/Clerk results are the primary sources.
- **Who is the target Nov 5 to Jan 3?** The sitting member, incumbents defeated or retiring included. Evidence: FY2027 NDAA is not enacted; the House passed H.R. 8800 on 2026-07-22 (216-212), the Senate bill stalled 2026-07-14, and leaders deferred to the lame duck with a compromise text expected in December and government funding expiring 2026-12-11 (ndaa.ai, updated 2026-10-01 per the page). Votes happen under the 119th Congress, whose members hold office until noon on 2027-01-03 (20th Amendment). A defeated member can still be pressed, and has a different incentive: add a `not_returning` flag (manual) rather than removing the row, and keep the constituent's own district as the routing key.
- **January:** the 120th Congress convenes 2027-01-03. A constituent in a changed seat needs the new member. Plan one importer run on 2027-01-04 or 01-05 (the 2025 precedent landed at 02:03 UTC on 01-04) and a second after the House contacts run. Expect ~50 to 70 new faces and no district offices for them until about March; use DC phone from the roster and the member site as the fallback, and say "district office not listed yet" in the UI.
- **Importer behavior to check:** `import-members.ts` keeps rows missing from the dataset and prints them as "stale". On 2027-01-04 those stale rows must be hidden from routing, not just printed.
- **Caveat:** I found no indexed reporting of the 2026-11-03 results (search 2026-11-05), so the number of defeated incumbents is unknown.

## 4. Change rate, 2025-01-01 to 2026-11-04
Counted from `legislators-current.yaml` commit subjects (73 commits since 2025-01-01) and term start dates.
| Event | Count | Examples |
|---|---|---|
| Deaths | 6 | Turner 2025-03, Grijalva 2025-03-14, Connolly 2025-05-21, LaMalfa 2026-01-05, D. Scott 2026-04, Graham 2026-07-12 |
| Resignations or departures | 10 | Vance, Rubio, Waltz, Green (TN), Greene, Sherrill, Swalwell, Gonzales, Cherfilus-McCormick, Mullin |
| Seatings (special election or appointment) | 16 | Justice, Husted, Moody, Patronis, Fine, Walkinshaw, Grijalva, Van Epps, Menefee, Armstrong, Fuller, Mejia, Gallagher, Graham Nordone, Blair, Wahab |
| Party or other field change | 1 | Kiley to Independent, 2026-03-24 |
| Contact/phone refresh runs (`house_contacts.py`, `senate_contacts.py`) | 11 | 2025-01-22, 02-02, 03-04, 04-03, 09-11, 11-14; 2026-02-03, 03-25, 04-21, 07-15, 09-02 |

- About 33 seat events in 22 months (about 18 a year), in clusters (Jan 2025, Jan 2026, Mar to Apr 2026). The longest quiet stretch between event commits was about 10 weeks (2025-05-21 to 07-28).
- **Latency from event to commit:** same day or next day in all examples I checked (LaMalfa "presumably yesterday"; Graham 2026-07-12; Gallagher sworn 06-11). The District Offices file lags far more: the 4 missing members were seated 2 to 5 months ago.
- Latest commit on `main`: 2026-11-04 18:42 UTC (`committee_membership.py`), so the file is live.
- **Recommendation:** weekly. Monthly is defensible for steady state, but a vacancy or death leaves a dead phone line for up to four weeks, and the cost of weekly is the same $0. Add a daily run for the 7 days after 2027-01-03.

## 5. Cost and fetch
| Resource | URL (observed 2026-11-05) | Bytes |
|---|---|---|
| Roster | `https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml` | 1,081,187 |
| District offices | `https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-district-offices.yaml` | 325,108 |
| Mirror (current importer URL) | `https://unitedstates.github.io/congress-legislators/legislators-current.yaml` | 1,081,187, last-modified 2026-09-24 (built by CircleCI "update to main") |
| House Clerk | `https://clerk.house.gov/xml/lists/MemberData.xml` | 557,204 |
| Senate directory | `https://www.senate.gov/general/contact_information/senators_cfm.xml` | 52,533 |

- All public, no key. Repo license is CC0-1.0 (GitHub API). Raw responses carry an `ETag` and `max-age=300`: send `If-None-Match` and a weekly run is two tiny 304s on most weeks.
- A scheduled GitHub Action (`cron`) that fetches, runs the importer and opens a PR only when the diff is non-empty uses well under 5 minutes per month of runner time: free on a public repo and inside the 2,000-minute private allowance. I did not verify the repo's visibility.
- Pin the SHA in the commit message; the `github.io` mirror lags `main` (here by 6 weeks of other-file commits), so use raw `main` or an explicit SHA.

## Open items
- Count of defeated and retiring incumbents after 2026-11-03: not available yet.
- `<url>/contact` for the other 428 House members: not tested.
- Runner-IP behavior of `senators_cfm.xml`: only tested from a local machine.
- Whether the repo is public (Actions minutes).

## Sources
- `unitedstates/congress-legislators` raw files and commit history via GitHub API, read 2026-11-05: https://github.com/unitedstates/congress-legislators (commits for `legislators-current.yaml`, `legislators-district-offices.yaml`; "2024 Election Results" ce2c4664, 2025-01-04; README field docs; `scripts/house_contacts.py`, `senate_contacts.py`, `sweep.py`, `geocode_offices.py`, `contact_forms.py`).
- Offices file at commits ce2c4664, c9f7c34b, 6650fa54, 72526139 (2025-01-04, 01-22, 02-02, 03-05), raw.githubusercontent.com, 2026-11-05.
- House Clerk member data: https://clerk.house.gov/xml/lists/MemberData.xml (200, 2026-11-05); https://clerk.house.gov/xml/lists/unofficial-119-member-elect-data.xml (200, last-modified 2024-12-30); `unofficial-120-member-elect-data.xml` (404, 2026-11-05).
- Senate directory: https://www.senate.gov/general/contact_information/senators_cfm.xml (200, 2026-11-05); `https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00081.xml` (403).
- House sites sampled for `/contact`: aderholt, kelly, velazquez, adams, soto, trahan, youngkim, troycarter, burlison, fong, harrigan (`.house.gov`), 2026-11-05.
- FY2027 NDAA status: https://ndaa.ai/guides/fy2027-ndaa-status (updated 2026-10-01; read 2026-11-05).
- Pre-election House and Senate balance: https://political.org/explained/2026-midterm-elections/ (search snippet, 2026-11-05; no post-election results indexed).
- U.S. Constitution, 20th Amendment (terms end at noon on January 3), general knowledge, not fetched.
- `docs/research/data-ingestion.md` (2026-11-04), `worker/scripts/import-members.ts`, `data/members.csv`.
