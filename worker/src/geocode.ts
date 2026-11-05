// Census Geocoder proxy. The address is sent to the Census API and nowhere else:
// never logged, never stored, never put in an error message.
export const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';

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

interface CensusResponse {
  result?: {
    addressMatches?: Array<{
      geographies?: Record<string, Array<Record<string, string>>>;
    }>;
  };
}

/** Pull {state, district} out of a Census geographies response. Exported for tests. */
export function parseCensus(body: CensusResponse): GeocodeResult {
  const match = body.result?.addressMatches?.[0];
  if (!match?.geographies) return { ok: false, reason: 'unresolved' };
  const cdKey = Object.keys(match.geographies).find((k) => /Congressional Districts/i.test(k));
  const cd = cdKey ? match.geographies[cdKey]?.[0] : undefined;
  if (!cd) return { ok: false, reason: 'unresolved' };
  const cdField = Object.keys(cd).find((k) => /^CD\d+$/.test(k));
  const raw = cdField ? cd[cdField] : undefined;
  if (raw === undefined) return { ok: false, reason: 'unresolved' };
  // "00" and "98" are at-large / delegate codes; stored as district 0.
  const district = raw === '98' ? 0 : Number.parseInt(raw, 10);
  if (Number.isNaN(district)) return { ok: false, reason: 'unresolved' };
  const usps = match.geographies.States?.[0]?.STUSAB ?? FIPS_TO_USPS[cd.STATE ?? ''];
  if (!usps) return { ok: false, reason: 'unresolved' };
  return { ok: true, state: usps, district };
}

export async function geocode(address: string, fetchImpl: typeof fetch = fetch, base = CENSUS_URL): Promise<GeocodeResult> {
  const url = new URL(base);
  url.searchParams.set('address', address);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('vintage', 'Current_Current');
  url.searchParams.set('format', 'json');
  let res: Response;
  try {
    res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(8000) });
  } catch {
    return { ok: false, reason: 'upstream' };
  }
  if (!res.ok) return { ok: false, reason: 'upstream' };
  let body: CensusResponse;
  try {
    body = (await res.json()) as CensusResponse;
  } catch {
    return { ok: false, reason: 'upstream' };
  }
  return parseCensus(body);
}
