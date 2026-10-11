/**
 * ---------------------------------------------------------------------------
 * Asistente de importación de invitados.
 * ---------------------------------------------------------------------------
 * La organizadora NO tiene que renombrar columnas: sube su planilla tal como
 * está (Excel, CSV o TXT) y el sistema detecta los encabezados. El paso de
 * vista previa es obligatorio a propósito: nunca se guarda nada sin que ella vea
 * antes qué filas entran y cuáles tienen problemas.
 */

import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  COUNTRIES,
  IMPORT_FIELDS,
  guessField,
  type ColumnMapping,
  type ImportField,
  type ImportPreview,
  type ImportRowPreview,
} from '@boda/shared';
import { ApiError, api } from '../lib/api';
import { useWedding } from '../lib/useWedding';
import { DUPLICATE_LABELS } from '../lib/labels';
import { ErrorBlock, useToast } from './ui';
import type { ImportCommitResponse } from '../lib/types';

type Step = 'file' | 'preview' | 'done';

const FIELD_LABELS: Record<ImportField, string> = {
  fullName: 'Nombre completo',
  phone: 'Teléfono (WhatsApp)',
  passes: 'Pases',
  groupName: 'Grupo o familia',
  notes: 'Notas',
  ignore: 'Ignorar esta columna',
};

const ACCEPTED = '.xlsx,.xls,.csv,.txt,.tsv';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportPage(): JSX.Element {
  const { weddingId = '' } = useParams<{ weddingId: string }>();
  const weddingState = useWedding();
  const { notify } = useToast();

  const [step, setStep] = useState<Step>('file');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [defaultCountry, setDefaultCountry] = useState('PY');
  const [defaultPasses, setDefaultPasses] = useState(
    weddingState.config?.rsvp.defaultPasses ?? 2,
  );
  const [onDuplicate, setOnDuplicate] = useState<'skip' | 'update' | 'duplicate'>('skip');
  const [groupByFamily, setGroupByFamily] = useState(false);

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [summary, setSummary] = useState<ImportCommitResponse | null>(null);

  const options = useMemo(
    () => ({ defaultCountry, defaultPasses, onDuplicate, groupByFamily }),
    [defaultCountry, defaultPasses, onDuplicate, groupByFamily],
  );

  const pickFile = useCallback((next: File | null): void => {
    setError(null);
    setPreview(null);
    setSummary(null);
    setStep('file');
    setFile(next);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      event.preventDefault();
      setDragOver(false);
      const dropped = event.dataTransfer.files[0];
      if (dropped) pickFile(dropped);
    },
    [pickFile],
  );

  /** Pide la vista previa. Se reutiliza tanto al analizar como al remapear. */
  const runPreview = useCallback(
    async (withMapping?: ColumnMapping): Promise<void> => {
      if (!file) {
        setError('Elegí un archivo primero.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await api.imports.preview(weddingId, file, options, withMapping);
        setPreview(result);
        // Si la organizadora ya ajustó el mapeo, se respeta; si no, se usa el
        // que detectó el servidor.
        setMapping(withMapping ?? result.mapping ?? {});
        setStep('preview');
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos leer el archivo. Verificá que no esté dañado.',
        );
      } finally {
        setLoading(false);
      }
    },
    [file, weddingId, options],
  );

  const commit = useCallback(async (): Promise<void> => {
    if (!file || !preview) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.imports.commit(weddingId, file, options, mapping);
      setSummary(result);
      setStep('done');
      notify(`Importación terminada: ${result.created} invitados nuevos.`, 'ok');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No pudimos confirmar la importación.',
      );
    } finally {
      setLoading(false);
    }
  }, [file, preview, weddingId, options, mapping, notify]);

  /* Grupos detectados en la vista previa (para el resumen de groupByFamily). */
  const detectedGroups = useMemo(() => {
    if (!preview) return 0;
    if (typeof preview.groupCount === 'number') return preview.groupCount;
    const groups = new Set(preview.rows.map((row) => row.groupName).filter(Boolean));
    return groups.size;
  }, [preview]);

  const rowsToShow = preview ? preview.rows.slice(0, 200) : [];
  const hiddenRows = preview ? Math.max(0, preview.rows.length - rowsToShow.length) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to={`/admin/weddings/${weddingId}/guests`}>← Invitados</Link>
          </p>
          <h1>Importar invitados</h1>
          <p>Subí tu lista en Excel, CSV o TXT. Nada se guarda hasta que confirmes.</p>
        </div>
        <Link className="btn" to={`/admin/weddings/${weddingId}/guests`}>
          Ver invitados
        </Link>
      </div>

      {error ? <ErrorBlock message={error} onRetry={() => void runPreview(mapping)} /> : null}

      {/* --- Paso 1: archivo y opciones ----------------------------------- */}
      {step === 'file' ? (
        <>
          <div className="card">
            <span className="card__title">¿Todavía no tenés la lista armada?</span>
            <p className="muted small">
              Descargá la plantilla, completala con un invitado por fila (el nombre y el celular
              son lo único obligatorio) y subila acá abajo. También podés subir cualquier Excel,
              CSV o TXT que ya uses: las columnas se detectan solas porque el sistema reconoce
              encabezados como &quot;Nombre&quot;, &quot;Celular&quot;, &quot;WhatsApp&quot;, &quot;Cupos&quot; o &quot;Mesa&quot;.
            </p>
            <div className="row">
              <a className="btn btn--sm" href="/plantillas/plantilla-invitados.xlsx" download>
                ⬇ Plantilla en Excel
              </a>
              <a
                className="btn btn--sm btn--ghost"
                href="/plantillas/plantilla-invitados.csv"
                download
              >
                ⬇ Plantilla en CSV
              </a>
            </div>
          </div>

          <div
            className={`dropzone${dragOver ? ' is-over' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <span className="dropzone__icon" aria-hidden="true">
              📄
            </span>
            <span className="dropzone__title">
              {file ? file.name : 'Arrastrá tu planilla acá o tocá para elegirla'}
            </span>
            <span className="muted small">
              {file
                ? `${formatBytes(file.size)} · listo para analizar`
                : 'Formatos: .xlsx, .xls, .csv, .txt, .tsv'}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            />
          </div>

          <section className="panel">
            <div className="panel__head">
              <span className="card__title">Opciones de importación</span>
            </div>
            <div className="panel__body grid-2">
              <div className="field">
                <label className="label">País por defecto</label>
                <select
                  className="select"
                  value={defaultCountry}
                  onChange={(event) => setDefaultCountry(event.target.value)}
                >
                  {COUNTRIES.map((country) => (
                    <option key={country.iso} value={country.iso}>
                      {country.name} (+{country.dial})
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Se usa para los números escritos sin código internacional.
                </span>
              </div>

              <div className="field">
                <label className="label">Pases por defecto</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={20}
                  value={defaultPasses}
                  onChange={(event) =>
                    setDefaultPasses(Math.min(20, Math.max(1, Number(event.target.value) || 1)))
                  }
                />
                <span className="hint">Cuando la planilla no trae una columna de pases.</span>
              </div>

              <div className="field">
                <label className="label">Si el invitado ya existe</label>
                <select
                  className="select"
                  value={onDuplicate}
                  onChange={(event) =>
                    setOnDuplicate(event.target.value as 'skip' | 'update' | 'duplicate')
                  }
                >
                  {(['skip', 'update', 'duplicate'] as const).map((value) => (
                    <option key={value} value={value}>
                      {DUPLICATE_LABELS[value]}
                    </option>
                  ))}
                </select>
                <span className="hint">Se compara por teléfono normalizado.</span>
              </div>

              <div className="field">
                <label className="label">Grupos familiares</label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={groupByFamily}
                    onChange={(event) => setGroupByFamily(event.target.checked)}
                  />
                  Agrupar por familia para enviar un solo mensaje
                </label>
                <span className="hint">
                  Útil cuando una misma familia comparte un solo teléfono.
                </span>
              </div>
            </div>
          </section>

          <div className="row-between card">
            <span className="muted small">
              {file
                ? 'Vas a poder revisar todas las filas antes de guardar.'
                : 'Todavía no elegiste ningún archivo.'}
            </span>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!file || loading}
              onClick={() => void runPreview()}
            >
              {loading ? 'Analizando…' : 'Analizar archivo'}
            </button>
          </div>
        </>
      ) : null}

      {/* --- Paso 2: mapeo, estadísticas y filas -------------------------- */}
      {step === 'preview' && preview ? (
        <>
          <div className="stats">
            <div className="stat">
              <div className="stat__label">Filas leídas</div>
              <div className="stat__value">{preview.totalRows}</div>
            </div>
            <div className="stat stat--ok">
              <div className="stat__label">Válidas</div>
              <div className="stat__value">{preview.validRows}</div>
            </div>
            <div className="stat stat--warn">
              <div className="stat__label">Con avisos</div>
              <div className="stat__value">{preview.warningRows}</div>
            </div>
            <div className="stat stat--err">
              <div className="stat__label">Con error</div>
              <div className="stat__value">{preview.errorRows}</div>
            </div>
            {groupByFamily ? (
              <div className="stat">
                <div className="stat__label">Grupos</div>
                <div className="stat__value">{detectedGroups}</div>
              </div>
            ) : null}
          </div>

          {preview.errorRows > 0 ? (
            <div className="alert alert--warn">
              <div>
                <div className="alert__title">
                  {preview.errorRows} fila(s) no se van a importar
                </div>
                <div>
                  Casi siempre es un teléfono mal escrito. Podés corregirlo en tu planilla y volver
                  a subirla, o seguir sin esas filas.
                </div>
              </div>
            </div>
          ) : null}

          <section className="panel">
            <div className="panel__head">
              <span className="card__title">Columnas detectadas</span>
              <span className="muted small">
                Si alguna quedó mal, cambiala y volvé a analizar.
              </span>
            </div>
            <div className="panel__body">
              {preview.headers.length === 0 ? (
                <p className="muted small">
                  No detectamos encabezados en el archivo. Revisá que la primera fila tenga los
                  títulos de las columnas.
                </p>
              ) : (
                preview.headers.map((header) => {
                  const current = mapping[header] ?? 'ignore';
                  return (
                    <div className="mapping-row" key={header}>
                      <span className="mapping-row__header" title={header}>
                        {header || '(sin título)'}
                      </span>
                      <span className="mapping-row__arrow" aria-hidden="true">
                        →
                      </span>
                      <select
                        className="select"
                        value={current}
                        onChange={(event) => {
                          const next: ColumnMapping = {
                            ...mapping,
                            [header]: event.target.value as ImportField,
                          };
                          setMapping(next);
                        }}
                      >
                        {IMPORT_FIELDS.map((field) => (
                          <option key={field} value={field}>
                            {FIELD_LABELS[field]}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })
              )}

              <div className="row" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={loading}
                  onClick={() => void runPreview(mapping)}
                >
                  {loading ? 'Aplicando…' : 'Volver a analizar con este mapeo'}
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => {
                    if (!file) return;
                    const detected: ColumnMapping = {};
                    for (const header of preview.headers) {
                      detected[header] = guessField(header);
                    }
                    setMapping(detected);
                  }}
                >
                  Detectar automáticamente
                </button>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <span className="card__title">Vista previa</span>
              <span className="muted small">
                {rowsToShow.length} de {preview.rows.length} filas
              </span>
            </div>
            <div className="table-wrap">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Normalizado</th>
                    <th>Pases</th>
                    <th>Grupo</th>
                    <th>Avisos</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsToShow.map((row: ImportRowPreview) => (
                    <tr key={row.row} className={`level-${row.level}`}>
                      <td className="muted">{row.row}</td>
                      <td>{row.fullName || <span className="muted">(vacío)</span>}</td>
                      <td className="mono tiny">{row.rawPhone || '—'}</td>
                      <td className="mono tiny">{row.phone ?? <span className="muted">—</span>}</td>
                      <td>{row.passes}</td>
                      <td className="muted">{row.groupName ?? '—'}</td>
                      <td>
                        {row.issues.length === 0 ? (
                          <span className="badge badge--ok">OK</span>
                        ) : (
                          <div className="issues">
                            {row.issues.map((issue) => (
                              <span className={`issue issue--${row.level}`} key={issue}>
                                {issue}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hiddenRows > 0 ? (
              <div className="panel__body muted small">
                Se muestran las primeras 200 filas. Las {hiddenRows} restantes también se van a
                importar.
              </div>
            ) : null}
          </section>

          <div className="row-between card">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setStep('file');
                setPreview(null);
              }}
            >
              ← Elegir otro archivo
            </button>
            <div className="row">
              <span className="muted small">
                {preview.validRows + preview.warningRows} fila(s) se van a guardar
              </span>
              <button
                type="button"
                className="btn btn--primary btn--lg"
                disabled={loading || preview.validRows + preview.warningRows === 0}
                onClick={() => void commit()}
              >
                {loading ? 'Importando…' : 'Confirmar importación'}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* --- Paso 3: resumen --------------------------------------------- */}
      {step === 'done' && summary ? (
        <section className="panel">
          <div className="panel__head">
            <span className="card__title">Importación completada</span>
          </div>
          <div className="panel__body stack">
            <div className="stats">
              <div className="stat stat--ok">
                <div className="stat__label">Creados</div>
                <div className="stat__value">{summary.created}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Actualizados</div>
                <div className="stat__value">{summary.updated}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Omitidos</div>
                <div className="stat__value">{summary.skipped}</div>
              </div>
              <div className="stat stat--err">
                <div className="stat__label">Con error</div>
                <div className="stat__value">{summary.errors}</div>
              </div>
            </div>

            {Array.isArray(summary.issues) && summary.issues.length > 0 ? (
              <div className="alert alert--warn">
                <div>
                  <div className="alert__title">Filas con problemas</div>
                  <ul className="col">
                    {summary.issues.slice(0, 20).map((issue) => (
                      <li key={`${issue.row}-${issue.message}`} className="small">
                        Fila {issue.row}: {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            <div className="row">
              <Link className="btn btn--primary" to={`/admin/weddings/${weddingId}/guests`}>
                Ver la lista de invitados
              </Link>
              <Link className="btn" to={`/admin/weddings/${weddingId}/campaigns`}>
                Enviar las invitaciones
              </Link>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  pickFile(null);
                  setMapping({});
                }}
              >
                Importar otro archivo
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

export default ImportPage;
