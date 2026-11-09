#!/usr/bin/env python3
"""Run 2.4D Chromium tests with model-free temporary graphs on pinned LangGraph Runtime.

No Git writes, no model calls, no changes to .reference. Existing 2.2/2.3
browser test configuration is untouched.
"""
from __future__ import annotations

import json
import os
import runpy
import signal
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/web'
PINNED_CLI = ROOT / '.reference/interrupt26-deepagents/.venv/bin/langgraph'
LAB_24A = ROOT / 'scripts/lab-24a-interrupt-contracts.py'
BASELINE = '16a0e07247f3f8c94933c82b4f28f452d556c0df'
LOG = Path(f'/tmp/masl-24d-runtime-{os.getpid()}.log')


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


def main() -> None:
    assert PINNED_CLI.is_file() and LAB_24A.is_file(), 'Pinned Runtime or 2.4A lab missing'
    ancestry = subprocess.run(['git', 'merge-base', '--is-ancestor', BASELINE, 'HEAD'], cwd=ROOT, check=False)
    assert ancestry.returncode == 0, 'Wrong repository lineage'
    graph_source = runpy.run_path(str(LAB_24A))['GRAPH_SOURCE']
    runtime_port, vite_port = port(), port()
    while vite_port == runtime_port:
        vite_port = port()
    base = f'http://127.0.0.1:{runtime_port}'
    process: subprocess.Popen | None = None
    with tempfile.TemporaryDirectory(prefix='masl-24d-graph-') as temporary:
        path = Path(temporary)
        (path/'graph.py').write_text(graph_source, encoding='utf-8')
        (path/'langgraph.json').write_text(json.dumps({
            'dependencies': ['.'],
            'graphs': {
                'masl_24a_hitl': './graph.py:hitl_graph',
                'masl_24a_breakpoint': './graph.py:breakpoint_graph',
            },
        }), encoding='utf-8')
        try:
            with LOG.open('wb') as log:
                process = subprocess.Popen([
                    str(PINNED_CLI), 'dev', '--config', 'langgraph.json',
                    '--host', '127.0.0.1', '--port', str(runtime_port),
                    '--no-browser', '--no-reload', '--server-log-level', 'warning',
                ], cwd=path, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            for _ in range(120):
                if process.poll() is not None:
                    raise RuntimeError(f'Runtime terminated prematurely: {LOG}')
                try:
                    with urlopen(base + '/openapi.json', timeout=2) as response:
                        if response.status == 200:
                            break
                except OSError:
                    time.sleep(.5)
            else:
                raise RuntimeError(f'Runtime not ready: {LOG}')
            print('PASS: pinned deterministic Runtime ready at', base, flush=True)
            env = dict(os.environ, MASL_HITL_RUNTIME_URL=base, MASL_HITL_VITE_PORT=str(vite_port))
            subprocess.run([
                'pnpm', 'exec', 'playwright', 'test', '--config', 'playwright.hitl.config.ts',
                '--project=chromium', '--reporter=list',
            ], cwd=WEB, env=env, check=True)
            print('PASS: 2.4D model-free browser probes', flush=True)
        finally:
            stop(process)
            print('PASS: pinned Runtime cleaned up', flush=True)
            print('RUNTIME LOG:', LOG, flush=True)


if __name__ == '__main__':
    main()
