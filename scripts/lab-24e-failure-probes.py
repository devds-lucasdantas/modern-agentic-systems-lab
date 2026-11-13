#!/usr/bin/env python3
"""Lab 2.4E, discovery gate: disposable, model-free failure/race experiments.

The probes deliberately *observe* rather than assert universal server race
semantics. Every write targets a new Thread on a temporary pinned dev server.
They do not edit the pinned reference or the application, and do not call models.
"""
from __future__ import annotations

import json
import os
import runpy
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / '.reference/interrupt26-deepagents/.venv/bin/langgraph'
GRAPH_REFERENCE = ROOT / 'scripts/lab-24a-interrupt-contracts.py'
EXPERIMENT_JS = ROOT / 'scripts/lab-24e-failure-client.mjs'
WEB = ROOT / 'apps/web'
BASELINE = '6fb8e0fbcb441a6c736f7227a1e83f7d7294a41a'
LOG = Path(f'/tmp/masl-24e-runtime-{os.getpid()}.log')
OBS = Path(f'/tmp/masl-24e-observations-{os.getpid()}.json')

GRAPH_SOURCE = '''from typing import TypedDict
import time
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt

class ProbeState(TypedDict, total=False):
    request: str
    first: str
    second: str
    result: str

def first(state: ProbeState) -> ProbeState:
    answer = interrupt({"kind": "masl_24e_first", "question": "First gate?"})
    return {"first": str(answer)}

def second(state: ProbeState) -> ProbeState:
    answer = interrupt({"kind": "masl_24e_second", "question": "Second gate?"})
    return {"second": str(answer)}

def once(state: ProbeState) -> ProbeState:
    answer = interrupt({"kind": "masl_24e_once", "question": "Proceed once?"})
    return {"result": "RESUMED:" + str(answer)}

def slow(state: ProbeState) -> ProbeState:
    answer = interrupt({"kind": "masl_24e_slow", "question": "Proceed slowly?"})
    time.sleep(1.2)
    return {"result": "RESUMED:" + str(answer)}

def single(node_name, node):
    graph = StateGraph(ProbeState)
    graph.add_node(node_name, node)
    graph.add_edge(START, node_name)
    graph.add_edge(node_name, END)
    return graph.compile()

once_graph = single("once", once)
slow_graph = single("slow", slow)
chain = StateGraph(ProbeState)
chain.add_node("first", first)
chain.add_node("second", second)
chain.add_edge(START, "first")
chain.add_edge("first", "second")
chain.add_edge("second", END)
chain_graph = chain.compile()
'''


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def stop(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def request(base: str, method: str, path: str, body=None, timeout=20) -> dict | list | None:
    payload = json.dumps(body).encode('utf-8') if body is not None else None
    req = Request(base + path, method=method, data=payload, headers={
        'Accept': 'application/json',
        **({'Content-Type': 'application/json'} if body is not None else {}),
    })
    with urlopen(req, timeout=timeout) as response:
        data = response.read()
        return json.loads(data) if data else None


def wire_attempt(base: str, method: str, path: str, body: dict) -> dict:
    """Preserve observed 4xx/5xx without prematurely treating it as success."""
    try:
        result = request(base, method, path, body, timeout=25)
        return {'outcome': 'accepted', 'responseType': type(result).__name__}
    except HTTPError as error:
        data = error.read().decode('utf-8', errors='replace')
        return {'outcome': 'http-error', 'status': error.code, 'responseExcerpt': data[:350]}
    except Exception as error:
        return {'outcome': 'transport-error', 'type': type(error).__name__, 'message': str(error)[:200]}


def checkpoint(state: dict) -> str | None:
    cp = state.get('checkpoint') or {}
    return cp.get('checkpoint_id')


def summary(state: dict) -> dict:
    values = state.get('values') or {}
    if not isinstance(values, dict):
        values = {}
    return {'checkpointId': checkpoint(state), 'next': state.get('next', []),
            'interruptCount': len(state.get('interrupts') or []),
            'result': values.get('result'), 'first': values.get('first'),
            'second': values.get('second')}


def get_runs(base: str, thread: str) -> list[dict]:
    result = request(base, 'GET', f'/threads/{quote(thread, safe="")}/runs')
    require(isinstance(result, list), 'Run listing must be an array')
    return result


def read_state(base: str, thread: str) -> dict:
    result = request(base, 'GET', f'/threads/{quote(thread, safe="")}/state')
    require(isinstance(result, dict), 'ThreadState must be an object')
    return result


def create_paused(base: str, graph: str, threads: list[str]) -> tuple[str, str, dict]:
    created = request(base, 'POST', '/threads', {'metadata': {
        'graph_id': graph, 'lab': '2.4E', 'purpose': graph,
    }})
    require(isinstance(created, dict) and isinstance(created.get('thread_id'), str), 'Thread creation failed')
    thread = created['thread_id']
    threads.append(thread)
    path = f'/threads/{quote(thread, safe="")}'
    request(base, 'POST', path + '/runs/wait', {
        'assistant_id': graph, 'input': {'request': 'INITIAL_24E'},
    }, timeout=40)
    state = read_state(base, thread)
    runs = get_runs(base, thread)
    require(checkpoint(state) is not None and len(state.get('interrupts') or []) == 1,
            'Expected initial persistent interrupt')
    require(len(runs) == 1 and runs[0]['status'] == 'success',
            'Expected one completed initial Run')
    assistant_id = runs[0]['assistant_id']
    require(isinstance(assistant_id, str) and assistant_id, 'Canonical Assistant missing')
    return thread, assistant_id, state


def resume_body(assistant_id: str, value: str) -> dict:
    return {'assistant_id': assistant_id, 'input': {},
            'command': {'resume': value}, 'multitask_strategy': 'reject'}


def await_runs(base: str, thread: str, timeout=20) -> list[dict]:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        runs = get_runs(base, thread)
        if all(r.get('status') not in ('pending', 'running') for r in runs):
            return runs
        time.sleep(0.2)
    raise RuntimeError('Run listing did not settle before bounded timeout')


def sequential_interrupt_probe(base: str, threads: list[str]) -> dict:
    thread, assistant, pause = create_paused(base, 'masl_24e_chain', threads)
    path = f'/threads/{quote(thread, safe="")}'
    response = wire_attempt(base, 'POST', path + '/runs/wait', resume_body(assistant, 'FIRST_24E'))
    runs = await_runs(base, thread)
    after = read_state(base, thread)
    view = summary(after)
    require(response['outcome'] == 'accepted', 'First resume must be accepted')
    require(len(runs) == 2 and all(run['status'] == 'success' for run in runs),
            'Expected two successful Runs after first resume')
    require(view['interruptCount'] == 1 and 'second' in view['next'] and view['second'] is None,
            'Success of second Run must coexist with a new persisted interrupt')
    print('PASS: a successful resume Run still left the graph interrupted at gate two', flush=True)
    return {'before': summary(pause), 'after': view, 'runStatuses': [r['status'] for r in runs],
            'checks': {'twoSuccessfulRuns': True, 'graphStillInterrupted': True,
                       'secondDynamicInterruptPersisted': True}}


def duplicate_after_end_probe(base: str, threads: list[str]) -> dict:
    thread, assistant, pause = create_paused(base, 'masl_24e_once', threads)
    path = f'/threads/{quote(thread, safe="")}'
    first = wire_attempt(base, 'POST', path + '/runs/wait', resume_body(assistant, 'FIRST_24E'))
    require(first['outcome'] == 'accepted', 'Initial legitimate resume was rejected')
    first_state = read_state(base, thread)
    require(summary(first_state)['result'] == 'RESUMED:FIRST_24E', 'Initial resume did not finish graph')
    before_count = len(get_runs(base, thread))
    # Deliberately model a duplicate/stale second human request on a disposable Thread.
    duplicate = wire_attempt(base, 'POST', path + '/runs/wait', resume_body(assistant, 'DUPLICATE_24E'))
    runs = await_runs(base, thread)
    after = summary(read_state(base, thread))
    print(f'OBSERVED: duplicate post-END resume -> {duplicate["outcome"]}, Runs {before_count}->{len(runs)}', flush=True)
    return {'before': summary(pause), 'afterFirstResume': summary(first_state),
            'duplicateAttempt': duplicate, 'afterDuplicate': after,
            'runCountBeforeDuplicate': before_count, 'runCountAfterDuplicate': len(runs),
            'runStatuses': [r.get('status') for r in runs]}


def concurrent_probe(base: str, threads: list[str]) -> dict:
    thread, assistant, pause = create_paused(base, 'masl_24e_slow', threads)
    path = f'/threads/{quote(thread, safe="")}'
    barrier = threading.Barrier(3)

    def post(value: str) -> dict:
        barrier.wait(timeout=10)
        return wire_attempt(base, 'POST', path + '/runs', resume_body(assistant, value))

    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(post, 'CONCURRENT_A_24E')
        b = pool.submit(post, 'CONCURRENT_B_24E')
        barrier.wait(timeout=10)
        attempts = [a.result(timeout=30), b.result(timeout=30)]
    runs = await_runs(base, thread, timeout=30)
    final = summary(read_state(base, thread))
    print('OBSERVED: concurrent reject-strategy attempts -> ' +
          ', '.join(x['outcome'] + (f" {x.get('status')}" if x.get('status') else '') for x in attempts), flush=True)
    return {'before': summary(pause), 'attempts': attempts,
            'after': final, 'runCount': len(runs),
            'runStatuses': [r.get('status') for r in runs]}


def lost_response_probe(base: str, threads: list[str], client_entry: Path) -> dict:
    thread, assistant, pause = create_paused(base, 'masl_24e_once', threads)
    result = subprocess.run([
        'node', str(EXPERIMENT_JS), base, str(client_entry), thread, assistant,
    ], cwd=ROOT, text=True, capture_output=True, timeout=90)
    if result.returncode != 0:
        raise RuntimeError('Lost-response client experiment failed: ' +
                           (result.stdout + result.stderr)[-2500:])
    obj = json.loads(result.stdout.strip().splitlines()[-1])
    require(obj.get('postAttempts') == 1 and obj.get('caughtTypeError') is True,
            'Client must report exactly one attempt and ambiguous lost response')
    require(obj.get('finalResult') == 'RESUMED:LOST_RESPONSE_24E' and obj.get('runCount') == 2,
            'Server must have accepted write despite simulated response loss')
    require(obj.get('interruptCount') == 0 and obj.get('next') == [],
            'Independent read must show graph END')
    print('PASS: injected response loss yielded ambiguous client error; independent GET established server commit', flush=True)
    return {'before': summary(pause), 'after': obj,
            'checks': {'onePost': True, 'clientSeesError': True,
                       'serverPersistedResume': True, 'manualReadbackResolvedAmbiguity': True}}


def main() -> None:
    require(CLI.is_file() and GRAPH_REFERENCE.is_file() and EXPERIMENT_JS.is_file(),
            'Pinned CLI, reference, or JS probe is missing')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    require(head == BASELINE, f'Expected exact baseline {BASELINE}; got {head}')
    # Only reads from the existing deterministic lab; never alters it.
    require('GRAPH_SOURCE' in runpy.run_path(str(GRAPH_REFERENCE)), 'Original graph reference is unavailable')
    report = {'lab': '2.4E-discovery', 'baseline': BASELINE,
              'scope': 'temporary pinned Runtime, disposable Threads, no models',
              'sequentialInterrupt': None, 'duplicateAfterEnd': None,
              'concurrentResume': None, 'lostResponse': None}
    process = None
    threads: list[str] = []
    runtime_port = port()
    base = f'http://127.0.0.1:{runtime_port}'
    # The Runtime writes graph/.langgraph_api during graceful shutdown.
    # Never delete its workspace before the process has fully exited.
    temporary = tempfile.TemporaryDirectory(prefix='masl-24e-discovery-')
    try:
        work = Path(temporary.name)
        graph = work / 'graph'
        graph.mkdir()
        (graph / 'graph.py').write_text(GRAPH_SOURCE, encoding='utf-8')
        (graph / 'langgraph.json').write_text(json.dumps({
            'dependencies': ['.'],
            'graphs': {'masl_24e_once': './graph.py:once_graph',
                       'masl_24e_slow': './graph.py:slow_graph',
                       'masl_24e_chain': './graph.py:chain_graph'},
        }) + '\n', encoding='utf-8')
        client_dir = work / 'client'
        client_dir.mkdir()
        subprocess.run(['pnpm', 'exec', 'vite', 'build', '--ssr',
                        'src/transport/agent-server/client.ts', '--outDir', str(client_dir),
                        '--emptyOutDir'], cwd=WEB, check=True, timeout=120)
        (client_dir / 'package.json').write_text('{"type":"module"}\n', encoding='utf-8')
        entry = client_dir / 'client.js'
        require(entry.is_file(), 'Compiled client not found')
        with LOG.open('wb') as output:
            process = subprocess.Popen([
                str(CLI), 'dev', '--config', 'langgraph.json',
                '--host', '127.0.0.1', '--port', str(runtime_port),
                '--no-browser', '--no-reload', '--server-log-level', 'warning',
            ], cwd=graph, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        for _ in range(120):
            require(process.poll() is None, f'Runtime exited; inspect {LOG}')
            try:
                request(base, 'GET', '/openapi.json', timeout=2)
                break
            except (OSError, ValueError, URLError):
                time.sleep(.5)
        else:
            raise RuntimeError(f'Runtime readiness timeout; inspect {LOG}')
        print('PASS: pinned model-free Runtime ready at ' + base, flush=True)
        report['sequentialInterrupt'] = sequential_interrupt_probe(base, threads)
        report['duplicateAfterEnd'] = duplicate_after_end_probe(base, threads)
        report['concurrentResume'] = concurrent_probe(base, threads)
        report['lostResponse'] = lost_response_probe(base, threads, entry)
        OBS.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print('PASS: observations recorded at ' + str(OBS), flush=True)
        print('PASS: 4 probes: 2 validated invariants; 2 descriptive Runtime behaviors', flush=True)
        print(json.dumps({
            'sequentialInterrupt': report['sequentialInterrupt']['checks'],
            'duplicateAfterEnd': report['duplicateAfterEnd']['duplicateAttempt'],
            'concurrentResume': report['concurrentResume']['attempts'],
            'lostResponse': report['lostResponse']['checks'],
        }, indent=2), flush=True)
    finally:
        for thread in reversed(threads):
            try:
                if process is not None and process.poll() is None:
                    request(base, 'DELETE', f'/threads/{quote(thread, safe="")}', timeout=8)
                    print('PASS: disposable Thread deleted', flush=True)
            except Exception as error:
                print('WARN: disposable Thread cleanup: ' + str(error)[:180], flush=True)
        try:
            stop(process)
        finally:
            temporary.cleanup()
        print('PASS: pinned Runtime process cleaned up', flush=True)
        print('RUNTIME LOG: ' + str(LOG), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('FAIL: ' + str(error), file=sys.stderr, flush=True)
        raise
