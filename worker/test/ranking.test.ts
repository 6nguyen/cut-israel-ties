import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { evaluate, parseRule, rank, ruleInput, slots, topTwo, urgency } from '../src/ranking';
import { loadRows } from '../src/load';
import { MemoryRepo } from '../src/repo';
import type { Delegation, Goal, Member } from '../src/types';

const DATA = join(__dirname, '..', '..', 'data');
const rows = loadRows(DATA, '2026-11-04T00:00:00Z');
const repo = new MemoryRepo(rows);
const TODAY = new Date('2026-11-04T12:00:00Z');

const member = (o: Partial<Member>): Member => ({
  bioguide_id: 'X', name: 'X', party: 'D', chamber: 'house', state: 'XX', district: 1,
  dc_phone: null, district_phone: null, contact_form_url: null, hasc: 0, conferee: 0,
  rc243: null, jrd_april_2026: null, btb_cosponsor: 0, target_2028: 0, money_url: null, district_office_address: null, district_office_city: null,
  contact_kind: null, not_returning: 0, left_office: null, caucus: 'D', ...o,
});
const delegation = (house: 'D' | 'R' | null, sens: ('D' | 'R')[]): Delegation => {
  const h = house ? member({ party: house, caucus: house }) : null;
  const s = sens.map((p, i) => member({ party: p, caucus: p, chamber: 'senate', district: null, bioguide_id: `S${i}` }));
  return { state: 'XX', district: 1, house: h, senators: s, state_row: null, incoming: { house: h, senators: s, uncalled: [] } };
};

describe('urgency (urgency-and-readability §3)', () => {
  it('3 on the decision day, falling linearly to 1 at 90 days; 1 when past or missing', () => {
    expect(urgency('2026-11-04', TODAY)).toBe(3); // 0 days
    expect(urgency('2026-11-16', TODAY)).toBe(2.733); // 12 days
    expect(urgency('2026-12-08', TODAY)).toBe(2.244); // 34 days
    expect(urgency('2026-12-19', TODAY)).toBe(2); // 45 days
    expect(urgency('2027-02-02', TODAY)).toBe(1); // 90 days
    expect(urgency('2027-03-04', TODAY)).toBe(1); // 120 days
    expect(urgency('2026-11-03', TODAY)).toBe(1); // yesterday
    expect(urgency('2026-10-01', TODAY)).toBe(1);
    expect(urgency(null, TODAY)).toBe(1);
    expect(urgency('', TODAY)).toBe(1);
    expect(urgency('not a date', TODAY)).toBe(1);
  });
  it('is monotone: a nearer date never scores lower', () => {
    let prev = Infinity;
    for (let i = 0; i <= 120; i++) {
      const d = new Date(Date.UTC(2026, 10, 4 + i)).toISOString().slice(0, 10);
      const u = urgency(d, TODAY);
      expect(u, d).toBeLessThanOrEqual(prev);
      expect(u).toBeGreaterThanOrEqual(1);
      expect(u).toBeLessThanOrEqual(3);
      prev = u;
    }
  });
});

describe('eligibility rules (§5.3)', () => {
  const bySlug = Object.fromEntries(rows.goals.map((g) => [g.slug, parseRule(g.eligibility)]));
  it('NDAA: any member exists', () => {
    expect(evaluate(bySlug['ndaa-1217'], delegation('R', ['R', 'R']))).toBe(true);
    expect(evaluate(bySlug['ndaa-1217'], delegation(null, []))).toBe(false);
  });
  it('Senate leader: any Democratic senator', () => {
    expect(evaluate(bySlug['senate-leader'], delegation('R', ['D', 'R']))).toBe(true);
    expect(evaluate(bySlug['senate-leader'], delegation('D', ['R', 'R']))).toBe(false);
  });
  it('House caucus: Democratic house member', () => {
    expect(evaluate(bySlug['house-caucus'], delegation('D', ['R', 'R']))).toBe(true);
    expect(evaluate(bySlug['house-caucus'], delegation('R', ['D', 'D']))).toBe(false);
  });
  it('State bonds: holdings or a campaign', () => {
    const d = delegation('R', ['R', 'R']);
    expect(evaluate(bySlug['state-bonds'], d)).toBe(false);
    d.state_row = { state: 'XX', treasurer_name: null, treasurer_phone: null, decider: null, israel_bonds_usd: 1_000_000, holdings_date: null, holdings_source: null, campaign_name: null, campaign_url: null, next_comment_date: null, holdings_status: 'held' };
    expect(evaluate(bySlug['state-bonds'], d)).toBe(true);
    d.state_row.israel_bonds_usd = null;
    d.state_row.campaign_name = 'Divest';
    expect(evaluate(bySlug['state-bonds'], d)).toBe(true);
  });
  it('rules may test only the §5.1 inputs, with the right value types', () => {
    const bad = [
      '{"house":{"partyy":"D"}}',
      '{"house":{"party":"X"}}',
      '{"house":{"hasc":true}}',
      '{"senator":{"hasc":1}}',
      '{"state":{"nonempty":["state"]}}',
      '{"state":{}}',
      '{"all":[]}',
      '{"always":false}',
      '{"house":{},"senator":{}}',
      '[]',
      'not json',
    ];
    for (const b of bad) expect(() => parseRule(b), b).toThrow();
    const good = [
      '{"always":true}',
      '{"house":{"party":"R","hasc":1,"conferee":0,"btb_cosponsor":1,"rc243":"yes"}}',
      '{"senator":{"party":"D","jrd_april_2026":"yes"}}',
      '{"all":[{"any":[{"house":{}}]},{"state":{"nonempty":["israel_bonds_usd"]}}]}',
    ];
    for (const g of good) expect(() => parseRule(g), g).not.toThrow();
  });
  it('flag rules match the seeded integer flags', () => {
    const d = delegation('D', ['D', 'D']);
    d.house = member({ party: 'D', hasc: 1, conferee: 1 });
    expect(evaluate(parseRule('{"house":{"hasc":1}}'), d)).toBe(true);
    expect(evaluate(parseRule('{"house":{"conferee":0}}'), d)).toBe(false);
    expect(evaluate(parseRule('{"all":[{"house":{"party":"D"}},{"senator":{"party":"R"}}]}'), d)).toBe(false);
  });
  it('every seeded goal rule validates', () => {
    for (const g of rows.goals) expect(() => parseRule(g.eligibility), g.slug).not.toThrow();
  });
  it('unknown rule keys throw', () => {
    expect(() => evaluate({ bogus: 1 } as never, delegation('D', []))).toThrow(/unknown eligibility/);
  });
});

describe('ranking table (§5.4): six delegations', () => {
  const cases: [string, 'D' | 'R', ('D' | 'R')[], string[]][] = [
    ['D/DD', 'D', ['D', 'D'], ['ndaa-1217', 'house-caucus']],
    ['D/RR', 'D', ['R', 'R'], ['ndaa-1217', 'house-caucus']],
    ['R/DD', 'R', ['D', 'D'], ['ndaa-1217', 'senate-leader']],
    ['R/RR', 'R', ['R', 'R'], ['ndaa-1217', 'state-bonds']],
    ['R/DR', 'R', ['D', 'R'], ['ndaa-1217', 'senate-leader']],
    ['D/DR', 'D', ['D', 'R'], ['ndaa-1217', 'house-caucus']],
  ];
  for (const [label, house, sens, expected] of cases) {
    it(`${label} → ${expected.join(' + ')}`, async () => {
      const goals = await repo.activeGoals();
      expect(topTwo(goals, delegation(house, sens), TODAY).map((s) => s.goal.slug)).toEqual(expected);
    });
  }
  it('D/DD: impact × urgency; ndaa-1217 (3 × 2.2, 36 days) leads house-caucus (2 × 2.689, 14 days) and senate-leader (2 × 1.622, 62 days)', async () => {
    const r = rank(await repo.activeGoals(), delegation('D', ['D', 'D']), TODAY);
    expect(r.map((x) => [x.goal.slug, x.score])).toEqual([
      ['ndaa-1217', 6.6],
      ['house-caucus', 5.378],
      ['senate-leader', 3.244],
    ]);
  });
  it('impact dominates: an impact-3 goal inside 45 days beats an impact-2 goal deciding today; an exact tie goes to the nearer date', () => {
    const base = rows.goals[0];
    const mk = (slug: string, priority: number, date: string): Goal => ({ ...base, slug, priority, decision_date: date, eligibility: '{"always":true}' });
    const d = delegation('D', []);
    expect(rank([mk('two-today', 2, '2026-11-04'), mk('three-44', 3, '2026-12-18')], d, TODAY).map((x) => x.goal.slug)).toEqual(['three-44', 'two-today']);
    expect(rank([mk('three-year', 3, '2027-11-04'), mk('one-today', 1, '2026-11-04')], d, TODAY).map((x) => [x.goal.slug, x.score])).toEqual([['one-today', 3], ['three-year', 3]]);
  });
  it('ties break on the earlier decision date', () => {
    const base = rows.goals[0];
    const mk = (slug: string, date: string): Goal => ({ ...base, slug, decision_date: date, priority: 1, eligibility: '{"always":true}' });
    const out = rank([mk('b', '2027-06-01'), mk('a', '2027-05-01')], delegation('D', []), TODAY);
    expect(out.map((x) => x.goal.slug)).toEqual(['a', 'b']);
  });
  it('one eligible goal → state goal is the second card; none → empty', () => {
    const base = rows.goals[0];
    const ndaa: Goal = { ...base, slug: 'n', category: 'federal_vote', eligibility: '{"house":{}}' };
    const state: Goal = { ...base, slug: 's', category: 'state', eligibility: '{"state":{"nonempty":["campaign_name"]}}' };
    expect(topTwo([ndaa, state], delegation('D', []), TODAY).map((s) => s.goal.slug)).toEqual(['n', 's']);
    expect(topTwo([ndaa, state], delegation(null, []), TODAY)).toEqual([]);
  });
});
