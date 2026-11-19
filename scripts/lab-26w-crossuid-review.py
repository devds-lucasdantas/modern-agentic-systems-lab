#!/usr/bin/env python3
"""MASL 2.6W — scoped cross-UID DAC and owner-mediated Unix RPC fixture.

Requires an explicitly authorized *temporary root helper* ONLY for cross-UID
process launching. All database and socket experiments run in an ephemeral
/tmp directory. No users are created, no persistent ACL is changed, and no
root privileges are granted to the unprivileged owner/client processes.
The root orchestrator CAN override DAC: protection is only against unrelated
unprivileged OS UIDs. Never claim HSM/enterprise ACL, root compromise defense,
consensus, cross-host failover, AG-UI 1.0 conformance or adapter readiness.
"""
from __future__ import annotations
import argparse
from datetime import datetime,timezone
from hashlib import sha1,sha256
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import sqlite3
import stat
import subprocess
import sys
import tarfile
import tempfile
import time

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'apps/web'
HEAD='e005fc7d5a67612124b13cda048fc3f5c8b86d11'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
UPSTREAM='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/cross-uid-storage-mediation.ts'
TEST='apps/web/src/ag-ui/cross-uid-storage-mediation.spec.ts'
RUNNER='scripts/lab-26w-crossuid-review.py'
SRC_SHA='d89ab3f022121bc9d289f9d00fd216576931cfb3b97b50cee122ee7f018d1477'
TEST_SHA='8ace5623aa7722ff536cb7e1981477ea5bb8fe6269724774fed50aca43068a93'
ASSERTIONS=639
PRIOR_ASSERTIONS=72
NEW_ASSERTIONS=34
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'38eef3033b5f4829fe01093e0f30d357ea4c2a75',
 'CURRENT.md':'47dafc17afe388557f3168c5532bdbd9bd3de896',
 'docs/journal/lab-23-ag-ui.md':'715f36e9804c02b521382db3f44db9ccff640189',
 'apps/web/src/ag-ui/storage-isolation-failstop.ts':'7eb7fefbad64d422aaaee92b03cace4d9b5cd0e2',
 'apps/web/src/ag-ui/storage-isolation-failstop.spec.ts':'da62f225b2f25881d1cf131845dda911bc509c6b',
 'scripts/lab-26v-storage-review.py':'08d4e701d9dc739ff3866fe8e21404d62e65c5d3',
 'apps/web/src/ag-ui/mandatory-fencing-promotion.ts':'0373a0b043c38cfb823b57ec9272a60342b8a8d1',
 'apps/web/src/ag-ui/external-fencing-consistency.ts':'cff17393776d5db1320e71b67624af095ab18411',
 'apps/web/src/ag-ui/producer-trust-replicas.ts':'9445ec8eb77c835ef7a09e2e6c830b90b0c24b6c',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
}
CRITICAL=(
 '2.6W published 2.6V through 2.6J chain composes after UID checks',
 '2.6W selected cross UID contract stays pure',
 '2.6W cannot promote local kernel observations into production authorization',
 '2.6W fixture authority reads in expected order',
 '2.6W invalid owner never reaches client',
 '2.6W invalid client never reaches socket trust',
 '2.6W untrusted socket never reaches recovery',
 '2.6W owner fail-stop denies writes',
 '2.6W journal epoch mismatch denied',
 '2.6W all G1-G9 parent milestone OPEN and adapter BLOCKED',
 '2.6W no independent kernel or enterprise security evidence in TS',
 '2.6W restored fixture preserves published 2.6V through 2.6J pure chain',
)
OWNER_UID=61001
CLIENT_UID=61002
OUTSIDER_UID=61003

def need(ok:bool,msg:str)->None:
    if not ok:raise RuntimeError('BLOCKED: '+msg)
def sha(raw:bytes)->str:return sha256(raw).hexdigest()
def blob(raw:bytes)->str:return sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
def git(*args:str,cwd:Path=ROOT)->str:
    return subprocess.check_output(['git',*args],cwd=cwd,stderr=subprocess.STDOUT,text=True).strip()
def schema_gate(path:Path)->None:
    need(path.is_file() and not path.is_symlink(),'frozen schema missing/symlink')
    raw=path.read_bytes()
    need(sha(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,'schema SHA256/Git blob mismatch')
    doc=json.loads(raw)
    need(doc.get('$id')=='https://ag-ui.com/spec/1.0/schema.json' and
         len(doc['$defs']['Event']['oneOf'])==31,'schema union drift')
    print('PASS: frozen AG-UI 1.0 schema SHA256/Git blob; 31 event variants',flush=True)
def preflight(schema:Path)->None:
    need(git('symbolic-ref','--quiet','--short','HEAD')=='main','branch not main')
    need(git('rev-parse','HEAD')==HEAD and git('rev-parse','origin/main')==HEAD,
         'published baseline differs')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked files or index modified')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'untracked scope not exactly three 2.6W files')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop changed')
    for path,pin in BLOBS.items():
        need(git('rev-parse','HEAD:'+path)==pin and git('hash-object',path)==pin,
             'published Git blob differs: '+path)
    for path,pin in ((SRC,SRC_SHA),(TEST,TEST_SHA)):
        target=ROOT/path
        need(target.is_file() and not target.is_symlink() and sha(target.read_bytes())==pin,
             'source integrity differs: '+path)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),
         'runner absent or symlink')
    roadmap=(ROOT/'ROADMAP.md').read_text(encoding='utf8').splitlines()
    need(roadmap.count('- [ ] 2.6 AG-UI')==1 and
         roadmap.count('  - [ ] 2.6W AG-UI cross-UID storage ownership and enforced mediation gates')==1,
         'roadmap parent closed or 2.6W anchor differs')
    schema_gate(schema)
    print('PASS: exact e005fc7 HEAD/origin; ten Git blobs, workshop and three 2.6W files',flush=True)
    print('PASS: read-only preflight; no Git mutations, no Agent Server',flush=True)

# The privileged helper never executes the user's application backend or
# touches any persistent Linux account, ACL or system configuration.
OWNER_CODE=r'''
import os,sys,json,socket,sqlite3,struct
from contextlib import closing
sdir= sys.argv[1];dbdir=sys.argv[2];allowed=int(sys.argv[3]);owner_id=int(sys.argv[4])
assert os.geteuid()==owner_id and os.getegid()==owner_id
sock_path=sdir+'/broker.sock'
try:os.unlink(sock_path)
except FileNotFoundError:pass
listener=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
listener.bind(sock_path)
os.chmod(sock_path,0o660)
listener.listen(8)
def db(path):
 c=sqlite3.connect('file:'+path+'?mode=rw',uri=True,isolation_level=None,timeout=3)
 c.execute('PRAGMA busy_timeout=3000')
 return c
def transact(req):
 op=req.get('op')
 if op=='health':return 'owner-alive'
 if op not in ('commit','reconcile','promote'):return 'operation-denied'
 if op=='promote':
  with closing(db(dbdir+'/authority.sqlite3')) as c:
   c.execute('BEGIN IMMEDIATE')
   leader,epoch=c.execute('SELECT leader,epoch FROM control WHERE id=1').fetchone()
   if leader!='node-A' or epoch!=1:return 'promotion-already-completed'
   with closing(db(dbdir+'/node-A.sqlite3')) as a:
    receipts=a.execute('SELECT run,idem,revision,digest FROM receipts ORDER BY revision').fetchall()
   with closing(db(dbdir+'/node-B.sqlite3')) as b:
    b.execute('BEGIN IMMEDIATE')
    for x in receipts:b.execute('INSERT INTO receipts VALUES(?,?,?,?)',x)
    b.execute('UPDATE state SET revision=?,role=?,epoch=? WHERE id=1',(len(receipts),'leader',2))
    b.execute('COMMIT')
   c.execute("UPDATE control SET leader='node-B',epoch=2,phase='stable' WHERE id=1")
   c.execute('COMMIT')
  return 'promoted-without-distributed-atomicity'
 if set(req)!={'op','node','epoch','run','idem','payloadHex','loseAck'}:
  return 'request-shape-denied'
 if req['node'] not in ('node-A','node-B') or type(req['epoch']) is not int or type(req['loseAck']) is not bool:
  return 'request-shape-denied'
 if any(type(req[x]) is not str or not req[x].isalnum() or len(req[x])>32
        for x in ('run','idem')):return 'request-shape-denied'
 if type(req['payloadHex']) is not str or len(req['payloadHex'])>1024 or len(req['payloadHex'])%2:
  return 'request-shape-denied'
 try:payload=bytes.fromhex(req['payloadHex'])
 except ValueError:return 'request-shape-denied'
 if not payload:return 'empty-payload-denied'
 import hashlib
 digest=hashlib.sha256(payload).hexdigest()
 with closing(db(dbdir+'/authority.sqlite3')) as c:
  c.execute('BEGIN IMMEDIATE')
  leader,epoch=c.execute('SELECT leader,epoch FROM control WHERE id=1').fetchone()
  if (leader,epoch)!=(req['node'],req['epoch']):return 'stale-leader-denied'
  with closing(db(dbdir+'/'+req['node']+'.sqlite3')) as r:
   r.execute('BEGIN IMMEDIATE')
   revision,role,node_epoch=r.execute('SELECT revision,role,epoch FROM state WHERE id=1').fetchone()
   if role!='leader' or node_epoch!=epoch:return 'storage-leader-denied'
   existing=r.execute('SELECT idem,digest FROM receipts WHERE run=?',(req['run'],)).fetchone()
   if op=='reconcile':return 'receipt-reconciled-no-write' if existing==(req['idem'],digest) else 'receipt-not-confirmed'
   if existing:return 'duplicate-no-write' if existing==(req['idem'],digest) else 'run-conflict-denied'
   r.execute('UPDATE state SET revision=revision+1 WHERE id=1')
   r.execute('INSERT INTO receipts VALUES(?,?,?,?)',(req['run'],req['idem'],revision+1,digest))
   r.execute('COMMIT')
   return 'committed'
while True:
 conn,_=listener.accept()
 with conn:
  try:
   creds=conn.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12)
   pid,uid,gid=struct.unpack('3i',creds)
   if uid!=allowed:
    reply='peer-uid-denied'
   else:
    data=b''
    while b'\n' not in data and len(data)<8192:
     chunk=conn.recv(4096)
     if not chunk:break
     data+=chunk
    req=json.loads(data.split(b'\n',1)[0])
    reply=transact(req)
    if reply=='committed' and req.get('loseAck') is True:os._exit(83)
   conn.sendall((reply+'\n').encode())
  except (OSError,ValueError,KeyError,TypeError,sqlite3.Error) as e:
   try:conn.sendall(('error-denied\n').encode())
   except OSError:pass
'''
CLIENT_CODE=r'''
import os,sys,json,socket,sqlite3
sock=sys.argv[1];dbdir=sys.argv[2];command=json.loads(sys.argv[3]);outs={}
outs['uid']=os.geteuid();outs['gid']=os.getegid()
for name,flags in [('read',os.O_RDONLY),('write',os.O_RDWR),('create',os.O_WRONLY|os.O_CREAT)]:
 try:
  fd=os.open(dbdir+'/node-A.sqlite3' if name!='create' else dbdir+'/unwanted.txt',flags,0o600)
  os.close(fd);outs[name]='BYPASS'
 except (PermissionError,FileNotFoundError):outs[name]='denied'
try:
 sqlite3.connect('file:'+dbdir+'/node-A.sqlite3?mode=rw',uri=True).close()
 outs['sqlite']='BYPASS'
except sqlite3.Error:outs['sqlite']='denied'
try:
 with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
  s.settimeout(3);s.connect(sock)
  s.sendall((json.dumps(command,separators=(',',':'))+'\n').encode())
  raw=b''
  while b'\n' not in raw:
   buf=s.recv(1024)
   if not buf:break
   raw+=buf
  outs['rpc']=raw.decode().strip() if raw else 'ack-lost'
except OSError:outs['rpc']='transport-unavailable'
print(json.dumps(outs,sort_keys=True))
'''

def check_exec(uid:int,code:str,*args:str,timeout:int=10)->subprocess.CompletedProcess[str]:
    return subprocess.run(['setpriv','--reuid',str(uid),'--regid',str(uid),
                           '--clear-groups',sys.executable,'-c',code,*args],
                          stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                          text=True,timeout=timeout,check=False)

def uid_fixture(dest:Path)->None:
    need(os.name=='posix' and sys.platform.startswith('linux'),'Linux required')
    need(os.geteuid()==0,'cross-UID fixture requires explicit root via sudo -v')
    need(shutil.which('setpriv') is not None,'setpriv missing')
    for test_uid in (OWNER_UID,CLIENT_UID,OUTSIDER_UID):
        try:pwd.getpwuid(test_uid)
        except KeyError:pass
        else:need(False,'test UID already assigned: '+str(test_uid))
    count=0
    def ok(value:bool,label:str)->None:
        nonlocal count
        need(value,'cross-UID assertion failed: '+label)
        count+=1;print('PASS: '+label,flush=True)
    with tempfile.TemporaryDirectory(prefix='masl-26w-crossuid-') as folder:
        base=Path(folder);base.chmod(0o711)
        data=base/'data';data.mkdir(mode=0o700);os.chown(data,OWNER_UID,OWNER_UID)
        socket_dir=base/'sockets';socket_dir.mkdir(mode=0o711)
        os.chown(socket_dir,OWNER_UID,OWNER_UID)
        dbs=[data/'authority.sqlite3',data/'node-A.sqlite3',data/'node-B.sqlite3']
        with sqlite3.connect(dbs[0]) as db:
            db.executescript("CREATE TABLE control(id INTEGER PRIMARY KEY,leader TEXT,epoch INTEGER,phase TEXT);INSERT INTO control VALUES(1,'node-A',1,'stable');")
        for dbpath,role in [(dbs[1],'leader'),(dbs[2],'standby')]:
            with sqlite3.connect(dbpath) as db:
                db.executescript("CREATE TABLE state(id INTEGER PRIMARY KEY,revision INTEGER,role TEXT,epoch INTEGER);CREATE TABLE receipts(run TEXT PRIMARY KEY,idem TEXT UNIQUE,revision INTEGER,digest TEXT);")
                db.execute('INSERT INTO state VALUES(1,0,?,1)',(role,));db.commit()
        for d in dbs:
            os.chown(d,OWNER_UID,OWNER_UID);d.chmod(0o600)
        sock=socket_dir/'broker.sock'
        owner_proc:subprocess.Popen[str]|None=None
        def launch()->subprocess.Popen[str]:
            if sock.exists() or sock.is_symlink():sock.unlink()
            proc=subprocess.Popen(['setpriv','--reuid',str(OWNER_UID),'--regid',str(OWNER_UID),
                  '--clear-groups',sys.executable,'-c',OWNER_CODE,str(socket_dir),str(data),
                  str(CLIENT_UID),str(OWNER_UID)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            for _ in range(80):
                if sock.exists() and stat.S_ISSOCK(os.lstat(sock).st_mode):
                    os.chown(sock,OWNER_UID,CLIENT_UID);sock.chmod(0o660)
                    try:
                        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as ready_probe:
                            ready_probe.settimeout(.5)
                            ready_probe.connect(str(sock))
                            # root cannot authenticate as the client; this probe
                            # only establishes that listen() has completed.
                            ready_probe.recv(64)
                        return proc
                    except (ConnectionRefusedError,FileNotFoundError,socket.timeout):
                        pass
                if proc.poll() is not None:
                    _,err=proc.communicate(timeout=2);raise RuntimeError('BLOCKED: owner died on startup: '+err[:1000])
                time.sleep(.05)
            proc.terminate();proc.wait(timeout=5)
            raise RuntimeError('BLOCKED: owner socket not ready')
        def probe(uid:int,request:dict)->dict:
            run=check_exec(uid,CLIENT_CODE,str(sock),str(data),json.dumps(request),timeout=10)
            need(run.returncode==0,'client probe failed: '+run.stderr[-1000:])
            return json.loads(run.stdout)
        def payload(run:str,node:str='node-A',epoch:int=1,ack:bool=False,op:str='commit')->dict:
            return {'op':op,'node':node,'epoch':epoch,'run':run,'idem':'idem'+run,
                    'payloadHex':('payload-'+run).encode().hex(),'loseAck':ack}
        try:
            owner_proc=launch()
            ok(owner_proc.poll() is None,'distinct-UID storage owner process alive')
            ok(data.stat().st_uid==OWNER_UID and stat.S_IMODE(data.stat().st_mode)==0o700,
               'SQLite directory owned by owner UID 0700')
            ok(all(p.stat().st_uid==OWNER_UID and p.stat().st_gid==OWNER_UID for p in dbs),
               'three physical SQLite files owned by unprivileged owner UID')
            ok(all(stat.S_IMODE(p.stat().st_mode)==0o600 for p in dbs),
               'all SQLite files have 0600 DAC')
            ok(stat.S_IMODE(socket_dir.stat().st_mode)==0o711,
               'socket traversal directory mode 0711')
            ok(sock.stat().st_uid==OWNER_UID and sock.stat().st_gid==CLIENT_UID and
               stat.S_IMODE(sock.stat().st_mode)==0o660,'socket owner/client-group mode 0660')
            first=probe(CLIENT_UID,{'op':'health'})
            ok((first['uid'],first['gid'])==(CLIENT_UID,CLIENT_UID),
               'authorized client runs with different unprivileged UID')
            ok(all(first[x]=='denied' for x in ('read','write','create','sqlite')),
               'client cannot directly read/write/create/open SQLite through DAC')
            ok(first['rpc']=='owner-alive','authorized different-UID client can use owner RPC')
            other=probe(OUTSIDER_UID,{'op':'health'})
            ok((other['uid'],other['gid'])==(OUTSIDER_UID,OUTSIDER_UID),
               'unrelated client has independent third unprivileged UID')
            ok(other['rpc']=='transport-unavailable',
               'unrelated UID denied socket connect by DAC')
            sock.chmod(0o666)
            other=probe(OUTSIDER_UID,{'op':'health'})
            ok(other['rpc']=='peer-uid-denied',
               'SO_PEERCRED refuses outsider even with permissive socket mode')
            sock.chmod(0o660)
            bad=probe(CLIENT_UID,{'op':'mutate-directly'})
            ok(bad['rpc']=='operation-denied','owner rejects unrecognized RPC operation')
            bad=probe(CLIENT_UID,{'op':'commit','node':'node-A','epoch':1})
            ok(bad['rpc']=='request-shape-denied','owner rejects malformed write RPC')
            good=probe(CLIENT_UID,payload('runA',ack=True))
            ok(good['rpc']=='ack-lost','owner intentionally loses ack after durable COMMIT')
            owner_proc.wait(timeout=6)
            ok(owner_proc.returncode==83,'storage owner really exited after COMMIT')
            missed=probe(CLIENT_UID,{'op':'health'})
            ok(missed['rpc']=='transport-unavailable','dead owner fails closed to client')
            owner_proc=launch()
            ok(owner_proc.poll() is None,'owner restarted under same separate OS identity')
            reconciled=probe(CLIENT_UID,payload('runA',op='reconcile'))
            ok(reconciled['rpc']=='receipt-reconciled-no-write','restart reconciles committed receipt without replay write: '+repr(reconciled))
            dup=probe(CLIENT_UID,payload('runA'))
            ok(dup['rpc']=='duplicate-no-write','duplicate receipt remains idempotent after restart')
            promo=probe(CLIENT_UID,{'op':'promote'})
            ok(promo['rpc']=='promoted-without-distributed-atomicity',
               'owner-mediated promotion documented as non-atomic across files')
            denied=probe(CLIENT_UID,payload('runB'))
            ok(denied['rpc']=='stale-leader-denied','obsolete replica-A writer denied after promotion')
            latest=probe(CLIENT_UID,payload('runB',node='node-B',epoch=2))
            ok(latest['rpc']=='committed','new owner-mediated leader-B accepts selected write')
            outdated=probe(CLIENT_UID,payload('runC',node='node-B',epoch=1))
            ok(outdated['rpc']=='stale-leader-denied','stale epoch on active replica denied')
            for p in dbs:
                with sqlite3.connect(p) as db:
                    ok(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok',
                       'physical SQLite integrity check: '+p.name)
            with sqlite3.connect(dbs[0]) as db:
                ok(db.execute('SELECT leader,epoch,phase FROM control').fetchone()==
                   ('node-B',2,'stable'),'authority ended stable at node-B epoch 2')
            with sqlite3.connect(dbs[1]) as db:
                ok(db.execute('SELECT revision,role,epoch FROM state').fetchone()==
                   (1,'leader',1),'former owner replica remains stale: revision 1 epoch 1')
                ok(db.execute('SELECT count(*) FROM receipts').fetchone()[0]==1,
                   'old replica has one receipt after promotion')
            with sqlite3.connect(dbs[2]) as db:
                ok(db.execute('SELECT revision,role,epoch FROM state').fetchone()==
                   (2,'leader',2),'promoted replica-B reaches revision 2 epoch 2')
                ok(db.execute('SELECT count(*) FROM receipts').fetchone()[0]==2,
                   'new leader has two receipts after owner mediated commit')
            # Never archive WAL sidecars; close owner before read-only DB snapshot.
            owner_proc.terminate();owner_proc.wait(timeout=5)
            for p in dbs:
                with sqlite3.connect(p) as db:db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            proof={
                'lab':'2.6W','owner_uid':OWNER_UID,'owner_gid':OWNER_UID,
                'client_uid':CLIENT_UID,'client_gid':CLIENT_UID,'outsider_uid':OUTSIDER_UID,
                'uid_isolation_observed':True,'unprivileged_client_direct_file_denied':True,
                'SO_PEERCRED_authentication_observed':True,'socket_dac_denial_observed':True,
                'root_bypass_protected':False,'compromised_owner_protected':False,
                'cross_host_atomicity_verified':False,'production_os_policy_verified':False,
                'server_ack_loss_reconciled':True,'root_helper_temp_scope_only':True,
                'uid_accounts_created':False,
            }
            proof_path=base/'proof.json';proof_path.write_text(json.dumps(proof,sort_keys=True)+'\n')
            dest.parent.mkdir(parents=True,exist_ok=True)
            need(not dest.exists() and not dest.is_symlink(),'proof tar already exists')
            with tarfile.open(dest,'w',format=tarfile.USTAR_FORMAT) as tf:
                for p in dbs:
                    tf.add(p,arcname=p.name,recursive=False)
                tf.add(proof_path,arcname='uid-proof.json',recursive=False)
            os.chmod(dest,0o644)
            ok(dest.is_file() and dest.stat().st_size>6000,
               'archive contains three physical SQLite files and scoped proof metadata')
            with tarfile.open(dest) as tf:
                ok([m.name for m in tf.getmembers()]==
                   ['authority.sqlite3','node-A.sqlite3','node-B.sqlite3','uid-proof.json'],
                   'immutable TAR member sequence exact')
        finally:
            if owner_proc is not None and owner_proc.poll() is None:
                owner_proc.terminate()
                try:owner_proc.wait(timeout=5)
                except subprocess.TimeoutExpired:owner_proc.kill();owner_proc.wait(timeout=5)
        print(f'UID_FIXTURE_ASSERTIONS: {count}',flush=True)
        print('UID_PROOF_PATH: '+str(dest),flush=True)
        need(count==NEW_ASSERTIONS,'2.6W new UID check count drift')

# The local Python 2.6V fixture is run as the original unprivileged user;
# only the cross-UID helper requires root for setuid/setgid in temporary dirs.
def prior_fixture(out:Path)->None:
    prior=ROOT/'scripts/lab-26v-storage-review.py'
    spec=importlib.util.spec_from_file_location('masl_prior_26v',prior)
    need(spec is not None and spec.loader is not None,'prior 2.6V module absent')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory(prefix='masl26w-regression-') as folder:
        # Published 2.6V fixture's 72 checks; archive kept only transiently.
        module.fixture(Path(folder))

def fixture(out:Path)->None:
    prior_fixture(out)
    proof=out/'crossuid-proof.tar'
    need(not proof.exists(),'crossuid proof exists')
    if os.geteuid()==0:
        uid_fixture(proof)
    else:
        need(shutil.which('sudo') is not None,'sudo required to execute isolated cross UID root helper')
        cmd=['sudo','-n',sys.executable,str(ROOT/RUNNER),'--uid-fixture-child',
             '--proof-path',str(proof)]
        process=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120)
        print(process.stdout,end='',flush=True)
        need(process.returncode==0,'sudo -n cross UID helper denied/failed; run sudo -v explicitly')
    need(proof.is_file() and not proof.is_symlink(),'cross UID physical proof missing')
    print('CROSS_UID_SCOPE: separate-nonroot-linux-uids; privileged-helper-only-for-setup',flush=True)

def gate(name:str,command:list[str],cwd:Path,path:Path)->None:
    with path.open('wb') as output:
        rc=subprocess.run(command,cwd=cwd,stdout=output,stderr=subprocess.STDOUT,
                          timeout=180,check=False)
    need(rc.returncode==0,'gate failed: '+name+' in '+str(path))
    print('PASS: '+name+' SHA256 '+sha(path.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    need(not out.exists() and not out.is_symlink(),'evidence destination already exists')
    dest=out.expanduser().resolve();root=ROOT.resolve()
    need(dest!=root and root not in dest.parents,'evidence must remain outside repository')
    out.mkdir(parents=True,exist_ok=False)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
         'src/ag-ui/cross-uid-storage-mediation.spec.ts','--outDir',str(ssr),
         '--emptyOutDir'],WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf8')
    gate('pure.log',['node',str(ssr/'cross-uid-storage-mediation.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf8')
    match=re.findall(r'(?m)^ASSERTIONS: (\d+)\s*$',pure)
    need(match and int(match[-1])==ASSERTIONS and pure.count('PASS: ')==ASSERTIONS,
         'TypeScript assertions mismatch')
    for case in CRITICAL:need('PASS: '+case in pure,'critical TS case missing: '+case)
    gate('fixture.log',[sys.executable,str(ROOT/RUNNER),'--fixture-child',
         '--output-dir',str(out)],ROOT,out/'fixture.log')
    fixture_log=(out/'fixture.log').read_text(encoding='utf8')
    match=re.search(r'(?m)^UID_FIXTURE_ASSERTIONS: (\d+)$',fixture_log)
    need(match is not None and int(match.group(1))==NEW_ASSERTIONS,
         'root helper failed cross UID assertion count')
    need(fixture_log.count('PASS: ')==PRIOR_ASSERTIONS+NEW_ASSERTIONS,
         'Python fixture assertion count drift')
    need('CROSS_UID_SCOPE: separate-nonroot-linux-uids' in fixture_log,
         'real UID evidence scope missing')
    proof=out/'crossuid-proof.tar'
    need(proof.is_file() and not proof.is_symlink(),'proof TAR missing')
    preflight(schema)
    logs={name:sha((out/name).read_bytes()) for name in
          ('lint.log','build.log','compile.log','pure.log','fixture.log')}
    report={
      'lab':'2.6W','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
      'agui_upstream_commit':UPSTREAM,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
      'published_git_blobs':BLOBS,'typescript_assertions':ASSERTIONS,
      'fixture_assertions':PRIOR_ASSERTIONS+NEW_ASSERTIONS,
      'previous_fixture_assertions':PRIOR_ASSERTIONS,
      'new_cross_uid_assertions':NEW_ASSERTIONS,'critical_cases':len(CRITICAL),
      'gate_logs_sha256':logs,'crossuid_proof_sha256':sha(proof.read_bytes()),
      'source_sha256':{rel:sha((ROOT/rel).read_bytes()) for rel in (SRC,TEST,RUNNER)},
      'cross_uid_dac_observed':True,'unprivileged_direct_db_denied':True,
      'linux_so_peercred_verified':True,'privileged_root_bypass_prevented':False,
      'compromised_owner_bypass_prevented':False,
      'durable_distributed_promotion_verified':False,
      'production_identity_configured':False,'agui_producer_authenticated':False,
      'parent_2_6_open':True,'gap_ids_open':['G'+str(i) for i in range(1,10)],
      'adapter_ready':False,'enterprise_security_signoff':False,
      'limits':[
        'Real UID separation used three temporary numeric Linux principals and a root helper; no persistent accounts',
        'Linux DAC is enforced for selected unprivileged clients, not root, compromised storage owner or arbitrary namespace escapes',
        'UNIX socket SO_PEERCRED and group modes are local only, not enterprise authenticated network identity',
        'File ACL and runtime permissions are only those of a disposable /tmp fixture',
        'Root helper code is executed with sudo -n; explicitly review script and approve sudo -v',
        'Authority and two replicas on one host with sequential non-atomic promotion, no quorum',
        'No independent normative AG-UI conformance, media/DLP, corporate issuer/ACL or Agent Server adapter',
        'TypeScript observations do not consume actual Linux kernel or SQLite evidence',
        'G1-G9 / parent 2.6 OPEN; adapter BLOCKED',
      ],'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    note=['# MASL 2.6W — scoped cross-UID Linux DAC and owner-mediated SQLite','',
          f'- Baseline `{HEAD}`',f'- TypeScript: {ASSERTIONS}/{ASSERTIONS}',
          f'- Python: {PRIOR_ASSERTIONS+NEW_ASSERTIONS}/{PRIOR_ASSERTIONS+NEW_ASSERTIONS}',
          f'- Critical cases: {len(CRITICAL)}/{len(CRITICAL)}',
          '- All five gates passed. G1-G9 and parent 2.6 OPEN; adapter BLOCKED.','',
          'Root helper temporarily created distinct non-root UIDs for an owner, an authorized',
          'client and an outsider. Real DAC denied direct database access; group-protected',
          'UNIX socket plus SO_PEERCRED admitted only the authorized UID. The root helper',
          'could bypass DAC; compromised owner, privileged processes, operational identity,',
          'replica quorum, distributed atomicity and real Agent Server remain unproven.','',
          '## Evidence hashes','']
    note.extend(f'- {key}: `{value}`' for key,value in logs.items())
    note.append(f'- crossuid-proof.tar: `{report["crossuid_proof_sha256"]}`')
    (out/'review.md').write_text('\n'.join(note)+'\n',encoding='utf8')
    for name in ('review.json','review.md','crossuid-proof.tar'):
        print('EVIDENCE: '+name+' SHA256 '+sha((out/name).read_bytes()),flush=True)
    print('REVIEW STATUS: PASS — 2.6W isolated real Linux cross-UID DAC/socket owner experiment; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)

def main()->None:
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--preflight',action='store_true')
    mode.add_argument('--run',action='store_true')
    mode.add_argument('--fixture-child',action='store_true')
    mode.add_argument('--uid-fixture-child',action='store_true')
    parser.add_argument('--schema',type=Path,default=DEFAULT_SCHEMA)
    parser.add_argument('--output-dir',type=Path)
    parser.add_argument('--proof-path',type=Path)
    args=parser.parse_args()
    if args.preflight:preflight(args.schema)
    elif args.uid_fixture_child:
        need(args.proof_path is not None,'proof path required')
        uid_fixture(args.proof_path)
    else:
        need(args.output_dir is not None,'evidence output directory required')
        if args.fixture_child:fixture(args.output_dir)
        else:run(args.schema,args.output_dir)
if __name__=='__main__':
    try:main()
    except (RuntimeError,OSError,sqlite3.Error,subprocess.CalledProcessError,ValueError,TimeoutError) as err:
        msg=str(err)
        print(msg if msg.startswith('BLOCKED:') else 'BLOCKED: '+msg,file=sys.stderr,flush=True)
        raise SystemExit(2) from None
