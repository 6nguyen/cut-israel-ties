// Shared by the maintainer draft tools (draft-position, draft-holding): fetch a page as readable
// text, verify a model's quote against it by code, format a CSV cell. The model proposes; this
// module is where code checks. Nothing here writes a file.
import { SCREEN_MODEL } from './anthropic';

export const DRAFT_MODEL = SCREEN_MODEL; // claude-haiku-5-5
export const MAX_CHARS = 60_000;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' };

/** HTML → readable text: drops script/style/nav noise, tags and comments, decodes entities, collapses whitespace. */
export function stripTags(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|br|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') { const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : m; }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Whitespace- and quote-insensitive form used for the verbatim check on both sides. */
export const normalise = (s: string): string =>
  s.replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

/** True when `quote` appears verbatim (modulo whitespace and quote glyphs) in `text`. */
export function quoteAppears(quote: string, text: string): boolean {
  const q = normalise(quote);
  return q.length >= 12 && normalise(text).includes(q);
}

/** One CSV cell, quoted when it holds a comma, quote or newline. */
export const csvCell = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export type PageText = { kind: 'text'; text: string } | { kind: 'unsupported'; reason: string };

/**
 * Fetch a URL and return its readable text (HTML stripped, plain text as is), capped at MAX_CHARS.
 * PDF bodies (by content-type or `%PDF-` magic) are reported as unsupported rather than parsed: no
 * PDF dependency ships in the Worker package, so the maintainer opens the HTML version or saves the
 * text. Throws on a non-2xx response.
 */
export async function fetchPageText(fetchImpl: typeof fetch, url: string, tool: string): Promise<PageText> {
  const res = await fetchImpl(url, { headers: { accept: 'text/html,text/plain;q=0.9', 'user-agent': `cut-ties ${tool} (maintainer tool)` } });
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const type = (res.headers.get('content-type') ?? '').toLowerCase();
  const body = await res.text();
  if (type.includes('application/pdf') || body.startsWith('%PDF-')) return { kind: 'unsupported', reason: 'PDF input is not supported; use the HTML version of the report or save its text to a .txt URL' };
  const text = (type.includes('text/plain') ? body.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim() : stripTags(body)).slice(0, MAX_CHARS);
  return { kind: 'text', text };
}
