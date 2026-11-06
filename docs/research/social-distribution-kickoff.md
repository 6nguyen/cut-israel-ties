# Social distribution kickoff: a stitch-based account with no ties to the maintainers
Researched: 2026-11-06 · Informs: none yet

## Question
The site is live at cutthetiesmovement.org with no traffic source. The plan is
a short-form account that stitches viral videos about the cause and cuts to
"find the easiest action on the site". The maintainers' own accounts (8.6k,
and a family of 1M+ accounts on three platforms) cannot be linked to it. Which
platform first, what format, how to keep the account unlinked, what the
platform rules allow, and what the site needs so the traffic can be measured.

## Findings

### 1. Platform order: Instagram first, YouTube Shorts second, TikTok third
- **Instagram Reels.** Remix is on by default for every public account's reels
  (Help Center); a creator must opt out. Political recommendations were
  restored in January 2025 with a three-level control whose default is
  "standard", so a new political account can reach non-followers again
  (Engadget). A bio link needs no follower threshold. Trial Reels show a reel
  only to non-followers for 24–72 h, which is exactly the test a new account
  needs; Meta's own figure is 80% of users seeing more non-follower reach
  (vendor-relayed, unverified). The post-midterm "call Jeffries and Schumer"
  reels already catalogued in `leader-call-scripts.md` live here.
- **YouTube Shorts.** Collab (side by side), Green Screen and Cut exist for
  Shorts; all public videos are remixable by default and creators cannot opt
  out, but visual remix is blocked on Content-ID-claimed videos
  (third-party checker, verify per clip). Shorts keep surfacing for months and
  carry a clickable description link from day one.
- **TikTok.** Stitch works only on videos whose creator left Stitch on. A
  personal account needs 1,000 followers for a clickable bio link; a business
  account gets the link at once but loses most music. Since the US joint
  venture closed on 2026-01-22 (Oracle manages the algorithm, retrained on US
  data) there are repeated, unconfirmed reports of Palestine content marked
  "ineligible for recommendation" and of creators' reach falling (Truthout,
  CBC, Middle East Online); TikTok says the glitches were infrastructure.
  No independent audit exists. Treat TikTok as a cross-post, not the base.
- Vendor comparisons still call TikTok the fastest 0→100k ramp and Instagram
  the slowest; none has data for commentary or stitch accounts specifically.

### 2. Format: the viral clip is the hook, the site is the payoff
- Nothing published isolates stitch performance. What the guides agree on,
  without cited tests: the 1-second and 3-second hold rates decide
  distribution, and commentary stitches ("here is what to do about it") beat
  plain reaction stitches.
- Stitch/Remix 3–5 s of the viral clip, then cut to a screen recording of the
  site: address → two cards → the call page, under 20 s total, with the vote
  named on screen (NDAA §219/224, the December Senate leader vote, the 2028
  MOU). Caption and end card spell out the domain because TikTok has no link.
- Faceless and voiceless by design (see §4): captions plus a trending sound,
  or an AI voiceover. TikTok's 2026 AI-content rules require a label on
  synthetic voice; label it everywhere.
- Repo rule applies to the ask: the CTA is the private action (find your two
  actions, make the call), never "duet this" or "post your badge"
  (`civic-action-levers/behavioral-science-and-virality.md` §5).

### 3. What to stitch first (seed list)
- The five post-midterm reels in `leader-call-scripts.md` (kateglavan,
  vance.b.nyc, slarrrry, hear_me_out_on_this, oh_mellnawww).
- The El-Sayed victory-speech cuts (19–24M views on TikTok) and the "AIPAC
  lost" cycle (`social-platform-trends.md` §1).
- Khanna on §219 and Massie's strip effort; Track AIPAC card posts (the
  dominant visual grammar on Instagram; contested methodology, so cite the
  vote, not the dollar figure).
- Rule: stitch only where the platform's remix feature is enabled on the
  source; otherwise a green-screen commentary cut (fair use for commentary,
  but no platform licence, so expect the odd takedown).

### 4. Keeping the account unlinked (legitimate pseudonymous advocacy)
- Run it as the project's account ("Cut the Ties", bio: volunteer-run, not a
  campaign), not a fake person. Platforms allow pseudonymous accounts; what
  they forbid is multiple accounts used to deceive.
- Separation signals the platforms document: contact sync (phone/email
  matches), mutual follows, "linked social accounts", and on Instagram the
  Accounts Center prompt that appears when Facebook is logged in on the same
  device. So: own email and own number, contact sync off, "suggest your
  account to others" off, never signed in beside a personal account in the
  same app, no follows from any family account, no shared Accounts Center.
  Device/IP fingerprinting is claimed by multi-account vendors and
  undocumented by platforms; a separate device is cheap insurance.
- No face, no real voice: 8.6k followers recognise both.
- No paid boosting. Meta's social-issue ads require government ID and a
  "Paid for by" disclaimer; TikTok bans political ads outright. Organic only
  until there is a registered entity willing to be named.
- Why this matters beyond platform mechanics: Canary Mission and allied
  sites dox Palestine advocates and the US government has used those
  dossiers (Al Jazeera, Drop Site). Anonymity is the normal posture here.

### 5. What the site lacks for this
- No analytics or UTM handling in `web/src` today. The $0 budget fits
  Cloudflare Web Analytics (cookieless, free) plus one short redirect path per
  platform (`/ig`, `/yt`, `/tt`) that appends `utm_source`, so receipts can be
  attributed without touching the privacy page's promises.

### 6. Search and AI answers (Google AI Overviews, AI Mode, ChatGPT, Perplexity)
- Google's own AI-search guide: AI Overviews and AI Mode draw on the core
  ranking systems; no extra eligibility beyond indexed and snippet-eligible;
  llms.txt, chunking and AI-specific rewriting are listed as things to skip.
  AI clicks are counted inside the normal "Web" bucket in Search Console.
- Independent (vendor) citation studies disagree on numbers but agree on
  shape: most AI Overview citations come from pages already in the top 10–20
  organic results; YouTube is the most-cited domain in AI Overviews; Reddit is
  the most-cited domain across ChatGPT Search, AI Mode and Perplexity
  (Semrush, 325k prompts, Jan–Feb 2026); Wikipedia leads for ChatGPT; AI Mode
  cites a brand's own site about twice as often as AI Overviews does. Only
  ~11% of domains are cited by both ChatGPT and Perplexity, so each engine is
  its own channel.
- Demand check (Nov 2026 SERPs): "call your representative Israel aid script"
  is held by Action Network call pages (Block the Bombs, Reject U.S.-Israeli
  Military Integration), CodePink, NIAC and congregations on the other side.
  "NDAA section 219" is held by Truthout, Common Dreams, Fox, AJC and
  Substack explainers. "Does my representative support military aid to
  Israel" has **no lookup tool ranking**; results are news on the July 2026
  Massie amendment (314–103) and Demand Progress thank/shame pages. That gap
  is ours: 535 member pages already exist.
- Site audit today (live): robots and a 555-URL sitemap are in place; home
  page has title, description, OG card. Gaps: sitemap URLs lack the trailing
  slash the site 308-redirects to; goal pages reuse the title as description;
  member pages read "Name on <goal title>" with "unknown" positions, so they
  neither match the query language ("voting record", "Israel aid",
  "Section 219") nor carry a sourced fact to be extracted; no JSON-LD
  (Person/GovernmentOfficial, FAQPage, HowTo); no Search Console or Bing
  verification tag; no analytics.

### 7. Trending mechanics and hashtags (what is documented, Nov 2026)
- **Instagram.** Hashtags are capped at five per post since 2025-12-19 and
  Mosseri says they classify, not boost. Ranking signals he named: watch
  time, likes per reach, sends per reach; sends drive non-follower reach.
  Search matches captions, bios, usernames; keywords belong in the caption,
  not the first comment. `#aipac` shows 295K reels logged-out; `#callyourreps`
  and `#freepalestine` are behind the login wall (counts unknown).
- **TikTok.** Search reads caption, on-screen text and spoken words; put the
  keyword on screen in the first 3 s. One or two hashtags do the work, five is
  the ceiling worth using. Creative Center trending hashtags/sounds need a
  login (public view shows commercial tags only). Public `/tag/` pages return
  an empty shell to fetchers, so hashtag counts must be read in-app.
- **No published evidence** that any specific hashtag set lifts reach in this
  niche; the only measured counts are in `social-platform-trends.md`
  (`#aipac` 295K reels, `#trackaipac` 1.7K, TikTok call-your-rep-palestine
  ~20K posts). Hashtag "shadowban" claims for `#freepalestine` are anecdotal.
- Working set to test, then prune by follow rate: 2 issue tags
  (`#aipac`, `#ndaa` or `#freepalestine`), 1 action tag (`#callyourreps` /
  `#callcongress`), 1 member or vote tag (`#schumer`, `#jeffries`,
  `#section219`), 1 locality tag when the clip is local. Caption carries the
  spoken keywords ("call your senator", "Israel aid vote", the member's name).
- Trending audio: use the in-app arrow (Instagram) or Creative Center
  (TikTok) on the day; a stitched clip already carries the source's audio, so
  trending sound only matters for the screen-recording half.

### 8. Outreach to large accounts (who, what to offer, how)

Three tiers, by what they can actually do for the site. Follower counts are
the latest published figures, not today's; read the live number in-app.

**Tier 1: action-tool and watchdog accounts (link partners, ask first).**
- Track AIPAC (`@trackaipac`; ~137k Instagram followers when Instagram
  suspended it for "trademark" reasons on 2026-02-10, restored days later;
  founders Cory Archibald and Casey Kennedy, parent Citizens Against AIPAC
  Corruption). Its anti-endorsement cards are the most reposted artefact of
  the cycle (The Intercept, 2026-03-26). It has a ZIP lookup of donors, no
  vote lookup and no call script. Contact form at trackaipac.com/about/contact,
  press at /about/press. Offer: our member page as the "what did they vote"
  link under their card; their donor data as the "who funds them" link on
  ours.
- Win Without War (act.winwithoutwar.org/sign/house-section219), Demand
  Progress, CodePink, CAIR, PDA, FCNL: their Section 219 pages are petitions
  and email sign-ons with no call script and no member lookup. Offer: the
  per-member call page as the "then call" step after their sign-on. These
  are staffed orgs with press emails; outreach by email from the project
  address, not DM.
- 5 Calls and Resistbot (37k Instagram; 50M letters) are tools, not
  amplifiers. Resistbot's own history says growth came from press and
  partner pushes (Medium's net-neutrality letters, Nov 2017), not from
  Instagram shares.

**Tier 2: mass-reach infographic and news accounts (reposts, low odds).**
- CHNGE (`@chnge`, ~2M Instagram) is a for-profit clothing brand founded by
  Jacob Castaldi, whose agency Contagious Creative also ran `@feminist`
  (~5–6.5M), `@march`, `@itsfeminism` and others; 2020–21 reporting (Revival
  Zine, BNNVARA, Norwich Radical, Fordham Observer) found the network
  promoted the brand without disclosure and mostly reposts other people's
  content. Reach is real; it is a brand's marketing channel. A DM is cheap
  but a share would arrive as that brand's content, with their link, and
  the account does not reliably link out to third-party tools.
- So Informed (`@so.informed`, 3.1M+ in 2024; founder Jess Natale, Webby
  2026 winner, News & Politics) posts explainers and has taken an explicit
  Palestine position (Middle East Eye, 2024). The closest fit of the big
  infographic accounts to a "here is how to call" carousel.
- Eye on Palestine (`@eye.on.palestine`, 6–7M; volunteer-run, no public
  contact) and Let's Talk Palestine (~300k) are documentation and education
  accounts, not US-action accounts; a US call tool is off-topic for their
  feed.
- Video creators who already make call-your-rep content: the four named
  reel authors in [leader-call-scripts](leader-call-scripts.md) (kateglavan,
  vance.b.nyc, slarrrry, hear_me_out_on_this), Guy Christensen (3M+ TikTok,
  now pushing followers to UpScrolled; 419k Instagram) and the Zeteo /
  Mehdi Hasan orbit. The reel authors are mid-size and reply to DMs; the
  large ones answer email in the bio or nothing.

**Tier 3: the member-adjacent accounts.** Khanna, Massie, Tlaib, Omar,
AOC and El-Sayed campaign accounts post the vote themselves. They will not
link a third-party tool, but a reel that quotes their clip and ends on the
member page is remixable by their followers, which is the stitch plan.

**What to offer (same package to everyone).**
- One sentence: "a ZIP lookup that shows your member's recorded vote on
  Section 219 and the Massie amendment, with a 30-second call script."
- Ready-to-post assets: a 7-slide carousel and a 15-second screen recording,
  no watermark, their handle allowed as co-author.
- An Instagram Collab invite (up to three co-authors on a feed post,
  carousel or reel; content appears on every co-author's grid and reaches
  each audience, per Instagram's 2023 creator post; vendor guides claim
  five in 2026). A Collab from one Tier 1 account is worth more than a
  repost: the post lives on their profile.
- Reciprocity where it is cheap: their petition or donor lookup linked from
  the member page's "more" row.

**How to reach out.** Email from the project address for staffed orgs, DM
for creators; under four sentences, one ask, personalised to a specific
post of theirs (the vendor benchmarks: ~5–10% reply for 100k–1M accounts,
2–5% above 1M, roughly 4x better personalised than templated). Send the
asset, not a request to make one. Follow up once after a week. No paid
shoutouts: Instagram's branded-content rules bar social-issue partnership
ads and X bans commercial political partnerships; a paid post from a
pseudonymous account also creates a money trail.

**Sequence.** Outreach before there is anything to show is wasted. Ship
analytics, the member-page vote line and the carousel first; send Tier 1
in week 1 (they gain a tool they lack), Tier 2 after the first reel clears
50k non-follower reach so the DM can cite a number. Owner of the outbox is
the project account, never a personal one.

## Kickoff plan (first 30 days)
1. Week 0: new email + number, Instagram + YouTube + TikTok accounts on a
   separate device, bio and link set, analytics and redirect paths shipped.
2. Week 1: 7 reels from the seed list, each as a Trial Reel first; cross-post
   to Shorts and TikTok the same day; video-reply to every substantive
   comment (free second hook).
3. Weeks 2–4: one a day; keep the two formats that clear the best follow
   rate and site click-through; drop the rest. Watch non-follower reach per
   platform, not views.
4. Decision gate at day 30: if TikTok reach per post is under a third of
   Instagram's, stop posting there except for cross-posts.
5. Search track, in parallel: Search Console + Bing Webmaster verification,
   sitemap trailing-slash fix, member-page titles and descriptions rewritten
   to the query language with one sourced vote per member (the July 2026
   Massie amendment roll call), per-goal descriptions, JSON-LD, one
   question-titled explainer per goal ("What is NDAA Section 219?"),
   question-titled YouTube Shorts, and answers (not link drops) in the
   Reddit threads that ask how to contact a member about these votes.
6. Outreach track: week 1 email Track AIPAC, Win Without War, Demand
   Progress and CodePink with the carousel and a Collab offer; week 3 DM the
   four reel authors and So Informed once a reel has a reach number to cite;
   CHNGE last, as a repost ask with no expectation.

## Sources
- Google AI-search guidance — https://www.searchenginejournal.com/googles-new-ai-search-guide-calls-aeo-and-geo-still-seo/575026/ ; llms.txt — https://www.searchenginejournal.com/googles-says-its-fine-to-use-llms-txt-for-ai-seo/579608/
- Citation studies — https://ahrefs.com/blog/top-10-most-cited-domains-ai-assistants ; https://docs.peec.ai/research/most-cited-domains-by-engine ; https://www.emarketer.com/chart/c/368764/reddit-top-cited-domain-across-chatgpt-search-google-ai-mode-perplexity-368764 ; https://llmpulse.ai/blog/how-to-rank-in-google-ai-overviews/
- Instagram five-hashtag cap — https://www.businesstoday.in/technology/news/story/no-more-hashtag-stuffing-instagram-limits-hashtag-usage-to-just-5-per-reel-and-post-507444-2025-12-19 ; ranking signals — https://blog.hootsuite.com/instagram-algorithm/ ; https://metricool.com/instagram-reels-guide/
- TikTok SEO — https://metricool.com/tiktok-seo/ ; https://sproutsocial.com/insights/tiktok-seo/
- Competing SERP pages — https://actionnetwork.org/call_campaigns/call-congress-reject-us-israeli-military-integration ; https://actionnetwork.org/call_campaigns/82414f305ca8c940e993834c2d6f6208 ; https://bergerposts.substack.com/p/understanding-section-219 ; https://modernaction.io/briefing/house-vote-to-end-israel-aid-divides-democrats-with-103-voti-c182d431
- Instagram remix defaults — https://help.instagram.com/792438641600810
- Instagram account suggestions — https://help.instagram.com/iphone-app/559653651833249 ; Meta suggested-accounts system — https://transparency.meta.com/features/explaining-ranking/ig-suggested-accounts/
- Political content recommendations restored (Jan 2025) — https://www.engadget.com/social-media/threads-and-instagram-will-recommend-political-content-after-all-232343107.html ; earlier limit — https://time.com/6960587/meta-instagram-political-content-limit-off-setting-default/
- Trial Reels — https://techcrunch.com/2024/12/10/instagram-rolls-out-trial-reels-that-arent-shown-to-a-creators-followers ; https://publer.com/blog/instagram-trial-reels-guide/
- YouTube Shorts Collab/Green Screen/Cut — https://www.engadget.com/youtube-shorts-now-lets-you-chop-up-and-remix-music-videos-180655627.html ; https://www.lindseygamble.com/blog/youtub-launches-collab-feature ; remix checker — https://www.collabpals.com/tools/youtube-shorts-remix-checker
- TikTok Stitch — https://www.lilachbullock.com/how-to-stitch-on-tiktok/ ; contact sync and suggestions — https://www.tiktok.com/privacy/blog/contact-synching-findfriends/en ; bio link rule — https://stan.store/blog/tiktok-link-bio-requirements-2026-guide/ ; branded-content/political ads — https://www.tiktok.com/legal/page/global/bc-policy/en ; AI labels — https://www.auditsocials.com/blog/tiktok-ai-content-disclosure-rules-2026
- TikTok US joint venture — https://www.marketingdive.com/news/tiktok-confirms-joint-venture-to-comply-with-us-law/810329/ ; throttling reports — https://truthout.org/articles/tiktok-takes-down-gaza-journalist-bisan-owdas-account-mere-days-after-us-deal/ ; https://www.cbc.ca/news/world/upscrolled-app-tiktok-users-downloading-censorship-9.7073441 ; https://middle-east-online.com/en/us-ownership-tiktok-leads-bans-palestinian-influencers-journalists ; https://theintercept.com/2025/12/21/tiktok-ellison-oracle-israel-gaza/
- Meta social-issue ad authorization — https://transparency.meta.com/en-us/policies/ad-standards/SIEP-advertising/SIEP
- Platform comparisons (vendor) — https://fliki.ai/blog/youtube-shorts-vs-tiktok-vs-instagram-reels ; https://www.viralfinder.ai/blog/tiktok-vs-youtube-shorts-vs-instagram-reels-2026 ; hooks — https://hypenest.ai/blogs/tiktok-algorithm-2026-video-hooks-retention
- Track AIPAC suspension and reach — https://www.middleeastmonitor.com/20260211-instagram-suspends-track-aipac-watchdog-tracking-pro-israel-lobby-spending/ ; https://theintercept.com/2026/03/26/track-aipac-midterms-2026-israel-palestine/ ; site — https://trackaipac.com/
- CHNGE / Contagious Creative network — https://therevivalzine.com/2020/10/26/the-truth-behind-instagram-account-feminist/ ; https://www.bnnvara.nl/artikelen/hoe-kwalijk-is-de-dubbele-agenda-van-het-instagramaccount-feminist ; https://thenorwichradical.com/2021/01/31/the-problem-with-feminist-instagram/ ; https://fordhamobserver.com/60345/opinions/capitalizing-on-conflict-the-monetization-of-advocacy ; https://medium.com/instasleuth/how-the-businessmen-behind-chnge-fake-feminism-for-profit-bf0689adc26f
- So Informed — https://www.middleeasteye.net/news/jess-natale-so-informed-instagram-pro-palestine ; https://winners.webbyawards.com/2026/creators/individual-creator/news-politics/382174/so-informed ; Eye on Palestine — https://www.trtworld.com/magazine/how-the-internet-s-leading-account-on-palestine-maintains-its-message-53741 ; Guy Christensen — https://www.jta.org/2025/05/23/united-states/guy-christensen-pro-palestinian-tiktoker-with-3-4-million-followers-endorses-murder-of-israeli-embassy-employees
- Section 219 org pages — https://act.winwithoutwar.org/sign/house-section219/ ; https://www.commondreams.org/news/house-passes-ndaa-with-section-219
- Instagram Collab — https://creators.instagram.com/blog/new-ways-to-create-with-music-and-collaborate-on-instagram ; https://skedsocial.com/en-au/blog/instagram-collaboration-feature ; branded-content eligibility — https://help.instagram.com/ipad-app/1372533836927082
- Outreach benchmarks (vendor) — https://influenceflow.io/resources/influencer-outreach-best-practices-a-2026-strategic-guide ; https://starngage.pro/blog/email-vs-dm-vs-creator-marketplaces-analyzing-outreach-response-rates-for-maximum-campaign-success
- Resistbot growth — https://en.wikipedia.org/wiki/Resistbot ; https://www.instagram.com/resistbot/
- Doxxing context — https://www.aljazeera.com/news/2025/7/11/canary-mission-how-us-uses-a-hate-group-to-target-palestine-advocates ; https://www.dropsitenews.com/p/canary-mission-blacknest-doxxing-israel-potestors-united-states
