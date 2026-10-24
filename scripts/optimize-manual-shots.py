"""Optimiza las capturas del manual (redimensiona y recomprime) y las copia al repo.

Uso:
    python scripts/optimize-manual-shots.py <carpeta-de-capturas>

Salida: docs/img/manual/*.png (capturas de pantalla, con paleta reducida) y
        docs/img/manual/*.jpg (las de la invitación, que son fotos).
"""

import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "docs" / "img" / "manual"

# Ancho final por captura: las del panel se ven a ~1000 px en la página,
# las de la invitación se muestran como un teléfono.
WIDTHS = {
    "invitacion-portada": 460,
    "invitacion-galeria": 460,
    "login": 900,
}
DEFAULT_WIDTH = 1100

# Las fotos de la invitación van a JPEG; el resto son pantallas con colores
# planos, donde una paleta de 256 colores pesa mucho menos y se ve igual.
PHOTOS = {"invitacion-portada", "invitacion-galeria"}


def main() -> None:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else r"D:\Anto\EAS\capturas-manual")
    files = sorted(source.glob("*.png"))
    if not files:
        raise SystemExit(f"No hay capturas en {source}")

    OUT.mkdir(parents=True, exist_ok=True)

    total_before = 0
    total_after = 0

    for file in files:
        before = file.stat().st_size
        total_before += before

        target_width = WIDTHS.get(file.stem, DEFAULT_WIDTH)
        with Image.open(file) as original:
            image = original.convert("RGB") if original.mode != "RGB" else original.copy()
            if image.width > target_width:
                ratio = target_width / image.width
                image = image.resize((target_width, round(image.height * ratio)), Image.LANCZOS)

            if file.stem in PHOTOS:
                destination = OUT / f"{file.stem}.jpg"
                image.save(destination, "JPEG", quality=84, optimize=True, progressive=True)
            else:
                destination = OUT / f"{file.stem}.png"
                image.convert("P", palette=Image.ADAPTIVE, colors=256).save(
                    destination, "PNG", optimize=True
                )

        after = destination.stat().st_size
        total_after += after
        print(
            f"{destination.name:28} {before / 1024:6.0f} KB -> {after / 1024:6.0f} KB "
            f"({image.width}x{image.height})"
        )

    print(
        f"\nTotal: {total_before / 1024 / 1024:.1f} MB -> {total_after / 1024 / 1024:.1f} MB "
        f"en {OUT.relative_to(REPO)}"
    )


if __name__ == "__main__":
    main()
