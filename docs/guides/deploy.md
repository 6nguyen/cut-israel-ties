# Deploy — provisioning runbook and go-live checklist

How the maintainer stands production up once, what a merge to `main`
does afterwards, and the checklist ticked on first launch. Current
behavior lives in `docs/specs/deployment.md`; variables in `.env.example`.

## 1. One-time provisioning (in order)
Run from the repo root unless noted. `<domain>` is the apex domain
(open question 1 of `docs/prd/deploy.md`).

1. Log in: `npx wrangler login` (any directory; opens the browser).
2. Create the database: `cd worker && npx wrangler d1 create cut_ties`.
   Copy the printed `database_id`; it never goes into git:
   `export D1_DATABASE_ID=<id>` for this shell (step 11 stores it in
   GitHub). `wrangler.jsonc` keeps the zero placeholder for local dev.
3. Create the schema once (drops every table; never re-run on a live
   database): `D1_DATABASE_ID=<id> npm run schema:remote -w worker`.
4. Secrets: `cd worker && npx wrangler secret put TURNSTILE_SECRET` and
   `npx wrangler secret put ANTHROPIC_API_KEY` (paste when prompted).
   The Turnstile secret comes from step 9; put it after that step.
5. Worker vars in `worker/wrangler.jsonc` → `vars` (committed):
   `MAINTAINER_EMAIL` (your address), `DIGEST_FROM`
   (`digest@<domain>`), `MAX_GENERATIONS_PER_DAY`.
6. First Worker deploy, workers.dev only until the domain exists:
   `D1_DATABASE_ID=<id> npm run deploy -w worker`. Note the
   `https://cut-ties-api.<subdomain>.workers.dev` URL it prints.
7. Seed production from `data/`: `D1_DATABASE_ID=<id> npm run
   seed:remote -w worker` (reruns are safe; deploy.yml does this on
   every merge).
8. Pages project (Direct Upload, so deploy.yml and PR previews publish
   through `wrangler pages deploy`; a Git-connected project cannot take
   uploads): `npx wrangler pages project create cut-ties
   --production-branch main`. In the dashboard → Workers & Pages →
   cut-ties → Settings → Variables: add `API_ORIGIN` = the workers.dev
   URL from step 6 to the **Preview** environment only (the preview
   proxy `web/functions/api/[[path]].ts` reads it; production routes
   `/api/*` to the Worker before Pages sees it).
9. Turnstile (dashboard → Turnstile → Add widget): hostnames `<domain>`
   and `cut-ties.pages.dev`, mode Managed. Site key → GitHub variable
   `PUBLIC_TURNSTILE_SITE_KEY` (step 11); secret → step 4.
10. Domain: register `<domain>`, add the zone to Cloudflare, point the
    registrar at the assigned nameservers. Then Pages → cut-ties →
    Custom domains → add `<domain>` (and `www.<domain>` if wanted).
    Email Routing (zone → Email → Email Routing): enable, add
    `MAINTAINER_EMAIL` as a destination and confirm the verification
    mail; this is what the `DIGEST_MAIL` binding sends through.
11. GitHub → repo Settings → Secrets and variables → Actions.
    Secrets: `CLOUDFLARE_API_TOKEN` (API Tokens → Create → Edit
    Cloudflare Workers template, plus D1:Edit and Pages:Edit),
    `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`. Variables:
    `SITE_DOMAIN` (`<domain>`, no scheme), `MONTHLY_COST_USD`,
    `STRIPE_LINKS` (JSON, four Stripe payment links),
    `PUBLIC_TURNSTILE_SITE_KEY`, optionally `PAGES_PROJECT`.
12. Merge any PR to `main` (or re-run the last `deploy` workflow from
    the Actions tab). The `production` job deploys the Worker with the
    `<domain>/api/*` route, re-seeds D1 and publishes the site.

## 2. What a merge does
`ci` runs on the push to `main`; when it succeeds, `deploy.yml`'s
`production` job runs `npm ci`, builds the site, then
`scripts/quiet-check.sh deploy-worker` → `seed-remote` → `deploy-web`.
A failing step stops the job and the previous deployment stays live; the
Worker always lands before the rows it reads and the rows before the
pages that link to them. Full logs are uploaded as the `deploy-logs`
artifact on failure.

## 3. Pull-request previews
Every PR from this repo gets a `preview` job that builds the site and
runs `deploy-web --branch <head>`; the job posts (and later edits) one
comment holding the `*.pages.dev` URL (once the Cloudflare secrets are
set; before that the job skips its deploy steps and passes). The
preview's `/api/*` is proxied to the production Worker by the Pages
Function, so the landing page
routes a fixture address and read-only endpoints work; `generate` is
rate-limited per device as in production.

## 4. Rollback
Actions → `deploy` → pick the last green run → "Re-run all jobs". It
redeploys that commit's Worker, rows and site. For a bad data change,
revert the data PR instead; the merge redeploys.

## 5. Go-live checklist (tick on first launch, commit the numbers)
- [ ] `/` routes the three fixture addresses (CA-46, TX-35, PA-1) to
      their delegations.
- [ ] `/donate` shows four working Stripe links and the real
      `MONTHLY_COST_USD`.
- [ ] A generation streams end to end with the real `ANTHROPIC_API_KEY`.
- [ ] The digest ran once by manual trigger (dashboard → Worker →
      Triggers → Cron → "Trigger") and the email arrived at
      `MAINTAINER_EMAIL`.
- [ ] `curl -X POST https://<domain>/api/route -d '{"address":"x"}'`
      without a Turnstile token is refused.
- [ ] Landing transfer size ≤100 KB measured and recorded in
      `docs/specs/action-router.md` §Performance budget: ___ KB.
- [ ] LCP ≤1.5 s on a mid-range phone over 4G (Lighthouse, mobile,
      slow 4G): ___ s.
- [ ] `/api/route` p95 ≤2 s over 20 requests: ___ ms.
- [ ] First streamed token ≤3 s p95 and generation complete ≤10 s p95:
      ___ s / ___ s.
- [ ] `README.md` carries the live URL.
- [ ] After one week: Cloudflare billing shows $0 for Pages, Workers, D1,
      Turnstile and Email Routing.
