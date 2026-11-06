import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/index';
import { activateSuccessors, loadRows } from '../src/load';
import { MemoryRepo } from '../src/repo';
import { buildRoute } from '../src/route';
import type { Goal } from '../src/types';
import { ENV, fakeFetch } from './fixtures';

const DATA = join(__dirname, '..', '..', 'data');
const TODAY = new Date('2026-11-04T12:00:00Z');

/** Copy data/ to a temp dir and rewrite one goal file so a test can flip a status without touching the repo. */
function dataWith(edits: Record<string, (yaml: string) => string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cut-ties-data-'));
  cpSync(DATA, dir, { recursive: true });
  for (const [slug, edit] of Object.entries(edits)) {
    const p = join(dir, 'goals', `${slug}.yaml`);
    writeFileSync(p, edit(readFileSync(p, 'utf8')));
  }
  return dir;
}
const setStatus = (status: string, note?: string) => (y: string) =>
  y.replace(/^status: .*$/m, `status: ${status}` + (note ? `\noutcome_note: ${note}` : ''));

describe('§2.3 goal lifecycle', () => {
  it('an upcoming successor is hidden while its predecessor is active', async () => {
    const rows = loadRows(DATA, '2026-11-04T00:00:00Z');
    const next = rows.goals.find((g) => g.slug === 'ndaa-report-vote');
    expect(next?.status).toBe('upcoming');
    const active = await new MemoryRepo(rows).activeGoals();
    expect(active.map((g) => g.slug)).not.toContain('ndaa-report-vote');
    expect(active.map((g) => g.slug)).toContain('ndaa-1217');
  });

  it('completing the predecessor in YAML moves the successor to active and the ranking picks it up', async () => {
    const rows = loadRows(dataWith({ 'ndaa-1217': setStatus('completed', 'Conferees struck the section.') }), '2026-11-04T00:00:00Z');
    const repo = new MemoryRepo(rows);
    const active = (await repo.activeGoals()).map((g) => g.slug);
    expect(active).toContain('ndaa-report-vote');
    expect(active).not.toContain('ndaa-1217');
    const r = await buildRoute(repo, 'CA', 46, TODAY);
    expect(r.goals.map((g) => g.slug)).toContain('ndaa-report-vote');
    expect(r.goals.find((g) => g.slug === 'ndaa-report-vote')?.action_href).toBe('/goals/ndaa-report-vote/act/ndaa-report-vote-call');
  });

  it('expiring the predecessor works the same way', () => {
    const rows = loadRows(dataWith({ 'ndaa-1217': setStatus('expired', 'Conference ended without a report.') }));
    expect(rows.goals.find((g) => g.slug === 'ndaa-report-vote')?.status).toBe('active');
  });

  it('a completed or expired goal must carry an outcome note', () => {
    expect(() => loadRows(dataWith({ 'ndaa-1217': setStatus('completed') }))).toThrow(/outcome_note/);
  });

  it('a successor_slug that names no goal, or itself, fails the seed', () => {
    const base = (slug: string, status: Goal['status'], successor: string | null): Goal =>
      ({ slug, status, successor_slug: successor } as unknown as Goal);
    expect(() => activateSuccessors([base('a', 'completed', 'zzz')])).toThrow(/names no goal/);
    expect(() => activateSuccessors([base('a', 'active', 'a')])).toThrow(/itself/);
    const goals = [base('a', 'active', 'b'), base('b', 'upcoming', null)];
    activateSuccessors(goals);
    expect(goals[1].status).toBe('upcoming');
  });

  it('summary over 60 words, bad our_picks and bad sources fail the seed', () => {
    const long = (y: string) => y.replace(/^summary: .*$/m, 'summary: ' + Array(61).fill('word').join(' '));
    expect(() => loadRows(dataWith({ 'state-bonds': long }))).toThrow(/max 60/);
    const picks = (y: string) => y.replace(/^our_picks: .*$/m, 'our_picks: [{"name": "X"}]');
    expect(() => loadRows(dataWith({ 'senate-leader': picks }))).toThrow(/our_picks\[0\] needs rationale/);
    const four = (y: string) => y.replace(/^our_picks: .*$/m, 'our_picks: ' + JSON.stringify(Array(4).fill({ name: 'X', rationale: 'r', source_url: 'https://x' })));
    expect(() => loadRows(dataWith({ 'senate-leader': four }))).toThrow(/max 3/);
    const src = (y: string) => y.replace(/^sources: .*$/m, 'sources: [{"title": "T"}]');
    expect(() => loadRows(dataWith({ 'state-bonds': src }))).toThrow(/sources\[0\] needs url/);
  });
});

describe('GET /api/goals and /api/goals/:slug/targets (§2)', () => {
  const rows = loadRows(DATA, '2026-11-04T00:00:00Z');
  const repo = new MemoryRepo(rows);
  const a = createApp({ repo: () => repo, fetch: fakeFetch().impl, now: () => TODAY });
  const get = (path: string) => a.request(path, {}, ENV);

  it('/api/goals lists active goals by priority, without eligibility or upcoming goals', async () => {
    const body = (await (await get('/api/goals')).json()) as { goals: Goal[] };
    expect(body.goals.map((g) => g.slug)).toEqual(['ndaa-1217', 'house-caucus', 'senate-leader', 'state-bonds']);
    expect(body.goals.every((g) => !('eligibility' in g))).toBe(true);
    expect(body.goals[0].decider).toMatch(/writing the final bill/);
  });

  it('federal goal targets for CA-46: the representative and both senators', async () => {
    const res = await get('/api/goals/ndaa-1217/targets?state=CA&district=46');
    expect(res.status).toBe(200);
    const { targets } = (await res.json()) as { targets: { role: string; name: string; phone: string | null }[] };
    expect(targets.map((t) => t.role)).toEqual(['Rep.', 'Sen.', 'Sen.']);
    expect(targets.every((t) => t.phone)).toBe(true);
  });

  it('leadership goal targets are Democrats only; a state goal targets the treasurer', async () => {
    // TX's sitting senators are both Republicans; the incoming Democrat (Talarico, replacing Cornyn) is the only target.
    const senate = (await (await get('/api/goals/senate-leader/targets?state=TX&district=21')).json()) as { targets: { party: string | null; bioguide_id: string }[] };
    expect(senate.targets.map((t) => t.bioguide_id)).toEqual(['TX-S-talarico']);
    const none = (await (await get('/api/goals/senate-leader/targets?state=WV&district=2')).json()) as { targets: unknown[] };
    expect(none.targets).toEqual([]);
    const house = (await (await get('/api/goals/house-caucus/targets?state=PA&district=2')).json()) as { targets: { party: string | null }[] };
    expect(house.targets.map((t) => t.party)).toEqual(['D']);
    const state = (await (await get('/api/goals/state-bonds/targets?state=CA&district=46')).json()) as { targets: { role: string }[] };
    expect(state.targets.map((t) => t.role)).toEqual(['Treasurer']);
  });

  it('unknown or upcoming goal → 404 no_goal; bad params → 400; empty delegation → 404', async () => {
    expect((await get('/api/goals/nope/targets?state=CA&district=46')).status).toBe(404);
    expect(((await (await get('/api/goals/ndaa-report-vote/targets?state=CA&district=46')).json()) as { error: string }).error).toBe('no_goal');
    expect((await get('/api/goals/ndaa-1217/targets?state=California&district=46')).status).toBe(400);
    expect((await get('/api/goals/ndaa-1217/targets?state=CA')).status).toBe(400);
    expect(((await (await get('/api/goals/ndaa-1217/targets?state=ZZ&district=0')).json()) as { error: string }).error).toBe('no_delegation');
  });
});
