/**
 * Despedida: cierra la tarjeta con los nombres de la pareja y la firma discreta
 * del producto. Nada de publicidad agresiva: una línea chica al pie.
 */

import type { WeddingConfig } from '@boda/shared';
import { capitalize, formatDateLong, mainEvent } from '@boda/shared';
import { Reveal } from './parts';

export interface ClosingSectionProps {
  config: WeddingConfig;
}

export function ClosingSection({ config }: ClosingSectionProps): JSX.Element {
  const event = mainEvent(config);
  const dateText = event ? capitalize(formatDateLong(event.startAt)) : '';

  return (
    <footer className="closing" id="closing">
      <Reveal className="closing__inner">
        <span className="closing__script" aria-hidden="true">
          Con amor
        </span>

        <p className="closing__message">{config.closing || '¡Gracias por acompañarnos!'}</p>

        <p className="closing__names">
          {config.couple.bride}
          <span className="closing__amp" aria-hidden="true">
            {' '}
            &amp;{' '}
          </span>
          {config.couple.groom}
        </p>

        {dateText ? <p className="closing__date">{dateText}</p> : null}

        <span className="closing__rule" aria-hidden="true" />

        <p className="closing__credit">
          Invitación hecha con <strong>Boda Studio</strong>
        </p>
      </Reveal>
    </footer>
  );
}

export default ClosingSection;
