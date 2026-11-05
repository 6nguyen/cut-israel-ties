import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRows } from '../src/load';
import { PREP_HEADINGS, checkPrep, prepSections, unifiedAsk } from '../src/prep';

const DATA = join(__dirname, '..', '..', 'data');

function dataWith(slug: string, edit: (yaml: string) => string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cut-ties-prep-'));
  cpSync(DATA, dir, { recursive: true });
  const p = join(dir, 'goals', `${slug}.yaml`);
  writeFileSync(p, edit(readFileSync(p, 'utf8')));
  return dir;
}

describe('§3 prep pages', () => {
  it('the four maintainer-written goals carry all six sections, dated, and the upcoming goal has none', () => {
    const rows = loadRows(DATA);
    const withPrep = rows.goals.filter((g) => g.prep_md).map((g) => g.slug).sort();
    expect(withPrep).toEqual(['house-caucus', 'ndaa-1217', 'senate-leader', 'state-bonds']);
    for (const g of rows.goals.filter((x) => x.prep_md)) {
      expect(prepSections(g.prep_md).map((s) => s.title)).toEqual([...PREP_HEADINGS]);
    }
    expect(rows.goals.find((g) => g.slug === 'ndaa-report-vote')?.prep_md).toBeNull();
  });

  it('a prep_md without a required heading fails the load', () => {
    const dir = dataWith('ndaa-1217', (y) => y.replace('  ## What counts as a win', '  ## Success'));
    expect(() => loadRows(dir)).toThrow(/ndaa-1217: prep_md headings must be exactly/);
  });

  it('headings out of order fail the load', () => {
    const md = ['Timeline', 'Where things stand', 'What to say in 30 seconds', 'Likely pushback and answers', 'What counts as a win', 'Sources']
      .map((h) => `## ${h}\n2026-11-04 text`).join('\n');
    expect(() => checkPrep('x', md)).toThrow(/headings must be exactly/);
  });

  it('an undated "Where things stand" fails the load', () => {
    const dir = dataWith('state-bonds', (y) => y.replace('*As of 2026-11-04.*', '*As of today.*'));
    expect(() => loadRows(dir)).toThrow(/must carry an ISO date/);
  });

  it('an empty section fails; an empty prep_md is allowed', () => {
    const md = PREP_HEADINGS.map((h, i) => `## ${h}\n${i === 0 ? '2026-11-04' : i === 3 ? '' : 'text'}`).join('\n');
    expect(() => checkPrep('x', md)).toThrow(/section "Likely pushback and answers" is empty/);
    expect(() => checkPrep('x', '')).not.toThrow();
    expect(() => checkPrep('x', null)).not.toThrow();
  });

  it('the unified ask names the condition and, when set, the first pick', () => {
    const want = 'Your senator conditions their ballot on stripping the section.';
    expect(unifiedAsk(want)).toBe(want);
    expect(unifiedAsk(want, 'Jane Doe')).toBe(`${want} Our first pick: Jane Doe.`);
  });
});
