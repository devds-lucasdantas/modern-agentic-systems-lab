#!/usr/bin/env python3
"""MASL 2.6Z: isolated *real systemd transient unit* and hostile-client gates.

This code DOES invoke systemd-run/systemctl with an explicitly authorized sudo
helper and uses a disposable /run sandbox. It never installs service files,
changes an existing service, creates accounts or edits Git. If systemd does not
operate as PID 1, or sandboxing properties are unsupported, the proof BLOCKS.
Root can bypass all DAC and all policy inspected here. No enterprise deployment.
"""
from __future__ import annotations
import argparse,hashlib,importlib.util,io,json,os,pwd,re,shutil,socket,sqlite3,stat,struct,subprocess,sys,tarfile,tempfile,time,uuid
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'apps/web'
HEAD='2ed262d138aa7bc98f71a83e49f66ef8b3426431'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
UPSTREAM='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
SRC='apps/web/src/ag-ui/supervised-service-policy.ts'
TEST='apps/web/src/ag-ui/supervised-service-policy.spec.ts'
RUNNER='scripts/lab-26z-supervised-review.py'
SRC_SHA='a748047ce039f663e6918e320b84e09d5af8ab45d8a5afa6d5119a0b6a1ebbba'
TEST_SHA='a1a3cee401bfa2e864baa795bd65a026c5ab171931898a5f49fa5c901aa2d98a'
ASSERTIONS=1532 # local pure regression 1169 + 363 new checks
PRIOR_ASSERTIONS=225
NEW_ASSERTIONS=44 # exact numbered physical checks; systemd mandatory
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'7b4c381f7cbb4bf80dfca46e2a9e1e988ea38df1',
 'CURRENT.md':'fc7ab61b455bf6f701c9d6094b02eaacd295d6d1',
 'docs/journal/lab-23-ag-ui.md':'b22c62ee124de77b9d95910678a6054cf34bebf5',
 'apps/web/src/ag-ui/deployable-service-hostile-clients.ts':'036c1d0be301794af2bbe17c9620a78120909df4',
 'apps/web/src/ag-ui/deployable-service-hostile-clients.spec.ts':'134449aad01eb0f76328e291a381f2eea8cb6f4f',
 'scripts/lab-26y-service-review.py':'b2e4dfbbc4d2bf9f382983abae1174fa92c7a43c',
 'apps/web/src/ag-ui/cross-uid-runtime-hardening.ts':'b53c3100ba957bf029e273c276e97b408f84a985',
 'apps/web/src/ag-ui/cross-uid-storage-mediation.ts':'af4af1897cf84a823bd0ec5e156136518fede612',
 'apps/web/src/ag-ui/mandatory-fencing-promotion.ts':'0373a0b043c38cfb823b57ec9272a60342b8a8d1',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa'
}
CRITICAL=(
 '2.6Z null request denied before any callback',
 '2.6Z malformed request performs zero reads',
 '2.6Z unknown request field denied',
 '2.6Z invalid requests never read fixture observations',
 '2.6Z systemd unit extra field denied',
 '2.6Z hostile extra field denied',
 '2.6Z supervisor extra field denied',
 '2.6Z validated systemd observations still defer to published 2.6Y gate',
 '2.6Z all three new observations read before inherited 2.6Y',
 '2.6Z G1-G9 and parent 2.6 OPEN; adapter BLOCKED',
 '2.6Z transient unit never equated with production deployment',
)
OWNER=61001;CLIENT=61002;OUTSIDER=61003

def need(ok,msg):
 if not ok:raise RuntimeError('BLOCKED: '+msg)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def blob(raw):return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
def git(*args,cwd=ROOT):return subprocess.check_output(['git',*args],cwd=cwd,stderr=subprocess.STDOUT,text=True).strip()
def preflight(schema):
 need(git('symbolic-ref','--quiet','--short','HEAD')=='main','expected main branch')
 need(git('rev-parse','HEAD')==HEAD and git('rev-parse','origin/main')==HEAD,'baseline changed')
 need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),'dirty tracked or staged files')
 need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
      'untracked scope differs from three sources')
 need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,'workshop drift')
 for path,pin in BLOBS.items():
  need(git('rev-parse','HEAD:'+path)==pin and git('hash-object',path)==pin,'published blob drift: '+path)
 for path,pin in ((SRC,SRC_SHA),(TEST,TEST_SHA)):
  item=ROOT/path
  need(item.is_file() and not item.is_symlink() and sha(item.read_bytes())==pin,'source changed: '+path)
 need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),'runner missing')
 doc=(ROOT/'ROADMAP.md').read_text(encoding='utf-8').splitlines()
 need(doc.count('- [ ] 2.6 AG-UI')==1 and
      doc.count('  - [ ] 2.6Z AG-UI supervised service execution and persistent policy enforcement gates')==1,
      'roadmap anchor changed or parent closed')
 need(schema.is_file() and not schema.is_symlink(),'official schema absent')
 raw=schema.read_bytes()
 need(sha(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,'schema pins changed')
 s=json.loads(raw);need(s.get('$id')=='https://ag-ui.com/spec/1.0/schema.json' and
  len(s['$defs']['Event']['oneOf'])==31,'schema id/events changed')
 print('PASS: pinned official AG-UI 1.0 schema and 31 variants',flush=True)
 print('PASS: exact 2ed262d HEAD/origin, ten Git blobs, workshop, three 2.6Z sources',flush=True)
 print('PASS: read-only preflight; no systemd or Git mutations',flush=True)

# Code is copied to unique /run directory and executed by a genuine transient
# systemd SYSTEM service with User=61001/Group=61002. Separate from runner.
WORKER=r'''
import ctypes,hashlib,json,os,resource,socket,sqlite3,struct,sys
from pathlib import Path
base=Path(sys.argv[1]);data=base/'data';sp=base/'socket'/'owner.sock'
# systemd/glibc initgroups may repeat the effective primary GID in getgroups().
# Reject every additional supplementary GID, preserving the UID/GID checks.
assert os.geteuid()==61001 and os.getegid()==61002 and set(os.getgroups()).issubset({os.getegid()})
os.umask(0o077)
libc=ctypes.CDLL(None,use_errno=True)
assert libc.prctl(38,1,0,0,0)==0
assert libc.prctl(4,0,0,0,0)==0
resource.setrlimit(resource.RLIMIT_CORE,(0,0))
def opendb(name):return sqlite3.connect(str(data/name),timeout=3,isolation_level=None)
with opendb('authority.sqlite3') as conn:
 conn.execute('BEGIN IMMEDIATE');conn.execute('UPDATE control SET boot_epoch=boot_epoch+1 WHERE id=1')
 boot=conn.execute('SELECT boot_epoch FROM control WHERE id=1').fetchone()[0];conn.commit()
with opendb('authority.sqlite3') as conn:
 stage=conn.execute('SELECT journal FROM control WHERE id=1').fetchone()[0]
 if stage=='prepared':
  with opendb('node-A.sqlite3') as a,opendb('node-B.sqlite3') as b:
   ar=a.execute('SELECT run,revision,digest FROM receipts ORDER BY revision').fetchall()
   br=b.execute('SELECT run,revision,digest FROM receipts ORDER BY revision').fetchall()
   assert br==ar
   assert b.execute('SELECT revision,role,epoch FROM state WHERE id=1').fetchone()==(len(ar),'leader',2)
  conn.execute("UPDATE control SET journal='stable',leader='node-B',epoch=2 WHERE id=1")
  conn.commit()
sp.unlink(missing_ok=True)
sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);sock.bind(str(sp));os.chmod(sp,0o660);sock.listen(16)
def answer(req):
 if not isinstance(req,dict) or set(req)!={'op'}:return {'reply':'shape-denied'}
 k=req.get('op')
 if k=='health':
  st=Path('/proc/self/status').read_text()
  return {'reply':'alive','boot_epoch':boot,'pid':os.getpid(),'uid':os.geteuid(),
   'no_new_privs':'NoNewPrivs:\t1' in st,'cap_eff_zero':'CapEff:\t0000000000000000' in st,
   'cap_bnd_zero':'CapBnd:\t0000000000000000' in st}
 if k=='reconcile':
  with opendb('node-A.sqlite3') as c:
   n=c.execute("SELECT COUNT(*) FROM receipts WHERE run='r2'").fetchone()[0]
  return {'reply':'reconciled' if n==1 else 'receipt-absent','receipt_count':n}
 if k=='commit-crash':
  with opendb('authority.sqlite3') as ctl:
   leader,epoch,journal=ctl.execute('SELECT leader,epoch,journal FROM control WHERE id=1').fetchone()
   if (leader,epoch,journal)!=('node-A',1,'stable'):return {'reply':'stale-denied'}
   with opendb('node-A.sqlite3') as a:
    a.execute('BEGIN IMMEDIATE')
    a.execute('INSERT INTO receipts VALUES(?,?,?)',('r2',2,hashlib.sha256(b'r2').hexdigest()))
    a.execute('UPDATE state SET revision=2 WHERE id=1');a.commit()
  os._exit(93)
 if k=='promote-crash':
  with opendb('authority.sqlite3') as ctl:
   leader,epoch,journal=ctl.execute('SELECT leader,epoch,journal FROM control WHERE id=1').fetchone()
   if (leader,epoch,journal)!=('node-A',1,'stable'):return {'reply':'stale-denied'}
   ctl.execute('BEGIN IMMEDIATE');ctl.execute("UPDATE control SET journal='prepared' WHERE id=1");ctl.commit()
  with opendb('node-A.sqlite3') as a,opendb('node-B.sqlite3') as b:
   ar=a.execute('SELECT run,revision,digest FROM receipts ORDER BY revision').fetchall()
   assert len(ar)==2
   b.execute('BEGIN IMMEDIATE')
   for run,rev,digest in ar[1:]:b.execute('INSERT INTO receipts VALUES(?,?,?)',(run,rev,digest))
   b.execute("UPDATE state SET revision=2,role='leader',epoch=2 WHERE id=1");b.commit()
  os._exit(94)
 if k=='stale-write':
  with opendb('authority.sqlite3') as ctl:
   return {'reply':'stale-denied' if ctl.execute('SELECT leader,epoch FROM control WHERE id=1').fetchone()!=('node-A',1) else 'error'}
 return {'reply':'operation-denied'}
while True:
 con,_=sock.accept()
 with con:
  con.settimeout(0.35)
  try:
   _pid,uid,_gid=struct.unpack('3i',con.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
   if uid!=61002:rep={'reply':'peer-denied'}
   else:
    buf=b''
    while len(buf)<1025 and b'\n' not in buf:
     chunk=con.recv(256)
     if not chunk:break
     buf+=chunk
    if len(buf)>1024:rep={'reply':'oversized-denied'}
    else:
     try:rep=answer(json.loads(buf.split(b'\n',1)[0]))
     except (ValueError,TypeError,KeyError,sqlite3.Error):rep={'reply':'invalid-denied'}
   con.sendall((json.dumps(rep)+'\n').encode())
  except (ValueError,TypeError,OSError,sqlite3.Error):
   try:con.sendall(b'{"reply":"invalid-denied"}\n')
   except OSError:pass
'''
CLIENT_PROGRAM=r'''
import json,os,socket,sys,time
sp=sys.argv[1];data=sys.argv[2];mode=sys.argv[3]
res={'uid':os.geteuid()}
try:
 f=os.open(data+'/node-A.sqlite3',os.O_RDWR);os.close(f);res['direct']='BYPASS'
except OSError:res['direct']='denied'
try:
 with socket.socket(socket.AF_UNIX) as s:
  s.settimeout(1.5);s.connect(sp)
  if mode=='idle':time.sleep(.6)
  else:s.sendall((mode+'\n').encode())
  buf=s.recv(1024);res['reply']=json.loads(buf) if buf else {'reply':'lost-ack'}
except (OSError,ValueError):res['reply']={'reply':'connection-denied'}
print(json.dumps(res,sort_keys=True))
'''

def run_command(cmd,timeout=15,check=True):
 p=subprocess.run(cmd,capture_output=True,text=True,timeout=timeout)
 if check:need(p.returncode==0,'command error: '+repr(cmd[:4])+' / '+p.stderr[-600:])
 return p

def unit_properties(unit):
 p=run_command(['systemctl','show',unit,'--no-pager','--property=Id,ActiveState,SubState,MainPID,User,Group,Restart,NoNewPrivileges,ProtectSystem,ProtectHome,PrivateTmp,UMask,LimitNOFILE,CapabilityBoundingSet,AmbientCapabilities'],timeout=9)
 return dict(x.split('=',1) for x in p.stdout.splitlines() if '=' in x)

from contextlib import contextmanager as _masl26z_contextmanager

@_masl26z_contextmanager
def _masl26z_transient_userdb():
 """Scoped NSS drop-ins: conflict precheck, exclusive creation, and inode-checked cleanup."""
 import grp as _grp
 import stat as _stat
 db=Path('/run/userdb')
 users=((OWNER,'masl26zowner'),(CLIENT,'masl26zclient'),(OUTSIDER,'masl26zoutsider'))
 groups=((OWNER,'masl26zownergroup'),(CLIENT,'masl26zclientgroup'),(OUTSIDER,'masl26zoutsidergroup'))
 def unused(fn,key,kind):
  try:fn(key)
  except KeyError:return
  raise RuntimeError('BLOCKED: transient userdb '+kind+' conflict: '+str(key))
 need(os.geteuid()==0,'transient userdb requires root helper')
 for uid,name in users:
  unused(pwd.getpwuid,uid,'UID');unused(pwd.getpwnam,name,'username')
 for gid,name in groups:
  unused(_grp.getgrgid,gid,'GID');unused(_grp.getgrnam,name,'groupname')
 records=[]
 for uid,name in users:
  records.append((name+'.user',{'userName':name,'uid':uid,'gid':uid,
    'homeDirectory':'/','shell':'/usr/sbin/nologin'},str(uid)+'.user'))
 for gid,name in groups:
  records.append((name+'.group',{'groupName':name,'gid':gid},str(gid)+'.group'))
 names=[f for filename,_,link in records for f in (filename,link)]
 need(len(names)==len(set(names)),'duplicate userdb names')
 created_dir=False
 made=[]
 def cleanup():
  failures=[]
  for path,islink,identity,target in reversed(made):
   try:
    current=path.lstat()
    if (current.st_dev,current.st_ino)!=identity or _stat.S_ISLNK(current.st_mode)!=islink:
     raise RuntimeError('drop-in replaced externally: '+str(path))
    if islink and os.readlink(path)!=target:
     raise RuntimeError('drop-in link target changed: '+str(path))
    path.unlink()
   except (OSError,RuntimeError) as exc:
    failures.append(str(exc))
  if created_dir:
   try:db.rmdir()
   except OSError as exc:failures.append(str(exc))
  if failures:
   raise RuntimeError('BLOCKED: transient userdb cleanup incomplete: '+'; '.join(failures))
 try:
  if not db.exists() and not db.is_symlink():
   try:
    db.mkdir(mode=0o755);created_dir=True
    db.chmod(0o755)  # 077 shell umask must not hide NSS drop-ins from other UIDs
   except FileExistsError:pass
  need(db.is_dir() and not db.is_symlink() and db.stat().st_uid==0 and
       db.stat().st_mode & 0o022==0 and db.stat().st_mode & 0o005==0o005,
       'unsafe or inaccessible /run/userdb directory')
  need(all(not (db/n).exists() and not (db/n).is_symlink() for n in names),
       'transient userdb drop-in path already exists')
  for filename,obj,linkname in records:
   path=db/filename
   fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
   st=os.fstat(fd)
   made.append((path,False,(st.st_dev,st.st_ino),''))
   with os.fdopen(fd,'wb') as handle:
    os.fchmod(handle.fileno(),0o644)
    handle.write((json.dumps(obj,sort_keys=True)+'\n').encode())
    handle.flush();os.fsync(handle.fileno())
   link=db/linkname
   os.symlink(filename,link)
   st=link.lstat()
   made.append((link,True,(st.st_dev,st.st_ino),filename))
  for uid,name in users:
   p=pwd.getpwuid(uid)
   need(p.pw_name==name and p.pw_uid==uid and p.pw_gid==uid,
        'transient NSS UID lookup mismatch: '+str(uid))
  for gid,name in groups:
   g=_grp.getgrgid(gid)
   need(g.gr_name==name and g.gr_gid==gid,
        'transient NSS GID lookup mismatch: '+str(gid))
  print('NSS_READY: 2.6Z temporary user/group records resolve exactly; no persistent accounts',flush=True)
  yield
 finally:
  cleanup()


def supervised_fixture(dest:Path):
 need(sys.platform.startswith('linux') and os.geteuid()==0,'root helper and Linux required')
 need(Path('/proc/1/comm').read_text().strip()=='systemd','PID 1 must be real systemd; refuse simulated PASS')
 need(shutil.which('systemd-run') and shutil.which('systemctl') and shutil.which('setpriv'),
      'systemd-run/systemctl/setpriv required')
 with _masl26z_transient_userdb():
  return _masl26z_supervised_body(dest)


def _masl26z_supervised_body(dest:Path):
 for uid,expected in ((OWNER,'masl26zowner'),(CLIENT,'masl26zclient'),(OUTSIDER,'masl26zoutsider')):
  need(pwd.getpwuid(uid).pw_name==expected,'registered fixture UID drift: '+str(uid))
 need(dest.parent.is_dir() and not dest.parent.is_symlink() and not dest.exists() and not dest.is_symlink(),
      'proof path exists, parent absent, or symlink')
 count=0
 def ok(v,label):
  nonlocal count
  need(bool(v),'2.6Z physical assertion: '+label)
  count+=1;print('PASS: '+label,flush=True)
 base=Path(tempfile.mkdtemp(prefix='masl26z-',dir='/run'))
 unit='masl26z-'+uuid.uuid4().hex[:16]+'.service'
 started=False
 try:
  base.chmod(0o755)
  worker=base/'worker.py';worker.write_text(WORKER);worker.chmod(0o644)
  sd=base/'socket';sd.mkdir(mode=0o711);os.chown(sd,OWNER,OWNER);sd.chmod(0o711)
  data=base/'data';data.mkdir(mode=0o700);os.chown(data,OWNER,OWNER);data.chmod(0o700)
  dbs=[data/n for n in ('authority.sqlite3','node-A.sqlite3','node-B.sqlite3')]
  with sqlite3.connect(dbs[0]) as c:
   c.executescript("CREATE TABLE control(id INTEGER PRIMARY KEY,leader TEXT,epoch INT,boot_epoch INT,journal TEXT);INSERT INTO control VALUES(1,'node-A',1,0,'stable');")
  for path,role in ((dbs[1],'leader'),(dbs[2],'standby')):
   with sqlite3.connect(path) as c:
    c.executescript('CREATE TABLE state(id INTEGER PRIMARY KEY,revision INT,role TEXT,epoch INT);CREATE TABLE receipts(run TEXT PRIMARY KEY,revision INT UNIQUE,digest TEXT);')
    c.execute('INSERT INTO state VALUES(1,1,?,1)',(role,));c.execute('INSERT INTO receipts VALUES(?,?,?)',('r1',1,hashlib.sha256(b'r1').hexdigest()));c.commit()
  for p in dbs:os.chown(p,OWNER,OWNER);p.chmod(0o600)
  cmd=['systemd-run','--unit='+unit,'--collect','--service-type=simple',
       '--property=User=61001','--property=Group=61002','--property=Restart=on-failure',
       '--property=RestartSec=200ms','--property=NoNewPrivileges=yes',
       '--property=CapabilityBoundingSet=','--property=AmbientCapabilities=',
       '--property=ProtectSystem=strict','--property=ReadWritePaths='+str(base),
       '--property=ProtectHome=yes','--property=PrivateTmp=yes',
       '--property=RestrictAddressFamilies=AF_UNIX','--property=UMask=0077',
       '--property=LimitNOFILE=128','--property=ProtectKernelTunables=yes',
       '--property=ProtectControlGroups=yes','--property=ProtectKernelModules=yes',
       '--','/usr/bin/python3',str(worker),str(base)]
  p=run_command(cmd,timeout=12);started=True
  ok('Running as unit' in p.stdout or p.returncode==0,'actual systemd-run transient service launched')
  sp=sd/'owner.sock'
  def wait_boot(expected,old_pid=0,old_inode=0):
   for _ in range(200):
    props=unit_properties(unit)
    pid=int(props.get('MainPID','0') or 0)
    try:
     with sqlite3.connect(dbs[0]) as c:epoch=c.execute('SELECT boot_epoch FROM control').fetchone()[0]
    except sqlite3.OperationalError:epoch=0
    if epoch>=expected and pid>1 and pid!=old_pid and sp.is_socket() and sp.stat().st_ino!=old_inode:
     return props,epoch,sp.stat().st_ino
    time.sleep(.08)
   raise RuntimeError('BLOCKED: systemd unit failed to restart or advance persisted boot_epoch')
  props,boot1,ino1=wait_boot(1)
  ok(props.get('ActiveState')=='active' and props.get('SubState')=='running','systemd reports actual active service')
  ok(props.get('User')=='61001' and props.get('Group')=='61002','systemd applied distinct owner/client identity')
  ok(props.get('NoNewPrivileges')=='yes','systemd effective NoNewPrivileges=yes')
  ok(props.get('ProtectSystem')=='strict' and props.get('ProtectHome')=='yes','systemd protection properties enforced')
  ok(props.get('PrivateTmp')=='yes','systemd effective PrivateTmp=yes')
  ok(props.get('Restart')=='on-failure','systemd effective Restart=on-failure')
  ok(props.get('UMask')=='0077','systemd effective UMask 0077')
  ok(boot1==1,'first systemd-owned boot persisted as 1')
  ok(data.stat().st_uid==OWNER and stat.S_IMODE(data.stat().st_mode)==0o700,'storage directory owned by UID61001 mode0700')
  ok(all(x.stat().st_uid==OWNER and stat.S_IMODE(x.stat().st_mode)==0o600 for x in dbs),'three physical SQLite files owned/mode0600')
  ok(sp.stat().st_uid==OWNER and sp.stat().st_gid==CLIENT and stat.S_IMODE(sp.stat().st_mode)==0o660,'socket GID61002 and mode0660 enforced')
  pid1=int(props['MainPID'])
  status=Path('/proc/'+str(pid1)+'/status').read_text()
  ok('NoNewPrivs:\t1' in status,'live systemd MainPID has kernel NoNewPrivs=1')
  ok(re.search(r'(?m)^CapEff:\s*0+$',status) is not None and re.search(r'(?m)^CapBnd:\s*0+$',status) is not None,'live owner effective/bounding capabilities zero')
  ok(len(run_command(['systemctl','cat',unit],timeout=9).stdout)>0,'unit visible via systemd manager, not static candidate only')
  def client(uid,raw,timeout=5):
   pr=run_command(['setpriv','--reuid',str(uid),'--regid',str(uid),'--clear-groups',
     '/usr/bin/python3','-c',CLIENT_PROGRAM,str(sp),str(data),raw],timeout=timeout)
   return json.loads(pr.stdout)
  health=client(CLIENT,'{"op":"health"}')
  ok(health['direct']=='denied' and health['reply']['reply']=='alive','authorized different-UID client uses RPC and cannot open SQLite')
  ok(health['reply']['boot_epoch']==1 and health['reply']['uid']==OWNER,'RPC owner UID and first boot match')
  outsiders=client(OUTSIDER,'{"op":"health"}')
  ok(outsiders['reply']['reply']=='connection-denied','outsider cannot connect through socket DAC')
  sp.chmod(0o666)
  outsiders=client(OUTSIDER,'{"op":"health"}')
  ok(outsiders['reply']['reply']=='peer-denied','SO_PEERCRED rejects outsider if socket DAC relaxed')
  sp.chmod(0o660)
  before=[list(sqlite3.connect(x).execute('SELECT * FROM receipts ORDER BY revision')) for x in dbs[1:]]
  ok(client(CLIENT,'{broken')['reply']['reply']=='invalid-denied','hostile malformed JSON rejected')
  ok(client(CLIENT,'[]')['reply']['reply']=='shape-denied','hostile list JSON rejected')
  ok(client(CLIENT,'{"op":"unknown"}')['reply']['reply']=='operation-denied','unsupported RPC denied')
  ok(client(CLIENT,'{"op":"health","extra":"x"}')['reply']['reply']=='shape-denied',
     'unexpected RPC fields rejected by strict owner envelope')
  oversized='{"x":"'+'x'*1080+'"}'
  ok(client(CLIENT,oversized)['reply']['reply']=='oversized-denied','oversized hostile frame denied')
  ok(client(CLIENT,'idle')['reply']['reply'] in ('invalid-denied','connection-denied'),'idle socket closes without write')
  after=[list(sqlite3.connect(x).execute('SELECT * FROM receipts ORDER BY revision')) for x in dbs[1:]]
  ok(before==after,'hostile traffic does not mutate durable receipt state')
  props_before=unit_properties(unit)
  ok(props_before.get('ActiveState')=='active','systemd service survives hostile probes')
  crash=client(CLIENT,'{"op":"commit-crash"}')
  ok(crash['reply']['reply'] in ('lost-ack','connection-denied'),'commit crash loses ACK')
  props2,boot2,ino2=wait_boot(2,pid1,ino1)
  ok(boot2==2 and ino2!=ino1,'systemd automatic restart changed socket inode and boot_epoch to 2')
  pid2=int(props2['MainPID'])
  ok(pid2!=pid1,'systemd MainPID changed after os._exit(93)')
  recon=client(CLIENT,'{"op":"reconcile"}')
  ok(recon['reply']=={'reply':'reconciled','receipt_count':1},'lost acknowledgment reconciled idempotently')
  with sqlite3.connect(dbs[1]) as c:rows=c.execute('SELECT run,revision FROM receipts ORDER BY revision').fetchall()
  ok(rows==[('r1',1),('r2',2)],'node-A has exactly two unique receipts after crash')
  crash2=client(CLIENT,'{"op":"promote-crash"}')
  ok(crash2['reply']['reply'] in ('lost-ack','connection-denied'),'prepared promotion crashes before authority commit')
  props3,boot3,ino3=wait_boot(3,pid2,ino2)
  ok(boot3==3 and ino3!=ino2,'second systemd automatic restart persists boot_epoch=3')
  with sqlite3.connect(dbs[0]) as c:ctl=c.execute('SELECT leader,epoch,boot_epoch,journal FROM control').fetchone()
  ok(ctl==('node-B',2,3,'stable'),'recovery reconciles durable prepared promotion to node-B epoch2')
  ok(client(CLIENT,'{"op":"stale-write"}')['reply']['reply']=='stale-denied','obsolete leader rejected after recovery')
  with sqlite3.connect(dbs[2]) as c:br=c.execute('SELECT run,revision FROM receipts ORDER BY revision').fetchall();bs=c.execute('SELECT revision,role,epoch FROM state').fetchone()
  ok(br==[('r1',1),('r2',2)] and bs==(2,'leader',2),'standby caught up to two receipts and became leader')
  with sqlite3.connect(dbs[1]) as c:ar=c.execute('SELECT run,revision FROM receipts ORDER BY revision').fetchall()
  ok(ar==br,'selected final receipt prefix matches; no distributed consensus proven')
  final_props=unit_properties(unit)
  ok(final_props.get('User')=='61001' and final_props.get('Group')=='61002' and
     final_props.get('NoNewPrivileges')=='yes' and final_props.get('ProtectSystem')=='strict',
     'systemd enforced identity and service restrictions persist across two restarts')
  final_status=Path('/proc/'+final_props['MainPID']+'/status').read_text()
  ok('NoNewPrivs:\t1' in final_status and re.search(r'(?m)^CapEff:\s*0+$',final_status) is not None and
     re.search(r'(?m)^CapBnd:\s*0+$',final_status) is not None,
     'real restarted MainPID retains kernel privilege restrictions')
  ok(final_props.get('ActiveState')=='active','service remains active after second restart')
  run_command(['systemctl','stop',unit],timeout=12)
  started=False
  for p in dbs:
   with sqlite3.connect(p) as c:c.execute('PRAGMA wal_checkpoint(TRUNCATE)');need(c.execute('PRAGMA integrity_check').fetchone()[0]=='ok','SQLite integrity failed: '+p.name)
  ok(all(x.is_file() and x.stat().st_size>0 for x in dbs),'all three SQLite persisted physically after service stop')
  proof={'lab':'2.6Z','unit':unit,'service_manager':'systemd-system','transient_unit_started':True,
    'transient_unit_stopped':True,'unit_installed_persistently':False,
    'systemd_pid1_verified':True,'owner_uid':OWNER,'owner_primary_gid':CLIENT,'client_uid':CLIENT,
    'outsider_uid':OUTSIDER,'systemctl_properties':props3,'first_main_pid':pid1,
    'second_main_pid':pid2,'final_main_pid':int(props3['MainPID']),
    'boot_epochs':[boot1,boot2,boot3],'socket_inodes':[ino1,ino2,ino3],
    'no_new_privs_observed':True,'owner_caps_zero_observed':True,
    'cross_uid_storage_denied':True,'unauthorized_peer_denied':True,
    'hostile_receipts_unchanged':True,'hostile_owner_survived':True,
    'lost_ack_reconciled':True,'prepared_promotion_recovered':True,'stale_leader_denied':True,
    'root_bypass_prevented':False,'compromised_owner_prevented':False,
    'distributed_atomic_promotion':False,'production_service_deployed':False,
    'enterprise_issuer_acl_verified':False,'normative_agui_verified':False,
    'security_signoff':False,'operational_adapter_ready':False,
    'scope':'disposable-single-host-systemd-transient-service-only'}
  meta=base/'supervisor-proof.json';meta.write_text(json.dumps(proof,sort_keys=True)+'\n')
  properties=base/'effective-unit-properties.json';properties.write_text(json.dumps(props3,sort_keys=True)+'\n')
  fd=os.open(dest,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'wb') as handle,tarfile.open(fileobj=handle,mode='w',format=tarfile.USTAR_FORMAT) as tar:
   for p in dbs:tar.add(p,arcname=p.name,recursive=False)
   tar.add(meta,arcname=meta.name,recursive=False)
   tar.add(properties,arcname=properties.name,recursive=False)
  if os.environ.get('SUDO_UID','').isdigit():os.chown(dest,int(os.environ['SUDO_UID']),-1)
  dest.chmod(0o644)
  ok(dest.is_file(),'proof TAR written after both supervised service restarts')
  with tarfile.open(dest) as tar:
   ok([x.name for x in tar.getmembers()]==['authority.sqlite3','node-A.sqlite3','node-B.sqlite3','supervisor-proof.json','effective-unit-properties.json'],
      'proof TAR exact three SQLite and two machine observations')
 finally:
  if started:run_command(['systemctl','stop',unit],timeout=12,check=False)
  run_command(['systemctl','reset-failed',unit],timeout=8,check=False)
  shutil.rmtree(base,ignore_errors=True)
 print('SUPERVISOR_ASSERTIONS: '+str(count),flush=True)
 print('SUPERVISOR_PROOF_PATH: '+str(dest),flush=True)
 need(count==NEW_ASSERTIONS,'new supervised assertion count drift')

def prior_fixture(output):
 prior=ROOT/'scripts/lab-26y-service-review.py'
 spec=importlib.util.spec_from_file_location('masl_26y_prior',prior)
 need(spec is not None and spec.loader is not None,'published 2.6Y fixture unavailable')
 mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
 with tempfile.TemporaryDirectory(prefix='masl26z-prior-regression-') as folder:mod.fixture(Path(folder))

def fixture(out):
 prior_fixture(out)
 proof=out/'supervised-proof.tar';need(not proof.exists(),'proof exists')
 if os.geteuid()==0:supervised_fixture(proof)
 else:
  need(shutil.which('sudo') is not None,'sudo required')
  r=subprocess.run(['sudo','-n',sys.executable,str(ROOT/RUNNER),'--supervisor-child','--proof-path',str(proof)],
    stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=180)
  print(r.stdout,end='',flush=True)
  need(r.returncode==0,'sudo -n real systemd supervisor proof failed; authorize sudo -v first')
 need(proof.is_file() and not proof.is_symlink(),'physical systemd proof absent')
 print('SUPERVISOR_SCOPE: real ephemeral systemd service on one Linux host; no installed unit or production claim',flush=True)

def gate(name,command,cwd,path):
 with path.open('wb') as output:
  p=subprocess.run(command,cwd=cwd,stdout=output,stderr=subprocess.STDOUT,timeout=220)
 need(p.returncode==0,'gate failed: '+name+' (see '+str(path)+')')
 print('PASS: '+name+' SHA256 '+sha(path.read_bytes()),flush=True)

def run(schema,out):
 preflight(schema)
 need(not out.exists() and not out.is_symlink(),'evidence dir already exists')
 need(ROOT.resolve() not in out.resolve().parents,'evidence must remain outside Git')
 out.mkdir(parents=True,exist_ok=False)
 gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
 gate('build.log',['pnpm','build'],WEB,out/'build.log')
 ssr=out/'ssr'
 gate('compile.log',['pnpm','exec','vite','build','--ssr',
  'src/ag-ui/supervised-service-policy.spec.ts','--outDir',str(ssr),'--emptyOutDir'],WEB,out/'compile.log')
 (ssr/'package.json').write_text('{"type":"module"}\n')
 gate('pure.log',['node',str(ssr/'supervised-service-policy.spec.js')],WEB,out/'pure.log')
 pure=(out/'pure.log').read_text()
 match=re.findall(r'(?m)^ASSERTIONS: (\d+)$',pure)
 need(match and int(match[-1])==ASSERTIONS and pure.count('PASS: ')==ASSERTIONS,'TS assertion count mismatch')
 for marker in CRITICAL:need('PASS: '+marker in pure,'missing TS critical marker '+marker)
 gate('fixture.log',[sys.executable,str(ROOT/RUNNER),'--fixture-child','--output-dir',str(out)],ROOT,out/'fixture.log')
 lg=(out/'fixture.log').read_text()
 mm=re.search(r'(?m)^SUPERVISOR_ASSERTIONS: (\d+)$',lg)
 need(mm and int(mm.group(1))==NEW_ASSERTIONS,'supervisor proof count mismatch')
 need(lg.count('PASS: ')==PRIOR_ASSERTIONS+NEW_ASSERTIONS,'full regression count drift')
 need('SUPERVISOR_SCOPE: real ephemeral systemd service' in lg,'not a real systemd proof')
 proof=out/'supervised-proof.tar'
 need(proof.is_file() and not proof.is_symlink(),'supervised proof TAR missing')
 preflight(schema)
 logs={k:sha((out/k).read_bytes()) for k in ('lint.log','build.log','compile.log','pure.log','fixture.log')}
 report={'lab':'2.6Z','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
  'agui_upstream_commit':UPSTREAM,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
  'published_git_blobs':BLOBS,'typescript_assertions':ASSERTIONS,
  'fixture_assertions':PRIOR_ASSERTIONS+NEW_ASSERTIONS,'previous_fixture_assertions':PRIOR_ASSERTIONS,
  'new_supervisor_assertions':NEW_ASSERTIONS,'critical_cases':len(CRITICAL),
  'gate_logs_sha256':logs,'supervisor_proof_sha256':sha(proof.read_bytes()),
  'source_sha256':{k:sha((ROOT/k).read_bytes()) for k in (SRC,TEST,RUNNER)},
  'real_ephemeral_systemd_supervision_verified':True,
  'kernel_service_properties_observed':True,'cross_uid_dac_verified':True,
  'peer_credentials_verified':True,'hostile_client_selected_isolation_verified':True,
  'service_restarted_automatically_twice':True,'lost_ack_reconciled':True,
  'crash_interrupted_promotion_recovered':True,
  'unit_installed_persistently':False,'production_service_deployed':False,
  'root_bypass_prevented':False,'compromised_owner_prevented':False,
  'distributed_atomic_promotion_verified':False,'enterprise_issuer_acl_verified':False,
  'normative_agui_conformance_verified':False,'enterprise_security_signoff':False,
  'adapter_ready':False,'parent_2_6_open':True,'gap_ids_open':['G'+str(i) for i in range(1,10)],
  'limits':['Ephemeral systemd-run system service, not a persistent installed or deployed unit',
   'Root and compromised storage owner remain outside unprivileged DAC boundary',
   'Three SQLite files on one Linux host; cross-store promotion not atomic',
   'Hostile requests are selected probes, not full DoS/security attestation',
   'No production issuer/ACL, normative AG-UI 1.0, media/DLP, signoff or Agent Server adapter',
   'G1-G9 and parent 2.6 OPEN; adapter BLOCKED'],
  'timestamp_utc':datetime.now(timezone.utc).isoformat()}
 (out/'review.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
 (out/'review.md').write_text('# MASL 2.6Z isolated transient systemd service audit\n\n'
  'Five gates PASS, '+str(ASSERTIONS)+' TypeScript assertions, '+str(PRIOR_ASSERTIONS+NEW_ASSERTIONS)+
  ' Python assertions, '+str(len(CRITICAL))+' critical checks.\n\n'
  'systemd-run executed a transient system service under numeric nonroot UIDs; '
  'verified manager properties, /proc kernel privileges, two real automatic restarts, '
  'socket rotation, hostile clients and three persisted SQLite databases.\n\n'
  '**NOT proven:** persistent installed unit, root/owner compromise prevention, distributed atomicity, '
  'enterprise identity, normative AG-UI, media/DLP, security signoff or operational adapter.\n\n'
  '**G1–G9 OPEN; parent 2.6 OPEN; adapter BLOCKED.**\n')
 for name in ('review.json','review.md','supervised-proof.tar'):
  print('EVIDENCE: '+name+' SHA256 '+sha((out/name).read_bytes()),flush=True)
 print('REVIEW STATUS: PASS — 2.6Z real disposable systemd supervision and hostile clients; adapter BLOCKED, 2.6 OPEN',flush=True)
 print('EVIDENCE DIRECTORY: '+str(out),flush=True)

def main():
 p=argparse.ArgumentParser(description=__doc__)
 g=p.add_mutually_exclusive_group(required=True)
 g.add_argument('--preflight',action='store_true');g.add_argument('--run',action='store_true')
 g.add_argument('--fixture-child',action='store_true');g.add_argument('--supervisor-child',action='store_true')
 p.add_argument('--schema',type=Path,default=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json')
 p.add_argument('--output-dir',type=Path);p.add_argument('--proof-path',type=Path)
 a=p.parse_args()
 try:
  if a.preflight:preflight(a.schema)
  elif a.run:
   need(a.output_dir is not None,'output-dir required');run(a.schema,a.output_dir.expanduser().absolute())
  elif a.fixture_child:
   need(a.output_dir is not None,'output-dir required');fixture(a.output_dir)
  else:
   need(a.proof_path is not None,'proof-path required');supervised_fixture(a.proof_path)
 except (RuntimeError,ValueError,KeyError,TypeError,PermissionError,subprocess.TimeoutExpired,subprocess.CalledProcessError,OSError,sqlite3.Error) as e:
  print(str(e) if str(e).startswith('BLOCKED:') else 'BLOCKED: '+str(e),file=sys.stderr)
  raise SystemExit(2) from None
if __name__=='__main__':main()
