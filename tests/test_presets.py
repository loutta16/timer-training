"""Pruebas de los presets. Ejecutar: python -m pytest tests/"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

from validate_presets import cargar_presets, validar  # noqa: E402


def total_rondas(p):
    """Duración total (s) con la regla: sin Descansar después de la última ronda de cada ciclo."""
    ciclos = p.get("ciclos", 1)
    por_ciclo = p["rondas"] * p["entrenar"] + (p["rondas"] - 1) * p["descansar"]
    entre = (ciclos - 1) * p.get("descansoEntreCiclos", 0)
    return p["preparate"] + ciclos * por_ciclo + entre + p["enfriamiento"]


def test_presets_validos():
    assert validar(cargar_presets()) == []


def test_presets_incluidos():
    ids = {p["id"] for p in cargar_presets()}
    for esperado in ("boxeo", "boxeo-pro", "kickboxing", "muay-thai", "mma",
                     "tabata-clasico", "tabata-2x6", "crono-1min"):
        assert esperado in ids


def test_totales_del_checklist():
    p = {x["id"]: x for x in cargar_presets()}
    assert total_rondas(p["boxeo"]) == 11 * 60 + 10
    assert total_rondas(p["tabata-clasico"]) == 4 * 60
    assert total_rondas(p["tabata-2x6"]) == 12 * 60 + 30


def test_detecta_errores():
    malos = [
        {"id": "x", "nombre": "X", "modo": "rondas", "preparate": 10, "entrenar": 1,
         "descansar": 60, "rondas": 3, "enfriamiento": 0},
        {"id": "y", "nombre": "Y", "modo": "cronometro", "preparate": 10, "lapso": 3},
        {"id": "z", "nombre": "Z", "modo": "yoga"},
    ]
    errores = validar(malos)
    assert any("entrenar" in e for e in errores)
    assert any("lapso" in e for e in errores)
    assert any("modo desconocido" in e for e in errores)
