// District-office visits (docs/specs/office-visits.md). Pure helpers: the personal-data screen a
// listing must pass, the signed review links the digest carries, and the one line pages render.
// Nothing here reads the repo; worker/src/index.ts and digest.ts call these.
import type { Member, VisitPublic, VisitRow, VisitStatus } from './types';

export const VISIT_LIMITS = { note_max: 140, contact_max: 200, city_max: 40, pending_per_device: 1, requests_per_day: 5 } as const;
/** A listing stays findable this long past `ends_at` (office local time, compared in UTC). */
export const VISIT_GRACE_MS = 12 * 3_600_000;
export const REVIEW_TTL_MS = 7 * 86_400_000;
export const REVIEW_ACTIONS = ['approve', 'reject', 'hide', 'delete'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

// §3.1: a phone number (7+ digits with at most separators between), an email, a street address
// (number + words + a street suffix) or a PO box anywhere in the text. Section numbers, times,
// dates and head counts pass: they never carry a street suffix or 7 digits in a run.
const PHONE = /(?:\+?\d[\s().-]*){7,}\d/;
const EMAIL = /\S+@\S+\.\S+/;
const STREET = /\b\d{1,6}[a-z]?\s+(?:[A-Za-z.'-]+\s+){0,4}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|hwy|highway|pkwy|parkway|ter|terrace|cir|circle|plaza|sq|square)\b\.?/i;
const PO_BOX = /\bp\.?\s*o\.?\s*box\b/i;

/** The class of personal data found, or null when the text is clean. */
export function personalData(text: string): 'phone' | 'email' | 'address' | null {
  if (EMAIL.test(text)) return 'email';
  if (PHONE.test(text)) return 'phone';
  if (STREET.test(text) || PO_BOX.test(text)) return 'address';
  return null;
}

/** One URL (https) or one handle (`@name`), nothing else: the organiser's own channel. */
export function validContact(s: string): boolean {
  if (s.length > VISIT_LIMITS.contact_max || /\s/.test(s)) return false;
  if (/^@[\w.]{2,30}$/.test(s)) return true;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !!u.hostname.includes('.') && !u.username && !u.password;
  } catch {
    return false;
  }
}

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
/** `date` YYYY-MM-DD plus `start`/`end` HH:MM → the two local timestamps, or null when malformed, past or inverted. */
export function visitWindow(date: unknown, start: unknown, end: unknown, now: Date): { starts_at: string; ends_at: string } | null {
  if (typeof date !== 'string' || typeof start !== 'string' || typeof end !== 'string') return null;
  const starts_at = `${date}T${start}`;
  const ends_at = `${date}T${end}`;
  if (!LOCAL.test(starts_at) || !LOCAL.test(ends_at) || Number.isNaN(Date.parse(starts_at)) || ends_at <= starts_at) return null;
  if (date < now.toISOString().slice(0, 10)) return null;
  return { starts_at, ends_at };
}

/** True once the window is over (plus the grace): the listing drops off every page. */
export function expired(ends_at: string, now: Date): boolean {
  return ends_at < new Date(now.getTime() - VISIT_GRACE_MS).toISOString().slice(0, 16);
}

export const officeCity = (m: Member): string | null => m.district_office_city?.trim() || null;

/** What any page may show of a listing: no contact, no device hash. `requests` is the stored count; clients show it from 2. */
export function publicVisit(v: VisitRow & { id: number }, requests: number): VisitPublic {
  return { id: v.id, bioguide_id: v.bioguide_id, office_city: v.office_city, starts_at: v.starts_at, ends_at: v.ends_at, note: v.note, requests };
}

export const isStatus = (s: unknown): s is VisitStatus => s === 'pending' || s === 'approved' || s === 'rejected' || s === 'hidden';

// ---- signed review links (digest → GET /api/visits/review?token=) ----------------------------
const enc = new TextEncoder();
const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

/** `<id>.<action>.<expiry ms>.<hmac>`: HMAC-SHA256 over the first three with VISITS_REVIEW_SECRET. */
export async function signReview(secret: string, id: number, action: ReviewAction, expiresAt: Date): Promise<string> {
  const body = `${id}.${action}.${expiresAt.getTime()}`;
  return `${body}.${await hmac(secret, body)}`;
}

export type ReviewToken = { ok: true; id: number; action: ReviewAction } | { ok: false; reason: 'malformed' | 'expired' | 'bad_signature' };

export async function verifyReview(secret: string, token: string, now: Date): Promise<ReviewToken> {
  const parts = token.split('.');
  if (parts.length !== 4) return { ok: false, reason: 'malformed' };
  const [idStr, action, expStr, sig] = parts;
  const id = Number(idStr);
  const exp = Number(expStr);
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(exp) || !(REVIEW_ACTIONS as readonly string[]).includes(action)) return { ok: false, reason: 'malformed' };
  const want = await hmac(secret, `${idStr}.${action}.${expStr}`);
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return { ok: false, reason: 'bad_signature' };
  if (exp < now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, id, action: action as ReviewAction };
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The digest block: one pending listing per paragraph with its four signed links. Empty string when nothing is pending. */
export async function reviewSection(pending: (VisitRow & { id: number })[], memberName: (id: string) => string, origin: string | null, secret: string | undefined, now: Date): Promise<string> {
  if (pending.length === 0) return '';
  const out = [`Visit listings awaiting review: ${pending.length}`];
  const exp = new Date(now.getTime() + REVIEW_TTL_MS);
  for (const v of pending) {
    out.push('', `#${v.id} ${memberName(v.bioguide_id)} (${v.bioguide_id}) · ${v.office_city} · ${v.starts_at.replace('T', ' ')}–${v.ends_at.slice(11)}`, `  contact: ${v.contact_url}`, `  note: ${v.note ?? '—'}`, `  listed: ${v.created_at}`);
    if (secret && origin) {
      for (const a of REVIEW_ACTIONS) out.push(`  ${a}: ${origin}/api/visits/review?token=${await signReview(secret, v.id, a, exp)}`);
    } else out.push('  (set VISITS_REVIEW_SECRET and DIGEST_FROM on the zone to get approve/reject links)');
  }
  out.push('', 'Approve makes a listing visible at once; reject deletes it; hide keeps it off every page; delete removes it and its requests.');
  return out.join('\n');
}
