# 07 · Roadmap

Cada fase deja algo usable. Nada de «hacer todo el backend y después ver la interfaz».

## Fase 0 · Estructura y contratos ✅ (esta entrega)

- Monorepo pnpm con `apps/api`, `apps/web`, `packages/shared`.
- Esquemas Zod de invitación, invitado, importación y campaña.
- Modelo de datos Prisma multi-boda.
- Normalización E.164 y utilidades de formato en español.
- Documentación completa (esta carpeta) y datos reales de ejemplo.
- Criterio de aceptación: `pnpm install && pnpm typecheck` pasa en los tres paquetes.

## Fase 1 · Invitación pública funcionando

- Renderizador de las 10 secciones desde la configuración.
- Tema por CSS variables + 4 presets.
- Cuenta regresiva, galería con visor, música, «cómo llegar».
- Confirmación en línea con token personalizado.
- Criterio de aceptación: la boda de ejemplo (Sandra & Jorge) se ve completa en un celular
  real, y una confirmación de prueba se refleja en la base.

## Fase 2 · Panel: bodas e invitados

- Login, listado de bodas, alta de boda.
- Editor de configuración (pareja, eventos, dress code, regalos, secciones, tema, publicar).
- Tabla de invitados con filtros, edición, enlaces y totales (pases, confirmados).
- Criterio de aceptación: la organizadora crea una boda desde cero sin tocar la base de datos.

## Fase 3 · Importación

- Asistente de dos pasos con previsualización y editor de mapeo.
- Detección automática de columnas y errores por fila.
- Deduplicación y agrupación por familia.
- Criterio de aceptación: importar `samples/invitados.xlsx` (con acentos, teléfonos en tres
  formatos y una fila rota) produce el conteo esperado y rechaza solo la fila inválida.

## Fase 4 · Envío por WhatsApp

- Conexión por QR y panel de estado de la sesión.
- Compositor de campaña con vista previa por invitado y variables.
- Cola con retardos, tope diario, modo seco, pausa/reanudar/cancelar.
- Trazabilidad por invitado y por campaña.
- Criterio de aceptación: campaña de 30 mensajes en modo seco con el texto correcto por
  invitado; luego campaña real de 5 a números propios, con pausa y reanudación a mitad.

## Fase 5 · Confiabilidad y operación

- Reintento programado de fallidos (cron nocturno).
- Notificación a la organizadora cuando la sesión se cae.
- Exportación a Excel/CSV de la lista con estado de confirmación.
- Vista de mesa/plano con grupos y restricciones alimentarias.
- Recordatorios automáticos a los que no confirmaron, con fecha límite.
- Criterio de aceptación: un reinicio del servidor a mitad de campaña no pierde ni repite
  mensajes.

## Fase 6 · Producto y datos

- Multi-usuario real (varias organizadoras) con planes y límites.
- Dominios propios por boda (`bodasandraujorge.com` apuntando a la misma app).
- Plantillas de tema compradas/personalizadas por la pareja.
- Eliminación programada de datos al finalizar la boda + exportación previa.
- Métricas: invitaciones abiertas, tasa de confirmación, tiempo hasta la confirmación.

## Ideas para después (no comprometidas)

- Recordatorios por WhatsApp el día antes con el mapa.
- Lista de regalos integrada con pasarela de pago.
- Pase digital con QR para el ingreso al salón y control de puerta desde el celular.
- Carga de la lista de invitados desde una foto del cuaderno (OCR).

## Riesgos y cómo se manejan

| Riesgo | Mitigación |
|---|---|
| Bloqueo del número de WhatsApp | Número dedicado, calentamiento, retardos, topes, modo seco, plan de contingencia documentado |
| Pérdida de la sesión (volumen) | Verificación con reinicio de prueba antes de la primera campaña |
| Sospecha de reenvío del enlace | Un token por invitado; el panel muestra quién abrió cada enlace |
| Lista con teléfonos mal cargados | Previsualización obligatoria antes de escribir en la base |
| Enlaces con `localhost` por mala configuración | **Resuelto:** la API clasifica `PUBLIC_WEB_URL`, bloquea los envíos reales con enlace no público, lo avisa en el arranque, en `/api/health` (`linkIsPublic`) y con un cartel en el panel. Guía de URL real gratis/barata en [10 · Una URL pública de verdad](10-url-publica.md) |
| Datos personales de terceros | Aislamiento por organizadora, borrado por invitado y borrado al finalizar |
