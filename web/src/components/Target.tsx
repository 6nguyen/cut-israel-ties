import { useEffect, useState } from 'preact/hooks';
import type { GoalCard, TargetCard } from '../lib/api';
import type { RecordLine } from '@worker/electoral';
import { RESEARCH_URL } from '@worker/state-copy';
import { BIOGUIDE, visitLine, visitsFor, type VisitPublic } from '../lib/visits';

export const CATEGORY: Record<GoalCard['category'], string> = { federal_vote: 'Federal vote', leadership: 'Leadership vote', state: 'Your state', electoral: 'Election' };
const POSITION: Record<TargetCard['position'], string> = { for: 'With us', uncommitted: 'Uncommitted', against: 'Against', unknown: 'No stated position' };
const POSITION_CLASS: Record<TargetCard['position'], string> = { for: 'bg-acid', uncommitted: 'bg-hazard', against: 'bg-crimson text-paper', unknown: 'bg-newsprint' };

export function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const t = Date.parse(d + 'T00:00:00');
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** One target row: party block, role + name, prior vote, call button, position chip. Every value is a data/ row. */
export function Target({ t, partner }: { t: TargetCard; partner?: string | null }) {
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
      {t.holdings_status && (
        <p class="mt-1 text-sm label-ticker text-ink/70">
          {t.holdings_status === 'unknown'
            ? <a href={RESEARCH_URL} class="underline" rel="noopener noreferrer">help us find it →</a>
            : t.holdings_source_url && <a href={t.holdings_source_url} class="underline" rel="noopener noreferrer">source</a>}
        </p>
      )}
      {BIOGUIDE.test(t.bioguide_id) && <VisitLine member={t.bioguide_id} partner={partner} />}
      {t.record && (
        <div class="mt-3 border-t border-rule pt-2">
          <p class="label-code text-xs">On the record</p>
          {t.record.length === 0
            ? <p class="text-sm text-ink/70 mt-1">No goal this site tracked has named this member yet.</p>
            : <ul class="mt-1 text-sm flex flex-col gap-2">{t.record.map((r) => <RecordRow r={r} />)}</ul>}
        </div>
      )}
    </li>
  );
}

/** primary-2028 §1.2: one tracked goal, the member's newest sourced position (with source and date) and recorded vote. Rows only; no verdict. */
export function RecordRow({ r }: { r: RecordLine }) {
  return (
    <li>
      <p class="font-semibold leading-tight">{r.goal_title}{r.decision_date ? <span class="label-ticker text-ink/70 font-normal"> · {fmtDate(r.decision_date)}</span> : null}</p>
      <p class="mt-1"><span class={`chip mr-2 ${POSITION_CLASS[r.position]}`}>{POSITION[r.position]}</span>
        {r.source_url
          ? <a href={r.source_url} class="underline label-ticker" rel="noopener">source{r.source_date ? ` · ${fmtDate(r.source_date)}` : ''}</a>
          : <span class="label-ticker text-ink/70">no sourced statement</span>}
        <span class="label-ticker text-ink/70"> · {r.vote}</span>
      </p>
    </li>
  );
}

/** office-visits §2.1: the next approved visit to this member's district office, or the invitation to list one. Nothing until the fetch answers. */
export function VisitLine({ member, partner }: { member: string; partner?: string | null }) {
  const [visits, setVisits] = useState<VisitPublic[] | null>(null);
  useEffect(() => { void visitsFor(member).then(setVisits); }, [member]);
  if (visits === null) return null;
  const v = visits[0];
  return (
    <p class="mt-1 text-sm" data-visit-line>
      {v
        ? <a href={`/m/${member}#visits`} class="underline font-semibold">{visitLine(v)} →</a>
        : <>No visit listed yet. <a href={`/m/${member}#organise`} class="underline">Organise one</a>{partner && <> · <a href={partner} rel="noopener" class="underline">partner campaign ↗</a></>}</>}
    </p>
  );
}
