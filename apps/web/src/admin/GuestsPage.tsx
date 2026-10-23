/**
 * ---------------------------------------------------------------------------
 * Invitados: la pantalla que la organizadora más usa.
 * ---------------------------------------------------------------------------
 * Buscar, filtrar, corregir pases, marcar confirmaciones a mano, copiar el
 * enlace personal y abrir WhatsApp con el mensaje ya escrito. Las tarjetas de
 * arriba resumen el estado de la boda de un vistazo.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  formatPasses,
  formatPhone,
  waMeLink,
  type Guest,
  type GuestInput,
  type RsvpStatus,
} from '@boda/shared';
import { ApiError, api, copyToClipboard, guestLink } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useWedding } from '../lib/useWedding';
import { MESSAGE_STATUS_LABELS } from '../lib/labels';
import {
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  StatusBadge,
  useToast,
} from './ui';
import type { GuestListResponse, GuestUpdateInput } from '../lib/types';

type StatusFilter = RsvpStatus | 'all';

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'maybe', label: 'Tal vez' },
  { value: 'declined', label: 'No asisten' },
];

const LABEL = 'label';

interface EditState {
  guest: Guest;
  fullName: string;
  /** Editable: es el número al que se le envía el WhatsApp. */
  phone: string;
  passes: number;
  groupName: string;
  notes: string;
  companions: string;
  status: RsvpStatus;
}

export function GuestsPage(): JSX.Element {
  const { notify } = useToast();
  const { weddingId = '' } = useParams<{ weddingId: string }>();
  const weddingState = useWedding();
  const slug = weddingState.wedding?.slug ?? weddingState.config?.slug ?? '';

  /* Búsqueda con pequeño retardo: evita una petición por tecla. */
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [search]);

  const [status, setStatus] = useState<StatusFilter>('all');
  const [group, setGroup] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [removing, setRemoving] = useState<Guest | null>(null);
  const [regenerating, setRegenerating] = useState<Guest | null>(null);
  const [adding, setAdding] = useState(false);
  const [newGuest, setNewGuest] = useState<GuestInput>({
    fullName: '',
    phone: '',
    passes: 2,
  });

  const state = useAsync<GuestListResponse>(
    useCallback(
      (signal: AbortSignal) =>
        api.guests.list(
          weddingId,
          { search: debounced || undefined, status, group: group || undefined },
          signal,
        ),
      [weddingId, debounced, status, group],
    ),
    [weddingId, debounced, status, group],
    { enabled: Boolean(weddingId) },
  );

  const guests = state.data?.guests ?? [];

  /* Resumen: se usa el del servidor si viene; si no, se calcula en el cliente. */
  const summary = useMemo(() => {
    if (state.data?.summary) return state.data.summary;
    const totalPasses = guests.reduce((sum, guest) => sum + guest.passes, 0);
    return {
      total: guests.length,
      totalPasses,
      confirmed: guests.filter((guest) => guest.status === 'confirmed').length,
      confirmedPasses: guests
        .filter((guest) => guest.status === 'confirmed')
        .reduce((sum, guest) => sum + guest.passes, 0),
      pending: guests.filter((guest) => guest.status === 'pending').length,
      declined: guests.filter((guest) => guest.status === 'declined').length,
      maybe: guests.filter((guest) => guest.status === 'maybe').length,
    };
  }, [state.data, guests]);

  const groups = state.data?.groups ?? [];

  const linkFor = useCallback(
    (guest: Guest): string =>
      slug ? `${window.location.origin}${guestLink(slug, guest.token)}` : guest.token,
    [slug],
  );

  const patchGuest = useCallback(
    async (guest: Guest, changes: GuestUpdateInput, message: string): Promise<void> => {
      setBusyId(guest.id);
      try {
        await api.guests.update(weddingId, guest.id, changes);
        notify(message, 'ok');
        state.reload();
      } catch (error) {
        notify(
          error instanceof ApiError ? error.message : 'No pudimos guardar el cambio.',
          'err',
        );
      } finally {
        setBusyId(null);
      }
    },
    [weddingId, notify, state],
  );

  const copyLink = useCallback(
    async (guest: Guest): Promise<void> => {
      const ok = await copyToClipboard(linkFor(guest));
      notify(
        ok ? `Enlace de ${guest.fullName} copiado.` : 'No pudimos copiar el enlace.',
        ok ? 'ok' : 'err',
      );
    },
    [linkFor, notify],
  );

  const submitEdit = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      if (!edit) return;
      await patchGuest(
        edit.guest,
        {
          fullName: edit.fullName.trim(),
          phone: edit.phone.trim(),
          passes: edit.passes,
          groupName: edit.groupName.trim() || null,
          notes: edit.notes.trim() || null,
          status: edit.status,
          companions: edit.companions
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean),
        },
        'Invitado actualizado.',
      );
      setEdit(null);
    },
    [edit, patchGuest],
  );

  const doRemove = useCallback(async (): Promise<void> => {
    if (!removing) return;
    const guest = removing;
    setBusyId(guest.id);
    try {
      await api.guests.remove(weddingId, guest.id);
      notify(`${guest.fullName} fue eliminado.`, 'ok');
      setRemoving(null);
      state.reload();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'No pudimos eliminar al invitado.', 'err');
    } finally {
      setBusyId(null);
    }
  }, [removing, weddingId, notify, state]);

  const doRegenerate = useCallback(async (): Promise<void> => {
    if (!regenerating) return;
    const guest = regenerating;
    setBusyId(guest.id);
    try {
      const response = await api.guests.regenerateToken(weddingId, guest.id);
      notify('Se generó un enlace nuevo. El anterior dejó de funcionar.', 'ok');
      setRegenerating(null);
      if (slug) {
        const ok = await copyToClipboard(
          `${window.location.origin}${guestLink(slug, response.guest.token)}`,
        );
        if (ok) notify('El enlace nuevo ya está en tu portapapeles.', 'ok');
      }
      state.reload();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'No pudimos regenerar el enlace.', 'err');
    } finally {
      setBusyId(null);
    }
  }, [regenerating, weddingId, notify, slug, state]);

  const submitNewGuest = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      const fullName = newGuest.fullName.trim();
      const phone = newGuest.phone.trim();
      if (!fullName || !phone) {
        notify('Completá el nombre y el teléfono.', 'err');
        return;
      }
      setAdding(true);
      try {
        const groupName = newGuest.groupName?.trim();
        await api.guests.create(weddingId, {
          fullName,
          phone,
          passes: newGuest.passes,
          ...(groupName ? { groupName } : {}),
        });
        notify('Invitado agregado.', 'ok');
        setNewGuest({ fullName: '', phone: '', passes: newGuest.passes });
        state.reload();
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'No pudimos agregar al invitado.', 'err');
      } finally {
        setAdding(false);
      }
    },
    [newGuest, weddingId, notify, state],
  );

  if (weddingState.error) {
    return <ErrorBlock message={weddingState.error} onRetry={weddingState.reload} />;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to={`/admin/weddings/${weddingId}`}>
              ← {weddingState.config?.couple.display ?? 'Editar boda'}
            </Link>
          </p>
          <h1>Invitados</h1>
          <p>Buscá, corregí y seguí el estado de cada confirmación.</p>
        </div>
        <div className="row">
          <Link className="btn" to={`/admin/weddings/${weddingId}/import`}>
            Importar Excel
          </Link>
          <Link className="btn btn--primary" to={`/admin/weddings/${weddingId}/campaigns`}>
            Enviar invitaciones
          </Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat__label">Invitados</div>
          <div className="stat__value">{summary.total}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Pases totales</div>
          <div className="stat__value">{summary.totalPasses}</div>
        </div>
        <div className="stat stat--ok">
          <div className="stat__label">Confirmados</div>
          <div className="stat__value">{summary.confirmed}</div>
        </div>
        <div className="stat stat--warn">
          <div className="stat__label">Pendientes</div>
          <div className="stat__value">{summary.pending}</div>
        </div>
        <div className="stat stat--err">
          <div className="stat__label">No asisten</div>
          <div className="stat__value">{summary.declined}</div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input
            className="input grow"
            style={{ minWidth: 200 }}
            placeholder="Buscar por nombre, teléfono o grupo…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="search"
          />
          <select
            className="select"
            style={{ width: 170 }}
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            aria-label="Filtrar por estado"
          >
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ width: 190 }}
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            aria-label="Filtrar por grupo"
          >
            <option value="">Todos los grupos</option>
            {groups.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={state.reload} disabled={state.loading}>
            {state.loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {state.loading && guests.length === 0 ? <LoadingBlock label="Cargando invitados…" /> : null}
      {state.error ? <ErrorBlock message={state.error} onRetry={state.reload} /> : null}

      {!state.error && !(state.loading && guests.length === 0) ? (
        guests.length === 0 ? (
          <EmptyState title="No hay invitados con ese filtro">
            <p className="muted small">
              Probá con otra búsqueda o importá la lista desde tu planilla de Excel.
            </p>
          </EmptyState>
        ) : (
          <div className="panel">
            <div className="panel__head">
              <span className="card__title">{guests.length} invitado(s)</span>
              <span className="muted small">
                <span className="table-hint">Desplazá la tabla para ver todas las columnas · </span>
                {summary.confirmedPasses} pases confirmados de {summary.totalPasses}
              </span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invitado</th>
                    <th>Teléfono</th>
                    <th>Pases</th>
                    <th>RSVP</th>
                    <th className="col-envio">Envío</th>
                    <th>Enlace</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {guests.map((guest) => (
                    <tr key={guest.id}>
                      <td>
                        <strong>{guest.fullName}</strong>
                        {guest.groupName ? (
                          <div
                            className="muted tiny truncate"
                            style={{ maxWidth: 170 }}
                            title={guest.groupName}
                          >
                            {guest.groupName}
                          </div>
                        ) : null}
                        {guest.notes ? (
                          <div
                            className="muted tiny truncate"
                            style={{ maxWidth: 170 }}
                            title={guest.notes}
                          >
                            {guest.notes}
                          </div>
                        ) : null}
                      </td>
                      <td className="nowrap mono">{formatPhone(guest.phone)}</td>
                      <td className="nowrap">{formatPasses(guest.passes)}</td>
                      <td>
                        <StatusBadge status={guest.status} />
                        {guest.companions.length > 0 ? (
                          <div
                            className="muted tiny truncate"
                            style={{ maxWidth: 140 }}
                            title={guest.companions.join(', ')}
                          >
                            + {guest.companions.join(', ')}
                          </div>
                        ) : null}
                        {guest.dietary ? (
                          <div
                            className="muted tiny truncate"
                            style={{ maxWidth: 140 }}
                            title={guest.dietary}
                          >
                            🍽 {guest.dietary}
                          </div>
                        ) : null}
                      </td>
                      <td className="col-envio">
                        <span
                          className={`badge${
                            guest.messageStatus === 'failed'
                              ? ' badge--err'
                              : guest.messageStatus === 'sent' ||
                                  guest.messageStatus === 'delivered' ||
                                  guest.messageStatus === 'read'
                                ? ' badge--ok'
                                : ' badge--muted'
                          }`}
                          title={guest.messageError ?? undefined}
                        >
                          {MESSAGE_STATUS_LABELS[guest.messageStatus]}
                        </span>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() => void copyLink(guest)}
                          >
                            Copiar
                          </button>
                          <a
                            className="btn btn--sm"
                            href={waMeLink(
                              guest.phone,
                              `¡Hola ${guest.fullName}! Te compartimos la invitación de la boda de ${
                                weddingState.config?.couple.display ?? 'los novios'
                              }: ${linkFor(guest)}`,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir WhatsApp con el mensaje listo"
                          >
                            WhatsApp
                          </a>
                        </div>
                      </td>
                      <td className="actions">
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn--sm"
                            disabled={busyId === guest.id || guest.status === 'confirmed'}
                            onClick={() =>
                              void patchGuest(guest, { status: 'confirmed' }, 'Marcado como confirmado.')
                            }
                            title="Marcar como confirmado"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm"
                            disabled={busyId === guest.id || guest.status === 'declined'}
                            onClick={() =>
                              void patchGuest(guest, { status: 'declined' }, 'Marcado como que no asiste.')
                            }
                            title="Marcar como que no asiste"
                          >
                            ✕
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm"
                            disabled={busyId === guest.id}
                            onClick={() =>
                              setEdit({
                                guest,
                                fullName: guest.fullName,
                                phone: guest.phone,
                                passes: guest.passes,
                                groupName: guest.groupName ?? '',
                                notes: guest.notes ?? '',
                                companions: guest.companions.join(', '),
                                status: guest.status,
                              })
                            }
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm btn--ghost"
                            disabled={busyId === guest.id}
                            onClick={() => setRegenerating(guest)}
                            title="Generar un enlace nuevo (el anterior deja de funcionar)"
                            aria-label="Generar un enlace nuevo"
                          >
                            🔗
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm btn--ghost"
                            disabled={busyId === guest.id}
                            onClick={() => setRemoving(guest)}
                            title="Eliminar invitado"
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : null}

      {/* --- Alta rápida de un invitado ----------------------------------- */}
      <section className="panel">
        <div className="panel__head">
          <span className="card__title">Agregar un invitado</span>
          <span className="muted small">Para los que aparecen a último momento</span>
        </div>
        <div className="panel__body">
          <form className="grid-2" onSubmit={(event) => void submitNewGuest(event)}>
            <div className="field">
              <label className={LABEL}>Nombre y apellido</label>
              <input
                className="input"
                value={newGuest.fullName}
                onChange={(event) =>
                  setNewGuest((current) => ({ ...current, fullName: event.target.value }))
                }
                placeholder="Ana Gómez"
              />
            </div>
            <div className="field">
              <label className={LABEL}>Teléfono (WhatsApp)</label>
              <input
                className="input"
                value={newGuest.phone}
                onChange={(event) =>
                  setNewGuest((current) => ({ ...current, phone: event.target.value }))
                }
                placeholder="0976 178000"
              />
            </div>
            <div className="field">
              <label className={LABEL}>Pases</label>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={newGuest.passes}
                onChange={(event) =>
                  setNewGuest((current) => ({
                    ...current,
                    passes: Math.min(20, Math.max(1, Number(event.target.value) || 1)),
                  }))
                }
              />
            </div>
            <div className="field">
              <label className={LABEL}>Grupo (opcional)</label>
              <input
                className="input"
                value={newGuest.groupName ?? ''}
                onChange={(event) =>
                  setNewGuest((current) => ({ ...current, groupName: event.target.value }))
                }
                placeholder="Familia Gómez"
              />
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn--primary" disabled={adding}>
                {adding ? 'Agregando…' : 'Agregar invitado'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* --- Diálogos ----------------------------------------------------- */}
      {edit ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEdit(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Editar invitado">
            <form onSubmit={(event) => void submitEdit(event)}>
              <div className="dialog__head">
                <span className="dialog__title">Editar invitado</span>
                <button
                  type="button"
                  className="dialog__close"
                  onClick={() => setEdit(null)}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              <div className="dialog__body">
                <div className="field">
                  <label className={LABEL}>Nombre y apellido</label>
                  <input
                    className="input"
                    value={edit.fullName}
                    onChange={(event) => setEdit({ ...edit, fullName: event.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label className={LABEL}>Teléfono (WhatsApp)</label>
                  <input
                    className="input"
                    type="tel"
                    inputMode="tel"
                    value={edit.phone}
                    onChange={(event) => setEdit({ ...edit, phone: event.target.value })}
                    required
                  />
                  <p className="muted small">
                    Es el número al que se le envía el mensaje. Puede ir con 0 inicial o con +595:
                    el sistema lo normaliza al guardar. Si el número está repetido en esta boda,
                    avisa y no guarda.
                  </p>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label className={LABEL}>Pases</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={20}
                      value={edit.passes}
                      onChange={(event) =>
                        setEdit({
                          ...edit,
                          passes: Math.min(20, Math.max(1, Number(event.target.value) || 1)),
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label className={LABEL}>Estado</label>
                    <select
                      className="select"
                      value={edit.status}
                      onChange={(event) =>
                        setEdit({ ...edit, status: event.target.value as RsvpStatus })
                      }
                    >
                      <option value="pending">Pendiente</option>
                      <option value="confirmed">Confirmado</option>
                      <option value="maybe">Tal vez</option>
                      <option value="declined">No asiste</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label className={LABEL}>Grupo</label>
                  <input
                    className="input"
                    value={edit.groupName}
                    onChange={(event) => setEdit({ ...edit, groupName: event.target.value })}
                    placeholder="Familia Gómez"
                  />
                </div>
                <div className="field">
                  <label className={LABEL}>Acompañantes (separados por coma)</label>
                  <input
                    className="input"
                    value={edit.companions}
                    onChange={(event) => setEdit({ ...edit, companions: event.target.value })}
                    placeholder="Luis Gómez, Sofía Gómez"
                  />
                </div>
                <div className="field">
                  <label className={LABEL}>Nota interna</label>
                  <input
                    className="input"
                    value={edit.notes}
                    onChange={(event) => setEdit({ ...edit, notes: event.target.value })}
                    placeholder="Compañero de trabajo de Héctor"
                  />
                </div>
              </div>
              <div className="dialog__foot">
                <button type="button" className="btn" onClick={() => setEdit(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary" disabled={busyId === edit.guest.id}>
                  {busyId === edit.guest.id ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(removing)}
        title="Eliminar invitado"
        danger
        confirmLabel="Sí, eliminar"
        busy={busyId === removing?.id}
        message={
          <>
            ¿Seguro que querés eliminar a <strong>{removing?.fullName}</strong>? Se borra también su
            confirmación y su enlace personal.
          </>
        }
        onConfirm={() => void doRemove()}
        onCancel={() => setRemoving(null)}
      />

      <ConfirmDialog
        open={Boolean(regenerating)}
        title="Generar un enlace nuevo"
        confirmLabel="Generar enlace"
        busy={busyId === regenerating?.id}
        message={
          <>
            El enlace actual de <strong>{regenerating?.fullName}</strong> dejará de funcionar. Vas a
            tener que enviarle el nuevo.
          </>
        }
        onConfirm={() => void doRegenerate()}
        onCancel={() => setRegenerating(null)}
      />
    </>
  );
}

export default GuestsPage;
