// Render data/ into worker/seed.sql. Apply with `npm run seed` (local) or `seed:remote`.
// `--check` (roster-freshness §3) runs the loader and its seed checks, prints the counts and writes nothing.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRows } from '../src/load';
import { renderSeedSql } from './seed-sql';

const here = dirname(fileURLToPath(import.meta.url));
const rows = loadRows(join(here, '..', '..', 'data'));
if (process.argv.includes('--check')) {
  console.log(`data/ ok: ${rows.goals.length} goals, ${rows.actions.length} actions, ${rows.members.length} members, ${rows.membersElect.length} members-elect, ${rows.offices.length} offices, ${rows.positions.length} positions, ${rows.states.length} states`);
  process.exit(0);
}

const sql = renderSeedSql(rows, new Date().toISOString());
// deployment spec §3: `seed-remote.ts` applies seed.sql only when this hash differs from the one stored in
// `meta`. It covers the rows, not the SQL text, because positions carry the render time in `changed_at`.
const hash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const stamp = [
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
  `INSERT INTO meta (key, value) VALUES ('seed_sha256', '${hash}') ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
].join('\n');

writeFileSync(join(here, '..', 'seed.sql'), `${sql}\n${stamp}\n`);
console.log(`seed.sql: ${rows.goals.length} goals, ${rows.actions.length} actions, ${rows.members.length} members, ${rows.membersElect.length} members-elect, ${rows.offices.length} offices, ${rows.positions.length} positions, ${rows.states.length} states`);
