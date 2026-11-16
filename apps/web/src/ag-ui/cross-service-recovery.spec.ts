import {makeSelectedCrossServiceRecoveryGate,reviewCrossServiceRecoveryBlockers,
  type FixtureSignedMetadata,type FixtureServiceProof,type FixtureReceipt,
  type CrossServiceVerdict} from './cross-service-recovery'
import type {FixtureIssuerIdentity,FixtureRevocation} from './issuer-revocation-failures'
import type {ReplayIntent,Receipt} from './authorized-durable-replay'
import type {RecoveryAttempt} from './replay-recovery'
import type {HttpReviewInput} from './stream-boundary'

let checks=0
const check=(yes:boolean,label:string)=>{if(!yes)throw Error('FAIL: '+label);checks++;console.log('PASS: '+label)}
const enc=(s:string):Uint8Array=>new TextEncoder().encode(s)
const http:HttpReviewInput={requestMethod:'POST',requestContentType:'application/json',
  requestAccept:'text/event-stream',responseStatus:200,responseContentType:'text/event-stream',
  lastEventIdSent:false}
const attempt=(thread='thread-A',run='run-A'):RecoveryAttempt=>({tenantRef:'tenant-A',threadId:thread,
  runId:run,attemptId:'attempt-'+run,ordinal:1,mode:'full-restart',connectionEnded:true,http,
  wire:[enc([{type:'RUN_STARTED',threadId:thread,runId:run,protocolVersion:'1.0'},
    {type:'RUN_FINISHED',threadId:thread,runId:run}].map(v=>'data: '+JSON.stringify(v)+'\n\n').join(''))],
})
const intent=(patch:Partial<ReplayIntent>={}):ReplayIntent=>({operation:'commit',tenantRef:'tenant-A',
  threadId:'thread-A',runId:'run-A',idempotencyKey:'idem-A',
  declaredCommitment:'a'.repeat(64),expectedRevision:0,attempts:[attempt()],...patch})
const metadata:FixtureSignedMetadata={kind:'fixture-signed-provider-metadata',
  issuer:'https://fixture.invalid/masl-issuer',audience:'masl-agui-fixture',
  signerId:'fixture-root-pinned',trustGeneration:5,activeKeyId:'fixture-rsa-k2',
  revocationEpoch:17,observedAt:1050,validThrough:1080}
const identity:FixtureIssuerIdentity={provenance:'issuer-fixture-callback',
  principalId:'principal-A',tenantId:'tenant-A',allowedThreadIds:['thread-A','thread-B'],
  policyEpoch:9,issuer:metadata.issuer,audience:metadata.audience,
  keyId:'fixture-rsa-k2',tokenId:'jti-A',issuedAt:1000,notBefore:1000,
  expiresAt:1200,trustGeneration:5}
const proof:FixtureServiceProof={kind:'fixture-service-proof',credentialRef:'ticket-A',
  issuerIdentity:identity,trustGeneration:5,revocationEpoch:17}
const revocation:FixtureRevocation={kind:'fixture-jti-lookup',tenantId:'tenant-A',
  tokenId:'jti-A',trustGeneration:5,revoked:false,observedAt:1050}
const seed={tenantId:'tenant-A',policyEpoch:9,revision:0,receipts:[] as readonly Receipt[]}
const stored:Receipt={tenantId:'tenant-A',threadId:'thread-A',runId:'run-A',
  principalId:'principal-A',idempotencyKey:'idem-A',declaredCommitment:'a'.repeat(64),commitRevision:1}
const committed={...seed,revision:1,receipts:[stored]}
const receipt:FixtureReceipt={kind:'fixture-durable-receipt',tenantId:'tenant-A',
  principalId:'principal-A',threadId:'thread-A',runId:'run-A',idempotencyKey:'idem-A',
  declaredCommitment:'a'.repeat(64),commitRevision:1,observedAt:1050}
let now:unknown=1050,meta:unknown=metadata,service:unknown=proof,rev:unknown=revocation,
  checkpoint:unknown=seed,received:unknown=receipt
let metadataCalls=0,credentialCalls=0,revCalls=0,checkpointCalls=0,receiptCalls=0
const gate=makeSelectedCrossServiceRecoveryGate({
  clockSeconds:()=>now,
  signedProviderMetadataFixture:()=>{metadataCalls++;return meta},
  verifyCredentialServiceFixture:(ref:string)=>{credentialCalls++;return ref==='ticket-A'?service:null},
  revocationServiceFixture:(_tenant:string,_jti:string)=>{revCalls++;return rev},
  readCheckpointServiceFixture:(_tenant:string,_principal:string)=>{checkpointCalls++;return checkpoint},
  receiptServiceFixture:(_tenant:string,_thread:string,_key:string)=>{receiptCalls++;return received},
})
const request=(mode:'propose'|'reconcile'='propose',intents:unknown=[intent()],credentialRef='ticket-A')=>
  ({mode,credentialRef,intents})
const blocked=(v:CrossServiceVerdict,code:string,label:string)=>{
  check(v.status==='blocked'&&v.code===code,label)
  check(v.exposedEvents===0,label+': no events exposed')
  check(!v.issuerAuthenticated&&!v.revocationPropagationProven&&!v.crossServiceAtomicityProven&&
    !v.externalStoreVerified&&!v.adapterReady,label+': cannot assert external trust')
}
const ok=gate.review(request())
check(ok.status==='planned','2.6O published issuer/revocation gate composes after service metadata')
if(ok.status==='planned'){
  check(ok.expectedRevision===0&&ok.nextRevision===1,'selected CAS remains proposed only')
  check(ok.plannedCommits===1&&ok.duplicates===0,'one synthetic commit plan')
  check(ok.tenantId==='tenant-A'&&ok.principalId==='principal-A','identity from fixture service')
  check(ok.exposedEvents===0&&!('events' in ok)&&!('credentialRef' in ok),
    'no wire payload or ticket returned')
  check(ok.scope==='offline-cross-service-fixture-only','coverage bounded to fixture')
  check(!ok.receiptReconciled&&!ok.externalStoreVerified&&!ok.issuerAuthenticated,
    'planned path never claims durable receipt or producer trust')
}
check(metadataCalls===1&&credentialCalls===1&&revCalls===1&&checkpointCalls===1&&receiptCalls===0,
  'services consulted once and receipt not read for new proposal')
const dup=gate.review(request('propose',[intent(),intent()]))
check(dup.status==='planned'&&dup.duplicates===1,'published duplicate suppression composed')
const second=intent({threadId:'thread-B',runId:'run-B',idempotencyKey:'idem-B',expectedRevision:1,
  attempts:[attempt('thread-B','run-B')]})
check(gate.review(request('propose',[intent(),second])).status==='planned',
  'serial allowed threads composed through 2.6O')
checkpoint=committed
const checkIntent=intent({operation:'replay-check'})
const beforeReconcile=receiptCalls
const reconciled=gate.review(request('reconcile',[checkIntent]))
check(reconciled.status==='reconciled','fixture persisted receipt reconciles after lost acknowledgement')
if(reconciled.status==='reconciled'){
  check(reconciled.receiptReconciled&&reconciled.plannedCommits===0,
    'reconciliation never creates a second commit')
  check(reconciled.nextRevision===1&&reconciled.expectedRevision===1,
    'checkpoint remains at one committed revision')
  check(!reconciled.crossServiceAtomicityProven&&!reconciled.externalStoreVerified,
    'fixture acknowledgement reconciliation not production proof')
}
check(receiptCalls===beforeReconcile+1,'receipt looked up only during explicit replay-check')
checkpoint=seed
for(const invalid of [null,undefined,0,false,{},[],{mode:'propose'},{mode:'propose',credentialRef:'ticket-A'},
  {mode:'propose',credentialRef:'ticket-A',intents:[]},
  {mode:'replay',credentialRef:'ticket-A',intents:[intent()]},
  {mode:'propose',credentialRef:'bad/ref',intents:[intent()]},
  {mode:'propose',credentialRef:'ticket-A',intents:Array.from({length:17},()=>intent())}])
  blocked(gate.review(invalid),'untrusted-request-shape',`invalid request ${String(invalid).slice(0,20)}`)
for(const privilege of ['principalId','tenantId','issuer','audience','activeKeyId','trustGeneration',
  'signerId','signed','revocationEpoch','jti','receipt','checkpoint','isAdmin','securityApproved',
  'externalAuthVerified','adapterReady','resumeToken','credential','jwks','tlsVerified'])
  blocked(gate.review({...request(),[privilege]:true}), 'untrusted-request-shape',
    `request cannot inject privileged ${privilege}`)
blocked(gate.review(request('propose',[intent()],'missing-ticket')),
  'credential-proof-unbound','unknown service ticket fail closed')
const callsBeforeInvalidMeta=credentialCalls
for(const bad of [null,{},false,[],
  {...metadata,signerId:'attacker-root'}, {...metadata,issuer:'https://attacker.invalid'},
  {...metadata,audience:'wrong'}, {...metadata,kind:'self-signed-metadata'},
  {...metadata,trustGeneration:0}, {...metadata,trustGeneration:-1},
  {...metadata,activeKeyId:''}, {...metadata,revocationEpoch:-1},
  {...metadata,observedAt:'1050'}, {...metadata,validThrough:NaN},
  {...metadata,signatureVerified:true}, {...metadata,jwksUrl:'https://attacker.invalid'}]){
  meta=bad
  blocked(gate.review(request()),'metadata-snapshot-untrusted',
    `untrusted or malformed cross-service metadata ${JSON.stringify(bad)?.slice(0,23)}`)
}
check(credentialCalls===callsBeforeInvalidMeta,'invalid metadata never reaches identity service')
meta=metadata
for(const [time,trust] of [
  [1049,metadata],[1061,metadata],[1081,metadata],
  [1050,{...metadata,observedAt:1051}],
  [1050,{...metadata,validThrough:1050}],
  [1050,{...metadata,validThrough:1120}],
] as const){
  now=time;meta=trust
  blocked(gate.review(request()),'metadata-stale-or-expired',
    `metadata freshness rejects time ${time} offset ${String(trust.validThrough)}`)
}
now=1050;meta=metadata
for(const bad of [null,{},[],
  {...proof,kind:'caller-attested'}, {...proof,credentialRef:'ticket-B'},
  {...proof,revocationEpoch:16},{...proof,trustGeneration:4},
  {...proof,issuerIdentity:null},{...proof,isAdmin:true}]){
  service=bad
  blocked(gate.review(request()),'credential-proof-unbound',
    `service credential binding negative ${JSON.stringify(bad)?.slice(0,23)}`)
}
service=proof
for(const bad of [
  {...identity,trustGeneration:4},{...identity,keyId:'fixture-rsa-k1'},
  {...identity,issuer:'https://attacker.invalid'}, {...identity,audience:'wrong'},
]){
  service={...proof,issuerIdentity:bad}
  blocked(gate.review(request()),'service-issuer-generation-conflict',
    `service proof and provider metadata disagree ${String(bad.keyId)}`)
}
service=proof
const beforeStaleRevocation=checkpointCalls
for(const bad of [null,{},false,
  {...revocation,trustGeneration:4},{...revocation,observedAt:1049},
  {...revocation,tenantId:'tenant-B'}, {...revocation,tokenId:'jti-B'},
  {...revocation,revoked:'false'}]){
  rev=bad
  blocked(gate.review(request()),'revocation-service-not-fresh',
    `revocation proof stale or misbound ${JSON.stringify(bad)?.slice(0,23)}`)
}
check(checkpointCalls===beforeStaleRevocation,'stale revocation cannot load checkpoint')
rev={...revocation,revoked:true}
blocked(gate.review(request()),'revoked-at-service-boundary','revoked token blocked before planning')
rev=revocation
blocked(gate.review(request('propose',[intent({tenantRef:'tenant-B'})])),
  'published-2.6O:published-2.6N:published-2.6M:prior-2.6L:tenant-boundary-denied',
  'published tenant ACL remains enforced across service fixture')
blocked(gate.review(request('propose',[intent({operation:'resume'})])),
  'published-2.6O:published-2.6N:published-2.6M:prior-2.6L:resume-credential-not-established',
  'unverified SSE partial resume still rejected')
// Reconciliation must never create a new receipt and must match a separate
// scoped server-side lookup after the published replay-check accepts.
checkpoint=committed
blocked(gate.review(request('reconcile',[intent()])),
  'reconciliation-requires-existing-replay-check','new commit cannot masquerade as reconciliation')
blocked(gate.review(request('reconcile',[checkIntent,checkIntent])),
  'reconciliation-requires-existing-replay-check','multi-intent reconciliation rejected')
for(const bad of [null,{},false,
  {...receipt,tenantId:'tenant-B'}, {...receipt,principalId:'principal-B'},
  {...receipt,threadId:'thread-B'}, {...receipt,runId:'run-B'},
  {...receipt,idempotencyKey:'idem-B'}, {...receipt,declaredCommitment:'b'.repeat(64)},
  {...receipt,commitRevision:2}, {...receipt,commitRevision:0},
  {...receipt,observedAt:1049}, {...receipt,securityApproved:true}]){
  received=bad
  blocked(gate.review(request('reconcile',[checkIntent])),'receipt-not-authoritative-in-fixture',
    `reconciliation receipt scope/digest/revision rejected ${JSON.stringify(bad)?.slice(0,20)}`)
}
received=receipt
checkpoint=seed
blocked(gate.review(request('reconcile',[checkIntent])),
  'published-2.6O:published-2.6N:published-2.6M:prior-2.6L:replay-receipt-missing',
  'receipt alone cannot establish a checkpoint commit')
const outages=makeSelectedCrossServiceRecoveryGate({
  clockSeconds:()=>1050,
  signedProviderMetadataFixture:()=>{throw Error('offline')},
  verifyCredentialServiceFixture:()=>proof,
  revocationServiceFixture:()=>revocation,
  readCheckpointServiceFixture:()=>seed,
  receiptServiceFixture:()=>receipt,
})
blocked(outages.review(request()),'metadata-service-unavailable','metadata service outage fail closed')
const noIdentity=makeSelectedCrossServiceRecoveryGate({
  clockSeconds:()=>1050,signedProviderMetadataFixture:()=>metadata,
  verifyCredentialServiceFixture:()=>{throw Error('offline')},
  revocationServiceFixture:()=>revocation,
  readCheckpointServiceFixture:()=>seed,receiptServiceFixture:()=>receipt,
})
blocked(noIdentity.review(request()),'credential-service-unavailable','identity service outage fail closed')
const noRevocation=makeSelectedCrossServiceRecoveryGate({
  clockSeconds:()=>1050,signedProviderMetadataFixture:()=>metadata,
  verifyCredentialServiceFixture:()=>proof,
  revocationServiceFixture:()=>{throw Error('offline')},
  readCheckpointServiceFixture:()=>seed,receiptServiceFixture:()=>receipt,
})
blocked(noRevocation.review(request()),'revocation-service-unavailable','revocation service outage fail closed')
const noStore=makeSelectedCrossServiceRecoveryGate({
  clockSeconds:()=>1050,signedProviderMetadataFixture:()=>metadata,
  verifyCredentialServiceFixture:()=>proof,revocationServiceFixture:()=>revocation,
  readCheckpointServiceFixture:()=>{throw Error('offline')},receiptServiceFixture:()=>receipt,
})
const storeFailure=noStore.review(request())
check(storeFailure.status==='blocked'&&storeFailure.code.includes('fixture-store-unavailable'),
  'checkpoint service outage remains blocked by published 2.6O chain')
const noReceipt=makeSelectedCrossServiceRecoveryGate({
  clockSeconds:()=>1050,signedProviderMetadataFixture:()=>metadata,
  verifyCredentialServiceFixture:()=>proof,revocationServiceFixture:()=>revocation,
  readCheckpointServiceFixture:()=>committed,
  receiptServiceFixture:()=>{throw Error('offline')},
})
blocked(noReceipt.review(request('reconcile',[checkIntent])),
  'receipt-service-unavailable','lost acknowledgement cannot pass during receipt service outage')
const blockers=reviewCrossServiceRecoveryBlockers()
check(blockers.allNineGapsOpen,'all G1-G9 remain OPEN')
check(blockers.parentMilestoneOpen,'parent AG-UI 2.6 remains OPEN')
check(blockers.priorAdapterBlocked,'published 2.6O adapter remains BLOCKED')
for(const key of ['realIssuerMetadataVerified','actualServiceChannelAuthenticated',
  'distributedRevocationFreshnessProven','realCrossServiceTransactionProven',
  'cryptographicEventDigestFromProducer','durableReceiptReconciliationProven',
  'onlineJwksRotationProven','securityReviewSignedOff','adapterReady'] as const)
  check(blockers[key]===false,`${key} remains explicitly unverified`)
check(blockers.scope==='isolated-callback-composition-plus-separate-local-process-fixture',
  'scope states isolated cross-service fixture only')
check(Object.isFrozen(blockers),'blocker inventory frozen')
console.log(`${checks} 2.6P selected cross-service trust/recovery TypeScript assertions passed`)
