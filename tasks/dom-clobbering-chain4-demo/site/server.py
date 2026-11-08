from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import sys

os.chdir(Path(__file__).resolve().parent)
port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8004"))
server = ThreadingHTTPServer(("127.0.0.1", port), SimpleHTTPRequestHandler)
print(f"Serving four-gadget chain demo at http://127.0.0.1:{port}/", flush=True)
server.serve_forever()
