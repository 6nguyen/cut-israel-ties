// §7.1 draft-position: the model proposes, code verifies the quote verbatim; no network in tests.
import { describe, expect, it } from 'vitest';
import { ANTHROPIC_URL } from '../src/anthropic';
import { CHANGED_BY, DRAFT_MODEL, POSITIONS_HEADER, draftPosition, quoteAppears, stripTags, type ModelVerdict } from '../src/draft-position';

const PAGE_URL = 'https://correa.house.gov/news/press-release/ndaa-statement';
const PAGE = `<!doctype html><html><head><title>Statement</title><style>p{color:red}</style>
<script>window.x = "Correa supports everything";</script></head>
<body><nav><a href="/">Home</a></nav>
<article><h1>Rep. Correa on the NDAA</h1><p class="date">October 30, 2026</p>
<p>&ldquo;I will vote to strip section&nbsp;1217 from the NDAA,&rdquo; Correa said. &quot;Integration without a vote is a blank check.&quot;</p>
<!-- draft: he also said something else -->
<p>Read more about the <b>committee</b> process.</p></article></body></html>`;

function stub(verdict: Partial<ModelVerdict> | string, html = PAGE) {
  const urls: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    urls.push(url);
    if (url === PAGE_URL) return new Response(html, { headers: { 'content-type': 'text/html' } });
    if (url === ANTHROPIC_URL) {
      const req = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(req);
      return Response.json({ content: [{ type: 'text', text: typeof verdict === 'string' ? verdict : JSON.stringify(verdict) }], usage: { input_tokens: 1, output_tokens: 1 } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { impl, urls, bodies };
}
const INPUT = { bioguide: 'C001110', memberName: 'Lou Correa', url: PAGE_URL, goal: 'ndaa-1217', goalAsk: 'Strike section 1217.' };
const QUOTE = 'I will vote to strip section 1217 from the NDAA';

describe('stripTags', () => {
  it('drops script, style, comments and tags; decodes entities; keeps the text', () => {
    const t = stripTags(PAGE);
    expect(t).not.toContain('supports everything');
    expect(t).not.toContain('color:red');
    expect(t).not.toContain('something else');
    expect(t).not.toMatch(/<[a-z]/);
    expect(t).toContain('“I will vote to strip section 1217 from the NDAA,” Correa said. "Integration without a vote is a blank check."');
    expect(t).toContain('October 30, 2026');
  });
  it('quoteAppears ignores whitespace and quote glyphs but not words', () => {
    const t = stripTags(PAGE);
    expect(quoteAppears('I will vote to strip   section 1217 from the NDAA,” Correa said', t)).toBe(true);
    expect(quoteAppears('I will vote to strip section 1217 from the bill', t)).toBe(false);
    expect(quoteAppears('NDAA', t)).toBe(false); // too short to be a statement
  });
});

describe('draftPosition', () => {
  it('prints one positions row matching the CSV header when the quote is verbatim and dated', async () => {
    const f = stub({ position: 'for', quote: QUOTE, date: '2026-10-30', reason: 'States he will vote to strip the section.' });
    const d = await draftPosition(f.impl, 'k', INPUT);
    expect(d).toEqual({ kind: 'row', row: `C001110,for,${PAGE_URL},2026-10-30,${CHANGED_BY}`, quote: QUOTE, date: '2026-10-30', reason: 'States he will vote to strip the section.' });
    expect((d as { row: string }).row.split(',')).toHaveLength(POSITIONS_HEADER.split(',').length);
    expect(f.urls).toEqual([PAGE_URL, ANTHROPIC_URL]); // the page, then the model; nothing else
    const req = f.bodies[0];
    expect(req.model).toBe(DRAFT_MODEL);
    expect(JSON.stringify(req.output_config)).toContain('json_schema');
    const content = String((req.messages as { content: string }[])[0].content);
    expect(content).toContain('<member>Lou Correa (C001110)</member>');
    expect(content).toContain('Strike section 1217.');
    expect(content).not.toContain('supports everything');
  });

  it('says no stated position when the quote is not verbatim on the page', async () => {
    const f = stub({ position: 'against', quote: 'I will vote to keep section 1217 in the NDAA', date: '2026-10-30', reason: 'r' });
    const d = await draftPosition(f.impl, 'k', INPUT);
    expect(d.kind).toBe('none');
    expect((d as { reason: string }).reason).toContain('not found verbatim');
  });

  it('says no stated position for unknown, for a missing date and for an unreadable reply', async () => {
    expect((await draftPosition(stub({ position: 'unknown', quote: '', date: '', reason: 'Only procedure is discussed.' }).impl, 'k', INPUT))).toEqual({ kind: 'none', reason: 'Only procedure is discussed.' });
    const noDate = await draftPosition(stub({ position: 'for', quote: QUOTE, date: 'October 30', reason: 'r' }).impl, 'k', INPUT);
    expect(noDate.kind).toBe('none');
    expect((noDate as { reason: string }).reason).toContain('no usable date');
    expect((await draftPosition(stub('not json').impl, 'k', INPUT)).kind).toBe('none');
    expect((await draftPosition(stub({ position: 'for', quote: QUOTE, date: '2026-10-30' }, '<html><body></body></html>').impl, 'k', INPUT)).kind).toBe('none');
  });

  it('a bad position value from the model never becomes a row', async () => {
    const d = await draftPosition(stub({ position: 'maybe' as ModelVerdict['position'], quote: QUOTE, date: '2026-10-30', reason: 'r' }).impl, 'k', INPUT);
    expect(d.kind).toBe('none');
  });
});
