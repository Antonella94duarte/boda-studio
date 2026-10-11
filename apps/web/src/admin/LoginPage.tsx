/**
 * Ingreso al panel. Guarda el JWT en localStorage (vía el cliente HTTP) y
 * redirige a donde la organizadora quería entrar.
 */

import { useCallback, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { describeAuthError, useSession } from '../lib/session';

interface LocationState {
  from?: string;
}

export function LoginPage(): JSX.Element {
  const { login, user, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as LocationState | null)?.from ?? '/admin/weddings';

  const submit = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      if (sending) return;
      setSending(true);
      setError(null);
      try {
        await login(email.trim(), password);
        navigate(from, { replace: true });
      } catch (err) {
        setError(describeAuthError(err));
      } finally {
        setSending(false);
      }
    },
    [sending, login, email, password, navigate, from],
  );

  // Ya hay sesión: no tiene sentido mostrar el login otra vez.
  if (!sessionLoading && user) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <strong>Boda Studio</strong>
          <span>Panel de la organizadora</span>
        </div>

        <form className="col" onSubmit={(event) => void submit(event)}>
          <div className="field">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              inputMode="email"
              placeholder="organizadora@bodastudio.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="Tu contraseña"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error ? (
            <div className="alert alert--err" role="alert">
              {error}
            </div>
          ) : null}

          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={sending}>
            {sending ? 'Entrando…' : 'Entrar al panel'}
          </button>
        </form>

        <p className="login__hint">
          ¿Olvidaste tu contraseña? Escribile al soporte de Boda Studio para que te la restablezca.
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
