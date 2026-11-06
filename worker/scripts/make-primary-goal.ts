// primary-2028 §1.1: write the electoral goal and its one action for a targeted
// seat from the member's row, data/elections.csv and the templates in
// src/electoral.ts. It never edits members.csv or elections.csv: set
// `target_2028 = 1` (with the rc243 roll call) and add the elections row in
// the same data/ PR, citing the roll call; the seed refuses anything else.
//   npm run make-primary-goal -w worker -- <STATE> <district> [roll-call-url]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../src/load';
import { actionYaml, checkElections, electionFor, goalYaml, parseElections, primarySlug } from '../src/electoral';
import type { Member } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', '..', 'data');

function main(argv: string[]): number {
  const [stateArg, districtArg, rollCallUrl] = argv;
  const state = (stateArg ?? '').toUpperCase();
  const district = Number(districtArg);
  if (!/^[A-Z]{2}$/.test(state) || !Number.isInteger(district) || district < 0) {
    console.error('usage: npm run make-primary-goal -w worker -- <STATE> <district> [roll-call-url]');
    return 64;
  }
  const row = parseCsv(readFileSync(join(DATA, 'members.csv'), 'utf8')).find((r) => r.chamber === 'house' && r.state === state && Number(r.district) === district);
  if (!row) { console.error(`no House member on file for ${state}-${district}`); return 1; }
  if (row.target_2028 !== '1') { console.error(`${row.name} (${state}-${district}) has target_2028 = ${row.target_2028 || '0'}: set it to 1 in members.csv in this data/ PR, citing the recorded roll call (primary-2028 §1.1)`); return 1; }
  if (!row.rc243) { console.error(`${row.name} has no rc243 roll-call vote on file; a target needs a recorded vote to keep the section (primary-2028 §1.1)`); return 1; }
  const elections = parseElections(parseCsv(readFileSync(join(DATA, 'elections.csv'), 'utf8')));
  checkElections(elections);
  const election = electionFor(elections, state, district);
  if (!election) { console.error(`no data/elections.csv row for ${state}-${district}: add state,district,primary_date,filing_deadline,source_url from the state election office page`); return 1; }
  if (rollCallUrl && !/^https:\/\//.test(rollCallUrl)) { console.error('roll-call-url must be https'); return 64; }

  const m: Member = {
    bioguide_id: row.bioguide_id, name: row.name, party: row.party as Member['party'], chamber: 'house', state, district,
    dc_phone: row.dc_phone || null, district_phone: row.district_phone || null, contact_form_url: row.contact_form_url || null,
    hasc: Number(row.hasc || 0), conferee: Number(row.conferee || 0), rc243: row.rc243, jrd_april_2026: row.jrd_april_2026 || null,
    btb_cosponsor: Number(row.btb_cosponsor || 0), target_2028: 1, money_url: row.money_url || null,
    district_office_address: row.district_office_address || null, district_office_city: row.district_office_city || null,
    contact_kind: (row.contact_kind || null) as Member['contact_kind'], not_returning: Number(row.not_returning || 0), left_office: row.left_office || null,
  };
  const slug = primarySlug(state, district);
  const goalPath = join(DATA, 'goals', `${slug}.yaml`);
  const actionPath = join(DATA, 'actions', `${slug}-call.yaml`);
  for (const p of [goalPath, actionPath]) if (existsSync(p)) { console.error(`${p} exists; edit it instead`); return 1; }
  writeFileSync(goalPath, goalYaml(m, election, rollCallUrl));
  writeFileSync(actionPath, actionYaml(m));
  console.log(`wrote ${goalPath}\nwrote ${actionPath}\nstatus is upcoming: flip it to active in a data/ PR when the federal goal it follows closes. Run npm test -w worker.`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
