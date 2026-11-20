# Timer Training

Timer de entrenamiento para el celular, instalable como app (PWA) y usable sin conexión.
Tres modos: **Rondas**, **Tabata** y **Cronómetro**, con presets de Boxeo, Kickboxing, Muay Thai, MMA y Tabata.

El detalle funcional está en `docs/TimerTraining_Documento_Proyecto.docx`.

## Estructura

```
public/            lo que se publica (HTML, CSS, JS, íconos)
  index.html
  manifest.webmanifest
  sw.js            service worker (offline)
  css/styles.css
  js/app.js        pantallas y navegación
  js/timer.js      motor del timer (común a los 3 modos)
  js/secuencias.js arma las fases de cada modo
  js/audio.js      sonidos (sintetizados con Web Audio, sin archivos)
  js/storage.js    presets propios y ajustes (localStorage)
  js/presets.js    presets precargados
  icons/
tools/             scripts Python
  serve.py         servidor local
  make_icons.py    genera los íconos PNG (Pillow)
  validate_presets.py
tests/             pruebas (Node y pytest)
.github/workflows/pages.yml  publicación automática en GitHub Pages
```

## Correr en la PC

Necesitás Python 3.

```bash
python tools/serve.py
```

Abrí `http://localhost:8000`. Para ver cómo queda en el celular usá las herramientas de desarrollo
del navegador (F12 → ícono de dispositivo móvil).

**Desde el celular en la misma red Wi-Fi:** el servidor muestra una dirección tipo `http://192.168.x.x:8000`.
La app funciona, pero el navegador solo habilita *offline*, *instalar* y *pantalla siempre encendida*
en `localhost` o con HTTPS. Para probar todo eso en el teléfono, publicala (ver abajo).

## Pruebas

```bash
node --test tests/*.test.mjs     # motor y secuencias (Node 18+)
python -m pytest tests/          # presets (pip install pytest)
python tools/validate_presets.py
```

Las pruebas cubren el checklist del documento: Boxeo 11:10, Tabata clásico 4:00, Tabata 2×6 12:30,
pausa sin pérdida de tiempo, avisos del Cronómetro en cada minuto y corrección del tiempo
si el navegador congela la pestaña.

## Publicar gratis

### GitHub Pages (automático)
1. Crear un repositorio en GitHub y subir esta carpeta.
2. Mover `tools/github-pages-workflow.yml` a `.github/workflows/pages.yml`.
3. En el repo: **Settings → Pages → Source: GitHub Actions**.
4. Cada `push` a `main` publica `public/` en `https://<usuario>.github.io/<repo>/`.

### Cloudflare Pages
Conectar el repo y poner **Build output directory = `public`** (sin comando de build).

Al publicar cambios, subí la constante `VERSION` en `public/sw.js` para que los celulares
que ya la tienen instalada descarguen la versión nueva.

## Instalar en el celular

- **Android (Chrome):** abrir la web → menú ⋮ → “Instalar app”.
- **iPhone (Safari):** botón Compartir → “Agregar a pantalla de inicio”.

## Íconos

```bash
pip install pillow
python tools/make_icons.py
```

## Decisiones tomadas en esta versión

Puntos que el documento dejaba pendientes (sección 12) y cómo quedaron por ahora:

- **Arquitectura:** opción A — PWA estática en JavaScript sin frameworks; Python solo como herramienta.
- **Último descanso:** no se hace Descansar después de la última ronda (ni de la última ronda de cada ciclo en Tabata).
- **Cronómetro:** solo aviso automático por lapso; el botón para marcar vueltas a mano queda para más adelante.
- **Sonidos:** sintetizados con Web Audio (campana, beep, “tablas”) en vez de archivos .mp3, para que la app pese menos y funcione offline sin descargas extra.
- **Estilo:** tema oscuro, colores por fase según la sección 5.2.
- **Gesto “atrás” del celular** durante un entrenamiento: pausa y pregunta antes de salir.
- **Rondas completadas** del resumen: cuentan solo las rondas que llegaron al final (las saltadas no).

Pendiente: elegir hosting y dominio, revisar los presets con el entrenador y probar en dispositivos reales.
