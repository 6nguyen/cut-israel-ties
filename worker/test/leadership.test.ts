// leadership-routing §2 (one leadership slot, the incoming caucus) and §3 (one ask, the leader named by a sourced row).
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { createApp } from '../src/index';
import { leaderLine, pickLeader, resolveTarget } from '../src/generate';
import { loadRows } from '../src/load';
import { parseRule, rank, slots, topTwo } from '../src/ranking';
import { MemoryRepo } from '../src/repo';
import { buildRoute } from '../src/route';
import { parseFormat } from '../src/generate';
import { standardFacts } from '../src/standard';
import type { Member, Position } from '../src/types';
import { ENV, fakeFetch } from './fixtures';

const DATA = join(__dirname, '..', '..', 'data');
const rows = loadRows(DATA, '2026-11-04T00:00:00Z');
const repo = new MemoryRepo(rows);
const TODAY = new Date('2026-11-04T12:00:00Z');
const DEVICE = 'device-0123456789abcdef';
const goal = (slug: string) => rows.goals.find((g) => g.slug === slug)!;
const action = (slug: string) => rows.actions.find((a) => a.slug === slug)!;

describe('§2.1–2.3 one leadership slot on the incoming caucus', () => {
  it('a D/DD delegation gets one leadership slot carrying both goals; the state goal still pads', async () => {
    const d = await repo.delegation('CA', 46);
    const ranked = rank(await repo.activeGoals(), d, TODAY);
    const s = slots(ranked);
    expect(s.map((x) => [x.goal.slug, x.also?.slug ?? null])).toEqual([['ndaa-1217', null], ['house-caucus', 'senate-leader']]);
    expect(topTwo(await repo.activeGoals(), d, TODAY).map((x) => x.goal.slug)).toEqual(['ndaa-1217', 'house-caucus']);
  });
  it('eligibility rules may test caucus (D|R) and nothing else new', () => {
    expect(() => parseRule('{"house":{"caucus":"D"}}')).not.toThrow();
    expect(() => parseRule('{"senator":{"caucus":"R"}}')).not.toThrow();
    expect(() => parseRule('{"house":{"caucus":"I"}}')).toThrow();
    expect(goal('house-caucus').eligibility).toBe('{"house":{"caucus":"D"}}');
    expect(goal('senate-leader').eligibility).toBe('{"senator":{"caucus":"D"}}');
  });
  it('a departing Democrat with a called successor hands the card to the member-elect (CA-11)', async () => {
    const r = await buildRoute(repo, 'CA', 11, TODAY);
    const card = r.goals.find((g) => g.slug === 'house-caucus')!;
    expect(r.goals.find((g) => g.slug === 'ndaa-1217')!.targets.map((t) => t.name)).toContain('Nancy Pelosi');
    expect(card.chamber).toBe('house');
    expect(card.targets).toHaveLength(1);
    const t = card.targets[0];
    expect(t).toMatchObject({ bioguide_id: 'CA-11-wiener', role: 'Representative-elect', party: 'D', position: 'unknown', prior_vote: 'No recorded vote yet', phone: null });
    expect(t.elect).toEqual({ replaces_name: 'Nancy Pelosi', takes_office: '2027-01-03', contact_url: expect.stringMatching(/^https:\/\//) });
    expect(card.uncalled ?? []).toEqual([]);
    expect(card.also?.slug).toBe('senate-leader');
    expect(card.also?.targets.map((x) => x.role)).toEqual(['Sen.', 'Sen.']);
  });
  it('a flipped Republican seat routes the NDAA card to the sitting member and the leadership card to the Democrat-elect (AZ-1)', async () => {
    const r = await buildRoute(repo, 'AZ', 1, TODAY);
    expect(r.goals.map((g) => g.slug)).toEqual(['ndaa-1217', 'house-caucus']);
    expect(r.goals[0].targets.map((t) => t.name)).toContain('David Schweikert');
    expect(r.goals[1].targets.map((t) => [t.bioguide_id, t.role])).toEqual([['AZ-1-shah', 'Representative-elect']]);
    expect(r.goals[1].also?.slug).toBe('senate-leader'); // Gallego and Kelly both caucus D
    expect(r.goals[1].also?.targets.map((t) => t.role)).toEqual(['Sen.', 'Sen.']);
  });
  it('an uncalled seat is named, never guessed: TX-32 and ME-2 show the Senate ask and an uncalled House line', async () => {
    const tx = await buildRoute(repo, 'TX', 32, TODAY);
    const txCard = tx.goals[1];
    expect(txCard.slug).toBe('senate-leader');
    expect(txCard.targets.map((t) => t.bioguide_id)).toEqual(['TX-S-talarico']);
    expect(txCard.uncalled).toEqual(['house']);
    expect(txCard.also).toBeUndefined();
    const me = await buildRoute(repo, 'ME', 2, TODAY);
    const meCard = me.goals[1];
    expect(meCard.slug).toBe('senate-leader');
    expect(meCard.targets.map((t) => [t.bioguide_id, t.party, t.role])).toEqual([['K000383', 'I', 'Sen.'], ['ME-S-jackson', 'D', 'Senator-elect']]);
    expect(meCard.uncalled).toEqual(['house']);
  });
  it('independents who caucus with the Democrats are Senate targets: Vermont shows Welch and Sanders, Maine shows King', async () => {
    const vt = await buildRoute(repo, 'VT', 0, TODAY);
    expect(vt.goals[1].slug).toBe('house-caucus');
    expect(vt.goals[1].also?.targets.map((t) => t.name).sort()).toEqual(['Bernard Sanders', 'Peter Welch']);
    const me = await buildRoute(repo, 'ME', 1, TODAY);
    const sen = me.goals.find((g) => g.slug === 'senate-leader') ?? me.goals.find((g) => g.also?.slug === 'senate-leader')?.also;
    expect(sen?.targets.map((t) => t.name)).toContain('Angus S. King, Jr.');
  });
  it('a Republican elect never becomes a leadership target and the sitting Republican never does either', async () => {
    const r = await buildRoute(repo, 'TX', 21, TODAY);
    for (const g of r.goals) if (g.slug !== 'ndaa-1217') for (const t of g.targets) expect(t.party).toBe('D');
    expect(r.goals[1].targets.map((t) => t.bioguide_id)).toEqual(['TX-S-talarico']);
  });
});

describe('§2.6 receipts and reports accept an elect_id', () => {
  const a = createApp({ repo: () => repo, fetch: fakeFetch().impl, now: () => TODAY });
  const post = (path: string, body: unknown) =>
    a.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' } }, ENV);
  it('stores the elect_id as the target id and rejects an unknown one', async () => {
    const r = new MemoryRepo(rows);
    const app2 = createApp({ repo: () => r, fetch: fakeFetch().impl, now: () => TODAY });
    const p = (path: string, body: unknown) => app2.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' } }, ENV);
    expect((await p('/api/receipt', { goal: 'house-caucus', action: 'house-caucus-call', target: 'CA-11-wiener', state: 'CA', district: 11, device: DEVICE })).status).toBe(200);
    expect(r.receipts[0]).toMatchObject({ goal_id: goal('house-caucus').id, target_id: 'CA-11-wiener', state: 'CA', district: 11 });
    expect((await p('/api/report', { goal: 'house-caucus', target: 'CA-11-wiener', outcome: 'will_support', device: DEVICE })).status).toBe(200);
    expect((await p('/api/report', { goal: 'house-caucus', target: 'CA-11-nobody', outcome: 'will_support', device: DEVICE })).status).toBe(400);
  });
  it('the goal targets endpoint lists the elect for the incoming seat', async () => {
    const res = await a.request('/api/goals/house-caucus/targets?state=CA&district=11', {}, ENV);
    const body = (await res.json()) as { targets: { bioguide_id: string }[] };
    expect(body.targets.map((t) => t.bioguide_id)).toEqual(['CA-11-wiener']);
    void post;
  });
});

describe('§3 one ask for both chambers, the leader named by a sourced row', () => {
  const member = (o: Partial<Member>): Member => ({
    bioguide_id: 'X', name: 'X', party: 'D', chamber: 'house', state: 'XX', district: 1, dc_phone: null, district_phone: null, contact_form_url: null,
    hasc: 0, conferee: 0, rc243: null, jrd_april_2026: null, btb_cosponsor: 0, target_2028: 0, money_url: null, district_office_address: null,
    district_office_city: null, contact_kind: null, not_returning: 0, left_office: null, caucus: 'D', ...o,
  });
  const jeffries = member({ bioguide_id: 'J000294', name: 'Hakeem S. Jeffries', state: 'NY', district: 8 });
  const schumer = member({ bioguide_id: 'S000148', name: 'Charles E. Schumer', chamber: 'senate', district: null, state: 'NY' });
  const INC = ['J000294', 'S000148'];
  const pos = (position: Position['position']): Position => ({ bioguide_id: 'J000294', goal_id: 7, position, source_url: 'https://example.org/x', source_date: '2026-11-01' });

  it('picks the incumbent of the target\'s chamber, and no one for the leader themself', () => {
    expect(pickLeader(INC, 'house', 'P000197', [jeffries, schumer], [], 7)?.name).toBe('Hakeem S. Jeffries');
    expect(pickLeader(INC, 'senate', 'CA-S-x', [jeffries, schumer], [], 7)?.name).toBe('Charles E. Schumer');
    expect(pickLeader(INC, 'house', 'J000294', [jeffries, schumer], [], 7)).toBeNull();
    expect(pickLeader(INC, 'house', 'P000197', [schumer], [], 7)).toBeNull();
    expect(pickLeader(INC, 'house', 'P000197', [jeffries], [pos('for')], 7)?.position?.position).toBe('for');
  });
  it('the leader line comes from the sourced row: for → committed; against/uncommitted → has not; no row → has not said so', () => {
    expect(leaderLine({ name: 'Hakeem S. Jeffries', position: pos('for') })).toBe('Hakeem S. Jeffries has made that commitment in public.');
    expect(leaderLine({ name: 'Hakeem S. Jeffries', position: pos('against') })).toMatch(/^Hakeem S\. Jeffries has not made that commitment\. Until that changes, the vote should go to someone else\.$/);
    expect(leaderLine({ name: 'Hakeem S. Jeffries', position: pos('uncommitted') })).toMatch(/has not made that commitment/);
    expect(leaderLine({ name: 'Hakeem S. Jeffries', position: null })).toBe('Hakeem S. Jeffries has not said so in public. Until that changes, the vote should go to someone else.');
  });
  it('every non-self leadership ask carries {{leader_line}}; self asks never do', () => {
    for (const slug of ['house-caucus-call', 'senate-leader-call']) {
      const blocks = JSON.parse(action(slug).script_blocks!) as { slots: { name: string; variants: { text: string; when?: { self?: boolean } }[] }[] };
      const ask = blocks.slots.find((s) => s.name === 'ask')!;
      for (const v of ask.variants) {
        if (v.when?.self) expect(v.text).not.toContain('{{leader_line}}');
        else expect(v.text).toContain('{{leader_line}}');
      }
    }
  });
  it('resolveTarget: a member gets the leader of their chamber, the leader gets none, an elect_id resolves on leadership goals only', async () => {
    const hc = goal('house-caucus');
    const pelosi = await resolveTarget(repo, action('house-caucus-call'), hc, 'P000197');
    expect(pelosi?.kind).toBe('member');
    expect(pelosi && 'leader' in pelosi ? pelosi.leader?.name : null).toBe('Hakeem S. Jeffries');
    const jeff = await resolveTarget(repo, action('house-caucus-call'), hc, 'J000294');
    expect(jeff && 'leader' in jeff ? jeff.leader : 'x').toBeNull();
    const wiener = await resolveTarget(repo, action('house-caucus-call'), hc, 'CA-11-wiener');
    expect(wiener).toMatchObject({ kind: 'elect', id: 'CA-11-wiener', replaces_name: 'Nancy Pelosi' });
    expect(wiener && 'leader' in wiener ? wiener.leader?.name : null).toBe('Hakeem S. Jeffries');
    expect(await resolveTarget(repo, action('senate-leader-call'), goal('senate-leader'), 'CA-11-wiener')).toBeNull(); // wrong chamber
    expect(await resolveTarget(repo, action('ndaa-1217-call'), goal('ndaa-1217'), 'CA-11-wiener')).toBeNull(); // not a leadership goal
    expect(await resolveTarget(repo, action('house-caucus-call'), hc, 'S001183')).toBeNull(); // Republican
    const talarico = await resolveTarget(repo, action('senate-leader-call'), goal('senate-leader'), 'TX-S-talarico');
    expect(talarico && 'leader' in talarico ? talarico.leader?.name : null).toBe('Charles E. Schumer');
  });
  it('standard facts: leader_line is the code-built sentence for a member or elect, empty for the leader and for state targets', async () => {
    const hc = goal('house-caucus');
    const act = action('house-caucus-call');
    const fmt = parseFormat(act);
    const pelosi = (await resolveTarget(repo, act, hc, 'P000197'))!;
    expect(standardFacts(hc, act, fmt, pelosi).leader_line).toBe('Hakeem S. Jeffries has not said so in public. Until that changes, the vote should go to someone else.');
    const wiener = (await resolveTarget(repo, act, hc, 'CA-11-wiener'))!;
    expect(standardFacts(hc, act, fmt, wiener).leader_line).toMatch(/^Hakeem S\. Jeffries/);
    expect(standardFacts(hc, act, fmt, wiener).target_name).toBe('Scott Wiener');
    const jeff = (await resolveTarget(repo, act, hc, 'J000294'))!;
    expect(standardFacts(hc, act, fmt, jeff).leader_line).toBe('');
    const sb = goal('state-bonds');
    const tx = (await resolveTarget(repo, action('state-bonds-call'), sb, 'TX'))!;
    expect(standardFacts(sb, action('state-bonds-call'), parseFormat(action('state-bonds-call')), tx).leader_line).toBe('');
  });
});
