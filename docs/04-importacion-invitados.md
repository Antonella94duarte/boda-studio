# 04 · Importación de invitados

El requisito es explícito: la organizadora sube **un Excel, CSV o TXT** donde un campo tiene
el teléfono. No debe tener que renombrar columnas ni reformatear teléfonos.

## Formatos aceptados

| Extensión | Cómo se lee |
|---|---|
| `.xlsx`, `.xls` | SheetJS; se usa la primera hoja |
| `.csv` | Separador autodetectado (`,` `;` tab `|`), comillas respetadas, BOM ignorado |
| `.txt` | Igual que CSV; si el separador es tabulación se trata como TSV |
| `.tsv` | Tabulaciones |

También se acepta codificación latin-1, porque muchos Excel en español exportan así
(«Muñoz» no debe llegar como «MuÃ±oz»).

## Columnas: alias que se reconocen solos

| Campo | Alias reconocidos (sin distinguir acentos ni mayúsculas) |
|---|---|
| `fullName` | nombre, nombres, nombre completo, invitado, invitados, apellido y nombre, familia, titular, guest, name |
| `phone` | teléfono, telefono, celular, cel, whatsapp, wpp, wa, móvil, numero, nro, tel, contacto, phone, mobile |
| `passes` | pases, pase, cupos, cupo, invitaciones, cantidad, cant, personas, pax |
| `groupName` | grupo, familia, mesa, tarjeta, invitación, group |
| `notes` | notas, observaciones, comentarios, detalle, comments |

Ejemplo de archivo que funciona **sin tocar nada**:

| Nombre y Apellido | Celular | Pases | Familia | Observaciones |
|---|---|---|---|---|
| Ana Gómez | 0981 123 456 | 2 | Amigos novia | Vegana |
| Familia González | 0976 178 000 | 4 | Familia novio | |

Si la detección falla, el panel muestra un **editor de mapeo**: una lista desplegable por
columna detectada (`fullName` / `phone` / `passes` / `groupName` / `notes` / ignorar). La
organizadora corrige y la previsualización se recalcula.

## Normalización de teléfonos

Es el paso crítico: un teléfono mal formado es un mensaje que nunca llega. Todo se guarda en
**E.164** (`+595976178000`).

Se aceptan y unifican todas estas formas:

| Entrada en el archivo | Resultado (país por defecto: Paraguay) |
|---|---|
| `0976 178000` | `+595976178000` |
| `976 178000` | `+595976178000` |
| `+595 976 178 000` | `+595976178000` |
| `595976178000` | `+595976178000` |
| `00595 976 178000` | `+595976178000` |
| `0976-178-000` | `+595976178000` |
| `0976 178000 (Sandra)` | `+595976178000` |

Países con reglas propias (prefijo nacional y longitud esperada): **PY, AR, BR, BO, CL, CO,
EC, MX, PE, UY, VE, US, ES**. El país por defecto se elige **por boda** (una boda en Asunción
y otra en Buenos Aires tienen listas distintas).

Un número se **rechaza** (fila con error, no se importa) cuando:
- está vacío o no tiene dígitos;
- la longitud no corresponde al país (`0976 178` → avisa cuántos dígitos se esperaban);
- empieza con `+` o `00` pero el código de país no se reconoce.

La previsualización muestra **por qué** se rechazó cada fila. Nunca se guarda a medias.

## Avisos (se importan igual, pero se revisan)

| Aviso | Por qué importa |
|---|---|
| Teléfono repetido dentro del mismo archivo | Casi siempre es la misma persona dos veces: se importa una sola vez |
| Teléfono ya existente en la boda | Decide `skip` / `update` / `duplicate` según la opción elegida |
| Sin pases | Se aplica el valor por defecto de la boda (normalmente 2) |
| Sin grupo/familia | Se agrupa como «Sin grupo» |

## Envío por familia

Con **agrupar por familia** activado, los invitados que comparten `groupName` reciben **un
solo mensaje** dirigido al titular con los pases **sumados** («Familia González: válido para
4 personas»). Evita mandar cuatro mensajes casi idénticos a la misma casa, que es la forma
más rápida de que WhatsApp marque el número como spam.

La implementación crea el mensaje para el primer integrante y marca los demás como
`skipped` con la nota «incluido en el mensaje de Familia González», para que el panel siga
cuadrando.

## Flujo en el panel (dos pasos, nunca uno)

```
1. Subir archivo + opciones
        └── POST /api/weddings/:id/import/preview
              ├── encabezados detectados + mapeo sugerido
              ├── tarjetas: total · válidas · con avisos · con error
              └── tabla fila por fila con el motivo del rechazo

2. Revisar y confirmar
        └── POST /api/weddings/:id/import/commit
              └── { creados, actualizados, omitidos, errores[] }
```

Nada se escribe en la base hasta el paso 2. Es deliberado: importar 300 invitados con los
teléfonos mal normalizados se paga después con 300 mensajes perdidos.

## Duplicados

| Opción | Cuándo usarla |
|---|---|
| `skip` (por defecto) | Volver a subir la misma lista sin miedo: solo agrega lo nuevo |
| `update` | La lista creció y algunos datos cambiaron (pases, notas) |
| `duplicate` | Casos raros: dos personas que comparten un mismo teléfono fijo |

## Plantilla lista para completar

Si la organizadora todavía no tiene la lista armada, el panel le ofrece una plantilla
descargable desde **Invitados → Importar**:

- `plantilla-invitados.xlsx` — Excel con la hoja `Invitados` (encabezados + 3 filas de
  ejemplo) y una segunda hoja `Instrucciones` con qué va en cada columna.
- `plantilla-invitados.csv` — lo mismo en texto plano, para quien no use Excel.

Se generan desde [`samples/_build_xlsx.py`](../samples/_build_xlsx.py) y se publican en
`apps/web/public/plantillas/`, así que se descargan también en el build de producción.
La columna del teléfono se escribe con formato de texto (`@`) a propósito: si Excel la trata
como número, pierde el cero inicial de `0981 123 456` y la importación rechaza la fila.

## Consejos para la organizadora

1. Una fila por invitación (titular), no una fila por persona: los acompañantes se cargan en
   la confirmación o en el campo de notas.
2. Si tienen el número en formato local, dejarlo así: el sistema antepone el código del país.
3. Borrar filas de encabezados repetidos y filas de totales antes de subir.
4. Cargar primero un archivo de prueba con 2-3 personas, ver el mensaje en modo seco, y
   después importar la lista completa.
