/**
 * Cuenta regresiva en vivo. Se recalcula cada segundo con `countdownTo` del
 * paquete compartido, así la cuenta es exacta aunque el teléfono esté en otra
 * zona horaria. Al llegar a cero cambia a "¡Hoy es el gran día!".
 */

import { useEffect, useState } from 'react';
import type { WeddingConfig } from '@boda/shared';
import { countdownTo, mainEvent, type Countdown } from '@boda/shared';
import { SectionShell } from './parts';

export interface CountdownSectionProps {
  config: WeddingConfig;
}

const EMPTY: Countdown = { days: 0, hours: 0, minutes: 0, seconds: 0, finished: true };

function pad(value: number, size = 2): string {
  return String(Math.max(0, value)).padStart(size, '0');
}

export function CountdownSection({ config }: CountdownSectionProps): JSX.Element | null {
  const event = mainEvent(config);
  const startAt = event?.startAt ?? '';

  const [state, setState] = useState<Countdown>(() =>
    startAt ? countdownTo(startAt) : EMPTY,
  );

  useEffect(() => {
    if (!startAt) return;
    setState(countdownTo(startAt));
    const timer = window.setInterval(() => setState(countdownTo(startAt)), 1000);
    return () => window.clearInterval(timer);
  }, [startAt]);

  if (!event || !startAt) return null;

  const units: ReadonlyArray<{ label: string; value: string }> = [
    { label: 'Días', value: pad(state.days, state.days > 99 ? 3 : 2) },
    { label: 'Horas', value: pad(state.hours) },
    { label: 'Minutos', value: pad(state.minutes) },
    { label: 'Segundos', value: pad(state.seconds) },
  ];

  return (
    <SectionShell id="countdown" className="section--countdown">
      {state.finished ? (
        <div className="countdown__today">
          <span className="countdown__today-script">¡Hoy es el gran día!</span>
          <p className="countdown__today-text">Nos vemos en la celebración. Gracias por acompañarnos.</p>
        </div>
      ) : (
        <>
          <p className="countdown__lead">Falta cada vez menos</p>
          <ul className="countdown" role="timer" aria-live="off">
            {units.map((unit) => (
              <li className="countdown__unit" key={unit.label}>
                <span className="countdown__value">{unit.value}</span>
                <span className="countdown__label">{unit.label}</span>
              </li>
            ))}
          </ul>
          <p className="countdown__caption">
            para el {event.title.toLowerCase()}
          </p>
        </>
      )}
    </SectionShell>
  );
}

export default CountdownSection;
