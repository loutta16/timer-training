// secuencias.js — Arma la lista de fases de cada modo (Tabata / Rondas / Cronómetro).
// El motor (timer.js) recorre esta lista sin saber de qué modo se trata.

export const MODOS = {
  rondas: { nombre: 'Rondas', descripcion: 'Boxeo, Kickboxing, Muay Thai, MMA' },
  tabata: { nombre: 'Tabata', descripcion: 'Rondas agrupadas en ciclos' },
  cronometro: { nombre: 'Cronómetro', descripcion: 'Cuenta hacia adelante con aviso por lapso' },
};

export const NOMBRES_FASE = {
  preparate: 'Preparate',
  entrenar: 'Entrenar',
  descansar: 'Descansar',
  descansoCiclos: 'Descanso entre ciclos',
  enfriamiento: 'Enfriamiento',
  cronometro: 'Cronómetro',
};

// Valores por defecto (documento, sección 3).
export const DEFAULTS = {
  rondas: { modo: 'rondas', preparate: 10, entrenar: 180, descansar: 60, rondas: 3, enfriamiento: 0 },
  tabata: {
    modo: 'tabata', preparate: 10, entrenar: 20, descansar: 10,
    rondas: 8, ciclos: 1, descansoEntreCiclos: 60, enfriamiento: 0,
  },
  cronometro: { modo: 'cronometro', preparate: 10, lapso: 60 },
};

// Campos editables por modo: [clave, etiqueta, tipo, mínimo, máximo, mínimoActivo]
// mínimoActivo: si el valor es > 0 no puede ser menor a esto (ej. lapso 0 = sin aviso, si no ≥ 5 s).
export const CAMPOS = {
  rondas: [
    ['preparate', 'Preparate', 'tiempo', 0, 60],
    ['entrenar', 'Entrenar', 'tiempo', 10, 1800],
    ['descansar', 'Descansar', 'tiempo', 0, 600],
    ['rondas', 'Rondas', 'numero', 1, 50],
    ['enfriamiento', 'Enfriamiento', 'tiempo', 0, 600],
  ],
  tabata: [
    ['preparate', 'Preparate', 'tiempo', 0, 60],
    ['entrenar', 'Entrenar', 'tiempo', 5, 600],
    ['descansar', 'Descansar', 'tiempo', 0, 600],
    ['rondas', 'Rondas por ciclo', 'numero', 1, 50],
    ['ciclos', 'Ciclos', 'numero', 1, 20],
    ['descansoEntreCiclos', 'Descanso entre ciclos', 'tiempo', 0, 600],
    ['enfriamiento', 'Enfriamiento', 'tiempo', 0, 600],
  ],
  cronometro: [
    ['preparate', 'Preparate', 'tiempo', 0, 60],
    ['lapso', 'Lapso de tiempo', 'tiempo', 0, 3600, 5],
  ],
};

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

/** Completa con valores por defecto y ajusta todo a los rangos permitidos. */
export function normalizar(cfg = {}) {
  const modo = DEFAULTS[cfg.modo] ? cfg.modo : 'rondas';
  const out = { ...DEFAULTS[modo] };
  for (const [clave, , , min, max, minActivo] of CAMPOS[modo]) {
    let v = Number(cfg[clave]);
    if (!Number.isFinite(v)) v = DEFAULTS[modo][clave];
    v = limitar(Math.round(v), min, max);
    if (minActivo && v > 0 && v < minActivo) v = minActivo;
    out[clave] = v;
  }
  return out;
}

/** Devuelve la lista de fases. Las fases con duración 0 se omiten. */
export function armarSecuencia(cfgEntrada) {
  const cfg = normalizar(cfgEntrada);
  const fases = [];
  const agregar = (tipo, duracion, extra = {}) => {
    if (duracion > 0) fases.push({ tipo, duracion, ...extra });
  };

  agregar('preparate', cfg.preparate);

  if (cfg.modo === 'cronometro') {
    fases.push({ tipo: 'cronometro', duracion: Infinity, lapso: cfg.lapso });
    return fases;
  }

  const esTabata = cfg.modo === 'tabata';
  const totalCiclos = esTabata ? cfg.ciclos : 1;
  const totalRondas = cfg.rondas;

  for (let ciclo = 1; ciclo <= totalCiclos; ciclo++) {
    for (let ronda = 1; ronda <= totalRondas; ronda++) {
      const info = { ronda, totalRondas };
      if (esTabata) Object.assign(info, { ciclo, totalCiclos });
      // En Rondas se avisa el final de ronda ("tablas"); en Tabata las rondas son cortas.
      agregar('entrenar', cfg.entrenar, { ...info, tablas: !esTabata });
      // Después de la última ronda (del ciclo) no hay Descansar.
      if (ronda < totalRondas) agregar('descansar', cfg.descansar, info);
    }
    if (ciclo < totalCiclos) agregar('descansoCiclos', cfg.descansoEntreCiclos, { ciclo, totalCiclos });
  }

  agregar('enfriamiento', cfg.enfriamiento);
  return fases;
}

/** Duración total en segundos (ignora la fase infinita del Cronómetro). */
export function duracionTotal(fases) {
  return fases.reduce((s, f) => (Number.isFinite(f.duracion) ? s + f.duracion : s), 0);
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatoTiempo(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Resumen corto de una configuración, para listas de presets. */
export function describir(cfgEntrada) {
  const c = normalizar(cfgEntrada);
  if (c.modo === 'cronometro') return c.lapso ? `Aviso cada ${formatoTiempo(c.lapso)}` : 'Sin aviso por lapso';
  const base = `${c.rondas} × ${formatoTiempo(c.entrenar)} / ${formatoTiempo(c.descansar)}`;
  return c.modo === 'tabata' && c.ciclos > 1 ? `${c.ciclos} ciclos · ${base}` : base;
}
