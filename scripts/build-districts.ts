#!/usr/bin/env npx tsx
// build-districts — Census TIGER/Line congressional districts → per-state TopoJSON
// for the on-device lookup (docs/specs/on-device-districts.md).
//
//   npx tsx scripts/build-districts.ts [--cache DIR] [--vintage 2025] [--congress 119]
//                                      [--interval 30] [--state-interval 1000] [--out web/public/districts]
//                                      [--override MO=2025:119]...  (state from another vintage:congress)
//                                      [--fixture web/src/lib/districts.fixture.json]
//                                      [--gate off]   (tolerance experiments only: skip the size gates)
//
// Downloads tl_<vintage>_<fips>_cd<congress>.zip per state into --cache (outside
// the repo; the archive is data and is only unzipped), simplifies with
// mapshaper (Visvalingam, `interval` metres), writes <STATE>.json (gzip
// ≤300 KB), states.json (coarse outlines, gzip ≤150 KB) and manifest.json
// (vintage, overrides, tolerance, source URL and sha256 per file). Fails above
// the size gates and when a point in the set's fixture (default
// districts.fixture.json for the 119th, districts.fixture.<congress>.json
// otherwise) stops resolving to the recorded district. Run by the maintainer;
// the output is committed. cd120 (district-vintage-rollover §2):
//   npx tsx scripts/build-districts.ts --vintage 2026 --congress 120 --override MO=2025:119 \
//     --out web/public/districts-120 --cache /path/outside/repo
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import mapshaper from 'mapshaper';
import { clearCache, resolvePoint, type Topology } from '../web/src/lib/pip.ts';

const FIPS: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
};
const STATE_MAX = 300 * 1024;
const STATES_MAX = 150 * 1024;

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
function args(name: string): string[] {
  return process.argv.flatMap((a, i) => (a === `--${name}` && process.argv[i + 1] ? [process.argv[i + 1]] : []));
}
const root = resolve(import.meta.dirname, '..');
const cache = resolve(arg('cache', join(tmpdir(), 'cut-ties-tiger')));
const vintage = arg('vintage', '2025');
const congress = arg('congress', '119');
const interval = Number(arg('interval', '30'));
const stateInterval = Number(arg('state-interval', '1000'));
const out = resolve(root, arg('out', 'web/public/districts'));
const fixturePath = resolve(root, arg('fixture', congress === '119' ? 'web/src/lib/districts.fixture.json' : `web/src/lib/districts.fixture.${congress}.json`));
const gate = arg('gate', 'on') !== 'off';
/** `--override MO=2025:119`: that state's shapefile comes from another TIGER vintage and Congress. */
interface Source { vintage: string; congress: string }
const overrides: Record<string, Source> = {};
for (const o of args('override')) {
  const m = /^([A-Z]{2})=(\d{4}):(\d{3})$/.exec(o);
  if (!m) throw new Error(`--override expects STATE=VINTAGE:CONGRESS, got ${o}`);
  overrides[m[1]] = { vintage: m[2], congress: m[3] };
}
const sourceOf = (state: string): Source => overrides[state] ?? { vintage, congress };
const urlOf = (fips: string, src: Source) => `https://www2.census.gov/geo/tiger/TIGER${src.vintage}/CD/tl_${src.vintage}_${fips}_cd${src.congress}.zip`;
mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });

async function download(fips: string, src: Source): Promise<string> {
  const base = `tl_${src.vintage}_${fips}_cd${src.congress}`;
  const zip = join(cache, `${base}.zip`);
  if (!existsSync(zip)) {
    const url = urlOf(fips, src);
    let last = '';
    for (let attempt = 1; attempt <= 2 && !existsSync(zip); attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
      } catch (e) { last = String(e); }
    }
    if (!existsSync(zip)) throw new Error(`download failed after 2 attempts: ${url} (${last})`);
  }
  const dir = join(cache, base);
  if (!existsSync(join(dir, `${base}.shp`))) {
    mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-oq', zip, '-d', dir]);
  }
  return join(dir, `${base}.shp`);
}

function sha256(buf: Buffer): string { return createHash('sha256').update(buf).digest('hex'); }

async function main(): Promise<void> {
  const files: Record<string, { bytes: number; gzip: number; sha256: string; source?: string }> = {};
  const outlines: string[] = [];
  let total = 0;
  for (const [fips, state] of Object.entries(FIPS)) {
    const src = sourceOf(state);
    const cdField = `CD${src.congress}FP`;
    const shp = await download(fips, src);
    const target = join(out, `${state}.json`);
    await mapshaper.runCommands(
      `-i "${shp}" -filter '${cdField} != "ZZ"' ` +
      `-each 'district = (${cdField} === "00" || ${cdField} === "98") ? 0 : +${cdField}' -filter-fields district ` +
      `-simplify visvalingam interval=${interval} keep-shapes -rename-layers districts ` +
      `-o "${target}" format=topojson`,
    );
    const outline = join(cache, `outline_${state}.json`);
    await mapshaper.runCommands(
      `-i "${shp}" -filter '${cdField} != "ZZ"' -dissolve -each 'state = "${state}"' -filter-fields state ` +
      `-simplify visvalingam interval=${stateInterval} keep-shapes -o "${outline}" format=geojson`,
    );
    outlines.push(outline);
    const buf = readFileSync(target);
    const gz = gzipSync(buf).length;
    if (gate && gz > STATE_MAX) throw new Error(`${state}.json is ${gz} bytes gzip (max ${STATE_MAX}); raise --interval`);
    files[state] = { bytes: buf.length, gzip: gz, sha256: sha256(buf), source: urlOf(fips, src) };
    total += buf.length;
    console.log(`${state}\t${(buf.length / 1024).toFixed(0)} KB\t${(gz / 1024).toFixed(0)} KB gz${overrides[state] ? `\t(override ${src.vintage}:${src.congress})` : ''}`);
  }
  const statesFile = join(out, 'states.json');
  await mapshaper.runCommands(
    `-i combine-files ${outlines.map((f) => `"${f}"`).join(' ')} -merge-layers force -rename-layers states ` +
    `-o "${statesFile}" format=topojson`,
  );
  const sbuf = readFileSync(statesFile);
  const sgz = gzipSync(sbuf).length;
  if (gate && sgz > STATES_MAX) throw new Error(`states.json is ${sgz} bytes gzip (max ${STATES_MAX}); raise --state-interval`);
  files.states = { bytes: sbuf.length, gzip: sgz, sha256: sha256(sbuf) };
  total += sbuf.length;
  console.log(`states\t${(sbuf.length / 1024).toFixed(0)} KB\t${(sgz / 1024).toFixed(0)} KB gz\ntotal\t${(total / 1024 / 1024).toFixed(1)} MB`);

  // Fixture gate: every recorded geocoder answer for this set still resolves on-device.
  if (existsSync(fixturePath)) {
    const { points } = JSON.parse(readFileSync(fixturePath, 'utf8')) as { points: Array<{ label: string; lat: number; lon: number; state: string; district: number }> };
    clearCache();
    const load = async (name: string) => JSON.parse(readFileSync(join(out, `${name}.json`), 'utf8')) as Topology;
    const bad: string[] = [];
    for (const p of points) {
      const got = await resolvePoint(p.lon, p.lat, load);
      if (!got || got.state !== p.state || got.district !== p.district) bad.push(`${p.label}: expected ${p.state}-${p.district}, got ${got ? `${got.state}-${got.district}` : 'null'}`);
    }
    if (bad.length) throw new Error(`fixture mismatch at interval=${interval}/${stateInterval}:\n${bad.join('\n')}`);
    console.log(`fixture\t${points.length} points resolve (${fixturePath})`);
  } else console.log(`fixture\tnone at ${fixturePath}; record one before committing the set`);

  writeFileSync(join(out, 'manifest.json'), JSON.stringify({
    source: `TIGER${vintage} CD${congress} (https://www2.census.gov/geo/tiger/TIGER${vintage}/CD/)`,
    congress: Number(congress),
    overrides: Object.fromEntries(Object.entries(overrides).map(([st, o]) => [st, { vintage: Number(o.vintage), congress: Number(o.congress) }])),
    built: new Date().toISOString().slice(0, 10),
    simplify: { method: 'visvalingam', interval_m: interval, state_interval_m: stateInterval, keep_shapes: true },
    limits: { state_gzip: STATE_MAX, states_gzip: STATES_MAX },
    files,
  }, null, 1) + '\n');
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
