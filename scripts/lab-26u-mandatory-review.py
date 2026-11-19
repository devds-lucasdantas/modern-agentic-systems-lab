#!/usr/bin/env python3
"""MASL 2.6U: selected pure TS + separate confined SQLite broker and restartable local promotion journal with two separate replica DBs.

Read-only --preflight. --run writes exactly eight evidence artifacts OUTSIDE Git.
The fixture uses three independently created SQLite files (one authority, two replicas)
ON ONE HOST, and a disposable independent test RSA root. A broker-specific SQLite authorizer rejects unadmitted writes only
 on broker connections; direct same-UID SQLite writers bypass it. Crash tests
use os._exit and a durable local promotion intent journal. NOT consensus.
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
import os
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
HEAD='ace5da75a78c1dee1af32fdde7d6fa1f4ee3cc13'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
UPSTREAM='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/mandatory-fencing-promotion.ts'
TEST='apps/web/src/ag-ui/mandatory-fencing-promotion.spec.ts'
RUNNER='scripts/lab-26u-mandatory-review.py'
SRC_SHA='028d9df28c815dddd77343e79b1f3df59e25ee568612275ac635ac359ce5497f'
TEST_SHA='a471c65c48864a7174b0bb31a2acfb16ff3b41030d31083bcc6a2afffa677d9b'
ASSERTIONS=348
FIXTURE_ASSERTIONS=39
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'100687ba28f32ee089818f00ecf788db696c30d3',
 'CURRENT.md':'d7b1af2a06e45d265fa15387b1255576215365bb',
 'docs/journal/lab-23-ag-ui.md':'ace54f12add732a5195c171c228e1247574141f6',
 'apps/web/src/ag-ui/external-fencing-consistency.ts':'cff17393776d5db1320e71b67624af095ab18411',
 'apps/web/src/ag-ui/external-fencing-consistency.spec.ts':'7521cdffbd4ba4bb5927c88cc69c6b12f0f4d9c0',
 'scripts/lab-26t-fencing-review.py':'2877d64ec9633c95d9959a863273412a6ab4a903',
 'apps/web/src/ag-ui/producer-trust-replicas.ts':'9445ec8eb77c835ef7a09e2e6c830b90b0c24b6c',
 'apps/web/src/ag-ui/producer-failover-evidence.ts':'44152048a3bd515de8ff9d05858b6ae225a41623',
 'apps/web/src/ag-ui/authenticated-transport-readiness.ts':'706ac518efda3006b24073af32c613418165416d',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
}
CRITICAL=(
 'published 2.6S pure replica chain composes after fencing prechecks',
 'old ticket denied after authority epoch advancement',
 'published 2.6S signed producer receipt reconciliation still composes',
 'published root revocation remains enforced',
 'all G1-G9 remain OPEN after external authority fixtures',
 'parent 2.6 and adapter remain OPEN/BLOCKED',
 '2.6U preserves G1-G9 and parent 2.6 OPEN',
 '2.6U broker-only boundary cannot promote operational readiness',
 'untrusted broker rejected before journal and prior gates',
 'malformed promotion journal fails closed',
 'pending or blocked promotion denies new writes',
 'stale journal/authority leadership cannot be promoted',
 'stable broker and journal preserve published 2.6T gate composition',
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
         'published 2.6T HEAD/origin differs')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked/index changes detected')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'exactly three 2.6U untracked files required')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop differs')
    for path,pin in BLOBS.items():
        need(git('rev-parse','HEAD:'+path)==pin and git('hash-object',path)==pin,
             'published Git blob differs: '+path)
    for path,pin in ((SRC,SRC_SHA),(TEST,TEST_SHA)):
        f=ROOT/path
        need(f.is_file() and not f.is_symlink() and sha(f.read_bytes())==pin,
             '2.6U source SHA drift: '+path)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),
         '2.6U runner missing/symlink')
    road=(ROOT/'ROADMAP.md').read_text(encoding='utf8').splitlines()
    need(road.count('- [ ] 2.6 AG-UI')==1 and
         road.count('  - [ ] 2.6U AG-UI mandatory fencing enforcement and crash-consistent promotion gates')==1,
         '2.6 parent or 2.6U pending roadmap anchor differs')
    schema_gate(schema)
    need(subprocess.run(['openssl','version'],stdout=subprocess.DEVNULL,
         stderr=subprocess.DEVNULL,check=False).returncode==0,'OpenSSL CLI required')
    print('PASS: exact ace5da7 HEAD/origin, ten Git blobs, pinned workshop, three 2.6U files',flush=True)
    print('PASS: read-only preflight; no external network, Git write, Agent Server or enterprise identity',flush=True)



# Python fixture: three independent SQLite files on ONE host. The broker
# authorizer applies only to connections opened through broker_commit().
# Recovery is a logged, idempotent local workflow, NOT atomic across stores.
def prior():
    spec=importlib.util.spec_from_file_location('masl_pinned_26t',ROOT/'scripts/lab-26t-fencing-review.py')
    need(spec is not None and spec.loader is not None,'published 2.6T helper unavailable')
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    return mod

JOURNAL_SCHEMA='''
CREATE TABLE promotion(id INTEGER PRIMARY KEY CHECK(id=1),phase TEXT NOT NULL,
 from_leader TEXT NOT NULL,to_leader TEXT NOT NULL,from_epoch INTEGER NOT NULL,
 to_epoch INTEGER NOT NULL,receipt_digest TEXT NOT NULL,operation_id TEXT NOT NULL);
INSERT INTO promotion VALUES(1,'stable','node-A','node-A',1,1,'genesis','stable-0');
'''

def setup_authority(t,auth:Path)->None:
    t.create_authority(auth)
    with closing(t.auth_connection(auth)) as c:c.executescript(JOURNAL_SCHEMA)

def journal(auth:Path)->tuple:
    t=prior()
    with closing(t.auth_connection(auth)) as c:
        return c.execute('SELECT phase,from_leader,to_leader,from_epoch,to_epoch,receipt_digest,operation_id FROM promotion WHERE id=1').fetchone()

def receipt_digest(s,db:Path)->str:
    return sha(json.dumps(s.state(db)[:3]+(s.state(db)[4],),sort_keys=True).encode())

def begin_promotion(t,s,auth:Path,a:Path,b:Path)->str:
    try:
        with closing(t.auth_connection(auth)) as c:
            c.execute('BEGIN IMMEDIATE')
            try:
                au=c.execute('SELECT leader,epoch,revocation_epoch FROM authority WHERE id=1').fetchone()
                j=c.execute('SELECT phase FROM promotion WHERE id=1').fetchone()
                if au!=('node-A',1,2) or j!=('stable',):return 'promotion-state-denied'
                sa,sb=s.state(a),s.state(b)
                if sa[:3]!=sb[:3] or sa[4]!=sb[4] or sa[3]!=(1,'leader') or sb[3]!=(1,'standby'):
                    return 'promotion-replica-divergence'
                c.execute("UPDATE promotion SET phase='prepared',from_leader='node-A',to_leader='node-B',"
                          "from_epoch=1,to_epoch=2,receipt_digest=?,operation_id='promotion-2' WHERE id=1",
                          (receipt_digest(s,a),))
                c.execute('COMMIT')
                return 'promotion-prepared'
            finally:
                if c.in_transaction:c.execute('ROLLBACK')
    except sqlite3.Error:return 'authority-unavailable-fail-closed'

def apply_replica(t,s,auth:Path,b:Path)->str:
    try:
        with closing(t.auth_connection(auth)) as c:
            c.execute('BEGIN IMMEDIATE')
            try:
                j=journal(auth)
                if j is None or j[:5]!=('prepared','node-A','node-B',1,2):return 'promotion-not-prepared'
                with closing(s.connect(b)) as node:
                    node.execute('BEGIN IMMEDIATE')
                    try:
                        state=node.execute('SELECT leader_epoch,role FROM control WHERE id=1').fetchone()
                        if state==(1,'standby'):
                            node.execute("UPDATE control SET leader_epoch=2,role='leader' WHERE id=1")
                            node.execute('COMMIT')
                        elif state==(2,'leader'):node.execute('ROLLBACK')
                        else:return 'promotion-replica-state-divergent'
                    finally:
                        if node.in_transaction:node.execute('ROLLBACK')
                # Separate local commit is unavoidable; crash before journal
                # state update is recovered from physical replica/authority.
                c.execute("UPDATE promotion SET phase='replica-applied' WHERE id=1")
                c.execute('COMMIT');return 'replica-promotion-applied'
            finally:
                if c.in_transaction:c.execute('ROLLBACK')
    except sqlite3.Error:return 'authority-unavailable-fail-closed'

def recover_promotion(t,s,auth:Path,a:Path,b:Path)->str:
    try:
        with closing(t.auth_connection(auth)) as c:
            c.execute('BEGIN IMMEDIATE')
            try:
                lead=c.execute('SELECT leader,epoch,nonce FROM authority WHERE id=1').fetchone()
                j=c.execute('SELECT phase,from_leader,to_leader,from_epoch,to_epoch,receipt_digest,operation_id FROM promotion WHERE id=1').fetchone()
                if j is None:return 'journal-missing-fail-closed'
                if j[0]=='stable':
                    return 'already-stable' if lead==('node-B',2,2) and s.state(b)[3]==(2,'leader') else 'stable-state-untrusted'
                if j[:5] not in (('prepared','node-A','node-B',1,2),
                                 ('replica-applied','node-A','node-B',1,2)):
                    return 'journal-unknown-fail-closed'
                if lead!=('node-A',1,1):return 'authority-journal-divergence'
                sa,sb=s.state(a),s.state(b)
                if sa[:3]!=sb[:3] or sa[4]!=sb[4] or receipt_digest(s,b)!=j[5]:
                    return 'receipt-divergence-fail-closed'
                if sb[3] not in ((1,'standby'),(2,'leader')):return 'replica-role-divergence'
                if sb[3]==(1,'standby'):
                    with closing(s.connect(b)) as node:
                        node.execute('BEGIN IMMEDIATE')
                        try:
                            node.execute("UPDATE control SET leader_epoch=2,role='leader' WHERE id=1")
                            node.execute('COMMIT')
                        finally:
                            if node.in_transaction:node.execute('ROLLBACK')
                # Across the two DB commits no crash-atomicity is claimed.
                c.execute("UPDATE authority SET leader='node-B',epoch=2,nonce=2 WHERE id=1")
                c.execute("UPDATE promotion SET phase='stable' WHERE id=1")
                c.execute('COMMIT');return 'promotion-recovered'
            finally:
                if c.in_transaction:c.execute('ROLLBACK')
    except sqlite3.Error:return 'authority-unavailable-fail-closed'

def broker_commit(t,s,auth:Path,nodefile:Path,which:str,root:Path,producer:Path,
                  manifest:dict,event:dict,ticket:dict,probe_unauthorized:bool=False)->str:
    crypto=s.prior()
    if t.ticket_status(crypto,root,ticket)!='fencing-token-verified':return 'ticket-untrusted'
    if s.verify_event(crypto,producer,manifest,root,event)!='producer-event-verified':
        return 'producer-untrusted'
    env=event['envelope']
    try:
        with closing(t.auth_connection(auth)) as authority:
            authority.execute('BEGIN IMMEDIATE')
            try:
                if journal(auth)[0]!='stable':return 'promotion-pending-fail-closed'
                row=authority.execute('SELECT leader,epoch,revocation_epoch,nonce FROM authority WHERE id=1').fetchone()
                body=ticket['body']
                if row!=(which,body['leaderEpoch'],body['revocationEpoch'],body['nonce']) or \
                   env['leaderEpoch']!=row[1]:return 'writer-fenced-authority'
                with closing(s.connect(nodefile)) as conn:
                    protected={'receipts','checkpoint','registry','control'}
                    writable=[False]
                    def guard(action,arg1,arg2,dbname,source):
                        if action in (sqlite3.SQLITE_INSERT,sqlite3.SQLITE_UPDATE,sqlite3.SQLITE_DELETE) and \
                           arg1 in protected and not writable[0]:return sqlite3.SQLITE_DENY
                        return sqlite3.SQLITE_OK
                    conn.set_authorizer(guard)
                    if probe_unauthorized:
                        try:conn.execute("UPDATE checkpoint SET revision=900 WHERE tenant='tenant-A' AND thread='thread-A'")
                        except sqlite3.DatabaseError:return 'broker-connection-direct-write-denied'
                        return 'broker-authorizer-bypassed'
                    conn.execute('BEGIN IMMEDIATE')
                    try:
                        epoch,role=conn.execute('SELECT leader_epoch,role FROM control WHERE id=1').fetchone()
                        if (epoch,role)!=(env['leaderEpoch'],'leader'):return 'replica-local-state-denied'
                        rev=conn.execute("SELECT revision FROM checkpoint WHERE tenant='tenant-A' AND thread='thread-A'").fetchone()[0]
                        reg=conn.execute("SELECT revocation_epoch,active,last_sequence FROM registry WHERE producer='fixture-producer'").fetchone()
                        if rev!=env['expectedRevision'] or reg!=(2,1,env['sequence']-1):return 'sequence-cas-fail-closed'
                        if conn.execute('SELECT 1 FROM receipts WHERE tenant=? AND idem=?',
                                        (env['tenant'],env['idem'])).fetchone():return 'duplicate-or-idempotency-denied'
                        writable[0]=True
                        conn.execute('UPDATE checkpoint SET revision=revision+1 WHERE tenant=? AND thread=?',
                                     (env['tenant'],env['thread']))
                        conn.execute('UPDATE registry SET last_sequence=? WHERE producer=?',
                                     (env['sequence'],env['producerId']))
                        conn.execute('INSERT INTO receipts VALUES(?,?,?,?,?,?,?,?,?)',s.receipt(env))
                        conn.execute('COMMIT');return 'broker-committed'
                    finally:
                        writable[0]=False
                        if conn.in_transaction:conn.execute('ROLLBACK')
            finally:
                if authority.in_transaction:authority.execute('ROLLBACK')
    except sqlite3.Error:return 'broker-fail-closed'

def crashed_promotion(stage:str,auth:str,a:str,b:str)->None:
    t=prior();s=t.prior()
    result=begin_promotion(t,s,Path(auth),Path(a),Path(b))
    if result!='promotion-prepared':os._exit(81)
    if stage=='prepared':os._exit(31)
    result=apply_replica(t,s,Path(auth),Path(b))
    if result!='replica-promotion-applied':os._exit(82)
    if stage=='replica-applied':os._exit(32)
    os._exit(83)

def archive_proofs(s,t,auth:Path,a:Path,b:Path,out:Path)->None:
    for item in (auth,a,b):
        with closing(s.connect(item)) as c:
            c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            need(c.execute('PRAGMA journal_mode=DELETE').fetchone()[0]=='delete',
                 'evidence must contain self-contained SQLite files')
    with tarfile.open(out,'w',format=tarfile.USTAR_FORMAT) as tar:
        for name,source in [('authority.sqlite3',auth),('node-A.sqlite3',a),('node-B.sqlite3',b)]:
            data=source.read_bytes();meta=tarfile.TarInfo(name)
            meta.size=len(data);meta.mtime=0;meta.mode=0o444
            meta.uid=meta.gid=0;meta.uname=meta.gname=''
            tar.addfile(meta,io.BytesIO(data))

def fixture_suite(out:Path)->None:
    t=prior();s=t.prior();crypto=s.prior();count=0
    def ok(cond:bool,label:str)->None:
        nonlocal count
        need(cond,'fixture assertion failed: '+label)
        count+=1;print('PASS: '+label,flush=True)
    with tempfile.TemporaryDirectory(prefix='masl-26u-confined-broker-',dir=out) as folder:
        temp=Path(folder);a=temp/'node-A.sqlite3';b=temp/'node-B.sqlite3';auth=temp/'authority.sqlite3'
        s.create_db(a,'leader');s.create_db(b,'standby');setup_authority(t,auth)
        ok(len({a.stat().st_ino,b.stat().st_ino,auth.stat().st_ino})==3,
           'three independent physical SQLite stores')
        ok(journal(auth)==('stable','node-A','node-A',1,1,'genesis','stable-0'),
           'initial durable promotion journal is stable')
        producer_priv,producer_pub,_=crypto.producer_keys(temp)
        (temp/'root').mkdir();root_priv,root_pub,_=crypto.producer_keys(temp/'root')
        manifest=s.signed_manifest(crypto,root_priv,producer_pub)
        ok(s.manifest_check(crypto,root_pub,producer_pub,manifest)=='fixture-root-verified',
           'ephemeral test RSA root authenticates producer fixture')
        tokA=t.mint_ticket(crypto,root_priv,'node-A',1)
        e1=s.make_event(crypto,producer_priv,1,0,'run-A','idem-A',b'AGUI-U-one')
        ok(broker_commit(t,s,auth,a,'node-A',root_pub,producer_pub,manifest,e1,tokA,
                         probe_unauthorized=True)=='broker-connection-direct-write-denied',
           'broker-connection authorizer denies unadmitted SQL mutation')
        ok(s.state(a)[0]==0,'rejected broker SQL does not mutate checkpoint')
        ok(broker_commit(t,s,temp/'missing-authority.sqlite3',a,'node-A',root_pub,
                         producer_pub,manifest,e1,tokA)=='broker-fail-closed',
           'missing external authority denies broker write without fallback')
        bad={**tokA,'signature':'f'*64}
        ok(broker_commit(t,s,auth,a,'node-A',root_pub,producer_pub,manifest,e1,bad)==
           'ticket-untrusted','forged fencing token denied before SQLite admission')
        tampered={**e1,'payloadHex':b'changed-payload'.hex()}
        ok(broker_commit(t,s,auth,a,'node-A',root_pub,producer_pub,manifest,tampered,tokA)==
           'producer-untrusted','mutated signed payload cannot be committed')
        ok(broker_commit(t,s,auth,a,'node-A',root_pub,producer_pub,manifest,e1,tokA)==
           'broker-committed','admitted broker commit stores signed producer receipt')
        ok(s.reconcile(a,e1)=='receipt-reconciled-no-write',
           'broker receipt can reconcile after lost response')
        ok(s.reconcile(b,e1)=='receipt-not-confirmed',
           'standby cannot confirm unapplied broker receipt')
        ok(s.replicate(b,producer_pub,root_pub,manifest,e1,s.attest(crypto,root_priv,e1))==
           'replica-applied','explicit attested replay aligns standby receipts')
        ok(s.state(a)[:3]==s.state(b)[:3] and s.state(a)[4]==s.state(b)[4],
           'separate SQLite replica receipts agree before promotion')
        ok(recover_promotion(t,s,auth,a,b)=='stable-state-untrusted',
           'no phantom completed promotion accepted')
        # Durable fault injection 1: child dies after PREPARED log COMMIT.
        ctx=mp.get_context('fork') if sys.platform!='win32' else mp.get_context('spawn')
        child=ctx.Process(target=crashed_promotion,args=('prepared',str(auth),str(a),str(b)))
        child.start();child.join(20)
        need(not child.is_alive(),'prepared child timed out')
        ok(child.exitcode==31,'OS process actually terminated after durable PREPARED')
        ok(begin_promotion(t,s,auth,a,b)=='promotion-state-denied',
           'second promotion cannot reuse an unresolved durable journal')
        ok(journal(auth)[0]=='prepared' and t.auth_state(auth)[3]==1,
           'restart observes durable pending journal and old authority epoch')
        ok(broker_commit(t,s,auth,a,'node-A',root_pub,producer_pub,manifest,
                         s.make_event(crypto,producer_priv,2,1,'run-X','idem-X',b'X'),tokA)==
           'promotion-pending-fail-closed','pending promotion denies all selected broker commits')
        ok(recover_promotion(t,s,auth,a,b)=='promotion-recovered',
           'recovery completes prepared promotion after verifying durable receipt parity')
        ok(journal(auth)[0]=='stable' and t.auth_state(auth)[2:4]==('node-B',2),
           'recovery publishes new leader epoch with journal stable')
        ok(s.state(b)[3]==(2,'leader') and s.state(a)[3]==(1,'leader'),
           'old primary local role remains stale without authorization')
        ok(recover_promotion(t,s,auth,a,b)=='already-stable',
           'repeated recovery is read-only and idempotent')
        e2=s.make_event(crypto,producer_priv,2,1,'run-B','idem-B',b'AGUI-U-two')
        e2['envelope']['leaderEpoch']=2;e2['signature']=crypto.sign(producer_priv,e2['envelope'])
        tokB=t.mint_ticket(crypto,root_priv,'node-B',2,nonce=2)
        ok(broker_commit(t,s,auth,a,'node-A',root_pub,producer_pub,manifest,e2,tokA)==
           'writer-fenced-authority','stale primary cannot use broker after recovery')
        ok(broker_commit(t,s,auth,b,'node-B',root_pub,producer_pub,manifest,e2,tokB)==
           'broker-committed','new leader commits through broker and current authority epoch')
        ok(broker_commit(t,s,auth,b,'node-B',root_pub,producer_pub,manifest,e2,tokB)==
           'sequence-cas-fail-closed',
           'broker idempotency conflict denied after durable commit')
        ok(s.reconcile(b,e2)=='receipt-reconciled-no-write',
           'new leader receipt recovered without duplicate commit')
        ok(s.state(a)[0]==1 and s.state(b)[0]==2,
           'two independent replicas accurately expose lag')
        # Bypass on disposable copy: client that can open DB with write permission
        # can still issue SQL without broker's per-connection authorizer.
        unsafe=temp/'bypass-unarchived.sqlite3'
        with closing(s.connect(a)) as origin,closing(sqlite3.connect(unsafe)) as copy:origin.backup(copy)
        with closing(s.connect(unsafe)) as unguarded:
            unguarded.execute("UPDATE checkpoint SET revision=77 WHERE tenant='tenant-A' AND thread='thread-A'")
        ok(s.state(unsafe)[0]==77,
           'same-UID direct-file writer BYPASSES broker authorizer: mandatory enforcement OPEN')
        ok(s.state(a)[0]==1 and s.state(b)[0]==2,
           'bypass proof does not contaminate archived authoritative replicas')
        # Crash point 2 on a separate disposable baseline, preserving archival state.
        second=temp/'crash-two';second.mkdir();ca=second/'authority.sqlite3'
        aa=second/'node-A.sqlite3';bb=second/'node-B.sqlite3'
        s.create_db(aa,'leader');s.create_db(bb,'standby');setup_authority(t,ca)
        c2=ctx.Process(target=crashed_promotion,args=('replica-applied',str(ca),str(aa),str(bb)))
        c2.start();c2.join(20)
        need(not c2.is_alive(),'replica-applied child timed out')
        ok(c2.exitcode==32,'OS process actually terminated after replica commit')
        ok(journal(ca)[0]=='replica-applied' and s.state(bb)[3]==(2,'leader') and
           t.auth_state(ca)[3]==1,
           'recovery sees mixed committed state across separate stores')
        ok(recover_promotion(t,s,ca,aa,bb)=='promotion-recovered',
           'journal recovery finishes authority publication after replica commit')
        ok(journal(ca)[0]=='stable' and t.auth_state(ca)[3]==2,
           'recovered authority and node epoch agree after second fault')
        # Safety negative: corrupt replica receipt *after* a prepared promotion.
        third=temp/'corrupt-negative';third.mkdir();cc=third/'authority.sqlite3'
        ac=third/'node-A.sqlite3';bc=third/'node-B.sqlite3'
        s.create_db(ac,'leader');s.create_db(bc,'standby');setup_authority(t,cc)
        ok(begin_promotion(t,s,cc,ac,bc)=='promotion-prepared',
           'durable promotion PREPARED can be independently inspected')
        with closing(s.connect(bc)) as conn:
            conn.execute("UPDATE registry SET last_sequence=99 WHERE producer='fixture-producer'")
        ok(recover_promotion(t,s,cc,ac,bc)=='receipt-divergence-fail-closed',
           'divergent registered sequence blocks recovery')
        with closing(t.auth_connection(cc)) as c:
            c.execute("UPDATE promotion SET phase='invalid-phase' WHERE id=1")
        ok(recover_promotion(t,s,cc,ac,bc)=='journal-unknown-fail-closed',
           'unrecognized durable phase never promotes a replica')
        ok(t.auth_state(cc)[3]==1 and journal(cc)[0]=='invalid-phase',
           'blocked recovery does not publish new leader')
        archive=out/'mandatory-proof.tar';archive_proofs(s,t,auth,a,b,archive)
        ok(archive.is_file() and archive.stat().st_size>4096,
           'three independently checkpointed SQLite files archived')
        with tarfile.open(archive,'r') as tf:
            members=tf.getmembers()
            ok([m.name for m in members]==['authority.sqlite3','node-A.sqlite3','node-B.sqlite3'] and
               all(m.isfile() and m.size>1024 for m in members),
               'TAR contains exactly three immutable SQLite source snapshots')
        print(f'{count} 2.6U local confined-broker/crash-promotion assertions passed',flush=True)
        need(count==FIXTURE_ASSERTIONS,'2.6U fixture assertion count drift')

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
         'src/ag-ui/mandatory-fencing-promotion.spec.ts','--outDir',str(destdir),'--emptyOutDir'],
         WEB,out/'compile.log')
    (destdir/'package.json').write_text('{"type":"module"}\n',encoding='utf8')
    gate('pure.log',['node',str(destdir/'mandatory-fencing-promotion.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf8')
    m=re.search(r'(?m)^ASSERTIONS: (\d+)\s*$',pure)
    need(m is not None and int(m.group(1))==ASSERTIONS and pure.count('PASS: ')==ASSERTIONS,
         '2.6U TypeScript count drift')
    for label in CRITICAL:need('PASS: '+label in pure,'missing critical case: '+label)
    gate('fixture.log',[sys.executable,str(ROOT/RUNNER),'--fixture-child','--output-dir',str(out)],
         ROOT,out/'fixture.log')
    log=(out/'fixture.log').read_text(encoding='utf8')
    m=re.search(r'(?m)^(\d+) 2\.6U local confined-broker/crash-promotion assertions passed\s*$',log)
    need(m is not None and int(m.group(1))==FIXTURE_ASSERTIONS and log.count('PASS: ')==FIXTURE_ASSERTIONS,
         '2.6U replica fixture count drift')
    archive=out/'mandatory-proof.tar'
    need(archive.is_file() and not archive.is_symlink(),'two replica SQLite archive missing')
    preflight(schema)
    logs={name:sha((out/name).read_bytes()) for name in
          ('lint.log','build.log','compile.log','pure.log','fixture.log')}
    report={'lab':'2.6U','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
        'agui_upstream_commit':UPSTREAM,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
        'published_git_blobs':BLOBS,
        'scope':'pure TypeScript broker/journal readiness callbacks and independent Python SQLite connection-authorizer plus durable local promotion-recovery experiments',
        'typescript_assertions':ASSERTIONS,'fixture_assertions':FIXTURE_ASSERTIONS,
        'critical_cases':len(CRITICAL),'gate_logs_sha256':logs,
        'mandatory_archive_sha256':sha(archive.read_bytes()),
        'sources_sha256':{p:sha((ROOT/p).read_bytes()) for p in (SRC,TEST,RUNNER)},
        'gap_ids_open':['G'+str(i) for i in range(1,10)],'adapter_ready':False,
        'parent_2_6_open':True,'external_root_verified':False,'operational_fencing_verified':False,'mandatory_fencing_verified':False,'crash_atomic_distributed_promotion':False,'distributed_leader_election_verified':False,
        'real_producer_authenticated':False,'consensus_verified':False,
        'distributed_storage_verified':False,'security_signoff':False,
        'limits':[
            'Root and producer RSA keys are ephemeral test keys, not enterprise PKI',
            'Two local replica SQLite files and third local authority SQLite; no cross-host consensus or quorum',
            'Promotion intent journal recovers selected OS process crashes but commits are NOT cross-store atomic',
            'Replica replication remains explicit local signed replay, not an atomic distributed protocol',
            'SQLite authorizer only applies to guarded broker connections; a direct same-UID writer can still bypass',
            'The shared local authority file is a single point of failure and not a real external service',
            'TypeScript fixtures are independent of Python cryptography and SQLite executions',
            'No durable external fencing service, authenticated production event source, media/DLP or Agent Server adapter',
            'All G1-G9 and milestone 2.6 remain OPEN; adapter BLOCKED',
        ],'timestamp_utc':datetime.now(timezone.utc).isoformat()}
    (out/'review.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    summary=['# MASL 2.6U — scoped broker authorizer with restartable promotion journal across local SQLite files','',
         f'- Published baseline `{HEAD}`',f'- TypeScript: {ASSERTIONS}/{ASSERTIONS}',
         f'- Separate SQLite/RS256: {FIXTURE_ASSERTIONS}/{FIXTURE_ASSERTIONS}',
         f'- Critical cases: {len(CRITICAL)}/{len(CRITICAL)}',
         '- Five selected gates passed; G1-G9/2.6 OPEN; adapter BLOCKED','',
         'Two replicas and one authority SQLite on ONE host with a scoped broker only. Not quorum,',
         'cross-host authority, distributed atomicity, enterprise trust or Agent Server.','',
         '## Gate SHA-256','']
    summary.extend(f'- {k}: `{v}`' for k,v in logs.items())
    summary.extend(['',f'- Replica archive SHA-256: `{report["mandatory_archive_sha256"]}`',''])
    (out/'review.md').write_text('\n'.join(summary),encoding='utf8')
    for rel in ('review.json','review.md','mandatory-proof.tar'):
        print('EVIDENCE: '+rel+' SHA256 '+sha((out/rel).read_bytes()),flush=True)
    print('REVIEW STATUS: PASS — 2.6U isolated broker/journal crash recovery rehearsal; adapter BLOCKED, 2.6 OPEN',flush=True)
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
