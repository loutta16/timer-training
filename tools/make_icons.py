"""Genera los íconos PWA de Timer Training con Pillow.

Uso:  python tools/make_icons.py
Requiere: pip install pillow
Crea en public/icons/: icon-192.png, icon-512.png, maskable-512.png,
apple-touch-icon.png (180) y favicon-32.png.
"""
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "public" / "icons"

FONDO = (15, 17, 21)
ANILLO = (43, 48, 59)
VERDE = (34, 197, 94)
ROJO = (220, 38, 38)
BLANCO = (243, 244, 246)

ESCALA = 4  # se dibuja grande y se reduce para suavizar bordes


def dibujar(tamano: int, contenido: float, redondeado: bool) -> Image.Image:
    """contenido: fracción del lienzo que ocupa el dibujo (0.8 para maskable)."""
    s = tamano * ESCALA
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if redondeado:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=FONDO)
    else:
        d.rectangle([0, 0, s, s], fill=FONDO)

    c = s / 2
    r = s * contenido * 0.36
    grosor = int(s * contenido * 0.085)
    cy = c + s * contenido * 0.04

    # Botón superior del cronómetro
    bw, bh = s * contenido * 0.13, s * contenido * 0.07
    top = cy - r - grosor / 2 - bh * 1.35
    d.rounded_rectangle([c - bw / 2, top, c + bw / 2, top + bh], radius=int(bh / 3), fill=BLANCO)

    caja = [c - r, cy - r, c + r, cy + r]
    d.ellipse(caja, outline=ANILLO, width=grosor)
    # Arco: 3/4 verde (entrenar) y 1/4 rojo (descansar)
    d.arc(caja, start=-90, end=180, fill=VERDE, width=grosor)
    d.arc(caja, start=186, end=264, fill=ROJO, width=grosor)

    # Aguja
    aguja = r * 0.62
    ancho = int(grosor * 0.55)
    d.line([c, cy, c, cy - aguja], fill=BLANCO, width=ancho)
    d.ellipse([c - ancho, cy - ancho, c + ancho, cy + ancho], fill=BLANCO)

    return img.resize((tamano, tamano), Image.LANCZOS)


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    salidas = {
        "icon-192.png": dibujar(192, 1.0, redondeado=True),
        "icon-512.png": dibujar(512, 1.0, redondeado=True),
        "maskable-512.png": dibujar(512, 0.72, redondeado=False),
        "apple-touch-icon.png": dibujar(180, 0.9, redondeado=False).convert("RGB"),
        "favicon-32.png": dibujar(32, 1.0, redondeado=True),
    }
    for nombre, img in salidas.items():
        img.save(DESTINO / nombre, optimize=True)
        print(f"  ✓ {nombre}")


if __name__ == "__main__":
    main()
