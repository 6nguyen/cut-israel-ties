// address-autocomplete §1: the flag, the request gate and the debounce/abort loop under fake timers.
// §2 adds the provider adapters below.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredProvider, shouldSuggest, stepHighlight, suggest, suggestLoop } from './suggest';
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

describe('suggest without an adapter (§1)', () => {
  it('yields nothing for none and for a provider whose adapter is not built yet', async () => {
    const c = new AbortController();
    expect(await suggest('1000 N Main', c.signal, 'none', 'k')).toEqual([]);
    expect(await suggest('1000 N Main', c.signal, 'mapbox', undefined)).toEqual([]);
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
