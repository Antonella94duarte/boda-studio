/**
 * ---------------------------------------------------------------------------
 * MusicPlayer: botón flotante de música de fondo para la invitación.
 * ---------------------------------------------------------------------------
 * Los navegadores móviles bloquean el autoplay con sonido, así que:
 *  1. si `music.autoplay` está activo, se intenta arrancar EN MUTED (eso sí
 *     lo permiten) y se muestra una pista pulsante para que el invitado toque;
 *  2. con el primer gesto del usuario (toque, scroll o tecla) se quita el mute
 *     y queda sonando;
 *  3. si no hay autoplay, el invitado simplemente toca el botón cuando quiera.
 * Nunca se fuerza el volumen: la música de fondo es un detalle, no una molestia.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MusicSchema } from '@boda/shared';
import type { z } from 'zod';

type Music = z.infer<typeof MusicSchema>;

export interface MusicPlayerProps {
  music: Music;
}

export function MusicPlayer({ music }: MusicPlayerProps): JSX.Element | null {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  /** Mientras haya pista y el invitado todavía no interactuó. */
  const [showHint, setShowHint] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const url = music.url ?? '';

  const tryPlay = useCallback(
    async (withSound: boolean): Promise<boolean> => {
      const audio = audioRef.current;
      if (!audio) return false;
      audio.muted = !withSound;
      try {
        await audio.play();
        setPlaying(true);
        setBlocked(false);
        return true;
      } catch {
        setPlaying(false);
        if (withSound) setBlocked(true);
        return false;
      }
    },
    [],
  );

  /* Primer intento: en muted si la organizadora pidió autoplay. */
  useEffect(() => {
    if (!url) return;
    if (!music.autoplay) return;
    let cancelled = false;
    void tryPlay(false).then((ok) => {
      if (cancelled) return;
      if (ok) setShowHint(true);
    });
    return () => {
      cancelled = true;
    };
  }, [url, music.autoplay, tryPlay]);

  /* Con el primer gesto se activa el sonido de verdad. */
  useEffect(() => {
    if (!url || !music.autoplay || !showHint) return;

    function onFirstGesture(): void {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        audio.muted = false;
        setShowHint(false);
        setPlaying(true);
      } else {
        void tryPlay(true).then((ok) => {
          if (ok) setShowHint(false);
        });
      }
      cleanup();
    }

    function cleanup(): void {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      window.removeEventListener('touchstart', onFirstGesture);
    }

    window.addEventListener('pointerdown', onFirstGesture, { passive: true });
    window.addEventListener('keydown', onFirstGesture);
    window.addEventListener('touchstart', onFirstGesture, { passive: true });
    return cleanup;
  }, [url, music.autoplay, showHint, tryPlay]);

  /* Pausa automática al salir de la pestaña: no molesta si el invitado atiende. */
  useEffect(() => {
    function onVisibility(): void {
      const audio = audioRef.current;
      if (!audio) return;
      if (document.hidden && !audio.paused) {
        audio.pause();
        setPlaying(false);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const toggle = useCallback(async (): Promise<void> => {
    const audio = audioRef.current;
    if (!audio) return;
    setShowHint(false);
    if (audio.paused) {
      await tryPlay(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, [tryPlay]);

  if (!url) return null;

  const label = playing ? 'Pausar la música' : 'Reproducir la música';
  const title = music.title ?? 'Nuestra canción';
  const artist = music.artist ?? '';

  return (
    <div className={`music${playing ? ' is-playing' : ''}`}>
      <audio
        ref={audioRef}
        src={url}
        loop
        preload="none"
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setBlocked(true);
        }}
      />

      <button
        type="button"
        className="music__button"
        onClick={() => void toggle()}
        aria-label={label}
        aria-pressed={playing}
        title={`${label} · ${title}`}
      >
        <span className="music__icon" aria-hidden="true">
          {playing ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
            </svg>
          )}
        </span>
      </button>

      {showHint || blocked ? (
        <button type="button" className="music__hint" onClick={() => void toggle()}>
          <span className="music__pulse" aria-hidden="true" />
          {blocked ? 'Tocá para escuchar nuestra canción' : 'Tocá y subí el volumen'}
        </button>
      ) : null}

      {playing ? (
        <span className="music__caption" aria-hidden="true">
          {title}
          {artist ? <em> · {artist}</em> : null}
        </span>
      ) : null}
    </div>
  );
}

export default MusicPlayer;
