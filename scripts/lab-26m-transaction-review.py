#!/usr/bin/env python3
"""MASL 2.6M isolated server-boundary *design* + external SQLite transaction experiment.

--preflight: read-only pinned AG-UI and Git checks.
--run: five local gates and eight evidence artifacts ONLY outside Git.
Identity in SQLite is *test fixture lookup*, not a verified credential. SQLite
CAS/atomicity belongs to this one offline file/database, not to Agent Server.
No network, actual identity provider, frontend, Runtime/model/tool or production adapter.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha1, sha256
import json
import multiprocessing as mp
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import os

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'apps/web'
HEAD='873398d87816be79a7e51c4e08924ff81011ba00'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
SCHEMA_DEFAULT=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/trusted-transaction-boundary.ts'
TEST='apps/web/src/ag-ui/trusted-transaction-boundary.spec.ts'
RUNNER='scripts/lab-26m-transaction-review.py'
SOURCE_SHA='ab2ae9b77b260d2d99286d7aa793e22e0cce2ed289b8999181b6ca23c1c64592'
TEST_SHA='07ec28b09cc957a75246de4cca12796536f940b4de62643e65ed9aca5db3f188'
ASSERTIONS=152
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'414328b239cf1ea76a58a6f1a7a0a5187d9b73e5',
 'CURRENT.md':'4322035beac45387b5f6f5980df1e15c0605f8b7',
 'docs/journal/lab-23-ag-ui.md':'3620591b521be45b571ef8b6a6c3238958a13c62',
 'apps/web/src/ag-ui/authorized-durable-replay.ts':'4815d938b17174a7ce4a93398dba8f1ec77f1e98',
 'apps/web/src/ag-ui/authorized-durable-replay.spec.ts':'2a60279597c32235ff051d87fe9042acb1b5e838',
 'scripts/lab-26l-authorized-replay-review.py':'acade3b832d510d14a3c95ea4588398a2a302798',
 'apps/web/src/ag-ui/replay-recovery.ts':'583a22d4697846201325ffe6be5fb120a87e2f80',
 'apps/web/src/ag-ui/pipeline-transport.ts':'eb2384d0134ad3290fa5a3f5929741f991785054',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
}
CRITICAL=(
 '2.6L published replay/ACL plan composed through injected test authority',
 'caller authority injection forbidden principalId',
 'caller cannot override server tenant',
 'caller cannot access unauthorized thread',
 'stale checkpoint revision blocks proposal',
 'missing published 2.6K recovery blocks plan',
 'provider exception fails closed',
 'cross-tenant session denies tenant-A request',
 'all G1-G9 remain open',
 'parent milestone 2.6 remains OPEN',
)


def need(ok:bool,message:str)->None:
    if not ok: raise RuntimeError('BLOCKED: '+message)
def git(*args:str,cwd:Path=ROOT)->str:
    return subprocess.check_output(['git',*args],cwd=cwd,text=True,stderr=subprocess.STDOUT).strip()
def digest(raw:bytes)->str:return sha256(raw).hexdigest()
def blob(raw:bytes)->str:return sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()

def schema_gate(path:Path)->None:
    need(path.is_file() and not path.is_symlink(),'schema absent/symlink')
    raw=path.read_bytes()
    need(digest(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,'schema drift')
    document=json.loads(raw)
    need(document.get('$id')=='https://ag-ui.com/spec/1.0/schema.json','schema id changed')
    need(len(document['$defs']['Event']['oneOf'])==31,'31 event variants changed')
    print('PASS: frozen AG-UI 1.0 schema SHA-256/Git blob and 31-event union',flush=True)

def preflight(schema:Path)->None:
    need(git('symbolic-ref','--quiet','--short','HEAD')=='main','expected main')
    need(git('rev-parse','HEAD')==HEAD,'HEAD differs from 2.6L published baseline')
    need(git('rev-parse','origin/main')==HEAD,'origin/main drift')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked/index changes detected')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'unexpected untracked scope')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop reference changed')
    for path,expected in BLOBS.items():
        need(git('rev-parse','HEAD:'+path)==expected,'Git blob changed: '+path)
        need(git('hash-object',path)==expected,'worktree tracked blob changed: '+path)
    for path,expected in ((SRC,SOURCE_SHA),(TEST,TEST_SHA)):
        p=ROOT/path
        need(p.is_file() and not p.is_symlink() and digest(p.read_bytes())==expected,
             '2.6M payload drift: '+path)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(), '2.6M runner missing/symlink')
    roadmap=(ROOT/'ROADMAP.md').read_text(encoding='utf-8').splitlines()
    need(roadmap.count('- [ ] 2.6 AG-UI')==1,'milestone 2.6 unexpectedly closed')
    need(roadmap.count('  - [ ] 2.6M AG-UI trusted identity and transactional replay boundary design')==1,
         '2.6M pending roadmap anchor missing')
    schema_gate(schema)
    print('PASS: exact 873398d HEAD/origin, ten Git blobs, pinned workshop, three 2.6M files',flush=True)
    print('PASS: read-only preflight; no Git write, network, authentication or Agent Server',flush=True)

# SQLite executable isolated fixture: the opaque session lookup is NOT real
# authentication. It protects only against bypassing the simulated server-side
# lookup within this one harness. The payload digest IS calculated from bytes.
SQL='''
CREATE TABLE IF NOT EXISTS sessions (
 session_ref TEXT PRIMARY KEY, principal TEXT NOT NULL, tenant TEXT NOT NULL,
 policy_epoch INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS threads (
 tenant TEXT NOT NULL, thread TEXT NOT NULL, principal TEXT NOT NULL,
 policy_epoch INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (tenant,thread)
);
CREATE TABLE IF NOT EXISTS runs (
 tenant TEXT NOT NULL, thread TEXT NOT NULL, run_id TEXT NOT NULL,
 principal TEXT NOT NULL, idem_key TEXT NOT NULL, revision INTEGER NOT NULL,
 payload_sha256 TEXT NOT NULL,
 PRIMARY KEY (tenant,thread,run_id), UNIQUE(tenant,idem_key),
 FOREIGN KEY(tenant,thread) REFERENCES threads(tenant,thread)
);
'''

def connect(path:Path)->sqlite3.Connection:
    db=sqlite3.connect(path,timeout=10.0,isolation_level=None)
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=10000')
    return db

def setup_sqlite(path:Path)->None:
    with connect(path) as db:
        need(db.execute('PRAGMA journal_mode=WAL').fetchone()[0]=='wal','WAL unavailable')
        db.execute('PRAGMA synchronous=FULL')
        db.executescript(SQL)
        db.executemany('INSERT INTO sessions VALUES (?,?,?,?)',[
            ('session-A','principal-A','tenant-A',9),
            ('session-B','principal-B','tenant-B',9),
            ('session-other','principal-X','tenant-A',9),
            ('session-stale','principal-A','tenant-A',8),
        ])
        db.executemany('INSERT INTO threads(tenant,thread,principal,policy_epoch) VALUES (?,?,?,?)',[
            ('tenant-A','thread-A','principal-A',9),
            ('tenant-A','thread-B','principal-A',9),
            ('tenant-A','race-thread','principal-A',9),
            ('tenant-B','thread-A','principal-B',9),
        ])

def commit(path:Path,session:str,tenant:str,thread:str,run_id:str,idem:str,
           payload:bytes,expected_revision:int)->str:
    if any(not isinstance(v,str) or not re.fullmatch(r'[A-Za-z0-9._:-]{1,128}',v)
           for v in (session,tenant,thread,run_id,idem)):
        return 'invalid-identity'
    if not isinstance(payload,bytes) or len(payload)>131072 or not payload:return 'invalid-payload'
    if type(expected_revision) is not int or not 0<=expected_revision<1024:return 'invalid-revision'
    calculated=digest(payload)
    db=connect(path)
    try:
        db.execute('BEGIN IMMEDIATE')
        identity=db.execute('SELECT principal,tenant,policy_epoch FROM sessions WHERE session_ref=?',
                            (session,)).fetchone()
        if identity is None:return 'session-lookup-denied'
        principal,owner,epoch=identity
        if tenant!=owner:return 'tenant-scope-denied'
        acl=db.execute('SELECT principal,policy_epoch,revision FROM threads WHERE tenant=? AND thread=?',
                       (owner,thread)).fetchone()
        if acl is None or acl[0]!=principal:return 'thread-acl-denied'
        if acl[1]!=epoch:return 'policy-epoch-stale'
        by_key=db.execute('SELECT thread,run_id,principal,payload_sha256 FROM runs '
                          'WHERE tenant=? AND idem_key=?',(owner,idem)).fetchone()
        if by_key is not None:
            if by_key==(thread,run_id,principal,calculated):return 'duplicate-no-write'
            return 'idempotency-conflict'
        by_run=db.execute('SELECT idem_key FROM runs WHERE tenant=? AND thread=? AND run_id=?',
                          (owner,thread,run_id)).fetchone()
        if by_run is not None:return 'run-key-conflict'
        if acl[2]!=expected_revision:return 'cas-stale-revision'
        cur=db.execute('UPDATE threads SET revision=revision+1 '
                       'WHERE tenant=? AND thread=? AND revision=? AND principal=? AND policy_epoch=?',
                       (owner,thread,expected_revision,principal,epoch))
        if cur.rowcount!=1:return 'cas-lost-race'
        db.execute('INSERT INTO runs VALUES (?,?,?,?,?,?,?)',
                   (owner,thread,run_id,principal,idem,expected_revision+1,calculated))
        db.execute('COMMIT')
        return 'committed'
    except sqlite3.IntegrityError:
        return 'unique-or-foreign-key-conflict'
    finally:
        if db.in_transaction:db.execute('ROLLBACK')
        db.close()

def race_worker(path:str,start:mp.synchronize.Event,queue:mp.queues.Queue,which:str)->None:
    try:
        if not start.wait(timeout=10):raise RuntimeError('race start timeout')
        result=commit(Path(path),'session-A','tenant-A','race-thread',which,'idem-'+which,
                      b'computed-original-bytes-'+which.encode(),0)
        queue.put(result)
    except Exception as error:queue.put('worker-error:'+str(error))

def sqlite_suite(out:Path)->None:
    path=out/'sqlite-proof.sqlite3'
    need(not path.exists(),'SQLite output already exists')
    setup_sqlite(path)
    checks=0
    def ok(condition:bool,label:str)->None:
        nonlocal checks
        need(condition,'SQLite check failed: '+label)
        checks+=1
        print('PASS: '+label,flush=True)
    payload=b'[ { "type": "RUN_STARTED", "threadId":"thread-A" } ]'
    args=('session-A','tenant-A','thread-A','run-1','idem-1',payload,0)
    ok(commit(path,*args)=='committed','transactional commit accepted on fixture ACL')
    with connect(path) as db:
        result=db.execute('SELECT revision,payload_sha256 FROM runs WHERE run_id=?',('run-1',)).fetchone()
        ok(result==(1,digest(payload)),'event-byte digest computed by SQLite harness, not caller supplied')
        ok(db.execute('SELECT revision FROM threads WHERE tenant=? AND thread=?',('tenant-A','thread-A')).fetchone()[0]==1,
           'checkpoint revision advanced once')
    ok(commit(path,*args)=='duplicate-no-write','identical retry deduplicated after closing connection')
    ok(commit(path,'session-A','tenant-A','thread-A','run-1','idem-1',payload+b'tamper',0)==
       'idempotency-conflict','changed payload digest refused under same idempotency key')
    ok(commit(path,'session-A','tenant-A','thread-A','run-2','idem-1',payload,1)==
       'idempotency-conflict','same idempotency key on different run refused')
    ok(commit(path,'session-A','tenant-A','thread-A','run-1','other-key',payload,1)==
       'run-key-conflict','same run with different key refused')
    ok(commit(path,'session-A','tenant-A','thread-A','run-2','idem-2',payload,0)==
       'cas-stale-revision','stale CAS revision rejected')
    ok(commit(path,'unknown','tenant-A','thread-A','run-2','idem-2',payload,1)==
       'session-lookup-denied','unknown simulated session lookup refused')
    ok(commit(path,'session-B','tenant-A','thread-A','run-2','idem-2',payload,1)==
       'tenant-scope-denied','cross-tenant session cannot claim another tenant')
    ok(commit(path,'session-other','tenant-A','thread-A','run-2','idem-2',payload,1)==
       'thread-acl-denied','other principal same tenant cannot access thread')
    ok(commit(path,'session-stale','tenant-A','thread-A','run-2','idem-2',payload,1)==
       'policy-epoch-stale','stale policy epoch refused')
    ok(commit(path,'session-A','tenant-A','not-allowed','run-2','idem-2',payload,1)==
       'thread-acl-denied','unknown thread denied')
    ok(commit(path,'session-A','tenant-A','thread-A','run-2','idem-2',b'',1)==
       'invalid-payload','empty payload refused before transaction')
    ok(commit(path,'session-A','tenant-A','thread-A','run-2','idem-2',payload,-1)==
       'invalid-revision','invalid revision refused before transaction')
    ok(commit(path,'session-A','tenant-A','thread-A','run-2','idem-2',payload,1)==
       'committed','fresh revision allows second atomic commit')
    with connect(path) as db:
        ok(db.execute('SELECT COUNT(*) FROM runs WHERE tenant=?',('tenant-A',)).fetchone()[0]==2,
           'blocked attempts did not create rows')
        ok(db.execute('SELECT revision FROM threads WHERE tenant=? AND thread=?',('tenant-A','thread-A')).fetchone()[0]==2,
           'accepted writes increment revision exactly twice')
    # Force two independent operating-system processes to attempt expected rev=0
    # against the same SQLite checkpoint. BEGIN IMMEDIATE serializes writers.
    ctx=mp.get_context('spawn')
    go=ctx.Event();results=ctx.Queue()
    left=ctx.Process(target=race_worker,args=(str(path),go,results,'race-left'))
    right=ctx.Process(target=race_worker,args=(str(path),go,results,'race-right'))
    left.start();right.start();go.set()
    left.join(20);right.join(20)
    if left.is_alive():left.terminate();left.join()
    if right.is_alive():right.terminate();right.join()
    ok(left.exitcode==0 and right.exitcode==0,'both competing OS processes completed')
    results_list=[results.get(timeout=2),results.get(timeout=2)]
    ok(sorted(results_list)==['cas-stale-revision','committed'],
       'concurrent processes yield exactly one CAS winner and one stale loser')
    with connect(path) as db:
        ok(db.execute('SELECT revision FROM threads WHERE tenant=? AND thread=?',
                      ('tenant-A','race-thread')).fetchone()[0]==1,
           'cross-process shared SQLite revision committed exactly once')
        ok(db.execute('SELECT COUNT(*) FROM runs WHERE thread=?',('race-thread',)).fetchone()[0]==1,
           'cross-process unique receipt inserted exactly once')
    ok(commit(path,'session-A','tenant-A','race-thread','race-third','idem-race-third',payload,0)==
       'cas-stale-revision','after process restart stale retry remains rejected')
    with connect(path) as db:
        ok(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','SQLite database integrity check passes')
        db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    ok(path.is_file() and path.stat().st_size>0,'physical SQLite evidence persisted outside Git')
    print(f'{checks} 2.6M SQLite file-backed CAS/ACL fixture assertions passed',flush=True)


def gate(name:str,cmd:list[str],cwd:Path,path:Path)->None:
    with path.open('w',encoding='utf-8') as output:
        try:result=subprocess.run(cmd,cwd=cwd,stdout=output,stderr=subprocess.STDOUT,
                                  timeout=240,check=False)
        except subprocess.TimeoutExpired:
            raise RuntimeError('BLOCKED: timeout '+name) from None
    need(result.returncode==0,'gate failed: '+name+' at '+str(path))
    print('PASS: '+name+' SHA256 '+digest(path.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    repo=ROOT.resolve();target=out.resolve()
    need(target!=repo and repo not in target.parents,'evidence must remain outside Git checkout')
    need(not out.exists(),'evidence destination already exists: '+str(out))
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
         'src/ag-ui/trusted-transaction-boundary.spec.ts','--outDir',str(ssr),'--emptyOutDir'],
         WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    gate('pure.log',['node',str(ssr/'trusted-transaction-boundary.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf-8')
    match=re.search(r'(?m)^(\d+) 2\.6M selected trusted-boundary design assertions passed\s*$',pure)
    need(match is not None and int(match.group(1))==ASSERTIONS,'TypeScript assertion count not 152')
    need(pure.count('PASS: ')==ASSERTIONS,'pure test PASS count drift')
    for phrase in CRITICAL:need('PASS: '+phrase in pure,'missing critical case: '+phrase)
    # True physical SQLite transaction experiment, no test doubles in this gate.
    gate('sqlite.log',[sys.executable,str(ROOT/RUNNER),'--sqlite-child',
         '--output-dir',str(out)],ROOT,out/'sqlite.log')
    sqlite_log=(out/'sqlite.log').read_text(encoding='utf-8')
    match_db=re.search(r'(?m)^(\d+) 2\.6M SQLite file-backed CAS/ACL fixture assertions passed\s*$',sqlite_log)
    need(match_db is not None and int(match_db.group(1))==25,'SQLite proof count not 24')
    need(sqlite_log.count('PASS: ')==25,'SQLite log PASS count drift')
    db_file=out/'sqlite-proof.sqlite3'
    need(db_file.is_file() and not db_file.is_symlink(),'physical SQLite evidence absent')
    preflight(schema)
    gate_hashes={n:digest((out/n).read_bytes()) for n in
                 ('lint.log','build.log','compile.log','pure.log','sqlite.log')}
    evidence={
      'lab':'2.6M','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
      'agui_upstream_commit':AGUI_COMMIT,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
      'published_source_blobs':BLOBS,
      'scope':'isolated callback injected test identity plus physical SQLite file-backed CAS evidence',
      'pure_assertions':ASSERTIONS,'sqlite_assertions':25,'critical_typescript_cases':len(CRITICAL),
      'gate_logs_sha256':gate_hashes,'sqlite_file_sha256':digest(db_file.read_bytes()),
      'sources_sha256':{p:digest((ROOT/p).read_bytes()) for p in (SRC,TEST,RUNNER)},
      'gap_ids_open':['G'+str(i) for i in range(1,10)],
      'adapter_ready':False,'parent_2_6_open':True,
      'external_authentication_verified':False,'production_store_verified':False,
      'independent_security_signoff':False,
      'limits':[
        'Session reference is resolved by synthetic fixture lookup, not verified credential/SSO',
        'TypeScript boundary returns a pure proposal; no transaction or cryptographic event digest in TS',
        'SQLite SHA-256 digest is computed from fixture bytes, not authenticated producer data',
        'SQLite transactions and two-process CAS are real only in isolated local SQLite test DB',
        'No enterprise database, production resilience, distributed deployment or network failure injection',
        'No real tenant ACL, issuer trust, expiry checks, token binding or independent penetration review',
        'No frontend/Agent Server integration, partial HTTP resumption or production idempotency',
        'G1-G9 and parent milestone 2.6 remain OPEN; AG-UI adapter BLOCKED'
      ],'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    lines=['# MASL 2.6M — trusted-boundary design and isolated SQLite transaction evidence','',
      f'Published baseline `{HEAD}`. Upstream AG-UI `{AGUI_COMMIT}`.','',
      f'**{ASSERTIONS}/{ASSERTIONS}** pure TS assertions; **25/25** SQLite fixture assertions; five gates PASS.','',
      '| Gate / SQLite file | SHA-256 |','|---|---|',
      *[f'| `{n}` | `{h}` |' for n,h in gate_hashes.items()],
      f'| `sqlite-proof.sqlite3` | `{evidence["sqlite_file_sha256"]}` |',
      '', '## Limitations','',*[f'- {limit}' for limit in evidence['limits']],
      '', 'G1–G9 OPEN; adapter BLOCKED; parent milestone 2.6 OPEN.','']
    (out/'review.md').write_text('\n'.join(lines),encoding='utf-8')
    print('REVIEW STATUS: PASS — selected 2.6M boundary design and isolated SQLite CAS; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)
    for name in ('review.json','review.md','sqlite-proof.sqlite3'):
        print('EVIDENCE: '+name+' SHA256 '+digest((out/name).read_bytes()),flush=True)

def main()->None:
    parser=argparse.ArgumentParser(description=__doc__)
    modes=parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--preflight',action='store_true')
    modes.add_argument('--run',action='store_true')
    modes.add_argument('--sqlite-child',action='store_true',help=argparse.SUPPRESS)
    parser.add_argument('--schema',type=Path,default=SCHEMA_DEFAULT)
    parser.add_argument('--output-dir',type=Path)
    args=parser.parse_args()
    try:
        if args.sqlite_child:
            need(args.output_dir is not None,'SQLite experiment requires output')
            out=args.output_dir.expanduser().absolute()
            need(out.is_dir() and out!=ROOT.resolve() and ROOT.resolve() not in out.parents,
                 'SQLite proof may not run inside checkout')
            sqlite_suite(out)
        elif args.preflight:preflight(args.schema.expanduser().absolute())
        else:
            need(args.output_dir is not None,'--run requires --output-dir')
            run(args.schema.expanduser().absolute(),args.output_dir.expanduser().absolute())
    except (OSError,RuntimeError,ValueError,TypeError,KeyError,sqlite3.Error,
            subprocess.CalledProcessError) as ex:
        msg=str(ex)
        print(msg if msg.startswith('BLOCKED:') else 'BLOCKED: '+msg,file=sys.stderr)
        raise SystemExit(2) from None

if __name__=='__main__':main()
