// Apply worker/seed.sql to D1 only when data/ changed since the last seed (deployment spec §3).
// D1's free tier allows 100k row writes a day and a full reseed costs ~4k (deletes, inserts, index
// rows); 15 merges on 2026-11-06 used the day's quota and every INSERT in the Worker failed. seed.sql
// ends with an upsert of `meta.seed_sha256` (the hash of the rendered rows); when the database already
// holds that hash nothing is applied. `--local` targets the local D1 (a dry run); `FORCE_SEED=1` applies regardless.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATIONS, columnsOf, pending } from './migrate';

const here = dirname(fileURLToPath(import.meta.url));
const cwd = join(here, '..');
const sql = readFileSync(join(cwd, 'seed.sql'), 'utf8');
const hash = sql.match(/VALUES \('seed_sha256', '([0-9a-f]{64})'\)/)?.[1];
if (!hash) throw new Error('seed.sql carries no seed_sha256 stamp; run scripts/seed.ts first');

const where = process.argv.includes('--local') ? ['--local'] : ['--remote', '--config', 'wrangler.deploy.json'];
const base = ['wrangler', 'd1', 'execute', 'cut_ties', ...where];

/** The stored hash, or null when the meta table is missing (first run) or the query fails. */
function parseStoredHash(out: string): string | null {
  const start = out.indexOf('[');
  if (start < 0) return null;
  try {
    const parsed = JSON.parse(out.slice(start)) as { results?: { value?: unknown }[] }[];
    const v = parsed[0]?.results?.[0]?.value;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

function storedHash(): string | null {
  try {
    const out = execFileSync('npx', [...base, '--json', '--command', "SELECT value FROM meta WHERE key = 'seed_sha256'"], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return parseStoredHash(out);
  } catch {
    return null;
  }
}

/** Add the columns schema.sql gained since the database was provisioned, before seed.sql inserts into them. */
function migrate(): void {
  const existing: Record<string, string[]> = {};
  for (const table of new Set(MIGRATIONS.map((m) => m.table))) {
    try {
      existing[table] = columnsOf(execFileSync('npx', [...base, '--json', '--command', `PRAGMA table_info(${table})`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch {
      existing[table] = [];
    }
  }
  for (const m of pending(existing, MIGRATIONS)) {
    console.log(`seed-remote: adding ${m.table}.${m.column}`);
    execFileSync('npx', [...base, '--command', m.ddl], { cwd, stdio: 'inherit' });
  }
}

migrate();
const stored = storedHash();
if (!process.env.FORCE_SEED && stored === hash) {
  console.log(`seed-remote: data unchanged (${hash.slice(0, 12)}); nothing applied`);
} else {
  console.log(`seed-remote: applying seed.sql (${stored ? `${stored.slice(0, 12)} → ` : 'first seed → '}${hash.slice(0, 12)})`);
  execFileSync('npx', [...base, '--file=seed.sql'], { cwd, stdio: 'inherit' });
}
