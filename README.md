# cut-the-ties

Civic-action tool to end US aid, ties and military partnership with Israel at the federal, state and local levels. Live at `<live URL pending>` (deploy runbook: `docs/guides/deploy.md`); the evidence is in `docs/research/civic-action-levers/`, the queue in `docs/prd/README.md` §Next.

Run locally (Node ≥22): `npm ci`, then `npm run seed -w worker` (YAML/CSV → local D1),
then `npm run dev` (Worker on 8787, site on 4321). Tests: `npm test`. No environment
variable is needed locally; `.env.example` lists every production one.

<!-- Current behavior lives in docs/specs/; proposed changes in docs/prd/. -->
