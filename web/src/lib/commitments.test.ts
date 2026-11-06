// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { addCommitment, CAPTAIN_KEY, ceilingFor, clearFunnel, COMMIT_KEY, commitmentFor, defaultDue, hasOpenItems, loadCaptain, loadCommitments, logReceipt, maxDue, receiptedTargets, receiptLine, recentReceipts, retryDue, retryFor, saveCaptain, validName } from './commitments';

const people = (names: string[]) => names.map((name) => ({ name, channel: 'text' as const, done: false }));

describe('captain names (§1.3)', () => {
  it('accepts first names, refuses digits, @ and anything over 20 chars', () => {
    for (const ok of ['Maya', 'José', "O'Neil", 'Mary Ann', 'Anne-Marie']) expect(validName(ok)).toBe(true);
    for (const bad of ['', '  ', 'Maya 555', '5551234567', 'maya@example.com', '@maya', 'a'.repeat(21), 'Bob;drop', 42, null]) expect(validName(bad)).toBe(false);
  });
  it('never stores a list with an invalid name', () => {
    localStorage.clear();
    saveCaptain({ v: 1, goal: 'g', due: new Date().toISOString(), people: people(['Ana', 'Ben', '555-0100']) });
    expect(loadCaptain()).toBeNull();
    saveCaptain({ v: 1, goal: 'g', due: new Date().toISOString(), people: people(['Ana', 'Ben', 'Cy']) });
    expect(loadCaptain()?.people.map((p) => p.name)).toEqual(['Ana', 'Ben', 'Cy']);
    expect(JSON.parse(localStorage.getItem(CAPTAIN_KEY)!).v).toBe(1);
  });
});

describe('default deadline (call-follow-through §2)', () => {
  const at = (s: string) => new Date(s);
  it('is the next weekday at 10:00 local', () => {
    const tue = defaultDue(at('2026-11-03T09:00:00'), null); // Tuesday → Wednesday
    expect([tue.getDay(), tue.getHours(), tue.getMinutes()]).toEqual([3, 10, 0]);
    const fri = defaultDue(at('2026-11-06T18:30:00'), null); // Friday → Monday
    expect([fri.getDay(), fri.getDate(), fri.getHours()]).toEqual([1, 9, 10]);
    const sat = defaultDue(at('2026-11-07T10:00:00'), null); // Saturday → Monday
    expect([sat.getDay(), sat.getDate()]).toEqual([1, 9]);
  });
  it('never passes the goal decision date', () => {
    const d = defaultDue(at('2026-11-06T09:00:00'), '2026-11-07'); // Friday, vote Saturday
    expect(d.getTime()).toBe(ceilingFor('2026-11-07')!.getTime());
    expect(ceilingFor('2026-11-07')!.getHours()).toBe(10);
    expect(defaultDue(at('2026-11-03T09:00:00'), '2026-12-10').getDate()).toBe(4);
    expect(defaultDue(at('2026-11-03T09:00:00'), '').getDate()).toBe(4);
  });
  it('caps the editable date at seven days, or the vote, or the whole window for a repeat call', () => {
    const now = at('2026-11-03T09:00:00');
    expect(maxDue(now, null, false).getDate()).toBe(10);
    expect(maxDue(now, '2026-11-05', false).getDate()).toBe(5);
    expect(maxDue(now, '2026-12-10', false).getDate()).toBe(10);
    expect(maxDue(now, '2026-12-10', true).getMonth()).toBe(11);
  });
});

describe('local schema and open items (§1.2, §2.1)', () => {
  beforeEach(() => localStorage.clear());
  it('stores versioned commitments, one per goal, and clears all on start over', () => {
    addCommitment({ goal: 'g', action: 'g-call', target: 'X1', due: '2026-11-04T17:00:00.000Z' });
    addCommitment({ goal: 'g', action: 'g-call', target: 'X1', due: '2026-11-05T17:00:00.000Z' });
    expect(loadCommitments()).toEqual([{ v: 1, goal: 'g', action: 'g-call', target: 'X1', due: '2026-11-05T17:00:00.000Z' }]);
    expect(hasOpenItems()).toBe(true);
    clearFunnel();
    expect(localStorage.getItem(COMMIT_KEY)).toBeNull();
    expect(hasOpenItems()).toBe(false);
  });
  it('a retry is one per goal and target, sits beside the call commitment and is due at an open slot ≥60 min ahead (call-follow-through §1)', () => {
    addCommitment({ goal: 'g', action: 'g-call', target: 'X1', due: '2026-11-05T15:00:00.000Z' });
    addCommitment({ goal: 'g', action: 'g-call', target: 'X1', due: '2026-11-05T16:00:00.000Z', kind: 'retry', who: 'Sen. One' });
    addCommitment({ goal: 'g', action: 'g-call', target: 'X1', due: '2026-11-05T17:00:00.000Z', kind: 'retry', who: 'Sen. One' });
    addCommitment({ goal: 'g', action: 'g-call', target: 'X2', due: '2026-11-05T17:00:00.000Z', kind: 'retry', who: 'Sen. Two' });
    expect(loadCommitments().map((c) => [c.kind ?? 'call', c.target, c.due])).toEqual([['call', 'X1', '2026-11-05T15:00:00.000Z'], ['retry', 'X1', '2026-11-05T17:00:00.000Z'], ['retry', 'X2', '2026-11-05T17:00:00.000Z']]);
    expect(commitmentFor('g')?.due).toBe('2026-11-05T15:00:00.000Z');
    expect(retryFor('g', 'X1')?.who).toBe('Sen. One');
    expect(retryFor('g', 'X3')).toBeNull();
    addCommitment({ goal: 'g', action: 'g-call', target: 'X1', due: '2026-11-06T15:00:00.000Z' }); // a new call commitment keeps the retries
    expect(loadCommitments()).toHaveLength(3);
    // Mon 2026-11-02 16:30 EST → 17:30 EST, still open; Mon 17:30 EST → next slot Tue 09:00 EST; Hawaii 10:00 HST (15:00 EST) → 16:00 EST.
    expect(retryDue(new Date('2026-11-02T21:30:00Z')).toISOString()).toBe('2026-11-02T22:30:00.000Z');
    expect(retryDue(new Date('2026-11-02T22:30:00Z')).toISOString()).toBe('2026-11-03T14:00:00.000Z');
    expect(retryDue(new Date('2026-11-02T20:00:00Z')).toISOString()).toBe('2026-11-02T21:00:00.000Z');
  });
  it('a receipted list is no longer open', () => {
    saveCaptain({ v: 1, goal: 'g', due: '2026-11-05T17:00:00.000Z', people: people(['Ana', 'Ben', 'Cy']) });
    expect(hasOpenItems()).toBe(true);
    saveCaptain({ v: 1, goal: 'g', due: '2026-11-05T17:00:00.000Z', people: people(['Ana', 'Ben', 'Cy']), receipted: true });
    expect(hasOpenItems()).toBe(false);
  });
  it('the receipt line names a district, an official and a date, never a person', () => {
    const line = receiptLine('TX-35', 'Casar', '2026-11-07T23:00:00.000Z');
    expect(line).toMatch(/^Three of us in TX-35 are calling Casar before Nov \d+\. Who's next\?$/);
  });
});

describe('local receipt log (call-follow-through §3)', () => {
  it('keeps one row per goal, action and target for 24 h and is cleared with the funnel', () => {
    const t0 = new Date('2026-11-02T15:00:00Z');
    logReceipt({ goal: 'g', action: 'a', target: 'X' }, t0);
    logReceipt({ goal: 'g', action: 'a', target: 'X' }, new Date(t0.getTime() + 60_000)); // same target: replaced, not doubled
    logReceipt({ goal: 'g', action: 'a', target: 'Y' }, t0);
    expect(recentReceipts(t0).map((r) => r.target)).toEqual(['X', 'Y']);
    expect(receiptedTargets('g', 'a', new Date(t0.getTime() + 23 * 60 * 60_000))).toEqual(new Set(['X', 'Y']));
    expect(receiptedTargets('g', 'a', new Date(t0.getTime() + 24 * 60 * 60_000))).toEqual(new Set(['X'])); // Y is a day old, X a minute younger
    expect(receiptedTargets('g', 'other', t0).size).toBe(0);
    clearFunnel();
    expect(recentReceipts(t0)).toEqual([]);
    expect(localStorage.getItem('cut-ties:receipts')).toBeNull();
  });
});
