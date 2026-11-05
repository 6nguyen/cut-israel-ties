import { describe, expect, it } from 'vitest';
import { buildIcs, fold, icsText } from './ics';

/** A small RFC 5545 reader: CRLF lines, unfolds continuation lines, splits NAME[;params]:VALUE. */
function parse(ics: string): { name: string; value: string }[] {
  expect(ics.endsWith('\r\n')).toBe(true);
  const raw = ics.slice(0, -2).split('\r\n');
  for (const l of raw) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  const lines: string[] = [];
  for (const l of raw) { if (/^[ \t]/.test(l)) lines[lines.length - 1] += l.slice(1); else lines.push(l); }
  return lines.map((l) => { const m = /^([A-Z-]+)(?:;[^:]*)?:(.*)$/.exec(l); expect(m, l).toBeTruthy(); return { name: m![1], value: m![2] }; });
}

describe('.ics reminder (§1.4)', () => {
  const ics = buildIcs({ uid: 'ndaa-1217-1@cut-the-ties', start: new Date('2026-11-05T23:00:00Z'), stamp: new Date('2026-11-04T12:00:00Z'), title: 'Call about: Strip the integration section, which is a long title; really long, with commas', url: 'https://cut-the-ties.example/goals/ndaa-1217' });
  const props = parse(ics);
  const get = (n: string) => props.filter((p) => p.name === n).map((p) => p.value);

  it('has the required components and properties in order', () => {
    const names = props.map((p) => p.name);
    expect(names[0]).toBe('BEGIN'); expect(props[0].value).toBe('VCALENDAR');
    expect(names.at(-1)).toBe('END'); expect(props.at(-1)!.value).toBe('VCALENDAR');
    expect(get('VERSION')).toEqual(['2.0']);
    expect(get('PRODID')).toHaveLength(1);
    const begins = props.filter((p) => p.name === 'BEGIN').map((p) => p.value);
    const ends = props.filter((p) => p.name === 'END').map((p) => p.value);
    expect(begins).toEqual(['VCALENDAR', 'VEVENT', 'VALARM']);
    expect(ends).toEqual(['VALARM', 'VEVENT', 'VCALENDAR']);
    for (const n of ['UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'SUMMARY', 'URL']) expect(get(n), n).toHaveLength(1);
    expect(get('DTSTART')[0]).toBe('20261105T230000Z');
    expect(get('DTSTAMP')[0]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(get('URL')[0]).toBe('https://cut-the-ties.example/goals/ndaa-1217');
  });
  it('escapes text and folds long lines without losing characters', () => {
    expect(get('SUMMARY')[0]).toContain('title\\; really long\\, with commas');
    expect(icsText('a,b;c\nd\\e')).toBe('a\\,b\\;c\\nd\\\\e');
    const long = 'SUMMARY:' + 'é'.repeat(100);
    const folded = fold(long);
    expect(folded.length).toBeGreaterThan(1);
    expect(folded.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
    for (const l of folded) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
  it('carries no name: only the title, the time and the goal link', () => {
    expect(ics).not.toMatch(/people|ATTENDEE|ORGANIZER|Ana|Ben/);
  });
});
