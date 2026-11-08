#!/usr/bin/env python3
"""Lab 2.3D: real typed client and checkpoint-selected writes on isolated Runtime.

No model calls, tracked repository modification, or automatic git operations.
"""

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
EXPERIMENT = ROOT / "scripts/lab-23d-checkpoint-aware.mjs"
LOG = Path(f"/tmp/masl-23d-runtime-{os.getpid()}.log")
OBSERVATIONS = Path(f"/tmp/masl-23d-observations-{os.getpid()}.json")


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
    if not REFERENCE.is_dir():
        raise RuntimeError(f"Pinned reference not found: {REFERENCE}")
    if not EXPERIMENT.is_file():
        raise RuntimeError(f"Node experiment not found: {EXPERIMENT}")

    port = reserve_port()
    base = f"http://127.0.0.1:{port}"
    process = None
    with tempfile.TemporaryDirectory(prefix="masl-23d-client-") as directory:
        output = Path(directory)
        print("===== COMPILING PINNED FRONTEND CLIENT =====", flush=True)
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
            raise RuntimeError(f"Compiled client missing: {entrypoint}")

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
                    raise RuntimeError(f"Pinned Runtime exited; inspect {LOG}")
                if ready(base):
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError(f"Runtime readiness timed out; inspect {LOG}")
            print(f"PASS: isolated pinned Runtime ready at {base}", flush=True)

            subprocess.run(
                ["node", str(EXPERIMENT), base, str(entrypoint), str(OBSERVATIONS)],
                cwd=ROOT,
                check=True,
                timeout=90,
            )
            print(f"OBSERVATIONS: {OBSERVATIONS}", flush=True)
        finally:
            terminate_process_group(process)
            print("PASS: isolated Runtime process cleaned up", flush=True)


if __name__ == "__main__":
    main()
