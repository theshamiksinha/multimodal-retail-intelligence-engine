"""Stop all running backend and frontend servers."""
import subprocess
import time


def free_port(port):
    """Kill any process occupying the given port."""
    result = subprocess.run(
        ["lsof", "-ti", f":{port}"],
        capture_output=True, text=True,
    )
    pids = result.stdout.strip().split()
    killed = False
    for pid in pids:
        if pid:
            subprocess.run(["kill", "-9", pid], capture_output=True)
            print(f"Killed PID {pid} on port {port}")
            killed = True
    return killed


def main():
    # Kill by process name
    subprocess.run(["pkill", "-9", "-f", "uvicorn"], capture_output=True)
    subprocess.run(["pkill", "-9", "-f", "vite"], capture_output=True)
    time.sleep(1)

    # Kill by port
    b = free_port(8000)
    f = free_port(5173)

    if b or f:
        print("Servers stopped.")
    else:
        print("No servers were running.")


if __name__ == "__main__":
    main()
