// address-autocomplete §1: the provider flag, the request gate and the debounce/abort loop the
// landing combobox drives. The provider adapters (§2) fill ADAPTERS; until then suggest() yields
// nothing and the field behaves as free text.

export type Provider = 'none' | 'mapbox' | 'geoapify';
export interface Suggestion { label: string; state: string; lon: number; lat: number }
export type Suggester = (q: string, signal: AbortSignal) => Promise<Suggestion[]>;

export const MIN_CHARS = 3;
export const DEBOUNCE_MS = 250;
export const TIMEOUT_MS = 2000;
export const LIMIT = 5;

const PROVIDERS: Provider[] = ['none', 'mapbox', 'geoapify'];
const ZIP = /^\d{5}(-\d{4})?$/;

type Env = Record<string, string | undefined>;

/** `PUBLIC_SUGGEST_PROVIDER`, or `none` when unset, unknown, or set without `PUBLIC_SUGGEST_TOKEN` (the build warns). */
export function configuredProvider(env: Env = import.meta.env as Env, warn: (m: string) => void = console.warn): Provider {
  const raw = (env.PUBLIC_SUGGEST_PROVIDER ?? 'none').trim().toLowerCase();
  if (!PROVIDERS.includes(raw as Provider)) { warn(`PUBLIC_SUGGEST_PROVIDER=${raw} is not one of ${PROVIDERS.join('|')}; suggestions off`); return 'none'; }
  const p = raw as Provider;
  if (p !== 'none' && !env.PUBLIC_SUGGEST_TOKEN) { warn(`PUBLIC_SUGGEST_PROVIDER=${p} without PUBLIC_SUGGEST_TOKEN; suggestions off`); return 'none'; }
  return p;
}

/** Attribution under the open list, as each provider's terms require. */
export const ATTRIBUTION: Record<Exclude<Provider, 'none'>, { text: string; href: string }> = {
  mapbox: { text: '© Mapbox', href: 'https://www.mapbox.com/about/maps/' },
  geoapify: { text: 'Powered by Geoapify', href: 'https://www.geoapify.com/' },
};

/** A request is worth making only for three or more characters that are not a bare ZIP. */
export function shouldSuggest(q: string): boolean {
  const t = q.trim();
  return t.length >= MIN_CHARS && !ZIP.test(t);
}

/** Keyboard model of the list: the next highlighted index (-1 = none), or null when the key is not ours. */
export function stepHighlight(key: string, active: number, count: number): number | null {
  if (count === 0) return null;
  if (key === 'ArrowDown') return Math.min(active + 1, count - 1);
  if (key === 'ArrowUp') return Math.max(active - 1, -1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

type Adapter = (q: string, token: string, signal: AbortSignal) => Promise<Suggestion[]>;
const ADAPTERS: Partial<Record<Provider, Adapter>> = {}; // §2 adds mapbox and geoapify

/** Up to LIMIT US street addresses for `q` from the configured provider; `[]` when no adapter or token. */
export async function suggest(q: string, signal: AbortSignal, provider: Provider = configuredProvider(), token: string | undefined = (import.meta.env as Env).PUBLIC_SUGGEST_TOKEN): Promise<Suggestion[]> {
  const adapter = ADAPTERS[provider];
  if (!adapter || !token) return [];
  return adapter(q, token, signal);
}

export interface Loop { input(q: string): void; cancel(): void }
export interface Timings { debounce?: number; timeout?: number }

/**
 * One request per debounced edit: a new keystroke cancels the pending timer and aborts the request in
 * flight; a gated input, a failure or a timeout reports `[]` so the list closes without an error.
 */
export function suggestLoop(suggester: Suggester, onResult: (s: Suggestion[], q: string) => void, t: Timings = {}): Loop {
  const debounce = t.debounce ?? DEBOUNCE_MS, timeout = t.timeout ?? TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctrl: AbortController | undefined;
  const cancel = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } ctrl?.abort(); ctrl = undefined; };
  return {
    input(q) {
      cancel();
      if (!shouldSuggest(q)) { onResult([], q); return; }
      timer = setTimeout(() => {
        timer = undefined;
        const c = new AbortController(); ctrl = c;
        const late = setTimeout(() => { c.abort(); onResult([], q); }, timeout);
        suggester(q, c.signal)
          .then((s) => { if (!c.signal.aborted) onResult(s.slice(0, LIMIT), q); }, () => { if (!c.signal.aborted) onResult([], q); })
          .finally(() => { clearTimeout(late); if (ctrl === c) ctrl = undefined; });
      }, debounce);
    },
    cancel,
  };
}
