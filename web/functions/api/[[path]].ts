// Pages Function: proxies /api/* to the Worker on PREVIEW deployments only.
// Production never reaches it: the Worker route `<domain>/api/*` runs before Pages on the zone.
// API_ORIGIN is a Pages environment variable (Preview) holding the Worker's workers.dev URL.
export async function onRequest(context: { request: Request; env: { API_ORIGIN?: string } }): Promise<Response> {
  const origin = context.env.API_ORIGIN;
  if (!origin) return new Response('API_ORIGIN is not set for this Pages environment (docs/guides/deploy.md)', { status: 503 });
  const url = new URL(context.request.url);
  const target = new URL(url.pathname + url.search, origin);
  return fetch(new Request(target.toString(), context.request));
}
