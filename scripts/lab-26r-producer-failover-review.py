#!/usr/bin/env python3
"""MASL 2.6R — producer RS256 provenance and two-node loopback mTLS failover.

Only three untracked files. --preflight is read-only. --run executes 5 gates,
stores 8 SHA-pinned artifacts OUTSIDE Git. Real local TLS sockets and signed
fixture producer envelopes are coupled in Python, but TypeScript is an
independent pure harness. Two local OS server processes use the SAME SQLite
file; this is NOT distributed replication or a production security signoff.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime,timezone
from hashlib import sha1,sha256
import importlib.util
import json
import multiprocessing as mp
import os
from pathlib import Path
import re
import socket
import sqlite3
import ssl
import subprocess
import sys
import tempfile
from threading import Thread

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'apps/web'
HEAD='b98f63ac9364c7cf6b8a52ccd03c5188f72a9cc4'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
UPSTREAM='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/producer-failover-evidence.ts'
TEST='apps/web/src/ag-ui/producer-failover-evidence.spec.ts'
RUNNER='scripts/lab-26r-producer-failover-review.py'
SRC_SHA='8a86e5cfc60c74b3d968fbeea839eb0716c8f54c6243c7df4efaae836c1122ce'
TEST_SHA='b1b30aa73b9fa60c0d0e9e448b88a6c44c7819be3f6b8ab3609a07f6a4c2c7de'
ASSERTIONS=380
FIXTURE_ASSERTIONS=48
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'521b6f2287998984738d5bee7cd4eccf3526f783',
 'CURRENT.md':'9a233d6e99dc0b9ef4cf5f050ef52a3dd23cd772',
 'docs/journal/lab-23-ag-ui.md':'7e32898f48741ddb2634317682573e1e867955f1',
 'apps/web/src/ag-ui/authenticated-transport-readiness.ts':'706ac518efda3006b24073af32c613418165416d',
 'apps/web/src/ag-ui/authenticated-transport-readiness.spec.ts':'cfe6fc2b27be1746b6ebf1ab4275176841e4d37e',
 'scripts/lab-26q-transport-review.py':'bb5ef83ce6d009d62c5249ebf8f4af1f7bc1ae59',
 'apps/web/src/ag-ui/cross-service-recovery.ts':'42dba15a2279e3a027574f4587214f21dc9040ad',
 'apps/web/src/ag-ui/issuer-revocation-failures.ts':'dbef5f2bf73ab97fc624365c11a2cc02599ce689',
 'apps/web/src/ag-ui/external-interop-gates.ts':'5ea2006f07f16980f0ed2bf29ed58d10e23b44df',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
}
CRITICAL=(
 'published 2.6Q transport readiness composes after fixture producer checks',
 'published 2.6P read-only recovery composes with producer receipt fixture',
 'caller privilege injection producerId denied',
 'invalid producer fixture never accesses registry',
 'untrusted producer registry never reaches node fixture',
 'untrusted node state cannot reach published 2.6Q',
 'published 2.6Q peer identity gate remains enforced',
 'published revocation still blocks proposed commit',
 'producer tenant cannot override authenticated fixture tenant',
 'producer proof source outage fails closed',
 'producer registry outage fails closed',
 'all G1-G9 remain OPEN after producer proof fixtures',
 'parent milestone 2.6 remains OPEN',
)

def need(ok:bool,message:str)->None:
    if not ok:raise RuntimeError('BLOCKED: '+message)
def git(*args:str,cwd:Path=ROOT)->str:
    return subprocess.check_output(['git',*args],cwd=cwd,text=True,stderr=subprocess.STDOUT).strip()
def digest(raw:bytes)->str:return sha256(raw).hexdigest()
def blob(raw:bytes)->str:return sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
def schema_gate(path:Path)->None:
    need(path.is_file() and not path.is_symlink(),'pinned schema absent/symlink')
    raw=path.read_bytes()
    need(digest(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,'pinned schema SHA/blob changed')
    document=json.loads(raw)
    need(document.get('$id')=='https://ag-ui.com/spec/1.0/schema.json','pinned schema identity changed')
    need(len(document['$defs']['Event']['oneOf'])==31,'AG-UI 1.0 event union changed')
    print('PASS: pinned official AG-UI 1.0 schema SHA-256/Git blob and 31 variants',flush=True)

def preflight(schema:Path)->None:
    need(git('symbolic-ref','--quiet','--short','HEAD')=='main','expected branch main')
    need(git('rev-parse','HEAD')==HEAD,'HEAD differs from published 2.6Q baseline')
    need(git('rev-parse','origin/main')==HEAD,'origin/main baseline drift')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked/index scope differs')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'untracked scope not three 2.6R files')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop reference moved')
    for rel,expected in BLOBS.items():
        need(git('rev-parse','HEAD:'+rel)==expected,'published blob changed: '+rel)
        need(git('hash-object',rel)==expected,'tracked worktree drift: '+rel)
    for rel,expected in ((SRC,SRC_SHA),(TEST,TEST_SHA)):
        f=ROOT/rel
        need(f.is_file() and not f.is_symlink() and digest(f.read_bytes())==expected,
             '2.6R payload SHA changed: '+rel)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),'runner missing/symlink')
    road=(ROOT/'ROADMAP.md').read_text(encoding='utf-8').splitlines()
    need(road.count('- [ ] 2.6 AG-UI')==1,'parent AG-UI 2.6 unexpectedly closed')
    need(road.count('  - [ ] 2.6R AG-UI producer authenticity and distributed recovery evidence gates')==1,
         'pending 2.6R roadmap entry absent')
    need(subprocess.run(['openssl','version'],stdout=subprocess.DEVNULL,
          stderr=subprocess.DEVNULL,check=False).returncode==0,'OpenSSL required')
    schema_gate(schema)
    print('PASS: exact b98f63a HEAD/origin, ten Git blobs, pinned workshop and three 2.6R files',flush=True)
    print('PASS: read-only preflight; no Git/network mutation or live Agent Server',flush=True)

# Import ONLY the PUBLISHED 2.6Q certificate/SSL helper, Git blob preflight pinned.
def published_26q():
    spec=importlib.util.spec_from_file_location('masl_published_26q',ROOT/'scripts/lab-26q-transport-review.py')
    need(spec is not None and spec.loader is not None,'published 2.6Q TLS module unavailable')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

NOW=1_001_000
IDS=re.compile(r'[A-Za-z0-9._:-]{1,128}\Z')
ENV_FIELDS={'producerId','keyId','tenant','thread','run','idem','sequence',
            'revocationEpoch','expectedRevision','payloadSha256','issuedAt','expiresAt'}
REQ_FIELDS={'op','envelope','signature','payloadHex','injectAckLoss'}
DB_SCHEMA='''
CREATE TABLE acl(tenant TEXT NOT NULL,thread TEXT NOT NULL,principal TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tenant,thread));
CREATE TABLE producers(tenant TEXT NOT NULL,producer TEXT NOT NULL,key_id TEXT NOT NULL,
 revocation_epoch INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,
 last_sequence INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tenant,producer));
CREATE TABLE receipts(tenant TEXT NOT NULL,thread TEXT NOT NULL,run_id TEXT NOT NULL,
 idem_key TEXT NOT NULL,producer TEXT NOT NULL,seq INTEGER NOT NULL,
 revision INTEGER NOT NULL,payload_sha256 TEXT NOT NULL,node_id TEXT NOT NULL,
 PRIMARY KEY(tenant,thread,run_id),UNIQUE(tenant,idem_key));
'''

def connect(path:Path)->sqlite3.Connection:
    db=sqlite3.connect(path,timeout=10,isolation_level=None)
    db.execute('PRAGMA foreign_keys=ON');db.execute('PRAGMA busy_timeout=10000')
    return db

def create_db(path:Path)->None:
    with connect(path) as db:
        need(db.execute('PRAGMA journal_mode=WAL').fetchone()[0]=='wal','SQLite WAL unavailable')
        db.execute('PRAGMA synchronous=FULL')
        db.executescript(DB_SCHEMA)
        db.executemany('INSERT INTO acl(tenant,thread,principal) VALUES(?,?,?)',[
            ('tenant-A','thread-A','fixture-gateway'),
            ('tenant-A','race-thread','fixture-gateway'),
            ('tenant-B','thread-A','other-gateway'),
        ])
        db.execute("INSERT INTO producers VALUES('tenant-A','fixture-producer','fixture-sign-key-1',2,1,0)")
        db.execute("INSERT INTO producers VALUES('tenant-A','fixture-producer-race','fixture-sign-key-1',2,1,0)")

def canonical(x:dict)->bytes:
    return json.dumps(x,separators=(',',':'),sort_keys=True,ensure_ascii=True).encode('ascii')

def sign(private:Path,env:dict)->str:
    proc=subprocess.run(['openssl','dgst','-sha256','-sign',str(private)],input=canonical(env),
                        stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10,check=False)
    need(proc.returncode==0,'producer signature creation fixture failed')
    return base64.urlsafe_b64encode(proc.stdout).rstrip(b'=').decode('ascii')

def verify(public:Path,env:dict,signature:str)->bool:
    if type(signature) is not str or len(signature)>1024 or not re.fullmatch(r'[A-Za-z0-9_-]+',signature):
        return False
    try:
        raw=base64.urlsafe_b64decode(signature+'='*(-len(signature)%4))
        if base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')!=signature:return False
        with tempfile.NamedTemporaryFile(prefix='masl-26r-signature-') as f:
            f.write(raw);f.flush()
            proc=subprocess.run(['openssl','dgst','-sha256','-verify',str(public),
                '-signature',f.name],input=canonical(env),stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,timeout=10,check=False)
            return proc.returncode==0
    except (ValueError,OSError,subprocess.TimeoutExpired):return False

def producer_keys(path:Path)->tuple[Path,Path,Path]:
    private=path/'producer-fixture-private.pem';public=path/'producer-fixture-public.pem'
    attacker=path/'attacker-fixture-private.pem'
    for item in (private,attacker):
        proc=subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt',
            'rsa_keygen_bits:2048','-out',str(item)],stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,timeout=20,check=False)
        need(proc.returncode==0,'ephemeral producer fixture key generation failed')
    proc=subprocess.run(['openssl','pkey','-in',str(private),'-pubout','-out',str(public)],
                        stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10,check=False)
    need(proc.returncode==0,'producer public key generation failed')
    return private,public,attacker

def make_envelope(payload:bytes,thread='thread-A',run='run-A',idem='idem-A',
                  seq=1,expected=0,epoch=2,tenant='tenant-A',producer='fixture-producer')->dict:
    return {'producerId':producer,'keyId':'fixture-sign-key-1',
            'tenant':tenant,'thread':thread,'run':run,'idem':idem,'sequence':seq,
            'revocationEpoch':epoch,'expectedRevision':expected,
            'payloadSha256':digest(payload),'issuedAt':NOW-30,'expiresAt':NOW+60}

def request(private:Path,payload:bytes=b'AGUI-fixture-signed-event-bytes',**overrides)->dict:
    env=make_envelope(payload,**overrides)
    return {'op':'commit','envelope':env,'signature':sign(private,env),
            'payloadHex':payload.hex(),'injectAckLoss':False}

def transact(dbfile:Path,public:Path,peer:str,node_name:str,data:object)->tuple[str,bool]:
    if peer!='fixture-gateway':return 'gateway-peer-denied',False
    if not isinstance(data,dict) or set(data)!=REQ_FIELDS:return 'untrusted-request-shape',False
    op=data['op']
    if op not in ('commit','reconcile') or type(data['injectAckLoss']) is not bool or \
       (op=='reconcile' and data['injectAckLoss']):return 'untrusted-request-shape',False
    env=data['envelope']
    if not isinstance(env,dict) or set(env)!=ENV_FIELDS:return 'producer-envelope-shape-denied',False
    if any(type(env[k]) is not str or not IDS.fullmatch(env[k]) for k in
           ('producerId','keyId','tenant','thread','run','idem')):
        return 'producer-envelope-shape-denied',False
    if any(type(env[k]) is not int or env[k]<0 for k in
           ('sequence','revocationEpoch','expectedRevision','issuedAt','expiresAt')) or \
       not 1<=env['sequence']<=1_000_000 or not 0<=env['expectedRevision']<=1024 or \
       not isinstance(env['payloadSha256'],str) or not re.fullmatch('[a-f0-9]{64}',env['payloadSha256']):
        return 'producer-envelope-shape-denied',False
    if env['issuedAt']>NOW or env['expiresAt']<=NOW or \
       env['expiresAt']<=env['issuedAt'] or env['expiresAt']-env['issuedAt']>120:
        return 'producer-envelope-expired',False
    if not verify(public,env,data['signature']):return 'producer-signature-denied',False
    if type(data['payloadHex']) is not str or len(data['payloadHex'])>262144 or \
       len(data['payloadHex'])%2:return 'invalid-event-bytes',False
    try:body=bytes.fromhex(data['payloadHex'])
    except ValueError:return 'invalid-event-bytes',False
    if not body or digest(body)!=env['payloadSha256']:
        return 'producer-byte-digest-mismatch',False
    if env['tenant']!='tenant-A':return 'producer-tenant-denied',False
    db=connect(dbfile)
    try:
        db.execute('BEGIN IMMEDIATE')
        owner=db.execute('SELECT principal,revision FROM acl WHERE tenant=? AND thread=?',
                         (env['tenant'],env['thread'])).fetchone()
        if owner is None or owner[0]!=peer:return 'fixture-thread-acl-denied',False
        reg=db.execute('SELECT key_id,revocation_epoch,active,last_sequence FROM producers '
                       'WHERE tenant=? AND producer=?',(env['tenant'],env['producerId'])).fetchone()
        if reg is None or reg[0]!=env['keyId'] or reg[2]!=1:return 'producer-key-disabled',False
        if reg[1]!=env['revocationEpoch']:return 'producer-revocation-stale',False
        row=db.execute('SELECT thread,run_id,producer,seq,revision,payload_sha256 FROM receipts '
                       'WHERE tenant=? AND idem_key=?',(env['tenant'],env['idem'])).fetchone()
        matching=(env['thread'],env['run'],env['producerId'],env['sequence'],
                  env['expectedRevision']+1,env['payloadSha256'])
        if op=='reconcile':
            return ('receipt-reconciled-no-write' if row==matching else 'receipt-not-confirmed'),False
        if row is not None:
            return ('duplicate-no-write' if row==matching else 'idempotency-conflict'),False
        if env['sequence']<=reg[3]:return 'producer-sequence-stale',False
        if owner[1]!=env['expectedRevision']:return 'cas-stale-revision',False
        db.execute('UPDATE acl SET revision=revision+1 WHERE tenant=? AND thread=? AND revision=?',
                   (env['tenant'],env['thread'],env['expectedRevision']))
        db.execute('UPDATE producers SET last_sequence=? WHERE tenant=? AND producer=?',
                   (env['sequence'],env['tenant'],env['producerId']))
        db.execute('INSERT INTO receipts VALUES(?,?,?,?,?,?,?,?,?)',(
                   env['tenant'],env['thread'],env['run'],env['idem'],env['producerId'],
                   env['sequence'],env['expectedRevision']+1,env['payloadSha256'],node_name))
        db.execute('COMMIT')
        return 'committed',data['injectAckLoss']
    except sqlite3.Error:return 'sqlite-failure-blocked',False
    finally:
        if db.in_transaction:db.execute('ROLLBACK')
        db.close()

def serve(db_path:str,public:str,cert:str,key:str,ca:str,node_name:str,
          ports:object,stop:object)->None:
    ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version=ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(cert,key);ctx.verify_mode=ssl.CERT_REQUIRED
    ctx.load_verify_locations(cafile=ca)
    s=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
    s.bind(('127.0.0.1',0));s.listen(16);s.settimeout(.25)
    ports.put(s.getsockname()[1]);sessions:list[Thread]=[]
    def serve_client(sock:socket.socket)->None:
        try:
            sock.settimeout(5)
            with ctx.wrap_socket(sock,server_side=True) as tls:
                certdata=tls.getpeercert()
                cn=next((v for line in certdata.get('subject',()) for field,v in line
                         if field=='commonName'),'')
                data=b''
                while b'\n' not in data and len(data)<32768:
                    piece=tls.recv(4096)
                    if not piece:break
                    data+=piece
                if b'\n' not in data:return
                def refuse_duplicate_keys(pairs:list[tuple[str,object]])->dict:
                    result={}
                    for key,value in pairs:
                        if key in result:raise ValueError('duplicate-json-key')
                        result[key]=value
                    return result
                try:request_body=json.loads(data.split(b'\n')[0].decode('utf-8'),
                    object_pairs_hook=refuse_duplicate_keys)
                except (ValueError,UnicodeError):
                    tls.sendall(b'{"status":"invalid-json"}\n');return
                status,loss=transact(Path(db_path),Path(public),cn,node_name,request_body)
                if not loss:tls.sendall((json.dumps({'status':status})+'\n').encode())
        except (ssl.SSLError,OSError,TimeoutError,ConnectionError):pass
        finally:
            try:sock.close()
            except OSError:pass
    try:
        while not stop.is_set():
            try:connection,_=s.accept()
            except socket.timeout:continue
            t=Thread(target=serve_client,args=(connection,));t.start();sessions.append(t)
    finally:
        s.close()
        for t in sessions:t.join(timeout=5)

def fixture_suite(out:Path)->None:
    q=published_26q()
    database=out/'producer-proof.sqlite3'
    need(not database.exists(),'fixture database already exists')
    create_db(database)
    count=0
    def ok(yes:bool,label:str)->None:
        nonlocal count
        need(yes,'producer/failover local fixture assertion failed: '+label)
        count+=1
        print('PASS: '+label,flush=True)
    with tempfile.TemporaryDirectory(prefix='masl-26r-secrets-') as temporary:
        folder=Path(temporary)
        certs=q.create_certificates(folder)
        private,public,attacker=producer_keys(folder)
        ok(all(x.is_file() for x in (private,public,attacker)),'temporary producer RSA keys generated')
        ok(all(x.is_file() for x in certs.values()),'ephemeral test mTLS CA/certificates generated')
        mpctx=mp.get_context('spawn')
        ports_a=mpctx.Queue();ports_b=mpctx.Queue()
        stop_a=mpctx.Event();stop_b=mpctx.Event()
        args=(str(database),str(public),str(certs['server']),str(certs['server_key']),str(certs['ca']))
        a=mpctx.Process(target=serve,args=(*args,'fixture-node-A',ports_a,stop_a))
        b=mpctx.Process(target=serve,args=(*args,'fixture-node-B',ports_b,stop_b))
        a.start();b.start()
        try:
            port_a=ports_a.get(timeout=12);port_b=ports_b.get(timeout=12)
            ok(port_a!=port_b and port_a>0 and port_b>0,'two OS server processes bind distinct loopback TLS ports')
            def call(port:int,r:dict,identity='client',hostname='localhost',have_cert=True)->str:
                return q.client_call(port,certs,r,identity,hostname,have_cert)
            first=request(private)
            ok(call(port_a,first)=='committed','signed producer envelope accepted over real mTLS on primary node')
            ok(call(port_a,first)=='duplicate-no-write','same signed payload retry idempotent on primary')
            ok(call(port_b,{**first,'op':'reconcile'})=='receipt-reconciled-no-write',
               'standby node reconciles primary receipt in same shared SQLite file')
            ok(call(port_b,{**first,'op':'reconcile','payloadHex':b'bad'.hex()})=='producer-byte-digest-mismatch',
               'recovery refuses changed unsigned event bytes')
            ok(call(port_a,{**first,'payloadHex':b'adulterated'.hex()})=='producer-byte-digest-mismatch',
               'tampered producer payload rejected despite valid envelope signature')
            ok(call(port_a,{**first,'envelope':{**first['envelope'],'thread':'race-thread'}})==
               'producer-signature-denied','signed producer thread modification fails signature')
            ok(call(port_a,{**first,'envelope':{**first['envelope'],'tenant':'tenant-B'}})==
               'producer-signature-denied','signed producer tenant modification fails signature')
            ok(call(port_a,{**first,'envelope':{**first['envelope'],'expiresAt':NOW+40}})==
               'producer-signature-denied','signed producer expiry modification fails signature')
            ok(call(port_a,{**first,'signature':sign(attacker,first['envelope'])})==
               'producer-signature-denied','signature from untrusted local producer key rejected')
            ok(call(port_a,{**first,'signature':'?bad'})=='producer-signature-denied',
               'malformed signature encoding rejected')
            ok(call(port_a,{**first,'admin':True})=='untrusted-request-shape',
               'caller cannot inject privileged fields into signed envelope request')
            # Send raw JSON with duplicate top-level keys: ordinary dict serialization
            # would collapse them and fail to test duplicate-key parser behavior.
            duplicate_body=b'{"op":"commit",'+canonical(first)[1:-1]+b'}\n'
            ctx=ssl.create_default_context(ssl.Purpose.SERVER_AUTH,cafile=str(certs['ca']))
            ctx.load_cert_chain(str(certs['client']),str(certs['client_key']))
            with socket.create_connection(('127.0.0.1',port_a),timeout=5) as raw:
                with ctx.wrap_socket(raw,server_hostname='localhost') as transport:
                    transport.settimeout(5)
                    transport.sendall(duplicate_body)
                    response=transport.recv(8192)
            ok(json.loads(response.split(b'\n')[0])['status']=='invalid-json',
               'duplicate JSON request key rejected before event processing')
            ok(call(port_a,{**first,'op':'reconcile','injectAckLoss':True})=='untrusted-request-shape',
               'reconciliation cannot request ack-loss fault injection')
            ok(call(port_a,first,identity='other')=='gateway-peer-denied',
               'client certificate trusted by CA but unauthorized gateway CN rejected')
            ok(call(port_a,first,identity='untrusted')=='tls-rejected-or-connection-failed',
               'client signed by untrusted CA rejected by mTLS')
            ok(call(port_a,first,have_cert=False)=='tls-rejected-or-connection-failed',
               'client without certificate refused by mTLS')
            ok(call(port_a,first,hostname='wrong-host.invalid')=='tls-rejected-or-connection-failed',
               'TLS client rejects hostname mismatch')
            ok(call(port_a,{**first,'op':'reconcile','envelope':{**first['envelope'],'keyId':'unknown'}})==
               'producer-signature-denied','changing signed producer key reference denied')
            race_results:list[str]=[]
            from threading import Barrier
            start_race=Barrier(2)
            def compete(port:int,suffix:str)->None:
                signed=request(private,payload=('race-'+suffix).encode(),thread='race-thread',
                    run='race-'+suffix,idem='idem-race-'+suffix,seq=1,expected=0,
                    producer='fixture-producer-race')
                start_race.wait(timeout=8)
                race_results.append(call(port,signed))
            left=Thread(target=compete,args=(port_a,'left'))
            right=Thread(target=compete,args=(port_b,'right'))
            left.start();right.start();left.join(12);right.join(12)
            ok(not left.is_alive() and not right.is_alive(),
               'two independent local TLS node clients complete signed producer CAS race')
            ok(sorted(race_results)==['committed','producer-sequence-stale'],
               'shared fixture producer sequence admits exactly one signed race event')
            with connect(database) as db:
                ok(db.execute("SELECT revision FROM acl WHERE thread='race-thread'").fetchone()[0]==1,
                   'race-thread revision advances exactly once across two node processes')
                ok(db.execute("SELECT last_sequence FROM producers WHERE producer='fixture-producer-race'").fetchone()[0]==1,
                   'race producer signed sequence increments only once')
            second=request(private,seq=2,expected=1,run='run-B',idem='idem-B')
            second['injectAckLoss']=True
            ok(call(port_a,second)=='connection-closed-without-ack',
               'primary intentionally drops response after durable COMMIT')
            a.terminate();a.join(timeout=6)
            ok(not a.is_alive(),'primary OS process terminated before failover recovery')
            ok(call(port_b,{**second,'op':'reconcile','injectAckLoss':False})=='receipt-reconciled-no-write',
               'standby node recovers persisted primary receipt after process exit')
            ok(call(port_b,{**second,'injectAckLoss':False})=='duplicate-no-write',
               'failover signed retry cannot duplicate prior commit')
            ok(call(port_b,{**second,'payloadHex':b'changed'.hex(),'injectAckLoss':False})==
               'producer-byte-digest-mismatch','failover refuses data changed from signed receipt')
            ok(call(port_b,{**second,'op':'reconcile','injectAckLoss':False,
               'envelope':{**second['envelope'],'sequence':3}})=='producer-signature-denied',
               'failover cannot elevate signed producer sequence')
            stale=request(private,seq=2,expected=2,run='run-C',idem='idem-C')
            ok(call(port_b,stale)=='producer-sequence-stale',
               'reused producer sequence denied for new run after failover')
            third=request(private,seq=3,expected=2,run='run-C',idem='idem-C')
            ok(call(port_b,third)=='committed','monotonic producer sequence commits at standby')
            ok(call(port_b,third)=='duplicate-no-write','second node deduplicates later exact replay')
            with connect(database) as db:
                ok(db.execute("SELECT last_sequence FROM producers WHERE tenant='tenant-A'").fetchone()[0]==3,
                   'shared producer sequence advanced atomically to 3')
                ok(db.execute("SELECT revision FROM acl WHERE tenant='tenant-A' AND thread='thread-A'").fetchone()[0]==3,
                   'shared checkpoint revision advanced exactly three times')
                ok(db.execute("SELECT COUNT(*) FROM receipts").fetchone()[0]==4,
                   'primary and standby persist exactly four receipts before revocation')
                ok(db.execute("SELECT COUNT(DISTINCT node_id) FROM receipts").fetchone()[0]==2,
                   'receipts identify both local server OS processes')
                db.execute("UPDATE producers SET revocation_epoch=3 WHERE tenant='tenant-A'")
            fourth=request(private,seq=4,expected=3,run='run-D',idem='idem-D')
            ok(call(port_b,fourth)=='producer-revocation-stale',
               'stale signed producer revocation epoch refused after shared update')
            fourth=request(private,seq=4,expected=3,run='run-D',idem='idem-D',epoch=3)
            ok(call(port_b,fourth)=='committed','refreshed signed producer epoch commits on standby')
            with connect(database) as db:
                db.execute("UPDATE producers SET active=0 WHERE tenant='tenant-A'")
            fifth=request(private,seq=5,expected=4,run='run-E',idem='idem-E',epoch=3)
            ok(call(port_b,fifth)=='producer-key-disabled','revoked producer key stops future commits')
            ok(call(port_b,{**fourth,'op':'reconcile'})=='producer-key-disabled',
               'revoked producer cannot rely on old signature for receipt lookup')
            with connect(database) as db:
                ok(db.execute('SELECT COUNT(*) FROM receipts').fetchone()[0]==5,
                   'revoked key and stale epoch created no extra receipt')
                ok(db.execute('SELECT revision FROM acl WHERE tenant=? AND thread=?',
                   ('tenant-A','thread-A')).fetchone()[0]==4,
                   'producer revocation leaves checkpoint at four committed revisions')
                ok(db.execute("SELECT last_sequence FROM producers WHERE tenant='tenant-A'").fetchone()[0]==4,
                   'producer sequence state remains monotonic after key revocation')
                ok(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok',
                   'physical shared SQLite database integrity check passes')
                db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        finally:
            stop_a.set();stop_b.set()
            for node in (a,b):
                node.join(timeout=8)
                if node.is_alive():node.terminate();node.join(timeout=5)
        ok(b.exitcode==0,'standby TLS process exits cleanly after local test')
    ok(database.is_file() and database.stat().st_size>0,
       'local shared SQLite evidence exists outside Git; fixture keys destroyed')
    print(f'{count} 2.6R local producer RS256/two-node mTLS/SQLite assertions passed',flush=True)

def gate(name:str,args:list[str],cwd:Path,out:Path)->None:
    with out.open('w',encoding='utf-8') as target:
        try:proc=subprocess.run(args,cwd=cwd,stdout=target,stderr=subprocess.STDOUT,
                                timeout=240,check=False)
        except subprocess.TimeoutExpired as exc:raise RuntimeError('BLOCKED: gate timeout '+name) from exc
    need(proc.returncode==0,'gate failed: '+name+' at '+str(out))
    print('PASS: '+name+' SHA256 '+digest(out.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    root=ROOT.resolve();location=out.resolve()
    need(location!=root and root not in location.parents,'evidence must be outside Git')
    need(not out.exists(),'evidence path already exists')
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
         'src/ag-ui/producer-failover-evidence.spec.ts','--outDir',str(ssr),'--emptyOutDir'],
         WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    gate('pure.log',['node',str(ssr/'producer-failover-evidence.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf-8')
    m=re.search(r'(?m)^(\d+) 2\.6R selected producer/failover TypeScript assertions passed\s*$',pure)
    need(m is not None and int(m.group(1))==ASSERTIONS,'TypeScript count not expected')
    need(pure.count('PASS: ')==ASSERTIONS,'TS PASS line count differs')
    for label in CRITICAL:need('PASS: '+label in pure,'critical marker absent: '+label)
    gate('fixture.log',[sys.executable,str(ROOT/RUNNER),'--fixture-child',
         '--output-dir',str(out)],ROOT,out/'fixture.log')
    raw=(out/'fixture.log').read_text(encoding='utf-8')
    f=re.search(r'(?m)^(\d+) 2\.6R local producer RS256/two-node mTLS/SQLite assertions passed\s*$',raw)
    need(f is not None and int(f.group(1))==FIXTURE_ASSERTIONS,'local fixture check count changed')
    need(raw.count('PASS: ')==FIXTURE_ASSERTIONS,'local fixture PASS count differs')
    db=out/'producer-proof.sqlite3'
    need(db.is_file() and not db.is_symlink(),'physical SQLite proof missing')
    preflight(schema)
    hashes={n:digest((out/n).read_bytes()) for n in
            ('lint.log','build.log','compile.log','pure.log','fixture.log')}
    report={
        'lab':'2.6R','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
        'agui_upstream_commit':UPSTREAM,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
        'published_git_blobs':BLOBS,
        'scope':'isolated TypeScript producer contract and local two-node mTLS RS256 shared-SQLite fixture',
        'typescript_assertions':ASSERTIONS,'fixture_assertions':FIXTURE_ASSERTIONS,
        'critical_cases':len(CRITICAL),'gate_logs_sha256':hashes,
        'sqlite_sha256':digest(db.read_bytes()),
        'sources_sha256':{p:digest((ROOT/p).read_bytes()) for p in (SRC,TEST,RUNNER)},
        'gap_ids_open':['G'+str(i) for i in range(1,10)],'adapter_ready':False,
        'parent_2_6_open':True,'real_producer_authenticated':False,
        'distributed_storage_verified':False,'security_signoff':False,
        'limits':[
            'TypeScript pure callbacks do not perform cryptographic verification and are separate from Python TLS fixture',
            'RS256 source signs a fixture envelope, verified over real local TLS; source and RSA keys are disposable',
            'Mutual TLS is loopback with test CA, not enterprise PKI, SPIFFE or production issuer',
            'Two independent OS server processes share ONE local SQLite database file; no distributed replica or quorum',
            'Primary is terminated after simulated lost acknowledgement; no actual network partition or power loss test',
            'Event payload is synthetic and not emitted by an authenticated real AG-UI producer',
            'No Agent Server adapter, external identity/ACL or media/DLP; G1-G9/2.6 OPEN and adapter BLOCKED',
        ],'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    summary=['# MASL 2.6R — signed producer and two-node shared SQLite fixture','',
       f'- Published baseline `{HEAD}`',f'- TypeScript {ASSERTIONS}/{ASSERTIONS}',
       f'- Producer RS256/mTLS/SQLite {FIXTURE_ASSERTIONS}/{FIXTURE_ASSERTIONS}',
       f'- Critical labels {len(CRITICAL)}/{len(CRITICAL)}',
       '- G1–G9 OPEN, parent 2.6 OPEN, Agent Server adapter BLOCKED','',
       'Two local servers share one SQLite file. This is NOT distributed storage,',
       'enterprise identity or real AG-UI event production.','',
       '## Log SHA-256','']
    summary += [f'- {name}: `{value}`' for name,value in hashes.items()]
    summary += ['',f'- SQLite SHA-256: `{report["sqlite_sha256"]}`','']
    (out/'review.md').write_text('\n'.join(summary),encoding='utf-8')
    for item in ('review.json','review.md','producer-proof.sqlite3'):
        print('EVIDENCE: '+item+' SHA256 '+digest((out/item).read_bytes()),flush=True)
    print('REVIEW STATUS: PASS — selected 2.6R signed producer/two-node shared SQLite fixture; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)

def main()->None:
    ap=argparse.ArgumentParser()
    actions=ap.add_mutually_exclusive_group(required=True)
    actions.add_argument('--preflight',action='store_true')
    actions.add_argument('--run',action='store_true')
    actions.add_argument('--fixture-child',action='store_true')
    ap.add_argument('--schema',type=Path,default=DEFAULT_SCHEMA)
    ap.add_argument('--output-dir',type=Path)
    args=ap.parse_args()
    if args.preflight:preflight(args.schema)
    elif args.fixture_child:
        need(args.output_dir is not None,'fixture output dir required')
        fixture_suite(args.output_dir)
    else:
        need(args.output_dir is not None,'output dir required')
        run(args.schema,args.output_dir)

if __name__=='__main__':
    try:main()
    except (RuntimeError,subprocess.CalledProcessError,TimeoutError,OSError) as err:
        print(str(err),file=sys.stderr,flush=True)
        raise SystemExit(1)
