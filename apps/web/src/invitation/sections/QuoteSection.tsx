/**
 * Versículo o frase. Las tarjetas paraguayas de boda suelen llevar un versículo
 * bíblico (Colosenses 3:14, 1 Corintios 13:4). Si la organizadora no cargó uno,
 * se muestra el texto por defecto en lugar de dejar el hueco vacío.
 */

import type { WeddingConfig } from '@boda/shared';
import { SectionShell } from './parts';

export interface QuoteSectionProps {
  config: WeddingConfig;
}

const FALLBACK_TEXT = 'Sobre todo, vístanse de amor, que es el vínculo perfecto.';
const FALLBACK_SOURCE = 'Colosenses 3:14';

export function QuoteSection({ config }: QuoteSectionProps): JSX.Element {
  const text = config.quote.text.trim() || FALLBACK_TEXT;
  const source = (config.quote.source ?? '').trim() || (config.quote.text.trim() ? '' : FALLBACK_SOURCE);

  return (
    <SectionShell id="quote" className="section--quote">
      <figure className="quote">
        <span className="quote__mark" aria-hidden="true">
          &ldquo;
        </span>
        <blockquote className="quote__text">{text}</blockquote>
        {source ? <figcaption className="quote__source">{source}</figcaption> : null}
      </figure>
    </SectionShell>
  );
}

export default QuoteSection;
