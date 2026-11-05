import { useEffect, useState } from 'preact/hooks';
import { joinedVisit } from '../lib/commitments';
import { deleteListing, fmtWhen, joinVisit, listed, visitLine, visitsFor, withdrawVisit, type VisitPublic } from '../lib/visits';
import VisitForm from './VisitForm';

interface Props { member: string; name: string; city: string | null; siteKey?: string; partner?: string | null }

/** office-visits §2 on the member page: approved visits, "I'll come", the organiser's form behind one link. */
export default function Visits({ member, name, city, siteKey, partner }: Props) {
  const [visits, setVisits] = useState<VisitPublic[] | null>(null);
  const [organise, setOrganise] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<number[]>([]);

  useEffect(() => {
    void visitsFor(member).then(setVisits);
    setMine(listed());
    if (location.hash === '#organise') setOrganise(true);
    const onHash = () => { if (location.hash === '#organise') setOrganise(true); };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, [member, tick]);

  async function come(v: VisitPublic) {
    setError(null);
    const j = await joinVisit(v, name);
    if (!j) { setError('Could not save that. Try again in a moment.'); return; }
    setTick((t) => t + 1);
  }
  async function leave(id: number) { await withdrawVisit(id); setTick((t) => t + 1); }
  async function remove(id: number) { if (await deleteListing(id)) setTick((t) => t + 1); else setError('Could not remove that listing.'); }

  return (
    <section class="card p-5 lg:p-6" aria-labelledby="visits" id="visits" data-visits>
      <p class="label-code">District-office visits</p>
      <h2 id="visits" class="headline-md mt-1">Go in person</h2>
      {visits === null ? <p class="mt-2 text-sm text-ink/70">Checking for visits…</p> : visits.length === 0 ? (
        <p class="mt-2" data-empty>No visit listed yet. <button type="button" class="underline font-semibold" onClick={() => setOrganise(true)}>Organise one</button>{partner && <> · <a href={partner} rel="noopener" class="underline">Join the campaign ↗</a></>}</p>
      ) : (
        <ul class="mt-3 flex flex-col gap-3">
          {visits.map((v) => {
            const joined = joinedVisit(v.id);
            return (
              <li class="border-t-2 border-ink pt-3 flex flex-col gap-1" data-visit={v.id}>
                <p class="font-semibold">{visitLine(v)}</p>
                <p class="text-sm text-ink/80">{fmtWhen(v.starts_at, v.ends_at)}{v.note ? ` · ${v.note}` : ''}</p>
                <div class="flex flex-wrap gap-2 items-center mt-1">
                  {joined ? (
                    <>
                      <a href={joined.contact_url} rel="noopener noreferrer" class="btn btn-primary" data-contact>Contact the organiser ↗</a>
                      <button type="button" class="btn btn-ghost" onClick={() => void leave(v.id)}>Withdraw</button>
                    </>
                  ) : <button type="button" class="btn btn-primary" onClick={() => void come(v)}>I'll come</button>}
                  {mine.includes(v.id) && <button type="button" class="underline text-sm ml-auto" onClick={() => void remove(v.id)}>Remove my listing</button>}
                </div>
              </li>
            );
          })}
          <li class="border-t-2 border-ink pt-3 text-sm">Another day? <button type="button" class="underline font-semibold" onClick={() => setOrganise(true)}>Organise a visit</button></li>
        </ul>
      )}
      {error && <p role="alert" class="mt-2 text-sm text-crimson font-semibold">{error}</p>}
      {organise && (
        <div class="mt-5 border-t-2 border-ink pt-4" id="organise">
          <VisitForm member={member} name={name} city={city} siteKey={siteKey} />
        </div>
      )}
    </section>
  );
}
