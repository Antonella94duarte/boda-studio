/**
 * Carga la boda activa (por :weddingId de la ruta) y expone su config ya
 * validada. Todas las pantallas del panel que cuelgan de una boda usan este
 * hook, así el manejo de errores es idéntico en todas.
 */

import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { WeddingConfigSchema, type WeddingConfig } from '@boda/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type { WeddingDetail } from '../lib/types';

export interface UseWeddingResult {
  weddingId: string;
  wedding: WeddingDetail | null;
  config: WeddingConfig | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setWedding: (wedding: WeddingDetail | null) => void;
}

export function useWedding(): UseWeddingResult {
  const { weddingId = '' } = useParams<{ weddingId: string }>();

  const factory = useCallback(
    async (signal: AbortSignal): Promise<WeddingDetail | null> => {
      if (!weddingId) return null;
      const response = await api.weddings.get(weddingId, signal);
      // Se completa la config con los valores por defecto del esquema: una boda
      // creada hace tiempo puede tener secciones nuevas sin declarar.
      const parsed = WeddingConfigSchema.safeParse(response.wedding.config);
      return {
        ...response.wedding,
        config: parsed.success ? parsed.data : response.wedding.config,
      };
    },
    [weddingId],
  );

  const state = useAsync<WeddingDetail | null>(factory, [weddingId], {
    enabled: Boolean(weddingId),
  });

  return {
    weddingId,
    wedding: state.data,
    config: state.data?.config ?? null,
    loading: state.loading,
    error: state.error,
    reload: state.reload,
    setWedding: state.setData,
  };
}

export default useWedding;
