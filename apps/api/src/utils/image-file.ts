/**
 * ---------------------------------------------------------------------------
 * Validación de las imágenes que sube la organizadora.
 * ---------------------------------------------------------------------------
 * Todo lo que entra por un formulario es sospechoso: el `Content-Type` y la
 * extensión los elige el navegador (o quien mande la petición), así que acá se
 * miran los **primeros bytes** del archivo para decidir qué es de verdad.
 *
 * Módulo puro a propósito (no toca disco ni `env`): las pruebas lo verifican
 * sin base de datos ni configuración.
 */

/** 8 MB por imagen: una foto de portada de un celular moderno ronda los 3-5 MB. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Tope por boda, para que el disco del servidor no crezca sin control. */
export const MAX_IMAGES_PER_WEDDING = 80;

export type ImageKind = 'jpeg' | 'png' | 'webp';

export interface DetectedImage {
  kind: ImageKind;
  /** Extensión canónica con la que se guarda (sin punto). */
  extension: 'jpg' | 'png' | 'webp';
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
}

const MIME_BY_EXTENSION: Record<DetectedImage['extension'], DetectedImage['mime']> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const EXTENSIONS = new Set(['jpg', 'png', 'webp']);

/**
 * Reconoce el formato por los bytes de cabecera (magic numbers).
 * Devuelve `null` si no es una imagen de un formato aceptado.
 */
export function detectImage(buffer: Buffer): DetectedImage | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { kind: 'jpeg', extension: 'jpg', mime: MIME_BY_EXTENSION.jpg };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG.every((byte, index) => buffer[index] === byte)) {
    return { kind: 'png', extension: 'png', mime: MIME_BY_EXTENSION.png };
  }

  // WebP: "RIFF" (4 bytes) + tamaño (4) + "WEBP"
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { kind: 'webp', extension: 'webp', mime: MIME_BY_EXTENSION.webp };
  }

  return null;
}

/** Motivo legible del rechazo, listo para mostrarle a la organizadora. */
export function imageRejectionMessage(size: number, detected: DetectedImage | null): string | null {
  if (size <= 0) return 'El archivo está vacío.';
  if (size > MAX_IMAGE_BYTES) {
    return `La imagen pesa ${formatBytes(size)} y el máximo es ${formatBytes(MAX_IMAGE_BYTES)}. Achicala un poco y volvé a intentar.`;
  }
  if (!detected) {
    return 'El archivo no es una imagen JPG, PNG o WebP. Si es un HEIC (iPhone) o un PDF, convertilo primero.';
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Valida un nombre de archivo ya guardado: solo nombres que genera el sistema
 * (`<base36>-<hex>.jpg`). Bloquea `..`, barras y cualquier cosa rara que
 * llegue por la URL pública.
 */
export function isStoredImageName(name: string): boolean {
  if (typeof name !== 'string' || name.length < 8 || name.length > 80) return false;
  const match = /^([a-z0-9]+)-([a-f0-9]+)\.([a-z]+)$/.exec(name);
  if (!match) return false;
  const extension = match[3];
  return extension !== undefined && EXTENSIONS.has(extension);
}

/** Identificadores (ids de boda) que se pueden usar como carpeta. */
export function isSafeSegment(value: string): boolean {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

/** Tipo MIME para servir una imagen ya validada. */
export function mimeForStoredName(name: string): string {
  const extension = name.split('.').pop() ?? '';
  return EXTENSIONS.has(extension) ? MIME_BY_EXTENSION[extension as DetectedImage['extension']] : 'application/octet-stream';
}
