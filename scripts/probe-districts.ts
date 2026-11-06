#!/usr/bin/env npx tsx
// probe-districts — check a committed district set against the Census Geocoder
// (docs/prd/district-vintage-rollover.md §2, docs/specs/on-device-districts.md).
//
//   npx tsx scripts/probe-districts.ts --generate [--seed 2026] [--per-state 10]
//       writes scripts/probe-points.json: seeded points inside each state's cd119
//       polygons (uniform in the state bbox, rejection-sampled; deterministic).
//   npx tsx scripts/probe-districts.ts --set 119|120 [--points scripts/probe-points.json]
//       [--states GA,TX] [--concurrency 4]
//       resolves every point on-device from web/public/districts[-<set>]/ and through
//       the geocoder vintage that set must match (119 → ACS2025_Current, 120 →
//       Current_Current; a state in the manifest's `overrides` with congress 119 →
//       ACS2025_Current), prints each mismatch and a per-state summary, exits 1 on any.
//   npx tsx scripts/probe-districts.ts --compare [--states GA] [--per-state 60] [--seed 7]
//       geocoder only: ACS2025_Current vs Current_Current for fresh seeded points,
//       prints the points whose district differs (the Georgia question).
//   npx tsx scripts/probe-districts.ts --record web/src/lib/districts.fixture.120.json --set 120
//       re-records a fixture: the 52 districts.fixture.json points plus the PRD's five
//       redrawn-area points, each answered by the set's vintage (overrides applied).
//
// Only coordinates of synthetic or public points are sent to Census; nothing is stored.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { clearCache, contains, decode, locateAll, resolvePoint, type Shape, type Topology } from '../web/src/lib/pip.ts';

const GEOCODER = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
const VINTAGE_BY_CONGRESS: Record<number, string> = { 119: 'ACS2025_Current', 120: 'Current_Current' };
/** Points in redrawn areas the PRD names (lon, lat). */
const EXTRA_POINTS = [
  { label: 'Austin', lon: -97.7431, lat: 30.2672 },
  { label: 'Kansas City', lon: -94.5786, lat: 39.0997 },
  { label: 'Salt Lake City', lon: -111.891, lat: 40.7608 },
  { label: 'Memphis', lon: -90.049, lat: 35.1495 },
  { label: 'Toledo', lon: -83.5379, lat: 41.6528 },
];

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const root = resolve(import.meta.dirname, '..');
const set = Number(arg('set', '119'));
const dir = join(root, 'web/public', set === 119 ? 'districts' : `districts-${set}`);
const concurrency = Number(arg('concurrency', '4'));
const only = arg('states', '') ? new Set(arg('states', '').split(',')) : null;
const pointsPath = resolve(root, arg('points', 'scripts/probe-points.json'));

interface Manifest { congress: number; overrides?: Record<string, { vintage: number; congress: number }>; files: Record<string, unknown> }
interface ProbePoint { state: string; lon: number; lat: number; label?: string }
interface Answer { state: string; district: number } 

const loadFrom = (d: string) => async (name: string) => JSON.parse(readFileSync(join(d, `${name}.json`), 'utf8')) as Topology;

/** mulberry32: a tiny seeded PRNG so the committed points are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededPoints(seed: number, perState: number, d: string): ProbePoint[] {
  const states = decode<{ state: string }>(JSON.parse(readFileSync(join(d, 'states.json'), 'utf8')) as Topology);
  const out: ProbePoint[] = [];
  for (const s of states.sort((a, b) => a.props.state.localeCompare(b.props.state))) {
    const state = s.props.state;
    if (only && !only.has(state)) continue;
    const districts: Shape<{ district: number }>[] = decode(JSON.parse(readFileSync(join(d, `${state}.json`), 'utf8')) as Topology);
    const r = rng(seed * 1000 + state.charCodeAt(0) * 27 + state.charCodeAt(1));
    const [x0, y0, x1, y1] = s.bbox;
    let n = 0, tries = 0;
    while (n < perState && tries++ < 200_000) {
      const lon = Math.round((x0 + r() * (x1 - x0)) * 1e4) / 1e4;
      const lat = Math.round((y0 + r() * (y1 - y0)) * 1e4) / 1e4;
      if (!contains(s, lon, lat) || locateAll(districts, lon, lat).length === 0) continue;
      out.push({ state, lon, lat });
      n++;
    }
    if (n < perState) throw new Error(`${state}: only ${n} points after ${tries} tries`);
  }
  return out;
}

async function geocode(lon: number, lat: number, vintage: string): Promise<Answer | null> {
  const url = new URL(GEOCODER);
  url.searchParams.set('x', String(lon));
  url.searchParams.set('y', String(lat));
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('vintage', vintage);
  url.searchParams.set('format', 'json');
  let last = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { result?: { geographies?: Record<string, Array<Record<string, string>>> } };
      const g = body.result?.geographies ?? {};
      const key = Object.keys(g).find((k) => /Congressional Districts/i.test(k));
      const cd = key ? g[key]?.[0] : undefined;
      if (!cd) return null;
      const geoid = cd.GEOID ?? '';
      const raw = geoid.slice(2);
      const state = g.States?.[0]?.STUSAB ?? '';
      return { state, district: raw === '98' || raw === '00' ? 0 : Number(raw) };
    } catch (e) {
      last = String(e);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`geocoder failed for ${lon},${lat} (${vintage}): ${last}`);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i);
  }));
  return out;
}

function vintageFor(state: string, manifest: Manifest): string {
  const o = manifest.overrides?.[state];
  return VINTAGE_BY_CONGRESS[o?.congress ?? manifest.congress];
}

const fmt = (a: Answer | null) => (a ? `${a.state}-${a.district}` : 'null');

async function main(): Promise<void> {
  if (flag('generate')) {
    const seed = Number(arg('seed', '2026')), perState = Number(arg('per-state', '10'));
    const points = seededPoints(seed, perState, join(root, 'web/public/districts'));
    writeFileSync(pointsPath, JSON.stringify({ seed, per_state: perState, generated: new Date().toISOString().slice(0, 10), note: 'Seeded points inside each state (cd119 outlines, mulberry32). Regenerate with scripts/probe-districts.ts --generate; the geocoder answers are never stored here.', points }, null, 1) + '\n');
    console.log(`wrote ${points.length} points to ${pointsPath}`);
    return;
  }
  if (flag('compare')) {
    const seed = Number(arg('seed', '7')), perState = Number(arg('per-state', '60'));
    const points = seededPoints(seed, perState, join(root, 'web/public/districts'));
    const rows = await mapLimit(points, concurrency, async (p) => ({ p, a: await geocode(p.lon, p.lat, 'ACS2025_Current'), b: await geocode(p.lon, p.lat, 'Current_Current') }));
    const byState: Record<string, { n: number; diff: number }> = {};
    for (const { p, a, b } of rows) {
      const s = (byState[p.state] ??= { n: 0, diff: 0 });
      s.n++;
      if (fmt(a) !== fmt(b)) { s.diff++; console.log(`${p.state}\t${p.lon},${p.lat}\tACS2025=${fmt(a)}\tCurrent=${fmt(b)}`); }
    }
    for (const [st, s] of Object.entries(byState)) console.log(`${st}: ${s.diff}/${s.n} differ`);
    return;
  }
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;
  if (manifest.congress !== set) throw new Error(`${dir}/manifest.json is congress ${manifest.congress}, expected ${set}`);
  if (flag('record')) {
    const out = resolve(root, arg('record', ''));
    const base = JSON.parse(readFileSync(join(root, 'web/src/lib/districts.fixture.json'), 'utf8')) as { points: Array<{ label: string; lat: number; lon: number; state: string }> };
    const wanted = [...base.points.map((p) => ({ label: p.label, lon: p.lon, lat: p.lat, state: p.state })), ...EXTRA_POINTS.map((p) => ({ ...p, state: '' }))];
    const points = await mapLimit(wanted, concurrency, async (p) => {
      const state = p.state || ((await geocode(p.lon, p.lat, VINTAGE_BY_CONGRESS[set]))?.state ?? '');
      const a = await geocode(p.lon, p.lat, vintageFor(state, manifest));
      if (!a) throw new Error(`${p.label}: no district`);
      return { label: p.label, lat: p.lat, lon: p.lon, state: a.state, district: a.district };
    });
    const ov = Object.entries(manifest.overrides ?? {}).map(([st, o]) => `${st} from ${VINTAGE_BY_CONGRESS[o.congress]}`).join(', ');
    writeFileSync(out, JSON.stringify({
      recorded: new Date().toISOString().slice(0, 10),
      source: `Census Geocoder geographies/coordinates, benchmark Public_AR_Current, vintage ${VINTAGE_BY_CONGRESS[set]}${ov ? ` (${ov})` : ''}, layer ${set}th Congressional Districts (GEOID[2:])`,
      note: `districts.fixture.json's points plus the redrawn-area points of docs/prd/district-vintage-rollover.md §2, answered for the ${set}th Congress. Re-record with scripts/probe-districts.ts --record; tests never call the network.`,
      points,
    }, null, 1) + '\n');
    console.log(`wrote ${points.length} points to ${out}`);
    return;
  }
  if (!existsSync(pointsPath)) throw new Error(`${pointsPath} missing; run --generate first`);
  const all = (JSON.parse(readFileSync(pointsPath, 'utf8')) as { points: ProbePoint[] }).points;
  const points = only ? all.filter((p) => only.has(p.state)) : all;
  clearCache();
  const load = loadFrom(dir);
  const rows = await mapLimit(points, concurrency, async (p) => {
    const device = await resolvePoint(p.lon, p.lat, load);
    const vintage = vintageFor(device?.state ?? p.state, manifest);
    const remote = await geocode(p.lon, p.lat, vintage);
    return { p, device, remote, vintage };
  });
  const byState: Record<string, { n: number; bad: number }> = {};
  for (const { p, device, remote, vintage } of rows) {
    const s = (byState[p.state] ??= { n: 0, bad: 0 });
    s.n++;
    if (fmt(device) !== fmt(remote)) { s.bad++; console.log(`MISMATCH ${p.state}\t${p.lon},${p.lat}\tdevice=${fmt(device)}\tgeocoder(${vintage})=${fmt(remote)}`); }
  }
  const bad = Object.values(byState).reduce((n, s) => n + s.bad, 0);
  console.log(Object.entries(byState).map(([st, s]) => `${st} ${s.n - s.bad}/${s.n}`).join('  '));
  console.log(`set ${set} (${dir}): ${points.length} points, ${bad} mismatches`);
  if (bad) process.exit(1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
