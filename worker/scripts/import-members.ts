// Roster import (member-pages spec §1): unitedstates/congress-legislators
// `legislators-current.yaml` (public domain) → data/members.csv.
//   npm run import-members -w worker            downloads the dataset
//   npm run import-members -w worker -- <file>  reads a downloaded copy
// Existing rows keep their flag columns; new rows get empty flags; a row in
// the file but not in the dataset is kept and printed as "stale". Running it
// is a data/ PR like any other; the seed checks (load.ts) gate the result.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { parseCsv } from '../src/load';

const URL_ = 'https://unitedstates.github.io/congress-legislators/legislators-current.yaml';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'members.csv');
const HEADER = ['bioguide_id', 'name', 'party', 'chamber', 'state', 'district', 'dc_phone', 'district_phone', 'contact_form_url', 'hasc', 'conferee', 'rc243', 'jrd_april_2026', 'btb_cosponsor', 'target_2028', 'money_url', 'district_office_address', 'district_office_city'];
const FROM_DATASET = new Set(['party', 'chamber', 'state', 'district', 'dc_phone', 'contact_form_url']);
const PARTY: Record<string, string> = { Democrat: 'D', Republican: 'R', Independent: 'I' };

interface Term { type: 'rep' | 'sen'; state: string; district?: number; party: string; phone?: string; contact_form?: string; start: string; end: string }
interface Legislator { id: { bioguide: string }; name: { first: string; last: string; official_full?: string }; terms: Term[] }

const cell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function rosterRows(yamlText: string): Record<string, string>[] {
  const people = parseYaml(yamlText) as Legislator[];
  return people.map((p) => {
    const t = p.terms[p.terms.length - 1];
    const party = PARTY[t.party];
    if (!party) throw new Error(`${p.id.bioguide}: unknown party ${t.party}`);
    return {
      bioguide_id: p.id.bioguide,
      name: p.name.official_full ?? `${p.name.first} ${p.name.last}`,
      party,
      chamber: t.type === 'sen' ? 'senate' : 'house',
      state: t.state,
      district: t.type === 'sen' ? '' : String(t.district ?? 0),
      dc_phone: t.phone ?? '',
      contact_form_url: t.contact_form ?? '',
    };
  });
}

/** Merge the dataset into the current file: dataset columns refresh, flags persist, missing rows stay (stale). */
export function merge(existing: Record<string, string>[], roster: Record<string, string>[]): { rows: Record<string, string>[]; stale: string[]; added: number } {
  const byId = new Map(existing.map((r) => [r.bioguide_id, r]));
  const seen = new Set<string>();
  let added = 0;
  const rows = roster.map((r) => {
    seen.add(r.bioguide_id);
    const old = byId.get(r.bioguide_id);
    if (!old) added++;
    const out: Record<string, string> = {};
    out.bioguide_id = r.bioguide_id;
    out.name = old?.name || r.name; // the file's common name (what a caller says) wins over official_full
    for (const h of HEADER.slice(2)) out[h] = FROM_DATASET.has(h) ? (r[h] || old?.[h] || '') : (old?.[h] ?? '');
    return out;
  });
  const stale = existing.filter((r) => !seen.has(r.bioguide_id)).map((r) => `${r.bioguide_id} ${r.name} (${r.state}${r.district ? '-' + r.district : ''})`);
  for (const r of existing) if (!seen.has(r.bioguide_id)) rows.push(Object.fromEntries(HEADER.map((h) => [h, r[h] ?? ''])));
  const chamber = (c: string) => (c === 'house' ? 0 : 1);
  rows.sort((a, b) => a.state.localeCompare(b.state) || chamber(a.chamber) - chamber(b.chamber) || Number(a.district || 0) - Number(b.district || 0) || a.name.localeCompare(b.name));
  return { rows, stale, added };
}

export function toCsv(rows: Record<string, string>[]): string {
  return [HEADER.join(','), ...rows.map((r) => HEADER.map((h) => cell(r[h] ?? '')).join(','))].join('\n') + '\n';
}

async function main(): Promise<void> {
  const src = process.argv[2];
  const text = src ? readFileSync(src, 'utf8') : await (await fetch(URL_)).text();
  const roster = rosterRows(text);
  const existing = parseCsv(readFileSync(OUT, 'utf8'));
  const { rows, stale, added } = merge(existing, roster);
  writeFileSync(OUT, toCsv(rows));
  const house = roster.filter((r) => r.chamber === 'house').length;
  console.log(`members.csv: ${rows.length} rows (${house} house incl. delegates, ${roster.length - house} senate); ${added} added, ${existing.length - stale.length} refreshed`);
  for (const s of stale) console.log(`stale: ${s}`);
}

if (process.argv[1] && /import-members\.ts$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
