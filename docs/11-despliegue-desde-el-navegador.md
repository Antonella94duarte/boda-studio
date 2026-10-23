# 11 · Despliegue desde el navegador (sin instalar nada)

Objetivo: pasar de "la invitación solo abre en mi computadora" a **un enlace real que
cualquier invitado abre desde su celular**, sin instalar nada en tu PC. Todo se hace con
pestañas del navegador: consola de Oracle Cloud, panel de Cloudflare/DuckDNS y la terminal
web que Oracle te da dentro del navegador (**Cloud Shell**).

Tiempo estimado: **60–90 minutos**, la primera vez. Después, actualizar es un solo comando.

Coste: **0 USD/mes** (VM gratuita de Oracle + subdominio DuckDNS) o **≈1–2 USD el primer año**
si preferís dominio propio. Ver [10 · Una URL pública de verdad](10-url-publica.md).

> **Lo que este despliegue resuelve:** `PUBLIC_WEB_URL` pasa de `http://localhost:5173` a
> `https://tu-dominio`, con HTTPS y la sesión de WhatsApp en un volumen que sobrevive a los
> reinicios. La API ya bloquea los envíos reales mientras el enlace no sea público.

---

## 0. Antes de empezar

| Necesitás | Para qué |
|---|---|
| Tarjeta de crédito o débito | Oracle la pide **solo para verificar identidad**. Los recursos *Always Free* no se cobran. |
| Cuenta de Google, GitHub o similar | Entrar a DuckDNS (si vas por el subdominio gratis). |
| Chip dedicado para WhatsApp | Nunca el número personal. Ver [05 · Envío por WhatsApp](05-whatsapp-envios.md). |
| Una hora sin interrupciones | Los pasos 2, 3 y 7 son los que más se traban. |

**Decidí ahora el nombre** (paso 1). El resto no cambia según elijas.

---

## 1. Elegir el nombre del sitio

### Opción A · Gratis: subdominio DuckDNS

1. Abrí <https://www.duckdns.org> y entrá con Google/GitHub/Twitter.
2. En el campo *subdomain*, escribí algo como `bodas-tunombre` → **add domain**.
3. Queda `bodas-tunombre.duckdns.org`. Anotá este nombre.
4. Dejá la IP vacía por ahora: la completás en el paso 2.5, cuando sepas la IP de la VM.

### Opción B · Recomendada: dominio propio (≈1–2 USD el primer año)

1. Comprá el dominio donde prefieras (Cloudflare Registrar cobra a precio de costo;
   Namecheap, Porkbun y `.xyz`/`.top` en promoción suelen estar a 1–2 USD el primer año).
2. Entrá al panel del registrador → **DNS** → agregá un registro **A**:

   | Tipo | Nombre | Valor | TTL | Proxy |
   |---|---|---|---|---|
   | A | `bodas` (o `@` para el dominio pelado) | *la IP de la VM, que tenés en el paso 2.5* | Auto / 300 | **DNS only** (sin proxy) |

   El proxy naranja de Cloudflare **apagado**: Caddy necesita el desafío HTTP para emitir el
   certificado. Si querés el proxy después, se puede, pero no en el primer intento.
3. Queda `https://bodas.tudominio.com`. Anotá el nombre.

> El resto de esta guía usa `<TU-DOMINIO>` como marcador: reemplazalo por
> `bodas-tunombre.duckdns.org` o `bodas.tudominio.com`, **sin** `https://` y **sin** barra final.

---

## 2. Crear la VM gratuita en Oracle Cloud

### 2.1 Cuenta

1. <https://cloud.oracle.com> → **Sign up** → país y correo.
2. Verificá el correo y la tarjeta. Elegí la **región principal** con cuidado: **no se puede
   cambiar después**. Desde Paraguay, `Brazil East (São Paulo)` o `Chile (Santiago)` dan la
   mejor latencia; `US East (Ashburn)` también sirve.

### 2.2 Generar la llave de acceso (en Cloud Shell)

La consola de Oracle tiene una terminal dentro del navegador. **No instala nada en tu PC.**

1. En la consola, hacé clic en el icono **`>_`** (arriba a la derecha, al lado de la campana).
   Se abre **Cloud Shell** en una pestaña inferior.
2. Esperá a que diga *Cloud Shell is ready*. Pegá esto y Enter:

   ```bash
   ssh-keygen -t ed25519 -C "boda-studio" -f ~/.ssh/boda -N ""
   cat ~/.ssh/boda.pub
   ```

3. Copiá **todo** el texto que empieza con `ssh-ed25519` (una sola línea). Lo vas a pegar en
   el paso 2.3.
4. La carpeta `~` de Cloud Shell es persistente (5 GB): la llave sigue ahí la próxima vez.

### 2.3 Crear la instancia

Menú **☰ → Compute → Instances → Create instance**.

| Campo | Valor |
|---|---|
| Name | `boda-studio` |
| Compartment | el que viene por defecto |
| Image | **Canonical Ubuntu 24.04** (o 22.04). Si no aparece, *Edit* → *Change image* |
| Shape | **Ampere · VM.Standard.A1.Flex** → **2 OCPU / 12 GB**. Es *Always Free eligible* |
| Boot volume | 50 GB (el valor por defecto; entra en los 200 GB gratuitos) |
| Networking | *Create new virtual cloud network* (por defecto), subred **pública** |
| Public IPv4 address | **Assign a public IPv4 address** (tildado) |
| SSH keys | **Paste public keys** → pegá la llave del paso 2.2 |

**Create**. En 1–2 minutos la instancia pasa a *Running*.

> **«Out of host capacity»**: es falta temporal de cupo ARM en esa zona. Probá otro
> *availability domain*, esperá 15 minutos, o usá `VM.Standard.E2.1.Micro` (1 GB, también
> Always Free) y agregá swap en el paso 5.3.

### 2.4 Anotar la IP

En la página de la instancia, *Instance access* → **Public IP address**. Es el número
`xxx.xxx.xxx.xxx`.

### 2.5 Apuntar el nombre a la IP

- **DuckDNS** (opción A): en <https://www.duckdns.org>, campo *current ip* de tu subdominio →
  pegá la IP → **update ip**.
- **Dominio propio** (opción B): en el DNS del registrador, editá el registro **A** del paso 1
  y poné esa IP.

Para comprobar que ya resuelve, esperá 2–3 minutos y abrí en otra pestaña
`https://<TU-DOMINIO>`: todavía **no** va a cargar (falta Caddy), pero si más adelante ves el
certificado, es que el DNS está bien.

---

## 3. Abrir los puertos (hay **dos** firewalls, y se olvidan los dos)

### 3.1 En la nube (Security List)

Menú **☰ → Networking → Virtual Cloud Networks** → tu VCN → **Security Lists** →
*Default Security List* → **Add Ingress Rules**. Cargá dos reglas:

| Stateless | Source Type | Source CIDR | IP Protocol | Destination Port Range |
|---|---|---|---|---|
| No | CIDR | `0.0.0.0/0` | TCP | `80` |
| No | CIDR | `0.0.0.0/0` | TCP | `443` |

(El 22 ya está abierto por defecto para poder entrar por SSH.)

### 3.2 En la máquina (iptables de la imagen de Oracle)

Las imágenes de Ubuntu de Oracle traen reglas que rechazan todo salvo el 22. Volvé a
**Cloud Shell** y entrá a la VM:

```bash
ssh -i ~/.ssh/boda ubuntu@<IP-DE-LA-VM>
```

La primera vez pregunta `Are you sure you want to continue connecting?` → escribí `yes`.

Ya dentro de la VM (el prompt cambia a `ubuntu@boda-studio:~$`):

```bash
sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Si querés confirmar que quedaron:

```bash
sudo iptables -L INPUT -n --line-numbers | head -12
```

> En algunas imágenes el firewall es `ufw`. Si `sudo ufw status` dice *active*, entonces
> además: `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`.

---

## 4. Instalar Docker (5 minutos, dentro de Cloud Shell)

Seguís conectado a la VM por SSH dentro del navegador. Pegá el bloque completo:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Cerrá la sesión y volvé a entrar para que tome el grupo:

```bash
exit
ssh -i ~/.ssh/boda ubuntu@<IP-DE-LA-VM>
docker compose version
```

Tiene que responder `Docker Compose version v2.x`. Si dice *permission denied*, repetí el
`ssh` (el grupo recién se aplica en una sesión nueva).

---

## 5. Traer el proyecto a la VM

### 5.1 Clonar

```bash
sudo apt-get update && sudo apt-get install -y git
git clone <URL-DEL-REPOSITORIO> boda-studio
cd boda-studio
```

Si el repositorio es privado, generá un *token* de GitHub con permiso de lectura y usá
`https://<token>@github.com/usuario/repo.git` como URL. **Después** cambiá el remoto para no
dejar el token guardado:

```bash
git remote set-url origin https://github.com/usuario/repo.git
```

### 5.2 Alternativa sin git: subir un ZIP

1. En tu PC: comprimí la carpeta del proyecto (sin `node_modules`).
2. En Cloud Shell: menú **⋮ (More) → Upload** → elegí el ZIP. Queda en `~`.
3. `scp ~/boda-studio.zip ubuntu@<IP>:/home/ubuntu/` y en la VM `unzip boda-studio.zip -d boda-studio`.

### 5.3 Swap (solo si la VM tiene 1 GB)

Con la shape `E2.1.Micro` conviene 2 GB de swap para que el build no se quede sin memoria:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 6. Configurar el `.env`

Desde la raíz del proyecto, en la VM:

```bash
cp deploy/env.produccion.ejemplo .env
nano .env
```

En `nano`, editá **solo** estas líneas (las demás quedan como están):

```env
PUBLIC_WEB_URL=https://<TU-DOMINIO>
PUBLIC_API_URL=https://<TU-DOMINIO>
JWT_SECRET=<pegá acá 48 bytes aleatorios>
ADMIN_EMAIL=<tu correo>
ADMIN_PASSWORD=<una clave fuerte>
```

Para generar el `JWT_SECRET` sin salir de Cloud Shell, abrí otra pestaña de Cloud Shell y
ejecutá `openssl rand -hex 48`. Copiá el resultado.

Guardar y salir de `nano`: **Ctrl+O**, Enter, **Ctrl+X**.

Comprobá que quedó bien (no muestra las claves):

```bash
grep -E '^(PUBLIC_WEB_URL|PUBLIC_API_URL|WHATSAPP_ENGINE)=' .env
```

> `PUBLIC_WEB_URL` **sin** barra final y **con** `https://`. Es la única línea que decide si los
> invitados pueden abrir su enlace de verdad.

---

## 7. Levantar todo con HTTPS

Un solo comando (la segunda `-f` agrega Caddy, que pide el certificado solo):

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --build
```

La primera vez tarda **5–10 minutos** (descarga imágenes y compila la web y la API). Después
bajás con:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml ps
```

Los tres servicios tienen que figurar `running` (o `healthy`): `api`, `web`, `caddy`.

Mirá cómo emite el certificado:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml logs caddy | tail -20
```

Cuando aparece `certificate obtained successfully`, abrí en el navegador:

- `https://<TU-DOMINIO>` → la invitación pública (o el 404 propio de la SPA).
- `https://<TU-DOMINIO>/admin` → el panel.

> Si el certificado no sale, es el 90 % de las veces **el puerto 80 cerrado** o **el DNS
> todavía apuntando a otra IP**. Ver la tabla de problemas al final.

---

## 8. Crear las tablas y la cuenta de la organizadora

La base es SQLite dentro de un volumen; hay que crear las tablas una vez:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml exec api npx prisma db push
```

Y la cuenta (usa `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`):

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml exec api npx tsx prisma/seed.ts
```

El seed también crea una **boda de ejemplo** con invitados para probar; se puede borrar desde
el panel cuando cargues la boda real. Es idempotente: se puede volver a correr sin romper nada.

---

## 9. Verificar que el enlace es público (el punto de todo esto)

1. En el navegador: `https://<TU-DOMINIO>/api/health` → buscá `"linkIsPublic": true`.
2. Entrá a `https://<TU-DOMINIO>/admin` con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. **No** tiene que aparecer el cartel rojo de "los enlaces no se abren desde un teléfono".
4. En **Invitados**, copiá el enlace de un invitado y abrilo **desde el celular con datos
   móviles** (no en el wifi de tu casa). Tiene que cargar la invitación y dejar confirmar.

Si el paso 4 funciona, el problema que motivó todo esto está resuelto.

---

## 10. Conectar WhatsApp y hacer la primera campaña

1. Panel → **WhatsApp** → **Conectar** → aparece el QR.
2. En el celular del **chip dedicado**: WhatsApp → **Dispositivos vinculados** →
   **Vincular un dispositivo** → escaneá.
3. El panel pasa a *Conectado · +595…*. La sesión queda guardada en el volumen
   `wa_session`: sobrevive reinicios y actualizaciones.
4. **Prueba de envío** a tu propio número desde la misma pantalla.
5. Panel → **Campañas** → primera campaña **en modo de prueba** (no envía nada, muestra el
   texto final de cada invitado). Revisá que el enlace del texto sea `https://<TU-DOMINIO>/i/…`.
6. Recién entonces, campaña real a **5 números propios** y después en tandas de 20–30.
   Leé [05 · Envío por WhatsApp](05-whatsapp-envios.md) antes de la campaña grande: los
   retardos y el tope diario no se tocan.

---

## 11. Backups, actualización y sesión de WhatsApp

### Backup de la base (desde Cloud Shell)

```bash
cd ~/boda-studio
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml exec api \
  sh -c 'cp /app/storage/db/prod.db /app/storage/db/backup-$(date +%F).db'
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml cp \
  api:/app/storage/db/backup-$(date +%F).db ~/
```

Y en Cloud Shell: menú **⋮ → Download** para bajarlo a tu PC. Además, en la consola de Oracle
podés programar **Boot Volume Backups** de la VM entera (Storage → Block Volumes → Backups).

### Actualizar la aplicación

```bash
cd ~/boda-studio
git pull
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --build
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml exec api npx prisma db push
```

El volumen `wa_session` no se toca: **no hay que volver a escanear el QR**.

### Si el número se bloquea

Panel → WhatsApp → Desconectar, conectar un chip nuevo (otro QR) y **reanudar** las campañas:
los mensajes ya enviados no se repiten (cada uno queda persistido antes y después del envío).

---

## 12. Problemas típicos y qué hacer

| Síntoma | Causa más probable | Solución |
|---|---|---|
| `https://<TU-DOMINIO>` no carga | DNS sin propagar o IP equivocada | En DuckDNS/DNS, verificá la IP. Esperá 2–3 min. `ping <TU-DOMINIO>` |
| Caddy dice `no certificate` / error de ACME | Puerto 80 cerrado | Revisá **las dos** capas del paso 3 (Security List **y** iptables) |
| `502 Bad Gateway` en `/admin` | La API no arrancó | `docker compose ... logs api` — casi siempre falta una variable del `.env` |
| El panel dice "enlaces no públicos" | `PUBLIC_WEB_URL` sigue en localhost | Editá `.env` y `docker compose ... up -d` (sin `--build`) |
| `db push` falla con `file:` / `sqlite` | `DATABASE_URL` apunta a Postgres | Dejá `DATABASE_URL=file:/app/storage/db/prod.db` |
| "Out of host capacity" al crear la VM | Sin cupo ARM en esa zona | Otro *availability domain*, reintentar, o shape Micro + swap |
| `permission denied` con docker | Grupo docker sin aplicar | `exit` y volver a entrar por `ssh` |
| Se pierde la sesión de WhatsApp | El volumen `wa_session` no está montado | `docker compose ... config` debe mostrar `/app/storage/sessions` |
| El QR no aparece | Motor en `preview` | En `.env`: `WHATSAPP_ENGINE=baileys` y reiniciar |

---

## 13. Checklist final antes de mandar el primer mensaje real

- [ ] `https://<TU-DOMINIO>/api/health` → `"linkIsPublic": true` y `"database": "ok"`.
- [ ] Un enlace de invitado abre **desde un celular con datos móviles**.
- [ ] La confirmación (RSVP) guarda y se ve en el panel.
- [ ] WhatsApp conectado con el chip dedicado (no el personal).
- [ ] Prueba a tu propio número recibida y con el enlace correcto.
- [ ] Campaña en modo de prueba revisada completa.
- [ ] `JWT_SECRET` propio y `ADMIN_PASSWORD` cambiada.
- [ ] Backup de la base bajado a tu PC.
- [ ] Retardos y tope diario sin tocar (6–14 s, 250/día).
