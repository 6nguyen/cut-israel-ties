# What converts a visitor into a completed call, and a caller into a repeat caller
Researched: 2026-11-05 · Informs: [call-follow-through](../prd/call-follow-through.md)

## Summary
Evidence base is thin: no tool publishes completion, repeat or next-office rates. What exists is (a) 5 Calls office-level "unavailable"/voicemail figures from 2018 press, (b) turnout field experiments on plans and reminders, (c) vendor push/calendar facts. Ranked shortlist of levers not yet shipped:
1. **Voicemail/busy retry** on `no_answer`: "leave a message with your address, it counts" + one-tap new reminder at the next office-hours slot. Unmeasured. Device-only.
2. **Office-hours-aware timing**: show "open now / opens 9:00 ET" on `tel:` and move the reminder default off 17:00 local. Unmeasured (5 Calls: callers skew after hours). Device-only plus an hours field in `data/`.
3. **Next-office chain**: after a receipt for one target, a one-tap "Now call Sen. X" with the same script. Unmeasured; no published rate exists. Device-only.
4. **"One of N" echo** after the receipt, from the existing `/api/counts` line. Indirect evidence only (Hager 2022, already in the evidence base). Server (exists).
5. **Event-keyed "check back"**: per-goal Atom feed and a static webcal feed of decision dates. Unmeasured; $0; zero identifier kept. Device-only (static files).
6. **Web Push for installed PWAs / Android / desktop**, opt-in only after a receipt. Unmeasured for this audience; needs an endpoint table (server) and a sender Worker. Defer.
Rejected: streaks, email/SMS reminders, public receipt-first flows.

## 1. Funnel teardown
Observed 2026-11-05 unless noted. "Not shown" means the page I could fetch did not show it, not that it is absent.

| Tool | What I could verify |
|---|---|
| 5 Calls | After a call asks "answered / left voicemail / did not make the call" to track impact (Wikipedia, 5calls.org). Weekly newsletter "at most one email per week"; "5 Minute Midterms" weekly framing; dashboard of call counts by state and rep; >7M calls on homepage. React "outcome buttons" component in the repo. Streaks and in-app reminders: not mentioned. |
| Resistbot | Text/web/iOS; letters in ~2 min; SMS opt-out footer; election-day text reminders; site totals (56.8M letters, 10.2M "resisters"). Phone-number identity inherent. No call-retry or next-office flow seen. |
| Indivisible | Call-guide page 404'd; its VAN phonebank flow uses "Save & Next Call" (different product: staff-run phonebank, not constituent calls). |
| Action Network / Mobilize | Mobilize: automated email+SMS reminders, post-shift survey 1 h after, bring-a-friend (company claims 140k volunteers -> 640k extra signups, unaudited). Action Network post-action pages: not verified. Both need email/phone. |
| Capitol Call, CallMyCongress, Democracy.io | Domains did not resolve or page empty. Not verified. |
| JVP (Israel/Palestine) | `/take-action/` lists "Call Congress"/"Email Congress" per campaign plus a weekly newsletter; flow behind the link not shown. IMEU, Uncommitted, CAIR: nothing retrievable. |

| Pattern | Seen in | Needs accounts/email? | Device-only? | Verdict for this site |
|---|---|---|---|---|
| Outcome buttons after call (answered/voicemail/skipped) | 5 Calls | No (anonymous) | Yes for UI; server only to aggregate | Adapt: we have the office-response picker; add a voicemail/busy branch that drives a retry (see 4) |
| "Call next office" | 5 Calls issue pages list several targets; post-call chaining not verified | No | Yes | Adopt as lever 3 |
| Retry nudge for voicemail/busy | none verified | n/a | Yes (local reminder) | Adapt (lever 1); novel, so unmeasured |
| Weekly email | 5 Calls, Mobilize, JVP | Yes | No | Reject: no email list |
| Streaks | not found | No | Yes | Reject: no evidence; invites badge behaviour (see `behavioral-science-and-virality.md` §1, §5) |
| "Call again when X happens" alerts | none verified | Push/email | Partly | Adapt via feed/webcal (lever 5); push deferred (lever 6) |
| Impact copy "you were one of N" | Resistbot totals; 5 Calls counts | No | Counts need server | Adopt (lever 4); counts already thresholded and code-computed |
| Public share/badge right after action | Mobilize bring-a-friend | Yes | n/a | Reject as a first step (already private-first) |
| Reminder at commitment (.ics) | none of these tools | No | Yes | Already shipped (`commitment-funnel.md` §3) |
| Reflection prompt | none of these tools | No | Yes | Already shipped; Han 2016 is the support |

## 2. Evidence on completion and repeat rates
Measured (peer-reviewed or published experiment):
- **Plan-making.** Nickerson & Rogers 2010 (*Psych. Science*, N=287,228, 2008 US election): a phone script asking for a voting plan raised turnout 4.1 pts among people contacted; 9.1 pts in single-eligible-voter households; no effect in multi-voter households. Transfer risk: turnout, one day, a phone prompt, not a call to Congress.
- **Implementation intentions overall.** Gollwitzer & Sheeran 2006: d=0.65 over 94 tests. Sheeran, Listrom & Gollwitzer 2024 (642 tests) put the bias-corrected effect at d=0.35 (trim-and-fill) or d=0.15 (robust Bayesian, CI 0.08-0.22). Plan on small effects. The 0.65 figure is the old, uncorrected number.
- **Text reminders.** Dale & Strauss 2009 (N=8,053, 2006 election): +3.0 pts turnout from SMS reminders. Malhotra et al. 2011 replicated with cold texts and found the effect largest for habitual voters in low-salience elections (exact effect size not read). Norway 2015: +2.93 pts, intent-to-treat. All need a phone number.
- **Extra reminder after an automated one: nothing.** States Win/SDAN 2021 (293 RSVPs, one virtual event): extra personal text, 56.16% vs 55.78% attendance; people who *confirmed* attended significantly more (p<0.001). Suggests the confirm tap matters more than a second nudge.
- **Cold phone calls to turn out voters:** Gerber & Green 2000 (New Haven, ~30k): personal canvassing worked, mail slightly, commercial phone banks not at all. Relevant only as a warning that impersonal prompts fail; it is not about users calling Congress.
- **Not re-verified this session (from the prior evidence base, cited not re-fetched):** email reminders ~0 effect, relational asks +8 to +17 pts, reflection prompt (Han 2016); see `civic-action-levers/behavioral-science-and-virality.md` §2-3, §6.

Claims and operational facts (not experiments):
- 5 Calls (via The Outline, 2018, citing co-founder O'Neill's data): callers "tend to phone after business hours, when the phone often goes unanswered"; voicemail boxes are "listened and tallied daily"; they fill "often overnight" on big issues.
- A 2017 HuffPost explainer: voicemail often fills after ~100 messages, later callers get busy/"full"; the 5 Calls script tells callers to leave a street address or the call is not tallied. Most offices have 4-7 lines (explainer's estimate).
- CMF found individualized emails more influential than calls or form emails on undecided members (secondary summary only, original not read). Do not claim calls out-persuade email.

Not found anywhere: published A/B tests of script length, of best-time-to-call, of outcome logging on repeat calling, or of public counters on call completion. Treat all as unmeasured. Public counters: only the Hager et al. 2022 protest result in the base file (willingness, not calls).

## 3. Event-driven re-engagement without accounts
Reach figures for 2026 are vendor-sourced; treat as ranges.

| Channel | iOS | Android | Desktop | $0 infra on Cloudflare free | Identifier the server keeps | Consent friction |
|---|---|---|---|---|---|---|
| Web Push (service worker + VAPID) | Only for Home Screen web apps, iOS/iPadOS 16.4+ (WebKit blog); Declarative Web Push iOS 18.4+, still Home Screen apps only (Apple WWDC25 summaries) | Chrome etc. in browser | Chrome/Edge/Firefox; Safari 16+ | Workers free: 100k req/day, 10 ms CPU, 50 subrequests, 5 cron triggers. Sending needs a cron or on-event fan-out; encrypted payload signing in 10 ms is unproven here (my assessment; empty "tickle" push avoids payload encryption). Subscriptions fit D1 (not KV: KV free is 1,000 writes/day) | Push endpoint + p256dh + auth keys per browser: a persistent device identifier (web.dev) | Install to Home Screen on iOS, then OS prompt; one block is permanent |
| Browser Notifications API (page open only) | Same constraint | Works | Works | $0, nothing stored | None | Prompt, but only fires while a tab is open, so no true return trigger |
| Calendar subscription (webcal/.ics feed of decision dates) | Apple Calendar fetch 15-60 min | Google Calendar refresh ~12-24 h, not user-settable (vendor help pages; Google's own page not seen) | Same | Static file, $0 | None (a GET log only) | Tap "subscribe"; no prompt |
| One-shot .ics (shipped) | Works | Works | Works | $0, browser-built | None | One tap |
| RSS/Atom per goal | Needs a reader | Needs a reader | Needs a reader | Static, $0 | None | Highest (niche) |
| "Check back" deep link (copied into user's own group/notes) | Works | Works | Works | $0 | None | None |

Opt-in context (app push, not web push): iOS ~51-56% and Android ~81% (Airship 2021, Batch 2025); web push CTR vendor range 0.5-7.4% (Pushwoosh 2025). No separate PWA/iOS-web-push figure found. Expect iOS web reach to be small because it requires an install step.

Verdicts:
- Webcal feed of decision dates + "vote moved" notes: adopt (lever 5). Pair with a visible "last updated" line, since Google lags.
- Per-goal Atom feed: adapt only as a cheap static output; do not build UI.
- Web Push: adapt later, opt-in only after a receipt, never a landing prompt; the server then holds a device identifier, which cuts against "device hash only", so it needs a privacy-page change and a PRD.
- Notifications API: reject (no return trigger).
- Email/SMS: reject (accounts).

## 4. Voicemail and busy signals
- Published numbers are scarce and old. 5 Calls data via The Outline (2018): Sen. Cruz "unavailable" (no answer and mailbox full) 9% from early 2017 to early 2018, then 2%; average over all representatives 3%; Sen. Toomey's calls 90% went straight to voicemail, often full. So the share reaching voicemail is office-specific, from ~0 to ~90%. Nothing newer found; the CMF, Fireside, Quorum and Phone2Action searches returned no call-handling data.
- Guidance that exists: leave a message and include your street address (HuffPost 2017, 5 Calls script) so it is tallied; offices tally voicemail daily. Call the district office when DC lines are jammed and try again later (advice pattern in press; no single sourced tool script verified).
- Our gap: the office-response picker has `no_answer` but nothing happens after it. Today the commitment default is 17:00 local (`commitment-funnel.md` §1). A Pacific caller is then calling DC at 20:00 ET (after hours) unless they use the district office. I could not verify per-office hours; they need a sourced field.
- Verdicts: voicemail "counts, add your address" line on the act page: adopt (copy only, check wording against `doc_format`). Retry reminder on `no_answer`: adapt (lever 1). Show district office number first when the DC line is likely closed: adapt (needs hours data).

## 5. The "next office" chain
- No published rate for second/third-office calls was found for 5 Calls, Resistbot or any other tool. 5 Calls shows 236 completions/minute at peak (about 15% of one senator's total, O'Neill; he thinks the true share may be double) and 84,340 calls in four days on one drive; those are volume figures, not chaining rates. Resistbot's 2017 post (14,000 users with >25 messages, 3,800 with >50) is the only repeat-use number found, from early 2017, with no denominator, and the page is now gone (410), so it is cited via a secondary search summary.
- UI pattern evidence: the repo's "outcome buttons" and per-issue target lists suggest a list-and-tick design; actual post-call chaining not confirmed.
- Our site already holds rep + two senators per goal (`action-router.md` §7), so chaining is a link change: after a receipt, "Next: Sen. X" opens the same act page with `?target=`. Receipt limits (10/day/device, 10 min repeat per goal+action) already allow it.
- Interaction with the funnel: place the next-office link after the commitment line and captain list, before Share, so no public act precedes it. Verdict: adopt (lever 3), measure it.

## Verdicts, all patterns (no public first step; no accounts; no LLM numbers; $0)
| Pattern | Verdict | Why |
|---|---|---|
| Voicemail retry on no_answer | Adapt | Local reminder, no data leaves device |
| Office-hours timing | Adapt | Needs sourced hours rows; copy-only fallback |
| Next-office chain | Adopt | Targets already in hand |
| "One of N" echo | Adopt | Counter exists; code-computed, thresholded |
| Webcal decision-date feed | Adopt | Static, no identifier |
| Atom feed | Adapt | Cheap by-product of the same data |
| Web Push | Adapt later | Stores a device identifier; install friction on iOS |
| Browser notifications | Reject | No return trigger |
| Streaks | Reject | No evidence; badge risk |
| Weekly email / SMS | Reject | Needs accounts |
| Extra second reminder | Reject | SDAN 2021 null; confirm tap is the lever (already have "Done/Still on?") |
| Script length changes | Reject for now | No evidence either way |

## Ranked shortlist (full)
1. Voicemail/busy retry. What: on `no_answer`, "Leave a message with your address, it counts" and "Try again" with a new `.ics` at next open slot. Effect: unmeasured. Needs: office hours rows. Device-only.
2. Office-hours timing. What: change the reminder default and show open/closed on the call button. Effect: unmeasured; indirect support is the 5 Calls after-hours claim. Needs: hours per office (sourced). Device-only.
3. Next-office chain. What: one-tap next target after the private steps. Effect: unmeasured. Needs: nothing new. Device-only; instrument with the existing receipts count per device (no new identifier).
4. "One of N" echo after the receipt. Effect: unmeasured for calls. Needs: existing `/api/counts`. Server (exists).
5. Decision-date webcal feed. Effect: unmeasured. Needs: a static generated file per goal. Device-only subscribe.
6. Web Push for installed/Android/desktop. Effect: unmeasured; iOS reach low. Needs: endpoint table, VAPID secret, sender Worker/cron. Server.

## Sources
Observed 2026-11-05.
- https://en.wikipedia.org/wiki/5_Calls (outcome reporting, 700k calls in a week, Feb 2025)
- https://5calls.org (7M calls, newsletter, dashboard)
- https://github.com/5calls/5calls (README, outcome-buttons component)
- https://www.allrisenews.com/p/5calls-kilmar-reps (84,340 calls, 236/min, ~15% of Murkowski)
- https://theoutline.com/post/5758/were-sorry-your-senator-cannot-be-reached-at-this-time (Cruz 9%/2%, avg 3%, Toomey 90%, 2018)
- https://www.huffpost.com/entry/congress-phone-system-is-brokenbut-its-still-your_b_5894de92e4b0985224db54ee (mailbox ~100 messages, address in voicemail, 2017)
- https://resist.bot/ and https://en.wikipedia.org/wiki/Resistbot (totals, SMS)
- https://www.jewishvoiceforpeace.org/take-action/ (call/email tools, newsletter)
- https://marketing.wharton.upenn.edu/wp-content/uploads/2016/10/Do_You_Have_a_Voting_Plan.pdf and https://www.psychologicalscience.org/journals/psychological-science/0956797609359326/ (Nickerson & Rogers, via search summary)
- https://goalsandprogress.com/implementation-intentions-research/ (Sheeran 2024 figures, via search summary; primary paper not read)
- https://dash.harvard.edu/bitstream/handle/1/10471523/Rogers-TextMessages.pdf (Dale & Strauss, Malhotra et al., via search summary)
- https://link.springer.com/article/10.1007/s11109-019-09578-1 (Norway SMS, via search summary)
- https://isps.yale.edu/research/publications/isps00-001 (Gerber & Green 2000, via search summary)
- https://stateswin.org/research/you-dont-have-to-tell-me-twice-additional-text-message-reminders-for-confirming-volunteer-attendance/ (SDAN 2021)
- https://join.mobilize.us/blog/four-key-2022-mobilize-trends/ and https://help.mobilize.us/en/articles/2769797-use-the-post-shift-follow-up-survey-to-collect-attendance-and-feedback-about-your-event (via search summary)
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (iOS 16.4, Home Screen only)
- https://developer.apple.com/videos/play/wwdc2025/235/ and https://aimtell.com/blog/state-of-declarative-web-push-2026 (iOS 18.4, vendor blog)
- https://web.dev/articles/push-notifications-subscribing-a-user (endpoint/keys, VAPID, permission)
- https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/d1/platform/limits/ and https://developers.cloudflare.com/kv/platform/limits (free-tier limits; KV via search summary)
- https://www.pushwoosh.com/blog/push-notification-benchmarks/ and https://batch.com/blog/case-studies/benchmark-notifications-push-crm-mobile (vendor benchmarks, search summary)
- https://nocal.app/help/ics-and-subscriptions/why-subscribed-calendars-dont-update-instantly and https://usecarly.com/blog/google-calendar-ics-refresh-rate/ (calendar refresh, vendor pages)
