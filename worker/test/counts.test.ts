// district-counters PRD: §1 GET /api/counts (SQL/array COUNT, 7-day window, threshold, cache header)
// and §3 receipt limits (10/device/day, 1/device+goal+action/10 min, 50/IP hash/day, ip_hash column).
// Every number asserted below is checked against an independent count over repo.receipts in the test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { createApp } from '../src/index';
import { loadRows } from '../src/load';
import { MemoryRepo, foldBuckets } from '../src/repo';
import { applyThreshold, bucketOf, receiptIpHash, thresholdFrom } from '../src/counts';
import type { ReceiptRow } from '../src/types';
import { ENV } from './fixtures';

const rows = loadRows(join(__dirname, '..', '..', 'data'), '2026-11-04T00:00:00Z');
const T0 = new Date('2026-11-04T12:00:00Z');
const CORREA = 'C001110';
const DEVICE = 'device-0123456789abcdef';
const NDAA = rows.goals.find((g) => g.slug === 'ndaa-1217')!;
const CALL = rows.actions.find((a) => a.slug === 'ndaa-1217-call')!;
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** An app with a mutable clock; `tick` moves it forward so the 10-minute rule can be stepped over. */
function app(extraActions: typeof rows.actions = []) {
  const repo = new MemoryRepo({ ...rows, actions: [...rows.actions, ...extraActions] });
  let now = T0;
  const a = createApp({ repo: () => repo, fetch: fetch, now: () => now });
  const get = (qs: string, env: Record<string, unknown> = ENV) => a.request(`/api/counts?${qs}`, {}, env);
  const post = (body: unknown, ip = '203.0.113.9', env: Record<string, unknown> = ENV) =>
    a.request('/api/receipt', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip } }, env);
  const tick = (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); };
  return { a, repo, get, post, tick, now: () => now };
}
function receipt(over: Partial<ReceiptRow>): ReceiptRow {
  return { goal_id: NDAA.id, action_id: CALL.id, target_id: CORREA, state: 'CA', district: 46, created_at: new Date(T0.getTime() - 3_600_000).toISOString(), device_hash: 'd', kind: 'action', ip_hash: 'i', ...over };
}
/** The independent count: receipts for the goal in the window, by place, kind and type. */
function expected(repo: MemoryRepo, state: string, district: number | null, now: Date, threshold = 5) {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const type = (id: number | null) => repo['rows' as never]?.actions?.find?.((a: { id: number }) => a.id === id)?.type ?? rows.actions.find((a) => a.id === id)?.type ?? null;
  const count = (rs: ReceiptRow[]) => {
    const b = { calls: 0, letters: 0, comments: 0, captain_lists: 0 };
    for (const r of rs) { const k = bucketOf(r.kind, type(r.action_id)); if (k) b[k]++; }
    return applyThreshold(b, threshold);
  };
  const inWindow = repo.receipts.filter((r) => r.goal_id === NDAA.id && r.state === state && r.created_at >= since);
  return { district: count(inWindow.filter((r) => district !== null && r.district === district)), state: count(inWindow) };
}

let sink: string[];
beforeEach(() => { sink = []; vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { sink.push(a.map(String).join(' ')); }); });
afterEach(() => vi.restoreAllMocks());

describe('GET /api/counts (§1)', () => {
  it('4 receipts in a district return 0; the 5th returns 5 in district and state', async () => {
    const { repo, get } = app();
    for (let i = 0; i < 4; i++) repo.receipts.push(receipt({ device_hash: `d${i}` }));
    let res = await get('goal=ndaa-1217&state=CA&district=46');
    expect(res.status).toBe(200);
    let body = await res.json();
    expect(body.district).toEqual({ calls: 0, letters: 0, comments: 0, captain_lists: 0 });
    expect(body.state).toEqual({ calls: 0, letters: 0, comments: 0, captain_lists: 0 });
    expect(repo.receipts.filter((r) => r.district === 46).length).toBe(4);
    repo.receipts.push(receipt({ device_hash: 'd4' }));
    res = await get('goal=ndaa-1217&state=CA&district=46');
    body = await res.json();
    expect(body.district.calls).toBe(5);
    expect(body.district.calls).toBe(repo.receipts.filter((r) => r.goal_id === NDAA.id && r.state === 'CA' && r.district === 46).length);
    expect(body.state.calls).toBe(repo.receipts.filter((r) => r.goal_id === NDAA.id && r.state === 'CA').length);
    expect(body).toMatchObject(expected(repo, 'CA', 46, T0));
    expect(body.since).toBe(new Date(T0.getTime() - 7 * 86_400_000).toISOString());
  });
  it('falls back to the state: 2 in the district and 3 elsewhere in CA give district 0, state 5', async () => {
    const { repo, get } = app();
    repo.receipts.push(receipt({}), receipt({}), receipt({ district: 12 }), receipt({ district: 12 }), receipt({ district: 1 }));
    const body = await (await get('goal=ndaa-1217&state=CA&district=46')).json();
    expect(body.district.calls).toBe(0);
    expect(body.state.calls).toBe(5);
    expect(body).toMatchObject(expected(repo, 'CA', 46, T0));
    // A senator's page sends no district: district buckets stay 0.
    const noDistrict = await (await get('goal=ndaa-1217&state=CA')).json();
    expect(noDistrict.district.calls).toBe(0);
    expect(noDistrict.state.calls).toBe(5);
  });
  it('never carries a number between 1 and threshold−1, per bucket; COUNT_THRESHOLD overrides 5', async () => {
    const letter = { ...CALL, id: 901, slug: 'ndaa-1217-letter', type: 'letter' as const };
    const { repo, get } = app([letter]);
    for (let i = 0; i < 6; i++) repo.receipts.push(receipt({ device_hash: `c${i}` }));
    for (let i = 0; i < 4; i++) repo.receipts.push(receipt({ action_id: 901, device_hash: `l${i}` }));
    for (let i = 0; i < 5; i++) repo.receipts.push(receipt({ kind: 'captain-list', action_id: null, target_id: null, device_hash: `k${i}` }));
    const body = await (await get('goal=ndaa-1217&state=CA&district=46')).json();
    expect(body.district).toEqual({ calls: 6, letters: 0, comments: 0, captain_lists: 5 });
    expect(body.district.captain_lists).toBe(repo.receipts.filter((r) => r.kind === 'captain-list' && r.district === 46).length);
    const low = await (await get('goal=ndaa-1217&state=CA&district=46', { ...ENV, COUNT_THRESHOLD: '2' })).json();
    expect(low.district).toEqual({ calls: 6, letters: 4, comments: 0, captain_lists: 5 });
    expect(low.district.letters).toBe(repo.receipts.filter((r) => r.action_id === 901).length);
    expect(thresholdFrom({ COUNT_THRESHOLD: 'nope' })).toBe(5);
    expect(thresholdFrom({ COUNT_THRESHOLD: '10' })).toBe(10);
  });
  it('counts the last 7 days only and this goal only', async () => {
    const { repo, get } = app();
    const old = new Date(T0.getTime() - 8 * 86_400_000).toISOString();
    for (let i = 0; i < 5; i++) repo.receipts.push(receipt({ created_at: old, device_hash: `o${i}` }));
    for (let i = 0; i < 5; i++) repo.receipts.push(receipt({ goal_id: 99, device_hash: `g${i}` }));
    for (let i = 0; i < 5; i++) repo.receipts.push(receipt({ device_hash: `n${i}` }));
    const body = await (await get('goal=ndaa-1217&state=CA&district=46')).json();
    expect(body.district.calls).toBe(5);
    expect(body.district.calls).toBe(repo.receipts.filter((r) => r.goal_id === NDAA.id && r.created_at >= body.since && r.district === 46).length);
  });
  it('is cacheable for 300 s; 404 no_goal, 400 missing', async () => {
    const { get } = app();
    const res = await get('goal=ndaa-1217&state=TX&district=35');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const again = await get('goal=ndaa-1217&state=TX&district=35');
    expect(again.headers.get('cache-control')).toBe('public, max-age=300');
    expect((await get('goal=nope&state=TX&district=35')).status).toBe(404);
    expect((await (await get('goal=nope&state=TX')).json()).error).toBe('no_goal');
    expect((await (await get('state=TX')).json()).error).toBe('no_goal');
    expect((await get('goal=ndaa-1217&district=35')).status).toBe(400);
    expect((await (await get('goal=ndaa-1217&state=Texas')).json()).error).toBe('missing');
  });
  it('foldBuckets mirrors the D1 GROUP BY rows', () => {
    const out = foldBuckets([
      { inDistrict: true, kind: 'action', type: 'call', n: 7 }, { inDistrict: false, kind: 'action', type: 'call', n: 3 },
      { inDistrict: false, kind: 'action', type: 'public_comment', n: 2 }, { inDistrict: true, kind: 'captain-list', type: null, n: 1 },
    ]);
    expect(out).toEqual({ district: { calls: 7, letters: 0, comments: 0, captain_lists: 1 }, state: { calls: 10, letters: 0, comments: 2, captain_lists: 1 } });
  });
});

describe('POST /api/receipt limits (§3)', () => {
  const body = (over: Record<string, unknown> = {}) => ({ goal: 'ndaa-1217', action: 'ndaa-1217-call', target: CORREA, state: 'CA', district: 46, device: DEVICE, ...over });
  it('stores a salted daily ip_hash, never the IP', async () => {
    const { repo, post, now } = app();
    expect((await post(body(), '198.51.100.7', { ...ENV, IP_SALT: 's3cret' })).status).toBe(200);
    const row = repo.receipts[0];
    expect(row.ip_hash).toBe(await sha(`198.51.100.7|s3cret|2026-11-04`));
    expect(JSON.stringify(repo.receipts)).not.toContain('198.51.100.7');
    // The salt rotates with the UTC date; without a secret the date alone rotates it and a warning is logged.
    expect(await receiptIpHash('198.51.100.7', 's3cret', new Date('2026-11-05T00:00:00Z'))).not.toBe(row.ip_hash);
    expect(await receiptIpHash('198.51.100.7', undefined, now())).toBe(await sha('198.51.100.7||2026-11-04'));
    expect(sink.some((l) => l.includes('IP_SALT'))).toBe(true);
  });
  it('the second receipt for the same device, goal and action within 10 minutes is 429 and not stored', async () => {
    const { repo, post, tick } = app();
    expect((await post(body())).status).toBe(200);
    const res = await post(body());
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('limit_repeat');
    expect(repo.receipts).toHaveLength(1);
    // Another action, or a captain list, is a different key.
    expect((await post(body({ goal: 'state-bonds', action: 'state-bonds-call', target: 'TX' }))).status).toBe(200);
    expect((await post(body({ action: 'captain-list', target: undefined }))).status).toBe(200);
    expect((await post(body({ action: 'captain-list', target: undefined }))).status).toBe(429);
    tick(10);
    expect((await post(body())).status).toBe(429); // the window is closed: [now − 10 min, now]
    tick(1);
    expect((await post(body())).status).toBe(200);
    expect(repo.receipts).toHaveLength(4);
  });
  it('the 11th receipt from one device in a day is 429 and the count does not move', async () => {
    const { repo, post, tick, get } = app();
    for (let i = 0; i < 10; i++) { expect((await post(body())).status).toBe(200); tick(11); }
    expect(repo.receipts).toHaveLength(10);
    const before = (await (await get('goal=ndaa-1217&state=CA&district=46')).json()).district.calls;
    expect(before).toBe(10);
    const res = await post(body());
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('limit_day');
    expect(repo.receipts).toHaveLength(10);
    expect((await (await get('goal=ndaa-1217&state=CA&district=46')).json()).district.calls).toBe(before);
    expect(repo.receipts.filter((r) => r.device_hash === repo.receipts[0].device_hash).length).toBe(10);
    tick(24 * 60 - 10 * 11 + 1);
    expect((await post(body())).status).toBe(200);
  });
  it('the 51st receipt from one IP hash in a day is 429', async () => {
    const { repo, post, tick } = app();
    for (let i = 0; i < 50; i++) { expect((await post(body({ device: `device-${String(i).padStart(12, '0')}` }))).status).toBe(200); tick(1); }
    expect(repo.receipts).toHaveLength(50);
    const res = await post(body({ device: 'device-fresh-000000000' }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('limit_ip');
    expect(repo.receipts).toHaveLength(50);
    expect(new Set(repo.receipts.map((r) => r.ip_hash)).size).toBe(1);
    // A different network is not affected.
    expect((await post(body({ device: 'device-fresh-000000000' }), '192.0.2.1')).status).toBe(200);
  });
});
