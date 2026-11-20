// timer.js — Motor común a los tres modos.
// Recorre una lista de fases ya armada. No cuenta "ticks": guarda marcas de tiempo
// y calcula lo que falta, así no se atrasa aunque el navegador frene la pestaña.

const FASES_CON_CUENTA = new Set(['preparate', 'entrenar', 'descansar']);
const TOLERANCIA_ATRASO_MS = 1500; // si un aviso llega más tarde que esto, no se reproduce

export class Timer {
  /**
   * @param {Array} fases  lista de secuencias.js
   * @param {Object} opciones
   *   now: () => ms (inyectable para pruebas)
   *   onEvento: (tipo, datos) => void   tipos: fase, cuenta, tablas, lapso, fin, estado
   *   avisoUltimos: segundos de cuenta regresiva con beep (0 = sin aviso)
   *   avisoTablas: segundos antes del final de una ronda larga (0 = sin aviso)
   */
  constructor(fases, opciones = {}) {
    this.fases = fases;
    this.now = opciones.now || (() => performance.now());
    this.onEvento = opciones.onEvento || (() => {});
    this.avisoUltimos = opciones.avisoUltimos ?? 3;
    this.avisoTablas = opciones.avisoTablas ?? 10;

    // Inicio acumulado (en segundos) de cada fase, para el tiempo total.
    this.offsets = [];
    let acc = 0;
    for (const f of fases) {
      this.offsets.push(acc);
      if (Number.isFinite(f.duracion)) acc += f.duracion;
    }
    this.total = acc;
    this.reiniciarEstado();
  }

  reiniciarEstado() {
    this.estado = 'listo'; // listo | corriendo | pausado | terminado
    this.index = 0;
    this.inicioFase = 0;
    this.acumulado = 0;
    this.tiempoActivoMs = 0;
    this.rondasCompletas = 0;
    this.vueltas = 0;
    this.prepararAvisos();
  }

  prepararAvisos() {
    const f = this.fases[this.index];
    this.ultimoSegundo = f && Number.isFinite(f.duracion) ? f.duracion : null;
    this.tablasEmitido = false;
    this.ultimaVuelta = 0;
  }

  get fase() { return this.fases[this.index]; }

  /** Milisegundos transcurridos en la fase actual. */
  transcurridoFase(t = this.now()) {
    return this.acumulado + (this.estado === 'corriendo' ? t - this.inicioFase : 0);
  }

  emitir(tipo, datos = {}) { this.onEvento(tipo, datos); }

  iniciar() {
    if (this.estado !== 'listo' || this.fases.length === 0) return;
    this.estado = 'corriendo';
    this.inicioFase = this.now();
    this.acumulado = 0;
    this.prepararAvisos();
    this.emitir('fase', { fase: this.fase, index: 0, silencioso: false });
    this.emitir('estado', { estado: this.estado });
  }

  pausar() {
    if (this.estado !== 'corriendo') return;
    this.tick();
    if (this.estado !== 'corriendo') return;
    this.acumulado += this.now() - this.inicioFase;
    this.estado = 'pausado';
    this.emitir('estado', { estado: this.estado });
  }

  reanudar() {
    if (this.estado !== 'pausado') return;
    this.inicioFase = this.now();
    this.estado = 'corriendo';
    this.emitir('estado', { estado: this.estado });
  }

  alternarPausa() {
    if (this.estado === 'corriendo') this.pausar();
    else if (this.estado === 'pausado') this.reanudar();
  }

  /** Salta a la siguiente fase (cuenta como fase no completada). */
  saltar() {
    if (this.estado !== 'corriendo' && this.estado !== 'pausado') return;
    const t = this.now();
    const fase = this.fase;
    const trans = this.transcurridoFase(t);
    this.tiempoActivoMs += Number.isFinite(fase.duracion) ? Math.min(trans, fase.duracion * 1000) : trans;
    this.contarCronometro(fase, trans);
    this.avanzar(t, false, true);
  }

  /** Termina la sesión ahora (ej. botón "Terminar" del Cronómetro). */
  terminar() {
    if (this.estado !== 'corriendo' && this.estado !== 'pausado') return;
    const fase = this.fase;
    const trans = this.transcurridoFase();
    this.tiempoActivoMs += Number.isFinite(fase.duracion) ? Math.min(trans, fase.duracion * 1000) : trans;
    this.contarCronometro(fase, trans);
    this.estado = 'terminado';
    this.emitir('fin', { silencioso: false, resumen: this.resumen() });
  }

  contarCronometro(fase, transMs) {
    if (fase.tipo === 'cronometro' && fase.lapso > 0) this.vueltas = Math.floor(transMs / (fase.lapso * 1000));
  }

  reiniciar() {
    this.reiniciarEstado();
    this.emitir('estado', { estado: this.estado });
  }

  avanzar(inicioSiguiente, silencioso, saltada = false) {
    const anterior = this.fase;
    if (!saltada && anterior.tipo === 'entrenar') this.rondasCompletas++;
    this.index++;
    if (this.index >= this.fases.length) {
      this.estado = 'terminado';
      this.emitir('fin', { silencioso, resumen: this.resumen() });
      return;
    }
    const pausado = this.estado === 'pausado';
    this.inicioFase = inicioSiguiente;
    this.acumulado = 0;
    if (pausado) this.estado = 'corriendo'; // al saltar estando en pausa, la nueva fase arranca
    this.prepararAvisos();
    this.emitir('fase', { fase: this.fase, index: this.index, silencioso });
    if (pausado) this.emitir('estado', { estado: this.estado });
  }

  /** Llamar seguido (ej. cada 100 ms). Procesa cambios de fase y avisos. */
  tick() {
    if (this.estado !== 'corriendo') return;
    const t = this.now();
    // Puede haber varias transiciones si la pestaña estuvo congelada.
    for (let guarda = 0; guarda < 10000 && this.estado === 'corriendo'; guarda++) {
      const fase = this.fase;
      const trans = this.transcurridoFase(t);
      const durMs = fase.duracion * 1000;
      if (trans >= durMs) {
        const sobrante = trans - durMs;
        this.tiempoActivoMs += durMs;
        // El sobrante pasa a la fase siguiente: no se pierde ni se suma tiempo.
        this.avanzar(t - sobrante, sobrante > TOLERANCIA_ATRASO_MS);
        continue;
      }
      this.revisarAvisos(fase, trans, durMs);
      break;
    }
  }

  revisarAvisos(fase, transMs, durMs) {
    if (fase.tipo === 'cronometro') {
      if (!(fase.lapso > 0)) return;
      const lapsoMs = fase.lapso * 1000;
      const vuelta = Math.floor(transMs / lapsoMs);
      if (vuelta > this.ultimaVuelta) {
        this.ultimaVuelta = vuelta;
        const atraso = transMs - vuelta * lapsoMs;
        if (atraso <= TOLERANCIA_ATRASO_MS) this.emitir('lapso', { vuelta });
      }
      return;
    }

    const restMs = durMs - transMs;

    // Aviso de fin de ronda ("tablas") en rondas largas.
    const tablasMs = this.avisoTablas * 1000;
    if (fase.tablas && this.avisoTablas > this.avisoUltimos && fase.duracion > this.avisoTablas * 2
        && !this.tablasEmitido && restMs <= tablasMs) {
      this.tablasEmitido = true;
      if (tablasMs - restMs <= TOLERANCIA_ATRASO_MS) this.emitir('tablas', {});
    }

    // Cuenta regresiva de los últimos segundos.
    const seg = Math.ceil(restMs / 1000);
    if (seg !== this.ultimoSegundo) {
      const previo = this.ultimoSegundo;
      this.ultimoSegundo = seg;
      if (FASES_CON_CUENTA.has(fase.tipo) && previo !== null && seg < previo
          && seg >= 1 && seg <= this.avisoUltimos
          && (seg * 1000 - restMs) <= TOLERANCIA_ATRASO_MS) {
        this.emitir('cuenta', { segundos: seg });
      }
    }
  }

  /** Foto del estado actual para pintar la pantalla. Tiempos en segundos. */
  instantanea() {
    const fase = this.fase || this.fases[this.fases.length - 1];
    const trans = this.estado === 'terminado' ? 0 : this.transcurridoFase() / 1000;
    const infinita = !Number.isFinite(fase.duracion);
    const restante = infinita ? Infinity : Math.max(0, fase.duracion - trans);
    const totalTranscurrido = Math.min(this.total, (this.offsets[this.index] ?? this.total) + (infinita ? 0 : trans));
    const out = {
      estado: this.estado,
      index: this.index,
      fase,
      siguiente: this.fases[this.index + 1] || null,
      transcurrido: trans,
      restante,
      progreso: infinita ? null : Math.min(1, trans / fase.duracion),
      total: this.total,
      totalRestante: Math.max(0, this.total - totalTranscurrido),
    };
    if (fase.tipo === 'cronometro') {
      const lapso = fase.lapso;
      out.vuelta = lapso > 0 ? Math.floor(trans / lapso) + 1 : null;
      out.tiempoVuelta = lapso > 0 ? trans % lapso : trans;
      out.progreso = lapso > 0 ? (trans % lapso) / lapso : null;
    }
    return out;
  }

  resumen() {
    const totalRondas = this.fases.filter((f) => f.tipo === 'entrenar').length;
    return {
      tiempoActivo: this.tiempoActivoMs / 1000,
      rondasCompletas: this.rondasCompletas,
      totalRondas,
      vueltas: this.vueltas,
    };
  }
}
