#!/usr/bin/env python3
"""MASL 2.6O: selected issuer-revocation contract and RS256/SQLite fault gates.

Five local gates, eight evidence artifacts, all stored OUTSIDE Git. Neither
Local OpenSSL-generated RS256 fixtures and SQLite failure injection are
not a network issuer, trusted JWKS/OIDC session, or production resilience proof. No HTTP,
Agent Server, frontend, production credentials, Runtime, model or tool call.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
from hashlib import sha1, sha256
import hmac
import json
import multiprocessing as mp
import os
import tempfile
from pathlib import Path
import re
import sqlite3
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'apps/web'
HEAD='fc68c8163fd204eab68a8b84de9dbc6ae6629b9d'
REFERENCE='3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT='2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA='4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB='c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
DEFAULT_SCHEMA=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC='apps/web/src/ag-ui/issuer-revocation-failures.ts'
TEST='apps/web/src/ag-ui/issuer-revocation-failures.spec.ts'
RUNNER='scripts/lab-26o-issuer-failure-review.py'
SOURCE_SHA='369c3167403e772b0a5bdd24b631b2b4b6d3630c4900343bdc60f6889cfcc5de'
TEST_SHA='8032ce7e262f4f0689fca91421a117c4f95db0ddf4549db25ee3bbb8a9915da5'
ASSERTIONS=329
FIXTURE_ASSERTIONS=51
EXPECTED_UNTRACKED=sorted((SRC,TEST,RUNNER))
BLOBS={
 'ROADMAP.md':'7aacdcf445566d6adbb806fb1c296a57df9d3128',
 'CURRENT.md':'f15f9674d7c50c9a2bf7e2c78e3b02c88733e093',
 'docs/journal/lab-23-ag-ui.md':'eda5e3fb6c0baffafa477a69288aa2d8e66e4233',
 'apps/web/src/ag-ui/external-interop-gates.ts':'5ea2006f07f16980f0ed2bf29ed58d10e23b44df',
 'apps/web/src/ag-ui/external-interop-gates.spec.ts':'7e2f443a12764f89154ca0cef6b5d30dcb88a45c',
 'scripts/lab-26n-external-interop-review.py':'a980238c76956c92355782a8878be3c59dd0e91f',
 'apps/web/src/ag-ui/trusted-transaction-boundary.ts':'673f511c91781b59184095ed74f588e8bb81b60d',
 'apps/web/src/ag-ui/authorized-durable-replay.ts':'4815d938b17174a7ce4a93398dba8f1ec77f1e98',
 'apps/web/src/ag-ui/replay-recovery.ts':'583a22d4697846201325ffe6be5fb120a87e2f80',
 'apps/web/src/ag-ui/gap-readiness.ts':'2a1a7c24c82ad8a22652986594a60938083e6bfa',
}
CRITICAL=(
 'published 2.6N contract composes after issuer and revocation fixtures',
 'caller privileged field principalId denied',
 'unknown fixture credential reference denied',
 'rotated retired key denied by issuer snapshot',
 'revoked fixture jti denied before replay planning',
 'untrusted revocation lookup cannot cause checkpoint access',
 'published 2.6N tenant policy still blocks cross-tenant intent',
 'unsupported SSE partial resume remains blocked',
 'issuer verification outage denied',
 'revocation store outage fails closed',
 'all G1-G9 remain open after issuer fixtures',
 'parent milestone 2.6 remains OPEN',
)

def need(ok:bool,msg:str)->None:
    if not ok:raise RuntimeError('BLOCKED: '+msg)
def git(*args:str,cwd:Path=ROOT)->str:
    return subprocess.check_output(['git',*args],cwd=cwd,text=True,stderr=subprocess.STDOUT).strip()
def digest(raw:bytes)->str:return sha256(raw).hexdigest()
def blob(raw:bytes)->str:return sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()

def schema_gate(path:Path)->None:
    need(path.is_file() and not path.is_symlink(),'pinned schema absent/symlink')
    raw=path.read_bytes()
    need(digest(raw)==SCHEMA_SHA and blob(raw)==SCHEMA_BLOB,'pinned schema hash/blob changed')
    doc=json.loads(raw)
    need(doc.get('$id')=='https://ag-ui.com/spec/1.0/schema.json','schema identity changed')
    need(len(doc['$defs']['Event']['oneOf'])==31,'AG-UI event union changed')
    print('PASS: pinned official AG-UI 1.0 schema SHA256/Git blob and 31 events',flush=True)

def preflight(schema:Path)->None:
    need(git('symbolic-ref','--quiet','--short','HEAD')=='main','expected main branch')
    need(git('rev-parse','HEAD')==HEAD,'HEAD differs from published 2.6N baseline')
    need(git('rev-parse','origin/main')==HEAD,'origin/main differs from published baseline')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked/index changes detected')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines())==EXPECTED_UNTRACKED,
         'unexpected untracked files')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents')==REFERENCE,
         'pinned workshop changed')
    for path,expected in BLOBS.items():
        need(git('rev-parse','HEAD:'+path)==expected,'published blob drift: '+path)
        need(git('hash-object',path)==expected,'tracked worktree drift: '+path)
    for path,expected in ((SRC,SOURCE_SHA),(TEST,TEST_SHA)):
        p=ROOT/path
        need(p.is_file() and not p.is_symlink() and digest(p.read_bytes())==expected,
             '2.6O payload SHA drift: '+path)
    need((ROOT/RUNNER).is_file() and not (ROOT/RUNNER).is_symlink(),
         '2.6O runner missing/symlink')
    roadmap=(ROOT/'ROADMAP.md').read_text(encoding='utf-8').splitlines()
    need(roadmap.count('- [ ] 2.6 AG-UI')==1,'2.6 parent closed unexpectedly')
    need(roadmap.count('  - [ ] 2.6O AG-UI external issuer, revocation and transactional store failure gates')==1,
         '2.6O roadmap anchor missing')
    schema_gate(schema)
    need(subprocess.run(['openssl','version'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False).returncode==0,
         'OpenSSL CLI required for isolated RS256 fixture')
    print('PASS: exact fc68c81 HEAD/origin, ten Git blobs, pinned workshop, three 2.6O files',flush=True)
    print('PASS: read-only preflight; no Git writes, network, Agent Server or real identity provider',flush=True)

# Isolated offline RS256 issuer fixture with ephemeral generated keypairs.
# Public PEM snapshots are a stand-in for an issuer's trusted JWKS: this is
# deliberately NOT HTTPS/JWKS fetch, OIDC discovery, network TLS or key pinning.
# All cryptographic verification uses the OpenSSL CLI, NOT custom RSA code.
TEST_NOW=1_000_500
ISSUER='https://fixture.invalid/masl-issuer'
AUDIENCE='masl-agui-fixture'
IDS=re.compile(r'[A-Za-z0-9._:-]{1,128}\Z')
B64=re.compile(r'[A-Za-z0-9_-]+\Z')

def b64(raw:bytes)->str:return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()
def unb64(value:str)->bytes:
    if type(value) is not str or not B64.fullmatch(value):raise ValueError('base64url-shape')
    raw=base64.urlsafe_b64decode(value+'='*(-len(value)%4))
    if b64(raw)!=value:raise ValueError('noncanonical-base64url')
    return raw

def unique_json(raw:bytes)->object:
    def parse_pairs(pairs:list[tuple[str,object]])->dict:
        out={}
        for key,val in pairs:
            if key in out:raise ValueError('duplicate-json-field')
            out[key]=val
        return out
    return json.loads(raw.decode('utf-8'),object_pairs_hook=parse_pairs)

def openssl(args:list[str],data:bytes|None=None)->bytes:
    r=subprocess.run(['openssl',*args],input=data,stdout=subprocess.PIPE,
                     stderr=subprocess.PIPE,timeout=15,check=False)
    need(r.returncode==0,'OpenSSL fixture failed: '+str(args[:2]))
    return r.stdout

def keypair(folder:Path,kid:str)->tuple[Path,Path]:
    private=folder/(kid+'-test-private.pem')
    public=folder/(kid+'-public.pem')
    openssl(['genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(private)])
    openssl(['pkey','-in',str(private),'-pubout','-out',str(public)])
    need(public.is_file() and private.is_file(),'fixture keys were not generated')
    return private,public

def token(private:Path,kid:str,claims:dict|None=None,header:dict|None=None)->str:
    head={'alg':'RS256','typ':'JWT','kid':kid} if header is None else header
    payload={'iss':ISSUER,'aud':AUDIENCE,'sub':'principal-A','tenant':'tenant-A',
             'jti':'jti-A','iat':TEST_NOW-30,'nbf':TEST_NOW-30,
             'exp':TEST_NOW+120,'epoch':9} if claims is None else claims
    part=b64(json.dumps(head,separators=(',',':'),sort_keys=True).encode())+'.'+\
         b64(json.dumps(payload,separators=(',',':'),sort_keys=True).encode())
    signature=openssl(['dgst','-sha256','-sign',str(private)],part.encode())
    return part+'.'+b64(signature)

def verify(token_value:str,public_keys:dict[str,Path],disabled:frozenset[str]=frozenset(),
           now:int=TEST_NOW)->tuple[str,dict|None]:
    if type(token_value) is not str or len(token_value)>4096 or token_value.count('.')!=2:
        return 'jwt-format-denied',None
    try:
        a,b,c=token_value.split('.')
        header=unique_json(unb64(a));claims=unique_json(unb64(b));signature=unb64(c)
        if not isinstance(header,dict) or set(header)!={'alg','typ','kid'} or\
           header.get('alg')!='RS256' or header.get('typ')!='JWT' or\
           type(header.get('kid')) is not str:
            return 'jwt-header-denied',None
        kid=header['kid']
        if kid in disabled or kid not in public_keys or not IDS.fullmatch(kid):
            return 'jwks-kid-untrusted',None
        public=public_keys[kid]
        if not public.is_file() or public.is_symlink():return 'jwks-unavailable',None
        with tempfile.NamedTemporaryFile(prefix='masl-26o-sig-') as file:
            file.write(signature);file.flush()
            result=subprocess.run(['openssl','dgst','-sha256','-verify',str(public),
                '-signature',file.name],input=(a+'.'+b).encode(),stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,timeout=15,check=False)
        if result.returncode!=0:return 'jwt-signature-denied',None
        if not isinstance(claims,dict) or set(claims)!=\
           {'iss','aud','sub','tenant','jti','iat','nbf','exp','epoch'}:
            return 'jwt-claims-denied',None
        if claims['iss']!=ISSUER or claims['aud']!=AUDIENCE or any(
           type(claims[k]) is not str or not IDS.fullmatch(claims[k])
           for k in ('sub','tenant','jti')):
            return 'jwt-identity-denied',None
        if any(type(claims[k]) is not int or claims[k]<0
               for k in ('iat','nbf','exp','epoch')):
            return 'jwt-claims-denied',None
        if claims['iat']>now or claims['nbf']>now or claims['exp']<=now or\
           claims['exp']<=claims['iat'] or claims['exp']-claims['iat']>300:
            return 'jwt-time-denied',None
        return 'fixture-verified',claims
    except (ValueError,UnicodeError,TypeError,KeyError,OverflowError,
            base64.binascii.Error,subprocess.TimeoutExpired,OSError):
        return 'jwt-format-denied',None

DB_SCHEMA='''
CREATE TABLE acl(tenant TEXT NOT NULL,thread TEXT NOT NULL,principal TEXT NOT NULL,
  epoch INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tenant,thread));
CREATE TABLE receipts(tenant TEXT NOT NULL,thread TEXT NOT NULL,run_id TEXT NOT NULL,
  principal TEXT NOT NULL,idem_key TEXT NOT NULL,revision INTEGER NOT NULL,
  payload_sha256 TEXT NOT NULL,token_id TEXT NOT NULL,
  PRIMARY KEY(tenant,thread,run_id),UNIQUE(tenant,idem_key),
  FOREIGN KEY(tenant,thread) REFERENCES acl(tenant,thread));
CREATE TABLE revoked(tenant TEXT NOT NULL,token_id TEXT NOT NULL,
  revoked_at INTEGER NOT NULL,PRIMARY KEY(tenant,token_id));
'''

def connect(path:Path)->sqlite3.Connection:
    db=sqlite3.connect(path,timeout=10,isolation_level=None)
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=10000')
    return db

def create_store(path:Path)->None:
    with connect(path) as db:
        need(db.execute('PRAGMA journal_mode=WAL').fetchone()[0]=='wal','SQLite WAL unavailable')
        db.execute('PRAGMA synchronous=FULL')
        db.executescript(DB_SCHEMA)
        db.executemany('INSERT INTO acl(tenant,thread,principal,epoch) VALUES(?,?,?,?)',[
            ('tenant-A','thread-A','principal-A',9),
            ('tenant-A','thread-B','principal-A',9),
            ('tenant-A','race-thread','principal-A',9),
            ('tenant-B','thread-A','principal-B',9),
        ])

def transact(db_path:Path,jwt:str,trust:dict[str,Path],disabled:frozenset[str],
             tenant:str,thread:str,run:str,idem:str,payload:bytes,revision:int,
             failure:str='none')->str:
    result,claims=verify(jwt,trust,disabled)
    if result!='fixture-verified' or claims is None:return result
    if any(type(v) is not str or not IDS.fullmatch(v) for v in (tenant,thread,run,idem)):
        return 'intent-identity-invalid'
    if type(payload) is not bytes or not 0<len(payload)<=131072:return 'payload-invalid'
    if type(revision) is not int or not 0<=revision<1024:return 'revision-invalid'
    if claims['tenant']!=tenant:return 'token-tenant-denied'
    if failure=='before-begin':return 'store-unavailable'
    digest_value=digest(payload)
    try:db=connect(db_path)
    except sqlite3.Error:return 'store-unavailable'
    try:
        db.execute('BEGIN IMMEDIATE')
        acl=db.execute('SELECT principal,epoch,revision FROM acl WHERE tenant=? AND thread=?',
                       (tenant,thread)).fetchone()
        if acl is None or acl[0]!=claims['sub']:return 'thread-acl-denied'
        if acl[1]!=claims['epoch']:return 'policy-epoch-stale'
        if db.execute('SELECT 1 FROM revoked WHERE tenant=? AND token_id=?',
                      (tenant,claims['jti'])).fetchone():return 'token-revoked'
        old=db.execute('SELECT thread,run_id,principal,payload_sha256 FROM receipts '
                       'WHERE tenant=? AND idem_key=?',(tenant,idem)).fetchone()
        if old is not None:
            return 'duplicate-no-write' if old==(thread,run,claims['sub'],digest_value) else \
                   'idempotency-conflict'
        if db.execute('SELECT 1 FROM receipts WHERE tenant=? AND thread=? AND run_id=?',
                      (tenant,thread,run)).fetchone():return 'run-key-conflict'
        if acl[2]!=revision:return 'cas-stale-revision'
        update=db.execute('UPDATE acl SET revision=revision+1 WHERE tenant=? AND thread=? '
                          'AND principal=? AND epoch=? AND revision=?',
                          (tenant,thread,claims['sub'],claims['epoch'],revision))
        if update.rowcount!=1:return 'cas-lost-race'
        if failure=='after-cas-before-receipt':return 'injected-before-commit'
        db.execute('INSERT INTO receipts VALUES(?,?,?,?,?,?,?,?)',
                   (tenant,thread,run,claims['sub'],idem,revision+1,digest_value,claims['jti']))
        if failure=='after-receipt-before-commit':return 'injected-before-commit'
        db.execute('COMMIT')
        if failure=='after-commit-before-ack':return 'ack-lost-after-commit'
        return 'committed'
    except sqlite3.Error:return 'store-unavailable'
    finally:
        if db.in_transaction:db.execute('ROLLBACK')
        db.close()

def revoke(path:Path,tenant:str,jti:str,when:int=TEST_NOW)->None:
    with connect(path) as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('INSERT INTO revoked VALUES(?,?,?)',(tenant,jti,when))
        db.execute('COMMIT')

def race_worker(path:str,start:object,results:object,jwt:str,kid:str,public:str,suffix:str)->None:
    try:
        if not start.wait(timeout=15):raise RuntimeError('race barrier timeout')
        result=transact(Path(path),jwt,{kid:Path(public)},frozenset(),
              'tenant-A','race-thread','race-'+suffix,'idem-race-'+suffix,
              b'race-content-'+suffix.encode(),0)
        results.put(result)
    except Exception as exc:results.put('worker-error:'+str(exc))

def fixture_suite(out:Path)->None:
    db_path=out/'issuer-proof.sqlite3'
    need(not db_path.exists(),'fixture output already exists')
    create_store(db_path)
    checks=0
    def ok(condition:bool,label:str)->None:
        nonlocal checks
        need(condition,'issuer/store fixture failed: '+label)
        checks+=1
        print('PASS: '+label,flush=True)
    with tempfile.TemporaryDirectory(prefix='masl-26o-ephemeral-rsa-') as temp:
        folder=Path(temp)
        private1,public1=keypair(folder,'fixture-rsa-k1')
        private2,public2=keypair(folder,'fixture-rsa-k2')
        trust={'fixture-rsa-k1':public1,'fixture-rsa-k2':public2}
        disabled=frozenset()
        good=token(private1,'fixture-rsa-k1')
        newer=token(private2,'fixture-rsa-k2')
        status,claims=verify(good,trust)
        ok(status=='fixture-verified' and claims is not None,
           'OpenSSL RS256 verifies local issuer public key snapshot')
        ok(verify(newer,trust)[0]=='fixture-verified',
           'local rotating public key snapshot accepts second active kid')
        ok(verify(good,{'fixture-rsa-k2':public2})[0]=='jwks-kid-untrusted',
           'old kid refused when removed from pinned fixture trust snapshot')
        ok(verify(good,trust,frozenset({'fixture-rsa-k1'}))[0]=='jwks-kid-untrusted',
           'disabled retired key blocked even with public key present')
        ok(verify(good,{'fixture-rsa-k1':public2})[0]=='jwt-signature-denied',
           'key substitution for same kid fails RSA signature verification')
        signature=bytearray(unb64(good.split('.')[2]));signature[0]^=0x01
        tampered='.'.join([*good.split('.')[:2],b64(bytes(signature))])
        ok(verify(tampered,trust)[0]=='jwt-signature-denied',
           'modified JWT signature is rejected')
        ok(verify(token(private1,'fixture-rsa-k1',header={'typ':'JWT','alg':'none','kid':'fixture-rsa-k1'}),trust)[0]==
           'jwt-header-denied','alg none rejected even when fixture can sign malformed header')
        ok(verify(token(private1,'fixture-rsa-k1',header={'typ':'JWT','alg':'HS256','kid':'fixture-rsa-k1'}),trust)[0]==
           'jwt-header-denied','algorithm confusion to HS256 rejected')
        ok(verify(token(private1,'unknown-kid'),trust)[0]=='jwks-kid-untrusted',
           'unlisted issuer key ID denied')
        ok(verify('x.y.z',trust)[0]=='jwt-format-denied',
           'malformed JWT base64url rejected')
        need(claims is not None,'verified claims missing')
        ok(verify(token(private1,'fixture-rsa-k1',{**claims,'iss':'https://untrusted.invalid'}),trust)[0]==
           'jwt-identity-denied','wrong issuer denied despite signed fixture token')
        ok(verify(token(private1,'fixture-rsa-k1',{**claims,'aud':'bad-audience'}),trust)[0]==
           'jwt-identity-denied','wrong audience denied despite valid RSA signature')
        ok(verify(token(private1,'fixture-rsa-k1',{**claims,'exp':TEST_NOW}),trust)[0]==
           'jwt-time-denied','expired credential refused')
        ok(verify(token(private1,'fixture-rsa-k1',{**claims,'nbf':TEST_NOW+1}),trust)[0]==
           'jwt-time-denied','not-before boundary enforced')
        ok(verify(token(private1,'fixture-rsa-k1',{**claims,'iat':TEST_NOW+1}),trust)[0]==
           'jwt-time-denied','future issuance rejected')
        ok(verify(token(private1,'fixture-rsa-k1',{**claims,'exp':TEST_NOW+400}),trust)[0]==
           'jwt-time-denied','token TTL limit enforced')
        ok(verify(token(private1,'fixture-rsa-k1',{**claims,'epoch':True}),trust)[0]==
           'jwt-claims-denied','boolean epoch cannot satisfy integer claim')
        ok(verify(token(private1,'fixture-rsa-k1',{**claims,'elevated':True}),trust)[0]==
           'jwt-claims-denied','unexpected elevated security claim rejected')
        # Signed duplicate JSON field: RFC JSON ambiguity fails closed even with valid RSA.
        raw=('{"iss":"'+ISSUER+'","iss":"evil",'+
          ','.join(json.dumps(k)+':'+json.dumps(v) for k,v in claims.items() if k!='iss')+'}').encode()
        header=good.split('.')[0];pair=header+'.'+b64(raw)
        malformed=pair+'.'+b64(openssl(['dgst','-sha256','-sign',str(private1)],pair.encode()))
        ok(verify(malformed,trust)[0]=='jwt-format-denied',
           'duplicate JWT claim rejected even with valid RSA signature')
        payload=b'fixture-synthetic-AGUI-payload'
        def put(j: str=good, thread:str='thread-A', run:str='run-1',idem:str='idem-1',
                revision:int=0, failure:str='none', raw:bytes=payload)->str:
            return transact(db_path,j,trust,disabled,'tenant-A',thread,run,idem,raw,revision,failure)
        ok(put()=='committed','valid signed fixture and local ACL commits receipt transaction')
        with connect(db_path) as db:
            ok(db.execute('SELECT payload_sha256,revision FROM receipts WHERE run_id=?',
                 ('run-1',)).fetchone()==(digest(payload),1),
                 'receipt content digest computed from fixture bytes')
        ok(put()=='duplicate-no-write',
           'lost-response normal retry deduplicated after new SQLite connection')
        ok(put(raw=payload+b'tampered')=='idempotency-conflict',
           'same idem key with mutated bytes fails closed')
        ok(put(run='run-2')=='idempotency-conflict',
           'same idem key cannot be reassigned to different run')
        ok(put(idem='idem-other')=='run-key-conflict',
           'run cannot be committed under new idempotency key')
        ok(put(run='run-2',idem='idem-2',revision=0)=='cas-stale-revision',
           'stale checkpoint revision rejected')
        ok(put(run='run-2',idem='idem-2',revision=1,failure='before-begin')=='store-unavailable',
           'store outage before transaction produces zero writes')
        ok(put(run='run-2',idem='idem-2',revision=1,failure='after-cas-before-receipt')==
           'injected-before-commit','fault after CAS before receipt rolls transaction back')
        ok(put(run='run-2',idem='idem-2',revision=1,failure='after-receipt-before-commit')==
           'injected-before-commit','fault after receipt before COMMIT rolls transaction back')
        with connect(db_path) as db:
            ok(db.execute('SELECT revision FROM acl WHERE tenant=? AND thread=?',
               ('tenant-A','thread-A')).fetchone()[0]==1,
               'two injected precommit failures preserve original revision')
            ok(db.execute('SELECT COUNT(*) FROM receipts WHERE tenant=? AND thread=?',
               ('tenant-A','thread-A')).fetchone()[0]==1,
               'precommit rollbacks never leave orphan receipt')
        ok(put(run='run-2',idem='idem-2',revision=1,failure='after-commit-before-ack')==
           'ack-lost-after-commit','postcommit lost acknowledgment is ambiguous not failed')
        with connect(db_path) as db:
            ok(db.execute('SELECT revision FROM acl WHERE tenant=? AND thread=?',
               ('tenant-A','thread-A')).fetchone()[0]==2,
               'ambiguous postcommit outcome persisted exactly one revision')
        ok(put(run='run-2',idem='idem-2',revision=1)=='duplicate-no-write',
           'idempotent reconciliation after lost ack discovers prior receipt')
        with connect(db_path) as db:
            ok(db.execute('SELECT COUNT(*) FROM receipts WHERE tenant=? AND thread=?',
               ('tenant-A','thread-A')).fetchone()[0]==2,
               'postcommit retry does not create duplicate receipt')
        revoke(db_path,'tenant-A','jti-A')
        ok(put(run='run-3',idem='idem-3',revision=2)=='token-revoked',
           'revoked jti blocks new transaction')
        ok(put(run='run-1',idem='idem-1',revision=0)=='token-revoked',
           'revoked jti also blocks old duplicate replay')
        next_claims={**claims,'jti':'jti-B'}
        new_token=token(private2,'fixture-rsa-k2',next_claims)
        ok(put(j=new_token,run='run-3',idem='idem-3',revision=2)=='committed',
           'new active rotated key and distinct unrevoked jti can commit')
        ok(put(j=good,run='run-4',idem='idem-4',revision=3)=='token-revoked',
           'retired key token remains rejected by persisted revocation')
        ok(transact(db_path,new_token,trust,disabled,'tenant-B','thread-A','run-4',
             'idem-4',payload,0)=='token-tenant-denied',
           'signed JWT cannot cross tenant boundary')
        ok(transact(db_path,new_token,trust,disabled,'tenant-A','missing-thread','run-4',
             'idem-4',payload,0)=='thread-acl-denied',
           'signed principal requires existing thread ACL')
        ok(put(j=new_token,thread='thread-A',run='run-4',idem='idem-4',revision=2)==
           'cas-stale-revision','reconciled state refuses old checkpoint revision')
        ok(put(j=new_token,run='run-4',idem='bad/key',revision=3)=='intent-identity-invalid',
           'malformed id rejected before database write')
        ok(put(j=new_token,run='run-4',idem='idem-4',revision=3,raw=b'')=='payload-invalid',
           'empty bytes rejected before transaction')
        # Competing separate OS processes use same ephemeral trusted public key
        # and unique unrevoked token ID. Transactional rev CAS is SQLite-local.
        race_claims={**claims,'jti':'jti-race'}
        race_token=token(private2,'fixture-rsa-k2',race_claims)
        ctx=mp.get_context('spawn');go=ctx.Event();outcomes=ctx.Queue()
        left=ctx.Process(target=race_worker,args=(str(db_path),go,outcomes,race_token,
                           'fixture-rsa-k2',str(public2),'left'))
        right=ctx.Process(target=race_worker,args=(str(db_path),go,outcomes,race_token,
                            'fixture-rsa-k2',str(public2),'right'))
        left.start();right.start();go.set()
        left.join(25);right.join(25)
        if left.is_alive():left.terminate();left.join()
        if right.is_alive():right.terminate();right.join()
        ok(left.exitcode==0 and right.exitcode==0,
           'two separate OS processes completed competing SQLite operations')
        results=sorted([outcomes.get(timeout=5),outcomes.get(timeout=5)])
        ok(results==['cas-stale-revision','committed'],
           'SQLite CAS admits one winner and one stale loser after key rotation')
        with connect(db_path) as db:
            ok(db.execute('SELECT revision FROM acl WHERE tenant=? AND thread=?',
               ('tenant-A','race-thread')).fetchone()[0]==1,
               'concurrent fixture checkpoint advances exactly once')
            ok(db.execute('SELECT COUNT(*) FROM receipts WHERE thread=?',
               ('race-thread',)).fetchone()[0]==1,
               'competing processes create exactly one durable receipt')
            ok(db.execute('SELECT COUNT(*) FROM receipts WHERE tenant=?',
               ('tenant-A',)).fetchone()[0]==4,
               'rejected and rolled-back attempts produce no extra receipts')
            ok(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok',
               'original physical fixture SQLite database integrity passes')
            db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        ok(db_path.is_file() and db_path.stat().st_size>0,
           'physical SQLite evidence persisted outside checkout')
    print(f'{checks} 2.6O fixture RS256 issuer/revocation/store-failure assertions passed',flush=True)

def gate(name:str,command:list[str],cwd:Path,out:Path)->None:
    with out.open('w',encoding='utf-8') as stream:
        try:
            result=subprocess.run(command,cwd=cwd,stdout=stream,stderr=subprocess.STDOUT,
                                  timeout=240,check=False)
        except subprocess.TimeoutExpired:
            raise RuntimeError('BLOCKED: gate timeout '+name) from None
    need(result.returncode==0,'gate failed: '+name+' at '+str(out))
    print('PASS: '+name+' SHA256 '+digest(out.read_bytes()),flush=True)

def run(schema:Path,out:Path)->None:
    preflight(schema)
    root=ROOT.resolve();target=out.resolve()
    need(root!=target and root not in target.parents,'evidence must stay outside Git')
    need(not out.exists(),'evidence directory already exists')
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
         'src/ag-ui/issuer-revocation-failures.spec.ts','--outDir',str(ssr),'--emptyOutDir'],
         WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    gate('pure.log',['node',str(ssr/'issuer-revocation-failures.spec.js')],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf-8')
    m=re.search(r'(?m)^(\d+) 2\.6O selected issuer/revocation boundary assertions passed\s*$',pure)
    need(m is not None and int(m.group(1))==ASSERTIONS,
         f'expected {ASSERTIONS} 2.6O TS assertions')
    need(pure.count('PASS: ')==ASSERTIONS,'pure log PASS count differs')
    for label in CRITICAL:need('PASS: '+label in pure,'critical case missing: '+label)
    gate('fixture.log',[sys.executable,str(ROOT/RUNNER),'--fixture-child',
         '--output-dir',str(out)],ROOT,out/'fixture.log')
    log=(out/'fixture.log').read_text(encoding='utf-8')
    m=re.search(r'(?m)^(\d+) 2\.6O fixture RS256 issuer/revocation/store-failure assertions passed\s*$',log)
    need(m is not None and int(m.group(1))==FIXTURE_ASSERTIONS,
         f'expected {FIXTURE_ASSERTIONS} issuer/store assertions')
    need(log.count('PASS: ')==FIXTURE_ASSERTIONS,'fixture log PASS count differs')
    db=out/'issuer-proof.sqlite3'
    need(db.is_file() and not db.is_symlink(),'physical SQLite proof missing')
    with sqlite3.connect(f'file:{db}?mode=ro&immutable=1',uri=True) as conn:
        need(conn.execute('PRAGMA integrity_check').fetchone()[0]=='ok',
             'physical SQLite integrity failed')
        need(conn.execute('SELECT COUNT(*) FROM receipts').fetchone()[0]==4,
             'physical receipt count differs from isolated fixture')
        need(conn.execute('SELECT COUNT(*) FROM revoked').fetchone()[0]==1,
             'physical jti revocation count differs')
    preflight(schema)
    logs={p:digest((out/p).read_bytes()) for p in
          ('lint.log','build.log','compile.log','pure.log','fixture.log')}
    evidence={
      'lab':'2.6O','status':'PASS','baseline':HEAD,'reference_commit':REFERENCE,
      'agui_upstream_commit':AGUI_COMMIT,'schema_sha256':SCHEMA_SHA,'schema_blob':SCHEMA_BLOB,
      'published_git_blobs':BLOBS,
      'scope':'selected TS issuer/revocation callback contracts plus separate offline OpenSSL RS256 and SQLite transactional failure fixture',
      'typescript_assertions':ASSERTIONS,'fixture_assertions':FIXTURE_ASSERTIONS,
      'critical_cases':len(CRITICAL),'gate_logs_sha256':logs,
      'sqlite_sha256':digest(db.read_bytes()),
      'sources_sha256':{p:digest((ROOT/p).read_bytes()) for p in (SRC,TEST,RUNNER)},
      'gap_ids_open':['G'+str(i) for i in range(1,10)],
      'adapter_ready':False,'parent_2_6_open':True,
      'external_issuer_verified':False,'online_jwks_verified':False,
      'production_revocation_verified':False,'production_store_verified':False,
      'security_signoff':False,
      'limits':[
         'OpenSSL RS256 signatures use ephemeral fixture-generated keys and local public PEM lookup, NOT network-fetched JWKS/OIDC',
         'TypeScript trust/identity/revocation/checkpoint callbacks are synthetic and NOT cryptographically bound to Python fixture',
         'The separate SQLite jti revocation and CAS fixture is not cross-service, production or distributed authorization',
         'The after-COMMIT acknowledgment-loss scenario is simulated: reconciliation uses a subsequent local receipt query',
         'There is no real issuer availability, key distribution or revocation propagation guarantee',
         'No upstream AG-UI full recursive conformance, PartSource resolution, DLP/media or independent security sign-off',
         'No Agent Server frontend/REST-SSE adapter, partial resume, Runtime/model/tool or network',
         'All G1-G9 and parent 2.6 remain OPEN; adapter BLOCKED',
      ],'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    markdown=['# MASL 2.6O — selected issuer/revocation and SQLite failure injection','',
       f'Published baseline `{HEAD}`; AG-UI `{AGUI_COMMIT}`.','',
       f'**{ASSERTIONS}/{ASSERTIONS}** TS assertions, **{FIXTURE_ASSERTIONS}/{FIXTURE_ASSERTIONS}** OpenSSL/SQLite assertions, five gates PASS.','',
       '| Gate | SHA-256 |','|---|---|',
       *[f'| `{p}` | `{h}` |' for p,h in logs.items()],
       '',f'Physical isolated SQLite SHA-256 `{digest(db.read_bytes())}`.','',
       '## Known limitations','',*[f'- {s}' for s in evidence['limits']],
       '', 'G1–G9 OPEN; parent 2.6 OPEN; adapter BLOCKED.','']
    (out/'review.md').write_text('\n'.join(markdown),encoding='utf-8')
    print('REVIEW STATUS: PASS — selected 2.6O issuer and transactional failure fixtures; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)
    for p in ('review.json','review.md','issuer-proof.sqlite3'):
        print('EVIDENCE: '+p+' SHA256 '+digest((out/p).read_bytes()),flush=True)

def main()->None:
    ap=argparse.ArgumentParser(description=__doc__)
    options=ap.add_mutually_exclusive_group(required=True)
    options.add_argument('--preflight',action='store_true')
    options.add_argument('--run',action='store_true')
    options.add_argument('--fixture-child',action='store_true',help=argparse.SUPPRESS)
    ap.add_argument('--schema',type=Path,default=DEFAULT_SCHEMA)
    ap.add_argument('--output-dir',type=Path)
    args=ap.parse_args()
    try:
        if args.fixture_child:
            need(args.output_dir is not None,'--fixture-child requires --output-dir')
            fixture_suite(args.output_dir.expanduser().absolute())
        elif args.preflight:preflight(args.schema.expanduser().absolute())
        else:
            need(args.output_dir is not None,'--run requires --output-dir')
            run(args.schema.expanduser().absolute(),args.output_dir.expanduser().absolute())
    except (RuntimeError,ValueError,KeyError,OSError,TypeError,sqlite3.Error,
            subprocess.CalledProcessError) as error:
        s=str(error)
        print(s if s.startswith('BLOCKED:') else 'BLOCKED: '+s,file=sys.stderr)
        raise SystemExit(2) from None

if __name__=='__main__':main()
