// generation-cost §4: the code-built standard script. Rendered from an action's `standard_template`
// and the same facts the model would see, when no model may run (cap, budget 0, no key, upstream down).
// No LLM touches it; it passes the same output check as a generated draft, and the seed proves it can.
import type { Action, Chamber, Goal, Member, MemberElect, Position, StateRow } from './types';
import { BLOCKLIST, checkOutput, digitRuns, factBlock, firstPick, incumbentIds, leaderLine, parseFormat, parseSchema, pickLeader, targetContact, targetName, wordCount, type Check, type DocFormat, type FormField, type Target } from './generate';
import { combinations, compose, eligibleVariants, parseBlocks, type ComposeTarget, type ScriptBlocks } from './compose';
import { priorVote } from './route';
import { fillAsk } from './state-copy';

export const FIXED_PLACEHOLDERS = ['target_name', 'target_role', 'ask', 'mention', 'position_line', 'prior_vote_line', 'pick_line', 'leader_line'] as const;
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
    // leadership-routing §3.3: empty for the leader themself, for non-leadership goals and for state targets.
    leader_line: t.kind !== 'state' && t.leader ? leaderLine(t.leader) : '',
  };
}

/** One placeholder's value: `user_<field>` from the fields, anything else from the facts; '' when unknown. */
export function resolvePlaceholder(name: string, facts: StandardFacts, fields: Record<string, string>): string {
  if (name.startsWith('user_')) return fields[name.slice(5)] ?? '';
  return facts[name as keyof StandardFacts] ?? '';
}

export function render(template: string, facts: StandardFacts, fields: Record<string, string>): string {
  const text = template.replace(PLACEHOLDER_RE, (_m, name: string) => resolvePlaceholder(name, facts, fields));
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

// ---- script blocks (leader-call-scripts §2) ----------------------------------------------------
export function actionBlocks(action: Action): ScriptBlocks | null {
  return action.script_blocks ? parseBlocks(JSON.parse(action.script_blocks), `action ${action.slug}`) : null;
}

/** The eligibility view of one request: target id and chamber, plus which placeholders render non-empty. */
export function composeTarget(t: Target, facts: StandardFacts, fields: Record<string, string>): ComposeTarget {
  return {
    id: t.id,
    chamber: t.kind === 'member' ? t.member.chamber : t.kind === 'elect' ? t.elect.chamber : null,
    present: (name) => resolvePlaceholder(name, facts, fields).trim() !== '',
  };
}

/**
 * A standard script for one request: the fill plus the §4.8.4 output check. With script blocks the template is
 * composed for this target from `seed` and `variant` names the chosen blocks; otherwise it is `standard_template`.
 */
export function standardScript(goal: Goal, action: Action, fmt: DocFormat, t: Target, fields: Record<string, string>, seed = 0): { body: string; check: Check; variant?: string } {
  const facts = standardFacts(goal, action, fmt, t);
  const blocks = actionBlocks(action);
  let template = action.standard_template ?? '';
  let variant: string | undefined;
  if (blocks) {
    const c = compose(blocks, composeTarget(t, facts, fields), seed);
    template = c.template;
    variant = c.ids.join('.');
  }
  const body = fillStandard(template, facts, fields, fmt.max_words);
  const allowedDigits = new Set<string>([...digitRuns(factBlock(goal, action, fmt, t)), ...Object.values(fields).flatMap(digitRuns)]);
  const check = checkOutput({ subject: '', body, facts_used: [] }, { targetName: targetName(t), fmt, allowedDigits, pickName: firstPick(goal)?.name ?? null });
  return variant === undefined ? { body, check } : { body, check, variant };
}

/** How many distinct scripts this target can get for this request (1 for a template-only action). */
export function scriptCombinations(goal: Goal, action: Action, fmt: DocFormat, t: Target, fields: Record<string, string>): number {
  const blocks = actionBlocks(action);
  return blocks ? combinations(blocks, composeTarget(t, standardFacts(goal, action, fmt, t), fields)) : 1;
}

// ---- seed checks ---------------------------------------------------------------------------
/** Fixture field sets: the shortest a valid submission can be, and the longest. */
export function fixtureFields(schema: FormField[]): Record<string, string>[] {
  const shortest: Record<string, string> = {};
  const longest: Record<string, string> = {};
  for (const f of schema) {
    if (f.required) shortest[f.name] = 'Sample';
    // 'x', not 'w': a trimmed field can end "xxxx.." and "www.." would read as a URL to the output check.
    longest[f.name] = Array.from({ length: f.max }, (_, i) => (i % 5 === 4 && i !== f.max - 1 ? ' ' : 'x')).join('');
  }
  return [shortest, longest];
}

/** Every target the seed must prove a script for; leadership goals add every D-caucus member-elect in scope (leadership-routing §2.6, §3). */
function targetsFor(action: Action, goal: Goal, members: Member[], positions: Position[], states: StateRow[], membersElect: MemberElect[] = []): Target[] {
  if (action.target_scope === 'state') return states.map((row) => ({ kind: 'state', id: row.state, state: row.state, row }));
  const leadership = goal.category === 'leadership';
  const inScope = (chamber: Chamber): boolean => action.target_scope === 'both' || chamber === action.target_scope;
  const incumbents = leadership ? incumbentIds(action) : [];
  const leader = (chamber: Chamber, id: string) => (leadership ? pickLeader(incumbents, chamber, id, members, positions, goal.id) : null);
  const out: Target[] = members
    .filter((m) => inScope(m.chamber) && (!leadership || m.caucus === 'D'))
    .map((member) => ({
      kind: 'member',
      id: member.bioguide_id,
      member,
      position: positions.find((p) => p.bioguide_id === member.bioguide_id && p.goal_id === goal.id) ?? null,
      prior_vote: priorVote(member, goal),
      leader: leader(member.chamber, member.bioguide_id),
    }));
  if (leadership) {
    for (const e of membersElect) {
      if (!inScope(e.chamber) || e.caucus !== 'D') continue;
      out.push({ kind: 'elect', id: e.elect_id, elect: e, replaces_name: members.find((m) => m.bioguide_id === e.replaces)?.name ?? 'the departing member', leader: leader(e.chamber, e.elect_id) });
    }
  }
  return out;
}

const SEEDS = [0, 1, 2];
const CONTACT_RE = /https?:\/\/|www\.|@/i;

/** The static part of the blocks check: placeholders, digits, contact details, blocked terms, incumbents. */
function checkBlockText(a: Action, blocks: ScriptBlocks, schema: FormField[], members: Member[]): void {
  const where = `action ${a.slug}: script_blocks`;
  for (const id of blocks.incumbents) if (!members.some((m) => m.bioguide_id === id)) throw new Error(`${where}: incumbent ${id} is not in members.csv`);
  for (const slot of blocks.slots) {
    for (const v of slot.variants) {
      const at = `${where} ${slot.name}/${v.id}`;
      const unknown = unknownPlaceholders(v.text, schema);
      if (unknown.length) throw new Error(`${at}: unknown placeholder ${unknown.map((p) => `{{${p}}}`).join(', ')}`);
      if (v.when.has) for (const h of v.when.has) if (unknownPlaceholders(`{{${h}}}`, schema).length) throw new Error(`${at}: when.has names unknown placeholder ${h}`);
      if (/\d/.test(v.text)) throw new Error(`${at}: digits are not allowed in a block (the output check rejects numbers outside the facts)`);
      if (CONTACT_RE.test(v.text)) throw new Error(`${at}: no URLs, email addresses or handles in a block`);
      if (/\bend aid\b/i.test(v.text)) throw new Error(`${at}: contains "end aid"`);
      const low = v.text.toLowerCase();
      for (const term of BLOCKLIST) if (low.includes(term)) throw new Error(`${at}: contains a blocked term`);
    }
  }
}

/**
 * leader-call-scripts §4: for one target and one field set, every slot has enough eligible variants, every eligible
 * variant of a carrying slot holds the ask or a mention, the sum of the shortest picks reaches `min_words` and the
 * sum of the longest stays under `max_words`, and seeded compositions pass the output check.
 */
function checkBlocksFor(goal: Goal, a: Action, blocks: ScriptBlocks, fmt: DocFormat, t: Target, fields: Record<string, string>, bounds: boolean): void {
  const where = `action ${a.slug}: script_blocks for ${t.id}`;
  const facts = standardFacts(goal, a, fmt, t);
  const ct = composeTarget(t, facts, fields);
  let min = 0;
  let max = 0;
  const longest: string[] = [];
  for (const slot of blocks.slots) {
    const pool = eligibleVariants(blocks, slot, ct);
    if (pool.length < slot.pick) throw new Error(`${where}: slot ${slot.name} has ${pool.length} eligible variants, needs ${slot.pick}`);
    for (const v of pool) {
      const low = v.text.toLowerCase();
      if (slot.carries.includes('ask') && fmt.ask && !low.includes(fmt.ask.toLowerCase())) throw new Error(`${where}: ${slot.name}/${v.id} lacks the ask phrase "${fmt.ask}"`);
      if (slot.carries.includes('mention') && fmt.mentions.length && !fmt.mentions.some((m) => low.includes(m.toLowerCase()))) throw new Error(`${where}: ${slot.name}/${v.id} lacks a mention phrase`);
    }
    const sized = pool.map((v) => ({ id: v.id, n: wordCount(render(v.text, facts, fields)) })).sort((x, y) => x.n - y.n);
    min += sized.slice(0, slot.pick).reduce((n, c) => n + c.n, 0);
    max += sized.slice(-slot.pick).reduce((n, c) => n + c.n, 0);
    longest.push(...sized.slice(-slot.pick).map((c) => `${c.id} ${c.n}`));
  }
  if (bounds && min < fmt.min_words) throw new Error(`${where}: the shortest combination is ${min} words, below min_words ${fmt.min_words}`);
  if (bounds && max > fmt.max_words) throw new Error(`${where}: the longest combination is ${max} words, above max_words ${fmt.max_words} (${longest.join(', ')})`);
  for (const seed of SEEDS) {
    const { body, check } = standardScript(goal, a, fmt, t, fields, seed);
    if (/\{\{|\}\}/.test(body)) throw new Error(`${where}: a block leaves a brace in the text`);
    if (!check.ok) throw new Error(`${where}: composition fails the output check (${check.reason})`);
  }
}

export function checkScriptBlocks(goal: Goal, a: Action, members: Member[], positions: Position[], states: StateRow[], membersElect: MemberElect[] = []): void {
  const blocks = actionBlocks(a);
  if (!blocks) return;
  const schema = parseSchema(a);
  checkBlockText(a, blocks, schema, members);
  if (goal.status !== 'active') return;
  const fmt = parseFormat(a);
  const [shortest, longest] = fixtureFields(schema);
  // Every field one word: what the longest valid submission trims down to, and the set where every optional field is present.
  const oneWord = Object.fromEntries(schema.map((f) => [f.name, 'w']));
  for (const t of targetsFor(a, goal, members, positions, states, membersElect)) {
    checkBlocksFor(goal, a, blocks, fmt, t, shortest, true);
    checkBlocksFor(goal, a, blocks, fmt, t, oneWord, true);
    checkBlocksFor(goal, a, blocks, fmt, t, longest, false);
  }
}

/**
 * Every action on an `active` goal has a `standard_template` with only known placeholders whose fill
 * passes the output check for every target in scope, with the shortest and the longest valid fields;
 * an action with `script_blocks` is checked by `checkScriptBlocks` instead (leader-call-scripts §4).
 */
export function checkStandardTemplates(goals: Goal[], actions: Action[], members: Member[], positions: Position[], states: StateRow[], membersElect: MemberElect[] = []): void {
  for (const a of actions) {
    const goal = goals.find((g) => g.id === a.goal_id);
    if (!goal) continue;
    const schema = parseSchema(a);
    if (a.script_blocks !== null) {
      checkScriptBlocks(goal, a, members, positions, states, membersElect);
      continue;
    }
    if (a.standard_template === null) {
      if (goal.status === 'active') throw new Error(`action ${a.slug}: standard_template or script_blocks is required while goal ${goal.slug} is active (generation-cost §4)`);
      continue;
    }
    const unknown = unknownPlaceholders(a.standard_template, schema);
    if (unknown.length) throw new Error(`action ${a.slug}: standard_template has unknown placeholder ${unknown.map((p) => `{{${p}}}`).join(', ')}`);
    if (goal.status !== 'active') continue;
    const fmt = parseFormat(a);
    for (const t of targetsFor(a, goal, members, positions, states, membersElect)) {
      for (const fields of fixtureFields(schema)) {
        const { body, check } = standardScript(goal, a, fmt, t, fields);
        if (/\{\{|\}\}/.test(body)) throw new Error(`action ${a.slug}: standard_template leaves a brace in the text`);
        if (!check.ok) throw new Error(`action ${a.slug}: standard_template fails the output check for ${t.id} (${check.reason})`);
      }
    }
  }
}
