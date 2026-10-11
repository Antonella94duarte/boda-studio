/**
 * Galería tipo mosaico + visor a pantalla completa.
 * El visor se cierra con la X, tocando el fondo, con Escape y navega con las
 * flechas del teclado o deslizando el dedo (swipe) en el teléfono.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WeddingConfig } from '@boda/shared';

export interface GallerySectionProps {
  config: WeddingConfig;
}

export function GallerySection({ config }: GallerySectionProps): JSX.Element | null {
  const photos = config.gallery.filter(Boolean);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const close = useCallback((): void => setOpenIndex(null), []);

  const go = useCallback(
    (delta: number): void => {
      setOpenIndex((current) => {
        if (current === null) return current;
        const next = current + delta;
        if (next < 0) return photos.length - 1;
        if (next >= photos.length) return 0;
        return next;
      });
    },
    [photos.length],
  );

  useEffect(() => {
    if (openIndex === null) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    }
    window.addEventListener('keydown', onKey);
    // Evita que la invitación siga scrolleando detrás del visor.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [openIndex, close, go]);

  if (photos.length === 0) return null;

  const current = openIndex === null ? null : photos[openIndex];

  return (
    <>
      <section id="gallery" className="section">
        <div className="section__inner">
          <p className="section__eyebrow">Momentos</p>
          <h2 className="section__title">Nuestra galería</h2>
          <span className="ornament" aria-hidden="true" />

          <div className="gallery">
            {photos.map((photo, index) => (
              <button
                type="button"
                className="gallery__item"
                key={photo}
                onClick={() => setOpenIndex(index)}
                aria-label={`Ampliar la foto ${index + 1} de ${photos.length}`}
              >
                <img src={photo} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {current && openIndex !== null ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Visor de fotos"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touchStartX.current;
            const end = event.changedTouches[0]?.clientX ?? null;
            touchStartX.current = null;
            if (start === null || end === null) return;
            const delta = end - start;
            if (Math.abs(delta) < 45) return;
            go(delta < 0 ? 1 : -1);
          }}
        >
          <button type="button" className="lightbox__close" onClick={close} aria-label="Cerrar">
            ×
          </button>

          <img className="lightbox__img" src={current} alt="" />

          {photos.length > 1 ? (
            <>
              <button
                type="button"
                className="lightbox__nav lightbox__nav--prev"
                onClick={(event) => {
                  event.stopPropagation();
                  go(-1);
                }}
                aria-label="Foto anterior"
              >
                ‹
              </button>
              <button
                type="button"
                className="lightbox__nav lightbox__nav--next"
                onClick={(event) => {
                  event.stopPropagation();
                  go(1);
                }}
                aria-label="Foto siguiente"
              >
                ›
              </button>
              <p className="lightbox__counter">
                {openIndex + 1} / {photos.length}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export default GallerySection;
