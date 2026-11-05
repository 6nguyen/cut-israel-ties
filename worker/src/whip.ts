// Whip table (member-pages spec): who a goal targets, where each stands, and
// the four tiles. Pure functions over data/ rows; the web build and the tests
// share them. Nothing here is estimated: every count is a row.
import { isDelegate } from './districts';
import { electoralSeat } from './ranking';
import type { Action, Goal, Member, Position } from './types';

export const POSITIONS = ['for', 'uncommitted', 'against', 'unknown'] as const;
export type Counts = Record<Position['position'], number>;

/** Members a federal goal targets: the first action's chamber scope, plus the party filter a leadership goal implies. */
export function whipTargets(goal: Goal, action: Action | undefined, members: Member[]): Member[] {
  const scope = action?.target_scope ?? (goal.category === 'state' ? 'state' : 'both');
  if (scope === 'state') return [];
  const seat = goal.category === 'electoral' ? electoralSeat(goal.eligibility) : null; // primary-2028 §1.1: one seat, never the chamber
  return members.filter((m) => {
    if (scope === 'house' && m.chamber !== 'house') return false;
    if (scope === 'senate' && m.chamber !== 'senate') return false;
    if (goal.category === 'electoral' && (!seat || m.chamber !== 'house' || m.state !== seat.state || m.district !== seat.district)) return false;
    return goal.category !== 'leadership' || m.party === 'D';
  });
}

/** The newest sourced row for a member on a goal; later rows in the file win a date tie (positions are append-only). */
export function latestPosition(positions: Position[], bioguideId: string, goalId: number): Position | null {
  let best: Position | null = null;
  for (const p of positions) {
    if (p.bioguide_id !== bioguideId || p.goal_id !== goalId) continue;
    if (!best || p.source_date >= best.source_date) best = p;
  }
  return best;
}

export interface WhipRow {
  member: Member;
  position: Position['position'];
  source_url: string | null;
  source_date: string | null;
  delegate: boolean;
  movable: boolean;
}

/** The set the table opens on: every conferee plus the targeted chamber's non-Republicans. */
export function isMovable(m: Member, scope: Action['target_scope'] | undefined): boolean {
  if (m.conferee) return true;
  if (m.party === 'R') return false;
  return scope === 'senate' ? m.chamber === 'senate' : m.chamber === 'house';
}

const ORDER: Record<Position['position'], number> = { uncommitted: 0, unknown: 1, against: 2, for: 3 };

/** Rows sorted by movability: conferees, committee members, then uncommitted · unknown · against · for; delegates last. */
export function whipRows(goal: Goal, action: Action | undefined, members: Member[], positions: Position[]): WhipRow[] {
  const rows = whipTargets(goal, action, members).map((m): WhipRow => {
    const p = latestPosition(positions, m.bioguide_id, goal.id);
    return { member: m, position: p?.position ?? 'unknown', source_url: p?.source_url ?? null, source_date: p?.source_date ?? null, delegate: isDelegate(m), movable: isMovable(m, action?.target_scope) };
  });
  return rows.sort((a, b) =>
    Number(a.delegate) - Number(b.delegate)
    || b.member.conferee - a.member.conferee
    || b.member.hasc - a.member.hasc
    || ORDER[a.position] - ORDER[b.position]
    || a.member.state.localeCompare(b.member.state)
    || (a.member.chamber === b.member.chamber ? 0 : a.member.chamber === 'house' ? -1 : 1)
    || (a.member.district ?? 0) - (b.member.district ?? 0)
    || a.member.name.localeCompare(b.member.name));
}

/** The four tiles. Delegates have no floor vote and are not counted. */
export function whipCounts(rows: WhipRow[]): Counts {
  const c: Counts = { for: 0, uncommitted: 0, against: 0, unknown: 0 };
  for (const r of rows) if (!r.delegate) c[r.position]++;
  return c;
}

/** "Updated <date>": the newest source_date among the goal's positions, or null when none is sourced. */
export function updatedAt(positions: Position[], goalId: number): string | null {
  let d: string | null = null;
  for (const p of positions) if (p.goal_id === goalId && (!d || p.source_date > d)) d = p.source_date;
  return d;
}

export function applyFilters(rows: WhipRow[], f: { state?: string; party?: string; all?: boolean }): WhipRow[] {
  const explicit = !!(f.state || f.party);
  return rows.filter((r) =>
    (!f.state || r.member.state === f.state)
    && (!f.party || r.member.party === f.party)
    && (f.all || explicit || r.movable));
}
