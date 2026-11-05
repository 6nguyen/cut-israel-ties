# design/stitch — Google Stitch export (2026-11-04)

Reference only. The Astro + Tailwind frontend in
[docs/prd/action-router.md](../../docs/prd/action-router.md) is built from
these screens; builds never read this directory. Prompts that produced them:
[docs/research/ui-design-brief.md](../../docs/research/ui-design-brief.md).
Source project: Stitch, "Cut the Ties — Style Guide" (one Web-mode project;
re-export there, do not hand-edit `code.html`).

## Layout

- `DESIGN.md` — the design system Stitch settled on ("Agitation Newsprint &
  Action Press"): colour tokens, type scale, spacing, components. Tool-written;
  allowlisted in `docs/.doc-allow`.
- `screens/<nn>-<name>/code.html` + `screen.png` — one folder per screen,
  numbered in funnel order. `code.html` loads Tailwind and Google Fonts from
  CDNs and its images from Google-hosted URLs that will expire; `screen.png`
  is the durable record.
- `images/*.jpg` — the eight placeholder photos Stitch generated, recompressed
  to ≤1600 px JPEG. AI-generated, not licensed, not for production: the brief's
  image-sourcing table (public-domain government photos, Wikimedia, UN/UNRWA)
  replaces each one.

## Screens → PRD sections

| Screen | PRD section |
|---|---|
| `00-style-guide` | Design system (style guide page) |
| `01-landing-{desktop,mobile}` | §1 Landing and address routing |
| `02-results-{desktop,mobile}` | §1 results: top two goals after address |
| `03-goals-overview-{desktop,mobile}` | §2 Goals overview |
| `04-goal-detail-ndaa-{desktop,mobile}` | §2 Goal detail (NDAA §1217 strip) |
| `05-briefing-senate-leader-{desktop,mobile}` | §3 Prep and briefing pages (three picks) |
| `06-action-form`, `06-action-document` | §4 Action form and personalised document (640 px column, both widths) |
| `07-receipt-{desktop,mobile}` | §4 Receipt and share |
| `08-donate-{desktop,mobile}` | §6 Donations |
| `09-share-card-1080x1350`, `09-link-preview-1200x630` | §4 share assets |
| `10-about-mobile` | §6 About |
| `11-error-states-mobile` | §4.7 rate limit, §4.8 screened input, geocoder and generic errors |

Mobile export added 2026-11-04 (second zip). Not designed: desktop about and
error states; the build derives them from the mobile screens.

## Palette decision (2026-11-04)

Owner accepted the drift from the brief's ink/paper/green palette to this
brutalist agitprop system, on the condition that the screens match each
other. They do not fully: Stitch used three token sets over the session.

| Set | Screens | Ink | Canvas | Green | Red | Yellow | Fonts |
|---|---|---|---|---|---|---|---|
| A: `DESIGN.md` prose | 00, 01-desktop, 02, 03-desktop, 04-desktop, 05-desktop | `#090A0F` | `#FAF7F0` newsprint | `#00E676` | `#E11D48` | `#FACC15` | Bebas Neue, Syne, Inter, Space Mono (+ Fraunces on 00/01/03) |
| B: `DESIGN.md` YAML tokens | all mobile screens, 06, 07, 08, 10, 11 | `#1A1B21` | `#FAF8FF` lavender-tinted | `#00E474` / `#006D34` | `#E4164A` | `#F3C504` | same, + Material Symbols |
| C: share assets | 09 both | `#0A0A0A` | `#FAF8F5` | `#00E876` | `#FF3B30` | `#FFCC00` | Bebas Neue, Newsreader, JetBrains Mono |

**Canonical set for the build: A**, as written in the `DESIGN.md` prose
(ink `#090A0F`, newsprint `#FAF7F0`, acid green `#00E876`, crimson
`#E11148`, hazard yellow `#FACC15`; Bebas Neue display, Syne headings, Inter
body, Space Mono labels; no Fraunces, no Newsreader, no Material Symbols).
The Tailwind config in the site defines these once; screens in sets B and C
are layout reference only and their colours are not copied. The lavender
canvas and the share-asset palette are the visible mismatches; re-exporting
them from Stitch is optional since the build renders share images from the
same tokens.

## Other caveats

Copy in the mock-ups contains placeholder names, dates and counts; none of
it is sourced. The build takes every number and name from D1 rows, never
from these files.
