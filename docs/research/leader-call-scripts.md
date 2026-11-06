# Leader call scripts: what the viral "call Jeffries and Schumer" reels tell callers
Researched: 2026-11-06 · Informs: [leader-call-scripts](../prd/archive/2026-11-leader-call-scripts.md)

## Question
Five Instagram reels posted after the 2026-11-03 midterms tell viewers to
call House and Senate Democrats about the leadership votes and name Hakeem
Jeffries and Chuck Schumer. What do they tell callers to say and do, which
of those lines belong in our call scripts for the `house-caucus` and
`senate-leader` goals, and how do we turn them into templates that combine
in hundreds of ways with the caller's own lines?

## Sources
| Reel | Account | Length | Obtained |
|---|---|---|---|
| instagram.com/reel/DfXjFYwzhfB | kateglavan | ~310 words spoken | transcript, whisper large-v3-turbo from the public embed |
| instagram.com/reel/DfX6zqsJvU2 | vance.b.nyc | ~200 words | transcript, same path |
| instagram.com/reel/DfVtps3A3hH | slarrrry | ~370 words | transcript, same path |
| instagram.com/reel/DfVy3zAjYF3 | hear_me_out_on_this | ~340 words | transcript, same path |
| instagram.com/reel/DfVy6W8N_oh | oh_mellnawww | — | not obtained: age-gated behind login, no public caption |

Method: `GET /reel/<id>/embed/captioned/` (no login, no cookies) carries
the caption and the video URL for four of the five; audio was transcribed
locally. The transcripts are third-party speech and are not reproduced
here or in `data/`; the talking points below are paraphrased, and every
template line in the PRD is original text.

## What the reels say (paraphrased, deduplicated)
1. **Timing.** The leadership votes are imminent and happen once; the
   window to influence a member is days to weeks, not months. Incoming
   members' votes count as much as anyone's.
2. **Mandate framing.** The midterm result is read as a mandate for change;
   re-electing the same leaders without conditions wastes it.
3. **Call, do not sign.** Petitions are discounted by offices; a phone
   call is logged and counted. The Capitol switchboard reaches any office;
   voicemail counts; call the district office too; call again tomorrow and
   next week.
4. **Why the leader, not just the member.** The leader sets the floor
   agenda and the whip; the Speaker is third in line; one leadership vote
   is worth more than any single seat.
5. **Money.** The leaders' positions on Israel are attributed to donor and
   lobby influence; callers are told to say the commitment should come
   from constituents.
6. **For the leaders' own constituents** (NY-8, New York): ask the member
   to make the commitment publicly or not seek the job.
7. **Closers.** Ask the staffer to log the call and the member's answer;
   say you will call again; ask for a yes or a no.
8. Also present, out of scope for this product: insults aimed at the two
   leaders, calls for impeachment, Iran, Medicare for All, and conspiracy
   framing of the donor point.

## Verdicts
| Pattern | Verdict | Why |
|---|---|---|
| Timing and once-only framing (1) | Adopt | Matches the goals' decision windows; becomes `context` blocks |
| Mandate framing (2) | Adopt, one block | A caller's opinion, stated as such, no numbers |
| Call-not-petition, repeat calls, district office (3) | Adopt as closers | The product already routes to the DC and district numbers and offers retry (`call-follow-through`) |
| Leader-power framing (4) | Adopt, no digits | "Third in line" and seat counts would fail the digit check; written without numbers |
| Donor point (5) | Adapt | One civil block: the commitment should come from constituents, not campaign funders; no names, no amounts |
| Self-constituent ask (6) | Adopt, conditioned on the target | Only when the target is the incumbent leader (`J000294`, `S000148`); the civil form is "commit in public or step aside" |
| Closers (7) | Adopt | Already the register the output check expects |
| Insults, unrelated demands, conspiracy framing (8) | Reject | Output check blocklist and the civil-tone rule; off-goal asks dilute the whip count |

## Design consequence
A single `standard_template` per action gives every staffer the same
script. Reusable blocks per slot (opener, context, two arguments, the
caller's why, a chamber- and target-aware ask, a closer), chosen by a
seeded random pick and filled with the caller's fields, give over ten
thousand distinct scripts per target while every one still passes the
deterministic output check. The same composed script seeds the model
draft when a key is configured, so personalised drafts inherit the
talking points too. Decided in the PRD above.
