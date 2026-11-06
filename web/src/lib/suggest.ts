// address-autocomplete §1–§2: the provider flag, the request gate, the debounce/abort loop the
// landing combobox drives, and one adapter per provider. Each adapter maps the provider's response
// to `Suggestion`s and drops anything that is not a US street address with a house number, a city,
// a two-letter state and a ZIP (open question 4: the label is built from structured fields).

export type Provider = 'none' | 'mapbox' | 'geoapify';
export interface Suggestion { label: string; state: string; lon: number; lat: number }
export type Suggester = (q: string, signal: AbortSignal) => Promise<Suggestion[]>;

export const MIN_CHARS = 3;
export const DEBOUNCE_MS = 250;
export const TIMEOUT_MS = 2000;
export const LIMIT = 5;

const PROVIDERS: Provider[] = ['none', 'mapbox', 'geoapify'];
const ZIP = /^\d{5}(-\d{4})?$/;

type Env = Record<string, string | undefined>;

/** `PUBLIC_SUGGEST_PROVIDER`, or `none` when unset, unknown, or set without `PUBLIC_SUGGEST_TOKEN` (the build warns). */
export function configuredProvider(env: Env = import.meta.env as Env, warn: (m: string) => void = console.warn): Provider {
  const raw = (env.PUBLIC_SUGGEST_PROVIDER ?? 'none').trim().toLowerCase();
  if (!PROVIDERS.includes(raw as Provider)) { warn(`PUBLIC_SUGGEST_PROVIDER=${raw} is not one of ${PROVIDERS.join('|')}; suggestions off`); return 'none'; }
  const p = raw as Provider;
  if (p !== 'none' && !env.PUBLIC_SUGGEST_TOKEN) { warn(`PUBLIC_SUGGEST_PROVIDER=${p} without PUBLIC_SUGGEST_TOKEN; suggestions off`); return 'none'; }
  return p;
}

/** The provider as `/privacy` names it. */
export const PROVIDER_NAME: Record<Exclude<Provider, 'none'>, string> = { mapbox: 'Mapbox', geoapify: 'Geoapify' };

/** Attribution under the open list, as each provider's terms require. */
export const ATTRIBUTION: Record<Exclude<Provider, 'none'>, { text: string; href: string }> = {
  mapbox: { text: '© Mapbox', href: 'https://www.mapbox.com/about/maps/' },
  geoapify: { text: 'Powered by Geoapify', href: 'https://www.geoapify.com/' },
};

/** A request is worth making only for three or more characters that are not a bare ZIP. */
export function shouldSuggest(q: string): boolean {
  const t = q.trim();
  return t.length >= MIN_CHARS && !ZIP.test(t);
}

/** Keyboard model of the list: the next highlighted index (-1 = none), or null when the key is not ours. */
export function stepHighlight(key: string, active: number, count: number): number | null {
  if (count === 0) return null;
  if (key === 'ArrowDown') return Math.min(active + 1, count - 1);
  if (key === 'ArrowUp') return Math.max(active - 1, -1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

type Adapter = (q: string, token: string, signal: AbortSignal) => Promise<Suggestion[]>;

const STATE_CODE = /^[A-Z]{2}$/;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** "street, city, ST ZIP" from structured fields; null when any part is missing (the result is dropped). */
export function shortLabel(parts: { number: unknown; street: unknown; city: unknown; state: unknown; zip: unknown }): { label: string; state: string } | null {
  const number = str(parts.number), street = str(parts.street), city = str(parts.city), zip = str(parts.zip);
  const state = str(parts.state).toUpperCase();
  if (!number || !street || !city || !zip || !STATE_CODE.test(state)) return null;
  return { label: `${number} ${street}, ${city}, ${state} ${zip}`, state };
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`suggest: ${res.status}`); // 429 and 5xx land here; the loop closes the list
  return res.json();
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const features = (body: unknown): Obj[] => { const f = obj(body).features; return Array.isArray(f) ? f.map(obj) : []; };

/** Mapbox Geocoding v6 forward, `types=address`; state from `context.region.region_code`, point from `geometry.coordinates`. */
const mapbox: Adapter = async (q, token, signal) => {
  const u = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  u.search = new URLSearchParams({ q, autocomplete: 'true', country: 'us', types: 'address', limit: String(LIMIT), proximity: 'ip', access_token: token }).toString();
  const out: Suggestion[] = [];
  for (const f of features(await getJson(u.toString(), signal))) {
    const p = obj(f.properties), ctx = obj(p.context), address = obj(ctx.address);
    const coords = obj(f.geometry).coordinates;
    const lon = Array.isArray(coords) ? num(coords[0]) : null, lat = Array.isArray(coords) ? num(coords[1]) : null;
    const l = shortLabel({ number: address.address_number, street: address.street_name ?? obj(ctx.street).name, city: obj(ctx.place).name, state: obj(ctx.region).region_code, zip: obj(ctx.postcode).name });
    if (l && lon !== null && lat !== null) out.push({ ...l, lon, lat });
  }
  return out.slice(0, LIMIT);
};

/** Geoapify autocomplete, `filter=countrycode:us`; keeps features with `housenumber`, state from `state_code`, point from `lon`/`lat`. */
const geoapify: Adapter = async (q, token, signal) => {
  const u = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
  u.search = new URLSearchParams({ text: q, filter: 'countrycode:us', limit: String(LIMIT), apiKey: token }).toString();
  const out: Suggestion[] = [];
  for (const f of features(await getJson(u.toString(), signal))) {
    const p = obj(f.properties);
    const lon = num(p.lon), lat = num(p.lat);
    const l = shortLabel({ number: p.housenumber, street: p.street, city: p.city, state: p.state_code, zip: p.postcode });
    if (l && lon !== null && lat !== null) out.push({ ...l, lon, lat });
  }
  return out.slice(0, LIMIT);
};

const ADAPTERS: Partial<Record<Provider, Adapter>> = { mapbox, geoapify };

/** Up to LIMIT US street addresses for `q` from the configured provider; `[]` when no adapter or token. */
export async function suggest(q: string, signal: AbortSignal, provider: Provider = configuredProvider(), token: string | undefined = (import.meta.env as Env).PUBLIC_SUGGEST_TOKEN): Promise<Suggestion[]> {
  const adapter = ADAPTERS[provider];
  if (!adapter || !token) return [];
  return adapter(q, token, signal);
}

export interface Loop { input(q: string): void; cancel(): void }
export interface Timings { debounce?: number; timeout?: number }

/**
 * One request per debounced edit: a new keystroke cancels the pending timer and aborts the request in
 * flight; a gated input, a failure or a timeout reports `[]` so the list closes without an error.
 */
export function suggestLoop(suggester: Suggester, onResult: (s: Suggestion[], q: string) => void, t: Timings = {}): Loop {
  const debounce = t.debounce ?? DEBOUNCE_MS, timeout = t.timeout ?? TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctrl: AbortController | undefined;
  const cancel = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } ctrl?.abort(); ctrl = undefined; };
  return {
    input(q) {
      cancel();
      if (!shouldSuggest(q)) { onResult([], q); return; }
      timer = setTimeout(() => {
        timer = undefined;
        const c = new AbortController(); ctrl = c;
        const late = setTimeout(() => { c.abort(); onResult([], q); }, timeout);
        suggester(q, c.signal)
          .then((s) => { if (!c.signal.aborted) onResult(s.slice(0, LIMIT), q); }, () => { if (!c.signal.aborted) onResult([], q); })
          .finally(() => { clearTimeout(late); if (ctrl === c) ctrl = undefined; });
      }, debounce);
    },
    cancel,
  };
}
