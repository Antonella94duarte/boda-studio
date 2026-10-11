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

## Estructura

```
apps/api        Backend Node (Fastify + Prisma): invitados, importación, campañas, WhatsApp
apps/web        React + Vite: invitación pública personalizada + panel de la organizadora
packages/shared Contratos Zod compartidos: invitación, invitado, importación, campaña
samples/        Datos reales de ejemplo (boda Sandra & Jorge, listas en CSV/TXT/XLSX)
docs/           Documentación del proyecto
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
| [08 · Manual de la organizadora](docs/08-manual-organizadora.md) | Guía de uso sin tecnicismos |
| [09 · Contrato HTTP del API](docs/09-contrato-http.md) | Todas las rutas, envolturas y la decisión de integración con la web |

## Verificación

Un solo comando comprueba que todo el proyecto funciona (instala, compila, migra, siembra,
corre los tests, construye la web y ejecuta una prueba de humo real contra el API):

```bash
pwsh -File scripts/verify.ps1
```

| Script | Qué hace |
|---|---|
| `scripts/verify.ps1` | Verificación completa, con resumen paso a paso |
| `scripts/smoke-api.mjs` | Prueba de integración por HTTP: login → bodas → invitados → invitación pública → RSVP → campaña en modo seco → WhatsApp |

La prueba de humo se puede correr sola, con la API ya levantada:

```bash
pnpm dev:api                 # en otra terminal
node scripts/smoke-api.mjs   # 60+ comprobaciones contra http://localhost:4000
```

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta API y web en paralelo |
| `pnpm dev:api` / `pnpm dev:web` | Solo uno de los dos |
| `pnpm typecheck` | TypeScript estricto en los tres paquetes |
| `pnpm test` | Tests (parser CSV/TSV, mapeo de columnas, normalización de teléfonos) |
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

## Estado del proyecto

Ver [docs/07-roadmap.md](docs/07-roadmap.md).

**Verificado de punta a punta** con `pwsh -File scripts/verify.ps1` (10/10 pasos en verde):
instalación, compilación de los tres paquetes, generación del cliente Prisma, creación de las
tablas, datos de ejemplo, typecheck estricto sin errores, **51 tests unitarios** (24 del paquete
compartido + 27 del API) y **56 comprobaciones de integración por HTTP** (`scripts/smoke-api.mjs`),
incluyendo una campaña de WhatsApp en modo seco con el texto final de cada invitado y una
confirmación de asistencia.

Lo que falta para usarlo con una clienta real:

1. **Abrir la invitación en un navegador** y ajustar el diseño con las fotos definitivas
   (el renderizado público no se pudo inspeccionar visualmente: no hay navegador en el entorno
   de desarrollo de este repo).
2. **Probar el envío real**: cargar `WHATSAPP_ENGINE=baileys`, escanear el QR con el chip
   dedicado y hacer una campaña de 5 mensajes a números propios.
3. **Desplegar** siguiendo [docs/06-despliegue.md](docs/06-despliegue.md), con el volumen
   persistente para la sesión de WhatsApp.

## Aviso importante sobre WhatsApp

El envío por Baileys **no es el canal oficial** y viola los términos de servicio de WhatsApp:
el número puede ser bloqueado. Está mitigado (retardos aleatorios, tope diario, modo seco,
personalización por invitado) y documentado, pero no eliminado. Usar un **número dedicado**,
nunca el personal. El camino oficial está implementado como adaptador y se activa con
`WHATSAPP_ENGINE=cloud-api`.
