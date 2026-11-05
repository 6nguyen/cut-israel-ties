import type { GoalCard, TargetCard } from '../lib/api';

export const CATEGORY: Record<GoalCard['category'], string> = { federal_vote: 'Federal vote', leadership: 'Leadership vote', state: 'Your state', electoral: 'Election' };
const POSITION: Record<TargetCard['position'], string> = { for: 'With us', uncommitted: 'Uncommitted', against: 'Against', unknown: 'No stated position' };
const POSITION_CLASS: Record<TargetCard['position'], string> = { for: 'bg-acid', uncommitted: 'bg-hazard', against: 'bg-crimson text-paper', unknown: 'bg-newsprint' };

export function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const t = Date.parse(d + 'T00:00:00');
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** One target row: party block, role + name, prior vote, call button, position chip. Every value is a data/ row. */
export function Target({ t }: { t: TargetCard }) {
  return (
    <li class="border-t border-rule first:border-t-0 py-3">
      <div class="flex items-center gap-3">
        <span class={`w-8 h-8 shrink-0 border-2 border-ink flex items-center justify-center font-condensed text-lg ${t.party === 'D' ? 'bg-acid' : t.party === 'R' ? 'bg-crimson text-paper' : 'bg-hazard'}`}>{t.party ?? '·'}</span>
        <div class="min-w-0 flex-1">
          <p class="font-syne font-extrabold leading-tight">{t.role} {t.name}</p>
          <p class="label-ticker text-ink/70 mt-0.5">{t.prior_vote}</p>
        </div>
        {t.phone && (
          <a href={`tel:${t.phone.replace(/[^\d+]/g, '')}`} class="btn btn-ghost !py-2 !px-3 text-xs" aria-label={`Call ${t.name}`}>Call</a>
        )}
      </div>
      <p class="mt-2 text-sm"><span class={`chip mr-2 ${POSITION_CLASS[t.position]}`}>{POSITION[t.position]}</span>
        {t.position_source_url && <a href={t.position_source_url} class="underline label-ticker" rel="noopener">source</a>}
      </p>
    </li>
  );
}
