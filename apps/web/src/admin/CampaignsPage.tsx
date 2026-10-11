/**
 * ---------------------------------------------------------------------------
 * Campañas de WhatsApp: redactar, previsualizar, elegir destinatarios y enviar.
 * ---------------------------------------------------------------------------
 * Dos decisiones de producto importantes:
 *  1. El modo de prueba (dry run) viene ACTIVADO por defecto. La primera vez se
 *     renderiza todo y se registra, pero no sale ningún mensaje. Apagarlo
 *     requiere leer una advertencia explícita.
 *  2. La vista previa usa el primer destinatario real, con su nombre y su enlace,
 *     para que no haya sorpresas al enviar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  DEFAULT_TEMPLATE,
  TEMPLATE_VARIABLES,
  formatDateLong,
  formatPasses,
  mainEvent,
  renderTemplate,
  usedVariables,
  type Campaign,
  type CampaignItem,
  type Guest,
  type TemplateContext,
  type WeddingConfig,
} from '@boda/shared';
import { ApiError, api, guestLink, guestRsvpLink } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useWedding } from '../lib/useWedding';
import type { WhatsAppTestResponse } from '../lib/types';
import { ErrorBlock, LoadingBlock, StatusBadge, useToast } from './ui';

type RecipientMode = 'pending' | 'all' | 'manual';

const VARIABLE_KEYS = new Set<string>(TEMPLATE_VARIABLES.map((variable) => variable.key));

/** Arma el contexto de la plantilla para un invitado concreto. */
function contextFor(guest: Guest, slug: string, config: WeddingConfig | null): TemplateContext {
  const event = config ? mainEvent(config) : undefined;
  const origin = window.location.origin;
  return {
    nombre: guest.fullName,
    pases: formatPasses(guest.passes),
    enlace: `${origin}${guestLink(slug, guest.token)}`,
    novios: config?.couple.display ?? '',
    fecha: event ? formatDateLong(event.startAt) : '',
    lugar: event ? [event.venueName, event.city].filter(Boolean).join(', ') : '',
    rsvp: `${origin}${guestRsvpLink(slug, guest.token)}`,
  };
}

export function CampaignsPage(): JSX.Element {
  const { weddingId = '' } = useParams<{ weddingId: string }>();
  const weddingState = useWedding();
  const { notify } = useToast();

  const slug = weddingState.wedding?.slug ?? weddingState.config?.slug ?? '';
  const config = weddingState.config;

  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [name, setName] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [mode, setMode] = useState<RecipientMode>('pending');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [guestSearch, setGuestSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [activeItems, setActiveItems] = useState<CampaignItem[]>([]);
  const [working, setWorking] = useState(false);

  /* --- Envío de prueba a un número suelto -------------------------------- */
  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<WhatsAppTestResponse | null>(null);

  const sendTest = async (): Promise<void> => {
    if (!testPhone.trim()) {
      notify('Escribí un número de WhatsApp para la prueba.', 'err');
      return;
    }
    setTestSending(true);
    setTestResult(null);
    try {
      const result = await api.whatsapp.testSend(weddingId, { phone: testPhone, template });
      setTestResult(result);
      notify(
        result.delivered
          ? `Prueba enviada a ${result.phone}.`
          : 'El motor actual no envía mensajes reales: se generó el texto y quedó registrado.',
        result.delivered ? 'ok' : 'info',
      );
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'No pudimos enviar la prueba.', 'err');
    } finally {
      setTestSending(false);
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const guestsState = useAsync(
    useCallback(
      (signal: AbortSignal) =>
        api.guests.list(weddingId, { search: guestSearch || undefined }, signal),
      [weddingId, guestSearch],
    ),
    [weddingId, guestSearch],
    { enabled: Boolean(weddingId) },
  );

  const historyState = useAsync(
    useCallback((signal: AbortSignal) => api.campaigns.list(weddingId, signal), [weddingId]),
    [weddingId],
    { enabled: Boolean(weddingId) },
  );

  const guests = guestsState.data?.guests ?? [];

  /* --- Destinatarios ---------------------------------------------------- */
  const recipients = useMemo(() => {
    if (mode === 'all') return guests;
    if (mode === 'manual') return guests.filter((guest) => selectedIds.includes(guest.id));
    return guests.filter((guest) => guest.status === 'pending');
  }, [mode, guests, selectedIds]);

  const pendingCount = useMemo(
    () => guests.filter((guest) => guest.status === 'pending').length,
    [guests],
  );

  const previewGuest = recipients[0] ?? guests[0] ?? null;

  const previewContext = useMemo(
    () => (previewGuest && slug ? contextFor(previewGuest, slug, config) : null),
    [previewGuest, slug, config],
  );

  const analysis = useMemo(() => {
    const used = usedVariables(template);
    const missing = previewContext ? renderTemplate(template, previewContext).missing : used;
    const unknown = used.filter((key) => !VARIABLE_KEYS.has(key));
    return { used, missing, unknown };
  }, [template, previewContext]);

  const previewBody = useMemo(() => {
    if (!template) return '';
    return renderTemplate(template, previewContext ?? {}).body;
  }, [template, previewContext]);

  /* --- Inserta una variable en la posición del cursor ------------------- */
  const insertVariable = useCallback(
    (key: string): void => {
      const token = `{{${key}}}`;
      const area = textareaRef.current;
      if (!area) {
        setTemplate((current) => `${current}${token}`);
        return;
      }
      const start = area.selectionStart ?? template.length;
      const end = area.selectionEnd ?? start;
      setTemplate(`${template.slice(0, start)}${token}${template.slice(end)}`);
      // Deja el cursor justo después de la variable insertada.
      window.requestAnimationFrame(() => {
        area.focus();
        const caret = start + token.length;
        area.setSelectionRange(caret, caret);
      });
    },
    [template],
  );

  /* --- Seguimiento de la campaña en curso ------------------------------- */
  const loadCampaign = useCallback(
    async (campaignId: string, signal?: AbortSignal): Promise<void> => {
      const detail = await api.campaigns.get(weddingId, campaignId, signal);
      setActiveCampaign(detail.campaign);
      setActiveItems(detail.items ?? []);
    },
    [weddingId],
  );

  useEffect(() => {
    if (!activeCampaignId) return;
    const campaignId = activeCampaignId;
    const controller = new AbortController();
    let timer: number | undefined;

    async function tick(): Promise<void> {
      try {
        await loadCampaign(campaignId, controller.signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }

    void tick();
    // Se refresca cada 2,5 s; el efecto se reinicia al terminar la campaña.
    timer = window.setInterval(() => void tick(), 2500);

    return () => {
      controller.abort();
      if (timer) window.clearInterval(timer);
    };
  }, [activeCampaignId, loadCampaign]);

  /* --- Crear la campaña ------------------------------------------------- */
  const startCampaign = useCallback(async (): Promise<void> => {
    if (!template.trim()) {
      setError('La plantilla no puede estar vacía.');
      return;
    }
    if (recipients.length === 0) {
      setError('No hay destinatarios con esa selección.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const response = await api.campaigns.create(weddingId, {
        name: name.trim() || `Envío del ${new Date().toLocaleDateString('es-PY')}`,
        template,
        guestIds: recipients.map((guest) => guest.id),
        dryRun,
      });
      setActiveCampaignId(response.campaign.id);
      setActiveCampaign(response.campaign);
      notify(
        dryRun
          ? 'Campaña creada en modo de prueba: no se envió ningún mensaje.'
          : 'Campaña iniciada. Seguí el progreso acá abajo.',
        'ok',
      );
      historyState.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos iniciar la campaña.');
    } finally {
      setCreating(false);
    }
  }, [template, recipients, weddingId, name, dryRun, notify, historyState]);

  const campaignAction = useCallback(
    async (action: 'pause' | 'resume' | 'cancel'): Promise<void> => {
      if (!activeCampaignId) return;
      setWorking(true);
      try {
        if (action === 'pause') await api.campaigns.pause(weddingId, activeCampaignId);
        if (action === 'resume') await api.campaigns.resume(weddingId, activeCampaignId);
        if (action === 'cancel') await api.campaigns.cancel(weddingId, activeCampaignId);
        await loadCampaign(activeCampaignId);
        historyState.reload();
      } catch (err) {
        notify(err instanceof ApiError ? err.message : 'No pudimos cambiar el estado.', 'err');
      } finally {
        setWorking(false);
      }
    },
    [activeCampaignId, weddingId, loadCampaign, historyState, notify],
  );

  const progress = useMemo(() => {
    if (!activeCampaign) return { done: 0, percent: 0 };
    const done = activeCampaign.sentCount + activeCampaign.failedCount + activeCampaign.skippedCount;
    const total = activeCampaign.totalCount || 1;
    return { done, percent: Math.min(100, Math.round((done / total) * 100)) };
  }, [activeCampaign]);

  if (weddingState.error) {
    return <ErrorBlock message={weddingState.error} onRetry={weddingState.reload} />;
  }

  const isLive =
    activeCampaign?.status === 'running' || activeCampaign?.status === 'draft';

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to={`/admin/weddings/${weddingId}/guests`}>← Invitados</Link>
          </p>
          <h1>Campañas de WhatsApp</h1>
          <p>Escribí el mensaje una vez: cada invitado recibe su nombre y su enlace personal.</p>
        </div>
      </div>

      {error ? <ErrorBlock message={error} /> : null}

      <div className="composer">
        {/* --- Plantilla --------------------------------------------------- */}
        <section className="panel">
          <div className="panel__head">
            <span className="card__title">Mensaje</span>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setTemplate(DEFAULT_TEMPLATE)}
            >
              Usar el texto sugerido
            </button>
          </div>
          <div className="panel__body col">
            <div className="field">
              <label className="label" htmlFor="campaignName">
                Nombre de la campaña (opcional)
              </label>
              <input
                id="campaignName"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Primer envío — julio"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="template">
                Texto del mensaje
              </label>
              <textarea
                id="template"
                ref={textareaRef}
                className="textarea"
                style={{ minHeight: 280 }}
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
              />
            </div>

            <div className="field">
              <span className="label">Insertar variable</span>
              <div className="vars">
                {TEMPLATE_VARIABLES.map((variable) => (
                  <button
                    type="button"
                    className="chip"
                    key={variable.key}
                    onClick={() => insertVariable(variable.key)}
                    title={`${variable.label} · se ve así: ${variable.example}`}
                  >
                    <span className="chip__code">{`{{${variable.key}}}`}</span>
                    {variable.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              className={`alert ${
                analysis.unknown.length > 0
                  ? 'alert--err'
                  : analysis.missing.length > 0
                    ? 'alert--warn'
                    : 'alert--ok'
              }`}
            >
              <div>
                <div className="alert__title">
                  {analysis.unknown.length > 0
                    ? 'Hay variables que no existen'
                    : analysis.missing.length > 0
                      ? 'Falta cargar algunos datos'
                      : 'La plantilla está lista'}
                </div>
                <div className="small">
                  Variables usadas: {analysis.used.length > 0 ? analysis.used.join(', ') : 'ninguna'}.
                  {analysis.unknown.length > 0
                    ? ` Desconocidas: ${analysis.unknown.join(', ')}. Se van a enviar tal cual.`
                    : ''}
                  {analysis.missing.length > 0
                    ? ` Sin valor: ${analysis.missing.join(', ')}. Completá esos datos en la boda (fecha, lugar) para que se reemplacen.`
                    : ''}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- Vista previa + destinatarios -------------------------------- */}
        <section className="panel">
          <div className="panel__head">
            <span className="card__title">Vista previa y destinatarios</span>
            <span className="muted small">
              {previewGuest ? `Como lo verá ${previewGuest.fullName}` : 'Sin destinatario'}
            </span>
          </div>
          <div className="panel__body col">
            <div className="phone-preview">
              <div className="phone-preview__bubble">
                {previewBody || 'Escribí el mensaje para ver la vista previa…'}
              </div>
            </div>

            <div className="field">
              <span className="label">Destinatarios</span>
              <div className="col" style={{ gap: 8 }}>
                <label className="switch">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'pending'}
                    onChange={() => setMode('pending')}
                  />
                  Solo los que faltan confirmar ({pendingCount})
                </label>
                <label className="switch">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'all'}
                    onChange={() => setMode('all')}
                  />
                  Todos los invitados ({guests.length})
                </label>
                <label className="switch">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'manual'}
                    onChange={() => setMode('manual')}
                  />
                  Elegir a mano ({selectedIds.length} elegidos)
                </label>
              </div>
            </div>

            {mode === 'manual' ? (
              <>
                <input
                  className="input"
                  placeholder="Buscar invitado…"
                  value={guestSearch}
                  onChange={(event) => setGuestSearch(event.target.value)}
                />
                <div className="recipients">
                  {guestsState.loading && guests.length === 0 ? (
                    <div className="state">Cargando…</div>
                  ) : guests.length === 0 ? (
                    <div className="state">No hay invitados que coincidan.</div>
                  ) : (
                    guests.map((guest) => (
                      <label className="recipient" key={guest.id}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(guest.id)}
                          onChange={(event) =>
                            setSelectedIds((current) =>
                              event.target.checked
                                ? [...current, guest.id]
                                : current.filter((id) => id !== guest.id),
                            )
                          }
                        />
                        <span className="grow truncate">
                          <strong>{guest.fullName}</strong>
                          <span className="muted small">
                            {' '}
                            · {guest.phone} · {formatPasses(guest.passes)}
                          </span>
                        </span>
                        <StatusBadge status={guest.status} />
                      </label>
                    ))
                  )}
                </div>
              </>
            ) : null}

            <label className="switch">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(event) => setDryRun(event.target.checked)}
              />
              Modo de prueba: no enviar, solo registrar
            </label>

            {!dryRun ? (
              <div className="alert alert--warn" role="alert">
                <div>
                  <div className="alert__title">⚠ Se van a enviar mensajes reales</div>
                  <div className="small">
                    Se enviarán {recipients.length} mensaje(s) desde el número conectado, con pausas
                    aleatorias entre 6 y 14 segundos para cuidar la cuenta. Revisá la vista previa
                    antes de continuar.
                  </div>
                </div>
              </div>
            ) : null}

            <div className="card">
              <span className="card__title">Probar antes de enviar</span>
              <p className="muted small">
                Mandá este mismo texto a un número tuyo para ver cómo llega. No toca la lista de
                invitados ni crea una campaña.
              </p>
              <div className="row">
                <input
                  className="input"
                  type="tel"
                  inputMode="tel"
                  placeholder="0981 123 456"
                  value={testPhone}
                  onChange={(event) => setTestPhone(event.target.value)}
                />
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={testSending}
                  onClick={() => void sendTest()}
                >
                  {testSending ? 'Enviando…' : 'Enviar prueba'}
                </button>
              </div>
              {testResult ? (
                <div className={testResult.delivered ? 'alert' : 'alert alert--warn'} role="status">
                  <div>
                    <div className="alert__title">
                      {testResult.delivered
                        ? `Enviado a ${testResult.phone} (motor ${testResult.engine})`
                        : 'No se envió nada: el motor es de previsualización'}
                    </div>
                    <pre className="small">{testResult.body}</pre>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className={
                dryRun ? 'btn btn--primary btn--lg btn--block' : 'btn btn--danger btn--lg btn--block'
              }
              disabled={creating || recipients.length === 0}
              onClick={() => void startCampaign()}
            >
              {creating
                ? 'Iniciando…'
                : dryRun
                  ? `Probar con ${recipients.length} invitado(s)`
                  : `Iniciar envío a ${recipients.length} invitado(s)`}
            </button>
          </div>
        </section>
      </div>

      {/* --- Progreso de la campaña en curso ------------------------------- */}
      {activeCampaign ? (
        <section className="panel">
          <div className="panel__head">
            <span className="card__title">Campaña en curso</span>
            <div className="row">
              <StatusBadge status={activeCampaign.status} />
              {activeCampaign.dryRun ? <span className="badge badge--gold">Modo prueba</span> : null}
            </div>
          </div>
          <div className="panel__body col">
            <div className="row-between">
              <span className="muted small">
                {progress.done} de {activeCampaign.totalCount} procesados
              </span>
              <span className="muted small">{progress.percent}%</span>
            </div>
            <div className="progress">
              <div className="progress__bar" style={{ width: `${progress.percent}%` }} />
            </div>

            <div className="stats">
              <div className="stat stat--ok">
                <div className="stat__label">Enviados</div>
                <div className="stat__value">{activeCampaign.sentCount}</div>
              </div>
              <div className="stat stat--err">
                <div className="stat__label">Fallidos</div>
                <div className="stat__value">{activeCampaign.failedCount}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Omitidos</div>
                <div className="stat__value">{activeCampaign.skippedCount}</div>
              </div>
            </div>

            {isLive ? (
              <p className="muted small">
                {activeCampaign.status === 'running'
                  ? 'Se está enviando ahora. Podés pausar en cualquier momento.'
                  : 'Campaña creada. Se va a procesar en breve.'}
              </p>
            ) : null}

            <div className="row" style={{ flexWrap: 'wrap' }}>
              {activeCampaign.status === 'running' ? (
                <button
                  type="button"
                  className="btn"
                  disabled={working}
                  onClick={() => void campaignAction('pause')}
                >
                  ⏸ Pausar
                </button>
              ) : null}
              {activeCampaign.status === 'paused' ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={working}
                  onClick={() => void campaignAction('resume')}
                >
                  ▶ Reanudar
                </button>
              ) : null}
              {activeCampaign.status === 'running' || activeCampaign.status === 'paused' ? (
                <button
                  type="button"
                  className="btn btn--outline-danger"
                  disabled={working}
                  onClick={() => void campaignAction('cancel')}
                >
                  Cancelar campaña
                </button>
              ) : null}
              {!isLive ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setActiveCampaignId(null);
                    setActiveCampaign(null);
                    setActiveItems([]);
                    historyState.reload();
                  }}
                >
                  Ocultar
                </button>
              ) : null}
            </div>

            {activeItems.length > 0 ? (
              <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>Invitado</th>
                      <th>Teléfono</th>
                      <th>Estado</th>
                      <th>Mensaje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeItems.map((item) => (
                      <tr key={item.id}>
                        <td className="nowrap">{item.guestName}</td>
                        <td className="mono tiny">{item.phone}</td>
                        <td>
                          <StatusBadge status={item.status} />
                          {item.error ? (
                            <div className="tiny" style={{ color: 'var(--err-600)' }}>
                              {item.error}
                            </div>
                          ) : null}
                        </td>
                        <td className="muted tiny" style={{ maxWidth: 320 }}>
                          <span className="truncate" title={item.renderedBody}>
                            {item.renderedBody}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted small">Todavía no hay detalle de envíos.</p>
            )}
          </div>
        </section>
      ) : null}

      {/* --- Historial ---------------------------------------------------- */}
      <section className="panel">
        <div className="panel__head">
          <span className="card__title">Campañas anteriores</span>
          <button
            type="button"
            className="btn btn--sm"
            onClick={historyState.reload}
            disabled={historyState.loading}
          >
            Actualizar
          </button>
        </div>
        <div className="panel__body">
          {historyState.loading && !historyState.data ? (
            <LoadingBlock label="Cargando el historial…" />
          ) : historyState.error ? (
            <ErrorBlock message={historyState.error} onRetry={historyState.reload} />
          ) : (historyState.data?.campaigns.length ?? 0) === 0 ? (
            <p className="muted small">Todavía no enviaste ninguna campaña.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Campaña</th>
                    <th>Estado</th>
                    <th>Total</th>
                    <th>Enviados</th>
                    <th>Fallidos</th>
                    <th>Creada</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {historyState.data?.campaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>
                        <strong>{campaign.name}</strong>
                        {campaign.dryRun ? (
                          <span className="badge badge--gold" style={{ marginLeft: 6 }}>
                            Prueba
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <StatusBadge status={campaign.status} />
                      </td>
                      <td>{campaign.totalCount}</td>
                      <td>{campaign.sentCount}</td>
                      <td>{campaign.failedCount}</td>
                      <td className="muted small">
                        {new Date(campaign.createdAt).toLocaleString('es-PY')}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => setActiveCampaignId(campaign.id)}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export default CampaignsPage;
