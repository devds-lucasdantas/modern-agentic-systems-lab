#!/usr/bin/env python3
"""Lab 2.4C: real compiled TS resume transport against isolated pinned Runtime.

Temporary deterministic graph, isolated port, disposable Thread, no model calls,
no Git writes or pinned reference modifications.
"""
from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps/web"
REFERENCE = ROOT / ".reference/interrupt26-deepagents"
CLI = REFERENCE / ".venv/bin/langgraph"
EXPERIMENT = ROOT / "scripts/lab-24c-resume-runtime.mjs"
BASELINE = "5627b3510edf4cb9b5d7ccbf973cf1f04fe1663e"
LOG = Path(f"/tmp/masl-24c-runtime-{os.getpid()}.log")
OBS = Path(f"/tmp/masl-24c-observations-{os.getpid()}.json")

GRAPH = '''from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt

class ProbeState(TypedDict, total=False):
    request: str
    result: str

def approval(state: ProbeState) -> ProbeState:
    answer = interrupt({
        "kind": "masl_24c_hitl",
        "question": "Provide a deterministic resume value",
        "request": state.get("request"),
    })
    return {"result": f"RESUMED:{answer}"}

graph = StateGraph(ProbeState)
graph.add_node("approval", approval)
graph.add_edge(START, "approval")
graph.add_edge("approval", END)
hitl_graph = graph.compile()
'''


def request(base, method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = Request(base + path, data=data, method=method,
                  headers={"Accept": "application/json", "Content-Type": "application/json"})
    with urlopen(req, timeout=20) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def stop(process):
    if process is None or process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def main():
    assert CLI.is_file(), f"Pinned CLI missing: {CLI}"
    assert EXPERIMENT.is_file(), f"JS experiment missing: {EXPERIMENT}"
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    ancestry = subprocess.run(["git", "merge-base", "--is-ancestor", BASELINE, "HEAD"], cwd=ROOT)
    assert ancestry.returncode == 0, f"HEAD {head} does not descend from baseline {BASELINE}"

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    process = None
    tid = None
    with tempfile.TemporaryDirectory(prefix="masl-24c-run-") as temp:
        directory = Path(temp)
        graph_dir = directory / "graph"
        graph_dir.mkdir()
        (graph_dir / "graph.py").write_text(GRAPH, encoding="utf8")
        (graph_dir / "langgraph.json").write_text(json.dumps({
            "dependencies": ["."], "graphs": {"masl_24c_hitl": "./graph.py:hitl_graph"}
        }) + "\n", encoding="utf8")
        client_dir = directory / "client"
        client_dir.mkdir()
        subprocess.run([
            "pnpm", "exec", "vite", "build", "--ssr",
            "src/transport/agent-server/client.ts",
            "--outDir", str(client_dir), "--emptyOutDir",
        ], cwd=WEB, check=True, timeout=120)
        (client_dir / "package.json").write_text('{"type":"module"}\n', encoding="utf8")
        client_entry = client_dir / "client.js"
        assert client_entry.is_file(), f"Compiled client missing: {client_entry}"
        try:
            with LOG.open("wb") as log:
                process = subprocess.Popen([
                    str(CLI), "dev", "--config", "langgraph.json",
                    "--host", "127.0.0.1", "--port", str(port),
                    "--no-browser", "--no-reload", "--server-log-level", "warning",
                ], cwd=graph_dir, stdout=log, stderr=subprocess.STDOUT,
                    start_new_session=True)
            for _ in range(120):
                if process.poll() is not None:
                    raise RuntimeError(f"Runtime exited; inspect {LOG}")
                try:
                    request(base, "GET", "/openapi.json")
                    break
                except Exception:
                    time.sleep(0.5)
            else:
                raise RuntimeError(f"Runtime readiness timed out; inspect {LOG}")
            print(f"PASS: pinned deterministic Runtime ready at {base}", flush=True)
            created = request(base, "POST", "/threads", {
                "metadata": {"graph_id": "masl_24c_hitl", "lab": "2.4C"},
            })
            tid = created["thread_id"]
            path = f"/threads/{quote(tid, safe='')}"
            request(base, "POST", path + "/runs/wait", {
                "assistant_id": "masl_24c_hitl", "input": {"request": "INITIAL_24C"},
            })
            paused = request(base, "GET", path + "/state")
            assert paused["checkpoint"] is not None and paused["interrupts"], \
                "Expected persisted dynamic interrupt before resume"
            print("PASS: initial graph interrupted and checkpoint persisted", flush=True)
            subprocess.run([
                "node", str(EXPERIMENT), base, str(client_entry), tid, str(OBS),
            ], cwd=ROOT, check=True, timeout=120)
            report = json.loads(OBS.read_text(encoding="utf8"))
            assert report["lab"] == "2.4C" and all(report["checks"].values())
            print(f"PASS: {len(report['checks'])} runtime resume assertions", flush=True)
        finally:
            if tid is not None and process is not None and process.poll() is None:
                try:
                    request(base, "DELETE", f"/threads/{quote(tid, safe='')}")
                    print("PASS: disposable Thread deleted", flush=True)
                except Exception as error:
                    print(f"WARN: disposable Thread cleanup: {error}", flush=True)
            stop(process)
            print("PASS: pinned Runtime process cleaned up", flush=True)
            print(f"RUNTIME LOG: {LOG}", flush=True)


if __name__ == "__main__":
    main()
