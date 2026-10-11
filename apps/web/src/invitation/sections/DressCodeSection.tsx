/**
 * Código de vestimenta: texto + muestras de la paleta sugerida.
 * La paleta son colores hex, así el invitado ve de un vistazo qué tonos evitar
 * o acompañar. Si no hay paleta, la sección queda solo con el texto.
 */

import type { WeddingConfig } from '@boda/shared';
import { SectionShell } from './parts';

export interface DressCodeSectionProps {
  config: WeddingConfig;
}

export function DressCodeSection({ config }: DressCodeSectionProps): JSX.Element | null {
  const dress = config.dressCode;
  const text = dress.text.trim();
  const palette = dress.palette.filter(Boolean);

  if (!text && palette.length === 0) return null;

  return (
    <SectionShell id="dressCode" eyebrow="Para que brilles" title={dress.title || 'Código de vestimenta'}>
      <div className="dress">
        {text ? <p className="dress__text">{text}</p> : null}

        {palette.length > 0 ? (
          <>
            <p className="dress__palette-label">Paleta sugerida</p>
            <ul className="dress__palette">
              {palette.map((color) => (
                <li
                  key={color}
                  className="dress__swatch"
                  style={{ backgroundColor: color }}
                  title={color}
                >
                  <span className="sr-only">Color {color}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </SectionShell>
  );
}

export default DressCodeSection;
