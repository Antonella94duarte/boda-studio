/**
 * Portada: es la primera impresión y define si el invitado percibe una tarjeta
 * premium o una página más. Imagen a pantalla completa, degradado que garantiza
 * la legibilidad del texto y una invitación personalizada cuando hay token.
 */

import type { PublicGuest, WeddingConfig } from '@boda/shared';
import { capitalize, formatDateLong, mainEvent } from '@boda/shared';

export interface HeroSectionProps {
  config: WeddingConfig;
  guest: PublicGuest | null;
}

/** "Ana Gómez" -> "Ana" (el nombre de pila alcanza para el saludo). */
function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first && first.length > 0 ? capitalize(first) : fullName;
}

export function HeroSection({ config, guest }: HeroSectionProps): JSX.Element {
  const event = mainEvent(config);
  const dateText = event ? capitalize(formatDateLong(event.startAt)) : '';
  const placeText = event ? [event.venueName, event.city].filter(Boolean).join(' · ') : '';

  const heroStyle = config.heroImage
    ? { backgroundImage: `url("${config.heroImage.replace(/"/g, '%22')}")` }
    : undefined;

  return (
    <header className="hero" id="hero">
      <div className={`hero__media${config.heroImage ? '' : ' hero__media--empty'}`} style={heroStyle}>
        <span className="hero__scrim" aria-hidden="true" />
      </div>

      <div className="hero__content">
        {guest ? (
          <p className="hero__greeting">
            Hola <strong>{firstName(guest.fullName)}</strong>, te invitamos a nuestra boda
          </p>
        ) : (
          <p className="hero__greeting hero__greeting--generic">Nos casamos</p>
        )}

        <h1 className="hero__names">
          <span className="hero__name">{config.couple.bride}</span>
          <span className="hero__amp" aria-hidden="true">
            &amp;
          </span>
          <span className="hero__name">{config.couple.groom}</span>
          <span className="sr-only">
            {config.couple.bride} y {config.couple.groom}
          </span>
        </h1>

        <span className="hero__rule" aria-hidden="true" />

        {config.heroTagline ? <p className="hero__tagline">{config.heroTagline}</p> : null}

        {dateText ? (
          <p className="hero__date">
            {dateText}
            {placeText ? <span className="hero__place">{placeText}</span> : null}
          </p>
        ) : null}
      </div>

      <a className="hero__hint" href="#countdown" aria-label="Ver los detalles del evento">
        <span className="hero__hint-text">Deslizá para ver los detalles</span>
        <span className="hero__hint-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </a>
    </header>
  );
}

export default HeroSection;
