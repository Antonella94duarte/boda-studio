/**
 * ---------------------------------------------------------------------------
 * Tema de la invitación: la config de cada boda se traduce a variables CSS.
 * ---------------------------------------------------------------------------
 * Regla de oro: el CSS nunca tiene colores "de marca" escritos a mano. Todo
 * pasa por --c-* y --font-*, por eso dos bodas pueden verse totalmente distintas
 * sin duplicar estilos.
 *
 * Los valores se escriben en `:root` y el renderizador de la invitación los
 * limpia al desmontar, para que no se filtren al panel de administración.
 */

import type { Theme } from '@boda/shared';

/** Variable CSS -> campo de Theme. */
const COLOR_VARS: ReadonlyArray<[string, keyof Theme]> = [
  ['--c-primary', 'primary'],
  ['--c-accent', 'accent'],
  ['--c-bg', 'background'],
  ['--c-surface', 'surface'],
  ['--c-text', 'text'],
  ['--c-muted', 'muted'],
];

const FONT_VARS: ReadonlyArray<[string, keyof Theme]> = [
  ['--font-heading', 'fontHeading'],
  ['--font-body', 'fontBody'],
];

export const THEME_CSS_VARS: readonly string[] = [
  ...COLOR_VARS.map(([name]) => name),
  ...FONT_VARS.map(([name]) => name),
];

/**
 * Saca las comillas del valor de una fuente.
 * El esquema guarda `'Cormorant Garamond', serif` con comillas pensando en CSS;
 * si se pasan tal cual a `style.setProperty` el navegador las recorta y la fuente
 * deja de aplicarse. Por eso se limpian y se vuelven a citar al vuelo.
 */
function sanitizeFont(value: string): string {
  return value.replace(/['"]/g, '').trim();
}

function sanitizeColor(value: string, fallback: string): string {
  const clean = value.trim();
  if (!clean) return fallback;
  // Acepta #rgb, #rrggbb, rgb()/rgba()/hsl() y nombres de color.
  if (/^#[0-9a-fA-F]{3,8}$/.test(clean)) return clean;
  if (/^(rgb|rgba|hsl|hsla|color-mix|oklch)\(/i.test(clean)) return clean;
  if (/^[a-zA-Z]+$/.test(clean)) return clean;
  return fallback;
}

export interface ThemeVariables {
  [name: string]: string;
}

/**
 * Luminancia relativa (0 = negro, 1 = blanco) de un color hex.
 * Se usa para adaptar la portada: una boda con tema claro puede tener una
 * ilustración en acuarela sobre fondo blanco (no una foto a sangre), y ahí un
 * degradado negro se vería sucio. Con esto el render elige el tratamiento.
 */
function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return 0.95;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const toLinear = (channel: number): number =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Convierte un Theme en el mapa de custom properties listo para aplicar. */
export function themeVariables(theme: Theme): ThemeVariables {
  const vars: ThemeVariables = {};
  for (const [name, key] of COLOR_VARS) {
    const raw = theme[key];
    vars[name] = sanitizeColor(typeof raw === 'string' ? raw : '', '#8a7a63');
  }
  for (const [name, key] of FONT_VARS) {
    const raw = theme[key];
    vars[name] = sanitizeFont(typeof raw === 'string' ? raw : '');
  }
  vars['--font-script'] = "'Great Vibes', cursive";

  // Derivados que el CSS de la invitación usa para la portada.
  const bg = vars['--c-bg'] ?? '#fbf8f3';
  const light = luminance(bg) > 0.62;
  vars['--c-lum'] = light ? '1' : '0';
  vars['--hero-surface'] = light ? bg : 'var(--c-text)';
  vars['--hero-text'] = light ? 'var(--c-text)' : '#ffffff';
  vars['--hero-text-soft'] = light
    ? 'color-mix(in srgb, var(--c-text) 68%, var(--c-bg))'
    : 'rgba(255, 255, 255, 0.86)';
  return vars;
}

/**
 * Escribe el tema en `:root`. Devuelve una función para revertirlo
 * (la usa la invitación al desmontarse).
 */
export function applyTheme(theme: Theme, root?: HTMLElement): () => void {
  const element = root ?? document.documentElement;
  const vars = themeVariables(theme);
  const previous = new Map<string, string>();

  for (const [name, value] of Object.entries(vars)) {
    previous.set(name, element.style.getPropertyValue(name));
    element.style.setProperty(name, value);
  }

  // El navegador pinta la barra de estado del teléfono con este color.
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const previousThemeColor = themeColor?.content ?? '';
  if (themeColor && vars['--c-bg']) themeColor.content = vars['--c-bg'];

  element.setAttribute('data-theme', theme.preset || 'custom');

  return () => {
    for (const [name, value] of previous) {
      if (value) element.style.setProperty(name, value);
      else element.style.removeProperty(name);
    }
    element.removeAttribute('data-theme');
    if (themeColor && previousThemeColor) themeColor.content = previousThemeColor;
  };
}

function makeTheme(partial: Partial<Theme> & Pick<Theme, 'preset'>): Theme {
  return {
    primary: '#8a7a63',
    accent: '#c9a227',
    background: '#fbf8f3',
    surface: '#ffffff',
    text: '#2f2a24',
    muted: '#7d7468',
    fontHeading: "'Cormorant Garamond', serif",
    fontBody: "'Montserrat', sans-serif",
    ...partial,
  };
}

/**
 * Cuatro presets listos para elegir desde el panel.
 * La organizadora parte de uno y ajusta colores si quiere.
 */
export const THEME_PRESETS: Record<'elegant' | 'modern' | 'minimal' | 'rustic', Theme> = {
  elegant: makeTheme({
    preset: 'elegant',
    primary: '#8a7a63',
    accent: '#c9a227',
    background: '#fbf8f3',
    surface: '#ffffff',
    text: '#2f2a24',
    muted: '#7d7468',
  }),
  modern: makeTheme({
    preset: 'modern',
    primary: '#2f3e46',
    accent: '#e07a5f',
    background: '#f6f7f8',
    surface: '#ffffff',
    text: '#1b1f22',
    muted: '#66727a',
    fontHeading: "'Montserrat', sans-serif",
    fontBody: "'Montserrat', sans-serif",
  }),
  minimal: makeTheme({
    preset: 'minimal',
    primary: '#1a1a1a',
    accent: '#1a1a1a',
    background: '#ffffff',
    surface: '#ffffff',
    text: '#111111',
    muted: '#8a8a8a',
    fontHeading: "'Cormorant Garamond', serif",
    fontBody: "'Montserrat', sans-serif",
  }),
  rustic: makeTheme({
    preset: 'rustic',
    primary: '#6b7f5a',
    accent: '#b5651d',
    background: '#f7f3e8',
    surface: '#fffdf7',
    text: '#3b3327',
    muted: '#857a63',
    fontHeading: "'Cormorant Garamond', serif",
    fontBody: "'Montserrat', sans-serif",
  }),
};

export type ThemePresetName = keyof typeof THEME_PRESETS;

export const THEME_PRESET_OPTIONS: ReadonlyArray<{
  value: ThemePresetName;
  label: string;
  description: string;
}> = [
  { value: 'elegant', label: 'Elegante', description: 'Arena y dorado: clásico de boda.' },
  { value: 'modern', label: 'Moderno', description: 'Grafito y terracota, tipografía recta.' },
  { value: 'minimal', label: 'Minimalista', description: 'Blanco y negro, solo lo esencial.' },
  { value: 'rustic', label: 'Campestre', description: 'Verde oliva y tierra, aire de campo.' },
];

/** Aplica un preset conservando el `preset` elegido. */
export function themeFromPreset(name: ThemePresetName): Theme {
  return { ...THEME_PRESETS[name] };
}

export const FONT_HEADING_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "'Cormorant Garamond', serif", label: 'Cormorant Garamond (serif elegante)' },
  { value: "'Great Vibes', cursive", label: 'Great Vibes (caligráfica)' },
  { value: "'Montserrat', sans-serif", label: 'Montserrat (sans moderna)' },
  { value: "Georgia, 'Times New Roman', serif", label: 'Georgia (serif clásica)' },
];

export const FONT_BODY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "'Montserrat', sans-serif", label: 'Montserrat' },
  { value: "'Cormorant Garamond', serif", label: 'Cormorant Garamond' },
  { value: "system-ui, -apple-system, 'Segoe UI', sans-serif", label: 'Tipografía del sistema' },
];

/** Nombres legibles de las secciones, para el editor del panel. */
export const SECTION_LABELS: Record<string, string> = {
  hero: 'Portada',
  countdown: 'Cuenta regresiva',
  quote: 'Versículo o frase',
  story: 'Nuestra historia',
  gallery: 'Galería',
  events: 'Ceremonias y fiesta',
  dressCode: 'Código de vestimenta',
  gifts: 'Regalos',
  rsvp: 'Confirmación (RSVP)',
  closing: 'Despedida',
};
