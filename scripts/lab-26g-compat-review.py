#!/usr/bin/env python3
"""MASL Lab 2.6G: isolated AG-UI 1.0 processing / compatibility review.

--preflight is read-only. --run executes four local model-free web build / pure
checks, writing evidence ONLY outside the repo. No Agent Server adapter,
Run POST, models, network fetches, tools, or Git writes are made here.
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
HEAD = 'ff14c7e9f254a92c92ac6b1b6cf956732d2ebb4b'
REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT = '2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA = '4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB = 'c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
SCHEMA = Path.home() / 'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC = 'apps/web/src/ag-ui/compatibility-review.ts'
TEST = 'apps/web/src/ag-ui/compatibility-review.spec.ts'
RUNNER = 'scripts/lab-26g-compat-review.py'
SRC_SHA = 'ab5b59b04f35b83027b2a0da0b448276eb551916ccd40bb26e40ced8fd4ec09a'
TEST_SHA = 'ffbf640b32123cd4e128c1c783ddfb6175014b9528ffabcb49100b5590153c03'
ASSERTIONS = 124
EXPECTED_UNTRACKED = sorted((SRC, TEST, RUNNER))
BLOBS = {
    'ROADMAP.md': 'e394cfa17ddce471bf5e9582d28cfbcabaa4cbb5',
    'CURRENT.md': '67673faf1c4062a669b80d698777e4ea2ac3779f',
    'docs/journal/lab-23-ag-ui.md': '7642fed7128be60432377d29a8b142ababc5d954',
    'apps/web/src/ag-ui/chunk-enforcement.ts': 'def432ff9c16f26798054f917db16bfd241bcb04',
    'apps/web/src/ag-ui/content-ownership.ts': '0caef8c958ea7cb186bbedb3aecac6f6587f2e3c',
    'apps/web/src/ag-ui/nested-state.ts': 'f58bd8185342b23f6d1db4bdf0736699dad91831',
    'apps/web/src/ag-ui/event-grammar.ts': 'eb0fa0dff93cbd6eb6eeede956f09aadd6bab773',
    'apps/web/src/transport/agent-server/sse.ts': '85b0e8d6abf10068b10fd8bfb3ef0f2414686572',
    'scripts/lab-26f-content-review.py': 'bad771ae4c0ea9bce8a73cce97b99f58e53306c3',
}
# Source-verified normative files at the frozen upstream commit.
PROSE_BLOBS = {
    'docs/spec/1.0/basic/processing.mdx': '22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47',
    'docs/spec/1.0/basic/versioning.mdx': '860f82956864d5fcf29cb7d1e2993e315f03ff59',
    'docs/spec/1.0/basic/run-input.mdx': '96dabc92854f8bffa423450edff54f83585c4cbf',
    'docs/spec/1.0/events/subagents.mdx': 'eafcbcc93d11c7bcc1ea5e5ee16cea3e24056a3a',
}


def need(ok: bool, msg: str) -> None:
    if not ok:
        raise RuntimeError('BLOCKED: '+msg)


def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.check_output(['git', *args], cwd=cwd, text=True,
                                   stderr=subprocess.STDOUT).strip()


def sha(raw: bytes) -> str:
    return sha256(raw).hexdigest()


def blob(raw: bytes) -> str:
    return sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()


def schema_gate(path: Path) -> None:
    need(path.is_file() and not path.is_symlink(), 'pinned schema missing or symlink: '+str(path))
    raw = path.read_bytes()
    need(sha(raw) == SCHEMA_SHA and blob(raw) == SCHEMA_BLOB,
         'pinned AG-UI schema SHA256 / Git blob changed')
    d = json.loads(raw)
    defs = d['$defs']
    need(d.get('$id') == 'https://ag-ui.com/spec/1.0/schema.json', '$id changed')
    need(len(defs['Event']['oneOf']) == 31, '31-event union changed')
    need([v['$ref'].split('/')[-1] for v in defs['ContentPart']['oneOf']] ==
         ['TextPart', 'ImagePart', 'AudioPart', 'VideoPart', 'DocumentPart'],
         'ContentPart union changed')
    need([v['$ref'].split('/')[-1] for v in defs['PartSource']['oneOf']] ==
         ['DataSource', 'UrlSource', 'FileSource'], 'PartSource union changed')
    need(defs['RunAgentInput']['properties']['protocolVersion']['type'] == 'string',
         'version input schema changed')
    need(defs['RunStartedEvent']['properties']['protocolVersion']['type'] == 'string',
         'producer version declaration schema changed')
    need(defs['DataSource']['properties']['value']['contentEncoding'] == 'base64',
         'data base64 annotation changed')
    print('PASS: frozen AG-UI 1.0 schema SHA256/Git blob, 31 events, version declarations, ContentPart/PartSource', flush=True)
    print('PASS: four source-reviewed AG-UI prose Git blob pins', flush=True)


def preflight(schema: Path) -> None:
    need(git('rev-parse', 'HEAD') == HEAD, 'HEAD diverged from published 2.6F closure')
    need(git('rev-parse', 'origin/main') == HEAD, 'origin/main diverged from expected baseline')
    need(not git('diff', '--name-only') and not git('diff', '--cached', '--name-only'),
         'tracked files or index changed')
    need(sorted(git('ls-files', '--others', '--exclude-standard').splitlines()) == EXPECTED_UNTRACKED,
         'unexpected untracked files in repository')
    need(git('rev-parse', 'HEAD', cwd=ROOT/'.reference/interrupt26-deepagents') == REFERENCE,
         'pinned workshop checkout changed')
    for p, expected in BLOBS.items():
        need(git('rev-parse', 'HEAD:'+p) == expected, 'published Git blob drift: '+p)
        need(git('hash-object', p) == expected, 'worktree Git blob drift: '+p)
    for p, expected in ((SRC, SRC_SHA), (TEST, TEST_SHA)):
        item = ROOT / p
        need(item.is_file() and not item.is_symlink() and sha(item.read_bytes()) == expected,
             '2.6G payload SHA256 drift or missing: '+p)
    item = ROOT / RUNNER
    need(item.is_file() and not item.is_symlink(), 'reviewer missing')
    schema_gate(schema)
    print('PASS: exact ff14c7e HEAD/origin, nine blobs, pinned workshop and three 2.6G files', flush=True)
    print('PASS: read-only preflight; no Runtime, model, Git write or network fetch', flush=True)


def gate(name: str, cmd: list[str], cwd: Path, log: Path) -> None:
    with log.open('w', encoding='utf-8') as handle:
        try:
            result = subprocess.run(cmd, cwd=cwd, stdout=handle,
                                    stderr=subprocess.STDOUT, text=True,
                                    timeout=240, check=False)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f'BLOCKED: {name} timed out, see {log}') from None
    need(result.returncode == 0, f'{name} failed: {log}')
    print(f'PASS: {name} SHA256 {sha(log.read_bytes())}', flush=True)


def run(schema: Path, out: Path) -> None:
    preflight(schema)
    repo, target = ROOT.resolve(), out.resolve()
    need(target != repo and repo not in target.parents, 'evidence must be outside Git repository')
    need(not out.exists(), 'refusing to overwrite existing evidence: '+str(out))
    out.mkdir(parents=True)
    gate('lint.log', ['pnpm', 'lint'], WEB, out/'lint.log')
    gate('build.log', ['pnpm', 'build'], WEB, out/'build.log')
    ssr = out/'ssr'
    gate('compile.log', ['pnpm','exec','vite','build','--ssr',
         'src/ag-ui/compatibility-review.spec.ts','--outDir',str(ssr),'--emptyOutDir'],
         WEB, out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    gate('pure.log', ['node', str(ssr/'compatibility-review.spec.js')], WEB, out/'pure.log')
    pure = (out/'pure.log').read_text(encoding='utf-8')
    found = re.search(r'(?m)^(\d+) 2\.6G selected processing/compatibility assertions passed\s*$', pure)
    need(found is not None and int(found.group(1)) == ASSERTIONS, 'expected 124 selected assertions')
    need(pure.count('PASS: ') == ASSERTIONS, 'pure log PASS count differs from 124')
    for case in ('unrecognized PartSource kept unresolved',
                 'LAB-ONLY retired shape translated before enforcement',
                 'middleware observes before enforcement strips',
                 'known malformed is fatal without partial output',
                 'unknown events dropped including prototype name',
                 'lossy media warning per dropped part'):
        need(case in pure, 'critical case not found in pure log: '+case)
    preflight(schema)
    gates = {name:sha((out/name).read_bytes()) for name in ('lint.log','build.log','compile.log','pure.log')}
    report = {
      'lab':'2.6G', 'status':'PASS', 'baseline':HEAD,
      'scope':'selected pure processing/versioning/downgrade and conformance-gap review',
      'upstream_commit':AGUI_COMMIT,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
      'reference_commit':REFERENCE,'prose_blobs':PROSE_BLOBS,
      'assertions':ASSERTIONS, 'gate_logs_sha256':gates,
      'sources_sha256':{p:sha((ROOT/p).read_bytes()) for p in (SRC,TEST,RUNNER)},
      'gaps_open':9,
      'limits':[
        'Synthetic lab-only retired fixture is not an actual AG-UI deprecated shape',
        'Pipeline stage trace does not implement generic middleware, chunk expansion, verification or transport',
        'Selected known types do not establish full recursive schema conformance',
        'Unknown PartSource conflict remains unresolved between pinned prose sections',
        'Version review does not implement complete peer negotiation or actual major rejection policy',
        'Selected user/tool downgrade is a text-only demonstration, not a generic shim or DLP',
        'No media/network access, Agent Server adapter, Runtime, model, tool, authorization or production guarantees',
      ],
      'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines = ['# MASL 2.6G — selected processing and compatibility review','',
      f'Baseline: `{HEAD}`; AG-UI upstream: `{AGUI_COMMIT}`.','',
      f'**{ASSERTIONS}/{ASSERTIONS}** pure model-free assertions passed; four gates PASS.','',
      '| Gate | SHA-256 |','|---|---|',
      *[f'| `{k}` | `{v}` |' for k,v in gates.items()],
      '', '## Limitations / gaps','',
      *[f'- {x}' for x in report['limits']],
      '', 'Nine conformance gaps remain open; parent milestone 2.6 AG-UI stays OPEN.','']
    (out/'review.md').write_text('\n'.join(lines),encoding='utf-8')
    print('REVIEW STATUS: PASS — selected 2.6G processing/compatibility; 2.6 remains OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)
    for name in ('review.json','review.md'):
        print('EVIDENCE: '+name+' SHA256 '+sha((out/name).read_bytes()),flush=True)


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--preflight',action='store_true')
    group.add_argument('--run',action='store_true')
    parser.add_argument('--schema',type=Path,default=SCHEMA)
    parser.add_argument('--output-dir',type=Path)
    args=parser.parse_args()
    try:
        if args.preflight:
            preflight(args.schema.resolve())
        else:
            need(args.output_dir is not None, '--run requires --output-dir')
            run(args.schema.resolve(),args.output_dir.resolve())
    except (RuntimeError,ValueError,FileNotFoundError,subprocess.CalledProcessError,KeyError,TypeError) as exc:
        msg=str(exc)
        print(msg if msg.startswith('BLOCKED:') else 'BLOCKED: '+msg,file=sys.stderr)
        raise SystemExit(2) from None

if __name__=='__main__':
    main()
