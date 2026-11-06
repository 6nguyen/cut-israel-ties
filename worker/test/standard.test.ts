// generation-cost §4: the code-built standard script — placeholders, the fill, the trim and the seed checks.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { parseFormat, parseSchema, wordCount, type Target } from '../src/generate';
import { loadRows } from '../src/load';
import { checkStandardTemplates, fillStandard, fixtureFields, placeholders, standardFacts, standardScript, unknownPlaceholders } from '../src/standard';
import type { Action } from '../src/types';

const rows = loadRows(join(__dirname, '..', '..', 'data'), '2026-11-04T00:00:00Z');
const action = rows.actions.find((a) => a.slug === 'ndaa-1217-call')!;
const goal = rows.goals.find((g) => g.id === action.goal_id)!;
const correa = rows.members.find((m) => m.bioguide_id === 'C001110')!;
const target: Target = { kind: 'member', id: correa.bioguide_id, member: correa, position: null, prior_vote: 'No recorded vote yet' };
const fmt = parseFormat(action);
const schema = parseSchema(action);
const FIELDS = { first_name: 'Maya', city: 'Santa Ana', why: 'My cousin is deployed and I do not want him folded into someone else\'s war.' };
const check = (actions: Action[]) => () => checkStandardTemplates(rows.goals, actions, rows.members, rows.positions, rows.states);
const withTemplate = (t: string | null): Action[] => rows.actions.map((a) => (a.slug === action.slug ? { ...a, standard_template: t } : a));

describe('placeholders', () => {
  it('lists each name once and flags the unknown ones against the form schema', () => {
    expect(placeholders('{{target_name}} and {{ target_name }} and {{user_city}} {{nope}}')).toEqual(['target_name', 'user_city', 'nope']);
    expect(unknownPlaceholders('{{target_role}} {{user_first_name}} {{user_zip}} {{pick_line}} {{mention}}', schema)).toEqual(['user_zip']);
    expect(unknownPlaceholders(action.standard_template!, schema)).toEqual([]);
  });

  it('facts come from the same rows as the fact block', () => {
    const f = standardFacts(goal, action, fmt, target);
    expect(f).toMatchObject({ target_name: 'Lou Correa', target_role: 'Rep.', mention: 'integration section', prior_vote_line: '', position_line: '', pick_line: '' });
    expect(f.ask).toBe(action.ask_text);
    const voted = standardFacts(goal, action, fmt, { ...target, prior_vote: 'Roll call 243: yes', position: { bioguide_id: correa.bioguide_id, goal_id: goal.id, position: 'against', source_url: '', source_date: '2026-10-01' } });
    expect(voted.prior_vote_line).toBe('You are on the record (Roll call 243: yes).');
    expect(voted.position_line).toMatch(/on record against/);
  });
});

describe('fillStandard', () => {
  const facts = standardFacts(goal, action, fmt, target);

  it('drops empty placeholders cleanly and never leaves a brace', () => {
    const out = fillStandard('Hi {{user_first_name}} , {{prior_vote_line}} {{position_line}} end .\n{{user_affiliation}}\nBye {{target_name}}.', facts, { first_name: 'Maya' }, 120);
    expect(out).toBe('Hi Maya, end.\nBye Lou Correa.');
  });

  it('trims the longest user field word by word to stay within max_words; the fixed text is never cut', () => {
    const long = { first_name: 'Maya', city: 'Santa Ana', why: Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ') };
    const out = fillStandard(action.standard_template!, facts, long, fmt.max_words);
    expect(wordCount(out)).toBeLessThanOrEqual(fmt.max_words);
    expect(out).toContain('Thank you for your time.');
    expect(out).toContain('drop the integration section');
    expect(out).toContain('w0');
    expect(out).not.toContain('w79');
    expect(out).toMatch(/w\d+\./); // the cut field is closed with a full stop
  });

  it('standardScript passes the §4.8.4 check with the real fields', () => {
    const { body, check: c } = standardScript(goal, action, fmt, target, FIELDS);
    expect(c.ok).toBe(true);
    expect(wordCount(body)).toBeGreaterThanOrEqual(fmt.min_words);
    expect(body).toContain('Rep. Lou Correa');
    expect(body).toContain(FIELDS.why);
  });

  it('fixtureFields gives the shortest valid set and the longest', () => {
    const [shortest, longest] = fixtureFields(schema);
    expect(Object.keys(shortest)).toEqual(['first_name', 'city', 'why']);
    expect(longest.why.length).toBe(280);
    expect(longest.affiliation.length).toBe(80);
  });
});

describe('checkStandardTemplates (seed checks)', () => {
  it('the shipped data passes for every target in scope with both fixture field sets', () => {
    expect(check(rows.actions)).not.toThrow();
  });

  it('names the action when a template is missing on an active goal, has an unknown placeholder, or fails the output check', () => {
    expect(check(withTemplate(null))).toThrow(/ndaa-1217-call: standard_template is required/);
    expect(check(withTemplate(`${action.standard_template}\nAlso {{user_zip}} and {{target_phone}}.`))).toThrow(/ndaa-1217-call: standard_template has unknown placeholder \{\{user_zip\}\}, \{\{target_phone\}\}/);
    expect(check(withTemplate('Hi {{target_name}}, drop the integration section. {{user_why}}'))).toThrow(/ndaa-1217-call: standard_template fails the output check for .* \(word count/);
    const noAsk = action.standard_template!.replace('drop the integration section', 'remove the integration section');
    expect(check(withTemplate(noAsk))).toThrow(/ask wording missing/);
    const digit = `${action.standard_template}\nSection 4321 too.`;
    expect(check(withTemplate(digit))).toThrow(/number 4321 is not in the fact block/);
  });

  it('an upcoming goal may lack a template but still may not use an unknown placeholder', () => {
    const upcoming = rows.actions.find((a) => a.slug === 'ndaa-report-vote-call')!;
    expect(rows.goals.find((g) => g.id === upcoming.goal_id)!.status).not.toBe('active');
    const actions = rows.actions.map((a) => (a.slug === upcoming.slug ? { ...a, standard_template: null } : a));
    expect(check(actions)).not.toThrow();
    const bad = rows.actions.map((a) => (a.slug === upcoming.slug ? { ...a, standard_template: '{{what}}' } : a));
    expect(check(bad)).toThrow(/ndaa-report-vote-call: standard_template has unknown placeholder/);
  });
});
