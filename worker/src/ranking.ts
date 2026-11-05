// §5 Goal ranking (deterministic). Pure functions; no I/O.
import type { Delegation, Goal, Member, StateRow } from './types';

type Rule =
  | { always: true }
  | { all: Rule[] }
  | { any: Rule[] }
  | { house: Partial<Record<keyof Member, unknown>> }
  | { senator: Partial<Record<keyof Member, unknown>> }
  | { state: { nonempty: (keyof StateRow)[] } };

function matches(member: Member, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => (member as unknown as Record<string, unknown>)[k] === v);
}

/** Evaluate one eligibility rule against a delegation. Unknown keys throw so a bad seed fails loudly. */
export function evaluate(rule: Rule, d: Delegation): boolean {
  if ('always' in rule) return rule.always === true;
  if ('all' in rule) return rule.all.every((r) => evaluate(r, d));
  if ('any' in rule) return rule.any.some((r) => evaluate(r, d));
  if ('house' in rule) return d.house !== null && matches(d.house, rule.house);
  if ('senator' in rule) return d.senators.some((s) => matches(s, rule.senator));
  if ('state' in rule) {
    const row = d.state_row;
    if (!row) return false;
    return rule.state.nonempty.some((f) => {
      const v = row[f];
      return v !== null && v !== undefined && v !== '' && v !== 0;
    });
  }
  throw new Error(`unknown eligibility rule: ${JSON.stringify(rule)}`);
}

/** §5.1 inputs: the only member/state fields a rule may test, with the value type each accepts. */
const HOUSE_FIELDS: Record<string, 'party' | 'flag' | 'text'> = { party: 'party', hasc: 'flag', conferee: 'flag', rc243: 'text', btb_cosponsor: 'flag' };
const SENATOR_FIELDS: Record<string, 'party' | 'flag' | 'text'> = { party: 'party', jrd_april_2026: 'text' };
const STATE_FIELDS = new Set<keyof StateRow>(['treasurer_name', 'treasurer_phone', 'decider', 'israel_bonds_usd', 'holdings_date', 'holdings_source', 'campaign_name', 'campaign_url', 'next_comment_date', 'holdings_status']);
const PARTIES = new Set(['D', 'R', 'I']);

function checkWhere(kind: 'house' | 'senator', where: unknown): void {
  if (typeof where !== 'object' || where === null || Array.isArray(where)) throw new Error(`eligibility: ${kind} must be an object`);
  const allowed = kind === 'house' ? HOUSE_FIELDS : SENATOR_FIELDS;
  for (const [k, v] of Object.entries(where)) {
    const t = allowed[k];
    if (!t) throw new Error(`eligibility: ${kind}.${k} is not a §5.1 input (allowed: ${Object.keys(allowed).join(', ')})`);
    const ok = t === 'party' ? typeof v === 'string' && PARTIES.has(v) : t === 'flag' ? v === 0 || v === 1 : typeof v === 'string';
    if (!ok) throw new Error(`eligibility: ${kind}.${k} expects ${t === 'party' ? 'D|R|I' : t === 'flag' ? '0|1' : 'a string'}, got ${JSON.stringify(v)}`);
  }
}

/** Reject anything outside the §5 grammar so a bad seed fails at seed time, not silently at routing time. */
export function validateRule(r: unknown, depth = 0): asserts r is Rule {
  if (depth > 8) throw new Error('eligibility: rule nested too deep');
  if (typeof r !== 'object' || r === null || Array.isArray(r)) throw new Error('eligibility must be an object');
  const keys = Object.keys(r);
  if (keys.length !== 1) throw new Error(`eligibility: one key per rule, got ${JSON.stringify(keys)}`);
  const [k] = keys;
  const v = (r as Record<string, unknown>)[k];
  switch (k) {
    case 'always':
      if (v !== true) throw new Error('eligibility: always must be true');
      return;
    case 'all':
    case 'any':
      if (!Array.isArray(v) || v.length === 0) throw new Error(`eligibility: ${k} needs a non-empty array`);
      v.forEach((x) => validateRule(x, depth + 1));
      return;
    case 'house':
    case 'senator':
      checkWhere(k, v);
      return;
    case 'state': {
      const ne = (v as { nonempty?: unknown } | null)?.nonempty;
      if (typeof v !== 'object' || v === null || !Array.isArray(ne) || ne.length === 0) throw new Error('eligibility: state needs {nonempty: [field, …]}');
      for (const f of ne) if (!STATE_FIELDS.has(f as keyof StateRow)) throw new Error(`eligibility: state.${String(f)} is not a state field`);
      return;
    }
    default:
      throw new Error(`unknown eligibility rule: ${JSON.stringify(r)}`);
  }
}

export function parseRule(json: string): Rule {
  let r: unknown;
  try { r = JSON.parse(json); } catch { throw new Error(`eligibility is not JSON: ${json}`); }
  validateRule(r);
  return r;
}

const DAY = 86_400_000;

/** §5.2: 2 within 14 days, 1.5 within 45, else 1. Past or missing dates score 1. */
export function urgency(decisionDate: string | null, today: Date): number {
  if (!decisionDate) return 1;
  const d = Date.parse(decisionDate + 'T00:00:00Z');
  if (Number.isNaN(d)) return 1;
  const days = (d - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / DAY;
  if (days < 0) return 1;
  if (days <= 14) return 2;
  if (days <= 45) return 1.5;
  return 1;
}

export function score(goal: Goal, today: Date): number {
  return goal.priority * urgency(goal.decision_date, today);
}

export interface Ranked {
  goal: Goal;
  score: number;
  eligible: boolean;
}

/** Eligible goals by score desc, then earlier decision date, then slug (total order). */
export function rank(goals: Goal[], d: Delegation, today: Date): Ranked[] {
  return goals
    .filter((g) => g.status === 'active')
    .map((g) => ({ goal: g, score: score(g, today), eligible: evaluate(parseRule(g.eligibility), d) }))
    .filter((r) => r.eligible)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ad = a.goal.decision_date || '9999-12-31';
      const bd = b.goal.decision_date || '9999-12-31';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.goal.slug < b.goal.slug ? -1 : 1;
    });
}

/**
 * §1.3 + §5.4: the top two. If only one is eligible, the second card is the
 * state goal (even when its own rule failed); if none, an empty list.
 */
export function topTwo(goals: Goal[], d: Delegation, today: Date): Goal[] {
  const ranked = rank(goals, d, today).map((r) => r.goal);
  if (ranked.length >= 2) return ranked.slice(0, 2);
  if (ranked.length === 0) return [];
  const state = goals.find((g) => g.category === 'state' && g.status === 'active' && g.slug !== ranked[0].slug);
  return state ? [ranked[0], state] : ranked;
}
