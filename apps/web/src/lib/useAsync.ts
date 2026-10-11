/**
 * ---------------------------------------------------------------------------
 * useAsync: el hook mínimo de carga/error/datos que usan las pantallas del panel.
 * ---------------------------------------------------------------------------
 * Devuelve además `reload()`, que es lo que hace falta después de guardar,
 * borrar o importar. Si el componente se desmonta, el resultado se descarta.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Permite pintar datos optimistas sin volver a pedirlos al servidor. */
  setData: (data: T | null) => void;
}

/**
 * @param factory  Función que hace la petición. Debe aceptar un AbortSignal.
 * @param deps     Dependencias: cuando cambian, se vuelve a pedir.
 * @param options  `enabled: false` deja el hook en espera (por ejemplo, sin id).
 */
export function useAsync<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[] = [],
  options: { enabled?: boolean } = {},
): AsyncState<T> {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // La fábrica cambia en cada render (es una closure): se guarda en un ref para
  // que el efecto solo dependa de las dependencias reales.
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    factoryRef
      .current(controller.signal)
      .then((result) => {
        if (!active) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'No pudimos cargar los datos.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps]);

  const reload = useCallback((): void => {
    setNonce((n) => n + 1);
  }, []);

  return { data, loading, error, reload, setData };
}

export default useAsync;
