#!/usr/bin/env python3
"""MASL 2.6Y — candidate service policy and real hostile-client kernel fixture.

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
HEAD='78ef011c22cde2b1fa7bc93516ea46aac42c1357'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
UPSTREAM='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/deployable-service-hostile-clients.ts'
TEST='apps/web/src/ag-ui/deployable-service-hostile-clients.spec.ts'
RUNNER='scripts/lab-26y-service-review.py'
SRC_SHA='042b02b9e6b85a51fbf83fa0db25462e8b6577eb15b7f4a65a758cbc074e1298'
TEST_SHA='d650d1b8299d63673685db197497b996d8e857829a8b12be08a27b31633ef1d9'
ASSERTIONS=1169
PRIOR_ASSERTIONS=149
NEW_ASSERTIONS=76
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'3aed33da8c1758b8a60eb93b896a63cc63e52b35',
 'CURRENT.md':'7e5fa03faca09a0ef132824f87b368d8c8251cf4',
 'docs/journal/lab-23-ag-ui.md':'ba37b12194d9ca92adc6d1aa7443a25a0064f72d',
 'apps/web/src/ag-ui/cross-uid-runtime-hardening.ts':'b53c3100ba957bf029e273c276e97b408f84a985',
 'apps/web/src/ag-ui/cross-uid-runtime-hardening.spec.ts':'ff8fc624b003de4110420477f6897b859c63067f',
 'scripts/lab-26x-runtime-review.py':'06cc835814f3c0bfb3e1304b35928abd1e8f6d68',
 'apps/web/src/ag-ui/cross-uid-storage-mediation.ts':'af4af1897cf84a823bd0ec5e156136518fede612',
 'apps/web/src/ag-ui/storage-isolation-failstop.ts':'7eb7fefbad64d422aaaee92b03cace4d9b5cd0e2',
 'apps/web/src/ag-ui/mandatory-fencing-promotion.ts':'0373a0b043c38cfb823b57ec9272a60342b8a8d1',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
}

CRITICAL=(
 '2.6Y invalid request fails before any external callbacks',
 '2.6Y invalid request denied before reading fixtures',
 '2.6Y unlisted request property denied',
 '2.6Y policy extra property denied',
 '2.6Y invalid policy never reads hostile-client fixture',
 '2.6Y hostile probe unrecognized property denied',
 '2.6Y invalid hostile probe never reads recovery',
 '2.6Y recovery extra field denied',
 '2.6Y valid 2.6Y fixture probes delegate to published 2.6X',
 '2.6Y G1-G9 and parent 2.6 OPEN; adapter BLOCKED',
 '2.6Y service policy is only a reviewed candidate, not installed',
 '2.6Y a selected local fixture does not make operational authorization trusted',
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
         'published 2.6X baseline differs')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked files or index modified')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'untracked scope not exactly three 2.6Y files')
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
         roadmap.count('  - [ ] 2.6Y AG-UI deployable service policy and hostile-client isolation gates')==1,
         'roadmap parent closed or 2.6Y anchor differs')
    schema_gate(schema)
    print('PASS: exact 78ef011 HEAD/origin; ten Git blobs, workshop and three 2.6Y files',flush=True)
    print('PASS: read-only preflight; no Git mutations, no Agent Server',flush=True)

# The temporary root orchestrator does not run application code as root.
# setpriv starts all storage owners and clients as separate non-root UIDs.
# kernel-only checks are independent of the untrusted TypeScript callbacks.
OWNER_CODE=r'''
import ctypes,hashlib,json,os,resource,socket,sqlite3,struct,sys
from contextlib import closing
owner=int(sys.argv[1]);client=int(sys.argv[2]);data=sys.argv[3];sockdir=sys.argv[4]
assert os.geteuid()==owner and os.getegid()==owner and os.getgroups()==[]
libc=ctypes.CDLL(None,use_errno=True)
assert libc.prctl(38,1,0,0,0)==0  # PR_SET_NO_NEW_PRIVS
assert libc.prctl(4,0,0,0,0)==0   # PR_SET_DUMPABLE
resource.setrlimit(resource.RLIMIT_CORE,(0,0))
resource.setrlimit(resource.RLIMIT_NOFILE,(128,128))
os.umask(0o077)
def proc_status():
 d={}
 for ln in open('/proc/self/status'):
  if ':' in ln:
   k,v=ln.strip().split(':',1);d[k]=v.strip()
 return d
st=proc_status()
assert st['NoNewPrivs']=='1' and int(st['CapEff'],16)==0 and int(st['CapBnd'],16)==0
assert st['Groups']=='' and libc.prctl(3,0,0,0,0)==0 # PR_GET_DUMPABLE
with sqlite3.connect(data+'/authority.sqlite3') as db:
 db.execute('BEGIN IMMEDIATE')
 db.execute('UPDATE control SET boot_epoch=boot_epoch+1 WHERE id=1')
 boot=db.execute('SELECT boot_epoch FROM control WHERE id=1').fetchone()[0]
 db.commit()
try:os.setuid(0)
except PermissionError:cannot_root=True
else:cannot_root=False
assert cannot_root
sock=sockdir+'/broker.sock'
listener=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
listener.bind(sock)
os.chmod(sock,0o660)
listener.listen(8)
def db(path):return sqlite3.connect('file:'+path+'?mode=rw',uri=True,isolation_level=None,timeout=3)
def answer(req):
 op=req.get('op')
 if op=='health':return {'reply':'alive','boot_epoch':boot,'owner_uid':os.geteuid(),
   'no_new_privs':st['NoNewPrivs']=='1','effective_caps_zero':int(st['CapEff'],16)==0,
   'bounding_caps_zero':int(st['CapBnd'],16)==0,'groups_empty':st['Groups']=='',
   'core_dumps_disabled':resource.getrlimit(resource.RLIMIT_CORE)==(0,0),
   'dumpable_disabled':libc.prctl(3,0,0,0,0)==0,
   'descriptor_limit':resource.getrlimit(resource.RLIMIT_NOFILE)[0],
   'cannot_setuid_root':cannot_root,'pid':os.getpid()}
 if op=='promote':
  with closing(db(data+'/authority.sqlite3')) as auth:
   auth.execute('BEGIN IMMEDIATE')
   leader,epoch=auth.execute('SELECT leader,epoch FROM control WHERE id=1').fetchone()
   if (leader,epoch)!=('node-A',1):return {'reply':'promotion-denied'}
   with closing(db(data+'/node-A.sqlite3')) as a:
    recs=a.execute('SELECT run,idem,revision,digest FROM receipts ORDER BY revision').fetchall()
   with closing(db(data+'/node-B.sqlite3')) as b:
    b.execute('BEGIN IMMEDIATE')
    for r in recs:b.execute('INSERT INTO receipts VALUES(?,?,?,?)',r)
    b.execute('UPDATE state SET revision=?,role=?,epoch=? WHERE id=1',(len(recs),'leader',2))
    b.execute('COMMIT')
   auth.execute("UPDATE control SET leader='node-B',epoch=2 WHERE id=1")
   auth.execute('COMMIT')
  return {'reply':'promoted-nonatomic'}
 if op not in ('commit','reconcile'):return {'reply':'operation-denied'}
 if set(req)!={'op','node','epoch','run','idem','payloadHex','loseAck'}:return {'reply':'shape-denied'}
 if req['node'] not in ('node-A','node-B') or type(req['epoch']) is not int or type(req['loseAck']) is not bool:return {'reply':'shape-denied'}
 if any(type(req[k]) is not str or not req[k].isalnum() or len(req[k])>32 for k in ('run','idem')):return {'reply':'shape-denied'}
 h=req['payloadHex']
 if type(h) is not str or len(h)>1024 or len(h)<2 or len(h)%2:return {'reply':'shape-denied'}
 try:digest=hashlib.sha256(bytes.fromhex(h)).hexdigest()
 except ValueError:return {'reply':'shape-denied'}
 with closing(db(data+'/authority.sqlite3')) as auth:
  auth.execute('BEGIN IMMEDIATE')
  leader,epoch=auth.execute('SELECT leader,epoch FROM control WHERE id=1').fetchone()
  if (leader,epoch)!=(req['node'],req['epoch']):return {'reply':'stale-leader-denied'}
  with closing(db(data+'/'+req['node']+'.sqlite3')) as r:
   r.execute('BEGIN IMMEDIATE')
   rev,role,e=r.execute('SELECT revision,role,epoch FROM state WHERE id=1').fetchone()
   if role!='leader' or e!=epoch:return {'reply':'storage-role-denied'}
   old=r.execute('SELECT idem,digest FROM receipts WHERE run=?',(req['run'],)).fetchone()
   if op=='reconcile':return {'reply':'reconciled-no-write' if old==(req['idem'],digest) else 'receipt-absent'}
   if old:return {'reply':'duplicate-no-write' if old==(req['idem'],digest) else 'receipt-conflict-denied'}
   r.execute('UPDATE state SET revision=revision+1 WHERE id=1')
   r.execute('INSERT INTO receipts VALUES(?,?,?,?)',(req['run'],req['idem'],rev+1,digest))
   r.execute('COMMIT')
   return {'reply':'committed'}
while True:
 c,_=listener.accept()
 with c:
  c.settimeout(0.45)
  req={}
  try:
   pid,uid,gid=struct.unpack('3i',c.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
   if uid!=client:reply={'reply':'peer-denied'}
   else:
    data_bytes=b''
    while b'\n' not in data_bytes and len(data_bytes)<8192:
     chunk=c.recv(4096)
     if not chunk:break
     data_bytes+=chunk
    if len(data_bytes)>=8192 and b'\n' not in data_bytes:reply={'reply':'frame-too-large'}
    else:
     req=json.loads(data_bytes.split(b'\n',1)[0])
     reply=answer(req) if isinstance(req,dict) else {'reply':'shape-denied'}
    if reply['reply']=='committed' and req.get('loseAck') is True:os._exit(93)
   c.sendall((json.dumps(reply,sort_keys=True)+'\n').encode())
  except (OSError,ValueError,TypeError,KeyError,sqlite3.Error):
   try:c.sendall(b'{"reply":"error-denied"}\n')
   except OSError:pass
'''
CLIENT_CODE=r'''
import json,os,socket,sys
sock=sys.argv[1];data=sys.argv[2];req=json.loads(sys.argv[3]);out={'uid':os.geteuid(),'gid':os.getegid(),'groups':os.getgroups()}
try:fd=os.open(data+'/node-A.sqlite3',os.O_RDWR);os.close(fd);out['direct_write']='BYPASS'
except (OSError,PermissionError):out['direct_write']='denied'
try:os.unlink(sock);out['socket_unlink']='BYPASS'
except (OSError,PermissionError):out['socket_unlink']='denied'
try:
 with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
  s.settimeout(3);s.connect(sock);s.sendall((json.dumps(req,separators=(',',':'))+'\n').encode())
  raw=b''
  while b'\n' not in raw:
   b=s.recv(4096)
   if not b:break
   raw+=b
  out['reply']=json.loads(raw) if raw else {'reply':'ack-lost'}
except OSError:out['reply']={'reply':'transport-unavailable'}
print(json.dumps(out,sort_keys=True))
'''


RAW_CLIENT_CODE=r'''
import base64,json,os,socket,sys,time
sock=sys.argv[1];payload=base64.b64decode(sys.argv[2]);idle=sys.argv[3]=='idle'
try:
 with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as c:
  c.settimeout(2);c.connect(sock)
  if idle:time.sleep(.8)
  else:c.sendall(payload)
  data=b''
  while b'\n' not in data and len(data)<8192:
   part=c.recv(4096)
   if not part:break
   data+=part
  print(json.dumps({'reply':json.loads(data) if data else {'reply':'closed'}}))
except (OSError,ValueError) as exc:
 print(json.dumps({'reply':{'reply':'transport-denied','error_type':type(exc).__name__}}))
'''
SERVICE_UNIT='''[Unit]
Description=MASL AG-UI SQLite broker (candidate; not installed)
After=local-fs.target
[Service]
Type=simple
User=masl-storage-owner
Group=masl-storage-clients
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
RestrictAddressFamilies=AF_UNIX
StateDirectory=masl-agui
StateDirectoryMode=0700
RuntimeDirectory=masl-agui
RuntimeDirectoryMode=0700
UMask=0077
LimitNOFILE=128
ExecStart=/opt/masl-agui/bin/storage-owner
Restart=on-failure
RestartSec=1s
[Install]
WantedBy=multi-user.target
'''

def unit_policy(text:str)->bool:
    required={'User':'masl-storage-owner','Group':'masl-storage-clients',
      'NoNewPrivileges':'yes','CapabilityBoundingSet':'','AmbientCapabilities':'',
      'ProtectSystem':'strict','ProtectHome':'yes','PrivateTmp':'yes',
      'RestrictAddressFamilies':'AF_UNIX','StateDirectory':'masl-agui',
      'RuntimeDirectory':'masl-agui','StateDirectoryMode':'0700',
      'RuntimeDirectoryMode':'0700','UMask':'0077','LimitNOFILE':'128',
      'Restart':'on-failure','RestrictSUIDSGID':'yes'}
    try:
        from configparser import ConfigParser
        config=ConfigParser(interpolation=None,strict=True);config.optionxform=str
        config.read_string(text)
        if sorted(config.sections())!=['Install','Service','Unit']:return False
        if dict(config.items('Install'))!={'WantedBy':'multi-user.target'}:return False
        if dict(config.items('Unit'))!={'Description':'MASL AG-UI SQLite broker (candidate; not installed)','After':'local-fs.target'}:return False
        service=dict(config.items('Service'))
        if any(service.get(k)!=v for k,v in required.items()):return False
        if not service.get('ExecStart','').startswith('/opt/masl-agui/bin/'):return False
        if set(service)-set(required)-{'Type','ExecStart','RestartSec','ProtectKernelTunables',
          'ProtectKernelModules','ProtectControlGroups'}:return False
        if any(service[k]!='yes' for k in ('ProtectKernelTunables','ProtectKernelModules','ProtectControlGroups')):return False
        return True
    except (ValueError,KeyError):return False

def privilege_runner(uid_number:int,code:str,*args:str,timeout:int=10)->subprocess.CompletedProcess[str]:
    return subprocess.run(['setpriv','--no-new-privs','--bounding-set=-all',
       '--reuid',str(uid_number),'--regid',str(uid_number),'--clear-groups',
       sys.executable,'-c',code,*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,
       text=True,timeout=timeout,check=False)

def runtime_fixture(dest:Path)->None:
    need(os.name=='posix' and sys.platform.startswith('linux'),'Linux required')
    need(os.geteuid()==0,'explicit sudo privilege required for temporary setpriv helper')
    need(shutil.which('setpriv') is not None,'setpriv required for real UID checks')
    for principal in (OWNER_UID,CLIENT_UID,OUTSIDER_UID):
        try:pwd.getpwuid(principal)
        except KeyError:pass
        else:need(False,'numeric UID already assigned in local account database: '+str(principal))
    count=0
    def ok(v:bool,label:str)->None:
        nonlocal count
        need(v,'2.6Y kernel assertion failed: '+label)
        count+=1;print('PASS: '+label,flush=True)
    with tempfile.TemporaryDirectory(prefix='masl-26x-runtime-') as dirname:
        base=Path(dirname);base.chmod(0o711)
        data=base/'data';data.mkdir(mode=0o700);os.chown(data,OWNER_UID,OWNER_UID)
        socks=base/'sockets';socks.mkdir(mode=0o711);os.chown(socks,OWNER_UID,OWNER_UID)
        dbs=[data/'authority.sqlite3',data/'node-A.sqlite3',data/'node-B.sqlite3']
        with sqlite3.connect(dbs[0]) as db:
            db.executescript("CREATE TABLE control(id INTEGER PRIMARY KEY,leader TEXT,epoch INTEGER,boot_epoch INTEGER);INSERT INTO control VALUES(1,'node-A',1,0);")
        for path,role in ((dbs[1],'leader'),(dbs[2],'standby')):
            with sqlite3.connect(path) as db:
                db.executescript('CREATE TABLE state(id INTEGER PRIMARY KEY,revision INTEGER,role TEXT,epoch INTEGER);CREATE TABLE receipts(run TEXT PRIMARY KEY,idem TEXT UNIQUE,revision INTEGER,digest TEXT);')
                db.execute('INSERT INTO state VALUES(1,0,?,1)',(role,));db.commit()
        for path in dbs:os.chown(path,OWNER_UID,OWNER_UID);path.chmod(0o600)
        sock=socks/'broker.sock';old_socket=socks/'stale.sock'
        proc:subprocess.Popen[str]|None=None
        def launch():
            nonlocal proc
            need(not sock.exists() and not sock.is_symlink(),'unexpected preexisting socket')
            proc=subprocess.Popen(['setpriv','--no-new-privs','--bounding-set=-all',
                 '--reuid',str(OWNER_UID),'--regid',str(OWNER_UID),'--clear-groups',
                 sys.executable,'-c',OWNER_CODE,str(OWNER_UID),str(CLIENT_UID),str(data),str(socks)],
                 stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            for attempt in range(120):
                if proc.poll() is not None:
                    _,err=proc.communicate(timeout=2)
                    raise RuntimeError('BLOCKED: hardened owner terminated at startup '+err[-1400:])
                if sock.exists() and stat.S_ISSOCK(sock.lstat().st_mode):
                    os.chown(sock,OWNER_UID,CLIENT_UID);sock.chmod(0o660)
                    try:
                        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
                            s.settimeout(.2);s.connect(str(sock));s.recv(64)
                        return proc
                    except (ConnectionRefusedError,FileNotFoundError,socket.timeout):pass
                time.sleep(.025)
            proc.terminate();proc.wait(timeout=5)
            raise RuntimeError('BLOCKED: hardened owner socket timeout')
        def probe(uid_number:int,request:dict,socket_path:Path|None=None)->dict:
            r=privilege_runner(uid_number,CLIENT_CODE,str(socket_path or sock),str(data),json.dumps(request),timeout=8)
            need(r.returncode==0,'client subprocess failed: '+r.stderr[-1000:])
            return json.loads(r.stdout)
        def req(name:str,node='node-A',epoch=1,lose=False,op='commit'):
            return {'op':op,'node':node,'epoch':epoch,'run':name,'idem':'idem'+name,
                    'payloadHex':('payload-'+name).encode().hex(),'loseAck':lose}
        try:
            launch()
            ok(proc is not None and proc.poll() is None,'supervised owner starts with nonroot UID')
            ok(data.stat().st_uid==OWNER_UID and stat.S_IMODE(data.stat().st_mode)==0o700,
               'owner-only 0700 database directory persists')
            ok(all(p.stat().st_uid==OWNER_UID and stat.S_IMODE(p.stat().st_mode)==0o600 for p in dbs),
               'three databases remain 0600 and are owned by nonroot principal')
            ok(socks.stat().st_uid==OWNER_UID and stat.S_IMODE(socks.stat().st_mode)==0o711,
               'socket directory traversal without client write permission')
            ok(sock.stat().st_uid==OWNER_UID and sock.stat().st_gid==CLIENT_UID and stat.S_IMODE(sock.stat().st_mode)==0o660,
               'runtime socket mode 0660 and client group maintained')
            first_inode=sock.stat().st_ino
            c=probe(CLIENT_UID,{'op':'health'});health=c['reply']
            ok((c['uid'],c['gid'],c['groups'])==(CLIENT_UID,CLIENT_UID,[]),
               'authorized client real UID/GID and supplementary groups')
            ok(c['direct_write']=='denied','different UID cannot write SQLite directly')
            ok(c['socket_unlink']=='denied','client cannot unlink owner socket')
            ok(health['reply']=='alive' and health['boot_epoch']==1 and health['owner_uid']==OWNER_UID,
               'first owner reports persistent boot epoch 1')
            ok(health['no_new_privs'] is True,'Linux PR_SET_NO_NEW_PRIVS effective in owner')
            ok(health['effective_caps_zero'] is True,'effective capabilities removed')
            ok(health['bounding_caps_zero'] is True,'capability bounding set removed')
            ok(health['groups_empty'] is True,'supplementary group privileges removed')
            ok(health['core_dumps_disabled'] is True,'RLIMIT_CORE zero on owner')
            ok(health['dumpable_disabled'] is True,'owner PR_SET_DUMPABLE zero')
            ok(health['descriptor_limit']==128,'RLIMIT_NOFILE bounded')
            ok(health['cannot_setuid_root'] is True,'owner cannot restore root identity')
            outsider=probe(OUTSIDER_UID,{'op':'health'})
            ok(outsider['reply']['reply']=='transport-unavailable','outsider denied by socket DAC')
            sock.chmod(0o666)
            outsider=probe(OUTSIDER_UID,{'op':'health'})
            ok(outsider['reply']['reply']=='peer-denied','SO_PEERCRED rejects outsider under permissive test socket')
            sock.chmod(0o660)
            malformed=probe(CLIENT_UID,{'op':'unknown'})
            ok(malformed['reply']['reply']=='operation-denied','supervised owner denies unsupported RPC')
            wrong=probe(CLIENT_UID,{'op':'commit','node':'node-A'})
            ok(wrong['reply']['reply']=='shape-denied','supervised owner denies incomplete write shape')

            # Hostile-client probes are genuine separate unprivileged processes.
            # All of them must leave the owner alive and storage revision zero.
            import base64
            def raw_probe(uid:int,payload:bytes=b'',idle:bool=False)->str:
                rr=privilege_runner(uid,RAW_CLIENT_CODE,str(sock),
                  base64.b64encode(payload).decode('ascii'),'idle' if idle else 'send',timeout=8)
                need(rr.returncode==0,'hostile client failed '+rr.stderr[-300:])
                return json.loads(rr.stdout)['reply']['reply']
            bads=[
              (b'{garbage}\n','error-denied','invalid JSON rejected'),
              (b'[]\n','shape-denied','list JSON rejected, owner survives'),
              (b'42\n','shape-denied','scalar JSON rejected'),
              (b'null\n','shape-denied','null JSON rejected'),
              (b'{"op":"not-allowed"}\n','operation-denied','unsupported operation rejected'),
              (b'{}\n','operation-denied','empty RPC rejected'),
              (b'{"op":"commit"}\n','shape-denied','incomplete commit denied'),
              (b'{"op":"reconcile","node":"node-A"}\n','shape-denied','incomplete reconcile denied'),
              (b'{"op":"commit","extra":"unexpected"}\n','shape-denied','unexpected write attributes denied'),
              (b'x'*9000+b'\n','frame-too-large','oversized transport frame denied'),
            ]
            for body,response,label in bads:
                ok(raw_probe(CLIENT_UID,body)==response,'hostile '+label)
            ok(raw_probe(CLIENT_UID,idle=True)=='error-denied','idle authenticated connection times out')
            ok(raw_probe(OUTSIDER_UID,b'{"op":"health"}\n')=='transport-denied',
               'unrelated UID cannot reach socket under DAC')
            sock.chmod(0o666)
            ok(raw_probe(OUTSIDER_UID,b'{"op":"health"}\n')=='peer-denied',
               'SO_PEERCRED still denies outsider when socket mode is permissive')
            sock.chmod(0o660)
            ok(probe(CLIENT_UID,{'op':'health'})['reply']['reply']=='alive',
               'legitimate client remains served after hostile traffic')
            with sqlite3.connect(dbs[1]) as db:
                ok(db.execute('SELECT revision FROM state').fetchone()[0]==0 and
                   db.execute('SELECT count(*) FROM receipts').fetchone()[0]==0,
                   'hostile traffic leaves persistent receipt state unchanged')
            ok(proc is not None and proc.poll() is None,
               'owner process stays alive after hostile-client traffic')
            ok(unit_policy(SERVICE_UNIT),'candidate service policy parses and has required directives')
            for key,badval in [('User','root'),('Group','root'),('NoNewPrivileges','no'),
                 ('CapabilityBoundingSet','CAP_SYS_ADMIN'),('AmbientCapabilities','CAP_DAC_OVERRIDE'),
                 ('ProtectSystem','full'),('ProtectHome','no'),('PrivateTmp','no'),
                 ('RestrictAddressFamilies','AF_UNIX AF_INET'),('StateDirectoryMode','0755'),
                 ('RuntimeDirectoryMode','0777'),('UMask','0000'),('LimitNOFILE','65535'),
                 ('Restart','always'),('RestrictSUIDSGID','no')]:
                good=next(line for line in SERVICE_UNIT.splitlines() if line.startswith(key+'='))
                mutated=SERVICE_UNIT.replace(good,key+'='+badval,1)
                ok(not unit_policy(mutated),'policy tamper rejected: '+key)
            ok(not unit_policy(SERVICE_UNIT+'\nExecStart=/bin/sh\n'),
               'duplicate ExecStart policy injection rejected')
            lost=probe(CLIENT_UID,req('runA',lose=True))
            ok(lost['reply']['reply']=='ack-lost','commit acknowledgement lost at actual process exit')
            need(proc is not None,'missing supervised proc')
            proc.wait(timeout=8)
            ok(proc.returncode==93,'supervisor observes genuine owner exit status 93')
            dead=probe(CLIENT_UID,{'op':'health'})
            ok(dead['reply']['reply']=='transport-unavailable','dead owner fails closed, not a stale success')
            os.rename(sock,old_socket)
            ok(old_socket.stat().st_ino==first_inode,'supervisor preserves old socket inode for stale-path denial')
            stale=probe(CLIENT_UID,{'op':'health'},old_socket)
            ok(stale['reply']['reply']=='transport-unavailable','stale pre-restart socket cannot serve requests')
            launch()
            new_inode=sock.stat().st_ino
            ok(new_inode!=first_inode,'new owner uses different socket inode')
            recovered=probe(CLIENT_UID,{'op':'health'})
            ok(recovered['reply']['boot_epoch']==2 and recovered['reply']['reply']=='alive',
               'restart increments durable boot_epoch to 2')
            ok(recovered['reply']['effective_caps_zero'] and recovered['reply']['no_new_privs'] and recovered['reply']['dumpable_disabled'],
               'restart reapplies kernel hardening before accepting RPC')
            replay=probe(CLIENT_UID,req('runA',op='reconcile'))
            ok(replay['reply']['reply']=='reconciled-no-write','lost ACK receipt recovered without replay commit')
            repeat=probe(CLIENT_UID,req('runA'))
            ok(repeat['reply']['reply']=='duplicate-no-write','receipt replay idempotency after restart')
            promo=probe(CLIENT_UID,{'op':'promote'})
            ok(promo['reply']['reply']=='promoted-nonatomic','selected non-atomic promotion remains explicitly limited')
            old=probe(CLIENT_UID,req('runB'))
            ok(old['reply']['reply']=='stale-leader-denied','previous leader and epoch rejected')
            fresh=probe(CLIENT_UID,req('runB',node='node-B',epoch=2))
            ok(fresh['reply']['reply']=='committed','current owner and leader accept selected commit')
            bad_epoch=probe(CLIENT_UID,req('runC',node='node-B',epoch=1))
            ok(bad_epoch['reply']['reply']=='stale-leader-denied','active leader stale-epoch attempt denied')
            for p in dbs:
                with sqlite3.connect(p) as db:
                    ok(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok',
                       'physical SQLite integrity '+p.name)
            with sqlite3.connect(dbs[0]) as db:
                ok(db.execute('SELECT leader,epoch,boot_epoch FROM control').fetchone()==('node-B',2,2),
                   'authority durable boot epoch 2 and node-B epoch 2')
            with sqlite3.connect(dbs[1]) as db:
                ok(db.execute('SELECT revision,role,epoch FROM state').fetchone()==(1,'leader',1) and
                   db.execute('SELECT count(*) FROM receipts').fetchone()[0]==1,
                   'node-A remains lagging with revision 1')
            with sqlite3.connect(dbs[2]) as db:
                ok(db.execute('SELECT revision,role,epoch FROM state').fetchone()==(2,'leader',2) and
                   db.execute('SELECT count(*) FROM receipts').fetchone()[0]==2,
                   'node-B holds two receipts and leader epoch 2')
            need(proc is not None,'missing process')
            proc.terminate();proc.wait(timeout=6)
            for p in dbs:
                with sqlite3.connect(p) as db:db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            report={'lab':'2.6Y','owner_uid':OWNER_UID,'client_uid':CLIENT_UID,'outsider_uid':OUTSIDER_UID,
                'owner_no_new_privs_verified':True,'owner_cap_eff_zero':True,'owner_cap_bnd_zero':True,
                'owner_supplemental_groups_empty':True,'owner_core_dump_disabled':True,
                'owner_dumpable_disabled':True,'owner_nofile_limit':128,
                'owner_cannot_restore_root':True,'client_direct_storage_denied':True,
                'outsider_peer_denied':True,'socket_inode_changed_after_crash':True,
                'stale_socket_failed_closed':True,'boot_epoch_persisted':2,
                'lost_ack_reconciled':True,'compromised_owner_protected':False,
                'privileged_root_bypass_prevented':False,'systemd_service_configured':False,
                'production_os_policy_verified':False,'atomic_cross_store_promotion':False,
                'distributed_consensus_verified':False,'real_agui_adapter_ready':False,
                'root_helper_can_override_dac':True,'persistent_linux_accounts_created':False,
                'old_socket_inode':first_inode,'new_socket_inode':new_inode,
                'scope':'temporary-local-kernel-nonroot-owner-and-clients-only'}
            report.update({'lab':'2.6Y','candidate_systemd_unit_reviewed':True,
              'systemd_service_deployed':False,'privileged_root_bypass_prevented':False,
              'hostile_invalid_json_denied':True,'hostile_oversized_frame_denied':True,
              'hostile_idle_timeout':True,'hostile_unprivileged_peer_denied':True,
              'hostile_receipt_unchanged':True,'owner_survived_hostile_client_requests':True,
              'candidate_service_unit_sha256':sha(SERVICE_UNIT.encode()),
              'scope':'temporary-cross-uid-kernel-hostile-client-and-static-unit-proposal-only'})
            meta=base/'service-proof.json';meta.write_text(json.dumps(report,sort_keys=True)+'\n')
            unit=base/'candidate-owner.service';unit.write_text(SERVICE_UNIT)

            need(not dest.exists() and not dest.is_symlink(),'proof TAR already exists')
            with tarfile.open(dest,'w',format=tarfile.USTAR_FORMAT) as tar:
                for p in dbs:tar.add(p,arcname=p.name,recursive=False)
                tar.add(meta,arcname='service-proof.json',recursive=False)
                tar.add(unit,arcname='candidate-owner.service',recursive=False)
            os.chmod(dest,0o644)
            ok(dest.is_file() and dest.stat().st_size>6000,'physical proof TAR written with SQLite and lifecycle metadata')
            with tarfile.open(dest) as tar:
                ok([m.name for m in tar.getmembers()]==['authority.sqlite3','node-A.sqlite3','node-B.sqlite3','service-proof.json','candidate-owner.service'],
                   'physical TAR contains exact five artifacts')
        finally:
            if proc is not None and proc.poll() is None:
                proc.terminate()
                try:proc.wait(timeout=5)
                except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=5)
        print(f'SERVICE_ASSERTIONS: {count}',flush=True)
        print('SERVICE_PROOF_PATH: '+str(dest),flush=True)
        need(count==NEW_ASSERTIONS,'local runtime assertion count drift')

def prior_fixture(out:Path)->None:
    prior=ROOT/'scripts/lab-26x-runtime-review.py'
    spec=importlib.util.spec_from_file_location('masl_prior_26x',prior)
    need(spec is not None and spec.loader is not None,'prior 2.6X source absent')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory(prefix='masl26y-regression-') as folder:
        module.fixture(Path(folder))

def fixture(out:Path)->None:
    prior_fixture(out)
    proof=out/'service-hostile-proof.tar'
    need(not proof.exists(),'runtime proof TAR already exists')
    if os.geteuid()==0:runtime_fixture(proof)
    else:
        need(shutil.which('sudo') is not None,'sudo required for distinct temporary Linux UIDs')
        cmd=['sudo','-n',sys.executable,str(ROOT/RUNNER),'--service-fixture-child','--proof-path',str(proof)]
        p=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120)
        print(p.stdout,end='',flush=True)
        need(p.returncode==0,'sudo -n temporary root helper failed; authorize sudo -v explicitly')
    need(proof.is_file() and not proof.is_symlink(),'physical runtime proof missing')
    print('SERVICE_SCOPE: static-unit-candidate-only; hostile-clients real Linux cross-UID; no deployment',flush=True)

def gate(name:str,command:list[str],cwd:Path,path:Path)->None:
    with path.open('wb') as output:
        p=subprocess.run(command,cwd=cwd,stdout=output,stderr=subprocess.STDOUT,
                         timeout=180,check=False)
    need(p.returncode==0,'gate failed '+name+' (see '+str(path)+')')
    print('PASS: '+name+' SHA256 '+sha(path.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    need(not out.exists() and not out.is_symlink(),'evidence output already exists')
    dest=out.expanduser().resolve();root=ROOT.resolve()
    need(dest!=root and root not in dest.parents,'evidence must remain outside Git repository')
    out.mkdir(parents=True,exist_ok=False)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
         'src/ag-ui/deployable-service-hostile-clients.spec.ts','--outDir',str(ssr),
         '--emptyOutDir'],WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf8')
    gate('pure.log',['node',str(ssr/'deployable-service-hostile-clients.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf8')
    match=re.findall(r'(?m)^ASSERTIONS: (\d+)\s*$',pure)
    need(match and int(match[-1])==ASSERTIONS and pure.count('PASS: ')==ASSERTIONS,
         'TypeScript exact assertion count drift')
    for case in CRITICAL:need('PASS: '+case in pure,'critical TS case absent: '+case)
    gate('fixture.log',[sys.executable,str(ROOT/RUNNER),'--fixture-child',
         '--output-dir',str(out)],ROOT,out/'fixture.log')
    log=(out/'fixture.log').read_text(encoding='utf8')
    match=re.search(r'(?m)^SERVICE_ASSERTIONS: (\d+)$',log)
    need(match is not None and int(match.group(1))==NEW_ASSERTIONS,
         'service/hostile-client assertion count mismatch')
    need(log.count('PASS: ')==PRIOR_ASSERTIONS+NEW_ASSERTIONS,
         'Python regression + runtime count mismatch')
    need('SERVICE_SCOPE: static-unit-candidate-only' in log,
         'real Linux privilege-hardening scope missing')
    proof=out/'service-hostile-proof.tar'
    need(proof.is_file() and not proof.is_symlink(),'service proof TAR missing')
    preflight(schema)
    logs={name:sha((out/name).read_bytes()) for name in
          ('lint.log','build.log','compile.log','pure.log','fixture.log')}
    report={
      'lab':'2.6Y','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
      'agui_upstream_commit':UPSTREAM,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
      'published_git_blobs':BLOBS,'typescript_assertions':ASSERTIONS,
      'fixture_assertions':PRIOR_ASSERTIONS+NEW_ASSERTIONS,
      'previous_fixture_assertions':PRIOR_ASSERTIONS,
      'new_service_assertions':NEW_ASSERTIONS,'critical_cases':len(CRITICAL),
      'gate_logs_sha256':logs,'service_proof_sha256':sha(proof.read_bytes()),
      'source_sha256':{rel:sha((ROOT/rel).read_bytes()) for rel in (SRC,TEST,RUNNER)},
      'local_cross_uid_dac_verified':True,'local_linux_no_new_privs_verified':True,
      'local_capabilities_removed':True,'local_owner_core_dump_disabled':True,
      'local_owner_restart_and_socket_lifecycle_verified':True,
      'candidate_service_policy_static_verified':True,
      'hostile_client_real_kernel_fixture_verified':True,
      'lost_ack_receipt_reconciled':True,
      'privileged_root_bypass_prevented':False,'compromised_owner_bypass_prevented':False,
      'systemd_service_deployed':False,'production_os_policy_configured':False,
      'distributed_atomic_promotion_verified':False,'enterprise_security_signoff':False,
      'operational_agui_producer_authenticated':False,
      'parent_2_6_open':True,'gap_ids_open':['G'+str(i) for i in range(1,10)],
      'adapter_ready':False,
      'limits':[
        'Selected real unprivileged Linux UIDs and a temporary root helper on one host',
        'PR_SET_NO_NEW_PRIVS, capability bounding set and dumpability verified only for fixture owner',
        'Socket inode rotation, crash and restart are selected temporary OS process lifecycle scenarios',
        'Systemd unit candidate statically audited, NOT installed or exercised by a service manager; no production identity',
        'Root or processes with privilege bypass, malicious owner and malicious kernel are not prevented',
        'Authority and two SQLite replicas remain independent, sequential and not crash-atomic across stores',
        'No quorum, cross-host durability, normative AG-UI 1.0, production issuer/ACL, media/DLP or security signoff',
        'TypeScript fixture observations do not consume actual kernel or SQLite proof',
        'G1-G9 and parent 2.6 remain OPEN; adapter BLOCKED',
      ],'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    note=['# MASL 2.6Y — static service policy and real hostile-client isolation fixture','',
      f'- Baseline `{HEAD}`',f'- TypeScript: {ASSERTIONS}/{ASSERTIONS}',
      f'- Python: {PRIOR_ASSERTIONS+NEW_ASSERTIONS}/{PRIOR_ASSERTIONS+NEW_ASSERTIONS}',
      f'- Critical cases: {len(CRITICAL)}/{len(CRITICAL)}',
      '- Five gates passed. G1-G9 and parent 2.6 OPEN; adapter BLOCKED.','',
      'The candidate systemd service unit was verified statically but never installed. The Linux owner used no_new_privs, zero capabilities,',
      'empty supplemental groups, disabled core dumps and dumpability and capped',
      'open descriptors. After a real crash, a supervisor detected a dead socket,',
      'rotated the socket pathname and restarted a hardened owner with a monotonically',
      'persisted boot epoch. A receipt was reconciled without duplicate writes.','',
      'Hostile malformed JSON, oversized frames, timeouts, wrong peers and invalid writes failed closed. Root bypass, owner compromise,',
      'systemd deployment, production issuer/ACL, consensus, distributed atomicity,',
      'normative AG-UI conformance and Agent Server adapter remain unproven.','',
      '## Evidence hashes','']
    note.extend(f'- {key}: `{value}`' for key,value in logs.items())
    note.append(f'- service-hostile-proof.tar: `{report["service_proof_sha256"]}`')
    (out/'review.md').write_text('\n'.join(note)+'\n',encoding='utf8')
    for name in ('review.json','review.md','service-hostile-proof.tar'):
        print('EVIDENCE: '+name+' SHA256 '+sha((out/name).read_bytes()),flush=True)
    print('REVIEW STATUS: PASS — 2.6Y isolated static service policy and hostile-client fail-stop fixture; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)

def main()->None:
    ap=argparse.ArgumentParser(description=__doc__)
    mode=ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--preflight',action='store_true')
    mode.add_argument('--run',action='store_true')
    mode.add_argument('--fixture-child',action='store_true')
    mode.add_argument('--service-fixture-child',action='store_true')
    ap.add_argument('--schema',type=Path,default=DEFAULT_SCHEMA)
    ap.add_argument('--output-dir',type=Path)
    ap.add_argument('--proof-path',type=Path)
    args=ap.parse_args()
    if args.preflight:preflight(args.schema)
    elif args.service_fixture_child:
        need(args.proof_path is not None,'proof path required')
        runtime_fixture(args.proof_path)
    else:
        need(args.output_dir is not None,'output directory required')
        if args.fixture_child:fixture(args.output_dir)
        else:run(args.schema,args.output_dir)
if __name__=='__main__':
    try:main()
    except (RuntimeError,OSError,sqlite3.Error,subprocess.CalledProcessError,ValueError,
            TimeoutError,subprocess.TimeoutExpired) as err:
        msg=str(err)
        print(msg if msg.startswith('BLOCKED:') else 'BLOCKED: '+msg,file=sys.stderr,flush=True)
        raise SystemExit(2) from None
