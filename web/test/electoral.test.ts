// primary-2028 §1.2 + Open question 1: the electoral target renders the record (rows only, each
// with source and date) and no advocacy word reaches the markup. The dist sweep runs only when
// `web/dist` exists (after `scripts/quiet-check.sh build`) and covers every electoral goal page.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { forbiddenPhrases, type RecordLine } from '@worker/electoral';
import type { TargetCard } from '@worker/route';
import { Target } from '../src/components/Target';

const member = {
  bioguide_id: 'R000614', name: 'Chip Roy', party: 'R', chamber: 'house', state: 'TX', district: 21,
  dc_phone: '202-225-4236', district_phone: null, contact_form_url: 'https://roy.house.gov/contact', hasc: 0, conferee: 0,
  rc243: 'yes', jrd_april_2026: null, btb_cosponsor: 0, target_2028: 1, money_url: null,
} as TargetCard['member'];
const record: RecordLine[] = [
  { goal_slug: 'ndaa-1217', goal_title: 'NDAA section 1217', goal_status: 'expired', decision_date: '2026-11-20', position: 'no', source_url: 'https://example.gov/statement', source_date: '2026-10-02', vote: 'Voted yes on roll call 243' },
  { goal_slug: 'house-caucus', goal_title: 'House caucus letter', goal_status: 'completed', decision_date: '2026-09-01', position: 'unknown', source_url: null, source_date: null, vote: 'No recorded vote' },
];
const card = { member, position: 'unknown', source_url: null, source_date: null, prior_vote: 'Voted yes on roll call 243', flags: [], record } as unknown as TargetCard;

describe('electoral target (primary-2028 §1.2)', () => {
  it('renders every record line with its source and date, and no advocacy word', () => {
    const html = render(h(Target, { t: card }));
    expect(html).toContain('On the record');
    expect(html).toContain('NDAA section 1217');
    expect(html).toContain('https://example.gov/statement');
    expect(html).toContain('Oct 2, 2026');
    expect(html).toContain('no sourced statement');
    expect(forbiddenPhrases(html.replace(/<[^>]+>/g, ' '))).toEqual([]);
  });
  it('an empty record says so instead of guessing', () => {
    const html = render(h(Target, { t: { ...card, record: [] } }));
    expect(html).toContain('No goal this site tracked has named this member yet.');
  });
});

describe('built pages (Open question 1)', () => {
  const dist = join(process.cwd(), 'dist', 'goals');
  const pages = existsSync(dist) ? readdirSync(dist).filter((d) => d.startsWith('primary-')) : [];
  it.skipIf(!existsSync(dist))('no electoral goal page in web/dist contains a forbidden phrase', () => {
    for (const d of pages) {
      const text = readFileSync(join(dist, d, 'index.html'), 'utf8').replace(/<[^>]+>/g, ' ');
      expect(forbiddenPhrases(text), d).toEqual([]);
    }
  });
});
