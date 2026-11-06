// Census Geocoder proxy. The address is sent to the Census API and nowhere else:
// never logged, never stored, never put in an error message.
export const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';

// Which Congress's districts the geocoder answers with (docs/prd/district-vintage-rollover.md §1).
// Probed 2026-11-05: `Current_Current` already returns the 120th-Congress map (Austin → TX-10,
// downtown Kansas City → MO-4); `ACS2025_Current` returns the 119th map the sitting members hold
// (TX-37, MO-5). The Worker var DISTRICT_VINTAGE flips on 2027-01-03; until then the default pins
// the sitting Congress.
export const DEFAULT_VINTAGE = 'ACS2025_Current';
/**
 * Per-state pins applied after the first answer, keyed by the USPS state the geocoder returns.
 * Missouri repealed the 2025 map on 2026-11-03 (Prop A) and keeps the 2022 lines, but the 120th
 * layer carries the repealed map, so MO stays on the 119th vintage after the flip. When the state
 * has an override and the answer came from another vintage, the coordinates of the match are
 * re-queried with the override vintage: one extra subrequest, Missouri only.
 */
export const VINTAGE_OVERRIDES: Readonly<Record<string, string>> = { MO: 'ACS2025_Current' };

export type GeocodeResult =
  | { ok: true; state: string; district: number }
  | { ok: false; reason: 'zip_only' | 'unresolved' | 'upstream' };

const ZIP_ONLY = /^\s*\d{5}(-\d{4})?\s*$/;
const HAS_STREET = /\d+\s*[A-Za-z]/;

/** §1.2: a full street address is required; ZIP-only is refused before any network call. */
export function classifyAddress(address: string): 'zip_only' | 'incomplete' | 'ok' {
  if (ZIP_ONLY.test(address)) return 'zip_only';
  if (!HAS_STREET.test(address) || address.trim().length < 8) return 'incomplete';
  return 'ok';
}

const FIPS_TO_USPS: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE',
  '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA',
  '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN',
  '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM',
  '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA',
  '54': 'WV', '55': 'WI', '56': 'WY', '72': 'PR',
};

type Geographies = Record<string, Array<Record<string, string>>>;
interface CensusResponse {
  result?: {
    // geographies/onelineaddress
    addressMatches?: Array<{
      coordinates?: { x: number; y: number };
      geographies?: Geographies;
    }>;
    // geographies/coordinates
    geographies?: Geographies;
  };
}

/** Pull {state, district} out of a Census geographies response (address or coordinate form). Exported for tests. */
export function parseCensus(body: CensusResponse): GeocodeResult {
  const match = body.result?.addressMatches?.[0];
  const geographies = match?.geographies ?? body.result?.geographies;
  if (!geographies) return { ok: false, reason: 'unresolved' };
  const cdKey = Object.keys(geographies).find((k) => /Congressional Districts/i.test(k));
  const cd = cdKey ? geographies[cdKey]?.[0] : undefined;
  if (!cd) return { ok: false, reason: 'unresolved' };
  // The district number: `CD<nnn>` where the layer still carries it, else `BASENAME` ("46", "1"), else the
  // last two digits of `GEOID` ("0646"). Probed 2026-11-06: ACS2025_Current ships BASENAME + GEOID and no CD119,
  // which made every address "unresolved" in production.
  const cdField = Object.keys(cd).find((k) => /^CD\d+$/.test(k));
  const raw = (cdField ? cd[cdField] : undefined) ?? cd.BASENAME ?? (typeof cd.GEOID === 'string' && cd.GEOID.length >= 2 ? cd.GEOID.slice(-2) : undefined);
  if (raw === undefined || raw === '') return { ok: false, reason: 'unresolved' };
  // "00" and "98" are at-large / delegate codes; stored as district 0.
  const district = raw === '98' ? 0 : Number.parseInt(raw, 10);
  if (Number.isNaN(district)) return { ok: false, reason: 'unresolved' };
  const usps = geographies.States?.[0]?.STUSAB ?? FIPS_TO_USPS[cd.STATE ?? ''];
  if (!usps) return { ok: false, reason: 'unresolved' };
  return { ok: true, state: usps, district };
}

async function query(url: URL, vintage: string, fetchImpl: typeof fetch): Promise<{ ok: true; body: CensusResponse } | { ok: false; reason: 'upstream' }> {
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('vintage', vintage);
  url.searchParams.set('format', 'json');
  let res: Response;
  try {
    res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(8000) });
  } catch {
    return { ok: false, reason: 'upstream' };
  }
  if (!res.ok) return { ok: false, reason: 'upstream' };
  try {
    return { ok: true, body: (await res.json()) as CensusResponse };
  } catch {
    return { ok: false, reason: 'upstream' };
  }
}

/**
 * Address → {state, district} under `vintage` (default: the sitting Congress), then the per-state
 * override: a state in VINTAGE_OVERRIDES answered from another vintage is re-queried by the
 * coordinates of the match (`geographies/coordinates`, same benchmark). The address is sent once.
 */
export async function geocode(address: string, fetchImpl: typeof fetch = fetch, base = CENSUS_URL, vintage = DEFAULT_VINTAGE): Promise<GeocodeResult> {
  const url = new URL(base);
  url.searchParams.set('address', address);
  const first = await query(url, vintage, fetchImpl);
  if (!first.ok) return first;
  const result = parseCensus(first.body);
  if (!result.ok) return result;
  const pin = VINTAGE_OVERRIDES[result.state];
  if (!pin || pin === vintage) return result;
  const coords = first.body.result?.addressMatches?.[0]?.coordinates;
  if (!coords) return { ok: false, reason: 'unresolved' };
  const again = new URL(base);
  again.pathname = again.pathname.replace(/onelineaddress$/, 'coordinates');
  again.searchParams.set('x', String(coords.x));
  again.searchParams.set('y', String(coords.y));
  const second = await query(again, pin, fetchImpl);
  return second.ok ? parseCensus(second.body) : second;
}
