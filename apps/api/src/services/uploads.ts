import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { env } from '../env.js';
import {
  MAX_IMAGES_PER_WEDDING,
  detectImage,
  imageRejectionMessage,
  isSafeSegment,
  isStoredImageName,
  mimeForStoredName,
  type DetectedImage,
} from '../utils/image-file.js';

/**
 * ---------------------------------------------------------------------------
 * Fotos de las invitaciones, guardadas en disco.
 * ---------------------------------------------------------------------------
 * Estructura: `UPLOAD_DIR/weddings/<idDeBoda>/<base36>-<hex>.<ext>`.
 *
 * - El nombre lo genera el servidor: nunca se usa el que manda el navegador
 *   (evita `../`, nombres repetidos y caracteres raros).
 * - La extensión sale del contenido real del archivo (magic bytes), no de lo
 *   que dice el cliente.
 * - Los archivos se sirven en `/api/uploads/<boda>/<archivo>`: al vivir bajo
 *   `/api`, el proxy de Vite en desarrollo y nginx en producción ya los
 *   alcanzan sin configuración extra.
 */

/** Error de subida con un mensaje ya listo para el panel. */
export class UploadError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'UploadError';
    this.statusCode = statusCode;
  }
}

export interface StoredImage {
  /** Nombre del archivo dentro de la carpeta de la boda. */
  file: string;
  /** Ruta pública (`/api/uploads/<boda>/<archivo>`). */
  url: string;
  /** Tamaño en bytes. */
  size: number;
  /** ISO 8601 del momento en que se guardó (según el disco). */
  uploadedAt: string;
}

function baseDir(): string {
  return resolve(env.UPLOAD_DIR);
}

function weddingDir(weddingId: string): string {
  if (!isSafeSegment(weddingId)) {
    throw new UploadError('Identificador de boda inválido', 400);
  }
  return join(baseDir(), 'weddings', weddingId);
}

export function publicUrlFor(weddingId: string, file: string): string {
  return `/api/uploads/${encodeURIComponent(weddingId)}/${encodeURIComponent(file)}`;
}

/**
 * Ruta absoluta de una imagen ya guardada, o `null` si el nombre no es de los
 * que genera el sistema o si el resultado se saliera de la carpeta.
 */
export function resolveImagePath(weddingId: string, file: string): string | null {
  if (!isSafeSegment(weddingId) || !isStoredImageName(file)) return null;

  const directory = join(baseDir(), 'weddings', weddingId);
  const candidate = join(directory, file);

  // Cinturón y tirantes: aunque los nombres ya se validan, se comprueba que la
  // ruta final siga dentro de la carpeta de esa boda.
  const root = resolve(directory) + sep;
  return resolve(candidate).startsWith(root) ? candidate : null;
}

async function listFiles(weddingId: string, extension?: string): Promise<StoredImage[]> {
  const directory = weddingDir(weddingId);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return []; // Todavía no subió nada: la carpeta no existe.
  }

  const images: StoredImage[] = [];
  for (const name of names) {
    if (!isStoredImageName(name)) continue;
    if (extension && !name.endsWith(`.${extension}`)) continue;
    const info = await stat(join(directory, name)).catch(() => null);
    if (!info || !info.isFile()) continue;
    images.push({
      file: name,
      url: publicUrlFor(weddingId, name),
      size: info.size,
      uploadedAt: info.mtime.toISOString(),
    });
  }

  return images.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/** Todas las fotos de una boda, de la más nueva a la más vieja. */
export async function listImages(weddingId: string): Promise<StoredImage[]> {
  return listFiles(weddingId);
}

/** Datos de una imagen concreta (para saber su tamaño y tipo antes de servirla). */
export async function imageInfo(
  weddingId: string,
  file: string,
): Promise<{ path: string; size: number; mime: string } | null> {
  const path = resolveImagePath(weddingId, file);
  if (!path) return null;

  const info = await stat(path).catch(() => null);
  if (!info || !info.isFile()) return null;

  return { path, size: info.size, mime: mimeForStoredName(file) };
}

/** Stream de lectura para servir la imagen. */
export function imageStream(path: string): NodeJS.ReadableStream {
  return createReadStream(path);
}

/**
 * Guarda una imagen nueva. Valida tamaño y formato real antes de escribir.
 * Lanza `UploadError` con un mensaje para la organizadora si no sirve.
 */
export async function saveImage(weddingId: string, buffer: Buffer): Promise<StoredImage> {
  const detected: DetectedImage | null = detectImage(buffer);

  const rejection = imageRejectionMessage(buffer.length, detected);
  if (rejection) {
    throw new UploadError(rejection, buffer.length > 0 ? 413 : 400);
  }
  if (!detected) throw new UploadError('El archivo no es una imagen válida');

  const existing = await listFiles(weddingId);
  if (existing.length >= MAX_IMAGES_PER_WEDDING) {
    throw new UploadError(
      `Esta boda ya tiene ${MAX_IMAGES_PER_WEDDING} fotos, que es el máximo. Borrá alguna antes de subir otra.`,
      409,
    );
  }

  const directory = weddingDir(weddingId);
  await mkdir(directory, { recursive: true });

  const name = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${detected.extension}`;
  const path = join(directory, name);
  await writeFile(path, buffer, { flag: 'wx' });

  return {
    file: name,
    url: publicUrlFor(weddingId, name),
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
  };
}

/** Borra una imagen. Devuelve `false` si no existía (o no era un nombre válido). */
export async function deleteImage(weddingId: string, file: string): Promise<boolean> {
  const path = resolveImagePath(weddingId, file);
  if (!path) return false;

  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Borra todas las fotos de una boda (cuando se elimina la boda).
 * No falla si la carpeta no existe.
 */
export async function deleteWeddingImages(weddingId: string): Promise<void> {
  const directory = resolve(baseDir(), 'weddings', weddingId);
  const root = resolve(baseDir(), 'weddings') + sep;
  if (!directory.startsWith(root)) return;
  await rm(directory, { recursive: true, force: true }).catch(() => undefined);
}
