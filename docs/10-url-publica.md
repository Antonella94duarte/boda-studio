# 10 · Una URL pública de verdad (gratis o de bajo coste)

## El problema, en una frase

El `{{enlace}}` que viaja en cada mensaje de WhatsApp sale de `PUBLIC_WEB_URL`
(`apps/api/src/services/tokens.ts`). Su valor por defecto es
`http://localhost:5173`, que **en el teléfono del invitado significa «este mismo
teléfono»**: el invitado toca el enlace y no abre nada. El mensaje sale igual, se
gasta el número y la campaña ya no sirve.

Por eso, desde ahora, la API **bloquea los envíos reales** mientras el enlace no
sea público (`apps/api/src/services/link-health.ts`), lo avisa en el arranque, en
`GET /api/health` y con un cartel rojo en el panel. El modo seco (`dryRun`) sigue
funcionando siempre: sirve justamente para revisar los textos.

Este documento responde a la pregunta pendiente: **¿qué URL real pongo, gratis o
barata?**

> Ya está resuelto el **cómo**: [11 · Despliegue desde el navegador](11-despliegue-desde-el-navegador.md)
> es el paso a paso completo (cuenta, VM, puertos, DNS, HTTPS y verificación) sin instalar nada
> en tu computadora. Y [12 · Propuesta de infraestructura y costos](12-propuesta-infraestructura-y-costos.md)
> es la versión corta para compartir con un socio.

## Qué exige este proyecto (esto descarta la mitad de las opciones)

| Necesidad | Por qué |
|---|---|
| HTTPS con dominio estable | El enlace vive semanas en el chat de 200 invitados; si cambia, quedan todos muertos. |
| Un proceso Node **siempre despierto** | Baileys mantiene abierta la sesión de WhatsApp Web; si el proceso duerme, se cae la conexión. |
| **Disco persistente** | `WHATSAPP_SESSION_DIR` guarda las claves del número. Si se borra, hay que escanear el QR otra vez. |
| Servir la web estática | La invitación (`/i/<slug>/<token>`) es React compilado. |
| PostgreSQL (o SQLite) persistente | Invitados, confirmaciones y campañas. |

**La consecuencia incómoda:** no existe hoy un plan *serverless* gratuito que
cumpla las tres primeras filas. La sesión de WhatsApp no sobrevive a una
invocación sin estado ni a un servicio que se duerme a los 15 minutos. Las
opciones reales son: una VM (gratis o ~5 USD/mes) o un PaaS con plan pago.

## Decisión en una tabla

| Opción | Coste | Dificultad | Recomendada para |
|---|---|---|---|
| **A · Todo gratis** — Cloudflare Pages + Oracle Cloud *Always Free* + subdominio DuckDNS | **0 USD/mes** | Media (una VM Linux) | Probar el producto completo con una boda real, sin gastar nada |
| **B · Gratis + dominio propio** — lo mismo que A, pero con un dominio de ~1-2 USD el primer año | **≈ 0-2 USD/mes** | Media | **La que recomiendo para una clienta real**: el enlace parece profesional y no depende de un subdominio ajeno |
| **C · PaaS gestionado** — VPS o Fly/Railway con volumen | ≈ 5-8 USD/mes | Baja | Quien no quiere administrar un servidor |
| **D · Solo para probar** — túnel temporal | 0 USD | Muy baja | Ver la invitación en tu celular en 5 minutos (no para campañas) |

Lo que **no** sirve: Vercel/Netlify/Cloudflare Workers para la API (sin proceso ni
disco), Render gratis (se duerme y no tiene disco), ngrok gratis (URL nueva cada
vez y pantalla intermedia), Railway (5 USD de crédito de prueba y después ~5/mes),
Koyeb y Fly.io (ya no tienen plan gratis para cuentas nuevas).

## Opción A · Todo gratis, para siempre (0 USD/mes)

Tres piezas gratuitas que juntas sí cumplen los requisitos:

1. **Web** en **Cloudflare Pages** — ancho de banda estático ilimitado, HTTPS y
   dominio propio incluidos; permite uso comercial, a diferencia del plan Hobby
   de Vercel, que es solo para uso personal no comercial.
2. **API + PostgreSQL** en una VM **Oracle Cloud Always Free** — la máquina ARM
   (hasta 2 OCPU y 12 GB de RAM) o las dos micro AMD, con 200 GB de disco y 10 TB
   de salida al mes, gratis mientras la cuenta exista y en la región principal.
   Es la única nube grande con «gratis para siempre» en cómputo siempre activo.
3. **Dominio** con **DuckDNS** (`tu-boda.duckdns.org`, gratis) o un dominio propio
   (opción B).

### Paso a paso

1. **Cuenta en Oracle Cloud** (pide tarjeta solo para verificar identidad; los
   recursos *Always Free* no se cobran). Crear una instancia **VM.Standard.A1.Flex**
   con Ubuntu 22.04/24.04, 2 OCPU y 12 GB, y asignarle IP pública.
2. **Abrir los puertos 80 y 443** en la *Security List* de la VCN **y** en el
   firewall de la máquina (`ufw allow 80,443/tcp`). Es el error clásico: se abre
   en la consola y se olvida el firewall de Ubuntu.
3. **Instalar Docker** y clonar el repo. El `docker-compose.yml` del proyecto ya
   levanta PostgreSQL, la API (`restart: always`, volumen para la sesión de
   WhatsApp) y la web servida por nginx.
4. **Poner Caddy delante** para tener HTTPS automático (Let's Encrypt) con un
   solo archivo `/etc/caddy/Caddyfile`:

   ```caddyfile
   # Reemplazar por el nombre real: tu-boda.duckdns.org o bodas.tudominio.com
   bodas.tudominio.com {
       # La API y la web en el mismo dominio: la web llama a /api y no hay CORS
       handle /api/* {
           reverse_proxy 127.0.0.1:4000
       }
       handle {
           reverse_proxy 127.0.0.1:5173
       }
   }
   ```

   Con Caddy, web y API comparten host: `PUBLIC_WEB_URL=https://bodas.tudominio.com`
   y `PUBLIC_API_URL=https://bodas.tudominio.com`. Un solo dominio, cero problemas
   de CORS y un solo certificado que renovar (lo hace Caddy solo).
5. **Configurar `.env`** en el servidor (ver la sección «Variables» más abajo) y
   `docker compose up -d --build`.
6. **Escanear el QR** desde el panel (`/admin/whatsapp`) con el chip dedicado. La
   sesión queda en el volumen y sobrevive a los reinicios.
7. **Verificar** con la checklist del final.

### Dos detalles de Oracle que conviene saber

- **Recuperan máquinas ociosas**: si en 7 días la CPU está por debajo del 20 %, la
  red por debajo del 20 % y la memoria por debajo del 20 %, la instancia ARM puede
  reclamarse. Este stack mantiene la sesión de WhatsApp viva y PostgreSQL en RAM,
  así que en la práctica no está ocioso; si querés asegurarte, dejá una tarea
  liviana periódica (`cron` cada 10 minutos tocando el health check).
- **«Out of host capacity»** al crear la instancia ARM: es falta temporal de cupo
  en la región. Probá otro dominio de disponibilidad u otro horario, o usá una
  micro AMD (2 × 1 GB, alcanza para una boda).

### Precio real de la opción A

| Concepto | Coste |
|---|---|
| VM Oracle Always Free (24/7) | 0 |
| Cloudflare Pages (o la web en la misma VM) | 0 |
| PostgreSQL en la misma VM | 0 |
| Subdominio DuckDNS | 0 |
| **Total** | **0 USD/mes** |

Lo que se paga con esta opción es tu tiempo: una tarde de configuración inicial.

## Opción B · La que recomiendo para una clienta real (≈1-2 USD el primer año)

Igual que A, pero con un **dominio propio** en vez de un subdominio gratuito:
`https://bodas-studio.com`, `https://invitaciones.tumarca.com`, etc.

- Un `.com` en **Cloudflare Registrar** se compra **a precio de costo** (sin
  recargo de renovación) y los `.xyz`/`.top`/`.site` suelen estar a 1-2 USD el
  primer año en promoción. Es el gasto más pequeño del proyecto y el que más se
  nota: los invitados ven un dominio creíble.
- Si no querés pagar nada: **`.pp.ua` es un dominio gratuito** (registrador
  NIC.UA) y se puede delegar en Cloudflare; sirve, aunque el trámite de alta es
  más engorroso y el TLD no inspira confianza a todos.
- El DNS lo maneja Cloudflare (gratis) apuntando al IP de la VM de Oracle.

**Por qué vale la pena el dominio aunque la opción A sea gratis:** el enlace
queda escrito en 200 conversaciones de WhatsApp para siempre. Un subdominio
gratuito (`.duckdns.org`) funciona, pero se parece a los enlaces que WhatsApp
marca como sospechosos y no se puede mover de proveedor sin cambiar todos los
enlaces.

## Opción C · Sin administrar servidor (≈5-8 USD/mes)

Para quien prefiere pagar antes que tocar Linux. Sirve cualquier VPS pequeño; el
`docker-compose.yml` del repo está pensado para eso.

- **VPS 2 GB** (Hetzner, Contabo, DigitalOcean, Vultr): el `docker compose` del
  repo + Caddy del paso 4. Ojo: Hetzner subió sus precios de cloud entre 30 % y
  175 % en junio de 2026 según la línea, así que conviene comparar el precio del
  mes, no el de un blog viejo.
- **Fly.io o Railway**: también sirven (proceso siempre activo + volumen), pero ya
  no tienen plan gratuito para cuentas nuevas: Fly cobra desde ~2,19 USD/mes la
  máquina más chica y Railway da 5 USD de crédito de prueba y después ~5 USD/mes
  de plan Hobby. Siguen siendo *más caros* que un VPS para este caso.

Cualquiera de estas opciones necesita, además, el dominio de la opción B.

## Opción D · Ver la invitación en tu celular en 5 minutos (gratis)

Para comprobar el diseño desde un teléfono real **antes** de contratar nada.
Cloudflare Tunnel expone tu `localhost` con HTTPS y una URL pública temporal:

```bash
# En una terminal, con la web y la API corriendo (pnpm dev)
cloudflared tunnel --url http://localhost:5173
```

Devuelve algo como `https://tres-palabras-aleatorias.trycloudflare.com`.
Poné esa URL en `PUBLIC_WEB_URL`, reiniciá la API y abrí el enlace del invitado
desde el celular con datos móviles (no wifi).

**Limitación importante:** la URL cambia cada vez que se reinicia el túnel y el
host es compartido. Sirve para ver y probar; **no** para una campaña real. El
propio sistema lo advierte (`trycloudflare.com` está en la lista de túneles
temporales de `utils/public-url.ts`).

## Descartadas, y por qué

| Opción | Por qué no |
|---|---|
| **Vercel / Netlify / Cloudflare Workers** para la API | Sin proceso persistente ni disco: la sesión de WhatsApp se pierde en cada invocación. Sirven para la web estática. |
| **Render plan gratis** | Se duerme a los 15 min de inactividad, tarda ~1 min en despertar, 512 MB de RAM y **sin disco persistente**; su PostgreSQL gratuito vence a los 30 días. Con eso se cae la sesión de Baileys todas las noches. |
| **Vercel Hobby** para una web comercial | El plan gratuito es solo para uso personal no comercial; esto es una herramienta de trabajo, así que correspondería Pro (20 USD/mes). Cloudflare Pages y Netlify sí permiten uso comercial gratis. |
| **Railway plan gratuito** | 5 USD de crédito por 30 días y después 1 USD/mes de crédito: no alcanza para un servicio siempre activo. |
| **Koyeb / Fly.io (cuentas nuevas)** | Sin plan gratuito desde febrero de 2026 (Koyeb) y octubre de 2024 (Fly.io). |
| **ngrok gratis** | URL nueva en cada arranque + pantalla intermedia de advertencia: rompe el enlace y la vista previa del mensaje. |
| **IP pública a pelo, sin dominio** | Funciona, pero cualquier cambio de IP rompe todos los enlaces ya enviados, y sin HTTPS WhatsApp muestra el aviso de «no seguro». El sistema lo permite con una advertencia, no lo recomiendo. |

## Variables: qué poner en cada caso

Siempre en el `.env` del servidor (nunca en el repositorio):

```env
NODE_ENV=production

# La dirección donde el invitado abre su invitación. ESTA es la que arregla el problema.
PUBLIC_WEB_URL=https://bodas.tudominio.com
# La misma base si la web y la API comparten dominio (recomendado con Caddy).
PUBLIC_API_URL=https://bodas.tudominio.com

WHATSAPP_ENGINE=baileys
WHATSAPP_SESSION_DIR=/app/storage/sessions
```

- Si la web está en Cloudflare Pages y la API en otro host, `PUBLIC_WEB_URL` es el
  dominio de Pages y hay que agregar un rewrite `/api/*` hacia la API (ver
  [06 · Despliegue](06-despliegue.md)).
- `ALLOW_LOCAL_LINKS=true` solo existe para probar envíos reales dentro de tu red
  (un teléfono propio en el mismo wifi). En producción no se usa: nadie más
  abriría la invitación.

## Cómo saber que quedó bien

1. En el arranque, la API ya no dice «Los enlaces de las invitaciones apuntan a…
   y NO son públicos». Debe decir `Enlaces de invitación: https://…`.
2. `curl -s https://api.tudominio.com/api/health` → `"linkIsPublic": true`.
3. En el panel, arriba, **no** aparece el cartel rojo. Si aparece el amarillo, es
   una advertencia (http sin TLS, túnel temporal, IP en vez de dominio).
4. Abrí un enlace de invitado **desde un celular con datos móviles**, no en el
   wifi de la casa: es la prueba que de verdad cuenta.
5. Hacé un envío de prueba desde el panel y revisá en el teléfono que el enlace
   abre y que el formulario de confirmación guarda (`docs/08-manual-organizadora.md`).
6. Recién entonces: la primera campaña, en modo seco, y después en tandas de 20-30.

## Resumen para decidir en 30 segundos

- **Quiero gastar cero y no me asusta una VM Linux** → Opción A (Oracle + DuckDNS).
- **Es para una clienta real y quiero que se vea profesional** → Opción B (Oracle +
  dominio de 1-2 USD el primer año). **Recomendada.**
- **Prefiero pagar antes que administrar** → Opción C (VPS 5-8 USD/mes + dominio).
- **Solo quiero ver cómo queda en el celular ahora mismo** → Opción D (túnel
  temporal).
