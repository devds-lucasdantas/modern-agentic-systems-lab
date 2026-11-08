#!/usr/bin/env python3
"""Lab 2.3C: build typed client, test against a disposable pinned Runtime."""

import json
import os
import signal
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps/web"
REFERENCE = ROOT / ".reference/interrupt26-deepagents"
INTEGRATION = ROOT / "scripts/lab-23c-state-update.mjs"
LOG = Path(f"/tmp/masl-23c-runtime-{os.getpid()}.log")


def reserve_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def ready(url):
    try:
        with urlopen(url + "/openapi.json", timeout=2) as response:
            return response.status == 200
    except Exception:
        return False


def terminate_process_group(process):
    if process is None or process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def main():
    port = reserve_port()
    base = f"http://127.0.0.1:{port}"
    process = None
    with tempfile.TemporaryDirectory(prefix="masl-23c-client-") as directory:
        output = Path(directory)
        print("===== COMPILING REAL TYPESCRIPT CLIENT =====", flush=True)
        subprocess.run(
            [
                "pnpm", "exec", "vite", "build",
                "--ssr", "src/transport/agent-server/client.ts",
                "--outDir", str(output), "--emptyOutDir",
            ],
            cwd=WEB,
            check=True,
            timeout=120,
        )
        (output / "package.json").write_text(json.dumps({"type": "module"}))
        entrypoint = output / "client.js"
        if not entrypoint.is_file():
            raise RuntimeError(f"Missing SSR output: {entrypoint}")

        try:
            with LOG.open("wb") as log:
                process = subprocess.Popen(
                    [
                        "uv", "run", "--locked", "langgraph", "dev",
                        "--config", "langgraph.json",
                        "--host", "127.0.0.1", "--port", str(port),
                        "--no-browser", "--no-reload",
                        "--server-log-level", "warning",
                    ],
                    cwd=REFERENCE,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                )

            for _ in range(120):
                if process.poll() is not None:
                    raise RuntimeError(f"Runtime stopped unexpectedly; inspect {LOG}")
                if ready(base):
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError(f"Runtime readiness timeout; inspect {LOG}")
            print(f"PASS: isolated pinned Runtime ready at {base}", flush=True)

            subprocess.run(
                ["node", str(INTEGRATION), base, str(entrypoint)],
                cwd=ROOT,
                check=True,
                timeout=60,
            )
        finally:
            terminate_process_group(process)
            print("PASS: isolated Runtime process cleaned up", flush=True)


if __name__ == "__main__":
    main()
