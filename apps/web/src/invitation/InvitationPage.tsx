/**
 * ---------------------------------------------------------------------------
 * Invitación pública: es lo que ve el invitado al tocar el enlace de WhatsApp.
 * ---------------------------------------------------------------------------
 * 1. Lee el `:slug` de la URL y pide la config a GET /api/public/weddings/:slug.
 * 2. Si la URL trae `:token`, pide además los datos del invitado (saludo y
 *    formulario nominativo).
 * 3. Inyecta el tema de la boda como variables CSS y limpia al desmontar.
 * 4. Renderiza SOLO las secciones habilitadas, en el orden que definió la
 *    organizadora (`resolveSections`).
 * 5. Un 404 muestra una pantalla amable, nunca un error técnico.
 *
 * Ojo: todos los hooks van antes de cualquier `return` temprano. Si no, al pasar
 * de "cargando" a "listo" cambiaría la cantidad de hooks y React rompería.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  WeddingConfigSchema,
  resolveSections,
  type PublicGuest,
  type SectionId,
} from '@boda/shared';
import { ApiError, api } from '../lib/api';
import { applyTheme } from '../lib/theme';
import { useAsync } from '../lib/useAsync';
import { MusicPlayer } from './MusicPlayer';
import { useGuestToken } from './useGuestToken';
import { useRevealOnScroll } from './sections/parts';
import { HeroSection } from './sections/HeroSection';
import { CountdownSection } from './sections/CountdownSection';
import { QuoteSection } from './sections/QuoteSection';
import { StorySection } from './sections/StorySection';
import { GallerySection } from './sections/GallerySection';
import { EventsSection } from './sections/EventsSection';
import { DressCodeSection } from './sections/DressCodeSection';
import { GiftsSection } from './sections/GiftsSection';
import { RsvpSection } from './sections/RsvpSection';
import { ClosingSection } from './sections/ClosingSection';

export function InvitationPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const [notFound, setNotFound] = useState(false);

  const weddingState = useAsync(
    useCallback(
      async (signal: AbortSignal) => {
        if (!slug) return null;
        try {
          const response = await api.public.wedding(slug, signal);
          // Se validan y completan los valores por defecto del esquema: así una
          // config vieja o incompleta nunca rompe el render.
          const parsed = WeddingConfigSchema.safeParse(response.wedding.config);
          return parsed.success ? parsed.data : null;
        } catch (error) {
          if (error instanceof ApiError && error.isNotFound) {
            setNotFound(true);
            return null;
          }
          throw error;
        }
      },
      [slug],
    ),
    [slug],
    { enabled: Boolean(slug) },
  );

  const guestState = useGuestToken(slug);
  const config = weddingState.data;

  const sections = useMemo(() => (config ? resolveSections(config) : []), [config]);
  const sectionsKey = sections.map((section) => section.id).join(',');

  /* Título de la pestaña + tema de la boda. */
  useEffect(() => {
    if (!config) return;
    document.title = config.metaTitle || `¡Nos casamos! · ${config.couple.display}`;
    return applyTheme(config.theme);
  }, [config]);

  useRevealOnScroll([sectionsKey]);

  const showRsvp = sections.some((section) => section.id === 'rsvp');
  const personalized = Boolean(guestState.token);

  /* --- Estados de error -------------------------------------------------- */
  if (notFound) {
    return (
      <UnavailableScreen
        title="Invitación no disponible"
        message="Puede que el enlace esté incompleto o que la invitación todavía no esté publicada. Escribile a la organizadora para que te envíe el enlace nuevamente."
      />
    );
  }

  if (weddingState.loading) {
    return (
      <div className="invite invite--loading">
        <span className="spinner spinner--lg" aria-hidden="true" />
        <p>Cargando la invitación…</p>
      </div>
    );
  }

  if (weddingState.error) {
    return (
      <UnavailableScreen
        title="No pudimos abrir la invitación"
        message={weddingState.error}
        onRetry={weddingState.reload}
      />
    );
  }

  if (!config) {
    return (
      <UnavailableScreen
        title="Invitación no disponible"
        message="No encontramos esta invitación. Verificá el enlace que te enviaron."
      />
    );
  }

  // Se fija en una constante para no perder el estrechamiento de tipos dentro
  // de la función que arma cada sección.
  const wedding = config;

  /** Renderiza una sección con los datos que le corresponden. */
  function renderSection(id: SectionId): JSX.Element | null {
    switch (id) {
      case 'hero':
        return <HeroSection config={wedding} guest={guestState.guest} />;
      case 'countdown':
        return <CountdownSection config={wedding} />;
      case 'quote':
        return <QuoteSection config={wedding} />;
      case 'story':
        return <StorySection config={wedding} />;
      case 'gallery':
        return <GallerySection config={wedding} />;
      case 'events':
        return <EventsSection config={wedding} />;
      case 'dressCode':
        return <DressCodeSection config={wedding} />;
      case 'gifts':
        return <GiftsSection config={wedding} />;
      case 'rsvp':
        return (
          <RsvpSection
            config={wedding}
            slug={wedding.slug}
            token={guestState.token}
            guest={guestState.guest}
            onGuestChange={(guest: PublicGuest | null) => guestState.setGuest(guest)}
          />
        );
      case 'closing':
        return <ClosingSection config={wedding} />;
      default:
        return null;
    }
  }

  return (
    <div className="invite" data-sections={sectionsKey}>
      <main className="invite__main">
        {sections.map((section) => (
          <div className="invite__section" key={section.id}>
            {renderSection(section.id)}
          </div>
        ))}
      </main>

      {showRsvp ? (
        <a className={`rsvp-shortcut${personalized ? '' : ' rsvp-shortcut--soft'}`} href="#rsvp">
          <span aria-hidden="true">✓</span>{' '}
          {personalized ? (
            <>
              <span className="rsvp-shortcut__long">Confirmar asistencia</span>
              <span className="rsvp-shortcut__short">Confirmar</span>
            </>
          ) : (
            <>
              <span className="rsvp-shortcut__long">Confirmar</span>
              <span className="rsvp-shortcut__short">RSVP</span>
            </>
          )}
        </a>
      ) : null}

      <MusicPlayer music={wedding.music} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function UnavailableScreen({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}): JSX.Element {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className="invite invite--unavailable">
      <div className="unavailable">
        <span className="unavailable__ornament" aria-hidden="true">
          ✦
        </span>
        <h1 className="unavailable__title">{title}</h1>
        <p className="unavailable__message">{message}</p>
        {onRetry ? (
          <button type="button" className="invite-btn invite-btn--primary" onClick={onRetry}>
            Reintentar
          </button>
        ) : null}
        <p className="unavailable__brand">Boda Studio</p>
      </div>
    </div>
  );
}

export default InvitationPage;
