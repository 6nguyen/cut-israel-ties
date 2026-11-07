import type preact from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { GoalCard, TargetCard } from '../lib/api';
import type { RecordLine } from '@worker/electoral';
import { RESEARCH_URL } from '@worker/state-copy';
import { BIOGUIDE, visitLine, visitsFor, type VisitPublic } from '../lib/visits';

export const CATEGORY: Record<GoalCard['category'], string> = { federal_vote: 'Vote in Congress', leadership: 'Who leads the Democrats', state: 'Your state', electoral: 'Election' };
const POSITION: Record<TargetCard['position'], string> = { for: 'With us', uncommitted: 'Uncommitted', against: 'Against', unknown: 'No stated position' };
const POSITION_CLASS: Record<TargetCard['position'], string> = { for: 'bg-acid', uncommitted: 'bg-hazard', against: 'bg-crimson text-paper', unknown: 'bg-newsprint' };

export function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const t = Date.parse(d + 'T00:00:00');
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ROLE: Record<string, string> = { 'Rep.': 'Representative', 'Sen.': 'Senator' };
const PARTY_CLASS = (party: string | null) => (party === 'D' ? 'bg-acid' : party === 'R' ? 'bg-crimson text-paper' : 'bg-hazard');

/** urgency-and-readability §7.3: "Senator · VA", "Representative · KY-04", "Representative-elect · NY-10", "Treasurer · MD". */
export function roleLine(t: Pick<TargetCard, 'role' | 'state' | 'district'>): string {
  const role = ROLE[t.role] ?? t.role;
  if (!t.state) return role;
  const seat = t.district === null || t.district === undefined ? t.state : t.district === 0 ? `${t.state} at large` : `${t.state}-${String(t.district).padStart(2, '0')}`;
  return `${role} · ${seat}`;
}

const PHONE_SVG = (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8z" /></svg>
);
const ARROW_SVG = (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M5 12h13M12 5l7 7-7 7" /></svg>
);
const SQUARE = 'w-11 h-11 shrink-0 border-2 border-ink shadow-brutal-sm flex items-center justify-center hover:bg-ink hover:text-acid';

/**
 * One target card (urgency-and-readability §7, style-guide spec 06): paper, 2 px ink border, small shadow. Header row =
 * party badge, name over the role line, the prior-vote status line, and a 44 px call square (or a hazard contact square
 * for a member-elect). Below it, in order: elect line, district line, position chip, holdings, visit, "On the record".
 * Every value is a data/ row.
 */
export function Target({ t, partner }: { t: TargetCard; partner?: string | null }) {
  return (
    <li class="bg-paper border-2 border-ink shadow-brutal-sm p-3.5 hover:bg-hazard/10" data-target={t.bioguide_id ?? t.name}>
      <div class="flex items-start gap-3">
        <span class={`w-10 h-10 shrink-0 border-2 border-ink shadow-brutal-sm flex items-center justify-center font-condensed text-[20px] leading-none ${PARTY_CLASS(t.party)}`}>{t.party ?? '·'}</span>
        <div class="min-w-0 flex-1">
          <p class="font-condensed uppercase tracking-wide text-2xl leading-none">{t.name}</p>
          <p class="font-mono text-xs uppercase tracking-[0.08em] mt-1" data-role-line>{roleLine(t)}</p>
          <p class="label-ticker text-ink/70 mt-1">{t.prior_vote}</p>
        </div>
        {t.phone && (
          <a href={`tel:${t.phone.replace(/[^\d+]/g, '')}`} class={`${SQUARE} bg-acid`} aria-label={`Call ${t.name}`} title={`Call ${t.phone}`}>{PHONE_SVG}</a>
        )}
        {!t.phone && t.elect && (
          <a href={t.elect.contact_url} class={`${SQUARE} bg-hazard`} rel="noopener noreferrer" aria-label={`Contact ${t.name}`} title="Contact">{ARROW_SVG}<span class="sr-only">Contact</span></a>
        )}
      </div>
      {t.elect && (
        <p class="mt-2 text-sm label-ticker" data-elect-line>Takes office {fmtDate(t.elect.takes_office)}, replaces {t.elect.replaces_name}</p>
      )}
      {t.district_phone && (
        <p class="mt-2 text-sm label-ticker" data-district-line>District: {t.district_city ? `${t.district_city} ` : ''}<a href={`tel:${t.district_phone.replace(/[^\d+]/g, '')}`} class="underline">{t.district_phone}</a></p>
      )}
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

/** §7.1–7.2: the stack of cards under a "Who to call (n)" line; the counter line renders below it. */
export function TargetStack({ label, targets, partner, children }: { label: string; targets: TargetCard[]; partner?: string | null; children?: preact.ComponentChildren }) {
  return (
    <div class="flex flex-col gap-3" data-target-stack>
      <p class="label-code">{label}</p>
      <ul class="flex flex-col gap-3">{targets.map((t) => <Target t={t} partner={partner} />)}</ul>
      {children}
    </div>
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
