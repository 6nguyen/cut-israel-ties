// Build-time view of data/ for the member pages and the whip table (member-pages spec).
// Every line here is a data/ row read through the Worker's loader; nothing is estimated.
import { join } from 'node:path';
import { loadRows } from '@worker/load';
import { isDelegate } from '@worker/districts';
import { applyFilters, latestPosition, updatedAt, whipCounts, whipRows, whipTargets, POSITIONS, type WhipRow } from '@worker/whip';
import type { Action, Goal, Member, Office, Position } from '@worker/types';
import { actionsFor, activeGoals, publishedGoals } from './goals';

export type { Member, Office, Position, WhipRow };
export { applyFilters, isDelegate, latestPosition, updatedAt, whipCounts, whipRows, whipTargets, POSITIONS };

let cache: ReturnType<typeof loadRows> | null = null;
const rows = () => (cache ??= loadRows(join(process.cwd(), '..', 'data')));

/** Sitting members only: a row with `left_office` is not built, listed or counted (roster-freshness §4); its row stays in data/ for positions and receipts. */
export function members(): Member[] { return rows().members.filter((m) => !m.left_office); }
export function positions(): Position[] { return rows().positions; }
export function member(id: string): Member | null { return members().find((m) => m.bioguide_id === id) ?? null; }
/** roster-freshness §1: a member's district offices in file order (data/district_offices.csv). */
export function officesFor(m: Member): Office[] { return rows().offices.filter((o) => o.bioguide_id === m.bioguide_id); }

/** roster-freshness §2: the contact link's label by kind; a link without a kind is never shown. */
export const CONTACT_LABEL: Record<NonNullable<Member['contact_kind']>, string> = { form: 'Contact form', zip_gate: 'Contact form (asks for your ZIP)', homepage: 'Office website' };
export const contactLabel = (m: Member): string | null => (m.contact_form_url && m.contact_kind ? CONTACT_LABEL[m.contact_kind] : null);
/** roster-freshness §4: the one line under the hero for a member who is not returning; the date is the 120th Congress's first day. */
export const LEAVES_LINE = 'Leaves office 2027-01-03. Votes on the NDAA and the funding bill until then.';

/** First action's scope decides who a goal targets (the same rule as the result cards). */
export const firstAction = (g: Goal): Action | undefined => actionsFor(g)[0];

export interface MemberGoal { goal: Goal; action: Action | undefined; position: Position | null; flags: string[] }

/** The active goals that target this member, with the member's newest sourced position and the prior-vote flags spelled out. */
export function goalsFor(m: Member): MemberGoal[] {
  return activeGoals()
    .map((goal) => ({ goal, action: firstAction(goal) }))
    .filter(({ goal, action }) => whipTargets(goal, action, [m]).length === 1)
    .map(({ goal, action }) => ({ goal, action, position: latestPosition(positions(), m.bioguide_id, goal.id), flags: flagLines(m, goal) }));
}

/** Goals that get a whip table: published federal goals whose first action targets a chamber. */
export function whipGoals(): Goal[] { return publishedGoals().filter((g) => g.category !== 'electoral' && whipTargets(g, firstAction(g), members()).length > 0); }

/** Prior-vote and role flags a goal uses, as sentences. Empty flags are "no recorded vote yet", never inferred. */
export function flagLines(m: Member, goal: Goal): string[] {
  const out: string[] = [];
  if (m.conferee) out.push('NDAA conferee');
  if (m.hasc) out.push('House Armed Services Committee member');
  if (goal.slug.startsWith('ndaa')) {
    if (m.chamber === 'house' && m.rc243) out.push(`Roll call 243 (House vote on the integration section): ${m.rc243}`);
    if (m.chamber === 'senate' && m.jrd_april_2026) out.push(`April 2026 joint resolutions of disapproval: ${m.jrd_april_2026}`);
  }
  if (m.btb_cosponsor) out.push('Block the Bombs Act cosponsor');
  return out;
}

export const role = (m: Member): string => (m.chamber === 'house' ? (isDelegate(m) ? 'Del.' : 'Rep.') : 'Sen.');
export const seat = (m: Member): string => (m.chamber === 'senate' ? m.state : m.district === 0 ? `${m.state} at large` : `${m.state}-${String(m.district).padStart(2, '0')}`);
export const PARTY: Record<Member['party'], string> = { D: 'Democrat', R: 'Republican', I: 'Independent' };
export const tel = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`;
/** The one-line share description: "Rep. Lou Correa (D, CA-46): uncommitted on <goal>". */
export const positionLine = (m: Member, mg: MemberGoal | undefined): string =>
  mg ? `${role(m)} ${m.name} (${m.party}, ${seat(m)}): ${mg.position?.position ?? 'unknown'} on ${mg.goal.title}` : `${role(m)} ${m.name} (${m.party}, ${seat(m)}): no open decision right now`;
