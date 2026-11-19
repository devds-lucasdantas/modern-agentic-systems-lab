#!/usr/bin/env python3
"""MASL 2.6S: selected pure TS + separate local two-SQLite signed-replication fixtures.

Read-only --preflight. --run writes exactly eight evidence artifacts OUTSIDE Git.
The replica fixture uses two physically independent SQLite files on ONE host,
locally generated producer RSA keys and an independently generated test root.
NO consensus, quorum, network-separated durable replication, enterprise PKI,
operational Agent Server, live AG-UI producer or external service is present.
"""
from __future__ import annotations
import argparse
from datetime import datetime,timezone
from contextlib import closing
from hashlib import sha1,sha256
import importlib.util
import io
import json
import multiprocessing as mp
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tarfile
import tempfile

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'apps/web'
HEAD='2732f7c7d82deaf1f95db337720d1c22a03309a7'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
UPSTREAM='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/producer-trust-replicas.ts'
TEST='apps/web/src/ag-ui/producer-trust-replicas.spec.ts'
RUNNER='scripts/lab-26s-replica-review.py'
SRC_SHA='e91bc7567f32c2151bd5b6fee9c52c159fc96ce3c3a2f78d5eaad67ec4cfb2d2'
TEST_SHA='084e08ace649ef44102a33ca637fed0c49bc4517cdbaaf9759bb36f65d3a30d9'
ASSERTIONS=269
FIXTURE_ASSERTIONS=49
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'d935349c1cf50dc82e08965e0690655b13dbf4be',
 'CURRENT.md':'ac7a4a3af8d35accda80411bb57aa9cf46afbd0c',
 'docs/journal/lab-23-ag-ui.md':'2a0663b7551cc6746405424e4220cc629aa7a882',
 'apps/web/src/ag-ui/producer-failover-evidence.ts':'44152048a3bd515de8ff9d05858b6ae225a41623',
 'apps/web/src/ag-ui/producer-failover-evidence.spec.ts':'b36f129628f1a77fed9e123e15c596f07175d16f',
 'scripts/lab-26r-producer-failover-review.py':'4bd8c5fb296434cc69a255d2dd9ce1c2b7acfe42',
 'apps/web/src/ag-ui/authenticated-transport-readiness.ts':'706ac518efda3006b24073af32c613418165416d',
 'apps/web/src/ag-ui/cross-service-recovery.ts':'42dba15a2279e3a027574f4587214f21dc9040ad',
 'apps/web/src/ag-ui/issuer-revocation-failures.ts':'dbef5f2bf73ab97fc624365c11a2cc02599ce689',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
}
CRITICAL=(
 'published 2.6R signed producer gate composes after two replica prechecks',
 'two independent fixture store identities and leader epoch',
 'published 2.6R reconciliation requires two matching independent stores',
 'caller privileged tenantId rejected',
 'invalid root never reads replica state',
 'shared store identity storageId denied',
 'divergent replica receiptSha256 fail closed',
 'invalid replica never invokes published producer chain',
 'unavailable readReplicaSetFixture fails closed',
 'published producer identity must match independently pinned root',
 'all G1-G9 remain OPEN after separated replica fixtures',
 'parent 2.6 and adapter remain OPEN/BLOCKED',
)

def need(ok:bool,msg:str)->None:
    if not ok:raise RuntimeError('BLOCKED: '+msg)
def git(*args:str,cwd:Path=ROOT)->str:
    return subprocess.check_output(['git',*args],cwd=cwd,text=True,stderr=subprocess.STDOUT).strip()
def sha(raw:bytes)->str:return sha256(raw).hexdigest()
def blob(raw:bytes)->str:return sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
def schema_gate(path:Path)->None:
    need(path.is_file() and not path.is_symlink(),'frozen schema missing/symlink')
    raw=path.read_bytes()
    need(sha(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,'schema SHA/Git blob drift')
    obj=json.loads(raw)
    need(obj.get('$id')=='https://ag-ui.com/spec/1.0/schema.json' and
         len(obj['$defs']['Event']['oneOf'])==31,'AG-UI 1.0 event identity drift')
    print('PASS: official pinned AG-UI 1.0 schema SHA256/blob and 31 variants',flush=True)
def preflight(schema:Path)->None:
    need(git('symbolic-ref','--quiet','--short','HEAD')=='main','expected main')
    need(git('rev-parse','HEAD')==HEAD and git('rev-parse','origin/main')==HEAD,
         'published 2.6R HEAD/origin differs')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked/index changes detected')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'exactly three 2.6S untracked files required')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop differs')
    for path,pin in BLOBS.items():
        need(git('rev-parse','HEAD:'+path)==pin and git('hash-object',path)==pin,
             'published Git blob differs: '+path)
    for path,pin in ((SRC,SRC_SHA),(TEST,TEST_SHA)):
        f=ROOT/path
        need(f.is_file() and not f.is_symlink() and sha(f.read_bytes())==pin,
             '2.6S source SHA drift: '+path)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),
         '2.6S runner missing/symlink')
    road=(ROOT/'ROADMAP.md').read_text(encoding='utf8').splitlines()
    need(road.count('- [ ] 2.6 AG-UI')==1 and
         road.count('  - [ ] 2.6S AG-UI producer trust anchors and replicated recovery gates')==1,
         '2.6 parent or 2.6S pending roadmap anchor differs')
    schema_gate(schema)
    need(subprocess.run(['openssl','version'],stdout=subprocess.DEVNULL,
         stderr=subprocess.DEVNULL,check=False).returncode==0,'OpenSSL CLI required')
    print('PASS: exact 2732f7c HEAD/origin, ten Git blobs, pinned workshop, three 2.6S files',flush=True)
    print('PASS: read-only preflight; no external network, Git write, Agent Server or enterprise identity',flush=True)

# Cryptographic primitives below reuse the published 2.6R producer fixture.
# Its exact Git blob is pinned above. No cryptographic code is reimplemented.
def prior():
    spec=importlib.util.spec_from_file_location('masl_pinned_26r',ROOT/'scripts/lab-26r-producer-failover-review.py')
    need(spec is not None and spec.loader is not None,'published 2.6R producer helpers missing')
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

def connect(db:Path)->sqlite3.Connection:
    c=sqlite3.connect(db,timeout=10,isolation_level=None)
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA busy_timeout=10000')
    return c
SCHEMA='''
CREATE TABLE checkpoint(tenant TEXT NOT NULL,thread TEXT NOT NULL,revision INTEGER NOT NULL,
 PRIMARY KEY(tenant,thread));
CREATE TABLE registry(producer TEXT PRIMARY KEY,key_id TEXT NOT NULL,revocation_epoch INTEGER NOT NULL,
 active INTEGER NOT NULL,last_sequence INTEGER NOT NULL);
CREATE TABLE control(id INTEGER PRIMARY KEY CHECK(id=1),leader_epoch INTEGER NOT NULL,role TEXT NOT NULL);
CREATE TABLE receipts(tenant TEXT NOT NULL,thread TEXT NOT NULL,run TEXT NOT NULL,
 idem TEXT NOT NULL,producer TEXT NOT NULL,seq INTEGER NOT NULL,revision INTEGER NOT NULL,
 payload_sha256 TEXT NOT NULL,leader_epoch INTEGER NOT NULL,
 PRIMARY KEY(tenant,thread,run),UNIQUE(tenant,idem));
'''

def create_db(path:Path,role:str)->None:
    need(not path.exists(),'replica file already exists')
    with closing(connect(path)) as db:
        need(db.execute('PRAGMA journal_mode=WAL').fetchone()[0]=='wal','WAL unavailable')
        db.execute('PRAGMA synchronous=FULL')
        db.executescript(SCHEMA)
        db.executemany('INSERT INTO checkpoint VALUES(?,?,?)',
                       [('tenant-A','thread-A',0),('tenant-A','race-thread',0),
                        ('tenant-B','thread-A',0)])
        db.execute('INSERT INTO registry VALUES(?,?,?,?,?)',('fixture-producer',
                   'fixture-sign-key-1',2,1,0))
        db.execute('INSERT INTO control VALUES(1,?,?)',(1,role))

def state(db:Path)->tuple:
    with closing(connect(db)) as c:
        check=c.execute("SELECT revision FROM checkpoint WHERE tenant='tenant-A' AND thread='thread-A'").fetchone()[0]
        race=c.execute("SELECT revision FROM checkpoint WHERE tenant='tenant-A' AND thread='race-thread'").fetchone()[0]
        reg=c.execute("SELECT revocation_epoch,active,last_sequence FROM registry WHERE producer='fixture-producer'").fetchone()
        ctl=c.execute('SELECT leader_epoch,role FROM control WHERE id=1').fetchone()
        receipts=c.execute('SELECT tenant,thread,run,idem,producer,seq,revision,payload_sha256,leader_epoch '
                           'FROM receipts ORDER BY tenant,thread,run').fetchall()
        return (check,race,reg,ctl,receipts)

def signed_manifest(crypto,root_private:Path,producer_public:Path,epoch:int=2,active:bool=True)->dict:
    manifest={'kind':'fixture-root-signed-producer-registry','rootId':'fixture-root-offline',
         'producerId':'fixture-producer','keyId':'fixture-sign-key-1',
         'producerPublicSha256':sha(producer_public.read_bytes()),'revocationEpoch':epoch,
         'active':active,'generation':1}
    return {'manifest':manifest,'signature':crypto.sign(root_private,manifest)}

def manifest_check(crypto,root_public:Path,producer_public:Path,data:object,epoch:int=2)->str:
    if not isinstance(data,dict) or set(data)!={'manifest','signature'}:return 'root-manifest-shape-denied'
    m=data['manifest']
    if not isinstance(m,dict) or set(m)!={'kind','rootId','producerId','keyId',
        'producerPublicSha256','revocationEpoch','active','generation'}:
        return 'root-manifest-shape-denied'
    if not crypto.verify(root_public,m,data['signature']):return 'untrusted-root-signature'
    if m['kind']!='fixture-root-signed-producer-registry' or \
       m['rootId']!='fixture-root-offline' or m['producerId']!='fixture-producer' or \
       m['keyId']!='fixture-sign-key-1' or m['producerPublicSha256']!=sha(producer_public.read_bytes()) or \
       type(m['revocationEpoch']) is not int or m['revocationEpoch']!=epoch or \
       m['active'] is not True or m['generation']!=1:return 'producer-root-policy-denied'
    return 'fixture-root-verified'

def make_event(crypto,signing:Path,seq:int,rev:int,run:str,idem:str,body:bytes)->dict:
    envelope={'producerId':'fixture-producer','keyId':'fixture-sign-key-1',
        'tenant':'tenant-A','thread':'thread-A','run':run,'idem':idem,
        'sequence':seq,'expectedRevision':rev,'revocationEpoch':2,
        'payloadSha256':sha(body),'leaderEpoch':1,'issuedAt':1_000_000,
        'expiresAt':1_000_120}
    return {'envelope':envelope,'signature':crypto.sign(signing,envelope),'payloadHex':body.hex()}

def verify_event(crypto,pub:Path,root_manifest:dict,root_public:Path,evt:object)->str:
    if manifest_check(crypto,root_public,pub,root_manifest)!='fixture-root-verified':return 'untrusted-producer-root'
    if not isinstance(evt,dict) or set(evt)!={'envelope','signature','payloadHex'}:return 'event-shape-denied'
    env=evt['envelope']
    fields={'producerId','keyId','tenant','thread','run','idem','sequence','expectedRevision',
            'revocationEpoch','payloadSha256','leaderEpoch','issuedAt','expiresAt'}
    if not isinstance(env,dict) or set(env)!=fields:return 'event-shape-denied'
    if any(type(env[k]) is not str or not re.fullmatch('[A-Za-z0-9._:-]{1,128}',env[k]) for k in
           ('producerId','keyId','tenant','thread','run','idem')):return 'event-shape-denied'
    if any(type(env[k]) is not int or env[k]<0 for k in
           ('sequence','expectedRevision','revocationEpoch','leaderEpoch','issuedAt','expiresAt')):
        return 'event-shape-denied'
    if (env['producerId'],env['keyId'],env['tenant'],env['revocationEpoch'])!=\
       ('fixture-producer','fixture-sign-key-1','tenant-A',2):return 'event-scope-denied'
    if not isinstance(evt['payloadHex'],str) or len(evt['payloadHex'])>262144 or \
       len(evt['payloadHex'])%2:return 'payload-shape-denied'
    try:payload=bytes.fromhex(evt['payloadHex'])
    except ValueError:return 'payload-shape-denied'
    if not payload or sha(payload)!=env['payloadSha256']:return 'event-digest-denied'
    if env['issuedAt']>1_000_050 or env['expiresAt']<=1_000_050 or \
       env['expiresAt']-env['issuedAt']>120:return 'event-expired'
    return 'producer-event-verified' if crypto.verify(pub,env,evt['signature']) else 'producer-signature-denied'

def receipt(env:dict)->tuple:
    return (env['tenant'],env['thread'],env['run'],env['idem'],env['producerId'],
            env['sequence'],env['expectedRevision']+1,env['payloadSha256'],env['leaderEpoch'])

def leader_commit(db:Path,producer_pub:Path,root_pub:Path,manifest:dict,evt:dict,
                  fault:str='none')->str:
    crypto=prior();result=verify_event(crypto,producer_pub,manifest,root_pub,evt)
    if result!='producer-event-verified':return result
    env=evt['envelope']
    with closing(connect(db)) as c:
        try:
            c.execute('BEGIN IMMEDIATE')
            epoch,role=c.execute('SELECT leader_epoch,role FROM control WHERE id=1').fetchone()
            if role!='leader' or epoch!=env['leaderEpoch']:return 'leader-epoch-fenced'
            current=c.execute('SELECT revision FROM checkpoint WHERE tenant=? AND thread=?',
                (env['tenant'],env['thread'])).fetchone()
            if current is None:return 'acl-thread-denied'
            registered=c.execute('SELECT key_id,revocation_epoch,active,last_sequence FROM registry '
                                 'WHERE producer=?',(env['producerId'],)).fetchone()
            if registered is None or registered[:3]!=('fixture-sign-key-1',2,1):
                return 'producer-key-or-revocation-denied'
            old=c.execute('SELECT tenant,thread,run,idem,producer,seq,revision,payload_sha256,leader_epoch '
                          'FROM receipts WHERE tenant=? AND idem=?',(env['tenant'],env['idem'])).fetchone()
            if old is not None:return 'duplicate-no-write' if old==receipt(env) else 'idempotency-conflict'
            if current[0]!=env['expectedRevision']:return 'cas-stale-revision'
            if env['sequence']!=registered[3]+1:return 'producer-sequence-not-contiguous'
            c.execute('UPDATE checkpoint SET revision=? WHERE tenant=? AND thread=?',
                     (current[0]+1,env['tenant'],env['thread']))
            c.execute('UPDATE registry SET last_sequence=? WHERE producer=?',
                     (env['sequence'],env['producerId']))
            if fault=='after-cas':return 'injected-rollback'
            c.execute('INSERT INTO receipts VALUES(?,?,?,?,?,?,?,?,?)',receipt(env))
            if fault=='after-receipt':return 'injected-rollback'
            c.execute('COMMIT')
            return 'ack-lost' if fault=='after-commit' else 'committed'
        except sqlite3.Error:return 'sqlite-denied'
        finally:
            if c.in_transaction:c.execute('ROLLBACK')

def replicate(db:Path,producer_pub:Path,root_pub:Path,manifest:dict,evt:dict,
              attestation:object,root_epoch:int=1)->str:
    crypto=prior();result=verify_event(crypto,producer_pub,manifest,root_pub,evt)
    if result!='producer-event-verified':return result
    env=evt['envelope']
    expected={'kind':'fixture-root-attested-replication','receiptSha256':sha(crypto.canonical(dict(zip(
         ('tenant','thread','run','idem','producer','seq','revision','payloadSha256','leaderEpoch'),receipt(env))))),
         'leaderEpoch':root_epoch,'source':'node-A','destination':'node-B',
         'producerId':env['producerId'],'revocationEpoch':env['revocationEpoch']}
    if not isinstance(attestation,dict) or set(attestation)!={'body','signature'}:
        return 'replication-attestation-shape-denied'
    if attestation['body']!=expected or not crypto.verify(root_pub,expected,attestation['signature']):
        return 'replication-attestation-untrusted'
    with closing(connect(db)) as c:
        try:
            c.execute('BEGIN IMMEDIATE')
            epoch,role=c.execute('SELECT leader_epoch,role FROM control WHERE id=1').fetchone()
            if role!='standby' or epoch!=root_epoch:return 'replica-leader-epoch-untrusted'
            reg=c.execute('SELECT key_id,revocation_epoch,active,last_sequence FROM registry '
                'WHERE producer=?',(env['producerId'],)).fetchone()
            if reg is None or reg[:3]!=('fixture-sign-key-1',2,1):return 'replica-revocation-stale'
            old=c.execute('SELECT tenant,thread,run,idem,producer,seq,revision,payload_sha256,leader_epoch '
                'FROM receipts WHERE tenant=? AND idem=?',(env['tenant'],env['idem'])).fetchone()
            if old is not None:return 'replica-duplicate-no-write' if old==receipt(env) else 'replica-divergence'
            prev=c.execute('SELECT revision FROM checkpoint WHERE tenant=? AND thread=?',
                (env['tenant'],env['thread'])).fetchone()
            if prev is None:return 'replica-thread-denied'
            if prev[0]!=env['expectedRevision'] or reg[3]+1!=env['sequence']:
                return 'replica-stale-or-gap'
            c.execute('UPDATE checkpoint SET revision=? WHERE tenant=? AND thread=?',
                (prev[0]+1,env['tenant'],env['thread']))
            c.execute('UPDATE registry SET last_sequence=? WHERE producer=?',
                (env['sequence'],env['producerId']))
            c.execute('INSERT INTO receipts VALUES(?,?,?,?,?,?,?,?,?)',receipt(env))
            c.execute('COMMIT')
            return 'replica-applied'
        except sqlite3.Error:return 'sqlite-denied'
        finally:
            if c.in_transaction:c.execute('ROLLBACK')

def attest(crypto,root_priv:Path,evt:dict)->dict:
    env=evt['envelope']
    keys=('tenant','thread','run','idem','producer','seq','revision','payloadSha256','leaderEpoch')
    body={'kind':'fixture-root-attested-replication',
         'receiptSha256':sha(crypto.canonical(dict(zip(keys,receipt(env))))),
         'leaderEpoch':1,'source':'node-A','destination':'node-B',
         'producerId':env['producerId'],'revocationEpoch':env['revocationEpoch']}
    return {'body':body,'signature':crypto.sign(root_priv,body)}

def reconcile(db:Path,evt:dict)->str:
    env=evt['envelope']
    with closing(connect(db)) as c:
        row=c.execute('SELECT tenant,thread,run,idem,producer,seq,revision,payload_sha256,leader_epoch '
            'FROM receipts WHERE tenant=? AND idem=?',(env['tenant'],env['idem'])).fetchone()
        return 'receipt-reconciled-no-write' if row==receipt(env) else 'receipt-not-confirmed'

def promote(db:Path,reference:Path,crypto,root_priv:Path,root_pub:Path,epoch:int=2)->str:
    # External root simulates a control-plane fencing decision. This is NOT a quorum.
    observed=state(db);original=state(reference)
    if observed[:3]!=original[:3] or observed[4]!=original[4]:return 'replica-stale-or-divergent'
    evidence={'kind':'fixture-promotion-certificate','newEpoch':epoch,
         'receiptDigest':sha(crypto.canonical({'receipts':observed[4]})),
         'revocationEpoch':observed[2][0]}
    certificate=crypto.sign(root_priv,evidence)
    if not crypto.verify(root_pub,evidence,certificate):return 'promotion-root-untrusted'
    with closing(connect(db)) as c:
        try:
            c.execute('BEGIN IMMEDIATE')
            old=c.execute('SELECT leader_epoch,role FROM control WHERE id=1').fetchone()
            if old!= (epoch-1,'standby'):return 'promotion-epoch-untrusted'
            c.execute("UPDATE control SET role='leader',leader_epoch=? WHERE id=1",(epoch,))
            c.execute('COMMIT')
            return 'promoted-by-fixture-root'
        finally:
            if c.in_transaction:c.execute('ROLLBACK')

def child_commit(path:str,pub:str,root:str,manifest:dict,evt:dict,q:object)->None:
    try:q.put(leader_commit(Path(path),Path(pub),Path(root),manifest,evt))
    except Exception as err:q.put('worker-error:'+str(err))

def child_replicate(path:str,pub:str,root:str,manifest:dict,evt:dict,attestation:dict,q:object)->None:
    try:q.put(replicate(Path(path),Path(pub),Path(root),manifest,evt,attestation))
    except Exception as err:q.put('worker-error:'+str(err))

def tar_proofs(first:Path,second:Path,archive:Path)->None:
    # Archive exactly two independently created and committed physical databases.
    # SQLite WAL is checkpointed before archiving and ephemeral keys are excluded.
    for item in (first,second):
        with closing(connect(item)) as c:
            c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            need(c.execute('PRAGMA journal_mode=DELETE').fetchone()[0]=='delete',
                 'checkpointed proof archive must be self-contained')
    with tarfile.open(archive,'w',format=tarfile.USTAR_FORMAT) as tar:
        for name,file in [('node-A.sqlite3',first),('node-B.sqlite3',second)]:
            data=file.read_bytes()
            meta=tarfile.TarInfo(name=name);meta.size=len(data);meta.mode=0o444
            meta.mtime=0;meta.uid=meta.gid=0;meta.uname=meta.gname=''
            tar.addfile(meta,io.BytesIO(data))

def fixture_suite(out:Path)->None:
    crypto=prior();count=0
    def ok(good:bool,label:str)->None:
        nonlocal count
        need(good,'fixture assertion failed: '+label)
        count+=1;print('PASS: '+label,flush=True)
    with tempfile.TemporaryDirectory(prefix='masl-26s-replicas-',dir=out) as folder:
        tmp=Path(folder);a=tmp/'node-A.sqlite3';b=tmp/'node-B.sqlite3'
        create_db(a,'leader');create_db(b,'standby')
        ok(a!=b and a.stat().st_ino!=b.stat().st_ino,'two separate physical SQLite stores created')
        producer_priv,producer_pub,_=crypto.producer_keys(tmp)
        # The trusted root is generated independently of the producer key pair.
        (tmp/'root').mkdir()
        root_priv,root_pub,_=crypto.producer_keys(tmp/'root')
        manifest=signed_manifest(crypto,root_priv,producer_pub)
        ok(manifest_check(crypto,root_pub,producer_pub,manifest)=='fixture-root-verified',
           'separate offline root signs producer key and revocation state')
        other_manifest={'manifest':dict(manifest['manifest']), 'signature':manifest['signature']}
        other_manifest['manifest']['producerId']='attacker-producer'
        ok(manifest_check(crypto,root_pub,producer_pub,other_manifest)=='untrusted-root-signature',
           'modified root-signed producer identity denied')
        (tmp/'attacker-root').mkdir()
        bad_root_priv,bad_root_pub,_=crypto.producer_keys(tmp/'attacker-root')
        ok(manifest_check(crypto,bad_root_pub,producer_pub,manifest)=='untrusted-root-signature',
           'unknown root public key cannot authorize producer')
        ok(manifest_check(crypto,root_pub,producer_pub,
           signed_manifest(crypto,root_priv,producer_pub,epoch=3))=='producer-root-policy-denied',
           'unexpected root revocation epoch denied')
        ok(manifest_check(crypto,root_pub,producer_pub,
           signed_manifest(crypto,root_priv,producer_pub,active=False))=='producer-root-policy-denied',
           'root-signed disabled producer denied')
        payload=b'AGUI-fixture-event-1'
        e1=make_event(crypto,producer_priv,1,0,'run-A','idem-A',payload)
        ok(verify_event(crypto,producer_pub,manifest,root_pub,e1)=='producer-event-verified',
           'canonical signed producer envelope independently verified')
        altered={'envelope':{**e1['envelope'],'sequence':2},'signature':e1['signature'],
                 'payloadHex':e1['payloadHex']}
        ok(verify_event(crypto,producer_pub,manifest,root_pub,altered)=='producer-signature-denied',
           'signed envelope sequence modification denied')
        altered={**e1,'payloadHex':b'changed'.hex()}
        ok(verify_event(crypto,producer_pub,manifest,root_pub,altered)=='event-digest-denied',
           'tampered event bytes rejected')
        altered={**e1,'envelope':{**e1['envelope'],'tenant':'tenant-B'}}
        ok(verify_event(crypto,producer_pub,manifest,root_pub,altered)=='event-scope-denied',
           'cross-tenant producer field rejected')
        ok(verify_event(crypto,producer_pub,manifest,root_pub,{'junk':True})=='event-shape-denied',
           'untrusted event shape rejected')
        ok(leader_commit(a,producer_pub,root_pub,manifest,e1,fault='after-cas')=='injected-rollback',
           'primary failure after CAS rolls back')
        ok(state(a)[0]==0 and len(state(a)[4])==0,'rollback does not write receipt')
        ok(leader_commit(a,producer_pub,root_pub,manifest,e1,fault='after-receipt')=='injected-rollback',
           'primary failure after receipt rolls back')
        ok(state(a)[0]==0 and len(state(a)[4])==0,'receipt rollback preserves zero revision')
        ok(leader_commit(a,producer_pub,root_pub,manifest,e1,fault='after-commit')=='ack-lost',
           'primary commits before deliberately losing acknowledgement')
        ok(reconcile(a,e1)=='receipt-reconciled-no-write','committed primary receipt reconciles')
        ok(reconcile(b,e1)=='receipt-not-confirmed','unsynchronized standby cannot falsely confirm')
        ok(promote(b,a,crypto,root_priv,root_pub)=='replica-stale-or-divergent',
           'promotion of stale standby blocked')
        att1=attest(crypto,root_priv,e1)
        ok(replicate(b,producer_pub,root_pub,manifest,e1,
            {'body':{**att1['body'],'destination':'node-C'},'signature':att1['signature']})==
            'replication-attestation-untrusted','replication attestation destination tamper denied')
        ok(replicate(b,producer_pub,bad_root_pub,manifest,e1,att1)=='untrusted-producer-root',
           'untrusted replica root cannot accept signed producer envelope')
        ok(replicate(b,producer_pub,root_pub,manifest,e1,att1)=='replica-applied',
           'standby independently commits verified signed receipt')
        ok(replicate(b,producer_pub,root_pub,manifest,e1,att1)=='replica-duplicate-no-write',
           'duplicate replication does not write twice')
        ok(reconcile(b,e1)=='receipt-reconciled-no-write',
           'standby independently reconciles lost primary acknowledgement')
        ok(state(a)[0]==1 and state(b)[0]==1 and state(a)[4]==state(b)[4],
           'separate stores converge to same receipt and revision')
        # Deliberate divergence under a local unpublished replica conflict.
        with closing(connect(b)) as c:
            c.execute('BEGIN IMMEDIATE')
            c.execute("UPDATE receipts SET payload_sha256=? WHERE run='run-A'",('f'*64,))
            c.execute('COMMIT')
        ok(promote(b,a,crypto,root_priv,root_pub)=='replica-stale-or-divergent',
           'modified standby receipt digest blocks promotion')
        with closing(connect(b)) as c:
            c.execute('BEGIN IMMEDIATE')
            c.execute('UPDATE receipts SET payload_sha256=? WHERE run=?',
                      (e1['envelope']['payloadSha256'],'run-A'))
            c.execute('COMMIT')
        ok(promote(b,a,crypto,root_priv,root_pub)=='promoted-by-fixture-root',
           'local root grants promotion only after full receipt match')
        ok(state(b)[3]==(2,'leader') and state(a)[3]==(1,'leader'),
           'promotion changes standby fencing epoch; old primary still needs external fencing')
        # Demonstrate strict local fail-closed fencing on newly promoted leader.
        e2=make_event(crypto,producer_priv,2,1,'run-B','idem-B',b'event-two')
        ok(leader_commit(b,producer_pub,root_pub,manifest,e2)=='leader-epoch-fenced',
           'old epoch producer envelope cannot write promoted leader')
        ok(leader_commit(a,producer_pub,root_pub,manifest,e2)=='committed',
           'isolated former primary can still write without external consensus: known gap')
        ok(len(state(a)[4])==2 and len(state(b)[4])==1,
           'split brain divergence exposed rather than claimed solved')
        ok(promote(b,a,crypto,root_priv,root_pub)=='replica-stale-or-divergent',
           'already diverged replica cannot be silently promoted again')
        # Controlled rehearsal stops writes on former primary and rejoins standby
        # only after operator/harness explicitly reinstates same epoch; no auto-resolve.
        with closing(connect(a)) as c:
            c.execute("UPDATE control SET role='retired',leader_epoch=2 WHERE id=1")
        ok(leader_commit(a,producer_pub,root_pub,manifest,e2)=='leader-epoch-fenced',
           'manually retired primary blocks further commits')
        # Second independent pair tests gap, revocation and process isolation.
        c=tmp/'node-C.sqlite3';d=tmp/'node-D.sqlite3'
        create_db(c,'leader');create_db(d,'standby')
        e3=make_event(crypto,producer_priv,2,1,'run-gap','idem-gap',b'event-gap')
        att3=attest(crypto,root_priv,e3)
        ok(replicate(d,producer_pub,root_pub,manifest,e3,att3)=='replica-stale-or-gap',
           'missing prior sequence blocks out-of-order replica delivery')
        with closing(connect(d)) as db:
            db.execute("UPDATE registry SET revocation_epoch=3 WHERE producer='fixture-producer'")
        ok(replicate(d,producer_pub,root_pub,manifest,e1,att1)=='replica-revocation-stale',
           'stale producer root revocation watermark blocks replica write')
        with closing(connect(d)) as db:
            db.execute("UPDATE registry SET revocation_epoch=2 WHERE producer='fixture-producer'")
        ok(leader_commit(c,producer_pub,root_pub,manifest,e1)=='committed',
           'independent primary can record signed event in fresh store')
        # Real OS-separated worker applies the signed receipt to its own database.
        ctx=mp.get_context('fork') if sys.platform!='win32' else mp.get_context('spawn')
        results=ctx.Queue()
        proc=ctx.Process(target=child_replicate,args=(str(d),str(producer_pub),str(root_pub),
            manifest,e1,att1,results))
        proc.start();proc.join(20)
        need(not proc.is_alive() and proc.exitcode==0,'replica worker failure')
        ok(results.get(timeout=3)=='replica-applied',
           'independent OS process applies root-attested receipt to second file')
        ok(state(c)[4]==state(d)[4],'two independent processes converge signed receipt')
        results=ctx.Queue()
        proc=ctx.Process(target=child_commit,args=(str(c),str(producer_pub),str(root_pub),
            manifest,e2,results))
        proc.start();proc.join(20)
        need(not proc.is_alive() and proc.exitcode==0,'leader worker failure')
        ok(results.get(timeout=3)=='committed',
           'independent OS primary process commits next signed event')
        ok(len(state(c)[4])==2 and len(state(d)[4])==1,
           'two independent files diverge until explicit replication')
        ok(promote(d,c,crypto,root_priv,root_pub)=='replica-stale-or-divergent',
           'replica gap prevents promotion after producer process exit')
        ok(replicate(d,producer_pub,root_pub,manifest,e2,attest(crypto,root_priv,e2))==
           'replica-applied','explicit signed replay closes remaining replica gap')
        ok(state(c)[4]==state(d)[4],'separate physical files converge after explicit replay')
        ok(promote(d,c,crypto,root_priv,root_pub)=='promoted-by-fixture-root',
           'replayed standby accepts simulated root-authorized leader epoch')
        ok(reconcile(d,e2)=='receipt-reconciled-no-write',
           'standby returns matching durable receipt without new commit')
        ok(state(d)[3]==(2,'leader'),'standby epoch advanced exactly once')
        ok(promote(d,c,crypto,root_priv,root_pub)=='promotion-epoch-untrusted',
           'replayed promotion not granted as a second writer')
        # Final proof archive uses the clean separate pair from C/D, re-labeled A/B.
        archive=out/'replica-proof.tar'
        tar_proofs(c,d,archive)
        ok(archive.exists() and archive.stat().st_size>4096,
           'archive carries two independently persisted physical SQLite files')
        with tarfile.open(archive,'r') as tar:
            names=[m.name for m in tar.getmembers()]
            ok(names==['node-A.sqlite3','node-B.sqlite3'] and
               all(m.isfile() and m.size>1024 for m in tar.getmembers()),
               'replica proof archive contains exactly two SQLite databases')
        print(f'{count} 2.6S local producer-root/two-independent-SQLite assertions passed',flush=True)
        need(count==FIXTURE_ASSERTIONS,'fixture assertion count drift')

def gate(name:str,command:list[str],cwd:Path,out:Path)->None:
    with out.open('wb') as stream:
        result=subprocess.run(command,cwd=cwd,stdout=stream,stderr=subprocess.STDOUT,
                              timeout=150,check=False)
    need(result.returncode==0,'gate failed: '+name+' at '+str(out))
    print('PASS: '+name+' SHA256 '+sha(out.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    root=ROOT.resolve();dest=out.resolve()
    need(dest!=root and root not in dest.parents,'evidence must stay outside Git')
    need(not out.exists() and not out.is_symlink(),'evidence dir exists/symlink')
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    destdir=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
         'src/ag-ui/producer-trust-replicas.spec.ts','--outDir',str(destdir),'--emptyOutDir'],
         WEB,out/'compile.log')
    (destdir/'package.json').write_text('{"type":"module"}\n',encoding='utf8')
    gate('pure.log',['node',str(destdir/'producer-trust-replicas.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf8')
    m=re.search(r'(?m)^(\d+) 2\.6S selected producer trust/replica TypeScript assertions passed\s*$',pure)
    need(m is not None and int(m.group(1))==ASSERTIONS and pure.count('PASS: ')==ASSERTIONS,
         '2.6S TypeScript count drift')
    for label in CRITICAL:need('PASS: '+label in pure,'missing critical case: '+label)
    gate('fixture.log',[sys.executable,str(ROOT/RUNNER),'--fixture-child','--output-dir',str(out)],
         ROOT,out/'fixture.log')
    log=(out/'fixture.log').read_text(encoding='utf8')
    m=re.search(r'(?m)^(\d+) 2\.6S local producer-root/two-independent-SQLite assertions passed\s*$',log)
    need(m is not None and int(m.group(1))==FIXTURE_ASSERTIONS and log.count('PASS: ')==FIXTURE_ASSERTIONS,
         '2.6S replica fixture count drift')
    archive=out/'replica-proof.tar'
    need(archive.is_file() and not archive.is_symlink(),'two replica SQLite archive missing')
    preflight(schema)
    logs={name:sha((out/name).read_bytes()) for name in
          ('lint.log','build.log','compile.log','pure.log','fixture.log')}
    report={'lab':'2.6S','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
        'agui_upstream_commit':UPSTREAM,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
        'published_git_blobs':BLOBS,
        'scope':'isolated pure TypeScript fixture plus separate root-signed event replay over two SQLite files on one host',
        'typescript_assertions':ASSERTIONS,'fixture_assertions':FIXTURE_ASSERTIONS,
        'critical_cases':len(CRITICAL),'gate_logs_sha256':logs,
        'replica_archive_sha256':sha(archive.read_bytes()),
        'sources_sha256':{p:sha((ROOT/p).read_bytes()) for p in (SRC,TEST,RUNNER)},
        'gap_ids_open':['G'+str(i) for i in range(1,10)],'adapter_ready':False,
        'parent_2_6_open':True,'external_root_verified':False,
        'real_producer_authenticated':False,'consensus_verified':False,
        'distributed_storage_verified':False,'security_signoff':False,
        'limits':[
            'Root and producer RSA keys are generated by the local test harness, never external PKI',
            'Two separately persisted SQLite files run on one host; no durable cross-host replication or quorum',
            'Replication is explicit attested local event replay, not a consensus or availability protocol',
            'Simulated root acts as the fencing control plane, and an isolated former primary may still accept writes',
            'TypeScript callbacks do not consume Python proofs, and remain separate from the fixture',
            'No authenticated production event source, online OIDC/JWKS, media/DLP or Agent Server adapter',
            'All G1-G9 and milestone 2.6 remain OPEN; adapter BLOCKED',
        ],'timestamp_utc':datetime.now(timezone.utc).isoformat()}
    (out/'review.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    summary=['# MASL 2.6S — two independent local SQLite stores with root-signed replay','',
         f'- Published baseline `{HEAD}`',f'- TypeScript: {ASSERTIONS}/{ASSERTIONS}',
         f'- Separate SQLite/RS256: {FIXTURE_ASSERTIONS}/{FIXTURE_ASSERTIONS}',
         f'- Critical cases: {len(CRITICAL)}/{len(CRITICAL)}',
         '- Five selected gates passed; G1-G9/2.6 OPEN; adapter BLOCKED','',
         'Two separate SQLite files on ONE host. This is not consensus, quorum,',
         'cross-host durability, enterprise producer trust or Agent Server integration.','',
         '## Gate SHA-256','']
    summary.extend(f'- {k}: `{v}`' for k,v in logs.items())
    summary.extend(['',f'- Replica archive SHA-256: `{report["replica_archive_sha256"]}`',''])
    (out/'review.md').write_text('\n'.join(summary),encoding='utf8')
    for rel in ('review.json','review.md','replica-proof.tar'):
        print('EVIDENCE: '+rel+' SHA256 '+sha((out/rel).read_bytes()),flush=True)
    print('REVIEW STATUS: PASS — 2.6S isolated root/two SQLite replica rehearsal; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)

def main()->None:
    ap=argparse.ArgumentParser(description=__doc__)
    group=ap.add_mutually_exclusive_group(required=True)
    group.add_argument('--preflight',action='store_true')
    group.add_argument('--run',action='store_true')
    group.add_argument('--fixture-child',action='store_true')
    ap.add_argument('--schema',type=Path,default=DEFAULT_SCHEMA)
    ap.add_argument('--output-dir',type=Path)
    a=ap.parse_args()
    if a.preflight:preflight(a.schema)
    else:
        need(a.output_dir is not None,'--output-dir required')
        if a.fixture_child:fixture_suite(a.output_dir)
        else:run(a.schema,a.output_dir)

if __name__=='__main__':
    try:main()
    except (RuntimeError,subprocess.CalledProcessError,TimeoutError,OSError,sqlite3.Error,ValueError) as err:
        print(str(err),file=sys.stderr,flush=True)
        raise SystemExit(1)
