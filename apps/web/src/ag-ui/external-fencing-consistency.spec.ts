import {makeSelectedExternalFencingGate,reviewExternalFencingBlockers,
  type FixtureAuthority,type FixtureFencingTicket,type FencingVerdict} from './external-fencing-consistency'
import type {FixtureProducerRoot,FixtureReplica,FixtureReplicaSet} from './producer-trust-replicas'
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
  readExternalAuthorityFixture:(_ref:string):unknown=>{authorityReads++;return authority},
  readFencingTicketFixture:(_ref:string):unknown=>{ticketReads++;return ticket},
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

const authorityBase:FixtureAuthority={kind:'fixture-third-store-authority',
  authorityId:'fixture-fencing-authority',storageId:'db-C',leaderId:'replica-A',
  leaderEpoch:1,revocationEpoch:2,receiptHeadSha256:'d'.repeat(64),observedAt:1050,
  validThrough:1080}
const ticketBase:FixtureFencingTicket={kind:'fixture-fencing-ticket',
  authorityId:'fixture-fencing-authority',leaderId:'replica-A',leaderEpoch:1,
  tenantId:'tenant-A',threadId:'thread-A',runId:'run-A',fencingId:'grant-A',
  issuedAt:1048,expiresAt:1075}
let authority:unknown=authorityBase,ticket:unknown=ticketBase,authorityReads=0,ticketReads=0
const gate=makeSelectedExternalFencingGate(adapters)
const request=(intents:unknown=[intent()],mode:'propose'|'reconcile'='propose')=>({
  channelRef:'fixture-channel-A',mode,credentialRef:'fixture-ticket-A',intents,
  producerRef:'producer-ref-A',nodeRef:'node-ref-B',rootRef:'root-ref-A',
  replicaSetRef:'copies-A',authorityRef:'authority-A',fencingRef:'fencing-A'})
const denied=(v:FencingVerdict,stage:string,code:string,label:string):void=>{
  check(v.status==='blocked'&&v.stage===stage&&v.code===code,label)
  check(v.exposedEvents===0,label+': no event exposure')
  check(!v.externalFencingVerified&&!v.replicatedConsistencyVerified&&
    !v.authoritativeServiceVerified&&!v.staleWriterProductionBlocked&&!v.adapterReady,
    label+': not a production authorization')
}
const good=gate.review(request())
check(good.status==='planned','published 2.6S pure replica chain composes after fencing prechecks')
if(good.status==='planned'){
  check(good.leaderEpoch===1&&good.producerId===producer.producerId,
    'selected fixture leader and producer are bound to published chain')
  check(good.tenantId==='tenant-A'&&good.plannedCommits===1&&good.exposedEvents===0,
    'pure proposal never exposes events or commits a store')
  check(!good.externalFencingVerified&&!good.replicatedConsistencyVerified&&
    !good.authoritativeServiceVerified&&!good.staleWriterProductionBlocked&&!good.adapterReady,
    'no operational writer fencing promotion')
}
check(authorityReads===1&&ticketReads===1&&replicaReads===1&&rootReads===1,
  'one authority ticket replica and published root read in order')

for(const v of [null,undefined,0,false,[],{},
  {...request(),fencingRef:''},{...request(),authorityRef:'bad/path'},
  {...request(),mode:'resume'},{...request(),intents:[]},
  {...request(),intents:[intent(),intent()]}])
  denied(gate.review(v),'request','untrusted-fencing-request-shape',
    `request rejected ${String(v).slice(0,25)}`)
for(const f of ['tenantId','principalId','leaderEpoch','authority','fencingToken',
  'rootKey','isAdmin','quorumApproved','producerVerified','receipt','checkpoint',
  'adapterReady','securityApproved','store','revoked','fencingVerified'])
  denied(gate.review({...request(),[f]:true}),'request','untrusted-fencing-request-shape',
    'caller privileged '+f+' rejected')

const beforeTicket=ticketReads
for(const a of [null,{},[],false,
  {...authorityBase,kind:'production-fencing'},
  {...authorityBase,authorityId:'other'},
  {...authorityBase,leaderId:'bad/leader'},
  {...authorityBase,storageId:'bad/path'},
  {...authorityBase,leaderEpoch:-1},
  {...authorityBase,revocationEpoch:'2'},
  {...authorityBase,receiptHeadSha256:'a'.repeat(63)},
  {...authorityBase,productionTrusted:true}]){
  authority=a
  denied(gate.review(request()),'authority','fixture-authority-untrusted',
    `authority untrusted ${JSON.stringify(a)?.slice(0,18)}`)
}
check(ticketReads===beforeTicket,'bad authority does not read fencing ticket')
authority=authorityBase
for(const a of [
  {...authorityBase,observedAt:1051},
  {...authorityBase,observedAt:1044},
  {...authorityBase,validThrough:1050},
  {...authorityBase,validThrough:1081},
]){
  authority=a
  denied(gate.review(request()),'authority','fixture-authority-stale','stale authority denied')
}
authority=authorityBase
const beforeReplica=replicaReads
for(const x of [null,{},false,[],
  {...ticketBase,authorityId:'other'},
  {...ticketBase,leaderId:'replica-B'},
  {...ticketBase,leaderEpoch:2},
  {...ticketBase,tenantId:'bad tenant'},
  {...ticketBase,threadId:'thread-B'},
  {...ticketBase,runId:'run-B'},
  {...ticketBase,fencingId:'bad/ticket'},
  {...ticketBase,issuedAt:'1048'},
  {...ticketBase,expiresAt:NaN},
  {...ticketBase,signatureVerified:true}]){
  ticket=x
  denied(gate.review(request()),'ticket','fixture-fencing-ticket-misbound',
    `misbound ticket ${JSON.stringify(x)?.slice(0,19)}`)
}
check(replicaReads===beforeReplica,'misbound tickets do not read replicas')
ticket=ticketBase
for(const x of [
  {...ticketBase,issuedAt:1051},
  {...ticketBase,issuedAt:1044},
  {...ticketBase,expiresAt:1050},
  {...ticketBase,expiresAt:1080},
]){
  ticket=x
  denied(gate.review(request()),'ticket','fixture-fencing-ticket-expired',
    'expired or stale fencing ticket denied')
}
ticket=ticketBase
const beforeRoot=rootReads
for(const bad of [null,false,{},[],
  {...replicas,primary:null},
  {...replicas,primary:{...left,additional:true}},
  {...replicas,standby:{...right,extra:'x'}}]){
  copies=bad
  denied(gate.review(request()),'replicas','fixture-replica-state-invalid',
    'invalid replica state rejected before published gate')
}
for(const bad of [
  {...replicas,primary:{...left,storageId:'db-C'}},
  {...replicas,standby:{...right,storageId:'db-C'}},
  {...replicas,primary:{...left,replicaId:'replica-B'}},
  {...replicas,leaderEpoch:2},
  {...replicas,primary:{...left,leaderEpoch:2}},
  {...replicas,standby:{...right,leaderEpoch:2}},
  {...replicas,primary:{...left,tenantId:'tenant-B'}},
  {...replicas,primary:{...left,revocationEpoch:3}},
  {...replicas,standby:{...right,receiptSha256:'c'.repeat(64)}},
]){
  copies=bad
  denied(gate.review(request()),'replicas','fixture-authority-replica-divergence',
    'authority and replica mismatch denied')
}
check(rootReads===beforeRoot,'divergent replica cannot enter published producer chain')
copies=replicas

authority={...authorityBase,leaderId:'replica-B',leaderEpoch:2}
ticket={...ticketBase,leaderId:'replica-B',leaderEpoch:2}
copies={...replicas,primary:{...right,leaderEpoch:2},
  standby:{...left,leaderEpoch:2},leaderEpoch:2}
check(gate.review(request()).status==='planned',
  'coherently rotated fixture leader and epoch accepted as pure plan')
authority=authorityBase;ticket=ticketBase;copies=replicas

authority={...authorityBase,leaderEpoch:2}
denied(gate.review(request()),'ticket','fixture-fencing-ticket-misbound',
  'old ticket denied after authority epoch advancement')
authority=authorityBase

const existing={tenantId:'tenant-A',policyEpoch:9,revision:1,receipts:[{
  tenantId:'tenant-A',threadId:'thread-A',runId:'run-A',principalId:'principal-A',
  idempotencyKey:'idem-A',declaredCommitment:'a'.repeat(64),commitRevision:1,
}]}
checkpoint=existing;reg={...registry,lastCommittedSequence:1}
copies={...replicas,primary:{...left,sequence:1,revision:1},
  standby:{...right,sequence:1,revision:1}}
const replay=gate.review(request([intent({operation:'replay-check'})],'reconcile'))
check(replay.status==='reconciled',
  'published 2.6S signed producer receipt reconciliation still composes')
if(replay.status==='reconciled')check(replay.receiptReconciled&&replay.plannedCommits===0,
  'reconciled verdict is read-only selected fixture')
checkpoint=seed;reg=registry;copies=replicas

anchor={...trust,active:false}
denied(gate.review(request()),'published-2.6S',
  'published-2.6S:fixture-producer-root-invalid','published root revocation remains enforced')
anchor=trust
const gap=reviewExternalFencingBlockers()
check(gap.allNineGapsOpen&&gap.parentMilestoneOpen&&gap.priorAdapterBlocked,
  'all G1-G9 remain OPEN after external authority fixtures')
check(!gap.productionFencingAuthorityAuthenticated&&!gap.quorumOrConsensusProven&&
  !gap.crossHostFencingAvailabilityProven&&!gap.transactionalDistributedPromotionProven&&
  !gap.realProducerTrustVerified&&!gap.revocationDistributionProven&&
  !gap.aguiFullConformanceProven&&!gap.mediaDlpSecuritySignedOff&&
  !gap.adapterReady,'parent 2.6 and adapter remain OPEN/BLOCKED')
console.log(`ASSERTIONS: ${assertions}`)
