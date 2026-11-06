// On-device district lookup (docs/specs/on-device-districts.md).
// Decodes the TopoJSON files written by scripts/build-districts.ts and
// ray-casts a point against them. Coordinates never leave this module:
// the only network traffic is GET <DISTRICTS_DIR>/<name>.json, no query string.

export interface Place { state: string; district: number }

/**
 * Which district set the browser loads (docs/prd/district-vintage-rollover.md §3). 119 until the
 * 120th Congress is sworn in on 2027-01-03; the flip PR sets 120 here and DISTRICT_VINTAGE =
 * Current_Current in worker/wrangler.jsonc in the same commit, after the roster PR has merged.
 */
export const ACTIVE_CONGRESS: number = 119;
/** Directory under web/public for the active set: `/districts` is cd119, `/districts-<n>` any later set. */
export const DISTRICTS_DIR = ACTIVE_CONGRESS === 119 ? '/districts' : `/districts-${ACTIVE_CONGRESS}`;

interface TopoGeometry {
  type: 'Polygon' | 'MultiPolygon';
  arcs: number[][] | number[][][];
  properties?: Record<string, unknown>;
}
export interface Topology {
  type: 'Topology';
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: Record<string, { type: 'GeometryCollection'; geometries: TopoGeometry[] }>;
}

/** One decoded feature: flat rings [x0,y0,x1,y1,…] in lon/lat and their joint bbox. */
export interface Shape<P> { props: P; rings: Float64Array[]; bbox: [number, number, number, number] }

export type Loader = (name: string) => Promise<Topology>;

function decodeArcs(t: Topology): number[][][] {
  const tr = t.transform;
  return t.arcs.map((arc) => {
    if (!tr) return arc;
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      x += dx; y += dy;
      return [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]];
    });
  });
}

function ring(arcs: number[][][], indices: number[]): Float64Array {
  const pts: number[] = [];
  for (const i of indices) {
    const arc = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
    // Consecutive arcs share their end point; keep it once.
    for (let k = pts.length ? 1 : 0; k < arc.length; k++) pts.push(arc[k][0], arc[k][1]);
  }
  return Float64Array.from(pts);
}

/** TopoJSON → plain shapes. The first object in the file is the layer. */
export function decode<P>(t: Topology): Shape<P>[] {
  const arcs = decodeArcs(t);
  const layer = Object.values(t.objects)[0];
  if (!layer) return [];
  return layer.geometries.map((g) => {
    const polys = (g.type === 'Polygon' ? [g.arcs] : g.arcs) as number[][][];
    const rings = polys.flatMap((poly) => poly.map((idx) => ring(arcs, idx)));
    const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rings) for (let k = 0; k < r.length; k += 2) {
      if (r[k] < bbox[0]) bbox[0] = r[k]; if (r[k] > bbox[2]) bbox[2] = r[k];
      if (r[k + 1] < bbox[1]) bbox[1] = r[k + 1]; if (r[k + 1] > bbox[3]) bbox[3] = r[k + 1];
    }
    return { props: (g.properties ?? {}) as P, rings, bbox };
  });
}

/** Even-odd ray cast against one flat ring. */
export function pointInRing(x: number, y: number, r: Float64Array): boolean {
  let inside = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[2 * i], yi = r[2 * i + 1], xj = r[2 * j], yj = r[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the shape = inside an odd number of its rings (holes cancel outers). */
export function contains<P>(s: Shape<P>, lon: number, lat: number): boolean {
  if (lon < s.bbox[0] || lon > s.bbox[2] || lat < s.bbox[1] || lat > s.bbox[3]) return false;
  let hits = 0;
  for (const r of s.rings) if (pointInRing(lon, lat, r)) hits++;
  return hits % 2 === 1;
}

/** Every shape containing the point, file order (a border point lists both). */
export function locateAll<P>(shapes: Shape<P>[], lon: number, lat: number): P[] {
  return shapes.filter((s) => contains(s, lon, lat)).map((s) => s.props);
}

export const fetchLoader: Loader = async (name) => {
  const res = await fetch(`${DISTRICTS_DIR}/${encodeURIComponent(name)}.json`);
  if (!res.ok) throw new Error(`${DISTRICTS_DIR}/${name}.json: ${res.status}`);
  return (await res.json()) as Topology;
};

const cache = new Map<string, Shape<Record<string, unknown>>[]>();
async function shapes(name: string, load: Loader): Promise<Shape<Record<string, unknown>>[]> {
  let s = cache.get(name);
  if (!s) { s = decode(await load(name)); cache.set(name, s); }
  return s;
}
/** Tests only: forget decoded files. */
export function clearCache(): void { cache.clear(); }

/**
 * State outline first, then that state's districts. The coarse outlines can
 * shave a coastline, so when no outline contains the point the states whose
 * bbox does are tried as well; the first district hit wins, nothing → null.
 */
export async function resolvePoint(lon: number, lat: number, load: Loader = fetchLoader): Promise<Place | null> {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const states = await shapes('states', load);
  let candidates = states.filter((s) => contains(s, lon, lat));
  if (candidates.length === 0) {
    candidates = states.filter((s) => lon >= s.bbox[0] && lon <= s.bbox[2] && lat >= s.bbox[1] && lat <= s.bbox[3]);
  }
  for (const c of candidates) {
    const state = String(c.props.state);
    const hit = locateAll(await shapes(state, load), lon, lat)[0];
    if (hit && typeof hit.district === 'number') return { state, district: hit.district };
  }
  return null;
}
