# @boda/api — API de Boda Studio

Backend del estudio: bodas (invitaciones web), invitados, importación de listas
desde Excel/CSV, envío masivo personalizado por WhatsApp y confirmaciones (RSVP).

- **Fastify 4** + Zod para validar todo lo que entra.
- **Prisma** + SQLite en desarrollo, PostgreSQL en producción.
- **WhatsApp**: Baileys (no oficial, QR) · Cloud API de Meta · modo `preview`
  (seco, no envía nada).
- **TypeScript estricto**, ESM (`"type": "module"`), imports locales con `.js`.

---

## Cómo correrlo

Desde la raíz del monorepo (el `pnpm install` se hace una sola vez):

```bash
pnpm install
cp .env.example .env                 # opcional: hay valores por defecto

pnpm --filter @boda/api db:push      # crea/actualiza el esquema (SQLite: prisma/dev.db)
pnpm --filter @boda/api db:seed      # organizadora + boda de demostración + invitados
pnpm --filter @boda/api dev          # API en http://localhost:4000 (tsx watch)
```

Comandos disponibles:

| Comando | Qué hace |
| --- | --- |
| `pnpm --filter @boda/api dev` | Desarrollo con recarga (`tsx watch src/server.ts`) |
| `pnpm --filter @boda/api build` | Compila con `tsc` a `dist/` |
| `pnpm --filter @boda/api start` | Producción (`node dist/server.js`) |
| `pnpm --filter @boda/api typecheck` | `tsc --noEmit` |
| `pnpm --filter @boda/api test` | Pruebas con Vitest (no necesitan base de datos) |
| `pnpm --filter @boda/api db:push` | `prisma db push` |
| `pnpm --filter @boda/api db:seed` | Datos iniciales idempotentes |
| `pnpm --filter @boda/api db:studio` | `prisma studio` |

El seed imprime al final el usuario, la contraseña, la URL pública de la
invitación y un enlace de invitado de ejemplo.

---

## Endpoints

Todo vive bajo `/api`. Las rutas marcadas con 🔒 necesitan
`Authorization: Bearer <token>` y verifican que el recurso pertenezca a la
organizadora logueada.

### Salud y sesión

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/health` | Estado de la API, de la base y motor de WhatsApp activo |
| POST | `/api/auth/login` | `{ email, password }` → `{ token, user }` |
| GET | `/api/auth/me` 🔒 | Datos de la cuenta logueada |

### Bodas

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/weddings` 🔒 | Listado con contadores (invitados, confirmados, rechazados, campañas) |
| POST | `/api/weddings` 🔒 | `{ title, slug?, published?, config? }` → crea la boda |
| GET | `/api/weddings/:id` 🔒 | Detalle con la configuración completa |
| PATCH | `/api/weddings/:id` 🔒 | Actualiza título, slug, estado y `config` (parcial) |
| DELETE | `/api/weddings/:id` 🔒 | Elimina la boda (cascada: invitados y campañas) |
| POST | `/api/weddings/:id/publish` 🔒 | `{ published: boolean }` |

### Invitados

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/weddings/:id/guests` 🔒 | Filtros: `?status=pending\|confirmed\|declined\|maybe`, `?q=texto`, `?group=Familia` |
| POST | `/api/weddings/:id/guests` 🔒 | `GuestInputSchema` (`fullName`, `phone`, `passes`, `groupName?`, `notes?`) |
| PATCH | `/api/guests/:guestId` 🔒 | Nombre, teléfono, pases, grupo, notas, estado, acompañantes… |
| DELETE | `/api/guests/:guestId` 🔒 | Elimina el invitado |
| POST | `/api/weddings/:id/guests/:guestId/regenerate-token` 🔒 | Nuevo enlace personalizado (invalida el anterior) |

### Importación

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/api/weddings/:id/import/preview` 🔒 | `multipart/form-data` con `file` (.xlsx/.xls/.csv/.txt/.tsv, máx. 10 MB) y `options` (JSON), **o** JSON `{ headers?, rows, options? }` → `ImportPreview` |
| POST | `/api/weddings/:id/import/commit` 🔒 | `{ rows: ImportRowPreview[], options }` → `{ created, updated, skipped, errors }` |
| GET | `/api/weddings/:id/import/history` 🔒 | Últimas importaciones registradas |

La previsualización **no escribe nada**: muestra el mapeo de columnas detectado,
el teléfono normalizado de cada fila y los problemas encontrados
(`ok` / `warning` / `error`).

### Campañas de WhatsApp

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/weddings/:id/campaigns` 🔒 | Campañas de la boda |
| POST | `/api/weddings/:id/campaigns` 🔒 | `CreateCampaignSchema` → crea los envíos y arranca |
| GET | `/api/campaigns/:id` 🔒 | Detalle y contadores |
| POST | `/api/campaigns/:id/pause` 🔒 | Pausa (el bucle se detiene antes del próximo mensaje) |
| POST | `/api/campaigns/:id/resume` 🔒 | Reanuda desde los pendientes |
| POST | `/api/campaigns/:id/cancel` 🔒 | Cancela definitivamente |
| GET | `/api/campaigns/:id/items?status=` 🔒 | Estado de cada mensaje (texto renderizado, intentos, error) |

Sin `guestIds`, la campaña se crea para todos los invitados con RSVP `pending`.

### WhatsApp

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/whatsapp/status` 🔒 | Motor activo, estado, número y error |
| POST | `/api/whatsapp/connect` 🔒 | Inicia la conexión (Baileys: genera el QR) |
| POST | `/api/whatsapp/logout` 🔒 | Cierra la sesión y borra las credenciales guardadas |
| GET | `/api/whatsapp/qr` 🔒 | Último QR como data URL para mostrar en el panel |

### Público (sin autenticación)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/public/weddings/:slug` | `{ slug, config }`; 404 si la boda no está publicada |
| GET | `/api/public/weddings/:slug/guest/:token` | Datos del invitado (`PublicGuest`) |
| POST | `/api/public/weddings/:slug/guest/:token/rsvp` | `RsvpSubmissionSchema` → guarda la confirmación |

Nunca se exponen teléfonos, notas internas ni datos de otros invitados.

---

## Variables de entorno

Todas tienen valor por defecto, así que la API arranca sin `.env` (modo
`preview`: no envía nada real). En producción, cambiá al menos `JWT_SECRET`,
`ADMIN_PASSWORD` y `DATABASE_URL`.

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `4000` | Puerto HTTP |
| `PUBLIC_WEB_URL` | `http://localhost:5173` | Arma el enlace `/i/<slug>/<token>` y define el CORS |
| `PUBLIC_API_URL` | `http://localhost:4000` | URL pública de la API |
| `DATABASE_URL` | `file:./dev.db` | SQLite en desarrollo, PostgreSQL en producción |
| `JWT_SECRET` | *(dev)* | Firma de los tokens; **cambiar en producción** |
| `ADMIN_EMAIL` | `organizadora@bodastudio.com` | Usuario que crea el seed |
| `ADMIN_PASSWORD` | `CambiarEstaClave123` | Contraseña que crea el seed |
| `WHATSAPP_ENGINE` | `preview` | `preview` \| `baileys` \| `cloud-api` |
| `WHATSAPP_SESSION_DIR` | `./storage/sessions` | Carpeta de la sesión de Baileys (volumen en producción) |
| `WHATSAPP_PHONE_NUMBER_ID` | *(vacío)* | Solo `cloud-api` |
| `WHATSAPP_ACCESS_TOKEN` | *(vacío)* | Solo `cloud-api` |
| `WHATSAPP_TEMPLATE_NAME` | `invitacion_boda` | Plantilla aprobada por Meta |
| `WHATSAPP_TEMPLATE_LANG` | `es` | Idioma de la plantilla |
| `SEND_MIN_DELAY_MS` | `6000` | Retardo mínimo entre mensajes |
| `SEND_MAX_DELAY_MS` | `14000` | Retardo máximo entre mensajes |
| `SEND_DAILY_LIMIT` | `250` | Tope de mensajes enviados por día |

---

## Cómo funciona el envío masivo

- Cola **secuencial en proceso** (`Map<campaignId, estado>`), un bucle por campaña.
- **Retardo aleatorio** entre `SEND_MIN_DELAY_MS` y `SEND_MAX_DELAY_MS` (o los
  valores de la campaña). Nunca bajar de 4 s: el riesgo de bloqueo es real.
- **Reintentos**: 1 intento + 2 reintentos con espera creciente.
- El estado de la campaña se relee de la base **antes de cada mensaje**, así
  pausar/cancelar funciona aunque el envío esté en curso.
- **Tope diario**: al alcanzarlo, la campaña espera 10 s, vuelve a verificar y
  si sigue superado queda en `paused`.
- Los invitados con RSVP `declined` se marcan como `skipped` (no se les escribe).
- `dryRun: true` (por defecto) renderiza, guarda el texto y registra en la
  bitácora, pero **nunca** llama a WhatsApp.
- Cada ítem se reclama con un `updateMany` condicionado a `status: 'pending'`:
  un reinicio del proceso no duplica mensajes.
- Los ítems que quedaron en `sending` por una caída vuelven a la cola a los
  5 minutos.

Variables disponibles en la plantilla: `{{nombre}}`, `{{pases}}`, `{{enlace}}`,
`{{novios}}`, `{{fecha}}`, `{{lugar}}`, `{{rsvp}}`.

---

## Estructura

```
src/
  server.ts            createApp() + start() (apagado ordenado con SIGINT/SIGTERM)
  auth.ts              login, /me y preHandler `authenticate` (JWT)
  env.ts               variables de entorno validadas con Zod
  prisma.ts            cliente Prisma único por proceso
  routes/              una ruta por dominio (weddings, guests, imports, campaigns, whatsapp, public)
  services/
    import/            parse-file → build-preview → commit-import
    campaigns/sender.ts  cola de envío, retardos, reintentos y contadores
    dto.ts             filas de Prisma → JSON del panel
  whatsapp/            engine (contrato) + preview/baileys/cloud-api
  utils/               csv (delimitadores, comillas, BOM, latin-1) y fechas
prisma/
  schema.prisma        modelo de datos (no se toca desde la app)
  seed.ts              datos iniciales idempotentes
```

Las pruebas (`pnpm --filter @boda/api test`) cubren el lector de CSV y la
previsualización de importaciones; no necesitan base de datos.

---

## Notas de build (importante)

`@boda/shared` se consume **como fuente TypeScript** (`exports` apunta a
`src/index.ts`), no como paquete compilado. Con `rootDir: "."` en el
`tsconfig.json` de la API, `tsc` incluye esos archivos en el programa y puede
rechazar el build con `TS6059: File '...packages/shared/src/index.ts' is not
under 'rootDir'`.

Si eso ocurre, hay dos salidas (ninguna requiere tocar la API):

1. Quitar `rootDir` del `tsconfig.json` y ajustar la entrada a
   `node dist/apps/api/src/server.js` (el Dockerfile ya copia la entrada plana a
   `dist/`), o
2. Hacer que `packages/shared` emita `dist/index.js` + `dist/index.d.ts` y
   apuntar sus `exports` a esos archivos para el build de producción.

En desarrollo nada de esto importa: `tsx` resuelve el TypeScript de `@boda/shared`
directamente, y Vitest tiene el alias declarado en `vitest.config.ts`.
