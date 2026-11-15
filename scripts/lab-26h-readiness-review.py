#!/usr/bin/env python3
"""MASL 2.6H isolated normative gap decisions / adapter-readiness gate.

--preflight is read-only and pinned. --run writes six evidence files only into
an initially absent directory OUTSIDE Git. Four local web build/test gates;
no Agent Server adapter, protocol middleware, media fetch, network, Runtime,
model/tool calls, Git mutation, tracked file edit or external deployment.
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
HEAD = 'caf79c88ddb1d04e3814a74e22d1f2ad9d060e9a'
REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT = '2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA = '4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB = 'c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
SCHEMA = Path.home() / 'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC = 'apps/web/src/ag-ui/gap-readiness.ts'
TEST = 'apps/web/src/ag-ui/gap-readiness.spec.ts'
RUNNER = 'scripts/lab-26h-readiness-review.py'
SRC_SHA = 'c860b7d8616bd542bc0f4d27eaba82532b16cc7881c75169fc08109043a59da6'
TEST_SHA = '7e3a7734827b72db4288eece48229e0f3eed672615bee001ab2fbf56e90ef1e8'
ASSERTIONS = 198
EXPECTED_UNTRACKED = sorted((SRC, TEST, RUNNER))
BLOBS = {
    'ROADMAP.md': 'f7ca3c3ef47ede5292a9d1a41ccf4598d58db69b',
    'CURRENT.md': '41522a4abf9ac5f0c1dc50e5b3d3baebd262f5de',
    'docs/journal/lab-23-ag-ui.md': 'a3944d18560b90cd926743b2d8b87d2c91a703f3',
    'apps/web/src/ag-ui/compatibility-review.ts': '36fd07559dca60a8fd1da1401d71816647ddae2b',
    'apps/web/src/ag-ui/content-ownership.ts': '0caef8c958ea7cb186bbedb3aecac6f6587f2e3c',
    'apps/web/src/ag-ui/nested-state.ts': 'f58bd8185342b23f6d1db4bdf0736699dad91831',
    'apps/web/src/ag-ui/chunk-enforcement.ts': 'def432ff9c16f26798054f917db16bfd241bcb04',
    'apps/web/src/ag-ui/event-grammar.ts': 'eb0fa0dff93cbd6eb6eeede956f09aadd6bab773',
    'apps/web/src/transport/agent-server/sse.ts': '85b0e8d6abf10068b10fd8bfb3ef0f2414686572',
}
# Pins source-reviewed at AGUI_COMMIT. These are metadata references, not
# downloaded/reverified in --preflight (which must not fetch the network).
PROSE_BLOBS = {
    'docs/spec/1.0/basic/processing.mdx': '22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47',
    'docs/spec/1.0/basic/versioning.mdx': '860f82956864d5fcf29cb7d1e2993e315f03ff59',
    'docs/spec/1.0/basic/run-input.mdx': '96dabc92854f8bffa423450edff54f83585c4cbf',
    'docs/spec/1.0/basic/transports/http-sse.mdx': '993b465d9e6a849fa3a616eb599c16671fccafcb',
}
CRITICAL = (
    'G1 needs upstream clarification',
    'G4 deliberately excludes multi-transport',
    'G9 requires independent adapter design',
    'syntactically plausible claim accepted only as metadata',
    'nine claimed hashes cannot promote readiness',
    'parent milestone cannot auto-close',
    'unrecognized future-source is explicitly unresolved',
)


def need(ok: bool, message: str) -> None:
    if not ok:
        raise RuntimeError('BLOCKED: ' + message)


def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.check_output(['git', *args], cwd=cwd, text=True,
                                   stderr=subprocess.STDOUT).strip()


def sha(raw: bytes) -> str:
    return sha256(raw).hexdigest()


def blob(raw: bytes) -> str:
    return sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def schema_gate(path: Path) -> None:
    need(path.is_file() and not path.is_symlink(), 'missing/unsafe pinned schema: ' + str(path))
    raw = path.read_bytes()
    need(sha(raw) == SCHEMA_SHA and blob(raw) == SCHEMA_BLOB,
         'pinned schema SHA-256/Git blob changed')
    defs = json.loads(raw)['$defs']
    need(len(defs['Event']['oneOf']) == 31, 'event union changed')
    need([d['$ref'].rsplit('/', 1)[-1] for d in defs['PartSource']['oneOf']]
         == ['DataSource', 'UrlSource', 'FileSource'], 'PartSource pin changed')
    need([d['$ref'].rsplit('/', 1)[-1] for d in defs['ContentPart']['oneOf']]
         == ['TextPart', 'ImagePart', 'AudioPart', 'VideoPart', 'DocumentPart'],
         'ContentPart pin changed')
    print('PASS: pinned official AG-UI 1.0 schema SHA-256/Git blob and selected unions', flush=True)


def preflight(schema: Path) -> None:
    need(git('symbolic-ref', '--quiet', '--short', 'HEAD') == 'main', 'not on main')
    need(git('rev-parse', 'HEAD') == HEAD, 'HEAD differs from published 2.6G baseline')
    need(git('rev-parse', 'origin/main') == HEAD, 'origin/main differs from baseline')
    need(not git('diff', '--name-only') and not git('diff', '--cached', '--name-only'),
         'tracked or staged changes present')
    need(sorted(git('ls-files', '--others', '--exclude-standard').splitlines()) == EXPECTED_UNTRACKED,
         'untracked set differs from expected three 2.6H files')
    need(git('rev-parse', 'HEAD', cwd=ROOT/'.reference/interrupt26-deepagents') == REFERENCE,
         'pinned workshop reference HEAD drift')
    for rel, expected in BLOBS.items():
        need(git('rev-parse', 'HEAD:' + rel) == expected,
             'published Git blob mismatch: ' + rel)
        need(git('hash-object', rel) == expected,
             'worktree tracked Git blob mismatch: ' + rel)
    for rel, expected in ((SRC, SRC_SHA), (TEST, TEST_SHA)):
        file = ROOT / rel
        need(file.is_file() and not file.is_symlink() and sha(file.read_bytes()) == expected,
             'payload missing or SHA-256 drift: ' + rel)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(), 'reviewer missing/unsafe')
    roadmap = (ROOT/'ROADMAP.md').read_text(encoding='utf-8')
    need(roadmap.splitlines().count('- [ ] 2.6 AG-UI') == 1,
         'milestone parent 2.6 no longer OPEN')
    need(roadmap.splitlines().count('  - [ ] 2.6H AG-UI normative gap decisions and adapter-readiness review') == 1,
         'expected next 2.6H roadmap marker absent')
    schema_gate(schema)
    print('PASS: exact caf79c8 HEAD/origin, nine Git blobs, pinned workshop, three 2.6H files', flush=True)
    print('PASS: preflight read-only, no network, Git writes, Runtime/model calls or tools', flush=True)


def gate(name: str, cmd: list[str], cwd: Path, output: Path) -> None:
    with output.open('w', encoding='utf-8') as handle:
        try:
            finished = subprocess.run(cmd, cwd=cwd, stdout=handle,
                                      stderr=subprocess.STDOUT, timeout=240, check=False)
        except subprocess.TimeoutExpired:
            raise RuntimeError('BLOCKED: gate timeout: ' + name) from None
    need(finished.returncode == 0, 'gate failed: ' + name + ' at ' + str(output))
    print('PASS: ' + name + ' SHA256 ' + sha(output.read_bytes()), flush=True)


def run(schema: Path, out: Path) -> None:
    preflight(schema)
    repo = ROOT.resolve()
    target = out.resolve()
    need(target != repo and repo not in target.parents,
         'evidence output must be outside repository')
    need(not out.exists(), 'refusing evidence overwrite: ' + str(out))
    out.mkdir(parents=True)
    gate('lint.log', ['pnpm', 'lint'], WEB, out/'lint.log')
    gate('build.log', ['pnpm', 'build'], WEB, out/'build.log')
    ssr = out/'ssr'
    gate('compile.log', ['pnpm', 'exec', 'vite', 'build', '--ssr',
                         'src/ag-ui/gap-readiness.spec.ts', '--outDir', str(ssr), '--emptyOutDir'],
         WEB, out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n', encoding='utf-8')
    gate('pure.log', ['node', str(ssr/'gap-readiness.spec.js')], WEB, out/'pure.log')
    pure = (out/'pure.log').read_text(encoding='utf-8')
    match = re.search(r'(?m)^(\d+) 2\.6H selected readiness/decisions assertions passed\s*$',pure)
    need(match is not None and int(match.group(1)) == ASSERTIONS,
         '2.6H expected 198 pure assertions')
    need(pure.count('PASS: ') == ASSERTIONS, 'pure PASS count mismatch')
    for phrase in CRITICAL:
        need(phrase in pure, 'critical case missing from pure test output: ' + phrase)
    preflight(schema)
    hashes = {name:sha((out/name).read_bytes()) for name in
              ('lint.log', 'build.log', 'compile.log', 'pure.log')}
    report = {
        'lab':'2.6H', 'status':'PASS',
        'published_baseline':HEAD, 'reference_commit':REFERENCE,
        'upstream_commit':AGUI_COMMIT, 'schema_sha256':SCHEMA_SHA,
        'schema_blob':SCHEMA_BLOB, 'prose_git_blobs':PROSE_BLOBS,
        'scope':'selected model-free decision/evidence register; no independent proof',
        'assertions':ASSERTIONS, 'gap_ids_open':['G'+str(i) for i in range(1,10)],
        'gate_logs_sha256':hashes,
        'sources_sha256':{rel:sha((ROOT/rel).read_bytes()) for rel in (SRC, TEST, RUNNER)},
        'readiness':{'planning_only':True,'production_ready':False,
                     'adapter_implemented':False,'parent_2_6_open':True},
        'limits':[
            'No gap closed or independently verified by a self-attested evidence declaration',
            'G1 PartSource conflict remains unresolved; normative escalation recommended',
            'G4 single JSON/SSE scoping is not multi-transport or protobuf conformance',
            'No real adapter, middleware, model, tool, media, auth or deployment executed',
            'No production approval, DLP proof, performance, security or concurrent persistence evidence',
        ],
        'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines = ['# MASL 2.6H — normative gap decisions and adapter-readiness review','',
        f'Published baseline: `{HEAD}`; pinned AG-UI: `{AGUI_COMMIT}`.','',
        f'**{ASSERTIONS}/{ASSERTIONS}** model-free pure assertions passed; four gates PASS.','',
        'Decision register covers G1–G9; all remain OPEN. This review is NOT',
        'independent evidence of resolution or permission to implement/deploy an adapter.','',
        '| Gate | SHA-256 |','|---|---|',
        *[f'| `{name}` | `{digest}` |' for name,digest in hashes.items()],
        '', '## Decision limitations','',
        *[f'- {limit}' for limit in report['limits']],
        '', '**Milestone 2.6 remains OPEN; adapter readiness BLOCKED.**','']
    (out/'review.md').write_text('\n'.join(lines), encoding='utf-8')
    print('REVIEW STATUS: PASS — selected 2.6H decision-register checks; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out), flush=True)
    for name in ('review.json','review.md'):
        print('EVIDENCE: '+name+' SHA256 '+sha((out/name).read_bytes()),flush=True)


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    modes=parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--preflight',action='store_true')
    modes.add_argument('--run',action='store_true')
    parser.add_argument('--schema',type=Path,default=SCHEMA)
    parser.add_argument('--output-dir',type=Path)
    args=parser.parse_args()
    try:
        if args.preflight:
            preflight(args.schema)
        else:
            need(args.output_dir is not None, '--run requires --output-dir')
            run(args.schema, args.output_dir)
    except (RuntimeError,ValueError,TypeError,KeyError,FileNotFoundError,
            subprocess.CalledProcessError,PermissionError) as exc:
        reason=str(exc)
        print(reason if reason.startswith('BLOCKED:') else 'BLOCKED: '+reason,file=sys.stderr)
        raise SystemExit(2) from None

if __name__=='__main__':
    main()
