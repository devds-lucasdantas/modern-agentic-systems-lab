#!/usr/bin/env python3
"""MASL 2.5A: pinned, model-free ToolNode vs Agent Server stream discovery.

Only creates a temporary graph and one disposable Thread in a temporary dev
Runtime. Observations go to /tmp, with bounded/redacted SSE structure only.
Does not mutate the repository, pinned reference, UI or call a model/provider.
"""
from __future__ import annotations

from collections import Counter
from hashlib import sha256
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / '.reference/interrupt26-deepagents/.venv/bin/langgraph'
BASELINE = 'e1acf37eb34c9b3068d94eb1424d065d05537703'
REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
LOG = Path(f'/tmp/masl-25a-tools-runtime-{os.getpid()}.log')
OBS = Path(f'/tmp/masl-25a-tools-observations-{os.getpid()}.json')
EXPECTED_TOOL = 'deterministic_lookup_25a'
EXPECTED_CALL = 'masl-call-25a-1'
EXPECTED_RESULT = 'RESULT_25A:ALPHA_25A'

# A real ToolNode processes a real ToolCall; the caller AIMessage is synthetic.
# This deliberately does NOT claim that an LLM decided to call the tool, or
# that the pinned Agent Server exposes the distinct protocol `tools` channel.
GRAPH_SOURCE = '''from typing import Annotated, TypedDict
from langchain_core.messages import AIMessage, AnyMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

@tool
def deterministic_lookup_25a(code: str) -> str:
    """Return a reproducible local result for the explicit 2.5A test key."""
    if code != "ALPHA_25A":
        raise ValueError("Unexpected deterministic tool argument")
    return "RESULT_25A:ALPHA_25A"

class ToolState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def emit_tool_call(_: ToolState) -> ToolState:
    return {"messages": [AIMessage(
        id="masl-ai-25a-1", content="",
        tool_calls=[{
            "name": "deterministic_lookup_25a",
            "args": {"code": "ALPHA_25A"},
            "id": "masl-call-25a-1",
            "type": "tool_call",
        }],
    )]}

builder = StateGraph(ToolState)
builder.add_node("emit_tool_call", emit_tool_call)
builder.add_node("tools", ToolNode([deterministic_lookup_25a]))
builder.add_edge(START, "emit_tool_call")
builder.add_edge("emit_tool_call", "tools")
builder.add_edge("tools", END)
tool_graph = builder.compile()
'''


def ensure(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def preflight() -> None:
    ensure(git('rev-parse', 'HEAD') == BASELINE, 'Unexpected repository HEAD')
    ensure(git('diff', '--name-only') == '', 'Tracked worktree modified')
    ensure(git('diff', '--cached', '--name-only') == '', 'Staged worktree modified')
    ensure(git('ls-files', '--others', '--exclude-standard').splitlines() ==
           ['scripts/lab-25a-tool-contracts.py'], 'Unexpected untracked files')
    ensure(CLI.is_file(), 'Pinned Runtime CLI missing')
    reference = ROOT / '.reference/interrupt26-deepagents'
    ensure(git('rev-parse', 'HEAD', cwd=reference) == REFERENCE,
           'Pinned workshop revision differs from reviewed reference')
    compile(GRAPH_SOURCE, '<masl-25a-temporary-tool-graph>', 'exec')
    print('PASS: exact 2.4F baseline, pinned workshop, clean tracked files and model-free graph syntax', flush=True)


def available_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def call_json(base: str, method: str, path: str, payload: object | None = None) -> object:
    body = None if payload is None else json.dumps(payload).encode('utf-8')
    request = Request(base + path, method=method, data=body,
                      headers={'Accept':'application/json', 'Content-Type':'application/json'})
    try:
        with urlopen(request, timeout=25) as response:
            raw = response.read(3_000_000 + 1)
            ensure(len(raw) <= 3_000_000, f'Oversized JSON response: {path}')
            return json.loads(raw) if raw else None
    except HTTPError as e:
        raise RuntimeError(f'HTTP {e.code} {method} {path}: {e.read(512)!r}') from e


def parse_sse(text: str) -> list[dict]:
    """Preserve SSE event/id envelopes; retain only structural JSON summaries."""
    records: list[dict] = []
    fields: dict[str, object] = {'data': []}

    def finish() -> None:
        nonlocal fields
        lines = fields.get('data', [])
        if not isinstance(lines, list) or not lines:
            fields = {'data': []}
            return
        payload = '\n'.join(lines)
        try:
            obj = json.loads(payload)
            typ = 'object' if isinstance(obj, dict) else 'array' if isinstance(obj, list) else type(obj).__name__
            keys = sorted(str(key) for key in obj.keys())[:30] if isinstance(obj, dict) else []
            node_keys = (sorted(str(key) for key in obj.keys())[:12]
                         if isinstance(obj, dict) and fields.get('event') == 'updates'
                         else [])
            malformed = False
        except (TypeError, ValueError):
            typ, keys, node_keys, malformed = 'malformed-json', [], [], True
        records.append({'event': fields.get('event', 'message'),
                        'id_present': bool(fields.get('id')),
                        'payload_type': typ,
                        'top_level_keys': keys,
                        'update_node_keys': node_keys,
                        'malformed_json': malformed})
        fields = {'data': []}

    for line in (text + '\n\n').splitlines():
        if not line:
            finish()
            continue
        if line.startswith(':'):
            continue
        key, sep, val = line.partition(':')
        if not sep:
            val = ''
        if val.startswith(' '):
            val = val[1:]
        if key == 'data':
            assert isinstance(fields['data'], list)
            fields['data'].append(val)
        elif key in ('event', 'id', 'retry'):
            fields[key] = val
    return records


def stream_run(base: str, thread: str) -> list[dict]:
    endpoint = f'/threads/{quote(thread, safe="")}/runs/stream'
    payload = {'assistant_id':'masl_25a_tools', 'input':{'messages':[]},
               'stream_mode':['values', 'updates', 'messages'],
               'stream_resumable':False,
               'on_disconnect':'continue'}
    req = Request(base+endpoint, method='POST', data=json.dumps(payload).encode(),
                  headers={'Accept':'text/event-stream', 'Content-Type':'application/json'})
    try:
        with urlopen(req, timeout=70) as response:
            ensure(response.headers.get('Content-Type', '').lower().startswith('text/event-stream'),
                   'Expected text/event-stream for stateful Run')
            raw = response.read(3_000_000 + 1)
            ensure(len(raw) <= 3_000_000, 'SSE exceeded 3 MB discovery ceiling')
    except HTTPError as e:
        raise RuntimeError(f'Stream POST rejected with HTTP {e.code}: {e.read(800)!r}') from e
    records = parse_sse(raw.decode('utf-8', errors='replace'))
    ensure(len(records) > 0, 'No SSE event envelopes observed')
    ensure(not any(x['malformed_json'] for x in records), 'Malformed JSON SSE payload observed')
    return records


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
    port = available_port()
    base = f'http://127.0.0.1:{port}'
    process: subprocess.Popen | None = None
    disposable: str | None = None
    temporary = tempfile.TemporaryDirectory(prefix='masl-25a-tools-')
    try:
        graph = Path(temporary.name) / 'graph'
        graph.mkdir()
        (graph / 'graph.py').write_text(GRAPH_SOURCE, encoding='utf-8')
        (graph / 'langgraph.json').write_text(json.dumps({
            'dependencies':['.'],
            'graphs':{'masl_25a_tools':'./graph.py:tool_graph'},
        }) + '\n', encoding='utf-8')
        with LOG.open('wb') as log:
            process = subprocess.Popen([
                str(CLI), 'dev', '--config', 'langgraph.json', '--host', '127.0.0.1',
                '--port', str(port), '--no-browser', '--no-reload', '--server-log-level', 'warning',
            ], cwd=graph, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        for _ in range(120):
            ensure(process.poll() is None, f'Runtime stopped prematurely; inspect {LOG}')
            try:
                with urlopen(base + '/openapi.json', timeout=3) as response:
                    ensure(response.status == 200, 'Runtime OpenAPI readiness returned non-200')
                break
            except Exception:
                time.sleep(.5)
        else:
            raise RuntimeError(f'Pinned Runtime did not become ready; inspect {LOG}')
        print('PASS: pinned model-free ToolNode Runtime ready at ' + base, flush=True)
        result = call_json(base, 'POST', '/threads', {'metadata':{'lab':'2.5A'}})
        ensure(isinstance(result, dict) and isinstance(result.get('thread_id'), str),
               'Disposable Thread creation did not return thread_id')
        disposable = result['thread_id']
        frames = stream_run(base, disposable)
        print('PASS: streamed one stateful, explicit ToolNode Run', flush=True)
        path = '/threads/' + quote(disposable, safe='')
        for _ in range(120):
            state = call_json(base, 'GET', path+'/state')
            thread = call_json(base, 'GET', path)
            runs = call_json(base, 'GET', path+'/runs?limit=20')
            ensure(isinstance(state, dict) and isinstance(thread, dict) and isinstance(runs, list),
                   'Expected structured persisted reconciliation')
            if (len(runs) == 1 and runs[0].get('status') == 'success'
                and thread.get('status') == 'idle' and state.get('next') == []
                and state.get('checkpoint') is not None):
                break
            time.sleep(.2)
        else:
            raise RuntimeError('Graph did not reach successful persisted END; check Runtime log')
        values = state.get('values', {})
        ensure(isinstance(values, dict), 'Persisted state values are not an object')
        messages = values.get('messages', [])
        ensure(isinstance(messages, list), 'Persisted messages are not an array')
        calls: list[dict] = []
        results: list[dict] = []
        for message in messages:
            if not isinstance(message, dict):
                continue
            for tool_call in message.get('tool_calls', []) or []:
                if isinstance(tool_call, dict):
                    calls.append(tool_call)
            if message.get('type') == 'tool' or message.get('tool_call_id'):
                results.append(message)
        ensure(len(calls) == 1, f'Expected one persisted tool_call; found {len(calls)}')
        ensure(len(results) == 1, f'Expected one persisted ToolMessage; found {len(results)}')
        tc, tm = calls[0], results[0]
        ensure(tc.get('id') == EXPECTED_CALL and tc.get('name') == EXPECTED_TOOL,
               'Persisted tool call identity or name mismatch')
        ensure(tc.get('args') == {'code':'ALPHA_25A'}, 'Persisted deterministic call args mismatch')
        ensure(tm.get('tool_call_id') == EXPECTED_CALL,
               'ToolMessage did not correlate with tool_call_id')
        ensure(tm.get('content') == EXPECTED_RESULT,
               'ToolNode did not persist the expected deterministic result')
        kinds = dict(sorted(Counter(str(e['event']) for e in frames).items()))
        payload = {
            'lab':'2.5A', 'baseline':BASELINE, 'reference':REFERENCE,
            'scope':'synthetic AIMessage -> real ToolNode -> persisted ToolMessage, no model calls',
            'thread_id':disposable,
            'run_id':runs[0].get('run_id'),
            'run_status':runs[0].get('status'),
            'thread_status':thread.get('status'),
            'graph_next':state.get('next'),
            'checkpoint_present':True,
            'tool_call':{'name':tc.get('name'),'id':tc.get('id'),'args':tc.get('args')},
            'tool_result':{'message_type':tm.get('type'),'tool_call_id':tm.get('tool_call_id'),
                           'name':tm.get('name'),'content':tm.get('content')},
            'sse':{'total':len(frames),'by_event':kinds, 'envelopes':frames[:80],
                   'truncated':len(frames)>80},
            'checks':{'oneCallPersisted':True,'oneToolMessagePersisted':True,
                      'callIdCorrelated':True,'deterministicResultPersisted':True,
                      'runSucceeded':True,'graphReachedEnd':True,'sseObserved':True,
                      'noModelCalls':True},
            'caveats':['SSE event families are descriptive, not inferred from current upstream docs.',
                       'Synthetic tool call does not establish model selection or the protocol tools channel.',
                       'Run success alone is not graph END; reconciled persisted ThreadState independently.',
                       'The pinned development Runtime has auth=noop and is not production approval infrastructure.'],
        }
        OBS.write_text(json.dumps(payload, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
        print('PASS: exactly one tool_call and one correlated ToolMessage persisted at graph END', flush=True)
        print('OBSERVED SSE event families: '+json.dumps(kinds, sort_keys=True), flush=True)
        print('PASS: redacted structural evidence saved to '+str(OBS), flush=True)
        print('OBSERVATION SHA256: '+sha256(OBS.read_bytes()).hexdigest(), flush=True)
        print('PASS: 7 tool-contract invariants; 0 external model calls', flush=True)
    finally:
        if disposable is not None and process is not None and process.poll() is None:
            try:
                call_json(base, 'DELETE', '/threads/'+quote(disposable, safe=''))
                print('PASS: disposable Thread deleted', flush=True)
            except Exception as e:
                print('WARN: Thread cleanup failed: '+str(e)[:250], flush=True)
        try:
            stop(process)
            runtime_log = LOG.read_text(encoding='utf-8', errors='replace') if LOG.is_file() else ''
            ensure('Traceback' not in runtime_log and 'Application shutdown failed' not in runtime_log,
                   'Pinned Runtime log contains shutdown error')
        finally:
            temporary.cleanup()
        print('PASS: pinned Runtime stopped before temporary workspace cleanup', flush=True)
        print('RUNTIME LOG: '+str(LOG), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('FAIL: '+str(exc), file=sys.stderr, flush=True)
        raise
