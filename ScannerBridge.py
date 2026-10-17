"""
PTSS local scanner bridge (Windows prototype)
- Uses NAPS2 Console CLI for scanning through the installed scanner driver.
- Starts only on 127.0.0.1, not on the LAN.
- Configure NAPS2_PATH and NAPS2_PROFILE in environment variables if needed.

Install:
  py -m pip install flask flask-cors
Install NAPS2 from https://www.naps2.com/
Set up a scanner profile in NAPS2 first.
"""
from flask import Flask, request, send_file, jsonify, make_response
from flask_cors import CORS
from pathlib import Path
import subprocess, os, tempfile, time, threading

app = Flask(__name__)
CORS(app, origins="*", supports_credentials=False)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024

NAPS2_PATH = os.environ.get("NAPS2_PATH", r"C:\Program Files\NAPS2\NAPS2.Console.exe")
NAPS2_PROFILE = os.environ.get("200", "").strip()
SCAN_DIR = Path.home() / "Documents" / "PTSS_Scanned_PDFs"
SCAN_DIR.mkdir(parents=True, exist_ok=True)
_busy = threading.Lock()

@app.after_request
def add_private_network_headers(response):
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["Cache-Control"] = "no-store"
    return response

@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "naps2": Path(NAPS2_PATH).exists(),
        "profileConfigured": bool(NAPS2_PROFILE),
        "message": "Configure NAPS2_PROFILE and scanner profile before scanning."
    })

@app.post("/scan")
def scan():
    body = request.get_json(silent=True) or {}
    # Require the web app to send basic record context, but do not use it in a command.
    if not body.get("schoolId") or not body.get("shalarthId") or not body.get("docId"):
        return jsonify(error="शाळा, Shalarth ID आणि कागदपत्र प्रकार आवश्यक आहेत."), 400
    if not Path(NAPS2_PATH).exists():
        return jsonify(error="NAPS2.Console.exe सापडले नाही. NAPS2_PATH तपासा."), 503
    if not NAPS2_PROFILE:
        return jsonify(error="NAPS2_PROFILE सेट केलेले नाही. NAPS2 मध्ये profile तयार करून environment variable सेट करा."), 503
    if not _busy.acquire(blocking=False):
        return jsonify(error="आधीचे स्कॅन पूर्ण होईपर्यंत थांबा."), 409
    try:
        stamp = time.strftime("%Y%m%d_%H%M%S")
        out = SCAN_DIR / f"PTSS_scan_{stamp}.pdf"
        cmd = [NAPS2_PATH, "--profile", NAPS2_PROFILE, "--output", str(out), "--force", "--pagesize", "a4", "--dpi", "300"]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600, check=False)
        except subprocess.TimeoutExpired:
            return jsonify(error="स्कॅनिंगला 10 मिनिटांपेक्षा जास्त वेळ लागला."), 504
        if proc.returncode != 0 or not out.exists() or out.stat().st_size < 100:
            detail = (proc.stderr or proc.stdout or "NAPS2 scan failed")[-1200:]
            return jsonify(error="स्कॅनिंग अयशस्वी: " + detail), 500
        return send_file(out, mimetype="application/pdf", as_attachment=False, download_name=out.name, conditional=False)
    finally:
        _busy.release()

if __name__ == "__main__":
    print("PTSS Scanner Bridge listening only on http://127.0.0.1:8765")
    print("Create a NAPS2 profile and set NAPS2_PROFILE environment variable.")
    app.run(host="127.0.0.1", port=8765, debug=False)
