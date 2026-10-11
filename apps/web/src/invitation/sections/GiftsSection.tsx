/**
 * Regalos: mensaje + cuentas bancarias con botón de copiar por campo (en el
 * teléfono, copiar el número a mano desde una tarjeta es la peor experiencia).
 * Si `presenceOnly` está activo, se ocultan las cuentas y se muestra la variante
 * "el mejor regalo es tu presencia".
 */

import { useCallback, useState } from 'react';
import type { GiftAccountSchema, WeddingConfig } from '@boda/shared';
import type { z } from 'zod';
import { copyToClipboard } from '../../lib/api';
import { OutlineLink, Reveal, SectionShell } from './parts';

type GiftAccount = z.infer<typeof GiftAccountSchema>;

export interface GiftsSectionProps {
  config: WeddingConfig;
}

interface CopyField {
  key: string;
  label: string;
  value: string;
}

/** Campos copiables de una cuenta, en el orden en que se muestran. */
function accountFields(account: GiftAccount): CopyField[] {
  const fields: CopyField[] = [];
  if (account.holder) fields.push({ key: 'holder', label: 'Titular', value: account.holder });
  if (account.bank) fields.push({ key: 'bank', label: 'Banco', value: account.bank });
  if (account.number) fields.push({ key: 'number', label: 'Número de cuenta', value: account.number });
  if (account.alias) fields.push({ key: 'alias', label: 'Alias', value: account.alias });
  return fields;
}

function CopyButton({ field }: { field: CopyField }): JSX.Element {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async (): Promise<void> => {
    const ok = await copyToClipboard(field.value);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [field.value]);

  return (
    <button
      type="button"
      className={`gift-field__copy${copied ? ' is-copied' : ''}`}
      onClick={() => void onCopy()}
      aria-label={`Copiar ${field.label}`}
    >
      {copied ? (
        <>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copiado
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M15 5H6a2 2 0 0 0-2 2v9" strokeLinecap="round" />
          </svg>
          Copiar
        </>
      )}
    </button>
  );
}

export function GiftsSection({ config }: GiftsSectionProps): JSX.Element | null {
  const gifts = config.gifts;
  const accounts = gifts.accounts.filter(
    (account) => Boolean(account.number || account.alias || account.holder),
  );
  const message = gifts.message.trim();
  const registryUrl = gifts.registryUrl?.trim() ?? '';

  if (gifts.presenceOnly) {
    return (
      <SectionShell id="gifts" eyebrow="Un detalle" title="Regalos">
        <div className="gifts gifts--presence">
          <span className="gifts__heart" aria-hidden="true">
            ♥
          </span>
          <p className="gifts__presence-title">El mejor regalo es tu presencia</p>
          {message ? <p className="gifts__text">{message}</p> : null}
          <p className="gifts__text gifts__text--soft">
            Tu compañía en este día es lo único que necesitamos. Si igual querés tener un gesto con
            nosotros, cualquier ayuda para empezar nuestra vida juntos será bienvenida.
          </p>
        </div>
      </SectionShell>
    );
  }

  if (!message && accounts.length === 0 && !registryUrl) return null;

  return (
    <SectionShell id="gifts" eyebrow="Con cariño" title="Regalos">
      <div className="gifts">
        {message ? <p className="gifts__text">{message}</p> : null}

        {accounts.length > 0 ? (
          <ul className="gifts__accounts">
            {accounts.map((account, index) => {
              const fields = accountFields(account);
              return (
                <Reveal as="li" key={`${account.label}-${index}`} delay={index * 70} className="gift-card">
                  <div className="gift-card__head">
                    <span className="gift-card__label">{account.label || 'Cuenta bancaria'}</span>
                    {account.currency ? (
                      <span className="gift-card__currency">{account.currency.toUpperCase()}</span>
                    ) : null}
                  </div>

                  <dl className="gift-card__fields">
                    {fields.map((field) => (
                      <div className="gift-field" key={field.key}>
                        <dt className="gift-field__label">{field.label}</dt>
                        <dd className="gift-field__value">
                          <span className="gift-field__text mono">{field.value}</span>
                          <CopyButton field={field} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Reveal>
              );
            })}
          </ul>
        ) : null}

        {registryUrl ? (
          <div className="gifts__registry">
            <OutlineLink href={registryUrl}>Ver nuestra lista de regalos</OutlineLink>
          </div>
        ) : null}
      </div>
    </SectionShell>
  );
}

export default GiftsSection;
