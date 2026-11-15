#!/usr/bin/env python3
"""MASL 2.6L: scoped authorization / synthetic durable replay contract gate.

--preflight is read-only. --run generates six artifacts only outside Git.
No real authentication, authorization policy service, durable store, CAS,
resume token, HTTP request, Agent Server, Runtime, model/tool or Git write.
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
HEAD='cc12712dea7ac92d121137a8f781419cdb32b531'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/authorized-durable-replay.ts'
TEST='apps/web/src/ag-ui/authorized-durable-replay.spec.ts'
RUNNER='scripts/lab-26l-authorized-replay-review.py'
SOURCE_SHA='55456eeea1d3919aafca051f31af799c3db4321761fca4a046cfc132ca7f28be'
TEST_SHA='01eeeee752cac2dd2abb132dc93cbfa21b55a34496016202492ceb908ce30466'
ASSERTIONS=394
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'cb63482fe9307f0018d1fde6529ca8a8ce8d583d',
 'CURRENT.md':'da4ff41ec3a54b4284150b88ebe65d19e9d5dc09',
 'docs/journal/lab-23-ag-ui.md':'8392fb23c8dea92a7c673e794180403a9c60aba4',
 'apps/web/src/ag-ui/replay-recovery.ts':'583a22d4697846201325ffe6be5fb120a87e2f80',
 'apps/web/src/ag-ui/replay-recovery.spec.ts':'122cb5f53cb123398fc121ad3406e98da4bd62af',
 'scripts/lab-26k-recovery-review.py':'d982c6d75b4f5ca0c5bb267e291f564f330b125c',
 'apps/web/src/ag-ui/pipeline-transport.ts':'eb2384d0134ad3290fa5a3f5929741f991785054',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
 'apps/web/src/ag-ui/stream-boundary.ts':'7e256df756e05a363a4950da17e4ebf98ae8da09',
}
CRITICAL=(
 'selected 2.6K recovery composes with authorization and CAS plan',
 'untrusted tenant reference cannot override synthetic server tenant',
 'synthetic thread allow-list enforced before replay',
 'same-key complete duplicate is suppressed in synthetic plan',
 'stale expected revision allowed only for exact existing receipt replay-check',
 'stale/incorrect optimistic revision blocked for new commit',
 'two independent planners can race from identical revision: NOT actual CAS proof',
 'only a reloaded state can reject stale competing revision in pure simulation',
 'client-supplied authority isAdmin refused',
 'same receipt cannot be replayed by a different principal',
 'truncated candidate cannot enter CAS simulation',
 'commitmentHashVerified remains false without independent evidence',
 '2.6 parent milestone stays OPEN',
)

def need(ok:bool,message:str)->None:
    if not ok: raise RuntimeError('BLOCKED: '+message)

def git(*args:str,cwd:Path=ROOT)->str:
    return subprocess.check_output(['git',*args],cwd=cwd,text=True,
                                   stderr=subprocess.STDOUT).strip()

def sha(data:bytes)->str:return sha256(data).hexdigest()
def blob(data:bytes)->str:return sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()

def schema_gate(schema:Path)->None:
    need(schema.is_file() and not schema.is_symlink(),'pinned schema missing or symlink')
    data=schema.read_bytes()
    need(sha(data)==SCHEMA_SHA and blob(data)==SCHEMA_BLOB,'pinned schema hash/blob drift')
    value=json.loads(data)
    need(value.get('$id')=='https://ag-ui.com/spec/1.0/schema.json','pinned schema identity mismatch')
    need(len(value['$defs']['Event']['oneOf'])==31,'schema 31-event union drift')
    print('PASS: frozen AG-UI 1.0 schema SHA256/Git blob and 31-event union',flush=True)

def preflight(schema:Path)->None:
    need(git('symbolic-ref','--quiet','--short','HEAD')=='main','expected main branch')
    need(git('rev-parse','HEAD')==HEAD,'HEAD drift from published 2.6K')
    need(git('rev-parse','origin/main')==HEAD,'origin/main drift from published 2.6K')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked/staged changes present')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'unexpected untracked scope')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop HEAD drift')
    for rel,expected in BLOBS.items():
        need(git('rev-parse','HEAD:'+rel)==expected,'published blob drift: '+rel)
        need(git('hash-object',rel)==expected,'worktree tracked blob drift: '+rel)
    for rel,expected in ((SRC,SOURCE_SHA),(TEST,TEST_SHA)):
        item=ROOT/rel
        need(item.is_file() and not item.is_symlink() and sha(item.read_bytes())==expected,
             '2.6L payload hash drift: '+rel)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),
         'runner missing/symlink')
    roadmap=(ROOT/'ROADMAP.md').read_text(encoding='utf-8').splitlines()
    need(roadmap.count('- [ ] 2.6 AG-UI')==1,'parent 2.6 not OPEN')
    need(roadmap.count('  - [ ] 2.6L AG-UI authorization and durable replay contract evidence')==1,
         '2.6L current sub-block anchor not pending')
    schema_gate(schema)
    print('PASS: exact cc12712 HEAD/origin, nine blobs, pinned workshop, three 2.6L files',flush=True)
    print('PASS: read-only preflight; no Git writes, network, authentication, persistence or Agent Server',flush=True)

def gate(name:str,cmd:list[str],cwd:Path,path:Path)->None:
    with path.open('w',encoding='utf-8') as log:
        try:
            result=subprocess.run(cmd,cwd=cwd,stdout=log,stderr=subprocess.STDOUT,
                                  timeout=240,check=False)
        except subprocess.TimeoutExpired:
            raise RuntimeError('BLOCKED: gate timed out: '+name) from None
    need(result.returncode==0,'gate failed: '+name+' at '+str(path))
    print('PASS: '+name+' SHA256 '+sha(path.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    root=ROOT.resolve();target=out.resolve()
    need(target!=root and root not in target.parents,'evidence must stay outside Git')
    need(not out.exists(),'evidence directory exists: '+str(out))
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
        'src/ag-ui/authorized-durable-replay.spec.ts','--outDir',str(ssr),'--emptyOutDir'],
        WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    gate('pure.log',['node',str(ssr/'authorized-durable-replay.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf-8')
    m=re.search(r'(?m)^(\d+) 2\.6L selected authorization/durable replay contract assertions passed\s*$',pure)
    need(m is not None and int(m.group(1))==ASSERTIONS,'expected 394 pure assertions')
    need(pure.count('PASS: ')==ASSERTIONS,'pure PASS counter disagrees with 394')
    for phrase in CRITICAL:
        need('PASS: '+phrase in pure,'critical case absent: '+phrase)
    preflight(schema)
    logs={n:sha((out/n).read_bytes()) for n in ('lint.log','build.log','compile.log','pure.log')}
    payload={
        'lab':'2.6L','status':'PASS','baseline':HEAD,
        'reference_commit':REFERENCE,'agui_upstream_commit':AGUI_COMMIT,
        'schema_sha256':SCHEMA_SHA,'schema_git_blob':SCHEMA_BLOB,
        'tracked_git_blobs':BLOBS,'assertions':ASSERTIONS,'critical_cases':len(CRITICAL),
        'gate_logs_sha256':logs,
        'sources_sha256':{n:sha((ROOT/n).read_bytes()) for n in (SRC,TEST,RUNNER)},
        'scope':'synthetic server-context authorization and in-call durable-CAS proposal only',
        'gap_ids_open':['G'+str(i) for i in range(1,10)],
        'authentication_verified':False,'external_acl_verified':False,
        'durable_store_verified':False,'atomic_cas_verified':False,
        'commitment_hash_verified':False,'distributed_idempotency_verified':False,
        'transport_resume_verified':False,'adapter_ready':False,'parent_2_6_open':True,
        'limits':[
            'The synthetic server context literal is not an actual authenticated identity or ACL lookup',
            'The selected prior 2.6K recovery is local/volatile and not full AG-UI conformance',
            'Checkpoint snapshots and caller-declared commitment strings are UNTRUSTED and not verified',
            'Pure revision comparison is NOT atomic CAS or a database transaction',
            'Two clients can plan concurrently from an identical revision with no exclusive winner',
            'Replay-check and deduplication exist in a copied in-memory projection only, not cross-process',
            'No secrets, HTTP transport resume, auth service, persistence, media/DLP, multi-tenant deployment',
            'G1-G9 remain OPEN; adapter BLOCKED; parent 2.6 AG-UI remains OPEN',
        ],
        'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines=['# MASL 2.6L — synthetic authorization and durable replay contract review','',
           f'Baseline `{HEAD}`; AG-UI upstream `{AGUI_COMMIT}`.','',
           f'**{ASSERTIONS}/{ASSERTIONS}** scoped pure assertions PASS; 4 local WSL gates PASS.','',
           '| Log | SHA-256 |','|---|---|',
           *[f'| `{k}` | `{v}` |' for k,v in logs.items()],
           '', '## Explicitly unproven', '',
           *[f'- {item}' for item in payload['limits']],
           '', 'G1-G9 OPEN. Agent Server adapter BLOCKED. Parent 2.6 OPEN.','']
    (out/'review.md').write_text('\n'.join(lines),encoding='utf-8')
    print('REVIEW STATUS: PASS — selected 2.6L synthetic authorization/CAS contracts; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)
    for n in ('review.json','review.md'):
        print('EVIDENCE: '+n+' SHA256 '+sha((out/n).read_bytes()),flush=True)

def main()->None:
    ap=argparse.ArgumentParser(description=__doc__)
    mode=ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--preflight',action='store_true')
    mode.add_argument('--run',action='store_true')
    ap.add_argument('--schema',type=Path,default=DEFAULT_SCHEMA)
    ap.add_argument('--output-dir',type=Path)
    args=ap.parse_args()
    try:
        schema=args.schema.expanduser().absolute()
        if args.preflight:preflight(schema)
        else:
            need(args.output_dir is not None,'--run requires --output-dir')
            run(schema,args.output_dir.expanduser().absolute())
    except (RuntimeError,OSError,ValueError,TypeError,KeyError,subprocess.CalledProcessError) as exc:
        message=str(exc)
        print(message if message.startswith('BLOCKED:') else 'BLOCKED: '+message,file=sys.stderr)
        raise SystemExit(2) from None

if __name__=='__main__':main()
