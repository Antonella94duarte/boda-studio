/**
 * ---------------------------------------------------------------------------
 * Editor de una boda: la config completa en un formulario por paneles.
 * ---------------------------------------------------------------------------
 * Todo lo que se edita acá es exactamente lo que se guarda en `Wedding.config`,
 * así que el esquema de @boda/shared es la referencia: si un campo existe en el
 * esquema, existe en este formulario.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  EVENT_KINDS,
  SECTION_IDS,
  WeddingConfigSchema,
  resolveSections,
  type EventKind,
  type GiftAccount,
  type Section,
  type SectionId,
  type Theme,
  type WeddingConfig,
  type WeddingEvent,
} from '@boda/shared';
import { ApiError, api, copyToClipboard } from '../lib/api';
import { DEFAULT_OFFSET, joinDateTime, offsetOf, splitDateTime } from '../lib/datetime';
import {
  FONT_BODY_OPTIONS,
  FONT_HEADING_OPTIONS,
  SECTION_LABELS,
  THEME_PRESET_OPTIONS,
  themeFromPreset,
  type ThemePresetName,
} from '../lib/theme';
import { useWedding } from '../lib/useWedding';
import { EVENT_KIND_LABELS } from '../lib/labels';
import { ImageUploader } from './ImageUploader';
import { Collapsible, ErrorBlock, LoadingBlock, useToast } from './ui';

/* --- Ayudas --------------------------------------------------------------- */

function localId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneConfig(config: WeddingConfig): WeddingConfig {
  if (typeof structuredClone === 'function') return structuredClone(config);
  return JSON.parse(JSON.stringify(config)) as WeddingConfig;
}

/** Texto multilínea <-> array de URLs (fotos de historia y galería). */
function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function sameConfig(a: WeddingConfig, b: WeddingConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Une los valores por defecto con lo que la boda tenga declarado y ordena. */
function normalizeSections(sections: Section[]): Section[] {
  return resolveSections({ sections }).map((section, index) => ({
    ...section,
    order: index,
    enabled: section.enabled,
  }));
}

const LABEL_CLASS = 'label';

export function WeddingEditorPage(): JSX.Element {
  const { wedding, config, loading, error, reload, weddingId } = useWedding();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [draft, setDraft] = useState<WeddingConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Al cargar (o recargar) la boda se arma el borrador editable. */
  useEffect(() => {
    if (config) setDraft(cloneConfig(config));
  }, [config]);

  const dirty = useMemo(
    () => Boolean(config && draft && !sameConfig(config, draft)),
    [config, draft],
  );

  const patch = useCallback((changes: Partial<WeddingConfig>): void => {
    setDraft((current) => (current ? { ...current, ...changes } : current));
  }, []);

  const save = useCallback(
    async (overrides: Partial<WeddingConfig> = {}, quiet = false): Promise<void> => {
      if (!draft || !wedding) return;
      const next: WeddingConfig = { ...draft, ...overrides };

      // Se valida antes de enviar: mejor un error claro acá que un 400 del server.
      const parsed = WeddingConfigSchema.safeParse(next);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        setSaveError(
          issue
            ? `Revisá "${issue.path.join('.') || 'la configuración'}": ${issue.message}`
            : 'La configuración tiene un dato inválido.',
        );
        return;
      }

      setSaving(true);
      setSaveError(null);
      try {
        const response = await api.weddings.update(wedding.id, {
          title: parsed.data.couple.display || wedding.title,
          slug: parsed.data.slug,
          published: parsed.data.published,
          config: parsed.data,
        });
        const saved = WeddingConfigSchema.safeParse(response.wedding.config);
        setDraft(saved.success ? cloneConfig(saved.data) : next);
        reload();
        if (!quiet) notify('Cambios guardados.', 'ok');
      } catch (err) {
        setSaveError(
          err instanceof ApiError ? err.message : 'No pudimos guardar los cambios. Probá otra vez.',
        );
      } finally {
        setSaving(false);
      }
    },
    [draft, wedding, reload, notify],
  );

  /* Aviso al cerrar la pestaña si quedaron cambios sin guardar. */
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  if (loading && !draft) return <LoadingBlock label="Cargando la boda…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!draft || !wedding) {
    return (
      <div className="empty">
        <div className="empty__title">No encontramos esta boda</div>
        <Link className="btn btn--primary" to="/admin/weddings" style={{ marginTop: 12 }}>
          Volver a mis bodas
        </Link>
      </div>
    );
  }

  const sections = normalizeSections(draft.sections);

  /* --- Mutadores de listas repetibles ---------------------------------- */
  // Todas reciben `draft` ya estrechado por los `return` de arriba. El chequeo
  // extra es una red de seguridad barata, no un `!` que oculte un bug.
  function updateEvent(index: number, changes: Partial<WeddingEvent>): void {
    if (!draft) return;
    patch({
      events: draft.events.map((event, i) => (i === index ? { ...event, ...changes } : event)),
    });
  }

  function setMainEvent(index: number): void {
    if (!draft) return;
    patch({ events: draft.events.map((event, i) => ({ ...event, isMain: i === index })) });
  }

  function addEvent(): void {
    if (!draft) return;
    const startAt = joinDateTime(new Date().toISOString().slice(0, 10), '19:00');
    patch({
      events: [
        ...draft.events,
        {
          id: localId(),
          kind: 'religious',
          title: 'Nuestra boda',
          startAt: startAt ?? '',
          venueName: '',
          isMain: draft.events.length === 0,
        },
      ],
    });
  }

  function removeEvent(index: number): void {
    if (!draft) return;
    const events = draft.events.filter((_, i) => i !== index);
    const first = events[0];
    if (first && !events.some((event) => event.isMain)) {
      events[0] = { ...first, isMain: true };
    }
    patch({ events });
  }

  function updateAccount(index: number, changes: Partial<GiftAccount>): void {
    if (!draft) return;
    patch({
      gifts: {
        ...draft.gifts,
        accounts: draft.gifts.accounts.map((account, i) =>
          i === index ? { ...account, ...changes } : account,
        ),
      },
    });
  }

  function moveSection(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    const item = next[index];
    const other = next[target];
    if (!item || !other) return;
    next[index] = other;
    next[target] = item;
    patch({ sections: next.map((section, i) => ({ ...section, order: i })) });
  }

  function toggleSection(id: SectionId, enabled: boolean): void {
    patch({
      sections: sections.map((section) => (section.id === id ? { ...section, enabled } : section)),
    });
  }

  function applyPreset(preset: ThemePresetName): void {
    const base: Theme = themeFromPreset(preset);
    patch({ theme: { ...base, preset } });
  }

  const invitationHref = `/i/${draft.slug}`;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to="/admin/weddings">← Mis bodas</Link>
          </p>
          <h1>{draft.couple.display || wedding.title}</h1>
          <p>
            <span className="mono">/i/{draft.slug}</span> ·{' '}
            {draft.published ? (
              <span className="badge badge--ok">Publicada</span>
            ) : (
              <span className="badge badge--muted">Borrador</span>
            )}
          </p>
        </div>

        <div className="row" style={{ flexWrap: 'wrap' }}>
          <a className="btn" href={invitationHref} target="_blank" rel="noopener noreferrer">
            Ver invitación ↗
          </a>
          <Link className="btn" to={`/admin/weddings/${weddingId}/guests`}>
            Invitados
          </Link>
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardado'}
          </button>
        </div>
      </div>

      {saveError ? <ErrorBlock message={saveError} /> : null}

      {/* --- Pareja y dirección ------------------------------------------- */}
      <Collapsible title="Pareja y dirección" defaultOpen>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="bride">Novia</label>
            <input
              id="bride"
              className="input"
              value={draft.couple.bride}
              onChange={(event) =>
                patch({ couple: { ...draft.couple, bride: event.target.value } })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="groom">Novio</label>
            <input
              id="groom"
              className="input"
              value={draft.couple.groom}
              onChange={(event) =>
                patch({ couple: { ...draft.couple, groom: event.target.value } })
              }
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="display">Cómo se muestran juntos</label>
          <input
            id="display"
            className="input"
            value={draft.couple.display}
            onChange={(event) =>
              patch({ couple: { ...draft.couple, display: event.target.value } })
            }
            placeholder="Vanessa y Héctor"
          />
          <span className="hint">
            Aparece en la portada, en la despedida y en las variables de la plantilla de WhatsApp.
          </span>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="slug2">Dirección web (slug)</label>
            <input
              id="slug2"
              className="input"
              value={draft.slug}
              onChange={(event) =>
                patch({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
              }
            />
            <span className="hint">Si la cambiás, los enlaces ya enviados dejan de funcionar.</span>
          </div>
          <div className="field">
            <label htmlFor="metaTitle">Título de la pestaña</label>
            <input
              id="metaTitle"
              className="input"
              value={draft.metaTitle}
              onChange={(event) => patch({ metaTitle: event.target.value })}
            />
          </div>
        </div>
      </Collapsible>

      {/* --- Portada ------------------------------------------------------- */}
      <Collapsible title="Portada">
        <div className="field">
          <span className="acc__sub">Foto de portada</span>
          <ImageUploader
            weddingId={wedding.id}
            single
            showLibrary={false}
            value={draft.heroImage ? [draft.heroImage] : []}
            onChange={(urls) => patch({ heroImage: urls[0] })}
            buttonLabel="Subir la foto de portada"
            hint="Una sola foto, ideal vertical (por ejemplo 1200×1800 px). Es lo primero que ve el invitado: elegí una donde se vean bien los dos."
          />
          <details className="image-advanced">
            <summary>Usar una dirección web en vez de subir la foto</summary>
            <input
              id="heroImage"
              className="input"
              value={draft.heroImage ?? ''}
              onChange={(event) => patch({ heroImage: event.target.value || undefined })}
              placeholder="https://…/foto-portada.jpg"
            />
          </details>
        </div>

        <div className="field">
          <label htmlFor="tagline">Frase de la portada</label>
          <input
            id="tagline"
            className="input"
            value={draft.heroTagline}
            onChange={(event) => patch({ heroTagline: event.target.value })}
            placeholder="¡Nos casamos!"
          />
        </div>
      </Collapsible>

      {/* --- Versículo ----------------------------------------------------- */}
      <Collapsible title="Versículo o frase">
        <div className="field">
          <label htmlFor="quoteText">Texto</label>
          <textarea
            id="quoteText"
            className="textarea"
            value={draft.quote.text}
            onChange={(event) => patch({ quote: { ...draft.quote, text: event.target.value } })}
            placeholder="Sobre todo, vístanse de amor, que es el vínculo perfecto."
          />
        </div>
        <div className="field">
          <label htmlFor="quoteSource">Fuente</label>
          <input
            id="quoteSource"
            className="input"
            value={draft.quote.source ?? ''}
            onChange={(event) =>
              patch({ quote: { ...draft.quote, source: event.target.value || undefined } })
            }
            placeholder="Colosenses 3:14"
          />
        </div>
      </Collapsible>

      {/* --- Historia ------------------------------------------------------ */}
      <Collapsible title="Nuestra historia">
        <div className="col">
          <span className="acc__sub">Párrafos</span>
          {draft.story.paragraphs.length === 0 ? (
            <p className="muted small">Todavía no cargaste ningún párrafo.</p>
          ) : null}
          {draft.story.paragraphs.map((paragraph, index) => (
            <div className="row" key={index} style={{ alignItems: 'flex-start' }}>
              <textarea
                className="textarea"
                style={{ minHeight: 80 }}
                value={paragraph}
                onChange={(event) =>
                  patch({
                    story: {
                      ...draft.story,
                      paragraphs: draft.story.paragraphs.map((item, i) =>
                        i === index ? event.target.value : item,
                      ),
                    },
                  })
                }
                placeholder="Contanos cómo se conocieron…"
              />
              <button
                type="button"
                className="btn btn--sm btn--outline-danger"
                onClick={() =>
                  patch({
                    story: {
                      ...draft.story,
                      paragraphs: draft.story.paragraphs.filter((_, i) => i !== index),
                    },
                  })
                }
                aria-label={`Borrar el párrafo ${index + 1}`}
              >
                Borrar
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              patch({ story: { ...draft.story, paragraphs: [...draft.story.paragraphs, ''] } })
            }
          >
            + Agregar párrafo
          </button>
        </div>

        <div className="field">
          <span className="acc__sub">Fotos de la historia</span>
          <ImageUploader
            weddingId={wedding.id}
            value={draft.story.photos}
            onChange={(urls) => patch({ story: { ...draft.story, photos: urls } })}
            max={12}
            buttonLabel="Subir fotos de la historia"
            hint="Opcional: las fotos que acompañan el relato de cómo se conocieron. JPG, PNG o WebP de hasta 8 MB."
          />
          <details className="image-advanced">
            <summary>Usar direcciones web en vez de subirlas</summary>
            <textarea
              id="storyPhotos"
              className="textarea"
              value={draft.story.photos.join('\n')}
              onChange={(event) =>
                patch({ story: { ...draft.story, photos: linesToArray(event.target.value) } })
              }
              placeholder={'https://…/primera-foto.jpg\nhttps://…/segunda-foto.jpg'}
            />
          </details>
        </div>
      </Collapsible>

      {/* --- Galería ------------------------------------------------------- */}
      <Collapsible title="Galería" hint={`${draft.gallery.length} foto(s)`}>
        <div className="field">
          <span className="acc__sub">Fotos de la galería</span>
          <ImageUploader
            weddingId={wedding.id}
            value={draft.gallery}
            onChange={(urls) => patch({ gallery: urls })}
            max={40}
            buttonLabel="Subir fotos de la galería"
            hint="Se muestran en dos columnas en el teléfono y se amplían al tocarlas. Cuatro a ocho fotos es un buen número."
          />
          <details className="image-advanced">
            <summary>Usar direcciones web en vez de subirlas</summary>
            <textarea
              id="gallery"
              className="textarea"
              value={draft.gallery.join('\n')}
              onChange={(event) => patch({ gallery: linesToArray(event.target.value) })}
              placeholder={'https://…/foto-1.jpg\nhttps://…/foto-2.jpg'}
            />
          </details>
        </div>
      </Collapsible>

      {/* --- Eventos ------------------------------------------------------- */}
      <Collapsible title="Ceremonias y fiesta" hint={`${draft.events.length} evento(s)`}>
        {draft.events.map((event, index) => {
          const parts = splitDateTime(event.startAt);
          return (
            <div className="repeat" key={event.id || index}>
              <div className="repeat__head">
                <span>Evento {index + 1}</span>
                <div className="row">
                  <label className="switch" title="Es el evento de la cuenta regresiva">
                    <input
                      type="radio"
                      name="mainEvent"
                      checked={event.isMain}
                      onChange={() => setMainEvent(index)}
                    />
                    Principal
                  </label>
                  <button
                    type="button"
                    className="btn btn--sm btn--outline-danger"
                    onClick={() => removeEvent(index)}
                  >
                    Quitar
                  </button>
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label className={LABEL_CLASS}>Tipo</label>
                  <select
                    className="select"
                    value={event.kind}
                    onChange={(e) =>
                      updateEvent(index, { kind: e.target.value as EventKind })
                    }
                  >
                    {EVENT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {EVENT_KIND_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className={LABEL_CLASS}>Título</label>
                  <input
                    className="input"
                    value={event.title}
                    onChange={(e) => updateEvent(index, { title: e.target.value })}
                    placeholder="Ceremonia religiosa"
                  />
                </div>
              </div>

              <div className="grid-3">
                <div className="field">
                  <label className={LABEL_CLASS}>Fecha</label>
                  <input
                    className="input"
                    type="date"
                    value={parts.date}
                    onChange={(e) =>
                      updateEvent(index, {
                        startAt:
                          joinDateTime(e.target.value, parts.time, offsetOf(event.startAt)) ?? '',
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label className={LABEL_CLASS}>Hora</label>
                  <input
                    className="input"
                    type="time"
                    value={parts.time}
                    onChange={(e) =>
                      updateEvent(index, {
                        startAt: joinDateTime(parts.date, e.target.value, offsetOf(event.startAt)) ?? '',
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label className={LABEL_CLASS}>Hora de fin (opcional)</label>
                  <input
                    className="input"
                    type="time"
                    value={splitDateTime(event.endAt).time}
                    onChange={(e) => {
                      const date = splitDateTime(event.endAt).date || parts.date;
                      updateEvent(index, {
                        endAt: e.target.value ? joinDateTime(date, e.target.value) : undefined,
                      });
                    }}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label className={LABEL_CLASS}>Lugar</label>
                  <input
                    className="input"
                    value={event.venueName}
                    onChange={(e) => updateEvent(index, { venueName: e.target.value })}
                    placeholder="Iglesia Santísima Trinidad"
                  />
                </div>
                <div className="field">
                  <label className={LABEL_CLASS}>Dirección</label>
                  <input
                    className="input"
                    value={event.address ?? ''}
                    onChange={(e) => updateEvent(index, { address: e.target.value || undefined })}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label className={LABEL_CLASS}>Ciudad</label>
                  <input
                    className="input"
                    value={event.city ?? ''}
                    onChange={(e) => updateEvent(index, { city: e.target.value || undefined })}
                  />
                </div>
                <div className="field">
                  <label className={LABEL_CLASS}>Link de mapa (Cómo llegar)</label>
                  <input
                    className="input"
                    value={event.mapUrl ?? ''}
                    onChange={(e) => updateEvent(index, { mapUrl: e.target.value || undefined })}
                    placeholder="https://maps.google.com/…"
                  />
                </div>
              </div>

              <div className="field">
                <label className={LABEL_CLASS}>Nota para los invitados</label>
                <input
                  className="input"
                  value={event.notes ?? ''}
                  onChange={(e) => updateEvent(index, { notes: e.target.value || undefined })}
                  placeholder="Estacionamiento disponible sobre la calle lateral"
                />
              </div>
            </div>
          );
        })}

        <button type="button" className="btn btn--sm" onClick={addEvent}>
          + Agregar evento
        </button>
      </Collapsible>

      {/* --- Dress code ---------------------------------------------------- */}
      <Collapsible title="Código de vestimenta">
        <div className="field">
          <label className={LABEL_CLASS}>Título</label>
          <input
            className="input"
            value={draft.dressCode.title}
            onChange={(e) => patch({ dressCode: { ...draft.dressCode, title: e.target.value } })}
          />
        </div>
        <div className="field">
          <label className={LABEL_CLASS}>Texto</label>
          <textarea
            className="textarea"
            value={draft.dressCode.text}
            onChange={(e) => patch({ dressCode: { ...draft.dressCode, text: e.target.value } })}
            placeholder="Formal. Evitá el blanco total y los tonos rojos."
          />
        </div>
        <div className="field">
          <label className={LABEL_CLASS}>Paleta sugerida</label>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {draft.dressCode.palette.map((color, index) => (
              <span className="row" key={`${color}-${index}`}>
                <input
                  className="input"
                  type="color"
                  style={{ width: 56 }}
                  value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#cccccc'}
                  onChange={(e) =>
                    patch({
                      dressCode: {
                        ...draft.dressCode,
                        palette: draft.dressCode.palette.map((item, i) =>
                          i === index ? e.target.value : item,
                        ),
                      },
                    })
                  }
                  aria-label={`Color ${index + 1}`}
                />
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() =>
                    patch({
                      dressCode: {
                        ...draft.dressCode,
                        palette: draft.dressCode.palette.filter((_, i) => i !== index),
                      },
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              className="btn btn--sm"
              onClick={() =>
                patch({
                  dressCode: { ...draft.dressCode, palette: [...draft.dressCode.palette, '#d9c7b8'] },
                })
              }
            >
              + Color
            </button>
          </div>
        </div>
      </Collapsible>

      {/* --- Regalos ------------------------------------------------------- */}
      <Collapsible title="Regalos">
        <label className="switch">
          <input
            type="checkbox"
            checked={draft.gifts.presenceOnly}
            onChange={(e) => patch({ gifts: { ...draft.gifts, presenceOnly: e.target.checked } })}
          />
          Mostrar solo &quot;el mejor regalo es tu presencia&quot;
        </label>

        <div className="field">
          <label className={LABEL_CLASS}>Mensaje</label>
          <textarea
            className="textarea"
            value={draft.gifts.message}
            onChange={(e) => patch({ gifts: { ...draft.gifts, message: e.target.value } })}
            placeholder="Tu presencia es lo más importante. Si querés hacernos un regalo, te dejamos nuestros datos:"
          />
        </div>

        {draft.gifts.accounts.map((account, index) => (
          <div className="repeat" key={index}>
            <div className="repeat__head">
              <span>Cuenta {index + 1}</span>
              <button
                type="button"
                className="btn btn--sm btn--outline-danger"
                onClick={() =>
                  patch({
                    gifts: {
                      ...draft.gifts,
                      accounts: draft.gifts.accounts.filter((_, i) => i !== index),
                    },
                  })
                }
              >
                Quitar
              </button>
            </div>
            <div className="grid-2">
              <div className="field">
                <label className={LABEL_CLASS}>Etiqueta</label>
                <input
                  className="input"
                  value={account.label}
                  onChange={(e) => updateAccount(index, { label: e.target.value })}
                  placeholder="Cuenta bancaria"
                />
              </div>
              <div className="field">
                <label className={LABEL_CLASS}>Titular</label>
                <input
                  className="input"
                  value={account.holder ?? ''}
                  onChange={(e) => updateAccount(index, { holder: e.target.value || undefined })}
                />
              </div>
            </div>
            <div className="grid-3">
              <div className="field">
                <label className={LABEL_CLASS}>Banco</label>
                <input
                  className="input"
                  value={account.bank ?? ''}
                  onChange={(e) => updateAccount(index, { bank: e.target.value || undefined })}
                />
              </div>
              <div className="field">
                <label className={LABEL_CLASS}>Número de cuenta</label>
                <input
                  className="input"
                  value={account.number ?? ''}
                  onChange={(e) => updateAccount(index, { number: e.target.value || undefined })}
                />
              </div>
              <div className="field">
                <label className={LABEL_CLASS}>Alias</label>
                <input
                  className="input"
                  value={account.alias ?? ''}
                  onChange={(e) => updateAccount(index, { alias: e.target.value || undefined })}
                />
              </div>
            </div>
            <div className="field" style={{ maxWidth: 160 }}>
              <label className={LABEL_CLASS}>Moneda</label>
              <input
                className="input"
                value={account.currency ?? ''}
                onChange={(e) => updateAccount(index, { currency: e.target.value || undefined })}
                placeholder="PYG"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          className="btn btn--sm"
          onClick={() =>
            patch({
              gifts: {
                ...draft.gifts,
                accounts: [...draft.gifts.accounts, { label: 'Cuenta bancaria' }],
              },
            })
          }
        >
          + Agregar cuenta
        </button>

        <div className="field">
          <label className={LABEL_CLASS}>Link a la lista de regalos (opcional)</label>
          <input
            className="input"
            value={draft.gifts.registryUrl ?? ''}
            onChange={(e) =>
              patch({ gifts: { ...draft.gifts, registryUrl: e.target.value || undefined } })
            }
            placeholder="https://…"
          />
        </div>
      </Collapsible>

      {/* --- RSVP ---------------------------------------------------------- */}
      <Collapsible title="Confirmación (RSVP)">
        <div className="grid-2">
          <div className="field">
            <label className={LABEL_CLASS}>Fecha límite</label>
            <input
              className="input"
              type="date"
              value={draft.rsvp.deadline ?? ''}
              onChange={(e) => patch({ rsvp: { ...draft.rsvp, deadline: e.target.value || undefined } })}
            />
          </div>
          <div className="field">
            <label className={LABEL_CLASS}>Teléfono de contacto</label>
            <input
              className="input"
              value={draft.rsvp.contactPhone ?? ''}
              onChange={(e) =>
                patch({ rsvp: { ...draft.rsvp, contactPhone: e.target.value || undefined } })
              }
              placeholder="+595976178000"
            />
            <span className="hint">Formato internacional. Es el número del botón de WhatsApp.</span>
          </div>
        </div>

        <div className="field" style={{ maxWidth: 200 }}>
          <label className={LABEL_CLASS}>Pases por defecto</label>
          <input
            className="input"
            type="number"
            min={1}
            max={20}
            value={draft.rsvp.defaultPasses}
            onChange={(e) =>
              patch({
                rsvp: {
                  ...draft.rsvp,
                  defaultPasses: Math.min(20, Math.max(1, Number(e.target.value) || 1)),
                },
              })
            }
          />
          <span className="hint">Se usa al crear invitados nuevos desde el panel o la importación.</span>
        </div>

        <label className="switch">
          <input
            type="checkbox"
            checked={draft.rsvp.allowOnlineConfirm}
            onChange={(e) =>
              patch({ rsvp: { ...draft.rsvp, allowOnlineConfirm: e.target.checked } })
            }
          />
          Permitir confirmar desde la invitación
        </label>

        <label className="switch">
          <input
            type="checkbox"
            checked={draft.rsvp.askCompanionNames}
            onChange={(e) => patch({ rsvp: { ...draft.rsvp, askCompanionNames: e.target.checked } })}
          />
          Pedir los nombres de los acompañantes
        </label>

        <label className="switch">
          <input
            type="checkbox"
            checked={draft.rsvp.askDietary}
            onChange={(e) => patch({ rsvp: { ...draft.rsvp, askDietary: e.target.checked } })}
          />
          Preguntar por restricciones alimentarias
        </label>

        <div className="field">
          <label className={LABEL_CLASS}>Mensaje de agradecimiento</label>
          <textarea
            className="textarea"
            style={{ minHeight: 80 }}
            value={draft.rsvp.thanksMessage}
            onChange={(e) => patch({ rsvp: { ...draft.rsvp, thanksMessage: e.target.value } })}
          />
        </div>
      </Collapsible>

      {/* --- Música -------------------------------------------------------- */}
      <Collapsible title="Música">
        <div className="field">
          <label className={LABEL_CLASS}>Archivo de audio (URL, .mp3)</label>
          <input
            className="input"
            value={draft.music.url ?? ''}
            onChange={(e) =>
              patch({ music: { ...draft.music, url: e.target.value || undefined } })
            }
            placeholder="https://…/nuestra-cancion.mp3"
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label className={LABEL_CLASS}>Título</label>
            <input
              className="input"
              value={draft.music.title ?? ''}
              onChange={(e) =>
                patch({ music: { ...draft.music, title: e.target.value || undefined } })
              }
            />
          </div>
          <div className="field">
            <label className={LABEL_CLASS}>Artista</label>
            <input
              className="input"
              value={draft.music.artist ?? ''}
              onChange={(e) =>
                patch({ music: { ...draft.music, artist: e.target.value || undefined } })
              }
            />
          </div>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={draft.music.autoplay}
            onChange={(e) => patch({ music: { ...draft.music, autoplay: e.target.checked } })}
          />
          Intentar reproducir al abrir (los celulares igual piden un toque)
        </label>
      </Collapsible>

      {/* --- Secciones ----------------------------------------------------- */}
      <Collapsible title="Secciones de la invitación" hint="activar y ordenar">
        {sections.map((section, index) => (
          <div className="section-row" key={section.id}>
            <label className="switch grow">
              <input
                type="checkbox"
                checked={section.enabled}
                onChange={(e) => toggleSection(section.id, e.target.checked)}
              />
              <span className="section-row__name">{SECTION_LABELS[section.id] ?? section.id}</span>
            </label>
            <span className="section-row__order">
              <button
                type="button"
                className="btn btn--icon"
                onClick={() => moveSection(index, -1)}
                disabled={index === 0}
                aria-label="Subir"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn--icon"
                onClick={() => moveSection(index, 1)}
                disabled={index === sections.length - 1}
                aria-label="Bajar"
              >
                ↓
              </button>
            </span>
          </div>
        ))}
        <p className="muted tiny">
          Se guardan {SECTION_IDS.length} secciones posibles. Las desactivadas no aparecen en la
          invitación.
        </p>
      </Collapsible>

      {/* --- Tema ---------------------------------------------------------- */}
      <Collapsible title="Tema y colores">
        <div className="grid-2">
          {THEME_PRESET_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`card card--flat${
                draft.theme.preset === option.value ? ' is-selected' : ''
              }`}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                borderColor:
                  draft.theme.preset === option.value ? 'var(--brand-500)' : 'var(--line)',
                boxShadow:
                  draft.theme.preset === option.value ? '0 0 0 2px var(--gold-500) inset' : 'none',
              }}
              onClick={() => applyPreset(option.value)}
            >
              <div className="row" style={{ gap: 6 }}>
                {[
                  themeFromPreset(option.value).primary,
                  themeFromPreset(option.value).accent,
                  themeFromPreset(option.value).background,
                ].map((color) => (
                  <span
                    key={color}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: color,
                      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)',
                    }}
                  />
                ))}
              </div>
              <div className="card__title" style={{ marginTop: 8 }}>
                {option.label}
              </div>
              <div className="muted small">{option.description}</div>
            </button>
          ))}
        </div>

        <div className="grid-3">
          {(
            [
              ['primary', 'Color principal'],
              ['accent', 'Color de acento'],
              ['background', 'Fondo'],
              ['surface', 'Tarjetas'],
              ['text', 'Texto'],
              ['muted', 'Texto suave'],
            ] as ReadonlyArray<[keyof Theme, string]>
          ).map(([key, label]) => (
            <div className="field" key={String(key)}>
              <label className={LABEL_CLASS}>{label}</label>
              <input
                className="input"
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(String(draft.theme[key])) ? String(draft.theme[key]) : '#ffffff'}
                onChange={(e) => patch({ theme: { ...draft.theme, [key]: e.target.value } })}
              />
            </div>
          ))}
        </div>

        <div className="grid-2">
          <div className="field">
            <label className={LABEL_CLASS}>Tipografía de títulos</label>
            <select
              className="select"
              value={draft.theme.fontHeading}
              onChange={(e) => patch({ theme: { ...draft.theme, fontHeading: e.target.value } })}
            >
              {FONT_HEADING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className={LABEL_CLASS}>Tipografía de texto</label>
            <select
              className="select"
              value={draft.theme.fontBody}
              onChange={(e) => patch({ theme: { ...draft.theme, fontBody: e.target.value } })}
            >
              {FONT_BODY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Collapsible>

      {/* --- Publicar ------------------------------------------------------ */}
      <Collapsible title="Publicar">
        <label className="switch">
          <input
            type="checkbox"
            checked={draft.published}
            onChange={(e) => patch({ published: e.target.checked })}
          />
          Invitación publicada (accesible con el enlace)
        </label>

        <div className="field">
          <label className={LABEL_CLASS}>Mensaje de despedida</label>
          <textarea
            className="textarea"
            style={{ minHeight: 80 }}
            value={draft.closing}
            onChange={(e) => patch({ closing: e.target.value })}
          />
        </div>

        <div className="alert alert--info">
          <div>
            <div className="alert__title">Enlace de la invitación</div>
            <div className="mono tiny" style={{ overflowWrap: 'anywhere' }}>
              {window.location.origin}
              {invitationHref}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  void copyToClipboard(`${window.location.origin}${invitationHref}`).then((ok) =>
                    notify(ok ? 'Enlace copiado' : 'No pudimos copiar el enlace', ok ? 'ok' : 'err'),
                  );
                }}
              >
                Copiar
              </button>
              <a
                className="btn btn--sm btn--primary"
                href={invitationHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver invitación ↗
              </a>
            </div>
          </div>
        </div>

        <div className="row">
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving}
            onClick={() => void save({ published: true })}
          >
            {saving ? 'Guardando…' : 'Guardar y publicar'}
          </button>
          {draft.published ? (
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => void save({ published: false })}
            >
              Despublicar
            </button>
          ) : null}
        </div>
      </Collapsible>

      {/* Barra de guardado sticky: siempre a mano en formularios largos. */}
      <div className="row-between card" style={{ position: 'sticky', bottom: 12, zIndex: 10 }}>
        <span className="muted small">
          {dirty ? 'Tenés cambios sin guardar.' : 'Todo guardado.'}
          {draft.events.some((event) => !event.startAt) ? ' Hay eventos sin fecha.' : ''}
        </span>
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving || !dirty}
          onClick={() => void save()}
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </>
  );
}

export default WeddingEditorPage;
