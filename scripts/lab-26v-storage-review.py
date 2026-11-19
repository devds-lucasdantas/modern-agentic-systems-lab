#!/usr/bin/env python3
"""MASL 2.6V — pure TypeScript chain + isolated local UNIX-socket owner fixture.

Three files installed only, report and eight immutable audit artifacts outside Git.
The experiment attempts REAL Linux seccomp file-open denial for a voluntarily
confined same-UID client, a separate broker process and direct-unconfined bypass
on a disposable copy. Seccomp may be unavailable on WSL; do not claim it then.
Neither seccomp nor socket mode are mandatory for arbitrary same-UID writers.
Selected crash/restart and pending promotion checks only; NO distributed atomicity,
cross-host durability, trusted enterprise identity or Agent Server adapter.
"""
from __future__ import annotations
import argparse
import ctypes
from datetime import datetime,timezone
from hashlib import sha1,sha256
import importlib.util
import io
import json
import multiprocessing as mp
import os
from pathlib import Path
import re
import socket
import sqlite3
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
from contextlib import closing

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'apps/web'
HEAD='55080d65044fb14da37d8c8f432c377fc3fad0e1'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
UPSTREAM='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/storage-isolation-failstop.ts'
TEST='apps/web/src/ag-ui/storage-isolation-failstop.spec.ts'
RUNNER='scripts/lab-26v-storage-review.py'
SRC_SHA='129f50288e80de013f97f073becc97b6bc94671bcb36287f694c28a9da080f38'
TEST_SHA='e053b19505fed76a5142f456d4b3782e782aede6b0a0a922600c7cd3742b59a6'
ASSERTIONS=487
PRIOR_ASSERTIONS=39
NEW_ASSERTIONS=33
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'d0e9011d0589ff6b46b14f60014449de55ef29bb',
 'CURRENT.md':'96e6aa3a56bef7befbfb770caa7a177b9d939465',
 'docs/journal/lab-23-ag-ui.md':'5267a9946b969b6712a4d777288dd216a7c1c795',
 'apps/web/src/ag-ui/mandatory-fencing-promotion.ts':'0373a0b043c38cfb823b57ec9272a60342b8a8d1',
 'apps/web/src/ag-ui/mandatory-fencing-promotion.spec.ts':'076e9583bc8a4e8a92b7ceb4fe6f8ab17afbc8b6',
 'scripts/lab-26u-mandatory-review.py':'2dc11392cd6f59227a642752eabdde295808ffdc',
 'apps/web/src/ag-ui/external-fencing-consistency.ts':'cff17393776d5db1320e71b67624af095ab18411',
 'apps/web/src/ag-ui/producer-trust-replicas.ts':'9445ec8eb77c835ef7a09e2e6c830b90b0c24b6c',
 'apps/web/src/ag-ui/authenticated-transport-readiness.ts':'706ac518efda3006b24073af32c613418165416d',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
}
CRITICAL=(
 'published 2.6S pure replica chain composes after fencing prechecks',
 'old ticket denied after authority epoch advancement',
 'published 2.6S signed producer receipt reconciliation still composes',
 '2.6U broker-only boundary cannot promote operational readiness',
 'pending or blocked promotion denies new writes',
 '2.6V preserves all G1-G9 and parent milestone OPEN',
 '2.6V no unbypassable OS security or operational claims',
 'storage owner client confinement and fail stop are fixture observations',
 'bad owner cannot reach client callback',
 'bad client cannot read fail-stop fixture',
 'fail-stop crash and recovery deny work',
 'pending journal phase denies work before upstream gate',
 'owner journal and published authority leader epoch must agree',
 '2.6V stable owner preserves published 2.6U through 2.6J pure chain',
)

def need(ok:bool,msg:str)->None:
    if not ok:raise RuntimeError('BLOCKED: '+msg)
def sha(raw:bytes)->str:return sha256(raw).hexdigest()
def blob(raw:bytes)->str:return sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
def git(*args:str,cwd:Path=ROOT)->str:
    return subprocess.check_output(['git',*args],cwd=cwd,stderr=subprocess.STDOUT,text=True).strip()
def schema_gate(path:Path)->None:
    need(path.is_file() and not path.is_symlink(),'official schema missing/symlink')
    raw=path.read_bytes()
    need(sha(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,'official AG-UI 1.0 schema hash drift')
    data=json.loads(raw)
    need(data.get('$id')=='https://ag-ui.com/spec/1.0/schema.json' and
         len(data['$defs']['Event']['oneOf'])==31,'AG-UI event union drift')
    print('PASS: official frozen AG-UI 1.0 schema SHA256/Git blob and 31 events',flush=True)
def preflight(schema:Path)->None:
    need(git('symbolic-ref','--quiet','--short','HEAD')=='main','expected main branch')
    need(git('rev-parse','HEAD')==HEAD and git('rev-parse','origin/main')==HEAD,
         'published 2.6U baseline diverged')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked or staged files changed')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'untracked scope must be exactly 3 files')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop differs')
    for rel,pin in BLOBS.items():
        need(git('rev-parse','HEAD:'+rel)==pin and git('hash-object',rel)==pin,
             'published Git blob mismatch: '+rel)
    for rel,pin in ((SRC,SRC_SHA),(TEST,TEST_SHA)):
        f=ROOT/rel
        need(f.is_file() and not f.is_symlink() and sha(f.read_bytes())==pin,
             'new payload hash differs: '+rel)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),'runner missing/symlink')
    r=(ROOT/'ROADMAP.md').read_text(encoding='utf8').splitlines()
    need(r.count('- [ ] 2.6 AG-UI')==1 and
         r.count('  - [ ] 2.6V AG-UI storage-isolation and fail-stop writer enforcement gates')==1,
         'parent milestone or pending 2.6V roadmap anchor differs')
    schema_gate(schema)
    print('PASS: exact 55080d6 HEAD/origin, ten Git blobs, workshop and three 2.6V files',flush=True)
    print('PASS: read-only preflight; no external network, Git write or Agent Server',flush=True)

# The controlled owner only accepts local fixture RPC. No enterprise authentication.
AUTH_SQL='''CREATE TABLE control(id INTEGER PRIMARY KEY CHECK(id=1),leader TEXT NOT NULL,
  epoch INTEGER NOT NULL,phase TEXT NOT NULL,op TEXT NOT NULL);
INSERT INTO control VALUES(1,'node-A',1,'stable','genesis');'''
REPLICA_SQL='''CREATE TABLE state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,
  role TEXT NOT NULL,epoch INTEGER NOT NULL);
CREATE TABLE receipts(run TEXT PRIMARY KEY,idem TEXT UNIQUE NOT NULL,revision INTEGER NOT NULL,
  digest TEXT NOT NULL);'''

def db_open(path:Path)->sqlite3.Connection:
    # URI mode=rw avoids silently creating an authority database during outage.
    c=sqlite3.connect(path.as_uri()+'?mode=rw',uri=True,timeout=5,isolation_level=None)
    c.execute('PRAGMA busy_timeout=5000')
    c.execute('PRAGMA synchronous=FULL')
    return c

def initialize(base:Path)->tuple[Path,Path,Path]:
    base.mkdir(mode=0o700,parents=True)
    os.chmod(base,0o700)
    auth=base/'authority.sqlite3';a=base/'node-A.sqlite3';b=base/'node-B.sqlite3'
    with closing(sqlite3.connect(auth)) as c:c.executescript(AUTH_SQL)
    for name,path,role in [('A',a,'leader'),('B',b,'standby')]:
        with closing(sqlite3.connect(path)) as c:
            c.executescript(REPLICA_SQL)
            c.execute('INSERT INTO state VALUES(1,0,?,1)',(role,))
            c.commit()
    for path in (auth,a,b):os.chmod(path,0o600)
    return auth,a,b

def status(auth:Path)->tuple:
    with closing(db_open(auth)) as c:
        return c.execute('SELECT leader,epoch,phase,op FROM control WHERE id=1').fetchone()
def state(path:Path)->tuple:
    with closing(db_open(path)) as c:
        return (c.execute('SELECT revision,role,epoch FROM state WHERE id=1').fetchone(),
                c.execute('SELECT run,idem,revision,digest FROM receipts ORDER BY revision').fetchall())

def broker_txn(auth:Path,storage:Path,req:object)->str:
    if not isinstance(req,dict) or set(req) not in (
        {'op'}, {'op','node','epoch','run','idem','payloadHex','loseAck'}):
        return 'untrusted-rpc-shape'
    op=req['op']
    if op=='health':return 'owner-alive'
    if op not in ('commit','reconcile'):return 'untrusted-rpc-op'
    if any(type(req.get(k)) is not str or not re.fullmatch(r'[A-Za-z0-9._:-]{1,64}',req[k])
           for k in ('node','run','idem')) or req['node'] not in ('node-A','node-B') or \
       type(req['epoch']) is not int or not 1<=req['epoch']<=64 or \
       type(req.get('loseAck')) is not bool or type(req.get('payloadHex')) is not str or \
       len(req['payloadHex'])>4096 or len(req['payloadHex'])%2:
        return 'untrusted-rpc-shape'
    try:payload=bytes.fromhex(req['payloadHex'])
    except ValueError:return 'untrusted-rpc-shape'
    if not payload:return 'empty-payload-denied'
    digest=sha(payload)
    try:
        with closing(db_open(auth)) as control:
            control.execute('BEGIN IMMEDIATE')
            try:
                leader,epoch,phase,_=control.execute('SELECT leader,epoch,phase,op FROM control WHERE id=1').fetchone()
                if phase!='stable':return 'promotion-pending-fail-closed'
                if (leader,epoch)!=(req['node'],req['epoch']):return 'stale-owner-fenced'
                with closing(db_open(storage)) as db:
                    db.execute('BEGIN IMMEDIATE')
                    try:
                        rev,role,node_epoch=db.execute('SELECT revision,role,epoch FROM state WHERE id=1').fetchone()
                        if role!='leader' or node_epoch!=epoch:return 'replica-role-stale'
                        existing=db.execute('SELECT idem,revision,digest FROM receipts WHERE run=?',(req['run'],)).fetchone()
                        if op=='reconcile':
                            return 'receipt-reconciled-no-write' if existing and existing[0]==req['idem'] and existing[2]==digest else 'receipt-not-confirmed'
                        if existing is not None:return 'duplicate-no-write' if existing[0]==req['idem'] and existing[2]==digest else 'run-conflict-denied'
                        if db.execute('SELECT 1 FROM receipts WHERE idem=?',(req['idem'],)).fetchone():return 'idem-conflict-denied'
                        db.execute('UPDATE state SET revision=revision+1 WHERE id=1')
                        db.execute('INSERT INTO receipts VALUES(?,?,?,?)',(req['run'],req['idem'],rev+1,digest))
                        db.execute('COMMIT')
                        return 'committed'
                    finally:
                        if db.in_transaction:db.execute('ROLLBACK')
            finally:
                if control.in_transaction:control.execute('ROLLBACK')
    except (sqlite3.OperationalError,sqlite3.DatabaseError,FileNotFoundError):
        return 'storage-or-authority-unavailable-fail-closed'

def owner(sockpath:str,authpath:str,apath:str,bpath:str,ready:object)->None:
    sock=Path(sockpath)
    try:
        if sock.exists() or sock.is_symlink():
            need(sock.is_socket(),'stale broker path not a socket')
            sock.unlink()
        listener=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        listener.bind(str(sock));os.chmod(sock,0o600)
        listener.listen(8);listener.settimeout(.25)
        ready.put(('ready',os.getpid()))
        while True:
            try:conn,_=listener.accept()
            except socket.timeout:continue
            with conn:
                conn.settimeout(5)
                data=b''
                while b'\n' not in data and len(data)<8192:
                    block=conn.recv(4096)
                    if not block:break
                    data+=block
                try:
                    req=json.loads(data.split(b'\n',1)[0].decode('utf8'))
                    # No authentication beyond local same UID filesystem permissions.
                    dest=Path(apath if isinstance(req,dict) and req.get('node')=='node-A' else bpath)
                    reply=broker_txn(Path(authpath),dest,req)
                    if reply=='committed' and req.get('loseAck') is True:os._exit(81)
                except (ValueError,UnicodeDecodeError,TypeError,KeyError):reply='invalid-rpc-json'
                conn.sendall((reply+'\n').encode())
    except BaseException as e:
        ready.put(('error',str(e)))
        raise

def rpc(path:Path,message:dict)->str:
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as conn:
        conn.settimeout(5)
        conn.connect(str(path))
        conn.sendall(json.dumps(message,separators=(',',':')).encode()+b'\n')
        chunks=b''
        while b'\n' not in chunks:
            part=conn.recv(2048)
            if not part:break
            chunks+=part
        return chunks.decode('utf8').strip() if chunks else 'connection-closed-without-ack'

# BPF x86_64 deny open/openat/openat2 and path-based direct file alterations.
# This is VOLUNTARY PER-PROCESS confinement, never an OS-wide UID/ACL policy.
class _Filter(ctypes.Structure):
    _fields_=[('code',ctypes.c_ushort),('jt',ctypes.c_ubyte),
              ('jf',ctypes.c_ubyte),('k',ctypes.c_uint32)]
class _Prog(ctypes.Structure):
    _fields_=[('len',ctypes.c_ushort),('filter',ctypes.POINTER(_Filter))]

def restrict_client()->tuple[bool,int]:
    if os.uname().machine!='x86_64':return False,0
    libc=ctypes.CDLL(None,use_errno=True)
    # x86_64 syscall IDs; syscall number loaded from seccomp_data offset 0.
    forbidden=(2,76,77,82,85,86,87,257,258,259,260,262,263,264,265,266,316,437)
    rules=[_Filter(0x20,0,0,4),_Filter(0x15,1,0,0xC000003E),
           _Filter(0x06,0,0,0x80000000),_Filter(0x20,0,0,0)]
    for number in forbidden:
        rules.extend((_Filter(0x15,0,1,number),_Filter(0x06,0,0,0x00050001)))
    rules.append(_Filter(0x06,0,0,0x7FFF0000))
    arr=(_Filter*len(rules))(*rules);prog=_Prog(len(rules),arr)
    if libc.prctl(38,1,0,0,0)!=0:return False,ctypes.get_errno()
    if libc.prctl(22,2,ctypes.byref(prog),0,0)!=0:return False,ctypes.get_errno()
    return True,0

def constrained_probe(sockpath:str,dbpath:str,q:object)->None:
    available,err=restrict_client()
    if not available:
        q.put(('unavailable',err,False,False));return
    try:
        with closing(sqlite3.connect(Path(dbpath).as_uri()+'?mode=rw',uri=True)) as c:
            c.execute('UPDATE state SET revision=999 WHERE id=1');c.commit()
        denied=False
    except (PermissionError,sqlite3.OperationalError):denied=True
    # Unix-domain RPC allowed despite file-open denial on same confined process.
    try:allowed=rpc(Path(sockpath),{'op':'health'})=='owner-alive'
    except OSError:allowed=False
    q.put(('seccomp-active',err,denied,allowed))

def start_owner(ctx:mp.context.BaseContext,sock:Path,auth:Path,a:Path,b:Path)->mp.Process:
    ready=ctx.Queue()
    p=ctx.Process(target=owner,args=(str(sock),str(auth),str(a),str(b),ready))
    p.start()
    status_value=ready.get(timeout=10)
    need(status_value[0]=='ready' and p.is_alive(),'storage owner could not start: '+str(status_value))
    return p

def stop_owner(p:mp.Process)->None:
    if p.is_alive():p.terminate()
    p.join(10)
    need(not p.is_alive(),'storage owner did not stop')

def request(run:str='run-A',loss:bool=False,node:str='node-A',epoch:int=1,op:str='commit')->dict:
    return {'op':op,'node':node,'epoch':epoch,'run':run,'idem':'idem-'+run,
            'payloadHex':('payload-'+run).encode().hex(),'loseAck':loss}

def prepare_crash(auth:Path)->None:
    with closing(db_open(auth)) as c:
        c.execute('BEGIN IMMEDIATE')
        c.execute("UPDATE control SET phase='prepared',op='promotion-to-B' WHERE id=1")
        c.execute('COMMIT')
    os._exit(82)

def recover(auth:Path,a:Path,b:Path)->str:
    # Explicit multi-file state machine: not a cross-store atomic transaction.
    try:
        with closing(db_open(auth)) as c:
            c.execute('BEGIN IMMEDIATE')
            try:
                lead,epoch,phase,op=c.execute('SELECT leader,epoch,phase,op FROM control WHERE id=1').fetchone()
                if (lead,epoch,phase,op)==('node-B',2,'stable','promotion-to-B'):
                    return 'already-reconciled'
                if (lead,epoch,phase,op)!=('node-A',1,'prepared','promotion-to-B'):
                    return 'unknown-promotion-state-fail-closed'
                ((rev_a,role_a,epoch_a),receipts_a)=state(a)
                ((rev_b,role_b,epoch_b),receipts_b)=state(b)
                if (role_a,epoch_a)!=( 'leader',1) or \
                   (role_b,epoch_b) not in (('standby',1),('leader',2)) or \
                   rev_b>rev_a or receipts_b!=receipts_a[:len(receipts_b)]:
                    return 'replica-divergence-fail-closed'
                with closing(db_open(b)) as copy:
                    copy.execute('BEGIN IMMEDIATE')
                    try:
                        if (role_b,epoch_b)==('standby',1):
                            for row in receipts_a[len(receipts_b):]:
                                copy.execute('INSERT INTO receipts VALUES(?,?,?,?)',row)
                            copy.execute('UPDATE state SET revision=?,role=?,epoch=? WHERE id=1',
                                         (rev_a,'leader',2))
                            copy.execute('COMMIT')
                    finally:
                        if copy.in_transaction:copy.execute('ROLLBACK')
                c.execute("UPDATE control SET leader='node-B',epoch=2,phase='stable' WHERE id=1")
                c.execute('COMMIT')
                return 'promotion-recovered'
            finally:
                if c.in_transaction:c.execute('ROLLBACK')
    except sqlite3.Error:return 'recovery-storage-unavailable-fail-closed'

def archive(databases:tuple[Path,Path,Path],path:Path)->None:
    with tarfile.open(path,'w',format=tarfile.PAX_FORMAT) as tf:
        for file,name in zip(databases,('authority.sqlite3','node-A.sqlite3','node-B.sqlite3')):
            with closing(db_open(file)) as c:
                need(c.execute('PRAGMA integrity_check').fetchone()[0]=='ok','SQLite corruption')
                need(c.execute('PRAGMA journal_mode').fetchone()[0]=='delete','unexpected WAL archive')
            info=tarfile.TarInfo(name);raw=file.read_bytes()
            info.size=len(raw);info.mode=0o600;info.mtime=0
            tf.addfile(info,io.BytesIO(raw))

def fixture(out:Path)->None:
    prev_path=ROOT/'scripts/lab-26u-mandatory-review.py'
    spec=importlib.util.spec_from_file_location('masl_pinned_26u',prev_path)
    need(spec is not None and spec.loader is not None,'published 2.6U fixture missing')
    prev=importlib.util.module_from_spec(spec);spec.loader.exec_module(prev)
    count=0
    def ok(value:bool,label:str)->None:
        nonlocal count
        need(value,label);count+=1;print('PASS: '+label,flush=True)
    with tempfile.TemporaryDirectory(prefix='masl-26v-') as directory:
        root=Path(directory);old=root/'prior';old.mkdir()
        prev.fixture_suite(old)  # 39 published local SQLite/RS256/crash regressions.
        base=root/'owner';auth,a,b=initialize(base);sock=base/'owner.sock'
        ctx=mp.get_context('fork')
        p=start_owner(ctx,sock,auth,a,b)
        try:
            ok(stat.S_IMODE(base.stat().st_mode)==0o700 and
               all(stat.S_IMODE(x.stat().st_mode)==0o600 for x in (auth,a,b,sock)),
               'storage owner directory, SQLite files and socket use restrictive DAC modes')
            ok(rpc(sock,{'op':'health'})=='owner-alive','independent owner process serves UNIX socket RPC')
            ok(p.pid!=os.getpid(),'broker owner is a separate OS process')
            check_q=ctx.Queue()
            child=ctx.Process(target=constrained_probe,args=(str(sock),str(a),check_q))
            child.start();child.join(10)
            need(not child.is_alive(),'constrained probe timed out')
            row=check_q.get(timeout=5)
            ok(child.exitcode==0,'seccomp probe completed without crashing')
            confinement=row[0]=='seccomp-active'
            if confinement:
                ok(row[2] is True,'kernel seccomp denied direct SQLite file open for confined client')
                ok(row[3] is True,'same confined client retained UNIX socket RPC access')
            else:
                ok(row[0]=='unavailable','seccomp unsupported is recorded, not promoted as OS enforcement')
                ok(row[2] is False,'no OS denial is claimed without installed seccomp')
            ok(rpc(sock,request())=='committed','owner broker accepted one selected durable receipt')
            ok(state(a)[0][0]==1 and len(state(a)[1])==1,'local owner storage revision is durable')
            ok(rpc(sock,request())=='duplicate-no-write','idempotent replay cannot advance revision')
            ok(rpc(sock,request(op='reconcile'))=='receipt-reconciled-no-write',
               'read-only RPC reconciles committed receipt')
            ok(rpc(sock,request(run='run-B',loss=True))=='connection-closed-without-ack',
               'broker process lost acknowledgment after selected SQLite COMMIT')
            p.join(10)
            ok(p.exitcode==81,'real owner process terminated after commit')
            ok(state(a)[0][0]==2 and len(state(a)[1])==2,'receipt survived broker process termination')
            p=start_owner(ctx,sock,auth,a,b)
            ok(rpc(sock,request(run='run-B',op='reconcile'))=='receipt-reconciled-no-write',
               'restarted storage owner reconciles without duplicate write')
            ok(state(a)[0][0]==2,'owner restart does not duplicate durable commit')
            ok(rpc(sock,request(node='node-B',epoch=2,run='bad-leader'))=='stale-owner-fenced',
               'unpromoted standby cannot write via owner API')
            ok(rpc(sock,{'op':'commit','admin':True})=='untrusted-rpc-shape',
               'caller-provided administrative claims rejected')
            # Explicit negative on a disposable copy: another same-UID process
            # without sandbox may write the file; no mandatory UID/ACL isolation.
            disposable=root/'unsafe.sqlite3'
            with closing(db_open(a)) as src,closing(sqlite3.connect(disposable)) as cp:src.backup(cp)
            with closing(db_open(disposable)) as other:
                other.execute('UPDATE state SET revision=777 WHERE id=1')
            ok(state(disposable)[0][0]==777,
               'UNSANDBOXED same-UID process bypasses discretionary modes and broker')
            ok(state(a)[0][0]==2 and state(b)[0][0]==0,
               'negative bypass only changes disposable unarchived copy')
            # Real crash after journal PREPARED; pending promotion fails closed.
            task=ctx.Process(target=prepare_crash,args=(auth,));task.start();task.join(10)
            ok(task.exitcode==82,'real process terminated immediately after durable PREPARED journal')
            ok(status(auth)[2]=='prepared','prepared intent survives a crashed process')
            ok(rpc(sock,request(run='run-C'))=='promotion-pending-fail-closed',
               'owner blocks commits while durable promotion remains pending')
            ok(recover(auth,a,b)=='promotion-recovered',
               'restart recovery verifies receipt prefix and completes selected promotion')
            ok(status(auth)==('node-B',2,'stable','promotion-to-B'),
               'durable authority epoch 2 publishes standby after reconciliation')
            ok(state(b)[0]==(2,'leader',2) and state(b)[1]==state(a)[1],
               'new leader has matching two receipts and revision')
            ok(rpc(sock,request(run='run-C'))=='stale-owner-fenced',
               'old leader cannot write through owner RPC after promotion')
            ok(rpc(sock,request(run='run-C',node='node-B',epoch=2))=='committed',
               'promoted leader accepts selected commit through broker')
            ok(state(b)[0][0]==3 and state(a)[0][0]==2,
               'replicas are not incorrectly described as synchronized after new write')
            ok(recover(auth,a,b)=='already-reconciled',
               'recovery is idempotent in stable committed state')
            # Invalid journal and divergent replica reject promotion; separate copies.
            negative=root/'negative';na,aa,bb=initialize(negative)
            with closing(db_open(na)) as c:
                c.execute("UPDATE control SET phase='unknown',op='promotion-to-B' WHERE id=1")
            ok(recover(na,aa,bb)=='unknown-promotion-state-fail-closed',
               'unknown durable journal phase cannot promote')
            with closing(db_open(na)) as c:
                c.execute("UPDATE control SET phase='prepared' WHERE id=1")
            with closing(db_open(bb)) as c:
                c.execute('UPDATE state SET revision=99 WHERE id=1')
            ok(recover(na,aa,bb)=='replica-divergence-fail-closed',
               'divergent standby checkpoint blocks promotion')
            # Archived proof is built with no WAL and no contamination from negatives.
            archive((auth,a,b),out/'storage-isolation-proof.tar')
            ok((out/'storage-isolation-proof.tar').stat().st_size>4096,
               'three physical SQLite snapshots archived without WAL')
            with tarfile.open(out/'storage-isolation-proof.tar','r') as tf:
                ok([m.name for m in tf.getmembers()]==
                   ['authority.sqlite3','node-A.sqlite3','node-B.sqlite3'],
                   'TAR has exactly authority and two independent replica files')
            # A plain JSON evidence note is embedded in report, no extra artifact.
            print('KERNEL_SECCOMP_AVAILABLE: '+str(confinement).lower(),flush=True)
        finally:stop_owner(p)
    print(f'{count} 2.6V owner/socket/OS-process fixture assertions passed',flush=True)
    need(count==NEW_ASSERTIONS,'2.6V new fixture assertion count drift')

def gate(name:str,command:list[str],cwd:Path,path:Path)->None:
    with path.open('wb') as stream:
        rc=subprocess.run(command,cwd=cwd,stdout=stream,stderr=subprocess.STDOUT,
                          check=False,timeout=180)
    need(rc.returncode==0,'gate failed: '+name+' at '+str(path))
    print('PASS: '+name+' SHA256 '+sha(path.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    need(not out.exists() and not out.is_symlink(),'evidence directory exists')
    dest=out.resolve();root=ROOT.resolve()
    need(dest!=root and root not in dest.parents,'evidence must be outside Git')
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
         'src/ag-ui/storage-isolation-failstop.spec.ts','--outDir',str(ssr),
         '--emptyOutDir'],WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf8')
    gate('pure.log',['node',str(ssr/'storage-isolation-failstop.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf8')
    m=re.search(r'(?m)^ASSERTIONS: (\d+)\s*$',pure)
    need(m is not None and int(m.group(1))==ASSERTIONS and pure.count('PASS: ')==ASSERTIONS,
         'TypeScript assertion count drift')
    for label in CRITICAL:need('PASS: '+label in pure,'missing critical label: '+label)
    gate('fixture.log',[sys.executable,str(ROOT/RUNNER),'--fixture-child',
         '--output-dir',str(out)],ROOT,out/'fixture.log')
    fixture_log=(out/'fixture.log').read_text(encoding='utf8')
    m=re.search(r'(?m)^(\d+) 2\.6V owner/socket/OS-process fixture assertions passed\s*$',fixture_log)
    need(m is not None and int(m.group(1))==NEW_ASSERTIONS and
         fixture_log.count('PASS: ')==NEW_ASSERTIONS+PRIOR_ASSERTIONS,
         '2.6V fixture count drift (includes published 2.6U regressions)')
    archive_path=out/'storage-isolation-proof.tar'
    need(archive_path.is_file() and not archive_path.is_symlink(),'proof TAR missing')
    preflight(schema)
    logs={name:sha((out/name).read_bytes()) for name in
          ('lint.log','build.log','compile.log','pure.log','fixture.log')}
    report={
      'lab':'2.6V','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
      'agui_upstream_commit':UPSTREAM,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
      'published_git_blobs':BLOBS,'typescript_assertions':ASSERTIONS,
      'fixture_assertions':NEW_ASSERTIONS+PRIOR_ASSERTIONS,'new_fixture_assertions':NEW_ASSERTIONS,
      'published_fixture_assertions':PRIOR_ASSERTIONS,'critical_cases':len(CRITICAL),
      'gate_logs_sha256':logs,'storage_isolation_archive_sha256':sha(archive_path.read_bytes()),
      'sources_sha256':{p:sha((ROOT/p).read_bytes()) for p in (SRC,TEST,RUNNER)},
      'kernel_seccomp_available':re.search(r'(?m)^KERNEL_SECCOMP_AVAILABLE: true$',fixture_log) is not None,
      'voluntary_seccomp_file_open_denial_observed':re.search(r'(?m)^KERNEL_SECCOMP_AVAILABLE: true$',fixture_log) is not None,
      'gap_ids_open':['G'+str(i) for i in range(1,10)],'parent_2_6_open':True,
      'adapter_ready':False,'mandatory_uid_isolation_verified':False,
      'unconfined_same_uid_writer_blocked':False,'external_os_identity_authority_verified':False,
      'cross_store_atomic_promotion_verified':False,'distributed_fencing_verified':False,
      'real_agui_producer_authenticated':False,'enterprise_security_signoff':False,
      'limits':[
         'Kernel seccomp is voluntarily installed only in a sandboxed fixture client and may not be available on WSL',
         'Local owner UNIX socket is accessible to same-UID callers, no authenticated independent OS identity',
         'An unsandboxed same-UID process can directly write a disposable copy of the SQLite file',
         'File permissions 0700/0600 do not protect against malicious processes sharing the owner UID',
         'One host, local separate authority and two replica databases; no cross-host consensus or quorum',
         'Selected broker process loss and prepared-promotion crash are not arbitrary crash atomicity',
         'The TypeScript fixture observations do not consume real seccomp or SQLite evidence',
         'Independent normative AG-UI 1.0, production issuer/ACL, media/DLP and Agent Server integration unverified',
         'All G1-G9 and milestone 2.6 OPEN; adapter BLOCKED',
      ],'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    note=['# MASL 2.6V — scoped local UNIX owner and voluntary seccomp process confinement','',
          f'- Baseline `{HEAD}`',f'- TypeScript assertions: {ASSERTIONS}/{ASSERTIONS}',
          f'- Python fixture assertions: {NEW_ASSERTIONS+PRIOR_ASSERTIONS}/{NEW_ASSERTIONS+PRIOR_ASSERTIONS}',
          f'- New owner/socket fixture: {NEW_ASSERTIONS}; 2.6U regression: {PRIOR_ASSERTIONS}',
          f'- Kernel seccomp available: {report["kernel_seccomp_available"]}',
          f'- Critical TS markers: {len(CRITICAL)}/{len(CRITICAL)}',
          '- Five gates passed. G1-G9 and parent 2.6 OPEN, adapter BLOCKED.','',
          'The same-UID unsandboxed writer bypass is explicitly reproduced. File modes are not',
          'a separate OS identity. No universal enforcement, distributed leader authority,',
          'cross-store atomicity or operational Agent Server was demonstrated.','',
          '## Evidence SHA-256','']
    note.extend(f'- {k}: `{v}`' for k,v in logs.items())
    note.append(f'- storage-isolation-proof.tar: `{report["storage_isolation_archive_sha256"]}`')
    (out/'review.md').write_text('\n'.join(note)+'\n',encoding='utf8')
    for name in ('review.json','review.md','storage-isolation-proof.tar'):
        print('EVIDENCE: '+name+' SHA256 '+sha((out/name).read_bytes()),flush=True)
    print('REVIEW STATUS: PASS — isolated same-UID broker/socket/seccomp fixture; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)

def main()->None:
    parser=argparse.ArgumentParser(description=__doc__)
    exclusive=parser.add_mutually_exclusive_group(required=True)
    exclusive.add_argument('--preflight',action='store_true')
    exclusive.add_argument('--run',action='store_true')
    exclusive.add_argument('--fixture-child',action='store_true')
    parser.add_argument('--schema',type=Path,default=DEFAULT_SCHEMA)
    parser.add_argument('--output-dir',type=Path)
    args=parser.parse_args()
    if args.preflight:preflight(args.schema)
    else:
        need(args.output_dir is not None,'--output-dir required')
        if args.fixture_child:fixture(args.output_dir)
        else:run(args.schema,args.output_dir)
if __name__=='__main__':
    try:main()
    except (RuntimeError,subprocess.CalledProcessError,TimeoutError,ValueError,OSError,sqlite3.Error) as ex:
        msg=str(ex)
        print(msg if msg.startswith('BLOCKED:') else 'BLOCKED: '+msg,file=sys.stderr,flush=True)
        raise SystemExit(1) from None
