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

Recomendación práctica, que es la que el usuario eligió:
**web en Vercel/Netlify + API y base de datos en Railway/Render con volumen persistente.**
Si el envío falla por suspensión del servicio, mover **solo la API** a un VPS de 5 USD es la
salida rápida.

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

- Crear PostgreSQL en Railway/Render (o Neon/Supabase).
- Cambiar `provider = "sqlite"` → `"postgresql"` en `apps/api/prisma/schema.prisma`.
- `DATABASE_URL` = cadena de conexión del proveedor.
- Ejecutar una vez: `pnpm --filter @boda/api db:push`.
- Backups: activar los automáticos del proveedor; además, exportar la lista de invitados
  desde el panel antes de cada campaña grande.

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
cp .env.example .env      # completar JWT_SECRET, ADMIN_*, dominio
docker compose up -d --build
```

Levanta PostgreSQL, la API (con `restart: always`, porque la sesión debe vivir) y la web
servida por nginx. Para HTTPS, poner Caddy o Nginx Proxy Manager delante y emitir
certificados Let's Encrypt.

## 7. Checklist antes de dar el servicio a la organizadora

- [ ] `JWT_SECRET` propio y largo (no el del ejemplo).
- [ ] `ADMIN_PASSWORD` cambiado después del primer login.
- [ ] Volumen persistente montado en `/app/storage` y verificado con un reinicio de prueba.
- [ ] `PUBLIC_WEB_URL` con el dominio real (si no, los enlaces de los mensajes salen a
      `localhost` y **ningún invitado puede abrir su invitación**).
- [ ] Un envío de prueba a un número propio, en modo seco y luego real.
- [ ] Backup de la base de datos activado.
- [ ] Confirmar que la web pública carga en un celular real (no solo en el escritorio).

## 8. Costos de referencia (mensual)

| Concepto | Costo aproximado |
|---|---|
| Web en Vercel/Netlify (plan gratuito) | 0 |
| API + PostgreSQL en Railway (plan pago básico) | 5-10 USD |
| Dominio | 1-2 USD |
| Chip dedicado (una vez) | 3-8 USD |
| **Total** | **≈ 10 USD/mes** |

Con la API oficial de Meta se agrega el costo por conversación de marketing (varía por país).
