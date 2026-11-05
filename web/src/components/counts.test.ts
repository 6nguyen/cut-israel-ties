// @vitest-environment happy-dom
// district-counters §2: the counter line's grammar and the island's "nothing until the response" rule.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import Counts, { counterLine, type CountsResponse } from './Counts';

const zero = { calls: 0, letters: 0, comments: 0, captain_lists: 0 };
const resp = (district: Partial<typeof zero>, state: Partial<typeof zero> = {}): CountsResponse => ({ district: { ...zero, ...district }, state: { ...zero, ...state }, since: '2026-10-28T12:00:00Z' });
let root: HTMLElement;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root); });
afterEach(() => { render(null, root); root.remove(); vi.unstubAllGlobals(); });

describe('counterLine (§2.1)', () => {
  it('prefers the district, names the largest bucket, falls back to the state, else nothing', () => {
    expect(counterLine(resp({ calls: 12 }, { calls: 40 }), 'TX', 35)).toBe('12 constituents in TX-35 called this week');
    expect(counterLine(resp({ calls: 5, letters: 9 }), 'CA', 46)).toBe('9 constituents in CA-46 wrote this week');
    expect(counterLine(resp({ comments: 6 }), 'VT', 0)).toBe('6 constituents in VT at large commented this week');
    expect(counterLine(resp({ captain_lists: 7 }), 'NY', 12)).toBe('7 constituents in NY-12 organised this week');
    expect(counterLine(resp({}, { calls: 8 }), 'TX', 35)).toBe('8 constituents in Texas called this week');
    expect(counterLine(resp({ calls: 9 }, { calls: 9 }), 'TX', null)).toBe('9 constituents in Texas called this week');
    expect(counterLine(resp({}), 'TX', 35)).toBeNull();
  });
  it('ties go to the earlier bucket: calls, letters, comments, captain lists', () => {
    expect(counterLine(resp({ letters: 5, captain_lists: 5 }), 'TX', 35)).toMatch(/wrote/);
  });
});

describe('<Counts> (§2.3)', () => {
  it('renders nothing before the response, the line after it, nothing on an empty or failed response', async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    act(() => { render(h(Counts, { goal: 'ndaa-1217', state: 'TX', district: 35 }), root); });
    await flush();
    expect(root.textContent).toBe('');
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/counts?goal=ndaa-1217&state=TX&district=35');
    resolve(new Response(JSON.stringify(resp({ calls: 12 })), { status: 200 }));
    await flush();
    expect(root.querySelector('[data-counts]')?.textContent).toBe('12 constituents in TX-35 called this week');
    render(null, root);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(resp({})), { status: 200 })));
    act(() => { render(h(Counts, { goal: 'ndaa-1217', state: 'TX', district: null }), root); });
    await flush();
    expect(root.textContent).toBe('');
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/counts?goal=ndaa-1217&state=TX');
    render(null, root);

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"no_goal"}', { status: 404 })));
    act(() => { render(h(Counts, { goal: 'nope', state: 'TX', district: 35 }), root); });
    await flush();
    expect(root.textContent).toBe('');
    expect(root.textContent).not.toContain('0');
  });
});
