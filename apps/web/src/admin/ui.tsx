/**
 * Componentes chicos y reutilizables del panel: diálogo de confirmación,
 * avisos flotantes (toasts) y estados de carga/vacío.
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

/* --- Diálogo modal ------------------------------------------------------- */

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className={`dialog`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog__head">
          <span className="dialog__title">{title}</span>
          <button type="button" className="dialog__close" onClick={onCancel} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="dialog__body">{message}</div>
        <div className="dialog__foot">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --- Toasts -------------------------------------------------------------- */

type ToastKind = 'info' | 'ok' | 'err';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastSeed = 0;

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, kind: ToastKind = 'info'): void => {
    toastSeed += 1;
    const id = toastSeed;
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, kind === 'err' ? 7000 : 4200);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast${toast.kind === 'err' ? ' toast--err' : ''}${
              toast.kind === 'ok' ? ' toast--ok' : ''
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast() solo funciona dentro de <ToastProvider>.');
  return context;
}

/* --- Estados ------------------------------------------------------------- */

export function LoadingBlock({ label = 'Cargando…' }: { label?: string }): JSX.Element {
  return (
    <div className="state col center">
      <span className="spinner spinner--lg" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): JSX.Element {
  return (
    <div className="alert alert--err" role="alert">
      <div className="grow">
        <div className="alert__title">No pudimos completar la operación</div>
        <div>{message}</div>
      </div>
      {onRetry ? (
        <button type="button" className="btn btn--sm" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {children}
    </div>
  );
}

/* --- Panel colapsable ---------------------------------------------------- */

export function Collapsible({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="acc">
      <button
        type="button"
        className="acc__head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        {hint ? <span className="muted small" style={{ fontWeight: 400 }}>{hint}</span> : null}
        <span className="acc__chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? <div className="acc__body">{children}</div> : null}
    </section>
  );
}

/* --- Etiquetas de estado ------------------------------------------------- */

export function StatusBadge({ status }: { status: string }): JSX.Element {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pendiente', className: 'badge badge--warn' },
    confirmed: { label: 'Confirmado', className: 'badge badge--ok' },
    declined: { label: 'No asiste', className: 'badge badge--err' },
    maybe: { label: 'Tal vez', className: 'badge badge--info' },
    not_sent: { label: 'Sin enviar', className: 'badge badge--muted' },
    queued: { label: 'En cola', className: 'badge badge--info' },
    sending: { label: 'Enviando', className: 'badge badge--info' },
    sent: { label: 'Enviado', className: 'badge badge--ok' },
    delivered: { label: 'Entregado', className: 'badge badge--ok' },
    read: { label: 'Leído', className: 'badge badge--gold' },
    failed: { label: 'Falló', className: 'badge badge--err' },
    skipped: { label: 'Omitido', className: 'badge badge--muted' },
    draft: { label: 'Borrador', className: 'badge badge--muted' },
    running: { label: 'En curso', className: 'badge badge--info' },
    paused: { label: 'Pausada', className: 'badge badge--warn' },
    finished: { label: 'Terminada', className: 'badge badge--ok' },
    cancelled: { label: 'Cancelada', className: 'badge badge--muted' },
  };
  const entry = map[status] ?? { label: status, className: 'badge' };
  return <span className={entry.className}>{entry.label}</span>;
}
