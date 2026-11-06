// roster-freshness §1 (district offices as rows), §2 (contact-form fallback) and §4 (departing members).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkOffices, deriveDistrictPhones, loadRows, parseCsv, tenDigitPhone } from '../src/load';
import { officeRows, toOfficesCsv, OFFICE_HEADER } from '../scripts/import-offices';
import { contactFor, merge, rosterRows, senateContacts, toCsv, HEADER, TRANSITION_DATE } from '../scripts/import-members';
import { SWITCHBOARD, districtLine, targetsFor } from '../src/route';
import { MemoryRepo, assembleDelegation } from '../src/repo';
import { whipTargets } from '../src/whip';
import { createApp } from '../src/index';
import type { Member, Office } from '../src/types';
import { ENV, fakeFetch } from './fixtures';

const DATA = join(__dirname, '..', '..', 'data');
const rows = loadRows(DATA, '2026-11-04T00:00:00Z');
const XML = readFileSync(join(__dirname, 'fixtures', 'senators_cfm.sample.xml'), 'utf8');

const YAML = `
- id: {bioguide: A000001}
  offices:
  - {id: A000001-zeta, city: Zeta, state: TX, zip: '78701', address: 1 Main St, phone: (512) 555-0100, hours: M-F 9-5}
  - {id: A000001-alpha, city: Alpha, state: TX, zip: 78702, address: 2 Main St, suite: Suite 9, phone: 512-555-0101, fax: 1-512-555-0199, latitude: 30.1, longitude: -97.7}
- id: {bioguide: B000002}
  offices:
  - {id: B000002-beta, city: Beta, state: OK, phone: 555-0102 ext 4}
- id: {bioguide: Z999999}
  offices:
  - {id: Z999999-gone, city: Gone, state: CA, phone: 310-555-0100}
`;
const IDS = new Set(['A000001', 'B000002']);

describe('import-offices (§1)', () => {
  const { rows: out, dropped, skippedMembers } = officeRows(YAML, IDS);
  it('keeps only members in members.csv, sorts by bioguide_id then office_id, normalises phones', () => {
    expect(out.map((r) => r.office_id)).toEqual(['A000001-alpha', 'A000001-zeta', 'B000002-beta']);
    expect(skippedMembers).toBe(1);
    expect(out[0]).toMatchObject({ phone: '512-555-0101', fax: '512-555-0199', zip: '78702', suite: 'Suite 9', lat: '30.1', lng: '-97.7', hours: '' });
    expect(out[1]).toMatchObject({ phone: '512-555-0100', hours: 'M-F 9-5', zip: '78701' });
  });
  it('clears a phone that is not ten digits, keeps the row and reports it', () => {
    expect(out[2].phone).toBe('');
    expect(dropped).toEqual(['B000002-beta 555-0102 ext 4']);
    expect(tenDigitPhone('1 (202) 224-3121')).toBe('202-224-3121');
    expect(tenDigitPhone('')).toBeNull();
  });
  it('is idempotent: the CSV re-parses to the same rows and the header is the PRD column list', () => {
    const csv = toOfficesCsv(out);
    expect(csv.split('\n')[0]).toBe('bioguide_id,office_id,city,state,zip,address,suite,building,phone,fax,hours,lat,lng');
    expect(toOfficesCsv(officeRows(YAML, IDS).rows)).toBe(csv);
    expect(parseCsv(csv)).toEqual(out.map((r) => Object.fromEntries(OFFICE_HEADER.map((h) => [h, r[h]]))));
  });
  it('the committed file: at least 1,250 offices, every bioguide_id a member, most members covered', () => {
    const csv = parseCsv(readFileSync(join(DATA, 'district_offices.csv'), 'utf8'));
    const members = new Set(rows.members.map((m) => m.bioguide_id));
    expect(csv.length).toBeGreaterThanOrEqual(1250);
    expect(csv.every((r) => members.has(r.bioguide_id))).toBe(true);
    expect(new Set(csv.map((r) => r.bioguide_id)).size).toBeGreaterThanOrEqual(530);
    expect(rows.offices.length).toBe(csv.length);
  });
});

describe('loader checks and derived district_phone (§1)', () => {
  const ok = { bioguide_id: 'A000001', office_id: 'A000001-x', city: 'X', state: 'TX', phone: '512-555-0100' };
  it('rejects an unknown member, an unknown state, a bad phone and a duplicate office id', () => {
    expect(() => checkOffices([ok], IDS)).not.toThrow();
    expect(() => checkOffices([{ ...ok, bioguide_id: 'Z999999' }], IDS)).toThrow(/unknown bioguide_id Z999999/);
    expect(() => checkOffices([{ ...ok, state: 'ZZ' }], IDS)).toThrow(/unknown state ZZ/);
    expect(() => checkOffices([{ ...ok, phone: '555-0100' }], IDS)).toThrow(/phone 555-0100 is not ten digits/);
    expect(() => checkOffices([ok, ok], IDS)).toThrow(/duplicate office_id/);
    expect(() => checkOffices([{ ...ok, state: 'PR', phone: '' }], IDS)).not.toThrow();
  });
  it('an empty district_phone takes the first office phone in file order; a filled cell wins', () => {
    const m = (o: Partial<Member>): Member => ({ ...rows.members[0], ...o });
    const offices: Office[] = [
      { bioguide_id: 'A', office_id: 'A-1', city: 'One', state: 'TX', zip: null, address: null, suite: null, building: null, phone: null, fax: null, hours: null, lat: null, lng: null },
      { bioguide_id: 'A', office_id: 'A-2', city: 'Two', state: 'TX', zip: null, address: null, suite: null, building: null, phone: '512-555-0102', fax: null, hours: null, lat: null, lng: null },
      { bioguide_id: 'A', office_id: 'A-3', city: 'Three', state: 'TX', zip: null, address: null, suite: null, building: null, phone: '512-555-0103', fax: null, hours: null, lat: null, lng: null },
    ];
    const ms = [m({ bioguide_id: 'A', district_phone: null }), m({ bioguide_id: 'B', district_phone: null }), m({ bioguide_id: 'A', district_phone: '999-999-9999' })];
    deriveDistrictPhones(ms, offices);
    expect(ms.map((x) => x.district_phone)).toEqual(['512-555-0102', null, '999-999-9999']);
  });
  it('the committed data: Correa has a derived district phone; members without an office keep none', () => {
    const correa = rows.members.find((m) => m.bioguide_id === 'C001110')!;
    expect(correa.district_phone).toBe('714-559-6190');
    const withOffice = new Set(rows.offices.map((o) => o.bioguide_id));
    for (const m of rows.members) if (!withOffice.has(m.bioguide_id)) expect(m.district_phone).toBeNull();
    expect(rows.members.filter((m) => m.district_phone).length).toBeGreaterThanOrEqual(530);
  });
});

describe('contact-form fallback (§2)', () => {
  const senate = senateContacts(XML);
  it('parses the Senate XML: one row per member with a bioguide id', () => {
    expect(senate).toEqual([
      { bioguide_id: 'A000382', email: 'https://alsobrooks.senate.gov/', website: 'https://alsobrooks.senate.gov/' },
      { bioguide_id: 'S001198', email: 'https://www.sullivan.senate.gov/contact/email', website: 'https://www.sullivan.senate.gov/' },
    ]);
  });
  it('senator: roster form wins; else the XML email when it is not the homepage; else the homepage', () => {
    expect(contactFor({ type: 'sen', contact_form: 'https://x.senate.gov/form', url: 'https://x.senate.gov' }, senate[1])).toEqual({ contact_form_url: 'https://x.senate.gov/form', contact_kind: 'form' });
    expect(contactFor({ type: 'sen', url: 'https://www.sullivan.senate.gov' }, senate[1])).toEqual({ contact_form_url: 'https://www.sullivan.senate.gov/contact/email', contact_kind: 'form' });
    expect(contactFor({ type: 'sen', url: 'https://alsobrooks.senate.gov' }, senate[0])).toEqual({ contact_form_url: 'https://alsobrooks.senate.gov', contact_kind: 'homepage' });
    expect(contactFor({ type: 'sen', url: 'https://alsobrooks.senate.gov/' })).toEqual({ contact_form_url: 'https://alsobrooks.senate.gov/', contact_kind: 'homepage' });
  });
  it('representative: roster form wins; else <url>/contact behind a ZIP gate; no url, no link', () => {
    expect(contactFor({ type: 'rep', url: 'https://roy.house.gov/' })).toEqual({ contact_form_url: 'https://roy.house.gov/contact', contact_kind: 'zip_gate' });
    expect(contactFor({ type: 'rep', contact_form: 'https://roy.house.gov/email', url: 'https://roy.house.gov' })).toEqual({ contact_form_url: 'https://roy.house.gov/email', contact_kind: 'form' });
    expect(contactFor({ type: 'rep' })).toEqual({ contact_form_url: '', contact_kind: '' });
  });
  it('rosterRows fills the kind from the XML and the import keeps a hand-set link', () => {
    const yaml = `
- id: {bioguide: S001198}
  name: {first: Dan, last: Sullivan}
  terms: [{type: sen, state: AK, party: Republican, phone: 202-224-3004, url: https://www.sullivan.senate.gov, start: '2021-01-03', end: '2027-01-03'}]
- id: {bioguide: R000614}
  name: {first: Chip, last: Roy}
  terms: [{type: rep, state: TX, district: 21, party: Republican, phone: 202-225-4236, url: https://roy.house.gov, start: '2025-01-03', end: '2027-01-03'}]
`;
    const r = rosterRows(yaml, senate);
    expect(r.map((x) => [x.contact_form_url, x.contact_kind])).toEqual([['https://www.sullivan.senate.gov/contact/email', 'form'], ['https://roy.house.gov/contact', 'zip_gate']]);
    const hand = { bioguide_id: 'R000614', name: 'Chip Roy', party: 'R', chamber: 'house', state: 'TX', district: '21', contact_form_url: 'https://roy.house.gov/verified-form', contact_kind: 'form' };
    const merged = merge([hand], r, '2026-11-05');
    const roy = merged.rows.find((x) => x.bioguide_id === 'R000614')!;
    expect([roy.contact_form_url, roy.contact_kind]).toEqual(['https://roy.house.gov/verified-form', 'form']);
    const fresh = merge([], r, '2026-11-05').rows.find((x) => x.bioguide_id === 'R000614')!;
    expect([fresh.contact_form_url, fresh.contact_kind]).toEqual(['https://roy.house.gov/contact', 'zip_gate']);
    expect(toCsv(merged.rows).split('\n')[0]).toBe(HEADER.join(','));
  });
  it('the committed file: every member has a contact link with a kind', () => {
    for (const m of rows.members) {
      expect(m.contact_form_url, m.bioguide_id).toBeTruthy();
      expect(['form', 'zip_gate', 'homepage'], m.bioguide_id).toContain(m.contact_kind);
    }
    expect(rows.members.filter((m) => m.contact_kind === 'homepage').every((m) => m.chamber === 'senate')).toBe(true);
  });
});

describe('departing members (§4)', () => {
  const roster = rosterRows(`
- id: {bioguide: A000001}
  name: {first: A, last: One}
  terms: [{type: rep, state: TX, district: 1, party: Democrat, url: https://one.house.gov, start: '2025-01-03', end: '2027-01-03'}]
`);
  const gone = { bioguide_id: 'B000002', name: 'B Two', party: 'R', chamber: 'house', state: 'TX', district: '2', not_returning: '1' };
  it('before 2027-01-03 a missing member is stale with no column change', () => {
    const out = merge([gone], roster, '2026-12-31');
    expect(out.stale).toEqual(['B000002 B Two (TX-2)']);
    expect(out.left).toEqual([]);
    expect(out.rows.find((r) => r.bioguide_id === 'B000002')).toMatchObject({ left_office: '', not_returning: '1' });
  });
  it('from 2027-01-03 the import sets left_office = today once and prints left:', () => {
    expect(TRANSITION_DATE).toBe('2027-01-03');
    const first = merge([gone], roster, '2027-01-04');
    expect(first.stale).toEqual([]);
    expect(first.left).toEqual(['B000002 B Two (TX-2) 2027-01-04']);
    const row = first.rows.find((r) => r.bioguide_id === 'B000002')!;
    expect(row.left_office).toBe('2027-01-04');
    const again = merge(first.rows, roster, '2027-01-11');
    expect(again.rows.find((r) => r.bioguide_id === 'B000002')!.left_office).toBe('2027-01-04');
    expect(again.left).toEqual(['B000002 B Two (TX-2) 2027-01-04']);
    expect(again.changed).toEqual([]);
  });
  it('loader rejects a left_office that is not an ISO date and a link without a kind', async () => {
    const { checkMembers } = await import('../src/load');
    const ok = { bioguide_id: 'X000001', name: 'A', party: 'D', chamber: 'house', state: 'TX', district: '21', contact_form_url: 'https://x', contact_kind: 'form', left_office: '' };
    expect(() => checkMembers([ok])).not.toThrow();
    expect(() => checkMembers([{ ...ok, left_office: 'Jan 4' }])).toThrow(/left_office is not an ISO date/);
    expect(() => checkMembers([{ ...ok, contact_kind: '' }])).toThrow(/contact_form_url without contact_kind/);
    expect(() => checkMembers([{ ...ok, contact_kind: 'email' }])).toThrow(/unknown contact_kind email/);
  });

  const goal = rows.goals.find((g) => g.slug === 'ndaa-1217')!;
  const action = rows.actions.find((a) => a.goal_id === goal.id);
  const correa = rows.members.find((m) => m.bioguide_id === 'C001110')!;
  const senators = rows.members.filter((m) => m.state === 'CA' && m.chamber === 'senate');
  it('a not_returning member keeps every target slot; a left_office member is never a target', () => {
    const staying = { ...correa, not_returning: 1 };
    const d = assembleDelegation('CA', 46, [staying, ...senators], null);
    expect(targetsFor(goal, action, d, [], rows.offices).map((t) => t.bioguide_id)).toContain('C001110');
    const left = { ...correa, left_office: '2027-01-04' };
    const d2 = assembleDelegation('CA', 46, [left, ...senators], null);
    expect(d2.house).toBeNull();
    expect(targetsFor(goal, action, d2, [], rows.offices).map((t) => t.bioguide_id)).not.toContain('C001110');
    expect(targetsFor(goal, action, { ...d2, house: left }, [], rows.offices).map((t) => t.bioguide_id)).not.toContain('C001110');
    expect(whipTargets(goal, action, [staying, left]).map((m) => m.bioguide_id)).toEqual(['C001110']);
    expect(whipTargets(goal, action, [left])).toEqual([]);
  });
  it('/api/route skips a departed representative but still resolves the senators', async () => {
    const members = rows.members.map((m) => (m.bioguide_id === 'C001110' ? { ...m, left_office: '2027-01-04' } : m));
    const repo = new MemoryRepo({ ...rows, members });
    const app = createApp({ repo: () => repo, fetch: fakeFetch().impl, now: () => new Date('2026-11-04T12:00:00Z') });
    const res = await app.request('/api/goals/ndaa-1217/targets?state=CA&district=46', {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { targets: { bioguide_id: string | null }[] };
    expect(body.targets.map((t) => t.bioguide_id)).not.toContain('C001110');
    expect(body.targets.length).toBe(senators.length);
    expect(await repo.member('C001110')).not.toBeNull(); // the row stays: positions and receipts keep resolving
  });
});

describe('target card district line and switchboard fallback (§1, action-router §7)', () => {
  const correa = rows.members.find((m) => m.bioguide_id === 'C001110')!;
  const goal = rows.goals.find((g) => g.slug === 'ndaa-1217')!;
  it('shows the first office in the member\'s state after the DC number', () => {
    expect(districtLine(correa, rows.offices)).toEqual({ district_phone: '714-559-6190', district_city: 'Santa Ana' });
    const t = targetsFor(goal, undefined, assembleDelegation('CA', 46, [correa], null), [], rows.offices)[0];
    expect(t.phone).toBe(correa.dc_phone);
    expect(t).toMatchObject({ district_phone: '714-559-6190', district_city: 'Santa Ana' });
  });
  it('a hand-filled district_phone stands in without a city; the switchboard only when neither number exists', () => {
    expect(districtLine({ ...correa, district_phone: '999-999-9999' }, [])).toEqual({ district_phone: '999-999-9999', district_city: null });
    const noDc = { ...correa, dc_phone: null, district_phone: null };
    expect(targetsFor(goal, undefined, assembleDelegation('CA', 46, [noDc], null), [], [])[0].phone).toBe(SWITCHBOARD);
    expect(targetsFor(goal, undefined, assembleDelegation('CA', 46, [{ ...noDc, district_phone: '714-559-6190' }], null), [], [])[0].phone).toBeNull();
  });
  it('the in-memory repo answers offices(bioguide_id) in file order', async () => {
    const repo = new MemoryRepo(rows);
    const offices = await repo.offices('C001110');
    expect(offices.length).toBeGreaterThan(0);
    expect(offices[0].city).toBe('Santa Ana');
    expect(await repo.offices('NOPE000')).toEqual([]);
  });
});
