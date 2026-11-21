// app.js — Navegación entre pantallas y conexión de la interfaz con el motor.
import {
  MODOS, NOMBRES_FASE, DEFAULTS, CAMPOS,
  normalizar, armarSecuencia, duracionTotal, formatoTiempo, describir,
} from './secuencias.js';
import { Timer } from './timer.js';
import { PRESETS } from './presets.js';
import * as audio from './audio.js';
import {
  cargarAjustes, guardarAjustes, cargarUltima, guardarUltima,
  cargarPresetsPropios, guardarPresetPropio, borrarPresetPropio, nuevoId,
} from './storage.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const app = {
  pantalla: 'inicio',
  profundidad: 0,
  cfg: null, // configuración en edición / en uso
  origen: null, // { tipo: 'modo' | 'preset' | 'propio', id?, nombre }
  timer: null,
  intervalo: null,
  wakeLock: null,
  ajustes: cargarAjustes(),
  faseColor: null,
  eventoInstalar: null,
};

const timerActivo = () => app.timer && (app.timer.estado === 'corriendo' || app.timer.estado === 'pausado');

/* ---------------------------------------------------------------- utilidades */

function escribirTexto(el, texto) {
  if (el.textContent !== texto) el.textContent = texto;
}

function escapar(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let avisoTimeout;
function avisar(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(avisoTimeout);
  avisoTimeout = setTimeout(() => { el.hidden = true; }, 2200);
}

function vibrar(patron) {
  if (app.ajustes.vibracion && 'vibrate' in navigator) {
    try { navigator.vibrate(patron); } catch { /* sin soporte */ }
  }
}

function confirmar(titulo, texto, textoSi = 'Aceptar') {
  const d = $('#dlg-confirmar');
  $('#dlg-confirmar-titulo').textContent = titulo;
  $('#dlg-confirmar-texto').textContent = texto;
  $('#dlg-confirmar-si').textContent = textoSi;
  d.returnValue = '';
  d.showModal();
  return new Promise((resolver) => {
    d.addEventListener('close', () => resolver(d.returnValue === 'si'), { once: true });
  });
}

/** Control +/– con repetición al mantener apretado. */
function crearStepper(contenedor, { etiqueta, obtener, cambiar, formatear }) {
  contenedor.classList.add('campo');
  contenedor.innerHTML = `
    <span class="campo-label">${escapar(etiqueta)}</span>
    <div class="stepper">
      <button type="button" class="paso" data-dir="-1" aria-label="Restar ${escapar(etiqueta)}"><svg><use href="#i-menos"/></svg></button>
      <output class="valor" aria-live="polite"></output>
      <button type="button" class="paso" data-dir="1" aria-label="Sumar ${escapar(etiqueta)}"><svg><use href="#i-mas"/></svg></button>
    </div>`;
  const salida = contenedor.querySelector('output');
  const pintar = () => { salida.textContent = formatear(obtener()); };

  contenedor.querySelectorAll('.paso').forEach((btn) => {
    const dir = Number(btn.dataset.dir);
    let espera = null;
    let repite = null;
    const parar = () => { clearTimeout(espera); clearInterval(repite); espera = repite = null; };
    const paso = () => { cambiar(dir); pintar(); };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch { /* ok */ }
      parar();
      paso();
      espera = setTimeout(() => { repite = setInterval(paso, 85); }, 420);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => btn.addEventListener(ev, parar));
    // Teclado (Enter/Espacio) genera click con detail 0.
    btn.addEventListener('click', (e) => { if (e.detail === 0) paso(); });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  pintar();
  return pintar;
}

/** Paso de los controles de tiempo: más fino en valores chicos. */
function pasoTiempo(valor, dir) {
  const base = dir > 0 ? valor : valor - 1;
  if (base < 60) return 5;
  if (base < 300) return 15;
  if (base < 1200) return 30;
  return 60;
}

/* -------------------------------------------------------------- navegación */

function mostrar(nombre) {
  $$('.pantalla').forEach((s) => { s.hidden = s.id !== `pantalla-${nombre}`; });
  document.body.dataset.pantalla = nombre;
  app.pantalla = nombre;
  if (nombre !== 'timer' && nombre !== 'resumen') {
    delete document.body.dataset.fase;
    document.body.classList.remove('ultimos');
    actualizarThemeColor();
  }
  window.scrollTo(0, 0);
}

function ir(nombre) {
  app.profundidad += 1;
  history.pushState({ pantalla: nombre, profundidad: app.profundidad }, '');
  mostrar(nombre);
}

function reemplazar(nombre) {
  history.replaceState({ pantalla: nombre, profundidad: app.profundidad }, '');
  mostrar(nombre);
}

function irInicio() {
  renderInicio();
  if (app.profundidad > 0) history.go(-app.profundidad);
  else mostrar('inicio');
}

window.addEventListener('popstate', async (e) => {
  const destino = e.state?.pantalla || 'inicio';
  if (app.pantalla === 'timer' && timerActivo()) {
    // El gesto "atrás" no corta el entrenamiento sin preguntar.
    history.pushState({ pantalla: 'timer', profundidad: app.profundidad }, '');
    pedirSalir();
    return;
  }
  app.profundidad = e.state?.profundidad || 0;
  if ((destino === 'timer' || destino === 'resumen' || destino === 'config') && !app.cfg) {
    reemplazar('inicio');
    return;
  }
  if (destino === 'timer' && !timerActivo()) {
    history.back();
    return;
  }
  if (destino === 'inicio') renderInicio();
  mostrar(destino);
});

document.addEventListener('click', (e) => {
  const irA = e.target.closest('[data-ir]');
  if (irA) {
    const nombre = irA.dataset.ir;
    if (nombre === 'inicio') irInicio();
    else {
      if (nombre === 'mis-presets') renderMisPresets();
      if (nombre === 'ajustes') renderAjustes();
      ir(nombre);
    }
    return;
  }
  if (e.target.closest('[data-volver]')) history.back();
});

/* ------------------------------------------------------------------ inicio */

function itemPreset(p, propio) {
  const li = document.createElement('li');
  const cfg = normalizar(p);
  const total = cfg.modo === 'cronometro' ? '' : formatoTiempo(duracionTotal(armarSecuencia(cfg)));
  li.innerHTML = `
    <button class="preset">
      <span class="preset-fila">
        <span class="preset-nombre">${escapar(p.nombre)}</span>
        <span class="preset-total">${total || '∞'}</span>
      </span>
      <span class="preset-desc">${escapar(describir(cfg))}</span>
    </button>`;
  li.querySelector('button').addEventListener('click', () => {
    abrirConfig(cfg, { tipo: propio ? 'propio' : 'preset', id: p.id, nombre: p.nombre });
  });
  return li;
}

function renderInicio() {
  const propios = cargarPresetsPropios();
  const listaPropios = $('#lista-propios-inicio');
  listaPropios.replaceChildren(...propios.map((p) => itemPreset(p, true)));
  $('#bloque-propios-inicio').hidden = propios.length === 0;
  $('#lista-presets-inicio').replaceChildren(...PRESETS.map((p) => itemPreset(p, false)));
  $$('[data-detalle-modo]').forEach((el) => {
    const modo = el.dataset.detalleModo;
    const ultima = cargarUltima(modo);
    el.textContent = describir(ultima && ultima.modo === modo ? ultima : DEFAULTS[modo]);
  });
}

$$('.modo').forEach((btn) => {
  btn.addEventListener('click', () => {
    const modo = btn.dataset.modo;
    const ultima = cargarUltima(modo);
    abrirConfig(ultima && ultima.modo === modo ? ultima : DEFAULTS[modo], { tipo: 'modo', nombre: MODOS[modo].nombre });
  });
});

/* ----------------------------------------------------------- configuración */

function abrirConfig(cfg, origen) {
  app.cfg = normalizar(cfg);
  app.origen = origen;
  renderConfig();
  ir('config');
}

function formatoCampo(clave, tipo, valor) {
  if (tipo === 'numero') return String(valor);
  if (valor === 0) return clave === 'lapso' ? 'Sin aviso' : 'No';
  return formatoTiempo(valor);
}

function renderConfig() {
  const { cfg, origen } = app;
  $('#config-titulo').textContent = origen.nombre;
  $('#config-subtitulo').textContent = origen.tipo === 'modo' ? MODOS[cfg.modo].descripcion : `Modo ${MODOS[cfg.modo].nombre}`;
  $('#btn-guardar-preset').textContent = origen.tipo === 'propio' ? 'Guardar cambios' : 'Guardar preset';

  const lista = $('#campos');
  lista.replaceChildren();
  for (const [clave, etiqueta, tipo, min, max, minActivo] of CAMPOS[cfg.modo]) {
    const li = document.createElement('li');
    lista.append(li);
    crearStepper(li, {
      etiqueta,
      obtener: () => app.cfg[clave],
      formatear: (v) => formatoCampo(clave, tipo, v),
      cambiar: (dir) => {
        const v = app.cfg[clave];
        let nuevo = tipo === 'numero' ? v + dir : v + dir * pasoTiempo(v, dir);
        nuevo = Math.min(max, Math.max(min, nuevo));
        if (minActivo && nuevo > 0 && nuevo < minActivo) nuevo = dir > 0 ? minActivo : 0;
        if (nuevo !== v) {
          app.cfg[clave] = nuevo;
          pintarTotal();
        }
      },
    });
  }
  pintarTotal();
}

function pintarTotal() {
  const el = $('#config-total');
  if (app.cfg.modo === 'cronometro') {
    el.innerHTML = 'Sin límite de tiempo: <strong>lo detenés vos</strong>';
  } else {
    el.innerHTML = `Duración total <strong>${formatoTiempo(duracionTotal(armarSecuencia(app.cfg)))}</strong>`;
  }
}

$('#btn-guardar-preset').addEventListener('click', () => {
  const d = $('#dlg-preset');
  const { origen, cfg } = app;
  const esPropio = origen.tipo === 'propio';
  const input = $('#dlg-preset-nombre');
  input.value = esPropio ? origen.nombre
    : origen.tipo === 'preset' ? `${origen.nombre} (mío)` : `${MODOS[cfg.modo].nombre} personalizado`;
  $('#dlg-preset-nuevo').hidden = !esPropio;
  $('#dlg-preset-guardar').textContent = esPropio ? 'Guardar cambios' : 'Guardar';
  d.returnValue = '';
  d.showModal();
  input.select();
  d.addEventListener('close', () => {
    const accion = d.returnValue;
    const nombre = input.value.trim();
    if (!nombre || (accion !== 'guardar' && accion !== 'nuevo')) return;
    const id = esPropio && accion === 'guardar' ? origen.id : nuevoId();
    guardarPresetPropio({ id, nombre, ...normalizar(cfg) });
    app.origen = { tipo: 'propio', id, nombre };
    renderConfig();
    avisar('Preset guardado');
  }, { once: true });
});

$('#btn-empezar').addEventListener('click', () => {
  audio.desbloquear();
  audio.setVolumen(app.ajustes.volumen);
  guardarUltima(app.cfg);
  iniciarSesion();
  ir('timer');
});

/* ------------------------------------------------------------------- timer */

function iniciarSesion() {
  detenerTimer();
  const fases = armarSecuencia(app.cfg);
  app.timer = new Timer(fases, {
    onEvento: alEvento,
    avisoUltimos: app.ajustes.avisoUltimos,
    avisoTablas: app.ajustes.avisoTablas,
  });
  const esCrono = app.cfg.modo === 'cronometro';
  const btnSaltar = $('#btn-saltar');
  btnSaltar.querySelector('use').setAttribute('href', esCrono ? '#i-stop' : '#i-saltar');
  btnSaltar.querySelector('span').textContent = esCrono ? 'Terminar' : 'Saltar';
  btnSaltar.setAttribute('aria-label', esCrono ? 'Terminar' : 'Saltar fase');
  $('#atajo-saltar').textContent = esCrono ? 'terminar' : 'saltar';
  $('#t-nombre').textContent = app.origen?.nombre || MODOS[app.cfg.modo].nombre;
  app.faseColor = null;
  app.timer.iniciar();
  pedirWakeLock();
  app.intervalo = setInterval(bucle, 100);
  bucle();
}

function detenerTimer() {
  salirPantallaCompleta();
  clearInterval(app.intervalo);
  app.intervalo = null;
  app.timer = null;
  soltarWakeLock();
}

function bucle() {
  if (!app.timer) return;
  app.timer.tick();
  if (app.timer && app.timer.estado !== 'terminado') pintarTimer();
}

const SONIDO_FASE = {
  entrenar: 'entrenar', descansar: 'descansar', descansoCiclos: 'descansoCiclos',
  enfriamiento: 'enfriamiento', cronometro: 'entrenar',
};
const VIBRACION_FASE = {
  entrenar: [400], descansar: [200, 100, 200], descansoCiclos: [200, 100, 200, 100, 200],
  enfriamiento: [150], cronometro: [400],
};

function alEvento(tipo, datos) {
  const estilo = app.ajustes.sonido;
  switch (tipo) {
    case 'fase':
      if (!datos.silencioso && SONIDO_FASE[datos.fase.tipo]) {
        audio.sonar(SONIDO_FASE[datos.fase.tipo], estilo);
        vibrar(VIBRACION_FASE[datos.fase.tipo]);
      }
      break;
    case 'cuenta':
      audio.sonar('cuenta', estilo);
      vibrar(60);
      break;
    case 'tablas':
      audio.sonar('tablas', estilo);
      vibrar([40, 80, 40]);
      break;
    case 'lapso':
      audio.sonar('lapso', estilo);
      vibrar(250);
      destello();
      break;
    case 'fin':
      audio.sonar('fin', estilo);
      vibrar([300, 150, 300, 150, 600]);
      mostrarResumen(datos.resumen);
      break;
    default:
      if (app.timer) pintarTimer();
  }
}

function destello() {
  const el = $('#t-centro');
  el.classList.remove('destello');
  void el.offsetWidth; // reinicia la animación
  el.classList.add('destello');
}

function actualizarThemeColor() {
  const color = getComputedStyle(document.body).getPropertyValue('--fondo').trim() || '#0f1115';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', color);
}

function pintarTimer() {
  const t = app.timer;
  if (!t || t.estado === 'terminado' || t.estado === 'listo') return;
  const s = t.instantanea();
  const tipo = s.fase.tipo;
  const pausado = s.estado === 'pausado';
  const body = document.body;

  const claveFase = pausado ? 'pausa' : tipo;
  if (body.dataset.fase !== claveFase) body.dataset.fase = claveFase;
  const avisoUltimos = app.ajustes.avisoUltimos;
  const ultimos = !pausado && (tipo === 'entrenar' || tipo === 'descansar')
    && avisoUltimos > 0 && s.restante <= avisoUltimos;
  body.classList.toggle('ultimos', ultimos);
  const colorClave = claveFase + (ultimos ? '-u' : '');
  if (app.faseColor !== colorClave) {
    app.faseColor = colorClave;
    actualizarThemeColor();
  }

  escribirTexto($('#t-fase'), pausado ? 'Pausa' : NOMBRES_FASE[tipo]);

  const esCrono = tipo === 'cronometro';
  const tiempo = esCrono ? formatoTiempo(s.transcurrido) : formatoTiempo(Math.ceil(s.restante - 1e-6));
  const elTiempo = $('#t-tiempo');
  escribirTexto(elTiempo, tiempo);
  elTiempo.classList.toggle('largo', tiempo.length > 5);

  let info = '';
  const f = s.fase;
  if (esCrono) {
    if (f.lapso > 0) info = `Vuelta <b>${s.vuelta}</b> · ${formatoTiempo(s.tiempoVuelta)}`;
  } else if (f.ronda) {
    info = `Ronda <b>${f.ronda}</b>/${f.totalRondas}`;
    if (f.totalCiclos > 1) info += ` · Ciclo <b>${f.ciclo}</b>/${f.totalCiclos}`;
  } else if (tipo === 'descansoCiclos') {
    info = `Ciclo <b>${f.ciclo}</b>/${f.totalCiclos} completo`;
  }
  const elInfo = $('#t-info');
  if (elInfo.innerHTML !== info) elInfo.innerHTML = info;

  let siguiente = '';
  if (s.siguiente) {
    const sig = s.siguiente;
    siguiente = `Sigue: ${NOMBRES_FASE[sig.tipo]}${Number.isFinite(sig.duracion) ? ` ${formatoTiempo(sig.duracion)}` : ''}`;
  } else if (!esCrono) {
    siguiente = 'Última fase';
  }
  escribirTexto($('#t-siguiente'), siguiente);

  escribirTexto($('#t-total'), esCrono ? '' : `Total ${formatoTiempo(Math.ceil(s.totalRestante - 1e-6))}`);

  const progreso = s.progreso == null ? 0 : s.progreso;
  $('#t-barra').style.transform = `scaleX(${progreso})`;

  const btn = $('#btn-pausa');
  const icono = pausado ? '#i-play' : '#i-pausa';
  const use = btn.querySelector('use');
  if (use.getAttribute('href') !== icono) {
    use.setAttribute('href', icono);
    btn.setAttribute('aria-label', pausado ? 'Reanudar' : 'Pausar');
  }
}

function alternarPausa() {
  if (!timerActivo()) return;
  audio.reanudarSiHaceFalta();
  app.timer.alternarPausa();
  pintarTimer();
}

$('#btn-pausa').addEventListener('click', alternarPausa);
$('#t-centro').addEventListener('click', alternarPausa);

$('#btn-saltar').addEventListener('click', () => {
  if (!timerActivo()) return;
  if (app.cfg.modo === 'cronometro') app.timer.terminar();
  else {
    app.timer.saltar();
    pintarTimer();
  }
});

async function conPausa(accion) {
  const estaba = app.timer?.estado === 'corriendo';
  if (estaba) { app.timer.pausar(); pintarTimer(); }
  const ok = await accion();
  if (!ok && estaba && app.timer?.estado === 'pausado') { app.timer.reanudar(); pintarTimer(); }
}

$('#btn-reiniciar').addEventListener('click', () => {
  if (!timerActivo()) return;
  conPausa(async () => {
    const ok = await confirmar('¿Reiniciar?', 'La sesión vuelve a empezar desde el principio.', 'Reiniciar');
    if (ok) iniciarSesion();
    return ok;
  });
});

function pedirSalir() {
  if (!timerActivo()) { history.back(); return; }
  if ($('#dlg-confirmar').open) return;
  conPausa(async () => {
    const ok = await confirmar('¿Salir del entrenamiento?', 'Se pierde el progreso de esta sesión.', 'Salir');
    if (ok) {
      detenerTimer();
      history.back();
    }
    return ok;
  });
}

$('#btn-salir').addEventListener('click', pedirSalir);

/* ---------------------------------------------------------------- resumen */

function mostrarResumen(r) {
  salirPantallaCompleta();
  clearInterval(app.intervalo);
  app.intervalo = null;
  soltarWakeLock();
  document.body.dataset.fase = 'fin';
  document.body.classList.remove('ultimos');
  $('#resumen-nombre').textContent = app.origen?.nombre || '';
  $('#r-tiempo').textContent = formatoTiempo(Math.round(r.tiempoActivo));
  if (app.cfg.modo === 'cronometro') {
    $('#r-rondas-label').textContent = 'Vueltas completas';
    $('#r-rondas').textContent = String(r.vueltas);
  } else {
    $('#r-rondas-label').textContent = 'Rondas completadas';
    $('#r-rondas').textContent = `${r.rondasCompletas} de ${r.totalRondas}`;
  }
  reemplazar('resumen');
  document.body.dataset.fase = 'fin';
  actualizarThemeColor();
}

$('#btn-repetir').addEventListener('click', () => {
  audio.desbloquear();
  iniciarSesion();
  reemplazar('timer');
});

/* ------------------------------------------------- computadora: teclado */

function salirPantallaCompleta() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function alternarPantallaCompleta() {
  if (!document.fullscreenEnabled) return;
  if (document.fullscreenElement) salirPantallaCompleta();
  else document.documentElement.requestFullscreen().catch(() => {});
}

const btnPantalla = $('#btn-pantalla-completa');
btnPantalla.hidden = !document.fullscreenEnabled;
btnPantalla.addEventListener('click', alternarPantallaCompleta);

// Con mouse, los controles del timer no se quedan con el foco: así Espacio siempre pausa.
$$('#pantalla-timer button').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));

document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
  if (document.querySelector('dialog[open]')) return;
  const enControl = e.target.closest('button, input, select, textarea');

  if (app.pantalla === 'timer' && timerActivo()) {
    if (enControl && (e.key === ' ' || e.key === 'Enter')) return; // el botón enfocado responde solo
    switch (e.key) {
      case ' ': e.preventDefault(); alternarPausa(); break;
      case 'ArrowRight': e.preventDefault(); $('#btn-saltar').click(); break;
      case 'r': case 'R': $('#btn-reiniciar').click(); break;
      case 'f': case 'F': alternarPantallaCompleta(); break;
      case 'Escape':
        // Se abre después del evento: si no, la misma tecla cierra el diálogo recién abierto.
        e.preventDefault();
        if (!document.fullscreenElement) setTimeout(pedirSalir, 0);
        break;
      default: break;
    }
    return;
  }
  if (enControl) return;
  if (e.key === 'Enter') {
    if (app.pantalla === 'config') $('#btn-empezar').click();
    else if (app.pantalla === 'resumen') $('#btn-repetir').click();
  } else if (e.key === 'Escape' && app.pantalla !== 'inicio' && app.pantalla !== 'timer') {
    history.back();
  }
});

/* ------------------------------------------------------------- wake lock */

async function pedirWakeLock() {
  if (!('wakeLock' in navigator) || app.wakeLock) return;
  try {
    app.wakeLock = await navigator.wakeLock.request('screen');
    app.wakeLock.addEventListener('release', () => { app.wakeLock = null; });
  } catch { /* no disponible (ej. sin HTTPS o batería baja) */ }
}

function soltarWakeLock() {
  if (app.wakeLock) app.wakeLock.release().catch(() => {});
  app.wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && timerActivo()) {
    pedirWakeLock();
    audio.reanudarSiHaceFalta();
    bucle();
  }
});

/* ------------------------------------------------------------ mis presets */

function renderMisPresets() {
  const cont = $('#mis-presets-contenido');
  const propios = cargarPresetsPropios();
  cont.replaceChildren();
  if (propios.length === 0) {
    cont.innerHTML = '<p class="vacio">Todavía no guardaste presets.<br>Elegí un modo o un preset, ajustalo y tocá <strong>Guardar preset</strong>.</p>';
    return;
  }
  for (const modo of Object.keys(MODOS)) {
    const delModo = propios.filter((p) => p.modo === modo);
    if (!delModo.length) continue;
    const h = document.createElement('h2');
    h.className = 'titulo-seccion';
    h.textContent = MODOS[modo].nombre;
    const ul = document.createElement('ul');
    ul.className = 'lista-propios';
    for (const p of delModo) {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="preset-texto">
          <span class="preset-nombre">${escapar(p.nombre)}</span>
          <span class="preset-desc">${escapar(describir(p))}</span>
        </div>
        <button class="icono" data-accion="editar" aria-label="Editar ${escapar(p.nombre)}"><svg><use href="#i-editar"/></svg></button>
        <button class="icono peligro" data-accion="borrar" aria-label="Borrar ${escapar(p.nombre)}"><svg><use href="#i-borrar"/></svg></button>`;
      li.querySelector('[data-accion="editar"]').addEventListener('click', () => {
        abrirConfig(p, { tipo: 'propio', id: p.id, nombre: p.nombre });
      });
      li.querySelector('[data-accion="borrar"]').addEventListener('click', async () => {
        if (await confirmar('¿Borrar preset?', `“${p.nombre}” se borra de este dispositivo.`, 'Borrar')) {
          borrarPresetPropio(p.id);
          renderMisPresets();
          renderInicio();
        }
      });
      ul.append(li);
    }
    cont.append(h, ul);
  }
}

/* ---------------------------------------------------------------- ajustes */

function guardar() {
  guardarAjustes(app.ajustes);
}

function renderAjustes() {
  const a = app.ajustes;
  $$('#aj-sonido button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.valor === a.sonido)));
  $('#aj-volumen').value = a.volumen;
  const vib = $('#aj-vibracion');
  const puedeVibrar = 'vibrate' in navigator;
  vib.checked = a.vibracion && puedeVibrar;
  vib.disabled = !puedeVibrar;
  $('#aj-vibracion-ayuda').textContent = puedeVibrar ? '' : 'No disponible en este dispositivo';

  crearStepper($('#aj-ultimos'), {
    etiqueta: 'Aviso últimos segundos',
    obtener: () => app.ajustes.avisoUltimos,
    formatear: (v) => (v ? `${v} s` : 'No'),
    cambiar: (dir) => { app.ajustes.avisoUltimos = Math.min(10, Math.max(0, app.ajustes.avisoUltimos + dir)); guardar(); },
  });
  crearStepper($('#aj-tablas'), {
    etiqueta: 'Aviso fin de ronda',
    obtener: () => app.ajustes.avisoTablas,
    formatear: (v) => (v ? `${v} s` : 'No'),
    cambiar: (dir) => { app.ajustes.avisoTablas = Math.min(30, Math.max(0, app.ajustes.avisoTablas + dir * 5)); guardar(); },
  });
}

$$('#aj-sonido button').forEach((b) => {
  b.addEventListener('click', () => {
    app.ajustes.sonido = b.dataset.valor;
    guardar();
    renderAjustes();
    audio.desbloquear();
    audio.setVolumen(app.ajustes.volumen);
    audio.sonar('prueba', app.ajustes.sonido);
  });
});

$('#aj-volumen').addEventListener('input', (e) => {
  app.ajustes.volumen = Number(e.target.value);
  audio.setVolumen(app.ajustes.volumen);
  guardar();
});
$('#aj-volumen').addEventListener('change', () => {
  audio.desbloquear();
  audio.sonar('cuenta', app.ajustes.sonido === 'silencio' ? 'beep' : app.ajustes.sonido);
});

$('#aj-vibracion').addEventListener('change', (e) => {
  app.ajustes.vibracion = e.target.checked;
  guardar();
  vibrar(200);
});

$('#btn-probar').addEventListener('click', () => {
  audio.desbloquear();
  audio.setVolumen(app.ajustes.volumen);
  if (app.ajustes.sonido === 'silencio') avisar('El sonido está en silencio');
  audio.sonar('prueba', app.ajustes.sonido);
  vibrar(300);
});

/* ------------------------------------------------------ instalación (PWA) */

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  app.eventoInstalar = e;
  $('#btn-instalar-wrap').hidden = false;
});

$('#btn-instalar').addEventListener('click', async () => {
  if (!app.eventoInstalar) return;
  app.eventoInstalar.prompt();
  await app.eventoInstalar.userChoice.catch(() => {});
  app.eventoInstalar = null;
  $('#btn-instalar-wrap').hidden = true;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin HTTPS no hay offline */ });
  });
}

/* ------------------------------------------------------------------ inicio */

history.replaceState({ pantalla: 'inicio', profundidad: 0 }, '');
renderInicio();
mostrar('inicio');
