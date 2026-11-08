#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

SITE_DIR = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8003

os.chdir(SITE_DIR)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'",
        )
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


print(f"Serving gadget-chain demo at http://{HOST}:{PORT}/", flush=True)
ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
