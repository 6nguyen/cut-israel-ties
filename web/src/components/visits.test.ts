// @vitest-environment happy-dom
// office-visits §2 on the member page: count shown from two, the contact appears only after "I'll come"
// stores a request, withdraw removes it; Your week lists the joined visit without a stored address.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import Visits from './Visits';
import YourWeek from './YourWeek';
import { loadVisits } from '../lib/commitments';
import { forgetVisits } from '../lib/visits';

let root: HTMLDivElement;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (sel: string) => act(() => { (root.querySelector(sel) as HTMLElement).click(); });
const CONTACT = 'https://signal.group/#abc';
const visit = (requests: number) => ({ id: 3, bioguide_id: 'C001110', office_city: 'Santa Ana', starts_at: '2099-11-10T10:00', ends_at: '2099-11-10T11:00', note: 'Flagpole', requests });

function api(listing: ReturnType<typeof visit> | null) {
  const calls: { url: string; method: string }[] = [];
  let requests = listing?.requests ?? 0;
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = init?.method ?? 'GET';
    calls.push({ url, method });
    if (url.startsWith('/api/visits?member=')) return Response.json({ visits: listing ? [{ ...listing, requests }] : [] });
    if (url === '/api/visits/3/request' && method === 'POST') { requests++; return Response.json({ ...listing, requests, contact_url: CONTACT }); }
    if (url === '/api/visits/3/request' && method === 'DELETE') { requests--; return Response.json({ ok: true }); }
    return new Response('nope', { status: 404 });
  });
  return { impl, calls };
}

beforeEach(() => { localStorage.clear(); forgetVisits(); root = document.createElement('div'); document.body.appendChild(root); });
afterEach(() => { render(null, root); root.remove(); vi.unstubAllGlobals(); });

describe('Visits island', () => {
  it('shows the line without a count below two, with it from two, and never the contact', async () => {
    const one = api(visit(1)); vi.stubGlobal('fetch', one.impl);
    await act(() => { render(h(Visits, { member: 'C001110', name: 'Lou Correa', city: null }), root); });
    await flush();
    expect(root.textContent).toContain('Visit Santa Ana on Nov 10');
    expect(root.textContent).not.toContain('others');
    expect(root.innerHTML).not.toContain(CONTACT);
    render(null, root); forgetVisits();
    const two = api(visit(2)); vi.stubGlobal('fetch', two.impl);
    await act(() => { render(h(Visits, { member: 'C001110', name: 'Lou Correa', city: null }), root); });
    await flush();
    expect(root.textContent).toContain('with 2 others');
    expect(root.querySelector('[data-contact]')).toBeNull();
  });

  it('"I\'ll come" stores the request, reveals the contact, and withdraw removes both', async () => {
    const a = api(visit(1)); vi.stubGlobal('fetch', a.impl);
    await act(() => { render(h(Visits, { member: 'C001110', name: 'Lou Correa', city: null }), root); });
    await flush();
    await click('button.btn-primary');
    await flush(); await flush();
    expect(a.calls.some((c) => c.url === '/api/visits/3/request' && c.method === 'POST')).toBe(true);
    const body = JSON.parse(String(a.impl.mock.calls.find((c) => c[1]?.method === 'POST')![1]!.body)) as { device: string };
    expect(body.device.length).toBeGreaterThanOrEqual(8);
    expect((root.querySelector('[data-contact]') as HTMLAnchorElement).href).toContain(CONTACT);
    expect(root.textContent).toContain('with 2 others');
    expect(loadVisits()[0]).toMatchObject({ id: 3, contact_url: CONTACT, name: 'Lou Correa' });

    await act(() => { ([...root.querySelectorAll('button')].find((b) => b.textContent === 'Withdraw') as HTMLElement).click(); });
    await flush(); await flush();
    expect(a.calls.some((c) => c.url === '/api/visits/3/request' && c.method === 'DELETE')).toBe(true);
    expect(loadVisits()).toEqual([]);
    expect(root.querySelector('[data-contact]')).toBeNull();
  });

  it('with no listing: the empty line, the partner link and the form behind "Organise one"', async () => {
    const none = api(null); vi.stubGlobal('fetch', none.impl);
    await act(() => { render(h(Visits, { member: 'C001110', name: 'Lou Correa', city: null, partner: 'https://partner.example/' }), root); });
    await flush();
    expect(root.querySelector('[data-empty]')?.textContent).toContain('No visit listed yet');
    expect((root.querySelector('[data-empty] a') as HTMLAnchorElement).href).toBe('https://partner.example/');
    expect(root.querySelector('[data-visit-form]')).toBeNull();
    await click('[data-empty] button');
    expect(root.querySelector('[data-visit-form]')).not.toBeNull();
    expect(root.querySelector('[data-visit-form]')?.textContent).toContain('never a phone or email');
  });
});

describe('Your week', () => {
  it('lists a joined visit with its contact and withdraw, even with no address stored', async () => {
    const a = api(visit(2)); vi.stubGlobal('fetch', a.impl);
    localStorage.setItem('cut-ties:visits', JSON.stringify([{ v: 1, id: 3, member: 'C001110', name: 'Lou Correa', city: 'Santa Ana', starts_at: '2099-11-10T10:00', ends_at: '2099-11-10T11:00', contact_url: CONTACT }]));
    await act(() => { render(h(YourWeek, { goals: [] }), root); });
    await flush();
    expect(root.querySelector('[data-joined-visit="3"]')).not.toBeNull();
    expect((root.querySelector('[data-contact]') as HTMLAnchorElement).href).toContain(CONTACT);
    await act(() => { ([...root.querySelectorAll('button')].find((b) => b.textContent === 'Withdraw') as HTMLElement).click(); });
    await flush(); await flush();
    expect(loadVisits()).toEqual([]);
    expect(root.querySelector('[data-joined-visit]')).toBeNull();
  });
});
