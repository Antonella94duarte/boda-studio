/**
 * Pantalla de entrada del panel: muestra el resumen del día y los atajos.
 * No es un tablero con métricas inventadas: solo lo que la organizadora abre a
 * primera hora (cuántas bodas activas, cuántas confirmaciones pendientes y el
 * estado de WhatsApp).
 */

import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../lib/useAsync';
import { api } from '../lib/api';
import { formatDateLong, mainEvent, capitalize } from '@boda/shared';
import { LoadingBlock, ErrorBlock } from './ui';
import type { WeddingListItem } from '../lib/types';

export function AdminIndexPage(): JSX.Element {
  const state = useAsync(useCallback((signal: AbortSignal) => api.weddings.list(signal), []), []);

  if (state.loading) return <LoadingBlock label="Cargando tus bodas…" />;
  if (state.error) return <ErrorBlock message={state.error} onRetry={state.reload} />;

  const weddings: WeddingListItem[] = state.data?.weddings ?? [];
  const published = weddings.filter((wedding) => wedding.published);
  const totalGuests = weddings.reduce((sum, w) => sum + (w.stats.guestCount ?? 0), 0);
  const totalPending = weddings.reduce((sum, w) => sum + (w.stats.pending ?? 0), 0);
  const totalConfirmed = weddings.reduce((sum, w) => sum + (w.stats.confirmed ?? 0), 0);

  /* Las próximas 4 bodas por fecha de evento, para el atajo rápido. */
  const upcoming = [...weddings]
    .filter((wedding) => Boolean(mainEvent(wedding.config)))
    .sort((a, b) => {
      const aDate = mainEvent(a.config)?.startAt ?? '';
      const bDate = mainEvent(b.config)?.startAt ?? '';
      return aDate.localeCompare(bDate);
    })
    .slice(0, 4);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hola de nuevo</h1>
          <p>Este es el estado de tus bodas y confirmaciones.</p>
        </div>
        <Link className="btn btn--primary" to="/admin/weddings">
          Ir a mis bodas
        </Link>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat__label">Bodas</div>
          <div className="stat__value">{weddings.length}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Publicadas</div>
          <div className="stat__value">{published.length}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Invitados</div>
          <div className="stat__value">{totalGuests}</div>
        </div>
        <div className="stat stat--ok">
          <div className="stat__label">Confirmados</div>
          <div className="stat__value">{totalConfirmed}</div>
        </div>
        <div className="stat stat--warn">
          <div className="stat__label">Pendientes</div>
          <div className="stat__value">{totalPending}</div>
        </div>
      </div>

      <section className="panel">
        <div className="panel__head">
          <span className="card__title">Próximas bodas</span>
          <Link className="btn btn--sm" to="/admin/weddings">
            Ver todas
          </Link>
        </div>
        <div className="panel__body">
          {upcoming.length === 0 ? (
            <div className="state">
              Todavía no cargaste la fecha de ninguna boda. Entrá a una boda y completá el evento
              principal.
            </div>
          ) : (
            <ul className="col">
              {upcoming.map((wedding) => {
                const event = mainEvent(wedding.config);
                return (
                  <li key={wedding.id} className="row-between">
                    <div className="grow">
                      <strong>{wedding.config.couple.display || wedding.title}</strong>
                      <div className="muted small">
                        {event ? capitalize(formatDateLong(event.startAt)) : 'Sin fecha'} ·{' '}
                        {event?.venueName ?? 'Sin lugar'}
                      </div>
                    </div>
                    <div className="row">
                      <span className="badge badge--ok">{wedding.stats.confirmed ?? 0} conf.</span>
                      <span className="badge badge--warn">{wedding.stats.pending ?? 0} pend.</span>
                      <Link className="btn btn--sm" to={`/admin/weddings/${wedding.id}/guests`}>
                        Invitados
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

export default AdminIndexPage;
