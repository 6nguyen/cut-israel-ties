# UI design brief and Google Stitch prompts for the action router
Researched: 2026-11-04 · Informs: [docs/prd/action-router.md](../prd/action-router.md)

Design proposal for the look and feel of the site in
`docs/prd/action-router.md`, written as prompts for Google Stitch so the
owner can generate the style guide first and each page after it. Decisions
taken from these screens are logged in the PRD under `## Changes`; this
file is not edited after that.

## Tool choice
| Tool | Verdict | Why |
|---|---|---|
| Google Stitch (stitch.withgoogle.com) | adopt | Free with a Google account; text or sketch → web screens; exports HTML + Tailwind, which drops into the Astro + Tailwind frontend the PRD names; keeps one style across screens in a project; Figma export for hand edits. |
| v0 (Vercel) | reject | Free tier is small and output is React/Next, which the stack does not use. |
| Figma Make / Figma free | adapt | Use only to touch up a Stitch export; drawing from zero costs more time than the prompts below. |

How to work in Stitch:
1. One project, **Web** mode. Run Prompt 0 first; it produces the style
   guide screen. Keep it open and tell every later prompt to match it
   (each prompt below starts with that line).
2. One screen per prompt. Refine in the chat on that screen ("make the
   address field the only input above the fold") rather than re-running.
3. Desktop first, then ask Stitch for the mobile variant of each screen
   ("same screen at 390 px wide"). Most traffic arrives from TikTok and
   Instagram links on phones.
4. Export HTML + Tailwind per screen into `design/stitch/<screen>/` in the
   repo (added when the frontend scaffold lands); the build never reads
   it, agents do.

## Design principles (the owner's brief, made testable)
- **One thing per screen.** Each page has one headline, one primary
  button and at most one secondary link. No sidebars, no carousels.
- **Image carries the feeling, text carries the ask.** Every goal and
  every action has one full-bleed image behind a short headline; the ask
  is plain words under it. Images are never decorative stock; each is
  tied to the decision (the Capitol for a floor vote, the Senate chamber
  for the leader vote, a state treasury building for bonds, a person on a
  phone for a call).
- **Calm, not alarmed.** Dark overlays and large type, not red banners
  and sirens. The site should read as credible to a congressional staffer
  who follows a link.
- **Counts only when real.** No fake progress bars. Dates and names are
  the only numbers on v1 screens.
- **Phone-first.** Address field, two cards and a button fit in one
  phone viewport.

## Image sourcing (free, licence-safe)
| Need | Source | Licence |
|---|---|---|
| Capitol, House and Senate chambers, Pentagon, committee rooms | Wikimedia Commons, Architect of the Capitol, DoD, Senate.gov photo galleries | US government works: public domain |
| State capitols and treasuries | Wikimedia Commons | CC BY / CC BY-SA, credit on `/about` |
| People calling, writing, at a kitchen table | Pexels, Unsplash | Free licence, no credit required |
| Gaza and the war | UNRWA / UN Photo (CC BY-NC-ND), WHO, OCHA | Use sparingly, with the credit line; never news-agency photos |
Stitch generates placeholder imagery; swap in the real files at build
time. Every image gets a dark gradient overlay (black 0 → 60%) so white
type passes contrast at AA.

## Prompt 0 — style guide (run first)
```
Create a style guide screen for a civic-action website called "Cut the
Ties". Purpose: a US resident types their street address and gets the two
most important actions they can take this week to end US military
integration with Israel, with a personalised call script or letter. Tone:
calm, credible, direct; it should look trustworthy to a congressional
staffer and compelling to a 24-year-old arriving from TikTok. Not a
protest poster, not a corporate SaaS page.

Show on one screen:
1. Colour palette with hex codes: a near-black ink (#111418) for text and
   overlays, warm off-white paper (#F7F4EE) backgrounds, one accent for
   primary buttons and links: deep green (#1F6F50), one warning amber
   (#B45309) for deadlines, and three greys. Dark-mode variants of each.
2. Typography: a high-contrast serif for headlines (Fraunces or Source
   Serif) and a plain sans for body and UI (Inter). Show H1 56/64,
   H2 36/44, H3 24/32, body 18/28, small 14/20, with weights.
3. Buttons: primary (filled green, white text, 48 px tall, 8 px radius),
   secondary (outlined ink), text link. Default, hover, focus ring,
   disabled.
4. Form field: a single large address input with placeholder "Street
   address, city, state", a green "Find my actions" button attached on
   the right, error state text in amber.
5. A goal card: 16:9 image with dark gradient overlay, category tag
   (small caps), title over the image, two lines of body text below,
   deadline line with calendar icon, one primary button.
6. A target chip: member's name, party letter in a small circle, state or
   district, a phone icon.
7. Spacing scale (4, 8, 12, 16, 24, 32, 48, 64) and a 12-column grid with
   a 1120 px max content width.
Layout: clean reference sheet on paper background, labelled, generous
whitespace. No lorem ipsum: use real placeholder copy about calling a
member of Congress.
```

## Prompt 1 — landing page `/`
```
Match the "Cut the Ties" style guide in this project exactly. Design the
landing page, desktop 1440 px wide.

Above the fold: a full-bleed photograph of the US Capitol dome at dusk
with a dark gradient overlay. Over it, left-aligned: a small caps line
"Three decisions in the next 45 days", an H1 "Find the two things you can
do this week", one sentence of body text: "Enter your address. We find
your members of Congress and give you the words that work." Then the
large address field with the attached green "Find my actions" button, and
beneath it in small text: "Full street address needed: cities are split
between districts. Nothing is stored."

Below the fold: a row of three goal cards (NDAA conference: "Strip the
Israel integration section", Senate Democratic leader vote: "A leader who
will strip §1217", House Democratic caucus vote: "Ask your member before
Nov 18") each with its own image (Capitol dome, Senate chamber, House
floor), a deadline line and a "See the goal" button.

Footer band on ink background: one line "Built and paid for by one person.
Donations keep it up." with a text link "Donate", plus links About,
Privacy, All goals. No nav bar beyond a small wordmark top-left and
"Donate" top-right.
```

## Prompt 2 — results after an address
```
Match the "Cut the Ties" style guide. Design the landing page state after
an address is entered, desktop 1440 px.

Top: a slim bar "CA-46 · Orange, CA · change address". H1: "Your two
actions this week". Below, exactly two large goal cards side by side,
each with a full-bleed image and dark overlay, a category tag, a title, a
deadline with an amber calendar icon, and under the image a "Your
targets" block: one to three target chips (name, party circle, district,
phone icon) with a one-line position under each, e.g. "Voted to keep the
section in July · uncommitted". Each card ends with one primary button:
"Get my call script" or "Write my letter". Under the two cards, a quiet
text link "See all goals". Keep everything else off the page.

Also produce the mobile version at 390 px wide: the two cards stack, the
bar becomes a single line, and the first card's button is visible without
scrolling past the first image.
```

## Prompt 3 — goals overview `/goals`
```
Match the "Cut the Ties" style guide. Design the goals overview page,
desktop 1440 px.

H1 "What we are asking for" with one sentence under it: "Three decisions
in Washington in the next 45 days, and one in your state. When one is
decided, the next takes its place." Then a vertical list of goal cards,
each full width: image on the left third with dark overlay and category
tag, on the right the title, a 50-word summary of the issue, a bold
"What we want" sentence, a deadline line, and two buttons: primary "See
the goal", secondary "Prepare". Four cards: NDAA conference, Senate
Democratic leader vote, House Democratic caucus vote, state Israel bonds.

Below, a muted strip titled "Outcomes" showing two past goals as compact
rows with a green check or grey dash and a one-line outcome note.
```

## Prompt 4 — goal detail `/goals/<slug>`
```
Match the "Cut the Ties" style guide. Design the goal detail page for
"Strip the Israel integration section from the NDAA", desktop 1440 px.

Hero: full-bleed image of a House Armed Services committee room with
dark overlay; over it the category tag "Federal vote", the H1, and a
deadline line "Conference decides the week of Nov 9". Below the hero, a
two-column layout: left column (8/12) with sections "Where things
stand" (three short paragraphs), "What we want" (one bold sentence in a
bordered callout), "Who decides" (a list of target chips with position
lines), and "Sources" (four links). Right column (4/12), sticky: a card
"Your targets" with the user's three member chips and one primary
button "Get my call script", a secondary button "Prepare first", and a
small line "Not your district? change address". Under the card, a
"Partner campaign" link box with an external-link icon.
```

## Prompt 5 — prep page `/goals/<slug>/prep`
```
Match the "Cut the Ties" style guide. Design the briefing page for the
Senate Democratic leader vote, desktop 1440 px.

Hero: image of the Senate chamber with dark overlay, tag "Leadership
vote", H1 "Before you call: the leader vote", a dated line "Updated
Nov 4". Below, a single reading column (720 px) with these sections, each
with an H2: "Where things stand" (dated, two paragraphs), "Timeline" (a
vertical list with dates), "Our picks" (three candidate cards in a row,
each with a portrait placeholder, name, state, a one-paragraph reason, a
source link, and a small line "Signal: declared Nov 2 · stated position
on §1217"; the first card has a green "Our first pick" tag), "What to
say in 30 seconds" (a bordered callout with the unified ask in bold),
"If they push back" (three question-and-answer pairs), "What counts as a
win". A sticky bottom bar on mobile and a right-side card on desktop
with one primary button "Get my call script".
```

## Prompt 6 — action form and generated document `/act/<slug>`
```
Match the "Cut the Ties" style guide. Design two states of the action
page, desktop 1440 px.

State A, the form: a narrow centred column (640 px). Small target line
with one chip "Rep. Lou Correa · D · CA-46". H1 "Your call script". A
short form: First name, City, a textarea "Why this matters to you (one
or two sentences)" with a 280-character counter, an optional field
"Occupation or affiliation", a Cloudflare Turnstile widget, and a primary
button "Write my script". Under the button: "Takes about ten seconds.
Your words are used once and not stored."

State B, the document: the same column. H1 "Your call script", a paper
card with the generated script as readable body text, a line under it
"Facts checked against the record · Regenerate". Then a row with the
target's phone as a large tel button "Call (202) 225-2965", "Copy" and
"Download". Below, a wide primary button "I made the call" and a muted
line "Share appears after you've acted". Keep it quiet; no decorative
images on this page.
```

## Prompt 7 — receipt, report and share
```
Match the "Cut the Ties" style guide. Design the screen shown after a user
taps "I made the call", desktop and 390 px mobile.

A centred card with a green check, H1 "Done. That counted.", a line "Your
call to Rep. Correa's office on Nov 4". Then a small question "How did
the office respond?" with five pill buttons: Will support · Undecided ·
Opposed · No answer · Other, and an optional one-line text field "One
line on how it went (not stored)". Below, two buttons side by side: a
primary "Share this goal" with a share icon and a secondary "Next
action". Under the card, a quiet band: "Built and paid for by one person.
If this helped, a donation keeps it running." with a text link.
```

## Prompt 8 — donate page `/donate`
```
Match the "Cut the Ties" style guide. Design the donate page, desktop
1440 px, with a mobile variant.

No hero image. Narrow centred column. H1 "This site is run by one
person". Body: "I built and pay for Cut the Ties myself. It is not a PAC,
a campaign or an organisation. Donations are not tax-deductible and go
only to hosting, the AI that writes your scripts, and the domain." A
small table "What it costs each month" with three rows and a total. Then
four large buttons in a 2x2 grid: "$5", "$20", "$50", "$5 a month", each
with a small Stripe lock icon, and a line "Opens Stripe in a new tab".
Finish with a text link "What is stored and what is not" to the privacy
page.
```

## Prompt 9 — share card (social image)
```
Match the "Cut the Ties" style guide. Design a 1080 x 1350 px (4:5)
social share image for the NDAA goal, to be used as an Instagram post
and a TikTok cover. Full-bleed Capitol image with dark overlay. Top:
small wordmark. Centre: large serif headline "Your rep voted to keep the
Israel integration section. The conference decides next week." Below:
one line "Rep. Lou Correa · CA-46 · (202) 225-2965". Bottom: the site
URL in a pill and a line "Enter your address to get your script". Also
a 1200 x 630 variant for link previews with the same elements.
```

## What to bring back into the PRD
- The final palette, type and button spec go into
  `docs/specs/action-router.md` §Invariants when §1 ships.
- Any screen Stitch produces that changes a behavior in the PRD (for
  example a merged goal + prep page) is a PRD change, logged under
  `## Changes` before the build.
