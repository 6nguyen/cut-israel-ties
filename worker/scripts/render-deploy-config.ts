// Render worker/wrangler.deploy.json (gitignored) from wrangler.jsonc for `wrangler deploy` and
// `seed:remote`. Why: wrangler does not interpolate environment variables inside wrangler.jsonc,
// and the production D1 id must stay out of git (docs/specs/deployment.md). Reads
// D1_DATABASE_ID (required) and SITE_DOMAIN (optional: adds the `<domain>/api/*` route).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'wrangler.jsonc');
const out = join(here, '..', 'wrangler.deploy.json');
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

/** Strip `//` and `/* *\/` comments outside strings, then JSON.parse. */
export function parseJsonc(text: string): Record<string, unknown> {
  let o = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      o += text.slice(i, j + 1);
      i = j;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      o += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      const j = text.indexOf('*/', i + 2);
      i = j < 0 ? text.length : j + 1;
    } else o += ch;
  }
  return JSON.parse(o.replace(/,(\s*[}\]])/g, '$1')) as Record<string, unknown>;
}

export function renderDeployConfig(base: Record<string, unknown>, env: NodeJS.ProcessEnv): Record<string, unknown> {
  const id = env.D1_DATABASE_ID?.trim();
  if (!id || id === PLACEHOLDER) throw new Error('D1_DATABASE_ID is not set (see docs/guides/deploy.md §1)');
  const d1 = (base.d1_databases as Array<Record<string, unknown>>).map((d) => ({ ...d, database_id: id }));
  const cfg: Record<string, unknown> = { ...base, d1_databases: d1 };
  const domain = env.SITE_DOMAIN?.trim();
  if (domain) cfg.routes = [{ pattern: `${domain}/api/*`, zone_name: domain }];
  return cfg;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cfg = renderDeployConfig(parseJsonc(readFileSync(src, 'utf8')), process.env);
  writeFileSync(out, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`wrote ${out} (routes: ${cfg.routes ? JSON.stringify(cfg.routes) : 'none, workers.dev only'})`);
}
