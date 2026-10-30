import os
import json
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
LOGS = ROOT / "logs"
LOGS.mkdir(exist_ok=True)
LOG_FILES = ("backend.log", "backend-error.log", "frontend.log", "frontend-error.log")


def load_env() -> dict[str, str]:
    env = os.environ.copy()
    env_file = ROOT / ".env"
    if not env_file.exists():
        return env

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.4)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def http_ok(url: str, seconds: int = 30) -> bool:
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=2) as response:
                if 200 <= response.status < 500:
                    return True
        except Exception:
            time.sleep(0.7)
    return False


def rotate_log_files(log_dir: Path = LOGS, max_bytes: int = 512_000, backups: int = 3) -> None:
    log_dir.mkdir(exist_ok=True)
    for name in LOG_FILES:
        log_file = log_dir / name
        if not log_file.exists() or log_file.stat().st_size <= max_bytes:
            continue

        oldest = log_dir / f"{name}.{backups}"
        if oldest.exists():
            oldest.unlink()

        for index in range(backups - 1, 0, -1):
            source = log_dir / f"{name}.{index}"
            if source.exists():
                source.rename(log_dir / f"{name}.{index + 1}")

        log_file.rename(log_dir / f"{name}.1")
        log_file.write_text("", encoding="utf-8")


def api_is_current(port: int) -> bool:
    try:
        with urlopen(f"http://127.0.0.1:{port}/openapi.json", timeout=2) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception:
        return False

    script_response = data.get("components", {}).get("schemas", {}).get("ScriptResponse", {})
    return "source" in script_response.get("properties", {})


def choose_backend_port() -> int:
    """Keep the frontend/backend contract stable across restarts."""
    if port_open(8000) and not api_is_current(8000):
        raise RuntimeError(
            "Port 8000 is occupied by another service. Stop that service, then run start-project.py again."
        )
    return 8000


def spawn(name: str, command: list[str], cwd: Path, env: dict[str, str]) -> None:
    stdout = open(LOGS / f"{name}.log", "a", encoding="utf-8")
    stderr = open(LOGS / f"{name}-error.log", "a", encoding="utf-8")
    flags = 0
    if os.name == "nt":
        flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        flags |= getattr(subprocess, "CREATE_BREAKAWAY_FROM_JOB", 0)
    try:
        subprocess.Popen(command, cwd=cwd, env=env, stdout=stdout, stderr=stderr, creationflags=flags)
    except PermissionError:
        fallback_flags = 0
        if os.name == "nt":
            fallback_flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        subprocess.Popen(command, cwd=cwd, env=env, stdout=stdout, stderr=stderr, creationflags=fallback_flags)


def main() -> int:
    rotate_log_files()
    env = load_env()
    backend_port = choose_backend_port()
    env["VITE_API_BASE"] = f"http://127.0.0.1:{backend_port}/api"

    if not port_open(backend_port):
        spawn(
            "backend",
            [
                sys.executable,
                "-m",
                "uvicorn",
                "backend.app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(backend_port),
            ],
            ROOT,
            env,
        )

    if not port_open(5173):
        spawn(
            "frontend",
            ["cmd.exe", "/c", "npm.cmd", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
            ROOT / "frontend",
            env,
        )

    backend_ready = http_ok(f"http://127.0.0.1:{backend_port}/api/health/")
    frontend_ready = http_ok("http://127.0.0.1:5173/")

    print()
    print(f"Backend:  http://127.0.0.1:{backend_port}/docs")
    print("Frontend: http://127.0.0.1:5173/")
    print(f"Frontend API: http://127.0.0.1:{backend_port}/api")
    print(f"Backend ready:  {backend_ready}")
    print(f"Frontend ready: {frontend_ready}")
    print(f"Logs: {LOGS}")
    print()

    return 0 if backend_ready and frontend_ready else 1


if __name__ == "__main__":
    raise SystemExit(main())
