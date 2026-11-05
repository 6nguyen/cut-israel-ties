// state-holdings-sweep §1.2–§1.3: states.csv seed checks; no number without a source.
import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkStates, loadRows } from '../src/load';
import { STATES_HEADER } from '../src/draft-holding';
import type { StateRow } from '../src/types';

const DATA = join(__dirname, '..', '..', 'data');
const NOW = '2026-11-04T00:00:00Z';

function withStates(csv: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cut-ties-states-'));
  cpSync(DATA, dir, { recursive: true });
  writeFileSync(join(dir, 'states.csv'), `${STATES_HEADER}\n${csv}\n`);
  return dir;
}
const base: StateRow = { state: 'CA', treasurer_name: null, treasurer_phone: null, decider: null, israel_bonds_usd: null, holdings_date: null, holdings_source: null, campaign_name: null, campaign_url: null, next_comment_date: null, holdings_status: 'unknown' };

describe('states.csv', () => {
  it('ships with holdings_status on every row and loads', () => {
    const rows = loadRows(DATA, NOW);
    expect(rows.states.length).toBeGreaterThan(0);
    for (const s of rows.states) expect(['held', 'none', 'unknown']).toContain(s.holdings_status);
  });
  it('an amount without a source or a date fails the seed; a sourced one passes', () => {
    expect(() => loadRows(withStates('CA,,,,12500000,,,,,,held'), NOW)).toThrow(/CA has israel_bonds_usd without holdings_source and holdings_date/);
    expect(() => loadRows(withStates('CA,,,,12500000,2026-09-30,,,,,held'), NOW)).toThrow(/without holdings_source/);
    expect(() => loadRows(withStates('CA,,,,12500000,,https://x.gov/r,,,,held'), NOW)).toThrow(/without holdings_source and holdings_date/);
    const ok = loadRows(withStates('CA,,,,12500000,2026-09-30,https://x.gov/r,,,,held'), NOW);
    expect(ok.states[0]).toMatchObject({ israel_bonds_usd: 12_500_000, holdings_status: 'held' });
  });
  it('a past next_comment_date fails the seed; today or later passes', () => {
    expect(() => loadRows(withStates('CA,,,,,,,,,2026-11-03,unknown'), NOW)).toThrow(/next_comment_date 2026-11-03 is in the past/);
    expect(loadRows(withStates('CA,,,,,,,,,2026-11-04,unknown'), NOW).states[0].next_comment_date).toBe('2026-11-04');
  });
  it('a campaign_url without a campaign_name fails the seed', () => {
    expect(() => loadRows(withStates('CA,,,,,,,,https://divest.example.org,,unknown'), NOW)).toThrow(/campaign_url without campaign_name/);
  });
  it('holdings_status is consistent with the amount: held needs one, none and unknown carry none, none needs a source', () => {
    expect(() => checkStates([{ ...base, holdings_status: 'maybe' as StateRow['holdings_status'] }], '2026-11-04')).toThrow(/holdings_status must be one of/);
    expect(() => checkStates([{ ...base, holdings_status: 'held' }], '2026-11-04')).toThrow(/held without israel_bonds_usd/);
    expect(() => checkStates([{ ...base, israel_bonds_usd: 5, holdings_date: '2026-01-01', holdings_source: 'https://x', holdings_status: 'unknown' }], '2026-11-04')).toThrow(/holdings_status is unknown/);
    expect(() => checkStates([{ ...base, holdings_status: 'none' }], '2026-11-04')).toThrow(/none without holdings_source and holdings_date/);
    expect(() => checkStates([{ ...base, israel_bonds_usd: -3, holdings_date: '2026-01-01', holdings_source: 'https://x', holdings_status: 'held' }], '2026-11-04')).toThrow(/positive whole number/);
    expect(() => checkStates([{ ...base, holdings_date: '2026-06-30', holdings_source: 'https://x', holdings_status: 'none' }], '2026-11-04')).not.toThrow();
    expect(() => loadRows(withStates('CA,,,,,,,,,,'), NOW)).not.toThrow(); // empty status reads as unknown
  });
});
