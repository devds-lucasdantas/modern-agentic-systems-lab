#!/usr/bin/env python3
"""MASL 2.6Q — isolated loopback mTLS/SQLite and pure TS readiness gates.

Three new files only. --preflight read-only. --run five local gates and eight
SHA-pinned artifacts outside Git. Network restricted to 127.0.0.1; ephemeral
fixture CA/certs, no external issuer, OAuth, Agent Server, remote services or
operational producer authentication. Python mTLS and TypeScript pure callbacks
are separate experiments and do not establish a single trusted pipeline.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha1, sha256
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
from threading import Event, Thread

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'apps/web'
HEAD='c017a9d7a8126a3a4074663509732ff860439ca9'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
UPSTREAM='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/authenticated-transport-readiness.ts'
TEST='apps/web/src/ag-ui/authenticated-transport-readiness.spec.ts'
RUNNER='scripts/lab-26q-transport-review.py'
SRC_SHA='f65f90205277c04f1fc48b7e427cc6a68ca231b0c16750c0adf61c7911698aca'
TEST_SHA='fdb7b8b42af66e49cfc68806993c0692fd9eeb8bb14b9bc859601c0cf717730a'
ASSERTIONS=269
FIXTURE_ASSERTIONS=30
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'d89c3d8e751dd040bd1af9ebfbb3b85c17833756',
 'CURRENT.md':'71e3672d0e27a299c93404f8b8ea90e709fe3ce3',
 'docs/journal/lab-23-ag-ui.md':'3fbc20ffb0459b6eb5748a42fe88df40c5bcd405',
 'apps/web/src/ag-ui/cross-service-recovery.ts':'42dba15a2279e3a027574f4587214f21dc9040ad',
 'apps/web/src/ag-ui/cross-service-recovery.spec.ts':'a05e989d142458fa1d6828e3abcedbd84569f95a',
 'scripts/lab-26p-cross-service-review.py':'b5d8abeb11c0184d25c8eddbec2850819c8d46ba',
 'apps/web/src/ag-ui/issuer-revocation-failures.ts':'dbef5f2bf73ab97fc624365c11a2cc02599ce689',
 'apps/web/src/ag-ui/external-interop-gates.ts':'5ea2006f07f16980f0ed2bf29ed58d10e23b44df',
 'apps/web/src/ag-ui/trusted-transaction-boundary.ts':'673f511c91781b59184095ed74f588e8bb81b60d',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
}
CRITICAL=(
 '2.6P published signed-metadata/recovery composes after transport fixture',
 'published 2.6P receipt reconciliation remains composed',
 'caller privilege field principalId denied',
 'invalid peer never reaches producer fixture',
 'producer observation unbound',
 'published issuer metadata freshness remains enforced',
 'published revocation enforcement preserved',
 'local peer fixture unavailable fail closed',
 'producer provenance fixture unavailable fail closed',
 'all G1-G9 remain OPEN',
 'parent milestone 2.6 remains OPEN',
)

def need(value:bool,message:str)->None:
    if not value:raise RuntimeError('BLOCKED: '+message)
def git(*args:str,cwd:Path=ROOT)->str:
    return subprocess.check_output(['git',*args],cwd=cwd,stderr=subprocess.STDOUT,text=True).strip()
def digest(data:bytes)->str:return sha256(data).hexdigest()
def blob(data:bytes)->str:return sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()

def schema_gate(path:Path)->None:
    need(path.is_file() and not path.is_symlink(),'pinned AG-UI schema missing/symlink')
    raw=path.read_bytes()
    need(digest(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,'schema hash/Git blob differs')
    doc=json.loads(raw)
    need(doc.get('$id')=='https://ag-ui.com/spec/1.0/schema.json','schema id mismatch')
    need(len(doc['$defs']['Event']['oneOf'])==31,'31 event variants mismatch')
    print('PASS: frozen AG-UI 1.0 schema SHA256/Git blob and 31-event union',flush=True)

def preflight(schema:Path)->None:
    need(git('symbolic-ref','--quiet','--short','HEAD')=='main','branch is not main')
    need(git('rev-parse','HEAD')==HEAD,'HEAD not published 2.6P baseline')
    need(git('rev-parse','origin/main')==HEAD,'origin/main baseline differs')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked or index modifications')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'untracked scope not exactly three 2.6Q sources')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'workshop HEAD differs')
    for path,pin in BLOBS.items():
        need(git('rev-parse','HEAD:'+path)==pin,'published blob mismatch: '+path)
        need(git('hash-object',path)==pin,'worktree tracked blob differs: '+path)
    for path,pin in ((SRC,SRC_SHA),(TEST,TEST_SHA)):
        p=ROOT/path
        need(p.is_file() and not p.is_symlink() and digest(p.read_bytes())==pin,
             'payload drift: '+path)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),
         'runner missing/symlink')
    road=(ROOT/'ROADMAP.md').read_text(encoding='utf-8').splitlines()
    need(road.count('- [ ] 2.6 AG-UI')==1,'parent 2.6 closed')
    need(road.count('  - [ ] 2.6Q AG-UI authenticated transport and recovery readiness gates')==1,
         'pending roadmap 2.6Q anchor not found')
    need(subprocess.run(['openssl','version'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0,
         'OpenSSL CLI not available')
    schema_gate(schema)
    print('PASS: exact c017a9d HEAD/origin, ten Git blobs, workshop and three 2.6Q files',flush=True)
    print('PASS: read-only preflight; no Git writes or external network, identity or Agent Server',flush=True)

# SQLite is actual local file-backed atomicity; test CA certificates are ephemeral.
DB_SCHEMA='''
CREATE TABLE acl(tenant TEXT NOT NULL,thread TEXT NOT NULL,principal TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tenant,thread));
CREATE TABLE receipts(tenant TEXT NOT NULL,thread TEXT NOT NULL,run_id TEXT NOT NULL,
 principal TEXT NOT NULL,idem_key TEXT NOT NULL,revision INTEGER NOT NULL,
 payload_sha256 TEXT NOT NULL,PRIMARY KEY(tenant,thread,run_id),UNIQUE(tenant,idem_key));
'''
IDS=re.compile(r'[A-Za-z0-9._:-]{1,128}\Z')

def connect(path:Path)->sqlite3.Connection:
    db=sqlite3.connect(path,timeout=10,isolation_level=None)
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=10000')
    return db

def create_db(path:Path)->None:
    with connect(path) as db:
        need(db.execute('PRAGMA journal_mode=WAL').fetchone()[0]=='wal','WAL unavailable')
        db.execute('PRAGMA synchronous=FULL')
        db.executescript(DB_SCHEMA)
        db.executemany('INSERT INTO acl(tenant,thread,principal) VALUES(?,?,?)',[
            ('tenant-A','thread-A','fixture-gateway'),
            ('tenant-A','race-thread','fixture-gateway'),
            ('tenant-B','thread-A','fixture-other'),
        ])

def transact(dbfile:Path,peer_cn:str,req:object)->tuple[str,bool]:
    # True indicates intentionally omit response after durable COMMIT.
    if peer_cn!='fixture-gateway':return 'peer-identity-denied',False
    if not isinstance(req,dict) or set(req)!={'op','tenant','thread','run','idem','expectedRevision',
                                             'payloadHex','injectAckLoss'}:
        return 'untrusted-request-shape',False
    op=req['op']
    if op not in ('commit','reconcile') or any(type(req[k]) is not str or not IDS.fullmatch(req[k])
       for k in ('tenant','thread','run','idem')):
        return 'untrusted-request-shape',False
    if type(req['expectedRevision']) is not int or not 0<=req['expectedRevision']<=1024 or \
       type(req['injectAckLoss']) is not bool or type(req['payloadHex']) is not str or \
       len(req['payloadHex'])>262144 or len(req['payloadHex'])%2:
        return 'untrusted-request-shape',False
    try:payload=bytes.fromhex(req['payloadHex'])
    except ValueError:return 'untrusted-request-shape',False
    if not payload:return 'empty-payload-denied',False
    if req['tenant']!='tenant-A':return 'cross-tenant-denied',False
    if req['injectAckLoss'] and op!='commit':return 'invalid-fault-injection',False
    db=connect(dbfile)
    try:
        db.execute('BEGIN IMMEDIATE')
        tenant,thread,run,idem,revision=(req[k] for k in
                                         ('tenant','thread','run','idem','expectedRevision'))
        row=db.execute('SELECT principal,revision FROM acl WHERE tenant=? AND thread=?',
                       (tenant,thread)).fetchone()
        if row is None or row[0]!=peer_cn:return 'fixture-acl-denied',False
        existing=db.execute('SELECT thread,run_id,principal,revision,payload_sha256 FROM receipts '
            'WHERE tenant=? AND idem_key=?',(tenant,idem)).fetchone()
        payload_hash=digest(payload)
        if op=='reconcile':
            if existing==(thread,run,peer_cn,revision+1,payload_hash):
                return 'receipt-reconciled-no-write',False
            return 'receipt-not-confirmed',False
        if existing is not None:
            if existing[:3]==(thread,run,peer_cn) and existing[4]==payload_hash:
                return 'duplicate-no-write',False
            return 'idempotency-conflict',False
        if db.execute('SELECT 1 FROM receipts WHERE tenant=? AND thread=? AND run_id=?',
                      (tenant,thread,run)).fetchone():return 'run-key-conflict',False
        if row[1]!=revision:return 'cas-stale-revision',False
        updated=db.execute('UPDATE acl SET revision=revision+1 WHERE tenant=? AND thread=? '
            'AND principal=? AND revision=?',(tenant,thread,peer_cn,revision))
        if updated.rowcount!=1:return 'cas-lost-race',False
        db.execute('INSERT INTO receipts VALUES(?,?,?,?,?,?,?)',
                   (tenant,thread,run,peer_cn,idem,revision+1,payload_hash))
        db.execute('COMMIT')
        return 'committed',req['injectAckLoss']
    except sqlite3.Error:
        return 'sqlite-failure-blocked',False
    finally:
        if db.in_transaction:db.execute('ROLLBACK')
        db.close()

def serve(dbfile:str,certfile:str,keyfile:str,cafile:str,port_queue:object,stop:object)->None:
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version=ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(certfile,keyfile)
    context.verify_mode=ssl.CERT_REQUIRED
    context.load_verify_locations(cafile=cafile)
    listener=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
    listener.bind(('127.0.0.1',0));listener.listen(10);listener.settimeout(.25)
    port_queue.put(listener.getsockname()[1])
    threads:list[Thread]=[]
    def session(raw:socket.socket)->None:
        try:
            raw.settimeout(4)
            with context.wrap_socket(raw,server_side=True) as tls:
                cert=tls.getpeercert()
                cn=next((v for line in cert.get('subject',()) for key,v in line if key=='commonName'),'')
                chunk=b''
                while b'\n' not in chunk and len(chunk)<32768:
                    part=tls.recv(4096)
                    if not part:break
                    chunk+=part
                if b'\n' not in chunk:return
                try:
                    req=json.loads(chunk.split(b'\n',1)[0].decode('utf-8'),
                                   object_pairs_hook=unique_pairs)
                except (ValueError,UnicodeError):
                    req=None
                status,lost=transact(Path(dbfile),cn,req)
                if not lost:tls.sendall((json.dumps({'status':status})+'\n').encode())
        except (ssl.SSLError,OSError,TimeoutError):
            pass  # Handshake reject or intentionally disconnected fixture
        finally:
            try:raw.close()
            except OSError:pass
    try:
        while not stop.is_set():
            try:raw,_=listener.accept()
            except socket.timeout:continue
            thread=Thread(target=session,args=(raw,),daemon=True)
            thread.start();threads.append(thread)
    finally:
        listener.close()
        for thread in threads:thread.join(6)

def unique_pairs(pairs:list[tuple[str,object]])->dict:
    out={}
    for key,value in pairs:
        if key in out:raise ValueError('duplicate JSON key')
        out[key]=value
    return out

def openssl(*args:str)->None:
    r=subprocess.run(['openssl',*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
    need(r.returncode==0,'OpenSSL fixture certificate generation failed')

def create_certificates(folder:Path)->dict[str,Path]:
    ca=folder/'ca.crt';cak=folder/'ca.key'
    openssl('req','-x509','-newkey','rsa:2048','-nodes','-sha256','-days','1',
            '-keyout',str(cak),'-out',str(ca),'-subj','/CN=masl-loopback-test-CA',
            '-addext','basicConstraints=critical,CA:TRUE',
            '-addext','keyUsage=critical,keyCertSign,cRLSign')
    badca=folder/'bad-ca.crt';badcak=folder/'bad-ca.key'
    openssl('req','-x509','-newkey','rsa:2048','-nodes','-sha256','-days','1',
            '-keyout',str(badcak),'-out',str(badca),'-subj','/CN=masl-untrusted-test-CA',
            '-addext','basicConstraints=critical,CA:TRUE',
            '-addext','keyUsage=critical,keyCertSign,cRLSign')
    for name,cn in [('server','localhost'),('client','fixture-gateway'),
                    ('other','fixture-other'),('untrusted','fixture-gateway')]:
        priv=folder/(name+'.key');request=folder/(name+'.csr');cert=folder/(name+'.crt')
        openssl('req','-newkey','rsa:2048','-nodes','-sha256',
                '-keyout',str(priv),'-out',str(request),'-subj','/CN='+cn)
        issuer_cert,issuer_key=(badca,badcak) if name=='untrusted' else (ca,cak)
        ext=folder/(name+'.ext')
        purpose='serverAuth' if name=='server' else 'clientAuth'
        ext.write_text('basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\n'
            'extendedKeyUsage='+purpose+'\n'+
            ('subjectAltName=DNS:localhost,IP:127.0.0.1\n' if name=='server' else ''),encoding='ascii')
        openssl('x509','-req','-in',str(request),'-CA',str(issuer_cert),'-CAkey',str(issuer_key),
                '-CAcreateserial','-out',str(cert),'-days','1','-sha256','-extfile',str(ext))
    return {key:folder/name for key,name in {
        'ca':'ca.crt','server':'server.crt','server_key':'server.key',
        'client':'client.crt','client_key':'client.key','other':'other.crt',
        'other_key':'other.key','untrusted':'untrusted.crt','untrusted_key':'untrusted.key',
    }.items()}

def client_call(port:int,certs:dict[str,Path],request:dict,
                identity:str='client',hostname:str='localhost',have_cert:bool=True)->str:
    ctx=ssl.create_default_context(ssl.Purpose.SERVER_AUTH,cafile=str(certs['ca']))
    ctx.minimum_version=ssl.TLSVersion.TLSv1_2
    ctx.check_hostname=True
    if have_cert:
        ctx.load_cert_chain(str(certs[identity]),str(certs[identity+'_key']))
    try:
        with socket.create_connection(('127.0.0.1',port),timeout=4) as plain:
            with ctx.wrap_socket(plain,server_hostname=hostname) as tls:
                tls.settimeout(4)
                tls.sendall((json.dumps(request,separators=(',',':'))+'\n').encode())
                raw=b''
                while b'\n' not in raw and len(raw)<16384:
                    chunk=tls.recv(4096)
                    if not chunk:break
                    raw+=chunk
                if not raw:return 'connection-closed-without-ack'
                return json.loads(raw.split(b'\n')[0].decode())['status']
    except (ssl.SSLError,OSError,TimeoutError,ConnectionError,ValueError,KeyError):
        return 'tls-rejected-or-connection-failed'

def fixture_suite(out:Path)->None:
    file=out/'transport-proof.sqlite3'
    need(not file.exists(),'SQLite evidence already exists')
    create_db(file)
    counter=0
    def ok(condition:bool,label:str)->None:
        nonlocal counter
        need(condition,'local mTLS/SQLite assertion failed: '+label)
        counter+=1
        print('PASS: '+label,flush=True)
    with tempfile.TemporaryDirectory(prefix='masl-26q-ephemeral-') as temporary:
        secrets=Path(temporary)
        certs=create_certificates(secrets)
        ok(all(p.is_file() for p in certs.values()),'ephemeral CA and TLS certificates generated')
        ctx=mp.get_context('spawn')
        ports=ctx.Queue();stop=ctx.Event()
        server=ctx.Process(target=serve,args=(str(file),str(certs['server']),
              str(certs['server_key']),str(certs['ca']),ports,stop))
        server.start()
        try:
            port=ports.get(timeout=10)
            ok(type(port) is int and 0<port<=65535,'real server bound only to a loopback socket')
            body=b'fixture-agui-sse-bytes'
            base={'op':'commit','tenant':'tenant-A','thread':'thread-A',
                  'run':'run-A','idem':'idem-A','expectedRevision':0,
                  'payloadHex':body.hex(),'injectAckLoss':False}
            call=lambda r,identity='client',hostname='localhost',have_cert=True:client_call(
                port,certs,r,identity,hostname,have_cert)
            ok(call(base)=='committed','mutually authenticated TLS channel commits first SQLite receipt')
            ok(call(base)=='duplicate-no-write','TLS retry with identical payload is deduplicated')
            ok(call({**base,'op':'reconcile'})=='receipt-reconciled-no-write',
               'authenticated network receipt reconciliation is read only')
            ok(call({**base,'payloadHex':b'changed'.hex()})=='idempotency-conflict',
               'new event bytes with same idempotency key fail closed')
            ok(call({**base,'op':'reconcile','payloadHex':b'changed'.hex()})=='receipt-not-confirmed',
               'network reconciliation rejects mismatched event bytes')
            ok(call({**base,'run':'run-X','idem':'idem-A'})=='idempotency-conflict',
               'same idempotency key with different run denied')
            ok(call({**base,'run':'run-A','idem':'idem-X','expectedRevision':1})=='run-key-conflict',
               'same run cannot be committed under new idempotency key')
            ok(call({**base,'run':'run-B','idem':'idem-B'})=='cas-stale-revision',
               'network caller with stale CAS revision denied')
            ok(call({**base,'tenant':'tenant-B'})=='cross-tenant-denied',
               'fixture TLS peer cannot claim cross-tenant access')
            ok(call({**base,'thread':'thread-unknown','run':'run-Z','idem':'idem-Z'})=='fixture-acl-denied',
               'fixture TLS peer denied access to unknown thread')
            ok(call(base,identity='other')=='peer-identity-denied',
               'same test CA but unauthorized peer CN denied by service ACL')
            ok(call(base,identity='untrusted')=='tls-rejected-or-connection-failed',
               'untrusted test CA client rejected by mutual TLS')
            ok(call(base,have_cert=False)=='tls-rejected-or-connection-failed',
               'client lacking certificate rejected by mutual TLS')
            ok(call(base,hostname='wrong-host.invalid')=='tls-rejected-or-connection-failed',
               'client rejects server hostname mismatch')
            ok(call({**base,'admin':True})=='untrusted-request-shape',
               'caller cannot inject untrusted privileged request fields')
            ok(call({**base,'payloadHex':''})=='empty-payload-denied',
               'empty event bytes rejected before writing')
            ok(call({**base,'run':'run-B','idem':'idem-B','expectedRevision':1,
                     'injectAckLoss':True})=='connection-closed-without-ack',
               'server intentionally drops response after committed SQLite transaction')
            ok(call({**base,'op':'reconcile','run':'run-B','idem':'idem-B','expectedRevision':1})==
               'receipt-reconciled-no-write','lost acknowledgement reconciles persisted receipt over new TLS connection')
            ok(call({**base,'run':'run-B','idem':'idem-B','expectedRevision':1})=='duplicate-no-write',
               'after acknowledgement loss retry does not write twice')
            ok(call({**base,'op':'reconcile','run':'absent','idem':'absent',
                     'expectedRevision':2})=='receipt-not-confirmed',
               'absent receipt cannot be claimed by TLS caller')
            results:list[str]=[]
            threads:list[Thread]=[]
            def contest(suffix:str)->None:
                results.append(call({**base,'thread':'race-thread','run':'race-'+suffix,
                  'idem':'race-'+suffix,'expectedRevision':0,'payloadHex':suffix.encode().hex()}))
            for suffix in ('left','right'):
                t=Thread(target=contest,args=(suffix,))
                t.start();threads.append(t)
            for t in threads:t.join(10)
            ok(not any(t.is_alive() for t in threads),'independent TLS client connections complete race')
            ok(sorted(results)==['cas-stale-revision','committed'],
               'two TLS clients yield exactly one CAS winner and stale loser')
            with connect(file) as db:
                ok(db.execute("SELECT revision FROM acl WHERE thread='race-thread'").fetchone()[0]==1,
                   'race checkpoint revision advanced exactly once')
                ok(db.execute("SELECT revision FROM acl WHERE thread='thread-A'").fetchone()[0]==2,
                   'lost acknowledgement commit persisted only one additional revision')
                ok(db.execute("SELECT COUNT(*) FROM receipts").fetchone()[0]==3,
                   'exactly three receipts persisted after network negative tests')
                ok(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok',
                   'physical SQLite database integrity check passes')
                db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        finally:
            stop.set();server.join(10)
            if server.is_alive():server.terminate();server.join(5)
        ok(server.exitcode==0,'local loopback TLS server stopped and exited cleanly')
    ok(file.is_file() and file.stat().st_size>0,'durable SQLite fixture outside Git checkout exists')
    print(f'{counter} 2.6Q loopback mutual TLS/SQLite assertions passed',flush=True)

def gate(name:str,cmd:list[str],cwd:Path,out:Path)->None:
    with out.open('w',encoding='utf-8') as stream:
        try:
            proc=subprocess.run(cmd,cwd=cwd,stdout=stream,stderr=subprocess.STDOUT,
                                timeout=240,check=False)
        except subprocess.TimeoutExpired as exc:raise RuntimeError('BLOCKED: '+name+' timeout') from exc
    need(proc.returncode==0,'gate failed: '+name+' at '+str(out))
    print('PASS: '+name+' SHA256 '+digest(out.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    repo=ROOT.resolve();location=out.resolve()
    need(location!=repo and repo not in location.parents,'evidence must stay outside repository')
    need(not out.exists(),'evidence path already exists')
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
         'src/ag-ui/authenticated-transport-readiness.spec.ts','--outDir',str(ssr),
         '--emptyOutDir'],WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    gate('pure.log',['node',str(ssr/'authenticated-transport-readiness.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf-8')
    m=re.search(r'(?m)^(\d+) 2\.6Q selected transport readiness TypeScript assertions passed\s*$',pure)
    need(m is not None and int(m.group(1))==ASSERTIONS,'TS assertion count changed')
    need(pure.count('PASS: ')==ASSERTIONS,'TS PASS count changed')
    for label in CRITICAL:need('PASS: '+label in pure,'missing TS critical marker: '+label)
    gate('fixture.log',[sys.executable,str(ROOT/RUNNER),'--fixture-child',
         '--output-dir',str(out)],ROOT,out/'fixture.log')
    raw=(out/'fixture.log').read_text(encoding='utf-8')
    count=re.search(r'(?m)^(\d+) 2\.6Q loopback mutual TLS/SQLite assertions passed\s*$',raw)
    need(count is not None and int(count.group(1))==FIXTURE_ASSERTIONS,
         'mTLS fixture assertion count changed')
    need(raw.count('PASS: ')==FIXTURE_ASSERTIONS,'mTLS fixture PASS count differs')
    db=out/'transport-proof.sqlite3'
    need(db.is_file() and not db.is_symlink(),'physical SQLite evidence missing')
    preflight(schema)
    loghash={name:digest((out/name).read_bytes()) for name in
            ('lint.log','build.log','compile.log','pure.log','fixture.log')}
    evidence={
      'lab':'2.6Q','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
      'agui_upstream_commit':UPSTREAM,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
      'published_git_blobs':BLOBS,
      'scope':'pure TypeScript readiness contract plus separate loopback mTLS SQLite fixture',
      'typescript_assertions':ASSERTIONS,'fixture_assertions':FIXTURE_ASSERTIONS,
      'critical_cases':len(CRITICAL),'gate_logs_sha256':loghash,
      'sqlite_sha256':digest(db.read_bytes()),
      'sources_sha256':{path:digest((ROOT/path).read_bytes()) for path in (SRC,TEST,RUNNER)},
      'gap_ids_open':['G'+str(i) for i in range(1,10)],
      'adapter_ready':False,'parent_2_6_open':True,
      'external_identity_provider_verified':False,
      'real_authenticated_producer_verified':False,
      'production_network_recovery_verified':False,'security_signoff':False,
      'limits':[
        'Network bound only to 127.0.0.1, with self-issued ephemeral test CA and TLS certificates',
        'Mutual TLS verified only between disposable local peers; no enterprise PKI, SPIFFE, OIDC, or JWKS',
        'Peer CN authorization is a selected fixture rule, not production identity or ACL policy',
        'Client-provided test payload is hashed inside server; producer provenance is not cryptographically proven',
        'Ack loss is intentionally omitted response after COMMIT; no crash/power cut/distributed partition',
        'SQLite local transaction + race do not prove enterprise or multi-node durability',
        'Separate TypeScript callback gate has no TLS or database and does not consume Python fixture trust',
        'All G1-G9 and parent 2.6 OPEN; Agent Server AG-UI adapter BLOCKED',
      ],'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    lines=['# MASL 2.6Q — selected authenticated transport readiness evidence','',
      f'- Baseline: `{HEAD}`',f'- Status: PASS',f'- TypeScript: {ASSERTIONS}/{ASSERTIONS}',
      f'- Loopback mTLS/SQLite: {FIXTURE_ASSERTIONS}/{FIXTURE_ASSERTIONS}',
      f'- Critical TS markers: {len(CRITICAL)}',
      '- G1–G9: OPEN; 2.6: OPEN; adapter: BLOCKED','',
      'Local ephemeral CA/mTLS and SQLite evidence; NO external PKI, production issuer,',
      'authenticated AG-UI producer, live adapter, distributed durability or security sign-off.','',
      '## Gate SHA-256','']
    lines += [f'- {name}: `{hashval}`' for name,hashval in loghash.items()]
    lines += ['',f'- SQLite SHA-256: `{evidence["sqlite_sha256"]}`','',
              'The TypeScript contract and Python network experiment are deliberately separate.','']
    (out/'review.md').write_text('\n'.join(lines),encoding='utf-8')
    for n in ('review.json','review.md','transport-proof.sqlite3'):
        print('EVIDENCE: '+n+' SHA256 '+digest((out/n).read_bytes()),flush=True)
    print('REVIEW STATUS: PASS — selected 2.6Q loopback mTLS/recovery; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)

def main()->None:
    parser=argparse.ArgumentParser()
    actions=parser.add_mutually_exclusive_group(required=True)
    actions.add_argument('--preflight',action='store_true')
    actions.add_argument('--run',action='store_true')
    actions.add_argument('--fixture-child',action='store_true')
    parser.add_argument('--schema',type=Path,default=DEFAULT_SCHEMA)
    parser.add_argument('--output-dir',type=Path)
    args=parser.parse_args()
    if args.preflight:preflight(args.schema)
    elif args.fixture_child:
        need(args.output_dir is not None,'fixture child output dir required')
        fixture_suite(args.output_dir)
    else:
        need(args.output_dir is not None,'run output dir required')
        run(args.schema,args.output_dir)

if __name__=='__main__':
    try:main()
    except (RuntimeError,subprocess.CalledProcessError,TimeoutError) as error:
        print(str(error),file=sys.stderr,flush=True)
        raise SystemExit(1)
