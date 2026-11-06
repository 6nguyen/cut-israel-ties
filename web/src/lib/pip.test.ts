import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import fixture from './districts.fixture.json';
import fixture120 from './districts.fixture.120.json';
import { ACTIVE_CONGRESS, DISTRICTS_DIR, clearCache, contains, decode, fetchLoader, locateAll, pointInRing, resolveInState, resolvePoint, type Topology } from './pip';

const dir = new URL('../../public/districts/', import.meta.url);
const dir120 = new URL('../../public/districts-120/', import.meta.url);
const calls: string[] = [];
const loaderFor = (d: URL) => async (name: string): Promise<Topology> => {
  calls.push(name);
  return JSON.parse(readFileSync(new URL(`${name}.json`, d), 'utf8')) as Topology;
};
const load = loaderFor(dir);
const load120 = loaderFor(dir120);
type Manifest = { congress: number; overrides?: Record<string, { vintage: number; congress: number }>; files: Record<string, { gzip: number; source?: string }> };
const manifestOf = (d: URL) => JSON.parse(readFileSync(new URL('manifest.json', d), 'utf8')) as Manifest;
const underGates = (m: Manifest) => {
  expect(Object.keys(m.files)).toHaveLength(52);
  for (const [name, f] of Object.entries(m.files)) expect(f.gzip, name).toBeLessThanOrEqual(name === 'states' ? 150 * 1024 : 300 * 1024);
};

// Two unit squares sharing the edge x=1, the right one with a hole; delta-encoded with a transform.
const synthetic: Topology = {
  type: 'Topology',
  transform: { scale: [0.5, 0.5], translate: [10, 20] },
  arcs: [
    [[0, 0], [2, 0], [0, 2], [-2, 0], [0, -2]], // left square (10,20)-(11,21)
    [[2, 0], [2, 0], [0, 2], [-2, 0], [0, -2]], // right square (11,20)-(12,21)
    [[3, 1], [0, 0], [0, 0], [0, 0]], // degenerate placeholder, unused
    [[2, 0], [1, 0], [0, 1], [-1, 0], [0, -1]], // hole in the right square (11,20)-(11.5,20.5)
  ],
  objects: {
    districts: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', arcs: [[0]], properties: { district: 1 } },
        { type: 'Polygon', arcs: [[1], [3]], properties: { district: 2 } },
        { type: 'MultiPolygon', arcs: [[[-1]]], properties: { district: 3 } }, // reversed arc, same ring as district 1
      ],
    },
  },
};

describe('pip geometry', () => {
  it('ray-casts a point against a ring', () => {
    const square = Float64Array.from([0, 0, 1, 0, 1, 1, 0, 1, 0, 0]);
    expect(pointInRing(0.5, 0.5, square)).toBe(true);
    expect(pointInRing(1.5, 0.5, square)).toBe(false);
  });
  it('decodes delta-encoded arcs, reversed arcs and holes', () => {
    const shapes = decode<{ district: number }>(synthetic);
    expect(shapes[0].bbox).toEqual([10, 20, 11, 21]);
    expect(contains(shapes[0], 10.5, 20.5)).toBe(true);
    expect(contains(shapes[1], 11.75, 20.75)).toBe(true);
    expect(contains(shapes[1], 11.25, 20.25)).toBe(false); // inside the hole
    expect(contains(shapes[2], 10.5, 20.5)).toBe(true); // reversed arc
    expect(locateAll(shapes, 11.75, 20.75).map((p) => p.district)).toEqual([2]);
  });
  it('returns the first match on a shared border', () => {
    const shapes = decode<{ district: number }>(synthetic);
    const hits = locateAll(shapes, 11, 20.5).map((p) => p.district);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toBe(hits.includes(1) ? 1 : 2);
  });
});

describe('on-device district lookup', () => {
  it('resolves every recorded Census Geocoder point', async () => {
    clearCache(); calls.length = 0;
    const t0 = performance.now();
    for (const p of fixture.points) {
      expect(await resolvePoint(p.lon, p.lat, load), p.label).toEqual({ state: p.state, district: p.district });
    }
    const cold = performance.now() - t0;
    const t1 = performance.now();
    for (const p of fixture.points) await resolvePoint(p.lon, p.lat, load);
    const warm = performance.now() - t1;
    console.log(`lookup: ${fixture.points.length} points, cold ${cold.toFixed(0)} ms (incl. file reads + decode), warm ${warm.toFixed(0)} ms`);
    expect(fixture.points.length).toBeGreaterThanOrEqual(50);
    expect(warm).toBeLessThan(500);
  });
  it('covers an at-large state, DC and a split city', () => {
    const byLabel = Object.fromEntries(fixture.points.map((p) => [p.label, p]));
    expect(byLabel.WY.district).toBe(0);
    expect(byLabel.DC.district).toBe(0);
    expect(byLabel['PA-split'].state).toBe('PA');
  });
  it('loads the state outline first, then one state file, and never a coordinate', async () => {
    clearCache(); calls.length = 0;
    await resolvePoint(-97.7404, 30.2747, load);
    expect(calls).toEqual(['states', 'TX']);
    for (const c of calls) expect(c).toMatch(/^(states|[A-Z]{2})$/);
  });
  it('returns null for open water, abroad and bad input', async () => {
    expect(await resolvePoint(-90, 25, load)).toBeNull(); // Gulf of Mexico
    expect(await resolvePoint(-100, 50.5, load)).toBeNull(); // Manitoba
    expect(await resolvePoint(Number.NaN, 30, load)).toBeNull();
  });
  it('ships every state file under the size gates recorded in the manifest', () => {
    const manifest = manifestOf(dir);
    expect(manifest.congress).toBe(119);
    underGates(manifest);
  });
});

// district-vintage-rollover §2/§3: the cd120 set ships beside cd119 until the dated flip.
describe('120th-Congress set (web/public/districts-120)', () => {
  afterEach(() => vi.restoreAllMocks());
  it('ACTIVE_CONGRESS picks the directory; 119 today, so only /districts is ever requested', async () => {
    expect(ACTIVE_CONGRESS).toBe(119);
    expect(DISTRICTS_DIR).toBe('/districts');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => Response.json(JSON.parse(readFileSync(new URL(`${String(input).split('/').pop()}`, dir), 'utf8'))));
    await fetchLoader('states');
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(['/districts/states.json']);
  });
  it('resolves every fixture-120 point, Missouri on the 2022 map, redrawn areas on the 2026 maps', async () => {
    clearCache();
    for (const p of fixture120.points) {
      expect(await resolvePoint(p.lon, p.lat, load120), p.label).toEqual({ state: p.state, district: p.district });
    }
    const by = Object.fromEntries(fixture120.points.map((p) => [p.label, p]));
    expect(by['Kansas City']).toMatchObject({ state: 'MO', district: 5 });
    expect(by.Austin).toMatchObject({ state: 'TX', district: 10 });
    expect(fixture120.points.length).toBeGreaterThanOrEqual(57);
    clearCache();
  });
  it('the two sets disagree exactly where the maps changed and agree on the Kansas City point', async () => {
    clearCache();
    const austin = fixture120.points.find((p) => p.label === 'Austin')!;
    expect(await resolvePoint(austin.lon, austin.lat, load)).toEqual({ state: 'TX', district: 37 });
    const kc = fixture120.points.find((p) => p.label === 'Kansas City')!;
    expect(await resolvePoint(kc.lon, kc.lat, load)).toEqual({ state: 'MO', district: 5 });
    clearCache();
  });
  it('manifest records congress 120, the Missouri override with its cd119 source, and every file under the gates', () => {
    const m = manifestOf(dir120);
    expect(m.congress).toBe(120);
    expect(m.overrides).toEqual({ MO: { vintage: 2025, congress: 119 } });
    expect(m.files.MO.source).toMatch(/TIGER2025\/CD\/tl_2025_29_cd119\.zip$/);
    expect(m.files.TX.source).toMatch(/TIGER2026\/CD\/tl_2026_48_cd120\.zip$/);
    underGates(m);
  });
});

describe('resolveInState (address-autocomplete §3)', () => {
  beforeEach(() => { clearCache(); calls.length = 0; });
  it('loads only the named state file and places the point in it', async () => {
    const ca = fixture.points.find((p) => p.state === 'CA')!;
    expect(await resolveInState('CA', ca.lon, ca.lat, load)).toEqual({ state: 'CA', district: ca.district });
    expect(calls).toEqual(['CA']);
  });
  it('returns null for a point outside every district of that state, and never loads for a bad state code or coordinate', async () => {
    expect(await resolveInState('CA', -130, 30, load)).toBeNull(); // Pacific
    expect(calls).toEqual(['CA']);
    expect(await resolveInState('ca', -121.4934, 38.5767, load)).toBeNull();
    expect(await resolveInState('states', -121.4934, 38.5767, load)).toBeNull();
    expect(await resolveInState('CA', Number.NaN, 38.5767, load)).toBeNull();
    expect(calls).toEqual(['CA']);
  });
});
