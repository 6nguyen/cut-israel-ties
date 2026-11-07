// state-holdings-sweep §3: the state target renders holdings_status three ways, and every amount
// shown is the states.csv cell, formatted by code. Rendered with preact-render-to-string under node.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@worker/load';
import { targetsFor } from '@worker/route';
import { RESEARCH_URL, fillAsk, holdingsLine, moneyUsd } from '@worker/state-copy';
import type { Delegation, Goal, StateRow } from '@worker/types';
import { Target, TargetStack, roleLine } from './Target';

const CSV = join(process.cwd(), '..', 'data', 'states.csv');
const stateGoal = { id: 9, slug: 'state-bonds', category: 'state', status: 'active' } as unknown as Goal;
const delegation = (row: StateRow): Delegation => ({ state: row.state, district: 1, house: null, senators: [], state_row: row, incoming: { house: null, senators: [], uncalled: [] } });
const cell = (r: Record<string, string>): StateRow => ({
  state: r.state, treasurer_name: r.treasurer_name || null, treasurer_phone: r.treasurer_phone || null, decider: r.decider || null,
  israel_bonds_usd: r.israel_bonds_usd ? Number(r.israel_bonds_usd) : null, holdings_date: r.holdings_date || null, holdings_source: r.holdings_source || null,
  campaign_name: r.campaign_name || null, campaign_url: r.campaign_url || null, next_comment_date: r.next_comment_date || null,
  holdings_status: (r.holdings_status || 'unknown') as StateRow['holdings_status'],
});
const HEADER = 'state,treasurer_name,treasurer_phone,decider,israel_bonds_usd,holdings_date,holdings_source,campaign_name,campaign_url,next_comment_date,holdings_status';
const FIXTURE = parseCsv(`${HEADER}
MD,Dereck Davis,410-260-7533,Board of Trustees of the Maryland State Retirement and Pension System,12500000,2026-09-30,https://sra.maryland.gov/holdings,,,,held
WA,,,State Treasurer,,2026-06-30,https://tre.wa.gov/report,,,,none
OH,,,,,,,,,,unknown`);
const html = (row: StateRow) => render(h(Target, { t: targetsFor(stateGoal, undefined, delegation(row), [])[0] }));

describe('state target holdings copy', () => {
  it('held: amount, date and a source link; the amount is the CSV cell', () => {
    const row = cell(FIXTURE[0]);
    const out = html(row);
    expect(out).toContain('holds $12,500,000 (as of 2026-09-30)');
    expect(out).toContain('href="https://sra.maryland.gov/holdings"');
    expect(out).not.toContain(RESEARCH_URL);
  });
  it('none: "holds none" with its date and source link, no amount', () => {
    const out = html(cell(FIXTURE[1]));
    expect(out).toContain('holds none (as of 2026-06-30)');
    expect(out).toContain('href="https://tre.wa.gov/report"');
    expect(out).not.toMatch(/\$\d/);
  });
  it('unknown: "not yet sourced" plus "help us find it" linking the research file', () => {
    const out = html(cell(FIXTURE[2]));
    expect(out).toContain('not yet sourced');
    expect(out).toContain(`href="${RESEARCH_URL}"`);
    expect(out).toContain('help us find it');
  });
  it('every rendered amount equals the CSV cell, for the fixture rows and the shipped data/states.csv', () => {
    const rows = [...FIXTURE, ...parseCsv(readFileSync(CSV, 'utf8'))].map(cell);
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows) {
      const out = html(row);
      const shown = [...out.matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
      if (row.holdings_status === 'held') expect(shown, row.state).toEqual([row.israel_bonds_usd]);
      else expect(shown, row.state).toEqual([]);
      if (row.israel_bonds_usd !== null) expect(out).toContain(moneyUsd(row.israel_bonds_usd));
    }
  });
  it('the ask names the decider when set and falls back to "your state treasurer"', () => {
    const ask = 'Ask {decider} whether the state holds Israel Bonds.';
    expect(fillAsk(ask, cell(FIXTURE[0]))).toBe('Ask Board of Trustees of the Maryland State Retirement and Pension System whether the state holds Israel Bonds.');
    expect(fillAsk(ask, cell(FIXTURE[2]))).toBe('Ask your state treasurer whether the state holds Israel Bonds.');
    expect(fillAsk(ask, null)).toBe('Ask your state treasurer whether the state holds Israel Bonds.');
    expect(holdingsLine(null)).toBe('Israel Bonds: not yet sourced');
  });
});

// roster-freshness §1: a member target shows the DC "Call" button, then "District: <city> <phone>" as a tel: link; no office, no line.
describe('member target district line', () => {
  const member = {
    bioguide_id: 'C001110', name: 'Lou Correa', party: 'D', chamber: 'house', state: 'CA', district: 46, dc_phone: '202-225-2965', district_phone: null,
    contact_form_url: 'https://correa.house.gov/contact', hasc: 0, conferee: 0, rc243: null, jrd_april_2026: null, btb_cosponsor: 0, target_2028: 0, money_url: null,
    district_office_address: null, district_office_city: null, contact_kind: 'zip_gate', not_returning: 0, left_office: null,
  } as const;
  const office = { bioguide_id: 'C001110', office_id: 'C001110-santa_ana', city: 'Santa Ana', state: 'CA', zip: null, address: null, suite: null, building: null, phone: '714-559-6190', fax: null, hours: null, lat: null, lng: null };
  const goal = { id: 1, slug: 'ndaa-1217', category: 'federal_vote', status: 'active' } as unknown as Goal;
  const d: Delegation = { state: 'CA', district: 46, house: { ...member }, senators: [], state_row: null, incoming: { house: { ...member }, senators: [], uncalled: [] } };
  it('with an office: DC call button, then the district line', () => {
    const out = render(h(Target, { t: targetsFor(goal, undefined, d, [], [office])[0] }));
    expect(out).toContain('href="tel:2022252965"');
    expect(out).toContain('data-district-line');
    expect(out).toContain('District: Santa Ana ');
    expect(out).toContain('href="tel:7145596190"');
    expect(out.indexOf('tel:2022252965')).toBeLessThan(out.indexOf('tel:7145596190'));
  });
  it('without an office: no district line', () => {
    const out = render(h(Target, { t: targetsFor(goal, undefined, d, [], [])[0] }));
    expect(out).toContain('href="tel:2022252965"');
    expect(out).not.toContain('data-district-line');
  });
});

// urgency-and-readability §7: one bordered card per person with the spec 06 header row; the role line is built from
// the route's state/district, never typed by hand.
describe('target cards (spec 06)', () => {
  const correa = {
    bioguide_id: 'C001110', name: 'Lou Correa', party: 'D', chamber: 'house', state: 'CA', district: 46, dc_phone: '202-225-2965', district_phone: null,
    contact_form_url: 'https://correa.house.gov/contact', hasc: 0, conferee: 0, rc243: null, jrd_april_2026: null, btb_cosponsor: 0, target_2028: 0, money_url: null,
    district_office_address: null, district_office_city: null, contact_kind: 'zip_gate', not_returning: 0, left_office: null,
  } as const;
  const padilla = { ...correa, bioguide_id: 'P000145', name: 'Alex Padilla', chamber: 'senate', district: null, dc_phone: '202-224-3553' } as const;
  const goal = { id: 1, slug: 'ndaa-1217', category: 'federal_vote', status: 'active' } as unknown as Goal;
  const d: Delegation = { state: 'CA', district: 46, house: { ...correa }, senators: [{ ...padilla }], state_row: null, incoming: { house: { ...correa }, senators: [{ ...padilla }], uncalled: [] } };
  const cards = targetsFor(goal, undefined, d, [], []);
  it('the route card carries state and district; the role line reads "Representative · CA-46" / "Senator · CA" / "Treasurer · MD"', () => {
    expect(cards.map((t) => [t.state, t.district])).toEqual([['CA', 46], ['CA', null]]);
    expect(roleLine(cards[0])).toBe('Representative · CA-46');
    expect(roleLine(cards[1])).toBe('Senator · CA');
    expect(roleLine({ role: 'Rep.', state: 'AK', district: 0 })).toBe('Representative · AK at large');
    expect(roleLine({ role: 'Representative-elect', state: 'NY', district: 10 })).toBe('Representative-elect · NY-10');
    expect(roleLine(targetsFor(stateGoal, undefined, delegation(cell(FIXTURE[0])), [])[0])).toBe('Treasurer · MD');
    expect(roleLine({ role: 'Sen.' })).toBe('Senator'); // an older cached route without the fields degrades to the role alone
  });
  it('renders a bordered, shadowed card: party badge, name line, role line, status line, then a 44 px call square', () => {
    const out = render(h(Target, { t: cards[0] }));
    expect(out).toMatch(/^<li class="bg-paper border-2 border-ink shadow-brutal-sm p-3\.5 hover:bg-hazard\/10"/);
    expect(out).toContain('w-10 h-10 shrink-0 border-2 border-ink shadow-brutal-sm');
    expect(out).toContain('>Lou Correa</p>');
    expect(out).toMatch(/data-role-line[^>]*>Representative · CA-46</);
    expect(out).toContain('No recorded vote yet');
    expect(out).toMatch(/<a href="tel:2022252965" class="w-11 h-11 [^"]*bg-acid" aria-label="Call Lou Correa"/);
    expect(out).toContain('<svg aria-hidden="true"');
    const order = ['>Lou Correa</p>', 'data-role-line', 'No recorded vote yet', 'aria-label="Call Lou Correa"', 'No stated position'].map((s) => out.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i > -1)).toBe(true);
  });
  it('a member-elect gets the hazard contact square with the arrow glyph', () => {
    const t = { ...cards[0], bioguide_id: 'CA-46-x', name: 'New Member', role: 'Representative-elect', phone: null, elect: { replaces_name: 'Lou Correa', takes_office: '2027-01-03', contact_url: 'https://example.org/' } };
    const out = render(h(Target, { t }));
    expect(out).toMatch(/<a href="https:\/\/example.org\/" class="w-11 h-11 [^"]*bg-hazard" rel="noopener noreferrer" aria-label="Contact New Member"/);
    expect(out).not.toContain('tel:');
    expect(out.indexOf('aria-label="Contact New Member"')).toBeLessThan(out.indexOf('data-elect-line'));
  });
  it('the stack is a label line, cards 12 px apart, then whatever follows (the counter line); no enclosing box', () => {
    const out = render(h(TargetStack, { label: 'Who to call (2)', targets: cards, children: h('p', { 'data-counts': true }, '3 called') }));
    expect(out).toMatch(/^<div class="flex flex-col gap-3" data-target-stack[^>]*><p class="label-code">Who to call \(2\)<\/p><ul class="flex flex-col gap-3">/);
    expect(out.match(/<li class="bg-paper border-2/g)).toHaveLength(2);
    expect(out.indexOf('data-counts')).toBeGreaterThan(out.lastIndexOf('</li>'));
  });
});
