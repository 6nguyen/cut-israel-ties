// state-holdings-sweep §1.1 draft-holding: the model proposes, code verifies quote, amount and date; no network.
import { describe, expect, it } from 'vitest';
import { ANTHROPIC_URL } from '../src/anthropic';
import { STATES_HEADER, amountsIn, draftHolding, type HoldingVerdict } from '../src/draft-holding';
import { fetchPageText } from '../src/draft-shared';

type Fixture = { url: string; body: string; type: string };
const F: Record<string, Fixture> = {
  held: { url: 'https://treasurer.example.gov/reports/q3-2026', type: 'text/html', body: `<!doctype html><html><head><title>Q3</title><script>var fake = "$999 million in Israel Bonds";</script></head>
<body><h1>Investment holdings report</h1><p>As of September 30, 2026 (2026-09-30).</p>
<p>The General Fund portfolio held <b>$12.5 million</b> in State of Israel bonds, purchased under the authority of the State Treasurer.</p>
<!-- draft note: $40 million --></body></html>` },
  none: { url: 'https://pension.example.gov/holdings.txt', type: 'text/plain', body: `Board of Trustees of the State Retirement System\nHoldings as of 2026-06-30\n\nThe System holds no bonds issued by the State of Israel and has no exposure to Israel Bonds.\nTotal fixed income: $4,100,000,000.` },
  undated: { url: 'https://treasurer.example.gov/news', type: 'text/html', body: `<html><body><p>The Treasurer's office confirms the state holds $62,000,000 in Israel Bonds and reviews the position at each rollover.</p></body></html>` },
  wrongQuote: { url: 'https://treasurer.example.gov/faq', type: 'text/html', body: `<html><body><p>Updated 2026-10-01.</p><p>Questions about the portfolio can be sent to the Treasurer's office. The office publishes a full holdings list quarterly.</p></body></html>` },
  mismatch: { url: 'https://treasurer.example.gov/annual', type: 'text/html', body: `<html><body><p>Annual report dated 2026-08-15.</p><p>The state held $8.2 million in Israel Bonds at fiscal year end, down from $9.6 million.</p></body></html>` },
  pdf: { url: 'https://treasurer.example.gov/report.pdf', type: 'application/pdf', body: '%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n' },
};

function stub(verdict: Partial<HoldingVerdict> | string) {
  const urls: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    urls.push(url);
    const f = Object.values(F).find((x) => x.url === url);
    if (f) return new Response(f.body, { headers: { 'content-type': f.type } });
    if (url === ANTHROPIC_URL) {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ content: [{ type: 'text', text: typeof verdict === 'string' ? verdict : JSON.stringify(verdict) }], usage: { input_tokens: 1, output_tokens: 1 } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { impl, urls, bodies };
}
const HELD_QUOTE = 'The General Fund portfolio held $12.5 million in State of Israel bonds, purchased under the authority of the State Treasurer.';
const NONE_QUOTE = 'The System holds no bonds issued by the State of Israel and has no exposure to Israel Bonds.';

describe('amountsIn', () => {
  it('reads dollar figures with scale words and separators', () => {
    expect(amountsIn('held $12.5 million in bonds')).toContain(12_500_000);
    expect(amountsIn('$62,000,000 in Israel Bonds')).toContain(62_000_000);
    expect(amountsIn('about 1.2 billion')).toContain(1_200_000_000);
    expect(amountsIn('none held')).toEqual([]);
  });
});

describe('fetchPageText', () => {
  it('reads plain text as is and refuses PDF bodies without parsing them', async () => {
    const txt = await fetchPageText(stub('').impl, F.none.url, 't');
    expect(txt).toMatchObject({ kind: 'text' });
    expect((txt as { text: string }).text).toContain(NONE_QUOTE);
    const pdf = await fetchPageText(stub('').impl, F.pdf.url, 't');
    expect(pdf.kind).toBe('unsupported');
  });
});

describe('draftHolding (six fixtures, mocked model)', () => {
  it('1. held: prints a states.csv row when the quote is on the page, the amount is in the quote and the date is well-formed', async () => {
    const f = stub({ status: 'held', amount_usd: 12_500_000, date: '2026-09-30', decider: 'State Treasurer', quote: HELD_QUOTE, reason: 'Q3 report states the holding.' });
    const d = await draftHolding(f.impl, 'k', { state: 'MD', url: F.held.url });
    expect(d).toMatchObject({ kind: 'row', status: 'held', amount: 12_500_000, date: '2026-09-30', decider: 'State Treasurer', quote: HELD_QUOTE });
    const row = (d as { row: string }).row;
    expect(row).toBe(`MD,,,State Treasurer,12500000,2026-09-30,${F.held.url},,,,held`);
    expect(row.split(',')).toHaveLength(STATES_HEADER.split(',').length);
    expect(f.urls).toEqual([F.held.url, ANTHROPIC_URL]);
    const content = String((f.bodies[0].messages as { content: string }[])[0].content);
    expect(content).toContain('<state>MD</state>');
    expect(content).not.toContain('$999 million'); // script and comment text never reach the model
    expect(content).not.toContain('$40 million');
  });

  it('2. none: a sourced "holds none" statement on a plain-text page prints a none row with no amount, keeping the existing row\'s other columns', async () => {
    const existing = { state: 'WA', treasurer_name: 'Mike Pellicciotti', treasurer_phone: '360-902-9000', decider: null, israel_bonds_usd: null, holdings_date: null, holdings_source: null, campaign_name: 'Divest WA', campaign_url: 'https://divestwa.example.org', next_comment_date: '2027-01-15', holdings_status: 'unknown' as const };
    const f = stub({ status: 'none', amount_usd: 0, date: '2026-06-30', decider: 'Board of Trustees of the State Retirement System', quote: NONE_QUOTE, reason: 'States no exposure.' });
    const d = await draftHolding(f.impl, 'k', { state: 'WA', url: F.none.url, existing });
    expect(d).toMatchObject({ kind: 'row', status: 'none', amount: null, date: '2026-06-30' });
    expect((d as { row: string }).row).toBe(`WA,Mike Pellicciotti,360-902-9000,Board of Trustees of the State Retirement System,,2026-06-30,${F.none.url},Divest WA,https://divestwa.example.org,2027-01-15,none`);
  });

  it('3. a quote that is not verbatim on the page prints nothing', async () => {
    const f = stub({ status: 'held', amount_usd: 15_000_000, date: '2026-10-01', decider: '', quote: 'The office holds $15 million in Israel Bonds.', reason: 'r' });
    const d = await draftHolding(f.impl, 'k', { state: 'OH', url: F.wrongQuote.url });
    expect(d.kind).toBe('none');
    expect((d as { reason: string }).reason).toContain('not found verbatim');
  });

  it('4. a page without a date prints nothing even with a verbatim quote', async () => {
    const quote = 'the state holds $62,000,000 in Israel Bonds and reviews the position at each rollover';
    const d = await draftHolding(stub({ status: 'held', amount_usd: 62_000_000, date: '', decider: '', quote, reason: 'r' }).impl, 'k', { state: 'NY', url: F.undated.url });
    expect(d.kind).toBe('none');
    expect((d as { reason: string }).reason).toContain('no usable date');
    const prose = await draftHolding(stub({ status: 'held', amount_usd: 62_000_000, date: 'this year', decider: '', quote, reason: 'r' }).impl, 'k', { state: 'NY', url: F.undated.url });
    expect(prose.kind).toBe('none');
  });

  it('5. an amount that is not a figure in the quote prints nothing (the model may not invent a number)', async () => {
    const quote = 'The state held $8.2 million in Israel Bonds at fiscal year end, down from $9.6 million.';
    const bad = await draftHolding(stub({ status: 'held', amount_usd: 17_800_000, date: '2026-08-15', decider: '', quote, reason: 'summed' }).impl, 'k', { state: 'IL', url: F.mismatch.url });
    expect(bad.kind).toBe('none');
    expect((bad as { reason: string }).reason).toContain('not a figure in the quote');
    const good = await draftHolding(stub({ status: 'held', amount_usd: 8_200_000, date: '2026-08-15', decider: 'Comptroller', quote, reason: 'r' }).impl, 'k', { state: 'IL', url: F.mismatch.url });
    expect(good).toMatchObject({ kind: 'row', amount: 8_200_000, decider: null }); // "Comptroller" is not on the page, so no decider is printed
    const zero = await draftHolding(stub({ status: 'held', amount_usd: 0, date: '2026-08-15', decider: '', quote, reason: 'r' }).impl, 'k', { state: 'IL', url: F.mismatch.url });
    expect(zero.kind).toBe('none');
  });

  it('6. a PDF body prints nothing and never reaches the model; unknown and unreadable replies print nothing', async () => {
    const f = stub({ status: 'held', amount_usd: 1, date: '2026-01-01', decider: '', quote: 'x', reason: 'r' });
    const d = await draftHolding(f.impl, 'k', { state: 'CA', url: F.pdf.url });
    expect(d.kind).toBe('none');
    expect((d as { reason: string }).reason).toContain('PDF');
    expect(f.urls).toEqual([F.pdf.url]);
    expect(await draftHolding(stub({ status: 'unknown', amount_usd: 0, date: '', decider: '', quote: '', reason: 'Only totals are listed.' }).impl, 'k', { state: 'MD', url: F.held.url })).toEqual({ kind: 'none', reason: 'Only totals are listed.' });
    expect((await draftHolding(stub('not json').impl, 'k', { state: 'MD', url: F.held.url })).kind).toBe('none');
    expect((await draftHolding(stub({ status: 'maybe' as HoldingVerdict['status'], amount_usd: 1, date: '2026-09-30', decider: '', quote: HELD_QUOTE, reason: 'r' }).impl, 'k', { state: 'MD', url: F.held.url })).kind).toBe('none');
  });
});
