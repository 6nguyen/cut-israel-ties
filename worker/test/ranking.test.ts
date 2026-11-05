import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { evaluate, parseRule, rank, topTwo, urgency } from '../src/ranking';
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
  rc243: null, jrd_april_2026: null, btb_cosponsor: 0, target_2028: 0, money_url: null, ...o,
});
const delegation = (house: 'D' | 'R' | null, sens: ('D' | 'R')[]): Delegation => ({
  state: 'XX', district: 1,
  house: house ? member({ party: house }) : null,
  senators: sens.map((p, i) => member({ party: p, chamber: 'senate', district: null, bioguide_id: `S${i}` })),
  state_row: null,
});

describe('urgency (§5.2)', () => {
  it('2 within 14 days, 1.5 within 45, 1 otherwise, 1 when past or missing', () => {
    expect(urgency('2026-11-10', TODAY)).toBe(2);
    expect(urgency('2026-11-18', TODAY)).toBe(2);
    expect(urgency('2026-11-19', TODAY)).toBe(1.5);
    expect(urgency('2026-12-19', TODAY)).toBe(1.5);
    expect(urgency('2026-12-20', TODAY)).toBe(1);
    expect(urgency('2026-10-01', TODAY)).toBe(1);
    expect(urgency(null, TODAY)).toBe(1);
    expect(urgency('', TODAY)).toBe(1);
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
    d.state_row = { state: 'XX', treasurer_name: null, treasurer_phone: null, decider: null, israel_bonds_usd: 1_000_000, holdings_date: null, holdings_source: null, campaign_name: null, campaign_url: null, next_comment_date: null };
    expect(evaluate(bySlug['state-bonds'], d)).toBe(true);
    d.state_row.israel_bonds_usd = null;
    d.state_row.campaign_name = 'Divest';
    expect(evaluate(bySlug['state-bonds'], d)).toBe(true);
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
      expect(topTwo(goals, delegation(house, sens), TODAY).map((g) => g.slug)).toEqual(expected);
    });
  }
  it('D/DD: caucus (2×2=4) beats senate leader (2×1=2) because its date is within 14 days', async () => {
    const r = rank(await repo.activeGoals(), delegation('D', ['D', 'D']), TODAY);
    expect(r.map((x) => [x.goal.slug, x.score])).toEqual([
      ['ndaa-1217', 4.5],
      ['house-caucus', 4],
      ['senate-leader', 2],
    ]);
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
    expect(topTwo([ndaa, state], delegation('D', []), TODAY).map((g) => g.slug)).toEqual(['n', 's']);
    expect(topTwo([ndaa, state], delegation(null, []), TODAY)).toEqual([]);
  });
});
