#!/usr/bin/env python3
"""Servidor local del panel DAW con persistencia en progress.json."""

import argparse
import json
import os
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
PROGRESS_FILE = ROOT / "progress.json"


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _is_progress_api(self):
        return urlparse(self.path).path == "/api/progress"

    def do_GET(self):
        if not self._is_progress_api():
            return super().do_GET()

        if not PROGRESS_FILE.exists():
            return self._send_json({"state": None})

        try:
            with PROGRESS_FILE.open("r", encoding="utf-8") as progress_file:
                state = json.load(progress_file)
        except (OSError, json.JSONDecodeError) as error:
            return self._send_json({"error": f"No se pudo leer progress.json: {error}"}, status=500)

        self._send_json({"state": state})

    def do_PUT(self):
        if not self._is_progress_api():
            self.send_error(405, "Método no permitido")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400, "Content-Length no válido")
            return

        if length <= 0 or length > 1_000_000:
            self.send_error(400, "El cuerpo de la petición no es válido")
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_error(400, "JSON no válido")
            return

        if not isinstance(payload, dict):
            self.send_error(400, "El progreso debe ser un objeto JSON")
            return

        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(
                "w",
                encoding="utf-8",
                dir=ROOT,
                prefix=".progress-",
                suffix=".tmp",
                delete=False,
            ) as temporary_file:
                temporary_path = Path(temporary_file.name)
                json.dump(payload, temporary_file, ensure_ascii=False, indent=2)
                temporary_file.write("\n")
                temporary_file.flush()
                os.fsync(temporary_file.fileno())
            os.replace(temporary_path, PROGRESS_FILE)
        except OSError as error:
            if temporary_path:
                temporary_path.unlink(missing_ok=True)
            self.send_error(500, f"No se pudo guardar progress.json: {error}")
            return

        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string}] {format % args}", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Servidor local para el panel de progreso DAW")
    parser.add_argument("--host", default="127.0.0.1", help="Dirección de escucha (por defecto: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=4173, help="Puerto de escucha (por defecto: 4173)")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    print(f"Panel DAW disponible en http://{args.host}:{args.port}/", flush=True)
    print("Los cambios se guardarán en progress.json. Ctrl+C para detenerlo.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
