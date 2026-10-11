# 02 · Modelo de datos

Fuente única de verdad: `apps/api/prisma/schema.prisma`.
Los tipos que viajan por la API se derivan de Zod en `packages/shared/src/schemas/`.

## Entidades

```
User ──1:N──> Wedding ──1:N──> Guest ──1:N──> CampaignItem <──N:1── Campaign
                │                                                     │
                └──1:N──> EventLog                                    └── pertenece a Wedding
User ──1:1──> WhatsAppSession
```

### `User` — la organizadora
| Campo | Tipo | Nota |
|---|---|---|
| `email` | String único | Login |
| `passwordHash` | String | bcrypt, nunca texto plano |
| `role` | String | `planner` (organizadora) o `admin` (soporte) |

Sin registro público: las cuentas las crea el administrador (o el seed). Un wedding planner
pequeño tiene 1-3 usuarios; no hace falta más.

### `Wedding` — una boda
| Campo | Tipo | Nota |
|---|---|---|
| `slug` | String único | URL pública: `/i/vanessayhector` |
| `title` | String | Solo para el panel: «Vanessa & Héctor — 11/07/2026» |
| `config` | String (JSON) | `WeddingConfig` validado con Zod |
| `published` | Boolean | Si es `false`, la URL pública responde 404 |
| `ownerId` | FK → User | Aislamiento entre organizadoras |

**Por qué `config` es JSON y no columnas**: la invitación tiene ~10 secciones y cada una con
forma propia (eventos, cuentas bancarias, párrafos, fotos, paleta). Con columnas sería una
tabla por sección y una migración por cada campo nuevo. Con JSON validado, agregar
«lista de regalos» es agregar un campo al esquema Zod. El costo —no poder consultar por SQL
dentro del JSON— no aplica aquí: siempre se lee la boda completa.

**Por qué `String` y no `Json`**: el mismo esquema sirve para SQLite (desarrollo) y
PostgreSQL (producción) sin cambios. La validación real ocurre en Zod, no en la base.

### `Guest` — un invitado
| Campo | Tipo | Nota |
|---|---|---|
| `token` | String único | Enlace personalizado. 128 bits aleatorios |
| `fullName` | String | «Ana Gómez» |
| `rawPhone` | String? | Como venía en el Excel, para auditar la importación |
| `phone` | String | **E.164**: `+595976178000`. Es el número al que se envía |
| `passes` | Int | Pases: «Válido para 2 personas» |
| `groupName` | String? | Familia o mesa; permite un solo mensaje por familia |
| `status` | String | `pending` · `confirmed` · `declined` · `maybe` |
| `companions` | String (JSON) | Nombres de quienes acompañan |
| `dietary` | String? | Restricciones alimentarias |
| `messageStatus` | String | `not_sent` · `queued` · `sent` · `delivered` · `read` · `failed` · `skipped` |
| `messageSentAt`, `messageError` | | Trazabilidad del envío |

Decisiones:
- **Se guarda el teléfono original y el normalizado.** Cuando un invitado dice «no me
  llegó», se puede comparar qué había en el Excel y qué se envió.
- **Los pases viven en el invitado, no en la campaña.** Ana puede tener 2 y su madre 4 en la
  misma lista; el mensaje se arma por invitado.
- **`groupName` habilita el envío por familia.** Muchas listas tienen «Familia González»
  con 4 teléfonos; enviar 4 mensajes idénticos molesta y gasta cupo diario.

### `Campaign` y `CampaignItem` — el envío masivo
`Campaign` guarda la plantilla y los contadores agregados. `CampaignItem` guarda **una fila
por invitado** con el texto exacto que se envió (`renderedBody`), los intentos, el error y el
`providerMessageId`.

Esto es lo que permite: reanudar sin repetir, saber exactamente qué recibió cada persona, y
reintentar solo los fallidos.

| Campo de `Campaign` | Nota |
|---|---|
| `template` | Con `{{nombre}}`, `{{pases}}`, `{{enlace}}`, `{{novios}}`, `{{fecha}}`, `{{lugar}}`, `{{rsvp}}` |
| `status` | `draft` · `running` · `paused` · `finished` · `cancelled` |
| `dryRun` | Modo seco por defecto: renderiza y registra, no envía |
| `minDelayMs` / `maxDelayMs` | Retardo aleatorio entre mensajes (anti-bloqueo) |
| `sentCount` / `failedCount` / `skippedCount` | Progreso en el panel |

### `WhatsAppSession` — la sesión vinculada
| Campo | Nota |
|---|---|
| `userId` | Único: una sesión por organizadora |
| `status` | `disconnected` · `qr` · `connecting` · `connected` · `error` |
| `phoneNumber` | El número que quedó vinculado |
| `qrDataUrl` | Último QR, para mostrarlo en el panel |

La sesión **real** (las credenciales de Baileys) vive en disco
(`WHATSAPP_SESSION_DIR`), porque es un conjunto de archivos que la librería administra. En la
base solo se guarda el estado visible para el panel. Perder esa carpeta = escanear el QR otra
vez.

### `EventLog` — bitácora
Importaciones, envíos, cambios de estado. Sirve para responder «¿a quién le llegó?» y
«¿qué pasó el sábado a las 20:00?» sin revisar logs del servidor.

## Índices y por qué

| Índice | Consulta que acelera |
|---|---|
| `Wedding.slug` (único) | Abrir la invitación pública |
| `Guest.token` (único) | Abrir la invitación personalizada |
| `Guest.[weddingId, status]` | Contadores de confirmados y filtro del panel |
| `Guest.[weddingId, phone]` | Detección de duplicados al importar |
| `CampaignItem.[campaignId, status]` | Progreso y reanudación de la campaña |

## Migrar de SQLite a PostgreSQL

1. En `apps/api/prisma/schema.prisma`, cambiar `provider = "sqlite"` por `"postgresql"`.
2. Apuntar `DATABASE_URL` al servidor Postgres (Railway/Render lo dan al crear la base).
3. `pnpm --filter @boda/api db:push` (o `prisma migrate deploy` si se usan migraciones).
4. Re-importar los invitados desde el Excel: el paso 1→2 no migra datos por sí solo.

Nada del código de la aplicación cambia: Prisma abstrae el motor y los tipos son los mismos.
