// address-autocomplete §1–§2: the flag, the request gate and the debounce/abort loop under fake timers,
// then the Mapbox and Geoapify adapters against a stubbed fetch (URL, token, mapping, dropped rows, errors).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredProvider, shortLabel, shouldSuggest, stepHighlight, suggest, suggestLoop } from './suggest';
import type { Suggestion } from './suggest';

const S = (label: string): Suggestion => ({ label, state: 'CA', lon: -117.86, lat: 33.75 });

describe('configuredProvider', () => {
  it('defaults to none and warns on an unknown value or a missing token', () => {
    const warn = vi.fn();
    expect(configuredProvider({}, warn)).toBe('none');
    expect(configuredProvider({ PUBLIC_SUGGEST_PROVIDER: 'mapbox', PUBLIC_SUGGEST_TOKEN: 'pk.x' }, warn)).toBe('mapbox');
    expect(configuredProvider({ PUBLIC_SUGGEST_PROVIDER: 'Geoapify', PUBLIC_SUGGEST_TOKEN: 'k' }, warn)).toBe('geoapify');
    expect(warn).not.toHaveBeenCalled();
    expect(configuredProvider({ PUBLIC_SUGGEST_PROVIDER: 'mapbox' }, warn)).toBe('none');
    expect(configuredProvider({ PUBLIC_SUGGEST_PROVIDER: 'google', PUBLIC_SUGGEST_TOKEN: 'k' }, warn)).toBe('none');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('shouldSuggest', () => {
  it('needs three characters and refuses a bare ZIP', () => {
    expect(shouldSuggest('12')).toBe(false);
    expect(shouldSuggest('  1 ')).toBe(false);
    expect(shouldSuggest('92701')).toBe(false);
    expect(shouldSuggest('92701-1234')).toBe(false);
    expect(shouldSuggest('12 Ma')).toBe(true);
    expect(shouldSuggest('100')).toBe(true);
  });
});

describe('stepHighlight', () => {
  it('clamps ArrowDown/ArrowUp between -1 and the last option and ignores other keys', () => {
    expect(stepHighlight('ArrowDown', -1, 3)).toBe(0);
    expect(stepHighlight('ArrowDown', 2, 3)).toBe(2);
    expect(stepHighlight('ArrowUp', 0, 3)).toBe(-1);
    expect(stepHighlight('End', -1, 3)).toBe(2);
    expect(stepHighlight('a', 1, 3)).toBeNull();
    expect(stepHighlight('ArrowDown', -1, 0)).toBeNull();
  });
});

describe('suggest gate (§1)', () => {
  it('yields nothing, and makes no request, for none or a missing token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const c = new AbortController();
    expect(await suggest('1000 N Main', c.signal, 'none', 'k')).toEqual([]);
    expect(await suggest('1000 N Main', c.signal, 'mapbox', undefined)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('shortLabel (open question 4)', () => {
  it('builds "street, city, ST ZIP" from structured fields and drops a result missing any', () => {
    expect(shortLabel({ number: '1000', street: 'N Main St', city: 'Santa Ana', state: 'ca', zip: '92701' })).toEqual({ label: '1000 N Main St, Santa Ana, CA 92701', state: 'CA' });
    expect(shortLabel({ number: 1000, street: 'N Main St', city: 'Santa Ana', state: 'CA', zip: 92701 })?.label).toBe('1000 N Main St, Santa Ana, CA 92701');
    expect(shortLabel({ number: undefined, street: 'N Main St', city: 'Santa Ana', state: 'CA', zip: '92701' })).toBeNull();
    expect(shortLabel({ number: '1000', street: 'N Main St', city: 'Santa Ana', state: 'California', zip: '92701' })).toBeNull();
    expect(shortLabel({ number: '1000', street: 'N Main St', city: '', state: 'CA', zip: '92701' })).toBeNull();
    expect(shortLabel({ number: '1000', street: 'N Main St', city: 'Santa Ana', state: 'CA', zip: null })).toBeNull();
  });
});

const mapboxFeature = (o: { number?: string; street?: string; city?: string; region?: string; zip?: string; coords?: unknown }) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: 'coords' in o ? o.coords : [-117.8678, 33.7542] },
  properties: {
    feature_type: 'address', full_address: 'ignored, the label is built from context',
    context: {
      address: { address_number: o.number ?? '1000', street_name: o.street ?? 'North Main Street' },
      street: { name: o.street ?? 'North Main Street' },
      place: { name: o.city ?? 'Santa Ana' },
      region: { name: 'California', region_code: o.region ?? 'CA' },
      postcode: { name: o.zip ?? '92701' },
      country: { country_code: 'US' },
    },
  },
});
const geoapifyFeature = (o: Record<string, unknown>) => ({
  type: 'Feature',
  properties: { housenumber: '1000', street: 'North Main Street', city: 'Santa Ana', state: 'California', state_code: 'CA', postcode: '92701', country_code: 'us', lon: -117.8678, lat: 33.7542, formatted: 'ignored', ...o },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('provider adapters (§2)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });
  const url = () => new URL(String(fetchMock.mock.calls[0][0]));

  it('mapbox: v6 forward with the contract parameters, the token and the abort signal; maps context + coordinates', async () => {
    fetchMock.mockResolvedValue(json({ type: 'FeatureCollection', features: [mapboxFeature({}), mapboxFeature({ city: 'Santa Monica', zip: '90401', coords: [-118.49, 34.02] })] }));
    const c = new AbortController();
    const got = await suggest('1000 N Main St, Santa', c.signal, 'mapbox', 'pk.test');
    const u = url();
    expect(u.origin + u.pathname).toBe('https://api.mapbox.com/search/geocode/v6/forward');
    expect(Object.fromEntries(u.searchParams)).toEqual({ q: '1000 N Main St, Santa', autocomplete: 'true', country: 'us', types: 'address', limit: '5', proximity: 'ip', access_token: 'pk.test' });
    expect(fetchMock.mock.calls[0][1]).toEqual({ signal: c.signal });
    expect(got).toEqual([
      { label: '1000 North Main Street, Santa Ana, CA 92701', state: 'CA', lon: -117.8678, lat: 33.7542 },
      { label: '1000 North Main Street, Santa Monica, CA 90401', state: 'CA', lon: -118.49, lat: 34.02 },
    ]);
  });

  it('mapbox: drops results without a house number, a two-letter state, a ZIP or a point', async () => {
    fetchMock.mockResolvedValue(json({ features: [
      mapboxFeature({ number: '' }), mapboxFeature({ region: 'California' }), mapboxFeature({ zip: '' }), mapboxFeature({ coords: null }), mapboxFeature({ city: 'Orange' }),
    ] }));
    const got = await suggest('1000 N Main', new AbortController().signal, 'mapbox', 'pk.test');
    expect(got.map((s) => s.label)).toEqual(['1000 North Main Street, Orange, CA 92701']);
  });

  it('geoapify: autocomplete with the contract parameters; keeps housenumber features, state_code and lon/lat', async () => {
    fetchMock.mockResolvedValue(json({ type: 'FeatureCollection', features: [
      geoapifyFeature({}), geoapifyFeature({ housenumber: undefined, street: 'Main Street' }), geoapifyFeature({ state_code: undefined }), geoapifyFeature({ city: 'Orange', postcode: '92866', lon: -117.85, lat: 33.79 }),
    ] }));
    const c = new AbortController();
    const got = await suggest('1000 N Main St, Santa', c.signal, 'geoapify', 'k.test');
    const u = url();
    expect(u.origin + u.pathname).toBe('https://api.geoapify.com/v1/geocode/autocomplete');
    expect(Object.fromEntries(u.searchParams)).toEqual({ text: '1000 N Main St, Santa', filter: 'countrycode:us', limit: '5', apiKey: 'k.test' });
    expect(fetchMock.mock.calls[0][1]).toEqual({ signal: c.signal });
    expect(got).toEqual([
      { label: '1000 North Main Street, Santa Ana, CA 92701', state: 'CA', lon: -117.8678, lat: 33.7542 },
      { label: '1000 North Main Street, Orange, CA 92866', state: 'CA', lon: -117.85, lat: 33.79 },
    ]);
  });

  it('caps at five and rejects on a 429 or a malformed body so the loop closes the list', async () => {
    fetchMock.mockResolvedValueOnce(json({ features: Array.from({ length: 8 }, (_, i) => geoapifyFeature({ housenumber: String(i + 1) })) }));
    expect(await suggest('1 Main St', new AbortController().signal, 'geoapify', 'k')).toHaveLength(5);
    fetchMock.mockResolvedValueOnce(json({ message: 'Too Many Requests' }, 429));
    await expect(suggest('1 Main St', new AbortController().signal, 'mapbox', 'k')).rejects.toThrow('429');
    fetchMock.mockResolvedValueOnce(json('not a collection'));
    expect(await suggest('1 Main St', new AbortController().signal, 'mapbox', 'k')).toEqual([]);
  });
});

describe('suggestLoop', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires one request per 250 ms idle period and aborts the one in flight', async () => {
    const signals: AbortSignal[] = [];
    const ask = vi.fn((q: string, signal: AbortSignal) => { signals.push(signal); return new Promise<Suggestion[]>((ok) => setTimeout(() => ok([S(q + ' A'), S(q + ' B')]), 100)); });
    const got = vi.fn();
    const loop = suggestLoop(ask, got);
    loop.input('100'); loop.input('1000'); loop.input('1000 N');
    await vi.advanceTimersByTimeAsync(249);
    expect(ask).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenLastCalledWith('1000 N', expect.any(AbortSignal));
    loop.input('1000 N Main'); // while the first request is pending
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(ask).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(got).toHaveBeenCalledTimes(1); // the aborted request never reported
    expect(got).toHaveBeenLastCalledWith([S('1000 N Main A'), S('1000 N Main B')], '1000 N Main');
  });

  it('never requests for a bare ZIP or under three characters, and closes the list for them', async () => {
    const ask = vi.fn(async () => [S('x')]);
    const got = vi.fn();
    const loop = suggestLoop(ask, got);
    loop.input('92701'); loop.input('12'); loop.input('12 Ma');
    await vi.advanceTimersByTimeAsync(300);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenLastCalledWith('12 Ma', expect.any(AbortSignal));
    expect(got.mock.calls.slice(0, 2)).toEqual([[[], '92701'], [[], '12']]);
  });

  it('reports [] on a failure and on the 2 s timeout, and caps the list at five', async () => {
    const got = vi.fn();
    const failing = suggestLoop(vi.fn(async () => { throw Object.assign(new Error('429'), { status: 429 }); }), got);
    failing.input('1000 N Main');
    await vi.advanceTimersByTimeAsync(260);
    expect(got).toHaveBeenLastCalledWith([], '1000 N Main');

    let sig: AbortSignal | undefined;
    const hanging = suggestLoop((_q, signal) => { sig = signal; return new Promise(() => {}); }, got);
    hanging.input('1000 N Main St');
    await vi.advanceTimersByTimeAsync(250 + 1999);
    expect(got).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(got).toHaveBeenCalledTimes(2);
    expect(got).toHaveBeenLastCalledWith([], '1000 N Main St');
    expect(sig?.aborted).toBe(true);

    const many = suggestLoop(async () => Array.from({ length: 8 }, (_, i) => S(String(i))), got, { debounce: 10 });
    many.input('1000 N Main St,');
    await vi.advanceTimersByTimeAsync(20);
    expect(got.mock.lastCall?.[0]).toHaveLength(5);
  });

  it('cancel() drops the pending timer so nothing fires after a pick or unmount', async () => {
    const ask = vi.fn(async () => [S('x')]);
    const loop = suggestLoop(ask, vi.fn());
    loop.input('1000 N Main'); loop.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(ask).not.toHaveBeenCalled();
  });
});
