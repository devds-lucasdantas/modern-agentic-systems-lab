#!/usr/bin/env python3
"""MASL 2.6E: pinned selected nested AG-UI/state/subagent pure review.

No AG-UI adapter, network, model, Agent Server Runtime, Git writes or real tools.
All evidence lives outside the repository. Strict immutable baseline gates.
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
BASELINE = 'f8f6a1a5618c4d9155c16b10e4b3294baa9956a9'
REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT = '2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA = '4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB = 'c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA = Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC = 'apps/web/src/ag-ui/nested-state.ts'
TEST = 'apps/web/src/ag-ui/nested-state.spec.ts'
RUNNER = 'scripts/lab-26e-nested-review.py'
EXPECTED_UNTRACKED = sorted([SRC, TEST, RUNNER])
SRC_SHA = 'e449efcfceddd3eb698947343e6f93cd5660d66c27b6e246000787e809f3f6be'
TEST_SHA = '2217f8defa0311c32bb6c2ba3bd830401ced2b3d53c4b6a293dbbc6f558c4562'
BLOBS = {
    'ROADMAP.md': 'af46314407f329d3ce34b543ce4ed6d7cebb3611',
    'CURRENT.md': '3326dcbbfd827405e03e87471dc472d447ada363',
    'docs/journal/lab-23-ag-ui.md': '8bd2d3f805a639ccfbcc5e3ef9fdbd5bcb875681',
    'apps/web/src/ag-ui/chunk-enforcement.ts': 'def432ff9c16f26798054f917db16bfd241bcb04',
    'apps/web/src/ag-ui/stream-boundary.ts': '7e256df756e05a363a4950da17e4ebf98ae8da09',
    'apps/web/src/ag-ui/event-grammar.ts': 'eb0fa0dff93cbd6eb6eeede956f09aadd6bab773',
    'apps/web/src/transport/agent-server/sse.ts': '85b0e8d6abf10068b10fd8bfb3ef0f2414686572',
    'apps/web/package.json': '08e11bfa09e78c00fb907b92cd14c486f429dfc4',
    'scripts/lab-26d-chunk-review.py': '00979847e66ad6584f2dfdbdd6170fa3141ad757',
}
PROSE_BLOBS = {
    'docs/spec/1.0/events/state.mdx': '898e7b269871c9b273335bb542d16a4f77c1d0f7',
    'docs/spec/1.0/basic/patterns/snapshots.mdx': 'a9894d54be0e656ab9409d524fff0bb6794c8a4e',
    'docs/spec/1.0/basic/run-input.mdx': '96dabc92854f8bffa423450edff54f83585c4cbf',
    'docs/spec/1.0/events/subagents.mdx': 'eafcbcc93d11c7bcc1ea5e5ee16cea3e24056a3a',
    'docs/spec/1.0/basic/patterns/interrupt-resume.mdx': '43907a25c837d93fa04bf6f9413f73a67f21e084',
    'docs/spec/1.0/basic/processing.mdx': '22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47',
    'docs/spec/1.0/basic/patterns/streaming.mdx': 'f0c2c4c2a30b473c446cfc3ddd91945dfe171a3d',
}

def need(ok: bool, msg: str) -> None:
    if not ok:
        raise RuntimeError('BLOCKED: '+msg)

def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.check_output(['git',*args],cwd=cwd,encoding='utf8',
                                   stderr=subprocess.STDOUT).strip()

def digest(b: bytes) -> str: return sha256(b).hexdigest()
def sha(path: Path) -> str: return digest(path.read_bytes())
def blob(b: bytes) -> str: return sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()

def schema_gate(path: Path) -> None:
    need(path.is_file(), 'pinned schema absent: '+str(path))
    raw=path.read_bytes()
    need(digest(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,
         'pinned schema SHA256/Git blob changed')
    j=json.loads(raw)
    need(j.get('$id')=='https://ag-ui.com/spec/1.0/schema.json', 'pinned schema ID differs')
    d=j.get('$defs',{})
    refnames=lambda x: [y['$ref'].rsplit('/',1)[-1] for y in x['oneOf']]
    need(len(d['Event']['oneOf'])==31, 'official schema event union changed')
    need(refnames(d['RunFinishedOutcome'])==['RunFinishedSuccessOutcome',
        'RunFinishedInterruptOutcome','RunFinishedCancelledOutcome'],
        'RunFinishedOutcome arm list changed')
    need(refnames(d['SubagentFinishedOutcome'])==[
        'SubagentFinishedSuccessOutcome','SubagentFinishedSuspendedOutcome'],
        'SubagentFinishedOutcome arms changed')
    need(refnames(d['JsonPatchOperation'])==[
        'AddOperation','RemoveOperation','ReplaceOperation',
        'MoveOperation','CopyOperation','TestOperation'],
        'RFC6902 op union changed')
    for key,required in {
        'RunAgentInput':['threadId','runId','messages'],
        'RunFinishedSuccessOutcome':['type'],
        'RunFinishedInterruptOutcome':['type','interrupts'],
        'RunFinishedCancelledOutcome':['type'],
        'SubagentFinishedSuccessOutcome':['type'],
        'SubagentFinishedSuspendedOutcome':['type'],
        'Interrupt':['id','reason'],
    }.items():
        need(d[key]['required']==required, 'pinned nested required fields changed: '+key)
    need(d['RunFinishedInterruptOutcome']['properties']['interrupts']['minItems']==1,
         'interrupt minimum changed')
    need(d['RunAgentInput']['properties']['state']['not']=={'type':'null'},
         'RunAgentInput optional state contract changed')
    need(d['SubagentFinishedSuspendedOutcome']['properties']['interruptIds']['items']['type']=='string',
         'suspended interrupt id type changed')
    need(d['JsonPointer']['pattern']==r'^(/([^/~]|~[01])*)*$', 'JsonPointer pattern changed')
    for arm in ['AddOperation','RemoveOperation','ReplaceOperation',
                'MoveOperation','CopyOperation','TestOperation']:
        need('unevaluatedProperties' not in d[arm] and 'additionalProperties' not in d[arm],
             'JSON Patch operation must remain open: '+arm)
    for event in ('StateDeltaEvent','ActivityDeltaEvent'):
        name='delta' if event=='StateDeltaEvent' else 'patch'
        need(d[event]['properties'][name]['$ref']=='#/$defs/JsonPatch',
             event+' no longer references JsonPatch')
    need(d['StateSnapshotEvent']['properties']['snapshot']['$ref']=='#/$defs/State',
         'StateSnapshot changed')
    print('PASS: pinned AG-UI 1.0 schema SHA256/Git blob, 31 events and selected nested definitions',flush=True)
    print('PASS: seven previously source-verified upstream normative document blob pins',flush=True)

def preflight(schema: Path) -> None:
    need(git('rev-parse','HEAD')==BASELINE and git('rev-parse','origin/main')==BASELINE,
         'expected exact published 2.6D HEAD/origin/main')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked/staged changes found')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'untracked scope must contain exactly the three 2.6E files')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop reference drift')
    for name,expected in BLOBS.items():
        need(git('rev-parse','HEAD:'+name)==expected,
             'Git HEAD blob mismatch: '+name)
        need(git('hash-object',name)==expected,
             'Git worktree blob mismatch: '+name)
    need((ROOT/'ROADMAP.md').read_text(encoding='utf8').splitlines().count(
         '  - [ ] 2.6E AG-UI nested schemas, state and subagent lifecycle discovery')==1,
         '2.6E roadmap boundary missing/ambiguous')
    for name,expected in [(SRC,SRC_SHA),(TEST,TEST_SHA)]:
        need(sha(ROOT/name)==expected,'2.6E payload hash mismatch: '+name)
    schema_gate(schema)
    print('PASS: exact f8f6a1a HEAD/origin, nine blobs, pinned reference, three 2.6E files',flush=True)
    print('PASS: read-only preflight; no network, Git writes, Runtime or model calls',flush=True)

def gate(name: str, cmd: list[str], cwd: Path, output: Path) -> None:
    with output.open('w', encoding='utf8') as handle:
        try:
            process=subprocess.run(cmd,cwd=cwd,text=True,stdout=handle,
                                   stderr=subprocess.STDOUT,timeout=240)
        except subprocess.TimeoutExpired:
            raise RuntimeError('BLOCKED: '+name+' timed out; see '+str(output)) from None
    need(process.returncode==0,name+' failed; see '+str(output))
    print('PASS: '+name+' SHA256 '+sha(output),flush=True)

def run(schema: Path, out: Path) -> None:
    preflight(schema)
    need(not out.exists(), 'evidence directory exists; supply a fresh --output-dir')
    need(out != ROOT and ROOT not in out.parents, 'evidence must be outside repository')
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
         'src/ag-ui/nested-state.spec.ts','--outDir',str(ssr),'--emptyOutDir'],WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf8')
    gate('pure.log',['node',str(ssr/'nested-state.spec.js')],WEB,out/'pure.log')
    result=(out/'pure.log').read_text(encoding='utf8')
    need(bool(re.search(r'(?m)^130 2\.6E selected nested/state/subagent assertions passed\s*$',result)),
         'expected exactly 130 passed 2.6E assertions')
    need(result.count('PASS: ')==130,'unexpected PASS count in 2.6E pure tests')
    for critical in ('atomic add to array','failed second operation rolls back first operation',
                     'unannounced attribution allowed','run finish requires subagents closed',
                     'future run outcome deferred rather than rejected',
                     'later snapshot resynchronizes after failed patch'):
        need(critical in result,'critical 2.6E assertion missing: '+critical)
    preflight(schema)
    gates={name:sha(out/name) for name in ('lint.log','build.log','compile.log','pure.log')}
    boundaries=[
        'selected nested RunAgentInput and outcomes, not full recursive JSON Schema conformance',
        'RunAgentInput.messages and ContentPart media shapes remain opaque and unverified',
        'synthetic JSON Patch has bounded RFC 6902 operation support with atomic rollback, no durable application state',
        'structurally malformed patches fatal; non-applicable patches warned and skipped',
        'future outcome union arms deferred and not interpreted as success',
        'subagent announcements, nesting and termination partially reviewed; not complete attribution/ownership',
        'synthetic subagent-tagged state updates share the run state; no separate subagent state',
        'no Agent Server adapter, authorization, external tool effects, model calls, network or Runtime',
        '2.6D top-level enforcement remains separate; unknown input normalization and nested media not complete',
        'no exactly-once, concurrency guarantees, persistence, general DLP or production safety established',
    ]
    report={'status':'PASS','lab':'2.6E','baseline':BASELINE,
            'reference_commit':REFERENCE,'upstream_commit':AGUI_COMMIT,
            'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
            'source_sha256':SRC_SHA,'test_sha256':TEST_SHA,
            'assertions':130,'gates':gates,'prose_blobs':PROSE_BLOBS,
            'boundaries':boundaries,'timestamp_utc':datetime.now(timezone.utc).isoformat()}
    (out/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    md=['# MASL 2.6E — selected nested contracts, synthetic state & subagents','',
        'PASS: 130 model-free pure assertions; no Agent Server adapter.',
        '',f'Baseline `{BASELINE}`; AG-UI 1.0 `{AGUI_COMMIT}`; schema blob `{SCHEMA_BLOB}`.',
        '', '| Gate | SHA-256 |', '|---|---|']
    md += [f'| `{k}` | `{v}` |' for k,v in gates.items()]
    md += ['', '## Boundaries — do not claim beyond this scope', '']
    md += [f'- {x}' for x in boundaries]
    md += ['', 'Parent milestone 2.6 remains OPEN. No tracked Git files changed.','']
    (out/'review.md').write_text('\n'.join(md),encoding='utf8')
    print('REVIEW STATUS: PASS — scoped 2.6E selected nested/state/subagent review; 2.6 remains OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)
    for name in ('review.json','review.md'):
        print('EVIDENCE: '+name+' SHA256 '+sha(out/name),flush=True)

def main() -> None:
    ap=argparse.ArgumentParser(description=__doc__)
    group=ap.add_mutually_exclusive_group(required=True)
    group.add_argument('--preflight',action='store_true')
    group.add_argument('--run',action='store_true')
    ap.add_argument('--schema',type=Path,default=DEFAULT_SCHEMA)
    ap.add_argument('--output-dir',type=Path)
    args=ap.parse_args()
    try:
        schema=args.schema.resolve()
        if args.preflight: preflight(schema)
        else:
            need(args.output_dir is not None,'--run requires --output-dir')
            run(schema,args.output_dir.resolve())
    except (RuntimeError,FileNotFoundError,subprocess.CalledProcessError,ValueError,KeyError) as exc:
        s=str(exc)
        print(s if s.startswith('BLOCKED:') else 'BLOCKED: '+s,file=sys.stderr)
        sys.exit(2)

if __name__=='__main__': main()
