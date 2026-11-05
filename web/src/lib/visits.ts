// office-visits (docs/specs/office-visits.md) client side: the API calls, the one line pages render
// and the two per-device records (joined visits live in commitments.ts; listings this device made here).
import type { VisitPublic } from '@worker/types';
import { addVisit, removeVisit } from './commitments';
import { deviceId } from './store';

export type { VisitPublic };
export const BIOGUIDE = /^[A-Z]\d{6}$/;
export const LISTED_KEY = 'cut-ties:visits-listed';
/** Clients show the count from two: one request is a person, two is company. */
export const SHOW_COUNT_FROM = 2;

const cache = new Map<string, Promise<VisitPublic[]>>();
/** GET /api/visits?member=, once per page per member (results cards share it). */
export function visitsFor(member: string, fetchImpl: typeof fetch = fetch): Promise<VisitPublic[]> {
  let p = cache.get(member);
  if (!p) {
    p = fetchImpl(`/api/visits?member=${encodeURIComponent(member)}`)
      .then(async (r) => (r.ok ? (((await r.json()) as { visits?: VisitPublic[] }).visits ?? []) : []))
      .catch(() => [] as VisitPublic[]);
    cache.set(member, p);
  }
  return p;
}
export function forgetVisits(member?: string): void { if (member) cache.delete(member); else cache.clear(); }

/** "Nov 10, 10:00–11:00 AM" from the two office-local stamps. */
export function fmtWhen(starts_at: string, ends_at: string): string {
  const s = new Date(starts_at); const e = new Date(ends_at);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return starts_at;
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${t(s)}–${t(e)}`;
}
export function fmtDay(starts_at: string): string {
  const d = new Date(starts_at);
  return Number.isNaN(d.getTime()) ? starts_at : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
/** §2.1 the line: "Visit <city> on <date> with N others"; below two requests the "with" clause is left out. */
export function visitLine(v: Pick<VisitPublic, 'office_city' | 'starts_at' | 'requests'>): string {
  const base = `Visit ${v.office_city} on ${fmtDay(v.starts_at)}`;
  return v.requests >= SHOW_COUNT_FROM ? `${base} with ${v.requests} others` : base;
}

export type RequestReply = VisitPublic & { contact_url: string };
/** §2.2 "I'll come": the only call whose reply carries the organiser's contact; stored on the device at once. */
export async function joinVisit(v: VisitPublic, memberName: string, fetchImpl: typeof fetch = fetch): Promise<RequestReply | null> {
  const r = await fetchImpl(`/api/visits/${v.id}/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: deviceId() }) });
  if (!r.ok) return null;
  const j = (await r.json()) as RequestReply;
  addVisit({ id: j.id, member: j.bioguide_id, name: memberName, city: j.office_city, starts_at: j.starts_at, ends_at: j.ends_at, contact_url: j.contact_url });
  forgetVisits(j.bioguide_id);
  return j;
}
/** §2.3 withdraw: the server row and the device copy of the contact go together. */
export async function withdrawVisit(id: number, fetchImpl: typeof fetch = fetch): Promise<void> {
  removeVisit(id);
  forgetVisits();
  await fetchImpl(`/api/visits/${id}/request`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: deviceId() }) }).catch(() => undefined);
}
/** §3.3 the organiser's delete. */
export async function deleteListing(id: number, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const r = await fetchImpl(`/api/visits/${id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: deviceId() }) }).catch(() => null);
  if (r?.ok) { unlist(id); forgetVisits(); }
  return !!r?.ok;
}

/** Listings this device created, so the member page can offer "Remove my listing". */
export function listed(): number[] {
  try { const l = JSON.parse(localStorage.getItem(LISTED_KEY) ?? '[]') as unknown; return Array.isArray(l) ? l.filter((x): x is number => typeof x === 'number') : []; } catch { return []; }
}
export function markListed(id: number): void { try { localStorage.setItem(LISTED_KEY, JSON.stringify([...new Set([...listed(), id])])); } catch { /* private mode */ } }
export function unlist(id: number): void { try { localStorage.setItem(LISTED_KEY, JSON.stringify(listed().filter((x) => x !== id))); } catch { /* ignore */ } }
