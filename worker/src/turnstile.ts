export const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** True when the secret is unset (local dev) or Cloudflare confirms the token. */
export async function verifyTurnstile(
  token: string | undefined,
  secret: string | undefined,
  remoteIp: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp) form.set('remoteip', remoteIp);
  try {
    const res = await fetchImpl(TURNSTILE_URL, { method: 'POST', body: form });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
