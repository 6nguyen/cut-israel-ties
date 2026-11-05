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
| `01-landing` | §1 Landing and address routing |
| `02-results-{desktop,mobile}` | §1 results: top two goals after address |
| `03-goals-overview` | §2 Goals overview |
| `04-goal-detail-ndaa` | §2 Goal detail (NDAA §1217 strip) |
| `05-briefing-senate-leader` | §3 Prep and briefing pages (three picks) |
| `06-action-form`, `06-action-document` | §4 Action form and personalised document |
| `07-receipt-{desktop,mobile}` | §4 Receipt and share |
| `08-donate-{desktop,mobile}` | §6 Donations and about |
| `09-share-card-1080x1350`, `09-link-preview-1200x630` | §4 share assets |

Not yet designed: mobile variants of 01, 03, 04, 05; about page; error and
rate-limit states (§4.7); screened-out input state (§4.8).

## Known deviations from the brief

Stitch moved from the brief's quiet ink/paper/green palette to a brutalist
agitprop system (Bebas Neue + Syne + Space Mono, hard offset shadows, acid
green / crimson / hazard yellow). Copy in the mock-ups contains placeholder
names, dates and counts; none of it is sourced. The build takes every number
and name from D1 rows, never from these files.
