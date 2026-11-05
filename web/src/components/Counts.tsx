import { useEffect, useState } from 'preact/hooks';
import { districtLabel } from '../lib/api';

// district-counters §2: one line of social proof under a target list. The numbers come from
// GET /api/counts (SQL COUNTs, thresholded server-side); this file only picks the scope and the verb.
export interface Buckets { calls: number; letters: number; comments: number; captain_lists: number }
export interface CountsResponse { district: Buckets; state: Buckets; since: string }

const VERB: Record<keyof Buckets, string> = { calls: 'called', letters: 'wrote', comments: 'commented', captain_lists: 'organised' };
const ORDER: (keyof Buckets)[] = ['calls', 'letters', 'comments', 'captain_lists'];
export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'the District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico', GU: 'Guam', VI: 'the Virgin Islands', AS: 'American Samoa', MP: 'the Northern Mariana Islands',
};

/** The largest bucket, first in ORDER on a tie; null when every bucket is 0 (the server already hid anything under the threshold). */
function largest(b: Buckets): { key: keyof Buckets; n: number } | null {
  let best: { key: keyof Buckets; n: number } | null = null;
  for (const key of ORDER) if (b[key] > 0 && (!best || b[key] > best.n)) best = { key, n: b[key] };
  return best;
}

/**
 * §2.1 grammar: "12 constituents in TX-35 called this week" from the district buckets, else
 * "12 constituents in Texas called this week" from the state buckets, else null (render nothing).
 */
export function counterLine(c: CountsResponse, state: string, district: number | null): string | null {
  const d = district === null ? null : largest(c.district);
  if (d) return `${d.n} constituents in ${districtLabel(state, district as number)} ${VERB[d.key]} this week`;
  const s = largest(c.state);
  if (s) return `${s.n} constituents in ${STATE_NAMES[state] ?? state} ${VERB[s.key]} this week`;
  return null;
}

/** Fetches once; renders nothing until the response arrives and nothing when no bucket clears the threshold (§2.3). */
export default function Counts({ goal, state, district }: { goal: string; state: string; district: number | null }) {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const qs = `goal=${encodeURIComponent(goal)}&state=${encodeURIComponent(state)}${district === null ? '' : `&district=${district}`}`;
    fetch(`/api/counts?${qs}`)
      .then((r) => (r.ok ? (r.json() as Promise<CountsResponse>) : null))
      .then((c) => { if (live && c) setLine(counterLine(c, state, district)); })
      .catch(() => {});
    return () => { live = false; };
  }, [goal, state, district]);
  if (!line) return null;
  return <p class="label-code text-sm px-3 py-2 border-t-2 border-ink bg-newsprint" data-counts>{line}</p>;
}
