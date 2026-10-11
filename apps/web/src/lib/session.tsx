/**
 * ---------------------------------------------------------------------------
 * Sesión del panel: contexto de React + guarda de rutas.
 * ---------------------------------------------------------------------------
 * El JWT se guarda en localStorage (lo lee el cliente HTTP). Al montar se
 * valida contra GET /api/auth/me para no mostrar el panel con un token vencido.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiError, api, clearToken, getToken, setToken } from './api';
import type { SessionUser } from './types';

interface SessionContextValue {
  user: SessionUser | null;
  token: string | null;
  /** true mientras se valida el token guardado al arrancar la app. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState<boolean>(() => getToken() !== null);

  /* Valida el token guardado una sola vez al arrancar. */
  useEffect(() => {
    if (!token) {
      setLoading(false);
      setUser(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    api.auth
      .me(controller.signal)
      .then((response) => {
        if (!active) return;
        setUser(response.user);
      })
      .catch((error: unknown) => {
        if (!active) return;
        // Token vencido o inválido: se limpia y se pide login de nuevo.
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          clearToken();
          setTokenState(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [token]);

  /* El cliente HTTP avisa cuando la API responde 401 en cualquier pantalla. */
  useEffect(() => {
    function onUnauthorized(): void {
      setTokenState(null);
      setUser(null);
    }
    window.addEventListener('boda:unauthorized', onUnauthorized);
    return () => window.removeEventListener('boda:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const response = await api.auth.login(email, password);
    setToken(response.token);
    setTokenState(response.token);
    setUser(response.user);
  }, []);

  const logout = useCallback((): void => {
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ user, token, loading, login, logout }),
    [user, token, loading, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession() solo funciona dentro de <SessionProvider>.');
  }
  return context;
}

/** Guarda de rutas: manda al login y recuerda a dónde quería ir. */
export function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <div className="notfound">
        <div className="col center">
          <span className="spinner spinner--lg" aria-hidden="true" />
          <p className="muted small">Verificando tu sesión…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/** Traduce el error de login a un mensaje accionable en español. */
export function describeAuthError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'El correo o la contraseña no son correctos.';
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'No pudimos iniciar sesión. Intentá otra vez.';
}
