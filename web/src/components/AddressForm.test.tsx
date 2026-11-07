// @vitest-environment happy-dom
// address-autocomplete §1–§4: the landing field is a combobox only when a provider is set; the list opens
// after a debounced request, keyboard picks fill the field, a pick resolves on the device from the real
// CA.json and posts {state, district, by_suggestion}, a point in no district falls through to the Census
// path, failures stay silent, and `none` renders today's field. Rendered with preact under happy-dom;
// the provider call is a spy and fetch is stubbed per test.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import AddressForm, { UNRESOLVED_WITH_SUGGESTIONS } from './AddressForm';
import { clearCache } from '../lib/pip';
import type { Suggestion } from '../lib/suggest';

const S = (label: string): Suggestion => ({ label, state: 'CA', lon: -117.86, lat: 33.75 });
// The CA-7 fixture point (web/src/lib/districts.fixture.json), served from the committed CA.json.
const SACRAMENTO: Suggestion = { label: '1000 N Main St, Sacramento, CA 95814', state: 'CA', lon: -121.4934, lat: 38.5767 };
const CA_JSON = readFileSync(join(__dirname, '..', '..', 'public', 'districts', 'CA.json'), 'utf8');
const ROUTE_OK = { state: 'CA', district: 7, house: null, senators: [], state_row: null, goals: [] };
const bodies = () => fetchMock.mock.calls.map((c) => [String(c[0]), c[1]?.body ? JSON.parse(c[1].body as string) : null]);
const click = (el: Element | null) => act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const TIMINGS = { debounce: 20, timeout: 60 };
let root: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const type = (value: string) => act(() => { const el = input(); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); });
const key = (k: string) => act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
const input = () => root.querySelector('#address') as HTMLInputElement;
const listbox = () => root.querySelector('[role="listbox"]');
const options = () => Array.from(root.querySelectorAll('[role="option"]')).map((o) => o.textContent);

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); clearCache();
  root = document.createElement('div'); document.body.appendChild(root);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'unresolved', message: 'no' }), { status: 404 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { render(null, root); root.remove(); vi.unstubAllGlobals(); });

describe('provider none (today\'s field)', () => {
  it('renders the plain input with no combobox role, no list and no suggestion request', async () => {
    const suggester = vi.fn(async () => [S('x')]);
    await act(() => { render(h(AddressForm, { suggester, timings: TIMINGS }), root); });
    const el = input();
    expect(el.getAttribute('autocomplete')).toBe('street-address');
    expect(el.getAttribute('role')).toBeNull();
    expect(el.hasAttribute('aria-expanded')).toBe(false);
    expect(root.querySelector('[aria-live]')).toBeNull();
    await type('1000 N Main St, Santa');
    await wait(50);
    expect(suggester).not.toHaveBeenCalled();
    expect(listbox()).toBeNull();
    expect(root.textContent).toMatch(/Find my actions/);
    expect(root.textContent).toMatch(/nothing is stored/);
  });
});

describe('provider mapbox (combobox)', () => {
  it('has the combobox attributes, opens ≤5 suggestions after the debounce with the attribution and a live count', async () => {
    const suggester = vi.fn(async () => [S('1000 N Main St, Santa Ana, CA 92701'), S('1000 N Main St, Santa Monica, CA 90401')]);
    await act(() => { render(h(AddressForm, { provider: 'mapbox', suggester, timings: TIMINGS }), root); });
    const el = input();
    expect(el.getAttribute('role')).toBe('combobox');
    expect(el.getAttribute('autocomplete')).toBe('off');
    expect(el.getAttribute('aria-expanded')).toBe('false');
    expect(el.getAttribute('aria-controls')).toBe('address-suggestions');
    expect(el.getAttribute('aria-autocomplete')).toBe('list');
    await type('1000 N Main St, Santa');
    expect(suggester).not.toHaveBeenCalled();
    await wait(40);
    expect(suggester).toHaveBeenCalledTimes(1);
    expect(suggester.mock.calls[0][0]).toBe('1000 N Main St, Santa');
    expect(el.getAttribute('aria-expanded')).toBe('true');
    expect(options()).toEqual(['1000 N Main St, Santa Ana, CA 92701', '1000 N Main St, Santa Monica, CA 90401']);
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toMatch(/^2 suggestions available/);
    const attribution = root.querySelector('a[href="https://www.mapbox.com/about/maps/"]');
    expect(attribution?.textContent).toBe('© Mapbox');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires no request for a bare ZIP or two characters and closes the list', async () => {
    const suggester = vi.fn(async () => [S('a')]);
    await act(() => { render(h(AddressForm, { provider: 'mapbox', suggester, timings: TIMINGS }), root); });
    await type('100'); await wait(40);
    expect(listbox()).not.toBeNull();
    await type('92701'); await wait(40);
    expect(listbox()).toBeNull();
    await type('12'); await wait(40);
    expect(suggester).toHaveBeenCalledTimes(1);
  });

  it('keyboard: ArrowDown highlights, Enter picks (fills the field, closes the list, starts the device route), Escape closes', async () => {
    const suggester = vi.fn(async () => [S('1000 N Main St, Santa Ana, CA 92701'), S('1000 N Main St, Santa Monica, CA 90401')]);
    await act(() => { render(h(AddressForm, { provider: 'mapbox', suggester, timings: TIMINGS }), root); });
    await type('1000 N Main St, Santa'); await wait(40);
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
    await key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe('address-option-0');
    expect(root.querySelector('#address-option-0')?.getAttribute('aria-selected')).toBe('true');
    await key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe('address-option-1');
    await key('Enter');
    expect(input().value).toBe('1000 N Main St, Santa Monica, CA 90401');
    expect(listbox()).toBeNull();
    expect(input().getAttribute('aria-expanded')).toBe('false');
    await wait(40);
    expect(suggester).toHaveBeenCalledTimes(1); // filling the field is not an edit
    // §3: the pick asked for the state file (404 here, so it fell through to the Census path with the label).
    expect(bodies()).toEqual([['/districts/CA.json', null], ['/api/route', { address: '1000 N Main St, Santa Monica, CA 90401' }]]);
    await type('1000 N Main St, Santa'); await wait(40);
    expect(listbox()).not.toBeNull();
    await key('Escape');
    expect(listbox()).toBeNull();
  });

  it('a failed or timed-out request closes the list silently and a free-text submit still posts', async () => {
    const suggester = vi.fn(async (q: string) => { if (q.endsWith('!')) throw new Error('429'); return new Promise<Suggestion[]>(() => {}); });
    await act(() => { render(h(AddressForm, { provider: 'mapbox', suggester, timings: TIMINGS }), root); });
    await type('1000 N Main St!'); await wait(40);
    expect(listbox()).toBeNull();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    await type('1000 N Main St'); await wait(40 + 70);
    expect(listbox()).toBeNull();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    await act(() => { (root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await wait(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ address: '1000 N Main St' });
  });
});

describe('picking (§3) and the unresolved copy (§4)', () => {
  let assign: ReturnType<typeof vi.fn>;
  const serve = (routeStatus = 200, routeBody: unknown = ROUTE_OK) => vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/districts/CA.json') return new Response(CA_JSON, { status: 200, headers: { 'content-type': 'application/json' } });
    if (url === '/api/route' && init?.method === 'POST') return new Response(JSON.stringify(routeBody), { status: routeStatus });
    throw new Error(`unexpected request ${url}`);
  });
  beforeEach(() => {
    assign = vi.fn();
    vi.stubGlobal('location', { assign, replace: vi.fn(), pathname: '/' });
  });

  it('a tap on a suggestion loads only its state file, posts {state, district, by_suggestion} and goes to /results', async () => {
    fetchMock = serve(); vi.stubGlobal('fetch', fetchMock);
    const suggester = vi.fn(async () => [SACRAMENTO, S('1000 N Main St, Santa Ana, CA 92701')]);
    await act(() => { render(h(AddressForm, { provider: 'geoapify', suggester, timings: TIMINGS }), root); });
    await type('1000 N Main St, Sac'); await wait(40);
    await click(root.querySelector('#address-option-0'));
    expect(input().value).toBe(SACRAMENTO.label);
    expect(listbox()).toBeNull();
    await wait(150);
    expect(bodies()).toEqual([['/districts/CA.json', null], ['/api/route', { state: 'CA', district: 7, by_suggestion: true }]]);
    for (const [url, body] of bodies()) { expect(url).not.toMatch(/Sacramento|95814|-121|38\.5/); expect(JSON.stringify(body)).not.toMatch(/Sacramento|95814|-121|38\.5/); }
    expect(assign).toHaveBeenCalledWith('/results');
    expect(JSON.parse(localStorage.getItem('cut-ties:place') ?? 'null')).toEqual({ state: 'CA', district: 7 });
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('a suggestion whose point lies in no district of its state falls through to the Census path with the label', async () => {
    fetchMock = serve(); vi.stubGlobal('fetch', fetchMock);
    const offshore: Suggestion = { label: '1 Pier Rd, Nowhere, CA 90000', state: 'CA', lon: -130, lat: 30 };
    const suggester = vi.fn(async () => [offshore]);
    await act(() => { render(h(AddressForm, { provider: 'geoapify', suggester, timings: TIMINGS }), root); });
    await type('1 Pier Rd'); await wait(40);
    await key('ArrowDown'); await key('Enter');
    await wait(150);
    expect(bodies()).toEqual([['/districts/CA.json', null], ['/api/route', { address: '1 Pier Rd, Nowhere, CA 90000' }]]);
    expect(assign).toHaveBeenCalledWith('/results');
  });

  it('an unresolved free-text submit names the suggestions when a provider is set, and keeps the Worker text under none', async () => {
    fetchMock = serve(404, { error: 'unresolved', message: 'We could not place that address. Check it and retry, or pick your state and district.' });
    vi.stubGlobal('fetch', fetchMock);
    const submit = () => act(() => { (root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await act(() => { render(h(AddressForm, { provider: 'geoapify', suggester: vi.fn(async () => []), timings: TIMINGS }), root); });
    await type('1000 N Main St, Santa Ana, CA'); await submit(); await wait(20);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(UNRESOLVED_WITH_SUGGESTIONS);
    expect(root.querySelector('#state')).not.toBeNull(); // the picker still opens
    expect(bodies()).toEqual([['/api/route', { address: '1000 N Main St, Santa Ana, CA' }]]);

    render(null, root);
    await act(() => { render(h(AddressForm, {}), root); });
    await type('1000 N Main St, Santa Ana, CA'); await submit(); await wait(20);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('We could not place that address. Check it and retry, or pick your state and district.');
  });
});
