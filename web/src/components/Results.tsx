import { useEffect, useState } from 'preact/hooks';
import { districtLabel, route, type GoalCard, type RouteResponse, type TargetCard } from '../lib/api';
import { clearPlace, loadPlace, takeRoute } from '../lib/store';

const CATEGORY: Record<GoalCard['category'], string> = { federal_vote: 'Federal vote', leadership: 'Leadership vote', state: 'Your state', electoral: 'Election' };
const POSITION: Record<TargetCard['position'], string> = { for: 'With us', uncommitted: 'Uncommitted', against: 'Against', unknown: 'No stated position' };
const POSITION_CLASS: Record<TargetCard['position'], string> = { for: 'bg-acid', uncommitted: 'bg-hazard', against: 'bg-crimson text-paper', unknown: 'bg-newsprint' };

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const t = Date.parse(d + 'T00:00:00');
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Target({ t }: { t: TargetCard }) {
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

function Card({ g, n }: { g: GoalCard; n: number }) {
  const date = fmtDate(g.decision_date);
  return (
    <article class="card-lg flex flex-col">
      <div class="relative hero-gradient text-newsprint p-5 min-h-[180px] flex flex-col justify-end">
        <div class="absolute inset-0 halftone pointer-events-none" />
        <div class="relative flex gap-2 mb-3">
          <span class="chip bg-hazard text-ink border-ink">{CATEGORY[g.category]}</span>
          <span class="chip bg-ink text-newsprint border-newsprint">Action {n}</span>
        </div>
        <h2 class="relative headline-lg">{g.title}</h2>
        {date && <p class="relative label-code mt-2 text-hazard">Decision: {date}</p>}
      </div>
      <div class="p-5 flex flex-col gap-4 flex-1">
        <p class="text-base">{g.summary}</p>
        <div class="border-2 border-ink">
          <p class="label-code px-3 py-2 border-b-2 border-ink bg-newsprint">Your targets ({g.targets.length})</p>
          <ul class="px-3">{g.targets.map((t) => <Target t={t} />)}</ul>
        </div>
        <p class="font-semibold">{g.ask_text}</p>
        <a href={g.action_href} class="btn btn-primary mt-auto self-start">Get my script →</a>
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
  return (
    <div>
      <p class="label-ticker mb-2">{where} · <button class="underline" onClick={change}>change address</button></p>
      <h1 class="display-lg">Your two actions this week</h1>
      <p class="mt-3 text-base max-w-2xl">Based on your delegation in {where}: {[data.house, ...data.senators].filter(Boolean).map((m) => m!.name).join(', ')}.</p>
      {data.goals.length === 0 ? (
        <div class="card p-5 mt-8 max-w-xl">
          <p class="font-semibold">No goal is open for your district right now.</p>
          <a href="/goals" class="btn btn-ghost mt-4">See all goals →</a>
        </div>
      ) : (
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mt-8">
          {data.goals.map((g, i) => <Card g={g} n={i + 1} />)}
        </div>
      )}
      <p class="mt-8"><a href="/goals" class="label-code underline underline-offset-4">See all goals →</a></p>
    </div>
  );
}
