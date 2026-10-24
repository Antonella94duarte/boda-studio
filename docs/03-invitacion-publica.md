# 03 · Invitación pública y personalización

## Cómo llega el invitado

```
WhatsApp (mensaje personalizado)
   └── https://<dominio>/i/sandrayjorge/8f3c9a1d2b4e6f70
            └── Invitación con el nombre del invitado y sus pases
                 └── Botón "Confirmar asistencia"
```

- `/i/:slug` → invitación sin personalizar (para redes, o para quien la recibe reenviada).
- `/i/:slug/:token` → invitación personalizada: saludo con nombre, pases exactos, formulario
  de confirmación en línea, y recuerda si ya confirmó.

El token es aleatorio (128 bits, `crypto.randomBytes`), no correlativo. No se puede recorrer
la lista de invitados adivinando URLs.

## Catálogo de secciones

Derivado del análisis de tarjetas reales (la del PDF de Sandra & Jorge, y la de la página
`alexocreativo.top/vanessayhector`). La organizadora activa, desactiva y **reordena** cada
sección desde el panel; nada de esto requiere programar.

| id | Sección | Contenido | Nace de |
|---|---|---|---|
| `hero` | Portada | Foto a pantalla completa, nombres, frase corta, saludo personalizado | Todas las tarjetas |
| `countdown` | Cuenta regresiva | Días/horas/minutos/segundos al evento principal; «¡Hoy es el gran día!» | Estándar en invitaciones web |
| `quote` | Versículo o frase | «Sobre todo vístanse de amor, que es el vínculo perfecto.» — Colosenses 3:4 | Página 2 del PDF |
| `story` | Nuestra historia | Párrafos + fotos de la pareja | Opcional |
| `gallery` | Galería | Grilla de fotos con visor a pantalla completa | Opcional |
| `events` | Ceremonias | Una tarjeta por evento: religiosa, civil, brindis, fiesta; fecha larga, hora, lugar y «Cómo llegar» | Páginas 1 y 2 del PDF |
| `dressCode` | Dress code | «Ellas de largo y ellos de corbata» + paleta de colores sugerida | Página 2 del PDF |
| `gifts` | Regalos | Mensaje + cuentas bancarias con botón de copiar (Sudameris N° 8010113000, alias CI N° 3939813) | Página 3 del PDF |
| `rsvp` | Confirmar asistencia | Formulario en línea + fecha límite + WhatsApp de contacto (0976 178000) | Necesidad del producto |
| `closing` | Cierre | Agradecimiento | Página 3 del PDF |

### Por qué la sección `events` es una lista y no campos fijos

Una boda puede tener **una** ceremonia (solo civil) o **tres** (religiosa + civil + brindis),
con lugares y horarios distintos — exactamente el caso del PDF: Iglesia Cristo Rey a las
16:30 y Casa Ardissone a las 19:00. Modelarlo como lista permite además marcar cuál es el
**evento principal** (`isMain`), que es el que alimenta la cuenta regresiva y la fecha del
mensaje de WhatsApp.

## Personalización

Cuando hay token, la invitación cambia:

| Sin token | Con token |
|---|---|
| «¡Nos casamos!» | «Hola Ana, te invitamos a nuestra boda» |
| Sin pases | «Tu invitación es válida para 2 personas» |
| Formulario deshabilitado + botón a WhatsApp | Formulario habilitado, con 1 campo de acompañante por pase |
| — | Si ya confirmó: «Confirmado · 2 personas · Ana Gómez y Luis Pérez» |

Regla de privacidad: el endpoint público devuelve **solo** nombre, pases, estado,
acompañantes y fecha de respuesta. Nunca el teléfono, las notas internas ni el grupo.

## Fotos: de dónde salen

La portada (`heroImage`), la galería (`gallery`) y las fotos de la historia
(`story.photos`) son listas de **rutas**. El panel las llena de dos maneras:

1. **Subiendo el archivo** (lo normal): `POST /api/weddings/:id/images` lo guarda en
   `UPLOAD_DIR/weddings/<boda>/` con un nombre generado por el servidor y devuelve la ruta
   `/api/uploads/<boda>/<archivo>`, que es la que queda en la configuración.
2. **Pegando una URL** externa (opción avanzada, dentro de «Usar una dirección web…»).

Como las rutas quedan dentro de `/api`, las imágenes se sirven por el mismo origen que la
invitación y el mismo proxy de nginx: no hay CORS ni configuración extra. El servido público
(`GET /api/uploads/:id/:file`) no pide token porque el invitado no tiene sesión, y el nombre
lleva 12 caracteres aleatorios para que no se pueda adivinar la foto de otra boda.

## Diseño y tema

- **CSS puro con custom properties.** El tema de cada boda es un objeto `Theme` (colores +
  tipografías) que se inyecta en `:root` como `--c-primary`, `--c-accent`, `--c-bg`, etc.
  No hay framework de estilos que pelee con esto.
- **Cuatro presets listos**: `elegant` (marfil y oro, serif), `modern` (alto contraste),
  `minimal` (blanco y negro) y `rustic` (terracota y verde oliva). La organizadora elige uno
  y puede ajustar los colores a mano.
- **Tipografías**: Cormorant Garamond (títulos), Montserrat (texto), Great Vibes (nombres) —
  las mismas familias que usa la tarjeta de Canva del ejemplo, así el resultado se siente
  familiar para la pareja.
- **Mobile-first**: se abre desde WhatsApp, en un celular, con una mano. Tipografías
  grandes, ritmo vertical generoso, animaciones de aparición suaves
  (`IntersectionObserver`) que se desactivan con `prefers-reduced-motion`.
- **Música**: botón flotante de play/pausa. Los navegadores móviles bloquean el autoplay, así
  que se muestra una invitación a tocar en vez de un silencio confuso.
- **Compartir**: la portada funciona como imagen de Open Graph, para que el enlace se vea
  bien cuando alguien lo reenvía.

## Lo que esta invitación hace y un PDF no

| | Tarjeta PDF | Invitación Boda Studio |
|---|---|---|
| Personalización por invitado | No | Nombre y pases en el propio mensaje y en la página |
| Confirmación | El invitado responde por WhatsApp; alguien lo anota | Formulario que actualiza el panel al instante |
| Saber quién abrió | No | Sí (token por invitado) |
| Cambiar un dato (hora, lugar) | Rehacer el PDF y reenviarlo a todos | Se edita en el panel; todos ven la versión nueva |
| Contar pases y comidas | A mano en una planilla | Panel con totales y restricciones alimentarias |
| Mapa y «cómo llegar» | Texto | Botón a Google Maps |
| Costo por cambio | Rediseño | Cero |
