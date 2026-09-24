#!/usr/bin/env python3
"""Local LabelStudio annotation editor."""

from __future__ import annotations

import os
import argparse
import json
import mimetypes
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ANNOTATIONS_FOLDER = os.environ.get("ANNOTATIONS_FOLDER", 'annotations')
PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = PROJECT_DIR.parent / ANNOTATIONS_FOLDER


class Handler(BaseHTTPRequestHandler):
    data_dir: Path

    def _json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file_path(self) -> Path | None:
        path = unquote(parse_qs(urlparse(self.path).query).get("path", [""])[0])
        candidate = (self.data_dir / path).resolve()
        if candidate.parent == self.data_dir.resolve() or self.data_dir.resolve() in candidate.parents:
            return candidate if candidate.suffix == ".json" else None
        return None

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/files":
            files = [
                {
                    "path": p.relative_to(self.data_dir).as_posix(),
                    "name": p.name,
                    "system": p.relative_to(self.data_dir).parts[0]
                    if len(p.relative_to(self.data_dir).parts) > 1
                    else "",
                }
                for p in sorted(self.data_dir.rglob("*.json"))
            ]
            return self._json({"data_dir": str(self.data_dir), "files": files})
        if parsed.path == "/api/file":
            path = self._file_path()
            if path is None or not path.exists():
                return self._json({"error": "JSON file not found"}, 404)
            try:
                return self._json(json.loads(path.read_text()))
            except (OSError, json.JSONDecodeError) as error:
                return self._json({"error": str(error)}, 400)
        return self._serve_static(parsed.path)

    def do_PUT(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/api/file":
            return self._json({"error": "not found"}, 404)
        path = self._file_path()
        if path is None:
            return self._json({"error": "invalid JSON path"}, 400)
        try:
            payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            if not isinstance(payload, list):
                raise ValueError("fixture must be a JSON list")
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False, encoding="utf-8") as output:
                json.dump(payload, output, indent=2, ensure_ascii=False)
                output.write("\n")
                temporary = Path(output.name)
            temporary.replace(path)
            return self._json({"saved": True, "path": str(path)})
        except (OSError, ValueError, json.JSONDecodeError) as error:
            return self._json({"error": str(error)}, 400)

    def _serve_static(self, url_path: str) -> None:
        relative = "index.html" if url_path in ("", "/") else url_path.lstrip("/")
        path = (PROJECT_DIR / relative).resolve()
        if PROJECT_DIR not in path.parents and path != PROJECT_DIR:
            return self._json({"error": "not found"}, 404)
        if not path.is_file():
            return self._json({"error": "not found"}, 404)
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    Handler.data_dir = args.data_dir.expanduser().resolve()
    if not Handler.data_dir.is_dir():
        parser.error(f"annotation directory does not exist: {Handler.data_dir}")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Annotation editor: http://127.0.0.1:{args.port}")
    print(f"Editing: {Handler.data_dir}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
