#!/usr/bin/env python3
"""MASL 2.6N: isolated fixture JWT-HMAC/SQLite interoperability and TS gates.

Five local gates, eight evidence artifacts, all stored OUTSIDE Git. Neither
HMAC fixtures nor test ACLs model real federated identity, online JWKS,
revocation, cross-service authorization or production durability. No HTTP,
Agent Server, frontend, production credentials, Runtime, model or tool call.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
from hashlib import sha1, sha256
import hmac
import json
import multiprocessing as mp
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'apps/web'
HEAD='c890ea464856fcc5bb8771f14bdda5a99a79531c'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/external-interop-gates.ts'
TEST='apps/web/src/ag-ui/external-interop-gates.spec.ts'
RUNNER='scripts/lab-26n-external-interop-review.py'
SOURCE_SHA='19df525c556ed63176d56eeb9267426e28a3f4a79e7b8bcc97d108789a0b807a'
TEST_SHA='d9c59e94568fd44776165269cd4ac77531b416c25cf39926374471d90d0b3f3c'
ASSERTIONS=241
FIXTURE_ASSERTIONS=37
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'9e36c6722c890a769007dd462434895c138d49df',
 'CURRENT.md':'16284d206769356194954fc469261a6f28f3e862',
 'docs/journal/lab-23-ag-ui.md':'d54c3ca3d1f7f9dabe4b0d1c44941839f2d37d8d',
 'apps/web/src/ag-ui/trusted-transaction-boundary.ts':'673f511c91781b59184095ed74f588e8bb81b60d',
 'apps/web/src/ag-ui/trusted-transaction-boundary.spec.ts':'9087e4e7b1833c27e3723f7cfe85b4c73463d097',
 'scripts/lab-26m-transaction-review.py':'cecfd671e6cfcfba3f6b574160e77f4ecc483e1d',
 'apps/web/src/ag-ui/authorized-durable-replay.ts':'4815d938b17174a7ce4a93398dba8f1ec77f1e98',
 'apps/web/src/ag-ui/replay-recovery.ts':'583a22d4697846201325ffe6be5fb120a87e2f80',
 'apps/web/src/ag-ui/pipeline-transport.ts':'eb2384d0134ad3290fa5a3f5929741f991785054',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
}
CRITICAL=(
 'published 2.6M trusted boundary composes with fixture interop gate',
 'caller-supplied privileged principalId rejected',
 'unknown credential fixture lookup denied',
 'tenant mismatch from caller rejected',
 'thread outside fixture ACL rejected',
 'stale CAS plan rejected by published 2.6L',
 'partial resume still unsupported',
 'expired credential rejected',
 'fixture store failure blocks',
 'all G1-G9 stay OPEN after selected fixture tests',
 'parent 2.6 remains OPEN',
)

def need(ok:bool,msg:str)->None:
    if not ok:raise RuntimeError('BLOCKED: '+msg)
def git(*args:str,cwd:Path=ROOT)->str:
    return subprocess.check_output(['git',*args],cwd=cwd,text=True,stderr=subprocess.STDOUT).strip()
def digest(raw:bytes)->str:return sha256(raw).hexdigest()
def blob(raw:bytes)->str:return sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()

def schema_gate(path:Path)->None:
    need(path.is_file() and not path.is_symlink(),'pinned schema absent/symlink')
    raw=path.read_bytes()
    need(digest(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,'pinned schema hash/blob changed')
    doc=json.loads(raw)
    need(doc.get('$id')=='https://ag-ui.com/spec/1.0/schema.json','schema identity changed')
    need(len(doc['$defs']['Event']['oneOf'])==31,'AG-UI event union changed')
    print('PASS: pinned official AG-UI 1.0 schema SHA256/Git blob and 31 events',flush=True)

def preflight(schema:Path)->None:
    need(git('symbolic-ref','--quiet','--short','HEAD')=='main','expected main branch')
    need(git('rev-parse','HEAD')==HEAD,'HEAD differs from published 2.6M baseline')
    need(git('rev-parse','origin/main')==HEAD,'origin/main differs from published baseline')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked/index changes detected')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'unexpected untracked files')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop changed')
    for path,expected in BLOBS.items():
        need(git('rev-parse','HEAD:'+path)==expected,'published blob drift: '+path)
        need(git('hash-object',path)==expected,'tracked worktree drift: '+path)
    for path,expected in ((SRC,SOURCE_SHA),(TEST,TEST_SHA)):
        p=ROOT/path
        need(p.is_file() and not p.is_symlink() and digest(p.read_bytes())==expected,
             '2.6N payload SHA drift: '+path)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),
         '2.6N runner missing/symlink')
    roadmap=(ROOT/'ROADMAP.md').read_text(encoding='utf-8').splitlines()
    need(roadmap.count('- [ ] 2.6 AG-UI')==1,'2.6 parent closed unexpectedly')
    need(roadmap.count('  - [ ] 2.6N AG-UI external identity and durable-store interoperability gates')==1,
         '2.6N roadmap anchor missing')
    schema_gate(schema)
    print('PASS: exact c890ea4 HEAD/origin, ten Git blobs, pinned workshop, three 2.6N files',flush=True)
    print('PASS: read-only preflight; no Git writes, network, Agent Server or real identity provider',flush=True)

# TEST-ONLY HMAC key, intentionally NOT an external OIDC/JWKS or production secret.
TEST_KEY=b'MASL-fixture-only-disposable-HMAC-key-not-a-production-secret'
TEST_NOW=1_000_500
ISSUER='https://fixture.invalid/masl-issuer'
AUDIENCE='masl-agui-fixture'
IDS=re.compile(r'[A-Za-z0-9._:-]{1,128}\Z')
ENCODE=re.compile(r'[A-Za-z0-9_-]+\Z')

def b64(raw:bytes)->str:return base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')
def unb64(s:str)->bytes:
    if not isinstance(s,str) or not ENCODE.fullmatch(s):raise ValueError('base64url-shape')
    raw=base64.urlsafe_b64decode(s+'='*((-len(s))%4))
    if b64(raw)!=s:raise ValueError('base64url-noncanonical')
    return raw

def json_unique(raw:bytes)->object:
    def pairs(pairs:list[tuple[str,object]])->dict[str,object]:
        value={}
        for key,thing in pairs:
            if key in value:raise ValueError('duplicate-json-field')
            value[key]=thing
        return value
    return json.loads(raw.decode('utf-8'),object_pairs_hook=pairs,
                      parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))

def make_token(claims:dict|None=None,header:dict|None=None)->str:
    h={'alg':'HS256','kid':'fixture-k1','typ':'JWT'} if header is None else header
    p={'iss':ISSUER,'aud':AUDIENCE,'sub':'principal-A','tenant':'tenant-A',
       'iat':TEST_NOW-10,'nbf':TEST_NOW-10,'exp':TEST_NOW+240,'jti':'fixture-jti-A',
       'epoch':9} if claims is None else claims
    signed=b64(json.dumps(h,sort_keys=True,separators=(',',':')).encode())+'.'+\
           b64(json.dumps(p,sort_keys=True,separators=(',',':')).encode())
    return signed+'.'+b64(hmac.digest(TEST_KEY,signed.encode(),'sha256'))

def verify_fixture_token(token:str,now:int=TEST_NOW)->tuple[str,dict|None]:
    if type(token) is not str or len(token)>2048 or token.count('.')!=2:
        return 'jwt-format-denied',None
    try:
        a,b,c=token.split('.')
        header=json_unique(unb64(a));claims=json_unique(unb64(b));sig=unb64(c)
        if not isinstance(header,dict) or set(header)!={'alg','kid','typ'} or \
           header!={'alg':'HS256','kid':'fixture-k1','typ':'JWT'}:
            return 'jwt-header-denied',None
        if len(sig)!=32 or not hmac.compare_digest(sig,hmac.digest(TEST_KEY,(a+'.'+b).encode(),'sha256')):
            return 'jwt-signature-denied',None
        if not isinstance(claims,dict) or set(claims)!={'iss','aud','sub','tenant','iat','nbf','exp','jti','epoch'}:
            return 'jwt-claims-denied',None
        if claims['iss']!=ISSUER or claims['aud']!=AUDIENCE or \
           any(type(claims[k]) is not str or not IDS.fullmatch(claims[k]) for k in ('sub','tenant','jti')):
            return 'jwt-identity-denied',None
        if any(type(claims[k]) is not int or claims[k]<0 for k in ('iat','nbf','exp','epoch')):
            return 'jwt-claims-denied',None
        if claims['iat']>now or claims['nbf']>now or claims['exp']<=now or \
           claims['exp']<=claims['iat'] or claims['exp']-claims['iat']>300:
            return 'jwt-time-denied',None
        return 'fixture-verified',claims
    except (ValueError,UnicodeError,TypeError,KeyError,OverflowError,base64.binascii.Error):
        return 'jwt-format-denied',None

DB_SCHEMA='''
CREATE TABLE acl(tenant TEXT NOT NULL,thread TEXT NOT NULL,principal TEXT NOT NULL,
  epoch INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(tenant,thread));
CREATE TABLE receipts(tenant TEXT NOT NULL,thread TEXT NOT NULL,run_id TEXT NOT NULL,
  principal TEXT NOT NULL,idem_key TEXT NOT NULL,revision INTEGER NOT NULL,
  payload_sha256 TEXT NOT NULL,PRIMARY KEY(tenant,thread,run_id),
  UNIQUE(tenant,idem_key),FOREIGN KEY(tenant,thread) REFERENCES acl(tenant,thread));
'''
def connect(path:Path)->sqlite3.Connection:
    db=sqlite3.connect(path,timeout=10,isolation_level=None)
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=10000')
    return db

def fixture_store(path:Path)->None:
    with connect(path) as db:
        need(db.execute('PRAGMA journal_mode=WAL').fetchone()[0]=='wal','SQLite WAL unavailable')
        db.execute('PRAGMA synchronous=FULL')
        db.executescript(DB_SCHEMA)
        db.executemany('INSERT INTO acl(tenant,thread,principal,epoch) VALUES(?,?,?,?)',[
            ('tenant-A','thread-A','principal-A',9),
            ('tenant-A','race-thread','principal-A',9),
            ('tenant-A','thread-B','principal-B',9),
            ('tenant-B','thread-A','principal-B',9),
        ])

def transact(path:Path,token:str,tenant:str,thread:str,run_id:str,idem:str,
             payload:bytes,revision:int)->str:
    status,claims=verify_fixture_token(token)
    if status!='fixture-verified' or claims is None:return status
    if any(type(v) is not str or not IDS.fullmatch(v) for v in (tenant,thread,run_id,idem)):
        return 'intent-invalid-identifier'
    if type(payload) is not bytes or not 0<len(payload)<=131072:return 'intent-invalid-bytes'
    if type(revision) is not int or not 0<=revision<=1024:return 'intent-invalid-revision'
    if claims['tenant']!=tenant:return 'jwt-tenant-scope-denied'
    sha=digest(payload)
    db=connect(path)
    try:
        db.execute('BEGIN IMMEDIATE')
        acl=db.execute('SELECT principal,epoch,revision FROM acl WHERE tenant=? AND thread=?',
                       (tenant,thread)).fetchone()
        if acl is None or acl[0]!=claims['sub']:return 'fixture-acl-denied'
        if acl[1]!=claims['epoch']:return 'fixture-epoch-stale'
        old=db.execute('SELECT thread,run_id,principal,payload_sha256 FROM receipts '
                       'WHERE tenant=? AND idem_key=?',(tenant,idem)).fetchone()
        if old is not None:
            return 'duplicate-no-write' if old==(thread,run_id,claims['sub'],sha) else 'idempotency-conflict'
        if db.execute('SELECT 1 FROM receipts WHERE tenant=? AND thread=? AND run_id=?',
                      (tenant,thread,run_id)).fetchone():return 'run-key-conflict'
        if acl[2]!=revision:return 'cas-stale-revision'
        cur=db.execute('UPDATE acl SET revision=revision+1 WHERE tenant=? AND thread=? '
                       'AND principal=? AND epoch=? AND revision=?',
                       (tenant,thread,claims['sub'],claims['epoch'],revision))
        if cur.rowcount!=1:return 'cas-lost-race'
        db.execute('INSERT INTO receipts VALUES(?,?,?,?,?,?,?)',
                   (tenant,thread,run_id,claims['sub'],idem,revision+1,sha))
        db.execute('COMMIT')
        return 'committed'
    except sqlite3.IntegrityError:return 'sqlite-integrity-denied'
    finally:
        if db.in_transaction:db.execute('ROLLBACK')
        db.close()

def race_worker(path:str,start:object,queue:object,suffix:str)->None:
    try:
        if not start.wait(timeout=15):raise RuntimeError('start barrier timeout')
        result=transact(Path(path),make_token(),'tenant-A','race-thread',
                        'race-'+suffix,'idem-race-'+suffix,b'race-payload-'+suffix.encode(),0)
        queue.put(result)
    except Exception as exc:queue.put('worker-failed:'+str(exc))

def fixture_suite(out:Path)->None:
    db_path=out/'interop-proof.sqlite3'
    need(not db_path.exists(),'fixture database exists')
    fixture_store(db_path)
    checks=0
    def ok(predicate:bool,label:str)->None:
        nonlocal checks
        need(predicate,'fixture case failed: '+label)
        checks+=1
        print('PASS: '+label,flush=True)
    good=make_token()
    status,parsed=verify_fixture_token(good)
    ok(status=='fixture-verified' and parsed is not None,'fixture HMAC verifies valid test issuer/audience')
    ok(verify_fixture_token(good+'X')[0]=='jwt-signature-denied','altered JWT signature rejected')
    ok(verify_fixture_token(good.replace('.', '..',1))[0]=='jwt-format-denied','malformed JWT segmentation rejected')
    ok(verify_fixture_token('x.y.z')[0]=='jwt-format-denied','malformed JWT encoding rejected')
    ok(verify_fixture_token(make_token(header={'alg':'none','kid':'fixture-k1','typ':'JWT'}))[0]==
       'jwt-header-denied','alg none rejected')
    ok(verify_fixture_token(make_token(header={'alg':'HS256','kid':'unknown','typ':'JWT'}))[0]==
       'jwt-header-denied','unknown fixture kid rejected')
    base=json_unique(unb64(good.split('.')[1]))
    need(isinstance(base,dict),'fixture parser failed')
    ok(verify_fixture_token(make_token({**base,'iss':'https://other.invalid'}))[0]=='jwt-identity-denied',
       'wrong issuer rejected even with valid fixture HMAC')
    ok(verify_fixture_token(make_token({**base,'aud':'other'}))[0]=='jwt-identity-denied',
       'wrong audience rejected')
    ok(verify_fixture_token(make_token({**base,'exp':TEST_NOW}))[0]=='jwt-time-denied',
       'expired token rejected')
    ok(verify_fixture_token(make_token({**base,'nbf':TEST_NOW+1}))[0]=='jwt-time-denied',
       'not-before future token rejected')
    ok(verify_fixture_token(make_token({**base,'iat':TEST_NOW+1}))[0]=='jwt-time-denied',
       'issued-in-future token rejected')
    ok(verify_fixture_token(make_token({**base,'exp':TEST_NOW+400}))[0]=='jwt-time-denied',
       'TTL over 300 seconds rejected')
    ok(verify_fixture_token(make_token({**base,'epoch':True}))[0]=='jwt-claims-denied',
       'boolean policy epoch cannot pass integer validation')
    ok(verify_fixture_token(make_token({**base,'principal':'administrator'}))[0]=='jwt-claims-denied',
       'unexpected elevated JWT claim rejected')
    # Signature-bound duplicate JSON field: valid HMAC but strict JSON parser blocks it.
    raw_payload=('{'+'"iss":'+json.dumps(ISSUER)+',"iss":"evil",'+
      ','.join(json.dumps(k)+':'+json.dumps(v) for k,v in base.items() if k!='iss')+'}').encode()
    pair=good.split('.')[0]+'.'+b64(raw_payload)
    duplicate=pair+'.'+b64(hmac.digest(TEST_KEY,pair.encode(),'sha256'))
    ok(verify_fixture_token(duplicate)[0]=='jwt-format-denied','duplicate JSON claim rejected despite valid HMAC')
    payload=b'fixture-sse-byte-content'
    args=(good,'tenant-A','thread-A','run-1','idem-1',payload,0)
    ok(transact(db_path,*args)=='committed','signed fixture plus DB ACL creates transactional receipt')
    with connect(db_path) as db:
        ok(db.execute('SELECT payload_sha256,revision FROM receipts WHERE run_id=?',('run-1',)).fetchone()==
           (digest(payload),1),'persisted receipt digest derives from raw bytes')
    ok(transact(db_path,*args)=='duplicate-no-write','same signed fixture replay deduplicated across DB connections')
    ok(transact(db_path,good,'tenant-A','thread-A','run-1','idem-1',payload+b'x',0)==
       'idempotency-conflict','changed replay bytes rejected')
    ok(transact(db_path,good,'tenant-A','thread-A','run-2','idem-1',payload,1)==
       'idempotency-conflict','key reuse for different run rejected')
    ok(transact(db_path,good,'tenant-A','thread-A','run-1','different-key',payload,1)==
       'run-key-conflict','run cannot be reissued under new key')
    ok(transact(db_path,good,'tenant-B','thread-A','run-2','idem-2',payload,1)==
       'jwt-tenant-scope-denied','signed tenant cannot cross tenant boundary')
    ok(transact(db_path,good,'tenant-A','thread-B','run-2','idem-2',payload,0)==
       'fixture-acl-denied','different principal in same tenant denied')
    ok(transact(db_path,make_token({**base,'epoch':8}), 'tenant-A','thread-A','run-2',
                'idem-2',payload,1)=='fixture-epoch-stale','outdated signed policy epoch rejected by DB ACL')
    ok(transact(db_path,good,'tenant-A','missing-thread','run-2','idem-2',payload,0)==
       'fixture-acl-denied','missing thread ACL rejected')
    ok(transact(db_path,good,'tenant-A','thread-A','run-2','idem-2',payload,0)==
       'cas-stale-revision','stale revision rejected after external DB reload')
    ok(transact(db_path,good,'tenant-A','thread-A','run-2','idem-2',payload,1)==
       'committed','fresh revision commits second receipt')
    ok(transact(db_path,good,'tenant-A','thread-A','run-3','idem-3',b'',2)==
       'intent-invalid-bytes','empty payload rejected before transaction')
    ok(transact(db_path,good,'tenant-A','thread-A','run-3','idem-3',payload,-1)==
       'intent-invalid-revision','invalid revision rejected before transaction')
    ok(transact(db_path,good,'tenant-A','thread-A','run-3','id;DROP TABLE acl',payload,2)==
       'intent-invalid-identifier','malformed SQL-like id rejected before query')
    ctx=mp.get_context('spawn');go=ctx.Event();queue=ctx.Queue()
    left=ctx.Process(target=race_worker,args=(str(db_path),go,queue,'left'))
    right=ctx.Process(target=race_worker,args=(str(db_path),go,queue,'right'))
    left.start();right.start();go.set()
    left.join(20);right.join(20)
    if left.is_alive():left.terminate();left.join()
    if right.is_alive():right.terminate();right.join()
    ok(left.exitcode==0 and right.exitcode==0,'both competing isolated OS processes completed')
    outcomes=sorted([queue.get(timeout=3),queue.get(timeout=3)])
    ok(outcomes==['cas-stale-revision','committed'],
       'cross-process SQLite race produces one winner and one stale loser')
    with connect(db_path) as db:
        ok(db.execute('SELECT revision FROM acl WHERE tenant=? AND thread=?',
           ('tenant-A','race-thread')).fetchone()[0]==1,
           'race checkpoint advanced exactly one durable revision')
        ok(db.execute('SELECT COUNT(*) FROM receipts WHERE thread=?',('race-thread',)).fetchone()[0]==1,
           'race created only one receipt')
        ok(db.execute('SELECT COUNT(*) FROM receipts WHERE tenant=?',('tenant-A',)).fetchone()[0]==3,
           'rejected fixture calls left no extra receipts')
        ok(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok',
           'physical fixture SQLite integrity verified')
        db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    ok(db_path.exists() and db_path.stat().st_size>0,'physical fixture SQLite file persisted outside Git')
    print(f'{checks} 2.6N fixture HMAC-JWT/SQLite interoperability assertions passed',flush=True)

def gate(name:str,command:list[str],cwd:Path,out:Path)->None:
    with out.open('w',encoding='utf-8') as stream:
        try:
            result=subprocess.run(command,cwd=cwd,stdout=stream,stderr=subprocess.STDOUT,
                                  timeout=240,check=False)
        except subprocess.TimeoutExpired:
            raise RuntimeError('BLOCKED: gate timeout '+name) from None
    need(result.returncode==0,'gate failed: '+name+' at '+str(out))
    print('PASS: '+name+' SHA256 '+digest(out.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    root=ROOT.resolve();target=out.resolve()
    need(root!=target and root not in target.parents,'evidence must remain outside Git')
    need(not out.exists(),'evidence folder already exists')
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
         'src/ag-ui/external-interop-gates.spec.ts','--outDir',str(ssr),'--emptyOutDir'],
         WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    gate('pure.log',['node',str(ssr/'external-interop-gates.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf-8')
    match=re.search(r'(?m)^(\d+) 2\.6N selected external-interop TypeScript assertions passed\s*$',pure)
    need(match is not None and int(match.group(1))==ASSERTIONS,
         f'TypeScript expected {ASSERTIONS} assertions')
    need(pure.count('PASS: ')==ASSERTIONS,'TypeScript PASS line count differs')
    for label in CRITICAL:need('PASS: '+label in pure,'critical case missing: '+label)
    gate('fixture.log',[sys.executable,str(ROOT/RUNNER),'--fixture-child',
         '--output-dir',str(out)],ROOT,out/'fixture.log')
    log=(out/'fixture.log').read_text(encoding='utf-8')
    fixture_match=re.search(r'(?m)^(\d+) 2\.6N fixture HMAC-JWT/SQLite interoperability assertions passed\s*$',log)
    need(fixture_match is not None and int(fixture_match.group(1))==FIXTURE_ASSERTIONS,
         f'fixture expected {FIXTURE_ASSERTIONS} assertions')
    need(log.count('PASS: ')==FIXTURE_ASSERTIONS,'fixture PASS line count differs')
    db=out/'interop-proof.sqlite3'
    need(db.is_file() and not db.is_symlink(),'fixture SQLite artifact missing')
    preflight(schema)
    logs={p:digest((out/p).read_bytes()) for p in
          ('lint.log','build.log','compile.log','pure.log','fixture.log')}
    evidence={
      'lab':'2.6N','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
      'agui_upstream_commit':AGUI_COMMIT,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
      'published_git_blobs':BLOBS,
      'scope':'selected callback-identity TS contracts plus offline HMAC/JWT fixture and SQLite CAS',
      'typescript_assertions':ASSERTIONS,'fixture_assertions':FIXTURE_ASSERTIONS,
      'critical_cases':len(CRITICAL),'gate_logs_sha256':logs,
      'sqlite_sha256':digest(db.read_bytes()),
      'sources_sha256':{p:digest((ROOT/p).read_bytes()) for p in (SRC,TEST,RUNNER)},
      'gap_ids_open':['G'+str(i) for i in range(1,10)],
      'adapter_ready':False,'parent_2_6_open':True,
      'external_identity_provider_verified':False,
      'production_durable_store_verified':False,'security_signoff':False,
      'limits':[
         'HMAC/JWT fixture uses embedded disposable local test key, not real issuer, OIDC, JWKS or credential transport',
         'TS callback identity and checkpoint are synthetic harness values; no cryptographic verification in TS',
         'JWT fixture does not implement token revocation, TLS, rotation with trusted issuers or anti-replay of token jti',
         'Local SQLite transactions and two-process CAS are not enterprise distributed persistence',
         'SHA-256 covers synthetic bytes only; no authenticated AG-UI event producer or complete protocol conformance',
         'No Agent Server adapter or frontend integration, operational SSE resume or external security review',
         'All G1-G9, 2.6 remain OPEN; AG-UI adapter BLOCKED'
      ],'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    markdown=['# MASL 2.6N — selected external fixture interoperability evidence','',
       f'Published baseline `{HEAD}`; AG-UI `{AGUI_COMMIT}`.','',
       f'**{ASSERTIONS}/{ASSERTIONS}** TypeScript assertions; **{FIXTURE_ASSERTIONS}/{FIXTURE_ASSERTIONS}** local HMAC/JWT + SQLite fixture assertions; five gates PASS.','',
       '| Gate | SHA-256 |','|---|---|',
       *[f'| `{p}` | `{h}` |' for p,h in logs.items()],
       '',f'Physical SQLite fixture SHA-256 `{digest(db.read_bytes())}`.','',
       '## Limitations','',*[f'- {p}' for p in evidence['limits']],
       '', 'G1–G9 OPEN; parent 2.6 OPEN; adapter BLOCKED.','']
    (out/'review.md').write_text('\n'.join(markdown),encoding='utf-8')
    print('REVIEW STATUS: PASS — selected 2.6N fixture interoperability; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)
    for n in ('review.json','review.md','interop-proof.sqlite3'):
        print('EVIDENCE: '+n+' SHA256 '+digest((out/n).read_bytes()),flush=True)

def main()->None:
    ap=argparse.ArgumentParser(description=__doc__)
    mode=ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--preflight',action='store_true')
    mode.add_argument('--run',action='store_true')
    mode.add_argument('--fixture-child',action='store_true',help=argparse.SUPPRESS)
    ap.add_argument('--schema',type=Path,default=DEFAULT_SCHEMA)
    ap.add_argument('--output-dir',type=Path)
    args=ap.parse_args()
    try:
        if args.fixture_child:
            need(args.output_dir is not None,'fixture child requires output directory')
            fixture_suite(args.output_dir.expanduser().absolute())
        elif args.preflight:preflight(args.schema.expanduser().absolute())
        else:
            need(args.output_dir is not None,'--run requires --output-dir')
            run(args.schema.expanduser().absolute(),args.output_dir.expanduser().absolute())
    except (RuntimeError,ValueError,KeyError,OSError,TypeError,sqlite3.Error,
            subprocess.CalledProcessError) as e:
        print(str(e) if str(e).startswith('BLOCKED:') else 'BLOCKED: '+str(e),file=sys.stderr)
        raise SystemExit(2) from None

if __name__=='__main__':main()
