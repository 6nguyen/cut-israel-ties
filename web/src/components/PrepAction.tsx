import { useEffect, useState } from 'preact/hooks';
import { districtLabel, type TargetCard } from '../lib/api';
import { loadPlace } from '../lib/store';

export interface PrepActionRef { slug: string; label: string }
type State = { kind: 'loading' } | { kind: 'no_place' } | { kind: 'error'; message: string } | { kind: 'ok'; where: string; targets: TargetCard[] };

const act = (goal: string, action: string, target?: string | null) =>
  `/goals/${goal}/act/${action}${target ? `?target=${encodeURIComponent(target)}` : ''}`;

/** §3.3 "Take action": the stored district's targets, each linking to the act route with ?target=<bioguide_id>. */
export default function PrepAction({ slug, actions }: { slug: string; actions: PrepActionRef[] }) {
  const [s, setS] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const place = loadPlace();
    if (!place) { setS({ kind: 'no_place' }); return; }
    const where = districtLabel(place.state, place.district);
    fetch(`/api/goals/${encodeURIComponent(slug)}/targets?state=${place.state}&district=${place.district}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { targets?: TargetCard[]; message?: string };
        if (!res.ok) throw new Error(body.message ?? 'Could not load your targets.');
        setS({ kind: 'ok', where, targets: body.targets ?? [] });
      })
      .catch((e: Error) => setS({ kind: 'error', message: e.message }));
  }, [slug]);

  const first = actions[0];
  const plain = first && <a href={act(slug, first.slug)} class="btn btn-ghost mt-3 self-start">{first.label} →</a>;

  if (s.kind === 'loading') return <p class="label-code" aria-busy="true">Loading your targets…</p>;
  if (s.kind === 'no_place') return (
    <div class="card p-4">
      <p class="font-semibold">Enter your address and we carry your targets into the script.</p>
      <a href="/" class="btn btn-primary mt-4 self-start">Enter your address →</a>
      {plain}
    </div>
  );
  if (s.kind === 'error') return (
    <div class="card p-4" role="alert">
      <p class="font-semibold">{s.message}</p>
      {plain}
    </div>
  );
  if (s.targets.length === 0) return (
    <div class="card p-4">
      <p class="font-semibold">No one in {s.where} decides this goal.</p>
      <a href="/results" class="btn btn-ghost mt-3">Your two actions →</a>
    </div>
  );
  return (
    <div class="border-2 border-ink bg-paper">
      <p class="label-code px-3 py-2 border-b-2 border-ink bg-newsprint">Who to call in {s.where} ({s.targets.length})</p>
      <ul class="px-3">
        {s.targets.map((t) => (
          <li class="border-t border-rule first:border-t-0 py-3">
            <p class="font-syne font-extrabold leading-tight">{t.role} {t.name}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              {actions.map((a) => (
                <a href={act(slug, a.slug, t.bioguide_id)} class="btn btn-primary !py-2 !px-3 text-xs" aria-label={`${a.label} for ${t.role} ${t.name}`}>{a.label} →</a>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
