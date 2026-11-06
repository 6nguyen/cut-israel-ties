// One Turnstile widget per form, shared by the landing, act and visit islands.
//
// Tokens are single-use and expire after five minutes, and the widget can only
// render into a container that is in the DOM. The old per-island effects ran
// once on mount, so a form that mounted later (the act page shows "Loading your
// target…" first) never got a widget, and every submit was refused as a bot.
// Here the container is a callback ref: the widget renders whenever the
// container appears, is removed when it goes, and `nextToken()` always hands
// back a live token or waits for the next one.
import { useCallback, useRef } from 'preact/hooks';

export interface TurnstileApi {
  render(el: HTMLElement, opts: {
    sitekey: string;
    callback: (token: string) => void;
    'expired-callback'?: () => void;
    'error-callback'?: () => void;
    'timeout-callback'?: () => void;
  }): string;
  reset(id?: string): void;
  remove(id?: string): void;
  isExpired?(id?: string): boolean;
}
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi | undefined> | undefined;
/** Load the Turnstile script once per page; resolves undefined when it cannot load (the Worker then skips or refuses the check). */
export function loadTurnstile(): Promise<TurnstileApi | undefined> {
  if (typeof window === 'undefined') return Promise.resolve(undefined);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return (loading ??= new Promise((ok) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => ok(window.turnstile);
    s.onerror = () => ok(undefined);
    document.head.appendChild(s);
  }));
}

/** How long `nextToken()` waits for the widget to issue a token before sending the request without one. */
export const TOKEN_WAIT_MS = 8000;

export interface Turnstile {
  /** Container ref: `<div ref={mount} />`. Renders the widget when the node appears, removes it when the node goes. */
  mount: (el: HTMLElement | null) => void;
  /** The live token, or the next one the widget issues (≤ TOKEN_WAIT_MS); undefined without a site key or when none arrives. */
  nextToken: () => Promise<string | undefined>;
  /** After a request: the token it carried is spent, so ask the widget for a new one. */
  reset: () => void;
}

/** The hook's logic without Preact, so it runs under plain vitest with a fake api. */
export function createTurnstile(siteKey: string | undefined, load: () => Promise<TurnstileApi | undefined> = loadTurnstile, waitMs = TOKEN_WAIT_MS): Turnstile {
  let api: TurnstileApi | undefined;
  let node: HTMLElement | null = null;
  let widgetId: string | undefined;
  let token: string | undefined;
  let waiting: ((t: string | undefined) => void)[] = [];

  const clear = () => { token = undefined; };
  const reset = () => { clear(); if (api && widgetId) api.reset(widgetId); };

  function mount(el: HTMLElement | null) {
    if (el === node) return;
    if (node && api && widgetId) { api.remove(widgetId); widgetId = undefined; clear(); }
    node = el;
    if (!el || !siteKey) return;
    void load().then((ts) => {
      if (!ts || node !== el || widgetId) return;
      api = ts;
      widgetId = ts.render(el, {
        sitekey: siteKey,
        callback: (t) => { token = t; waiting.splice(0).forEach((w) => w(t)); },
        // A token expires after five minutes: drop it and ask for a fresh one, so a slow writer still submits.
        'expired-callback': reset,
        'error-callback': clear,
        'timeout-callback': clear,
      });
    });
  }

  function nextToken(): Promise<string | undefined> {
    if (!siteKey) return Promise.resolve(undefined);
    if (token) {
      if (!api?.isExpired?.(widgetId)) return Promise.resolve(token);
      reset(); // the widget says it is stale: start a fresh challenge
    }
    // No token: a challenge is already in flight (after a reset) or the widget is still rendering.
    // A reset here would restart it and push the token further out, so just wait for it.
    return new Promise((ok) => {
      waiting.push(ok);
      setTimeout(() => { waiting = waiting.filter((w) => w !== ok); ok(undefined); }, waitMs);
    });
  }

  return { mount, nextToken, reset };
}

export function useTurnstile(siteKey: string | undefined): Turnstile {
  const ctl = useRef<Turnstile | null>(null);
  ctl.current ??= createTurnstile(siteKey);
  // A stable callback ref: Preact calls it with the node on mount and null on unmount.
  const mount = useCallback((el: HTMLElement | null) => ctl.current!.mount(el), []);
  return { mount, nextToken: () => ctl.current!.nextToken(), reset: () => ctl.current!.reset() };
}
