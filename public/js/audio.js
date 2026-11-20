// audio.js — Sonidos sintetizados con Web Audio API (sin archivos: más liviano y funciona offline).
// Los celulares solo permiten sonido después de un toque: llamar a desbloquear() desde "Empezar".

let ctx = null;
let salida = null;
let volumen = 0.8;
let ruido = null;

export function desbloquear() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    salida = ctx.createGain();
    salida.gain.value = volumen;
    salida.connect(ctx.destination);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  // Buffer silencioso: en iOS termina de habilitar el audio.
  const b = ctx.createBuffer(1, 1, 22050);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(ctx.destination);
  s.start(0);
}

export function reanudarSiHaceFalta() {
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
}

export function setVolumen(v) {
  volumen = v;
  if (salida) salida.gain.setValueAtTime(v, ctx.currentTime);
}

function tono(t, frecuencia, duracion, ganancia, forma = 'sine') {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = forma;
  osc.frequency.setValueAtTime(frecuencia, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(ganancia, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
  osc.connect(g).connect(salida);
  osc.start(t);
  osc.stop(t + duracion + 0.05);
}

// Campana de ring: parciales inarmónicos con caída larga.
function campana(t, base = 830, duracion = 2.2, ganancia = 0.5) {
  const parciales = [[1, 1], [2.0, 0.55], [2.76, 0.4], [5.4, 0.22], [8.93, 0.1]];
  parciales.forEach(([ratio, g], i) => {
    tono(t, base * ratio, duracion / Math.sqrt(i + 1), ganancia * g);
  });
}

function beep(t, frecuencia = 1000, duracion = 0.14, ganancia = 0.45) {
  tono(t, frecuencia, duracion, ganancia, 'triangle');
}

// Golpe de madera ("tablas"): ráfaga de ruido filtrado.
function tabla(t) {
  if (!ruido) {
    ruido = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
  }
  const s = ctx.createBufferSource();
  s.buffer = ruido;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  f.Q.value = 3;
  const g = ctx.createGain();
  g.gain.value = 2.2;
  s.connect(f).connect(g).connect(salida);
  s.start(t);
}

/**
 * Reproduce el sonido de un evento.
 * eventos: entrenar | descansar | descansoCiclos | enfriamiento | cuenta | tablas | lapso | fin | prueba
 * estilo: campana | beep | silencio
 */
export function sonar(evento, estilo = 'campana') {
  if (!ctx || estilo === 'silencio') return;
  reanudarSiHaceFalta();
  const t = ctx.currentTime + 0.01;
  const conCampana = estilo === 'campana';

  switch (evento) {
    case 'cuenta':
      beep(t, 880, 0.12);
      break;
    case 'tablas':
      tabla(t); tabla(t + 0.16); tabla(t + 0.32);
      break;
    case 'entrenar':
    case 'prueba':
      if (conCampana) campana(t, 830, 2.4, 0.55);
      else beep(t, 1320, 0.5, 0.5);
      break;
    case 'descansar':
      if (conCampana) { campana(t, 830, 1.2, 0.5); campana(t + 0.35, 830, 1.6, 0.5); }
      else { beep(t, 990, 0.25); beep(t + 0.32, 990, 0.25); }
      break;
    case 'descansoCiclos':
      if (conCampana) { campana(t, 620, 1.4, 0.55); campana(t + 0.45, 620, 2.2, 0.55); }
      else { beep(t, 740, 0.35); beep(t + 0.45, 740, 0.35); }
      break;
    case 'enfriamiento':
      tono(t, 523, 1.2, 0.3); tono(t + 0.25, 659, 1.2, 0.25); tono(t + 0.5, 784, 1.6, 0.22);
      break;
    case 'lapso':
      if (conCampana) campana(t, 990, 1.4, 0.5);
      else beep(t, 1320, 0.3, 0.5);
      break;
    case 'fin':
      if (conCampana) { campana(t, 830, 1.2); campana(t + 0.4, 830, 1.2); campana(t + 0.8, 830, 2.8); }
      else { beep(t, 1320, 0.2); beep(t + 0.3, 1320, 0.2); beep(t + 0.6, 1760, 0.6); }
      break;
    default:
      break;
  }
}
