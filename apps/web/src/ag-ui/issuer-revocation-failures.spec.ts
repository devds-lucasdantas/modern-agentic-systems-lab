import {makeSelectedIssuerFailureGate,reviewIssuerFailureBlockers,
  type FixtureIssuerIdentity,type FixtureIssuerTrust,type FixtureRevocation,
  type IssuerFailureVerdict} from './issuer-revocation-failures'
import type {RecoveryAttempt} from './replay-recovery'
import type {ReplayIntent} from './authorized-durable-replay'
import type {HttpReviewInput} from './stream-boundary'

let count=0
const check=(good:boolean,label:string):void=>{
  if(!good)throw Error('FAIL: '+label)
  count++;console.log('PASS: '+label)
}
const enc=(s:string)=>new TextEncoder().encode(s)
const http:HttpReviewInput={requestMethod:'POST',requestContentType:'application/json',
  requestAccept:'text/event-stream',responseStatus:200,responseContentType:'text/event-stream',
  lastEventIdSent:false}
const attempt=(tenant='tenant-A',thread='thread-A',run='run-A'):RecoveryAttempt=>({
  tenantRef:tenant,threadId:thread,runId:run,attemptId:'attempt-'+run,ordinal:1,
  mode:'full-restart',connectionEnded:true,http,wire:[enc([
    {type:'RUN_STARTED',threadId:thread,runId:run,protocolVersion:'1.0'},
    {type:'RUN_FINISHED',threadId:thread,runId:run},
  ].map(x=>'data: '+JSON.stringify(x)+'\n\n').join(''))],
})
const intent=(change:Partial<ReplayIntent>={}):ReplayIntent=>({operation:'commit',
  tenantRef:'tenant-A',threadId:'thread-A',runId:'run-A',idempotencyKey:'idem-A',
  declaredCommitment:'a'.repeat(64),expectedRevision:0,attempts:[attempt()],...change})
const TRUST:FixtureIssuerTrust={kind:'fixture-issuer-snapshot',
  issuer:'https://fixture.invalid/masl-issuer',audience:'masl-agui-fixture',
  generation:3,activeKids:['fixture-rsa-k1','fixture-rsa-k2'],disabledKids:[]}
const IDENTITY:FixtureIssuerIdentity={provenance:'issuer-fixture-callback',
  principalId:'principal-A',tenantId:'tenant-A',allowedThreadIds:['thread-A','thread-B'],
  policyEpoch:9,issuer:TRUST.issuer,audience:TRUST.audience,
  keyId:'fixture-rsa-k1',tokenId:'jti-A',issuedAt:1000,notBefore:1000,expiresAt:1200,
  trustGeneration:3}
const REVOCATION:FixtureRevocation={kind:'fixture-jti-lookup',tenantId:'tenant-A',
  tokenId:'jti-A',trustGeneration:3,revoked:false,observedAt:1050}
const SNAPSHOT={tenantId:'tenant-A',policyEpoch:9,revision:0,receipts:[]}
let currentNow:unknown=1050,currentTrust:unknown=TRUST,currentIdentity:unknown=IDENTITY,
  currentRevocation:unknown=REVOCATION,currentSnapshot:unknown=SNAPSHOT
let trustCalls=0,verifyCalls=0,revocationCalls=0,checkpointCalls=0
const gate=makeSelectedIssuerFailureGate({
  clockSeconds:()=>currentNow,
  trustSnapshotFixture:()=>{trustCalls++;return currentTrust},
  verifyIssuerFixture:(ref:string)=>{verifyCalls++;return ref==='fixture-ticket-A'?currentIdentity:null},
  revocationLookupFixture:(_tenant:string,_token:string)=>{revocationCalls++;return currentRevocation},
  readCheckpointFixture:(_tenant:string,_principal:string)=>{checkpointCalls++;return currentSnapshot},
})
const req=(intents:unknown=[intent()],credentialRef='fixture-ticket-A')=>({credentialRef,intents})
const blocked=(r:IssuerFailureVerdict,code:string,label:string):void=>{
  check(r.status==='blocked'&&r.code===code,label)
  check(r.status==='blocked'&&r.exposedEvents===0,label+': no partial data exposure')
  check(!r.externalIssuerVerified&&!r.liveRevocationVerified&&
    !r.atomicTrustStoreVerified&&!r.productionRecoveryVerified&&!r.adapterReady,
    label+': no production trust promotion')
}
const successful=gate.review(req())
check(successful.status==='planned','published 2.6N contract composes after issuer and revocation fixtures')
if(successful.status==='planned'){
  check(successful.tenantId==='tenant-A'&&successful.principalId==='principal-A',
    'identity comes from fixture callback and not request metadata')
  check(successful.expectedRevision===0&&successful.nextRevision===1,
    'published 2.6M/L revision remains a pure proposed update')
  check(successful.plannedCommits===1&&successful.duplicates===0,'exact one selected commit proposed')
  check(successful.scope==='selected-issuer-revocation-fixture-only',
    'coverage never claims actual issuer interoperability')
  check(successful.noEventExposure&&!('events' in successful)&&!('credentialRef' in successful),
    'neither events nor credential reference escape')
  check(!successful.externalIssuerVerified&&!successful.liveRevocationVerified&&
    !successful.atomicTrustStoreVerified&&!successful.adapterReady,
    'accepted plan does not establish production security')
}
check(trustCalls===1&&verifyCalls===1&&revocationCalls===1&&checkpointCalls===1,
  'trust verifier revocation and store consulted once in order')
const duplicate=gate.review(req([intent(),intent()]))
check(duplicate.status==='planned','existing local duplicate replay behavior remains composed')
if(duplicate.status==='planned')
  check(duplicate.duplicates===1&&duplicate.nextRevision===1,
    'local duplicate cannot propose a second revision')
const second=intent({threadId:'thread-B',runId:'run-B',idempotencyKey:'idem-B',
  expectedRevision:1,attempts:[attempt('tenant-A','thread-B','run-B')]})
const serial=gate.review(req([intent(),second]))
check(serial.status==='planned','two authorized fixture threads can form serial proposals')
if(serial.status==='planned')check(serial.nextRevision===2,'serial proposed revisions remain ordered')

for(const v of [null,undefined,false,0,{},[],{credentialRef:'fixture-ticket-A'},
  {credentialRef:'fixture-ticket-A',intents:[]},
  {credentialRef:'fixture-ticket-A',intents:null},
  {credentialRef:'no/slash',intents:[intent()]}])
  blocked(gate.review(v),'untrusted-request-shape',`request shape ${String(v).slice(0,25)} denied`)
for(const field of ['tenantId','principalId','threadId','allowedThreadIds','issuer',
  'audience','kid','keyId','jti','tokenId','revoked','policyEpoch','trustGeneration',
  'isAdmin','jwt','securityApproved','authorizationVerified','readCheckpoint',
  'storeCommitted','checkpoint','adapterReady','resumeToken'])
  blocked(gate.review({...req(),[field]:true}),'untrusted-request-shape',
    `caller privileged field ${field} denied`)
blocked(gate.review(req([intent()],'no-ticket')),'fixture-issuer-claim-invalid',
  'unknown fixture credential reference denied')
const beforeVerify=verifyCalls
for(const now of [null,NaN,Infinity,-1,1.5,'1050',2_000_000_001]){
  currentNow=now
  blocked(gate.review(req()),'fixture-clock-invalid',`untrusted fixture time ${String(now)} rejected`)
}
check(verifyCalls===beforeVerify,'invalid time never reaches credential verifier')
currentNow=1050
const beforeTrustVerifier=verifyCalls
for(const t of [null,false,{},[],
  {...TRUST,kind:'remote-trust-proof'},
  {...TRUST,issuer:'https://unknown.invalid'},
  {...TRUST,audience:'other'},
  {...TRUST,generation:-1},
  {...TRUST,activeKids:[]},
  {...TRUST,activeKids:['fixture-rsa-k1','fixture-rsa-k1']},
  {...TRUST,disabledKids:['fixture-rsa-k1'],activeKids:['fixture-rsa-k1','fixture-rsa-k2']},
  {...TRUST,activeKids:['un trusted']},
  {...TRUST,trustVerified:true},
  {...TRUST,jwksUri:'https://fixture.invalid'}]){
  currentTrust=t
  blocked(gate.review(req()),'fixture-trust-snapshot-invalid',
    `malformed/forged issuer trust snapshot ${JSON.stringify(t)?.slice(0,27)}`)
}
check(verifyCalls===beforeTrustVerifier,'invalid trust snapshot cannot invoke verifier')
currentTrust=TRUST
const beforeRevocation=revocationCalls
for(const patch of [
  {provenance:'client-verified'}, {principalId:''}, {tenantId:'bad tenant'},
  {allowedThreadIds:[]}, {allowedThreadIds:['thread-A','thread-A']},
  {policyEpoch:-1}, {issuer:'https://evil.invalid'}, {audience:'evil-audience'},
  {keyId:''}, {tokenId:'jti/evil'}, {issuedAt:'1000'},
  {notBefore:NaN}, {expiresAt:null}, {trustGeneration:2},
  {securityApproved:true}, {signatureVerified:true}, {admin:true},
]){
  currentIdentity={...IDENTITY,...patch}
  blocked(gate.review(req()),'fixture-issuer-claim-invalid',
    `invalid fixture issuer claim ${Object.keys(patch).join(',')}`)
}
check(revocationCalls===beforeRevocation,'invalid issuer claims cannot invoke revocation lookup')
currentIdentity=IDENTITY
for(const patch of [
  {keyId:'fixture-rsa-unknown'},
]){
  currentIdentity={...IDENTITY,...patch}
  blocked(gate.review(req()),'fixture-issuer-key-disabled','unknown issuer kid denied before revocation')
}
currentTrust={...TRUST,activeKids:['fixture-rsa-k2'],disabledKids:['fixture-rsa-k1']}
blocked(gate.review(req()),'fixture-issuer-key-disabled','rotated retired key denied by issuer snapshot')
currentTrust=TRUST
currentIdentity={...IDENTITY,keyId:'fixture-rsa-k2'}
check(gate.review(req()).status==='planned','rotated second active fixture key accepted as plan')
currentIdentity=IDENTITY
for(const [now,identity,label] of [
  [999,IDENTITY,'future issuance denied'],
  [1000,{...IDENTITY,notBefore:1001},'not-before enforced'],
  [1200,IDENTITY,'expired issuer token denied'],
  [1050,{...IDENTITY,issuedAt:1100},'issuer iat after now denied'],
  [1050,{...IDENTITY,expiresAt:1000},'invalid token lifetime denied'],
  [1050,{...IDENTITY,expiresAt:1500},'oversized token lifetime denied'],
] as const){
  currentNow=now;currentIdentity=identity
  blocked(gate.review(req()),'fixture-credential-time-invalid',label)
}
currentNow=1050;currentIdentity=IDENTITY
const revBefore=checkpointCalls
for(const rev of [null,false,{},
  {...REVOCATION,kind:'client-provided'},
  {...REVOCATION,tenantId:'tenant-B'},
  {...REVOCATION,tokenId:'jti-B'},
  {...REVOCATION,trustGeneration:2},
  {...REVOCATION,revoked:'false'},
  {...REVOCATION,observedAt:1049},
  {...REVOCATION,authoritativelyVerified:true},
]){
  currentRevocation=rev
  blocked(gate.review(req()),'fixture-revocation-not-current',
    `stale/mismatched fixture revocation ${JSON.stringify(rev)?.slice(0,25)}`)
}
check(checkpointCalls===revBefore,'untrusted revocation lookup cannot cause checkpoint access')
currentRevocation={...REVOCATION,revoked:true}
blocked(gate.review(req()),'fixture-token-revoked','revoked fixture jti denied before replay planning')
currentRevocation=REVOCATION
blocked(gate.review(req([intent({tenantRef:'tenant-B'})])),
  'published-2.6N:published-2.6M:prior-2.6L:tenant-boundary-denied',
  'published 2.6N tenant policy still blocks cross-tenant intent')
blocked(gate.review(req([intent({threadId:'thread-C'})])),
  'published-2.6N:published-2.6M:prior-2.6L:thread-authorization-denied',
  'published 2.6N unauthorized thread still denied')
blocked(gate.review(req([intent({operation:'resume'})])),
  'published-2.6N:published-2.6M:prior-2.6L:resume-credential-not-established',
  'unsupported SSE partial resume remains blocked')
blocked(gate.review(req([intent({attempts:[]})])),
  'published-2.6N:published-2.6M:prior-2.6L:selected-recovery-proof-missing',
  'published 2.6K recovery proof still required')
currentSnapshot={...SNAPSHOT,revision:1}
blocked(gate.review(req()),
  'published-2.6N:published-2.6M:prior-2.6L:checkpoint-revision-inconsistent',
  'failed/stale fixture checkpoint cannot generate a commit plan')
currentSnapshot=SNAPSHOT
const throwsTrust=makeSelectedIssuerFailureGate({clockSeconds:()=>1050,
  trustSnapshotFixture:()=>{throw Error('trust outage')},verifyIssuerFixture:()=>IDENTITY,
  revocationLookupFixture:()=>REVOCATION,readCheckpointFixture:()=>SNAPSHOT})
blocked(throwsTrust.review(req()),'fixture-trust-unavailable','issuer trust retrieval failure denied')
const throwsSignature=makeSelectedIssuerFailureGate({clockSeconds:()=>1050,
  trustSnapshotFixture:()=>TRUST,verifyIssuerFixture:()=>{throw Error('issuer unavailable')},
  revocationLookupFixture:()=>REVOCATION,readCheckpointFixture:()=>SNAPSHOT})
blocked(throwsSignature.review(req()),'fixture-verifier-unavailable','issuer verification outage denied')
const throwsRevocation=makeSelectedIssuerFailureGate({clockSeconds:()=>1050,
  trustSnapshotFixture:()=>TRUST,verifyIssuerFixture:()=>IDENTITY,
  revocationLookupFixture:()=>{throw Error('lookup offline')},readCheckpointFixture:()=>SNAPSHOT})
blocked(throwsRevocation.review(req()),'fixture-revocation-unavailable','revocation store outage fails closed')
const throwsCheckpoint=makeSelectedIssuerFailureGate({clockSeconds:()=>1050,
  trustSnapshotFixture:()=>TRUST,verifyIssuerFixture:()=>IDENTITY,
  revocationLookupFixture:()=>REVOCATION,readCheckpointFixture:()=>{throw Error('DB unavailable')}})
blocked(throwsCheckpoint.review(req()),'published-2.6N:fixture-store-unavailable',
  'checkpoint store outage fails through published 2.6N gate')
const blockers=reviewIssuerFailureBlockers()
check(blockers.allNineGapsOpen,'all G1-G9 remain open after issuer fixtures')
check(blockers.parentMilestoneOpen,'parent milestone 2.6 remains OPEN')
check(blockers.priorAdapterBlocked,'published 2.6N adapter remains BLOCKED')
for(const [name,val] of [
  ['externalIssuerAuthenticated',blockers.externalIssuerAuthenticated],
  ['networkJwksProven',blockers.networkJwksProven],
  ['productionKeyRotationProven',blockers.productionKeyRotationProven],
  ['crossServiceRevocationProven',blockers.crossServiceRevocationProven],
  ['revocationCommitAtomicityProven',blockers.revocationCommitAtomicityProven],
  ['transactionAckRecoveryProven',blockers.transactionAckRecoveryProven],
  ['durableStoreFailureRecoveryProven',blockers.durableStoreFailureRecoveryProven],
  ['operationalAgUiResumeProven',blockers.operationalAgUiResumeProven],
  ['independentSecurityReview',blockers.independentSecurityReview],
  ['adapterReady',blockers.adapterReady],
] as const)check(val===false,`${name}: fixture is not independently approved`)
check(blockers.scope==='isolated-issuer-fixture-plus-separate-sqlite-failure-tests',
  'coverage is explicitly constrained')
check(Object.isFrozen(blockers),'blocker inventory is frozen')
console.log(`${count} 2.6O selected issuer/revocation boundary assertions passed`)
