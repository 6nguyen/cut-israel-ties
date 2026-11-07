import { useEffect, useState } from 'preact/hooks';
import { districtLabel, route, type GoalCard, type RouteResponse } from '../lib/api';
import type { Chamber } from '@worker/types';
import { clearPlace, loadPlace, takeRoute } from '../lib/store';
import { CATEGORY, Target, fmtDate } from './Target';
import Counts from './Counts';
import Countdown, { targetOf } from './Countdown';

/** urgency-and-readability §4: the soonest upcoming countdown target among cards (a leadership card holds two goals). */
export function soonest(goals: GoalCard[], now = Date.now()): { g: GoalCard; target: number } | null {
  let best: { g: GoalCard; target: number } | null = null;
  for (const g of goals.flatMap((x) => [x, ...(x.also ? [x.also] : [])])) {
    const target = targetOf(g.decision_at, g.decision_date);
    if (target !== null && target > now && (!best || target < best.target)) best = { g, target };
  }
  return best;
}

const CHAMBER: Record<Chamber, string> = { house: 'House', senate: 'Senate' };

/** The targets box, counter line, ask and CTA of one goal; a leadership card renders one per chamber block. */
function Block({ g, state, district, label }: { g: GoalCard; state: string; district: number; label?: string }) {
  const date = fmtDate(g.decision_date);
  return (
    <div class="flex flex-col gap-4" data-block={g.chamber ?? g.slug}>
      {label && <p class="label-code">{label}{date ? ` · Decision: ${date}` : ''}</p>}
      <div class="border-2 border-ink">
        <p class="label-code px-3 py-2 border-b-2 border-ink bg-newsprint">Who to call ({g.targets.length})</p>
        <ul class="px-3">{g.targets.map((t) => <Target t={t} partner={g.partner_url} />)}</ul>
        <Counts goal={g.slug} state={state} district={district} />
      </div>
      <p class="font-semibold">{g.ask_text}</p>
      <a href={g.action_href} class="btn btn-primary self-start">Get my script →</a>
    </div>
  );
}

/**
 * leadership-routing §2.3–2.5: a leadership card holds the House block, then the Senate block (`also` carries the
 * second goal); a seat whose race is not called shows one line in place of a block. Other cards are one block.
 */
export function Card({ g, n, state, district }: { g: GoalCard; n: number; state: string; district: number }) {
  const date = fmtDate(g.decision_date);
  const split = g.chamber !== undefined && (g.also !== undefined || (g.uncalled?.length ?? 0) > 0);
  const chambers: Chamber[] = ['house', 'senate'];
  // §4.4: the stamp counts to this card's target (on a split card, the sooner chamber block) and replaces the
  // "Decision:" line for an upcoming date; a past or empty date keeps the line and shows no stamp.
  const stamp = soonest([g]);
  return (
    <article class={`relative card-lg flex flex-col ${stamp ? 'mt-6' : ''}`}>
      {stamp && (
        <Countdown at={stamp.g.decision_at} date={stamp.g.decision_date} confirmed={stamp.g.decision_date_confirmed} id={stamp.g.slug}
          title={split && stamp.g.chamber ? CHAMBER[stamp.g.chamber] : null} class="absolute -top-6 right-3.5 z-10" />
      )}
      <div class={`relative hero-gradient text-newsprint p-5 min-h-[180px] flex flex-col justify-end ${stamp ? 'pt-16' : ''}`}>
        <div class="absolute inset-0 halftone pointer-events-none" />
        <div class="relative flex gap-2 mb-3">
          <span class="chip bg-hazard text-ink border-ink">{CATEGORY[g.category]}</span>
          <span class="chip bg-ink text-newsprint border-newsprint">Action {n}</span>
        </div>
        <h2 class="relative headline-lg">{g.title}</h2>
        {date && !split && (!stamp || g.election) && <p class="relative label-code mt-2 text-hazard">{g.election ? 'Primary' : 'Decision'}: {date}</p>}
        {g.election && (
          <p class="relative label-code mt-1 text-hazard">Filing deadline: {fmtDate(g.election.filing_deadline) ?? 'not yet sourced'}
            {g.election.source_url && <> · <a href={g.election.source_url} class="underline" rel="noopener noreferrer">source</a></>}
          </p>
        )}
      </div>
      <div class="p-5 flex flex-col gap-4 flex-1">
        <p class="text-base">{g.summary}</p>
        {split
          ? chambers.map((c) => {
              const block = [g, g.also].find((x) => x?.chamber === c);
              if (block) return <Block g={block} state={state} district={district} label={CHAMBER[c]} />;
              if (g.uncalled?.includes(c)) return <p class="label-code" data-uncalled={c}>{CHAMBER[c]} seat: race not called yet.</p>;
              return null;
            })
          : <Block g={g} state={state} district={district} />}
      </div>
    </article>
  );
}

/** §1.3 results: exactly two cards for the stored district; §1.5 "change address". */
export default function Results() {
  const [data, setData] = useState<RouteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = takeRoute<RouteResponse>();
    if (cached) { setData(cached); return; }
    const place = loadPlace();
    if (!place) { location.replace('/'); return; }
    route(place).then(setData).catch((e: Error) => setError(e.message));
  }, []);

  function change() { clearPlace(); location.assign('/'); }

  if (error) return (
    <div class="card p-5 max-w-xl" role="alert">
      <p class="font-semibold">{error}</p>
      <button class="btn btn-ghost mt-4" onClick={change}>Change address</button>
    </div>
  );
  if (!data) return <p class="label-code" aria-busy="true">Loading your district…</p>;

  const where = districtLabel(data.state, data.district);
  const page = soonest(data.goals); // §4.5: one page-wide stamp for the soonest target across both slots
  return (
    <div>
      <div class={`relative ${page ? 'md:pr-[400px]' : ''}`}>
        {page && (
          <Countdown at={page.g.decision_at} date={page.g.decision_date} confirmed={page.g.decision_date_confirmed} id="page" size="lg"
            title={page.g.title} class="mb-6 md:mb-0 md:absolute md:right-2 md:-top-1 z-10 max-w-full" />
        )}
        <p class="label-ticker mb-2">{where} · <button class="underline" onClick={change}>change address</button></p>
        <h1 class="display-lg">Your two actions this week</h1>
      </div>
      <p class="mt-3 text-base max-w-2xl">Your people in Congress for {where}: {[data.house, ...data.senators].filter(Boolean).map((m) => m!.name).join(', ')}.</p>
      {data.goals.length === 0 ? (
        <div class="card p-5 mt-8 max-w-xl">
          <p class="font-semibold">No goal is open for your district right now.</p>
          <a href="/goals" class="btn btn-ghost mt-4">See all goals →</a>
        </div>
      ) : (
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mt-8">
          {data.goals.map((g, i) => <Card g={g} n={i + 1} state={data.state} district={data.district} />)}
        </div>
      )}
      <p class="mt-8"><a href="/goals" class="label-code underline underline-offset-4">See all goals →</a></p>
    </div>
  );
}
