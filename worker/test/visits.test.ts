// office-visits acceptance (docs/prd/office-visits.md): review flow, personal-data screen, contact
// revealed only to a stored request, counts, withdraw, creator delete, the pause flag, digest links.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { createApp } from '../src/index';
import { runDigest } from '../src/digest';
import { MemoryRepo } from '../src/repo';
import { loadRows } from '../src/load';
import { personalData, signReview, validContact, verifyReview } from '../src/visits';
import type { Env } from '../src/types';
import { ENV, fakeFetch } from './fixtures';

const rows = loadRows(join(__dirname, '..', '..', 'data'), '2026-11-04T00:00:00Z');
const NOW = new Date('2026-11-04T15:00:00Z');
const SECRET = 'test-review-secret';
const MEMBER = rows.members[0].bioguide_id;
const DEV_A = 'device-aaaaaaaa';
const DEV_B = 'device-bbbbbbbb';
const CONTACT = 'https://signal.group/#abc';

function harness(env: Partial<Env> = {}, now = NOW) {
  const repo = new MemoryRepo(rows);
  const app = createApp({ repo: () => repo, fetch: fakeFetch({ turnstileOk: true }).impl, now: () => now });
  const E: Env = { ...ENV, VISITS_REVIEW_SECRET: SECRET, ...env };
  const json = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }, E);
  const list = async (member = MEMBER) => (await (await json('GET', `/api/visits?member=${member}`)).json()) as { visits: Record<string, unknown>[] };
  const create = (over: Record<string, unknown> = {}) =>
    json('POST', '/api/visits', { member: MEMBER, city: 'Santa Ana', date: '2026-11-10', start: '10:00', end: '11:00', contact: CONTACT, note: 'Meet by the flagpole', device: DEV_A, turnstile: 't', ...over });
  const review = async (id: number, action: 'approve' | 'reject' | 'hide' | 'delete') =>
    json('GET', `/api/visits/review?token=${await signReview(SECRET, id, action, new Date(now.getTime() + 60_000))}`);
  return { repo, app, E, json, list, create, review };
}

describe('office-visits: listing and review', () => {
  it('pending listings are invisible; approve shows them; reject leaves no trace', async () => {
    const h = harness();
    const r = await h.create();
    expect(r.status).toBe(200);
    const { id, status } = (await r.json()) as { id: number; status: string };
    expect(status).toBe('pending');
    expect((await h.list()).visits).toEqual([]);

    expect((await h.review(id, 'approve')).status).toBe(200);
    const shown = (await h.list()).visits;
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ id, office_city: 'Santa Ana', starts_at: '2026-11-10T10:00', requests: 0 });
    expect(shown[0]).not.toHaveProperty('contact_url');
    expect(shown[0]).not.toHaveProperty('device_hash');
    expect(JSON.stringify(shown)).not.toContain(CONTACT);

    const r2 = await h.create({ device: DEV_B, contact: '@someone' });
    const id2 = ((await r2.json()) as { id: number }).id;
    expect((await h.review(id2, 'reject')).status).toBe(200);
    expect(h.repo.visits.find((v) => v.id === id2)).toBeUndefined();
    expect((await h.list()).visits.map((v) => v.id)).toEqual([id]);
  });

  it('hide removes an approved listing from every page; bad, expired and reused tokens are refused', async () => {
    const h = harness();
    const id = ((await (await h.create()).json()) as { id: number }).id;
    await h.review(id, 'approve');
    expect((await h.list()).visits).toHaveLength(1);
    expect((await h.review(id, 'hide')).status).toBe(200);
    expect((await h.list()).visits).toEqual([]);

    expect((await h.json('GET', '/api/visits/review?token=1.approve.9999999999999.deadbeef')).status).toBe(403);
    const stale = await signReview(SECRET, id, 'approve', new Date(NOW.getTime() - 1));
    expect((await h.json('GET', `/api/visits/review?token=${stale}`)).status).toBe(403);
    const other = await signReview('other-secret', id, 'approve', new Date(NOW.getTime() + 60_000));
    expect((await h.json('GET', `/api/visits/review?token=${other}`)).status).toBe(403);
    expect((await verifyReview(SECRET, await signReview(SECRET, 7, 'reject', new Date(NOW.getTime() + 1000)), NOW))).toEqual({ ok: true, id: 7, action: 'reject' });
    // review needs the secret
    const off = harness({ VISITS_REVIEW_SECRET: undefined });
    expect((await off.review(1, 'approve')).status).toBe(503);
  });

  it('a listing expires after its window (plus 12 h grace)', async () => {
    const h = harness();
    const id = ((await (await h.create({ date: '2026-11-04', start: '09:00', end: '10:00' })).json()) as { id: number }).id;
    await h.review(id, 'approve');
    expect((await h.list()).visits).toHaveLength(1);
    const later = harness({}, new Date('2026-11-05T23:00:00Z'));
    later.repo.visits.push(...h.repo.visits);
    expect((await later.list()).visits).toEqual([]);
    expect((await later.json('POST', `/api/visits/${id}/request`, { device: DEV_B })).status).toBe(404);
  });

  it('validates member, time window, contact format and city; Turnstile failure is 403', async () => {
    const h = harness();
    expect((await h.create({ member: 'Z999999' })).status).toBe(400);
    expect((await (await h.create({ date: '2026-11-01' })).json())).toMatchObject({ error: 'bad_time' });
    expect((await (await h.create({ start: '11:00', end: '10:00' })).json())).toMatchObject({ error: 'bad_time' });
    expect((await (await h.create({ contact: 'http://insecure.example/x' })).json())).toMatchObject({ error: 'bad_contact' });
    expect((await (await h.create({ contact: 'call me' })).json())).toMatchObject({ error: 'bad_contact' });
    expect((await (await h.create({ city: '' })).json())).toMatchObject({ error: 'bad_city' });
    expect((await h.create({ device: 'short' })).status).toBe(400);
    const noTs = new MemoryRepo(rows);
    const app = createApp({ repo: () => noTs, fetch: fakeFetch({ turnstileOk: false }).impl, now: () => NOW });
    const r = await app.request('/api/visits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ member: MEMBER, city: 'X', date: '2026-11-10', start: '10:00', end: '11:00', contact: CONTACT, device: DEV_A, turnstile: 'bad' }) }, { ...ENV, TURNSTILE_SECRET: 's' });
    expect(r.status).toBe(403);
  });

  it('one pending listing per device', async () => {
    const h = harness();
    expect((await h.create()).status).toBe(200);
    expect((await h.create({ date: '2026-11-12' })).status).toBe(429);
    expect((await h.create({ device: DEV_B })).status).toBe(200);
  });
});

// §3.1 fixture: ten strings that must be rejected, ten that must pass.
const BAD = [
  'Call me on 714-555-0142 to coordinate',
  'text (202) 555 0199 when you arrive',
  'my cell is 2025550123',
  'reach me at +1 310.555.0177 after 5',
  'email jane.doe@example.com for the plan',
  'ping ORGANISER@lists.example.org',
  'meet at 1200 N Main St first',
  'park at 45 Civic Center Drive, lot B',
  'we gather at 3701 Wilshire Blvd. lobby',
  'send cards to PO Box 1234',
];
const GOOD = [
  'Meet by the flagpole at 10',
  'Bring a copy of section 1217 of the NDAA',
  'Ask about the 2028 MOU and the HASC markup',
  'We did this on 11/4 with 6 people',
  'Room 214, second floor, ask at the desk',
  'Wear something blue, 30 minutes total',
  'Staffer said 3 constituents is the minimum',
  'Follow the Signal group link',
  'District office hours are 9 to 5',
  'Last time 12 of us came; aim for 20',
];

describe('office-visits: personal-data screen', () => {
  it.each(BAD)('rejects %j', (s) => expect(personalData(s)).not.toBeNull());
  it.each(GOOD)('accepts %j', (s) => expect(personalData(s)).toBeNull());
  it('the API refuses a note or contact with personal data (400 pii)', async () => {
    const h = harness();
    for (const note of BAD) expect((await (await h.create({ note })).json())).toMatchObject({ error: 'pii' });
    expect(h.repo.visits).toHaveLength(0);
  });
  it('contact is one https link or one handle', () => {
    expect(validContact('https://signal.group/#abc')).toBe(true);
    expect(validContact('@jane_doe')).toBe(true);
    expect(validContact('@j')).toBe(false);
    expect(validContact('https://user:pw@x.example/')).toBe(false);
    expect(validContact('https://a.example https://b.example')).toBe(false);
    expect(validContact('mailto:jane@example.com')).toBe(false);
  });
});

describe('office-visits: requests', () => {
  async function approved() {
    const h = harness();
    const id = ((await (await h.create()).json()) as { id: number }).id;
    await h.review(id, 'approve');
    return { h, id };
  }

  it('reveals the contact only in the reply to a stored request; count shows from the second device', async () => {
    const { h, id } = await approved();
    expect((await h.json('POST', `/api/visits/${id}/request`, {})).status).toBe(400);
    const r1 = (await (await h.json('POST', `/api/visits/${id}/request`, { device: DEV_B })).json()) as Record<string, unknown>;
    expect(r1).toMatchObject({ id, contact_url: CONTACT, requests: 1 });
    expect(h.repo.visitRequests).toHaveLength(1);
    // same device again: idempotent, still one row
    const again = (await (await h.json('POST', `/api/visits/${id}/request`, { device: DEV_B })).json()) as Record<string, unknown>;
    expect(again.requests).toBe(1);
    expect(h.repo.visitRequests).toHaveLength(1);
    const r2 = (await (await h.json('POST', `/api/visits/${id}/request`, { device: 'device-cccccccc' })).json()) as Record<string, unknown>;
    expect(r2.requests).toBe(2);
    expect((await h.list()).visits[0]).toMatchObject({ requests: 2 });
    expect(JSON.stringify(await h.list())).not.toContain(CONTACT);
    // pending listing: 404
    const p = ((await (await h.create({ device: DEV_B, date: '2026-11-20' })).json()) as { id: number }).id;
    expect((await h.json('POST', `/api/visits/${p}/request`, { device: DEV_A })).status).toBe(404);
  });

  it('withdraw removes the request and the count drops', async () => {
    const { h, id } = await approved();
    await h.json('POST', `/api/visits/${id}/request`, { device: DEV_B });
    await h.json('POST', `/api/visits/${id}/request`, { device: 'device-cccccccc' });
    expect((await h.json('DELETE', `/api/visits/${id}/request`, { device: DEV_B })).status).toBe(200);
    expect((await h.list()).visits[0]).toMatchObject({ requests: 1 });
    expect((await h.json('DELETE', `/api/visits/${id}/request`, { device: DEV_B })).status).toBe(200);
  });

  it('five requests per device per day', async () => {
    const h = harness();
    for (let i = 0; i < 6; i++) {
      const id = ((await (await h.create({ device: `device-${i}${i}${i}${i}${i}${i}${i}${i}`, date: '2026-11-1' + i })).json()) as { id: number }).id;
      await h.review(id, 'approve');
    }
    const ids = h.repo.visits.map((v) => v.id);
    for (const id of ids.slice(0, 5)) expect((await h.json('POST', `/api/visits/${id}/request`, { device: DEV_B })).status).toBe(200);
    expect((await h.json('POST', `/api/visits/${ids[5]}/request`, { device: DEV_B })).status).toBe(429);
  });

  it('the creating device deletes its listing and its requests; another device gets 403', async () => {
    const { h, id } = await approved();
    await h.json('POST', `/api/visits/${id}/request`, { device: DEV_B });
    expect((await h.json('DELETE', `/api/visits/${id}`, { device: DEV_B })).status).toBe(403);
    expect((await h.json('DELETE', `/api/visits/${id}`, { device: DEV_A })).status).toBe(200);
    expect(h.repo.visits).toEqual([]);
    expect(h.repo.visitRequests).toEqual([]);
    expect((await h.json('DELETE', `/api/visits/${id}`, { device: DEV_A })).status).toBe(404);
  });

  it('VISITS_ENABLED=0 pauses the feature: POST 503, list empty', async () => {
    const { h, id } = await approved();
    const off = harness({ VISITS_ENABLED: '0' });
    off.repo.visits.push(...h.repo.visits);
    expect((await off.create({ device: DEV_B })).status).toBe(503);
    expect((await off.json('POST', `/api/visits/${id}/request`, { device: DEV_B })).status).toBe(503);
    expect((await off.list()).visits).toEqual([]);
  });
});

describe('office-visits: digest', () => {
  it('pending listings reach the digest with signed links, even with no reports', async () => {
    const h = harness();
    const id = ((await (await h.create()).json()) as { id: number }).id;
    const mails: { subject: string; text: string }[] = [];
    const env: Env = { ...ENV, MAINTAINER_EMAIL: 'm@example.org', DIGEST_FROM: 'digest@cut-ties.example', VISITS_REVIEW_SECRET: SECRET };
    const res = await runDigest({ repo: h.repo, fetch: fakeFetch().impl, now: () => NOW, send: async (_e, m) => { mails.push(m); }, log: () => {} }, env);
    expect(res.sent).toBe(true);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toContain('1 visit listing to review');
    expect(mails[0].text).toContain(`#${id}`);
    expect(mails[0].text).toContain(CONTACT); // the maintainer sees the contact to judge it
    const link = mails[0].text.match(/approve: (https:\/\/cut-ties\.example\/api\/visits\/review\?token=\S+)/)?.[1];
    expect(link).toBeTruthy();
    const r = await h.app.request(new URL(link!).pathname + new URL(link!).search, {}, h.E);
    expect(r.status).toBe(200);
    expect((await h.list()).visits).toHaveLength(1);
  });

  it('without the secret the digest names the listings and says how to get links', async () => {
    const h = harness();
    await h.create();
    const mails: { text: string }[] = [];
    const env: Env = { ...ENV, MAINTAINER_EMAIL: 'm@example.org' };
    await runDigest({ repo: h.repo, fetch: fakeFetch().impl, now: () => NOW, send: async (_e, m) => { mails.push(m); }, log: () => {} }, env);
    expect(mails[0].text).toContain('VISITS_REVIEW_SECRET');
    expect(mails[0].text).not.toContain('/api/visits/review?token=');
  });
});
