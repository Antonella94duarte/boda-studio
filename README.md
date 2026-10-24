# Boda Studio

Plataforma **multi-boda** para una organizadora de bodas: invitaciones web personalizadas +
envío masivo de WhatsApp + panel de confirmaciones.

Reemplaza las dos tareas que hoy se hacen a mano: la **tarjeta PDF** (Canva) y el **reenvío
de WhatsApp uno por uno**.

```
La organizadora importa el Excel de invitados
    → el sistema genera un enlace único por invitado
        → envía el mensaje personalizado por WhatsApp («Hola Ana, válido para 2 personas»)
            → el invitado abre su invitación y confirma en línea
                → el panel muestra confirmados, pases y restricciones alimentarias
```

## Arranque rápido

```bash
# 1. Requisitos: Node 20+ y pnpm
node -v
pnpm -v

# 2. Dependencias de todo el monorepo
pnpm install

# 3. Configuración (hay valores por defecto para desarrollo)
cp .env.example .env

# 4. Base de datos SQLite + usuario y boda de ejemplo
pnpm db:push
pnpm db:seed

# 5. Levantar la API (4000) y la web (5173)
pnpm dev
```

- Panel de la organizadora: <http://localhost:5173/admin>
- Invitación pública de ejemplo: <http://localhost:5173/i/sandraujorge>
- Invitación personalizada (enlace del invitado): se copia desde el panel, en **Invitados**

Credenciales del seed: las de `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`
(por defecto `organizadora@bodastudio.com` / `CambiarEstaClave123`).

> El `.env.example` trae `WHATSAPP_ENGINE=baileys`: hay que **conectar el número** desde
> el panel (WhatsApp → Conectar → escanear el QR) antes de poder enviar. Si querés recorrer el
> panel sin mandar nada, poné `WHATSAPP_ENGINE=preview`: en ese modo el "envío" solo queda
> registrado y nunca sale a la red.

> **Antes de la primera campaña real:** el enlace del mensaje se arma con `PUBLIC_WEB_URL`, que
> en desarrollo es `http://localhost:5173` — un enlace que **ningún invitado puede abrir**. La API
> bloquea los envíos reales mientras el enlace no sea público (y avisa en el arranque, en
> `/api/health` y con un cartel en el panel). Para ponerle una dirección real, gratis o por
> 1-2 USD al año, ver **[10 · Una URL pública de verdad](docs/10-url-publica.md)**.

## Estructura

```
apps/api        Backend Node (Fastify + Prisma): invitados, importación, fotos, campañas, WhatsApp
apps/web        React + Vite: invitación pública personalizada + panel de la organizadora
packages/shared Contratos Zod compartidos: invitación, invitado, importación, campaña
deploy/         Piezas de despliegue: Caddyfile (HTTPS automático), override de compose y .env de producción
samples/        Datos reales de ejemplo (boda Sandra & Jorge, listas en CSV/TXT/XLSX)
docs/           Documentación del proyecto (las capturas del manual viven en docs/img/manual/)
```

## Documentación

| Documento | Contenido |
|---|---|
| [01 · Arquitectura](docs/01-arquitectura.md) | Piezas, stack, decisiones de diseño y flujo extremo a extremo |
| [02 · Modelo de datos](docs/02-modelo-de-datos.md) | Entidades, índices y cómo migrar de SQLite a PostgreSQL |
| [03 · Invitación pública](docs/03-invitacion-publica.md) | Secciones, personalización por token, temas y diseño |
| [04 · Importación de invitados](docs/04-importacion-invitados.md) | Excel/CSV/TXT, alias de columnas, normalización de teléfonos |
| [05 · Envío por WhatsApp](docs/05-whatsapp-envios.md) | Baileys vs API oficial, cola, retardos, riesgos y mitigaciones |
| [06 · Despliegue](docs/06-despliegue.md) | Vercel/Netlify + Railway/Render, volumen de sesión, checklist |
| [07 · Roadmap](docs/07-roadmap.md) | Fases, criterios de aceptación y riesgos |
| [08 · Manual de la organizadora](docs/08-manual-organizadora.md) | Guía de uso sin tecnicismos, con capturas (también en `.docx` para entregar) |
| [09 · Contrato HTTP del API](docs/09-contrato-http.md) | Todas las rutas, envolturas y la decisión de integración con la web |
| [10 · Una URL pública de verdad](docs/10-url-publica.md) | Qué URL poner para que los enlaces de los mensajes abran: opciones gratis (0 USD) y de bajo coste |
| [11 · Despliegue desde el navegador](docs/11-despliegue-desde-el-navegador.md) | Paso a paso sin instalar nada: Oracle Cloud + Cloud Shell + DNS + HTTPS |
| [12 · Propuesta de infraestructura y costos](docs/12-propuesta-infraestructura-y-costos.md) | Versión para compartir con un socio (también en `.docx`) |

## Verificación

Un solo comando comprueba que todo el proyecto funciona (instala, compila, migra, siembra,
corre los tests, construye la web y ejecuta una prueba de humo real contra el API):

```bash
pwsh -File scripts/verify.ps1
```

| Script | Qué hace |
|---|---|
| `scripts/verify.ps1` | Verificación completa, con resumen paso a paso |
| `scripts/smoke-api.mjs` | Prueba de integración por HTTP: login → bodas → invitados → fotos → invitación pública → RSVP → campaña en modo seco → WhatsApp |
| `scripts/build-manual-docx.py` | Regenera el manual de la organizadora en Word desde el Markdown |
| `scripts/optimize-manual-shots.py` | Redimensiona y recomprime las capturas del manual |

La prueba de humo se puede correr sola, con la API ya levantada:

```bash
pnpm dev:api                 # en otra terminal
node scripts/smoke-api.mjs   # 70+ comprobaciones contra http://localhost:4000
```

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta API y web en paralelo |
| `pnpm dev:api` / `pnpm dev:web` | Solo uno de los dos |
| `pnpm typecheck` | TypeScript estricto en los tres paquetes |
| `pnpm test` | Tests: CSV/TSV, mapeo de columnas, teléfonos, enlaces públicos y validación de imágenes |
| `pnpm build` | Build de producción |
| `pnpm db:push` | Crea/actualiza las tablas |
| `pnpm db:seed` | Usuario de la organizadora + boda demo + invitados |
| `pnpm db:studio` | Explorador visual de la base de datos |
| `pnpm setup` | Instala, compila `shared`, crea las tablas y siembra los datos |
| `pnpm run build:shared` | Compila `@boda/shared` (lo consumen la API y la web) |

## Decisiones que conviene conocer antes de tocar el código

1. **Un enlace por invitado**, no un enlace genérico: es lo que permite saber quién abrió,
   quién confirmó y cuántos pases usa cada uno.
2. **La configuración de cada boda es un JSON validado con Zod** (`Wedding.config`): agregar
   una sección nueva no requiere migración de base de datos.
3. **El motor de WhatsApp es una interfaz** (`WhatsAppEngine`) con tres adaptadores
   intercambiables: `baileys` (no oficial, gratis), `cloud-api` (oficial de Meta) y `preview`
   (modo seco). La cola de campañas no sabe cuál se está usando.
4. **Las campañas arrancan en modo de prueba** (`dryRun`), sea cual sea el motor: la
   primera campaña de cada boda se ve sin enviarse. Ver `docs/05-whatsapp-envios.md`.
5. **Cada mensaje se persiste antes y después de enviarse**: un reinicio del servidor a mitad
   de campaña no repite ni pierde ningún mensaje.
6. **Las fotos son archivos, no datos de la base**: se guardan en `UPLOAD_DIR` con un nombre
   generado por el servidor y la configuración solo guarda su ruta (`/api/uploads/…`). Por eso
   el volumen de `storage/uploads` es tan importante como el de la sesión de WhatsApp.

## Estado del proyecto

Ver [docs/07-roadmap.md](docs/07-roadmap.md).

**Verificado de punta a punta** con `pwsh -File scripts/verify.ps1` (10/10 pasos en verde):
instalación, compilación de los tres paquetes, generación del cliente Prisma, creación de las
tablas, datos de ejemplo, typecheck estricto sin errores, **84 tests unitarios** (24 del paquete
compartido + 60 del API) y **73 comprobaciones de integración por HTTP** (`scripts/smoke-api.mjs`),
incluyendo una campaña de WhatsApp en modo seco con el texto final de cada invitado, una
confirmación de asistencia, el rechazo de una campaña real cuando el enlace de las invitaciones
no es público y la subida, el servido público y el borrado de una foto de la invitación.

> Sin PowerShell 7 a mano, el mismo script corre igual con
> `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1`.

> La guarda de enlaces públicos agregó `apps/api/src/utils/public-url.test.ts` (15 tests) y la
> subida de fotos `apps/api/src/utils/image-file.test.ts` (18 tests), con sus comprobaciones en
> `scripts/smoke-api.mjs`. Si esos archivos cambian, `pnpm test` y `node scripts/smoke-api.mjs`
> son los que lo cubren.

Lo que falta para usarlo con una clienta real:

1. **Revisar el diseño de la invitación con las fotos definitivas de la pareja** (el diseño está
   probado en un navegador real, pero cada boda trae sus propias fotos y textos).
2. **Probar el envío real**: cargar `WHATSAPP_ENGINE=baileys`, escanear el QR con el chip
   dedicado y hacer una campaña de 5 mensajes a números propios.
3. **Desplegar** siguiendo [docs/06-despliegue.md](docs/06-despliegue.md), con el volumen
   persistente para la sesión de WhatsApp, y poner una **URL pública real** en
   `PUBLIC_WEB_URL` ([docs/10-url-publica.md](docs/10-url-publica.md)): mientras siga en
   `localhost`, la API bloquea los envíos reales.

## Aviso importante sobre WhatsApp

El envío por Baileys **no es el canal oficial** y viola los términos de servicio de WhatsApp:
el número puede ser bloqueado. Está mitigado (retardos aleatorios, tope diario, modo seco,
personalización por invitado) y documentado, pero no eliminado. Usar un **número dedicado**,
nunca el personal. El camino oficial está implementado como adaptador y se activa con
`WHATSAPP_ENGINE=cloud-api`.
