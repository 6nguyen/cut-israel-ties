import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { createApp } from '../src/index';
import { loadRows } from '../src/load';
import { MemoryRepo } from '../src/repo';
import { classifyAddress, parseCensus } from '../src/geocode';
import type { RouteResponse } from '../src/route';
import { ENV, FIXTURES, censusReply, fakeFetch } from './fixtures';

const rows = loadRows(join(__dirname, '..', '..', 'data'), '2026-11-04T00:00:00Z');
const TODAY = new Date('2026-11-04T12:00:00Z');

function app(opts: { turnstileOk?: boolean } = {}) {
  const f = fakeFetch(opts);
  const repo = new MemoryRepo(rows);
  const a = createApp({ repo: () => repo, fetch: f.impl, now: () => TODAY });
  const post = (body: unknown, env = ENV) =>
    a.request('/api/route', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }, env);
  return { a, post, calls: f.calls };
}

// Everything the Worker could write to: console, and a stand-in for D1.
let sink: string[];
beforeEach(() => {
  sink = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { sink.push(args.map(String).join(' ')); });
  }
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/route — six fixture addresses (§1 acceptance)', () => {
  for (const f of FIXTURES) {
    it(`${f.label}${f.splitCity ? ' (split city)' : ''}: ${f.state}-${f.district} → ${f.expectGoals.join(' + ')}`, async () => {
      const { post } = app();
      const res = await post({ address: f.address });
      expect(res.status).toBe(200);
      const body = (await res.json()) as RouteResponse;
      expect(body.state).toBe(f.state);
      expect(body.district).toBe(f.district);
      expect(body.goals).toHaveLength(2);
      expect(body.goals.map((g) => g.slug)).toEqual(f.expectGoals);
      expect(body.senators).toHaveLength(2);
      expect(body.house?.district).toBe(f.district);
      for (const g of body.goals) {
        expect(g.targets.length).toBeGreaterThan(0);
        expect(g.ask_text).not.toBe('');
        for (const t of g.targets) {
          expect(t.name).toBeTruthy();
          expect(['for', 'uncommitted', 'against', 'unknown']).toContain(t.position);
          expect(t.prior_vote).toBeTruthy();
        }
      }
    });
  }

  it('all-Republican delegation gets NDAA + state, with the treasurer as target', async () => {
    const { post } = app();
    const body = (await (await post({ address: FIXTURES[3].address })).json()) as RouteResponse;
    expect(body.goals.map((g) => g.slug)).toEqual(['ndaa-1217', 'state-bonds']);
    expect(body.goals[1].targets[0].role).toBe('Treasurer');
    // NDAA targets: house + both senators; leadership goals never list the other party.
    expect(body.goals[0].targets.map((t) => t.role)).toEqual(['Rep.', 'Sen.', 'Sen.']);
  });

  it('R/DD lists only Democratic senators as Senate-leader targets', async () => {
    const { post } = app();
    const body = (await (await post({ address: FIXTURES[2].address })).json()) as RouteResponse;
    expect(body.goals[1].slug).toBe('senate-leader');
    expect(body.goals[1].targets.every((t) => t.party === 'D' && t.role === 'Sen.')).toBe(true);
  });
});

describe('POST /api/route — refusals (§1.2, §1.4)', () => {
  it('ZIP-only is refused with the split-cities reason and no geocoder call', async () => {
    const { post, calls } = app();
    for (const zip of ['92701', ' 19107-1234 ']) {
      const res = await post({ address: zip });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe('zip_only');
      expect(body.message).toMatch(/split/);
    }
    expect(calls.filter((u) => u.includes('census.gov'))).toHaveLength(0);
  });
  it('city-only or empty input is refused as incomplete / missing', async () => {
    const { post } = app();
    expect((await post({ address: 'Philadelphia, PA' })).status).toBe(400);
    expect((await post({ address: '' })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });
  it('unresolvable address → 404 with retry + picker hint', async () => {
    const { post } = app();
    const res = await post({ address: '1 Nowhere Rd, Atlantis, ZZ 00000' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('unresolved');
    expect(body.message).toMatch(/pick your state and district/);
  });
  it('manual {state, district} skips the geocoder (picker and return visits)', async () => {
    const { post, calls } = app();
    const res = await post({ state: 'PA', district: 2 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as RouteResponse).goals.map((g) => g.slug)).toEqual(['ndaa-1217', 'house-caucus']);
    expect(calls.filter((u) => u.includes('census.gov'))).toHaveLength(0);
  });
  it('a district with no members on file → 404 no_delegation', async () => {
    const { post } = app();
    expect((await post({ state: 'WY', district: 0 })).status).toBe(404);
  });
});

describe('Turnstile', () => {
  it('skipped when no secret is configured (local dev)', async () => {
    const { post, calls } = app();
    expect((await post({ state: 'CA', district: 46 })).status).toBe(200);
    expect(calls.some((u) => u.includes('challenges.cloudflare.com'))).toBe(false);
  });
  it('required and verified when the secret is set', async () => {
    const env = { ...ENV, TURNSTILE_SECRET: 's' };
    const bad = app({ turnstileOk: false });
    expect((await bad.post({ state: 'CA', district: 46, turnstile: 't' }, env)).status).toBe(403);
    expect((await bad.post({ state: 'CA', district: 46 }, env)).status).toBe(403);
    const good = app({ turnstileOk: true });
    expect((await good.post({ state: 'CA', district: 46, turnstile: 't' }, env)).status).toBe(200);
    expect(good.calls.filter((u) => u.includes('challenges.cloudflare.com'))).toHaveLength(1);
  });
});

describe('privacy: the address never reaches a log or a store (§1.2)', () => {
  it('after routing every fixture, no log line and no non-Census request carries the address', async () => {
    const { post, calls } = app();
    for (const f of FIXTURES) expect((await post({ address: f.address })).status).toBe(200);
    for (const f of FIXTURES) {
      const needle = f.address.split(',')[0]; // the street line
      expect(sink.join('\n')).not.toContain(needle);
      for (const url of calls.filter((u) => !u.startsWith('https://geocoding.geo.census.gov/'))) {
        expect(decodeURIComponent(url)).not.toContain(needle);
      }
    }
  });
  it('the response echoes nothing of the address beyond state and district', async () => {
    const { post } = app();
    const text = await (await post({ address: FIXTURES[5].address })).text();
    expect(text).not.toContain('Kennedy');
    expect(text).not.toContain('19107');
  });
  it('the repo on the route path is read-only', () => {
    const repo = new MemoryRepo(rows);
    const writers = Object.getOwnPropertyNames(Object.getPrototypeOf(repo)).filter((n) => /insert|write|save|record|put|set/i.test(n));
    expect(writers).toEqual([]);
  });
});

describe('geocoder parsing', () => {
  it('classifies addresses', () => {
    expect(classifyAddress('19107')).toBe('zip_only');
    expect(classifyAddress('Philadelphia PA')).toBe('incomplete');
    expect(classifyAddress('1400 JFK Blvd, Philadelphia, PA')).toBe('ok');
  });
  it('reads CD119 and STUSAB; at-large "00" and "98" → 0; no match → unresolved', () => {
    expect(parseCensus(censusReply(FIXTURES[0]))).toEqual({ ok: true, state: 'CA', district: 46 });
    const atLarge = censusReply({ ...FIXTURES[0], state: 'CA', district: 0 });
    expect(parseCensus(atLarge)).toEqual({ ok: true, state: 'CA', district: 0 });
    const delegate = JSON.parse(JSON.stringify(atLarge));
    delegate.result.addressMatches[0].geographies['119th Congressional Districts'][0].CD119 = '98';
    expect(parseCensus(delegate)).toEqual({ ok: true, state: 'CA', district: 0 });
    expect(parseCensus({ result: { addressMatches: [] } })).toEqual({ ok: false, reason: 'unresolved' });
    // State from FIPS when the States layer is missing.
    const noStates = JSON.parse(JSON.stringify(censusReply(FIXTURES[1])));
    delete noStates.result.addressMatches[0].geographies.States;
    expect(parseCensus(noStates)).toEqual({ ok: true, state: 'TX', district: 35 });
  });
});

describe('GET /api/goals', () => {
  it('lists active goals without the eligibility rule', async () => {
    const { a } = app();
    const res = await a.request('/api/goals', {}, ENV);
    const body = (await res.json()) as { goals: Record<string, unknown>[] };
    expect(body.goals.map((g) => g.slug)).toEqual(['ndaa-1217', 'house-caucus', 'senate-leader', 'state-bonds']);
    expect(body.goals[0]).not.toHaveProperty('eligibility');
  });
});
