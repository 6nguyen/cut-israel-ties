// District-office import (roster-freshness §1): unitedstates/congress-legislators
// `legislators-district-offices.yaml` (CC0) → data/district_offices.csv, one row per office.
//   npm run import-offices -w worker            downloads the file from raw `main`
//   npm run import-offices -w worker -- <file>  reads a downloaded copy
// Rows sort by bioguide_id, then office_id; an office whose member is not in members.csv is
// dropped; a phone that is not ten digits is cleared (the row stays) and printed. Idempotent:
// the output depends only on the two inputs. The seed checks (load.ts checkOffices) gate it.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { parseCsv, tenDigitPhone } from '../src/load';

export const OFFICES_URL = 'https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-district-offices.yaml';
const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
export const OFFICE_HEADER = ['bioguide_id', 'office_id', 'city', 'state', 'zip', 'address', 'suite', 'building', 'phone', 'fax', 'hours', 'lat', 'lng'];

interface YamlOffice { id: string; city?: string; state?: string; zip?: string | number; address?: string; suite?: string; building?: string; phone?: string; fax?: string; hours?: string; latitude?: number; longitude?: number }
interface YamlEntry { id: { bioguide: string }; offices?: YamlOffice[] }

const cell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const s = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());

/** The CSV rows for every office of a known member, sorted; `dropped` lists the phones that were not ten digits. */
export function officeRows(yamlText: string, memberIds: Set<string>): { rows: Record<string, string>[]; dropped: string[]; skippedMembers: number } {
  const entries = parseYaml(yamlText) as YamlEntry[];
  const rows: Record<string, string>[] = [];
  const dropped: string[] = [];
  let skippedMembers = 0;
  for (const e of entries) {
    if (!memberIds.has(e.id.bioguide)) { skippedMembers++; continue; }
    for (const o of e.offices ?? []) {
      const phone = tenDigitPhone(o.phone);
      if (o.phone && !phone) dropped.push(`${o.id} ${o.phone}`);
      rows.push({
        bioguide_id: e.id.bioguide,
        office_id: s(o.id) || `${e.id.bioguide}-${s(o.city).toLowerCase().replace(/\s+/g, '-')}`,
        city: s(o.city),
        state: s(o.state).toUpperCase(),
        zip: s(o.zip),
        address: s(o.address),
        suite: s(o.suite),
        building: s(o.building),
        phone: phone ?? '',
        fax: tenDigitPhone(o.fax) ?? '',
        hours: s(o.hours),
        lat: s(o.latitude),
        lng: s(o.longitude),
      });
    }
  }
  rows.sort((a, b) => a.bioguide_id.localeCompare(b.bioguide_id) || a.office_id.localeCompare(b.office_id));
  return { rows, dropped, skippedMembers };
}

export function toOfficesCsv(rows: Record<string, string>[]): string {
  return [OFFICE_HEADER.join(','), ...rows.map((r) => OFFICE_HEADER.map((h) => cell(r[h] ?? '')).join(','))].join('\n') + '\n';
}

async function main(): Promise<void> {
  const src = process.argv[2];
  const text = src ? readFileSync(src, 'utf8') : await fetchText(OFFICES_URL);
  const memberIds = new Set(parseCsv(readFileSync(join(DATA, 'members.csv'), 'utf8')).map((r) => r.bioguide_id));
  const { rows, dropped, skippedMembers } = officeRows(text, memberIds);
  writeFileSync(join(DATA, 'district_offices.csv'), toOfficesCsv(rows));
  const withOffice = new Set(rows.map((r) => r.bioguide_id)).size;
  console.log(`district_offices.csv: ${rows.length} offices for ${withOffice} of ${memberIds.size} members; ${skippedMembers} upstream entries not in members.csv skipped`);
  for (const d of dropped) console.log(`phone dropped (not ten digits): ${d}`);
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

if (process.argv[1] && /import-offices\.ts$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
