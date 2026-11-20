"""Servidor local de desarrollo para Timer Training.

Uso:  python tools/serve.py [puerto]      (por defecto 8000)

Sirve la carpeta public/ y muestra las direcciones para abrirla desde la PC
y desde el celular (misma red Wi-Fi).

Nota: el modo offline (service worker) y "mantener pantalla encendida" solo
funcionan en http://localhost o con HTTPS. Desde el celular por IP local la app
funciona, pero para instalarla y probar offline conviene publicarla (ver README).
"""
import http.server
import socket
import sys
from functools import partial
from pathlib import Path

PUBLICO = Path(__file__).resolve().parent.parent / "public"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        # Sin caché del navegador mientras se desarrolla.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def ip_local() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def main() -> None:
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(Handler, directory=str(PUBLICO))
    with http.server.ThreadingHTTPServer(("0.0.0.0", puerto), handler) as srv:
        print("Timer Training — servidor local")
        print(f"  PC:      http://localhost:{puerto}")
        print(f"  Celular: http://{ip_local()}:{puerto}  (misma red Wi-Fi)")
        print("  Ctrl+C para cortar.")
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print("\nListo.")


if __name__ == "__main__":
    main()
