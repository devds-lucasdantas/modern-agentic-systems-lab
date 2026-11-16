import {makeSelectedTransportReadinessGate,reviewTransportReadinessBlockers,
  type FixturePeer,type FixtureProducer,type TransportReadinessVerdict} from './authenticated-transport-readiness'
import type {FixtureSignedMetadata,FixtureServiceProof,FixtureReceipt} from './cross-service-recovery'
import type {FixtureIssuerIdentity,FixtureRevocation} from './issuer-revocation-failures'
import type {ReplayIntent} from './authorized-durable-replay'
import type {RecoveryAttempt} from './replay-recovery'
import type {HttpReviewInput} from './stream-boundary'

let count=0
const check=(condition:boolean,label:string):void=>{
  if(!condition)throw new Error('FAIL: '+label)
  count++;console.log('PASS: '+label)
}
const encode=(v:string)=>new TextEncoder().encode(v)
const http:HttpReviewInput={requestMethod:'POST',requestContentType:'application/json',
  requestAccept:'text/event-stream',responseStatus:200,responseContentType:'text/event-stream',
  lastEventIdSent:false}
const attempt=(thread='thread-A',run='run-A'):RecoveryAttempt=>({
  tenantRef:'tenant-A',threadId:thread,runId:run,attemptId:'attempt-'+run,ordinal:1,
  mode:'full-restart',connectionEnded:true,http,wire:[encode([
    {type:'RUN_STARTED',threadId:thread,runId:run,protocolVersion:'1.0'},
    {type:'RUN_FINISHED',threadId:thread,runId:run},
  ].map(x=>'data: '+JSON.stringify(x)+'\n\n').join(''))],
})
const intent=(patch:Partial<ReplayIntent>={}):ReplayIntent=>({
  operation:'commit',tenantRef:'tenant-A',threadId:'thread-A',runId:'run-A',
  idempotencyKey:'idem-A',declaredCommitment:'a'.repeat(64),
  expectedRevision:0,attempts:[attempt()],...patch,
})
const peer:FixturePeer={kind:'fixture-mtls-peer',verifiedBy:'local-harness-only',
  peerServiceId:'fixture-gateway',channelId:'channel-A',peerCertSha256:'f'.repeat(64),
  audience:'masl-agui-fixture',issuedAt:1040,validThrough:1080}
const producer:FixtureProducer={kind:'fixture-producer-observation',
  originServiceId:'fixture-gateway',channelId:'channel-A',threadId:'thread-A',
  runId:'run-A',observedAt:1050,eventSha256:'b'.repeat(64)}
const identity:FixtureIssuerIdentity={provenance:'issuer-fixture-callback',
  principalId:'principal-A',tenantId:'tenant-A',allowedThreadIds:['thread-A','thread-B'],
  policyEpoch:9,issuer:'https://fixture.invalid/masl-issuer',audience:'masl-agui-fixture',
  keyId:'fixture-rsa-k2',tokenId:'jti-A',issuedAt:1000,notBefore:1000,expiresAt:1200,
  trustGeneration:3}
const meta:FixtureSignedMetadata={kind:'fixture-signed-provider-metadata',
  issuer:identity.issuer,audience:identity.audience,signerId:'fixture-root-pinned',
  trustGeneration:3,activeKeyId:identity.keyId,revocationEpoch:2,
  observedAt:1050,validThrough:1080}
const proof:FixtureServiceProof={kind:'fixture-service-proof',credentialRef:'fixture-ticket-A',
  issuerIdentity:identity,trustGeneration:3,revocationEpoch:2}
const revoke:FixtureRevocation={kind:'fixture-jti-lookup',tenantId:'tenant-A',
  tokenId:'jti-A',trustGeneration:3,revoked:false,observedAt:1050}
const seed={tenantId:'tenant-A',policyEpoch:9,revision:0,receipts:[]}
const receipt:FixtureReceipt={kind:'fixture-durable-receipt',tenantId:'tenant-A',
  principalId:'principal-A',threadId:'thread-A',runId:'run-A',idempotencyKey:'idem-A',
  declaredCommitment:'a'.repeat(64),commitRevision:1,observedAt:1050}
let channel:unknown=peer,stamp:unknown=producer,time:unknown=1050,
  metadata:unknown=meta,credential:unknown=proof,revocation:unknown=revoke,
  checkpoint:unknown=seed,storedReceipt:unknown=receipt
let peerReads=0,producerReads=0,metadataReads=0,receiptReads=0
const adapters={
  clockSeconds:():unknown=>time,
  resolveLocalPeerFixture:(ref:string):unknown=>{peerReads++;return ref==='fixture-channel-A'?channel:null},
  inspectProducerFixture:(_channel:string,_thread:string,_run:string):unknown=>{
    producerReads++;return stamp},
  signedProviderMetadataFixture:():unknown=>{metadataReads++;return metadata},
  verifyCredentialServiceFixture:():unknown=>credential,
  revocationServiceFixture:():unknown=>revocation,
  readCheckpointServiceFixture:():unknown=>checkpoint,
  receiptServiceFixture:():unknown=>{receiptReads++;return storedReceipt},
}
const gate=makeSelectedTransportReadinessGate(adapters)
const request=(intents:unknown=[intent()],mode:'propose'|'reconcile'='propose')=>
  ({channelRef:'fixture-channel-A',mode,credentialRef:'fixture-ticket-A',intents})
const denied=(v:TransportReadinessVerdict,stage:string,code:string,label:string):void=>{
  check(v.status==='blocked'&&v.stage===stage&&v.code===code,label)
  check(v.exposedEvents===0,`${label}: no event bytes exposed`)
  check(!v.actualMtlsAuthenticated&&!v.producerSignatureVerified&&
    !v.networkRecoveryVerified&&!v.durableReceiptVerified&&!v.adapterReady,
    `${label}: no readiness/security promotion`)
}
const accepted=gate.review(request())
check(accepted.status==='planned','2.6P published signed-metadata/recovery composes after transport fixture')
if(accepted.status==='planned'){
  check(accepted.scope==='isolated-mtls-readiness-contract-only','scope is isolated fixture only')
  check(accepted.tenantId==='tenant-A'&&accepted.principalId==='principal-A','identity from fixture authority')
  check(accepted.plannedCommits===1&&accepted.duplicates===0,'single planned commit')
  check(accepted.exposedEvents===0,'successful review exposes no event bytes')
  check(!accepted.actualMtlsAuthenticated&&!accepted.producerSignatureVerified&&
    !accepted.networkRecoveryVerified&&!accepted.durableReceiptVerified&&!accepted.adapterReady,
    'no operational approval after pure composition')
}
check(peerReads===1&&producerReads===1&&metadataReads===1,
  'transport, producer, published issuer gates called in order')
const duplicate=gate.review(request([intent(),intent()]))
check(duplicate.status==='planned','duplicate allowed through published replay contract')
if(duplicate.status==='planned')check(duplicate.duplicates===1&&duplicate.plannedCommits===1,
  'duplicate cannot plan extra commit')
check(producerReads===2,'duplicate uses one fixture observation per thread/run identity')
const existing={tenantId:'tenant-A',policyEpoch:9,revision:1,receipts:[{
  tenantId:'tenant-A',threadId:'thread-A',runId:'run-A',principalId:'principal-A',
  idempotencyKey:'idem-A',declaredCommitment:'a'.repeat(64),commitRevision:1,
}]}
checkpoint=existing
const recovery=gate.review(request([intent({operation:'replay-check'})],'reconcile'))
check(recovery.status==='reconciled','published 2.6P receipt reconciliation remains composed')
if(recovery.status==='reconciled')check(recovery.receiptReconciled&&recovery.plannedCommits===0,
  'reconciliation remains read-only proposal')
checkpoint=seed
for(const req of [null,undefined,0,false,{},[],{channelRef:'fixture-channel-A'},
  {...request(),intents:[]},{...request(),intents:null},
  {...request(),mode:'stream'}, {...request(),channelRef:'bad/channel'},
  {...request(),credentialRef:'bad/bearer'}])
  denied(gate.review(req),'request','untrusted-transport-request-shape',
    `invalid request ${String(req).slice(0,25)}`)
for(const field of ['peerServiceId','peerCertSha256','clientCertificate','tlsVerified',
  'producerVerified','authorization','issuer','audience','tenantId','principalId',
  'isAdmin','policyEpoch','checkpoint','storedReceipt','jti','runId','secret',
  'transportTrusted','adapterReady','revoked','eventSha256'])
  denied(gate.review({...request(),[field]:true}),'request','untrusted-transport-request-shape',
    `caller privilege field ${field} denied`)
const beforeProducer=producerReads
for(const candidate of [null,undefined,{},[],false,
  {...peer,kind:'operational-mtls-verified'},
  {...peer,verifiedBy:'production-tls'},
  {...peer,peerServiceId:'other-service'},
  {...peer,channelId:'bad/channel'},
  {...peer,peerCertSha256:'f'.repeat(63)},
  {...peer,audience:'other'},
  {...peer,issuedAt:'1040'},
  {...peer,validThrough:NaN},
  {...peer,authorized:true},
  {...peer,clientPrivateKey:'secret'}]){
  channel=candidate
  denied(gate.review(request()),'peer','fixture-peer-unverifiable',
    `untrusted peer ${JSON.stringify(candidate)?.slice(0,22)}`)
}
check(producerReads===beforeProducer,'invalid peer never reaches producer fixture')
channel=peer
for(const now of [null,NaN,Infinity,-1,'1050',2_000_000_001,1.25]){
  time=now
  denied(gate.review(request()),'peer','fixture-transport-clock-invalid',
    `invalid transport clock ${String(now)}`)
}
time=1050
for(const [now,changed,label] of [
  [1039,peer,'future peer issuance'],
  [1051,{...peer,issuedAt:1040},'peer observation staleness'],
  [1081,peer,'expired peer channel'],
  [1050,{...peer,issuedAt:1040,validThrough:1105},'excess channel life'],
  [1050,{...peer,validThrough:1040},'invalid peer validity interval'],
] as const){
  time=now;channel=changed
  denied(gate.review(request()),'peer','fixture-peer-not-current',label)
}
time=1050;channel=peer
for(const sample of [null,{},[],false,
  {...producer,kind:'real-authenticated-producer'},
  {...producer,originServiceId:'wrong-gateway'},
  {...producer,channelId:'wrong-channel'},
  {...producer,threadId:'thread-X'},
  {...producer,runId:'run-X'},
  {...producer,observedAt:1049},
  {...producer,eventSha256:'z'.repeat(64)},
  {...producer,eventSha256:0},
  {...producer,signatureVerified:true},
]){
  stamp=sample
  denied(gate.review(request()),'producer','fixture-producer-observation-unbound',
    `producer observation unbound ${JSON.stringify(sample)?.slice(0,24)}`)
}
stamp=producer
for(const sample of [null,{}, {...request(),intents:[{}]},
  {...request(),intents:[{threadId:'bad/thread',runId:'run-A'}]}]){
  if(sample===null||!('intents' in sample))continue
  denied(gate.review(sample),'producer','fixture-producer-intent-invalid',
    'producer requires bound valid thread and run')
}
const badCred=gate.review({...request(),credentialRef:'nonexistent-ticket'})
denied(badCred,'published-2.6P','published-2.6P:credential-proof-unbound',
  'untrusted credential blocked by published 2.6P')
denied(gate.review(request([intent({tenantRef:'tenant-X'})])),
  'published-2.6P','published-2.6P:published-2.6O:published-2.6N:published-2.6M:prior-2.6L:tenant-boundary-denied',
  'published tenant boundary preserved')
metadata={...meta,validThrough:1040}
denied(gate.review(request()),'published-2.6P','published-2.6P:metadata-stale-or-expired',
  'published issuer metadata freshness remains enforced')
metadata=meta
revocation={...revoke,revoked:true}
denied(gate.review(request()),'published-2.6P','published-2.6P:revoked-at-service-boundary',
  'published revocation enforcement preserved')
revocation=revoke
const throwsPeer=makeSelectedTransportReadinessGate({...adapters,
  resolveLocalPeerFixture:()=>{throw Error('peer offline')},
})
denied(throwsPeer.review(request()),'peer','fixture-mtls-boundary-unavailable',
  'local peer fixture unavailable fail closed')
const throwsProducer=makeSelectedTransportReadinessGate({...adapters,
  inspectProducerFixture:()=>{throw Error('producer offline')},
})
denied(throwsProducer.review(request()),'producer','fixture-producer-unavailable',
  'producer provenance fixture unavailable fail closed')
const blockers=reviewTransportReadinessBlockers()
check(blockers.allNineGapsOpen,'all G1-G9 remain OPEN')
check(blockers.parentMilestoneOpen,'parent milestone 2.6 remains OPEN')
check(blockers.priorAdapterBlocked,'prior AG-UI adapter remains BLOCKED')
for(const [key,value] of [
  ['actualNetworkMutualTlsVerifiedInTS',blockers.actualNetworkMutualTlsVerifiedInTS],
  ['trustedFederatedIssuerVerified',blockers.trustedFederatedIssuerVerified],
  ['signedEventProducerAuthenticated',blockers.signedEventProducerAuthenticated],
  ['productionTransportRecoveryVerified',blockers.productionTransportRecoveryVerified],
  ['distributedReceiptDurabilityVerified',blockers.distributedReceiptDurabilityVerified],
  ['revocationFreshnessSlaVerified',blockers.revocationFreshnessSlaVerified],
  ['mediaDlpSignedOff',blockers.mediaDlpSignedOff],
  ['independentSecurityReview',blockers.independentSecurityReview],
  ['adapterReady',blockers.adapterReady],
] as const)check(value===false,`${key}: not operationally proven`)
check(blockers.scope==='pure-ts-transport-fixture-plus-separate-offline-loopback-mtls-sqlite',
  'lab scope accurately marks separate experiments')
console.log(`${count} 2.6Q selected transport readiness TypeScript assertions passed`)
