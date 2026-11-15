#!/usr/bin/env python3
"""2.5D: pinned ToolNode, redacted MessageList and Chromium regressions.

No model calls, Git writes, or changes to the pinned workshop. The already
reviewed 2.5A GRAPH_SOURCE is reused without running its discovery main().
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import runpy
import signal
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/web'
BASELINE = 'f0e9622c803f4890a3a2194610f8d9dfb5210308'
REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
CLI = ROOT / '.reference/interrupt26-deepagents/.venv/bin/langgraph'
DISCOVERY = ROOT / 'scripts/lab-25a-tool-contracts.py'
LOG = Path(f'/tmp/masl-25d-runtime-{os.getpid()}.log')
EXPECTED_UNTRACKED = sorted([
    'apps/web/e2e/tool-boundaries-ui.spec.ts',
    'apps/web/playwright.tool-boundaries.config.ts',
    'apps/web/src/execution/message-display.spec.ts',
    'apps/web/src/execution/message-display.ts',
    'scripts/lab-25d-tool-browser.py',
])
EXPECTED_MODIFIED = sorted([
    'apps/web/src/components/MessageList.tsx',
    'apps/web/src/execution/stream-projector.ts',
    'apps/web/src/transport/agent-server/stream-events.ts',
])



def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def preflight() -> None:
    if git('rev-parse', 'HEAD') != BASELINE:
        raise RuntimeError('Unexpected Git HEAD for 2.5C')
    changed = git('diff', '--name-only').splitlines()
    if sorted(changed) != EXPECTED_MODIFIED:
        raise RuntimeError(f'Unexpected tracked changes: {changed!r}')
    if git('diff', '--cached', '--name-only'):
        raise RuntimeError('Staged changes forbidden before 2.5C gate')
    untracked = sorted(git('ls-files', '--others', '--exclude-standard').splitlines())
    if untracked != EXPECTED_UNTRACKED:
        raise RuntimeError(f'Unexpected untracked files: {untracked!r}')
    if not CLI.is_file() or not DISCOVERY.is_file():
        raise RuntimeError('Pinned Runtime or original 2.5A discovery missing')
    if git('rev-parse', 'HEAD', cwd=ROOT/'.reference/interrupt26-deepagents') != REFERENCE:
        raise RuntimeError('Pinned workshop revision differs')
    # Check syntax only, no 2.5A graph execution before the browser gate.
    graph_source = runpy.run_path(str(DISCOVERY))['GRAPH_SOURCE']
    compile(graph_source, '<reviewed-25a-tool-graph>', 'exec')
    print('PASS: exact 2.5A-C HEAD, 2.5D scoped worktree and pinned ToolNode graph', flush=True)


def port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def stop(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def main() -> None:
    preflight()
    graph_source = runpy.run_path(str(DISCOVERY))['GRAPH_SOURCE']
    runtime_port, vite_port = port(), port()
    while vite_port == runtime_port:
        vite_port = port()
    base = f'http://127.0.0.1:{runtime_port}'
    temporary = tempfile.TemporaryDirectory(prefix='masl-25d-tool-ui-')
    process: subprocess.Popen | None = None
    try:
        graph = Path(temporary.name)
        (graph/'graph.py').write_text(graph_source, encoding='utf8')
        (graph/'langgraph.json').write_text(json.dumps({
            'dependencies':['.'],
            'graphs':{'masl_25a_tools':'./graph.py:tool_graph'},
        }), encoding='utf8')
        with LOG.open('wb') as log:
            process = subprocess.Popen([
                str(CLI), 'dev', '--config','langgraph.json',
                '--host','127.0.0.1','--port',str(runtime_port),
                '--no-browser','--no-reload','--server-log-level','warning',
            ], cwd=graph, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        for _ in range(120):
            if process.poll() is not None:
                raise RuntimeError('Pinned Runtime terminated prematurely')
            try:
                with urlopen(base+'/openapi.json', timeout=2) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(.5)
        else:
            raise RuntimeError('Pinned ToolNode Runtime readiness timeout')
        print('PASS: pinned model-free ToolNode Runtime ready at '+base, flush=True)
        env = dict(os.environ, MASL_25D_RUNTIME_URL=base, MASL_25D_VITE_PORT=str(vite_port),
                   MASL_25C_RUNTIME_URL=base, MASL_25C_VITE_PORT=str(vite_port))
        subprocess.run([
            'pnpm','exec','playwright','test','--config','playwright.tool-boundaries.config.ts',
            '--project=chromium','--reporter=list',
        ], cwd=WEB, env=env, timeout=180, check=True)
        print('PASS: 2.5D tool confidentiality + 2.5C regression Chromium gates', flush=True)
    finally:
        # The dev server writes state during shutdown; stop before removing the graph.
        try:
            stop(process)
            content = LOG.read_text(encoding='utf8', errors='replace') if LOG.exists() else ''
            if re.search(r'Traceback|Application shutdown failed|FileNotFoundError', content):
                raise RuntimeError('Runtime shutdown error; inspect '+str(LOG))
        finally:
            temporary.cleanup()
        print('PASS: pinned Runtime stopped before temporary workspace cleanup', flush=True)
        print('RUNTIME LOG: '+str(LOG), flush=True)


if __name__ == '__main__':
    main()
