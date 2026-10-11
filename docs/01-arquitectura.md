# 01 · Arquitectura

## Qué se está construyendo

**Boda Studio** es una plataforma **multi-boda** para una organizadora de bodas. Resuelve
el ciclo completo de una invitación:

1. La organizadora **crea la boda** y carga los datos (pareja, fecha, ceremonia religiosa,
   civil, brindis, dress code, regalos, tema visual).
2. **Importa la lista de invitados** desde un Excel, CSV o TXT que ya tiene (nombre +
   teléfono, y opcionalmente pases, grupo y notas).
3. El sistema genera **un enlace único por invitado** (`/i/<boda>/<token>`) y arma el
   mensaje personalizado.
4. **Envía el mensaje masivo por WhatsApp** desde el número de la organizadora, con
   retardos y trazabilidad por invitado.
5. Cada invitado abre **su** invitación (con su nombre y sus pases), y **confirma en
   línea** indicando quiénes lo acompañan.
6. El panel muestra en tiempo real confirmados, pendientes, rechazados, pases totales,
   restricciones alimentarias y a quién se le envió (y a quién falló).

El producto reemplaza dos cosas que hoy se hacen a mano: **la tarjeta PDF** (Canva) y el
**reenvío manual de WhatsApp** uno por uno.

## Las dos superficies

| Superficie | Ruta | Usuario | Prioridad de diseño |
|---|---|---|---|
| Invitación pública personalizada | `/i/:slug` y `/i/:slug/:token` | El invitado, desde el celular | Que se vea **premium**: reemplaza una tarjeta de Canva |
| Panel de la organizadora | `/admin/**` | La wedding planner | Que sea **rápido**: importar 200 invitados sin pelearse con el Excel |

Ambas viven en la **misma aplicación React** (`apps/web`) porque comparten tipos, tema y
utilidades; se separan por ruteo y por layout. Si algún día el panel crece mucho, se puede
extraer a su propio paquete sin tocar la API.

## Diagrama

```
                    ┌──────────────────────────────────────────┐
   La organizadora  │  apps/web · /admin/**                    │
   (escritorio)     │  bodas · invitados · importar · campañas │
                    │  WhatsApp (QR)                           │
                    └──────────────────┬───────────────────────┘
                                       │  /api  (JWT)
   El invitado      ┌──────────────────┴───────────────────────┐
   (celular, desde  │  apps/web · /i/:slug/:token              │
   WhatsApp)        │  portada · cuenta regresiva · ceremonias │
                    │  dress code · regalos · confirmar        │
                    └──────────────────┬───────────────────────┘
                                       │
                    ┌──────────────────▼───────────────────────┐
                    │  apps/api  (Fastify, Node 20)            │
                    │                                          │
                    │  routes/   auth weddings guests imports  │
                    │            campaigns whatsapp public     │
                    │                                          │
                    │  services/ import · campaigns/sender     │
                    │            tokens · events               │
                    │                                          │
                    │  whatsapp/ engine (interfaz)             │
                    │     ├── baileys-engine   (no oficial)    │
                    │     ├── cloud-api-engine (oficial Meta)  │
                    │     └── preview-engine   (modo seco)     │
                    └───────┬───────────────────────┬──────────┘
                            │                       │
                   ┌────────▼────────┐     ┌────────▼─────────────┐
                   │  Prisma         │     │  storage/sessions/   │
                   │  SQLite (dev)   │     │  sesión de WhatsApp  │
                   │  PostgreSQL     │     │  (volumen persist.)  │
                   │  (producción)   │     │  + uploads/          │
                   └─────────────────┘     └──────────────────────┘
```

## Estructura del monorepo

```
boda-studio/
├── apps/
│   ├── api/                       Backend Node (Fastify + Prisma)
│   │   ├── prisma/
│   │   │   ├── schema.prisma      Modelo de datos multi-boda
│   │   │   └── seed.ts            Usuario demo + boda de ejemplo + invitados
│   │   └── src/
│   │       ├── env.ts             Configuración validada con Zod
│   │       ├── server.ts          Bootstrap + graceful shutdown
│   │       ├── auth.ts            Login, JWT, guardia de rutas
│   │       ├── routes/            Un archivo por recurso
│   │       ├── services/
│   │       │   ├── import/        Excel/CSV/TXT → invitados (con previsualización)
│   │       │   └── campaigns/     Cola de envío con retardos y reanudación
│   │       └── whatsapp/          Motor intercambiable (Baileys / Cloud API / preview)
│   └── web/                       React + Vite
│       └── src/
│           ├── invitation/        Invitación pública (secciones + tema)
│           ├── admin/             Panel de la organizadora
│           └── lib/               Cliente de API, sesión, tema, hooks
├── packages/
│   └── shared/                    Contratos compartidos (fuente única de verdad)
│       └── src/
│           ├── schemas/           Zod: invitación, invitado, importación, campaña
│           ├── phone.ts           Normalización E.164 por país
│           └── format.ts          Fechas en español, pases, cuenta regresiva
├── samples/                       Datos reales de ejemplo (boda Sandra & Jorge)
├── docs/                          Esta documentación
├── docker-compose.yml             Stack completo en un VPS o en tu PC
└── .env.example                   Todas las variables, documentadas
```

## Stack y por qué

| Pieza | Elección | Motivo |
|---|---|---|
| Lenguaje | TypeScript en todo el monorepo | Los tipos de la invitación viajan del formulario a la base de datos sin traducción manual |
| Monorepo | pnpm workspaces | `@boda/shared` se consume como fuente: cambiar un esquema rompe el build en los tres lugares a la vez |
| Web | React 18 + Vite | Pedido explícito; Vite da arranque instantáneo y build estático barato |
| Estilos | CSS puro con variables CSS | El tema de cada boda es un puñado de custom properties; sin framework que pelee con eso |
| API | Fastify 4 | Más liviano y rápido que Express, validación por esquema y buen soporte de plugins (CORS, JWT, multipart) |
| Validación | Zod en `@boda/shared` | Un solo lugar define qué es una invitación válida, y lo usan API y web |
| Base de datos | SQLite en desarrollo → PostgreSQL en producción | Desarrollo sin instalar nada; producción con Railway/Render. Prisma hace el cambio de una línea |
| ORM | Prisma | Migraciones y tipos generados gratis |
| Excel | SheetJS (`xlsx`) | Lee `.xlsx` y `.xls` sin servidor de Office |
| WhatsApp | Interfaz `WhatsAppEngine` + adaptador | Permite empezar con Baileys (gratis) y migrar a la API oficial sin reescribir campañas |

## Decisiones de diseño (y su razón)

**1. Un enlace por invitado, no un enlace genérico.**
El mensaje dice «Hola Ana, válido para 2 personas» y el enlace lleva a *su* invitación.
Esto es lo que convierte el producto en algo que un PDF no puede hacer: se sabe quién abrió,
quién confirmó y cuántos vienen. Además permite detectar el reenvío: si Ana comparte su
enlace, los pases siguen siendo 2.

**2. La configuración de la boda es un JSON validado, no 40 columnas.**
`Wedding.config` guarda un `WeddingConfig` (Zod). Agregar una sección nueva al catálogo no
requiere migración de base de datos; y la organizadora puede activar, desactivar y reordenar
secciones sin que nadie programe nada.

**3. El motor de WhatsApp es una interfaz, no una dependencia incrustada.**
Enviar por WhatsApp tiene tres caminos legítimos (cliente no oficial, API oficial, modo
manual). La cola de campañas no sabe cuál se está usando. Ver `docs/05-whatsapp-envios.md`.

**4. La cola de envío es del propio proceso, con estado en la base de datos.**
Cada mensaje se persiste como `CampaignItem` antes y después de enviarse. Si el servidor se
reinicia a mitad de una campaña de 400 mensajes, se reanuda sin repetir ni perder ninguno.
Cuando el volumen lo justifique, la misma interfaz se implementa sobre BullMQ + Redis.

**5. Modo seco (`dryRun`) por defecto.**
La primera campaña de cualquier boda se ejecuta sin enviar nada: se ve el texto final de
cada mensaje y a quién iría. Recién después se apaga el modo seco. Barato de construir,
evita el error caro.

**6. Aislamiento por `ownerId` en cada consulta.**
Toda ruta autenticada verifica que la boda pertenece a la organizadora logueada. Nunca se
confía en el `weddingId` que llega del cliente.

## Flujo completo (extremo a extremo)

```
1. Crear boda        POST /api/weddings                    → slug + config inicial
2. Editar config     PATCH /api/weddings/:id               → pareja, eventos, tema, secciones
3. Importar          POST /api/weddings/:id/import/preview → mapeo + errores por fila
                     POST /api/weddings/:id/import/commit  → invitados con token y teléfono E.164
4. Conectar WhatsApp POST /api/whatsapp/connect            → QR (una sola vez por número)
5. Campaña           POST /api/weddings/:id/campaigns      → ítems + cola con retardos
                     (dryRun=true la primera vez, luego false)
6. Invitado abre     GET  /api/public/weddings/:slug/guest/:token
7. Confirma          POST /api/public/weddings/:slug/guest/:token/rsvp
8. Seguimiento       GET  /api/weddings/:id/guests         → confirmados, pases, dieta, notas
```

## Seguridad y datos personales

- La plataforma guarda **datos personales de terceros** (nombre, teléfono, restricciones
  alimentarias). En Paraguay aplica la Ley 6534/2020 de Protección de Datos Personales.
- La **sesión de WhatsApp** (`storage/sessions/`) da control total sobre la cuenta: jamás
  se sube al repositorio, jamás se comparte, y se guarda en un volumen cifrado del servidor.
- Contraseñas con bcrypt. JWT firmado con `JWT_SECRET` largo. Sin registro público: los
  usuarios los crea el administrador.
- Los enlaces de invitado usan **tokens aleatorios de 128 bits**; no son adivinables ni
  correlativos, así que nadie puede recorrer la lista de invitados.
- El endpoint público nunca devuelve teléfonos, notas internas ni datos de otros invitados.
- Al finalizar la boda: exportar la lista y **borrar los datos** (ver roadmap, fase 6).
