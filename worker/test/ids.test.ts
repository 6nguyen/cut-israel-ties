// stable-data-ids §1-3: goal and action ids come from the YAML, are registered in
// data/ids.md, and never move. The frozen table below is the review gate: a change to
// a committed id or slug fails here before any seed runs. Editing it is the explicit
// act of publishing a new id (append) or retiring one (status flip); never renumber.
import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendIdRows, nextId, parseIds, readIds, type IdRow } from '../src/ids';
import { loadRows } from '../src/load';
import { makePrimaryGoal } from '../src/make-primary-goal';

const DATA = join(__dirname, '..', '..', 'data');
const AT = '2026-11-04T00:00:00Z';

/** Frozen registry: every id ever published, by kind. Append only; flip to retired, never delete. */
const FROZEN: Record<'goal' | 'action', Record<number, { slug: string; status: 'live' | 'retired' }>> = {
  goal: {
    1: { slug: 'house-caucus', status: 'live' },
    2: { slug: 'ndaa-1217', status: 'live' },
    3: { slug: 'ndaa-report-vote', status: 'live' },
    4: { slug: 'senate-leader', status: 'live' },
    5: { slug: 'state-bonds', status: 'live' },
  },
  action: {
    1: { slug: 'house-caucus-call', status: 'live' },
    2: { slug: 'ndaa-1217-call', status: 'live' },
    3: { slug: 'ndaa-report-vote-call', status: 'live' },
    4: { slug: 'senate-leader-call', status: 'live' },
    5: { slug: 'state-bonds-call', status: 'live' },
  },
};

function copy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cut-ties-ids-'));
  cpSync(DATA, dir, { recursive: true });
  return dir;
}
const editGoal = (dir: string, slug: string, edit: (y: string) => string): void => {
  const p = join(dir, 'goals', `${slug}.yaml`);
  writeFileSync(p, edit(readFileSync(p, 'utf8')));
};
const editIds = (dir: string, edit: (t: string) => string): void => {
  const p = join(dir, 'ids.md');
  writeFileSync(p, edit(readFileSync(p, 'utf8')));
};
const live = (rows: IdRow[], kind: IdRow['kind']) => rows.filter((r) => r.kind === kind && r.status === 'live').map((r) => [r.id, r.slug] as const).sort((a, b) => a[0] - b[0]);

describe('§3 frozen registry', () => {
  const registry = readIds(DATA);
  const rows = loadRows(DATA, AT);

  it('data/ids.md is exactly the frozen table (same ids, same slugs, same status, nothing extra)', () => {
    for (const kind of ['goal', 'action'] as const) {
      const table = Object.fromEntries(registry.filter((r) => r.kind === kind).map((r) => [r.id, { slug: r.slug, status: r.status }]));
      expect(table, kind).toEqual(FROZEN[kind]);
    }
  });
  it('the committed YAML rows match the live registry rows exactly', () => {
    expect(rows.goals.map((g) => [g.id, g.slug] as const).sort((a, b) => a[0] - b[0])).toEqual(live(registry, 'goal'));
    expect(rows.actions.map((a) => [a.id, a.slug] as const).sort((a, b) => a[0] - b[0])).toEqual(live(registry, 'action'));
  });
  it('today\'s data/ yields the ids a D1 seeded before the change holds (goals 1-5, actions 1-5 in sorted file order)', () => {
    expect(rows.goals.map((g) => g.id)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.actions.map((a) => [a.id, a.goal_id])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]);
  });
  it('removing a goal file (with its action and positions) leaves every other id and goal_id unchanged', () => {
    const dir = copy();
    rmSync(join(dir, 'goals', 'house-caucus.yaml'));
    rmSync(join(dir, 'actions', 'house-caucus-call.yaml'));
    rmSync(join(dir, 'positions', 'house-caucus.csv'), { force: true });
    const after = loadRows(dir, AT);
    expect(after.goals.find((g) => g.slug === 'ndaa-1217')?.id).toBe(2);
    expect(after.goals.map((g) => [g.slug, g.id])).toEqual(rows.goals.filter((g) => g.slug !== 'house-caucus').map((g) => [g.slug, g.id]));
    expect(after.actions.map((a) => [a.slug, a.id, a.goal_id])).toEqual(rows.actions.filter((a) => a.slug !== 'house-caucus-call').map((a) => [a.slug, a.id, a.goal_id]));
  });
});

describe('§2 loader guards', () => {
  it('a goal file without id', () => {
    const dir = copy();
    editGoal(dir, 'ndaa-1217', (y) => y.replace(/^id: .*\n/m, ''));
    expect(() => loadRows(dir, AT)).toThrow(/goal ndaa-1217\.yaml: missing id/);
  });
  it('a non-integer id', () => {
    const dir = copy();
    editGoal(dir, 'ndaa-1217', (y) => y.replace(/^id: .*$/m, 'id: two'));
    expect(() => loadRows(dir, AT)).toThrow(/goal ndaa-1217\.yaml: id must be a positive integer/);
  });
  it('two goals sharing an id', () => {
    const dir = copy();
    editGoal(dir, 'ndaa-1217', (y) => y.replace(/^id: .*$/m, 'id: 1'));
    expect(() => loadRows(dir, AT)).toThrow(/goal ndaa-1217\.yaml: id 1 is already used/);
  });
  it('an id marked retired in data/ids.md', () => {
    const dir = copy();
    editIds(dir, (t) => t.replace('| goal | 2 | ndaa-1217 | live |', '| goal | 2 | ndaa-1217 | retired |'));
    expect(() => loadRows(dir, AT)).toThrow(/goal ndaa-1217\.yaml: id 2 was retired/);
  });
  it('a live id absent from data/ids.md, naming the next free id', () => {
    const dir = copy();
    editGoal(dir, 'ndaa-1217', (y) => y.replace(/^id: .*$/m, 'id: 9'));
    expect(() => loadRows(dir, AT)).toThrow(/goal ndaa-1217\.yaml: id 9 is not registered in data\/ids\.md .*next free id is 6/);
  });
  it('an id registered to another slug', () => {
    const dir = copy();
    editIds(dir, (t) => t.replace('| goal | 2 | ndaa-1217 | live |', '| goal | 2 | ndaa-1218 | live |'));
    expect(() => loadRows(dir, AT)).toThrow(/goal ndaa-1217\.yaml: id 2 is registered to slug ndaa-1218/);
  });
  it('the same guards cover actions', () => {
    const dir = copy();
    const p = join(dir, 'actions', 'state-bonds-call.yaml');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^id: .*$/m, 'id: 1'));
    expect(() => loadRows(dir, AT)).toThrow(/action state-bonds-call\.yaml: id 1 is already used/);
  });
  it('a missing data/ids.md fails the load', () => {
    const dir = copy();
    rmSync(join(dir, 'ids.md'));
    expect(() => loadRows(dir, AT)).toThrow(/ids\.md/);
  });
});

describe('data/ids.md parsing', () => {
  const table = (rows: string) => `# ids\n\n| kind | id | slug | status | since |\n|---|---|---|---|---|\n${rows}`;
  it('reads rows and computes the next free id per kind over live and retired rows', () => {
    const rows = parseIds(table('| goal | 1 | a | live | 2026-11-05 |\n| goal | 7 | b | retired | 2026-11-05 |\n| action | 2 | a-call | live | 2026-11-05 |\n'));
    expect(rows).toHaveLength(3);
    expect(nextId(rows, 'goal')).toBe(8);
    expect(nextId(rows, 'action')).toBe(3);
    expect(nextId([], 'goal')).toBe(1);
  });
  it('rejects a bad header, kind, id, status, date, a duplicate id and a slug live twice', () => {
    expect(() => parseIds('| kind | id | slug |\n|---|---|---|\n')).toThrow(/header/);
    expect(() => parseIds(table('| thing | 1 | a | live | 2026-11-05 |\n'))).toThrow(/kind must be/);
    expect(() => parseIds(table('| goal | 0 | a | live | 2026-11-05 |\n'))).toThrow(/positive integer/);
    expect(() => parseIds(table('| goal | 1 | a | gone | 2026-11-05 |\n'))).toThrow(/status must be/);
    expect(() => parseIds(table('| goal | 1 | a | live | yesterday |\n'))).toThrow(/YYYY-MM-DD/);
    expect(() => parseIds(table('| goal | 1 | a | live | 2026-11-05 |\n| goal | 1 | b | retired | 2026-11-05 |\n'))).toThrow(/listed twice/);
    expect(() => parseIds(table('| goal | 1 | a | live | 2026-11-05 |\n| goal | 2 | a | live | 2026-11-05 |\n'))).toThrow(/live twice/);
  });
  it('appendIdRows adds after the last table row and refuses a row that would break the table', () => {
    const dir = copy();
    appendIdRows(dir, [{ kind: 'goal', id: 6, slug: 'new-goal', status: 'live', since: '2026-11-05' }]);
    expect(readFileSync(join(dir, 'ids.md'), 'utf8').trimEnd().split('\n').pop()).toBe('| goal | 6 | new-goal | live | 2026-11-05 |');
    expect(() => appendIdRows(dir, [{ kind: 'goal', id: 6, slug: 'again', status: 'live', since: '2026-11-05' }])).toThrow(/listed twice/);
    expect(readIds(dir).filter((r) => r.slug === 'again')).toHaveLength(0);
  });
});

describe('§1 make-primary-goal assigns and records the id', () => {
  /** TX-21 flagged as a target with an elections row, the way primary-2028 §1 steps 1-2 leave data/. */
  function target(): string {
    const dir = copy();
    const members = join(dir, 'members.csv');
    const lines = readFileSync(members, 'utf8').split('\n');
    const header = lines[0].split(',');
    const i = lines.findIndex((l) => l.startsWith('R000614,'));
    const cells = lines[i].split(',');
    cells[header.indexOf('rc243')] = 'yes';
    cells[header.indexOf('target_2028')] = '1';
    lines[i] = cells.join(',');
    writeFileSync(members, lines.join('\n'));
    writeFileSync(join(dir, 'elections.csv'), 'state,district,primary_date,filing_deadline,source_url\nTX,21,2028-03-07,2027-12-13,https://www.sos.state.tx.us/elections/\n');
    return dir;
  }
  const quiet = { log: () => {}, error: () => {} };

  it('writes id: 6 on the goal and the action and appends two live rows; the fixture then loads', () => {
    const dir = target();
    expect(makePrimaryGoal(dir, ['TX', '21', 'https://clerk.house.gov/Votes/2026243'], quiet, '2026-11-05')).toBe(0);
    expect(readFileSync(join(dir, 'goals', 'primary-tx-21.yaml'), 'utf8')).toMatch(/^id: 6\b/);
    expect(readFileSync(join(dir, 'actions', 'primary-tx-21-call.yaml'), 'utf8')).toMatch(/^id: 6\b/);
    const added = readIds(dir).filter((r) => r.since === '2026-11-05' && r.slug.startsWith('primary-tx-21'));
    expect(added).toEqual([
      { kind: 'goal', id: 6, slug: 'primary-tx-21', status: 'live', since: '2026-11-05' },
      { kind: 'action', id: 6, slug: 'primary-tx-21-call', status: 'live', since: '2026-11-05' },
    ]);
    const rows = loadRows(dir, AT);
    expect(rows.goals.find((g) => g.slug === 'primary-tx-21')?.id).toBe(6);
    expect(rows.actions.find((a) => a.slug === 'primary-tx-21-call')).toMatchObject({ id: 6, goal_id: 6 });
    expect(rows.goals.filter((g) => g.id <= 5).map((g) => g.id)).toEqual([1, 2, 3, 4, 5]);
  });
  it('skips a retired id: after goal 6 is retired the next goal gets 7', () => {
    const dir = target();
    appendIdRows(dir, [{ kind: 'goal', id: 6, slug: 'old-goal', status: 'retired', since: '2026-11-05' }]);
    expect(makePrimaryGoal(dir, ['TX', '21'], quiet, '2026-11-05')).toBe(0);
    expect(readFileSync(join(dir, 'goals', 'primary-tx-21.yaml'), 'utf8')).toMatch(/^id: 7\b/);
    expect(readFileSync(join(dir, 'actions', 'primary-tx-21-call.yaml'), 'utf8')).toMatch(/^id: 6\b/);
  });
  it('refuses without the target flag and writes nothing to ids.md', () => {
    const dir = copy();
    const before = readFileSync(join(dir, 'ids.md'), 'utf8');
    expect(makePrimaryGoal(dir, ['TX', '21'], quiet, '2026-11-05')).toBe(1);
    expect(readFileSync(join(dir, 'ids.md'), 'utf8')).toBe(before);
    expect(makePrimaryGoal(dir, ['T', 'x'], quiet)).toBe(64);
  });
});
