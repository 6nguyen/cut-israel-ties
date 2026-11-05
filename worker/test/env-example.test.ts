// deploy PRD acceptance: .env.example and the code name the same variables, deploy.yml parses and
// orders its steps, and wrangler.jsonc carries no account-specific id (docs/specs/deployment.md).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseJsonc, renderDeployConfig } from '../scripts/render-deploy-config';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
  });

const envExample = read('.env.example');
const names = [...envExample.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)].map((m) => m[1]);
const BINDINGS = new Set(['DB', 'DIGEST_MAIL']);

describe('.env.example', () => {
  it('lists each name once, each with a comment saying where it is set and what breaks', () => {
    expect(new Set(names).size).toBe(names.length);
    const lines = envExample.split('\n');
    for (const n of names) {
      const i = lines.findIndex((l) => l.startsWith(`${n}=`));
      expect(lines[i - 1], n).toMatch(/^# .*Without it:/);
    }
  });
  it('every name is read somewhere in web/, worker/, the workflows or quiet-check', () => {
    const files = [...walk('web/src'), ...walk('web/functions'), 'web/astro.config.mjs', ...walk('worker/src'), ...walk('worker/scripts'), 'worker/wrangler.jsonc', ...walk('.github/workflows'), 'scripts/quiet-check.sh'];
    const corpus = files.map(read).join('\n');
    for (const n of names) expect(corpus, n).toMatch(new RegExp(`\\b${n}\\b`));
  });
  it('every env.X read in worker/src and every process/import.meta env in web/ is listed', () => {
    const workerReads = walk('worker/src').flatMap((f) => [...read(f).matchAll(/\benv\.([A-Z_][A-Z0-9_]+)/g)].map((m) => m[1]));
    const webReads = [...walk('web/src'), 'web/astro.config.mjs'].flatMap((f) => [...read(f).matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z_][A-Z0-9_]+)/g)].map((m) => m[1]));
    for (const n of new Set([...workerReads, ...webReads])) if (!BINDINGS.has(n)) expect(names, n).toContain(n);
  });
});

describe('deploy.yml', () => {
  const wf = parseYaml(read('.github/workflows/deploy.yml')) as { on: Record<string, unknown>; jobs: Record<string, { steps: { run?: string }[] }> };
  it('runs after ci on main and on pull requests', () => {
    expect((wf.on.workflow_run as { workflows: string[]; branches: string[] }).workflows).toEqual(['ci']);
    expect((wf.on.workflow_run as { branches: string[] }).branches).toEqual(['main']);
    expect(wf.on).toHaveProperty('pull_request');
  });
  it('production deploys the Worker, then seeds, then publishes the site', () => {
    const runs = wf.jobs.production.steps.map((s) => s.run ?? '').filter((r) => r.includes('quiet-check.sh'));
    const order = ['deploy-worker', 'seed-remote', 'deploy-web'].map((t) => runs.findIndex((r) => r.includes(t)));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(runs.findIndex((r) => r.includes(' build'))).toBeLessThan(order[0]);
  });
  it('quiet-check has the three deploy targets and CI does not run them', () => {
    const qc = read('scripts/quiet-check.sh');
    for (const t of ['deploy-worker', 'seed-remote', 'deploy-web']) expect(qc).toMatch(new RegExp(`^${t}\\|`, 'm'));
    expect(read('.github/workflows/ci.yml')).not.toMatch(/deploy-worker|seed-remote|deploy-web/);
  });
});

describe('wrangler.jsonc → wrangler.deploy.json', () => {
  const base = parseJsonc(read('worker/wrangler.jsonc'));
  it('git holds only the placeholder D1 id and no routes', () => {
    const ids = [...read('worker/wrangler.jsonc').matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)].map((m) => m[0]);
    expect(ids).toEqual(['00000000-0000-0000-0000-000000000000']);
    expect(base.routes).toBeUndefined();
    expect((base.d1_databases as { binding: string }[])[0].binding).toBe('DB');
  });
  it('refuses to render without D1_DATABASE_ID and injects id and route when set', () => {
    expect(() => renderDeployConfig(base, {})).toThrow(/D1_DATABASE_ID/);
    expect(() => renderDeployConfig(base, { D1_DATABASE_ID: '00000000-0000-0000-0000-000000000000' })).toThrow();
    const cfg = renderDeployConfig(base, { D1_DATABASE_ID: 'abc', SITE_DOMAIN: 'example.org' });
    expect((cfg.d1_databases as { database_id: string }[])[0].database_id).toBe('abc');
    expect(cfg.routes).toEqual([{ pattern: 'example.org/api/*', zone_name: 'example.org' }]);
    expect(renderDeployConfig(base, { D1_DATABASE_ID: 'abc' }).routes).toBeUndefined();
    expect(cfg.main).toBe('src/index.ts');
  });
});
