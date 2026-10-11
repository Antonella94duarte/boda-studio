/**
 * Estructura del panel: navegación lateral (abajo en el teléfono), usuario
 * conectado, cierre de sesión y el chip de estado de WhatsApp que se refresca
 * cada 15 segundos para que la organizadora sepa si puede enviar o no.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import type { WhatsAppStatusResponse } from '../lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** true si la ruta depende de la boda seleccionada. */
  perWedding?: boolean;
}

function navItems(weddingId: string | undefined): NavItem[] {
  const suffix = weddingId ? `/${weddingId}` : '';
  return [
    { to: '/admin', label: 'Inicio', icon: '⌂' },
    { to: '/admin/weddings', label: 'Bodas', icon: '♡' },
    { to: `/admin/weddings${suffix}/guests`, label: 'Invitados', icon: '☰', perWedding: true },
    { to: `/admin/weddings${suffix}/import`, label: 'Importar', icon: '⇪', perWedding: true },
    { to: `/admin/weddings${suffix}/campaigns`, label: 'Campañas', icon: '✉', perWedding: true },
    { to: '/admin/whatsapp', label: 'WhatsApp', icon: '◉' },
  ];
}

const TITLES: ReadonlyArray<[RegExp, string]> = [
  [/^\/admin\/?$/, 'Inicio'],
  [/^\/admin\/weddings\/[^/]+\/guests/, 'Invitados'],
  [/^\/admin\/weddings\/[^/]+\/import/, 'Importar invitados'],
  [/^\/admin\/weddings\/[^/]+\/campaigns/, 'Campañas de WhatsApp'],
  [/^\/admin\/weddings\/[^/]+/, 'Editar boda'],
  [/^\/admin\/weddings/, 'Mis bodas'],
  [/^\/admin\/whatsapp/, 'Conexión de WhatsApp'],
];

function titleFor(pathname: string): string {
  for (const [pattern, title] of TITLES) {
    if (pattern.test(pathname)) return title;
  }
  return 'Panel';
}

/** Traduce el estado de la sesión de WhatsApp a algo que se entiende de un vistazo. */
function statusLabel(status: WhatsAppStatusResponse | null): string {
  if (!status) return 'Sin datos';
  switch (status.status) {
    case 'connected':
      return status.phoneNumber ? `Conectado · ${status.phoneNumber}` : 'Conectado';
    case 'qr':
      return 'Esperando escaneo';
    case 'connecting':
      return 'Conectando…';
    case 'error':
      return 'Con error';
    case 'unsupported':
      return 'No disponible';
    default:
      return 'Desconectado';
  }
}

function statusTone(status: WhatsAppStatusResponse | null): string {
  if (!status) return '';
  if (status.status === 'connected') return 'status-dot--ok';
  if (status.status === 'qr' || status.status === 'connecting') return 'status-dot--warn';
  if (status.status === 'error') return 'status-dot--err';
  return '';
}

export function AdminLayout(): JSX.Element {
  const { user, logout } = useSession();
  const { weddingId } = useParams<{ weddingId?: string }>();
  const location = useLocation();

  const [waStatus, setWaStatus] = useState<WhatsAppStatusResponse | null>(null);
  const [waError, setWaError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadStatus = useCallback(async (): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const status = await api.whatsapp.status(controller.signal);
      setWaStatus(status);
      setWaError(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setWaError(true);
    }
  }, []);

  /* Chip global: se consulta al entrar y luego cada 15 segundos. */
  useEffect(() => {
    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 15_000);
    return () => {
      window.clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [loadStatus]);

  const items = navItems(weddingId);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <strong>Boda Studio</strong>
          <span>Panel</span>
        </div>

        <nav className="sidebar__nav" aria-label="Navegación principal">
          {items.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/admin'}
              className={({ isActive }) => `sidebar__link${isActive ? ' is-active' : ''}`}
              title={item.perWedding && !weddingId ? 'Elegí una boda primero' : item.label}
            >
              <span className="sidebar__icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__foot">
          <div className="sidebar__user truncate">
            <strong className="truncate">{user?.name ?? 'Organizadora'}</strong>
            <span className="truncate">{user?.email ?? ''}</span>
          </div>
          <button type="button" className="btn btn--sm btn--block" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="grow">
            <div className="topbar__title">{titleFor(location.pathname)}</div>
            <div className="topbar__sub">
              {weddingId
                ? 'Trabajando sobre una boda'
                : 'Elegí una boda para gestionar invitados y envíos'}
            </div>
          </div>

          <NavLink
            to="/admin/whatsapp"
            className={`badge ${waStatus?.status === 'connected' ? 'badge--ok' : waError ? 'badge--err' : 'badge--muted'}`}
            title="Estado de la conexión de WhatsApp"
          >
            <span className={`status-dot ${statusTone(waStatus)}`} aria-hidden="true" />
            {waError ? 'Sin conexión' : statusLabel(waStatus)}
          </NavLink>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default AdminLayout;
