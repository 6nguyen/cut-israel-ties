// primary-2028 §1.1 + stable-data-ids §1: the body of `npm run make-primary-goal -w worker`,
// kept out of the script so the tests can run it against a fixture copy of data/.
// Writes the electoral goal and its one action for a targeted seat from the member's
// row, data/elections.csv and the templates in electoral.ts, with the next free goal
// and action ids from data/ids.md, and appends both ids there. It never edits
// members.csv or elections.csv; the seed refuses a target without them.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { actionYaml, checkElections, electionFor, goalYaml, parseElections, primarySlug } from './electoral';
import { appendIdRows, nextId, readIds } from './ids';
import { parseCsv } from './load';
import type { Member } from './types';

export const USAGE = 'usage: npm run make-primary-goal -w worker -- <STATE> <district> [roll-call-url]';

export interface Log { log: (s: string) => void; error: (s: string) => void }

/** Returns the process exit code: 0 wrote both files, 64 usage, 1 a data/ precondition failed. */
export function makePrimaryGoal(dataDir: string, argv: string[], out: Log = console, today = new Date().toISOString().slice(0, 10)): number {
  const [stateArg, districtArg, rollCallUrl] = argv;
  const state = (stateArg ?? '').toUpperCase();
  const district = Number(districtArg);
  if (!/^[A-Z]{2}$/.test(state) || !Number.isInteger(district) || district < 0) { out.error(USAGE); return 64; }
  const row = parseCsv(readFileSync(join(dataDir, 'members.csv'), 'utf8')).find((r) => r.chamber === 'house' && r.state === state && Number(r.district) === district);
  if (!row) { out.error(`no House member on file for ${state}-${district}`); return 1; }
  if (row.target_2028 !== '1') { out.error(`${row.name} (${state}-${district}) has target_2028 = ${row.target_2028 || '0'}: set it to 1 in members.csv in this data/ PR, citing the recorded roll call (primary-2028 §1.1)`); return 1; }
  if (!row.rc243) { out.error(`${row.name} has no rc243 roll-call vote on file; a target needs a recorded vote to keep the section (primary-2028 §1.1)`); return 1; }
  const elections = parseElections(parseCsv(readFileSync(join(dataDir, 'elections.csv'), 'utf8')));
  checkElections(elections);
  const election = electionFor(elections, state, district);
  if (!election) { out.error(`no data/elections.csv row for ${state}-${district}: add state,district,primary_date,filing_deadline,source_url from the state election office page`); return 1; }
  if (rollCallUrl && !/^https:\/\//.test(rollCallUrl)) { out.error('roll-call-url must be https'); return 64; }

  const m: Member = {
    bioguide_id: row.bioguide_id, name: row.name, party: row.party as Member['party'], chamber: 'house', state, district,
    dc_phone: row.dc_phone || null, district_phone: row.district_phone || null, contact_form_url: row.contact_form_url || null,
    hasc: Number(row.hasc || 0), conferee: Number(row.conferee || 0), rc243: row.rc243, jrd_april_2026: row.jrd_april_2026 || null,
    btb_cosponsor: Number(row.btb_cosponsor || 0), target_2028: 1, money_url: row.money_url || null,
    district_office_address: row.district_office_address || null, district_office_city: row.district_office_city || null,
    contact_kind: (row.contact_kind || null) as Member['contact_kind'], not_returning: Number(row.not_returning || 0), left_office: row.left_office || null,
  };
  const slug = primarySlug(state, district);
  const goalPath = join(dataDir, 'goals', `${slug}.yaml`);
  const actionPath = join(dataDir, 'actions', `${slug}-call.yaml`);
  for (const p of [goalPath, actionPath]) if (existsSync(p)) { out.error(`${p} exists; edit it instead`); return 1; }
  // stable-data-ids §1: the registry hands out the ids and records them before the YAML is written.
  const registry = readIds(dataDir);
  if (registry.some((r) => r.status === 'live' && (r.slug === slug || r.slug === `${slug}-call`))) { out.error(`data/ids.md already lists ${slug} as live; retire or reuse that row's file instead`); return 1; }
  const goalId = nextId(registry, 'goal');
  const actionId = nextId(registry, 'action');
  appendIdRows(dataDir, [
    { kind: 'goal', id: goalId, slug, status: 'live', since: today },
    { kind: 'action', id: actionId, slug: `${slug}-call`, status: 'live', since: today },
  ]);
  writeFileSync(goalPath, goalYaml(goalId, m, election, rollCallUrl));
  writeFileSync(actionPath, actionYaml(actionId, m));
  out.log(`wrote ${goalPath} (goal id ${goalId})\nwrote ${actionPath} (action id ${actionId})\nappended both to ${join(dataDir, 'ids.md')}\nstatus is upcoming: flip it to active in a data/ PR when the federal goal it follows closes. Run npm test -w worker.`);
  return 0;
}
