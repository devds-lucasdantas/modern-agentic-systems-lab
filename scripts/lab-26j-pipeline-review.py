#!/usr/bin/env python3
"""MASL 2.6J: real selected byte/SSE -> 2.6D enforcement/expansion/2.6C lifecycle.

Four no-network local gates. Read-only --preflight. --run writes six artifacts
ONLY outside the Git checkout, never invokes an HTTP endpoint, Runtime,
Agent Server, model/tool, frontend or production application sink.
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

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'apps/web'
HEAD='46cc13b7bf4a76203e3a670297ade6b032a50240'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/pipeline-transport.ts'
TEST='apps/web/src/ag-ui/pipeline-transport.spec.ts'
RUNNER='scripts/lab-26j-pipeline-review.py'
SOURCE_SHA='6236eec1d191b0c6b6b531a54593b7e9047f5780e43918877e49b78595c4a296'
TEST_SHA='85a06c11194c0f5b055d5ec5e6004c10951a4424f5de83a31f4a4893097a3618'
ASSERTIONS=121
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md': '757bd0261817a0057f42ec2973cba8012250619d',
 'CURRENT.md': '3387e9732425a862fb51fb4dafe3df7b4fb7a980',
 'docs/journal/lab-23-ag-ui.md': '4256e3f7516e453771bcdf61f0123c2091ca86ac',
 'apps/web/src/ag-ui/independent-evidence.ts': '710988381614e62afa54b89a105c4f92ef7973df',
 'apps/web/src/ag-ui/independent-evidence.spec.ts': 'fa73a9d98c4fceb71db8f17845aa6f7d46b3d6c7',
 'scripts/lab-26i-independent-review.py': 'b39b3babb070e4bef53d2b5ff04b3e7fff2bf597',
 'apps/web/src/ag-ui/chunk-enforcement.ts': 'def432ff9c16f26798054f917db16bfd241bcb04',
 'apps/web/src/ag-ui/stream-boundary.ts': '7e256df756e05a363a4950da17e4ebf98ae8da09',
 'apps/web/src/transport/agent-server/sse.ts': '85b0e8d6abf10068b10fd8bfb3ef0f2414686572',
}
PROSE_BLOBS={
 'docs/spec/1.0/basic/processing.mdx':'22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47',
 'docs/spec/1.0/basic/transports/http-sse.mdx':'993b465d9e6a849fa3a616eb599c16671fccafcb',
 'docs/spec/1.0/events/lifecycle.mdx':'20c1adf5b98da77349c10f5218b1c80be91448e5',
}
CRITICAL=(
 'complete run wire accepted',
 'byte fragmentation 1 preserves message frames',
 'invalid UTF-8 rejects before processing',
 'unknown event never reaches application',
 'malformed known role rejected, not stripped',
 'events after terminal fail closed',
 'EOF without terminal is not success',
 '2.6D real chunk expansion composes with SSE framing',
 'SSE metadata does not add protocol events',
)

def need(ok:bool,msg:str)->None:
    if not ok: raise RuntimeError('BLOCKED: '+msg)

def git(*args:str,cwd:Path=ROOT)->str:
    return subprocess.check_output(['git',*args],cwd=cwd,text=True,stderr=subprocess.STDOUT).strip()

def sha(raw:bytes)->str:return sha256(raw).hexdigest()
def blob(raw:bytes)->str:return sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()

def schema_gate(file:Path)->None:
    need(file.is_file() and not file.is_symlink(),'schema absent/symlink')
    raw=file.read_bytes()
    need(sha(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,'schema hash/blob drift')
    schema=json.loads(raw)
    need(schema.get('$id')=='https://ag-ui.com/spec/1.0/schema.json','schema id changed')
    need(len(schema['$defs']['Event']['oneOf'])==31,'event union changed')
    print('PASS: pinned AG-UI 1.0 schema hash/blob and 31-event union',flush=True)

def preflight(schema:Path)->None:
    need(git('symbolic-ref','--quiet','--short','HEAD')=='main','not on main')
    need(git('rev-parse','HEAD')==HEAD,'HEAD differs from published 2.6I')
    need(git('rev-parse','origin/main')==HEAD,'origin/main differs from baseline')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked files or staging modified')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'unexpected untracked files')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop reference changed')
    for rel,expected in BLOBS.items():
        need(git('rev-parse','HEAD:'+rel)==expected, 'published blob drift: '+rel)
        need(git('hash-object',rel)==expected, 'working tree blob drift: '+rel)
    for rel,expected in ((SRC,SOURCE_SHA),(TEST,TEST_SHA)):
        p=ROOT/rel
        need(p.is_file() and not p.is_symlink() and sha(p.read_bytes())==expected,
             '2.6J source SHA missing or changed: '+rel)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(), 'runner missing/symlink')
    roadmap=(ROOT/'ROADMAP.md').read_text(encoding='utf-8').splitlines()
    need(roadmap.count('- [ ] 2.6 AG-UI')==1,'parent 2.6 closed unexpectedly')
    need(roadmap.count('  - [ ] 2.6J AG-UI executable pipeline and transport boundary evidence')==1,
         'roadmap 2.6J anchor missing')
    schema_gate(schema)
    print('PASS: exact 46cc13b HEAD/origin, nine Git blobs, pinned workshop, three 2.6J files',flush=True)
    print('PASS: read-only preflight, no Git write, network, Agent Server, Runtime/model/tool',flush=True)

def gate(name:str,cmd:list[str],cwd:Path,path:Path)->None:
    with path.open('w',encoding='utf-8') as stream:
        try:
            result=subprocess.run(cmd,cwd=cwd,stdout=stream,stderr=subprocess.STDOUT,timeout=240,check=False)
        except subprocess.TimeoutExpired:
            raise RuntimeError('BLOCKED: gate timed out: '+name) from None
    need(result.returncode==0,'gate failed: '+name+' at '+str(path))
    print('PASS: '+name+' SHA256 '+sha(path.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    repo=ROOT.resolve();target=out.resolve()
    need(target!=repo and repo not in target.parents,'evidence must remain outside Git')
    need(not out.exists(),'evidence destination exists: '+str(out))
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
         'src/ag-ui/pipeline-transport.spec.ts','--outDir',str(ssr),'--emptyOutDir'],
         WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    gate('pure.log',['node',str(ssr/'pipeline-transport.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf-8')
    matched=re.search(r'(?m)^(\d+) 2\.6J selected executable pipeline/transport assertions passed\s*$',pure)
    need(matched is not None and int(matched.group(1))==ASSERTIONS,'2.6J expected 121 assertions')
    need(pure.count('PASS: ')==ASSERTIONS,'pure PASS count drift')
    for x in CRITICAL:need(x in pure,'critical test not found: '+x)
    preflight(schema)
    hashes={n:sha((out/n).read_bytes()) for n in ('lint.log','build.log','compile.log','pure.log')}
    evidence={
       'lab':'2.6J','status':'PASS','scope':'selected executable SSE framing -> existing AG-UI consumer',
       'baseline':HEAD,'workshop_commit':REFERENCE,'upstream_commit':AGUI_COMMIT,
       'schema_sha256':SCHEMA_SHA,'schema_git_blob':SCHEMA_BLOB,
       'source_git_blobs':BLOBS,'normative_prose_blobs':PROSE_BLOBS,
       'assertions':ASSERTIONS,'gate_logs_sha256':hashes,
       'sources_sha256':{p:sha((ROOT/p).read_bytes()) for p in (SRC,TEST,RUNNER)},
       'gap_ids_open':['G'+str(i) for i in range(1,10)],
       'adapter_ready':False,'parent_2_6_open':True,
       'limits':[
          'Only selected HTTP/SSE JSON decoding; no actual HTTP, authentication or transport',
          'Compatibility is identity and middleware is read-only observation, not generic compatibility chain',
          '2.6D envelope enforcement and chunk expansion are limited and not recursive 1.0 validation',
          'The existing 2.6C lifecycle review is selected and not full subagent/state compliance',
          'No stream resumption, protobuf, media URL security, DLP, concurrency or durable state',
          'The application boundary is a pure all-or-nothing return value; no production sink',
          'G1-G9 remain OPEN and adapter BLOCKED; parent 2.6 stays OPEN'
       ],'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines=['# MASL 2.6J — scoped pipeline and transport boundary review','',
       f'Baseline `{HEAD}`; upstream `{AGUI_COMMIT}`.','',
       f'**{ASSERTIONS}/{ASSERTIONS}** pure assertions PASS; four gates PASS.','',
       '| Evidence log | SHA-256 |','|---|---|',
       *[f'| `{k}` | `{v}` |' for k,v in hashes.items()],
       '', '## Limitations','', *[f'- {v}' for v in evidence['limits']],
       '', 'G1-G9 OPEN. Adapter BLOCKED. Parent 2.6 AG-UI OPEN.','']
    (out/'review.md').write_text('\n'.join(lines),encoding='utf-8')
    print('REVIEW STATUS: PASS — selected 2.6J executable pipeline/transport; parent 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)
    for n in ('review.json','review.md'):
        print('EVIDENCE: '+n+' SHA256 '+sha((out/n).read_bytes()),flush=True)

def main()->None:
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--preflight',action='store_true');mode.add_argument('--run',action='store_true')
    parser.add_argument('--schema',type=Path,default=DEFAULT_SCHEMA)
    parser.add_argument('--output-dir',type=Path)
    args=parser.parse_args()
    try:
        schema=args.schema.expanduser().absolute()
        if args.preflight:preflight(schema)
        else:
            need(args.output_dir is not None,'--run requires --output-dir')
            run(schema,args.output_dir.expanduser().absolute())
    except (RuntimeError,ValueError,OSError,KeyError,subprocess.CalledProcessError) as exc:
        message=str(exc)
        print(message if message.startswith('BLOCKED:') else 'BLOCKED: '+message,file=sys.stderr)
        raise SystemExit(2) from None

if __name__=='__main__':main()
