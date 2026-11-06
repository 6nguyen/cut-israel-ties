// stable-data-ids §1-2: data/ids.md is the registry of every goal and action id ever
// published. Ids are assigned once, never changed and never reused; the next free id
// for a kind is the highest ever used (live or retired) plus one. Node-only (fs).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ID_KINDS = ['goal', 'action'] as const;
export type IdKind = (typeof ID_KINDS)[number];
export const ID_STATUSES = ['live', 'retired'] as const;
export type IdStatus = (typeof ID_STATUSES)[number];

export interface IdRow {
  kind: IdKind;
  id: number;
  slug: string;
  status: IdStatus;
  since: string; // YYYY-MM-DD
}

export const IDS_FILE = 'ids.md';
export const IDS_HEADER = ['kind', 'id', 'slug', 'status', 'since'] as const;

const isRow = (line: string): boolean => line.trim().startsWith('|');
const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** Parse the registry table. Throws on a malformed table, a duplicate (kind, id) or a duplicate live (kind, slug). */
export function parseIds(text: string): IdRow[] {
  const lines = text.split('\n').filter(isRow);
  if (lines.length < 2) throw new Error(`${IDS_FILE}: no table found (expected a header row | ${IDS_HEADER.join(' | ')} |)`);
  const header = cells(lines[0]);
  if (header.join(',') !== IDS_HEADER.join(',')) throw new Error(`${IDS_FILE}: header is | ${header.join(' | ')} |, expected | ${IDS_HEADER.join(' | ')} |`);
  const rows: IdRow[] = [];
  const seenId = new Set<string>();
  const seenSlug = new Set<string>();
  for (const line of lines.slice(2)) {
    const c = cells(line);
    if (c.length !== IDS_HEADER.length) throw new Error(`${IDS_FILE}: row "${line.trim()}" has ${c.length} cells, expected ${IDS_HEADER.length}`);
    const [kind, idText, slug, status, since] = c;
    if (!(ID_KINDS as readonly string[]).includes(kind)) throw new Error(`${IDS_FILE}: row ${slug}: kind must be ${ID_KINDS.join(' | ')}, got ${kind}`);
    const id = Number(idText);
    if (!/^\d+$/.test(idText) || !Number.isInteger(id) || id < 1) throw new Error(`${IDS_FILE}: ${kind} ${slug}: id must be a positive integer, got ${idText}`);
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`${IDS_FILE}: ${kind} ${id}: slug must be a kebab-case slug, got ${slug}`);
    if (!(ID_STATUSES as readonly string[]).includes(status)) throw new Error(`${IDS_FILE}: ${kind} ${id} (${slug}): status must be ${ID_STATUSES.join(' | ')}, got ${status}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error(`${IDS_FILE}: ${kind} ${id} (${slug}): since must be YYYY-MM-DD, got ${since}`);
    const idKey = `${kind}:${id}`;
    if (seenId.has(idKey)) throw new Error(`${IDS_FILE}: ${kind} id ${id} is listed twice (an id is never reused)`);
    seenId.add(idKey);
    if (status === 'live') {
      const slugKey = `${kind}:${slug}`;
      if (seenSlug.has(slugKey)) throw new Error(`${IDS_FILE}: ${kind} slug ${slug} is live twice`);
      seenSlug.add(slugKey);
    }
    rows.push({ kind: kind as IdKind, id, slug, status: status as IdStatus, since });
  }
  return rows;
}

/** Read and parse `<dataDir>/ids.md`. */
export const readIds = (dataDir: string): IdRow[] => parseIds(readFileSync(join(dataDir, IDS_FILE), 'utf8'));

/** The next free id for a kind: highest ever used (live or retired) plus one; 1 for an empty registry. */
export const nextId = (rows: IdRow[], kind: IdKind): number => rows.filter((r) => r.kind === kind).reduce((m, r) => Math.max(m, r.id), 0) + 1;

export const formatIdRow = (r: IdRow): string => `| ${r.kind} | ${r.id} | ${r.slug} | ${r.status} | ${r.since} |`;

/** Append rows to the registry table in `<dataDir>/ids.md` (after its last table row). Re-parses the result so a bad row never lands. */
export function appendIdRows(dataDir: string, rows: IdRow[]): void {
  const path = join(dataDir, IDS_FILE);
  const lines = readFileSync(path, 'utf8').split('\n');
  let last = -1;
  lines.forEach((l, i) => { if (isRow(l)) last = i; });
  if (last < 1) throw new Error(`${IDS_FILE}: no table to append to`);
  lines.splice(last + 1, 0, ...rows.map(formatIdRow));
  const text = lines.join('\n');
  parseIds(text);
  writeFileSync(path, text);
}

/**
 * Loader guard (§2): the YAML `id` of a goal or action file must be a positive integer,
 * unique within its kind, registered `live` in ids.md under the same slug, and never a
 * retired id. `file` names the YAML file in every message.
 */
export function checkId(registry: IdRow[], kind: IdKind, file: string, slug: string, raw: unknown, seen: Set<number>): number {
  if (raw === undefined || raw === null || raw === '') throw new Error(`${kind} ${file}: missing id (assign the next free ${kind} id from data/ids.md)`);
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) throw new Error(`${kind} ${file}: id must be a positive integer, got ${JSON.stringify(raw)}`);
  if (seen.has(raw)) throw new Error(`${kind} ${file}: id ${raw} is already used by another ${kind} file`);
  seen.add(raw);
  const row = registry.find((r) => r.kind === kind && r.id === raw);
  if (!row) throw new Error(`${kind} ${file}: id ${raw} is not registered in data/ids.md (add a live row; the next free id is ${nextId(registry, kind)})`);
  if (row.status === 'retired') throw new Error(`${kind} ${file}: id ${raw} was retired (${row.slug}, since ${row.since}) and is never reused; the next free id is ${nextId(registry, kind)}`);
  if (row.slug !== slug) throw new Error(`${kind} ${file}: id ${raw} is registered to slug ${row.slug} in data/ids.md, not ${slug}`);
  return raw;
}
