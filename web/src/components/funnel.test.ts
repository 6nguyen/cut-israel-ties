// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import Funnel, { Retry } from './Funnel';
import YourWeek from './YourWeek';
import { CAPTAIN_KEY, COMMIT_KEY, loadCaptain, loadCommitments } from '../lib/commitments';

const PLACE = { state: 'TX', district: 35 };
const GOALS = [
  { slug: 'ndaa-1217', title: 'Strip the section', status: 'active' as const, decision_date: '2026-12-10', outcome_note: null },
  { slug: 'old-vote', title: 'The old vote', status: 'completed' as const, decision_date: '2026-10-01', outcome_note: 'Passed 218–210' },
];
let root: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (sel: string) => act(() => { (root.querySelector(sel) as HTMLElement).click(); });
const type = (sel: string, value: string) => act(() => { const el = root.querySelector(sel) as HTMLInputElement; el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); });

beforeEach(() => {
  localStorage.clear();
  root = document.createElement('div'); document.body.appendChild(root);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 7 }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { render(null, root); root.remove(); vi.unstubAllGlobals(); });

describe('Funnel after a receipt (§1)', () => {
  const props = { goal: 'ndaa-1217', action: 'ndaa-1217-call', target: 'C001110', who: 'Correa', title: 'Strip the section', type: 'letter' as const, decision: '2026-12-10', place: PLACE };
  it('asks for the commitment first, then the three names; Share waits for the parent', async () => {
    const onFinished = vi.fn();
    await act(() => { render(h(Funnel, { ...props, onFinished }), root); });
    expect(root.textContent).toMatch(/Will you call by/);
    expect(root.textContent).not.toMatch(/Share/);
    expect(root.querySelector('[data-step="captains"]')).toBeNull();
    await click('button.btn-primary');
    expect(loadCommitments()).toMatchObject([{ v: 1, goal: 'ndaa-1217', action: 'ndaa-1217-call', target: 'C001110' }]);
    expect(root.textContent).toMatch(/Name three people in TX-35/);
    expect(onFinished).not.toHaveBeenCalled();
    await type('#captain-0', 'Ana'); await type('#captain-1', 'Ben 555'); await type('#captain-2', 'Cy');
    expect(root.textContent).toMatch(/no numbers or @/);
    expect((root.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    await type('#captain-1', 'ben@x.io');
    expect((root.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(localStorage.getItem(CAPTAIN_KEY)).toBeNull();
    await type('#captain-1', 'Ben');
    await act(() => { (root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(loadCaptain()).toMatchObject({ v: 1, goal: 'ndaa-1217', who: 'Correa', people: [{ name: 'Ana', done: false }, { name: 'Ben', done: false }, { name: 'Cy', done: false }] });
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(root.textContent).toMatch(/Add reminder/);
    expect(root.textContent).toMatch(/Copy a message/);
    expect(fetchMock).not.toHaveBeenCalled(); // nothing left the device
  });
  it('skipping either step is one tap and stores nothing', async () => {
    const onFinished = vi.fn();
    await act(() => { render(h(Funnel, { ...props, type: 'call', onFinished }), root); });
    expect(root.textContent).toMatch(/Will you call again before the vote\?/);
    await click('button.btn-ghost');
    await click('button.btn-ghost');
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(COMMIT_KEY)).toBeNull();
    expect(localStorage.getItem(CAPTAIN_KEY)).toBeNull();
  });
});

describe('Retry after no_answer (call-follow-through §1)', () => {
  const props = { goal: 'ndaa-1217', action: 'ndaa-1217-call', target: 'C001110', who: 'Rep. Correa', title: 'Strip the section' };
  it('shows the voicemail line; one tap stores one retry due at an open slot ≥60 min ahead; a second tap has nothing to press; nothing posts', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-03T04:00:00Z'), toFake: ['Date'] }); // Mon 20:00 PST
    await act(() => { render(h(Retry, props), root); });
    expect(root.textContent).toMatch(/Voicemail counts\. Offices tally messages daily; say your street address so yours is logged\./);
    expect(root.textContent).not.toMatch(/Add reminder/);
    await act(() => { [...root.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!.click(); });
    const list = loadCommitments();
    expect(list).toEqual([{ v: 1, goal: 'ndaa-1217', action: 'ndaa-1217-call', target: 'C001110', kind: 'retry', who: 'Rep. Correa', due: '2026-11-03T14:00:00.000Z' }]);
    expect(Date.parse(list[0].due) - Date.now()).toBeGreaterThanOrEqual(60 * 60_000);
    expect([...root.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Add reminder (.ics)']);
    expect(root.querySelector('[data-retry-due]')?.textContent).toMatch(/^Try Rep\. Correa again by /);
    render(null, root);
    await act(() => { render(h(Retry, props), root); }); // a remount finds the open retry and offers no second one
    expect(loadCommitments()).toHaveLength(1);
    expect([...root.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Add reminder (.ics)']);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('YourWeek (§2, §3)', () => {
  const list = (done: boolean[], due = '2099-01-01T17:00:00.000Z') => ({ v: 1, goal: 'ndaa-1217', due, who: 'Casar', people: ['Ana', 'Ben', 'Cy'].map((name, i) => ({ name, channel: 'text', done: done[i] })) });
  const mount = () => act(() => { render(h(YourWeek, { goals: GOALS }), root); });

  it('renders nothing without a stored place or open items', async () => {
    await mount(); await flush();
    expect(root.querySelector('[data-your-week]')).toBeNull();
    localStorage.setItem('cut-ties:place', JSON.stringify(PLACE));
    render(null, root); await mount(); await flush();
    expect(root.querySelector('[data-your-week]')).toBeNull();
  });
  it('two ticks post nothing; the third posts one receipt with no target and no names, then offers Share', async () => {
    localStorage.setItem('cut-ties:place', JSON.stringify(PLACE));
    localStorage.setItem(CAPTAIN_KEY, JSON.stringify(list([false, false, false])));
    await mount(); await flush();
    expect(root.textContent).toMatch(/Your week/);
    expect(root.textContent).not.toMatch(/Share/);
    const boxes = () => [...root.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    await act(() => { boxes()[0].click(); }); await act(() => { boxes()[1].click(); }); await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(root.querySelector('[data-share]')).toBeNull();
    await act(() => { boxes()[2].click(); }); await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ goal: 'ndaa-1217', action: 'captain-list', state: 'TX', district: 35, device: expect.any(String) });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(/Ana|Ben|Cy|people/);
    expect(root.querySelector('[data-share]')?.textContent).toMatch(/Share/);
    expect(loadCaptain()?.receipted).toBe(true);
  });
  it('shows the open commitment, drops a closed goal with its outcome, keeps items on Change address and clears all on Start over', async () => {
    localStorage.setItem('cut-ties:place', JSON.stringify(PLACE));
    localStorage.setItem(COMMIT_KEY, JSON.stringify([
      { v: 1, goal: 'ndaa-1217', action: 'ndaa-1217-call', target: 'X', due: '2099-01-01T17:00:00.000Z' },
      { v: 1, goal: 'old-vote', action: 'old-vote-call', target: 'X', due: '2099-01-01T17:00:00.000Z' },
    ]));
    await mount(); await flush();
    expect(root.querySelectorAll('[data-commitment]')).toHaveLength(1);
    expect(root.querySelector('[data-outcome]')?.textContent).toBe('The old vote: Passed 218–210.');
    expect(loadCommitments().map((c) => c.goal)).toEqual(['ndaa-1217']);
    await click('button.underline'); // Change address (first underline button)
    expect(localStorage.getItem('cut-ties:place')).toBeNull();
    expect(loadCommitments()).toHaveLength(1);
    localStorage.setItem('cut-ties:place', JSON.stringify(PLACE));
    render(null, root); await mount(); await flush();
    await act(() => { [...root.querySelectorAll('button')].find((b) => b.textContent === 'Start over')!.click(); });
    expect(localStorage.getItem(COMMIT_KEY)).toBeNull();
    expect(localStorage.getItem('cut-ties:place')).toBeNull();
  });
  it('a retry shows "Try <office> again by <due>" with Done and Not yet, linked to the act page with the target', async () => {
    localStorage.setItem('cut-ties:place', JSON.stringify(PLACE));
    localStorage.setItem(COMMIT_KEY, JSON.stringify([
      { v: 1, goal: 'ndaa-1217', action: 'ndaa-1217-call', target: 'X', due: '2099-01-01T15:00:00.000Z' },
      { v: 1, goal: 'ndaa-1217', action: 'ndaa-1217-call', target: 'C001110', due: '2099-01-02T15:00:00.000Z', kind: 'retry', who: 'Rep. Correa' },
    ]));
    await mount(); await flush();
    const items = [...root.querySelectorAll('[data-commitment]')];
    expect(items).toHaveLength(2);
    const retry = root.querySelector('[data-kind="retry"]')!;
    expect(retry.textContent).toMatch(/^Try Rep\. Correa again about Strip the section by /);
    expect(retry.querySelector('a')?.getAttribute('href')).toBe('/goals/ndaa-1217/act/ndaa-1217-call?target=C001110');
    expect([...retry.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Done', 'Not yet']);
    await act(() => { (retry.querySelector('button') as HTMLButtonElement).click(); }); // Done removes the retry only
    expect(loadCommitments().map((c) => c.kind ?? 'call')).toEqual(['call']);
  });
  it('an overdue item asks "Still on?" with New date and Drop', async () => {
    localStorage.setItem('cut-ties:place', JSON.stringify(PLACE));
    localStorage.setItem(COMMIT_KEY, JSON.stringify([{ v: 1, goal: 'ndaa-1217', action: 'ndaa-1217-call', target: 'X', due: '2020-01-01T17:00:00.000Z' }]));
    await mount(); await flush();
    expect(root.querySelector('[data-commitment]')?.textContent).toMatch(/^Still on\?/);
    expect([...root.querySelectorAll('[data-commitment] button')].map((b) => b.textContent)).toEqual(['Done', 'New date', 'Drop']);
    await act(() => { [...root.querySelectorAll('button')].find((b) => b.textContent === 'Drop')!.click(); });
    expect(loadCommitments()).toEqual([]);
  });
});
