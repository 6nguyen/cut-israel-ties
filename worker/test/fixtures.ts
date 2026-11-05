// Six fixture addresses (§1 acceptance) with the Census Geocoder reply each one
// produces under the 119th map. Tests never hit the network.
import type { Env } from '../src/types';

export interface Fixture {
  label: string; // house party / senator parties
  address: string;
  state: string;
  district: number;
  splitCity?: boolean;
  expectGoals: string[];
}

export const FIXTURES: Fixture[] = [
  { label: 'D/DD', address: '1000 N Main St, Santa Ana, CA 92701', state: 'CA', district: 46, expectGoals: ['ndaa-1217', 'house-caucus'] },
  { label: 'D/RR', address: '301 W 2nd St, Austin, TX 78701', state: 'TX', district: 35, expectGoals: ['ndaa-1217', 'house-caucus'] },
  { label: 'R/DD', address: '15400 Civic Dr, Victorville, CA 92392', state: 'CA', district: 23, expectGoals: ['ndaa-1217', 'senate-leader'] },
  { label: 'R/RR', address: '100 Main Plaza, New Braunfels, TX 78130', state: 'TX', district: 21, expectGoals: ['ndaa-1217', 'state-bonds'] },
  { label: 'R/DR', address: '1 N Main St, Doylestown, PA 18901', state: 'PA', district: 1, expectGoals: ['ndaa-1217', 'senate-leader'] },
  { label: 'D/DR', address: '1400 John F Kennedy Blvd, Philadelphia, PA 19107', state: 'PA', district: 2, splitCity: true, expectGoals: ['ndaa-1217', 'house-caucus'] },
];

const FIPS: Record<string, string> = { CA: '06', TX: '48', PA: '42' };

export function censusReply(f: Fixture) {
  return {
    result: {
      input: { address: { address: f.address } },
      addressMatches: [
        {
          matchedAddress: f.address.toUpperCase(),
          geographies: {
            States: [{ STUSAB: f.state, STATE: FIPS[f.state] }],
            '119th Congressional Districts': [{ CD119: String(f.district).padStart(2, '0'), STATE: FIPS[f.state] }],
          },
        },
      ],
    },
  };
}

/** fetch stub: answers Census and Turnstile calls from fixtures; records every URL hit. */
export function fakeFetch(opts: { turnstileOk?: boolean } = {}) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.startsWith('https://challenges.cloudflare.com/')) {
      return Response.json({ success: opts.turnstileOk ?? true });
    }
    if (url.startsWith('https://geocoding.geo.census.gov/')) {
      const address = new URL(url).searchParams.get('address') ?? '';
      const f = FIXTURES.find((x) => x.address === address);
      if (!f) return Response.json({ result: { input: {}, addressMatches: [] } });
      return Response.json(censusReply(f));
    }
    void init;
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { impl, calls };
}

export const ENV: Env = { DB: undefined as unknown as D1Database };
