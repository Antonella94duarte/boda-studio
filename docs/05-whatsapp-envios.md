# 05 · Envío masivo por WhatsApp

## Las tres formas de enviar (y cuál usamos)

| | **Baileys** (elegido) | **API oficial de Meta** | **Semiautomático (`wa.me`)** |
|---|---|---|---|
| Qué es | Cliente no oficial que habla el protocolo de WhatsApp Web | API de negocio de Meta (Cloud API) | El panel genera los enlaces y alguien hace clic |
| Costo | Gratis | Por conversación (categoría marketing) | Gratis |
| Requisitos | Escanear un QR con un número | Verificación de Meta Business + plantillas aprobadas | Ninguno |
| Texto del mensaje | Libre, personalizado por invitado | Solo plantillas pre-aprobadas con variables | Libre |
| Riesgo | **Puede bloquear el número** (viola los términos de uso) | Ninguno, es el canal oficial | Ninguno |
| Primer contacto | Puede escribir a quien nunca le escribió | Solo dentro de la ventana de 24 h o con plantilla aprobada | Igual que Baileys (lo envía una persona) |
| Infraestructura | Proceso Node siempre activo + volumen persistente | Sin proceso especial | Ninguna |

**Decisión**: se implementa la interfaz `WhatsAppEngine` con **Baileys** como motor por
defecto (gratis, sin trámites, texto libre y personalizado), `cloud-api` como adaptador real
listo para cuando la organizadora quiera formalizar el canal, y `preview` para desarrollo y
modo seco. La cola de campañas no sabe cuál se está usando: cambiar de motor es cambiar una
variable de entorno.

> Nota honesta para la organizadora: usar Baileys **viola los términos de servicio de
> WhatsApp** y el número puede ser bloqueado temporal o permanentemente. Se mitiga con las
> prácticas de la sección siguiente, pero no se elimina. Por eso el panel avisa y por eso se
> recomienda un **número dedicado**, nunca el personal de la organizadora.

## Arquitectura del motor

```
services/campaigns/sender.ts        (no sabe nada de WhatsApp)
        │  sendText(to, body)
        ▼
whatsapp/engine.ts                  interface WhatsAppEngine
        ├── baileys-engine.ts       makeWASocket + useMultiFileAuthState
        ├── cloud-api-engine.ts     POST graph.facebook.com/v21.0/.../messages
        └── preview-engine.ts       no envía: registra el mensaje
```

La sesión de Baileys se guarda en `WHATSAPP_SESSION_DIR/<userId>` (por defecto
`apps/api/storage/sessions/`). Es un volumen **persistente y secreto**: contiene las claves
de la cuenta vinculada. Si se borra, hay que escanear el QR otra vez; si se filtra, alguien
más puede escribir como ese número.

### Dos detalles de instalación de Baileys (importantes)

1. **Arrastra una dependencia resuelta por git.** El paquete declara
   `@whiskeysockets/eslint-config` (una configuración de ESLint, un error de empaquetado
   suyo) dentro de sus dependencias de ejecución. pnpm 11 rechaza las subdependencias
   "exóticas" y **aborta la instalación completa** con `ERR_PNPM_EXOTIC_SUBDEP`. Por eso
   `pnpm-workspace.yaml` incluye `blockExoticSubdeps: false` con su justificación.
   Si se prefiere no permitirlo, la ruta limpia es quitar `@whiskeysockets/baileys` de
   `apps/api/package.json` y usar `WHATSAPP_ENGINE=preview` (pruebas) o `cloud-api` (oficial):
   el motor ya está escrito para funcionar sin la librería y reporta el estado `error` en vez
   de caerse.
2. **Es pesada y hoy está marcada como deprecada en el registro.** Suma unos doscientos
   paquetes al `pnpm install`. Por eso el motor se carga con `await import(...)` dentro de un
   `try/catch`: la API arranca, se prueba y se despliega aunque Baileys no esté instalado, y
   solo el envío real por WhatsApp depende de esa librería.

## Cómo funciona una campaña

1. Se crea la campaña con una plantilla (`{{nombre}}`, `{{pases}}`, `{{enlace}}`, …).
2. Se genera **un `CampaignItem` por invitado**, con el texto final ya renderizado guardado
   en `renderedBody`. En este punto todavía no se envió nada.
3. El emisor recorre los ítems **de a uno**:
   - espera un retardo aleatorio entre `SEND_MIN_DELAY_MS` y `SEND_MAX_DELAY_MS`;
   - llama a `engine.sendText(teléfono, texto)`;
   - guarda `sent` + `providerMessageId` (o `failed` + el error, con hasta 2 reintentos);
   - actualiza los contadores de la campaña.
4. Antes de cada mensaje vuelve a leer el estado de la campaña: si se **pausó** o **canceló**
   desde el panel, se detiene en el punto exacto donde iba.
5. Si se alcanza el **tope diario** (`SEND_DAILY_LIMIT`), la campaña espera y continúa al día
   siguiente. Un `CampaignItem` se persiste antes y después de cada envío, así que un reinicio
   del servidor no repite ni pierde mensajes: se **reanuda** desde el primer `pending`.

Estados por ítem: `pending` → `sending` → `sent` | `failed` | `skipped`.
Un invitado que rechazó (`declined`) se marca `skipped` y no recibe nada.

## Plantilla por defecto

Tomada textualmente del mensaje que la organizadora ya envía a mano, pero personalizada:

```
¡Hola {{nombre}}! Tenemos una noticia muy especial: ¡Nos casamos! 💍✨

Queremos que seas parte de este día tan importante para nosotros el próximo 🗓️ {{fecha}}.

En el siguiente enlace podrás ver todos los detalles del evento:
👉 {{enlace}}

✅ Válido para {{pases}}

Para ayudarnos con la organización, te pedimos que nos confirmes tu asistencia
respondiendo a este mensaje o desde el propio enlace. Por favor, escríbenos los
nombres de quienes te acompañarán, para tenerles todo preparado. 🥳

¡Te esperamos para celebrar juntos!
Con cariño, {{novios}}.
```

| Variable | Se resuelve a |
|---|---|
| `{{nombre}}` | `Ana Gómez` |
| `{{pases}}` | `2 personas` (con plural correcto: `1 persona`) |
| `{{enlace}}` | `https://dominio/i/sandrayjorge/8f3c9a1d…` |
| `{{novios}}` | `Sandra y Jorge` |
| `{{fecha}}` | `viernes 30 de octubre de 2026` |
| `{{lugar}}` | `Iglesia Cristo Rey, Asunción` |
| `{{rsvp}}` | El enlace + `#rsvp`, para caer directo en el formulario |

La personalización **no es solo cortesía: es la principal defensa anti-bloqueo**. WhatsApp
detecta el patrón «mismo texto exacto a muchos números que no te tienen agendado»; 200
mensajes con nombre y pases distintos se parecen mucho más a una conversación real.

## Buenas prácticas operativas (importante)

1. **Número dedicado.** Comprar un chip solo para esto. Nunca el número personal de la
   organizadora ni el del negocio.
2. **Calentar el número.** Antes de la campaña, usarlo unos días: conversaciones normales,
   que algunos contactos le escriban primero, foto de perfil y nombre comercial.
3. **Empezar por tandas.** Primera campaña a 20-30 invitados, revisar entregas, y recién
   después la lista completa.
4. **Nunca bajar los retardos.** Los valores por defecto son 6-14 s aleatorios. Ponerlos en
   1 s es la forma más rápida de que el número caiga. Nada de «modo turbo».
5. **Tope diario.** 250 por día por defecto; para listas grandes, repartir en 2-3 días.
6. **Modo seco primero.** La primera pasada de cada boda se hace con `dryRun=true`: se ve el
   texto final de todos los mensajes sin enviar ninguno. Es gratis y atrapa el error típico
   (variable mal escrita, enlace roto, nombre equivocado).
7. **Responder.** El número debe contestar los mensajes que lleguen («confirmado», «no puedo
   ir»). Un número que solo emite y nunca responde se parece a un bot.
8. **Guardar los contactos.** Pedir a los invitados que agenden el número; un contacto
   agendado tiene muchas menos probabilidades de reportar como spam.
9. **Nada de imágenes ni stickers en el primer mensaje** si el número es nuevo. Texto y un
   enlace a un dominio propio y estable.
10. **Cuidado con los reenvíos.** Si el mismo invitado reenvía su enlace a diez personas, el
    tráfico parece legítimo (es la misma URL con el mismo token); se detecta en el panel y se
    avisa a la organizadora.

## Si el número se bloquea

- El bloqueo suele ser **temporal** (24-72 h) si es el primero. No reintentar en caliente:
  reintentar acelera la conversión a permanente.
- Cambiar a un número nuevo implica volver a escanear el QR (una operación desde el panel).
- Las campañas **no se pierden**: los `CampaignItem` fallidos quedan con su error y se
  reintentan con `resume` sobre el número nuevo.
- Plan de contingencia: cambiar `WHATSAPP_ENGINE=preview`, exportar los enlaces generados y
  enviarlos a mano (o pasar a la API oficial).

## API oficial de Meta (cuando se quiera formalizar)

El adaptador ya está escrito (`cloud-api-engine.ts`) y usa:
`POST https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages`.

Diferencias que obligan a cambiar el flujo, no solo la credencial:
- hay que **registrar y aprobar una plantilla** (`WHATSAPP_TEMPLATE_NAME`), con variables
  posicionales (`{{1}}`, `{{2}}`) en vez de nombres;
- fuera de la ventana de 24 h desde el último mensaje del invitado, **solo** se puede enviar
  esa plantilla, no texto libre;
- cada conversación de marketing se **factura**;
- el número debe estar verificado y asociado a un Meta Business Manager.

Por eso el sistema guarda la plantilla con variables legibles y la traduce al formato
posicional cuando el motor es `cloud-api`.

## Legalidad y consentimiento

- La organizadora ya tiene esos números: son sus invitados, con una relación previa. Aun así,
  conviene que el mensaje permita pedir **no recibir más** (por ejemplo, respondiendo «BAJA»),
  y que el panel tenga un estado `skipped` para quien lo pida.
- La lista de invitados es **información personal de terceros**: no se comparte con otras
  bodas, no se exporta a terceros, y se borra al terminar el evento (roadmap, fase 6).
- En Paraguay, la Ley 6534/2020 de Protección de Datos Personales exige finalidad
  determinada, seguridad y derecho de supresión: la plataforma debe poder **eliminar los datos
  de un invitado** a pedido, cosa que el panel ya permite.
