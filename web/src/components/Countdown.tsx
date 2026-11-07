// urgency-and-readability §4: the ticking deadline stamp. Every digit is arithmetic on `decision_at`
// (or `decision_date` at 09:00 America/New_York); nothing here comes from an LLM. The markup is the
// style guide's protest stamp (mockup B, owner pick 2026-11-06): rotated −4°, 5 px dashed crimson border,
// a radial mask so the ends look under-inked and an feTurbulence grain filter; no shadow.
import { useEffect, useState } from 'preact/hooks';

export interface CountdownProps {
  /** ISO 8601 with offset; wins over `date`. */
  at?: string | null;
  /** YYYY-MM-DD; the target is 09:00 America/New_York that day (§4.1). */
  date?: string | null;
  /** "Decides <Mon d>" when true, "Expected <Mon d>" otherwise (§4.2). */
  confirmed?: boolean;
  /** Goal title (or chamber) named in the label line on /results (§4.5). */
  title?: string | null;
  /** `lg` is one size up (§4.5). */
  size?: 'md' | 'lg';
  /** Unique per instance: the SVG filter id. */
  id: string;
  /** Wrapper classes (placement). */
  class?: string;
  /** Test/SSR hook: the clock to start from; defaults to Date.now(). */
  now?: number;
}

const NY = 'America/New_York';

/** The UTC instant of `date` at `hour`:00 in `tz`, via the Intl round trip (DST-safe away from the 02:00 gap). */
export function zonedTime(date: string, hour: number, tz = NY): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], hour);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
  const get = (t: string) => +(parts.find((p) => p.type === t)?.value ?? '0');
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return guess - (wall - guess);
}

/** The countdown target in ms, or null when there is none (§4.1, §4.7). */
export function targetOf(at: string | null | undefined, date: string | null | undefined): number | null {
  if (at) {
    const t = Date.parse(at);
    return Number.isNaN(t) ? null : t;
  }
  return date ? zonedTime(date, 9) : null;
}

export interface Parts { d: string; h: string; m: string; s: string }

/** DD HH MM SS left from `now` to `target`; DD grows to three digits past 99 days (§4.7). */
export function partsLeft(target: number, now: number): Parts {
  const s = Math.max(0, Math.floor((target - now) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return { d: pad(Math.floor(s / 86400)), h: pad(Math.floor(s / 3600) % 24), m: pad(Math.floor(s / 60) % 60), s: pad(s % 60) };
}

/** "Nov 18" from the target's date part (the calendar day in New York for a timestamp). */
export function monthDay(at: string | null | undefined, date: string | null | undefined): string {
  const t = targetOf(at, date);
  if (t === null) return '';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: NY });
}

const SIZE = {
  md: { digits: 'text-[44px] leading-[40px]', unit: 'text-[18px]', label: 'text-[10px]', pad: 'px-[18px] pt-[10px] pb-2', max: 'max-w-[320px]' },
  lg: { digits: 'text-[56px] leading-[50px]', unit: 'text-[22px]', label: 'text-[11px]', pad: 'px-6 pt-3 pb-2.5', max: 'max-w-[380px]' },
};

export default function Countdown({ at, date, confirmed = false, title, size = 'md', id, class: cls = '', now }: CountdownProps) {
  const target = targetOf(at, date);
  const [clock, setClock] = useState(() => now ?? Date.now());
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (target === null) return;
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const still = mq?.matches ?? false;
    setReduced(still);
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), still ? 60_000 : 1_000); // §4.7: once a minute under reduced motion
    return () => clearInterval(timer);
  }, [target]);

  if (target === null || target <= clock) return null; // §4.7: past or empty renders nothing
  const p = partsLeft(target, clock);
  const sz = SIZE[size];
  const unit = (u: string) => <span class={`${sz.unit} tracking-[0.1em]`}>{u}</span>;
  const when = monthDay(at, date);
  const mask = 'radial-gradient(ellipse at center, #000 45%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0.38) 100%)';
  const filter = `stamp-grain-${id}`;
  return (
    <div class={`inline-block -rotate-[4deg] ${cls}`} data-countdown={id} role="timer" aria-live="off" aria-label={`${p.d} days ${p.h} hours ${p.m} minutes left; ${confirmed ? 'decides' : 'expected'} ${when}`}>
      <svg aria-hidden="true" width="0" height="0" class="absolute">
        <filter id={filter} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div class={`border-[5px] border-dashed border-crimson bg-paper text-crimson flex flex-col items-center gap-0.5 ${sz.pad} ${sz.max}`} style={{ filter: `url(#${filter})`, WebkitMaskImage: mask, maskImage: mask }}>
        <span class={`font-mono font-bold ${sz.label} tracking-[0.14em] uppercase text-center`}>
          Countdown{title ? ` · ${title}` : ''} · {confirmed ? 'Decides' : 'Expected'} {when}
        </span>
        <span class={`font-condensed ${sz.digits} tracking-[0.06em] tabular-nums whitespace-nowrap`}>
          <span data-part="d">{p.d}</span>{unit('D')} <span data-part="h">{p.h}</span>{unit('H')} <span data-part="m">{p.m}</span>{unit('M')}
          {reduced ? null : <> <span data-part="s">{p.s}</span>{unit('S')}</>}
        </span>
      </div>
    </div>
  );
}
