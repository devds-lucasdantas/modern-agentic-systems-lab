#!/usr/bin/env python3
"""MASL 2.6D: scoped AG-UI chunk expansion and consumer enforcement gates.

Reads pinned official AG-UI 1.0 schema from 2.6A evidence, never fetches network,
creates no Run, does not start the Runtime and never touches tracked Git files.
Evidence lives outside the repository; existing Agent Server frontend unchanged.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha1, sha256
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/web'
HEAD = 'aafea9da50c8b062b2f349aeb22489d24aa65575'
REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT = '2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA = '4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB = 'c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA = Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC = 'apps/web/src/ag-ui/chunk-enforcement.ts'
TEST = 'apps/web/src/ag-ui/chunk-enforcement.spec.ts'
RUNNER = 'scripts/lab-26d-chunk-review.py'
EXPECTED_UNTRACKED = sorted([SRC, TEST, RUNNER])
SRC_SHA = '7e5050c9c4483228e4895fd221f3762be419b7a3ac7c627c6d044c52c75fab67'
TEST_SHA = 'd28233167f075b4a68ffc05868655ac3680d034823bb942f8bd88a013f403718'
BLOBS = {
    'ROADMAP.md': '31abcfd442d7b659daf29fcf412269fde39e7404',
    'CURRENT.md': 'f016d1bb1db05d441921a344aac7ae7609255241',
    'docs/journal/lab-23-ag-ui.md': '5847fba38ffbc9307de234a058419c8d98b1e7ec',
    'apps/web/src/ag-ui/event-grammar.ts': 'eb0fa0dff93cbd6eb6eeede956f09aadd6bab773',
    'apps/web/src/ag-ui/stream-boundary.ts': '7e256df756e05a363a4950da17e4ebf98ae8da09',
    'apps/web/src/transport/agent-server/sse.ts': '85b0e8d6abf10068b10fd8bfb3ef0f2414686572',
    'apps/web/src/transport/agent-server/stream-events.ts': '28d5d831d7d89d064fa48619b00a50800c76e42b',
    'apps/web/package.json': '08e11bfa09e78c00fb907b92cd14c486f429dfc4',
    'scripts/lab-26c-stream-review.py': '9ee9ff3115fede28fd2738ee7aa66acbaf4146b6',
}
# Source-verified and pinned official AG-UI 1.0 normative documents.
PROSE_BLOBS = {
    'docs/spec/1.0/basic/processing.mdx': '22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47',
    'docs/spec/1.0/basic/patterns/streaming.mdx': 'f0c2c4c2a30b473c446cfc3ddd91945dfe171a3d',
    'docs/spec/1.0/events/text-messages.mdx': '28a917958cf102d5aff63b586a4f82e31696ca9c',
    'docs/spec/1.0/events/tool-calls.mdx': '62e550f96bcc7699edf62cbb9bd4fc194c49044e',
    'docs/spec/1.0/events/reasoning.mdx': 'c43eb098993ee633a1447e2079347efa1e38dfec',
    'docs/spec/1.0/events/subagents.mdx': 'eafcbcc93d11c7bcc1ea5e5ee16cea3e24056a3a',
    'docs/spec/1.0/events/lifecycle.mdx': '20c1adf5b98da77349c10f5218b1c80be91448e5',
}


def need(ok: bool, message: str) -> None:
    if not ok:
        raise RuntimeError('BLOCKED: ' + message)


def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.check_output(['git', *args], cwd=cwd, text=True,
                                   stderr=subprocess.STDOUT).strip()


def hash_bytes(raw: bytes) -> str:
    return sha256(raw).hexdigest()


def sha(path: Path) -> str:
    return hash_bytes(path.read_bytes())


def blob(raw: bytes) -> str:
    return sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def preflight(schema_path: Path) -> None:
    need(git('rev-parse','HEAD') == HEAD, 'unexpected Git HEAD (expected 2.6C closure)')
    need(git('rev-parse','origin/main') == HEAD, 'origin/main differs from HEAD')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked/staged worktree differs from published baseline')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines()) == EXPECTED_UNTRACKED,
         'untracked scope differs from exactly three 2.6D files')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents') == REFERENCE,
         'reference checkout drifted from pinned commit')
    for path, expected in BLOBS.items():
        need(git('rev-parse',f'HEAD:{path}') == expected, f'Git HEAD blob mismatch: {path}')
        need(git('hash-object',path) == expected, f'tracked worktree blob mismatch: {path}')
    for path, expected in [(SRC,SRC_SHA),(TEST,TEST_SHA)]:
        need(sha(ROOT/path) == expected, f'2.6D payload SHA256 mismatch: {path}')
    need((ROOT/'ROADMAP.md').read_text(encoding='utf8').splitlines().count(
         '  - [ ] 2.6D AG-UI chunk expansion and consumer enforcement boundaries') == 1,
         '2.6D roadmap entry missing or ambiguous')
    need(schema_path.is_file(), 'pinned AG-UI schema missing: '+str(schema_path))
    raw = schema_path.read_bytes()
    need(hash_bytes(raw) == SCHEMA_SHA and blob(raw) == SCHEMA_BLOB,
         'pinned schema SHA-256 / Git blob mismatch')
    schema = json.loads(raw)
    defs = schema.get('$defs',{})
    need(schema.get('$id')=='https://ag-ui.com/spec/1.0/schema.json', 'unexpected schema ID')
    need(len(defs.get('Event',{}).get('oneOf',[])) == 31, 'AG-UI 31-event union changed')
    for name in ('TextMessageChunkEvent','ToolCallChunkEvent','ReasoningMessageChunkEvent',
                 'TextMessageStartEvent','ToolCallStartEvent','ReasoningMessageStartEvent'):
        need(isinstance(defs.get(name),dict), f'official schema definition missing {name}')
    print('PASS: exact aafea9d HEAD/origin, nine Git blobs, pinned reference and three 2.6D payloads',flush=True)
    print('PASS: pinned AG-UI 1.0 schema SHA256/Git blob and 31 events; seven upstream normative prose blob pins',flush=True)
    print('PASS: preflight read-only; no Git, network, Runtime, model or adapter writes',flush=True)


def gate(name: str, command: list[str], cwd: Path, path: Path) -> None:
    with path.open('w', encoding='utf8') as handle:
        try:
            result = subprocess.run(command,cwd=cwd,stdout=handle,stderr=subprocess.STDOUT,text=True,timeout=240)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f'BLOCKED: {name} timed out; see {path}') from None
    need(result.returncode == 0, f'{name} failed, see {path}')
    print(f'PASS: {name} SHA256 {sha(path)}',flush=True)


def run(schema: Path, out: Path) -> None:
    preflight(schema)
    need(not out.exists(), 'output path already exists; provide a new --output-dir: '+str(out))
    need(ROOT not in out.resolve().parents and out.resolve() != ROOT,
         'evidence must be saved outside repository')
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr = out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr','src/ag-ui/chunk-enforcement.spec.ts',
        '--outDir',str(ssr),'--emptyOutDir'],WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf8')
    gate('pure.log',['node',str(ssr/'chunk-enforcement.spec.js')],WEB,out/'pure.log')
    pure = (out/'pure.log').read_text(encoding='utf8')
    match = re.search(r'(?m)^(\d+) 2\.6D consumer enforcement \+ chunk expansion assertions passed\s*$',pure)
    need(match is not None and int(match.group(1)) == 123,
         'expected 123 distinct, model-free 2.6D assertions')
    need(pure.count('PASS: ') == 123, 'test report has duplicate/inconsistent PASS count')
    need(all(x in pure for x in ('chunk-ambiguous-or-unopened','chunk-owner-conflict',
        'unknown future event dropped', 'EOF without terminal is truncated',
        'run-identity-conflict')),'critical 2.6D cases absent')
    preflight(schema)
    evidence = {name:sha(out/name) for name in ('lint.log','build.log','compile.log','pure.log')}
    report = {
        'status':'PASS','lab':'2.6D','baseline':HEAD,'upstream_commit':AGUI_COMMIT,
        'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
        'reference_commit':REFERENCE,'source_sha256':SRC_SHA,'test_sha256':TEST_SHA,
        'assertions':123,'gates':evidence,'prose_blobs':PROSE_BLOBS,
        'boundaries':[
            'top-level closed envelope enforcement, not recursive JSON Schema compliance',
            'three CHUNK types expanded into explicit triads with lane and identifier checks',
            'unknown event types dropped and unknown top-level properties stripped, warnings bounded',
            'known malformed fields and verified explicit lifecycle violations fatal',
            'subagent lifecycle and attribution not fully verified; 2.6C diagnostics remain partial',
            'nested outcomes, ContentPart, JSON Patch and application state not recursively validated',
            'no AG-UI adapter, network, Runtime, model calls, tool execution or frontend imports',
            'frozen canonical ordering is scoped; no generic middleware/downgrade pipeline',
        ],
        'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    md = ['# MASL 2.6D — chunk expansion and consumer enforcement', '',
        f'Baseline: `{HEAD}`; upstream AG-UI 1.0: `{AGUI_COMMIT}`.',
        '', '## PASS — scoped, model-free gates', '',
        f'**123/123** assertions passed. Schema blob: `{SCHEMA_BLOB}`.', '',
        '| Evidence | SHA-256 |','|---|---|']
    md += [f'| `{k}` | `{v}` |' for k,v in evidence.items()]
    md += ['', '## Explicit limits', ''] + [f'- {x}' for x in report['boundaries']]
    md += ['', 'No changes were made to tracked source or the Agent Server frontend.', '']
    (out/'review.md').write_text('\n'.join(md),encoding='utf8')
    print('REVIEW STATUS: PASS — scoped 2.6D chunk expansion and top-level enforcement; 2.6 remains OPEN',flush=True)
    print(f'EVIDENCE DIRECTORY: {out}',flush=True)
    for name in ('review.json','review.md'):
        print(f'EVIDENCE: {name} SHA256 {sha(out/name)}',flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--preflight', action='store_true')
    mode.add_argument('--run', action='store_true')
    parser.add_argument('--schema',type=Path,default=DEFAULT_SCHEMA)
    parser.add_argument('--output-dir',type=Path)
    args=parser.parse_args()
    try:
        if args.preflight:
            preflight(args.schema.resolve())
        else:
            need(args.output_dir is not None, '--run needs --output-dir')
            run(args.schema.resolve(),args.output_dir.resolve())
    except (RuntimeError,ValueError,FileNotFoundError,subprocess.CalledProcessError) as exc:
        print(str(exc) if str(exc).startswith('BLOCKED:') else 'BLOCKED: '+str(exc),file=sys.stderr)
        sys.exit(2)

if __name__ == '__main__':
    main()
