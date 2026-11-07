// @vitest-environment happy-dom
// urgency-and-readability §4: every digit is arithmetic on the target; the island ticks once a second.
import { h, render as mount } from 'preact';
import { render } from 'preact-render-to-string';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Countdown, { monthDay, partsLeft, targetOf, zonedTime } from './Countdown';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const ahead = (d: number, hh = 0, mm = 0, ss = 0) => NOW + ((d * 24 + hh) * 3600 + mm * 60 + ss) * 1000;
const parts = (out: string) => [...out.matchAll(/data-part="([dhms])">(\d+)</g)].map((m) => m[2]).join(' ');

describe('targetOf / zonedTime', () => {
  it('decision_at wins and parses with its offset; decision_date alone targets 09:00 New York (EST and EDT)', () => {
    expect(targetOf('2026-11-18T09:00:00-05:00', '2026-11-18')).toBe(Date.parse('2026-11-18T14:00:00Z'));
    expect(targetOf(null, '2026-11-18')).toBe(Date.parse('2026-11-18T14:00:00Z')); // EST, UTC−5
    expect(targetOf(null, '2027-07-01')).toBe(Date.parse('2027-07-01T13:00:00Z')); // EDT, UTC−4
    expect(zonedTime('2026-11-18', 9, 'UTC')).toBe(Date.parse('2026-11-18T09:00:00Z'));
  });
  it('empty, null and malformed inputs have no target', () => {
    expect(targetOf(null, null)).toBeNull();
    expect(targetOf('', '')).toBeNull();
    expect(targetOf(undefined, undefined)).toBeNull();
    expect(targetOf('garbage', '2026-11-18')).toBeNull();
    expect(targetOf(null, '18/11/2026')).toBeNull();
  });
  it('monthDay names the New York calendar day', () => {
    expect(monthDay('2026-11-18T09:00:00-05:00', null)).toBe('Nov 18');
    expect(monthDay(null, '2027-01-05')).toBe('Jan 5');
    expect(monthDay('2026-11-19T01:30:00+01:00', null)).toBe('Nov 18'); // 00:30 UTC = 19:30 the day before in New York
  });
});

describe('partsLeft', () => {
  it('splits the seconds left into DD HH MM SS with two digits each', () => {
    expect(partsLeft(ahead(12, 3, 4, 5), NOW)).toEqual({ d: '12', h: '03', m: '04', s: '05' });
    expect(partsLeft(ahead(0, 0, 0, 59), NOW)).toEqual({ d: '00', h: '00', m: '00', s: '59' });
  });
  it('shows three digits past 99 days and never goes negative', () => {
    expect(partsLeft(ahead(120), NOW).d).toBe('120');
    expect(partsLeft(NOW - 5000, NOW)).toEqual({ d: '00', h: '00', m: '00', s: '00' });
  });
});

describe('<Countdown> server render', () => {
  const at = new Date(ahead(12, 3, 4, 5)).toISOString();
  it('renders 12 03 04 05 and "Expected <Mon d>" for an unconfirmed target', () => {
    const out = render(h(Countdown, { at, confirmed: false, id: 't', now: NOW }));
    expect(parts(out)).toBe('12 03 04 05');
    expect(out).toContain('Expected Nov 18');
    expect(out).not.toContain('Decides');
    expect(out).toContain('data-countdown="t"');
    expect(out).toContain('url(#stamp-grain-t)');
    expect(out).toContain('feTurbulence');
    expect(out).toContain('border-dashed');
  });
  it('says "Decides" when confirmed and names the title on the page-wide stamp', () => {
    const out = render(h(Countdown, { at, confirmed: true, title: 'Kick out Hakeem Jeffries', size: 'lg', id: 'page', now: NOW }));
    expect(out).toContain('Countdown · Kick out Hakeem Jeffries · Decides Nov 18');
    expect(out).toContain('text-[56px]');
  });
  it('a decision_date alone counts to 09:00 New York that day', () => {
    const out = render(h(Countdown, { date: '2026-11-18', id: 'd', now: Date.parse('2026-11-06T14:00:00Z') }));
    expect(parts(out)).toBe('12 00 00 00');
    expect(out).toContain('Expected Nov 18');
  });
  it('renders nothing for a past, empty or malformed target; three digits past 99 days', () => {
    expect(render(h(Countdown, { at: '2026-11-01T09:00:00-05:00', id: 'p', now: NOW }))).toBe('');
    expect(render(h(Countdown, { date: '', at: null, id: 'e', now: NOW }))).toBe('');
    expect(render(h(Countdown, { at: 'soon', id: 'm', now: NOW }))).toBe('');
    expect(parts(render(h(Countdown, { at: new Date(ahead(120)).toISOString(), id: 'far', now: NOW })))).toBe('120 00 00 00');
  });
});

describe('<Countdown> island', () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });
  const digits = (root: Element) => [...root.querySelectorAll('[data-part]')].map((e) => e.textContent).join(' ');
  // Preact schedules effects after paint; two seconds of fake time settle the mount before the assertions start.
  const SETTLE = 2000;
  it('re-renders once a second from the browser clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const root = document.createElement('div');
    document.body.appendChild(root);
    mount(h(Countdown, { at: new Date(ahead(12, 3, 4, 5)).toISOString(), id: 'live' }), root);
    expect(digits(root)).toBe('12 03 04 05');
    await vi.advanceTimersByTimeAsync(SETTLE);
    expect(digits(root)).toBe('12 03 04 03');
    await vi.advanceTimersByTimeAsync(1000);
    expect(digits(root)).toBe('12 03 04 02');
    await vi.advanceTimersByTimeAsync(2000);
    expect(digits(root)).toBe('12 03 04 00');
    await vi.advanceTimersByTimeAsync(1000);
    expect(digits(root)).toBe('12 03 03 59');
  });
  it('under prefers-reduced-motion it drops the seconds group and ticks once a minute', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia;
    const root = document.createElement('div');
    document.body.appendChild(root);
    mount(h(Countdown, { at: new Date(ahead(12, 3, 4, 5)).toISOString(), id: 'still' }), root);
    await vi.advanceTimersByTimeAsync(SETTLE);
    expect(digits(root)).toBe('12 03 04');
    await vi.advanceTimersByTimeAsync(50_000);
    expect(digits(root)).toBe('12 03 04');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(digits(root)).toBe('12 03 03');
    window.matchMedia = original;
  });
  it('renders nothing once the target passes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const root = document.createElement('div');
    document.body.appendChild(root);
    mount(h(Countdown, { at: new Date(NOW + 5000).toISOString(), id: 'end' }), root);
    expect(digits(root)).toBe('00 00 00 05');
    expect(root.querySelector('[data-countdown]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(SETTLE + 6000);
    expect(root.querySelector('[data-countdown]')).toBeNull();
    mount(null, root);
  });
});
