# ---------------------------------------------------------------------------
# Boda Studio — API (Fastify + Prisma + WhatsApp)
# ---------------------------------------------------------------------------
# Multi-stage: se compila todo el workspace con pnpm y la imagen final solo
# lleva lo necesario para ejecutar `node dist/server.js`.
#
# IMPORTANTE: /app/storage/sessions guarda la sesión de WhatsApp (Baileys).
# Debe montarse como volumen persistente: si se pierde, hay que escanear el QR
# otra vez desde el panel.
# ---------------------------------------------------------------------------

# --- Base -------------------------------------------------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

# --- Dependencias -----------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile=false --prod=false

# --- Compilación ------------------------------------------------------------
FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
# El cliente de Prisma se genera en el build (no hace falta base de datos).
RUN pnpm --filter @boda/api exec prisma generate
RUN pnpm --filter @boda/api build

# --- Runtime ----------------------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    WHATSAPP_SESSION_DIR=/app/storage/sessions
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
RUN mkdir -p /app/storage/sessions /app/storage/uploads

WORKDIR /app/apps/api
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
