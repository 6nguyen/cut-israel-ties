// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { CAPTAIN_KEY, COMMIT_KEY, addCommitment, ceilingFor, clearFunnel, defaultDue, hasOpenItems, loadCaptain, loadCommitments, maxDue, receiptLine, saveCaptain, validName } from './commitments';

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
