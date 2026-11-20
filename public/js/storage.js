// storage.js — Presets propios, ajustes y última configuración por modo (localStorage).
// Todo queda en el dispositivo; no se envía nada a ningún servidor.

const CLAVES = {
  presets: 'tt.presets',
  ajustes: 'tt.ajustes',
  ultima: (modo) => `tt.ultima.${modo}`,
};

export const AJUSTES_DEFECTO = {
  sonido: 'campana', // campana | beep | silencio
  volumen: 0.8,
  vibracion: true,
  avisoUltimos: 3,
  avisoTablas: 10,
};

function leer(clave, porDefecto) {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? JSON.parse(raw) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function cargarAjustes() {
  return { ...AJUSTES_DEFECTO, ...leer(CLAVES.ajustes, {}) };
}

export function guardarAjustes(ajustes) {
  return escribir(CLAVES.ajustes, ajustes);
}

export function cargarUltima(modo) {
  return leer(CLAVES.ultima(modo), null);
}

export function guardarUltima(cfg) {
  return escribir(CLAVES.ultima(cfg.modo), cfg);
}

export function cargarPresetsPropios() {
  const lista = leer(CLAVES.presets, []);
  return Array.isArray(lista) ? lista : [];
}

export function guardarPresetPropio(preset) {
  const lista = cargarPresetsPropios();
  const i = lista.findIndex((p) => p.id === preset.id);
  if (i >= 0) lista[i] = preset;
  else lista.push(preset);
  escribir(CLAVES.presets, lista);
  return preset;
}

export function borrarPresetPropio(id) {
  escribir(CLAVES.presets, cargarPresetsPropios().filter((p) => p.id !== id));
}

export function nuevoId() {
  return `propio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
