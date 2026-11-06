import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import type { Env, Repo, ReportOutcome } from './types';
import { D1Repo } from './repo';
import { runDigest, sendWithEmailRouting } from './digest';
import { classifyAddress, geocode } from './geocode';
import { verifyTurnstile } from './turnstile';
import { VISIT_LIMITS, expired, officeCity, personalData, publicVisit, validContact, verifyReview, visitWindow } from './visits';
import { buildRoute, goalTargets } from './route';
import { DEFAULT_GLOBAL_CAP, LIMITS, prepare, resolveTarget, run, sanitize, sha256Hex } from './generate';
import { parseBudget } from './cost';
import { COUNT_CACHE_SECONDS, RECEIPT_LIMITS, counts, receiptIpHash, thresholdFrom } from './counts';

export interface Deps {
  repo: (env: Env) => Repo;
  fetch: typeof fetch;
  now: () => Date;
}

const STATE = /^[A-Z]{2}$/;
const BIOGUIDE = /^[A-Z]\d{6}$/;
const OUTCOMES: ReportOutcome[] = ['will_support', 'undecided', 'opposed', 'no_answer', 'other'];

/**
 * The API. `deps` lets tests swap the repo, the outbound fetch and the clock.
 * Nothing on the /api/route path logs, stores or echoes the address (§1.2).
 */
export function createApp(deps: Deps) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE'] }));

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
      const geo = await geocode(body.address, deps.fetch, c.env.GEOCODER_URL, c.env.DISTRICT_VINTAGE || undefined);
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
    const body = await readJson<{ action?: unknown; target?: unknown; fields?: unknown; device?: unknown; turnstile?: unknown; variant?: unknown }>(c);
    if (!body) return c.json({ error: 'bad_json', message: 'Send a JSON body.' }, 400);
    const ip = c.req.header('CF-Connecting-IP');
    const gdeps = {
      repo: deps.repo(c.env), fetch: deps.fetch, now: deps.now, apiKey: c.env.ANTHROPIC_API_KEY,
      globalCap: Number(c.env.MAX_GENERATIONS_PER_DAY) > 0 ? Number(c.env.MAX_GENERATIONS_PER_DAY) : DEFAULT_GLOBAL_CAP,
      budgetUsd: parseBudget(c.env.LLM_MONTHLY_BUDGET_USD), // generation-cost §1
    };
    // generation-cost §4: a dead screen or drafting service is no longer a 502/503; `prepare` and `run` fall through to the standard script.
    const prepared = await prepare(gdeps, {
      action: body.action, target: body.target, fields: body.fields, device: body.device, variant: body.variant, ip,
      verify: () => verifyTurnstile(typeof body.turnstile === 'string' ? body.turnstile : undefined, c.env.TURNSTILE_SECRET, ip, deps.fetch),
    });
    if (!prepared.ok) return c.json({ error: prepared.reject.error, message: prepared.reject.message }, prepared.reject.status);
    const ctx = prepared.ctx;
    return streamSSE(c, async (stream) => {
      const emit = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
      try {
        await run(gdeps, ctx, emit);
      } catch (e) {
        console.error('generate: failed', (e as Error).message);
        await emit('error', { error: 'internal', message: 'Something broke on our side. Try again.' });
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
    const state = typeof body.state === 'string' && STATE.test(body.state) ? body.state : null;
    const district = Number.isInteger(body.district) && (body.district as number) >= 0 ? (body.district as number) : null;
    const now = deps.now();
    const [device_hash, ip_hash] = await Promise.all([sha256Hex(body.device), receiptIpHash(c.req.header('CF-Connecting-IP'), c.env.IP_SALT, now)]);
    const common = { state, district, created_at: now.toISOString(), device_hash, ip_hash };
    // district-counters §3: 10 per device per day, 1 per device+goal+action per 10 minutes, 50 per IP hash per day. Extra posts are not stored.
    const limited = async (goalId: number, actionId: number | null, kind: 'action' | 'captain-list') => {
      const n = await repo.receiptLimitCounts(device_hash, ip_hash, goalId, actionId, kind, now);
      if (n.device_day >= RECEIPT_LIMITS.device_day) return c.json({ error: 'limit_day', message: `Ten actions a day is plenty. Come back tomorrow.` }, 429);
      if (n.repeat >= 1) return c.json({ error: 'limit_repeat', message: 'That one is already counted. Try again in ten minutes.' }, 429);
      if (n.ip_day >= RECEIPT_LIMITS.ip_day) return c.json({ error: 'limit_ip', message: 'Too many receipts from this network today.' }, 429);
      return null;
    };
    // commitment-funnel §2.1: a completed captain list is a receipt with no action and no target. Names never arrive here.
    if (body.action === 'captain-list') {
      if (body.target !== undefined && body.target !== null) return c.json({ error: 'bad_request', message: 'A captain list carries no target.' }, 400);
      const goal = await repo.goalBySlug(body.goal);
      if (!goal || goal.status !== 'active') return c.json({ error: 'no_action', message: 'No open goal by that name.' }, 400);
      const stop = await limited(goal.id, null, 'captain-list');
      if (stop) return stop;
      return c.json({ id: await repo.insertReceipt({ goal_id: goal.id, action_id: null, target_id: null, kind: 'captain-list', ...common }) });
    }
    const [goal, action] = await Promise.all([repo.goalBySlug(body.goal), repo.actionBySlug(body.action)]);
    if (!goal || !action || action.goal_id !== goal.id) return c.json({ error: 'no_action', message: 'No open action by that name.' }, 400);
    const target = await resolveTarget(repo, action, goal, body.target);
    if (!target) return c.json({ error: 'no_target', message: 'That target is not on file for this action.' }, 400);
    const stop = await limited(goal.id, action.id, 'action');
    if (stop) return stop;
    const id = await repo.insertReceipt({ goal_id: goal.id, action_id: action.id, target_id: target.id, kind: 'action', ...common });
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

  // member-pages §2.2: the newest visible constituent report for one member and goal. Never touches `positions`.
  app.get('/api/members/:bioguide_id/reports', async (c) => {
    const repo = deps.repo(c.env);
    const slug = c.req.query('goal') ?? '';
    const [member, goal] = await Promise.all([repo.member(c.req.param('bioguide_id')), slug ? repo.goalBySlug(slug) : null]);
    if (!member) return c.json({ error: 'no_member', message: 'No member by that id.' }, 404);
    if (!goal) return c.json({ error: 'no_goal', message: 'Send a goal slug.' }, slug ? 404 : 400);
    return c.json({ latest: await repo.latestReport(member.bioguide_id, goal.id) });
  });

  // district-counters §1: this week's receipts for one goal and place, SQL COUNTs only, thresholded, cached 5 min at the edge.
  app.get('/api/counts', async (c) => {
    const slug = c.req.query('goal') ?? '';
    const state = c.req.query('state') ?? '';
    const d = c.req.query('district');
    const district = d !== undefined && d !== '' && /^\d+$/.test(d) ? Number(d) : null;
    const goal = slug ? await deps.repo(c.env).goalBySlug(slug) : null;
    if (!goal) return c.json({ error: 'no_goal', message: 'No goal by that name.' }, 404);
    if (!STATE.test(state)) return c.json({ error: 'missing', message: 'Send a two-letter state.' }, 400);
    const body = await counts(deps.repo(c.env), goal.id, state, district, deps.now(), thresholdFrom(c.env));
    c.header('Cache-Control', `public, max-age=${COUNT_CACHE_SECONDS}`);
    return c.json(body);
  });

  // ---- office-visits (docs/specs/office-visits.md). All counts are computed here; contact_url leaves
  // only in the reply to a stored request. VISITS_ENABLED="0" pauses the feature without a deploy.
  const visitsOn = (env: Env): boolean => env.VISITS_ENABLED !== '0';
  const visitDevice = async (device: unknown): Promise<string | null> => (typeof device === 'string' && device.length >= 8 ? sha256Hex(device) : null);
  const visitId = (s: string): number | null => (/^\d{1,9}$/.test(s) ? Number(s) : null);

  // §2.1: approved, unexpired listings for one member, with the request count (clients show it from 2).
  app.get('/api/visits', async (c) => {
    const member = c.req.query('member') ?? '';
    if (!visitsOn(c.env)) return c.json({ visits: [] });
    if (!BIOGUIDE.test(member)) return c.json({ error: 'bad_request', message: 'Send member=<bioguide id>.' }, 400);
    const now = deps.now();
    const rows = await deps.repo(c.env).approvedVisits(member);
    return c.json({ visits: rows.filter((r) => !expired(r.visit.ends_at, now)).map((r) => publicVisit(r.visit, r.requests)) });
  });

  // §1.3 the digest's signed approve/reject/hide/delete links. Text reply: it is opened from a mail client.
  app.get('/api/visits/review', async (c) => {
    const secret = c.env.VISITS_REVIEW_SECRET?.trim();
    if (!secret) return c.text('Review links are off: set VISITS_REVIEW_SECRET on the Worker.', 503);
    const t = await verifyReview(secret, c.req.query('token') ?? '', deps.now());
    if (!t.ok) return c.text(`Link ${t.reason === 'expired' ? 'expired' : 'invalid'}.`, 403);
    const repo = deps.repo(c.env);
    const v = await repo.visit(t.id);
    if (!v) return c.text(`Listing #${t.id} no longer exists.`, 404);
    if (t.action === 'reject' || t.action === 'delete') { await repo.deleteVisit(t.id); return c.text(`Listing #${t.id} ${t.action === 'reject' ? 'rejected' : 'deleted'} and removed.`); }
    await repo.setVisitStatus(t.id, t.action === 'approve' ? 'approved' : 'hidden', deps.now());
    return c.text(`Listing #${t.id} ${t.action === 'approve' ? 'approved: it is visible now' : 'hidden'}.`);
  });

  // §1.1 list a visit. Stored pending; nothing shows until the maintainer approves it from the digest.
  app.post('/api/visits', async (c) => {
    if (!visitsOn(c.env)) return c.json({ error: 'paused', message: 'Visit listings are paused.' }, 503);
    const body = await readJson<{ member?: unknown; city?: unknown; date?: unknown; start?: unknown; end?: unknown; contact?: unknown; note?: unknown; device?: unknown; turnstile?: unknown; variant?: unknown }>(c);
    const device_hash = body ? await visitDevice(body.device) : null;
    if (!body || typeof body.member !== 'string' || !BIOGUIDE.test(body.member) || typeof body.contact !== 'string' || !device_hash) {
      return c.json({ error: 'bad_request', message: 'Send member, date, start, end, contact and device.' }, 400);
    }
    const ip = c.req.header('CF-Connecting-IP') ?? undefined;
    if (!(await verifyTurnstile(typeof body.turnstile === 'string' ? body.turnstile : undefined, c.env.TURNSTILE_SECRET, ip, deps.fetch))) {
      return c.json({ error: 'turnstile', message: 'Please complete the check and try again.' }, 403);
    }
    const repo = deps.repo(c.env);
    const member = await repo.member(body.member);
    if (!member) return c.json({ error: 'no_member', message: 'No member by that id.' }, 400);
    const now = deps.now();
    const window = visitWindow(body.date, body.start, body.end, now);
    if (!window) return c.json({ error: 'bad_time', message: 'Pick a date from today on, with an end after the start.' }, 400);
    const contact = body.contact.trim();
    if (!validContact(contact)) return c.json({ error: 'bad_contact', message: 'Contact is one https link or one @handle, no phone or email.' }, 400);
    // Screen the raw note: sanitize() would silently strip a phone or email, and §3.1 says refuse, not strip.
    const rawNote = typeof body.note === 'string' ? body.note.slice(0, 4 * VISIT_LIMITS.note_max) : '';
    const pii = personalData(contact) ?? (rawNote ? personalData(rawNote) : null);
    const note = rawNote ? sanitize(rawNote, VISIT_LIMITS.note_max) : '';
    if (pii) return c.json({ error: 'pii', message: `Leave out the ${pii === 'phone' ? 'phone number' : pii === 'email' ? 'email address' : 'street address'}; the office page carries the address.` }, 400);
    // The office city comes from data/ once the members column is filled; until then the organiser names it.
    const city = officeCity(member) ?? (typeof body.city === 'string' ? sanitize(body.city, VISIT_LIMITS.city_max) : '');
    if (!city || /\d/.test(city)) return c.json({ error: 'bad_city', message: 'Name the office city (letters only).' }, 400);
    if ((await repo.pendingVisitCount(device_hash)) >= VISIT_LIMITS.pending_per_device) {
      return c.json({ error: 'rate_limited', message: 'One listing at a time: wait for the current one to be reviewed.' }, 429);
    }
    const id = await repo.insertVisit({ bioguide_id: member.bioguide_id, office_city: city, starts_at: window.starts_at, ends_at: window.ends_at, contact_url: contact, note: note || null, status: 'pending', device_hash, created_at: now.toISOString(), reviewed_at: null });
    return c.json({ id, status: 'pending' });
  });

  // §2.2 "I'll come": stores (device, listing); the reply alone carries the organiser's contact.
  app.post('/api/visits/:id/request', async (c) => {
    if (!visitsOn(c.env)) return c.json({ error: 'paused', message: 'Visit listings are paused.' }, 503);
    const id = visitId(c.req.param('id'));
    const body = await readJson<{ device?: unknown }>(c);
    const device_hash = body ? await visitDevice(body.device) : null;
    if (!id || !device_hash) return c.json({ error: 'bad_request', message: 'Send device.' }, 400);
    const repo = deps.repo(c.env);
    const now = deps.now();
    const v = await repo.visit(id);
    if (!v || v.status !== 'approved' || expired(v.ends_at, now)) return c.json({ error: 'not_found' }, 404);
    if (!(await repo.hasVisitRequest(id, device_hash))) {
      if ((await repo.visitRequestsSince(device_hash, new Date(now.getTime() - 86_400_000))) >= VISIT_LIMITS.requests_per_day) {
        return c.json({ error: 'rate_limited', message: 'Five visits a day is the limit.' }, 429);
      }
      await repo.insertVisitRequest(id, device_hash, now);
    }
    const requests = (await repo.approvedVisits(v.bioguide_id)).find((r) => r.visit.id === id)?.requests ?? 1;
    return c.json({ ...publicVisit(v, requests), contact_url: v.contact_url });
  });

  // §2.3 withdraw. Idempotent; the device forgets the contact on its side.
  app.delete('/api/visits/:id/request', async (c) => {
    const id = visitId(c.req.param('id'));
    const body = await readJson<{ device?: unknown }>(c);
    const device_hash = body ? await visitDevice(body.device) : null;
    if (!id || !device_hash) return c.json({ error: 'bad_request', message: 'Send device.' }, 400);
    await deps.repo(c.env).deleteVisitRequest(id, device_hash);
    return c.json({ ok: true });
  });

  // §3.3 the organiser's own delete: the row and every request on it go together.
  app.delete('/api/visits/:id', async (c) => {
    const id = visitId(c.req.param('id'));
    const body = await readJson<{ device?: unknown }>(c);
    const device_hash = body ? await visitDevice(body.device) : null;
    if (!id || !device_hash) return c.json({ error: 'bad_request', message: 'Send device.' }, 400);
    const repo = deps.repo(c.env);
    const v = await repo.visit(id);
    if (!v) return c.json({ error: 'not_found' }, 404);
    if (v.device_hash !== device_hash) return c.json({ error: 'forbidden', message: 'Only the device that listed a visit can remove it.' }, 403);
    await repo.deleteVisit(id);
    return c.json({ ok: true });
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  return app;
}

const app = createApp({ repo: (env) => new D1Repo(env.DB), fetch: (...a) => fetch(...a), now: () => new Date() });

/** §7.2 cron (`0 9 * * 1` in wrangler.jsonc): the weekly maintainer digest. */
export const scheduled: ExportedHandlerScheduledHandler<Env> = async (_controller, env) => {
  await runDigest({ repo: new D1Repo(env.DB), fetch: (...a) => fetch(...a), now: () => new Date(), send: sendWithEmailRouting }, env);
};

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>;
