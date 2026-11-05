import { describe, expect, it } from 'vitest';
import { appendFileSync, cpSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRows, parseCsv } from '../src/load';

const rows = loadRows(join(__dirname, '..', '..', 'data'), '2026-11-04T00:00:00Z');

describe('data/ files', () => {
  it('every action names a goal; every goal has at least one action', () => {
    const ids = new Set(rows.goals.map((g) => g.id));
    for (const a of rows.actions) expect(ids.has(a.goal_id)).toBe(true);
    for (const g of rows.goals) expect(rows.actions.some((a) => a.goal_id === g.id)).toBe(true);
  });
  it('members: the six fixture delegations are complete (house member + two senators)', () => {
    for (const [state, district] of [['CA', 46], ['CA', 23], ['TX', 35], ['TX', 21], ['PA', 1], ['PA', 2]] as const) {
      expect(rows.members.filter((m) => m.state === state && m.chamber === 'house' && m.district === district)).toHaveLength(1);
      expect(rows.members.filter((m) => m.state === state && m.chamber === 'senate')).toHaveLength(2);
    }
    expect(new Set(rows.members.map((m) => m.bioguide_id)).size).toBe(rows.members.length);
  });
  it('states: one row per fixture state', () => {
    expect(rows.states.map((s) => s.state).sort()).toEqual(['CA', 'PA', 'TX']);
  });
  it('positions: every row carries source_url and source_date, and loadRows refuses one without', () => {
    for (const p of rows.positions) {
      expect(p.source_url, `${p.bioguide_id} on goal ${p.goal_id}`).toMatch(/^https?:\/\//);
      expect(p.source_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const copy = mkdtempSync(join(tmpdir(), 'cut-ties-data-'));
    cpSync(join(__dirname, '..', '..', 'data'), copy, { recursive: true });
    const file = readdirSync(join(copy, 'positions')).find((f) => f.endsWith('.csv'))!;
    appendFileSync(join(copy, 'positions', file), 'C001110,for,,,hand\n');
    expect(() => loadRows(copy, '2026-11-04T00:00:00Z')).toThrow(/has no source/);
  });
  it('parseCsv rejects ragged rows', () => {
    expect(() => parseCsv('a,b\n1,2,3')).toThrow(/expected 2/);
  });
  it('parseCsv reads quoted cells with commas and doubled quotes', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([{ a: 'x, y', b: 'say "hi"' }]);
  });
});
