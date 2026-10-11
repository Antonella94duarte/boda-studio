# ---------------------------------------------------------------------------
# Boda Studio — panel + invitación pública (SPA de Vite)
# Etapa 1: build con Node 20. Etapa 2: nginx sirviendo archivos estáticos.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS build

WORKDIR /repo

RUN corepack enable

# Manifiestos primero: mejor caché de capas.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile=false --filter @boda/web... || pnpm install --filter @boda/web...

# Código fuente necesario para compilar la SPA.
COPY packages/shared packages/shared
COPY apps/web apps/web

RUN pnpm --filter @boda/web build

# ---------------------------------------------------------------------------

FROM nginx:1.27-alpine AS serve

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
