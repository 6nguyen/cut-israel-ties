import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { caucusOf, checkMembers, checkMembersElect, loadRows, parseCsv } from '../src/load';
import { districtError, isDelegate } from '../src/districts';
import { applyFilters, isMovable, latestPosition, updatedAt, whipCounts, whipRows, whipTargets } from '../src/whip';
import { merge, rosterRows, toCsv } from '../scripts/import-members';
import { MemoryRepo } from '../src/repo';
import { createApp } from '../src/index';
import { ENV, fakeFetch } from './fixtures';

const DATA = join(__dirname, '..', '..', 'data');
const rows = loadRows(DATA, '2026-11-04T00:00:00Z');
const NOW = new Date('2026-11-04T12:00:00Z');

describe('members.csv seed checks (member-pages §1.3)', () => {
  const ok = { bioguide_id: 'X000001', name: 'A', party: 'D', chamber: 'house', state: 'TX', district: '21' };
  it('passes the committed file', () => { expect(() => checkMembers(parseCsv(readFileSync(join(DATA, 'members.csv'), 'utf8')))).not.toThrow(); });
  it('rejects a duplicate bioguide id', () => { expect(() => checkMembers([ok, { ...ok, district: '22' }])).toThrow(/duplicate bioguide_id X000001/); });
  it('rejects a district outside the state count and a numbered at-large seat', () => {
    expect(() => checkMembers([{ ...ok, district: '39' }])).toThrow(/TX has districts 1-38/);
    expect(() => checkMembers([{ ...ok, district: '0' }])).toThrow(/TX has districts 1-38/);
    expect(() => checkMembers([{ ...ok, state: 'WY', district: '1' }])).toThrow(/at large/);
    expect(() => checkMembers([{ ...ok, state: 'ZZ' }])).toThrow(/unknown state/);
    expect(districtError('WY', 0)).toBeNull();
    expect(districtError('DC', 0)).toBeNull();
  });
  it('rejects a senator with a district', () => { expect(() => checkMembers([{ ...ok, chamber: 'senate', district: '1' }])).toThrow(/senator X000001 has a district/); });
  it('the imported roster: one row per sitting member, every state present, delegates at district 0', () => {
    const house = rows.members.filter((m) => m.chamber === 'house');
    const senate = rows.members.filter((m) => m.chamber === 'senate');
    expect(house.length).toBeGreaterThanOrEqual(430);
    expect(house.length).toBeLessThanOrEqual(441);
    expect(senate.length).toBeGreaterThanOrEqual(98);
    expect(senate.length).toBeLessThanOrEqual(100);
    expect(new Set(senate.map((m) => m.state)).size).toBe(50);
    for (const m of house.filter(isDelegate)) expect(m.district).toBe(0);
    for (const m of senate) expect(m.district).toBeNull();
  });
});

describe('import-members merge', () => {
  const yaml = `- id: {bioguide: C001110}\n  name: {first: Lou, last: Correa, official_full: J. Luis Correa}\n  terms:\n  - {type: rep, state: CA, district: 46, party: Democrat, start: '2025-01-03', end: '2027-01-03', phone: 202-225-2965, contact_form: https://correa.house.gov/contact}\n- id: {bioguide: N000147}\n  name: {first: Eleanor, last: Norton}\n  terms:\n  - {type: rep, state: DC, district: 0, party: Democrat, start: '2025-01-03', end: '2027-01-03'}\n- id: {bioguide: P000145}\n  name: {first: Alex, last: Padilla}\n  terms:\n  - {type: rep, state: CA, district: 20, party: Democrat, start: '2013-01-03', end: '2015-01-03'}\n  - {type: sen, state: CA, party: Democrat, start: '2025-01-03', end: '2029-01-03', phone: 202-224-3553}\n`;
  const existing = parseCsv('bioguide_id,name,party,chamber,state,district,dc_phone,district_phone,contact_form_url,hasc,conferee,rc243,jrd_april_2026,btb_cosponsor,target_2028,money_url\nC001110,Lou Correa,D,house,CA,46,202-224-3121,,https://correa.house.gov/contact,1,1,yes,,1,,\nZ000000,Gone Member,R,house,TX,2,202-224-3121,,,,,,,,,\n');
  it('refreshes dataset columns, keeps flags, adds new rows with empty flags, keeps and names stale rows', () => {
    const roster = rosterRows(yaml);
    expect(roster.find((r) => r.bioguide_id === 'P000145')).toMatchObject({ chamber: 'senate', district: '', dc_phone: '202-224-3553', party: 'D' });
    expect(roster.find((r) => r.bioguide_id === 'N000147')).toMatchObject({ chamber: 'house', district: '0', name: 'Eleanor Norton' });
    const { rows: out, stale, added } = merge(existing, roster);
    expect(added).toBe(2);
    expect(stale).toEqual(['Z000000 Gone Member (TX-2)']);
    const correa = out.find((r) => r.bioguide_id === 'C001110')!;
    expect(correa).toMatchObject({ name: 'Lou Correa', dc_phone: '202-225-2965', hasc: '1', conferee: '1', rc243: 'yes', btb_cosponsor: '1' });
    expect(out.find((r) => r.bioguide_id === 'N000147')).toMatchObject({ hasc: '', conferee: '', contact_form_url: '' });
    expect(out.map((r) => r.bioguide_id)).toEqual(['C001110', 'P000145', 'N000147', 'Z000000']);
    const again = merge(parseCsv(toCsv(out)), roster);
    expect(toCsv(again.rows)).toBe(toCsv(out));
  });
});

describe('whip table (member-pages §3)', () => {
  const goal = rows.goals.find((g) => g.slug === 'ndaa-1217')!;
  const action = rows.actions.filter((a) => a.goal_id === goal.id).sort((a, b) => a.order - b.order)[0];
  const table = whipRows(goal, action, rows.members, rows.positions);
  it('tiles equal a count over positions/ndaa-1217.csv; delegates are not counted', () => {
    const csv = parseCsv(readFileSync(join(DATA, 'positions', 'ndaa-1217.csv'), 'utf8'));
    const voting = whipTargets(goal, action, rows.members).filter((m) => !isDelegate(m));
    const expected = { for: 0, uncommitted: 0, against: 0, unknown: 0 };
    for (const m of voting) {
      const mine = csv.filter((r) => r.bioguide_id === m.bioguide_id).sort((a, b) => a.source_date.localeCompare(b.source_date));
      expected[(mine.at(-1)?.position ?? 'unknown') as keyof typeof expected]++;
    }
    const counts = whipCounts(table);
    expect(counts).toEqual(expected);
    expect(counts.for + counts.uncommitted + counts.against + counts.unknown).toBe(voting.length);
    expect(table.length).toBe(voting.length + rows.members.filter(isDelegate).length);
  });
  it('default view is House non-Republicans plus every conferee; filters apply to the full set', () => {
    const def = applyFilters(table, {});
    expect(def.length).toBeGreaterThan(0);
    for (const r of def) expect(r.member.conferee === 1 || (r.member.chamber === 'house' && r.member.party !== 'R')).toBe(true);
    expect(applyFilters(table, { all: true }).length).toBe(table.length);
    const tx = applyFilters(table, { state: 'TX', party: 'R' });
    expect(tx.length).toBeGreaterThan(0);
    for (const r of tx) expect([r.member.state, r.member.party]).toEqual(['TX', 'R']);
    expect(isMovable({ ...rows.members[0], party: 'D', chamber: 'senate', conferee: 0 }, 'senate')).toBe(true);
  });
  it('sorts conferees, then HASC, then uncommitted · unknown · against · for, delegates last', () => {
    const m = (id: string, extra: Partial<typeof rows.members[0]>) => ({ ...rows.members[0], bioguide_id: id, state: 'CA', district: 1, name: id, conferee: 0, hasc: 0, ...extra });
    const members = [m('FOR', {}), m('AGAINST', {}), m('HASC', { hasc: 1 }), m('CONF', { conferee: 1 }), m('DEL', { state: 'DC', district: 0 }), m('UNC', {})];
    const pos = (bioguide_id: string, position: 'for' | 'against' | 'uncommitted', source_date = '2026-10-01') => ({ bioguide_id, goal_id: goal.id, position, source_url: 'https://x', source_date });
    const sorted = whipRows(goal, action, members, [pos('FOR', 'for'), pos('AGAINST', 'against'), pos('UNC', 'uncommitted'), pos('FOR', 'uncommitted', '2026-09-01')]);
    expect(sorted.map((r) => r.member.bioguide_id)).toEqual(['CONF', 'HASC', 'UNC', 'AGAINST', 'FOR', 'DEL']);
    expect(latestPosition(sorted.length ? [pos('FOR', 'uncommitted', '2026-09-01'), pos('FOR', 'for')] : [], 'FOR', goal.id)?.position).toBe('for');
    expect(updatedAt([pos('FOR', 'for', '2026-10-01'), pos('UNC', 'for', '2026-10-09')], goal.id)).toBe('2026-10-09');
    expect(updatedAt([], goal.id)).toBeNull();
  });
  it('a leadership goal targets only Democrats in its chamber; a state goal has no table', () => {
    const caucus = rows.goals.find((g) => g.slug === 'house-caucus')!;
    const a = rows.actions.find((x) => x.goal_id === caucus.id)!;
    for (const t of whipTargets(caucus, a, rows.members)) expect([t.chamber, t.party]).toEqual(['house', 'D']);
    const bonds = rows.goals.find((g) => g.slug === 'state-bonds')!;
    expect(whipTargets(bonds, rows.actions.find((x) => x.goal_id === bonds.id), rows.members)).toEqual([]);
  });
});

describe('GET /api/members/:id/reports (member-pages §2.2)', () => {
  const mk = () => { const repo = new MemoryRepo(rows); const app = createApp({ repo: () => repo, fetch: fakeFetch().impl, now: () => NOW }); return { repo, app }; };
  it('returns the newest report after one request and null before; unknown ids and goals 404', async () => {
    const { repo, app } = mk();
    expect(await (await app.request('/api/members/C001110/reports?goal=ndaa-1217', {}, ENV)).json()).toEqual({ latest: null });
    const post = await app.request('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'ndaa-1217', target: 'C001110', outcome: 'undecided', note: 'Staffer said they are still reading it', device: 'device-12345' }) }, ENV);
    expect(post.status).toBe(200);
    const res = await app.request('/api/members/C001110/reports?goal=ndaa-1217', {}, ENV);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ latest: { outcome: 'undecided', note: 'Staffer said they are still reading it', created_at: NOW.toISOString() } });
    expect(await repo.positionsFor(['C001110'], [rows.goals.find((g) => g.slug === 'ndaa-1217')!.id])).toEqual([]);
    expect((await app.request('/api/members/NOPE/reports?goal=ndaa-1217', {}, ENV)).status).toBe(404);
    expect((await app.request('/api/members/C001110/reports?goal=nope', {}, ENV)).status).toBe(404);
    expect((await app.request('/api/members/C001110/reports', {}, ENV)).status).toBe(400);
  });
});

describe('caucus column and members_elect.csv seed checks (leadership-routing §1)', () => {
  const ok = { bioguide_id: 'X000001', name: 'A', party: 'D', chamber: 'house', state: 'TX', district: '21', caucus: '' };
  it('derives caucus from a D or R party and keeps a hand-set value', () => {
    expect(caucusOf({ party: 'D', caucus: '' })).toBe('D');
    expect(caucusOf({ party: 'R', caucus: '' })).toBe('R');
    expect(caucusOf({ party: 'I', caucus: 'D' })).toBe('D');
    expect(rows.members.find((m) => m.bioguide_id === 'K000383')?.caucus).toBe('D'); // King
    expect(rows.members.find((m) => m.bioguide_id === 'S000033')?.caucus).toBe('D'); // Sanders
    expect(rows.members.every((m) => m.caucus === 'D' || m.caucus === 'R')).toBe(true);
  });
  it('rejects an independent without a caucus, naming the member, and a caucus outside D | R', () => {
    expect(() => checkMembers([{ ...ok, party: 'I', name: 'New Independent' }])).toThrow(/X000001 New Independent \(I\) has no caucus/);
    expect(() => checkMembers([{ ...ok, party: 'I', caucus: 'D' }])).not.toThrow();
    expect(() => checkMembers([{ ...ok, caucus: 'I' }])).toThrow(/caucus must be D or R, not I/);
  });

  const gone = { bioguide_id: 'G000001', chamber: 'house' as const, state: 'TX', district: 21, not_returning: 1, left_office: null };
  const stays = { bioguide_id: 'S000001', chamber: 'house' as const, state: 'TX', district: 22, not_returning: 0, left_office: null };
  const sen = { bioguide_id: 'N000001', chamber: 'senate' as const, state: 'TX', district: null, not_returning: 0, left_office: '2027-01-03' };
  const members = [gone, stays, sen];
  const elect = {
    elect_id: 'TX-21-new', name: 'New Member', party: 'D', caucus: '', chamber: 'house', state: 'TX', district: '21', replaces: 'G000001',
    contact_url: 'https://newmember.com', phone: '', source_url: 'https://apnews.com/race', source_date: '2026-11-04',
  };
  const check = (rs: Record<string, string>[], today = '2026-11-06') => () => checkMembersElect(rs, members, today);
  it('passes the committed file and a valid row (house, senate, I with caucus, ten-digit phone)', () => {
    expect(check([elect])).not.toThrow();
    expect(check([{ ...elect, elect_id: 'TX-S-new', chamber: 'senate', district: '', replaces: 'N000001', party: 'I', caucus: 'D', phone: '(512) 555-0100' }])).not.toThrow();
    expect(() => checkMembersElect(parseCsv(readFileSync(join(DATA, 'members_elect.csv'), 'utf8')), rows.members, '2026-11-06')).not.toThrow();
  });
  it('rejects a duplicate elect_id and an id that does not match the seat', () => {
    expect(check([elect, { ...elect, name: 'Other' }])).toThrow(/TX-21-new: duplicate elect_id/);
    expect(check([{ ...elect, elect_id: 'TX-22-new' }])).toThrow(/elect_id does not match TX house 21/);
    expect(check([{ ...elect, elect_id: 'tx-21-New' }])).toThrow(/elect_id must be/);
  });
  it('rejects a replaces that is unknown, in another seat, or returning, and two rows for one seat', () => {
    expect(check([{ ...elect, replaces: 'Z000000' }])).toThrow(/replaces unknown member Z000000/);
    expect(check([{ ...elect, elect_id: 'TX-22-new', district: '22', replaces: 'G000001' }])).toThrow(/holds a different seat/);
    expect(check([{ ...elect, elect_id: 'TX-22-new', district: '22', replaces: 'S000001' }])).toThrow(/S000001, who is returning/);
    expect(check([elect, { ...elect, elect_id: 'TX-21-other' }])).toThrow(/TX-21-other: second row for G000001 \(first: TX-21-new\)/);
  });
  it('rejects a bad phone, URL or date', () => {
    expect(check([{ ...elect, phone: '555-0100' }])).toThrow(/phone 555-0100 is not ten digits/);
    expect(check([{ ...elect, contact_url: 'http://newmember.com' }])).toThrow(/contact_url must be an https URL/);
    expect(check([{ ...elect, source_url: 'apnews.com' }])).toThrow(/source_url must be a URL/);
    expect(check([{ ...elect, source_date: '11/04/2026' }])).toThrow(/source_date must be YYYY-MM-DD/);
  });
  it('rejects any row after 2027-01-10 and accepts an empty file then', () => {
    expect(check([elect], '2027-01-11')).toThrow(/TX-21-new: still present after 2027-01-10/);
    expect(check([elect], '2027-01-10')).not.toThrow();
    expect(check([], '2027-06-01')).not.toThrow();
  });
  it('MemoryRepo.membersElect returns a state\'s rows in file order', async () => {
    const e = { ...elect, caucus: 'D' as const, party: 'D' as const, chamber: 'house' as const, district: 21, phone: null };
    const repo = new MemoryRepo({ ...rows, membersElect: [e, { ...e, elect_id: 'CA-3-x', state: 'CA', district: 3 }] });
    expect((await repo.membersElect('TX')).map((x) => x.elect_id)).toEqual(['TX-21-new']);
    expect(await repo.membersElect('WY')).toEqual([]);
  });
  it('the import keeps caucus as the last column', () => {
    expect(toCsv([{ bioguide_id: 'K000383', name: 'King', caucus: 'D' }]).split('\n')[0].endsWith(',left_office,caucus')).toBe(true);
    expect(toCsv([{ bioguide_id: 'K000383', name: 'King', caucus: 'D' }]).split('\n')[1].endsWith(',D')).toBe(true);
  });
});
