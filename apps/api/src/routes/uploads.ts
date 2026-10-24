import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { logEvent } from '../services/events.js';
import {
  UploadError,
  deleteImage,
  imageInfo,
  imageStream,
  listImages,
  publicUrlFor,
  saveImage,
  type StoredImage,
} from '../services/uploads.js';
import { parseWeddingConfig, serializeWeddingConfig } from '../services/wedding-config.js';
import { requireOwnedWedding } from '../services/weddings.js';
import { IdParamsSchema, sendError } from './helpers.js';

/**
 * ---------------------------------------------------------------------------
 * Fotos de la invitación (subida, listado y borrado).
 * ---------------------------------------------------------------------------
 * El panel sube las fotos acá y después guarda su ruta en la configuración de
 * la boda (`heroImage`, `gallery`, `story.photos`), que es lo que lee la
 * invitación pública. Así el JSON de la boda sigue siendo la única fuente de
 * verdad de lo que se ve, y la foto es un archivo aparte con su URL.
 *
 * Las imágenes se sirven en `/api/uploads/<boda>/<archivo>` **sin** token:
 * los invitados abren la invitación sin sesión. El nombre del archivo lo
 * genera el servidor y no se puede adivinar.
 */

const FileParamsSchema = z.object({
  id: z.string().min(1).max(64),
  file: z.string().min(1).max(120),
});

/** Tope de archivos por petición: subir 10 fotos de 5 MB ya son 50 MB. */
const MAX_FILES_PER_REQUEST = 10;

export default async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** Fotos ya subidas de esta boda (para mostrar la grilla del editor). */
  app.get('/weddings/:id/images', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const images = await listImages(wedding.id);
    reply.send({ images });
  });

  /**
   * Sube una o varias fotos. Devuelve las que se guardaron y, si alguna falló,
   * el motivo por archivo (así la organizadora sabe cuál corregir).
   */
  app.post('/weddings/:id/images', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const saved: StoredImage[] = [];
    const errors: string[] = [];
    let files = 0;

    for await (const part of request.parts()) {
      if (part.type !== 'file') continue;
      files += 1;

      if (files > MAX_FILES_PER_REQUEST) {
        errors.push(`Máximo ${MAX_FILES_PER_REQUEST} fotos por vez.`);
        // Se sigue leyendo el stream para no cortar la petición a la mitad.
        await part.toBuffer().catch(() => undefined);
        continue;
      }

      const buffer = await part.toBuffer();
      try {
        saved.push(await saveImage(wedding.id, buffer));
      } catch (error) {
        if (error instanceof UploadError) {
          errors.push(`${part.filename || 'archivo'}: ${error.message}`);
          continue;
        }
        throw error;
      }
    }

    if (saved.length === 0) {
      sendError(
        reply,
        400,
        'No se pudo subir la imagen',
        errors[0] ?? `El formulario tiene que incluir la imagen en el campo "file".`,
        { errors },
      );
      return;
    }

    await logEvent({
      weddingId: wedding.id,
      type: 'wedding.image_uploaded',
      message:
        saved.length === 1
          ? `Se subió una foto a la invitación (${saved[0]?.file})`
          : `Se subieron ${saved.length} fotos a la invitación`,
      payload: { files: saved.map((image) => image.file), errors },
    });

    reply.code(201).send({ images: saved, errors });
  });

  /**
   * Borra una foto y limpia las referencias que quedaran en la configuración,
   * para que la invitación no muestre una imagen rota.
   */
  app.delete('/weddings/:id/images/:file', async (request, reply) => {
    const { id, file } = FileParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const removed = await deleteImage(wedding.id, file);
    if (!removed) {
      sendError(reply, 404, 'Imagen no encontrada', 'Esa foto ya no existe.');
      return;
    }

    const url = publicUrlFor(wedding.id, file);
    const config = parseWeddingConfig(wedding.config, wedding.slug);
    let changed = false;

    if (config.heroImage === url) {
      config.heroImage = undefined;
      changed = true;
    }

    const gallery = config.gallery.filter((photo) => photo !== url);
    if (gallery.length !== config.gallery.length) {
      config.gallery = gallery;
      changed = true;
    }

    const storyPhotos = config.story.photos.filter((photo) => photo !== url);
    if (storyPhotos.length !== config.story.photos.length) {
      config.story = { ...config.story, photos: storyPhotos };
      changed = true;
    }

    if (changed) {
      await prisma.wedding.update({
        where: { id: wedding.id },
        data: { config: serializeWeddingConfig(config) },
      });
    }

    await logEvent({
      weddingId: wedding.id,
      type: 'wedding.image_deleted',
      message: `Se borró la foto ${file} de la invitación`,
      payload: { file, referencesRemoved: changed },
    });

    reply.send({ ok: true, file, referencesRemoved: changed });
  });
}

/**
 * Servido público de las imágenes. Sin `authenticate` a propósito: el invitado
 * que abre su invitación no tiene sesión. El nombre incluye 12 caracteres
 * aleatorios, así que no se puede adivinar la foto de otra boda.
 */
export async function publicImageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/uploads/:id/:file', async (request, reply) => {
    const parsed = FileParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(404).send({ error: 'Imagen no encontrada', message: 'La imagen no existe.' });
      return;
    }

    const info = await imageInfo(parsed.data.id, parsed.data.file);
    if (!info) {
      reply.code(404).send({ error: 'Imagen no encontrada', message: 'La imagen no existe.' });
      return;
    }

    reply
      .header('content-type', info.mime)
      .header('content-length', String(info.size))
      // El nombre del archivo es único: se puede cachear para siempre.
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff');

    return reply.send(imageStream(info.path));
  });
}
