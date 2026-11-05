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
import { Target } from './Target';

const CSV = join(process.cwd(), '..', 'data', 'states.csv');
const stateGoal = { id: 9, slug: 'state-bonds', category: 'state', status: 'active' } as unknown as Goal;
const delegation = (row: StateRow): Delegation => ({ state: row.state, district: 1, house: null, senators: [], state_row: row });
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
