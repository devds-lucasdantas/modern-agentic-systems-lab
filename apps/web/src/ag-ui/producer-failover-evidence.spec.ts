import {makeSelectedProducerFailoverGate,reviewProducerFailoverBlockers,
  type ProducerFixtureEnvelope,type ProducerFixtureRegistry,type FailoverFixtureNode,
  type FailoverFixtureReceipt,type FailoverVerdict} from './producer-failover-evidence'
import type {FixturePeer,FixtureProducer} from './authenticated-transport-readiness'
import type {FixtureSignedMetadata,FixtureServiceProof,FixtureReceipt} from './cross-service-recovery'
import type {FixtureIssuerIdentity,FixtureRevocation} from './issuer-revocation-failures'
import type {ReplayIntent} from './authorized-durable-replay'
import type {RecoveryAttempt} from './replay-recovery'
import type {HttpReviewInput} from './stream-boundary'

let assertions=0
const check=(yes:boolean,label:string):void=>{if(!yes)throw Error('FAIL: '+label);assertions++;console.log('PASS: '+label)}
const encode=(x:string)=>new TextEncoder().encode(x)
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
const intent=(diff:Partial<ReplayIntent>={}):ReplayIntent=>({operation:'commit',
  tenantRef:'tenant-A',threadId:'thread-A',runId:'run-A',idempotencyKey:'idem-A',
  declaredCommitment:'a'.repeat(64),expectedRevision:0,attempts:[attempt()],...diff})
const peer:FixturePeer={kind:'fixture-mtls-peer',verifiedBy:'local-harness-only',
  peerServiceId:'fixture-gateway',channelId:'channel-A',peerCertSha256:'f'.repeat(64),
  audience:'masl-agui-fixture',issuedAt:1040,validThrough:1080}
const observation:FixtureProducer={kind:'fixture-producer-observation',
  originServiceId:'fixture-gateway',channelId:'channel-A',threadId:'thread-A',
  runId:'run-A',observedAt:1050,eventSha256:'b'.repeat(64)}
const identity:FixtureIssuerIdentity={provenance:'issuer-fixture-callback',
  principalId:'principal-A',tenantId:'tenant-A',allowedThreadIds:['thread-A','thread-B'],
  policyEpoch:9,issuer:'https://fixture.invalid/masl-issuer',audience:'masl-agui-fixture',
  keyId:'fixture-rsa-k2',tokenId:'jti-A',issuedAt:1000,notBefore:1000,expiresAt:1200,
  trustGeneration:3}
const metadata:FixtureSignedMetadata={kind:'fixture-signed-provider-metadata',
  issuer:identity.issuer,audience:identity.audience,signerId:'fixture-root-pinned',
  trustGeneration:3,activeKeyId:identity.keyId,revocationEpoch:2,observedAt:1050,validThrough:1080}
const credential:FixtureServiceProof={kind:'fixture-service-proof',credentialRef:'fixture-ticket-A',
  issuerIdentity:identity,trustGeneration:3,revocationEpoch:2}
const revoke:FixtureRevocation={kind:'fixture-jti-lookup',tenantId:'tenant-A',
  tokenId:'jti-A',trustGeneration:3,revoked:false,observedAt:1050}
const seed={tenantId:'tenant-A',policyEpoch:9,revision:0,receipts:[]}
const oldReceipt:FixtureReceipt={kind:'fixture-durable-receipt',tenantId:'tenant-A',
  principalId:'principal-A',threadId:'thread-A',runId:'run-A',idempotencyKey:'idem-A',
  declaredCommitment:'a'.repeat(64),commitRevision:1,observedAt:1050}
const producer:ProducerFixtureEnvelope={kind:'fixture-signed-envelope',producerId:'fixture-event-producer',
  keyId:'fixture-event-key-v1',tenantId:'tenant-A',threadId:'thread-A',runId:'run-A',
  sequence:1,payloadSha256:'c'.repeat(64),issuedAt:1030,expiresAt:1090,
  signatureRef:'sig-ref-1'}
const registry:ProducerFixtureRegistry={kind:'fixture-producer-registry',
  producerId:'fixture-event-producer',keyId:producer.keyId,tenantId:'tenant-A',
  allowedThreadIds:['thread-A','thread-B'],revocationEpoch:2,active:true,lastCommittedSequence:0}
const node:FailoverFixtureNode={kind:'fixture-shared-sqlite-node',nodeId:'fixture-node-B',
  region:'loopback-test-only',storageId:'shared-local-file',observedAt:1050,
  revocationEpoch:2,sharedCheckpoint:true}
const receipt:FailoverFixtureReceipt={kind:'fixture-failover-receipt',
  producerId:producer.producerId,keyId:producer.keyId,tenantId:producer.tenantId,
  threadId:producer.threadId,runId:producer.runId,sequence:producer.sequence,
  payloadSha256:producer.payloadSha256,nodeId:'fixture-node-A',storageId:node.storageId,
  committedRevision:1,observedAt:1050}
let now:unknown=1050,env:unknown=producer,reg:unknown=registry,target:unknown=node,
  failReceipt:unknown=receipt,channel:unknown=peer,observe:unknown=observation,
  meta:unknown=metadata,creds:unknown=credential,rev:unknown=revoke,checkpoint:unknown=seed,
  recpt:unknown=oldReceipt
let producerCalls=0,registryCalls=0,nodeCalls=0,previousCalls=0,receiptCalls=0
const gate=makeSelectedProducerFailoverGate({
  clockSeconds:()=>now,
  signedProducerEnvelopeFixture:()=>{producerCalls++;return env},
  producerRegistryFixture:()=>{registryCalls++;return reg},
  failoverNodeFixture:()=>{nodeCalls++;return target},
  failoverReceiptFixture:()=>{receiptCalls++;return failReceipt},
  resolveLocalPeerFixture:()=>{previousCalls++;return channel},
  inspectProducerFixture:()=>observe,
  signedProviderMetadataFixture:()=>meta,
  verifyCredentialServiceFixture:()=>creds,
  revocationServiceFixture:()=>rev,
  readCheckpointServiceFixture:()=>checkpoint,
  receiptServiceFixture:()=>recpt,
})
const request=(intents:unknown=[intent()],mode:'propose'|'reconcile'='propose')=>({
  channelRef:'fixture-channel-A',mode,credentialRef:'fixture-ticket-A',intents,
  producerRef:'producer-ref-A',nodeRef:'node-ref-B'})
const denied=(x:FailoverVerdict,stage:string,code:string,label:string):void=>{
  check(x.status==='blocked'&&x.stage===stage&&x.code===code,label)
  check(x.exposedEvents===0,`${label}: no raw event bytes exposed`)
  check(!x.realProducerSignatureVerified&&!x.realNodeIdentityVerified&&
    !x.distributedStorageVerified&&!x.operationalFailoverVerified&&
    !x.independentSecurityReview&&!x.adapterReady,`${label}: no trust promotion`)
}
const success=gate.review(request())
check(success.status==='planned','published 2.6Q transport readiness composes after fixture producer checks')
if(success.status==='planned'){
  check(success.producerId===producer.producerId&&success.nodeId===node.nodeId,'fixture producer and target node carried into plan')
  check(success.tenantId==='tenant-A'&&success.threadId==='thread-A','fixture tenant/thread bound')
  check(success.plannedCommits===1,'one selected replay plan proposed')
  check(success.exposedEvents===0&&!('payload' in success)&&!('signatureRef' in success),
    'producer event bytes and signature reference not returned')
  check(!success.realProducerSignatureVerified&&!success.distributedStorageVerified&&
    !success.operationalFailoverVerified&&!success.adapterReady,'pure plan is never operational approval')
}
check(producerCalls===1&&registryCalls===1&&nodeCalls===1&&previousCalls===1,
  'producer registry node and published 2.6Q called in required order')
const existing={tenantId:'tenant-A',policyEpoch:9,revision:1,receipts:[{
  tenantId:'tenant-A',threadId:'thread-A',runId:'run-A',principalId:'principal-A',
  idempotencyKey:'idem-A',declaredCommitment:'a'.repeat(64),commitRevision:1,
}]}
checkpoint=existing;reg={...registry,lastCommittedSequence:1}
const recovered=gate.review(request([intent({operation:'replay-check'})],'reconcile'))
check(recovered.status==='reconciled','published 2.6P read-only recovery composes with producer receipt fixture')
if(recovered.status==='reconciled')check(recovered.receiptReconciled&&recovered.plannedCommits===0,
  'recovered plan includes no second commit')
checkpoint=seed;reg=registry
for(const r of [null,undefined,0,'bad',{},[],{...request(),producerRef:''},
  {...request(),nodeRef:'bad/node'}, {...request(),credentialRef:'bad/slash'},
  {...request(),mode:'resume'}, {...request(),intents:[]},
  {...request(),intents:[intent(),intent()]}, {...request(),intents:[{}]},
  {...request(),intents:null},{...request(),channelRef:'bad/ref'}])
  denied(gate.review(r),'request','untrusted-failover-request-shape',
    `invalid request ${String(r).slice(0,22)}`)
for(const field of ['producerId','tenantId','principalId','keyId','producerKey',
  'payloadSha256','signature','trustedProducer','active','revocationEpoch',
  'storageId','nodeId','checkpoint','receipt','allowReplay','isAdmin',
  'externalAuthVerified','adapterReady','eventBytes','privileged'])
  denied(gate.review({...request(),[field]:true}),'request','untrusted-failover-request-shape',
    `caller privilege injection ${field} denied`)
const beforeRegistry=registryCalls
for(const alteration of [
  null,undefined,false,{},[],{...producer,kind:'live-verified-producer'},
  {...producer,producerId:''},{...producer,keyId:'bad/key'},
  {...producer,tenantId:'bad tenant'},{...producer,threadId:'thread-B'},
  {...producer,runId:'run-B'}, {...producer,sequence:0},
  {...producer,sequence:-1},{...producer,sequence:'1'},
  {...producer,payloadSha256:'c'.repeat(63)},
  {...producer,payloadSha256:'g'.repeat(64)},
  {...producer,issuedAt:-2},{...producer,expiresAt:null},
  {...producer,signatureRef:''},{...producer,signatureVerified:true},
  {...producer,admin:true},
]){
  env=alteration
  denied(gate.review(request()),'producer','fixture-producer-envelope-unverifiable',
    `malformed producer fixture ${JSON.stringify(alteration)?.slice(0,28)}`)
}
check(registryCalls===beforeRegistry,'invalid producer fixture never accesses registry')
env=producer
for(const [time,value,label] of [
  [1029,producer,'future producer issuance'],[1090,producer,'expired producer envelope'],
  [1050,{...producer,issuedAt:1050,expiresAt:1175},'producer TTL over 120'],
  [1050,{...producer,expiresAt:1029},'producer invalid expiry'],
] as const){now=time;env=value;denied(gate.review(request()),'producer','fixture-producer-envelope-expired',label)}
now=1050;env=producer
for(const value of [NaN,Infinity,-1,null,'1050',2_000_000_001]){
  now=value;denied(gate.review(request()),'producer','invalid-fixture-clock',
    `fixture clock invalid ${String(value)}`)}
now=1050
const beforeNode=nodeCalls
for(const alt of [null,{},[],false,
  {...registry,active:false},{...registry,producerId:'other'},
  {...registry,keyId:'fixture-event-key-v2'}, {...registry,tenantId:'tenant-B'},
  {...registry,allowedThreadIds:[]}, {...registry,allowedThreadIds:['thread-B']},
  {...registry,allowedThreadIds:['thread-A','thread-A']},
  {...registry,revocationEpoch:-1}, {...registry,lastCommittedSequence:'0'},
  {...registry,issuerVerified:true},{...registry,secret:'unsafe'},
]){
  reg=alt;denied(gate.review(request()),'registry','fixture-producer-registry-denied',
    `untrusted producer registry ${JSON.stringify(alt)?.slice(0,25)}`)
}
check(nodeCalls===beforeNode,'untrusted producer registry never reaches node fixture')
reg=registry
for(const lastCommittedSequence of [1,2,10]){
  reg={...registry,lastCommittedSequence}
  denied(gate.review(request()),'registry','producer-sequence-stale',
    `duplicate or stale producer sequence ${lastCommittedSequence} refused for commit`)
}
reg=registry
const beforeTransport=previousCalls
for(const value of [null,{},[],false,
  {...node,kind:'production-distributed-node'}, {...node,nodeId:'bad/node'},
  {...node,region:'multi-region'}, {...node,storageId:''},
  {...node,observedAt:1049},{...node,revocationEpoch:3},
  {...node,sharedCheckpoint:false}, {...node,operational:true},
]){
  target=value;denied(gate.review(request()),'node','fixture-node-state-untrusted',
    `invalid failover fixture node ${JSON.stringify(value)?.slice(0,23)}`)
}
check(previousCalls===beforeTransport,'untrusted node state cannot reach published 2.6Q')
target=node
// Published Q must still refuse a forged peer: no callback can bypass it.
channel={...peer,peerServiceId:'foreign'}
denied(gate.review(request()),'published-2.6Q','published-2.6Q:fixture-peer-unverifiable',
  'published 2.6Q peer identity gate remains enforced')
channel=peer
meta={...metadata,observedAt:1035}
denied(gate.review(request()),'published-2.6Q','published-2.6Q:published-2.6P:metadata-stale-or-expired',
  'published issuer metadata freshness still blocks proposed commit')
meta=metadata
rev={...revoke,revoked:true}
denied(gate.review(request()),'published-2.6Q','published-2.6Q:published-2.6P:revoked-at-service-boundary',
  'published revocation still blocks proposed commit')
rev=revoke
// Tenant in signed producer fixture is not allowed to substitute for user auth.
env={...producer,tenantId:'tenant-B'};reg={...registry,tenantId:'tenant-B'}
denied(gate.review(request()),'published-2.6Q','producer-tenant-not-bound-to-published-principal',
  'producer tenant cannot override authenticated fixture tenant')
env=producer;reg=registry
const missingProducer=makeSelectedProducerFailoverGate({
  ...({} as object),clockSeconds:()=>1050,signedProducerEnvelopeFixture:()=>{throw Error('offline')},
  producerRegistryFixture:()=>registry,failoverNodeFixture:()=>node,failoverReceiptFixture:()=>receipt,
  resolveLocalPeerFixture:()=>peer,inspectProducerFixture:()=>observation,
  signedProviderMetadataFixture:()=>metadata,verifyCredentialServiceFixture:()=>credential,
  revocationServiceFixture:()=>revoke,readCheckpointServiceFixture:()=>seed,receiptServiceFixture:()=>oldReceipt,
})
denied(missingProducer.review(request()),'producer','producer-proof-service-unavailable',
  'producer proof source outage fails closed')
const noRegistry=makeSelectedProducerFailoverGate({
  clockSeconds:()=>1050,signedProducerEnvelopeFixture:()=>producer,
  producerRegistryFixture:()=>{throw Error('offline')},failoverNodeFixture:()=>node,
  failoverReceiptFixture:()=>receipt,resolveLocalPeerFixture:()=>peer,inspectProducerFixture:()=>observation,
  signedProviderMetadataFixture:()=>metadata,verifyCredentialServiceFixture:()=>credential,
  revocationServiceFixture:()=>revoke,readCheckpointServiceFixture:()=>seed,receiptServiceFixture:()=>oldReceipt,
})
denied(noRegistry.review(request()),'registry','producer-registry-unavailable',
  'producer registry outage fails closed')
const noNode=makeSelectedProducerFailoverGate({
  clockSeconds:()=>1050,signedProducerEnvelopeFixture:()=>producer,
  producerRegistryFixture:()=>registry,failoverNodeFixture:()=>{throw Error('offline')},
  failoverReceiptFixture:()=>receipt,resolveLocalPeerFixture:()=>peer,inspectProducerFixture:()=>observation,
  signedProviderMetadataFixture:()=>metadata,verifyCredentialServiceFixture:()=>credential,
  revocationServiceFixture:()=>revoke,readCheckpointServiceFixture:()=>seed,receiptServiceFixture:()=>oldReceipt,
})
denied(noNode.review(request()),'node','fixture-node-unavailable','node state outage fails closed')
checkpoint=existing;reg={...registry,lastCommittedSequence:1}
for(const alteration of [null,{},[],false,
  {...receipt,keyId:'other-key'},{...receipt,payloadSha256:'0'.repeat(64)},
  {...receipt,sequence:2},{...receipt,tenantId:'tenant-B'},
  {...receipt,threadId:'thread-B'},{...receipt,runId:'run-B'},
  {...receipt,storageId:'other-storage'},{...receipt,committedRevision:0},
  {...receipt,observedAt:1040},{...receipt,verifiedBy:'production'},
]){
  failReceipt=alteration
  denied(gate.review(request([intent({operation:'replay-check'})],'reconcile')),
    'receipt','fixture-failover-receipt-unbound',
    `failover receipt mismatch refused ${JSON.stringify(alteration)?.slice(0,28)}`)
}
failReceipt=receipt;checkpoint=seed;reg=registry
const blockers=reviewProducerFailoverBlockers()
check(blockers.allNineGapsOpen,'all G1-G9 remain OPEN after producer proof fixtures')
check(blockers.parentMilestoneOpen,'parent milestone 2.6 remains OPEN')
check(blockers.priorAdapterBlocked,'published 2.6Q adapter remains BLOCKED')
for(const [key,value] of Object.entries(blockers)){
  if(typeof value==='boolean')check(value===false||
    ['allNineGapsOpen','parentMilestoneOpen','priorAdapterBlocked'].includes(key),
    `non-operational blocker ${key}`)
}
check(blockers.scope==='pure-fixture-composition-plus-separate-mtls-rs256-shared-sqlite-experiment',
  'fixture scope acknowledged; never distributed infrastructure')
console.log(`${assertions} 2.6R selected producer/failover TypeScript assertions passed`)
