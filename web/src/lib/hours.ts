// Office hours (call-follow-through §2): client-side `Date` + `Intl` arithmetic over fixed tables.
// DC offices keep Mon–Fri 09:00–18:00 America/New_York. A district office uses its sourced `hours`
// string when it parses, in its state's time zone; otherwise the DC default shifted into that zone.
// Nothing here fetches and nothing is an LLM; an unparseable string is counted, never shown.

export interface Office { state?: string | null; hours?: string | null }
/** One opening rule: weekdays 0–6 (Sunday = 0), open/close as minutes from local midnight. */
export interface Rule { days: number[]; open: number; close: number }
export interface Schedule { zone: string; rules: Rule[] }

export const DC_ZONE = 'America/New_York';
const WEEKDAYS = [1, 2, 3, 4, 5];
export const DC_RULES: Rule[] = [{ days: WEEKDAYS, open: 9 * 60, close: 18 * 60 }];

/** Each state's main time zone (the capital's where a state spans two); territories included. */
export const STATE_ZONES: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago', CA: 'America/Los_Angeles',
  CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago', KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago', NV: 'America/Los_Angeles', NH: 'America/New_York',
  NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago',
  OH: 'America/New_York', OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles', WV: 'America/New_York', WI: 'America/Chicago',
  WY: 'America/Denver', PR: 'America/Puerto_Rico', VI: 'America/Puerto_Rico', GU: 'Pacific/Guam', MP: 'Pacific/Guam', AS: 'Pacific/Pago_Pago',
};

/** Build warning count: every `hours` string that did not parse (the roster build reads it; the UI never does). */
export const hoursWarnings = { unparseable: 0 };

const DAY_NAMES: Record<string, number> = { su: 0, m: 1, mo: 1, tu: 2, t: 2, w: 3, we: 3, th: 4, r: 4, f: 5, fr: 5, sa: 6, s: 6 };
function dayIndex(tok: string): number | null {
  const t = tok.toLowerCase().replace(/[^a-z]/g, '');
  if (!t) return null;
  if (t === 'sun' || t.startsWith('sund')) return 0;
  if (t === 'sat' || t.startsWith('satu')) return 6;
  if (t.startsWith('thu')) return 4;
  if (t.startsWith('tue')) return 2;
  const two = t.slice(0, 2);
  if (t.length >= 2 && two in DAY_NAMES) return DAY_NAMES[two];
  return t.length === 1 && t in DAY_NAMES ? DAY_NAMES[t] : null;
}
function dayRange(a: number, b: number): number[] {
  const out: number[] = [];
  for (let d = a; ; d = (d + 1) % 7) { out.push(d); if (d === b || out.length > 7) break; }
  return out;
}
/** "Mon-Fri", "M-F", "Mon, Wed", "Monday–Thursday", "weekdays"; null when the text is not a day spec. */
function parseDays(s: string): number[] | null {
  const t = s.trim();
  if (!t) return WEEKDAYS;
  if (/^(weekdays|daily)$/i.test(t)) return WEEKDAYS;
  const out = new Set<number>();
  for (const part of t.split(/\s*(?:,|&|and)\s*/i)) {
    const m = part.match(/^([A-Za-z]+)\.?\s*(?:[-–—]|to|through)\s*([A-Za-z]+)\.?$/) ?? null;
    if (m) {
      const a = dayIndex(m[1]), b = dayIndex(m[2]);
      if (a === null || b === null) return null;
      for (const d of dayRange(a, b)) out.add(d);
    } else {
      const d = dayIndex(part);
      if (d === null) return null;
      out.add(d);
    }
  }
  return [...out].sort();
}
const TIME = String.raw`(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|noon)?`;
const SPAN = new RegExp(String.raw`^${TIME}\s*(?:[-–—]|to|until|till)\s*${TIME}$`, 'i');
function toMinutes(h: number, m: number, mer: string | undefined, assumePm: boolean): number | null {
  if (mer && /noon/i.test(mer)) return 12 * 60;
  if (h < 0 || h > 24 || m > 59) return null;
  const p = mer ? /p/i.test(mer) : false;
  const a = mer ? /a/i.test(mer) : false;
  if (p && h < 12) h += 12;
  else if (a && h === 12) h = 0;
  else if (!mer && assumePm && h < 12) h += 12;
  return h * 60 + m;
}
/** "9-5", "9:00 AM - 5:00 PM", "8:30am–4:30pm"; bare hours read as a working day (a close at or before the open is afternoon). */
function parseSpan(s: string): { open: number; close: number } | null {
  const m = s.trim().match(SPAN);
  if (!m) return null;
  const [, h1, m1, mer1, h2, m2, mer2] = m;
  const open = toMinutes(+h1, +(m1 ?? 0), mer1, false);
  if (open === null) return null;
  let close = toMinutes(+h2, +(m2 ?? 0), mer2, false);
  if (close === null) return null;
  if (!mer2 && close <= open) close = toMinutes(+h2, +(m2 ?? 0), undefined, true);
  if (close === null || close <= open) return null;
  return { open, close };
}
/**
 * Parses a sourced hours string into rules; null when any segment does not parse (the caller falls
 * back to the DC default and counts a warning). Segments split on `;` or `,` followed by a day spec;
 * each is `[days] <span>` and "closed" segments are skipped.
 */
export function parseHours(s: string | null | undefined): Rule[] | null {
  if (!s || !s.trim()) return null;
  // "9:00 AM - 5:00 PM, Monday through Friday": put the day spec first.
  s = s.trim().replace(/^(\d[^,;]*?)\s*,\s*([A-Za-z][^;,\d]*?)\s*$/, '$2 $1');
  // Segments end at a chunk holding digits; a chunk without one ("Mon, Wed 10-6") is a day list continued.
  const segs: string[] = [];
  let pend = '';
  for (const chunk of s.split(/\s*[;,]\s*/)) {
    pend = pend ? `${pend}, ${chunk}` : chunk;
    if (/\d/.test(chunk)) { segs.push(pend); pend = ''; }
  }
  if (pend || segs.length === 0) return null;
  const rules: Rule[] = [];
  for (const seg of segs) {
    if (/closed/i.test(seg)) continue;
    const m = seg.trim().match(/^(.*?)\s*:?\s*(\d.*)$/);
    if (!m) return null;
    const days = parseDays(m[1]);
    const span = parseSpan(m[2]);
    if (!days || !span || days.length === 0) return null;
    rules.push({ days, ...span });
  }
  return rules.length ? rules : null;
}

/** The zone and rules for an office: DC when no state is given; else the state's zone with its parsed hours or the DC default. */
export function scheduleFor(office?: Office | null): Schedule {
  const zone = (office?.state && STATE_ZONES[office.state.toUpperCase()]) || DC_ZONE;
  if (office?.hours) {
    const rules = parseHours(office.hours);
    if (rules) return { zone, rules };
    hoursWarnings.unparseable += 1;
  }
  return { zone, rules: DC_RULES };
}
/** Counts the strings that would fall back; for the roster build's warning line. */
export function countUnparseable(hours: Iterable<string | null | undefined>): number {
  let n = 0;
  for (const h of hours) if (h && h.trim() && !parseHours(h)) n += 1;
  return n;
}

interface Parts { y: number; mo: number; d: number; h: number; mi: number; wd: number }
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmtFor(zone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }); fmtCache.set(zone, f); }
  return f;
}
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
/** Wall-clock parts of an instant in a zone. */
export function zoneParts(t: Date, zone: string): Parts {
  const p: Record<string, string> = {};
  for (const x of fmtFor(zone).formatToParts(t)) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: WD[p.weekday] ?? 0 };
}
/** The instant at which a zone's wall clock reads y-mo-d h:mi (two passes absorb the DST offset). */
export function zonedToUtc(zone: string, y: number, mo: number, d: number, h: number, mi: number): Date {
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 2; i++) { const p = zoneParts(new Date(t), zone); t += want - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi); }
  return new Date(t);
}

/** True while a rule covers the office's local weekday and minute. */
export function isOpen(now: Date, office?: Office | null): boolean {
  const { zone, rules } = scheduleFor(office);
  const p = zoneParts(now, zone);
  const m = p.h * 60 + p.mi;
  return rules.some((r) => r.days.includes(p.wd) && m >= r.open && m < r.close);
}
/** `now` itself when the office is open, else the next opening instant (within 14 days; `now` when no rule ever opens). */
export function nextOpenSlot(now: Date, office?: Office | null): Date {
  const { zone, rules } = scheduleFor(office);
  if (isOpen(now, office)) return now;
  const p = zoneParts(now, zone);
  const nowMin = p.h * 60 + p.mi;
  for (let k = 0; k < 14; k++) {
    const day = new Date(Date.UTC(p.y, p.mo - 1, p.d + k));
    const wd = day.getUTCDay();
    const opens = rules.filter((r) => r.days.includes(wd) && (k > 0 || r.open > nowMin)).map((r) => r.open).sort((a, b) => a - b);
    if (opens.length) return zonedToUtc(zone, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), Math.floor(opens[0] / 60), opens[0] % 60);
  }
  return now;
}

/** "Tue 9:00 AM ET": the slot in the office's zone, with the zone's short name. */
export function fmtSlot(d: Date, office?: Office | null): string {
  const zone = scheduleFor(office).zone;
  return `${d.toLocaleString('en-US', { timeZone: zone, weekday: 'short' })} ${d.toLocaleString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;
}
/** The chip beside a `tel:` button: "Open now" or "Closed · opens Tue 9:00 AM ET". */
export function openChip(now: Date, office?: Office | null): { open: boolean; text: string } {
  if (isOpen(now, office)) return { open: true, text: 'Open now' };
  return { open: false, text: `Closed · opens ${fmtSlot(nextOpenSlot(now, office), office)}` };
}
