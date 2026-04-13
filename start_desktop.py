"""Start backend + Vite dev server, then open the app in Electron."""
import subprocess
import os
import sys
import time
import signal
import urllib.request

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(PROJECT_DIR, "backend")
FRONTEND_DIR = os.path.join(PROJECT_DIR, "frontend")
VENV_PYTHON = os.path.join(BACKEND_DIR, "venv", "bin", "python")

processes = []


def free_port(port):
    result = subprocess.run(["lsof", "-ti", f":{port}"], capture_output=True, text=True)
    pids = result.stdout.strip().split()
    for pid in pids:
        if pid:
            subprocess.run(["kill", "-9", pid], capture_output=True)
            print(f"  Freed port {port} (killed PID {pid})")
    if pids:
        time.sleep(1)


def wait_for_url(url, timeout=30):
    """Poll until the URL responds or timeout is reached."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except Exception:
            time.sleep(1)
    return False


def cleanup(sig=None, frame=None):
    print("\nShutting down...")
    for p in reversed(processes):
        try:
            p.terminate()
            p.wait(timeout=5)
        except Exception:
            p.kill()
    free_port(8000)
    free_port(5173)
    print("All processes stopped.")
    sys.exit(0)


signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)


def main():
    if not os.path.exists(VENV_PYTHON):
        print("Backend venv not found. Run this first:")
        print(f"  cd {BACKEND_DIR} && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt")
        sys.exit(1)

    # Sync Python dependencies
    print("Syncing Python dependencies...")
    subprocess.run(
        [VENV_PYTHON, "-m", "pip", "install", "-r", "requirements.txt", "-q"],
        cwd=BACKEND_DIR,
        check=True,
    )

    # Install / update frontend dependencies (includes electron devDependency)
    print("Syncing frontend dependencies...")
    subprocess.run(["npm", "install", "--silent"], cwd=FRONTEND_DIR, check=True)

    print("Checking ports...")
    free_port(8000)
    free_port(5173)

    # Start backend
    print("Starting backend on http://localhost:8000 ...")
    backend = subprocess.Popen(
        [VENV_PYTHON, "run.py"],
        cwd=BACKEND_DIR,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    processes.append(backend)
    time.sleep(3)

    if backend.poll() is not None:
        print(f"ERROR: Backend failed to start (exit code {backend.returncode})")
        sys.exit(1)

    # Start Vite dev server
    print("Starting Vite dev server on http://localhost:5173 ...")
    frontend = subprocess.Popen(
        ["npx", "vite", "--port", "5173"],
        cwd=FRONTEND_DIR,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    processes.append(frontend)

    # Wait until Vite is actually serving before launching Electron
    print("Waiting for Vite to be ready...")
    if not wait_for_url("http://localhost:5173", timeout=30):
        print("ERROR: Vite dev server did not start in time.")
        cleanup()

    # Launch Electron
    print("Launching Electron app...")
    electron = subprocess.Popen(
        ["npx", "electron", "."],
        cwd=FRONTEND_DIR,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    processes.append(electron)

    print("\n" + "=" * 50)
    print("  Retail Intelligence Platform (Desktop)")
    print("  Backend:  http://localhost:8000")
    print("  Press Ctrl+C to quit")
    print("=" * 50 + "\n")

    # Exit when Electron window is closed
    while True:
        if electron.poll() is not None:
            print("Electron window closed.")
            cleanup()
        for p in [backend, frontend]:
            if p.poll() is not None:
                print(f"A server process exited unexpectedly (code {p.returncode})")
                cleanup()
        time.sleep(1)


if __name__ == "__main__":
    main()
