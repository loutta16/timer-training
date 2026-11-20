"""Valida los presets precargados de public/js/presets.js.

Uso:  python tools/validate_presets.py
Sale con código 1 si encuentra errores.
"""
import json
import re
import sys
from pathlib import Path

ARCHIVO = Path(__file__).resolve().parent.parent / "public" / "js" / "presets.js"

# Rangos por modo (documento, sección 3). (mínimo, máximo) en segundos o cantidad.
RANGOS = {
    "rondas": {
        "preparate": (0, 60), "entrenar": (10, 1800), "descansar": (0, 600),
        "rondas": (1, 50), "enfriamiento": (0, 600),
    },
    "tabata": {
        "preparate": (0, 60), "entrenar": (5, 600), "descansar": (0, 600),
        "rondas": (1, 50), "ciclos": (1, 20), "descansoEntreCiclos": (0, 600),
        "enfriamiento": (0, 600),
    },
    "cronometro": {
        "preparate": (0, 60), "lapso": (0, 3600),
    },
}


def cargar_presets(archivo: Path = ARCHIVO) -> list:
    texto = archivo.read_text(encoding="utf-8")
    m = re.search(r"/\*PRESETS-JSON-INICIO\*/(.*?)/\*PRESETS-JSON-FIN\*/", texto, re.S)
    if not m:
        raise ValueError("No se encontraron las marcas PRESETS-JSON en presets.js")
    return json.loads(m.group(1))


def validar(presets: list) -> list[str]:
    errores = []
    ids = set()
    for i, p in enumerate(presets):
        nombre = p.get("id", f"#{i}")
        for campo in ("id", "nombre", "modo"):
            if not isinstance(p.get(campo), str) or not p.get(campo):
                errores.append(f"{nombre}: falta '{campo}'")
        if p.get("id") in ids:
            errores.append(f"{nombre}: id repetido")
        ids.add(p.get("id"))

        modo = p.get("modo")
        if modo not in RANGOS:
            errores.append(f"{nombre}: modo desconocido '{modo}'")
            continue
        for campo, (minimo, maximo) in RANGOS[modo].items():
            valor = p.get(campo)
            if not isinstance(valor, int) or isinstance(valor, bool):
                errores.append(f"{nombre}: '{campo}' debe ser un entero (es {valor!r})")
            elif not minimo <= valor <= maximo:
                errores.append(f"{nombre}: '{campo}'={valor} fuera de rango [{minimo}, {maximo}]")
        if modo == "cronometro" and 0 < p.get("lapso", 0) < 5:
            errores.append(f"{nombre}: 'lapso' debe ser 0 (sin aviso) o al menos 5 s")
        sobrantes = set(p) - {"id", "nombre", "modo"} - set(RANGOS[modo])
        if sobrantes:
            errores.append(f"{nombre}: campos que el modo no usa: {sorted(sobrantes)}")
    return errores


def main() -> int:
    presets = cargar_presets()
    errores = validar(presets)
    if errores:
        print("Presets con errores:")
        for e in errores:
            print(f"  ✗ {e}")
        return 1
    print(f"✓ {len(presets)} presets válidos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
