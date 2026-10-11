/**
 * Confirmación de asistencia (ancla #rsvp).
 * ---------------------------------------------------------------------------
 * Dos modos:
 *  - CON token: formulario nominativo. El invitado elige sí/no/tal vez, carga
 *    los nombres de sus acompañantes (hasta `passes - 1`), sus restricciones
 *    alimentarias y un mensaje. Al enviar se muestra el mensaje de agradecimiento
 *    que cargó la organizadora.
 *  - SIN token: panel amable que invita a usar el enlace personal y ofrece un
 *    botón de WhatsApp para confirmar a mano.
 */

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import type { PublicGuest, RsvpStatus, RsvpSubmission, WeddingConfig } from '@boda/shared';
import { capitalize, formatDateLong, formatPasses, waMeLink } from '@boda/shared';
import { ApiError, api } from '../../lib/api';
import { RSVP_STATUS_LABELS } from '../../lib/labels';
import { SectionShell } from './parts';

export interface RsvpSectionProps {
  config: WeddingConfig;
  slug: string;
  token: string | null;
  guest: PublicGuest | null;
  /** Actualiza el invitado en memoria tras confirmar (sin volver a pedirlo). */
  onGuestChange: (guest: PublicGuest | null) => void;
}

type Choice = 'yes' | 'no' | 'maybe';

const CHOICES: ReadonlyArray<{ value: Choice; label: string; hint: string }> = [
  { value: 'yes', label: 'Sí, ahí estaré', hint: 'Nos alegra muchísimo' },
  { value: 'no', label: 'No podré ir', hint: 'Te vamos a extrañar' },
  { value: 'maybe', label: 'Todavía no sé', hint: 'Avisanos cuando puedas' },
];

/** "2026-07-01" -> "miércoles 1 de julio de 2026" sin corrimientos de zona. */
function formatDeadline(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return capitalize(formatDateLong(date.toISOString(), 'UTC'));
}

function deadlineInfo(
  iso: string | undefined,
): { text: string; expired: boolean; soon: boolean } | null {
  if (!iso) return null;
  const target = new Date(`${iso}T23:59:59`);
  if (Number.isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - Date.now();
  return {
    text: formatDeadline(iso),
    expired: diffMs < 0,
    soon: diffMs >= 0 && diffMs < 3 * 24 * 60 * 60 * 1000,
  };
}

/** Estado local del invitado (se actualiza al confirmar, sin recargar la página). */
interface LocalAnswer {
  status: RsvpStatus;
  companions: string[];
}

export function RsvpSection({
  config,
  slug,
  token,
  guest,
  onGuestChange,
}: RsvpSectionProps): JSX.Element {
  const rsvp = config.rsvp;
  const deadline = deadlineInfo(rsvp.deadline);

  const [choice, setChoice] = useState<Choice>('yes');
  const [companions, setCompanions] = useState<string[]>(() => guest?.companions ?? []);
  const [dietary, setDietary] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Respuesta ya registrada. Se ancla la primera vez que se ve al invitado
   * (si ya había respondido) o cuando esta pantalla confirma.
   */
  const [answer, setAnswer] = useState<LocalAnswer | null>(() =>
    guest?.respondedAt ? { status: guest.status, companions: guest.companions ?? [] } : null,
  );
  const [editing, setEditing] = useState(false);

  const maxCompanions = Math.max(0, (guest?.passes ?? 1) - 1);
  const slots = useMemo(
    () => Array.from({ length: maxCompanions }, (_, index) => index),
    [maxCompanions],
  );

  const setCompanion = useCallback((index: number, value: string): void => {
    setCompanions((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  }, []);

  const submit = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      if (!token || sending) return;

      const cleanCompanions = (choice === 'yes' ? companions : [])
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
        .slice(0, 20);

      const submission: RsvpSubmission = { attending: choice, companions: cleanCompanions };
      if (rsvp.askDietary && dietary.trim()) submission.dietary = dietary.trim().slice(0, 500);
      if (message.trim()) submission.message = message.trim().slice(0, 1000);

      setSending(true);
      setError(null);
      try {
        await api.public.rsvp(slug, token, submission);
        const status: RsvpStatus = choice === 'yes' ? 'confirmed' : choice === 'no' ? 'declined' : 'maybe';
        setAnswer({ status, companions: cleanCompanions });
        setEditing(false);
        onGuestChange({
          token,
          fullName: guest?.fullName ?? '',
          passes: guest?.passes ?? rsvp.defaultPasses,
          status,
          companions: cleanCompanions,
          respondedAt: new Date().toISOString(),
        });
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos guardar tu confirmación. Probá otra vez en un momento.',
        );
      } finally {
        setSending(false);
      }
    },
    [
      token,
      sending,
      choice,
      companions,
      dietary,
      message,
      rsvp.askDietary,
      rsvp.defaultPasses,
      slug,
      guest,
      onGuestChange,
    ],
  );

  /* --- Sin enlace personal ------------------------------------------------ */
  if (!token || !guest) {
    const contact = rsvp.contactPhone ?? '';
    return (
      <SectionShell id="rsvp" eyebrow="Confirmá tu asistencia" title="¿Nos acompañás?">
        <div className="rsvp rsvp--guestless">
          {deadline ? (
            <p className={`rsvp__deadline${deadline.expired ? ' is-expired' : ''}`}>
              {deadline.expired ? 'Fecha límite vencida: ' : 'Confirmá antes del '}
              <strong>{deadline.text}</strong>
            </p>
          ) : null}

          <p className="rsvp__lead">
            Para confirmar tu asistencia, abrí el enlace personal que te enviamos por WhatsApp: ahí
            vas a poder indicar cuántas personas te acompañan.
          </p>

          <div className="rsvp__guestless-note">
            <span aria-hidden="true">💬</span>
            <p>
              ¿No encontrás tu enlace? Escribinos y te lo enviamos de nuevo. Si ya lo tenés a mano,
              tocá el botón y contanos cuántos van.
            </p>
          </div>

          {contact ? (
            <div className="rsvp__actions">
              <a
                className="invite-btn invite-btn--primary invite-btn--block"
                href={waMeLink(
                  contact,
                  `¡Hola! Soy invitado/a de la boda de ${config.couple.display}. Quiero confirmar mi asistencia.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84c0 1.74.46 3.44 1.32 4.94L2 22l5.32-1.4c1.44.78 3.06 1.2 4.72 1.2 5.44 0 9.84-4.4 9.84-9.84S17.48 2 12.04 2Zm5.7 13.9c-.24.68-1.4 1.3-1.94 1.34-.54.06-1.02.1-1.94-.24-.92-.34-3.12-1.4-4.6-3.5-1.06-1.5-1.2-2.5-1.14-3.02.06-.52.66-1.56 1.04-1.8.24-.16.6-.12.78.02.2.16.84 1.24.94 1.44.1.2.06.4-.04.6-.1.2-.36.5-.5.66-.14.16-.3.26-.12.56.18.3.8 1.24 1.7 2 1.16 1 1.84 1.26 2.14 1.4.2.1.4.08.56-.06.22-.2.72-.84.92-1.12.14-.2.34-.16.56-.08.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.6-.18 1.28Z" />
                </svg>
                Confirmar por WhatsApp
              </a>
              <p className="rsvp__contact">
                o escribinos al <span className="mono">{contact}</span>
              </p>
            </div>
          ) : (
            <p className="rsvp__lead rsvp__lead--soft">
              Todavía no cargamos un número de contacto. Escribinos por WhatsApp cuando puedas.
            </p>
          )}
        </div>
      </SectionShell>
    );
  }

  /* --- Ya confirmó: mostramos el resultado -------------------------------- */
  if (answer && !editing) {
    const confirmedCount = answer.status === 'confirmed' ? 1 + answer.companions.length : 0;

    return (
      <SectionShell id="rsvp" eyebrow="Confirmación" title="¡Gracias por responder!">
        <div className="rsvp rsvp--done">
          <span className={`rsvp__stamp rsvp__stamp--${answer.status}`} aria-hidden="true">
            {answer.status === 'confirmed' ? '✓' : answer.status === 'declined' ? '✕' : '?'}
          </span>

          <p className="rsvp__thanks">{rsvp.thanksMessage}</p>

          <div className="rsvp__summary">
            <p className="rsvp__summary-name">{guest.fullName}</p>
            <p className="rsvp__summary-status">
              Estado: <strong>{RSVP_STATUS_LABELS[answer.status]}</strong>
            </p>
            {answer.status === 'confirmed' ? (
              <p className="rsvp__summary-passes">
                Confirmado para {formatPasses(confirmedCount)}
                {answer.companions.length > 0 ? (
                  <span className="rsvp__companions">
                    Acompañantes: {answer.companions.join(', ')}
                  </span>
                ) : null}
              </p>
            ) : null}
            <p className="rsvp__summary-pass-limit">
              Tu invitación es válida para {formatPasses(guest.passes)}.
            </p>
          </div>

          {!deadline?.expired ? (
            <button
              type="button"
              className="invite-btn invite-btn--ghost"
              onClick={() => {
                setChoice(
                  answer.status === 'confirmed' ? 'yes' : answer.status === 'declined' ? 'no' : 'maybe',
                );
                setCompanions(answer.companions);
                setEditing(true);
              }}
            >
              Modificar mi respuesta
            </button>
          ) : (
            <p className="rsvp__closed">
              La fecha límite ya pasó. Si necesitás cambiar algo, escribinos por WhatsApp.
            </p>
          )}
        </div>
      </SectionShell>
    );
  }

  /* --- Formulario -------------------------------------------------------- */
  const guestFirstName = guest.fullName.trim().split(/\s+/)[0] ?? guest.fullName;

  return (
    <SectionShell
      id="rsvp"
      eyebrow="Confirmá tu asistencia"
      title={`¿Nos acompañás, ${guestFirstName}?`}
    >
      <form className="rsvp" onSubmit={(event) => void submit(event)}>
        <p className="rsvp__passes">
          Tu invitación es válida para <strong>{formatPasses(guest.passes)}</strong>.
        </p>

        {deadline ? (
          <p
            className={`rsvp__deadline${deadline.expired ? ' is-expired' : ''}${
              deadline.soon ? ' is-soon' : ''
            }`}
          >
            {deadline.expired ? (
              <>
                La fecha límite era el <strong>{deadline.text}</strong>. Igual podés responder: les
                avisamos a los novios.
              </>
            ) : (
              <>
                Confirmá antes del <strong>{deadline.text}</strong>
              </>
            )}
          </p>
        ) : null}

        <fieldset className="rsvp__fieldset">
          <legend className="rsvp__legend">¿Vas a poder venir?</legend>
          <div className="rsvp__choices">
            {CHOICES.map((option) => (
              <label
                key={option.value}
                className={`rsvp-choice${choice === option.value ? ' is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="attending"
                  value={option.value}
                  checked={choice === option.value}
                  onChange={() => setChoice(option.value)}
                />
                <span className="rsvp-choice__mark" aria-hidden="true" />
                <span className="rsvp-choice__body">
                  <span className="rsvp-choice__label">{option.label}</span>
                  <span className="rsvp-choice__hint">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {choice === 'yes' && maxCompanions > 0 && rsvp.askCompanionNames ? (
          <fieldset className="rsvp__fieldset">
            <legend className="rsvp__legend">
              ¿Quiénes te acompañan?
              <span className="rsvp__legend-hint">
                Hasta {maxCompanions === 1 ? '1 acompañante' : `${maxCompanions} acompañantes`}
              </span>
            </legend>
            <div className="rsvp__companions">
              {slots.map((index) => (
                <label className="rsvp__companion" key={index}>
                  <span className="rsvp__companion-index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <input
                    className="invite-input"
                    type="text"
                    autoComplete="name"
                    placeholder={`Nombre y apellido del acompañante ${index + 1}`}
                    value={companions[index] ?? ''}
                    onChange={(event) => setCompanion(index, event.target.value)}
                    maxLength={80}
                  />
                </label>
              ))}
            </div>
            <p className="rsvp__hint">
              Escribí los nombres completos: los usamos para las tarjetas de mesa.
            </p>
          </fieldset>
        ) : null}

        {rsvp.askDietary && choice !== 'no' ? (
          <label className="rsvp__field">
            <span className="rsvp__legend">¿Alguna restricción alimentaria?</span>
            <input
              className="invite-input"
              type="text"
              placeholder="Celíaco, vegetariano, alergia a los frutos secos…"
              value={dietary}
              onChange={(event) => setDietary(event.target.value)}
              maxLength={200}
            />
          </label>
        ) : null}

        <label className="rsvp__field">
          <span className="rsvp__legend">¿Querés dejarnos un mensaje?</span>
          <textarea
            className="invite-input invite-input--area"
            placeholder="Un deseo, una anécdota, lo que salga del corazón…"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={1000}
            rows={4}
          />
        </label>

        {error ? (
          <p className="rsvp__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="rsvp__actions">
          <button
            type="submit"
            className="invite-btn invite-btn--primary invite-btn--block"
            disabled={sending}
          >
            {sending ? 'Enviando…' : 'Confirmar asistencia'}
          </button>
          {editing ? (
            <button
              type="button"
              className="invite-btn invite-btn--ghost"
              onClick={() => setEditing(false)}
              disabled={sending}
            >
              Cancelar
            </button>
          ) : null}
        </div>

        <p className="rsvp__privacy">
          Solo los novios y la organizadora ven tu respuesta.
          {rsvp.contactPhone ? (
            <>
              {' '}
              ¿Preferís WhatsApp? Escribinos al <span className="mono">{rsvp.contactPhone}</span>.
            </>
          ) : null}
        </p>
      </form>
    </SectionShell>
  );
}

export default RsvpSection;
