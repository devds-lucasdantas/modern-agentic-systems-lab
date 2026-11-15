#!/usr/bin/env python3
"""MASL 2.6K: selected volatile replay/recovery and adapter-security gates.

--preflight is read-only. --run writes six evidence files only outside Git.
No production resume, authz, durable idempotency, Agent Server HTTP, Runtime,
model/tool, media, persistent state or Git mutation is performed.
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
HEAD='6a3d89c1b87b9024f2205209650f5f0d5a5d395a'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
SCHEMA_DEFAULT=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/replay-recovery.ts'
TEST='apps/web/src/ag-ui/replay-recovery.spec.ts'
RUNNER='scripts/lab-26k-recovery-review.py'
SRC_SHA='2e85493df530076637902da6d242bf1e10601f5a4e5985c45e725e1e2f677c39'
TEST_SHA='6e9cdb81eeef2b465779b001dec89f13e2193426c6d35fad414cf62538b64734'
ASSERTIONS=248
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'0612088a2a5a2e603d57d8e9b9f34eeba34c4322',
 'CURRENT.md':'19dffb2c61ad4d6cfca66744808203cff56bf435',
 'docs/journal/lab-23-ag-ui.md':'991c2343c6753db41836f6149fd2d634f50a950d',
 'apps/web/src/ag-ui/pipeline-transport.ts':'eb2384d0134ad3290fa5a3f5929741f991785054',
 'apps/web/src/ag-ui/pipeline-transport.spec.ts':'615ee1ce14907150c97f8eaa79918024f59eda85',
 'scripts/lab-26j-pipeline-review.py':'59521f4b5db57862ded0f05c6a28506b31f6b449',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
 'apps/web/src/ag-ui/stream-boundary.ts':'7e256df756e05a363a4950da17e4ebf98ae8da09',
 'apps/web/src/ag-ui/chunk-enforcement.ts':'def432ff9c16f26798054f917db16bfd241bcb04',
}
PROSE_BLOBS={
 'docs/spec/1.0/basic/processing.mdx':'22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47',
 'docs/spec/1.0/basic/transports/http-sse.mdx':'993b465d9e6a849fa3a616eb599c16671fccafcb',
 'docs/spec/1.0/events/lifecycle.mdx':'20c1adf5b98da77349c10f5218b1c80be91448e5',
}
CRITICAL=(
 '2.6J published pipeline selected complete run accepted',
 'discard incomplete observation then accept full restart',
 'exact repeated local batch is suppressed',
 'same declared run with different data is not a duplicate',
 'Last-Event-ID is not an AG-UI recovery credential',
 'late RUN_ERROR never becomes successful replay',
 'atomic review cannot expose prior completed batch after conflict',
 'cross-tenant identity collision rejected',
 '2.6H published readiness gate remains blocked',
 'parent AG-UI 2.6 stays OPEN',
)

def need(ok:bool,msg:str)->None:
    if not ok: raise RuntimeError('BLOCKED: '+msg)

def git(*args:str,cwd:Path=ROOT)->str:
    return subprocess.check_output(['git',*args],cwd=cwd,text=True,stderr=subprocess.STDOUT).strip()

def sha(raw:bytes)->str:return sha256(raw).hexdigest()
def blob(raw:bytes)->str:return sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()

def schema_gate(schema:Path)->None:
    need(schema.is_file() and not schema.is_symlink(),'pinned schema missing/symlink')
    raw=schema.read_bytes()
    need(sha(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,'AG-UI pinned schema drift')
    document=json.loads(raw)
    need(document.get('$id')=='https://ag-ui.com/spec/1.0/schema.json','schema identity changed')
    need(len(document['$defs']['Event']['oneOf'])==31,'31 event union changed')
    print('PASS: pinned AG-UI 1.0 schema SHA256/Git blob and 31-event union',flush=True)

def preflight(schema:Path)->None:
    need(git('symbolic-ref','--quiet','--short','HEAD')=='main','expected main')
    need(git('rev-parse','HEAD')==HEAD,'HEAD differs from published 2.6J baseline')
    need(git('rev-parse','origin/main')==HEAD,'origin/main differs from baseline')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked/index changes present')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'unexpected untracked scope')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop changed')
    for p,expected in BLOBS.items():
        need(git('rev-parse','HEAD:'+p)==expected,'published Git blob mismatch: '+p)
        need(git('hash-object',p)==expected,'working tree blob mismatch: '+p)
    for p,expected in ((SRC,SRC_SHA),(TEST,TEST_SHA)):
        item=ROOT/p
        need(item.is_file() and not item.is_symlink() and sha(item.read_bytes())==expected,
             '2.6K payload absent/drift: '+p)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),
         '2.6K runner missing/symlink')
    roadmap=(ROOT/'ROADMAP.md').read_text(encoding='utf-8').splitlines()
    need(roadmap.count('- [ ] 2.6 AG-UI')==1,'parent 2.6 unexpectedly closed')
    need(roadmap.count('  - [ ] 2.6K AG-UI replay, failure recovery and adapter security gates')==1,
         '2.6K pending roadmap line absent')
    schema_gate(schema)
    print('PASS: exact 6a3d89c HEAD/origin, nine blobs, pinned workshop, three 2.6K files',flush=True)
    print('PASS: read-only preflight; no Git writes, network, Agent Server, Runtime/model/tool',flush=True)

def gate(name:str,command:list[str],cwd:Path,destination:Path)->None:
    with destination.open('w',encoding='utf-8') as log:
        try:
            outcome=subprocess.run(command,cwd=cwd,stdout=log,stderr=subprocess.STDOUT,
                                   timeout=240,check=False)
        except subprocess.TimeoutExpired:
            raise RuntimeError('BLOCKED: timeout: '+name) from None
    need(outcome.returncode==0,'gate failed: '+name+' at '+str(destination))
    print('PASS: '+name+' SHA256 '+sha(destination.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    root=ROOT.resolve();target=out.resolve()
    need(target!=root and root not in target.parents,'evidence must remain outside Git')
    need(not out.exists(),'evidence output directory already exists: '+str(out))
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr','src/ag-ui/replay-recovery.spec.ts',
                        '--outDir',str(ssr),'--emptyOutDir'],WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    gate('pure.log',['node',str(ssr/'replay-recovery.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf-8')
    match=re.search(r'(?m)^(\d+) 2\.6K selected replay/recovery/security assertions passed\s*$',pure)
    need(match is not None and int(match.group(1))==ASSERTIONS,'expected 248 assertions')
    need(pure.count('PASS: ')==ASSERTIONS,'pure log PASS count differs from 248')
    for phrase in CRITICAL:
        need('PASS: '+phrase in pure,'missing 2.6K critical test: '+phrase)
    preflight(schema)
    logs={p:sha((out/p).read_bytes()) for p in ('lint.log','build.log','compile.log','pure.log')}
    report={
      'lab':'2.6K','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
      'agui_upstream_commit':AGUI_COMMIT,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
      'source_git_blobs':BLOBS,'normative_prose_blobs':PROSE_BLOBS,
      'scope':'selected volatile in-call restart/replay boundary; no operational resume',
      'assertions':ASSERTIONS,'critical_cases':len(CRITICAL),'gate_logs_sha256':logs,
      'sources_sha256':{p:sha((ROOT/p).read_bytes()) for p in (SRC,TEST,RUNNER)},
      'gap_ids_open':['G'+str(i) for i in range(1,10)],
      'adapter_ready':False,'authorization_verified':False,'durable_replay_verified':False,
      'parent_2_6_open':True,
      'limits':[
        'Local pure in-call ledger is neither a durable checkpoint nor cross-process idempotency',
        'The selected all-or-nothing return value is not a persistent application sink',
        'Identity strings are synthetic user-declared references, not authenticated principal claims',
        'Full restart after truncated observation is not transport resume or Last-Event-ID support',
        'No real CAS, locks, retry storm, network, multi-client isolation or security review',
        'No media security/DLP, authorization, Agent Server bridge, frontend integration or deployment',
        'Published 2.6J/2.6D/2.6C review remains selected and not full recursive AG-UI conformance',
        'G1-G9 remain OPEN; adapter BLOCKED; parent milestone 2.6 OPEN'
      ],
      'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines=['# MASL 2.6K — selected recovery and adapter-security prerequisites','',
       f'Published baseline `{HEAD}`; AG-UI `{AGUI_COMMIT}`.','',
       f'**{ASSERTIONS}/{ASSERTIONS}** model-free pure assertions PASS; four gates PASS.','',
       '| Gate | SHA-256 |','|---|---|',
       *[f'| `{p}` | `{h}` |' for p,h in logs.items()],
       '', '## Boundaries', '', *[f'- {msg}' for msg in report['limits']],
       '', 'G1-G9 OPEN. Agent Server adapter BLOCKED. Parent 2.6 OPEN.','']
    (out/'review.md').write_text('\n'.join(lines),encoding='utf-8')
    print('REVIEW STATUS: PASS — selected 2.6K volatile recovery/security gates; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)
    for p in ('review.json','review.md'):
        print('EVIDENCE: '+p+' SHA256 '+sha((out/p).read_bytes()),flush=True)

def main()->None:
    ap=argparse.ArgumentParser(description=__doc__)
    modes=ap.add_mutually_exclusive_group(required=True)
    modes.add_argument('--preflight',action='store_true')
    modes.add_argument('--run',action='store_true')
    ap.add_argument('--schema',type=Path,default=SCHEMA_DEFAULT)
    ap.add_argument('--output-dir',type=Path)
    args=ap.parse_args()
    try:
        schema=args.schema.expanduser().absolute()
        if args.preflight:preflight(schema)
        else:
            need(args.output_dir is not None,'--run requires --output-dir')
            run(schema,args.output_dir.expanduser().absolute())
    except (RuntimeError,OSError,ValueError,KeyError,TypeError,subprocess.CalledProcessError) as err:
        message=str(err)
        print(message if message.startswith('BLOCKED:') else 'BLOCKED: '+message,file=sys.stderr)
        raise SystemExit(2) from None

if __name__=='__main__':main()
