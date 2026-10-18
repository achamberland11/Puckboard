import os
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
