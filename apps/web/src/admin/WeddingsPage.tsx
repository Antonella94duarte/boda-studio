/**
 * Mis bodas: listado con contadores de confirmación y el diálogo para crear una
 * boda nueva. Al crearla se arma una config base (con el evento principal ya
 * cargado) para que la organizadora no arranque con un formulario en blanco.
 */

import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { capitalize, formatDateLong, formatTime, mainEvent, type WeddingConfig } from '@boda/shared';
import { ApiError, api, copyToClipboard } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorBlock, LoadingBlock, useToast } from './ui';
import type { WeddingListItem } from '../lib/types';

/** "Vanessa y Héctor" -> "vanessayhector" (slug válido del esquema). */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ñÑ]/g, 'n')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Id local para el evento que se crea junto con la boda. */
function localId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `ev-${Math.random().toString(36).slice(2, 10)}`;
}

interface CreateForm {
  bride: string;
  groom: string;
  slug: string;
  slugTouched: boolean;
  date: string;
  time: string;
  venueName: string;
  city: string;
}

const EMPTY_FORM: CreateForm = {
  bride: '',
  groom: '',
  slug: '',
  slugTouched: false,
  date: '',
  time: '19:00',
  venueName: '',
  city: '',
};

export function WeddingsPage(): JSX.Element {
  const navigate = useNavigate();
  const { notify } = useToast();
  const state = useAsync(useCallback((signal: AbortSignal) => api.weddings.list(signal), []), []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const weddings: WeddingListItem[] = state.data?.weddings ?? [];

  const patch = useCallback((changes: Partial<CreateForm>): void => {
    setForm((current) => ({ ...current, ...changes }));
  }, []);

  const display = `${form.bride.trim() || 'La novia'} y ${form.groom.trim() || 'el novio'}`;

  const submit = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      if (creating) return;

      const bride = form.bride.trim();
      const groom = form.groom.trim();
      const title = display;
      const slug = form.slug.trim() || slugify(`${bride}${groom}`);

      if (!bride || !groom) {
        setFormError('Completá el nombre de los dos novios.');
        return;
      }
      if (!/^[a-z0-9-]{3,}$/.test(slug)) {
        setFormError('La dirección web (slug) solo admite minúsculas, números y guiones.');
        return;
      }

      // ISO con zona horaria de Paraguay: el navegador del invitado puede estar
      // en otra zona y la hora tiene que ser la del evento.
      const startAt =
        form.date && form.time ? `${form.date}T${form.time}:00-03:00` : undefined;
      const venueName = form.venueName.trim() || 'A confirmar';
      const city = form.city.trim();

      const config: Partial<WeddingConfig> = {
        slug,
        couple: { bride, groom, display },
        metaTitle: `¡Nos casamos! · ${display}`,
        heroTagline: '¡Nos casamos!',
        events: startAt
          ? [
              {
                id: localId(),
                kind: 'religious',
                title: 'Nuestra boda',
                startAt,
                venueName,
                isMain: true,
                ...(city ? { city } : {}),
              },
            ]
          : [],
      };

      setCreating(true);
      setFormError(null);
      try {
        const response = await api.weddings.create({ title, slug, published: false, config });
        notify('¡Boda creada! Ya podés cargar la invitación.', 'ok');
        setDialogOpen(false);
        setForm(EMPTY_FORM);
        navigate(`/admin/weddings/${response.wedding.id}`);
      } catch (error) {
        setFormError(
          error instanceof ApiError ? error.message : 'No pudimos crear la boda. Probá otra vez.',
        );
      } finally {
        setCreating(false);
      }
    },
    [creating, form, display, notify, navigate],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mis bodas</h1>
          <p>Cada boda tiene su invitación, su lista de invitados y sus envíos.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setDialogOpen(true)}>
          + Nueva boda
        </button>
      </div>

      {state.loading ? <LoadingBlock label="Cargando tus bodas…" /> : null}
      {state.error ? <ErrorBlock message={state.error} onRetry={state.reload} /> : null}

      {!state.loading && !state.error ? (
        weddings.length === 0 ? (
          <EmptyState title="Todavía no tenés bodas">
            <p className="muted small">
              Creá la primera boda, cargá los invitados desde tu Excel y enviá las invitaciones por
              WhatsApp.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              style={{ marginTop: 14 }}
              onClick={() => setDialogOpen(true)}
            >
              + Nueva boda
            </button>
          </EmptyState>
        ) : (
          <div className="wedding-grid">
            {weddings.map((wedding) => {
              const event = mainEvent(wedding.config);
              const stats = wedding.stats;
              return (
                <article className="wedding-card" key={wedding.id}>
                  <div className="row-between">
                    <span className={`badge ${wedding.published ? 'badge--ok' : 'badge--muted'}`}>
                      {wedding.published ? 'Publicada' : 'Borrador'}
                    </span>
                    <span className="muted tiny mono">/i/{wedding.slug}</span>
                  </div>

                  <div>
                    <h2 className="wedding-card__names">
                      {wedding.config.couple.display || wedding.title}
                    </h2>
                    <div className="wedding-card__meta">
                      <span>
                        {event
                          ? `${capitalize(formatDateLong(event.startAt))} · ${formatTime(event.startAt)}`
                          : 'Sin fecha cargada'}
                      </span>
                      {event?.venueName ? <span>{event.venueName}</span> : null}
                    </div>
                  </div>

                  <div className="wedding-card__counters">
                    <div>
                      <div className="counter__value">{stats.totalPasses ?? stats.guestCount ?? 0}</div>
                      <div className="counter__label">Pases</div>
                    </div>
                    <div>
                      <div className="counter__value" style={{ color: 'var(--ok-600)' }}>
                        {stats.confirmed ?? 0}
                      </div>
                      <div className="counter__label">Conf.</div>
                    </div>
                    <div>
                      <div className="counter__value" style={{ color: 'var(--warn-600)' }}>
                        {stats.pending ?? 0}
                      </div>
                      <div className="counter__label">Pend.</div>
                    </div>
                    <div>
                      <div className="counter__value" style={{ color: 'var(--err-600)' }}>
                        {stats.declined ?? 0}
                      </div>
                      <div className="counter__label">No van</div>
                    </div>
                  </div>

                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <Link className="btn btn--sm btn--primary" to={`/admin/weddings/${wedding.id}`}>
                      Editar
                    </Link>
                    <Link
                      className="btn btn--sm"
                      to={`/admin/weddings/${wedding.id}/guests`}
                    >
                      Invitados
                    </Link>
                    <Link className="btn btn--sm" to={`/admin/weddings/${wedding.id}/campaigns`}>
                      Enviar
                    </Link>
                    <a
                      className="btn btn--sm btn--ghost"
                      href={`/i/${wedding.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver ↗
                    </a>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => {
                        void copyToClipboard(`${window.location.origin}/i/${wedding.slug}`).then(
                          (ok) => notify(ok ? 'Enlace copiado' : 'No pudimos copiar el enlace', ok ? 'ok' : 'err'),
                        );
                      }}
                    >
                      Copiar enlace
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : null}

      {dialogOpen ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !creating) setDialogOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Nueva boda">
            <form onSubmit={(event) => void submit(event)}>
              <div className="dialog__head">
                <span className="dialog__title">Nueva boda</span>
                <button
                  type="button"
                  className="dialog__close"
                  onClick={() => setDialogOpen(false)}
                  disabled={creating}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>

              <div className="dialog__body">
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="bride">Nombre de la novia</label>
                    <input
                      id="bride"
                      className="input"
                      value={form.bride}
                      onChange={(event) => {
                        const bride = event.target.value;
                        patch({
                          bride,
                          ...(form.slugTouched
                            ? {}
                            : { slug: slugify(`${bride}${form.groom}`) }),
                        });
                      }}
                      placeholder="Vanessa"
                      autoFocus
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="groom">Nombre del novio</label>
                    <input
                      id="groom"
                      className="input"
                      value={form.groom}
                      onChange={(event) => {
                        const groom = event.target.value;
                        patch({
                          groom,
                          ...(form.slugTouched ? {} : { slug: slugify(`${form.bride}${groom}`) }),
                        });
                      }}
                      placeholder="Héctor"
                      required
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="slug">Dirección de la invitación</label>
                  <div className="row">
                    <span className="muted small nowrap">/i/</span>
                    <input
                      id="slug"
                      className="input"
                      value={form.slug}
                      onChange={(event) =>
                        patch({ slug: slugify(event.target.value), slugTouched: true })
                      }
                      placeholder="vanessayhector"
                      pattern="[a-z0-9-]+"
                      required
                    />
                  </div>
                  <span className="hint">
                    Es el enlace que vas a compartir por WhatsApp. Solo minúsculas, números y
                    guiones.
                  </span>
                </div>

                <div className="grid-3">
                  <div className="field">
                    <label htmlFor="date">Fecha del evento</label>
                    <input
                      id="date"
                      className="input"
                      type="date"
                      value={form.date}
                      onChange={(event) => patch({ date: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="time">Hora</label>
                    <input
                      id="time"
                      className="input"
                      type="time"
                      value={form.time}
                      onChange={(event) => patch({ time: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="city">Ciudad</label>
                    <input
                      id="city"
                      className="input"
                      value={form.city}
                      onChange={(event) => patch({ city: event.target.value })}
                      placeholder="Asunción"
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="venue">Lugar (se puede ajustar después)</label>
                  <input
                    id="venue"
                    className="input"
                    value={form.venueName}
                    onChange={(event) => patch({ venueName: event.target.value })}
                    placeholder="Casa Ardissone"
                  />
                </div>

                {formError ? (
                  <div className="alert alert--err" role="alert">
                    {formError}
                  </div>
                ) : null}
              </div>

              <div className="dialog__foot">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setDialogOpen(false)}
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary" disabled={creating}>
                  {creating ? 'Creando…' : 'Crear boda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default WeddingsPage;
