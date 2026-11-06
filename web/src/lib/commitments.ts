// Commitment funnel (docs/specs/commitment-funnel.md): the private commitment and the captain
// list live only in this browser. Nothing here is ever sent; the Worker sees one receipt per
// completed list and never a name.
export const COMMIT_KEY = 'cut-ties:commitments';
export const CAPTAIN_KEY = 'cut-ties:captain';
/** office-visits §2.3: the visits this device said it would come to (and the organiser's contact, received once). */
export const VISITS_KEY = 'cut-ties:visits';
import { nextOpenSlot, type Office } from './hours';

export type Channel = 'text' | 'in_person' | 'call';
export const CHANNELS: [Channel, string][] = [['text', 'text'], ['in_person', 'in person'], ['call', 'call']];
/** `kind` (call-follow-through §1): `call` is the private commitment, `retry` a second attempt after `no_answer`; readers default a missing kind to `call`. `who` is the office's public "Sen. Name" for the retry line. */
export interface Commitment { v: 1; goal: string; action: string; target: string; due: string; kind?: 'call' | 'retry'; who?: string }
export const kindOf = (c: Commitment): 'call' | 'retry' => c.kind ?? 'call';
/** One list key per item: the call commitment is one per goal, a retry one per goal and target. */
export const keyOf = (c: Commitment): string => (kindOf(c) === 'retry' ? `retry:${c.goal}:${c.target}` : `call:${c.goal}`);
export interface Person { name: string; channel: Channel; done: boolean }
/** `who` is the official's surname for the receipt line ("…calling Casar…"); `receipted` is set once the list posted its receipt. */
export interface Captain { v: 1; goal: string; due: string; people: Person[]; who?: string; receipted?: boolean }
export interface JoinedVisit { v: 1; id: number; member: string; name: string; city: string; starts_at: string; ends_at: string; contact_url: string }

const read = <T>(key: string): T | null => { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; } };
const write = (key: string, v: unknown): void => { try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } };

export function loadCommitments(): Commitment[] {
  const list = read<Commitment[]>(COMMIT_KEY);
  return Array.isArray(list) ? list.filter((c) => c && c.v === 1 && typeof c.goal === 'string' && typeof c.due === 'string') : [];
}
export function saveCommitments(list: Commitment[]): void { write(COMMIT_KEY, list.length ? list : null); }
/** One open commitment per goal (and one open retry per goal and target): a new one replaces the old. */
export function addCommitment(c: Omit<Commitment, 'v'>): void { const n: Commitment = { v: 1, ...c }; saveCommitments([...loadCommitments().filter((x) => keyOf(x) !== keyOf(n)), n]); }
export function commitmentFor(goal: string): Commitment | null { return loadCommitments().find((c) => c.goal === goal && kindOf(c) === 'call') ?? null; }
export function retryFor(goal: string, target: string): Commitment | null { return loadCommitments().find((c) => c.goal === goal && c.target === target && kindOf(c) === 'retry') ?? null; }
/** §1: the retry is due at the office's next open slot, at least 60 minutes from now. */
export function retryDue(now: Date, office?: Office | null): Date { return nextOpenSlot(new Date(now.getTime() + 60 * 60_000), office); }

export function loadCaptain(): Captain | null {
  const c = read<Captain>(CAPTAIN_KEY);
  return c && c.v === 1 && Array.isArray(c.people) && c.people.length === 3 && c.people.every((p) => validName(p.name)) ? c : null;
}
export function saveCaptain(c: Captain | null): void { write(CAPTAIN_KEY, c); }
/** "Start over": every funnel item goes. */
export function clearFunnel(): void { write(COMMIT_KEY, null); write(CAPTAIN_KEY, null); write(VISITS_KEY, null); }

/** §2.1 return visit: anything still to do? A list that already posted its receipt is finished. */
export function hasOpenItems(): boolean {
  const cap = loadCaptain();
  return loadCommitments().length > 0 || (!!cap && !cap.receipted) || loadVisits().length > 0;
}

export function loadVisits(): JoinedVisit[] {
  const list = read<JoinedVisit[]>(VISITS_KEY);
  return Array.isArray(list) ? list.filter((j) => j && j.v === 1 && typeof j.id === 'number' && typeof j.starts_at === 'string') : [];
}
export function saveVisits(list: JoinedVisit[]): void { write(VISITS_KEY, list.length ? list : null); }
export function addVisit(j: Omit<JoinedVisit, 'v'>): void { saveVisits([...loadVisits().filter((x) => x.id !== j.id), { v: 1, ...j }]); }
export function removeVisit(id: number): void { saveVisits(loadVisits().filter((x) => x.id !== id)); }
export const joinedVisit = (id: number): JoinedVisit | null => loadVisits().find((x) => x.id === id) ?? null;

/** First names only: letters (any script), spaces, hyphens and apostrophes, 1–20 chars. Digits and `@` are refused so no phone or email is ever stored. */
export const NAME_MAX = 20;
export function validName(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0 && s.length <= NAME_MAX && /^[\p{L}][\p{L}' -]*$/u.test(s.trim());
}

const DAY = 86_400_000;
/** call-follow-through §2: every funnel time anchor is 10:00 local; 10:00 anywhere in the US (Hawaii included) falls inside DC hours. */
export const DUE_HOUR = 10;
const atHour = (d: Date): Date => { const x = new Date(d); x.setHours(DUE_HOUR, 0, 0, 0); return x; };
/** A date input's value at the funnel hour, local time. */
export const atDue = (ymdValue: string): Date => new Date(`${ymdValue}T${String(DUE_HOUR).padStart(2, '0')}:00:00`);
/** The next weekday at 10:00 local, never past the goal's decision date (its 10:00) when one is set. */
export function defaultDue(now: Date, decisionDate: string | null | undefined): Date {
  let d = atHour(new Date(now.getTime() + DAY));
  while (d.getDay() === 0 || d.getDay() === 6) d = atHour(new Date(d.getTime() + DAY));
  const ceiling = ceilingFor(decisionDate);
  return ceiling && ceiling < d ? ceiling : d;
}
export function ceilingFor(decisionDate: string | null | undefined): Date | null {
  if (!decisionDate || !/^\d{4}-\d{2}-\d{2}$/.test(decisionDate)) return null;
  return atHour(new Date(decisionDate + 'T12:00:00'));
}
/** The latest date the user may pick: ≤7 days out and never past the decision date (a call again before the vote may use the whole window). */
export function maxDue(now: Date, decisionDate: string | null | undefined, wholeWindow: boolean): Date {
  const week = atHour(new Date(now.getTime() + 7 * DAY));
  const ceiling = ceilingFor(decisionDate);
  if (wholeWindow && ceiling) return ceiling;
  return ceiling && ceiling < week ? ceiling : week;
}
export const isOverdue = (due: string, now: Date = new Date()): boolean => Date.parse(due) < now.getTime();
/** YYYY-MM-DD in local time, for `<input type="date">`. */
export function ymd(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function fmtDue(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function fmtDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** §3.1 receipt line. No names: a count, a district, a surname of a public official, a date. */
export function receiptLine(district: string, who: string | undefined, due: string): string {
  return `Three of us in ${district} are calling ${who ? who + ' ' : ''}before ${fmtDay(due)}. Who's next?`;
}
/** §1.4 "Copy a message": the goal deep link with one line naming the goal and the date, for the user's own groups. */
export function copyLine(title: string, due: string, url: string): string {
  return `Will you call about "${title}" by ${fmtDay(due)}? Two minutes, the words are ready: ${url}`;
}
