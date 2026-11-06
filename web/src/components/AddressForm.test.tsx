// @vitest-environment happy-dom
// address-autocomplete §1: the landing field is a combobox only when a provider is set; the list opens
// after a debounced request, keyboard picks fill the field, failures stay silent, and `none` renders
// today's field. Rendered with preact under happy-dom; the provider call is a spy.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import AddressForm from './AddressForm';
import type { Suggestion } from '../lib/suggest';

const S = (label: string): Suggestion => ({ label, state: 'CA', lon: -117.86, lat: 33.75 });
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
  localStorage.clear(); sessionStorage.clear();
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

  it('keyboard: ArrowDown highlights, Enter fills the field without submitting, Escape closes', async () => {
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
    expect(fetchMock).not.toHaveBeenCalled(); // the pick is not a submit
    await wait(40);
    expect(suggester).toHaveBeenCalledTimes(1); // filling the field is not an edit
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
