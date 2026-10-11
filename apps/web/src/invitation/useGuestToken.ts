/**
 * ---------------------------------------------------------------------------
 * useGuestToken: resuelve el invitado a partir de /i/:slug/:token.
 * ---------------------------------------------------------------------------
 * Si la URL no trae token, el hook queda inactivo y la invitación se muestra
 * en modo "link general" (sin saludo personalizado ni formulario nominativo).
 * Ojo: el endpoint público NO expone el teléfono ni la nota interna del invitado.
 */

import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import type { PublicGuest } from '@boda/shared';
import { ApiError, api } from '../lib/api';
import { useAsync } from '../lib/useAsync';

export interface UseGuestTokenResult {
  token: string | null;
  guest: PublicGuest | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Permite reflejar la confirmación recién enviada sin volver a pedirla. */
  setGuest: (guest: PublicGuest | null) => void;
}

export function useGuestToken(slug: string | undefined): UseGuestTokenResult {
  const params = useParams<{ token?: string }>();
  const token = params.token ?? null;
  const enabled = Boolean(slug && token);

  // La fábrica se recrea en cada render, pero useAsync la guarda en un ref y
  // solo vuelve a pedir datos cuando cambian `slug`/`token`.
  const factory = useCallback(
    async (signal: AbortSignal): Promise<PublicGuest | null> => {
      if (!slug || !token) return null;
      try {
        const response = await api.public.guest(slug, token, signal);
        return response.guest;
      } catch (error) {
        // Un token vencido o mal copiado no debe romper la invitación:
        // se degrada a modo general y se avisa con suavidad.
        if (error instanceof ApiError && error.isNotFound) return null;
        throw error;
      }
    },
    [slug, token],
  );

  const state = useAsync<PublicGuest | null>(factory, [slug, token], { enabled });

  return useMemo<UseGuestTokenResult>(
    () => ({
      token,
      guest: state.data,
      loading: state.loading,
      error: state.error,
      reload: state.reload,
      setGuest: state.setData,
    }),
    [token, state.data, state.loading, state.error, state.reload, state.setData],
  );
}

export default useGuestToken;
