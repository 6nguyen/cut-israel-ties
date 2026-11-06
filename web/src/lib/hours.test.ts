// call-follow-through §2: office hours are fixed tables and Date/Intl arithmetic. Every fixture is an
// absolute instant so the suite is independent of the machine's zone (2026-11-02 is a Monday, after DST ended).
import { describe, expect, it } from 'vitest';
import { countUnparseable, hoursWarnings, isOpen, nextOpenSlot, openChip, parseHours, scheduleFor, zonedToUtc } from './hours';

const WEEK = [1, 2, 3, 4, 5];
const at = (s: string) => new Date(s);

describe('parseHours', () => {
  it('reads the listed formats', () => {
    expect(parseHours('Mon-Fri 9-5')).toEqual([{ days: WEEK, open: 540, close: 1020 }]);
    expect(parseHours('9:00 AM - 5:00 PM')).toEqual([{ days: WEEK, open: 540, close: 1020 }]);
    expect(parseHours('M-F 8am-4:30pm')).toEqual([{ days: WEEK, open: 480, close: 990 }]);
    expect(parseHours('Mon–Thu 8:30 AM–5:00 PM; Fri 9-12')).toEqual([{ days: [1, 2, 3, 4], open: 510, close: 1020 }, { days: [5], open: 540, close: 720 }]);
    expect(parseHours('Mon-Thu 9-5, Fri 9-12')).toHaveLength(2);
    expect(parseHours('9:00 AM - 5:00 PM, Monday through Friday')).toEqual([{ days: WEEK, open: 540, close: 1020 }]);
    expect(parseHours('Mon, Wed 10-6')).toEqual([{ days: [1, 3], open: 600, close: 1080 }]);
  });
  it('returns null for anything it cannot read', () => {
    for (const bad of ['call for hours', '', null, undefined, 'Mon-Fri', '9-5 or by appointment', 'Mon-Fri 5pm-9am']) expect(parseHours(bad)).toBeNull();
  });
});

describe('schedules and zones', () => {
  it('DC is Mon–Fri 09:00–18:00 America/New_York; a state keeps its zone with parsed hours or the DC default', () => {
    expect(scheduleFor()).toEqual({ zone: 'America/New_York', rules: [{ days: WEEK, open: 540, close: 1080 }] });
    expect(scheduleFor({ state: 'CO', hours: 'Mon-Fri 9-5' })).toEqual({ zone: 'America/Denver', rules: [{ days: WEEK, open: 540, close: 1020 }] });
    expect(scheduleFor({ state: 'HI' }).zone).toBe('Pacific/Honolulu');
  });
  it('an unparseable string falls back to the DC default in the office zone and counts a build warning', () => {
    const before = hoursWarnings.unparseable;
    expect(scheduleFor({ state: 'CO', hours: 'call for hours' })).toEqual({ zone: 'America/Denver', rules: [{ days: WEEK, open: 540, close: 1080 }] });
    expect(hoursWarnings.unparseable).toBe(before + 1);
    expect(countUnparseable(['Mon-Fri 9-5', 'call for hours', '', null, undefined, 'by appointment'])).toBe(2);
  });
  it('converts a zone wall clock to an instant across DST', () => {
    expect(zonedToUtc('America/New_York', 2026, 11, 3, 9, 0).toISOString()).toBe('2026-11-03T14:00:00.000Z'); // EST
    expect(zonedToUtc('America/New_York', 2026, 10, 30, 9, 0).toISOString()).toBe('2026-10-30T13:00:00.000Z'); // EDT
  });
});

describe('isOpen / nextOpenSlot (acceptance fixtures)', () => {
  it('Pacific 20:00 Monday: DC is closed, next slot Tuesday 09:00 ET', () => {
    const now = at('2026-11-03T04:00:00Z'); // Mon 2026-11-02 20:00 PST
    expect(isOpen(now)).toBe(false);
    expect(nextOpenSlot(now).toISOString()).toBe('2026-11-03T14:00:00.000Z');
    expect(openChip(now)).toEqual({ open: false, text: expect.stringMatching(/^Closed · opens Tue 9:00 AM EST$/) });
  });
  it('Hawaii 10:00 Monday falls inside DC hours', () => {
    const now = at('2026-11-02T20:00:00Z'); // Mon 10:00 HST = 15:00 EST
    expect(isOpen(now)).toBe(true);
    expect(nextOpenSlot(now)).toBe(now);
    expect(openChip(now)).toEqual({ open: true, text: 'Open now' });
  });
  it('a Mountain district office with "Mon-Fri 9-5" opens at 09:00 MT and closes at 17:00 MT', () => {
    const office = { state: 'CO', hours: 'Mon-Fri 9-5' };
    expect(isOpen(at('2026-11-02T15:00:00Z'), office)).toBe(false); // 08:00 MST
    expect(nextOpenSlot(at('2026-11-02T15:00:00Z'), office).toISOString()).toBe('2026-11-02T16:00:00.000Z');
    expect(isOpen(at('2026-11-02T23:30:00Z'), office)).toBe(true); // 16:30 MST
    expect(isOpen(at('2026-11-03T00:00:00Z'), office)).toBe(false); // 17:00 MST
    expect(nextOpenSlot(at('2026-11-03T00:00:00Z'), office).toISOString()).toBe('2026-11-03T16:00:00.000Z');
  });
  it('Friday evening and the weekend roll to Monday; an unparseable office follows the DC default in its own zone', () => {
    expect(nextOpenSlot(at('2026-11-06T23:30:00Z')).toISOString()).toBe('2026-11-09T14:00:00.000Z'); // Fri 18:30 EST → Mon 09:00 EST
    expect(nextOpenSlot(at('2026-11-07T15:00:00Z')).toISOString()).toBe('2026-11-09T14:00:00.000Z'); // Saturday
    expect(nextOpenSlot(at('2026-11-07T15:00:00Z'), { state: 'CO', hours: '???' }).toISOString()).toBe('2026-11-09T16:00:00.000Z'); // Mon 09:00 MST
  });
});
