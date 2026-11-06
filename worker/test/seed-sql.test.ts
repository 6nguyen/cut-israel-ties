// deployment spec §3: a reseed keeps every goal and action row that production tables reference by id.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadRows } from '../src/load';
import { REPLACED_TABLES, UPSERTED_TABLES, renderSeedSql } from '../scripts/seed-sql';

const rows = loadRows(join(__dirname, '..', '..', 'data'), '2026-11-04T00:00:00Z');
const sql = renderSeedSql(rows, '2026-11-06T00:00:00Z');
// Values span lines (markdown fields), so statements are located by prefix in the whole text, not by line.
const count = (needle: string) => sql.split(needle).length - 1;
const at = (s: string) => { const i = sql.indexOf(s); expect(i, s).toBeGreaterThanOrEqual(0); return i; };

describe('seed.sql', () => {
  it('never deletes goals or actions wholesale: they are upserted by id and only vanished ids are dropped', () => {
    for (const t of UPSERTED_TABLES) {
      expect(sql).not.toMatch(new RegExp(`DELETE FROM ${t};`));
      const ids = (rows[t] as { id: number }[]).map((r) => r.id);
      expect(count(`\nINSERT INTO ${t} (`)).toBe(ids.length);
      expect(count(`) ON CONFLICT(id) DO UPDATE SET "slug" = excluded."slug"`)).toBeGreaterThanOrEqual(ids.length);
      expect(sql).toContain(`DELETE FROM ${t} WHERE id NOT IN (${ids.join(',')});`);
    }
  });
  it('upserts goals before actions and drops stale actions before stale goals (actions reference goals)', () => {
    expect(at('INSERT INTO goals ')).toBeLessThan(at('INSERT INTO actions '));
    expect(at('DELETE FROM actions WHERE')).toBeLessThan(at('DELETE FROM goals WHERE'));
    expect(at('DELETE FROM goals WHERE')).toBeLessThan(at('INSERT INTO members '));
  });
  it('replaces the five unreferenced tables, children deleted before parents', () => {
    expect(sql.split('\n')[1]).toBe(`DELETE FROM ${REPLACED_TABLES.join('; DELETE FROM ')};`);
    expect(REPLACED_TABLES.indexOf('positions')).toBeLessThan(REPLACED_TABLES.indexOf('members'));
    expect(REPLACED_TABLES.indexOf('district_offices')).toBeLessThan(REPLACED_TABLES.indexOf('members'));
    expect(REPLACED_TABLES.indexOf('members_elect')).toBeLessThan(REPLACED_TABLES.indexOf('members'));
    expect(sql).not.toContain('PRAGMA');
  });
  it('touches no production table', () => {
    for (const t of ['receipts', 'reports', 'generations', 'screenings', 'blocks', 'digest_runs', 'visits', 'visit_requests']) expect(sql).not.toMatch(new RegExp(`\\b(INSERT INTO|DELETE FROM|UPDATE)\\s+${t}\\b`));
  });
});
