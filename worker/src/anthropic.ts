// Raw Messages API over the injected fetch (no SDK: the Worker bundle stays small and tests stub fetch).
export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const DOC_MODEL = 'claude-opus-5-5';
export const SCREEN_MODEL = 'claude-haiku-5-5';
const VERSION = '2026-10-21';
const BETA = 'server-side-fallback-2026-07-01';

export interface Usage { input_tokens: number; output_tokens: number }
export interface StreamResult { text: string; usage: Usage; stop_reason: string | null }

function headers(apiKey: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': VERSION, 'anthropic-beta': BETA };
}

export class AnthropicError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Non-streaming call; returns the first text block (structured output arrives as JSON text). */
export async function callMessage(fetchImpl: typeof fetch, apiKey: string, body: Record<string, unknown>): Promise<{ text: string; usage: Usage }> {
  const res = await fetchImpl(ANTHROPIC_URL, { method: 'POST', headers: headers(apiKey), body: JSON.stringify({ ...body, fallbacks: 'default' }) });
  if (!res.ok) throw new AnthropicError(res.status, `anthropic ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: Usage };
  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  return { text, usage: data.usage ?? { input_tokens: 0, output_tokens: 0 } };
}

/** Streaming call; `onText` gets every text delta in order. Resolves with the whole text and usage. */
export async function streamMessage(
  fetchImpl: typeof fetch,
  apiKey: string,
  body: Record<string, unknown>,
  onText: (t: string) => void,
): Promise<StreamResult> {
  const res = await fetchImpl(ANTHROPIC_URL, { method: 'POST', headers: headers(apiKey), body: JSON.stringify({ ...body, stream: true, fallbacks: 'default' }) });
  if (!res.ok || !res.body) throw new AnthropicError(res.status, `anthropic ${res.status}`);
  const usage: Usage = { input_tokens: 0, output_tokens: 0 };
  let stop_reason: string | null = null;
  let text = '';
  for await (const ev of sseEvents(res.body)) {
    let data: Record<string, unknown>;
    try { data = JSON.parse(ev.data) as Record<string, unknown>; } catch { continue; }
    const type = data.type as string;
    if (type === 'content_block_delta') {
      const delta = data.delta as { type: string; text?: string };
      if (delta.type === 'text_delta' && delta.text) { text += delta.text; onText(delta.text); }
    } else if (type === 'message_start') {
      const u = (data.message as { usage?: Partial<Usage> })?.usage;
      usage.input_tokens = u?.input_tokens ?? 0;
    } else if (type === 'message_delta') {
      const u = data.usage as Partial<Usage> | undefined;
      if (u?.output_tokens !== undefined) usage.output_tokens = u.output_tokens;
      stop_reason = ((data.delta as { stop_reason?: string })?.stop_reason) ?? stop_reason;
    } else if (type === 'error') {
      throw new AnthropicError(502, `anthropic stream error: ${JSON.stringify(data.error)}`);
    }
  }
  return { text, usage, stop_reason };
}

/** Minimal SSE parser: yields {event, data} per blank-line-separated block. */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    buf += done ? '' : dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) yield { event, data: data.join('\n') };
    }
    if (done) return;
  }
}

/** Builds an SSE body from canned events (tests, and the shape the API sends). */
export function encodeSse(events: { event: string; data: unknown }[]): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}
