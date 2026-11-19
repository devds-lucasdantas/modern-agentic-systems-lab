#!/usr/bin/env python3
"""MASL 2.6T: selected pure TS + separate local external-writer fencing and two SQLite replicas with a separate local authority.

Read-only --preflight. --run writes exactly eight evidence artifacts OUTSIDE Git.
The fixture uses three independently created SQLite files (one authority, two replicas)
ON ONE HOST, and a disposable independent test RSA root. Authority locking
serializes selected local commit admission against promotion only within the
test API. It does NOT make arbitrary writers obey fencing or provide consensus.
NO consensus, quorum, network-separated durable replication, enterprise PKI,
operational Agent Server, live AG-UI producer or external service is present.
"""
from __future__ import annotations
import argparse
from datetime import datetime,timezone
from hashlib import sha1,sha256
import importlib.util
from contextlib import closing
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
HEAD='32e129bd72a111cab3c0d36f2dd152071880219c'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
UPSTREAM='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/external-fencing-consistency.ts'
TEST='apps/web/src/ag-ui/external-fencing-consistency.spec.ts'
RUNNER='scripts/lab-26t-fencing-review.py'
SRC_SHA='4c24fdc9eee353f021d097265fe0081167b34bf75f9fd56f8a650a1f5b7d83e5'
TEST_SHA='6aaff939a0c3907e00e11c4b0a0f4c555be7d61f4d1b721f982a8b13f7510f3a'
ASSERTIONS=250
FIXTURE_ASSERTIONS=43
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'221163b3b417fc772509d9809206e84f0792f5c2',
 'CURRENT.md':'7a2fc47510e6f514aa9e3b300c652ce1eb5d17ab',
 'docs/journal/lab-23-ag-ui.md':'ecf1b755e18bba8adabdf98dad274617e2f96a68',
 'apps/web/src/ag-ui/producer-trust-replicas.ts':'9445ec8eb77c835ef7a09e2e6c830b90b0c24b6c',
 'apps/web/src/ag-ui/producer-trust-replicas.spec.ts':'bb24c424998de1d1dbdb925c2d4abb4f4eedd319',
 'scripts/lab-26s-replica-review.py':'5217b0ccc90f3c9fbf0b03889babcad810aa21fc',
 'apps/web/src/ag-ui/producer-failover-evidence.ts':'44152048a3bd515de8ff9d05858b6ae225a41623',
 'apps/web/src/ag-ui/authenticated-transport-readiness.ts':'706ac518efda3006b24073af32c613418165416d',
 'apps/web/src/ag-ui/cross-service-recovery.ts':'42dba15a2279e3a027574f4587214f21dc9040ad',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
}
CRITICAL=(
 'published 2.6S pure replica chain composes after fencing prechecks',
 'one authority ticket replica and published root read in order',
 'bad authority does not read fencing ticket',
 'misbound tickets do not read replicas',
 'divergent replica cannot enter published producer chain',
 'coherently rotated fixture leader and epoch accepted as pure plan',
 'old ticket denied after authority epoch advancement',
 'published 2.6S signed producer receipt reconciliation still composes',
 'published root revocation remains enforced',
 'all G1-G9 remain OPEN after external authority fixtures',
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
         'published 2.6S HEAD/origin differs')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked/index changes detected')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'exactly three 2.6T untracked files required')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop differs')
    for path,pin in BLOBS.items():
        need(git('rev-parse','HEAD:'+path)==pin and git('hash-object',path)==pin,
             'published Git blob differs: '+path)
    for path,pin in ((SRC,SRC_SHA),(TEST,TEST_SHA)):
        f=ROOT/path
        need(f.is_file() and not f.is_symlink() and sha(f.read_bytes())==pin,
             '2.6T source SHA drift: '+path)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),
         '2.6T runner missing/symlink')
    road=(ROOT/'ROADMAP.md').read_text(encoding='utf8').splitlines()
    need(road.count('- [ ] 2.6 AG-UI')==1 and
         road.count('  - [ ] 2.6T AG-UI external fencing and replica-consistency evidence gates')==1,
         '2.6 parent or 2.6T pending roadmap anchor differs')
    schema_gate(schema)
    need(subprocess.run(['openssl','version'],stdout=subprocess.DEVNULL,
         stderr=subprocess.DEVNULL,check=False).returncode==0,'OpenSSL CLI required')
    print('PASS: exact 32e129b HEAD/origin, ten Git blobs, pinned workshop, three 2.6T files',flush=True)
    print('PASS: read-only preflight; no external network, Git write, Agent Server or enterprise identity',flush=True)


# Reuse all 2.6S local RS256, signed-producer, replica and SQLite semantics.
# The new authority is a THIRD independently created SQLite file on ONE host.
# An authority BEGIN IMMEDIATE remains held across each chosen replica write;
# promotion takes the same lock, preventing a stale writer *through this API*.
# A direct SQLite writer bypasses this harness: no real distributed fencing.
def prior():
    spec=importlib.util.spec_from_file_location('masl_pinned_26s',ROOT/'scripts/lab-26s-replica-review.py')
    need(spec is not None and spec.loader is not None,'published 2.6S helper unavailable')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

AUTH_SCHEMA='''
CREATE TABLE authority(id INTEGER PRIMARY KEY CHECK(id=1),authority_id TEXT NOT NULL,
 storage_id TEXT NOT NULL,leader TEXT NOT NULL,epoch INTEGER NOT NULL,
 revocation_epoch INTEGER NOT NULL, nonce INTEGER NOT NULL);
INSERT INTO authority VALUES(1,'fixture-fencing-authority','db-control','node-A',1,2,1);
'''

def auth_connection(path:Path)->sqlite3.Connection:
    # mode=rw prevents silently creating an empty replacement for an outage.
    c=sqlite3.connect(f'file:{path}?mode=rw',uri=True,timeout=10,isolation_level=None)
    c.execute('PRAGMA busy_timeout=10000')
    return c

def create_authority(path:Path)->None:
    need(not path.exists(),'authority DB already exists')
    with closing(sqlite3.connect(path,isolation_level=None)) as db:
        need(db.execute('PRAGMA journal_mode=WAL').fetchone()[0]=='wal','authority WAL unavailable')
        db.execute('PRAGMA synchronous=FULL')
        db.executescript(AUTH_SCHEMA)

def auth_state(path:Path)->tuple:
    with closing(auth_connection(path)) as c:
        return c.execute('SELECT authority_id,storage_id,leader,epoch,revocation_epoch,nonce '
                         'FROM authority WHERE id=1').fetchone()

def mint_ticket(crypto,root_private:Path,leader:str,epoch:int,nonce:int=1,
                revocation:int=2,expires:int=1_000_110)->dict:
    body={'kind':'fixture-fencing-grant','authorityId':'fixture-fencing-authority',
          'leaderId':leader,'leaderEpoch':epoch,'revocationEpoch':revocation,
          'nonce':nonce,'issuedAt':1_000_050,'expiresAt':expires}
    return {'body':body,'signature':crypto.sign(root_private,body)}

def ticket_status(crypto,root_public:Path,token:object)->str:
    if not isinstance(token,dict) or set(token)!={'body','signature'} or \
       not isinstance(token['body'],dict):return 'fencing-token-shape-denied'
    body=token['body']
    if set(body)!={'kind','authorityId','leaderId','leaderEpoch','revocationEpoch',
                  'nonce','issuedAt','expiresAt'}:return 'fencing-token-shape-denied'
    if not crypto.verify(root_public,body,token['signature']):return 'fencing-token-signature-denied'
    if body['kind']!='fixture-fencing-grant' or body['authorityId']!='fixture-fencing-authority' or \
       type(body['leaderId']) is not str or body['leaderId'] not in ('node-A','node-B') or \
       any(type(body[k]) is not int or body[k]<0 for k in
           ('leaderEpoch','revocationEpoch','nonce','issuedAt','expiresAt')):
        return 'fencing-token-policy-denied'
    if body['issuedAt']>1_000_055 or body['expiresAt']<=1_000_055 or \
       body['expiresAt']-body['issuedAt']>120:return 'fencing-token-expired'
    return 'fencing-token-verified'

def fenced_commit(auth:Path,node:Path,which:str,root_pub:Path,producer_pub:Path,
                  manifest:dict,event:dict,ticket:object,fault:str='none')->str:
    s=prior();crypto=s.prior()
    status=ticket_status(crypto,root_pub,ticket)
    if status!='fencing-token-verified':return status
    if s.verify_event(crypto,producer_pub,manifest,root_pub,event)!='producer-event-verified':
        return 'producer-event-untrusted'
    try:
        with closing(auth_connection(auth)) as c:
            c.execute('BEGIN IMMEDIATE')
            try:
                row=c.execute('SELECT authority_id,storage_id,leader,epoch,revocation_epoch,nonce '
                              'FROM authority WHERE id=1').fetchone()
                body=ticket['body'];envelope=event['envelope']
                if row is None:return 'authority-state-missing'
                if row[1] in ('db-A','db-B'):
                    return 'authority-storage-not-independent'
                if row[2]!=which or row[2]!=body['leaderId'] or \
                   row[3]!=body['leaderEpoch'] or row[3]!=envelope['leaderEpoch'] or \
                   row[4]!=body['revocationEpoch'] or row[4]!=envelope['revocationEpoch'] or \
                   row[5]!=body['nonce']:
                    return 'writer-fenced-authority'
                # The SAME authority transaction remains locked until this
                # local replica commit returns. Promotion also locks authority.
                return s.leader_commit(node,producer_pub,root_pub,manifest,event,fault=fault)
            finally:
                if c.in_transaction:c.execute('ROLLBACK')
    except sqlite3.Error:return 'authority-unavailable-fail-closed'

def promote(auth:Path,old:Path,new:Path,which:str,epoch:int,
            fail_before_promotion:bool=False)->str:
    s=prior()
    try:
        with closing(auth_connection(auth)) as c:
            c.execute('BEGIN IMMEDIATE')
            try:
                row=c.execute('SELECT authority_id,storage_id,leader,epoch,revocation_epoch,nonce '
                              'FROM authority WHERE id=1').fetchone()
                if row is None:return 'authority-state-missing'
                if row[2]!=which or row[3]!=epoch-1:return 'promotion-epoch-conflict'
                oldstate=s.state(old);newstate=s.state(new)
                if oldstate[:3]!=newstate[:3] or oldstate[4]!=newstate[4]:
                    return 'standby-stale-or-divergent'
                if newstate[3]!=(epoch-1,'standby') or oldstate[3]!=(epoch-1,'leader'):
                    return 'replica-role-or-epoch-invalid'
                if row[4]!=newstate[2][0]:return 'revocation-epoch-divergent'
                if fail_before_promotion:return 'promotion-injected-before-write'
                # This is a SIMULATION of an atomic promotion. SQLite does NOT
                # provide an atomic cross-DB commit; a crash between the local
                # role update and authority update remains an explicit gap.
                with closing(s.connect(new)) as target:
                    target.execute('BEGIN IMMEDIATE')
                    target.execute("UPDATE control SET leader_epoch=?,role='leader' WHERE id=1",(epoch,))
                    target.execute('COMMIT')
                c.execute('UPDATE authority SET leader=?,epoch=?,nonce=nonce+1 WHERE id=1',
                          ('node-B',epoch))
                c.execute('COMMIT')
                return 'fixture-promotion-authorized'
            finally:
                if c.in_transaction:c.execute('ROLLBACK')
    except sqlite3.Error:return 'authority-unavailable-fail-closed'

def child_writer(auth:str,node:str,which:str,root_pub:str,producer_pub:str,
                 manifest:dict,event:dict,ticket:dict,ready:object,result:object)->None:
    try:
        if not ready.wait(15):raise RuntimeError('barrier-timeout')
        result.put(fenced_commit(Path(auth),Path(node),which,Path(root_pub),
                                 Path(producer_pub),manifest,event,ticket))
    except Exception as exc:result.put('worker-error:'+str(exc))

def archive_proofs(s,auth:Path,a:Path,b:Path,out:Path)->None:
    for item in (auth,a,b):
        with closing(s.connect(item)) as c:
            c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            need(c.execute('PRAGMA journal_mode=DELETE').fetchone()[0]=='delete',
                 'self-contained evidence SQLite journal required')
    with tarfile.open(out,'w',format=tarfile.USTAR_FORMAT) as tar:
        for name,source in [('authority.sqlite3',auth),('node-A.sqlite3',a),('node-B.sqlite3',b)]:
            data=source.read_bytes()
            meta=tarfile.TarInfo(name);meta.size=len(data);meta.mtime=0
            meta.mode=0o444;meta.uid=meta.gid=0;meta.uname=meta.gname=''
            tar.addfile(meta,io.BytesIO(data))

def fixture_suite(out:Path)->None:
    s=prior();crypto=s.prior();count=0
    def ok(good:bool,label:str)->None:
        nonlocal count
        need(good,'fixture assertion failed: '+label)
        count+=1;print('PASS: '+label,flush=True)
    with tempfile.TemporaryDirectory(prefix='masl-26t-fencing-',dir=out) as folder:
        tmp=Path(folder);a=tmp/'node-A.sqlite3';b=tmp/'node-B.sqlite3';control=tmp/'authority.sqlite3'
        s.create_db(a,'leader');s.create_db(b,'standby');create_authority(control)
        ok(len({a.stat().st_ino,b.stat().st_ino,control.stat().st_ino})==3,
           'three physically distinct SQLite files on one host')
        ok(auth_state(control)==('fixture-fencing-authority','db-control','node-A',1,2,1),
           'third independent authority holds initial leader epoch and revocation')
        producer_priv,producer_pub,_=crypto.producer_keys(tmp)
        (tmp/'root').mkdir()
        root_priv,root_pub,_=crypto.producer_keys(tmp/'root')
        manifest=s.signed_manifest(crypto,root_priv,producer_pub)
        ok(s.manifest_check(crypto,root_pub,producer_pub,manifest)=='fixture-root-verified',
           'test root verifies published producer registration')
        token1=mint_ticket(crypto,root_priv,'node-A',1)
        ok(ticket_status(crypto,root_pub,token1)=='fencing-token-verified',
           'signed local fencing grant verified independently of client claim')
        bad={'body':{**token1['body'],'leaderEpoch':2},'signature':token1['signature']}
        ok(ticket_status(crypto,root_pub,bad)=='fencing-token-signature-denied',
           'forged authority epoch denied cryptographically')
        ok(ticket_status(crypto,root_pub,{'body':token1['body']})=='fencing-token-shape-denied',
           'missing signed token field denied')
        ok(ticket_status(crypto,root_pub,mint_ticket(crypto,root_priv,'node-A',1,expires=1_000_055))==
           'fencing-token-expired','expired local authority grant denied')
        ok(ticket_status(crypto,root_pub,mint_ticket(crypto,root_priv,'unknown',1))==
           'fencing-token-policy-denied','unknown leader identity denied')
        e1=s.make_event(crypto,producer_priv,1,0,'run-A','idem-A',b'AGUI-event-one')
        ok(s.verify_event(crypto,producer_pub,manifest,root_pub,e1)=='producer-event-verified',
           'published root-signed producer event verified before local commit')
        ok(fenced_commit(control,a,'node-B',root_pub,producer_pub,manifest,e1,token1)==
           'writer-fenced-authority','different node cannot use correct signed leader token')
        ok(fenced_commit(control,a,'node-A',root_pub,producer_pub,manifest,e1,bad)==
           'fencing-token-signature-denied','tampered grant cannot authorize write')
        ok(fenced_commit(tmp/'missing.sqlite3',a,'node-A',root_pub,producer_pub,manifest,e1,token1)==
           'authority-unavailable-fail-closed','missing authority cannot fall back to replica-local epoch')
        ok(fenced_commit(control,a,'node-A',root_pub,producer_pub,manifest,e1,token1,fault='after-cas')==
           'injected-rollback','CAS failure in replica rolls back under authority lock')
        ok(s.state(a)[0]==0 and len(s.state(a)[4])==0,
           'failed fenced commit has no checkpoint or receipt')
        ok(fenced_commit(control,a,'node-A',root_pub,producer_pub,manifest,e1,token1,fault='after-commit')==
           'ack-lost','fenced writer commits before deliberate acknowledgement loss')
        ok(s.reconcile(a,e1)=='receipt-reconciled-no-write',
           'same replica reconciles durable receipt after lost acknowledgement')
        ok(s.reconcile(b,e1)=='receipt-not-confirmed',
           'unsynchronized replica cannot falsely confirm receipt')
        ok(promote(control,a,b,'node-A',2)=='standby-stale-or-divergent',
           'stale standby is ineligible for authority promotion')
        att=s.attest(crypto,root_priv,e1)
        ok(s.replicate(b,producer_pub,root_pub,manifest,e1,att)=='replica-applied',
           'independent second SQLite store replays root-attested event')
        ok(s.state(a)[:3]==s.state(b)[:3] and s.state(a)[4]==s.state(b)[4],
           'two independent replicas converge before authority promotion')
        ok(promote(control,a,b,'node-A',2,fail_before_promotion=True)==
           'promotion-injected-before-write','injected promotion prewrite failure leaves epoch unchanged')
        ok(auth_state(control)[3]==1 and s.state(b)[3]==(1,'standby'),
           'prewrite promotion fault preserves old authority and standby role')
        ok(promote(control,a,b,'node-A',2)=='fixture-promotion-authorized',
           'third SQLite authority serializes selected standby promotion')
        ok(auth_state(control)[2:]==('node-B',2,2,2) and s.state(b)[3]==(2,'leader'),
           'authority epoch advances monotonically and standby changes role')
        ok(promote(control,a,b,'node-A',2)=='promotion-epoch-conflict',
           'duplicate or stale promotion cannot be replayed')
        e2=s.make_event(crypto,producer_priv,2,1,'run-B','idem-B',b'AGUI-event-two')
        e2['envelope']['leaderEpoch']=2
        e2['signature']=crypto.sign(producer_priv,e2['envelope'])
        ok(s.verify_event(crypto,producer_pub,manifest,root_pub,e2)=='producer-event-verified',
           'second leader epoch is part of producer signed envelope')
        ok(fenced_commit(control,a,'node-A',root_pub,producer_pub,manifest,e2,token1)==
           'writer-fenced-authority','isolated former leader denied despite its local leader flag')
        ok(s.state(a)[3]==(1,'leader') and len(s.state(a)[4])==1,
           'obsolete local leader remains marked leader but made no new write')
        token2=mint_ticket(crypto,root_priv,'node-B',2,nonce=2)
        ok(ticket_status(crypto,root_pub,token2)=='fencing-token-verified',
           'promoted node has separately signed new-epoch grant')
        ok(fenced_commit(control,b,'node-B',root_pub,producer_pub,manifest,e2,token1)==
           'writer-fenced-authority','promoted node refuses old-epoch grant')
        ok(fenced_commit(control,b,'node-B',root_pub,producer_pub,manifest,e2,token2)==
           'committed','current epoch leader commits a signed event under authority lock')
        ok(s.reconcile(b,e2)=='receipt-reconciled-no-write',
           'new leader recovers receipt without duplicate write')
        ok(s.state(a)[0]==1 and s.state(b)[0]==2 and len(s.state(b)[4])==2,
           'independent stores diverge until explicit replica synchronization')
        ok(promote(control,b,a,'node-B',3)=='standby-stale-or-divergent',
           'fencing authority rejects promotion of divergent old replica')
        # Processes independently race for the authority; stale A always loses.
        e3=s.make_event(crypto,producer_priv,3,2,'run-C','idem-C',b'AGUI-event-three')
        e3['envelope']['leaderEpoch']=2;e3['signature']=crypto.sign(producer_priv,e3['envelope'])
        ctx=mp.get_context('fork') if sys.platform!='win32' else mp.get_context('spawn')
        ready=ctx.Event();results=ctx.Queue();workers=[]
        for node,db,ticket in [('node-A',a,token1),('node-B',b,token2)]:
            p=ctx.Process(target=child_writer,args=(str(control),str(db),node,
                str(root_pub),str(producer_pub),manifest,e3,ticket,ready,results))
            workers.append(p);p.start()
        ready.set()
        for p in workers:p.join(25)
        need(all(not p.is_alive() and p.exitcode==0 for p in workers),
             'two local writer worker processes did not exit')
        statuses=sorted([results.get(timeout=3),results.get(timeout=3)])
        ok(statuses==['committed','writer-fenced-authority'],
           'two independent workers: stale writer denied, one current commit')
        ok(s.state(a)[0]==1 and s.state(b)[0]==3,
           'concurrent stale writer never advances replica A revision')
        ok(len(s.state(a)[4])==1 and len(s.state(b)[4])==3,
           'separate replica receipt counts expose unsynchronized lag')
        # Document a deliberately unsafe direct-SQLite bypass on a DISPOSABLE
        # copy, never on archived A/B. This is NOT solved by harness fencing.
        bypass=tmp/'unsafe-bypass-unarchived.sqlite3'
        with closing(s.connect(a)) as origin,closing(sqlite3.connect(bypass)) as copy:
            origin.backup(copy)
        unsafe=s.make_event(crypto,producer_priv,2,1,'run-unsafe','idem-unsafe',b'bypass')
        ok(s.leader_commit(bypass,producer_pub,root_pub,manifest,unsafe)=='committed',
           'direct replica-local write BYPASSES simulated authority: explicit remaining gap')
        ok(s.state(a)[0]==1 and s.state(b)[0]==3,
           'unsafe bypass demonstration never modifies archived evidence replicas')
        # Revocation epoch in authority invalidates old grants without fallback.
        with closing(auth_connection(control)) as c:
            c.execute('UPDATE authority SET revocation_epoch=3')
        ok(fenced_commit(control,b,'node-B',root_pub,producer_pub,manifest,e3,token2)==
           'writer-fenced-authority','stale authority revocation epoch fails closed')
        ok(auth_state(control)[4]==3,'authority epoch 3 persists independently of replica state')
        # Restore revocation to 2 solely to archive a coherent fixture; this is
        # not production reversal semantics and not a revocation SLA proof.
        with closing(auth_connection(control)) as c:
            c.execute('UPDATE authority SET revocation_epoch=2')
        archive=out/'fencing-proof.tar'
        archive_proofs(s,control,a,b,archive)
        ok(archive.is_file() and archive.stat().st_size>4096,
           'proof TAR contains three independently checkpointed SQLite files')
        with tarfile.open(archive,'r') as tf:
            names=[m.name for m in tf.getmembers()]
            ok(names==['authority.sqlite3','node-A.sqlite3','node-B.sqlite3'] and
               all(m.isfile() and m.size>1024 for m in tf.getmembers()),
               'TAR has exactly authority and two replica databases')
        print(f'{count} 2.6T local external-fencing/two-replica assertions passed',flush=True)
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
         'src/ag-ui/external-fencing-consistency.spec.ts','--outDir',str(destdir),'--emptyOutDir'],
         WEB,out/'compile.log')
    (destdir/'package.json').write_text('{"type":"module"}\n',encoding='utf8')
    gate('pure.log',['node',str(destdir/'external-fencing-consistency.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf8')
    m=re.search(r'(?m)^ASSERTIONS: (\d+)\s*$',pure)
    need(m is not None and int(m.group(1))==ASSERTIONS and pure.count('PASS: ')==ASSERTIONS,
         '2.6T TypeScript count drift')
    for label in CRITICAL:need('PASS: '+label in pure,'missing critical case: '+label)
    gate('fixture.log',[sys.executable,str(ROOT/RUNNER),'--fixture-child','--output-dir',str(out)],
         ROOT,out/'fixture.log')
    log=(out/'fixture.log').read_text(encoding='utf8')
    m=re.search(r'(?m)^(\d+) 2\.6T local external-fencing/two-replica assertions passed\s*$',log)
    need(m is not None and int(m.group(1))==FIXTURE_ASSERTIONS and log.count('PASS: ')==FIXTURE_ASSERTIONS,
         '2.6T replica fixture count drift')
    archive=out/'fencing-proof.tar'
    need(archive.is_file() and not archive.is_symlink(),'two replica SQLite archive missing')
    preflight(schema)
    logs={name:sha((out/name).read_bytes()) for name in
          ('lint.log','build.log','compile.log','pure.log','fixture.log')}
    report={'lab':'2.6T','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
        'agui_upstream_commit':UPSTREAM,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
        'published_git_blobs':BLOBS,
        'scope':'selected pure TypeScript fencing callback gates, plus third SQLite writer authority serializing local writes and promotions across two independent SQLite replicas',
        'typescript_assertions':ASSERTIONS,'fixture_assertions':FIXTURE_ASSERTIONS,
        'critical_cases':len(CRITICAL),'gate_logs_sha256':logs,
        'fencing_archive_sha256':sha(archive.read_bytes()),
        'sources_sha256':{p:sha((ROOT/p).read_bytes()) for p in (SRC,TEST,RUNNER)},
        'gap_ids_open':['G'+str(i) for i in range(1,10)],'adapter_ready':False,
        'parent_2_6_open':True,'external_root_verified':False,'operational_fencing_verified':False,'distributed_leader_election_verified':False,
        'real_producer_authenticated':False,'consensus_verified':False,
        'distributed_storage_verified':False,'security_signoff':False,
        'limits':[
            'Root and producer RSA keys are ephemeral test keys, not enterprise PKI',
            'Two local replica SQLite files and third local authority SQLite; no cross-host consensus or quorum',
            'The promotion updates two separate SQLite files sequentially; a crash between them is NOT atomic',
            'Replica replication remains explicit local signed replay, not an atomic distributed protocol',
            'Only the harness writer path enforces centralized SQLite authority fencing; a bypassing writer can still write',
            'The shared local authority file is a single point of failure and not a real external service',
            'TypeScript fixtures are independent of Python cryptography and SQLite executions',
            'No durable external fencing service, authenticated production event source, media/DLP or Agent Server adapter',
            'All G1-G9 and milestone 2.6 remain OPEN; adapter BLOCKED',
        ],'timestamp_utc':datetime.now(timezone.utc).isoformat()}
    (out/'review.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    summary=['# MASL 2.6T — third local SQLite authority with fenced two-replica commits','',
         f'- Published baseline `{HEAD}`',f'- TypeScript: {ASSERTIONS}/{ASSERTIONS}',
         f'- Separate SQLite/RS256: {FIXTURE_ASSERTIONS}/{FIXTURE_ASSERTIONS}',
         f'- Critical cases: {len(CRITICAL)}/{len(CRITICAL)}',
         '- Five selected gates passed; G1-G9/2.6 OPEN; adapter BLOCKED','',
         'Two replicas and one independently stored authority SQLite on ONE host. Not quorum,',
         'cross-host authority, distributed atomicity, enterprise trust or Agent Server.','',
         '## Gate SHA-256','']
    summary.extend(f'- {k}: `{v}`' for k,v in logs.items())
    summary.extend(['',f'- Replica archive SHA-256: `{report["fencing_archive_sha256"]}`',''])
    (out/'review.md').write_text('\n'.join(summary),encoding='utf8')
    for rel in ('review.json','review.md','fencing-proof.tar'):
        print('EVIDENCE: '+rel+' SHA256 '+sha((out/rel).read_bytes()),flush=True)
    print('REVIEW STATUS: PASS — 2.6T isolated third-SQLite fencing rehearsal; adapter BLOCKED, 2.6 OPEN',flush=True)
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
