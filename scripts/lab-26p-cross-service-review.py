#!/usr/bin/env python3
"""MASL 2.6P: selected cross-service trust/recovery experiments, isolated only.

Five local gates. Read-only --preflight, --run creates eight evidence artifacts
ONLY outside Git. The Python fixture uses independently spawned processes,
local OpenSSL RS256 signatures and a local SQLite transactional store. There is
NO network, OIDC/JWKS deployment, authenticated service transport, AG-UI adapter,
production revocation or distributed atomic transaction.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha1, sha256
import importlib.util
import json
import multiprocessing as mp
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'apps/web'
HEAD='42310c8a184215b270709c5c42caf16757351fb8'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
UPSTREAM='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/cross-service-recovery.ts'
TEST='apps/web/src/ag-ui/cross-service-recovery.spec.ts'
RUNNER='scripts/lab-26p-cross-service-review.py'
SRC_SHA='80061b9a1a2ee54d5000ffaff403b8e1cf53518ffd6687dec4ce9a534c1276c9'
TEST_SHA='6b40c1cf70220a40e80ba21d63539d6f0fd33e80f6729a7ac2e819027903f49a'
ASSERTIONS=329
FIXTURE_ASSERTIONS=37
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'9759fe7bdec9c0cbdd62b3cc58421d5a586ab97f',
 'CURRENT.md':'953358561e54c3b43f93be6041c888dd6ccec544',
 'docs/journal/lab-23-ag-ui.md':'4114749514b58f76d440fb37f27fe3a41a261727',
 'apps/web/src/ag-ui/issuer-revocation-failures.ts':'dbef5f2bf73ab97fc624365c11a2cc02599ce689',
 'apps/web/src/ag-ui/issuer-revocation-failures.spec.ts':'af97585379493cb64c83486bd828b1aaaa109eff',
 'scripts/lab-26o-issuer-failure-review.py':'578edb9cbcbb453ca36cce72c2f25c35fa7a60ab',
 'apps/web/src/ag-ui/external-interop-gates.ts':'5ea2006f07f16980f0ed2bf29ed58d10e23b44df',
 'apps/web/src/ag-ui/trusted-transaction-boundary.ts':'673f511c91781b59184095ed74f588e8bb81b60d',
 'apps/web/src/ag-ui/authorized-durable-replay.ts':'4815d938b17174a7ce4a93398dba8f1ec77f1e98',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
}
CRITICAL=(
 '2.6O published issuer/revocation gate composes after service metadata',
 'fixture persisted receipt reconciles after lost acknowledgement',
 'request cannot inject privileged principalId',
 'untrusted or malformed cross-service metadata',
 'metadata freshness rejects time 1061',
 'service proof and provider metadata disagree',
 'revocation proof stale or misbound',
 'revoked token blocked before planning',
 'reconciliation receipt scope/digest/revision rejected',
 'metadata service outage fail closed',
 'revocation service outage fail closed',
 'all G1-G9 remain OPEN',
 'parent AG-UI 2.6 remains OPEN',
)

def need(ok:bool,msg:str)->None:
    if not ok:raise RuntimeError('BLOCKED: '+msg)
def git(*args:str,cwd:Path=ROOT)->str:
    return subprocess.check_output(['git',*args],cwd=cwd,stderr=subprocess.STDOUT,text=True).strip()
def digest(raw:bytes)->str:return sha256(raw).hexdigest()
def blob(raw:bytes)->str:return sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()

def schema_gate(path:Path)->None:
    need(path.is_file() and not path.is_symlink(),'pinned AG-UI schema missing/symlink')
    raw=path.read_bytes();need(digest(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,'schema pin drift')
    document=json.loads(raw)
    need(document.get('$id')=='https://ag-ui.com/spec/1.0/schema.json','schema id changed')
    need(len(document['$defs']['Event']['oneOf'])==31,'31 event variants changed')
    print('PASS: pinned AG-UI 1.0 schema SHA256/Git blob and 31 event variants',flush=True)

def preflight(schema:Path)->None:
    need(git('symbolic-ref','--quiet','--short','HEAD')=='main','expected main')
    need(git('rev-parse','HEAD')==HEAD,'HEAD differs from published 2.6O baseline')
    need(git('rev-parse','origin/main')==HEAD,'origin/main differs from baseline')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked or staged worktree drift')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'untracked scope differs from exactly three 2.6P files')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'workshop reference changed')
    for rel,expected in BLOBS.items():
        need(git('rev-parse','HEAD:'+rel)==expected,'published Git blob drift: '+rel)
        need(git('hash-object',rel)==expected,'tracked worktree blob drift: '+rel)
    for rel,expected in ((SRC,SRC_SHA),(TEST,TEST_SHA)):
        item=ROOT/rel
        need(item.is_file() and not item.is_symlink() and digest(item.read_bytes())==expected,
             '2.6P source SHA drift: '+rel)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),
         '2.6P runner missing/symlink')
    road=(ROOT/'ROADMAP.md').read_text(encoding='utf8').splitlines()
    need(road.count('- [ ] 2.6 AG-UI')==1,'parent 2.6 closed unexpectedly')
    need(road.count('  - [ ] 2.6P AG-UI cross-service issuer trust and recovery integration gates')==1,
         '2.6P pending roadmap anchor missing')
    schema_gate(schema)
    need(subprocess.run(['openssl','version'],stdout=subprocess.DEVNULL,
          stderr=subprocess.DEVNULL,check=False).returncode==0,'OpenSSL CLI missing')
    print('PASS: exact 42310c8 HEAD/origin, ten Git blobs, pinned workshop, three 2.6P files',flush=True)
    print('PASS: read-only preflight; no Git writes, network, Agent Server or external credentials',flush=True)

# Uses the PUBLISHED 2.6O RS256 helpers; their source Git blob is checked by
# preflight. No copy, reimplementation or monkeypatch of that verified code.
def legacy():
    spec=importlib.util.spec_from_file_location('masl_pinned_26o',ROOT/'scripts/lab-26o-issuer-failure-review.py')
    need(spec is not None and spec.loader is not None,'published 2.6O helper unavailable')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

# The root public PEM is supplied by the offline harness. It is NOT an
# authentic enterprise issuer trust anchor and is never downloaded via HTTPS.
FIXED_NOW=1_000_500
ISS='https://fixture.invalid/masl-issuer'
AUD='masl-agui-fixture'
IDS=re.compile(r'[A-Za-z0-9._:-]{1,128}\Z')

def strict_document(raw:bytes)->dict:
    def unique(pairs):
        out={}
        for k,v in pairs:
            if k in out:raise ValueError('duplicate field')
            out[k]=v
        return out
    parsed=json.loads(raw.decode('utf-8'),object_pairs_hook=unique)
    if not isinstance(parsed,dict):raise ValueError('metadata not object')
    return parsed

def signed_metadata(o,keys:Path,active:str,version:int=1,revocation_epoch:int=1,
                    observed_at:int=FIXED_NOW,valid_through:int=FIXED_NOW+30)->tuple[Path,Path]:
    content={
        'kind':'fixture-cross-service-metadata','issuer':ISS,'audience':AUD,
        'trustGeneration':version,'activeKeyId':active,'revocationEpoch':revocation_epoch,
        'observedAt':observed_at,'validThrough':valid_through,'rootId':'fixture-root-pinned'
    }
    raw=json.dumps(content,sort_keys=True,separators=(',',':')).encode()
    metadata=keys/'signed-metadata.json';signature=keys/'signed-metadata.sig'
    metadata.write_bytes(raw)
    signature.write_bytes(o.openssl(['dgst','-sha256','-sign',str(keys/'fixture-root-test-private.pem')],raw))
    return metadata,signature

def inspect_signed_metadata(o,metadata:Path,signature:Path,root_public:Path,
                           now:int=FIXED_NOW)->tuple[str,dict|None]:
    if not metadata.is_file() or not signature.is_file() or not root_public.is_file():
        return 'trust-source-unavailable',None
    if metadata.is_symlink() or signature.is_symlink() or root_public.is_symlink():
        return 'trust-source-unavailable',None
    raw=metadata.read_bytes()
    if len(raw)>4096:return 'metadata-size-limit',None
    verified=subprocess.run(['openssl','dgst','-sha256','-verify',str(root_public),
       '-signature',str(signature)],input=raw,stdout=subprocess.PIPE,
       stderr=subprocess.PIPE,timeout=10,check=False)
    if verified.returncode!=0:return 'metadata-signature-denied',None
    try:doc=strict_document(raw)
    except (ValueError,UnicodeError,TypeError):return 'metadata-json-denied',None
    fields={'kind','issuer','audience','trustGeneration','activeKeyId','revocationEpoch',
            'observedAt','validThrough','rootId'}
    if set(doc)!=fields or doc['kind']!='fixture-cross-service-metadata' or \
       doc['issuer']!=ISS or doc['audience']!=AUD or doc['rootId']!='fixture-root-pinned' or \
       type(doc['trustGeneration']) is not int or doc['trustGeneration']<1 or \
       type(doc['revocationEpoch']) is not int or doc['revocationEpoch']<1 or \
       type(doc['activeKeyId']) is not str or not IDS.fullmatch(doc['activeKeyId']) or \
       any(type(doc[k]) is not int for k in ('observedAt','validThrough')):
        return 'metadata-fields-denied',None
    if doc['observedAt']>now or now-doc['observedAt']>10 or \
       doc['validThrough']<now or doc['validThrough']-doc['observedAt']>60:
        return 'metadata-freshness-denied',None
    return 'metadata-fixture-verified',doc

def service_call(db_path:Path,jwt:str,metadata:Path,signature:Path,root_public:Path,
                 kid_keys:dict[str,Path],tenant:str,thread:str,run:str,idem:str,
                 payload:bytes,expected:int,failure:str='none',mode:str='commit')->str:
    o=legacy()
    # Separate trust proof and signature check occurs *inside each worker*.
    status,doc=inspect_signed_metadata(o,metadata,signature,root_public)
    if status!='metadata-fixture-verified' or doc is None:return status
    active=doc['activeKeyId']
    if active not in kid_keys:return 'metadata-kid-not-pinned'
    auth,claims=o.verify(jwt,{active:kid_keys[active]})
    if auth!='fixture-verified' or claims is None:return auth
    if mode not in ('commit','reconcile'):return 'unsupported-operation'
    if any(type(v) is not str or not IDS.fullmatch(v) for v in (tenant,thread,run,idem)):
        return 'untrusted-request-identifiers'
    if type(payload) is not bytes or not 0<len(payload)<=131072:return 'invalid-event-bytes'
    if type(expected) is not int or not 0<=expected<=1024:return 'invalid-revision'
    if claims['tenant']!=tenant:return 'token-tenant-denied'
    if failure=='pre-store':return 'store-unavailable'
    db=o.connect(db_path)
    try:
        db.execute('BEGIN IMMEDIATE')
        state=db.execute('SELECT revocation_epoch FROM revocation_state WHERE tenant=?',(tenant,)).fetchone()
        if state is None or state[0]!=doc['revocationEpoch']:
            return 'revocation-watermark-stale'
        acl=db.execute('SELECT principal,epoch,revision FROM acl WHERE tenant=? AND thread=?',
                       (tenant,thread)).fetchone()
        if acl is None or acl[0]!=claims['sub']:return 'thread-acl-denied'
        if acl[1]!=claims['epoch']:return 'policy-epoch-stale'
        if db.execute('SELECT 1 FROM revoked WHERE tenant=? AND token_id=?',
                      (tenant,claims['jti'])).fetchone():return 'token-revoked'
        body_hash=digest(payload)
        old=db.execute('SELECT thread,run_id,principal,payload_sha256,revision FROM receipts '
                       'WHERE tenant=? AND idem_key=?',(tenant,idem)).fetchone()
        if mode=='reconcile':
            return ('receipt-reconciled-no-write'
                    if old==(thread,run,claims['sub'],body_hash,expected+1)
                    else 'receipt-not-confirmed')
        if old is not None:
            return ('duplicate-no-write' if old[:4]==(thread,run,claims['sub'],body_hash)
                    else 'idempotency-conflict')
        if db.execute('SELECT 1 FROM receipts WHERE tenant=? AND thread=? AND run_id=?',
                      (tenant,thread,run)).fetchone():return 'run-key-conflict'
        if acl[2]!=expected:return 'cas-stale-revision'
        updated=db.execute('UPDATE acl SET revision=revision+1 WHERE tenant=? AND thread=? '
                           'AND principal=? AND epoch=? AND revision=?',
                           (tenant,thread,claims['sub'],claims['epoch'],expected))
        if updated.rowcount!=1:return 'cas-lost-race'
        if failure=='after-cas':return 'injected-before-commit'
        db.execute('INSERT INTO receipts VALUES (?,?,?,?,?,?,?,?)',
                   (tenant,thread,run,claims['sub'],idem,expected+1,body_hash,claims['jti']))
        if failure=='after-receipt':return 'injected-before-commit'
        db.execute('COMMIT')
        if failure=='after-commit':return 'acknowledgement-lost'
        return 'committed'
    except sqlite3.Error:return 'sqlite-error-blocked'
    finally:
        if db.in_transaction:db.execute('ROLLBACK')
        db.close()

def worker(db:str,metadata:str,signature:str,root:str,active:str,token:str,
           go:object,results:object,suffix:str)->None:
    try:
        if not go.wait(15):raise RuntimeError('barrier-timeout')
        result=service_call(Path(db),token,Path(metadata),Path(signature),Path(root),
             {'fixture-rsa-k2':Path(active)},'tenant-A','race-thread','race-'+suffix,
             'idem-race-'+suffix,b'fixture-race-'+suffix.encode(),0)
        results.put(result)
    except Exception as exc:results.put('worker-error:'+str(exc))

def fixture_suite(out:Path)->None:
    o=legacy()
    db_path=out/'service-proof.sqlite3'
    need(not db_path.exists(),'fixture SQLite output exists')
    o.create_store(db_path)
    with o.connect(db_path) as db:
        db.executescript('CREATE TABLE revocation_state(tenant TEXT PRIMARY KEY,revocation_epoch INTEGER NOT NULL);'
                         "INSERT INTO revocation_state VALUES('tenant-A',1);"
                         "INSERT INTO revocation_state VALUES('tenant-B',1);")
    count=0
    def ok(result:bool,label:str)->None:
        nonlocal count
        need(result,'fixture assertion failed: '+label)
        count+=1
        print('PASS: '+label,flush=True)
    with tempfile.TemporaryDirectory(prefix='masl-26p-keys-',dir=out) as temporary:
        keys=Path(temporary)
        _,root=o.keypair(keys,'fixture-root')
        old_priv,old_pub=o.keypair(keys,'fixture-rsa-k1')
        new_priv,new_pub=o.keypair(keys,'fixture-rsa-k2')
        meta,sig=signed_metadata(o,keys,'fixture-rsa-k2')
        # The test uses an issuer-signed snapshot; only our *fixture-pinned root*
        # is trusted. No remote service cert/transport or production root.
        status,snapshot=inspect_signed_metadata(o,meta,sig,root)
        ok(status=='metadata-fixture-verified' and snapshot is not None,
           'root-signed fixture metadata verified with local pinned public PEM')
        valid=o.token(new_priv,'fixture-rsa-k2')
        old_token=o.token(old_priv,'fixture-rsa-k1')
        fields={'fixture-rsa-k2':new_pub}
        def call(tok:str=valid,thread:str='thread-A',run:str='run-A',idem:str='idem-A',
                 payload:bytes=b'fixture-AGUI-full-restart',rev:int=0,failure:str='none',
                 mode:str='commit',tenant:str='tenant-A')->str:
            return service_call(db_path,tok,meta,sig,root,fields,tenant,thread,run,idem,
                                payload,rev,failure,mode)
        ok(call()=='committed','separate service verifier and SQLite store commit on valid fixture')
        ok(call()=='duplicate-no-write','repeated idempotency key deduplicates after new connection')
        ok(call(mode='reconcile')=='receipt-reconciled-no-write',
           'explicit receipt reconciliation after successful commit does not write')
        ok(call(failure='after-commit',thread='thread-B',run='run-B',idem='idem-B',rev=0)==
           'acknowledgement-lost','loss of acknowledgement occurs after committed transaction')
        ok(call(mode='reconcile',thread='thread-B',run='run-B',idem='idem-B',rev=0)==
           'receipt-reconciled-no-write','lost acknowledgement is reconciled by exact persisted receipt')
        ok(call(thread='thread-B',run='run-B',idem='idem-B',rev=0)==
           'duplicate-no-write','post-ack-loss retry cannot create second receipt')
        ok(call(mode='reconcile',thread='thread-B',run='run-B',idem='idem-B',rev=0,
                payload=b'mismatched-bytes')=='receipt-not-confirmed',
           'mismatched event bytes cannot reconcile signed receipt')
        ok(call(mode='reconcile',run='unwritten',idem='new-key',rev=0)==
           'receipt-not-confirmed','absent receipt cannot be fabricated as confirmed')
        ok(call(thread='thread-A',run='run-A',idem='idem-A',payload=b'tampered')==
           'idempotency-conflict','replayed key with altered bytes is refused')
        ok(call(run='run-B',idem='idem-A')=='idempotency-conflict',
           'replayed key from another run rejected')
        ok(call(run='run-A',idem='different-idem')=='run-key-conflict',
           'existing run cannot be committed under new idempotency key')
        ok(call(run='run-C',idem='idem-C',rev=0)=='cas-stale-revision',
           'stale CAS blocks new transaction')
        ok(call(tenant='tenant-B')=='token-tenant-denied',
           'cross-tenant token intent cannot reach store')
        ok(call(thread='missing-thread')=='thread-acl-denied',
           'unknown thread denied by SQLite fixture ACL')
        ok(call(tok=old_token)=='jwks-kid-untrusted',
           'retired signing key cannot pass rotated metadata active kid')
        bad_meta=meta.read_bytes()
        meta.write_bytes(bad_meta.replace(b'fixture-rsa-k2',b'fixture-rsa-k1'))
        ok(call()=='metadata-signature-denied',
           'metadata substitution without root re-signing fails signature')
        meta.write_bytes(bad_meta)
        ok(call()=='duplicate-no-write','unchanged root-signed metadata remains usable')
        other_root_priv,other_root_pub=o.keypair(keys,'attacker-root')
        ok(inspect_signed_metadata(o,meta,sig,other_root_pub)[0]=='metadata-signature-denied',
           'malicious unpinned trust root cannot validate issuer metadata')
        ok(call(failure='pre-store',run='run-C',idem='idem-C',rev=1)=='store-unavailable',
           'store outage before BEGIN creates no receipt')
        ok(call(failure='after-cas',run='run-C',idem='idem-C',rev=1)=='injected-before-commit',
           'fault after CAS before receipt rolls back')
        ok(call(failure='after-receipt',run='run-C',idem='idem-C',rev=1)=='injected-before-commit',
           'fault after receipt before COMMIT rolls back')
        with o.connect(db_path) as db:
            ok(db.execute('SELECT revision FROM acl WHERE tenant=? AND thread=?',
               ('tenant-A','thread-A')).fetchone()[0]==1,
               'failed precommit attempts do not advance checkpoint revision')
            ok(db.execute('SELECT COUNT(*) FROM receipts WHERE tenant=?',('tenant-A',)).fetchone()[0]==2,
               'precommit faults do not insert durable receipts')
        ok(call(run='run-C',idem='idem-C',rev=1)=='committed',
           'fresh commit after injected rollback succeeds once')
        with o.connect(db_path) as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute("INSERT INTO revoked VALUES('tenant-A','jti-A',1000500)")
            db.execute("UPDATE revocation_state SET revocation_epoch=2 WHERE tenant='tenant-A'")
            db.execute('COMMIT')
        ok(call()=='revocation-watermark-stale',
           'stale signed revocation watermark denied after external update')
        signed_metadata(o,keys,'fixture-rsa-k2',revocation_epoch=2)
        ok(call()=='token-revoked','refreshed signed watermark observes revoked jti')
        # New JWT with a new jti is signed by the same fixture key after refresh.
        good_claims={'iss':o.ISSUER,'aud':o.AUDIENCE,'sub':'principal-A','tenant':'tenant-A',
           'jti':'fresh-jti','iat':o.TEST_NOW-30,'nbf':o.TEST_NOW-30,'exp':o.TEST_NOW+120,'epoch':9}
        fresh=o.token(new_priv,'fixture-rsa-k2',good_claims)
        ok(call(tok=fresh,run='run-D',idem='idem-D',rev=2)=='committed',
           'new non-revoked signed test token can proceed after trust refresh')
        ok(call(tok=fresh,run='run-D',idem='idem-D',rev=2)=='duplicate-no-write',
           'fresh-token duplicate does not advance revision')
        # Cross-process race on a separate checkpoint under the same signed
        # trust snapshot. Uses a newly minted non-revoked token.
        ctx=mp.get_context('spawn');barrier=ctx.Event();responses=ctx.Queue()
        workers=[ctx.Process(target=worker,args=(str(db_path),str(meta),str(sig),str(root),
           str(new_pub),fresh,barrier,responses,suffix)) for suffix in ('left','right')]
        for proc in workers:proc.start()
        barrier.set()
        for proc in workers:
            proc.join(25)
            if proc.is_alive():proc.terminate();proc.join()
        ok(all(p.exitcode==0 for p in workers),'two independent verifier/store OS workers finished')
        answers=sorted([responses.get(timeout=3),responses.get(timeout=3)])
        ok(answers==['cas-stale-revision','committed'],
           'cross-service fixture concurrent writes yield one CAS winner and one stale loser')
        with o.connect(db_path) as db:
            ok(db.execute("SELECT revision FROM acl WHERE tenant='tenant-A' AND thread='race-thread'").fetchone()[0]==1,
               'race checkpoint revision advances exactly once')
            ok(db.execute("SELECT COUNT(*) FROM receipts WHERE thread='race-thread'").fetchone()[0]==1,
               'race has exactly one durable receipt')
            ok(db.execute("SELECT COUNT(*) FROM receipts WHERE tenant='tenant-A'").fetchone()[0]==5,
               'invalid/failed requests never produced extra stored receipts')
            ok(db.execute("SELECT COUNT(*) FROM revoked WHERE tenant='tenant-A'").fetchone()[0]==1,
               'one jti revocation persisted alongside committed receipts')
            ok(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok',
               'fixture SQLite integrity check succeeds')
            db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        ok(db_path.is_file() and db_path.stat().st_size>0,
           'physical SQLite artifact remains outside Git without test private keys')
    need(not list(out.glob('masl-26p-keys-*')),'temporary key files not cleaned')
    print(f'{count} 2.6P local signed-metadata/process/SQLite fixture assertions passed',flush=True)

def gate(name:str,cmd:list[str],cwd:Path,output:Path)->None:
    with output.open('w',encoding='utf-8') as file:
        try:result=subprocess.run(cmd,cwd=cwd,stdout=file,stderr=subprocess.STDOUT,
                                  timeout=300,check=False)
        except subprocess.TimeoutExpired:raise RuntimeError('BLOCKED: gate timeout '+name) from None
    need(result.returncode==0,'gate failed: '+name+' at '+str(output))
    print('PASS: '+name+' SHA256 '+digest(output.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    repo=ROOT.resolve();target=out.resolve()
    need(target!=repo and repo not in target.parents,'evidence must remain outside Git')
    need(not out.exists(),'evidence output directory already exists')
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
        'src/ag-ui/cross-service-recovery.spec.ts','--outDir',str(ssr),'--emptyOutDir'],
        WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    gate('pure.log',['node',str(ssr/'cross-service-recovery.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf-8')
    found=re.search(r'(?m)^(\d+) 2\.6P selected cross-service trust/recovery TypeScript assertions passed\s*$',pure)
    need(found is not None and int(found.group(1))==ASSERTIONS,'TypeScript expected 329 assertions')
    need(pure.count('PASS: ')==ASSERTIONS,'TypeScript PASS line count drift')
    for phrase in CRITICAL:
        need(any(line.startswith('PASS: ') and phrase in line for line in pure.splitlines()),
             'critical selected TS case missing: '+phrase)
    gate('fixture.log',[sys.executable,str(ROOT/RUNNER),'--fixture-child','--output-dir',str(out)],
         ROOT,out/'fixture.log')
    fixture=(out/'fixture.log').read_text(encoding='utf-8')
    matches=re.search(r'(?m)^(\d+) 2\.6P local signed-metadata/process/SQLite fixture assertions passed\s*$',fixture)
    need(matches is not None and int(matches.group(1))==FIXTURE_ASSERTIONS,
         f'expected {FIXTURE_ASSERTIONS} fixture assertions')
    need(fixture.count('PASS: ')==FIXTURE_ASSERTIONS,'fixture PASS lines count drift')
    db=out/'service-proof.sqlite3'
    need(db.is_file() and not db.is_symlink(),'SQLite fixture evidence missing')
    preflight(schema)
    logs={name:digest((out/name).read_bytes()) for name in
          ('lint.log','build.log','compile.log','pure.log','fixture.log')}
    report={
      'lab':'2.6P','status':'PASS','baseline':HEAD,'workshop_reference':REFERENCE,
      'upstream_commit':UPSTREAM,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
      'published_git_blobs':BLOBS,
      'scope':'selected TS callback composition + separate signed metadata and local OS-process SQLite fixture',
      'typescript_assertions':ASSERTIONS,'fixture_assertions':FIXTURE_ASSERTIONS,
      'critical_typescript_cases':len(CRITICAL),'gate_logs_sha256':logs,
      'sqlite_sha256':digest(db.read_bytes()),
      'sources_sha256':{name:digest((ROOT/name).read_bytes()) for name in (SRC,TEST,RUNNER)},
      'gap_ids_open':['G'+str(i) for i in range(1,10)],
      'adapter_ready':False,'parent_2_6_open':True,
      'real_external_issuer_verified':False,'cross_service_authentication_verified':False,
      'production_persistence_verified':False,'independent_security_signoff':False,
      'limits':[
        'Issuer root and metadata RSA signatures are local disposable test fixtures, no network OIDC/JWKS or enterprise trust anchor',
        'Two independent local OS workers are not authenticated cross-service network transports',
        'Revocation freshness uses signed local metadata epoch compared inside a SQLite transaction, not distributed propagation SLA',
        'The isolated SQLite reconciliation is a physical receipt read and no-write idempotent check, not operational AG-UI resume',
        'The TS contract uses untrusted injected callback objects and pure proposals; the Python fixture is separate',
        'No authenticated event producer, actual frontend/Agent Server adapter, media/DLP or production security approval',
        'G1-G9 remain OPEN, parent milestone 2.6 OPEN, adapter BLOCKED'
      ],'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines=['# MASL 2.6P — selected cross-service trust and recovery fixture review','',
      f'Baseline `{HEAD}`; frozen AG-UI upstream `{UPSTREAM}`.','',
      f'**{ASSERTIONS}/{ASSERTIONS}** TypeScript assertions and **{FIXTURE_ASSERTIONS}/{FIXTURE_ASSERTIONS}** fixture assertions PASS; five gates PASS.','',
      '| Artifact | SHA-256 |','|---|---|',
      *[f'| `{name}` | `{value}` |' for name,value in logs.items()],
      f'| `service-proof.sqlite3` | `{digest(db.read_bytes())}` |',
      '', '## Exclusions', '', *[f'- {s}' for s in report['limits']],
      '', '**G1–G9 OPEN; adapter BLOCKED; milestone 2.6 OPEN.**','']
    (out/'review.md').write_text('\n'.join(lines),encoding='utf-8')
    print('REVIEW STATUS: PASS — selected 2.6P cross-service signed-metadata/recovery fixture; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)
    for name in ('review.json','review.md','service-proof.sqlite3'):
        print('EVIDENCE: '+name+' SHA256 '+digest((out/name).read_bytes()),flush=True)

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
        if args.preflight:preflight(args.schema.expanduser().absolute())
        elif args.fixture_child:
            need(args.output_dir is not None,'fixture child requires output-dir')
            fixture_suite(args.output_dir.expanduser().absolute())
        else:
            need(args.output_dir is not None,'run requires output-dir')
            run(args.schema.expanduser().absolute(),args.output_dir.expanduser().absolute())
    except (RuntimeError,ValueError,OSError,KeyError,TypeError,subprocess.CalledProcessError,sqlite3.Error) as exc:
        print(str(exc) if str(exc).startswith('BLOCKED:') else 'BLOCKED: '+str(exc),file=sys.stderr)
        raise SystemExit(2) from None
if __name__=='__main__':main()
