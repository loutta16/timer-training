// presets.js — Presets precargados (documento, sección 3.6). Duraciones en segundos.
// El bloque entre las marcas es JSON puro: tools/validate_presets.py lo lee y lo valida.

export const PRESETS = /*PRESETS-JSON-INICIO*/[
  { "id": "boxeo", "nombre": "Boxeo", "modo": "rondas",
    "preparate": 10, "entrenar": 180, "descansar": 60, "rondas": 3, "enfriamiento": 0 },
  { "id": "boxeo-pro", "nombre": "Boxeo profesional", "modo": "rondas",
    "preparate": 10, "entrenar": 180, "descansar": 60, "rondas": 12, "enfriamiento": 0 },
  { "id": "kickboxing", "nombre": "Kickboxing / K-1", "modo": "rondas",
    "preparate": 10, "entrenar": 180, "descansar": 60, "rondas": 3, "enfriamiento": 0 },
  { "id": "muay-thai", "nombre": "Muay Thai", "modo": "rondas",
    "preparate": 10, "entrenar": 180, "descansar": 120, "rondas": 5, "enfriamiento": 0 },
  { "id": "mma", "nombre": "MMA", "modo": "rondas",
    "preparate": 10, "entrenar": 300, "descansar": 60, "rondas": 3, "enfriamiento": 0 },
  { "id": "tabata-clasico", "nombre": "Tabata clásico", "modo": "tabata",
    "preparate": 10, "entrenar": 20, "descansar": 10, "rondas": 8, "ciclos": 1,
    "descansoEntreCiclos": 60, "enfriamiento": 0 },
  { "id": "tabata-2x6", "nombre": "Tabata 2×6", "modo": "tabata",
    "preparate": 10, "entrenar": 40, "descansar": 20, "rondas": 6, "ciclos": 2,
    "descansoEntreCiclos": 60, "enfriamiento": 0 },
  { "id": "crono-1min", "nombre": "Cronómetro por minuto", "modo": "cronometro",
    "preparate": 10, "lapso": 60 }
]/*PRESETS-JSON-FIN*/;
