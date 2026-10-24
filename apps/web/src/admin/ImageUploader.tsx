/**
 * ---------------------------------------------------------------------------
 * Subida de fotos de la invitación (portada, galería, historia).
 * ---------------------------------------------------------------------------
 * Se ocupa de las tres cosas que la organizadora necesita:
 *
 *  1. Subir fotos arrastrándolas o eligiéndolas del teléfono/escritorio.
 *  2. Elegir cuáles van en la invitación (la lista que devuelve `onChange`).
 *  3. Reutilizar una foto ya subida sin volver a subirla.
 *
 * La validación "de verdad" (formato real del archivo, peso, tope por boda) la
 * hace la API; acá se avisa antes para no esperar una subida que va a fallar.
 */

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { ApiError, api } from '../lib/api';
import type { StoredImage } from '../lib/types';

/** Debe coincidir con `MAX_IMAGE_BYTES` del API (8 MB). */
const MAX_BYTES = 8 * 1024 * 1024;
/** Debe coincidir con `MAX_FILES_PER_REQUEST` de `routes/uploads.ts`. */
const MAX_PER_REQUEST = 10;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPT_ATTR = ACCEPTED_TYPES.join(',');

export interface ImageUploaderProps {
  weddingId: string;
  /** URLs elegidas, en orden. Se guardan tal cual en la configuración. */
  value: string[];
  onChange: (urls: string[]) => void;
  /** Portada: una sola foto y sin biblioteca visible. */
  single?: boolean;
  /** Tope de fotos elegidas (por defecto 40). */
  max?: number;
  /** Texto del botón de subida. */
  buttonLabel?: string;
  hint?: string;
  /** Muestra la biblioteca de fotos ya subidas de esta boda. */
  showLibrary?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** ¿La URL apunta a una foto subida por nosotros? */
function isUploadedUrl(url: string): boolean {
  return url.startsWith('/api/uploads/');
}

function fileOf(url: string): string | null {
  const match = /\/api\/uploads\/[^/]+\/([^/?#]+)/.exec(url);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function ImageUploader({
  weddingId,
  value,
  onChange,
  single = false,
  max = 40,
  buttonLabel,
  hint,
  showLibrary = true,
}: ImageUploaderProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [library, setLibrary] = useState<StoredImage[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropDepth = useRef(0);

  const loadLibrary = useCallback(async (): Promise<void> => {
    try {
      const { images } = await api.uploads.list(weddingId);
      setLibrary(images);
    } catch {
      /* La biblioteca es una comodidad: si falla, se puede subir igual. */
    }
  }, [weddingId]);

  useEffect(() => {
    if (showLibrary && !single) void loadLibrary();
  }, [showLibrary, single, loadLibrary]);

  const commit = useCallback(
    (urls: string[]): void => {
      const clean = urls.map((url) => url.trim()).filter(Boolean);
      onChange(single ? clean.slice(-1) : clean.slice(0, max));
    },
    [onChange, single, max],
  );

  const addUrls = useCallback(
    (urls: string[]): void => {
      if (single) {
        commit(urls.slice(-1));
        return;
      }
      const merged = [...value];
      for (const url of urls) if (!merged.includes(url)) merged.push(url);
      commit(merged);
    },
    [commit, single, value],
  );

  const upload = useCallback(
    async (files: File[]): Promise<void> => {
      setError(null);
      setNotice(null);

      if (files.length === 0) return;

      // La API acepta hasta 10 archivos por petición.
      if (files.length > MAX_PER_REQUEST) {
        setError(`Subí de a ${MAX_PER_REQUEST} fotos como máximo. Elegiste ${files.length}.`);
        return;
      }

      const wrongType = files.find((file) => file.type && !ACCEPTED_TYPES.includes(file.type));
      if (wrongType) {
        setError(
          `"${wrongType.name}" no es JPG, PNG ni WebP. Si es un HEIC (iPhone) o un PDF, convertilo primero.`,
        );
        return;
      }

      const tooBig = files.find((file) => file.size > MAX_BYTES);
      if (tooBig) {
        setError(`"${tooBig.name}" pesa ${formatSize(tooBig.size)} y el máximo es 8 MB.`);
        return;
      }

      if (!single && value.length + files.length > max) {
        setError(`Podés tener hasta ${max} fotos. Quitá alguna antes de subir más.`);
        return;
      }

      setBusy(true);
      try {
        const response = await api.uploads.upload(weddingId, files);
        addUrls(response.images.map((image) => image.url));

        if (response.errors.length > 0) {
          setError(response.errors.join(' '));
        }
        if (response.images.length > 0) {
          setNotice(
            response.images.length === 1
              ? 'Foto subida.'
              : `${response.images.length} fotos subidas.`,
          );
          await loadLibrary();
        }
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'No pudimos subir la foto. Probá de nuevo.',
        );
      } finally {
        setBusy(false);
      }
    },
    [addUrls, loadLibrary, max, single, value.length, weddingId],
  );

  const removeFromInvitation = useCallback(
    (url: string): void => {
      commit(value.filter((item) => item !== url));
      setNotice(null);
      setError(null);
    },
    [commit, value],
  );

  const deleteFromServer = useCallback(
    async (url: string): Promise<void> => {
      const file = fileOf(url);
      if (!file) return;
      const confirmed = window.confirm(
        '¿Borrar esta foto del servidor? Se quita de la invitación y no se puede recuperar.',
      );
      if (!confirmed) return;

      setBusy(true);
      setError(null);
      try {
        await api.uploads.remove(weddingId, file);
        commit(value.filter((item) => item !== url));
        setNotice('Foto borrada.');
        await loadLibrary();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No pudimos borrar la foto.');
      } finally {
        setBusy(false);
      }
    },
    [commit, loadLibrary, value, weddingId],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      event.preventDefault();
      dropDepth.current = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length > 0) void upload(files);
    },
    [upload],
  );

  return (
    <div className="image-field">
      <div
        className={`image-field__drop${dragging ? ' is-dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          dropDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => {
          dropDepth.current = Math.max(0, dropDepth.current - 1);
          if (dropDepth.current === 0) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <div
          className={`image-field__grid${single ? ' image-field__grid--single' : ''}`}
          role="list"
        >
          {value.map((url, index) => (
            <figure className="image-card" key={`${url}-${index}`} role="listitem">
              <img src={url} alt="" loading="lazy" decoding="async" />
              <div className="image-card__bar">
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => removeFromInvitation(url)}
                  title="Quitar de la invitación (la foto queda guardada)"
                >
                  Quitar
                </button>
                {isUploadedUrl(url) ? (
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => void deleteFromServer(url)}
                    disabled={busy}
                    title="Borrar la foto del servidor"
                    aria-label="Borrar la foto del servidor"
                  >
                    🗑
                  </button>
                ) : null}
              </div>
            </figure>
          ))}

          {single && value.length > 0 ? null : (
            <button
              type="button"
              className="image-card image-card--add"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <span aria-hidden="true">＋</span>
              <span>{buttonLabel ?? (single ? 'Subir foto' : 'Subir fotos')}</span>
            </button>
          )}
        </div>

        {dragging ? <p className="image-field__hint">Soltá las fotos acá</p> : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple={!single}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Permite volver a elegir el mismo archivo después de un error.
          event.target.value = '';
          void upload(files);
        }}
      />

      <div className="image-field__actions">
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? 'Subiendo…' : (buttonLabel ?? (single ? 'Subir foto' : 'Subir fotos'))}
        </button>

        {showLibrary && !single ? (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => {
              setLibraryOpen((open) => !open);
              if (!libraryOpen) void loadLibrary();
            }}
            aria-expanded={libraryOpen}
          >
            {libraryOpen ? 'Ocultar' : 'Usar una foto ya subida'}
            {library.length > 0 ? ` (${library.length})` : ''}
          </button>
        ) : null}

        {!single && value.length > 0 ? (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => commit([])}
            disabled={busy}
          >
            Vaciar la selección
          </button>
        ) : null}
      </div>

      <p className="hint">
        {hint ??
          (single
            ? 'Una sola foto para la portada. Ideal vertical (por ejemplo 1200×1800 px).'
            : 'JPG, PNG o WebP · hasta 8 MB cada una. Se guardan en el servidor de la boda.')}
      </p>

      {error ? <p className="image-field__msg image-field__msg--err">{error}</p> : null}
      {notice && !error ? <p className="image-field__msg">{notice}</p> : null}

      {libraryOpen && !single ? (
        <div className="image-library">
          <div className="row-between">
            <span className="muted small">Fotos ya subidas a esta boda</span>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => void loadLibrary()}>
              Actualizar
            </button>
          </div>
          {library.length === 0 ? (
            <p className="muted small">Todavía no subiste ninguna foto.</p>
          ) : (
            <div className="image-library__grid">
              {library.map((image) => {
                const chosen = value.includes(image.url);
                return (
                  <button
                    type="button"
                    key={image.file}
                    className={`image-library__item${chosen ? ' is-chosen' : ''}`}
                    onClick={() => addUrls([image.url])}
                    disabled={chosen}
                    title={
                      chosen
                        ? 'Ya está en la invitación'
                        : `Agregar (${formatSize(image.size)})`
                    }
                  >
                    <img src={image.url} alt="" loading="lazy" decoding="async" />
                    {chosen ? <span className="image-library__check">✓</span> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default ImageUploader;
