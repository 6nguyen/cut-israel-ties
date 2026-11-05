# Production deployment — PRD
Status: APPROVED 2026-11-04 (auto) · Owner: George Nguyen · Last updated: 2026-11-04

## Problem
The action-router shipped (archive/2026-11-action-router.md) as code that
builds and passes 99 tests, but nothing runs outside `localhost`: no
Cloudflare account resources exist, `worker/wrangler.jsonc` carries a
placeholder D1 id, no secrets are set, CI has no deploy step, there is no
domain, and the four Stripe links render "link not configured". Every
queued feature is invisible until this lands.

## Goals / Non-goals
- Goals: the site and API reachable on one domain over HTTPS; a merged PR
  to `main` deploys both within five minutes with no manual step; the
  production D1 seeded from `data/`; every secret and variable documented
  in one place; cost stays at the $0 infra budget.
- Non-goals: real roster or bond-holdings data (own PRDs); monitoring
  beyond Cloudflare's built-in analytics; a staging environment (preview
  deployments per PR are enough); custom email beyond the digest route.

## Research (what the best products do → adopt / adapt / reject)
| Pattern | Seen in | Verdict | Why |
|---|---|---|---|
| Deploy from CI on merge, not from a laptop | every Pages/Workers project | adopt | reproducible; the only path that keeps `data/` and D1 in step |
| Preview deployment per PR | Cloudflare Pages default | adopt | free; lets the owner click a PR before merging |
| Worker routed under the site's `/api/*` | PRD §Infrastructure | adopt | same origin, no CORS, no cookies |
| Separate staging account | larger teams | reject | one person, $0 budget; previews cover it |

## Users
The maintainer (one person) runs the one-time provisioning and reads the
runbook when something breaks. Site visitors only notice that the site
exists and that donate links work.

## Expected behavior
### 1. Provisioning runbook and config
1. `docs/guides/deploy.md` lists, in order, every one-time step with the
   exact command: `wrangler login`, `wrangler d1 create cut_ties`, paste
   the id into `worker/wrangler.jsonc`, `wrangler secret put` for
   `TURNSTILE_SECRET` and `ANTHROPIC_API_KEY`, create the Pages project
   from the GitHub repo (build command `npm run build -w web`, output
   `web/dist`, Node 22), set the Pages build variables (`SITE_URL`,
   `MONTHLY_COST_USD`, `STRIPE_LINKS`), add the custom domain, enable
   Email Routing with `MAINTAINER_EMAIL` as a verified destination, create
   a Turnstile widget for the domain and put its site key in the web env.
2. `worker/wrangler.jsonc` gains the production `routes` entry for
   `<domain>/api/*` and keeps the placeholder D1 id out of git: the id
   is read from `D1_DATABASE_ID` via a `wrangler.jsonc` env block, so the
   checked-in file works for local dev and CI alike.
3. A `.env.example` at the repo root lists every variable and secret with
   one line each: where it is set (Pages build env, Worker var, Worker
   secret, GitHub Actions secret) and what breaks without it.

### 2. CI deploy on merge
1. `.github/workflows/deploy.yml` runs on push to `main` after `ci.yml`
   passes: `npm ci`, `scripts/quiet-check.sh deploy-worker` (`wrangler
   deploy`), then `scripts/quiet-check.sh seed-remote` (`npm run
   seed:remote -w worker`), then `scripts/quiet-check.sh deploy-web`
   (`wrangler pages deploy web/dist`). Secrets `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` come from GitHub Actions.
2. Pull requests get a Pages preview URL posted by the Cloudflare GitHub
   integration; the preview's `/api/*` points at the production Worker
   (read-only endpoints are safe; `generate` is rate-limited per device).
3. A failed deploy step fails the workflow and leaves the previous
   deployment live; nothing is half-deployed because the Worker deploys
   before the seed and the seed before the pages.

### 3. Go-live checklist
1. `docs/guides/deploy.md` ends with a checklist the maintainer ticks on
   first launch: address routes for the three fixture states, `/donate`
   shows four working Stripe links and the real monthly cost, a
   generation streams with a real `ANTHROPIC_API_KEY`, the digest cron
   fires once by `wrangler deploy --dry-run`-free manual trigger and the
   email arrives, Turnstile blocks a request without a token, the landing
   transfer size is measured and recorded in the spec.
2. `README.md` replaces "Nothing is built yet" with the live URL and a
   three-line "run locally" block.

## Data & contracts
- New files: `.github/workflows/deploy.yml`, `.env.example`,
  `docs/guides/deploy.md`.
- `scripts/quiet-check.sh` targets `deploy-worker`, `seed-remote`,
  `deploy-web` (not in `CI_TARGETS`; only the deploy workflow calls them).
- `worker/wrangler.jsonc`: `routes`, `env.production.d1_databases[0]
  .database_id` from `D1_DATABASE_ID`.
- GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `D1_DATABASE_ID`. No new Worker endpoints or tables.

## Spec delta
- ADDED `docs/specs/deployment.md`: how a merge reaches production,
  the variable table, the preview rule and the rollback rule (redeploy
  the previous commit from the Actions UI).
- MODIFIED `docs/specs/action-router.md` §Performance budget: "measured
  2026-11-04 locally" → measured on the production domain, with the
  LCP and `/api/route` p95 numbers filled in.

## Acceptance criteria
- [ ] A merge to `main` that changes a goal YAML shows the change on the
      live site within five minutes with no manual step.
- [ ] `wrangler.jsonc` in git contains no account-specific id; `npm run
      dev` and `npm test` still work from a clean clone.
- [ ] A PR opened against `main` gets a preview URL whose landing page
      routes a fixture address.
- [ ] Every name in `.env.example` is read somewhere in `web/` or
      `worker/` (grep test) and every `env.X` read in `worker/src` is in
      `.env.example`.
- [ ] The go-live checklist is ticked and committed with the measured
      numbers: landing ≤100 KB transferred, LCP ≤1.5 s on a mid-range
      phone over 4G, `/api/route` ≤2 s p95, first streamed token ≤3 s
      p95, generation complete ≤10 s p95.
- [ ] Cloudflare billing shows $0 for Pages, Workers, D1, Turnstile and
      Email Routing after the first week.

## Rollout & metrics
No flag: the first deploy is the rollout. Metrics: deploy workflow
duration, Cloudflare request counts and error rate for `/api/*`, the
measured budget numbers above.

## State (updated 2026-11-04)
- Sections: (build order; `[ ]` todo · `[~]` in progress · `[x]` merged · `[!]` blocked: reason)
  - [ ] 1. Provisioning runbook and config
  - [ ] 2. CI deploy on merge
  - [ ] 3. Go-live checklist
- Completed: none.
- Folded: none.
- Branch / open PRs: none.
- Remaining: all.
- Next action: /implement-prd-section docs/prd/deploy.md (§1). §1 and
  §2 are code; §3 needs the owner's Cloudflare login and Stripe account.

## Open questions
1. Domain name. Proposal: the owner registers one `.org` before §3; the
   runbook uses `<domain>` until then. Not blocking: nothing in §1–§2
   depends on the name.
2. Deploy on every merge or on tags? Proposal: every merge; `data/`
   changes are the most frequent deploys and should not wait for a tag.

## Changes
- 2026-11-04 — created (APPROVED, auto: every question carries a
  proposal, none blocking). Added to `## Next` and written in the same
  PR because no queued feature can reach users without it.
