// primary-2028 §1: electoral goals. No member carries target_2028 = 1 yet, so every
// test builds a temp copy of data/ with TX-21 flagged (rc243 set, an elections.csv row,
// goal + action from the make-primary-goal templates) and loads it the way the seed does.
import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ELECTIONS_HEADER, ELECTORAL_ASK, actionYaml, checkElections, forbiddenPhrases, goalYaml, parseElections, primarySlug,
} from '../src/electoral';
import { loadRows, parseCsv } from '../src/load';
import { electoralSeat, parseRule, rank, topTwo } from '../src/ranking';
import { MemoryRepo } from '../src/repo';
import { buildRoute, goalTargets } from '../src/route';
import { whipTargets } from '../src/whip';
import type { ElectionRow } from '../src/electoral';
import type { Member } from '../src/types';

const DATA = join(__dirname, '..', '..', 'data');
const TODAY = new Date('2026-11-04T12:00:00Z');
const ROY: Member = {
  bioguide_id: 'R000614', name: 'Chip Roy', party: 'R', chamber: 'house', state: 'TX', district: 21,
  dc_phone: '202-225-4236', district_phone: null, contact_form_url: 'https://roy.house.gov/contact', hasc: 0, conferee: 0,
  rc243: 'yes', jrd_april_2026: null, btb_cosponsor: 0, target_2028: 1, money_url: null,
};
const ELECTION: ElectionRow = { state: 'TX', district: 21, primary_date: '2028-03-07', filing_deadline: '2027-12-13', source_url: 'https://www.sos.state.tx.us/elections/' };
const SLUG = primarySlug('TX', 21);
const electionCsv = (e: ElectionRow) => `${ELECTIONS_HEADER.join(',')}\n${e.state},${e.district},${e.primary_date},${e.filing_deadline},${e.source_url}\n`;

interface Opts { flag?: boolean; rc243?: boolean; election?: ElectionRow | null; closeFederal?: boolean; goal?: (y: string) => string }
function dataWith(o: Opts = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'cut-ties-electoral-'));
  cpSync(DATA, dir, { recursive: true });
  const members = join(dir, 'members.csv');
  const lines = readFileSync(members, 'utf8').split('\n');
  const header = lines[0].split(',');
  const i = lines.findIndex((l) => l.startsWith('R000614,'));
  const cells = lines[i].split(',');
  cells[header.indexOf('rc243')] = o.rc243 === false ? '' : 'yes';
  cells[header.indexOf('target_2028')] = o.flag === false ? '' : '1';
  lines[i] = cells.join(',');
  writeFileSync(members, lines.join('\n'));
  if (o.election !== null) writeFileSync(join(dir, 'elections.csv'), electionCsv(o.election ?? ELECTION));
  const goal = goalYaml(ROY, ELECTION, 'https://clerk.house.gov/Votes/2026243');
  writeFileSync(join(dir, 'goals', `${SLUG}.yaml`), o.goal ? o.goal(goal) : goal);
  writeFileSync(join(dir, 'actions', `${SLUG}-call.yaml`), actionYaml(ROY));
  if (o.closeFederal) {
    for (const slug of ['house-caucus', 'ndaa-1217', 'ndaa-report-vote', 'senate-leader']) {
      const p = join(dir, 'goals', `${slug}.yaml`);
      let y = readFileSync(p, 'utf8').replace(/^status: .*$/m, 'status: expired');
      y = /^outcome_note:/m.test(y) ? y.replace(/^outcome_note:.*$/m, 'outcome_note: "Closed for the fixture."') : `${y}\noutcome_note: "Closed for the fixture."\n`;
      writeFileSync(p, y);
    }
  }
  return dir;
}
const load = (o: Opts = {}) => loadRows(dataWith(o), '2026-11-04T00:00:00Z');
const bySlug = (rows: ReturnType<typeof loadRows>, slug: string) => rows.goals.find((g) => g.slug === slug)!;

describe('elections.csv (§1.1)', () => {
  it('the checked-in file has exactly the documented header (no verified dates yet)', () => {
    const text = readFileSync(join(DATA, 'elections.csv'), 'utf8');
    expect(text.split('\n')[0]).toBe(ELECTIONS_HEADER.join(','));
    expect(loadRows(DATA, '2026-11-04T00:00:00Z').elections).toEqual(parseElections(parseCsv(text)));
  });
  it('seed checks: ISO dates that parse, deadline before the primary, https source, known seat, no duplicates', () => {
    const row = (p: Partial<ElectionRow>) => [{ ...ELECTION, ...p }];
    expect(() => checkElections(row({}))).not.toThrow();
    expect(() => checkElections(row({ primary_date: '2028-02-30' }))).toThrow(/primary_date/);
    expect(() => checkElections(row({ filing_deadline: '12/13/2027' }))).toThrow(/filing_deadline/);
    expect(() => checkElections(row({ filing_deadline: '2028-03-08' }))).toThrow(/filing_deadline/);
    expect(() => checkElections(row({ source_url: '' }))).toThrow(/source_url/);
    expect(() => checkElections(row({ source_url: 'http://example.com' }))).toThrow(/source_url/);
    expect(() => checkElections(row({ state: 'Texas' }))).toThrow(/state/);
    expect(() => checkElections([...row({}), ...row({})])).toThrow(/duplicate/i);
    expect(() => load({ election: { ...ELECTION, state: 'ZZ' } })).toThrow(/ZZ/);
  });
  it('the loader folds the row into the goal: decision_date, window_end and a sourced row', () => {
    const g = bySlug(load(), SLUG);
    expect(g.category).toBe('electoral');
    expect(g.status).toBe('upcoming');
    expect(g.priority).toBe(1);
    expect(g.decision_date).toBe(ELECTION.primary_date);
    expect(g.window_end).toBe(ELECTION.filing_deadline);
    expect(JSON.parse(g.sources).some((s: { url: string }) => s.url === ELECTION.source_url)).toBe(true);
  });
  it('an electoral goal without an elections row, or whose member lacks the flag or a roll call, fails the seed', () => {
    expect(() => load({ election: null })).toThrow(/elections\.csv/);
    expect(() => load({ flag: false })).toThrow(/target_2028/);
    expect(() => load({ rc243: false })).toThrow(/rc243/);
    expect(() => load({ goal: (y) => y.replace(/^priority: .*$/m, 'priority: 5') })).toThrow(/priority 1/);
  });
});

describe('eligibility (§1.1, §5.1 grammar)', () => {
  it('parses the seat and rejects other shapes', () => {
    expect(electoralSeat(JSON.stringify({ house: { target_2028: 1, state: 'TX', district: 21 } }))).toEqual({ state: 'TX', district: 21 });
    expect(electoralSeat(JSON.stringify({ house: { target_2028: 0, state: 'TX', district: 21 } }))).toBeNull();
    expect(electoralSeat('{"always":true}')).toBeNull();
    expect(() => parseRule(JSON.stringify({ house: { target_2028: 2 } }))).toThrow();
    expect(() => parseRule(JSON.stringify({ house: { district: -1 } }))).toThrow();
    expect(() => parseRule(JSON.stringify({ house: { district: 21.5 } }))).toThrow();
    expect(() => parseRule(JSON.stringify({ house: { state: 7 } }))).toThrow();
  });
  it('a seat goal targets only the House member of that seat', async () => {
    const rows = load();
    const repo = new MemoryRepo(rows);
    const g = bySlug(rows, SLUG);
    const action = rows.actions.find((a) => a.goal_id === g.id);
    expect(whipTargets(g, action, rows.members).map((m) => m.bioguide_id)).toEqual(['R000614']);
    const casar = await repo.delegation('TX', 35);
    expect(rank([g], casar, TODAY).map((r) => r.goal.slug)).toEqual([]);
  });
});

describe('ranking (§1.3)', () => {
  const activeGoal = (y: string) => y.replace(/^status: .*$/m, 'status: active');
  it('ranks last among eligible goals while any federal goal is open, and leads only once they are closed', async () => {
    // TX-21 (R, R senators, TX holdings unknown): ndaa-1217 is the only other eligible goal, so the
    // seat goal fills the second card; it never outranks an open federal goal.
    const open = load({ goal: activeGoal });
    const tx21 = await new MemoryRepo(open).delegation('TX', 21);
    const active = open.goals.filter((g) => g.status === 'active');
    const ranked = rank(active, tx21, TODAY);
    expect(ranked.map((r) => r.goal.slug).at(-1)).toBe(SLUG);
    expect(ranked.map((r) => r.goal.slug)).toEqual(['ndaa-1217', SLUG]);
    expect(Math.max(...ranked.filter((r) => r.goal.slug !== SLUG).map((r) => r.score))).toBeGreaterThan(ranked.at(-1)!.score);

    const closed = load({ closeFederal: true, goal: activeGoal });
    const closedActive = closed.goals.filter((g) => g.status === 'active');
    expect(closedActive.map((g) => g.slug).sort()).toEqual([SLUG, 'state-bonds']);
    const d = await new MemoryRepo(closed).delegation('TX', 21);
    expect(topTwo(closedActive, d, TODAY).map((g) => g.slug)).toEqual([SLUG, 'state-bonds']); // state goal ineligible for TX, padded in
  });
  it('a delegation with two open federal goals never sees it', async () => {
    const open = load({ goal: activeGoal });
    const repo = new MemoryRepo(open);
    const d = { ...(await repo.delegation('TX', 21)), house: { ...ROY, party: 'D' as const } }; // house-caucus + ndaa-1217 eligible
    const active = open.goals.filter((g) => g.status === 'active');
    expect(topTwo(active, d, TODAY).map((g) => g.slug)).not.toContain(SLUG);
    expect(rank(active, d, TODAY).map((r) => r.goal.slug).at(-1)).toBe(SLUG);
  });
});

describe('card data (§1.2)', () => {
  const activeGoal = (y: string) => y.replace(/^status: .*$/m, 'status: active');
  it('/api/route carries the election dates, the one ask and the record: every tracked goal, each line a data/ row', async () => {
    const rows = load({ closeFederal: true, goal: activeGoal });
    const repo = new MemoryRepo(rows);
    const route = await buildRoute(repo, 'TX', 21, TODAY);
    const card = route.goals.find((g) => g.slug === SLUG)!;
    expect(card.category).toBe('electoral');
    expect(card.election).toEqual({ primary_date: ELECTION.primary_date, filing_deadline: ELECTION.filing_deadline, source_url: ELECTION.source_url });
    expect(card.ask_text).toBe(ELECTORAL_ASK);
    expect(card.targets.map((t) => t.bioguide_id)).toEqual(['R000614']);
    const record = card.targets[0].record!;
    const tracked = rows.goals.filter((g) => g.status !== 'upcoming' && g.category !== 'electoral' && whipTargets(g, rows.actions.find((a) => a.goal_id === g.id), [ROY]).length === 1);
    expect(record.map((r) => r.goal_slug).sort()).toEqual(tracked.map((g) => g.slug).sort());
    for (const r of record) {
      expect(['yes', 'no', 'leaning_yes', 'leaning_no', 'unknown']).toContain(r.position);
      if (r.source_url) expect(r.source_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof r.vote).toBe('string');
    }
    const other = route.goals.find((g) => g.slug === 'state-bonds')!;
    expect(other.election).toBeUndefined();
    expect(other.targets.every((t) => t.record === undefined)).toBe(true);

    const direct = await goalTargets(repo, SLUG, 'TX', 21);
    expect(direct).not.toBe('no_goal');
    expect((direct as { targets: typeof card.targets }).targets[0].record).toEqual(record);
    expect(await goalTargets(repo, SLUG, 'TX', 35)).toEqual({ targets: [] });
  });
});

describe('no advocacy words (Open question 1)', () => {
  it('forbiddenPhrases catches the listed words and nothing like "election" or "electoral"', () => {
    expect(forbiddenPhrases('Vote for X; we oppose Y and will defeat Z; re-elect nobody; she supported it')).toEqual(['vote for', 'oppose', 'defeat', 're-elect', 'supported']);
    expect(forbiddenPhrases('The 2028 primary election; an electoral record; who is running against them; selected')).toEqual([]);
  });
  it('every electoral goal and action in data/, and the templates, carry none', () => {
    const files = ['goals', 'actions'].flatMap((d) => readdirSync(join(DATA, d)).filter((f) => f.startsWith('primary-')).map((f) => readFileSync(join(DATA, d, f), 'utf8')));
    for (const text of [...files, goalYaml(ROY, ELECTION), actionYaml(ROY), ELECTORAL_ASK]) expect(forbiddenPhrases(text)).toEqual([]);
    expect(() => load({ goal: (y) => y.replace(/^summary: .*$/m, 'summary: "Vote against the incumbent."') })).toThrow(/vote against/);
  });
});
