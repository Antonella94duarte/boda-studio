# 06 · Despliegue

## Advertencia previa (la decisión que más problemas causa)

El envío por Baileys **exige un proceso Node siempre activo y una carpeta persistente**.
La web puede ser estática en Vercel/Netlify, pero la API **no puede dormirse ni perder su
disco**:

| Plataforma | ¿Sirve para la API? | Qué hay que contratar |
|---|---|---|
| Railway | Sí | Servicio siempre activo (sin sleep) + **volumen** montado en `storage/sessions` |
| Render | Sí | Plan pago (los planes gratis duermen y **pierden el disco**) + disco persistente |
| Vercel / Netlify (serverless) | **No** | No mantienen la sesión de WhatsApp entre invocaciones |
| VPS (Hetzner, Contabo, DigitalOcean) | Sí, la opción más predecible | Un VPS de 2 GB alcanza; `docker-compose.yml` incluido |
| Oracle Cloud *Always Free* | Sí, y **gratis** | Una VM ARM siempre activa + volumen incluido; ver [10 · Una URL pública de verdad](10-url-publica.md) |

Recomendación práctica: **web estática en Cloudflare Pages + API y base de datos en una VM
siempre activa**, con el dominio real desde el primer día. La comparación de costes y el
paso a paso de la variante que cuesta 0 USD están en
**[10 · Una URL pública de verdad](10-url-publica.md)**; esta guía asume que ya elegiste.

> **No hay URL por defecto que funcione.** `PUBLIC_WEB_URL` tiene que ser el dominio real
> antes de la primera campaña. La API bloquea los envíos reales mientras el enlace no sea
> público y lo avisa en el arranque, en `/api/health` (`linkIsPublic`) y en el panel.


## 1. Web (Vercel o Netlify)

- Build command: `pnpm --filter @boda/web build`
- Output: `apps/web/dist`
- Variable de entorno: ninguna obligatoria (la web llama a `/api`, y en producción se
  configura un rewrite/proxy hacia la API o `VITE_API_URL`).

`vercel.json` / `netlify.toml` para SPA (todas las rutas a `index.html`) y proxy `/api`:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://api.tudominio.com/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## 2. API (Railway o Render)

1. Crear el servicio apuntando al repositorio, con **root** en la raíz del monorepo.
2. Build: `pnpm install && pnpm --filter @boda/api build`
3. Start: `pnpm --filter @boda/api start`
4. **Agregar un volumen** montado en `/app/storage` (aquí vive la sesión de WhatsApp).
5. Health check: `/api/health`.
6. Desactivar el «sleep» / usar el plan que mantiene el servicio siempre arriba.

## 3. Base de datos

Por defecto el proyecto usa **SQLite**, y el `docker-compose.yml` lo deja en un volumen
persistente (`db_data`, archivo `/app/storage/db/prod.db`). Para una organizadora con pocas
bodas alcanza y sobra: menos piezas, menos memoria, mismos backups.

Si hace falta **PostgreSQL** (varias organizadoras escribiendo a la vez):

- Cambiar `provider = "sqlite"` → `"postgresql"` en `apps/api/prisma/schema.prisma`.
- Levantar el perfil opcional: `docker compose --profile postgres up -d` y poner
  `DATABASE_URL=postgresql://boda:boda@db:5432/boda_studio?schema=public` en el `.env`.
- O usar un PostgreSQL gestionado (Railway/Render/Neon/Supabase) y poner su cadena.
- Ejecutar una vez: `docker compose exec api npx prisma db push`.
- Backups: activar los automáticos del proveedor; además, exportar la lista de invitados
  desde el panel antes de cada campaña grande.

> **Atención:** el esquema es un archivo único, así que no se puede tener SQLite y PostgreSQL
> al mismo tiempo. El compose que viene en el repo asume SQLite justamente para que el stack
> arranque tal cual.

## 4. Variables de entorno (API)

```env
NODE_ENV=production
PORT=4000
PUBLIC_WEB_URL=https://tudominio.com
PUBLIC_API_URL=https://api.tudominio.com

DATABASE_URL=postgresql://...
JWT_SECRET=<48 bytes aleatorios>
ADMIN_EMAIL=organizadora@tudominio.com
ADMIN_PASSWORD=<clave fuerte>

WHATSAPP_ENGINE=baileys
WHATSAPP_SESSION_DIR=/app/storage/sessions

SEND_MIN_DELAY_MS=6000
SEND_MAX_DELAY_MS=14000
SEND_DAILY_LIMIT=250
```

Generar el secreto:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 5. Primer arranque en producción

```bash
pnpm install
pnpm --filter @boda/api db:push          # crea las tablas
pnpm --filter @boda/api db:seed          # usuario + boda demo (opcional)
```

Luego, desde el panel: **WhatsApp → Conectar** y escanear el QR con el chip dedicado
(WhatsApp → Dispositivos vinculados → Vincular dispositivo). Esa sesión queda guardada en el
volumen y sobrevive a los reinicios.

## 6. Alternativa todo-en-uno: VPS con Docker

```bash
git clone <repo> && cd boda-studio
cp deploy/env.produccion.ejemplo .env      # completar PUBLIC_WEB_URL, JWT_SECRET, ADMIN_*
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --build
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml exec api npx prisma db push
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml exec api npx tsx prisma/seed.ts
```

Levanta PostgreSQL/SQLite (según el perfil), la API (`restart: always`, porque la sesión debe
vivir), la web servida por nginx y **Caddy**, que publica 80/443 y pide el certificado de
Let's Encrypt para `PUBLIC_WEB_URL` sin configuración extra. La API y nginx **no** quedan
expuestos: escuchan solo en loopback y Caddy los alcanza por la red interna de Docker.

El paso a paso completo, pensado para hacerse **desde el navegador** (consola de Oracle +
Cloud Shell + paneles de DNS), con los dos firewalls y la resolución de problemas, está en
[11 · Despliegue desde el navegador](11-despliegue-desde-el-navegador.md).

## 7. Checklist antes de dar el servicio a la organizadora

- [ ] `JWT_SECRET` propio y largo (no el del ejemplo).
- [ ] `ADMIN_PASSWORD` cambiado después del primer login.
- [ ] Volumen persistente montado en `/app/storage` y verificado con un reinicio de prueba.
- [ ] `PUBLIC_WEB_URL` con el dominio real (si no, los enlaces de los mensajes salen a
      `localhost` y **ningún invitado puede abrir su invitación**). Ver
      [10 · Una URL pública de verdad](10-url-publica.md).
- [ ] `curl -s https://<api>/api/health` devuelve `"linkIsPublic": true`.
- [ ] Un enlace de invitado abierto **desde un celular con datos móviles**, no en el wifi.
- [ ] Un envío de prueba a un número propio, en modo seco y luego real.
- [ ] Backup de la base de datos activado.
- [ ] Confirmar que la web pública carga en un celular real (no solo en el escritorio).

## 8. Costos de referencia (mensual)

| Concepto | Costo aproximado |
|---|---|
| Web estática en Cloudflare Pages (plan gratuito, uso comercial permitido) | 0 |
| API + PostgreSQL en VM Oracle *Always Free* | 0 |
| API + PostgreSQL en Railway (plan pago básico) | 5-10 USD |
| VPS 2 GB (Hetzner, Contabo, DigitalOcean) | 4-7 USD |
| Dominio | 1-2 USD el primer año; ~10-15 USD al año después (o 0 con `.pp.ua`) |
| Subdominio gratuito DuckDNS (alternativa al dominio) | 0 |
| Chip dedicado (una vez) | 3-8 USD |
| **Total mínimo real** | **≈ 0 USD/mes; ≈ 1-2 USD el primer año con dominio propio** |

Con la API oficial de Meta se agrega el costo por conversación de marketing (varía por país).
El detalle de cada opción, con sus límites y trampas, está en
[10 · Una URL pública de verdad](10-url-publica.md).
