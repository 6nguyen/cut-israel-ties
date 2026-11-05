# District counters

## Purpose
Shows a visitor that other people in their own district (or state) have
acted on a goal this week, so the result cards, goal target lists and
member pages carry social proof instead of silence. Every number is a
`COUNT` over `receipts` rows computed by code; the server hides small
numbers so the line never says "nobody is acting". It stops at counts:
no per-user history, no leaderboard, no national total, no real-time
updates.

## Behavior
1. **Counts endpoint.** `GET /api/counts?goal=<slug>&state=XX&district=N`
   returns `{district: {calls, letters, comments, captain_lists}, state:
   {…}, since}` for the goal's receipts created in the last 7 days
   (`since` is now − 7 days, ISO). `calls`, `letters` and `comments`
   follow the receipt's action `type` (`call`, `letter`,
   `public_comment`); `captain_lists` counts receipts with `kind
   'captain-list'`. The `district` buckets cover receipts whose `state`
   and `district` match; the `state` buckets cover every receipt in the
   state, the district included. `district` is optional (a senator's page
   sends none) and then the district buckets are all 0.
2. **Threshold.** Any bucket below `COUNT_THRESHOLD` (Worker var, default
   5; a non-positive or non-numeric value falls back to 5) is returned as
   0, bucket by bucket, so the response never carries a number between 1
   and threshold − 1 and summing buckets cannot leak a small count.
3. **Cache.** The response carries `Cache-Control: public, max-age=300`;
   the edge serves repeats within five minutes. The endpoint only reads.
4. **Errors.** A missing or unknown goal is 404 `no_goal`; a missing or
   malformed state is 400 `missing`. A malformed district is treated as
   absent.
5. **Counter line.** The `Counts` island renders one line under a target
   list: "12 constituents in TX-35 called this week" when any district
   bucket is non-zero, else "12 constituents in Texas called this week"
   when any state bucket is, else nothing. The number and verb come from
   the largest bucket in that scope (`called` / `wrote` / `commented` /
   `organised`; ties go to the earlier bucket in that order). At-large
   districts read "VT at large".
6. **Where it shows.** Under the targets box on each `/results` card,
   under the "Your targets" list on `/goals/<slug>` (only when the list
   has targets) and in each goal block on `/m/<bioguide_id>`, which passes
   the member's own state and, for a representative, district.
7. **Nothing before the response.** The island fetches once per mount and
   renders no placeholder, no "0" and no error; a failed or empty response
   leaves the page as it was.
8. **Receipt limits.** `POST /api/receipt` refuses, with 429 and without
   storing the row: the 11th receipt from one device hash in 24 h
   (`limit_day`), a second receipt for the same device, goal and action
   (or captain list) within 10 minutes (`limit_repeat`), and the 51st
   receipt from one IP hash in 24 h (`limit_ip`). Both windows are closed
   on the older edge (a row exactly 24 h or 10 min old still counts). The
   generation limits in `personalised-documents.md` are unchanged.
9. **IP hash.** Each stored receipt carries `ip_hash` = SHA-256 of
   `<CF-Connecting-IP>|<IP_SALT>|<UTC date>`, so one day's hashes cannot be
   joined with another's and the IP itself is never stored. Without the
   `IP_SALT` secret the salt is empty, the date alone rotates the hash and
   the Worker logs one warning per isolate.

## Data & contracts
- `worker/src/counts.ts`: `COUNT_WINDOW_DAYS` 7, `DEFAULT_COUNT_THRESHOLD`
  5, `COUNT_CACHE_SECONDS` 300, `bucketOf(kind, type)`,
  `applyThreshold(buckets, threshold)`, `thresholdFrom(env)`,
  `counts(repo, goalId, state, district, now, threshold)`,
  `RECEIPT_LIMITS` `{device_day: 10, repeat_minutes: 10, ip_day: 50}`,
  `receiptIpHash(ip, salt, now)`.
- `Repo.countReceipts(goalId, state, district, sinceIso)` → `{district,
  state}` raw buckets. D1 runs one `SELECT … COUNT(*) … GROUP BY
  in_district, kind, type` joined to `actions`; `foldBuckets` sums the
  rows. The in-memory repo filters the array the same way.
- `Repo.receiptLimitCounts(deviceHash, ipHash, goalId, actionId, kind,
  now)` → `{device_day, repeat, ip_day}` in one read.
- `receipts` (`worker/schema.sql`): `ip_hash TEXT` nullable (old rows
  null); indexes `receipts_goal_place (goal_id, state, district,
  created_at)`, `receipts_device (device_hash, created_at)`,
  `receipts_ip (ip_hash, created_at)`.
- Config: `COUNT_THRESHOLD` (Worker var, `wrangler.jsonc`), `IP_SALT`
  (Worker secret); both in `.env.example` and `deployment.md`.
- Client: `web/src/components/Counts.tsx` exports `counterLine(response,
  state, district)` and the default island `<Counts goal state
  district>`; used by `Results.tsx`, `GoalTargets.tsx` and
  `web/src/pages/m/[id].astro`.

## Invariants (regression checklist)
- [ ] With 4 receipts in a district the endpoint returns 0 for it and the
      page shows nothing; with 5 it returns 5 and the line appears.
- [ ] No response ever carries a bucket value between 1 and threshold − 1.
- [ ] The 11th receipt from one device in a day, a repeat within 10
      minutes and the 51st from one IP hash are 429 and not stored; the
      counts do not move.
- [ ] `receipts` rows hold a hash, never an IP; the hash differs across
      UTC days for the same IP.
- [ ] Every number on a page equals a `COUNT` over `receipts`; no LLM is
      involved anywhere in this capability.
- [ ] `/api/counts` carries `Cache-Control: public, max-age=300`.
- [ ] The line never shows "0", a placeholder or a spinner.

## Performance budget
Results page ≤100 KB transferred (measured 21.9 KB gzip after this
change; the `Counts` chunk is 1.1 KB); the counts request adds ≤1 KB;
`/api/counts` ≤300 ms p95 on 10k receipts (one indexed GROUP BY); infra
cost unchanged at $0/month.
