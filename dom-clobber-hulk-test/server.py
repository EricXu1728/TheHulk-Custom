from http.server import HTTPServer, SimpleHTTPRequestHandler

HOST = "127.0.0.1"
PORT = 8001


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; "
            "script-src 'self'; "
            "object-src 'none'; "
            "base-uri 'none'; "
            "frame-ancestors 'none'"
        )
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

print(f"Open http://{HOST}:{PORT}")
HTTPServer((HOST, PORT), Handler).serve_forever()
