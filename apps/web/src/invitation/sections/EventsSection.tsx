/**
 * Ceremonias y fiesta: una tarjeta por evento (religiosa, civil, brindis, fiesta).
 * Es la sección que el invitado más consulta: la usa para saber a qué hora y
 * dónde llegar, por eso el botón "Cómo llegar" solo aparece si hay mapUrl.
 */

import type { WeddingEvent, WeddingConfig } from '@boda/shared';
import { capitalize, formatDateLong, formatTime } from '@boda/shared';
import { EVENT_KIND_ICONS, EVENT_KIND_LABELS } from '../../lib/labels';
import { OutlineLink, Reveal, SectionShell } from './parts';

export interface EventsSectionProps {
  config: WeddingConfig;
}

/** Une los datos de dirección en un solo bloque legible. */
function addressLines(event: WeddingEvent): string[] {
  const city = event.city?.trim();
  const address = event.address?.trim();
  const parts: string[] = [];
  if (address) parts.push(address);
  if (city && !address?.toLowerCase().includes(city.toLowerCase())) parts.push(city);
  return parts;
}

export function EventsSection({ config }: EventsSectionProps): JSX.Element | null {
  const events = config.events.filter((event) => event.title.trim().length > 0);
  if (events.length === 0) return null;

  // El evento principal primero: es el que le importa al invitado.
  const ordered = [...events].sort((a, b) => Number(b.isMain) - Number(a.isMain));

  return (
    <SectionShell id="events" eyebrow="El día" title="Ceremonias y celebración">
      <div className="events">
        {ordered.map((event, index) => (
          <Reveal
            key={event.id || `${event.kind}-${index}`}
            delay={index * 80}
            className={`event${event.isMain ? ' event--main' : ''}`}
          >
            <div className="event__head">
              <span className="event__kind">
                <span className="event__icon" aria-hidden="true">
                  {EVENT_KIND_ICONS[event.kind]}
                </span>
                {EVENT_KIND_LABELS[event.kind]}
              </span>
              {event.isMain ? <span className="event__flag">Evento principal</span> : null}
            </div>

            <h3 className="event__title">{event.title}</h3>

            <dl className="event__details">
              <div className="event__detail">
                <dt>Fecha</dt>
                <dd>{capitalize(formatDateLong(event.startAt))}</dd>
              </div>
              <div className="event__detail">
                <dt>Hora</dt>
                <dd>
                  {formatTime(event.startAt)}
                  {event.endAt ? ` · hasta las ${formatTime(event.endAt)}` : ''}
                </dd>
              </div>
              {event.venueName ? (
                <div className="event__detail">
                  <dt>Lugar</dt>
                  <dd>
                    {event.venueName}
                    {addressLines(event).map((line) => (
                      <span className="event__address" key={line}>
                        {line}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              {event.notes ? (
                <div className="event__detail">
                  <dt>Nota</dt>
                  <dd>{event.notes}</dd>
                </div>
              ) : null}
            </dl>

            {event.mapUrl ? (
              <div className="event__actions">
                <OutlineLink href={event.mapUrl}>
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="10" r="2.6" />
                  </svg>
                  Cómo llegar
                </OutlineLink>
              </div>
            ) : null}
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}

export default EventsSection;
