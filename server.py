#!/usr/bin/env python3
"""Keepers — a map of your favorite places. Stdlib only.

  python3 server.py            # http://localhost:8142
  python3 server.py --lan      # also reachable from phone/iPad on the same Wi-Fi
  python3 server.py --open     # open the browser on start
"""
import json, os, socket, sys, threading, urllib.parse, urllib.request, webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = 8142
ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
DATA_DIR = os.path.join(ROOT, "data")
DB = os.path.join(DATA_DIR, "places.json")
UA = "Keepers/1.0 (personal places tracker)"
LOCK = threading.Lock()


def load():
    try:
        with open(DB, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"places": []}


def save(doc):
    os.makedirs(DATA_DIR, exist_ok=True)
    with LOCK:
        if os.path.exists(DB):
            os.replace(DB, DB + ".bak")  # one-step undo if something goes wrong
        tmp = DB + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        os.replace(tmp, DB)


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.load(r)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        pass

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = dict(urllib.parse.parse_qsl(u.query))
        try:
            if u.path == "/api/places":
                return self.send_json(load())
            if u.path == "/api/search":
                # Photon (OpenStreetMap) — biased toward the current map view
                params = {"q": q.get("q", ""), "limit": "8", "lang": "en"}
                if q.get("lat") and q.get("lon"):
                    params.update(lat=q["lat"], lon=q["lon"])
                return self.send_json(fetch_json("https://photon.komoot.io/api/?" + urllib.parse.urlencode(params)))
            if u.path == "/api/reverse":
                params = {"lat": q.get("lat"), "lon": q.get("lon"), "limit": "1", "lang": "en"}
                return self.send_json(fetch_json("https://photon.komoot.io/reverse?" + urllib.parse.urlencode(params)))
        except Exception as e:
            return self.send_json({"error": str(e)}, 502)
        if u.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_PUT(self):
        if self.path != "/api/places":
            return self.send_json({"error": "not found"}, 404)
        n = int(self.headers.get("Content-Length", 0))
        try:
            doc = json.loads(self.rfile.read(n))
            assert isinstance(doc.get("places"), list)
        except Exception:
            return self.send_json({"error": "bad data"}, 400)
        save(doc)
        self.send_json({"ok": True, "count": len(doc["places"])})


def main():
    lan = "--lan" in sys.argv
    host = "0.0.0.0" if lan else "127.0.0.1"
    srv = ThreadingHTTPServer((host, PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"Keepers is running at {url}")
    if lan:
        print(f"On your phone (same Wi-Fi): http://{socket.gethostname()}:{PORT}")
    print("Leave this window open. Press Ctrl+C to stop.")
    if "--open" in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
