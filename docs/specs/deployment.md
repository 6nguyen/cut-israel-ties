# Deployment

## Purpose
How a merge to `main` reaches production and how a pull request gets a
preview, with no manual step and no account-specific value in git. It
stops at Cloudflare's built-in analytics: no staging environment, no
monitoring, no schema migrations (the schema is created once by hand).

## Behavior
1. **Merge → production.** `ci` runs on the push to `main`. On success,
   `.github/workflows/deploy.yml` (`workflow_run`) checks out that
   commit, runs `npm ci`, builds the site, then in order
   `scripts/quiet-check.sh deploy-worker`, `seed-remote`, `deploy-web`.
   A failing step stops the job; the previous deployment stays live.
   Order is the half-deploy guard: the Worker lands before the rows it
   reads, the rows before the pages that link to them. Logs upload as
   the `deploy-logs` artifact on failure.
2. **Worker config at deploy time.** Wrangler does not interpolate
   environment variables inside `wrangler.jsonc`, so `npm run deploy`
   and `seed:remote` first run `worker/scripts/render-deploy-config.ts`:
   it parses the checked-in `wrangler.jsonc`, replaces the placeholder
   D1 id with `D1_DATABASE_ID` (refusing to run when it is unset or
   still the placeholder) and, when `SITE_DOMAIN` is set, adds the route
   `<domain>/api/*` on that zone. The result is
   `worker/wrangler.deploy.json` (gitignored), passed with `--config`.
   Local dev and tests use `wrangler.jsonc` as is.
3. **Seed on every merge.** `seed:remote` renders `seed.sql` from
   `data/` and applies only that file: it deletes and re-inserts the
   five data tables inside one batch with `PRAGMA defer_foreign_keys`,
   so rows in `receipts`, `reports` and `generations` that reference
   goals and actions survive. `schema.sql` (drops every table) is
   applied by `schema:remote` once, during provisioning.
4. **Site.** `deploy-web` runs `wrangler pages deploy dist` from `web/`
   against the Direct Upload project `cut-ties` (`PAGES_PROJECT`
   overrides). Production is `--branch main`; the custom domain points
   at it. The Pages Function `web/functions/api/[[path]].ts` ships with
   the site and proxies `/api/*` to `API_ORIGIN`; in production the
   Worker route runs first, so it answers only on previews.
5. **Pull-request previews.** For PRs from this repository the `preview`
   job builds the site and runs `deploy-web --branch <head ref>`, then
   posts one PR comment (edited on later pushes) with the `*.pages.dev`
   URL. Forks get no preview: the job needs the repo's secrets. Until
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist both jobs
   skip their deploy steps and pass, so PRs are never blocked on
   provisioning. The preview's `/api/*` reaches the production Worker
   through the Pages Function (Preview environment variable `API_ORIGIN`
   = the Worker's workers.dev URL), so routing and read-only endpoints
   work and
   `generate` is rate-limited per device as in production.
6. **Rollback.** Re-run the last green `deploy` workflow from the
   Actions UI: it redeploys that commit's Worker, rows and site. A bad
   data change is reverted by a PR; the merge redeploys.
7. **Provisioning** is manual and documented step by step in
   `docs/guides/deploy.md`, which also holds the go-live checklist.

## Data & contracts
| Name | Set in | Read by | Without it |
|---|---|---|---|
| `SITE_URL` | Pages build env (from `SITE_DOMAIN`) | `web/astro.config.mjs` | relative share-image URLs |
| `MONTHLY_COST_USD`, `STRIPE_LINKS` | GitHub Actions variables → build env | `web/src/lib/donate.ts` | `/donate` shows $0 / "link not configured" |
| `PUBLIC_TURNSTILE_SITE_KEY` | GitHub Actions variable → build env | landing and act pages | no widget; `/api/route` refused once the secret is set |
| `API_ORIGIN` | dev shell; Pages Preview variable | dev proxy; `web/functions/api/[[path]].ts` | dev → `localhost:8787`; previews answer 503 on `/api/*` |
| `MAX_GENERATIONS_PER_DAY`, `LLM_MONTHLY_BUDGET_USD`, `MAINTAINER_EMAIL`, `DIGEST_FROM`, `GEOCODER_URL` | `worker/wrangler.jsonc` `vars` | Worker | code defaults (budget 15); digest logs and exits |
| `TURNSTILE_SECRET`, `ANTHROPIC_API_KEY` | `wrangler secret put` | Worker | Turnstile skipped (dev only); generation serves the standard script |
| `VISITS_ENABLED` | `worker/wrangler.jsonc` `vars` | Worker (`/api/visits*`) | on; `"0"` pauses listings (POST 503, lists empty) |
| `VISITS_REVIEW_SECRET` | `wrangler secret put` | Worker (digest review links) | digest lists pending visits without links; `/api/visits/review` 503 |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID` | GitHub Actions secrets | `deploy.yml` → wrangler, renderer | every deploy step fails / renderer refuses |
| `SITE_DOMAIN`, `PAGES_PROJECT` | GitHub Actions variables | renderer (route), `deploy-web` | workers.dev only; project `cut-ties` |
| `COUNT_THRESHOLD` | `worker/wrangler.jsonc` `vars` | Worker (`/api/counts`) | code default 5 |
| `IP_SALT` | `wrangler secret put` | Worker (`/api/receipt`) | `ip_hash` rotates on the UTC date only; one warning per isolate |

Files: `.env.example` (one block per name, kept in step with the code
by `worker/test/env-example.test.ts`), `.github/workflows/deploy.yml`,
`worker/scripts/render-deploy-config.ts`, `worker/wrangler.deploy.json`
(generated, gitignored), `web/functions/api/[[path]].ts`. quiet-check
targets `deploy-worker` (`npm run deploy`), `seed-remote`
(`npm run seed:remote`), `deploy-web` (`wrangler pages deploy`) are
never in `CI_TARGETS`. Bindings `DB` and `DIGEST_MAIL` are declared in
`wrangler.jsonc`, not env vars.

## Invariants (regression checklist)
- [ ] `git grep` finds no D1 id other than the zero placeholder and no
      `routes` entry in `worker/wrangler.jsonc`.
- [ ] `npm run dev`, `npm test` and `npm run build` work from a clean
      clone with no environment variable set.
- [ ] `npm run deploy -w worker` without `D1_DATABASE_ID` exits before
      contacting Cloudflare.
- [ ] `deploy.yml` steps run `deploy-worker` before `seed-remote` before
      `deploy-web`; `ci.yml` never names a deploy target.
- [ ] Every name in `.env.example` is read by code or a workflow; every
      `env.X` in `worker/src` and `process.env`/`import.meta.env` read in
      `web/` is in `.env.example`.
- [ ] A re-run `seed:remote` leaves `receipts`, `reports`,
      `generations`, `screenings`, `blocks` and `digest_runs` untouched.
- [ ] A PR from this repo gets exactly one preview comment, updated on
      each push.

## Performance budget
A merge is live within five minutes of `ci` passing. Infra cost
excluding LLM and domain = $0/month (Pages, Workers, D1, Turnstile,
Email Routing free tiers).
