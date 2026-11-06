// generation-cost §4: the code-built standard script. Rendered from an action's `standard_template`
// and the same facts the model would see, when no model may run (cap, budget 0, no key, upstream down).
// No LLM touches it; it passes the same output check as a generated draft, and the seed proves it can.
import type { Action, Goal, Member, Position, StateRow } from './types';
import { checkOutput, digitRuns, factBlock, firstPick, parseFormat, parseSchema, targetContact, targetName, wordCount, type Check, type DocFormat, type FormField, type Target } from './generate';
import { priorVote } from './route';
import { fillAsk } from './state-copy';

export const FIXED_PLACEHOLDERS = ['target_name', 'target_role', 'ask', 'mention', 'position_line', 'prior_vote_line', 'pick_line'] as const;
export type StandardFacts = Record<(typeof FIXED_PLACEHOLDERS)[number], string>;
const PLACEHOLDER_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;
const NO_VOTE = 'No recorded vote yet';

/** Distinct placeholder names in a template, in order of first appearance. */
export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER_RE)].map((m) => m[1]))];
}

/** Names that are neither fixed nor `user_<field>` for a field in the form schema. */
export function unknownPlaceholders(template: string, schema: FormField[]): string[] {
  const known = new Set<string>([...FIXED_PLACEHOLDERS, ...schema.map((f) => `user_${f.name}`)]);
  return placeholders(template).filter((p) => !known.has(p));
}

const POSITION_LINE: Record<Position['position'], string> = {
  for: 'You are on record for this, and I am asking you to hold to it.',
  against: 'You are on record against this, and I am asking you to change that.',
  uncommitted: 'You have not committed either way yet.',
  unknown: '',
};

/** The placeholder values, from the same D1 rows as `factBlock`. */
export function standardFacts(goal: Goal, action: Action, fmt: DocFormat, t: Target): StandardFacts {
  const contact = targetContact(t);
  const pick = firstPick(goal);
  return {
    target_name: targetName(t),
    target_role: contact.role,
    ask: fillAsk(action.ask_text, t.kind === 'state' ? t.row : null),
    mention: fmt.mentions[0] ?? '',
    position_line: t.kind === 'member' && t.position ? POSITION_LINE[t.position.position] : '',
    prior_vote_line: t.kind === 'member' && t.prior_vote && t.prior_vote !== NO_VOTE ? `You are on the record (${t.prior_vote}).` : '',
    pick_line: pick ? `Our pick for that job is ${pick.name}.` : '',
  };
}

function render(template: string, facts: StandardFacts, fields: Record<string, string>): string {
  const text = template.replace(PLACEHOLDER_RE, (_m, name: string) => {
    if (name.startsWith('user_')) return fields[name.slice(5)] ?? '';
    return facts[name as keyof StandardFacts] ?? '';
  });
  return text
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').replace(/ ([,.;:!?])/g, '$1').trim())
    .filter((l) => l !== '')
    .join('\n');
}

const endsPunctuated = (s: string): boolean => /[.!?…]$/.test(s);

/**
 * Fills the template from the facts and the shaped (stripped) user fields. When the result runs past
 * `maxWords`, the longest user field is shortened word by word until it fits; the fixed text is never cut.
 */
export function fillStandard(template: string, facts: StandardFacts, fields: Record<string, string>, maxWords: number): string {
  const f: Record<string, string> = { ...fields };
  for (;;) {
    const out = render(template, facts, f);
    const over = wordCount(out) - maxWords;
    if (over <= 0) return out;
    const longest = Object.keys(f).sort((a, b) => wordCount(f[b]) - wordCount(f[a]))[0];
    if (!longest || wordCount(f[longest]) <= 1) return out;
    const words = f[longest].trim().split(/\s+/);
    const kept = words.slice(0, Math.max(1, words.length - over)).join(' ').replace(/[,;:]$/, '');
    f[longest] = endsPunctuated(kept) ? kept : `${kept}.`;
  }
}

/** A standard script for one request: the fill plus the §4.8.4 output check. */
export function standardScript(goal: Goal, action: Action, fmt: DocFormat, t: Target, fields: Record<string, string>): { body: string; check: Check } {
  const template = action.standard_template ?? '';
  const body = fillStandard(template, standardFacts(goal, action, fmt, t), fields, fmt.max_words);
  const allowedDigits = new Set<string>([...digitRuns(factBlock(goal, action, fmt, t)), ...Object.values(fields).flatMap(digitRuns)]);
  const check = checkOutput({ subject: '', body, facts_used: [] }, { targetName: targetName(t), fmt, allowedDigits, pickName: firstPick(goal)?.name ?? null });
  return { body, check };
}

// ---- seed checks ---------------------------------------------------------------------------
/** Fixture field sets: the shortest a valid submission can be, and the longest. */
export function fixtureFields(schema: FormField[]): Record<string, string>[] {
  const shortest: Record<string, string> = {};
  const longest: Record<string, string> = {};
  for (const f of schema) {
    if (f.required) shortest[f.name] = 'Sample';
    longest[f.name] = Array.from({ length: f.max }, (_, i) => (i % 5 === 4 && i !== f.max - 1 ? ' ' : 'w')).join('');
  }
  return [shortest, longest];
}

function targetsFor(action: Action, goal: Goal, members: Member[], positions: Position[], states: StateRow[]): Target[] {
  if (action.target_scope === 'state') return states.map((row) => ({ kind: 'state', id: row.state, state: row.state, row }));
  return members
    .filter((m) => (action.target_scope === 'both' || m.chamber === action.target_scope) && (goal.category !== 'leadership' || m.party === 'D'))
    .map((member) => ({
      kind: 'member',
      id: member.bioguide_id,
      member,
      position: positions.find((p) => p.bioguide_id === member.bioguide_id && p.goal_id === goal.id) ?? null,
      prior_vote: priorVote(member, goal),
    }));
}

/**
 * Every action on an `active` goal has a `standard_template` with only known placeholders whose fill
 * passes the output check for every target in scope, with the shortest and the longest valid fields.
 */
export function checkStandardTemplates(goals: Goal[], actions: Action[], members: Member[], positions: Position[], states: StateRow[]): void {
  for (const a of actions) {
    const goal = goals.find((g) => g.id === a.goal_id);
    if (!goal) continue;
    const schema = parseSchema(a);
    if (a.standard_template === null) {
      if (goal.status === 'active') throw new Error(`action ${a.slug}: standard_template is required while goal ${goal.slug} is active (generation-cost §4)`);
      continue;
    }
    const unknown = unknownPlaceholders(a.standard_template, schema);
    if (unknown.length) throw new Error(`action ${a.slug}: standard_template has unknown placeholder ${unknown.map((p) => `{{${p}}}`).join(', ')}`);
    if (goal.status !== 'active') continue;
    const fmt = parseFormat(a);
    for (const t of targetsFor(a, goal, members, positions, states)) {
      for (const fields of fixtureFields(schema)) {
        const { body, check } = standardScript(goal, a, fmt, t, fields);
        if (/\{\{|\}\}/.test(body)) throw new Error(`action ${a.slug}: standard_template leaves a brace in the text`);
        if (!check.ok) throw new Error(`action ${a.slug}: standard_template fails the output check for ${t.id} (${check.reason})`);
      }
    }
  }
}
