import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, Repo } from './types';
import { D1Repo } from './repo';
import { classifyAddress, geocode } from './geocode';
import { verifyTurnstile } from './turnstile';
import { buildRoute, goalTargets } from './route';

export interface Deps {
  repo: (env: Env) => Repo;
  fetch: typeof fetch;
  now: () => Date;
}

const STATE = /^[A-Z]{2}$/;

/**
 * The API. `deps` lets tests swap the repo, the outbound fetch and the clock.
 * Nothing on the /api/route path logs, stores or echoes the address (§1.2).
 */
export function createApp(deps: Deps) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST'] }));

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

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  return app;
}

export default createApp({ repo: (env) => new D1Repo(env.DB), fetch: (...a) => fetch(...a), now: () => new Date() });
