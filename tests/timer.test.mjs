// Pruebas del motor y las secuencias. Ejecutar: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarSecuencia, duracionTotal, formatoTiempo, normalizar } from '../public/js/secuencias.js';
import { Timer } from '../public/js/timer.js';
import { PRESETS } from '../public/js/presets.js';

const preset = (id) => PRESETS.find((p) => p.id === id);

test('Boxeo: 3 × 3:00 / 1:00 + 10 s de Preparate = 11:10 (sin descanso final)', () => {
  const fases = armarSecuencia(preset('boxeo'));
  assert.equal(formatoTiempo(duracionTotal(fases)), '11:10');
  assert.deepEqual(fases.map((f) => f.tipo),
    ['preparate', 'entrenar', 'descansar', 'entrenar', 'descansar', 'entrenar']);
});

test('Tabata clásico dura 4:00', () => {
  assert.equal(formatoTiempo(duracionTotal(armarSecuencia(preset('tabata-clasico')))), '4:00');
});

test('Tabata 2×6 dura 12:30 y tiene un solo descanso entre ciclos', () => {
  const fases = armarSecuencia(preset('tabata-2x6'));
  assert.equal(formatoTiempo(duracionTotal(fases)), '12:30');
  assert.equal(fases.filter((f) => f.tipo === 'descansoCiclos').length, 1);
  assert.equal(fases.filter((f) => f.tipo === 'entrenar').length, 12);
});

test('Las fases en 0 se omiten', () => {
  const fases = armarSecuencia({ modo: 'rondas', preparate: 0, entrenar: 60, descansar: 0, rondas: 2, enfriamiento: 0 });
  assert.deepEqual(fases.map((f) => f.tipo), ['entrenar', 'entrenar']);
});

test('Enfriamiento se agrega al final', () => {
  const fases = armarSecuencia({ modo: 'rondas', rondas: 1, enfriamiento: 120 });
  assert.equal(fases.at(-1).tipo, 'enfriamiento');
});

test('normalizar limita rangos y completa valores', () => {
  const c = normalizar({ modo: 'tabata', rondas: 999, entrenar: -5 });
  assert.equal(c.rondas, 50);
  assert.equal(c.entrenar, 5);
  assert.equal(c.ciclos, 1);
  assert.equal(normalizar({ modo: 'cronometro', lapso: 2 }).lapso, 5);
  assert.equal(normalizar({ modo: 'cronometro', lapso: 0 }).lapso, 0);
});

function reloj() {
  let t = 0;
  return { now: () => t, avanzar: (ms) => { t += ms; } };
}

function correr(timer, r, ms, paso = 50) {
  for (let i = 0; i < ms; i += paso) { r.avanzar(paso); timer.tick(); }
}

test('El motor recorre la sesión de Boxeo y termina a los 670 s', () => {
  const r = reloj();
  const eventos = [];
  const timer = new Timer(armarSecuencia(preset('boxeo')), {
    now: r.now, onEvento: (tipo, d) => eventos.push([tipo, d, r.now()]),
  });
  timer.iniciar();
  correr(timer, r, 669_900);
  assert.equal(timer.estado, 'corriendo');
  correr(timer, r, 200);
  assert.equal(timer.estado, 'terminado');
  const fin = eventos.find(([t]) => t === 'fin');
  assert.equal(fin[1].resumen.rondasCompletas, 3);
  assert.equal(Math.round(fin[1].resumen.tiempoActivo), 670);
  // 5 beeps al final de Preparate, de cada Entrenar y de cada Descansar: 6 fases × 5
  const cuentas = eventos.filter(([t]) => t === 'cuenta');
  assert.equal(cuentas.length, 30);
  assert.deepEqual(cuentas.slice(0, 5).map(([, d]) => d.segundos), [5, 4, 3, 2, 1]);
  // aviso de "tablas" en cada una de las 3 rondas
  assert.equal(eventos.filter(([t]) => t === 'tablas').length, 3);
});

test('Pausar y reanudar no altera el tiempo restante', () => {
  const r = reloj();
  const timer = new Timer(armarSecuencia(preset('boxeo')), { now: r.now });
  timer.iniciar();
  correr(timer, r, 5_000);
  timer.pausar();
  const antes = timer.instantanea().restante;
  r.avanzar(60_000);
  timer.tick();
  assert.equal(timer.instantanea().restante, antes);
  timer.reanudar();
  correr(timer, r, 5_000);
  assert.equal(timer.index, 1); // pasó a Entrenar exactamente
  assert.ok(Math.abs(timer.instantanea().restante - 180) < 0.06);
});

test('Saltar pasa a la siguiente fase', () => {
  const r = reloj();
  const timer = new Timer(armarSecuencia(preset('boxeo')), { now: r.now });
  timer.iniciar();
  timer.saltar();
  assert.equal(timer.fase.tipo, 'entrenar');
  assert.equal(timer.instantanea().restante, 180);
});

test('Si la pestaña se congela, al volver corrige el tiempo sin sonar de más', () => {
  const r = reloj();
  const eventos = [];
  const timer = new Timer(armarSecuencia(preset('boxeo')), { now: r.now, onEvento: (t) => eventos.push(t) });
  timer.iniciar();
  r.avanzar(200_000); // 3:20 sin ticks
  timer.tick();
  assert.equal(timer.fase.tipo, 'descansar');
  assert.ok(Math.abs(timer.instantanea().restante - 50) < 0.001);
  assert.equal(eventos.filter((t) => t === 'cuenta').length, 0);
});

test('Cronómetro: suena en cada lapso y muestra la vuelta correcta', () => {
  const r = reloj();
  const lapsos = [];
  const timer = new Timer(armarSecuencia(preset('crono-1min')), {
    now: r.now, onEvento: (tipo, d) => { if (tipo === 'lapso') lapsos.push([d.vuelta, r.now()]); },
  });
  timer.iniciar();
  correr(timer, r, 10_000 + 185_000);
  assert.deepEqual(lapsos.map(([v]) => v), [1, 2, 3]);
  // cada aviso llega dentro de los 50 ms del minuto exacto
  lapsos.forEach(([v, t]) => assert.ok(t - (10_000 + v * 60_000) < 50));
  const s = timer.instantanea();
  assert.equal(s.vuelta, 4);
  assert.ok(Math.abs(s.tiempoVuelta - 5) < 0.06);
  timer.terminar();
  assert.equal(timer.resumen().vueltas, 3);
});
