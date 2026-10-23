"""Genera el DOCX de la propuesta de infraestructura y costos (para el socio).

Uso:
    python scripts/build-propuesta-docx.py

Salida: docs/Boda-Studio-propuesta-infraestructura-y-costos.docx

Notas de formato (aprendidas a la mala):
- Las tablas necesitan `tblW` + `tblLayout=fixed` + `gridCol` con el ancho de
  cada columna; con solo `cell.width` Word y LibreOffice desbordan la página.
- El ancho útil es 16,4 cm (A4 21 cm menos 2,3 cm de cada margen).
"""

from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

# Paleta del producto (apps/web/src/styles/global.css)
BRAND = RGBColor(0x3B, 0x33, 0x2A)
GOLD = RGBColor(0xC9, 0xA2, 0x27)
INK = RGBColor(0x4A, 0x40, 0x38)
MUTED = RGBColor(0x8A, 0x7A, 0x63)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

OUT = Path(__file__).resolve().parent.parent / "docs" / "Boda-Studio-propuesta-infraestructura-y-costos.docx"

BODY_FONT = "Calibri"
MONO_FONT = "Consolas"

TEXT_WIDTH_CM = 16.4


# --------------------------------------------------------------------------- #
# Utilidades de formato
# --------------------------------------------------------------------------- #
def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def cell_margins(cell, top=70, bottom=70, left=100, right=100):
    tc_pr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement("w:tcMar")
    for tag, value in (("top", top), ("bottom", bottom), ("start", left), ("end", right)):
        el = OxmlElement(f"w:{tag}")
        el.set(qn("w:w"), str(value))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tc_pr.append(mar)


def cell_bottom_border(cell, color="D8D0C4", size=4):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement("w:tcBorders")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(size))
    bottom.set(qn("w:space"), "0")
    bottom.set(qn("w:color"), color)
    borders.append(bottom)
    tc_pr.append(borders)


def table_borders(table, color="D8D0C4", size=4):
    tbl_pr = table._tbl.tblPr
    for existing in tbl_pr.findall(qn("w:tblBorders")):
        tbl_pr.remove(existing)
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), str(size))
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), color)
        borders.append(el)
    tbl_pr.append(borders)


def no_borders(table):
    tbl_pr = table._tbl.tblPr
    for existing in tbl_pr.findall(qn("w:tblBorders")):
        tbl_pr.remove(existing)
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "nil")
        borders.append(el)
    tbl_pr.append(borders)


def fix_widths(table, widths_cm):
    """Ancho real de tabla: tblW + tblLayout=fixed + gridCol por columna."""
    tbl_pr = table._tbl.tblPr
    for tag in ("w:tblW", "w:tblLayout"):
        for existing in tbl_pr.findall(qn(tag)):
            tbl_pr.remove(existing)

    tbl_w = OxmlElement("w:tblW")
    tbl_w.set(qn("w:w"), str(int(round(sum(widths_cm) * 567))))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_pr.append(tbl_w)

    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tbl_pr.append(layout)

    for index, width in enumerate(widths_cm):
        table.columns[index].width = Cm(width)


def repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    tr_pr.append(header)


def bottom_rule(paragraph, color="C9A227", size=12):
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(size))
    bottom.set(qn("w:space"), "6")
    bottom.set(qn("w:color"), color)
    borders.append(bottom)
    p_pr.append(borders)


def add_field(paragraph, instruction, placeholder="1"):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = instruction
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = placeholder
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for element in (begin, instr, sep, text, end):
        run._r.append(element)


def spacer(doc, pts=6):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.line_spacing = 1
    run = p.add_run("")
    run.font.size = Pt(pts)
    return p


# --------------------------------------------------------------------------- #
# Bloques de contenido
# --------------------------------------------------------------------------- #
def body(doc, text, space_after=6, italic=False, size=10.5, color=INK, align="justify"):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.15
    p.alignment = {
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "center": WD_ALIGN_PARAGRAPH.CENTER,
    }[align]
    run = p.add_run(text)
    run.font.name = BODY_FONT
    run.font.size = Pt(size)
    run.font.italic = italic
    run.font.color.rgb = color
    return p


def rich_body(doc, parts, space_after=6):
    """Como body(), pero con trozos en negrita: parts = [(texto, negrita), ...]."""
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.15
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    for text, bold in parts:
        run = p.add_run(text)
        run.font.name = BODY_FONT
        run.font.size = Pt(10.5)
        run.font.bold = bold
        run.font.color.rgb = INK
    return p


def bullet(doc, text, bold_prefix=None, space_after=4):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.12
    if bold_prefix:
        run = p.add_run(bold_prefix)
        run.font.name = BODY_FONT
        run.font.size = Pt(10.5)
        run.font.bold = True
        run.font.color.rgb = BRAND
    run = p.add_run(text)
    run.font.name = BODY_FONT
    run.font.size = Pt(10.5)
    run.font.color.rgb = INK
    return p


def numbered(doc, text, bold_prefix=None):
    p = doc.add_paragraph(style="List Number")
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.line_spacing = 1.12
    if bold_prefix:
        run = p.add_run(bold_prefix)
        run.font.name = BODY_FONT
        run.font.size = Pt(10.5)
        run.font.bold = True
        run.font.color.rgb = BRAND
    run = p.add_run(text)
    run.font.name = BODY_FONT
    run.font.size = Pt(10.5)
    run.font.color.rgb = INK
    return p


def heading(doc, text):
    h = doc.add_heading(text, level=1)
    h.paragraph_format.space_before = Pt(15)
    h.paragraph_format.space_after = Pt(5)
    h.paragraph_format.keep_with_next = True
    for run in h.runs:
        run.font.name = BODY_FONT
        run.font.size = Pt(13.5)
        run.font.bold = True
        run.font.color.rgb = BRAND
    return h


def table(doc, headers, rows, widths, header_fill="3B332A", font_size=9.5, zebra=True):
    tbl = doc.add_table(rows=1, cols=len(headers))
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    table_borders(tbl)
    fix_widths(tbl, widths)

    head = tbl.rows[0]
    repeat_header(head)
    for index, text in enumerate(headers):
        cell = head.cells[index]
        cell.width = Cm(widths[index])
        shade(cell, header_fill)
        cell_margins(cell)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        run = p.add_run(text)
        run.font.name = BODY_FONT
        run.font.size = Pt(font_size)
        run.font.bold = True
        run.font.color.rgb = WHITE

    for row_index, values in enumerate(rows):
        cells = tbl.add_row().cells
        for col_index, value in enumerate(values):
            cell = cells[col_index]
            cell.width = Cm(widths[col_index])
            cell_margins(cell)
            if zebra and row_index % 2 == 1:
                shade(cell, "F7F4EF")
            text = str(value)
            bold = text.startswith("**") and text.endswith("**")
            if bold:
                text = text[2:-2]
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.08
            run = p.add_run(text)
            run.font.name = BODY_FONT
            run.font.size = Pt(font_size)
            run.font.bold = bold
            run.font.color.rgb = INK

    spacer(doc, 4)
    return tbl


def meta_table(doc, pairs, widths=(3.0, 13.4)):
    """Bloque de datos de la portada: sin bordes, con una línea fina por fila."""
    tbl = doc.add_table(rows=0, cols=2)
    tbl.autofit = False
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    no_borders(tbl)
    fix_widths(tbl, list(widths))

    for row_index, (label, value) in enumerate(pairs):
        cells = tbl.add_row().cells
        is_last = row_index == len(pairs) - 1
        for col_index, text in enumerate((label, value)):
            cell = cells[col_index]
            cell.width = Cm(widths[col_index])
            cell_margins(cell, top=90, bottom=90, left=0 if col_index == 0 else 60, right=60)
            if not is_last:
                cell_bottom_border(cell)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            run = p.add_run(text)
            run.font.name = BODY_FONT
            run.font.size = Pt(9.5)
            run.font.bold = col_index == 0
            run.font.color.rgb = BRAND if col_index == 0 else INK

    spacer(doc, 4)
    return tbl


def note_box(doc, lines, fill="F7F4EF", mono=False):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.autofit = False
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_borders(tbl, color="E3DACA")
    fix_widths(tbl, [TEXT_WIDTH_CM])
    cell = tbl.rows[0].cells[0]
    cell.width = Cm(TEXT_WIDTH_CM)
    shade(cell, fill)
    cell_margins(cell, top=110, bottom=110, left=140, right=140)
    first = True
    for line in lines:
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.1
        run = p.add_run(line)
        run.font.name = MONO_FONT if mono else BODY_FONT
        run.font.size = Pt(8.6 if mono else 9.5)
        run.font.color.rgb = INK
    spacer(doc, 4)
    return tbl


# --------------------------------------------------------------------------- #
# Documento
# --------------------------------------------------------------------------- #
def build():
    doc = Document()

    section = doc.sections[0]
    section.orientation = WD_ORIENT.PORTRAIT
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.2)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.3)
    section.right_margin = Cm(2.3)

    base = doc.styles["Normal"]
    base.font.name = BODY_FONT
    base.font.size = Pt(10.5)
    base.font.color.rgb = INK
    base.paragraph_format.space_after = Pt(6)

    # --- Encabezado de portada ---------------------------------------------
    kicker = doc.add_paragraph()
    kicker.paragraph_format.space_after = Pt(2)
    run = kicker.add_run("PROPUESTA TÉCNICA Y DE COSTOS")
    run.font.name = BODY_FONT
    run.font.size = Pt(8.5)
    run.font.bold = True
    run.font.color.rgb = GOLD

    title = doc.add_paragraph()
    title.paragraph_format.space_after = Pt(0)
    run = title.add_run("Boda Studio")
    run.font.name = BODY_FONT
    run.font.size = Pt(30)
    run.font.bold = True
    run.font.color.rgb = BRAND

    subtitle = doc.add_paragraph()
    subtitle.paragraph_format.space_after = Pt(6)
    run = subtitle.add_run("Infraestructura, costos y riesgos del lanzamiento")
    run.font.name = BODY_FONT
    run.font.size = Pt(13)
    run.font.color.rgb = MUTED
    bottom_rule(subtitle)

    meta_table(
        doc,
        [
            ("Para", "Socio / socia del proyecto"),
            ("De", "Equipo técnico"),
            ("Asunto", "Dónde vive el sistema, cuánto cuesta y qué riesgos asumimos"),
            ("Alcance", "Decisión de infraestructura antes de la primera boda real"),
        ],
    )

    # --- Resumen ejecutivo --------------------------------------------------
    heading(doc, "Resumen ejecutivo")
    numbered(
        doc,
        "invitación web personalizada, envío masivo por WhatsApp y panel de confirmaciones.",
        "El sistema está terminado y probado de punta a punta: ",
    )
    numbered(
        doc,
        "los mensajes salían con un enlace que solo funcionaba en la computadora de la "
        "organizadora. Ya está corregido y bloqueado: el sistema no permite un envío real con "
        "un enlace roto.",
        "Encontramos un error grave que hacía inútil cada campaña: ",
    )
    numbered(
        doc,
        "ya está resuelta la parte técnica y el paso a paso; falta decidir el nombre.",
        "Para publicarlo hace falta una dirección de internet de verdad: ",
    )
    numbered(
        doc,
        "El único gasto real es el dominio (≈1–2 USD el primer año, o gratis con un "
        "subdominio) y un chip de WhatsApp (3–8 USD, una sola vez).",
        "Costo de infraestructura: 0 USD por mes. ",
    )
    numbered(
        doc,
        "el envío no usa el canal oficial de Meta y el número puede ser bloqueado. Está "
        "mitigado y documentado, con plan de contingencia.",
        "El riesgo principal no es técnico, es de WhatsApp: ",
    )

    # --- 1. Qué hace el sistema --------------------------------------------
    heading(doc, "1. Qué hace el sistema")
    body(
        doc,
        "Reemplaza las dos tareas que hoy se hacen a mano: la tarjeta PDF y el reenvío de "
        "WhatsApp uno por uno.",
    )
    note_box(
        doc,
        [
            "La organizadora importa el Excel de invitados",
            "    → el sistema crea un enlace único por invitado",
            "        → envía el mensaje personalizado (\"Hola Ana, válido para 2 personas\")",
            "            → el invitado abre su invitación y confirma en línea",
            "                → el panel muestra confirmados, pases y restricciones",
        ],
        mono=True,
    )
    body(
        doc,
        "Lo que diferencia al producto de mandar un PDF: cada invitado recibe su propio enlace, "
        "así que el panel sabe quién abrió, quién confirmó y cuántos pases usa cada uno. Un PDF "
        "no dice nada de eso.",
    )

    # --- 2. El problema ----------------------------------------------------
    heading(doc, "2. El problema que encontramos y cómo quedó resuelto")
    rich_body(
        doc,
        [
            ("Qué pasaba. ", True),
            (
                "El enlace que va dentro de cada mensaje se armaba con una configuración que "
                "tenía un valor de prueba: localhost. Ese texto significa \"esta misma "
                "computadora\". En el teléfono del invitado, \"esta misma computadora\" es su "
                "propio teléfono: tocaba el enlace y no abría nada.",
                False,
            ),
        ],
    )
    rich_body(
        doc,
        [
            (
                "Lo peligroso es que el sistema no fallaba: los 200 mensajes se enviaban "
                "perfecto. El error se descubría cuando ya no tenía arreglo, con el número usado "
                "para mandar enlaces muertos y ningún invitado confirmado.",
                False,
            ),
        ],
    )
    rich_body(doc, [("Qué hicimos. ", True), ("Tres capas, para que no pueda repetirse:", False)])
    bullet(
        doc,
        "una dirección pública de una que solo existe en una red interna (localhost, IP de la "
        "casa, dominios de prueba, túneles temporales).",
        "El sistema ahora distingue ",
    )
    bullet(
        doc,
        "si el enlace no es público: la campaña queda en pausa con el motivo escrito, sin gastar "
        "un solo mensaje. El modo de prueba (que muestra los textos sin enviar) sigue "
        "funcionando siempre.",
        "Bloquea el envío real ",
    )
    bullet(
        doc,
        "al arrancar, en el chequeo de estado y con un cartel rojo en el panel de la "
        "organizadora.",
        "Avisa antes de que pase: ",
    )
    body(
        doc,
        "Además se agregaron 15 pruebas automáticas sobre esa regla, para que un cambio futuro "
        "no la rompa sin que nos enteremos.",
        space_after=4,
    )

    # --- 3. Opciones y costos ---------------------------------------------
    heading(doc, "3. Opciones y costos")
    body(
        doc,
        "Precios de lista de los proveedores. La columna \"costo\" es mensual y recurrente, "
        "salvo donde se aclara lo contrario.",
    )
    table(
        doc,
        ["Opción", "Qué implica", "Costo", "Veredicto"],
        [
            [
                "A · Todo gratis\nOracle Cloud + DuckDNS",
                "El enlace queda tu-boda.duckdns.org",
                "0 USD",
                "Sirve, pero el nombre no da confianza y no se puede mover de proveedor sin "
                "cambiar todos los enlaces",
            ],
            [
                "**B · Gratis + dominio propio**",
                "Lo mismo que A, con un dominio comprado",
                "0 USD/mes + ≈1–2 USD el primer año (≈10–15 USD/año después)",
                "**Mejor relación costo/beneficio: parece un producto profesional y el enlace es "
                "para siempre**",
            ],
            [
                "C · Servidor gestionado\n(VPS 2 GB o similar)",
                "Se paga por comodidad: menos pasos, soporte",
                "≈5–8 USD/mes + dominio",
                "Solo si preferimos no administrar nada",
            ],
            [
                "D · Planes gratuitos de otras plataformas",
                "Render, Railway, Vercel, Fly, Koyeb",
                "0 a 5 USD",
                "No sirven para esto: el envío por WhatsApp necesita un proceso siempre "
                "encendido y un disco que no se borre. Esos planes duermen el proceso o borran "
                "el disco",
            ],
        ],
        [3.3, 4.0, 3.5, 5.6],
    )

    rich_body(
        doc,
        [
            ("Lo que cuesta cada boda, en la práctica. ", True),
            (
                "Con la opción B el único gasto recurrente es el dominio. Si cuesta 12 USD al "
                "año y se usa para 10 bodas, son 1,2 USD por boda, contra las horas de trabajo "
                "manual que hoy insume mandar 200 mensajes uno por uno y perseguir "
                "confirmaciones.",
                False,
            ),
        ],
    )

    # --- 4. Recomendación --------------------------------------------------
    heading(doc, "4. Recomendación")
    rich_body(
        doc,
        [("Opción B: servidor gratuito de Oracle Cloud + dominio propio.", True)],
        space_after=8,
    )
    bullet(
        doc,
        "0 USD/mes de infraestructura; el dominio es el gasto más chico del proyecto y el que "
        "más se nota de cara al cliente.",
        "Coste casi nulo: ",
    )
    bullet(
        doc,
        "proceso siempre activo, disco persistente (ahí vive la sesión de WhatsApp) y HTTPS.",
        "Cumple los tres requisitos que ninguna plataforma gratuita cumple a la vez: ",
    )
    bullet(
        doc,
        "la web, la API y la base de datos en la misma máquina, un dominio único y certificado "
        "automático. Menos piezas, menos cosas que se rompen.",
        "Un solo servidor: ",
    )
    bullet(
        doc,
        "si mañana crece, el mismo paquete se muda a un servidor pago de 5 USD sin cambiar una "
        "línea de código.",
        "Se puede revertir: ",
    )
    body(
        doc,
        "La alternativa honesta: si no queremos administrar un servidor, la opción C resuelve lo "
        "mismo por 5–8 USD/mes. No hay una tercera vía gratuita que funcione con WhatsApp hoy.",
    )

    # --- 5. Estado ---------------------------------------------------------
    heading(doc, "5. Estado actual del producto")
    table(
        doc,
        ["Pieza", "Estado"],
        [
            ["Invitaciones web personalizadas (un token por invitado)", "Terminado y probado"],
            ["Importación de invitados (Excel/CSV, alias, teléfonos)", "Terminado y probado"],
            ["Panel de confirmaciones (pases, restricciones, grupos)", "Terminado y probado"],
            ["Enlaces públicos y bloqueo de envíos con enlace roto", "Terminado y probado (nuevo)"],
            ["Envío masivo por WhatsApp con cola, pausas y reanudación", "Terminado; falta la prueba con el número real"],
            ["Prueba en celular real del diseño de la invitación", "Pendiente (requiere un dispositivo)"],
        ],
        [10.6, 5.8],
    )
    body(
        doc,
        "Las dos cosas pendientes no son desarrollo: son verificación con hardware real. Se "
        "resuelven en una tarde, con el chip en la mano.",
    )

    # --- 6. Riesgos --------------------------------------------------------
    heading(doc, "6. Riesgos y cómo los manejamos")
    table(
        doc,
        ["Riesgo", "Impacto", "Mitigación"],
        [
            [
                "Bloqueo del número de WhatsApp (no usa el canal oficial de Meta)",
                "Alto: sin número no hay campaña",
                "Chip dedicado (nunca el personal), calentar el número unos días, retardos de "
                "6–14 s, tope de 250 por día, mensajes personalizados, modo de prueba previo y "
                "plan de contingencia: chip nuevo + reanudar",
            ],
            [
                "Pérdida de la sesión de WhatsApp",
                "Medio: hay que escanear un QR otra vez",
                "La sesión vive en un volumen persistente; se verifica con un reinicio de prueba "
                "antes de la primera campaña",
            ],
            [
                "Enlaces rotos por mala configuración",
                "Alto",
                "Resuelto: bloqueo automático del envío y aviso en el panel",
            ],
            [
                "Datos personales de invitados (Ley 6534/2020)",
                "Medio: obligación legal",
                "Datos aislados por organizadora, borrado por invitado y borrado al finalizar el "
                "evento; no se comparten con terceros",
            ],
            [
                "Dependencia de un servidor gratuito",
                "Bajo/Medio",
                "El stack es estándar (Docker): mudarse a un servidor de 5 USD es cuestión de "
                "horas",
            ],
            [
                "Caída del servidor durante una campaña",
                "Bajo",
                "Cada mensaje se guarda antes y después de enviarse: al reanudar no se repite ni "
                "se pierde ninguno",
            ],
        ],
        [5.2, 3.4, 7.8],
    )

    # --- 7. Decisiones -----------------------------------------------------
    heading(doc, "7. Decisiones que necesitamos tomar")
    for text in [
        "¿Usamos el subdominio gratuito o compramos dominio? (recomendamos comprar; si es para "
        "una clienta puntual, el nombre puede ser el de la boda)",
        "¿Compramos ya el chip dedicado de WhatsApp? Sin eso no se puede probar el envío real.",
        "¿Quién opera el panel: la organizadora sola o con soporte nuestro?",
        "¿Cuánto tiempo guardamos la lista de invitados después de la boda y quién la borra?",
        "¿Cuánto le cobramos al cliente final por boda? (el costo técnico por boda es ≈1 USD)",
    ]:
        bullet(doc, text)

    # --- 8. Próximos pasos -------------------------------------------------
    heading(doc, "8. Próximos pasos y tiempos")
    table(
        doc,
        ["Cuándo", "Qué", "Quién"],
        [
            ["Día 1 (1–2 h)", "Crear la cuenta de Oracle, la VM gratuita y el dominio; publicar con HTTPS siguiendo el paso a paso", "Nosotros (desde el navegador)"],
            ["Día 1", "Verificar que un enlace de invitado abre desde un celular con datos móviles", "Nosotros"],
            ["Día 2", "Comprar y calentar el chip dedicado; conectar WhatsApp y hacer la prueba a un número propio", "Organizadora + nosotros"],
            ["Día 3", "Campaña en modo de prueba con la lista real; revisar textos y enlaces", "Organizadora"],
            ["Día 4", "Primera tanda real (20–30 invitados); revisar entregas y confirmaciones", "Organizadora"],
            ["Semana 2", "Campaña completa del resto de la lista", "Organizadora"],
        ],
        [2.7, 9.9, 3.8],
    )

    # --- Anexo -------------------------------------------------------------
    heading(doc, "Anexo · De dónde salen los precios y los límites")
    body(
        doc,
        "Contrastado en 2026 contra las páginas oficiales de cada proveedor:",
        space_after=6,
    )
    for source, text in [
        (
            "Oracle Cloud Always Free",
            "hasta 2 OCPU / 12 GB de RAM (ARM) o dos máquinas micro AMD, 200 GB de disco, "
            "10 TB de salida por mes, gratis mientras la cuenta exista en la región principal. "
            "Tarjeta solo para verificar identidad.",
        ),
        (
            "Cloudflare Pages",
            "plan gratuito con ancho de banda estático ilimitado y uso comercial permitido. "
            "Es la pieza que usaríamos si la web va aparte del servidor.",
        ),
        (
            "Vercel Hobby",
            "gratuito pero solo para uso personal no comercial; un producto como este "
            "requeriría Pro (20 USD/mes).",
        ),
        (
            "Render",
            "el plan gratuito duerme el servicio a los 15 minutos de inactividad, no tiene "
            "disco persistente y su base gratuita vence a los 30 días: incompatible con la "
            "sesión de WhatsApp.",
        ),
        (
            "Railway",
            "5 USD de crédito de prueba por 30 días y luego 1 USD/mes de crédito; un servicio "
            "siempre activo ronda los 5 USD/mes.",
        ),
        (
            "Koyeb y Fly.io",
            "Koyeb cerró su plan gratuito a cuentas nuevas en febrero de 2026 y Fly.io en "
            "octubre de 2024.",
        ),
        ("DuckDNS", "subdominio gratuito."),
    ]:
        bullet(doc, f" {text}", bold_prefix=f"{source}: ")

    body(
        doc,
        "El detalle técnico completo, con los descartes y el paso a paso de publicación, está en "
        "el repositorio del proyecto (docs/10-url-publica.md y "
        "docs/11-despliegue-desde-el-navegador.md).",
        italic=True,
        size=9.5,
        color=MUTED,
    )

    # --- Pie de página -----------------------------------------------------
    footer = section.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = fp.add_run("Boda Studio · Propuesta de infraestructura y costos · página ")
    add_field(fp, "PAGE")
    run = fp.add_run(" de ")
    add_field(fp, "NUMPAGES", placeholder="4")
    for run in fp.runs:
        run.font.name = BODY_FONT
        run.font.size = Pt(8)
        run.font.color.rgb = MUTED

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print(f"OK -> {OUT}")


if __name__ == "__main__":
    build()
