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

const FIPS: Record<string, string> = { CA: '06', TX: '48', PA: '42', MO: '29' };

/**
 * district-vintage-rollover §1: two points whose district differs by geocoder vintage, recorded
 * 2026-11-05 from geographies/coordinates (benchmark Public_AR_Current). `Current_Current` returns
 * the 120th-Congress layer, `ACS2025_Current` the 119th. The addresses are stand-ins for the fake
 * fetch; the recorded answers are the coordinates'.
 */
export interface VintagePoint { label: string; address: string; state: string; lon: number; lat: number; by: Record<string, { congress: number; district: number }> }
export const VINTAGE_POINTS: VintagePoint[] = [
  { label: 'Austin', address: '600 Congress Ave, Austin, TX 78701', state: 'TX', lon: -97.7431, lat: 30.2672,
    by: { Current_Current: { congress: 120, district: 10 }, ACS2025_Current: { congress: 119, district: 37 } } },
  { label: 'Kansas City', address: '414 E 12th St, Kansas City, MO 64106', state: 'MO', lon: -94.5786, lat: 39.0997,
    by: { Current_Current: { congress: 120, district: 4 }, ACS2025_Current: { congress: 119, district: 5 } } },
];

type Geographies = Record<string, Array<Record<string, string>>>;
function geographies(state: string, congress: number, district: number): Geographies {
  return {
    States: [{ STUSAB: state, STATE: FIPS[state] }],
    [`${congress}th Congressional Districts`]: [{ [`CD${congress}`]: String(district).padStart(2, '0'), STATE: FIPS[state] }],
  };
}
function wrap(address: string, state: string, congress: number, district: number, coordinates?: { x: number; y: number }) {
  return {
    result: {
      input: { address: { address } },
      addressMatches: [{ matchedAddress: address.toUpperCase(), coordinates, geographies: geographies(state, congress, district) }],
    },
  };
}

export function censusReply(f: Fixture) {
  return wrap(f.address, f.state, 119, f.district);
}

/** geographies/onelineaddress reply for a vintage point under `vintage`, with the match coordinates. */
export function vintageAddressReply(p: VintagePoint, vintage: string) {
  const a = p.by[vintage] ?? p.by.ACS2025_Current;
  return wrap(p.address, p.state, a.congress, a.district, { x: p.lon, y: p.lat });
}
/** geographies/coordinates reply (no addressMatches: the geographies sit directly under result). */
export function vintageCoordinatesReply(p: VintagePoint, vintage: string) {
  const a = p.by[vintage] ?? p.by.ACS2025_Current;
  return { result: { input: { location: { x: p.lon, y: p.lat } }, geographies: geographies(p.state, a.congress, a.district) } };
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
      const u = new URL(url);
      const vintage = u.searchParams.get('vintage') ?? '';
      if (u.pathname.endsWith('/coordinates')) {
        const x = Number(u.searchParams.get('x')), y = Number(u.searchParams.get('y'));
        const p = VINTAGE_POINTS.find((v) => v.lon === x && v.lat === y);
        return Response.json(p ? vintageCoordinatesReply(p, vintage) : { result: { input: {}, geographies: {} } });
      }
      const address = u.searchParams.get('address') ?? '';
      const v = VINTAGE_POINTS.find((x) => x.address === address);
      if (v) return Response.json(vintageAddressReply(v, vintage));
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
