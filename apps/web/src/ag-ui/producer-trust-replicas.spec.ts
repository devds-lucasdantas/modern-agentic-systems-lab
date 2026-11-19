import {makeSelectedProducerReplicaGate,reviewProducerReplicaBlockers,
  type FixtureProducerRoot,type FixtureReplica,type FixtureReplicaSet,type ReplicaGateVerdict} from './producer-trust-replicas'
import type {ProducerFixtureEnvelope,ProducerFixtureRegistry,FailoverFixtureNode,
  FailoverFixtureReceipt} from './producer-failover-evidence'
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

const trust:FixtureProducerRoot={kind:'fixture-producer-root-snapshot',
  rootId:'fixture-independent-pinned-root',producerId:producer.producerId,
  keyId:producer.keyId,generation:3,revocationEpoch:2,
  active:true,observedAt:1050,validThrough:1080}
const left:FixtureReplica={kind:'fixture-independent-sqlite-replica',
  replicaId:'replica-A',storageId:'db-A',producerId:producer.producerId,
  tenantId:'tenant-A',threadId:'thread-A',runId:'run-A',sequence:0,revision:0,
  revocationEpoch:2,leaderEpoch:1,receiptSha256:'d'.repeat(64),observedAt:1050}
const right:FixtureReplica={...left,replicaId:'replica-B',storageId:'db-B'}
const replicas:FixtureReplicaSet={kind:'fixture-replica-set',
  primary:left,standby:right,leaderEpoch:1,observedAt:1050}
let anchor:unknown=trust,copies:unknown=replicas,rootReads=0,replicaReads=0
const adapters={
  clockSeconds:():unknown=>now,
  readProducerRootFixture:(_ref:string):unknown=>{rootReads++;return anchor},
  readReplicaSetFixture:(_ref:string,_thread:string,_run:string):unknown=>{replicaReads++;return copies},
  signedProducerEnvelopeFixture:():unknown=>{producerCalls++;return env},
  producerRegistryFixture:():unknown=>{registryCalls++;return reg},
  failoverNodeFixture:():unknown=>{nodeCalls++;return target},
  failoverReceiptFixture:():unknown=>{receiptCalls++;return failReceipt},
  resolveLocalPeerFixture:():unknown=>{previousCalls++;return channel},
  inspectProducerFixture:():unknown=>observe,
  signedProviderMetadataFixture:():unknown=>meta,
  verifyCredentialServiceFixture:():unknown=>creds,
  revocationServiceFixture:():unknown=>rev,
  readCheckpointServiceFixture:():unknown=>checkpoint,
  receiptServiceFixture:():unknown=>recpt,
}
const gate=makeSelectedProducerReplicaGate(adapters)
const request=(intents:unknown=[intent()],mode:'propose'|'reconcile'='propose')=>({
  channelRef:'fixture-channel-A',mode,credentialRef:'fixture-ticket-A',intents,
  producerRef:'producer-ref-A',nodeRef:'node-ref-B',rootRef:'root-ref-A',replicaSetRef:'copies-A',
})
const denied=(v:ReplicaGateVerdict,stage:string,code:string,label:string):void=>{
  check(v.status==='blocked'&&v.stage===stage&&v.code===code,label)
  check(v.exposedEvents===0,label+': zero event disclosure')
  check(!v.externalRootAuthenticated&&!v.replicationProtocolProven&&
    !v.consensusOrQuorumProven&&!v.productionDurabilityProven&&
    !v.realProducerVerified&&!v.adapterReady,label+': no privilege promotion')
}
const good=gate.review(request())
check(good.status==='planned','published 2.6R signed producer gate composes after two replica prechecks')
if(good.status==='planned'){
  check(good.replicaCount===2&&good.leaderEpoch===1,'two independent fixture store identities and leader epoch')
  check(good.producerId===producer.producerId&&good.tenantId==='tenant-A','producer tenant binding retained')
  check(good.plannedCommits===1&&good.exposedEvents===0,'pure plan has no event exposure')
  check(!good.externalRootAuthenticated&&!good.replicationProtocolProven&&
    !good.consensusOrQuorumProven&&!good.productionDurabilityProven&&!good.adapterReady,
    'no replica consensus or operational authorization inferred')
}
check(rootReads===1&&replicaReads===1&&producerCalls===1&&registryCalls===1&&
  nodeCalls===1&&previousCalls===1,'root replicas producer registry node and published transport called in order')
const existing={tenantId:'tenant-A',policyEpoch:9,revision:1,receipts:[{
  tenantId:'tenant-A',threadId:'thread-A',runId:'run-A',principalId:'principal-A',
  idempotencyKey:'idem-A',declaredCommitment:'a'.repeat(64),commitRevision:1,
}]}
checkpoint=existing;reg={...registry,lastCommittedSequence:1}
copies={...replicas,primary:{...left,sequence:1,revision:1},
  standby:{...right,sequence:1,revision:1}}
const reconciled=gate.review(request([intent({operation:'replay-check'})],'reconcile'))
check(reconciled.status==='reconciled','published 2.6R reconciliation requires two matching independent stores')
if(reconciled.status==='reconciled')check(reconciled.receiptReconciled&&reconciled.plannedCommits===0,
  'replica reconciliation remains no-write proposal')
checkpoint=seed;reg=registry;copies=replicas

for(const v of [null,undefined,0,false,{},[],{...request(),rootRef:'bad/root'},
  {...request(),replicaSetRef:''},{...request(),intents:[]},
  {...request(),intents:[intent(),intent()]},{...request(),mode:'resume'},
  {...request(),replicaSetRef:undefined}])
  denied(gate.review(v),'request','untrusted-replica-request-shape',
    `request shape ${String(v).slice(0,25)} rejected`)
for(const field of ['producerId','tenantId','principalId','root','rootKey',
  'replica','storageId','checkpoint','receipt','leaderEpoch','quorumApproved',
  'producerVerified','signatureValid','keyId','tokenId','adapterReady',
  'replicationVerified','secret','trustedIssuer','isAdmin','revoked'])
  denied(gate.review({...request(),[field]:true}),'request','untrusted-replica-request-shape',
    `caller privileged ${field} rejected`)
const beforeReplica=replicaReads
for(const value of [null,undefined,{},[],false,
  {...trust,kind:'operational-root-proof'}, {...trust,rootId:'untrusted-root'},
  {...trust,producerId:'bad producer'}, {...trust,keyId:'bad/key'},
  {...trust,generation:0},{...trust,revocationEpoch:-1},
  {...trust,active:false},{...trust,observedAt:NaN},
  {...trust,validThrough:'1080'},{...trust,externalVerified:true},
  {...trust,privateKey:'secret'}]){
  anchor=value
  denied(gate.review(request()),'trust-root','fixture-producer-root-invalid',
    `untrusted producer root ${JSON.stringify(value)?.slice(0,24)}`)
}
check(replicaReads===beforeReplica,'invalid root never reads replica state')
anchor=trust
for(const value of [1040,1061,1080,1100]){
  anchor={...trust,observedAt:value===1040?1040:1050,validThrough:value===1080?1080:1080}
  now=value
  if(value===1040){anchor={...trust,observedAt:1050}}
  denied(gate.review(request()),'trust-root','fixture-producer-root-stale',
    `stale or future root at time ${value}`)
}
now=1050;anchor=trust
const beforeProducer=producerCalls
for(const r of [null,false,{},[],{...replicas,leaderEpoch:0},
  {...replicas,observedAt:1051},
  {...replicas,kind:'verified-distributed-cluster'}]){
  copies=r
  denied(gate.review(request()),'replicas','fixture-replica-set-invalid',
    `invalid replica set ${JSON.stringify(r)?.slice(0,22)}`)
}
for(const patch of [
  {kind:'live-replica'}, {replicaId:''},{storageId:'bad/store'},
  {producerId:'unknown'},{tenantId:'bad tenant'},{threadId:'thread-B'},
  {runId:'run-B'},{sequence:-1},{revision:'0'},
  {revocationEpoch:1},{leaderEpoch:2},{receiptSha256:'x'.repeat(64)},
  {observedAt:1051},{certified:true},{replicaPrivateKey:'key'},
]){
  copies={...replicas,primary:{...left,...patch}}
  denied(gate.review(request()),'replicas','fixture-replica-record-untrusted',
    `invalid independent replica ${Object.keys(patch)[0]}`)
}
check(producerCalls===beforeProducer,'invalid replica never invokes published producer chain')
for(const patch of [
  {replicaId:left.replicaId},{storageId:left.storageId},
]){
  copies={...replicas,standby:{...right,...patch}}
  denied(gate.review(request()),'replicas','fixture-not-independent-stores',
    `shared store identity ${Object.keys(patch)[0]} denied`)
}
for(const patch of [
  {tenantId:'tenant-B'},{sequence:1},{revision:1},
  {receiptSha256:'e'.repeat(64)},
]){
  copies={...replicas,standby:{...right,...patch}}
  denied(gate.review(request()),'replicas','fixture-replica-divergence',
    `divergent replica ${Object.keys(patch)[0]} fail closed`)
}
copies=replicas
for(const key of ['readProducerRootFixture','readReplicaSetFixture'] as const){
  const bad={...adapters,[key]:()=>{throw Error('fixture outage')}}
  const result=makeSelectedProducerReplicaGate(bad).review(request())
  denied(result,key==='readProducerRootFixture'?'trust-root':'replicas',
    key==='readProducerRootFixture'?'fixture-trust-root-unavailable':'fixture-replica-service-unavailable',
    `unavailable ${key} fails closed`)
}
anchor={...trust,producerId:'other-producer'}
copies={...replicas,primary:{...left,producerId:'other-producer'},
  standby:{...right,producerId:'other-producer'}}
denied(gate.review(request()),'published-2.6R','fixture-producer-or-tenant-unbound',
  'published producer identity must match independently pinned root')
anchor=trust;copies=replicas
const beforePublished=producerCalls
env={...producer,threadId:'thread-B'}
denied(gate.review(request()),'published-2.6R','published-2.6R:fixture-producer-envelope-unverifiable',
  'published 2.6R rejects producer envelope scope mismatch')
check(producerCalls===beforePublished+1,'published producer remains invoked on valid replica set')
env=producer
const blockers=reviewProducerReplicaBlockers()
check(blockers.allNineGapsOpen&&blockers.parentMilestoneOpen&&blockers.priorAdapterBlocked,
  'all G1-G9 remain OPEN after separated replica fixtures')
check(!blockers.distributedReplicationVerified&&!blockers.splitBrainFencingProductionVerified&&
  !blockers.adapterReady,'parent 2.6 and adapter remain OPEN/BLOCKED')
check(Object.values(blockers).filter(v=>v===true).length===3,
  'no operational readiness fields promoted by fixture')
console.log(`${assertions} 2.6S selected producer trust/replica TypeScript assertions passed`)
