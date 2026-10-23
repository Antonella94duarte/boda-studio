# 09 · Contrato HTTP del API

Superficie real implementada en `apps/api/src/routes/`. Es el contrato que la web consume y que
verifica [`scripts/smoke-api.mjs`](../scripts/smoke-api.mjs) de punta a punta.

## Convenciones

- Prefijo `/api`. JSON en todo, salvo el `multipart/form-data` de la importación.
- Fechas en **ISO 8601**; los campos opcionales vacíos se **omiten**, nunca salen como `null`.
- Autenticación: `Authorization: Bearer <JWT>` en todo excepto `/auth/login`, `/health` y `/public/**`.
- Errores con una forma única:

```json
{ "error": "Invite no encontrado", "message": "Esta invitación no existe o no está publicada." }
```

- Toda ruta autenticada verifica que la boda pertenece a la organizadora del token.

## Autenticación

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/auth/login` | `{email, password}` | `{token, user}` |
| GET | `/api/auth/me` | — | `{user}` |

## Bodas

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/weddings` | `WeddingDto[]` |
| POST | `/api/weddings` | `WeddingDto` |
| GET | `/api/weddings/:id` | `WeddingDto` |
| PATCH | `/api/weddings/:id` | `WeddingDto` |
| DELETE | `/api/weddings/:id` | `{ok: true, id}` |
| POST | `/api/weddings/:id/publish` | `WeddingDto` |

`WeddingDto` = `{id, slug, title, published, config, createdAt, updatedAt, counts}`, donde
`config` es el `WeddingConfig` **ya parseado** (objeto, no el String guardado) y `counts` son los
contadores calculados: `{guests, totalPasses, pending, confirmed, declined, maybe, campaigns}`.

## Invitados

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/weddings/:id/guests` | Filtros por query: `?status=`, `?q=` (nombre, teléfono o grupo), `?group=`. Devuelve `Guest[]` |
| POST | `/api/weddings/:id/guests` | `{fullName, phone, passes, groupName?, notes?}` → `Guest` |
| PATCH | `/api/guests/:guestId` | `Guest` |
| DELETE | `/api/guests/:guestId` | `{ok: true, id}` |
| POST | `/api/weddings/:id/guests/:guestId/regenerate-token` | `Guest` con token nuevo |

El teléfono se normaliza a **E.164** al guardar y el original queda en `rawPhone`. Un teléfono
repetido en la misma boda responde 409 con el nombre del invitado que ya lo tiene.

## Importación

Dos pasos, siempre: nada se escribe hasta el commit.

| Método | Ruta | Entrada | Respuesta |
|---|---|---|---|
| POST | `/api/weddings/:id/import/preview` | `multipart` (`file` + `options` JSON, con `columnMapping` dentro) **o** JSON `{rows, headers?, options?}` | `ImportPreview` |
| POST | `/api/weddings/:id/import/commit` | JSON `{rows: ImportRowPreview[], options?}` | `{created, updated, skipped, errors: [{row, message}]}` |
| GET | `/api/weddings/:id/import/history` | — | últimos `EventLog` de importación |

`ImportPreview` trae `headers`, `mapping` sugerido, totales (`validRows`, `warningRows`,
`errorRows`) y **fila por fila** con `level` (`ok` | `warning` | `error`) e `issues[]`.

## Campañas de WhatsApp

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/weddings/:id/campaigns` | `Campaign[]` |
| POST | `/api/weddings/:id/campaigns` | `201` + `Campaign` (crea los ítems y arranca el envío) |
| GET | `/api/campaigns/:id` | `Campaign` |
| GET | `/api/campaigns/:id/items` | `CampaignItem[]` (con `guestName`, `phone`, `renderedBody`, `error`) |
| POST | `/api/campaigns/:id/pause` | `{ok: true, campaign}` |
| POST | `/api/campaigns/:id/resume` | `{ok: true, campaign}` |
| POST | `/api/campaigns/:id/cancel` | `{ok: true, campaign}` |

Cuerpo de creación (`CreateCampaignSchema`): `{name, template, guestIds?, dryRun, minDelayMs?,
maxDelayMs?}`. Si no se envían `guestIds`, se toma a **todos los invitados pendientes**.
`dryRun: true` es el default del esquema: renderiza, guarda y registra, pero no envía.

## WhatsApp

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/whatsapp/status` | `{engine, status, phoneNumber, qrDataUrl, lastError, hasQr}` |
| POST | `/api/whatsapp/connect` | igual a status (arranca el motor y devuelve el QR si corresponde) |
| GET | `/api/whatsapp/qr` | `{engine, status, qrDataUrl, updatedAt, hint, sessionDir}` |
| POST | `/api/whatsapp/logout` | `{engine, status: 'disconnected'}` |
| POST | `/api/weddings/:id/whatsapp/test` | `{ok, engine, phone, delivered, body, linkIsPublic, note?}` · envía **un** mensaje a un número suelto sin tocar invitados (400 si el teléfono es inválido, 409 si el motor no está conectado) |

`status` ∈ `disconnected` · `qr` · `connecting` · `connected` · `error`.
`engine` ∈ `preview` · `baileys` · `cloud-api`.

## Estado del sistema

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/system/links` | `{publicWebUrl, publicApiUrl, isPublic, sendable, problem, message, warnings[], exampleLink, remedy, docs, whatsappEngine, warning}` |

`isPublic` responde a la única pregunta que importa antes de una campaña: **¿el enlace del
mensaje se abre desde el teléfono de un invitado?** (`problem` ∈ `loopback` · `private-ip` ·
`local-hostname` · `link-local` · `reserved-ip` · `reserved-domain` · `invalid` · `protocol`).
`sendable` es `false` cuando `PUBLIC_WEB_URL` no es pública: en ese estado
`POST /api/weddings/:id/campaigns` con `dryRun: false` responde **409** y no crea la campaña.
El panel usa este endpoint para mostrar el aviso rojo. Ver
[10 · Una URL pública de verdad](10-url-publica.md).

## Invitación pública (sin token)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/public/weddings/:slug` | `{slug, config}` · 404 si no está publicada |
| GET | `/api/public/weddings/:slug/guest/:token` | `PublicGuest` (`token, fullName, passes, status, companions, respondedAt`) |
| POST | `/api/public/weddings/:slug/guest/:token/rsvp` | `PublicGuest` actualizado |

`RsvpSubmission` = `{attending: 'yes'|'no'|'maybe', companions[], dietary?, message?}`.
Nunca se expone el teléfono del invitado, sus notas ni datos de otros invitados.
Si la boda tiene `rsvp.allowOnlineConfirm = false`, responde 403 con el WhatsApp de contacto.

## Salud

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/health` | `{status: 'ok', env, database, whatsappEngine, uptime, publicWebUrl, linkIsPublic, linkSendable, linkProblem, linkWarnings[]}` |

`linkIsPublic` viaja en el health a propósito: es el chequeo que se puede hacer desde fuera con
un `curl` y detecta el error clásico de dejar `PUBLIC_WEB_URL` en `localhost`.

## Sobre las envolturas: decisión de integración

El API devuelve **arreglos y objetos directos** (`GET /api/weddings` → `[...]`), que es lo más
simple de consumir y de probar. El panel, en cambio, se escribió esperando envolturas y rutas
anidadas (`{weddings: [...]}`, `PATCH /weddings/:id/guests/:guestId`).

La reconciliación se hace **en un solo lugar**: `apps/web/src/lib/api.ts`, que adapta la
respuesta del API a la forma que esperan las pantallas (y calcula del lado del cliente los
agregados que el API no devuelve, como el resumen de pases confirmados del listado de
invitados). Así:

- las rutas del API quedan planas y previsibles, fáciles de probar con `curl`;
- las pantallas no conocen detalles del transporte;
- si mañana cambia el API, se toca un archivo y no veinte componentes.

Regla para el futuro: **cualquier ruta nueva se agrega primero al API, se prueba con
`scripts/smoke-api.mjs`, y recién después se expone en `api.ts`.**
