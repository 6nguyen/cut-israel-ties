// RFC 5545 reminder built in the browser (commitment-funnel §1.4). Nothing is fetched and
// no name goes in: title, due time, the goal deep link and a 15-minute alarm.
export interface IcsEvent { uid: string; start: Date; title: string; url: string; description?: string; stamp?: Date }

/** YYYYMMDDTHHMMSSZ. */
export function icsDate(d: Date): string { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
/** TEXT escaping (§3.3.11): backslash, semicolon, comma, newline. */
export function icsText(s: string): string { return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
/** Content-line folding (§3.1): lines longer than 75 octets continue on the next line after one space; never split a UTF-8 sequence. */
export function fold(line: string): string[] {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    const limit = out.length ? 74 : 75;
    if (enc.encode(cur + ch).length > limit) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export function buildIcs(e: IcsEvent): string {
  const end = new Date(e.start.getTime() + 15 * 60_000);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cut the Ties//Commitment//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`, `DTSTAMP:${icsDate(e.stamp ?? new Date())}`, `DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(e.title)}`, `DESCRIPTION:${icsText(e.description ?? e.url)}`, `URL:${e.url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, 'TRIGGER:-PT15M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}

/** Hands the file to the browser as a download. */
export function downloadIcs(name: string, ics: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  a.download = name.endsWith('.ics') ? name : `${name}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}
