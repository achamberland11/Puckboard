import json
import os
import time
import re
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

TEAMS = [
    "ANA",
    "BOS",
    "BUF",
    "CAR",
    "CBJ",
    "CGY",
    "CHI",
    "COL",
    "DAL",
    "DET",
    "EDM",
    "FLA",
    "LAK",
    "MIN",
    "MTL",
    "NJD",
    "NSH",
    "NYI",
    "NYR",
    "OTT",
    "PHI",
    "PIT",
    "SEA",
    "SJS",
    "STL",
    "TBL",
    "TOR",
    "UTA",
    "VAN",
    "VGK",
    "WPG",
    "WSH",
]

class ProxyHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api-web/"):
            target = "https://api-web.nhle.com" + self.path[8:]
            try:
                req = urllib.request.Request(target, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_response(502)
                self.end_headers()
                self.wfile.write(str(e).encode())
        elif self.path.startswith("/moneypuck/"):
            target = "https://moneypuck.com/moneypuck/" + self.path[len("/moneypuck/"):]
            try:
                req = urllib.request.Request(target, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/csv")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_response(502)
                self.end_headers()
                self.wfile.write(str(e).encode())
        elif self.path.startswith("/api/"):
            target = "https://api.nhle.com" + self.path[4:]
            try:
                req = urllib.request.Request(target, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_response(502)
                self.end_headers()
                self.wfile.write(str(e).encode())
        elif self.path.startswith("/nbihockey/"):
            target = "https://nbihockey.com" + self.path[len("/nbihockey"):]
            try:
                req = urllib.request.Request(target, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_response(502)
                self.end_headers()
                self.wfile.write(str(e).encode())
        elif self.path.startswith("/dailyfaceoff/starting-goalies/"):
            date = self.path[len("/dailyfaceoff/starting-goalies/"):].split("?", 1)[0]
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Invalid date")
                return
            target = f"https://www.dailyfaceoff.com/starting-goalies/{date}"
            last_error = None
            for attempt in range(3):
                try:
                    req = urllib.request.Request(
                        target,
                        headers={
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                            "Accept-Language": "en-US,en;q=0.9",
                            "Referer": "https://www.dailyfaceoff.com/",
                        },
                    )
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        html = resp.read().decode("utf-8", "replace")
                    match = re.search(
                        r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',
                        html,
                        re.S,
                    )
                    if not match:
                        raise ValueError("__NEXT_DATA__ not found")
                    payload = json.loads(match.group(1))
                    data = payload["props"]["pageProps"]["data"]
                    body = json.dumps({"data": data}).encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(body)
                    return
                except Exception as e:
                    last_error = e
                    if attempt < 2:
                        time.sleep(1.5 * (attempt + 1))
            # Fallback: return empty payload instead of 502 so the UI degrades gracefully
            body = json.dumps({"data": [], "error": str(last_error)}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

if __name__ == "__main__":
    # Threaded: the app fans out parallel proxy fetches (multi-season
    # advanced stats + multi-MB MoneyPuck CSVs); a single-threaded server
    # serializes them all and cards take forever to load.
    port = int(os.environ.get("PORT", 8000))
    server = ThreadingHTTPServer(("0.0.0.0", port), ProxyHandler)
    server.daemon_threads = True
    print(f"Running at http://0.0.0.0:{port}")
    server.serve_forever()
