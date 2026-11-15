#!/usr/bin/env python3
"""2.5E: scoped, reproducible Frontend tools baseline audit on published HEAD.

Verifies the historical 2.5A observation, re-runs 2.5B/2.5D pure tests and
2.5C/2.5D Chromium against a temporary pinned ToolNode Runtime. No model calls,
tracked-file writes, Git mutations, or milestone/commit/push actions.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import runpy
import shlex
import signal
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/web'
HEAD = '8747c78832a74064e1abdf96aa3b8e99bef6a313'
REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
SELF = 'scripts/lab-25e-review.py'
CLI = ROOT / '.reference/interrupt26-deepagents/.venv/bin/langgraph'
DISCOVERY = ROOT / 'scripts/lab-25a-tool-contracts.py'
DEFAULT_OBSERVATION = Path('/tmp/masl-25a-tools-observations-933.json')
OBSERVATION_SHA256 = 'ce9446be9408f694f5d8b1bb5fa3fd2d1408280e849f1136d03c386315b08a0c'
ORIGINAL_RUNTIME_LOG = Path('/tmp/masl-25a-tools-runtime-933.log')
ORIGINAL_RUNTIME_SHA256 = '940a67eb13550448dd282d3960523debd1b73837f9b43aa7abdf7d7cb0c03910'
BLOBS = {'ROADMAP.md': 'bf496f0f804be2eabad3709ccd29ca10cfc54a26', 'CURRENT.md': '914824a439366668f0461bf37bce2218a518f15b', 'docs/journal/lab-22-frontend-tools.md': 'fc84e224d0e4fcabc1c41c299d50e99e4ce2f541', 'apps/web/src/execution/tool-projection.ts': '96cbbfc74580981e4595799dac3aff792c85a515', 'apps/web/src/execution/tool-projection.spec.ts': '3fa70dc43588a878af13a706fa57b2a54a3fe3dc', 'apps/web/src/execution/message-display.ts': '7ab9a16ac7f3c934a552eee1a429325015dd7e34', 'apps/web/src/execution/message-display.spec.ts': 'cba275dff63aaf466d3487f4d3113b6dcd4e3a94', 'apps/web/src/components/MessageList.tsx': 'b962997200137b638c396770f6f607237a6aeddf', 'apps/web/src/components/ToolObservationsPanel.tsx': '27dec8285b35954ca4b8dce2c2793e6a4ce77dd1', 'apps/web/src/execution/stream-projector.ts': 'f91dd411c810744615a5bf6918342a03a91cf82d', 'apps/web/src/transport/agent-server/stream-events.ts': '28d5d831d7d89d064fa48619b00a50800c76e42b', 'apps/web/e2e/tool-observations-ui.spec.ts': 'e358c476c9930934b64d6136444475f30cac038a', 'apps/web/e2e/tool-boundaries-ui.spec.ts': '20c4808562875b2f03acbb6eacffe3235d235b7e', 'apps/web/playwright.tool-boundaries.config.ts': '50227d3b9def348951a1196a0e34b476f88c7ffc', 'scripts/lab-25a-tool-contracts.py': '5463d973a646e8e31d308fa1001b748dde9ab661', 'scripts/lab-25b-observation-check.mjs': 'd3cf1cf99e5ab152c01b8a03d3bdffadb5d1664c', 'scripts/lab-25c-tool-browser.py': 'd92eb018d6b1017777cbb4d17c184e2ac83ce6e9', 'scripts/lab-25d-tool-browser.py': '361f6cf8b642d90cdf797b14e6bb2aece491ee6c'}
BOUNDARIES = [
    'The original 2.5A AI tool call was synthetic, not autonomously selected by an LLM.',
    'ToolMessage correlation does not prove external side effects, authorization or exactly-once execution.',
    'messages/complete is an Agent Server message event, not a tool-lifecycle channel or persisted authority.',
    'The generic MessageList masks ToolMessages and structured blocks for display only; raw data remains in transport, state, and memory.',
    'Ordinary user/assistant/system text can still contain secrets; this audit does not establish application-wide DLP.',
    'Pinned dev Runtime uses auth=noop and langgraph-api 0.8.1 is EOL; no production authorization, CAS or idempotency guarantee.',
    'The model-dependent 2.2/2.3 end-to-end suites and cross-client/multi-browser guarantees are outside this scoped audit.',
]


def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.check_output(['git', *args], cwd=cwd, stderr=subprocess.STDOUT, text=True).strip()


def ensure(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def file_sha256(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def base_preflight() -> None:
    ensure(git('rev-parse', 'HEAD') == HEAD, 'wrong Git HEAD; requires published 2.5D commit')
    ensure(git('rev-parse', 'origin/main') == HEAD, 'origin/main does not equal reviewed HEAD')
    ensure(git('diff', '--name-only') == '', 'tracked changes present')
    ensure(git('diff', '--cached', '--name-only') == '', 'staged changes present')
    untracked = git('ls-files', '--others', '--exclude-standard').splitlines()
    ensure(untracked == [SELF], f'expected only untracked reviewer; got {untracked!r}')
    for path, blob in BLOBS.items():
        ensure(git('rev-parse', f'HEAD:{path}') == blob, f'Git blob changed: {path}')
        ensure(git('hash-object', path) == blob, f'worktree differs from reviewed HEAD: {path}')
    roadmap = (ROOT/'ROADMAP.md').read_text(encoding='utf8')
    ensure('- [ ] 2.5 Frontend tools' in roadmap, 'parent milestone was already closed')
    for block in 'ABCD':
        ensure(f'  - [x] 2.5{block} ' in roadmap, f'2.5{block} must already be completed')
    ensure('  - [ ] 2.5E Frontend tools baseline review' in roadmap, '2.5E was already closed or renamed')
    current = (ROOT/'CURRENT.md').read_text(encoding='utf8')
    ensure('2.5E Frontend tools baseline review' in current.split('## Completed')[0],
           'CURRENT does not point at 2.5E')
    ensure(CLI.is_file(), 'pinned Runtime CLI missing')
    reference = ROOT/'.reference/interrupt26-deepagents'
    ensure(git('rev-parse', 'HEAD', cwd=reference) == REFERENCE,
           'pinned workshop HEAD differs; do not reset the reference')
    graph = runpy.run_path(str(DISCOVERY))['GRAPH_SOURCE']
    compile(graph, '<reviewed-25a-model-free-tool-graph>', 'exec')


def original_preflight(observation: Path) -> dict[str, str]:
    ensure(observation.is_file(), 'original 2.5A observation missing: '+str(observation))
    ensure(file_sha256(observation) == OBSERVATION_SHA256, 'original 2.5A observation SHA-256 mismatch')
    ensure(ORIGINAL_RUNTIME_LOG.is_file(), 'original 2.5A Runtime log missing')
    ensure(file_sha256(ORIGINAL_RUNTIME_LOG) == ORIGINAL_RUNTIME_SHA256,
           'original 2.5A Runtime log SHA-256 mismatch')
    data = json.loads(observation.read_text(encoding='utf8'))
    ensure(data.get('lab') == '2.5A' and data.get('baseline') == 'e1acf37eb34c9b3068d94eb1424d065d05537703',
           'historical discovery identity mismatch')
    ensure(data.get('reference') == REFERENCE and data.get('run_status') == 'success'
           and data.get('thread_status') == 'idle' and data.get('checkpoint_present') is True
           and data.get('graph_next') == [], 'historical persisted graph/Run invariant missing')
    for key in ('oneCallPersisted','oneToolMessagePersisted','callIdCorrelated',
                'deterministicResultPersisted','runSucceeded','graphReachedEnd',
                'sseObserved','noModelCalls'):
        ensure(data.get('checks', {}).get(key) is True, f'historical discovery check missing: {key}')
    sse = data.get('sse', {}).get('by_event', {})
    expected_events = {'messages/complete':2,'messages/metadata':2,'metadata':1,'updates':2,'values':3}
    ensure(sse == expected_events, f'historical SSE event families drifted: {sse!r}')
    call = data.get('tool_call', {})
    result = data.get('tool_result', {})
    ensure(call.get('id') == 'masl-call-25a-1' and call.get('name') == 'deterministic_lookup_25a'
           and result.get('tool_call_id') == call.get('id'), 'historical tool correlation failed')
    ensure(not re.search(r'Traceback|Application shutdown failed|FileNotFoundError',
                         ORIGINAL_RUNTIME_LOG.read_text(encoding='utf8', errors='replace')),
           'historical 2.5A Runtime shutdown was not clean')
    print('PASS: pinned reference and ORIGINAL 2.5A observation + Runtime SHA-256 verified', flush=True)
    return {'mode': 'original-history-verified', 'historical_files_verified': True,
            'observation': str(observation), 'sha256': OBSERVATION_SHA256,
            'runtime_log': str(ORIGINAL_RUNTIME_LOG), 'runtime_sha256': ORIGINAL_RUNTIME_SHA256,
            'historical_observation_sha256': OBSERVATION_SHA256,
            'historical_runtime_sha256': ORIGINAL_RUNTIME_SHA256}


REPLAY_ID = '2.5E-reproduced-2.5A'
HISTORICAL_HEAD = 'e1acf37eb34c9b3068d94eb1424d065d05537703'
DISCOVERY_BLOB = BLOBS['scripts/lab-25a-tool-contracts.py']


def replay_preflight(attestation: Path) -> dict[str, str]:
    ensure(attestation.is_file(), '2.5A reproduction attestation missing: '+str(attestation))
    ensure(attestation.resolve().is_relative_to(Path('/tmp')),
           '2.5A reproduction evidence must reside in /tmp')
    manifest = json.loads(attestation.read_text(encoding='utf8'))
    ensure(isinstance(manifest, dict) and manifest.get('kind') == REPLAY_ID,
           'wrong or missing 2.5A reproduction attestation')
    ensure(manifest.get('reviewed_head') == HEAD
           and manifest.get('original_baseline') == HISTORICAL_HEAD
           and manifest.get('discovery_git_blob') == DISCOVERY_BLOB,
           '2.5A reproduction Git lineage/source mismatch')
    ensure(manifest.get('in_memory_change') == 'only historical preflight replaced by reviewed 2.5E guard',
           '2.5A replay disclosure missing')
    ensure(manifest.get('historical_files_verified') is False,
           'reproduction must not claim historical files verified')
    ensure(subprocess.run(['git','merge-base','--is-ancestor',HISTORICAL_HEAD,HEAD],
                          cwd=ROOT,check=False).returncode == 0,
           'reviewed HEAD does not descend from the historical 2.5A baseline')
    obs = Path(manifest['observation'])
    runtime = Path(manifest['runtime_log'])
    ensure(obs.is_file() and runtime.is_file(), '2.5A reproduction data/log missing')
    ensure(obs.parent.resolve() == Path('/tmp') and runtime.parent.resolve() == Path('/tmp'),
           'reproduction observation/Runtime log must be direct children of /tmp')
    ensure(obs.name.startswith('masl-25a-tools-observations-') and obs.suffix == '.json',
           'unexpected reproduced observation name')
    ensure(runtime.name.startswith('masl-25a-tools-runtime-') and runtime.suffix == '.log',
           'unexpected reproduced Runtime log name')
    ensure(file_sha256(obs) == manifest.get('observation_sha256'),
           'reproduced observation SHA256 mismatch')
    ensure(file_sha256(runtime) == manifest.get('runtime_sha256'),
           'reproduced Runtime log SHA256 mismatch')
    data = json.loads(obs.read_text(encoding='utf8'))
    ensure(data.get('lab') == '2.5A' and data.get('baseline') == HISTORICAL_HEAD
           and data.get('reference') == REFERENCE,
           'reproduced discovery identity/reference mismatch')
    ensure(data.get('run_status') == 'success' and data.get('thread_status') == 'idle'
           and data.get('checkpoint_present') is True and data.get('graph_next') == [],
           'reproduced persisted graph/Run invariants missing')
    for key in ('oneCallPersisted','oneToolMessagePersisted','callIdCorrelated',
                'deterministicResultPersisted','runSucceeded','graphReachedEnd',
                'sseObserved','noModelCalls'):
        ensure(data.get('checks',{}).get(key) is True,
               'reproduced 2.5A invariant absent: '+key)
    expected_events = {'messages/complete':2,'messages/metadata':2,'metadata':1,'updates':2,'values':3}
    ensure(data.get('sse',{}).get('by_event') == expected_events
           and data.get('sse',{}).get('total') == 10,
           'pinned 2.5A SSE inventory drifted in reproduction; investigate before closing')
    call = data.get('tool_call',{})
    result = data.get('tool_result',{})
    ensure(call.get('id') == 'masl-call-25a-1'
           and call.get('name') == 'deterministic_lookup_25a'
           and call.get('args') == {'code':'ALPHA_25A'}
           and result.get('tool_call_id') == 'masl-call-25a-1'
           and result.get('content') == 'RESULT_25A:ALPHA_25A',
           'reproduced ToolNode correlation/result mismatch')
    ensure(not re.search(r'Traceback|Application shutdown failed|FileNotFoundError',
                         runtime.read_text(encoding='utf8',errors='replace')),
           'reproduced 2.5A Runtime log contains errors')
    print('PASS: verified fresh 2.5A ToolNode reproduction, SHA256 and Runtime cleanup', flush=True)
    print('REPLAY DISCLOSURE: historical JSON and Runtime logs NOT verified; original SHA retained in report', flush=True)
    return {'mode':'reviewed-in-memory-reproduction', 'historical_files_verified': False,
            'attestation':str(attestation),'attestation_sha256':file_sha256(attestation),
            'observation':str(obs),'sha256':file_sha256(obs),
            'runtime_log':str(runtime),'runtime_sha256':file_sha256(runtime),
            'historical_observation_sha256':OBSERVATION_SHA256,
            'historical_runtime_sha256':ORIGINAL_RUNTIME_SHA256,
            'discovery_git_blob':DISCOVERY_BLOB,
            'in_memory_change':manifest['in_memory_change']}


def preflight(observation: Path, replay: Path | None = None) -> dict[str,str]:
    base_preflight()
    evidence = replay_preflight(replay) if replay is not None else original_preflight(observation)
    print('PASS: exact 2.5D HEAD, origin/main, 18 Git blobs and clean worktree', flush=True)
    print('PASS: 2.5A-D checked; parent 2.5 and 2.5E deliberately OPEN', flush=True)
    print('PASS: pinned reference, ToolNode correlation, checkpoint and graph END; no model calls', flush=True)
    return evidence


def reproduce_25a() -> None:
    # Execute the original 2.5A main() unchanged. Only its historical
    # pre-commit worktree guard is replaced in the in-memory namespace.
    # No source rewriting, Git spoofing, modifications to tracked files or
    # model invocations. Both old historical SHA256s are kept separate.
    base_preflight()
    ensure(subprocess.run(['git','merge-base','--is-ancestor',HISTORICAL_HEAD,HEAD],
                          cwd=ROOT,check=False).returncode == 0,
           'historical 2.5A baseline is not an ancestor')
    source = DISCOVERY.read_text(encoding='utf8')
    ensure(git('hash-object',str(DISCOVERY.relative_to(ROOT))) == DISCOVERY_BLOB,
           'original 2.5A Git source has been modified')
    namespace = {'__name__':'masl_25e_25a_reproduction',
                 '__file__':str(DISCOVERY), '__package__':None}
    exec(compile(source,str(DISCOVERY),'exec'),namespace,namespace)
    ensure(namespace.get('BASELINE') == HISTORICAL_HEAD,
           'replay original BASELINE declaration unexpected')
    ensure(namespace.get('GRAPH_SOURCE') == runpy.run_path(str(DISCOVERY))['GRAPH_SOURCE'],
           'replay graph source drifted')
    observation = Path(namespace['OBS'])
    runtime = Path(namespace['LOG'])
    ensure(not observation.exists() and not runtime.exists(),
           'replay output file already exists; refusing to overwrite')

    def reviewed_preflight() -> None:
        base_preflight()
        ensure(git('rev-parse','HEAD') == HEAD, 'review head drifted during reproduction')
        print('REPLAY COMPATIBILITY: original 2.5A discovery executed with reviewed-HEAD guard in memory', flush=True)
        print('REPLAY COMPATIBILITY: no historical file, Git, graph, Runtime or probe is rewritten', flush=True)

    namespace['preflight'] = reviewed_preflight
    namespace['main']()
    ensure(observation.is_file() and runtime.is_file(),
           '2.5A reproduction did not produce observation and Runtime log')
    attestation = Path('/tmp')/f'masl-25e-25a-replay-{os.getpid()}.json'
    ensure(not attestation.exists(), 'reproduction attestation already exists')
    manifest = {'kind':REPLAY_ID, 'reviewed_head':HEAD,
                'original_baseline':HISTORICAL_HEAD,
                'discovery_git_blob':DISCOVERY_BLOB,
                'historical_files_verified':False,
                'historical_observation_sha256':OBSERVATION_SHA256,
                'historical_runtime_sha256':ORIGINAL_RUNTIME_SHA256,
                'in_memory_change':'only historical preflight replaced by reviewed 2.5E guard',
                'observation':str(observation),
                'observation_sha256':file_sha256(observation),
                'runtime_log':str(runtime),
                'runtime_sha256':file_sha256(runtime)}
    attestation.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    # Fail if any new observation invariant is wrong; never bless an untested replay.
    base_preflight()
    replay_preflight(attestation)
    print('REPLAY EVIDENCE: '+str(attestation)+' (SHA256 '+file_sha256(attestation)+')', flush=True)
    print('PASS: 2.5A was independently reproduced without misrepresenting the missing historical files',flush=True)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def stop(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=10)


def browser_gate(observation: Path, replay: Path | None = None) -> None:
    evidence = preflight(observation, replay)
    observation = Path(evidence['observation'])
    graph_source = runpy.run_path(str(DISCOVERY))['GRAPH_SOURCE']
    runtime_port, vite_port = free_port(), free_port()
    while runtime_port == vite_port:
        vite_port = free_port()
    base = f'http://127.0.0.1:{runtime_port}'
    runtime_log = Path(f'/tmp/masl-25e-runtime-{os.getpid()}.log')
    process: subprocess.Popen | None = None
    with tempfile.TemporaryDirectory(prefix='masl-25e-tool-graph-') as tmp:
        graph = Path(tmp)
        (graph/'graph.py').write_text(graph_source, encoding='utf8')
        (graph/'langgraph.json').write_text(json.dumps({
            'dependencies':['.'], 'graphs':{'masl_25a_tools':'./graph.py:tool_graph'},
        })+'\n', encoding='utf8')
        try:
            with runtime_log.open('wb') as log:
                process = subprocess.Popen([
                    str(CLI),'dev','--config','langgraph.json',
                    '--host','127.0.0.1','--port',str(runtime_port),
                    '--no-browser','--no-reload','--server-log-level','warning',
                ], cwd=graph, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            for _ in range(120):
                ensure(process.poll() is None, 'pinned Runtime terminated prematurely; inspect '+str(runtime_log))
                try:
                    with urlopen(base+'/openapi.json',timeout=2) as response:
                        if response.status == 200:
                            break
                except OSError:
                    time.sleep(.5)
            else:
                raise RuntimeError('pinned Runtime did not become ready; inspect '+str(runtime_log))
            print('PASS: pinned model-free ToolNode Runtime ready at '+base, flush=True)
            env = dict(os.environ, MASL_25D_RUNTIME_URL=base, MASL_25D_VITE_PORT=str(vite_port),
                       MASL_25C_RUNTIME_URL=base, MASL_25C_VITE_PORT=str(vite_port))
            # Original 2.5C / 2.5D browser specs are run unchanged at the reviewed HEAD.
            completed = subprocess.run([
                'pnpm','exec','playwright','test','--config','playwright.tool-boundaries.config.ts',
                '--project=chromium','--reporter=list',
            ], cwd=WEB, env=env, check=False, timeout=240)
            ensure(completed.returncode == 0, 'Chromium suite returned a non-zero exit code')
            print('PASS: 2.5C + 2.5D six Chromium cases on reviewed HEAD', flush=True)
        finally:
            try:
                stop(process)
                ensure(runtime_log.is_file(), 'runtime log not created')
                text = runtime_log.read_text(encoding='utf8', errors='replace')
                ensure(not re.search(r'Traceback|Application shutdown failed|FileNotFoundError', text),
                       'pinned Runtime shutdown error: '+str(runtime_log))
            finally:
                print('RUNTIME LOG: '+str(runtime_log), flush=True)
    print('PASS: pinned Runtime stopped before temporary workspace cleanup', flush=True)


def command(cmd: list[str], cwd: Path, log: Path, timeout: int) -> int:
    with log.open('w',encoding='utf8') as stream:
        stream.write('$ (cd '+str(cwd)+' && '+shlex.join(cmd)+')\n')
        stream.flush()
        try:
            return subprocess.run(cmd,cwd=cwd,stdout=stream,stderr=subprocess.STDOUT,
                                  check=False,timeout=timeout).returncode
        except subprocess.TimeoutExpired:
            stream.write(f'\nTIMEOUT after {timeout}s\n')
            return 124


def evidence_entry(label: str, log: Path, rc: int, required: tuple[str,...],
                   runtime: bool=False) -> dict:
    contents = log.read_text(encoding='utf8',errors='replace')
    missing = [expr for expr in required if re.search(expr,contents) is None]
    fail_markers = bool(re.search(r'(?im)^\s*(?:FAIL:|BLOCKED:|ERROR:|\d+ failed\s*\(|Traceback \(most recent call last\))',contents))
    good = rc == 0 and not missing and not fail_markers
    runtime_logs = []
    if good and runtime:
        match = re.search(r'^RUNTIME LOG: (/tmp/masl-25e-runtime-\S+\.log)$',contents,re.M)
        if match is None or not Path(match.group(1)).is_file():
            good = False
        else:
            path = Path(match.group(1))
            runtime_logs.append({'path':str(path),'sha256':file_sha256(path)})
            if re.search(r'Traceback|Application shutdown failed|FileNotFoundError',
                         path.read_text(encoding='utf8',errors='replace')):
                good = False
    result = {'gate':label,'pass':good,'exit_code':rc,'log':str(log),
              'sha256':file_sha256(log),'missing_patterns':missing,
              'failure_marker':fail_markers,'runtime_logs':runtime_logs}
    print(('PASS: ' if good else 'FAIL: ')+label+' ('+str(log)+')', flush=True)
    if not good:
        print('LOG TAIL:\n'+'\n'.join(contents.splitlines()[-28:]),flush=True)
    return result


def gate(label: str,cmd: list[str],cwd:Path,dir:Path,required:tuple[str,...],timeout:int=180,
         runtime:bool=False) -> dict:
    safe = re.sub(r'[^a-z0-9]+','-',label.lower()).strip('-')
    log = dir/(safe+'.log')
    print('===== '+label+' =====',flush=True)
    return evidence_entry(label,log,command(cmd,cwd,log,timeout),required,runtime)


def report(directory:Path, checks:list[dict], original:dict[str,str], began:float) -> bool:
    status_before = git('status','--porcelain','--untracked-files=all')
    clean = status_before.splitlines() == ['?? '+SELF]
    passed = sum(item['pass'] is True for item in checks)
    ok = len(checks)==9 and passed==9 and clean
    status = 'PASS — scoped 2.5E baseline gate complete' if ok else 'BLOCKED — failed gate or unexpected worktree'
    review = {
        'lab':'2.5E', 'baseline':HEAD, 'reference':REFERENCE,
        'status':status,'postflight_clean':clean,'postflight_git_status':status_before,
        'elapsed_seconds':round(time.monotonic()-began,1),
        'discovery_2_5a':original,'checks':checks,'boundaries':BOUNDARIES,
        'reviewer_note':'An explicit documentation finalizer is required to close 2.5E/2.5; this audit performs no Git or documentation writes.',
    }
    jp = directory/'review.json'
    jp.write_text(json.dumps(review,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    lines = ['# Lab 2.5E — Frontend Tools Scoped Baseline Review','',
             f'**Result:** {status}','',f'**Baseline:** `{HEAD}`','',
             f'**Gates:** {passed}/{len(checks)}','',
             f'**2.5A evidence mode:** `{original["mode"]}`','',
             f'**2.5A observation used SHA256:** `{original["sha256"]}`','',
             f'**Historical observation SHA256 (reference only unless original mode):** `{OBSERVATION_SHA256}`','',
             f'**Historical files independently verified:** `{original["historical_files_verified"]}`','',
             '| Gate | Status | Evidence SHA-256 |','|---|---|---|']
    lines += [f'| {item["gate"]} | {"PASS" if item["pass"] else "FAIL"} | `{item["sha256"]}` |' for item in checks]
    lines += ['', '## Scope and limitations','']+[f'- {x}' for x in BOUNDARIES]
    lines += ['', '## Method', '',
              ('2.5A ORIGINAL logs were checked by exact SHA256' if original['historical_files_verified']
               else 'Missing historical /tmp files were NOT recovered. Original 2.5A was reproduced using its exact tracked source and a reviewed-HEAD preflight in memory, with fresh observation and Runtime log hashes.'),
              'The 42 pure 2.5B assertions and 33 pure 2.5D assertions were rebuilt at published HEAD.',
              'The original 2.5C/2.5D Playwright specs ran unchanged against a new pinned disposable Runtime.',
              'Legacy pre-commit runner guards were neither rewritten nor spoofed. The reviewer owns its own exact-head gate.',
              'No model, Git mutation, milestone closure or external side-effect guarantee is inferred.','']
    mp = directory/'review.md'
    mp.write_text('\n'.join(lines)+'\n',encoding='utf8')
    print('REVIEW STATUS: '+status,flush=True)
    print('REVIEW EVIDENCE: '+str(jp)+' (SHA256 '+file_sha256(jp)+')',flush=True)
    print('REVIEW REPORT: '+str(mp)+' (SHA256 '+file_sha256(mp)+')',flush=True)
    print('PASS: postflight Git worktree unchanged' if clean else 'BLOCKED: postflight unexpected Git changes',flush=True)
    return ok


def run(observation: Path, replay: Path | None = None) -> None:
    original=preflight(observation, replay)
    observation=Path(original['observation'])
    began=time.monotonic()
    directory=Path(tempfile.mkdtemp(prefix='masl-25e-review-',dir='/tmp'))
    print('REVIEW DIRECTORY: '+str(directory),flush=True)
    checks:list[dict]=[]
    try:
        tasks = [
            ('2.5 lint',['pnpm','lint'],WEB,(r'Found 0 warnings and 0 errors',),120),
            ('2.5 production build',['pnpm','build'],WEB,(r'✓ built in',),180),
            ('2.5B pure compilation',['pnpm','exec','vite','build','--ssr',
              'src/execution/tool-projection.spec.ts','--outDir',str(directory/'b-pure'),
              '--emptyOutDir'],WEB,(r'✓ built in',),120),
            ('2.5B 42 pure assertions',['node',str(directory/'b-pure'/'tool-projection.spec.js')],
              WEB,(r'42 2\.5B persisted-tool-projection assertions passed',),120),
            ('2.5D pure compilation',['pnpm','exec','vite','build','--ssr',
              'src/execution/message-display.spec.ts','--outDir',str(directory/'d-pure'),
              '--emptyOutDir'],WEB,(r'✓ built in',),120),
            ('2.5D 33 pure assertions',['node',str(directory/'d-pure'/'message-display.spec.js')],
              WEB,(r'33 2\.5D display and streaming-boundary assertions passed',),120),
            ('2.5B projector compilation',['pnpm','exec','vite','build','--ssr',
              'src/execution/tool-projection.ts','--outDir',str(directory/'b-projector'),
              '--emptyOutDir'],WEB,(r'✓ built in',),120),
            ('2.5A observation cross-check',['node',str(ROOT/'scripts/lab-25b-observation-check.mjs'),
              str(directory/'b-projector'/'tool-projection.js'),str(observation)],ROOT,
              (r'PASS: real 2\.5A observation validated',
               r'PASS: projected summary excludes tool args',),120),
            ('2.5C and 2.5D Chromium',['python3',str(ROOT/SELF),'--browser-gate',
              '--replay-evidence',str(replay)] if replay is not None else
              ['python3',str(ROOT/SELF),'--browser-gate','--observation',str(observation)],ROOT,
              (r'6 passed \(',r'PASS: 2\.5C \+ 2\.5D six Chromium cases',
               r'PASS: pinned Runtime stopped before temporary workspace cleanup'),360),
        ]
        for index,(label,args,cwd,patterns,timeout) in enumerate(tasks):
            if index in (3,5,7):
                folder = directory/('b-pure' if index==3 else 'd-pure' if index==5 else 'b-projector')
                ensure((folder/( 'tool-projection.spec.js' if index==3 else 'message-display.spec.js' if index==5 else 'tool-projection.js')).is_file(),
                       f'expected compiled artifact missing before {label}')
                (folder/'package.json').write_text('{"type":"module"}\n',encoding='utf8')
            result=gate(label,args,cwd,directory,patterns,timeout,runtime=(index==8))
            checks.append(result)
            if not result['pass']:
                print('BLOCKED: stopping after first failed gate',flush=True)
                break
    finally:
        completed=report(directory,checks,original,began)
    if not completed:
        raise RuntimeError('2.5E scoped audit blocked; inspect review.json and failing log')
    print('NOTE: review does not modify ROADMAP/CURRENT, commit, push or call models',flush=True)


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    modes=parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--preflight',action='store_true')
    modes.add_argument('--run',action='store_true')
    modes.add_argument('--browser-gate',action='store_true',help=argparse.SUPPRESS)
    modes.add_argument('--reproduce-25a',action='store_true',
                       help='reproduce missing /tmp 2.5A evidence with original graph and ToolNode')
    parser.add_argument('--observation',type=Path,default=DEFAULT_OBSERVATION)
    parser.add_argument('--replay-evidence',type=Path,default=None,
                        help='manifest from --reproduce-25a; keep historical and fresh evidence distinct')
    args=parser.parse_args()
    try:
        if args.reproduce_25a:
            ensure(args.replay_evidence is None,'--reproduce-25a does not accept --replay-evidence')
            reproduce_25a()
        elif args.preflight:
            preflight(args.observation,args.replay_evidence)
            print('PASS: preflight read-only; reviewer remains the only untracked file')
        elif args.browser_gate:
            browser_gate(args.observation,args.replay_evidence)
        else:
            run(args.observation,args.replay_evidence)
    except Exception as error:
        print('BLOCKED: '+str(error),file=sys.stderr,flush=True)
        raise SystemExit(2) from None


if __name__=='__main__':
    main()
