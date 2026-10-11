/**
 * ---------------------------------------------------------------------------
 * Conexión de WhatsApp.
 * ---------------------------------------------------------------------------
 * El cliente de WhatsApp no es oficial: eso se dice de frente en la pantalla,
 * porque de eso depende que la cuenta de la organizadora no termine bloqueada.
 * El flujo es el de "dispositivos vinculados": se pide el QR y se refresca solo
 * cada 3 segundos mientras no se haya escaneado.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { ConfirmDialog, ErrorBlock, useToast } from './ui';
import type { WhatsAppQrResponse, WhatsAppStatusResponse } from '../lib/types';

/** Normaliza lo que devuelve la API a un `src` de <img> usable. */
function qrSource(qr: WhatsAppQrResponse | null): string | null {
  if (!qr) return null;
  const value = qr.qrDataUrl;
  if (!value) return null;
  if (value.startsWith('data:image')) return value;
  // Si la API devolviera solo la cadena del QR, se arma un SVG generado por un
  // servicio no es aceptable (filtraría el token): se muestra el texto en su lugar.
  return null;
}

function stateLabel(status: WhatsAppStatusResponse | null): string {
  if (!status) return 'Consultando…';
  switch (status.status) {
    case 'connected':
      return 'Conectado';
    case 'qr':
      return 'Esperando que escanees el código';
    case 'connecting':
      return 'Conectando…';
    case 'error':
      return 'Con error';
    case 'unsupported':
      return 'No disponible en este servidor';
    default:
      return 'Desconectado';
  }
}

function toneFor(status: WhatsAppStatusResponse | null): string {
  if (!status) return '';
  if (status.status === 'connected') return 'status-dot--ok';
  if (status.status === 'qr' || status.status === 'connecting') return 'status-dot--warn';
  if (status.status === 'error') return 'status-dot--err';
  return '';
}

export function WhatsAppPage(): JSX.Element {
  const { notify } = useToast();
  const [status, setStatus] = useState<WhatsAppStatusResponse | null>(null);
  const [qr, setQr] = useState<WhatsAppQrResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refreshStatus = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const next = await api.whatsapp.status(signal);
      setStatus(next);
      setError(null);
      if (next.status !== 'qr' && next.status !== 'connecting') setQr(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(
        err instanceof ApiError ? err.message : 'No pudimos consultar el estado de WhatsApp.',
      );
    }
  }, []);

  /* Carga inicial. */
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    void refreshStatus(controller.signal).finally(() => setLoading(false));
    return () => controller.abort();
  }, [refreshStatus]);

  /* Mientras espera el escaneo, refresca estado y QR cada 3 segundos. */
  useEffect(() => {
    const waiting = status?.status === 'qr' || status?.status === 'connecting';
    if (!waiting) return;

    const controller = new AbortController();
    let timer: number | undefined;

    async function tick(): Promise<void> {
      try {
        const [nextStatus, nextQr] = await Promise.all([
          api.whatsapp.status(controller.signal),
          api.whatsapp.qr(controller.signal).catch(() => null),
        ]);
        setStatus(nextStatus);
        if (nextQr) setQr(nextQr);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }

    timer = window.setInterval(() => void tick(), 3000);
    void tick();

    return () => {
      controller.abort();
      if (timer) window.clearInterval(timer);
    };
  }, [status?.status]);

  const connect = useCallback(async (): Promise<void> => {
    setConnecting(true);
    setError(null);
    try {
      const next = await api.whatsapp.connect();
      setStatus(next);
      const nextQr = await api.whatsapp.qr().catch(() => null);
      if (nextQr) setQr(nextQr);
      notify('Pedido de conexión enviado. Escaneá el código con tu teléfono.', 'ok');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos iniciar la conexión.');
    } finally {
      setConnecting(false);
    }
  }, [notify]);

  const logout = useCallback(async (): Promise<void> => {
    setLoggingOut(true);
    try {
      await api.whatsapp.logout();
      setQr(null);
      await refreshStatus();
      notify('Sesión de WhatsApp cerrada.', 'ok');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'No pudimos cerrar la sesión.', 'err');
    } finally {
      setLoggingOut(false);
      setConfirmLogout(false);
    }
  }, [refreshStatus, notify]);

  const source = qrSource(qr);
  const waiting = status?.status === 'qr' || status?.status === 'connecting';
  const connected = status?.status === 'connected';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>WhatsApp</h1>
          <p>Vinculá el número desde el que se envían las invitaciones.</p>
        </div>
        <div className="row">
          <span className="badge">
            <span className={`status-dot ${toneFor(status)}`} aria-hidden="true" />
            {stateLabel(status)}
          </span>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => void refreshStatus()}
            disabled={loading}
          >
            Actualizar
          </button>
        </div>
      </div>

      {error ? <ErrorBlock message={error} onRetry={() => void refreshStatus()} /> : null}

      <div className="wa-grid">
        {/* --- Panel de conexión ------------------------------------------ */}
        <section className="panel">
          <div className="panel__head">
            <span className="card__title">Estado de la conexión</span>
            <span className={`badge ${connected ? 'badge--ok' : 'badge--muted'}`}>
              {connected ? 'Listo para enviar' : 'Sin enviar'}
            </span>
          </div>
          <div className="panel__body col">
            <dl className="col" style={{ gap: 10 }}>
              <div className="row-between">
                <dt className="muted small">Motor</dt>
                <dd>{status?.engine ?? 'No informado'}</dd>
              </div>
              <div className="row-between">
                <dt className="muted small">Estado</dt>
                <dd>{stateLabel(status)}</dd>
              </div>
              <div className="row-between">
                <dt className="muted small">Número vinculado</dt>
                <dd className="mono">{status?.phoneNumber ?? '—'}</dd>
              </div>
              <div className="row-between">
                <dt className="muted small">Conectado desde</dt>
                <dd>
                  {status?.connectedAt
                    ? new Date(status.connectedAt).toLocaleString('es-PY')
                    : '—'}
                </dd>
              </div>
            </dl>

            {status?.lastError ? (
              <div className="alert alert--err">
                <div>
                  <div className="alert__title">Último error informado</div>
                  <div className="small">{status.lastError}</div>
                </div>
              </div>
            ) : null}

            <div className="row" style={{ flexWrap: 'wrap' }}>
              {!connected ? (
                <button
                  type="button"
                  className="btn btn--primary btn--lg"
                  onClick={() => void connect()}
                  disabled={connecting}
                >
                  {connecting ? 'Iniciando…' : 'Conectar WhatsApp'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--outline-danger"
                  onClick={() => setConfirmLogout(true)}
                >
                  Cerrar sesión de WhatsApp
                </button>
              )}
              {waiting ? (
                <span className="muted small">Esperando el escaneo… el código se renueva solo.</span>
              ) : null}
            </div>
          </div>
        </section>

        {/* --- Código QR -------------------------------------------------- */}
        <section className="panel">
          <div className="panel__head">
            <span className="card__title">Vincular dispositivo</span>
          </div>
          <div className="panel__body col">
            {connected ? (
              <div className="alert alert--ok">
                <div>
                  <div className="alert__title">Todo listo</div>
                  <div className="small">
                    Los envíos van a salir desde {status?.phoneNumber ?? 'el número vinculado'}. Si
                    cambiás de número, cerrá la sesión y vinculá el nuevo.
                  </div>
                </div>
              </div>
            ) : source ? (
              <div className="qr-box">
                <img src={source} alt="Código QR para vincular WhatsApp" />
                <span className="muted small">El código vence en unos minutos.</span>
              </div>
            ) : (
              <div className="qr-box">
                <span className="dropzone__icon" aria-hidden="true">
                  📱
                </span>
                <p className="muted small center">
                  {waiting
                    ? 'Todavía no recibimos el código. Se actualiza automáticamente cada 3 segundos.'
                    : qr?.qrDataUrl
                      ? 'El servidor devolvió el código en un formato que no podemos mostrar. Reintentá la conexión.'
                      : 'Tocá "Conectar WhatsApp" para generar el código QR.'}
                </p>
              </div>
            )}

            <ol className="steps">
              <li>Abrí WhatsApp en el teléfono del número que va a enviar los mensajes.</li>
              <li>
                Entrá a <strong>Ajustes</strong> (o los tres puntos) →{' '}
                <strong>Dispositivos vinculados</strong>.
              </li>
              <li>
                Tocá <strong>Vincular un dispositivo</strong> y apuntá la cámara a este código.
              </li>
              <li>
                Cuando termine, esta pantalla va a mostrar el número vinculado y podrás empezar a
                enviar.
              </li>
            </ol>
          </div>
        </section>
      </div>

      {/* --- Advertencia honesta ------------------------------------------- */}
      <section className="panel">
        <div className="panel__head">
          <span className="card__title">Antes de enviar masivamente</span>
        </div>
        <div className="panel__body col">
          <div className="alert alert--warn">
            <div>
              <div className="alert__title">
                Este cliente de WhatsApp no es oficial
              </div>
              <div className="small">
                Boda Studio se conecta como un dispositivo vinculado, igual que WhatsApp Web. Eso
                significa que WhatsApp puede limitar o bloquear la cuenta si detecta envíos
                masivos o denuncias de spam.
              </div>
            </div>
          </div>

          <ul className="col small" style={{ gap: 8 }}>
            <li>
              <strong>Usá un número dedicado.</strong> No uses el WhatsApp personal de los novios
              ni el tuyo de siempre: si pasa algo, perdés ese número.
            </li>
            <li>
              <strong>No superes el límite diario.</strong> Con una cuenta nueva, empezá con 20 o
              30 mensajes por día y subí de a poco. El sistema ya espera entre 6 y 14 segundos
              entre mensaje y mensaje.
            </li>
            <li>
              <strong>Probá primero en modo de prueba.</strong> La campaña se registra sin enviar
              nada y podés revisar cómo queda cada mensaje.
            </li>
            <li>
              <strong>Escribí como una persona.</strong> Nada de mayúsculas sostenidas, ni
              &quot;PROMOCIÓN&quot;, ni el mismo texto exacto para todos: la plantilla ya
              personaliza el nombre y el enlace.
            </li>
            <li>
              <strong>Respondé los mensajes.</strong> Una cuenta que solo envía y nunca contesta
              es la que más rápido cae en las sospechas de WhatsApp.
            </li>
          </ul>
        </div>
      </section>

      <ConfirmDialog
        open={confirmLogout}
        title="Cerrar sesión de WhatsApp"
        danger
        confirmLabel="Sí, cerrar sesión"
        busy={loggingOut}
        message={
          <>
            Se va a desvincular el dispositivo. Las campañas que estén en curso se van a detener y
            vas a tener que escanear un código nuevo para volver a enviar.
          </>
        }
        onConfirm={() => void logout()}
        onCancel={() => setConfirmLogout(false)}
      />
    </>
  );
}

export default WhatsAppPage;
