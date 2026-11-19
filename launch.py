"""Start the local application and open it once it responds."""
import os
from pathlib import Path
import socket
import threading
import time
import urllib.request
import webbrowser
import uvicorn

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT / "backend")
import sys
sys.path.insert(0, str(ROOT / "backend"))

if not (ROOT / "frontend/dist/index.html").is_file():
    raise SystemExit("Frontend build missing. Run: cd frontend && npm ci && npm run build")

# Choose a free loopback port so another local app cannot block startup.
with socket.socket() as probe:
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
url = f"http://127.0.0.1:{port}"

def open_when_ready():
    for _ in range(120):
        try:
            with urllib.request.urlopen(url + "/api/stats", timeout=1) as response:
                if response.status == 200:
                    webbrowser.open(url)
                    return
        except OSError:
            time.sleep(0.5)

threading.Thread(target=open_when_ready, daemon=True).start()
print(f"100 Bal AI: {url}\nKeep this window open. Ctrl+C stops the server.", flush=True)
uvicorn.run("main:app", host="127.0.0.1", port=port)
