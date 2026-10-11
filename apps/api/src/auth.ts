import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from './prisma.js';

/**
 * ---------------------------------------------------------------------------
 * Autenticación.
 * ---------------------------------------------------------------------------
 * Una sola cuenta por organizadora. El panel entra con email + contraseña y
 * recibe un JWT que viaja en `Authorization: Bearer <token>`.
 */

export interface AuthPayload {
  sub: string;
  email: string;
  role: string;
}

/** Tipado de `request.user` y del payload firmado (documentado por @fastify/jwt). */
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthPayload;
    user: AuthPayload;
  }
}

export type AuthenticateHook = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: AuthenticateHook;
  }
}

/**
 * preHandler de las rutas privadas: verifica el Bearer token y corta con 401
 * si falta o venció. Se registra como decorador (`app.authenticate`) para que
 * todas las rutas lo usen igual.
 */
export const authenticate: AuthenticateHook = async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({
      error: 'No autenticado',
      message: 'Falta el token o la sesión venció. Iniciá sesión otra vez.',
    });
  }
};

export const LoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

/**
 * Plugin de rutas de autenticación. Se registra bajo el prefijo `/api`
 * (ver `src/routes/auth.ts`).
 */
export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const email = body.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      reply.code(401).send({
        error: 'Credenciales inválidas',
        message: 'El email o la contraseña no son correctos.',
      });
      return;
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      reply.code(401).send({
        error: 'Credenciales inválidas',
        message: 'El email o la contraseña no son correctos.',
      });
      return;
    }

    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role });

    reply.send({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) {
      reply.code(401).send({
        error: 'No autenticado',
        message: 'La cuenta del token ya no existe.',
      });
      return;
    }

    reply.send({ id: user.id, email: user.email, name: user.name, role: user.role });
  });
}
