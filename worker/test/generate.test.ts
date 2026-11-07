// §4 acceptance: limits, guardrails, the deterministic output check and shingle uniqueness.
// Anthropic is a canned fetch stub (SSE for Opus, JSON for Haiku); nothing touches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { createApp } from '../src/index';
import { loadRows } from '../src/load';
import { MemoryRepo, decodeShingles } from '../src/repo';
import { ANTHROPIC_URL, DOC_MODEL, SCREEN_MODEL, encodeSse, sseEvents } from '../src/anthropic';
import { BodyExtractor, checkOutput, docRequest, overlap, parseFormat, parseSchema, sanitize, shapeFields, shingles, wordCount, type Doc, type GenerateContext } from '../src/generate';
import type { GenerationRow, ScreenClass } from '../src/types';
import { ENV, fakeFetch } from './fixtures';
import { ABUSIVE, BENIGN } from './fixtures.screen';

const rows = loadRows(join(__dirname, '..', '..', 'data'), '2026-11-04T00:00:00Z');
const TODAY = new Date('2026-11-04T12:00:00Z');
const KEYED = { ...ENV, ANTHROPIC_API_KEY: 'test-key' };
const DEVICE = 'device-0123456789abcdef';
const CORREA = 'C001110';
const FIELDS = { first_name: 'Maya', city: 'Santa Ana', why: 'My cousin is deployed and I do not want him folded into someone else\'s war.' };

const VOCAB = 'families neighbors taxes hospitals schools veterans budget safety honesty courage history faith conscience children future peace law treaty record district town county nation money bonds weapons pipelines operations trust promise duty voice letter morning evening week month year'.split(' ');
function filler(seed: number, n: number): string {
  let x = (seed * 2654435761) >>> 0;
  const w: string[] = [];
  for (let i = 0; i < n; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; w.push(VOCAB[(x >>> 16) % VOCAB.length]); }
  return w.join(' ');
}
/** A script that passes every §4.8.4 rule for Rep. Correa on ndaa-1217-call; `seed` varies the wording. */
function validDoc(fields: Record<string, string>, seed: number): Doc {
  const head = `Hi, this is ${fields.first_name} from ${fields.city}. ${fields.why} I am asking Rep. Correa to drop the integration section, section 1217, from the NDAA.`;
  const tail = 'Thank you for your time.';
  const body = `${head} ${filler(seed, Math.max(8, 95 - wordCount(head) - wordCount(tail)))}. ${tail}`;
  return { subject: '', body, facts_used: ['Target: Rep. Lou Correa (D, CA-46)'] };
}

interface StubOpts {
  turnstileOk?: boolean;
  screen?: (content: string) => { class: 'ok' | ScreenClass; reason: string };
  doc?: (req: Record<string, unknown>, opusCall: number) => Doc | string;
  /** HTTP status every Opus / Haiku call answers with instead of a body (generation-cost §4 upstream path). */
  opusStatus?: number;
  haikuStatus?: number;
}
function stubFetch(opts: StubOpts = {}) {
  const base = fakeFetch({ turnstileOk: opts.turnstileOk });
  const calls = { opus: 0, haiku: 0, bodies: [] as Record<string, unknown>[] };
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url !== ANTHROPIC_URL) return base.impl(input, init);
    const req = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.bodies.push(req);
    const content = String((req.messages as { content: string }[])[0].content);
    if (req.model === SCREEN_MODEL) {
      calls.haiku++;
      if (opts.haikuStatus) return new Response('overloaded', { status: opts.haikuStatus });
      const verdict = opts.screen ? opts.screen(content) : { class: 'ok', reason: '' };
      return Response.json({ content: [{ type: 'text', text: JSON.stringify(verdict) }], usage: { input_tokens: 50, output_tokens: 10 } });
    }
    expect(req.model).toBe(DOC_MODEL);
    calls.opus++;
    if (opts.opusStatus) return new Response('overloaded', { status: opts.opusStatus });
    const fieldsBlock = content.split('<user_fields>')[1] ?? '';
    const f = Object.fromEntries(['First name', 'City', 'Why this matters to you'].map((l, i) => [['first_name', 'city', 'why'][i], (fieldsBlock.match(new RegExp(`${l}: (.*)`)) ?? [, ''])[1]]));
    const seed = [...f.why].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 100_000;
    const doc = opts.doc ? opts.doc(req, calls.opus) : validDoc(f, calls.opus * 100_000 + seed);
    const text = typeof doc === 'string' ? doc : JSON.stringify(doc);
    const events: { event: string; data: unknown }[] = [
      { event: 'message_start', data: { type: 'message_start', message: { usage: { input_tokens: 900, output_tokens: 1 } } } },
      { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
    ];
    for (let i = 0; i < text.length; i += 17) events.push({ event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 17) } } });
    events.push({ event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } });
    events.push({ event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 200 } } });
    events.push({ event: 'message_stop', data: { type: 'message_stop' } });
    return new Response(encodeSse(events), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
  return { impl, calls };
}

function app(opts: StubOpts = {}) {
  const f = stubFetch(opts);
  const repo = new MemoryRepo(rows);
  const a = createApp({ repo: () => repo, fetch: f.impl, now: () => TODAY });
  const post = (path: string, body: unknown, env: Record<string, unknown> = KEYED, ip = '203.0.113.9') =>
    a.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip } }, env);
  const generate = (over: Record<string, unknown> = {}, env: Record<string, unknown> = KEYED, ip?: string) =>
    post('/api/generate', { action: 'ndaa-1217-call', target: CORREA, fields: FIELDS, device: DEVICE, ...over }, env, ip);
  return { a, repo, post, generate, calls: f.calls };
}

interface Ev { event: string; data: Record<string, unknown> }
async function events(res: Response): Promise<Ev[]> {
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const out: Ev[] = [];
  for await (const e of sseEvents(res.body!)) out.push({ event: e.event, data: JSON.parse(e.data) as Record<string, unknown> });
  return out;
}
const doneOf = (evs: Ev[]) => evs.find((e) => e.event === 'done')?.data as { body: string; subject: string; words: number; target: { name: string; phones: string[] }; standard: boolean; reason?: string; variant?: string } | undefined;

function genRow(over: Partial<GenerationRow>): GenerationRow {
  return { action_id: 2, target_id: CORREA, shingles: new Uint32Array(0), created_at: new Date(TODAY.getTime() - 60_000).toISOString(), device_hash: 'x', ip_hash: 'y', input_tokens: 0, output_tokens: 0, model: DOC_MODEL, attempt: 1, check_fail: null, ...over };
}
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

let sink: string[];
beforeEach(() => {
  sink = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { sink.push(args.map(String).join(' ')); });
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/generate — happy path', () => {
  it('streams status, deltas and done; stores shingles and hashes, never text', async () => {
    const { generate, repo, calls } = app();
    const evs = await events(await generate());
    expect(evs[0]).toEqual({ event: 'status', data: { stage: 'drafting' } });
    const deltas = evs.filter((e) => e.event === 'delta').map((e) => e.data.text as string).join('');
    const done = doneOf(evs)!;
    expect(done.body).toBe(deltas);
    expect(done.body).toContain('Correa');
    expect(done.words).toBe(wordCount(done.body));
    expect(done.target.name).toBe('Lou Correa');
    expect(done.target.phones).toEqual(['202-225-2965', '714-559-6190']); // DC, then the district_phone the loader derives from district_offices.csv (roster-freshness §1)
    expect(calls.haiku).toBe(1);
    expect(calls.opus).toBe(1);
    expect(repo.generations).toHaveLength(1);
    const row = repo.generations[0];
    expect(row.shingles.length).toBeGreaterThan(20);
    expect(row.device_hash).toBe(await sha(DEVICE));
    expect(row.device_hash).not.toBe(DEVICE);
    expect(row.input_tokens).toBe(900);
    expect(row.output_tokens).toBe(200);
    expect(row.model).toBe(DOC_MODEL);
    expect([row.attempt, row.check_fail]).toEqual([1, null]);
    expect(done.standard).toBe(false);
    expect(JSON.stringify(row)).not.toContain(FIELDS.why);
    expect(sink.join('\n')).not.toContain(FIELDS.why);
  });

  it('sends the stable prefix with cache_control, the untrusted blocks last, max_tokens 700 at low effort for a call script, and the JSON schema', async () => {
    const { generate, calls } = app();
    await events(await generate());
    const opus = calls.bodies.find((b) => b.model === DOC_MODEL)!;
    expect(opus.max_tokens).toBe(700); // generation-cost §3
    expect((opus.output_config as { effort: string }).effort).toBe('low');
    expect(opus.stream).toBe(true);
    expect(opus.fallbacks).toBe('default');
    const sys = opus.system as { text: string; cache_control: unknown }[];
    expect(sys[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sys[0].text).toContain('Action guidance');
    const user = (opus.messages as { content: string }[])[0].content;
    expect(user).toMatch(/<facts>[\s\S]*<\/facts>\n<user_fields>[\s\S]*<\/user_fields>$/);
    expect(user).toContain('Target: Rep. Lou Correa (D, CA-46)');
    expect((opus.output_config as { format: { type: string } }).format.type).toBe('json_schema');
    const haiku = calls.bodies.find((b) => b.model === SCREEN_MODEL)!;
    expect(haiku.stream).toBeUndefined();
  });

  it('state-scope actions take a state code, not a member', async () => {
    const { generate } = app();
    const evs = await events(await generate({ action: 'state-bonds-call', target: 'TX', fields: { ...FIELDS, city: 'Austin' } }, KEYED));
    expect(doneOf(evs)).toBeUndefined(); // the canned doc names Correa, so the check refuses it: the target resolved, though
    expect(evs.at(-1)?.event).toBe('error');
    const bad = await generate({ action: 'state-bonds-call', target: CORREA });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe('no_target');
  });
});

describe('POST /api/generate — bookkeeping writes are best-effort (D1 write cap, 2026-11-06)', () => {
  it('a failing generations INSERT after a good draft still ends in done, and is logged', async () => {
    const { generate, repo } = app();
    repo.insertGeneration = async () => { throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row write limit."); };
    const evs = await events(await generate());
    expect(evs.map((e) => e.event)).not.toContain('error');
    expect(doneOf(evs)?.body).toContain('Rep. Correa');
    expect(sink.join('\n')).toContain('generate: generations write failed');
    expect(sink.join('\n')).not.toContain('generate: failed');
  });

  it('the standard-script path survives the same failure', async () => {
    const { generate, repo } = app();
    repo.insertGeneration = async () => { throw new Error('D1_ERROR: write limit'); };
    const evs = await events(await generate({}, ENV as unknown as Record<string, unknown>)); // no API key → standard script
    expect(doneOf(evs)?.standard).toBe(true);
    expect(sink.join('\n')).toContain('generate: generations write failed');
  });

  it('a failing screenings INSERT still answers the screened-out caller with 422', async () => {
    const { generate, repo } = app({ screen: () => ({ class: 'off_topic', reason: 'Not about this goal.' }) });
    repo.insertScreening = async () => { throw new Error('D1_ERROR: write limit'); };
    const res = await generate();
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe('screened');
    expect(sink.join('\n')).toContain('generate: screening write failed');
  });
});

describe('decodeShingles (D1 returns BLOB columns as byte arrays)', () => {
  const sh = Uint32Array.from([1, 0xdeadbeef, 2 ** 32 - 1, 7]);
  it('decodes the byte array D1 hands back', () => {
    expect(decodeShingles(Array.from(new Uint8Array(sh.buffer)))).toEqual(sh);
  });
  it('decodes an ArrayBuffer or a typed view, and drops a trailing partial lane', () => {
    expect(decodeShingles(sh.buffer)).toEqual(sh);
    expect(decodeShingles(new Uint8Array(sh.buffer))).toEqual(sh);
    expect(decodeShingles([...new Uint8Array(sh.buffer), 9, 9])).toEqual(sh);
    expect(decodeShingles([])).toEqual(new Uint32Array(0));
    expect(decodeShingles(null)).toEqual(new Uint32Array(0));
  });
  it('round-trips through overlap: the stored shingles of a body match that body', () => {
    const a = shingles(validDoc(FIELDS, 1).body);
    expect(overlap(decodeShingles(Array.from(new Uint8Array(a.buffer))), a)).toBe(1);
  });
});

describe('POST /api/generate — rejections before any Anthropic call', () => {
  it('400 on bad JSON first: shape is checked before the key', async () => {
    const { post, calls } = app();
    const res = await post('/api/generate', { action: 'ndaa-1217-call', device: 'short' }, ENV as unknown as Record<string, unknown>);
    expect(res.status).toBe(400);
    expect(calls.opus + calls.haiku).toBe(0);
  });

  it('400 on bad JSON, unknown action, wrong chamber, unknown field, missing or over-long field', async () => {
    const { a, generate, calls } = app();
    const raw = await a.request('/api/generate', { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } }, KEYED);
    expect(raw.status).toBe(400);
    for (const [over, error] of [
      [{ action: 'nope' }, 'no_action'],
      [{ action: 'senate-leader-call', target: CORREA }, 'no_target'],
      [{ fields: { ...FIELDS, email: 'a@b.c' } }, 'bad_fields'],
      [{ fields: { first_name: 'Maya', city: 'Santa Ana' } }, 'bad_fields'],
      [{ fields: { ...FIELDS, first_name: 'M'.repeat(41) } }, 'bad_fields'],
      [{ fields: { ...FIELDS, why: 7 } }, 'bad_fields'],
      [{ device: 'short' }, 'bad_request'],
    ] as const) {
      const res = await generate(over);
      expect(res.status, JSON.stringify(over)).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(error);
    }
    expect(calls.opus + calls.haiku).toBe(0);
  });

  it('403 without a valid Turnstile token when the secret is set', async () => {
    const { generate, calls } = app({ turnstileOk: false });
    const res = await generate({ turnstile: 'bad' }, { ...KEYED, TURNSTILE_SECRET: 's' });
    expect(res.status).toBe(403);
    expect(calls.opus + calls.haiku).toBe(0);
  });

  it('403 from a blocked device', async () => {
    const { generate, repo, calls } = app();
    await repo.block(await sha(DEVICE), new Date(TODAY.getTime() + 3_600_000));
    const res = await generate();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('blocked');
    expect(calls.opus + calls.haiku).toBe(0);
  });

  it('guards reject before the standard script: a blocked device and the hourly limit with no key (generation-cost §4)', async () => {
    const blocked = app();
    await blocked.repo.block(await sha(DEVICE), new Date(TODAY.getTime() + 3_600_000));
    const res = await blocked.generate({}, ENV as unknown as Record<string, unknown>);
    expect(res.status).toBe(403);
    const limited = app();
    const dh = await sha(DEVICE);
    limited.repo.generations.push(...Array.from({ length: 5 }, (_, i) => genRow({ device_hash: dh, action_id: 9, created_at: new Date(TODAY.getTime() - (i + 1) * 60_000).toISOString() })));
    const r2 = await limited.generate({}, ENV as unknown as Record<string, unknown>);
    expect(r2.status).toBe(429);
    expect(((await r2.json()) as { error: string }).error).toBe('limit_hour');
    expect(blocked.calls.opus + blocked.calls.haiku + limited.calls.opus + limited.calls.haiku).toBe(0);
  });

  it('429 past 5/hour, 20/day, 3/action/day and 30/IP/day', async () => {
    const dh = await sha(DEVICE);
    const ih = await sha('203.0.113.9');
    const cases: [string, GenerationRow[]][] = [
      ['limit_hour', Array.from({ length: 5 }, (_, i) => genRow({ device_hash: dh, action_id: 9, created_at: new Date(TODAY.getTime() - (i + 1) * 60_000).toISOString() }))],
      ['limit_day', Array.from({ length: 20 }, (_, i) => genRow({ device_hash: dh, action_id: 9, created_at: new Date(TODAY.getTime() - 2 * 3_600_000 - i * 60_000).toISOString() }))],
      ['limit_action', Array.from({ length: 3 }, (_, i) => genRow({ device_hash: dh, action_id: 2, created_at: new Date(TODAY.getTime() - 2 * 3_600_000 - i * 60_000).toISOString() }))],
      ['limit_ip', Array.from({ length: 30 }, (_, i) => genRow({ device_hash: `d${i}`, ip_hash: ih, created_at: new Date(TODAY.getTime() - 2 * 3_600_000 - i * 60_000).toISOString() }))],
    ];
    for (const [error, seed] of cases) {
      const { generate, repo, calls } = app();
      repo.generations.push(...seed);
      const res = await generate();
      expect(res.status, error).toBe(429);
      expect(((await res.json()) as { error: string }).error).toBe(error);
      expect(calls.opus + calls.haiku).toBe(0);
    }
    // One under each limit still generates.
    const { generate, repo, calls } = app();
    repo.generations.push(...Array.from({ length: 4 }, () => genRow({ device_hash: dh, action_id: 9 })));
    expect(doneOf(await events(await generate()))).toBeDefined();
    expect(calls.opus).toBe(1);
  });
});

describe('POST /api/generate — screen (§4.8.2) and abuse response (§4.8.5)', () => {
  const screen = (content: string) => {
    const hit = ABUSIVE.find((a) => content.includes(a.key));
    return hit ? { class: hit.cls, reason: `Flagged: ${hit.cls}` } : { class: 'ok' as const, reason: '' };
  };

  it(`${ABUSIVE.length} abusive inputs: zero documents, zero Opus calls, screenings logged without content`, async () => {
    expect(ABUSIVE.length).toBeGreaterThanOrEqual(40);
    for (const a of ABUSIVE) {
      const { generate, repo, calls } = app({ screen });
      const res = await generate({ fields: { ...FIELDS, ...a.fields } });
      expect(res.status, a.key).toBe(422);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe('screened');
      expect(body.message.split('\n')).toHaveLength(1);
      expect(calls.opus).toBe(0);
      expect(repo.generations).toHaveLength(0);
      expect(repo.screenings).toHaveLength(1);
      expect(repo.screenings[0]).toEqual({ device_hash: await sha(DEVICE), action_id: 2, class: a.cls, created_at: TODAY.toISOString() });
      // Nothing the user typed reaches Opus; what reaches Haiku is already stripped of URLs, emails and phones.
      const haiku = calls.bodies[0];
      expect(JSON.stringify(haiku)).not.toMatch(/https?:\/\/|www\.|@[a-z]+\.|\d{3}[-.\s]\d{3}[-.\s]\d{4}/i);
    }
  });

  it(`${BENIGN.length} benign inputs with unusual phrasing all pass the screen`, async () => {
    expect(BENIGN.length).toBeGreaterThanOrEqual(20);
    for (const why of BENIGN) {
      const { generate, calls } = app({ screen });
      const evs = await events(await generate({ fields: { ...FIELDS, why } }));
      expect(doneOf(evs), why).toBeDefined();
      expect(calls.opus).toBe(1);
    }
  });

  it('the third screened-out attempt in a day blocks the device for 24 hours', async () => {
    const { generate, repo, calls } = app({ screen });
    for (let i = 0; i < 3; i++) expect((await generate({ fields: { ...FIELDS, why: ABUSIVE[i].fields.why ?? ABUSIVE[i].key } })).status).toBe(422);
    const until = await repo.blockedUntil(await sha(DEVICE));
    expect(until?.toISOString()).toBe(new Date(TODAY.getTime() + 24 * 3_600_000).toISOString());
    const res = await generate();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('blocked');
    expect(calls.haiku).toBe(3);
    expect(calls.opus).toBe(0);
  });
});

describe('POST /api/generate — standard script (generation-cost §4)', () => {
  const NOKEY = ENV as unknown as Record<string, unknown>;
  /** The §4 stream: status standard, exactly one delta, done {standard: true}, a 60–160-word body that passes the check. */
  async function expectStandard(res: Response, reason: string) {
    const evs = await events(res);
    expect(evs[0]).toEqual({ event: 'status', data: { stage: 'standard', reason } });
    const deltas = evs.filter((e) => e.event === 'delta');
    expect(deltas).toHaveLength(1);
    const done = doneOf(evs)!;
    expect(done.standard).toBe(true);
    expect(done.reason).toBe(reason);
    expect(done.body).toBe(deltas[0].data.text);
    expect(done.body).toContain('Correa');
    expect(done.body).toContain('integration section');
    expect(done.body).toContain('drop the integration section');
    expect(done.body).toContain(FIELDS.first_name);
    expect(done.body).toContain(FIELDS.why);
    expect(done.body).not.toMatch(/\{\{|\}\}/);
    expect(done.words).toBe(wordCount(done.body));
    expect(done.words).toBeGreaterThanOrEqual(60);
    expect(done.words).toBeLessThanOrEqual(160);
    expect(done.target.name).toBe('Lou Correa');
    return done;
  }

  it('unconfigured: no key → the standard script, no Anthropic call, a model=standard row with zero tokens', async () => {
    const { generate, repo, calls } = app();
    await expectStandard(await generate({}, NOKEY), 'unconfigured');
    expect(calls.opus + calls.haiku).toBe(0);
    expect(repo.generations).toHaveLength(1);
    expect(repo.generations[0]).toMatchObject({ model: 'standard', input_tokens: 0, output_tokens: 0, attempt: 1, check_fail: null });
    expect(repo.generations[0].shingles.length).toBe(0);
  });

  it('budget: LLM_MONTHLY_BUDGET_USD=0 → standard even with a key, and no screen call either', async () => {
    const { generate, calls } = app();
    await expectStandard(await generate({}, { ...KEYED, LLM_MONTHLY_BUDGET_USD: '0' }), 'budget');
    expect(calls.opus + calls.haiku).toBe(0);
  });

  it("capacity: the day's cap reached → standard; the cap floor is 20, so MAX_GENERATIONS_PER_DAY below it does not bite", async () => {
    const floor = app();
    floor.repo.generations.push(...Array.from({ length: 19 }, () => genRow({})));
    const evs = await events(await floor.generate({}, { ...KEYED, MAX_GENERATIONS_PER_DAY: '2' }));
    expect(evs[0]).toEqual({ event: 'status', data: { stage: 'drafting' } });
    expect(floor.calls.opus).toBe(1);
    const capped = app();
    capped.repo.generations.push(...Array.from({ length: 20 }, () => genRow({ input_tokens: 900, output_tokens: 200 }))); // 20 × $0.0077: blended is measured, the cap is 4 → floor 20
    await expectStandard(await capped.generate({}, { ...KEYED, LLM_MONTHLY_BUDGET_USD: '1' }), 'capacity');
    expect(capped.calls.opus + capped.calls.haiku).toBe(0);
    expect(capped.repo.generations).toHaveLength(21);
    expect(capped.repo.generations[20].model).toBe('standard');
  });

  it('upstream: two 5xx replies from Opus → reset, then the standard script; the row says attempt 2, check_fail upstream', async () => {
    const { generate, repo, calls } = app({ opusStatus: 529 });
    const res = await generate();
    const evs = await events(res);
    expect(calls.opus).toBe(2);
    expect(evs.filter((e) => e.event === 'status').map((e) => e.data.stage)).toEqual(['drafting', 'redrafting', 'standard']);
    expect(evs.some((e) => e.event === 'reset')).toBe(true);
    const done = doneOf(evs)!;
    expect(done).toMatchObject({ standard: true, reason: 'upstream' });
    expect(done.body).toContain('Correa');
    expect(repo.generations).toHaveLength(1);
    expect(repo.generations[0]).toMatchObject({ model: 'standard', attempt: 2, check_fail: 'upstream' });
  });

  it('upstream: a dead screen service falls through to the standard script instead of a 502', async () => {
    const { generate, calls } = app({ haikuStatus: 503 });
    await expectStandard(await generate(), 'upstream');
    expect(calls.haiku).toBe(1);
    expect(calls.opus).toBe(0);
  });

  it('a screened-out field still returns 422 when a model draft would have run', async () => {
    const { generate } = app({ screen: () => ({ class: 'off_topic', reason: 'not about this goal' }) });
    const res = await generate();
    expect(res.status).toBe(422);
  });
});

describe('POST /api/generate — script blocks (leader-call-scripts §2–§3)', () => {
  const NOKEY = ENV as unknown as Record<string, unknown>;
  const LEADER = { action: 'senate-leader-call', target: 'S000148', fields: { ...FIELDS, city: 'Brooklyn' } };

  it('no key: the composed script streams with done.variant, no Anthropic call; another seed gives another body', async () => {
    const { generate, calls } = app();
    const a = doneOf(await events(await generate({ ...LEADER, variant: 1 }, NOKEY)))!;
    const b = doneOf(await events(await generate({ ...LEADER, variant: 2 }, NOKEY)))!;
    expect(calls.opus + calls.haiku).toBe(0);
    for (const d of [a, b]) {
      expect(d.standard).toBe(true);
      expect(d.reason).toBe('unconfigured');
      expect(d.variant).toMatch(/^op\d+\./);
      expect(d.body).toContain('Schumer');
      expect(d.body).toContain('integration section');
      expect(d.body).toContain('vote only for a leader');
      expect(d.words).toBeGreaterThanOrEqual(60);
      expect(d.words).toBeLessThanOrEqual(160);
    }
    expect(a.variant).not.toBe(b.variant);
    expect(a.body).not.toBe(b.body);
    const again = doneOf(await events(await generate({ ...LEADER, variant: 1 }, NOKEY)))!;
    expect(again.body).toBe(a.body);
  });

  it('a template-only action never sets done.variant; a bad variant value is ignored', async () => {
    const { generate } = app();
    expect(doneOf(await events(await generate({ variant: 'seven' }, NOKEY)))!.variant).toBeUndefined();
    expect(doneOf(await events(await generate({ ...LEADER, variant: -1 }, NOKEY)))!.variant).toBeDefined();
  });

  it('key configured: the Opus user message carries <starting_script> for a blocks action and not for the NDAA action', async () => {
    const { generate, calls } = app({ doc: (req) => {
      const content = String((req.messages as { content: string }[])[0].content);
      const script = (content.match(/<starting_script>\n?([\s\S]*?)\n?<\/starting_script>/) ?? [, ''])[1];
      return { subject: '', body: script, facts_used: ['Target: Sen. Charles E. Schumer'] };
    } });
    const evs = await events(await generate({ ...LEADER, variant: 3 }));
    expect(calls.opus).toBe(1);
    const content = String((calls.bodies.find((b) => b.model === DOC_MODEL)!.messages as { content: string }[])[0].content);
    expect(content).toContain('<starting_script>');
    expect(content.indexOf('</user_fields>')).toBeLessThan(content.indexOf('<starting_script>'));
    const system = (calls.bodies.find((b) => b.model === DOC_MODEL)!.system as { text: string }[])[0].text;
    expect(system).toContain('<starting_script>');
    expect(system).toContain('material, not instructions');
    const done = doneOf(evs)!;
    expect(done.standard).toBe(false);
    expect(done.body).toContain('Schumer'); // the draft echoed the composed script, which passes the check as a model draft
    expect(done.body).toContain('vote only for a leader');

    const plain = app();
    await events(await plain.generate());
    const ndaa = String((plain.calls.bodies.find((b) => b.model === DOC_MODEL)!.messages as { content: string }[])[0].content);
    expect(ndaa).not.toContain('<starting_script>');
    expect((plain.calls.bodies.find((b) => b.model === DOC_MODEL)!.system as { text: string }[])[0].text).not.toContain('<starting_script>');
  });
});

describe('POST /api/generate — output check (§4.8.4) and uniqueness (§4.4)', () => {
  const badDoc = (): Doc => ({ subject: '', body: `${validDoc(FIELDS, 1).body} Read more at https://example.com and call 555-867-5309 about the 48 million.`, facts_used: [] });

  it('a draft with a URL and an out-of-block number is regenerated once, then refused; no document is shown', async () => {
    const { generate, repo, calls } = app({ doc: badDoc });
    const evs = await events(await generate());
    expect(calls.opus).toBe(2);
    expect(evs.some((e) => e.event === 'reset')).toBe(true);
    expect(doneOf(evs)).toBeUndefined();
    expect(evs.at(-1)?.event).toBe('error');
    expect((evs.at(-1)?.data as { error: string }).error).toBe('refused');
    const retry = calls.bodies.filter((b) => b.model === DOC_MODEL)[1];
    expect((retry.messages as { content: string }[])[0].content).toMatch(/previous draft failed a check/);
    expect(repo.generations).toHaveLength(1);
    expect(repo.generations[0].shingles.length).toBe(0);
    expect(repo.generations[0].input_tokens).toBe(1800);
    expect([repo.generations[0].attempt, repo.generations[0].check_fail]).toEqual([2, 'digit']); // generation-cost §3
  });

  it('a failed first draft followed by a clean second one is shown after a reset', async () => {
    const { generate, calls } = app({ doc: (_r, n) => (n === 1 ? badDoc() : validDoc(FIELDS, 7)) });
    const evs = await events(await generate());
    expect(calls.opus).toBe(2);
    const resetAt = evs.findIndex((e) => e.event === 'reset');
    expect(resetAt).toBeGreaterThan(0);
    expect(doneOf(evs)?.body).toBe(validDoc(FIELDS, 7).body);
    expect(evs.slice(resetAt + 1).filter((e) => e.event === 'delta').map((e) => e.data.text).join('')).toBe(validDoc(FIELDS, 7).body);
  });

  it('20 generations with different inputs: no pair over 0.3 overlap; every doc passes the check', async () => {
    const { generate, repo, calls } = app();
    const fmt = parseFormat(rows.actions.find((a) => a.slug === 'ndaa-1217-call')!);
    const facts = 'CA-46 2026-12-10 2026-12-31 1217 219 2026-11-04';
    const docs: string[] = [];
    for (let i = 0; i < 20; i++) {
      const dev = `device-${i}-0123456789`;
      const evs = await events(await generate({ device: dev, fields: { ...FIELDS, why: `${BENIGN[i % BENIGN.length]} ${filler(i + 100, 3)}` } }, KEYED, `198.51.100.${i}`));
      const done = doneOf(evs);
      expect(done, `generation ${i}`).toBeDefined();
      docs.push(done!.body);
      const check = checkOutput({ subject: '', body: done!.body, facts_used: [] }, { targetName: 'Lou Correa', fmt, allowedDigits: new Set(facts.match(/\d+/g)), pickName: null });
      expect(check, `generation ${i}`).toEqual({ ok: true, words: expect.any(Number) });
      expect(done!.words).toBeLessThanOrEqual(160);
      expect(done!.body.toLowerCase()).not.toContain('end aid');
    }
    expect(calls.opus).toBe(20);
    const sets = repo.generations.map((g) => g.shingles);
    expect(sets).toHaveLength(20);
    for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) expect(overlap(sets[i], sets[j]), `${i} vs ${j}`).toBeLessThanOrEqual(0.3);
    expect(new Set(docs).size).toBe(20);
  });

  it('a duplicate of a recent draft is regenerated once with a different-structure instruction', async () => {
    const same = validDoc(FIELDS, 3);
    const { generate, calls } = app({ doc: () => same });
    await events(await generate({ device: 'device-a-0123456789' }));
    const evs = await events(await generate({ device: 'device-b-0123456789' }));
    expect(calls.opus).toBe(3);
    const retry = calls.bodies.filter((b) => b.model === DOC_MODEL)[2];
    expect((retry.messages as { content: string }[])[0].content).toMatch(/different structure and a different opening/);
    expect(doneOf(evs)?.body).toBe(same.body); // regenerated once, then shown (§4.4)
  });
});

describe('checkOutput, sanitize, shapeFields, BodyExtractor (unit)', () => {
  const fmt = parseFormat(rows.actions.find((a) => a.slug === 'ndaa-1217-call')!);
  const ctx = { targetName: 'Lou Correa', fmt, allowedDigits: new Set(['46', '1217', '219', '2026', '12', '10']), pickName: null as string | null };
  const ok = validDoc(FIELDS, 11);

  it('a letter request keeps medium effort and 1500 tokens (generation-cost §3)', () => {
    const action = rows.actions.find((a) => a.slug === 'ndaa-1217-call')!;
    const goal = rows.goals.find((g) => g.id === action.goal_id)!;
    const base = { action, goal, schema: parseSchema(action), fields: FIELDS, facts: 'Target: Rep. Lou Correa (D, CA-46)' } as unknown as GenerateContext;
    const letter = docRequest({ ...base, fmt: { ...fmt, kind: 'letter' } }, null);
    expect([letter.max_tokens, (letter.output_config as { effort: string }).effort]).toEqual([1500, 'medium']);
    const call = docRequest({ ...base, fmt }, null);
    expect([call.max_tokens, (call.output_config as { effort: string }).effort]).toEqual([700, 'low']);
  });

  it('accepts a clean script and names each failure', () => {
    expect(checkOutput(ok, ctx)).toEqual({ ok: true, words: wordCount(ok.body) });
    expect(checkOutput({ ...ok, body: `${ok.body} Email me at a@b.org.` }, ctx)).toMatchObject({ ok: false, cls: 'contact' });
    expect(checkOutput({ ...ok, body: ok.body.replace('Correa', 'Congressman') }, ctx)).toMatchObject({ ok: false, reason: 'does not name the target' });
    expect(checkOutput({ ...ok, body: ok.body.replace('integration section, section 1217', 'that bill') }, ctx)).toMatchObject({ ok: false, reason: 'does not name the section or vote' });
    expect(checkOutput({ ...ok, body: ok.body.replace('drop the integration section', 'remove the integration section') }, ctx)).toMatchObject({ ok: false, reason: 'ask wording missing' });
    expect(checkOutput({ ...ok, body: `${ok.body} Please end aid now.` }, ctx)).toMatchObject({ ok: false, reason: 'contains "end aid"' });
    expect(checkOutput({ ...ok, body: `${ok.body} Roll call 243 said so.` }, ctx)).toMatchObject({ ok: false, reason: 'number 243 is not in the fact block' });
    expect(checkOutput({ ...ok, body: `${ok.body} Email me at a@b.org.` }, ctx)).toMatchObject({ ok: false, reason: 'contains a URL, email address or phone number' });
    expect(checkOutput({ ...ok, body: `${ok.body} We will find you.` }, ctx)).toMatchObject({ ok: false, reason: 'contains a blocked term' });
    const lynch = { ...ctx, targetName: 'Stephen F. Lynch' };
    expect(checkOutput({ ...ok, body: ok.body.replace('Rep. Correa', 'Rep. Lynch') }, lynch)).toMatchObject({ ok: true }); // the surname is not a blocked term
    expect(checkOutput({ ...ok, body: `${ok.body.replace('Rep. Correa', 'Rep. Lynch')} We will find you.` }, lynch)).toMatchObject({ ok: false, cls: 'blocked' });
    expect(checkOutput({ ...ok, body: `${ok.body} ${filler(5, 80)}` }, ctx)).toMatchObject({ ok: false, reason: expect.stringMatching(/word count \d+ is outside 60–160/) });
    expect(checkOutput({ ...ok, body: 'Rep. Correa drop the integration section' }, ctx)).toMatchObject({ ok: false, reason: 'word count 6 is outside 60–160' });
    expect(checkOutput(ok, { ...ctx, pickName: 'Chris Murphy' })).toMatchObject({ ok: false, reason: 'does not name our pick' });
  });

  it('sanitize strips markup, URLs, emails, phones and control characters, then truncates', () => {
    expect(sanitize('<b>Hi</b> see https://x.com/a?b=1 or www.y.org, mail me@x.io, call (714) 555-0100 now\u0000​', 280)).toBe('Hi see or , mail , call now');
    expect(sanitize('x'.repeat(50), 40)).toHaveLength(40);
    expect(sanitize('I voted in 2024 and pay taxes', 280)).toBe('I voted in 2024 and pay taxes');
  });

  it('shapeFields keeps only schema fields', () => {
    const schema = [{ name: 'first_name', label: 'First name', max: 40, required: true }, { name: 'note', label: 'Note', max: 10, required: false }];
    expect(shapeFields(schema, { first_name: 'A', note: '' })).toEqual({ ok: true, fields: { first_name: 'A' } });
    expect(shapeFields(schema, { first_name: 'A', extra: 'x' })).toMatchObject({ ok: false });
    expect(shapeFields(schema, [])).toMatchObject({ ok: false });
    expect(shapeFields(schema, { first_name: '<script>' })).toMatchObject({ ok: false, message: 'First name is required.' });
  });

  it('BodyExtractor streams the body string out of partial JSON with escapes', () => {
    const json = JSON.stringify({ subject: 'S "q"', body: 'Line one\n"quoted" \\ é', facts_used: ['x'] });
    const ex = new BodyExtractor();
    let out = '';
    for (let i = 1; i <= json.length; i++) out += ex.next(json.slice(0, i));
    expect(out).toBe('Line one\n"quoted" \\ é');
  });

  it('shingles are sorted unique 32-bit hashes and overlap is Jaccard', () => {
    const a = shingles('one two three four five six seven eight nine ten');
    expect(a.length).toBe(3);
    expect([...a]).toEqual([...a].sort((x, y) => x - y));
    expect(overlap(a, a)).toBe(1);
    expect(overlap(a, shingles('a b c d e f g h i j'))).toBe(0);
    expect(overlap(a, new Uint32Array(0))).toBe(0);
  });
});

describe('POST /api/receipt and /api/report (§4.5–4.6)', () => {
  it('receipt stores ids and hashes only', async () => {
    const { post, repo } = app();
    const res = await post('/api/receipt', { goal: 'ndaa-1217', action: 'ndaa-1217-call', target: CORREA, state: 'CA', district: 46, device: DEVICE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 1 });
    expect(repo.receipts[0]).toEqual({ goal_id: 2, action_id: 2, target_id: CORREA, state: 'CA', district: 46, created_at: TODAY.toISOString(), device_hash: await sha(DEVICE), kind: 'action', ip_hash: await sha('203.0.113.9||2026-11-04') });
    expect((await post('/api/receipt', { goal: 'ndaa-1217', action: 'state-bonds-call', target: 'TX', device: DEVICE })).status).toBe(400);
    expect((await post('/api/receipt', { goal: 'state-bonds', action: 'state-bonds-call', target: 'TX', device: DEVICE })).status).toBe(200);
  });

  it('captain-list receipt (commitment-funnel §2.1) carries no action, no target and no names', async () => {
    const { post, repo } = app();
    const res = await post('/api/receipt', { goal: 'ndaa-1217', action: 'captain-list', state: 'CA', district: 46, device: DEVICE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 1 });
    expect(repo.receipts[0]).toEqual({ goal_id: 2, action_id: null, target_id: null, state: 'CA', district: 46, created_at: TODAY.toISOString(), device_hash: await sha(DEVICE), kind: 'captain-list', ip_hash: await sha('203.0.113.9||2026-11-04') });
    expect(JSON.stringify(repo.receipts)).not.toMatch(/people|name/);
    // a target with a captain list is refused; so is an upcoming or unknown goal
    expect((await post('/api/receipt', { goal: 'ndaa-1217', action: 'captain-list', target: CORREA, device: DEVICE })).status).toBe(400);
    expect((await post('/api/receipt', { goal: 'ndaa-report-vote', action: 'captain-list', device: DEVICE })).status).toBe(400);
    expect((await post('/api/receipt', { goal: 'nope', action: 'captain-list', device: DEVICE })).status).toBe(400);
    expect(repo.receipts).toHaveLength(1);
  });

  it('report takes one listed outcome and a ≤140-char note; positions never change', async () => {
    const { post, repo } = app();
    const before = await repo.positionsFor([CORREA], [2]);
    const res = await post('/api/report', { goal: 'ndaa-1217', target: CORREA, outcome: 'will_support', note: `<b>said yes</b> see https://x.com ${'n'.repeat(200)}`, device: DEVICE });
    expect(res.status).toBe(200);
    expect(repo.reports[0]).toMatchObject({ bioguide_id: CORREA, goal_id: 2, outcome: 'will_support' });
    expect(repo.reports[0].note!.length).toBeLessThanOrEqual(140);
    expect(repo.reports[0].note).not.toContain('<b>');
    expect(repo.reports[0].note).not.toContain('https://');
    expect((await post('/api/report', { goal: 'ndaa-1217', target: CORREA, outcome: 'for', device: DEVICE })).status).toBe(400);
    expect((await post('/api/report', { goal: 'ndaa-1217', target: 'Z999999', outcome: 'other', device: DEVICE })).status).toBe(400);
    expect(await repo.positionsFor([CORREA], [2])).toEqual(before);
  });
});
