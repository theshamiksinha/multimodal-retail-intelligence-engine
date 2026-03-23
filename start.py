"""Start both backend and frontend servers."""
import subprocess
import os
import sys
import time
import signal

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(PROJECT_DIR, "backend")
FRONTEND_DIR = os.path.join(PROJECT_DIR, "frontend")
VENV_PYTHON = os.path.join(BACKEND_DIR, "venv", "bin", "python")

processes = []


def free_port(port):
    """Kill any process occupying the given port."""
    result = subprocess.run(
        ["lsof", "-ti", f":{port}"],
        capture_output=True, text=True,
    )
    pids = result.stdout.strip().split()
    for pid in pids:
        if pid:
            subprocess.run(["kill", "-9", pid], capture_output=True)
            print(f"  Freed port {port} (killed PID {pid})")
    if pids:
        time.sleep(1)


def cleanup(sig=None, frame=None):
    print("\nShutting down...")
    for p in processes:
        try:
            p.terminate()
            p.wait(timeout=5)
        except Exception:
            p.kill()
    # Also free the ports to be safe
    free_port(8000)
    free_port(5173)
    print("All servers stopped.")
    sys.exit(0)


signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)


def main():
    # Check venv exists
    if not os.path.exists(VENV_PYTHON):
        print("Backend venv not found. Run this first:")
        print(f"  cd {BACKEND_DIR} && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt")
        sys.exit(1)

    # Check node_modules exists
    if not os.path.exists(os.path.join(FRONTEND_DIR, "node_modules")):
        print("Frontend dependencies not installed. Run this first:")
        print(f"  cd {FRONTEND_DIR} && npm install")
        sys.exit(1)

    # Free ports before starting
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

    # Check backend actually started
    if backend.poll() is not None:
        print(f"ERROR: Backend failed to start (exit code {backend.returncode})")
        sys.exit(1)

    # Start frontend
    print("Starting frontend on http://localhost:5173 ...")
    frontend = subprocess.Popen(
        ["npx", "vite", "--port", "5173"],
        cwd=FRONTEND_DIR,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    processes.append(frontend)
    time.sleep(2)

    print("\n" + "=" * 50)
    print("  Retail Intelligence Platform is running!")
    print("  Frontend: http://localhost:5173")
    print("  Backend:  http://localhost:8000")
    print("  Press Ctrl+C to stop both servers")
    print("=" * 50 + "\n")

    # Wait for either process to exit
    while True:
        for p in processes:
            if p.poll() is not None:
                print(f"Process exited with code {p.returncode}")
                cleanup()
        time.sleep(1)


if __name__ == "__main__":
    main()
