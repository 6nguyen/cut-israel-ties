// leader-call-scripts §1–§4: script blocks compose into hundreds of distinct, checked scripts per target.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { parseFormat, parseSchema, wordCount, type Target } from '../src/generate';
import { loadRows } from '../src/load';
import { combinations, compose, parseBlocks, type ScriptBlocks } from '../src/compose';
import { checkScriptBlocks, checkStandardTemplates, scriptCombinations, standardScript } from '../src/standard';
import type { Action } from '../src/types';

const rows = loadRows(join(__dirname, '..', '..', 'data'), '2026-11-06T00:00:00Z');
const FIELDS = { first_name: 'Maya', city: 'Brooklyn', why: 'My brother is in the Navy and I do not want his unit folded into a war Congress never voted on.' };

const member = (id: string) => rows.members.find((m) => m.bioguide_id === id)!;
const target = (id: string): Target => ({ kind: 'member', id, member: member(id), position: null, prior_vote: 'No recorded vote yet' });
const action = (slug: string) => rows.actions.find((a) => a.slug === slug)!;
const goalOf = (a: Action) => rows.goals.find((g) => g.id === a.goal_id)!;
const blocksOf = (a: Action): ScriptBlocks => parseBlocks(JSON.parse(a.script_blocks!), a.slug);

const CASES: [string, string, string][] = [
  ['house-caucus-call', 'J000294', 'Jeffries'],
  ['house-caucus-call', 'C001110', 'Correa'],
  ['senate-leader-call', 'S000148', 'Schumer'],
  ['senate-leader-call', 'G000555', 'Gillibrand'],
];

describe('leadership blocks (data/script_blocks/leadership.yaml)', () => {
  it('both leadership actions carry the blocks and no standard_template', () => {
    for (const slug of ['house-caucus-call', 'senate-leader-call']) {
      const a = action(slug);
      expect(a.standard_template).toBeNull();
      expect(blocksOf(a).incumbents).toEqual(['J000294', 'S000148']);
    }
  });

  it.each(CASES)('%s for %s: hundreds of combinations, every seed passes the check (AC 1–3)', (slug, id, surname) => {
    const a = action(slug);
    const g = goalOf(a);
    const fmt = parseFormat(a);
    const t = target(id);
    expect(scriptCombinations(g, a, fmt, t, FIELDS)).toBeGreaterThanOrEqual(500);
    const bodies = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const r = standardScript(g, a, fmt, t, FIELDS, seed);
      expect(r.check, `seed ${seed}: ${JSON.stringify(r.check)}`).toMatchObject({ ok: true });
      expect(r.variant).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/);
      expect(r.body).toContain(surname);
      expect(r.body).toContain(FIELDS.first_name);
      expect(r.body).toContain(FIELDS.why.split(' ').slice(0, 6).join(' ')); // fillStandard trims a long why to fit max_words
      expect(r.body).not.toMatch(/\{\{|\}\}|\d/);
      expect(wordCount(r.body)).toBeGreaterThanOrEqual(fmt.min_words);
      expect(wordCount(r.body)).toBeLessThanOrEqual(fmt.max_words);
      bodies.add(r.body);
    }
    expect(bodies.size).toBeGreaterThanOrEqual(100);
  });

  it('the same seed gives the same script; different seeds differ', () => {
    const a = action('senate-leader-call');
    const g = goalOf(a);
    const fmt = parseFormat(a);
    const one = standardScript(g, a, fmt, target('S000148'), FIELDS, 42);
    expect(standardScript(g, a, fmt, target('S000148'), FIELDS, 42)).toEqual(one);
    expect(standardScript(g, a, fmt, target('S000148'), FIELDS, 43).body).not.toBe(one.body);
  });

  it('the incumbents get the step-aside asks; other Democrats get the vote-only asks (§2)', () => {
    const a = action('senate-leader-call');
    const g = goalOf(a);
    const fmt = parseFormat(a);
    const asks = (id: string) => {
      const seen = new Set<string>();
      for (let s = 0; s < 60; s++) seen.add(standardScript(g, a, fmt, target(id), FIELDS, s).variant!.split('.').find((v) => v.startsWith('ask'))!);
      return [...seen];
    };
    const schumer = asks('S000148');
    const gillibrand = asks('G000555');
    expect(schumer.every((v) => v.startsWith('askss'))).toBe(true);
    expect(gillibrand.every((v) => v.startsWith('asks') && !v.startsWith('askss'))).toBe(true);
    const texts = new Set<string>();
    for (let s = 0; s < 60; s++) texts.add(standardScript(g, a, fmt, target('S000148'), FIELDS, s).body);
    expect([...texts].every((b) => /step aside|keep this job by committing/i.test(b))).toBe(true);
    for (let s = 0; s < 60; s++) expect(standardScript(g, a, fmt, target('G000555'), FIELDS, s).body).toContain('vote only for a leader');
  });

  it('an optional field present unlocks more combinations (§2 when.has)', () => {
    const a = action('house-caucus-call');
    const g = goalOf(a);
    const fmt = parseFormat(a);
    const t = target('J000294');
    const without = scriptCombinations(g, a, fmt, t, FIELDS);
    const withAff = scriptCombinations(g, a, fmt, t, { ...FIELDS, affiliation: 'a nurse' });
    expect(withAff).toBeGreaterThan(without);
    let found = false;
    for (let s = 0; s < 100 && !found; s++) found = standardScript(g, a, fmt, t, { ...FIELDS, affiliation: 'a nurse' }, s).body.includes('a nurse');
    expect(found).toBe(true);
  });

  it('a House target never gets a Senate line and vice versa', () => {
    for (const [slug, id] of CASES) {
      const a = action(slug);
      const g = goalOf(a);
      const fmt = parseFormat(a);
      for (let s = 0; s < 40; s++) {
        const body = standardScript(g, a, fmt, target(id), FIELDS, s).body;
        if (slug === 'house-caucus-call') expect(body).not.toMatch(/\bsenators?\b|\bSenate\b|\bSen\./);
        else expect(body).not.toMatch(/\brepresentative\b|\bHouse\b|\bRep\./);
      }
    }
  });
});

describe('compose / combinations (unit)', () => {
  const blocks = parseBlocks({
    incumbents: ['X1'],
    slots: [
      { name: 'a', variants: [{ id: 'a1', text: 'one' }, { id: 'a2', text: 'two' }, { id: 'a3', text: 'three', when: { self: true } }] },
      { name: 'b', pick: 2, variants: [{ id: 'b1', text: 'b one' }, { id: 'b2', text: 'b two' }, { id: 'b3', text: 'b three', when: { has: ['user_affiliation'] } }] },
    ],
  }, 'unit');
  const t = (id: string, present: string[] = []) => ({ id, chamber: 'house' as const, present: (p: string) => present.includes(p) });

  it('counts choose(n, pick) per slot over the eligible variants', () => {
    expect(combinations(blocks, t('Y1'))).toBe(2 * 1);
    expect(combinations(blocks, t('X1'))).toBe(3 * 1);
    expect(combinations(blocks, t('X1', ['user_affiliation']))).toBe(3 * 3);
  });

  it('keeps picks in file order, joins variants by space and slots by newline, and is deterministic', () => {
    const r = compose(blocks, t('X1', ['user_affiliation']), 5);
    expect(r.ids).toHaveLength(3);
    expect(r.template.split('\n')).toHaveLength(2);
    const [bi, bj] = r.ids.slice(1);
    expect(bi < bj).toBe(true);
    expect(compose(blocks, t('X1', ['user_affiliation']), 5)).toEqual(r);
  });

  it('throws when a slot has too few eligible variants', () => {
    const thin = parseBlocks({ slots: [{ name: 'a', pick: 2, variants: [{ id: 'a1', text: 'one' }, { id: 'a2', text: 'two', when: { self: true } }] }] }, 'unit');
    expect(() => compose(thin, t('Y1'), 0)).toThrow(/slot a: 1 eligible variants for Y1, needs 2/);
  });
});

describe('parseBlocks rejects malformed files (§1)', () => {
  const ok = { slots: [{ name: 'a', variants: [{ id: 'a1', text: 'x' }] }] };
  it.each([
    [null, /must be a mapping/],
    [{ slots: [] }, /slots must be a non-empty list/],
    [{ ...ok, extra: 1 }, /unknown key extra/],
    [{ slots: [{ name: 'A', variants: [{ id: 'a1', text: 'x' }] }] }, /name must match/],
    [{ slots: [{ name: 'a', pick: 0, variants: [{ id: 'a1', text: 'x' }] }] }, /pick must be a positive integer/],
    [{ slots: [{ name: 'a', carries: ['target'], variants: [{ id: 'a1', text: 'x' }] }] }, /carries may list only ask and mention/],
    [{ slots: [{ name: 'a', variants: [{ id: 'a1', text: 'x' }, { id: 'a1', text: 'y' }] }] }, /duplicate variant id/],
    [{ slots: [{ name: 'a', variants: [{ id: 'a1', text: '' }] }] }, /text must be a non-empty string/],
    [{ slots: [{ name: 'a', variants: [{ id: 'a1', text: 'x', when: { chambre: 'house' } }] }] }, /unknown key chambre/],
    [{ slots: [{ name: 'a', variants: [{ id: 'a1', text: 'x', when: { chamber: 'upper' } }] }] }, /when.chamber must be house or senate/],
    [{ slots: [{ name: 'a', variants: [{ id: 'a1', text: 'x', when: { self: 'yes' } }] }] }, /when.self must be true or false/],
    [{ slots: [{ name: 'a', variants: [{ id: 'a1', text: 'x', when: { has: [] } }] }] }, /when.has must be a list of placeholder names/],
  ])('%j', (raw, re) => {
    expect(() => parseBlocks(raw, 'unit')).toThrow(re);
  });
});

describe('checkScriptBlocks (seed check, §4)', () => {
  const a = action('senate-leader-call');
  const g = goalOf(a);
  const edit = (f: (b: { incumbents: string[]; slots: { name: string; variants: { id: string; text: string; when?: Record<string, unknown> }[] }[] }) => void): Action => {
    const b = JSON.parse(a.script_blocks!);
    f(b);
    return { ...a, script_blocks: JSON.stringify(b) };
  };
  const slot = (b: { slots: { name: string; variants: { id: string; text: string; when?: Record<string, unknown> }[] }[] }, name: string) => b.slots.find((s) => s.name === name)!;
  const run = (x: Action) => () => checkScriptBlocks(g, x, rows.members, rows.positions, rows.states);

  it('the shipped file passes for every target', () => {
    expect(run(a)).not.toThrow();
    expect(() => checkStandardTemplates(rows.goals, rows.actions, rows.members, rows.positions, rows.states)).not.toThrow();
  });

  it('names the failing block for text problems', () => {
    expect(run(edit((b) => { b.incumbents.push('Z999999'); }))).toThrow(/incumbent Z999999 is not in members.csv/);
    expect(run(edit((b) => { slot(b, 'close').variants[0].text += ' Section 1217.'; }))).toThrow(/close\/cl1: digits are not allowed/);
    expect(run(edit((b) => { slot(b, 'close').variants[0].text += ' {{user_zip}}'; }))).toThrow(/close\/cl1: unknown placeholder \{\{user_zip\}\}/);
    expect(run(edit((b) => { slot(b, 'close').variants[0].when = { has: ['user_zip'] }; }))).toThrow(/when.has names unknown placeholder user_zip/);
    expect(run(edit((b) => { slot(b, 'close').variants[0].text += ' See www.example.org.'; }))).toThrow(/no URLs, email addresses or handles/);
    expect(run(edit((b) => { slot(b, 'close').variants[0].text += ' End aid now.'; }))).toThrow(/contains "end aid"/);
  });

  it('fails when a target would have too few eligible variants or an ask loses its phrase', () => {
    expect(run(edit((b) => { for (const v of slot(b, 'close').variants) v.when = { self: true }; }))).toThrow(/slot close has 0 eligible variants, needs 1/);
    expect(run(edit((b) => { for (const v of slot(b, 'ask').variants) v.text = v.text.replace(/vote only for a leader/i, 'back a leader'); }))).toThrow(/lacks the ask phrase "vote only for a leader"/);
  });

  it('fails when a combination can fall outside the word range', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}`).join(' ');
    expect(run(edit((b) => { slot(b, 'close').variants[0].text += ` ${long}`; }))).toThrow(/longest combination is \d+ words, above max_words/);
    expect(run(edit((b) => { for (const s of b.slots) if (s.name !== 'ask') for (const v of s.variants) v.text = v.text.includes('{{') ? v.text : 'So.'; }))).toThrow(/shortest combination is \d+ words, below min_words/);
  });
});
