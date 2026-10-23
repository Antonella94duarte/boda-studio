# Boda Studio · Propuesta de infraestructura y costos

**Para:** socio / socia del proyecto
**De:** equipo técnico
**Asunto:** dónde vive el sistema, cuánto cuesta y qué riesgos asumimos
**Fecha:** documento vigente al día de hoy · los precios están contrastados con las páginas
oficiales de cada proveedor en 2026 (ver Anexo)

---

## Resumen ejecutivo

1. El sistema está terminado y probado de punta a punta: invitación web personalizada, envío
   masivo por WhatsApp y panel de confirmaciones.
2. Encontramos **un error grave que hacía inútil cada campaña**: los mensajes salían con un
   enlace que solo funcionaba en la computadora de la organizadora. **Ya está corregido y
   bloqueado**: el sistema no permite un envío real con un enlace roto.
3. Para publicarlo hace falta **una dirección de internet de verdad**. Ya está resuelta la
   parte técnica y el paso a paso; falta decidir el nombre.
4. **Costo de infraestructura: 0 USD/mes.** El único gasto real es el dominio (≈1–2 USD el
   primer año, o gratis con un subdominio) y un chip de WhatsApp (3–8 USD, una sola vez).
5. **El riesgo principal no es técnico, es de WhatsApp**: el envío no usa el canal oficial de
   Meta y el número puede ser bloqueado. Está mitigado y documentado, y existe un plan B.

---

## 1. Qué hace el sistema (en una frase y en un flujo)

Una plataforma que reemplaza las dos tareas que hoy se hacen a mano: la tarjeta PDF y el
reenvío de WhatsApp uno por uno.

```
La organizadora importa el Excel de invitados
    → el sistema crea un enlace único por invitado
        → envía el mensaje personalizado ("Hola Ana, válido para 2 personas")
            → el invitado abre su invitación y confirma en línea
                → el panel muestra confirmados, pases y restricciones alimentarias
```

Lo que diferencia al producto de mandar un PDF: **cada invitado recibe su propio enlace**, así
que el panel sabe quién abrió, quién confirmó y cuántos pases usa cada uno. Un PDF no dice nada
de eso.

---

## 2. El problema que encontramos y cómo quedó resuelto

**Qué pasaba.** El enlace que va dentro de cada mensaje se armaba con una configuración que
tenía un valor de prueba: `localhost`. Ese texto significa "esta misma computadora". En el
teléfono del invitado, "esta misma computadora" es *su propio teléfono*: tocaba el enlace y no
abría nada.

Lo peligroso es que **el sistema no fallaba**: los 200 mensajes se enviaban perfecto. El error
se descubría cuando ya no tenía arreglo — el número se había usado para mandar enlaces muertos
y ningún invitado había podido confirmar.

**Qué hicimos.** Tres capas, para que no pueda repetirse:

1. **El sistema ahora distingue** una dirección pública de una que solo existe en una red
   interna (localhost, IP de la casa, dominios de prueba, túneles temporales).
2. **Bloquea el envío real** si el enlace no es público. La campaña queda en pausa con el
   motivo escrito, sin gastar un solo mensaje. El "modo de prueba" (que muestra los textos sin
   enviar) sigue funcionando siempre.
3. **Avisa antes de que pase**: al arrancar, en el chequeo de estado y con un cartel rojo en el
   panel de la organizadora.

Además se agregaron **15 pruebas automáticas** sobre esa regla y comprobaciones en la prueba de
integración, para que un cambio futuro no la rompa sin que nos enteremos.

---

## 3. Opciones y costos

Todo lo que sigue son precios de lista de los proveedores. La columna "costo" es **mensual,
recurrente**, salvo donde se aclara.

| Opción | Qué implica | Costo | Veredicto |
|---|---|---|---|
| **A · Todo gratis** — servidor gratuito de Oracle Cloud + subdominio DuckDNS | El enlace queda `tu-boda.duckdns.org` | **0 USD** | Sirve, pero el nombre no da confianza y no se puede mover de proveedor sin cambiar todos los enlaces |
| **B · Gratis + dominio propio** *(recomendada)* | Lo mismo que A, con un dominio comprado | **0 USD/mes** + ≈1–2 USD el primer año de dominio (≈10–15 USD/año después) | **Mejor relación costo/beneficio**: parece un producto profesional y el enlace es para siempre |
| **C · Servidor gestionado** (VPS de 2 GB o similar) | Se paga por comodidad: menos pasos, soporte | **≈5–8 USD/mes** + dominio | Solo si preferimos no administrar nada |
| **D · Planes gratuitos de otras plataformas** | Render, Railway, Vercel, Fly, Koyeb | 0 a 5 USD | **No sirven** para esto: el envío por WhatsApp necesita un proceso siempre encendido y un disco que no se borre. Esos planes duermen el proceso o borran el disco (ver Anexo) |

### Lo que cuesta cada boda, en la práctica

Con la opción B, el único gasto recurrente es el dominio. Si el dominio cuesta 12 USD al año y
se usa para 10 bodas, son **1,2 USD por boda**, contra las horas de trabajo manual que hoy
insume mandar 200 mensajes uno por uno y perseguir confirmaciones.

---

## 4. Recomendación

**Opción B: servidor gratuito de Oracle Cloud + dominio propio.**

Por qué:

- **Coste casi nulo**: 0 USD/mes de infraestructura; el dominio es el gasto más chico del
  proyecto y el que más se nota de cara al cliente.
- **Cumple los tres requisitos técnicos** que ninguna plataforma gratuita cumple a la vez:
  proceso siempre activo, disco persistente (ahí vive la sesión de WhatsApp) y HTTPS.
- **Un solo servidor**: la web, la API y la base de datos en la misma máquina, con un dominio
  único y certificado automático. Menos piezas, menos cosas que se rompen.
- **Se puede revertir**: si mañana crece, el mismo paquete se muda a un servidor pago de 5 USD
  sin cambiar una línea de código.

La alternativa honesta: si no queremos administrar un servidor, la opción C resuelve lo mismo
por 5–8 USD/mes. No hay una tercera vía gratuita que funcione con WhatsApp hoy.

---

## 5. Estado actual del producto

| Pieza | Estado |
|---|---|
| Invitaciones web personalizadas (por invitado, con token) | Terminado y probado |
| Importación de invitados (Excel/CSV, alias de columnas, teléfonos) | Terminado y probado |
| Envío masivo por WhatsApp con cola, pausas y reanudación | Terminado; falta la prueba con el número real |
| Panel de confirmaciones (pases, restricciones, grupos) | Terminado y probado |
| Enlaces públicos y bloqueo de envíos con enlace roto | Terminado y probado (nuevo) |
| Prueba en celular real del diseño de la invitación | **Pendiente** (requiere un dispositivo) |
| Envío real de punta a punta con el chip dedicado | **Pendiente** (requiere el chip) |

Las dos cosas pendientes no son desarrollo: son **verificación con hardware real**. Se resuelven
en una tarde, con el chip en la mano.

---

## 6. Riesgos y cómo los manejamos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Bloqueo del número de WhatsApp** (el envío no usa el canal oficial de Meta) | Alto: sin número no hay campaña | Chip dedicado (nunca el personal), "calentar" el número unos días, retardos de 6–14 s entre mensajes, tope de 250 por día, mensajes personalizados, modo de prueba previo y plan de contingencia (chip nuevo + reanudar) |
| Pérdida de la sesión de WhatsApp | Medio: hay que escanear un QR otra vez | La sesión vive en un volumen persistente; se verifica con un reinicio de prueba antes de la primera campaña |
| Enlaces rotos por mala configuración | Alto | **Resuelto**: bloqueo automático + aviso en el panel |
| Datos personales de invitados (Ley 6534/2020) | Medio: obligación legal | Datos aislados por organizadora, borrado por invitado y borrado al finalizar el evento; no se comparten con terceros |
| Dependencia de un servidor gratuito | Bajo/Medio: la política del proveedor puede cambiar | El stack es estándar (Docker): mudarse a un servidor de 5 USD es cuestión de horas |
| Caída del servidor durante una campaña | Bajo | Cada mensaje se guarda antes y después de enviarse: al reanudar no se repite ni se pierde ninguno |

---

## 7. Decisiones que necesitamos tomar

- [ ] **Nombre del sitio**: ¿usamos el subdominio gratuito o compramos dominio? (recomendamos
      comprar; si es para una clienta puntual, el nombre puede ser el de la boda)
- [ ] **Número de WhatsApp**: ¿comprar el chip dedicado ahora? Sin eso no se puede probar el
      envío real.
- [ ] **Quién opera el panel**: la organizadora sola o con soporte nuestro.
- [ ] **Política de datos**: cuánto tiempo guardamos la lista después de la boda y quién la borra.
- [ ] **Precio al cliente final**: cuánto se cobra por boda (el costo técnico por boda es ≈1 USD).

---

## 8. Próximos pasos y tiempos

| Cuándo | Qué | Quién |
|---|---|---|
| Día 1 (1–2 h) | Crear la cuenta de Oracle, la VM gratuita y el dominio; publicar con HTTPS siguiendo el paso a paso | Nosotros (todo desde el navegador) |
| Día 1 | Verificar que un enlace de invitado abre desde un celular con datos móviles | Nosotros |
| Día 2 | Comprar y "calentar" el chip dedicado; conectar WhatsApp y hacer la prueba a un número propio | Organizadora + nosotros |
| Día 3 | Campaña en modo de prueba con la lista real; revisar textos y enlaces | Organizadora |
| Día 4 | Primera tanda real (20–30 invitados), revisar entregas y confirmaciones | Organizadora |
| Semana 2 | Campaña completa del resto de la lista | Organizadora |

---

## Anexo · De dónde salen los precios y los límites

Contrastado en 2026 contra las páginas oficiales:

- **Oracle Cloud "Always Free"**: hasta 2 OCPU / 12 GB de RAM (ARM) o dos máquinas micro AMD,
  200 GB de disco, 10 TB de salida por mes, gratis mientras la cuenta exista en la región
  principal. Requiere tarjeta solo para verificar identidad.
  <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>
- **Cloudflare Pages**: plan gratuito con ancho de banda estático ilimitado y **uso comercial
  permitido**. Se usa si se prefiere servir la web aparte del servidor.
  <https://developers.cloudflare.com/pages/platform/limits/>
- **Vercel Hobby**: gratuito pero **solo para uso personal no comercial**; un producto como
  este requeriría Pro (20 USD/mes). Por eso no lo recomendamos para la web comercial.
  <https://vercel.com/pricing>
- **Render**: el plan gratuito duerme el servicio a los 15 minutos de inactividad, no tiene
  disco persistente y su base gratuita vence a los 30 días: incompatible con la sesión de
  WhatsApp. <https://render.com/pricing>
- **Railway**: 5 USD de crédito de prueba por 30 días y luego 1 USD/mes de crédito; un servicio
  siempre activo ronda los 5 USD/mes. <https://railway.com/pricing>
- **Koyeb** cerró su plan gratuito a cuentas nuevas en febrero de 2026 y **Fly.io** en octubre
  de 2024. Comparativa de conjunto: <https://agentdeals.dev/hosting-free-tier-comparison-2026>
- **DuckDNS**: subdominio gratuito. <https://www.duckdns.org>

Detalle técnico completo, con los descartes y el paso a paso: `docs/10-url-publica.md` y
`docs/11-despliegue-desde-el-navegador.md`.
