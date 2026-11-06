// §7.2 digest: counts by code, prose by a stubbed Haiku, one email with the raw rows as CSV.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANTHROPIC_URL } from '../src/anthropic';
import { DOC_MODEL } from '../src/anthropic';
import { DIGEST_MODEL, buildDigest, buildMime, buildSpend, digestTable, runDigest, spendTable, summariseAbuse, type Mail } from '../src/digest';
import { loadRows, parseCsv } from '../src/load';
import { MemoryRepo, sumTokens } from '../src/repo';
import { scheduled } from '../src/index';
import type { Env, GenerationRow, ReportRow } from '../src/types';
import { ENV } from './fixtures';

const rows = loadRows(join(__dirname, '..', '..', 'data'), '2026-11-04T00:00:00Z');
const NOW = new Date('2026-11-05T09:00:00Z');
const SINCE = new Date('2026-11-04T09:00:00Z');
const ndaa = rows.goals.find((g) => g.slug === 'ndaa-1217')!;
const bonds = rows.goals.find((g) => g.slug === 'state-bonds')!;
const CORREA = 'C001110';
const PADILLA = rows.members.find((m) => m.chamber === 'senate' && m.state === 'CA')!.bioguide_id;
const CALL = rows.actions.find((a) => a.goal_id === ndaa.id)!;

const gen = (over: Partial<GenerationRow>): GenerationRow => ({
  action_id: CALL.id, target_id: CORREA, shingles: new Uint32Array(), created_at: '2026-11-04T15:00:00Z', device_hash: 'dev-g', ip_hash: 'ip-g',
  input_tokens: 900, output_tokens: 200, model: DOC_MODEL, attempt: 1, check_fail: null, ...over,
});
// generation-cost §2 acceptance: 12 documents, 3 of them redrafts. 9 × $0.0077 + 3 × $0.0153 = $0.1152.
const TWELVE: GenerationRow[] = [
  ...Array.from({ length: 9 }, (_, i) => gen({ device_hash: `dev-g${i}` })),
  gen({ input_tokens: 1800, output_tokens: 400, attempt: 2, check_fail: 'digit' }),
  gen({ input_tokens: 1800, output_tokens: 400, attempt: 2, check_fail: 'digit' }),
  gen({ input_tokens: 1800, output_tokens: 400, attempt: 2, check_fail: 'word_count' }),
];

const report = (over: Partial<ReportRow>): ReportRow => ({
  bioguide_id: CORREA, goal_id: ndaa.id, outcome: 'will_support', note: null, created_at: '2026-11-04T15:00:00Z', device_hash: 'dev-a', ...over,
});
const REPORTS: ReportRow[] = [
  report({}),
  report({ created_at: '2026-11-04T16:00:00Z', device_hash: 'dev-b', note: 'Staffer said "yes, he\'ll vote no on 1217", call back Monday' }),
  report({ outcome: 'undecided', created_at: '2026-11-04T17:00:00Z', device_hash: 'dev-c' }),
  report({ bioguide_id: PADILLA, outcome: 'no_answer', created_at: '2026-11-04T18:00:00Z', device_hash: 'dev-d' }),
  report({ goal_id: bonds.id, outcome: 'other', created_at: '2026-11-04T19:00:00Z', device_hash: 'dev-e' }),
];

function stub(opts: { prose?: string; fail?: boolean } = {}) {
  const calls: Record<string, unknown>[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url !== ANTHROPIC_URL) throw new Error(`unexpected fetch ${url}`);
    const req = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push(req);
    if (opts.fail) return new Response('nope', { status: 529 });
    expect(req.model).toBe(DIGEST_MODEL);
    return Response.json({ content: [{ type: 'text', text: opts.prose ?? 'Correa drew 2 will-support reports and 1 undecided on ndaa-1217, plus 1 on state bonds; Padilla\'s office gave no answer once.' }], usage: { input_tokens: 1, output_tokens: 1 } });
  }) as typeof fetch;
  return { impl, calls };
}

function job(opts: { prose?: string; fail?: boolean; reports?: ReportRow[]; gens?: GenerationRow[]; env?: Partial<Env> } = {}) {
  const repo = new MemoryRepo(rows);
  repo.reports.push(...(opts.reports ?? REPORTS));
  repo.generations.push(...(opts.gens ?? []));
  repo.screenings.push({ device_hash: 'dev-x', action_id: 1, class: 'injection', created_at: '2026-11-04T20:00:00Z' }, { device_hash: 'dev-x', action_id: 1, class: 'off_topic', created_at: '2026-11-04T20:05:00Z' });
  repo.blocks.set('dev-x', '2026-11-06T00:00:00Z');
  repo.blocks.set('dev-old', '2026-11-01T00:00:00Z');
  repo.digestRuns.push({ ran_at: SINCE.toISOString(), report_count: 0 });
  const f = stub(opts);
  const sent: Mail[] = [];
  const env: Env = { ...ENV, ANTHROPIC_API_KEY: 'k', MAINTAINER_EMAIL: 'maintainer@example.org', DIGEST_FROM: 'digest@example.org', ...opts.env };
  const run = () => runDigest({ repo, fetch: f.impl, now: () => NOW, send: async (_e, m) => { sent.push(m); }, log: () => {} }, env);
  return { repo, run, sent, calls: f.calls };
}

describe('buildDigest', () => {
  it('counts member × goal × outcome by code and renders the raw rows as CSV', () => {
    const d = buildDigest(REPORTS, rows.members, rows.goals, SINCE, NOW);
    expect(d.total).toBe(5);
    expect(d.counts.map((c) => `${c.member}|${c.goal_slug}|${c.outcome}|${c.n}`)).toEqual([
      `${rows.members.find((m) => m.bioguide_id === PADILLA)!.name}|ndaa-1217|no_answer|1`,
      'Lou Correa|ndaa-1217|will_support|2',
      'Lou Correa|ndaa-1217|undecided|1',
      'Lou Correa|state-bonds|other|1',
    ]);
    const parsed = parseCsv(d.csv);
    expect(parsed).toHaveLength(5);
    expect(Object.keys(parsed[0])).toEqual(['bioguide_id', 'member', 'goal_slug', 'outcome', 'note', 'created_at', 'device_hash']);
    expect(parsed[1].note).toBe('Staffer said "yes, he\'ll vote no on 1217", call back Monday');
    expect(parsed.map((r) => r.created_at)).toEqual(REPORTS.map((r) => r.created_at));
  });

  it('is empty for no reports and the table still reads', () => {
    const d = buildDigest([], rows.members, rows.goals, SINCE, NOW);
    expect(d.counts).toEqual([]);
    expect(d.csv.trim()).toBe('bioguide_id,member,goal_slug,outcome,note,created_at,device_hash');
    expect(digestTable(d, summariseAbuse([], []))).toContain('Reports 2026-11-04 → 2026-11-05: 0');
  });
});

describe('runDigest', () => {
  it('sends one email with Haiku prose, the code table and the rows attached as CSV; positions untouched', async () => {
    const j = job();
    const before = JSON.stringify(await j.repo.positionsFor(rows.members.map((m) => m.bioguide_id), rows.goals.map((g) => g.id)));
    const r = await j.run();
    expect(r).toMatchObject({ sent: true, total: 5, model: DIGEST_MODEL, since: SINCE.toISOString() });
    expect(j.sent).toHaveLength(1);
    const m = j.sent[0];
    expect(m.to).toBe('maintainer@example.org');
    expect(m.subject).toBe('[cut-ties] 5 reports · 2026-11-05');
    expect(m.text).toContain('Correa drew 2 will-support reports');
    expect(m.text).toContain('ndaa-1217 · will_support: 2');
    expect(m.text).toContain('Screened out: injection 1, off_topic 1');
    expect(m.text).toContain('Blocked devices: 1');
    expect(m.attachment.filename).toBe('reports-2026-11-05.csv');
    expect(parseCsv(m.attachment.content)).toHaveLength(5);
    // the prose call carried only the counts table, never a note or a device hash
    expect(j.calls).toHaveLength(1);
    const content = String((j.calls[0].messages as { content: string }[])[0].content);
    expect(content).toContain('ndaa-1217 · will_support: 2');
    expect(content).not.toContain('Staffer said');
    expect(content).not.toContain('dev-a');
    expect(JSON.stringify(await j.repo.positionsFor(rows.members.map((m) => m.bioguide_id), rows.goals.map((g) => g.id)))).toBe(before);
    expect(j.repo.digestRuns.at(-1)).toEqual({ ran_at: NOW.toISOString(), report_count: 5 });
  });

  it('no new reports → no email and no Anthropic call; the run is still recorded', async () => {
    const j = job({ reports: [report({ created_at: '2026-11-04T08:59:00Z' })] }); // before the last run
    expect(await j.run()).toEqual({ sent: false, reason: 'no_reports', since: SINCE.toISOString() });
    expect(j.sent).toHaveLength(0);
    expect(j.calls).toHaveLength(0);
    expect(j.repo.digestRuns.at(-1)).toEqual({ ran_at: NOW.toISOString(), report_count: 0 });
  });

  it('prose with a number that is not in the counts is dropped for the table; an API error too', async () => {
    const a = job({ prose: 'There were 12 reports from 7 offices.' });
    const ra = await a.run();
    expect(ra).toMatchObject({ sent: true, model: null });
    expect(a.sent[0].text).not.toContain('12 reports');
    expect(a.sent[0].text).toContain('Reports 2026-11-04 → 2026-11-05: 5');
    const b = job({ fail: true });
    expect(await b.run()).toMatchObject({ sent: true, model: null });
    expect(b.sent[0].text).toContain('Lou Correa (C001110)');
  });

  it('without MAINTAINER_EMAIL nothing is sent, read or recorded', async () => {
    const j = job({ env: { MAINTAINER_EMAIL: '' } });
    expect(await j.run()).toMatchObject({ sent: false, reason: 'no_recipient' });
    expect(j.sent).toHaveLength(0);
    expect(j.repo.digestRuns).toHaveLength(1);
  });

  it('first run with no marker looks back one week', async () => {
    const j = job({ reports: [report({ created_at: '2026-10-29T08:00:00Z' }), report({ created_at: '2026-10-29T10:00:00Z' })] });
    j.repo.digestRuns.length = 0;
    expect(await j.run()).toMatchObject({ sent: true, total: 1, since: '2026-10-29T09:00:00.000Z' });
  });

  it('a week of reports since the last run arrives in one email', async () => {
    const j = job({ reports: [report({ created_at: '2026-10-30T12:00:00Z' }), report({ created_at: '2026-11-02T12:00:00Z' }), report({ created_at: '2026-11-05T08:00:00Z' })] });
    j.repo.digestRuns.length = 0;
    j.repo.digestRuns.push({ ran_at: '2026-10-29T09:00:00.000Z', report_count: 0 });
    expect(await j.run()).toMatchObject({ sent: true, total: 3 });
    expect(j.sent).toHaveLength(1);
  });

  it('the Worker exports a scheduled handler, scheduled weekly (Mondays 09:00 UTC)', () => {
    expect(typeof scheduled).toBe('function');
    const cfg = readFileSync(join(__dirname, '..', 'wrangler.jsonc'), 'utf8');
    expect(cfg).toMatch(/"crons": \["0 9 \* \* 1"\]/);
  });
});

describe('LLM spend (generation-cost §2)', () => {
  it('12 documents and 3 redrafts: counts, fixture-price dollars, month to date, budget and cap in the table; prose digits bounded', async () => {
    const j = job({ gens: TWELVE, prose: 'Five reports came in. Generation ran 12 documents with 3 redrafts for $0.12 of the $15.00 budget; the cap is 22.' });
    const r = await j.run();
    expect(r).toMatchObject({ sent: true, total: 5, model: DIGEST_MODEL, alert: null });
    const text = j.sent[0].text;
    expect(text).toContain('LLM spend\n  since last run: 12 documents, 3 redrafts, 0 standard scripts, $0.12');
    expect(text).toContain('  month to date: $0.12 of $15.00 (1%)');
    expect(text).toContain("  today's cap: 22 documents"); // floor((15 − 0.1152) / 26 days / 0.025 default blended)
    expect(text).toContain(`  ${CALL.slug}: 12 documents, redrafts 25% (digit 2, word_count 1)`);
    expect(text).toContain('Generation ran 12 documents'); // the prose stayed: every digit run is in the table
    expect(j.sent[0].subject).toBe('[cut-ties] 5 reports · 2026-11-05');
    // the prose call saw the spend block (it may restate it) and nothing else new
    expect(String((j.calls[0].messages as { content: string }[])[0].content)).toContain('LLM spend');
  });

  it('a prose number that is only almost in the spend block still drops the prose', async () => {
    const j = job({ gens: TWELVE, prose: 'Generation cost $0.13 across 12 documents.' });
    expect(await j.run()).toMatchObject({ sent: true, model: null });
    expect(j.sent[0].text).not.toContain('$0.13');
  });

  it('standard rows count without cost and the per-action line names them', () => {
    const spend = buildSpend(sumTokens([...TWELVE, gen({ model: 'standard', input_tokens: 0, output_tokens: 0 }), gen({ model: 'standard', input_tokens: 0, output_tokens: 0 })]), 0.1152, 15, 22, rows.actions);
    expect(spend.window).toEqual({ docs: 12, redrafts: 3, standard: 2, usd: expect.closeTo(0.1152, 6) });
    expect(spendTable(spend)).toContain(`${CALL.slug}: 12 documents, redrafts 25% (digit 2, word_count 1), 2 standard`);
    expect(spendTable(spend)).toContain('since last run: 12 documents, 3 redrafts, 2 standard scripts, $0.12');
  });

  it('crossing 80% of the budget sends once with zero reports; the next run with nothing new sends nothing', async () => {
    // one Opus row at 150k in / 10k out = $0.60 + $0.20 + the screen allowance ≥ 80% of a $1 budget
    const j = job({ reports: [], gens: [gen({ input_tokens: 150_000, output_tokens: 10_000 })], env: { LLM_MONTHLY_BUDGET_USD: '1' } });
    const r = await j.run();
    expect(r).toMatchObject({ sent: true, total: 0, model: null, alert: 'budget80' });
    expect(j.sent).toHaveLength(1);
    expect(j.sent[0].subject).toBe('[cut-ties] LLM budget 80% · 2026-11-05');
    expect(j.sent[0].text).toContain('month to date: $0.80 of $1.00 (80%)');
    expect(j.sent[0].text).toContain("today's cap: 20 documents"); // the floor: the budget is nearly gone
    expect(j.calls).toHaveLength(0); // no prose call for a spend-only mail
    expect(j.repo.digestRuns.at(-1)).toEqual({ ran_at: NOW.toISOString(), report_count: 0 });
    // next night: the spend before the last run is already over the share, so nothing crosses again
    expect(await j.run()).toEqual({ sent: false, reason: 'no_reports', since: NOW.toISOString() });
    expect(j.sent).toHaveLength(1);
  });

  it('under the share, or with the budget at 0, no spend-only mail; with reports the subject carries both', async () => {
    const under = job({ reports: [], gens: [gen({ input_tokens: 100_000 })], env: { LLM_MONTHLY_BUDGET_USD: '1' } });
    expect(await under.run()).toMatchObject({ sent: false, reason: 'no_reports' });
    const zero = job({ reports: [], gens: [gen({ input_tokens: 150_000, output_tokens: 10_000 })], env: { LLM_MONTHLY_BUDGET_USD: '0' } });
    expect(await zero.run()).toMatchObject({ sent: false, reason: 'no_reports' });
    const both = job({ gens: [gen({ input_tokens: 150_000, output_tokens: 10_000 })], env: { LLM_MONTHLY_BUDGET_USD: '1' } });
    expect(await both.run()).toMatchObject({ sent: true, total: 5, alert: 'budget80' });
    expect(both.sent[0].subject).toBe('[cut-ties] 5 reports · LLM budget 80% · 2026-11-05');
  });
});

describe('buildMime', () => {
  it('is multipart/mixed with a text part and a base64 CSV attachment that round-trips', () => {
    const csv = 'a,b\n1,"x, y"\nünï,ç\n';
    const raw = buildMime({ from: 'digest@example.org', to: 'm@example.org', subject: 'S', text: 'hello', attachment: { filename: 'r.csv', content: csv } }, NOW);
    expect(raw).toMatch(/^From: digest@example.org\r\nTo: m@example.org\r\nSubject: S\r\n/);
    expect(raw).toContain('Content-Type: multipart/mixed; boundary="');
    expect(raw).toContain('Content-Disposition: attachment; filename="r.csv"');
    const b64 = raw.split('Content-Transfer-Encoding: base64\r\n')[1].split('\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, '');
    expect(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))).toBe(csv);
  });
});
