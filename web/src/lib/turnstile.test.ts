import { describe, expect, it, vi } from 'vitest';
import { createTurnstile, type TurnstileApi } from './turnstile';

type Opts = Parameters<TurnstileApi['render']>[1];
/** A fake widget: `issue()` plays the callback, `expire()` the expired-callback. */
function fakeApi() {
  let opts: Opts | undefined;
  let expired = false;
  const api: TurnstileApi & { issue: (t: string) => void; expire: () => void } = {
    render: vi.fn((_el, o) => { opts = o; return 'w1'; }),
    reset: vi.fn(() => { expired = false; }),
    remove: vi.fn(),
    isExpired: () => expired,
    issue: (t) => opts?.callback(t),
    expire: () => { expired = true; opts?.['expired-callback']?.(); },
  };
  return api;
}
const el = () => ({} as HTMLElement);
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createTurnstile', () => {
  it('renders when the container mounts, even long after the island did, and hands back the token', async () => {
    const api = fakeApi();
    const ts = createTurnstile('key', () => Promise.resolve(api));
    const pending = ts.nextToken(); // asked before the form rendered
    ts.mount(el());
    await tick();
    expect(api.render).toHaveBeenCalledTimes(1);
    api.issue('t1');
    expect(await pending).toBe('t1');
    expect(await ts.nextToken()).toBe('t1');
  });

  it('an expired token is dropped and the widget reset; the next submit waits for the fresh one', async () => {
    const api = fakeApi();
    const ts = createTurnstile('key', () => Promise.resolve(api));
    ts.mount(el()); await tick(); api.issue('t1');
    api.expire();
    expect(api.reset).toHaveBeenCalledTimes(1);
    const next = ts.nextToken();
    api.issue('t2');
    expect(await next).toBe('t2');
  });

  it('a token the widget still reports as expired is never reused', async () => {
    const api = fakeApi();
    const ts = createTurnstile('key', () => Promise.resolve(api));
    ts.mount(el()); await tick(); api.issue('t1');
    api.isExpired = () => true;
    const next = ts.nextToken();
    expect(api.reset).toHaveBeenCalledTimes(1);
    api.issue('t2');
    expect(await next).toBe('t2');
  });

  it('reset() after a request spends the token: the next call waits for a new one or gives up after the wait', async () => {
    const api = fakeApi();
    const ts = createTurnstile('key', () => Promise.resolve(api), 10);
    ts.mount(el()); await tick(); api.issue('t1');
    ts.reset();
    expect(await ts.nextToken()).toBeUndefined();
  });

  it('after reset() the next call waits for the in-flight challenge instead of resetting again', async () => {
    const api = fakeApi();
    const ts = createTurnstile('key', () => Promise.resolve(api));
    ts.mount(el()); await tick(); api.issue('t1');
    ts.reset();
    const next = ts.nextToken();
    expect(api.reset).toHaveBeenCalledTimes(1); // a second reset would restart the challenge and delay the token
    api.issue('t2');
    expect(await next).toBe('t2');
  });

  it('unmounting removes the widget; remounting renders a new one', async () => {
    const api = fakeApi();
    const ts = createTurnstile('key', () => Promise.resolve(api));
    ts.mount(el()); await tick();
    ts.mount(null);
    expect(api.remove).toHaveBeenCalledWith('w1');
    ts.mount(el()); await tick();
    expect(api.render).toHaveBeenCalledTimes(2);
  });

  it('without a site key nothing loads and nextToken is undefined at once', async () => {
    const load = vi.fn(() => Promise.resolve(fakeApi()));
    const ts = createTurnstile(undefined, load);
    ts.mount(el());
    expect(load).not.toHaveBeenCalled();
    expect(await ts.nextToken()).toBeUndefined();
  });
});
