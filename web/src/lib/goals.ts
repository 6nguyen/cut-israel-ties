// Build-time view of data/ for the goal pages. Uses the Worker's loader so the
// status lifecycle (§2.3), validations and row shapes are one code path.
import { join } from 'node:path';
import { marked } from 'marked';
import { loadRows } from '@worker/load';
import type { Action, Goal } from '@worker/types';

export type { Action, Goal };
export interface Pick { name: string; rationale: string; source_url: string; signal?: string; signal_date?: string }
export interface Source { title: string; url: string }

let cache: ReturnType<typeof loadRows> | null = null;
function rows() { return (cache ??= loadRows(join(process.cwd(), '..', 'data'))); }

const byPriority = (a: Goal, b: Goal) => b.priority - a.priority || a.slug.localeCompare(b.slug);

export function activeGoals(): Goal[] { return rows().goals.filter((g) => g.status === 'active').sort(byPriority); }
/** Completed and expired goals, newest decision first; the Outcomes strip (§2.1). */
export function closedGoals(): Goal[] {
  return rows().goals.filter((g) => g.status === 'completed' || g.status === 'expired').sort((a, b) => (b.decision_date ?? '').localeCompare(a.decision_date ?? '') || a.slug.localeCompare(b.slug));
}
/** Every goal that gets a page: active and closed; upcoming goals stay unpublished. */
export function publishedGoals(): Goal[] { return [...activeGoals(), ...closedGoals()]; }
/** call-follow-through §5: every `upcoming` or `active` goal with a decision date, soonest first. */
export function feedGoals(): Goal[] {
  return rows().goals.filter((g) => (g.status === 'upcoming' || g.status === 'active') && !!g.decision_date).sort((a, b) => a.decision_date!.localeCompare(b.decision_date!) || a.slug.localeCompare(b.slug));
}
export function actionsFor(goal: Goal): Action[] { return rows().actions.filter((a) => a.goal_id === goal.id).sort((a, b) => a.order - b.order); }
export function picks(goal: Goal): Pick[] { return JSON.parse(goal.our_picks) as Pick[]; }
export function sources(goal: Goal): Source[] { return JSON.parse(goal.sources) as Source[]; }
export function markdown(md: string | null): string { return md ? (marked.parse(md, { async: false }) as string) : ''; }

// §3 prep pages
export { prepSections, unifiedAsk } from '@worker/prep';
/** Goals that get `/goals/<slug>/prep`: published (never upcoming) with a non-empty prep_md. */
export function prepGoals(): Goal[] { return publishedGoals().filter((g) => !!g.prep_md); }
/** Render a maintainer-authored markdown block; `[VERIFY: …]` markers become visible chips so none ships unnoticed. */
export function prepHtml(md: string): string {
  return markdown(md).replace(/\[VERIFY([^\]]*)\]/g, (_m, rest: string) => `<mark class="chip bg-hazard text-ink border-ink align-middle">VERIFY${rest.replace(/\s+/g, ' ')}</mark>`);
}

export const CATEGORY: Record<Goal['category'], string> = { federal_vote: 'Federal vote', leadership: 'Leadership vote', state: 'Your state', electoral: 'Election' };
export function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const t = Date.parse(d + 'T00:00:00');
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
