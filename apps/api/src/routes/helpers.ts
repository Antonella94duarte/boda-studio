import type { FastifyReply } from 'fastify';
import { z } from 'zod';

/**
 * Utilidades compartidas por las rutas: errores con formato único, esquemas de
 * parámetros y generación de slugs.
 *
 * Todos los cuerpos, consultas y parámetros se validan con Zod. Si la
 * validación falla, ZodError llega al manejador global, que responde 400 con
 * el detalle de cada campo.
 */

export interface ApiErrorBody {
  error: string;
  message: string;
  [key: string]: unknown;
}

export function sendError(
  reply: FastifyReply,
  status: number,
  error: string,
  message: string,
  extra: Record<string, unknown> = {},
): void {
  reply.code(status).send({ error, message, ...extra } satisfies ApiErrorBody);
}

/** Error con código HTTP para lanzar desde helpers profundos. */
export function httpError(status: number, message: string, error = 'Solicitud inválida'): Error {
  const failure = new Error(message) as Error & { statusCode: number; errorLabel: string };
  failure.statusCode = status;
  failure.errorLabel = error;
  return failure;
}

export const IdSchema = z.string().min(1).max(64);

export const IdParamsSchema = z.object({ id: IdSchema });

export const WeddingGuestParamsSchema = z.object({ id: IdSchema, guestId: IdSchema });

export const SlugTokenParamsSchema = z.object({
  slug: z.string().min(1).max(80),
  token: z.string().min(1).max(128),
});

export const SlugSchema = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones');

/** "Vanessa & Héctor — 11/07/2026" -> "vanessa-hector-11-07-2026" */
export function slugify(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  if (base.length >= 3) return base;

  // Un slug demasiado corto (o vacío) se completa con azar para que sea único.
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base === '' ? 'boda' : base}-${suffix}`;
}
