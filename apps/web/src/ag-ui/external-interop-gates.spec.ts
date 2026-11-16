import {makeSelectedExternalInteropGate,reviewExternalInteropBlockers,
  type FixtureVerifiedPrincipal,type InteropVerdict} from './external-interop-gates'
import type {ReplayIntent} from './authorized-durable-replay'
import type {RecoveryAttempt} from './replay-recovery'
import type {HttpReviewInput} from './stream-boundary'

let count=0
const check=(ok:boolean,label:string):void=>{
  if(!ok)throw Error('FAIL: '+label)
  count++;console.log('PASS: '+label)
}
const http:HttpReviewInput={requestMethod:'POST',requestContentType:'application/json',
  requestAccept:'text/event-stream',responseStatus:200,responseContentType:'text/event-stream',
  lastEventIdSent:false}
const encode=(s:string)=>new TextEncoder().encode(s)
const attempt=(tenant='tenant-A',thread='thread-A',run='run-A'):RecoveryAttempt=>({
  tenantRef:tenant,threadId:thread,runId:run,attemptId:'attempt-'+run,ordinal:1,
  mode:'full-restart',http,connectionEnded:true,wire:[encode([
    {type:'RUN_STARTED',threadId:thread,runId:run,protocolVersion:'1.0'},
    {type:'RUN_FINISHED',threadId:thread,runId:run},
  ].map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''))],
})
const intent=(patch:Partial<ReplayIntent>={}):ReplayIntent=>({operation:'commit',
  tenantRef:'tenant-A',threadId:'thread-A',runId:'run-A',idempotencyKey:'idem-A',
  declaredCommitment:'a'.repeat(64),expectedRevision:0,attempts:[attempt()],...patch})
const identity:FixtureVerifiedPrincipal={provenance:'fixture-verifier-callback',
  principalId:'principal-A',tenantId:'tenant-A',allowedThreadIds:['thread-A','thread-B'],
  policyEpoch:7,issuer:'https://fixture.invalid/masl-issuer',audience:'masl-agui-fixture',
  keyId:'fixture-k1',tokenId:'test-jti-1',issuedAt:1000,notBefore:1000,expiresAt:1240}
const seed={tenantId:'tenant-A',policyEpoch:7,revision:0,receipts:[]}
let currentIdentity:unknown=identity
let currentSnapshot:unknown=seed
let now:unknown=1050
let verifiedCalls=0,storeCalls=0
const adapters={
  verifyCredentialFixture:(ref:string):unknown=>{verifiedCalls++;return ref==='fixture-ticket-A'?currentIdentity:null},
  readCheckpointFixture:(_tenant:string,_principal:string):unknown=>{storeCalls++;return currentSnapshot},
  clockSeconds:():unknown=>now,
}
const gate=makeSelectedExternalInteropGate(adapters)
const request=(intents:unknown=[intent()],credentialRef='fixture-ticket-A')=>({credentialRef,intents})
const blocked=(r:InteropVerdict,code:string,label:string):void=>{
  check(r.status==='blocked'&&r.code===code,label)
  check(r.status==='blocked'&&r.exposedEvents===0,label+': no partial application exposure')
  check(!r.externalAuthVerified&&!r.durableCommitVerified&&!r.crossServiceTrustVerified&&
    !r.adapterReady,label+': no security or production promotion')
}
const ok=gate.review(request())
check(ok.status==='planned','published 2.6M trusted boundary composes with fixture interop gate')
if(ok.status==='planned'){
  check(ok.tenantId==='tenant-A'&&ok.principalId==='principal-A','fixture-resolved identity not user-declared')
  check(ok.expectedRevision===0&&ok.nextRevision===1,'published 2.6L pure CAS proposal survives composition')
  check(ok.plannedCommits===1&&ok.duplicates===0,'one selected replay plan remains single')
  check(ok.noEventExposure&& !('events' in ok) && !('credentialRef' in ok),
    'no event bytes or credential references returned')
  check(ok.scope==='fixture-interop-only','fixture interoperability never reports operational trust')
  check(!ok.externalAuthVerified&&!ok.durableCommitVerified&&!ok.adapterReady,
    'accepted plan does not promote authority or persistence')
}
check(verifiedCalls===1&&storeCalls===1,'fixture verifier and store consulted exactly once')
const dupe=gate.review(request([intent(),intent()]))
check(dupe.status==='planned','published duplicate suppression remains composed')
if(dupe.status==='planned')check(dupe.duplicates===1&&dupe.nextRevision===1,
  'duplicate does not cause second projected write')
const second=intent({threadId:'thread-B',runId:'run-B',idempotencyKey:'idem-B',expectedRevision:1,
  attempts:[attempt('tenant-A','thread-B','run-B')]})
const serial=gate.review(request([intent(),second]))
check(serial.status==='planned','two sequential allowed thread plans compose')
if(serial.status==='planned')check(serial.nextRevision===2&&serial.plannedCommits===2,
  'two serial plans have distinct receipt revisions')
for(const v of [null,false,0,{},[],{credentialRef:'fixture-ticket-A'},
  {credentialRef:'fixture-ticket-A',intents:[]},{credentialRef:'bad/token',intents:[intent()]},
  {credentialRef:'fixture-ticket-A',intents:null}])
  blocked(gate.review(v),'untrusted-request-shape',`malformed request ${JSON.stringify(v)?.slice(0,26)}`)
for(const field of ['tenantId','principalId','allowedThreadIds','issuer','audience','keyId',
  'expiresAt','jwt','isAdmin','authenticated','fixtureOverride','checkpoint','serverSession',
  'authorizationVerified','storeAccepted','adapterReady'])
  blocked(gate.review({...request(),[field]:'self-attested'}),'untrusted-request-shape',
    `caller-supplied privileged ${field} rejected`)
blocked(gate.review(request([intent()],'unknown-ticket')),'fixture-identity-unverifiable',
  'unknown credential fixture lookup denied')
blocked(gate.review(request([intent({tenantRef:'tenant-B'})])),
  'published-2.6M:prior-2.6L:tenant-boundary-denied','tenant mismatch from caller rejected')
blocked(gate.review(request([intent({threadId:'thread-C'})])),
  'published-2.6M:prior-2.6L:thread-authorization-denied','thread outside fixture ACL rejected')
blocked(gate.review(request([intent({expectedRevision:5})])),
  'published-2.6M:prior-2.6L:cas-revision-conflict','stale CAS plan rejected by published 2.6L')
blocked(gate.review(request([intent({operation:'resume'})])),
  'published-2.6M:prior-2.6L:resume-credential-not-established','partial resume still unsupported')
blocked(gate.review(request([intent({attempts:[]})])),
  'published-2.6M:prior-2.6L:selected-recovery-proof-missing','missing 2.6K recovery proof rejected')
const beforeStore=storeCalls
for(const [field,value] of [
  ['provenance','client-provided'],['principalId',''],['tenantId','tenant B'],
  ['allowedThreadIds',[]],['allowedThreadIds',['thread-A','thread-A']],
  ['allowedThreadIds',['thread/C']],['policyEpoch',-1],['keyId',''],['tokenId',null],
  ['issuer','https://unknown.example'],['audience','other'],['issuedAt','1000'],
  ['notBefore',-1],['expiresAt',null],
] as const){
  currentIdentity={...identity,[field]:value}
  blocked(gate.review(request()),'fixture-identity-unverifiable',`fixture verifier identity ${field} invalid`)
}
for(const field of ['signed','signatureVerified','clientRole','securityApproved','secret','jwtClaims']){
  currentIdentity={...identity,[field]:true}
  blocked(gate.review(request()),'fixture-identity-unverifiable',
    `fixture attestation extra authority field ${field} rejected`)
}
check(storeCalls===beforeStore,'invalid fixture identities never cause store calls')
currentIdentity=identity
for(const [time,token,code,label] of [
  [999,identity,'fixture-identity-time-boundary','future iat and nbf rejected'],
  [1000,{...identity,notBefore:1001},'fixture-identity-time-boundary','future nbf rejected'],
  [1240,identity,'fixture-identity-time-boundary','expired credential rejected'],
  [1050,{...identity,issuedAt:1300},'fixture-identity-time-boundary','future issuance rejected'],
  [1050,{...identity,expiresAt:1000},'fixture-identity-time-boundary','nonpositive lifetime rejected'],
  [1050,{...identity,expiresAt:1400},'fixture-identity-time-boundary','token TTL over 300s rejected'],
] as const){
  now=time;currentIdentity=token
  blocked(gate.review(request()),code,label)
}
currentIdentity=identity
for(const t of [-1,NaN,Infinity,'1050',null,2_000_000_001]){
  now=t
  blocked(gate.review(request()),'fixture-clock-invalid',`fixture clock invalid ${String(t)}`)
}
now=1050
for(const snapshot of [null,{},[],{...seed,tenantId:'tenant-B'},
  {...seed,policyEpoch:8}]){
  currentSnapshot=snapshot
  blocked(gate.review(request()),'fixture-snapshot-not-bound',
    `external store scope or epoch unavailable ${JSON.stringify(snapshot)}`)
}
currentSnapshot={...seed,revision:1}
blocked(gate.review(request()),'published-2.6M:prior-2.6L:checkpoint-revision-inconsistent',
  'tampered projected revision rejected by prior contract')
currentSnapshot=seed
const throwsVerifier=makeSelectedExternalInteropGate({
  verifyCredentialFixture:()=>{throw Error('offline')},readCheckpointFixture:()=>seed,clockSeconds:()=>1050,
})
blocked(throwsVerifier.review(request()),'fixture-verifier-unavailable','fixture verifier failure blocks')
const throwsStore=makeSelectedExternalInteropGate({
  verifyCredentialFixture:()=>identity,readCheckpointFixture:()=>{throw Error('offline')},
  clockSeconds:()=>1050,
})
blocked(throwsStore.review(request()),'fixture-store-unavailable','fixture store failure blocks')
const blockers=reviewExternalInteropBlockers()
check(blockers.allNineGapsOpen,'all G1-G9 stay OPEN after selected fixture tests')
check(blockers.parentMilestoneOpen,'parent 2.6 remains OPEN')
check(blockers.priorAdapterBlocked,'published 2.6M adapter remains blocked')
for(const [name,value] of [
  ['externalIssuerAuthenticated',blockers.externalIssuerAuthenticated],
  ['realCredentialTransportVerified',blockers.realCredentialTransportVerified],
  ['independentThreadAclVerified',blockers.independentThreadAclVerified],
  ['externalStoreTransactionVerified',blockers.externalStoreTransactionVerified],
  ['crossServiceCasVerified',blockers.crossServiceCasVerified],
  ['productionKeyRotationVerified',blockers.productionKeyRotationVerified],
  ['tokenRevocationVerified',blockers.tokenRevocationVerified],
  ['operationalAgUiResumeVerified',blockers.operationalAgUiResumeVerified],
  ['independentSecurityReview',blockers.independentSecurityReview],
  ['adapterReady',blockers.adapterReady],
] as const)check(value===false,`${name}: no independent operational evidence`)
check(blockers.scope==='isolated-ts-contract-plus-separate-local-hmac-sqlite-fixture',
  'coverage explicitly limited to local fixture interoperability')
check(Object.isFrozen(blockers),'non-approving inventory object frozen')
console.log(`${count} 2.6N selected external-interop TypeScript assertions passed`)
