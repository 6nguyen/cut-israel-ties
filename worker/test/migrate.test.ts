// deployment spec §3: columns added after provisioning reach production through seed-remote's migrate step.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS, columnsOf, pending } from '../scripts/migrate';

const schema = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf8');

describe('column migrations', () => {
  it('every migration names a column schema.sql also creates, with the same type', () => {
    for (const m of MIGRATIONS) {
      const col = new RegExp(`^  ${m.column} ([^,]+),?$`, 'm').exec(schema.slice(schema.indexOf(`CREATE TABLE ${m.table} (`)));
      expect(col, `${m.table}.${m.column} in schema.sql`).not.toBeNull();
      expect(m.ddl).toBe(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${col![1]};`);
    }
  });
  it('columnsOf reads wrangler --json output and tolerates noise, a missing table and bad JSON', () => {
    const out = 'npx warning\n[{"results":[{"cid":0,"name":"id"},{"cid":1,"name":"slug"}],"success":true}]\n';
    expect(columnsOf(out)).toEqual(['id', 'slug']);
    expect(columnsOf('error: no such table')).toEqual([]);
    expect(columnsOf('[not json')).toEqual([]);
  });
  it('pending lists only the columns a present table lacks; an absent table gets nothing (schema.sql creates it whole)', () => {
    const ms = [
      { table: 'goals', column: 'a', ddl: 'A' },
      { table: 'goals', column: 'b', ddl: 'B' },
      { table: 'members', column: 'c', ddl: 'C' },
    ];
    expect(pending({ goals: ['id', 'a'] }, ms).map((m) => m.column)).toEqual(['b']);
    expect(pending({ goals: ['id', 'a', 'b'], members: ['id', 'c'] }, ms)).toEqual([]);
    expect(pending({}, ms)).toEqual([]);
    expect(pending({ goals: [] }, ms)).toEqual([]);
  });
});
