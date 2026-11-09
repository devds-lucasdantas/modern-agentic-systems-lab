#!/usr/bin/env python3
"""Lab 2.4A: model-free Graph HITL and breakpoint contract discovery.

Uses the pinned workshop's installed langgraph CLI, but a disposable /tmp
project and isolated Runtime. It does not modify the pinned reference,
create model calls, or perform Git operations.
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
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / ".reference/interrupt26-deepagents"
PINNED_CLI = REFERENCE / ".venv/bin/langgraph"
BASELINE = "1be6f860bda61e638a21872e28aaf9dc8fc2b44f"
LOG = Path(f"/tmp/masl-24a-runtime-{os.getpid()}.log")
OBS = Path(f"/tmp/masl-24a-observations-{os.getpid()}.json")
GRAPH_SOURCE = '''from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt

class ProbeState(TypedDict, total=False):
    request: str
    result: str

def approval(state: ProbeState) -> ProbeState:
    answer = interrupt({
        "kind": "masl_24a_hitl",
        "question": "Approve the deterministic probe?",
        "request": state.get("request"),
    })
    return {"result": f"RESUMED:{answer}"}

def checkpoint_only(state: ProbeState) -> ProbeState:
    return {"result": "BREAKPOINT_EXECUTED"}

hitl = StateGraph(ProbeState)
hitl.add_node("approval", approval)
hitl.add_edge(START, "approval")
hitl.add_edge("approval", END)
hitl_graph = hitl.compile()

breakpoint = StateGraph(ProbeState)
breakpoint.add_node("checkpoint_only", checkpoint_only)
breakpoint.add_edge(START, "checkpoint_only")
breakpoint.add_edge("checkpoint_only", END)
breakpoint_graph = breakpoint.compile()
'''


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise AssertionError(reason)


def request(base: str, method: str, path: str, data=None):
    payload = json.dumps(data).encode() if data is not None else None
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = Request(base + path, method=method, data=payload, headers=headers)
    try:
        with urlopen(req, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path}: HTTP {error.code}: {body[:1500]}") from error


def retry_readiness(base: str, process: subprocess.Popen) -> dict:
    for _ in range(120):
        if process.poll() is not None:
            raise RuntimeError(f"Pinned Runtime exited early. Inspect {LOG}")
        try:
            return request(base, "GET", "/openapi.json")
        except (OSError, RuntimeError, ValueError, URLError):
            time.sleep(0.5)
    raise RuntimeError(f"Pinned Runtime did not become ready. Inspect {LOG}")


def terminate(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def schema_inventory(spec: dict) -> dict:
    paths = spec.get("paths", {})
    schemas = spec.get("components", {}).get("schemas", {})
    require(isinstance(paths, dict), "OpenAPI has no paths object")
    require(isinstance(schemas, dict), "OpenAPI has no schemas object")
    endpoint_keys = [
        ("GET", "/threads/{thread_id}/state"),
        ("POST", "/threads/{thread_id}/runs/wait"),
        ("POST", "/threads/{thread_id}/runs/{run_id}/cancel"),
    ]
    endpoints = {}
    for method, route in endpoint_keys:
        endpoints[f"{method} {route}"] = method.lower() in paths.get(route, {})
    require(endpoints["GET /threads/{thread_id}/state"], "GET ThreadState endpoint missing")
    require(endpoints["POST /threads/{thread_id}/runs/wait"], "Run wait endpoint missing")
    # The cancel endpoint is inventoried, not required for the dynamic HITL probe.
    found_schemas = {}
    for name in ("Command", "Interrupt", "ThreadState", "RunCreate"):
        found = schemas.get(name)
        if not isinstance(found, dict):
            found_schemas[name] = None
            continue
        found_schemas[name] = {
            "properties": sorted(found.get("properties", {}).keys()),
            "required": sorted(found.get("required", [])),
        }
    require(found_schemas["Command"] is not None, "OpenAPI Command schema missing")
    require("resume" in found_schemas["Command"]["properties"], "Command.resume missing")
    require(found_schemas["Interrupt"] is not None, "OpenAPI Interrupt schema missing")
    require("value" in found_schemas["Interrupt"]["properties"], "Interrupt.value missing")
    return {"endpoints": endpoints, "schemas": found_schemas}


def state_summary(state: dict) -> dict:
    checkpoint = state.get("checkpoint") or {}
    interrupts = state.get("interrupts") or []
    tasks = state.get("tasks") or []
    nested = [intr for task in tasks for intr in (task.get("interrupts") or [])]
    return {
        "checkpointId": checkpoint.get("checkpoint_id"),
        "next": state.get("next", []),
        "topLevelInterrupts": interrupts,
        "taskInterrupts": nested,
        "taskNames": [t.get("name") for t in tasks],
        "values": state.get("values"),
    }


def run_list(base: str, thread: str) -> list[dict]:
    runs = request(base, "GET", f"/threads/{quote(thread, safe='')}/runs")
    require(isinstance(runs, list), "Run list must be an array")
    return runs


def create_thread(base: str, graph_id: str, purpose: str) -> str:
    created = request(base, "POST", "/threads", {
        "metadata": {"graph_id": graph_id, "lab": "2.4A", "purpose": purpose},
    })
    tid = created.get("thread_id")
    require(isinstance(tid, str) and bool(tid), "New Thread ID missing")
    return tid


def get_state(base: str, tid: str) -> dict:
    state = request(base, "GET", f"/threads/{quote(tid, safe='')}/state")
    require(isinstance(state, dict), "ThreadState not an object")
    return state


def get_thread(base: str, tid: str) -> dict:
    obj = request(base, "GET", f"/threads/{quote(tid, safe='')}")
    require(isinstance(obj, dict), "Thread not an object")
    return obj


def wait_run(base: str, tid: str, body: dict):
    return request(base, "POST", f"/threads/{quote(tid, safe='')}/runs/wait", body)


def dynamic_hitl_probe(base: str, tids: list[str]) -> dict:
    tid = create_thread(base, "masl_24a_hitl", "dynamic-interrupt-resume")
    tids.append(tid)
    require(len(run_list(base, tid)) == 0, "Disposable HITL Thread already had Runs")
    wait_run(base, tid, {
        "assistant_id": "masl_24a_hitl",
        "input": {"request": "INITIAL_24A"},
    })
    paused = get_state(base, tid)
    paused_thread = get_thread(base, tid)
    first_runs = run_list(base, tid)
    paused_view = state_summary(paused)
    interrupts = paused_view["topLevelInterrupts"] or paused_view["taskInterrupts"]
    require(len(interrupts) >= 1, "Expected a persisted resumable graph interrupt")
    first_interrupt = interrupts[0]
    require(isinstance(first_interrupt, dict), "Interrupt shape must be object")
    value = first_interrupt.get("value")
    require(isinstance(value, dict), "Dynamic interrupt value must be an object")
    require(value.get("kind") == "masl_24a_hitl", "Unexpected interrupt payload")
    require(bool(paused_view["next"]), "Paused graph must have pending nodes")
    require(len(first_runs) == 1, "Initial HITL execution must create one Run")
    print(f"OBSERVED: dynamic interrupt -> Thread={paused_thread.get('status')}, Run={first_runs[0].get('status')}, next={paused_view['next']}", flush=True)

    wait_run(base, tid, {
        "assistant_id": "masl_24a_hitl",
        "input": {},
        "command": {"resume": "APPROVE_24A"},
    })
    resumed = get_state(base, tid)
    resumed_thread = get_thread(base, tid)
    after_runs = run_list(base, tid)
    resumed_view = state_summary(resumed)
    values = resumed_view.get("values") or {}
    require(isinstance(values, dict), "Resumed values must be an object")
    require(values.get("result") == "RESUMED:APPROVE_24A", "Command.resume did not reach graph")
    require(not resumed_view["topLevelInterrupts"] and not resumed_view["taskInterrupts"],
            "Interrupts remained after successful resume")
    require(not resumed_view["next"], "Graph must reach END after resume")
    require(len(after_runs) == 2, "Resume must create a second persistent Run")
    require(len({x.get("run_id") for x in after_runs}) == 2, "Resume Runs need distinct Run IDs")
    print(f"PASS: dynamic HITL resumed -> Thread={resumed_thread.get('status')}, Runs={len(after_runs)}, END", flush=True)
    return {
        "pause": {"threadStatus": paused_thread.get("status"), "runStatuses": [x.get("status") for x in first_runs], "state": paused_view},
        "resume": {"threadStatus": resumed_thread.get("status"), "runStatuses": [x.get("status") for x in after_runs], "state": resumed_view},
        "checks": {"interruptPersisted": True, "resumeValueReachedGraph": True,
                   "secondRunCreated": True, "endReached": True},
    }


def breakpoint_probe(base: str, tids: list[str]) -> dict:
    tid = create_thread(base, "masl_24a_breakpoint", "execution-breakpoint-vs-hitl")
    tids.append(tid)
    wait_run(base, tid, {
        "assistant_id": "masl_24a_breakpoint",
        "input": {"request": "BREAKPOINT_24A"},
        "interrupt_before": ["checkpoint_only"],
    })
    paused = get_state(base, tid)
    thread = get_thread(base, tid)
    runs = run_list(base, tid)
    view = state_summary(paused)
    require("checkpoint_only" in view["next"], "Breakpoint did not pause before node")
    require(not view["topLevelInterrupts"] and not view["taskInterrupts"],
            "Execution breakpoint unexpectedly emitted a dynamic HITL payload")
    require((view.get("values") or {}).get("result") is None,
            "Breakpoint node executed before interruption")
    require(len(runs) == 1, "Breakpoint must create one Run")
    print(f"PASS: execution breakpoint -> Thread={thread.get('status')}, next={view['next']}, no HITL payload", flush=True)
    return {
        "pause": {"threadStatus": thread.get("status"), "runStatus": runs[0].get("status"), "state": view},
        "checks": {"pausedBeforeNode": True, "noDynamicInterruptPayload": True},
    }


def run_probes(base: str, spec: dict) -> dict:
    result = {"lab": "2.4A", "openapi": schema_inventory(spec), "dynamicHitl": None, "executionBreakpoint": None}
    threads: list[str] = []
    primary_error: Exception | None = None
    try:
        result["dynamicHitl"] = dynamic_hitl_probe(base, threads)
        result["executionBreakpoint"] = breakpoint_probe(base, threads)
        return result
    except Exception as error:
        primary_error = error
        raise
    finally:
        for tid in reversed(threads):
            try:
                request(base, "DELETE", f"/threads/{quote(tid, safe='')}")
                print("PASS: disposable Thread deleted", flush=True)
            except Exception as error:
                print(f"WARN: unable to delete disposable Thread: {error}", flush=True)
                if primary_error is None:
                    raise


def main() -> None:
    require(REFERENCE.is_dir(), f"Pinned reference missing: {REFERENCE}")
    require(PINNED_CLI.is_file(), f"Pinned CLI missing: {PINNED_CLI}")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    completed = subprocess.run(["git", "merge-base", "--is-ancestor", BASELINE, "HEAD"],
                               cwd=ROOT, check=False)
    require(completed.returncode == 0, f"Repository HEAD {head} is not a descendant of {BASELINE}")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    process = None
    with tempfile.TemporaryDirectory(prefix="masl-24a-graph-") as temp:
        target = Path(temp)
        (target / "graph.py").write_text(GRAPH_SOURCE, encoding="utf-8")
        (target / "langgraph.json").write_text(json.dumps({
            "dependencies": ["."],
            "graphs": {
                "masl_24a_hitl": "./graph.py:hitl_graph",
                "masl_24a_breakpoint": "./graph.py:breakpoint_graph",
            },
        }, indent=2) + "\n", encoding="utf-8")
        try:
            with LOG.open("wb") as log:
                process = subprocess.Popen([
                    str(PINNED_CLI), "dev", "--config", "langgraph.json",
                    "--host", "127.0.0.1", "--port", str(port),
                    "--no-browser", "--no-reload", "--server-log-level", "warning",
                ], cwd=target, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            spec = retry_readiness(base, process)
            print(f"PASS: temporary model-free graph Runtime ready at {base}", flush=True)
            report = run_probes(base, spec)
            OBS.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print("===== LAB 2.4A OBSERVED SEMANTICS =====", flush=True)
            print(json.dumps({
                "commandResumeSchema": "resume" in report["openapi"]["schemas"]["Command"]["properties"],
                "interruptValueSchema": "value" in report["openapi"]["schemas"]["Interrupt"]["properties"],
                "hitlChecks": report["dynamicHitl"]["checks"],
                "breakpointChecks": report["executionBreakpoint"]["checks"],
            }, indent=2), flush=True)
            print(f"PASS: observations saved to {OBS}", flush=True)
        finally:
            terminate(process)
            print("PASS: isolated Runtime process cleaned up", flush=True)
            print(f"RUNTIME LOG: {LOG}", flush=True)


if __name__ == "__main__":
    main()
