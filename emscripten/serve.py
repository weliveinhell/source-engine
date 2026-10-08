#!/usr/bin/env python3
"""Serve the emscripten build with the headers the engine needs.

The build is linked with pthreads, so the page must be able to allocate a
SharedArrayBuffer. Browsers only hand one out to a cross-origin isolated
document, which means the server has to send COOP and COEP. A plain
`python3 -m http.server` does not, and the game fails at startup with
"SharedArrayBuffer is not defined".

Usage:
    python3 serve.py [--port 8080] [--dir build/install] [--bind 0.0.0.0]

To test on an actual iPhone, note that cross-origin isolation also requires a
secure context. http://localhost counts as secure, but http://192.168.x.x does
not -- so pointing your phone straight at this server will not work. Put it
behind HTTPS, for example:

    ssh -R 80:localhost:8080 nokey@localhost.run
    # or
    cloudflared tunnel --url http://localhost:8080
"""

import argparse
import functools
import http.server
import os
import socketserver
import sys

EXTRA_TYPES = {
    ".wasm": "application/wasm",
    ".data": "application/octet-stream",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".symbols": "text/plain",
    ".map": "application/json",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # The two headers that make SharedArrayBuffer available.
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        # The build changes every time; never let a stale wasm be reused.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def guess_type(self, path):
        ext = os.path.splitext(str(path))[1].lower()
        if ext in EXTRA_TYPES:
            return EXTRA_TYPES[ext]
        return super().guess_type(path)


class Server(socketserver.ThreadingTCPServer):
    # Map chunks are large and the page fetches several at once; a threading
    # server keeps one slow download from blocking the rest.
    allow_reuse_address = True
    daemon_threads = True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--dir", default=".", help="directory to serve (default: current)")
    args = parser.parse_args(argv)

    root = os.path.abspath(args.dir)
    if not os.path.isdir(root):
        sys.exit(f"no such directory: {root}")

    handler = functools.partial(Handler, directory=root)
    with Server((args.bind, args.port), handler) as httpd:
        print(f"serving {root}")
        print(f"  http://localhost:{args.port}/hl2_launcher.html")
        print("  cross-origin isolation: enabled (COOP + COEP)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nbye")


if __name__ == "__main__":
    main()
