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

export function parseRule(json: string): Rule {
  const r = JSON.parse(json) as Rule;
  if (typeof r !== 'object' || r === null) throw new Error('eligibility must be an object');
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
