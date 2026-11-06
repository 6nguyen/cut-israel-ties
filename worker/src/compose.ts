// leader-call-scripts §2: composes a standard-script template from an action's script blocks. One variant per slot
// (or `pick` of them), chosen by a seeded PRNG from the variants eligible for this target and these fields, so the
// same seed always gives the same script and a new seed gives another of the thousands of checked combinations.

export type Chamber = 'house' | 'senate';
export interface When { chamber?: Chamber; self?: boolean; has?: string[] }
export interface Variant { id: string; text: string; when: When }
export interface Slot { name: string; pick: number; carries: ('ask' | 'mention')[]; variants: Variant[] }
export interface ScriptBlocks { incumbents: string[]; slots: Slot[] }
/** What eligibility needs to know about one request: the target and whether a placeholder renders non-empty. */
export interface ComposeTarget { id: string; chamber: Chamber | null; present: (placeholder: string) => boolean }

const SLOT_KEYS = new Set(['name', 'pick', 'carries', 'variants']);
const VARIANT_KEYS = new Set(['id', 'text', 'when']);
const WHEN_KEYS = new Set(['chamber', 'self', 'has']);
const ID_RE = /^[a-z][a-z0-9_]*$/;

function keysOf(o: Record<string, unknown>, allowed: Set<string>, where: string): void {
  for (const k of Object.keys(o)) if (!allowed.has(k)) throw new Error(`${where}: unknown key ${k}`);
}

/** Validates the YAML shape and fills defaults; throws with the action, slot and variant in the message. */
export function parseBlocks(raw: unknown, where: string): ScriptBlocks {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${where}: script blocks must be a mapping`);
  const r = raw as Record<string, unknown>;
  keysOf(r, new Set(['incumbents', 'slots']), where);
  const incumbents = Array.isArray(r.incumbents) ? r.incumbents.map(String) : [];
  if (!Array.isArray(r.slots) || r.slots.length === 0) throw new Error(`${where}: slots must be a non-empty list`);
  const ids = new Set<string>();
  const names = new Set<string>();
  const slots: Slot[] = r.slots.map((s: unknown, i: number) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error(`${where}: slot ${i + 1} must be a mapping`);
    const o = s as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name : '';
    const at = `${where}: slot ${name || i + 1}`;
    keysOf(o, SLOT_KEYS, at);
    if (!ID_RE.test(name)) throw new Error(`${at}: name must match ${ID_RE}`);
    if (names.has(name)) throw new Error(`${at}: duplicate slot name`);
    names.add(name);
    const pick = o.pick === undefined ? 1 : o.pick;
    if (!Number.isInteger(pick) || (pick as number) < 1) throw new Error(`${at}: pick must be a positive integer`);
    const carries = o.carries === undefined ? [] : o.carries;
    if (!Array.isArray(carries) || !carries.every((c) => c === 'ask' || c === 'mention')) throw new Error(`${at}: carries may list only ask and mention`);
    if (!Array.isArray(o.variants) || o.variants.length === 0) throw new Error(`${at}: variants must be a non-empty list`);
    const variants: Variant[] = o.variants.map((v: unknown, j: number) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${at}: variant ${j + 1} must be a mapping`);
      const vo = v as Record<string, unknown>;
      const id = typeof vo.id === 'string' ? vo.id : '';
      const vat = `${at}: variant ${id || j + 1}`;
      keysOf(vo, VARIANT_KEYS, vat);
      if (!ID_RE.test(id)) throw new Error(`${vat}: id must match ${ID_RE}`);
      if (ids.has(id)) throw new Error(`${vat}: duplicate variant id`);
      ids.add(id);
      if (typeof vo.text !== 'string' || vo.text.trim() === '') throw new Error(`${vat}: text must be a non-empty string`);
      const when: When = {};
      if (vo.when !== undefined) {
        if (!vo.when || typeof vo.when !== 'object' || Array.isArray(vo.when)) throw new Error(`${vat}: when must be a mapping`);
        const w = vo.when as Record<string, unknown>;
        keysOf(w, WHEN_KEYS, `${vat}: when`);
        if (w.chamber !== undefined) {
          if (w.chamber !== 'house' && w.chamber !== 'senate') throw new Error(`${vat}: when.chamber must be house or senate`);
          when.chamber = w.chamber;
        }
        if (w.self !== undefined) {
          if (typeof w.self !== 'boolean') throw new Error(`${vat}: when.self must be true or false`);
          when.self = w.self;
        }
        if (w.has !== undefined) {
          if (!Array.isArray(w.has) || w.has.length === 0 || !w.has.every((h) => typeof h === 'string' && ID_RE.test(h))) throw new Error(`${vat}: when.has must be a list of placeholder names`);
          when.has = w.has as string[];
        }
      }
      return { id, text: vo.text.trim(), when };
    });
    return { name, pick: pick as number, carries: carries as Slot['carries'], variants };
  });
  return { incumbents, slots };
}

export function isSelf(blocks: ScriptBlocks, t: ComposeTarget): boolean {
  return blocks.incumbents.includes(t.id);
}

/** A variant is eligible when every `when` condition holds for this target and these fields. */
export function eligible(blocks: ScriptBlocks, v: Variant, t: ComposeTarget): boolean {
  const w = v.when;
  if (w.chamber !== undefined && w.chamber !== t.chamber) return false;
  if (w.self !== undefined && w.self !== isSelf(blocks, t)) return false;
  if (w.has && !w.has.every((h) => t.present(h))) return false;
  return true;
}

export function eligibleVariants(blocks: ScriptBlocks, slot: Slot, t: ComposeTarget): Variant[] {
  return slot.variants.filter((v) => eligible(blocks, v, t));
}

/** mulberry32: small, deterministic, good enough to spread picks; never used for anything secret. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The template for one request: `pick` distinct eligible variants per slot (kept in file order), variants joined
 * by a space, slots by a newline. Throws when a slot has too few eligible variants; the seed check rules that out.
 */
export function compose(blocks: ScriptBlocks, t: ComposeTarget, seed: number): { template: string; ids: string[] } {
  const rand = mulberry32(seed);
  const ids: string[] = [];
  const lines: string[] = [];
  for (const slot of blocks.slots) {
    const pool = eligibleVariants(blocks, slot, t);
    if (pool.length < slot.pick) throw new Error(`slot ${slot.name}: ${pool.length} eligible variants for ${t.id}, needs ${slot.pick}`);
    const idx = pool.map((_, i) => i);
    for (let i = 0; i < slot.pick; i++) {
      const j = i + Math.floor(rand() * (idx.length - i));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const chosen = idx.slice(0, slot.pick).sort((a, b) => a - b).map((i) => pool[i]);
    ids.push(...chosen.map((v) => v.id));
    lines.push(chosen.map((v) => v.text).join(' '));
  }
  return { template: lines.join('\n'), ids };
}

function choose(n: number, k: number): number {
  if (k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/** How many distinct scripts this target can get from these blocks with these fields. */
export function combinations(blocks: ScriptBlocks, t: ComposeTarget): number {
  return blocks.slots.reduce((n, slot) => n * choose(eligibleVariants(blocks, slot, t).length, slot.pick), 1);
}
