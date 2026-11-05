import { useEffect, useState } from 'preact/hooks';
import { districtLabel, type TargetCard } from '../lib/api';
import { loadPlace, type Place } from '../lib/store';
import { Target } from './Target';
import Counts from './Counts';

type State = { kind: 'loading' } | { kind: 'no_place' } | { kind: 'error'; message: string } | { kind: 'ok'; where: string; place: Place; targets: TargetCard[] };

/** §2.2 "your targets": the stored {state, district} only; nothing else leaves the browser. */
export default function GoalTargets({ slug }: { slug: string }) {
  const [s, setS] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const place = loadPlace();
    if (!place) { setS({ kind: 'no_place' }); return; }
    const where = districtLabel(place.state, place.district);
    fetch(`/api/goals/${encodeURIComponent(slug)}/targets?state=${place.state}&district=${place.district}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { targets?: TargetCard[]; message?: string };
        if (!res.ok) throw new Error(body.message ?? 'Could not load your targets.');
        setS({ kind: 'ok', where, place, targets: body.targets ?? [] });
      })
      .catch((e: Error) => setS({ kind: 'error', message: e.message }));
  }, [slug]);

  if (s.kind === 'loading') return <p class="label-code" aria-busy="true">Loading your targets…</p>;
  if (s.kind === 'no_place') return (
    <div class="card p-4">
      <p class="font-semibold">Enter your address to see who to call on this goal.</p>
      <a href="/" class="btn btn-primary mt-4 self-start">Enter your address →</a>
    </div>
  );
  if (s.kind === 'error') return (
    <div class="card p-4" role="alert">
      <p class="font-semibold">{s.message}</p>
      <a href="/" class="btn btn-ghost mt-4">Change address</a>
    </div>
  );
  return (
    <div class="border-2 border-ink bg-paper">
      <p class="label-code px-3 py-2 border-b-2 border-ink bg-newsprint">Your targets in {s.where} ({s.targets.length}) · <a href="/results" class="underline">your two actions</a></p>
      {s.targets.length === 0
        ? <p class="px-3 py-3 text-sm">No one in your delegation decides this goal.</p>
        : <ul class="px-3">{s.targets.map((t) => <Target t={t} />)}</ul>}
      {s.targets.length > 0 && <Counts goal={slug} state={s.place.state} district={s.place.district} />}
    </div>
  );
}
