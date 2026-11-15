#!/usr/bin/env python3
"""MASL 2.6F: pinned, model-free selected ContentPart / ownership review.

Preflight reads Git, source, schema and reference only. --run executes four local
non-network gates and writes evidence outside the repo. No Agent Server or
frontend adapter, no model, no media fetch, no Git or tracked file writes.
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
HEAD = '0f2c3456beab1c99933b6ff7b1b417b449fa022c'
REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT = '2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA = '4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB = 'c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
SCHEMA = Path.home() / 'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC = 'apps/web/src/ag-ui/content-ownership.ts'
TEST = 'apps/web/src/ag-ui/content-ownership.spec.ts'
RUNNER = 'scripts/lab-26f-content-review.py'
SRC_SHA = '06da18a4b8fc8ec8617e15d0a904e2abb9babe5f85eefc576e9b3541bf54ede0'
TEST_SHA = '05aa7c59d8cae1ad179b3190ff17bf6e1af6ba2d9ef77325c480f5308fd711a6'
EXPECTED_UNTRACKED = sorted([SRC,TEST,RUNNER])
BLOBS = {
    'ROADMAP.md': 'dcf61b4d7c3140272ca19cd786f7cd2c756b2a15',
    'CURRENT.md': '07f32b7bcec4eef61f009d89a5ebd4c3c5a9eeb8',
    'docs/journal/lab-23-ag-ui.md': 'c9b358ab0c97648ce487e7c7d8fceb0a15bf952e',
    'apps/web/src/ag-ui/nested-state.ts': 'f58bd8185342b23f6d1db4bdf0736699dad91831',
    'apps/web/src/ag-ui/nested-state.spec.ts': '501e5ec1aebb40b9d5623820807be7abd1a7075a',
    'scripts/lab-26e-nested-review.py': '5006f1cf8713ad5d660ec2d54df299d15a0ec389',
    'apps/web/src/ag-ui/chunk-enforcement.ts': 'def432ff9c16f26798054f917db16bfd241bcb04',
    'apps/web/src/ag-ui/event-grammar.ts': 'eb0fa0dff93cbd6eb6eeede956f09aadd6bab773',
    'apps/web/src/ag-ui/stream-boundary.ts': '7e256df756e05a363a4950da17e4ebf98ae8da09',
}
# Exact prose Git blobs verified by source inspection at the same frozen upstream ref.
PROSE_BLOBS = {
    'docs/spec/1.0/basic/processing.mdx': '22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47',
    'docs/spec/1.0/basic/run-input.mdx': '96dabc92854f8bffa423450edff54f83585c4cbf',
    'docs/spec/1.0/events/subagents.mdx': 'eafcbcc93d11c7bcc1ea5e5ee16cea3e24056a3a',
    'docs/spec/1.0/events/tool-calls.mdx': '62e550f96bcc7699edf62cbb9bd4fc194c49044e',
}
ASSERTIONS = 123


def need(ok: bool, reason: str) -> None:
    if not ok:
        raise RuntimeError('BLOCKED: '+reason)


def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.check_output(['git',*args],cwd=cwd,text=True,
                                   stderr=subprocess.STDOUT).strip()


def sha(raw: bytes) -> str:
    return sha256(raw).hexdigest()


def git_blob(raw: bytes) -> str:
    return sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()


def schema_gate(schema_file: Path) -> None:
    need(schema_file.is_file() and not schema_file.is_symlink(),
         'pinned schema absent, not a regular file or symlink: '+str(schema_file))
    raw=schema_file.read_bytes()
    need(sha(raw)==SCHEMA_SHA and git_blob(raw)==SCHEMA_BLOB,
         'pinned AG-UI schema content differs from sha256/Git blob')
    data=json.loads(raw)
    defs=data.get('$defs',{})
    need(data.get('$id')=='https://ag-ui.com/spec/1.0/schema.json', 'schema $id drift')
    need(len(defs.get('Event',{}).get('oneOf',[]))==31, 'event count drift')
    def union(name: str) -> list[str]:
        return [item.get('$ref','').split('/')[-1] for item in defs[name]['oneOf']]
    need(union('ContentPart')==['TextPart','ImagePart','AudioPart','VideoPart','DocumentPart'],
         'pinned ContentPart members drift')
    need(union('PartSource')==['DataSource','UrlSource','FileSource'],
         'pinned PartSource members drift')
    for name,required in {
        'TextPart':['type','text'], 'ImagePart':['type','source'],
        'AudioPart':['type','source'], 'VideoPart':['type','source'],
        'DocumentPart':['type','source'], 'DataSource':['type','value','mimeType'],
        'UrlSource':['type','value'], 'FileSource':['type','value'],
    }.items():
        need(defs[name]['required']==required,f'{name} required fields drift')
    need(defs['DataSource']['properties']['value'].get('contentEncoding')=='base64',
         'data base64 annotation drift')
    need(defs['ToolCall']['properties'].get('subagentRunId') is None,
         'ToolCall unexpectedly declares direct attribution')
    need('subagentRunId' in defs['Attributable']['properties'], 'Attributable drift')
    for name in ('RunStartedEvent','RunFinishedEvent','RunErrorEvent','MessagesSnapshotEvent'):
        allof=defs[name].get('allOf',[])
        need(not any(x.get('$ref','').endswith('/Attributable') for x in allof),
             'run-scoped event now attributable: '+name)
    print('PASS: pinned AG-UI 1.0 schema SHA256/Git blob, 31 events, five ContentParts and three PartSources',flush=True)
    print('PASS: pinned attribution definitions and four upstream prose Git blob IDs',flush=True)


def preflight(schema_file: Path) -> None:
    need(git('rev-parse','HEAD')==HEAD, 'unexpected Git HEAD, expected 2.6E published baseline')
    need(git('rev-parse','origin/main')==HEAD, 'origin/main diverges from exact HEAD')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked worktree or index modified')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'untracked set differs from exact three 2.6F artifacts')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop HEAD drift')
    for path,expected in BLOBS.items():
        need(git('rev-parse','HEAD:'+path)==expected,f'published Git blob mismatch: {path}')
        need(git('hash-object',path)==expected,f'worktree Git blob mismatch: {path}')
    for path,expected in ((SRC,SRC_SHA),(TEST,TEST_SHA)):
        location=ROOT/path
        need(location.is_file() and not location.is_symlink(), 'missing or symlink file: '+path)
        need(sha(location.read_bytes())==expected, 'payload SHA256 drift: '+path)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(), 'runner missing')
    schema_gate(schema_file)
    print('PASS: exact 0f2c345 HEAD/origin, nine Git blobs, pinned workshop and three isolated 2.6F files',flush=True)
    print('PASS: read-only preflight, no Git writes, Runtime/model calls or network fetches',flush=True)


def gate(name: str, cmd: list[str], cwd: Path, output: Path) -> None:
    with output.open('w',encoding='utf-8') as f:
        try:
            p=subprocess.run(cmd,cwd=cwd,stdout=f,stderr=subprocess.STDOUT,
                             text=True,timeout=240,check=False)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f'BLOCKED: {name} timed out; {output}') from None
    need(p.returncode==0,f'{name} failed: {output}')
    print('PASS: '+name+' SHA256 '+sha(output.read_bytes()),flush=True)


def run(schema_file: Path, output: Path) -> None:
    preflight(schema_file)
    repo=ROOT.resolve()
    resolved=output.resolve()
    need(resolved!=repo and repo not in resolved.parents, 'evidence directory must be outside repository')
    need(not output.exists(), 'output exists; refuse overwrite: '+str(output))
    output.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,output/'lint.log')
    gate('build.log',['pnpm','build'],WEB,output/'build.log')
    ssr=output/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
                        'src/ag-ui/content-ownership.spec.ts','--outDir',str(ssr),'--emptyOutDir'],
         WEB,output/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    gate('pure.log',['node',str(ssr/'content-ownership.spec.js')],WEB,output/'pure.log')
    pure=(output/'pure.log').read_text(encoding='utf-8')
    match=re.search(r'(?m)^(\d+) 2\.6F selected content/ownership assertions passed$',pure)
    need(match is not None and int(match.group(1))==ASSERTIONS,
         '2.6F assertion count did not match pinned suite')
    need(pure.count('PASS: ')==ASSERTIONS,'pure log PASS count inconsistent')
    for case in ('unknown source is explicitly unresolved',
                 'cross-owner tool result after end rejected',
                 'state attribution is provenance, not private state',
                 'media-only flatten is empty string with warning',
                 'known invalid later part does not return partial accepted value'):
        need(case in pure, 'expected negative or safety case absent: '+case)
    preflight(schema_file)
    evidence={n:sha((output/n).read_bytes()) for n in ('lint.log','build.log','compile.log','pure.log')}
    report={
      'lab':'2.6F','status':'PASS','scope':'selected content/media and ownership review',
      'published_baseline':HEAD,'reference_commit':REFERENCE,'upstream_commit':AGUI_COMMIT,
      'schema_sha256':SCHEMA_SHA,'schema_git_blob':SCHEMA_BLOB,
      'prose_source_git_blobs':PROSE_BLOBS,'assertions':ASSERTIONS,
      'sources_sha256':{p:sha((ROOT/p).read_bytes()) for p in (SRC,TEST,RUNNER)},
      'gate_logs_sha256':evidence,
      'limits':[
          'No full AG-UI recursive conformance, SDK, media decoder or provider capability negotiation',
          'An unrecognized PartSource type is unresolved due pinned prose tension; not auto-accepted',
          'base64 contentEncoding is a JSON Schema annotation, not validated by this checker',
          'No media download/upload, content logging, authorization, DLP or secrets projection',
          'Selected chronological owner checks do not prove complete streaming or state semantics',
          'No Agent Server adapter, Run POST, Runtime, model or external side effects',
      ],'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (output/'review.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    lines=['# MASL 2.6F — scoped content/media and ownership','',
       f'Published baseline: `{HEAD}`; frozen AG-UI: `{AGUI_COMMIT}`.',
       f'**{ASSERTIONS}/{ASSERTIONS}** synthetic model-free checks passed; four gates PASS.',
       '', '| Gate | SHA-256 |','|---|---|']
    lines += [f'| `{name}` | `{value}` |' for name,value in evidence.items()]
    lines += ['', '## Boundaries', '']+[f'- {value}' for value in report['limits']]
    lines += ['', 'No tracked documentation or Git writes; 2.6 AG-UI remains OPEN.', '']
    (output/'review.md').write_text('\n'.join(lines),encoding='utf-8')
    print('REVIEW STATUS: PASS — selected 2.6F review; parent 2.6 AG-UI remains OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(output),flush=True)
    for n in ('review.json','review.md'):
        print('EVIDENCE: '+n+' SHA256 '+sha((output/n).read_bytes()),flush=True)


def main() -> None:
    p=argparse.ArgumentParser(description=__doc__)
    g=p.add_mutually_exclusive_group(required=True)
    g.add_argument('--preflight',action='store_true')
    g.add_argument('--run',action='store_true')
    p.add_argument('--schema',type=Path,default=SCHEMA)
    p.add_argument('--output-dir',type=Path)
    a=p.parse_args()
    try:
        if a.preflight:
            preflight(a.schema.resolve())
        else:
            need(a.output_dir is not None, '--run requires --output-dir')
            run(a.schema.resolve(),a.output_dir.resolve())
    except (RuntimeError,ValueError,FileNotFoundError,subprocess.CalledProcessError,KeyError,TypeError) as e:
        print(str(e) if str(e).startswith('BLOCKED:') else 'BLOCKED: '+str(e),file=sys.stderr)
        raise SystemExit(2) from None

if __name__=='__main__':main()
