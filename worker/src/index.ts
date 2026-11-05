import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import type { Env, Repo, ReportOutcome } from './types';
import { D1Repo } from './repo';
import { runDigest, sendWithEmailRouting } from './digest';
import { classifyAddress, geocode } from './geocode';
import { verifyTurnstile } from './turnstile';
import { buildRoute, goalTargets } from './route';
import { DEFAULT_GLOBAL_CAP, LIMITS, prepare, resolveTarget, run, sanitize, sha256Hex } from './generate';

export interface Deps {
  repo: (env: Env) => Repo;
  fetch: typeof fetch;
  now: () => Date;
}

const STATE = /^[A-Z]{2}$/;
const OUTCOMES: ReportOutcome[] = ['will_support', 'undecided', 'opposed', 'no_answer', 'other'];

/**
 * The API. `deps` lets tests swap the repo, the outbound fetch and the clock.
 * Nothing on the /api/route path logs, stores or echoes the address (§1.2).
 */
export function createApp(deps: Deps) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST'] }));

  const readJson = async <T extends object>(c: { req: { json: () => Promise<unknown> } }): Promise<T | null> => {
    try {
      const b = await c.req.json();
      return b && typeof b === 'object' ? (b as T) : null;
    } catch {
      return null;
    }
  };

  app.get('/api/goals', async (c) => {
    const goals = await deps.repo(c.env).activeGoals();
    return c.json({ goals: goals.map(({ eligibility, ...g }) => g) });
  });

  // §2.2: the stored district's targets for one goal (the detail page's "your targets" block).
  app.get('/api/goals/:slug/targets', async (c) => {
    const state = c.req.query('state') ?? '';
    const district = Number(c.req.query('district'));
    if (!STATE.test(state) || !Number.isInteger(district) || district < 0) {
      return c.json({ error: 'missing', message: 'Send a state and district.' }, 400);
    }
    const result = await goalTargets(deps.repo(c.env), c.req.param('slug'), state, district);
    if (result === 'no_goal') return c.json({ error: 'no_goal', message: 'No open goal by that name.' }, 404);
    if (result === 'no_delegation') return c.json({ error: 'no_delegation', message: `No members on file for ${state}-${district} yet.` }, 404);
    return c.json(result);
  });

  app.post('/api/route', async (c) => {
    let body: { address?: unknown; state?: unknown; district?: unknown; turnstile?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_json', message: 'Send a JSON body.' }, 400);
    }
    const ok = await verifyTurnstile(
      typeof body.turnstile === 'string' ? body.turnstile : undefined,
      c.env.TURNSTILE_SECRET,
      c.req.header('CF-Connecting-IP'),
      deps.fetch,
    );
    if (!ok) return c.json({ error: 'turnstile', message: 'Bot check failed. Reload and try again.' }, 403);

    let state: string;
    let district: number;
    if (typeof body.address === 'string' && body.address.trim() !== '') {
      const kind = classifyAddress(body.address);
      if (kind === 'zip_only') {
        return c.json({ error: 'zip_only', message: 'A ZIP code is not enough: many cities are split between districts. Enter your street address.' }, 400);
      }
      if (kind === 'incomplete') {
        return c.json({ error: 'incomplete', message: 'Enter a full street address with number, street, city and state.' }, 400);
      }
      const geo = await geocode(body.address, deps.fetch, c.env.GEOCODER_URL);
      if (!geo.ok) {
        const status = geo.reason === 'upstream' ? 502 : 404;
        return c.json(
          { error: geo.reason, message: geo.reason === 'upstream' ? 'The address lookup is down. Try again, or pick your state and district.' : 'We could not place that address. Check it and retry, or pick your state and district.' },
          status,
        );
      }
      state = geo.state;
      district = geo.district;
    } else if (typeof body.state === 'string' && STATE.test(body.state) && Number.isInteger(Number(body.district))) {
      // §1.4 manual picker and §1.5 return visit: {state, district} only, no geocode.
      state = body.state;
      district = Number(body.district);
    } else {
      return c.json({ error: 'missing', message: 'Send an address, or a state and district.' }, 400);
    }

    const result = await buildRoute(deps.repo(c.env), state, district, deps.now());
    if (!result.house && result.senators.length === 0) {
      return c.json({ error: 'no_delegation', message: `No members on file for ${state}-${district} yet.`, state, district }, 404);
    }
    return c.json(result);
  });

  // §4.2–4.8: personalised document. Rejections are JSON; a generation is an SSE stream of
  // status | delta | reset | done | error events.
  app.post('/api/generate', async (c) => {
    const body = await readJson<{ action?: unknown; target?: unknown; fields?: unknown; device?: unknown; turnstile?: unknown }>(c);
    if (!body) return c.json({ error: 'bad_json', message: 'Send a JSON body.' }, 400);
    const ip = c.req.header('CF-Connecting-IP');
    const gdeps = {
      repo: deps.repo(c.env), fetch: deps.fetch, now: deps.now, apiKey: c.env.ANTHROPIC_API_KEY,
      globalCap: Number(c.env.MAX_GENERATIONS_PER_DAY) > 0 ? Number(c.env.MAX_GENERATIONS_PER_DAY) : DEFAULT_GLOBAL_CAP,
    };
    let prepared;
    try {
      prepared = await prepare(gdeps, {
        action: body.action, target: body.target, fields: body.fields, device: body.device, ip,
        verify: () => verifyTurnstile(typeof body.turnstile === 'string' ? body.turnstile : undefined, c.env.TURNSTILE_SECRET, ip, deps.fetch),
      });
    } catch (e) {
      console.error('generate: screen failed', (e as Error).message);
      return c.json({ error: 'upstream', message: 'The drafting service is not answering. Try again in a minute.' }, 502);
    }
    if (!prepared.ok) return c.json({ error: prepared.reject.error, message: prepared.reject.message }, prepared.reject.status);
    const ctx = prepared.ctx;
    return streamSSE(c, async (stream) => {
      const emit = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
      try {
        await run(gdeps, ctx, emit);
      } catch (e) {
        console.error('generate: upstream failed', (e as Error).message);
        await emit('error', { error: 'upstream', message: 'The drafting service dropped the connection. Try again.' });
      }
    });
  });

  // §4.5 "I did it": one receipt row; no document text, no address.
  app.post('/api/receipt', async (c) => {
    const body = await readJson<{ goal?: unknown; action?: unknown; target?: unknown; state?: unknown; district?: unknown; device?: unknown }>(c);
    if (!body || typeof body.goal !== 'string' || typeof body.action !== 'string' || typeof body.device !== 'string' || body.device.length < 8) {
      return c.json({ error: 'bad_request', message: 'Send goal, action, target and device.' }, 400);
    }
    const repo = deps.repo(c.env);
    const [goal, action] = await Promise.all([repo.goalBySlug(body.goal), repo.actionBySlug(body.action)]);
    if (!goal || !action || action.goal_id !== goal.id) return c.json({ error: 'no_action', message: 'No open action by that name.' }, 400);
    const target = await resolveTarget(repo, action, goal, body.target);
    if (!target) return c.json({ error: 'no_target', message: 'That target is not on file for this action.' }, 400);
    const state = typeof body.state === 'string' && STATE.test(body.state) ? body.state : null;
    const district = Number.isInteger(body.district) && (body.district as number) >= 0 ? (body.district as number) : null;
    const id = await repo.insertReceipt({
      goal_id: goal.id, action_id: action.id, target_id: target.id, state, district, created_at: deps.now().toISOString(), device_hash: await sha256Hex(body.device),
    });
    return c.json({ id });
  });

  // §4.6 office response. Shows on the maintainer digest only; never touches `positions`.
  app.post('/api/report', async (c) => {
    const body = await readJson<{ goal?: unknown; target?: unknown; outcome?: unknown; note?: unknown; device?: unknown }>(c);
    if (!body || typeof body.goal !== 'string' || typeof body.target !== 'string' || typeof body.device !== 'string' || body.device.length < 8) {
      return c.json({ error: 'bad_request', message: 'Send goal, target, outcome and device.' }, 400);
    }
    const outcome = OUTCOMES.find((o) => o === body.outcome);
    if (!outcome) return c.json({ error: 'bad_outcome', message: 'Pick one of the listed responses.' }, 400);
    const repo = deps.repo(c.env);
    const goal = await repo.goalBySlug(body.goal);
    if (!goal) return c.json({ error: 'no_goal', message: 'No goal by that name.' }, 400);
    const known = STATE.test(body.target) ? await repo.stateRow(body.target) : await repo.member(body.target);
    if (!known) return c.json({ error: 'no_target', message: 'That target is not on file.' }, 400);
    const note = typeof body.note === 'string' ? sanitize(body.note, LIMITS.note_max) : '';
    const id = await repo.insertReport({
      bioguide_id: body.target, goal_id: goal.id, outcome, note: note || null, created_at: deps.now().toISOString(), device_hash: await sha256Hex(body.device),
    });
    return c.json({ id });
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  return app;
}

const app = createApp({ repo: (env) => new D1Repo(env.DB), fetch: (...a) => fetch(...a), now: () => new Date() });

/** §7.2 cron (`0 9 * * *` in wrangler.jsonc): the nightly maintainer digest. */
export const scheduled: ExportedHandlerScheduledHandler<Env> = async (_controller, env) => {
  await runDigest({ repo: new D1Repo(env.DB), fetch: (...a) => fetch(...a), now: () => new Date(), send: sendWithEmailRouting }, env);
};

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>;
