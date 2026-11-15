#!/usr/bin/env python3
"""MASL 2.6C: pinned, read-only AG-UI 1.0 SSE/lifecycle boundary review.

No Run POST, AG-UI adapter, external model, network, AG-UI package install,
Git mutation or historical script modification. Reports live outside repo.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha1, sha256
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/web'
HEAD = 'b363c24f2163d3ceebad44004074ad2c790841e9'
REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT = '2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA = '4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB = 'c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
SCHEMA_PATH = Path.home() / 'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC = 'apps/web/src/ag-ui/stream-boundary.ts'
TEST = 'apps/web/src/ag-ui/stream-boundary.spec.ts'
RUNNER = 'scripts/lab-26c-stream-review.py'
UNTRACKED = sorted([SRC, TEST, RUNNER])
# Frozen Git objects from the published 2.6B checkpoint.
BLOBS = {
    'ROADMAP.md': '2326c2149816afe7a8f67abaac461e8f36434ecd',
    'CURRENT.md': 'ec94b6f74cdd992d97cc77f46a6791d757929556',
    'docs/journal/lab-23-ag-ui.md': 'ba01de368d996071ae155479f8392543eedebe20',
    'apps/web/src/ag-ui/event-grammar.ts': 'eb0fa0dff93cbd6eb6eeede956f09aadd6bab773',
    'apps/web/src/ag-ui/event-grammar.spec.ts': '32835e6cead17e6b4b9b63089bbee40aca10554d',
    'apps/web/src/transport/agent-server/sse.ts': '85b0e8d6abf10068b10fd8bfb3ef0f2414686572',
    'apps/web/package.json': '08e11bfa09e78c00fb907b92cd14c486f429dfc4',
}
# Upstream AG-UI 1.0 normative prose read at the same pinned commit.
PROSE_BLOBS = {
    'docs/spec/1.0/basic/transports/http-sse.mdx': '993b465d9e6a849fa3a616eb599c16671fccafcb',
    'docs/spec/1.0/basic/transports/index.mdx': '99734a94fe3a570d645d30fb07d4a550a80c217e',
    'docs/spec/1.0/events/lifecycle.mdx': '20c1adf5b98da77349c10f5218b1c80be91448e5',
    'docs/spec/1.0/basic/patterns/streaming.mdx': 'f0c2c4c2a30b473c446cfc3ddd91945dfe171a3d',
    'docs/spec/1.0/basic/processing.mdx': '22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47',
    'docs/spec/1.0/basic/versioning.mdx': '860f82956864d5fcf29cb7d1e2993e315f03ff59',
}
# Populated from exact package bytes by the package builder.
SOURCE_SHA = 'c9b4dbfc8f4bb44ebca95d5a44a6520d260276239899c614211e68bbc8e34db2'
TEST_SHA = '080d7398fcddf37bd9542a476d1118d1ede5911a794320a8fc832f67e0c6d2e3'


def require(ok: bool, message: str) -> None:
    if not ok:
        raise RuntimeError('BLOCKED: ' + message)


def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.check_output(['git', *args], cwd=cwd, text=True,
                                   stderr=subprocess.STDOUT).strip()


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def blob(data: bytes) -> str:
    return sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def preflight(schema_path: Path) -> None:
    require(git('rev-parse', 'HEAD') == HEAD, 'unexpected HEAD (expected 2.6B closure)')
    require(git('rev-parse', 'origin/main') == HEAD, 'origin/main mismatch')
    require(not git('diff', '--name-only') and not git('diff', '--cached', '--name-only'),
            'tracked or staged changes found')
    require(sorted(git('ls-files', '--others', '--exclude-standard').splitlines()) == UNTRACKED,
            'untracked scope differs from exactly three 2.6C files')
    require(git('rev-parse', 'HEAD', cwd=ROOT/'.reference/interrupt26-deepagents') == REFERENCE,
            'pinned reference drift')
    for name, expected in BLOBS.items():
        require(git('rev-parse', f'HEAD:{name}') == expected, f'Git blob mismatch: {name}')
        require(git('hash-object', name) == expected, f'worktree blob mismatch: {name}')
    require(git('hash-object', SRC) == blob((ROOT/SRC).read_bytes()), 'source hashing failed')
    require(digest(ROOT/SRC) == SOURCE_SHA, '2.6C source hash mismatch')
    require(digest(ROOT/TEST) == TEST_SHA, '2.6C test hash mismatch')
    require((ROOT/'ROADMAP.md').read_text().splitlines().count(
        '  - [ ] 2.6C AG-UI streaming and lifecycle contract discovery') == 1,
        '2.6C roadmap boundary missing')
    require(schema_path.is_file(), 'original pinned AG-UI 1.0 schema absent: ' + str(schema_path))
    raw = schema_path.read_bytes()
    require(sha256(raw).hexdigest() == SCHEMA_SHA and blob(raw) == SCHEMA_BLOB,
            'AG-UI schema SHA-256 / Git blob differs from 2.6A pin')
    schema = json.loads(raw)
    require(schema.get('$id') == 'https://ag-ui.com/spec/1.0/schema.json',
            'unexpected AG-UI schema id')
    event = schema.get('$defs',{}).get('Event',{})
    require(len(event.get('oneOf',[])) == 31, 'not the pinned AG-UI 31-event union')
    print('PASS: exact 2.6B HEAD/origin, seven Git blobs, pinned reference and three scoped 2.6C files',flush=True)
    print('PASS: AG-UI 1.0 schema SHA-256 / Git blob; 31 events; six pinned normative prose blob IDs',flush=True)
    print('PASS: --preflight read-only; no network, adapter, Runtime, model or Git operations',flush=True)


def execute(cmd: list[str], cwd: Path, dest: Path) -> None:
    with dest.open('w', encoding='utf8') as handle:
        result = subprocess.run(cmd, cwd=cwd, text=True, stdout=handle, stderr=subprocess.STDOUT)
    require(result.returncode == 0, f'{dest.name} failed; inspect {dest}')
    print(f'PASS: {dest.name} SHA256 {digest(dest)}',flush=True)


def main() -> None:
    p = argparse.ArgumentParser()
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument('--preflight', action='store_true')
    group.add_argument('--run', action='store_true')
    p.add_argument('--schema', type=Path, default=SCHEMA_PATH)
    p.add_argument('--output-dir', type=Path)
    args = p.parse_args()
    preflight(args.schema)
    if args.preflight:
        return
    require(args.output_dir is not None, '--output-dir required for --run')
    target = args.output_dir.expanduser().resolve()
    require(not target.is_relative_to(ROOT.resolve()), 'evidence must be outside repository')
    require(not target.exists(), 'refusing to overwrite existing evidence directory')
    target.mkdir(parents=True, exist_ok=False)
    ssr = target / 'ssr'
    runlog = target / 'lint.log'
    execute(['pnpm', 'lint'], WEB, runlog)
    execute(['pnpm', 'build'], WEB, target/'build.log')
    execute(['pnpm','exec','vite','build','--ssr','src/ag-ui/stream-boundary.spec.ts',
             '--outDir',str(ssr),'--emptyOutDir'], WEB, target/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n', encoding='utf8')
    execute(['node', str(ssr/'stream-boundary.spec.js')], WEB, target/'pure.log')
    log = (target/'pure.log').read_text()
    match = re.search(r'(\d+) 2\.6C HTTP/SSE and lifecycle assertions passed', log)
    require(match is not None and int(match.group(1)) >= 50,
            '2.6C assertion tally missing or too small')
    require('FAIL:' not in log, 'test failures appeared in log')
    # Repeat the preflight after all build/tests: working-tree scoped read-only.
    preflight(args.schema)
    logs = {x: digest(target/x) for x in ('lint.log','build.log','compile.log','pure.log')}
    report = {
        'lab':'2.6C', 'status':'PASS',
        'generated_at_utc':datetime.now(timezone.utc).isoformat(),
        'baseline_commit':HEAD,'schema_commit':AGUI_COMMIT,'schema_sha256':SCHEMA_SHA,
        'schema_git_blob':SCHEMA_BLOB, 'source_sha256':SOURCE_SHA,'test_sha256':TEST_SHA,
        'prose_git_blobs':PROSE_BLOBS, 'assertions':int(match.group(1)),
        'gate_logs_sha256':logs,
        'boundaries':[
            'isolated structural inspection; no frontend AG-UI adapter or Run POST',
            'existing Agent Server SSE parser reused for framing tests only, not protocol authority',
            'envelope-only 2.6B validator; no full nested JSON Schema compliance',
            'chunks and subagent streams explicitly uncovered; no complete conformance claim',
            'unknown additions require enforcement/stripping by a future consumer',
            'no HTTP network exchange, model call, side effect, tool authorization or persistence checked',
            'no Last-Event-ID based AG-UI stream resumption, no invented terminal success',
        ],
    }
    (target/'review.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n', encoding='utf8')
    lines = [
        '# MASL 2.6C — AG-UI HTTP/SSE and lifecycle contract review',
        '', 'Result: **PASS within the scoped gates**.',
        '', f'- Baseline: `{HEAD}`', f'- Pinned AG-UI schema Git blob: `{SCHEMA_BLOB}`',
        f'- Deterministic pure checks: **{match.group(1)}**',
        '- Four gates: lint, production build, isolated SSR test compilation and pure test run',
        '', '## Evidence hashes', '',
        *[f'- `{k}`: `{v}`' for k,v in logs.items()],
        '', '## Source contract pin', '',
        *[f'- `{k}`: `{v}`' for k,v in PROSE_BLOBS.items()],
        '', '## Limitations', '',
        *[f'- {x}' for x in report['boundaries']], '',
        '**2.6C is a partial transport/lifecycle contract gate; parent 2.6 remains OPEN.**',
    ]
    (target/'review.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print('REVIEW STATUS: PASS — scoped 2.6C AG-UI HTTP/SSE and explicit lifecycle; 2.6 remains OPEN',flush=True)
    for name in ('review.json','review.md'):
        print('EVIDENCE: '+str(target/name)+' SHA256 '+digest(target/name),flush=True)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, OSError, ValueError) as exc:
        print(str(exc),file=sys.stderr)
        sys.exit(1)
