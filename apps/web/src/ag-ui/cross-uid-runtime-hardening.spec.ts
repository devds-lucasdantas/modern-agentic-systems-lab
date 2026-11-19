import {makeSelectedRuntimeHardeningGate,reviewRuntimeHardeningBlockers,
  type RuntimeOwnerFixture,type RuntimeSocketFixture,type RuntimeRecoveryFixture,
  type RuntimeHardeningVerdict} from './cross-uid-runtime-hardening'
import {makeSelectedCrossUidMediationGate,reviewCrossUidMediationBlockers,
  type CrossUidOwnerFixture,type CrossUidClientFixture,type CrossUidSocketFixture,
  type CrossUidRestartFixture,type CrossUidVerdict} from './cross-uid-storage-mediation'
import {makeSelectedStorageIsolationGate,reviewStorageIsolationBlockers,
  type FixtureStorageOwner,type FixtureSandboxClient,type FixtureFailStopOwner,
  type StorageIsolationVerdict} from './storage-isolation-failstop'
import {reviewMandatoryFencingBlockers,
  type FixtureBroker,type FixtureJournal} from './mandatory-fencing-promotion'
import {reviewExternalFencingBlockers,type FixtureAuthority,
  type FixtureFencingTicket} from './external-fencing-consistency'
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
const brokerBase:FixtureBroker={kind:'fixture-sqlite-writer-broker',brokerId:'broker-A',
  storageId:'db-A',enforcement:'connection-authorizer-only',
  scope:'test-broker-connections-only',observedAt:1050,validThrough:1080}
const journalBase:FixtureJournal={kind:'fixture-promotion-journal',
  authorityId:'fixture-fencing-authority',phase:'stable',leaderId:'replica-A',
  leaderEpoch:1,receiptSha256:'d'.repeat(64),operationId:'op-stable',observedAt:1050}
let broker:unknown=brokerBase,journal:unknown=journalBase,brokerReads=0,journalReads=0
const adapters={
  readBrokerFixture:():unknown=>{brokerReads++;return broker},
  readStorageOwnerFixture:():unknown=>{ownerReads++;return owner},
  readConstrainedClientFixture:():unknown=>{clientReads++;return client},
  readFailStopFixture:():unknown=>{stopReads++;return stop},
  readPromotionJournalFixture:():unknown=>{journalReads++;return journal},
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
const ownerBase:FixtureStorageOwner={kind:'fixture-unix-socket-storage-owner',
  ownerId:'owner-A',storageId:'db-A',enforcement:'owner-process-and-self-confined-client',
  identityScope:'single-uid-local-rehearsal-only',observedAt:1050,validThrough:1080}
const clientBase:FixtureSandboxClient={kind:'fixture-seccomp-client',clientId:'client-A',
  ownerId:'owner-A',confinement:'self-installed-open-denial',writeDenied:true,
  rpcPermitted:true,observedAt:1050}
const stopBase:FixtureFailStopOwner={kind:'fixture-fail-stop-observation',ownerId:'owner-A',
  phase:'running',journalPhase:'stable',leaderEpoch:1,
  receiptHeadSha256:'d'.repeat(64),observedAt:1050}
let owner:unknown=ownerBase,client:unknown=clientBase,stop:unknown=stopBase
let ownerReads=0,clientReads=0,stopReads=0
const gate=makeSelectedStorageIsolationGate(adapters)
const request=(intents:unknown=[intent()],mode:'propose'|'reconcile'='propose')=>({
  channelRef:'fixture-channel-A',mode,credentialRef:'fixture-ticket-A',intents,
  producerRef:'producer-ref-A',nodeRef:'node-ref-B',rootRef:'root-ref-A',
  replicaSetRef:'copies-A',authorityRef:'authority-A',fencingRef:'fencing-A',
  brokerRef:'broker-A',journalRef:'journal-A',
  ownerRef:'owner-A',clientRef:'client-A',failStopRef:'stop-A'})
const denied=(v:StorageIsolationVerdict,stage:string,code:string,label:string):void=>{
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
  denied(gate.review(v),'request','untrusted-broker-request-shape',
    `request rejected ${String(v).slice(0,25)}`)
for(const f of ['tenantId','principalId','leaderEpoch','authority','fencingToken',
  'rootKey','isAdmin','quorumApproved','producerVerified','receipt','checkpoint',
  'adapterReady','securityApproved','store','revoked','fencingVerified'])
  denied(gate.review({...request(),[f]:true}),'request','untrusted-broker-request-shape',
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
journal={...journalBase,leaderId:'replica-B',leaderEpoch:2}
stop={...stopBase,leaderEpoch:2}
ticket={...ticketBase,leaderId:'replica-B',leaderEpoch:2}
copies={...replicas,primary:{...right,leaderEpoch:2},
  standby:{...left,leaderEpoch:2},leaderEpoch:2}
check(gate.review(request()).status==='planned',
  'coherently rotated fixture leader and epoch accepted as pure plan')
authority=authorityBase;ticket=ticketBase;copies=replicas;journal=journalBase;stop=stopBase

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

// Additional 2.6U broker/journal negative and recovery-state checks.
const u=reviewMandatoryFencingBlockers()
check(u.allNineGapsOpen&&u.parentMilestoneOpen&&u.priorAdapterBlocked,
  '2.6U preserves G1-G9 and parent 2.6 OPEN')
check(!u.mandatoryStorageWriterEnforcement&&!u.sameUidBypassPrevented&&
  !u.productionCrashAtomicPromotion&&!u.independentExternalAuthority&&
  !u.quorumOrConsensusVerified&&!u.crossHostDurabilityVerified&&
  !u.enterpriseProducerTrustVerified&&!u.mediaDlpReviewed&&
  !u.fullAguiConformanceVerified&&!u.adapterReady,
  '2.6U broker-only boundary cannot promote operational readiness')
check(brokerReads>0&&journalReads>0,'new broker/journal fixture callbacks were exercised')
for(const bad of [null,false,{},[],
  {...brokerBase,kind:'enterprise-broker'},
  {...brokerBase,enforcement:'universal-storage-fencing'},
  {...brokerBase,scope:'production-enforcement'},
  {...brokerBase,brokerId:'invalid/path'},
  {...brokerBase,storageId:'wrong/path'},
  {...brokerBase,validThrough:'1080'},
  {...brokerBase,privileged:true}]){
  broker=bad
  denied(gate.review(request()),'broker','fixture-broker-untrusted',
    'untrusted broker rejected before journal and prior gates')
}
broker=brokerBase
for(const bad of [
  {...brokerBase,observedAt:1051},
  {...brokerBase,observedAt:1044},
  {...brokerBase,validThrough:1050},
  {...brokerBase,validThrough:1081},
]){
  broker=bad
  denied(gate.review(request()),'broker','fixture-broker-stale',
    'stale broker observation denied')
}
broker=brokerBase
for(const bad of [null,{},false,[],
  {...journalBase,authorityId:'not-the-authority'},
  {...journalBase,leaderId:'invalid/path'},
  {...journalBase,leaderEpoch:-1},
  {...journalBase,receiptSha256:'f'.repeat(63)},
  {...journalBase,operationId:''},
  {...journalBase,observedAt:1044},
  {...journalBase,phase:'completed-in-prod'},
  {...journalBase,securityApproved:true}]){
  journal=bad
  denied(gate.review(request()),'journal','fixture-journal-invalid',
    'malformed promotion journal fails closed')
}
journal=journalBase
for(const phase of ['prepared','replica-applied','recovery-blocked'] as const){
  journal={...journalBase,phase}
  denied(gate.review(request()),'journal','fixture-promotion-pending-fail-closed',
    'pending or blocked promotion denies new writes')
}
journal={...journalBase,leaderEpoch:2}
denied(gate.review(request()),'journal','fixture-journal-epoch-conflict',
  'stale journal/authority leadership cannot be promoted')
journal=journalBase
check(gate.review(request()).status==='planned',
  'stable broker and journal preserve published 2.6T gate composition')
check(!('operationallyReady' in u),'fixture never invents operational readiness')


// 2.6V: pure fixtures never establish real kernel/UID/storage trust.
const v=reviewStorageIsolationBlockers()
check(v.allNineGapsOpen&&v.parentMilestoneOpen&&v.priorAdapterBlocked,
  '2.6V preserves all G1-G9 and parent milestone OPEN')
check(!v.independentUidOwnershipVerified&&!v.OSDiscretionaryAccessControlProven&&
  !v.arbitrarySameUidWriterPrevented&&!v.kernelSandboxMandatoryForAllClients&&
  !v.externalTrustedFencingVerified&&!v.crossHostRecoveryVerified&&
  !v.distributedAtomicPromotionVerified&&!v.normativeAguiConformanceVerified&&
  !v.mediaDlpSecurityApproved&&!v.adapterReady,
  '2.6V no unbypassable OS security or operational claims')
check(ownerReads>0&&clientReads>0&&stopReads>0,
  'storage owner client confinement and fail stop are fixture observations')
const oldOwnerCalls=clientReads
for(const bad of [null,false,{},[],
  {...ownerBase,kind:'production-owner'},
  {...ownerBase,identityScope:'root-verified'},
  {...ownerBase,enforcement:'universal'},
  {...ownerBase,ownerId:'bad/owner'},
  {...ownerBase,storageId:'bad/storage'},
  {...ownerBase,validThrough:'1080'},
  {...ownerBase,permissionsGuaranteed:true}]){
  owner=bad
  denied(gate.review(request()),'owner','fixture-storage-owner-untrusted',
    'owner identity spoofing rejected')
}
check(clientReads===oldOwnerCalls,'bad owner cannot reach client callback')
owner=ownerBase
for(const bad of [
  {...ownerBase,observedAt:1051},
  {...ownerBase,observedAt:1044},
  {...ownerBase,validThrough:1050},
  {...ownerBase,validThrough:1081}]){
  owner=bad
  denied(gate.review(request()),'owner','fixture-storage-owner-stale',
    'owner timestamp freshness enforced')
}
owner=ownerBase
const oldStopCalls=stopReads
for(const bad of [null,false,{},[],
  {...clientBase,kind:'unsandboxed-process'},
  {...clientBase,ownerId:'someone-else'},
  {...clientBase,confinement:'kernel-mandatory-for-all-processes'},
  {...clientBase,writeDenied:false},
  {...clientBase,rpcPermitted:false},
  {...clientBase,observedAt:1051},
  {...clientBase,observedAt:1044},
  {...clientBase,securitySignoff:true}]){
  client=bad
  denied(gate.review(request()),'client','fixture-client-confinement-untrusted',
    'untrusted client confinement rejected')
}
check(stopReads===oldStopCalls,'bad client cannot read fail-stop fixture')
client=clientBase
for(const bad of [null,{},false,[],
  {...stopBase,kind:'production-availability'},
  {...stopBase,ownerId:'wrong-owner'},
  {...stopBase,leaderEpoch:-1},
  {...stopBase,receiptHeadSha256:'d'.repeat(63)},
  {...stopBase,observedAt:1051},
  {...stopBase,observedAt:1044},
  {...stopBase,journalPhase:'external-quorum-committed'},
  {...stopBase,clusterReady:true}]){
  stop=bad
  denied(gate.review(request()),'fail-stop','fixture-owner-journal-invalid',
    'untrusted fail stop and receipt observations rejected')
}
stop=stopBase
for(const phase of ['crashed','recovering'] as const){
  stop={...stopBase,phase}
  denied(gate.review(request()),'fail-stop','fixture-owner-not-write-ready',
    'fail-stop crash and recovery deny work')
}
for(const journalPhase of ['prepared','replica-applied'] as const){
  stop={...stopBase,journalPhase}
  denied(gate.review(request()),'fail-stop','fixture-owner-not-write-ready',
    'pending journal phase denies work before upstream gate')
}
stop={...stopBase,leaderEpoch:2}
denied(gate.review(request()),'fail-stop','fixture-journal-leader-epoch-conflict',
  'owner journal and published authority leader epoch must agree')
stop=stopBase
check(gate.review(request()).status==='planned',
  '2.6V stable owner preserves published 2.6U through 2.6J pure chain')
check(!('kernelVerified' in v)&&!('productionReady' in v),
  'pure contract never promotes injected fixture into real security evidence')

console.log(`ASSERTIONS: ${assertions}`)

// 2.6W new fixture-observation tests: these cannot prove Linux DAC in TypeScript.
const wOwnerBase:CrossUidOwnerFixture={kind:'fixture-cross-uid-owner',ownerId:'owner-A',
  storageId:'db-A',ownerUid:61001,ownerGid:61001,dataDirMode:448,dbFileMode:384,
  identityScope:'separate-unprivileged-linux-uids-in-isolated-test',observedAt:1050,validThrough:1080}
const wClientBase:CrossUidClientFixture={kind:'fixture-cross-uid-client',ownerId:'owner-A',
  clientId:'client-A',clientUid:61002,clientGid:61002,
  directReadDenied:true,directWriteDenied:true,socketRpcAllowed:true,observedAt:1050}
const wSocketBase:CrossUidSocketFixture={kind:'fixture-so-peercred-socket',ownerId:'owner-A',
  ownerUid:61001,allowedUid:61002,socketMode:432,socketDirMode:457,
  peerCredUidMatched:true,otherUidDenied:true,observedAt:1050}
const wRestartBase:CrossUidRestartFixture={kind:'fixture-cross-uid-restart',ownerId:'owner-A',
  phase:'running',leaderEpoch:1,receiptHeadSha256:'d'.repeat(64),
  receiptReconciled:true,staleWriterDenied:true,observedAt:1050}
let wOwner:unknown=wOwnerBase,wClient:unknown=wClientBase,
  wSocket:unknown=wSocketBase,wRestart:unknown=wRestartBase
let wOwnerCalls=0,wClientCalls=0,wSocketCalls=0,wRestartCalls=0
const wAdapters={...adapters,
  readUidOwnerFixture:(_ref:string):unknown=>{wOwnerCalls++;return wOwner},
  readUidClientFixture:(_ref:string):unknown=>{wClientCalls++;return wClient},
  readUidSocketFixture:(_ref:string):unknown=>{wSocketCalls++;return wSocket},
  readUidRestartFixture:(_ref:string):unknown=>{wRestartCalls++;return wRestart},
}
const wGate=makeSelectedCrossUidMediationGate(wAdapters)
const wRequest=()=>({...request(),uidOwnerRef:'owner-uid-ref',uidClientRef:'client-uid-ref',
  uidSocketRef:'sock-uid-ref',uidRestartRef:'restart-uid-ref'})
const wDenied=(v:CrossUidVerdict,stage:string,code:string,label:string):void=>{
  check(v.status==='blocked'&&v.stage===stage&&v.code===code,label)
  check(v.exposedEvents===0&&!v.actualCrossUidOsVerifiedInTS&&!v.adapterReady,
    label+': no promoted operational claims')
}
const wPass=wGate.review(wRequest())
check(wPass.status==='planned','2.6W published 2.6V through 2.6J chain composes after UID checks')
if(wPass.status==='planned'){
  check(wPass.scope==='cross-uid-fixture-observations-only'&&wPass.plannedCommits===1,
    '2.6W selected cross UID contract stays pure')
  check(!wPass.rootOrOwnerCompromiseProtected&&!wPass.mandatoryUidIsolationVerified,
    '2.6W cannot promote local kernel observations into production authorization')
}
check(wOwnerCalls===1&&wClientCalls===1&&wSocketCalls===1&&wRestartCalls===1,
  '2.6W fixture authority reads in expected order')
for(const r of [null,undefined,0,false,{},[],{...wRequest(),uidOwnerRef:'bad/path'},
  {...wRequest(),uidClientRef:''},{...wRequest(),uidRestartRef:'bad ref'},
  {...wRequest(),productionApproved:true},{...wRequest(),rootKey:'h'},
  {...wRequest(),intents:[]},{...wRequest(),mode:'resume'}])
  wDenied(wGate.review(r),'request','untrusted-cross-uid-request-shape','2.6W request and privilege fields rejected')
const beforeClient=wClientCalls
for(const x of [null,false,[],{},
  {...wOwnerBase,kind:'production-root-owner'},
  {...wOwnerBase,ownerUid:0},
  {...wOwnerBase,ownerGid:0},{...wOwnerBase,dataDirMode:493},
  {...wOwnerBase,dbFileMode:420},{...wOwnerBase,storageId:'bad/path'},
  {...wOwnerBase,identityScope:'corporate-uid-authority'},
  {...wOwnerBase,validThrough:'1080'}, {...wOwnerBase,superuserProtected:true}]){
  wOwner=x
  wDenied(wGate.review(wRequest()),'uid-owner','cross-uid-owner-untrusted','2.6W untrusted owner denied')
}
check(wClientCalls===beforeClient,'2.6W invalid owner never reaches client')
wOwner=wOwnerBase
for(const x of [{...wOwnerBase,observedAt:1051},{...wOwnerBase,observedAt:1044},
  {...wOwnerBase,validThrough:1050},{...wOwnerBase,validThrough:1081}]){
  wOwner=x
  wDenied(wGate.review(wRequest()),'uid-owner','cross-uid-owner-stale','2.6W stale owner denied')
}
wOwner=wOwnerBase
const beforeSocket=wSocketCalls
for(const x of [null,false,[],{},
  {...wClientBase,clientUid:61001},{...wClientBase,clientGid:61001},
  {...wClientBase,clientUid:0},{...wClientBase,clientGid:0},
  {...wClientBase,ownerId:'other'}, {...wClientBase,directReadDenied:false},
  {...wClientBase,directWriteDenied:false},{...wClientBase,socketRpcAllowed:false},
  {...wClientBase,observedAt:'1050'}, {...wClientBase,production:true}]){
  wClient=x
  wDenied(wGate.review(wRequest()),'uid-client','cross-uid-client-untrusted','2.6W fake or same UID client denied')
}
check(wSocketCalls===beforeSocket,'2.6W invalid client never reaches socket trust')
wClient=wClientBase
const beforeRestart=wRestartCalls
for(const x of [null,false,[],{},
  {...wSocketBase,ownerUid:61002},{...wSocketBase,allowedUid:61003},
  {...wSocketBase,socketMode:438},{...wSocketBase,socketDirMode:493},
  {...wSocketBase,peerCredUidMatched:false},{...wSocketBase,otherUidDenied:false},
  {...wSocketBase,observedAt:1044},{...wSocketBase,unixTrusted:true}]){
  wSocket=x
  wDenied(wGate.review(wRequest()),'uid-socket','cross-uid-socket-untrusted','2.6W misbound socket ACL denied')
}
check(wRestartCalls===beforeRestart,'2.6W untrusted socket never reaches recovery')
wSocket=wSocketBase
for(const x of [null,false,[],{},
  {...wRestartBase,phase:'production-ready'},
  {...wRestartBase,ownerId:'other'},{...wRestartBase,leaderEpoch:0},
  {...wRestartBase,receiptHeadSha256:'a'.repeat(63)},
  {...wRestartBase,receiptReconciled:false},{...wRestartBase,staleWriterDenied:false},
  {...wRestartBase,observedAt:1044},{...wRestartBase,verifiedByHsm:true}]){
  wRestart=x
  wDenied(wGate.review(wRequest()),'uid-restart','cross-uid-restart-untrusted','2.6W bad restart observations denied')
}
wRestart=wRestartBase
for(const phase of ['crashed','reconciling'] as const){
  wRestart={...wRestartBase,phase}
  wDenied(wGate.review(wRequest()),'uid-restart','cross-uid-owner-not-running','2.6W owner fail-stop denies writes')
}
wRestart={...wRestartBase,leaderEpoch:2}
wDenied(wGate.review(wRequest()),'uid-restart','cross-uid-epoch-conflict','2.6W journal epoch mismatch denied')
wRestart=wRestartBase
const wBlock=reviewCrossUidMediationBlockers()
check(wBlock.allNineGapsOpen&&wBlock.parentMilestoneOpen&&wBlock.priorAdapterBlocked,
  '2.6W all G1-G9 parent milestone OPEN and adapter BLOCKED')
check(!wBlock.crossUidKernelEvidenceConsumedInTS&&!wBlock.productionMandatoryFencingVerified&&
  !wBlock.productionOsOwnershipConfigured&&!wBlock.productionSocketAclVerified&&
  !wBlock.privilegedRootBypassPrevented&&!wBlock.compromisedOwnerBypassPrevented&&
  !wBlock.distributedAtomicPromotionVerified&&!wBlock.fullAguiConformanceVerified&&
  !wBlock.enterpriseSecuritySignoff&&!wBlock.adapterReady,
  '2.6W no independent kernel or enterprise security evidence in TS')
check(wGate.review(wRequest()).status==='planned',
  '2.6W restored fixture preserves published 2.6V through 2.6J pure chain')
console.log(`ASSERTIONS: ${assertions}`)

// 2.6X: all kernel facts below are UNTRUSTED injected observations.
// Physical Linux evidence is collected independently by the Python runner.
const xOwnerBase:RuntimeOwnerFixture={kind:'fixture-hardened-owner',ownerId:'owner-A',
  ownerUid:61001,bootNonce:'boot-2',bootEpoch:2,noNewPrivs:true,effectiveCapsZero:true,
  boundingCapsZero:true,supplementaryGroupsEmpty:true,coreDumpsDisabled:true,
  dumpableDisabled:true,descriptorLimit:128,observedAt:1050,validThrough:1080}
const xSocketBase:RuntimeSocketFixture={kind:'fixture-supervised-socket',ownerId:'owner-A',
  bootNonce:'boot-2',socketInode:2002,socketDirMode:457,socketMode:432,
  peerUidMatched:true,outsiderDenied:true,staleSocketDenied:true,observedAt:1050}
const xRecoveryBase:RuntimeRecoveryFixture={kind:'fixture-supervisor-recovery',
  ownerId:'owner-A',bootEpoch:2,previousBootEpoch:1,previousSocketInode:1001,
  newSocketInode:2002,lostAckReconciled:true,duplicateCommitDenied:true,
  staleLeaderDenied:true,ownerRunning:true,observedAt:1050}
let xOwner:unknown=xOwnerBase,xSocket:unknown=xSocketBase,xRecovery:unknown=xRecoveryBase
let xOwnerCalls=0,xSocketCalls=0,xRecoveryCalls=0
const xAdapters={...wAdapters,
  readRuntimeOwnerFixture:(_ref:string):unknown=>{xOwnerCalls++;return xOwner},
  readRuntimeSocketFixture:(_ref:string):unknown=>{xSocketCalls++;return xSocket},
  readRuntimeRecoveryFixture:(_ref:string):unknown=>{xRecoveryCalls++;return xRecovery}}
const xGate=makeSelectedRuntimeHardeningGate(xAdapters)
const xRequest=()=>({...wRequest(),runtimeOwnerRef:'runtime-owner',runtimeSocketRef:'runtime-socket',
  runtimeRecoveryRef:'runtime-recovery'})
const xDenied=(value:RuntimeHardeningVerdict,stage:string,code:string,label:string):void=>{
  check(value.status==='blocked'&&value.stage===stage&&value.code===code,label)
  check(!value.realRuntimeAttestedInTS&&!value.productionUidLifecycleVerified&&
    !value.privilegedBypassPrevented&&!value.compromisedOwnerPrevented&&
    !value.serviceManagerConfigured&&!value.arbitraryCrashConsistencyVerified&&
    !value.externalFencingVerified&&!value.normativeAguiVerified&&
    !value.enterpriseSecuritySignoff&&!value.adapterReady&&value.exposedEvents===0,
    label+': no production permission or event exposure')
}
const xGood=xGate.review(xRequest())
check(xGood.status==='planned','2.6X published 2.6W through 2.6J chain composes after runtime checks')
if(xGood.status==='planned'){
  check(xGood.scope==='runtime-fixture-observations-only'&&xGood.plannedCommits===1,
    '2.6X remains a pure observation-only proposal')
  check(xGood.leaderEpoch===1&&xGood.producerId==='fixture-event-producer'&&xGood.tenantId==='tenant-A',
    '2.6X selected producer and published leader remain bound')
  check(!xGood.realRuntimeAttestedInTS&&!xGood.productionUidLifecycleVerified&&
    !xGood.compromisedOwnerPrevented&&!xGood.adapterReady,
    '2.6X never promotes a local fixture to production identity')
}
check(xOwnerCalls===1&&xSocketCalls===1&&xRecoveryCalls===1,
  '2.6X owner/socket/recovery observations read in strict order')
for(const v of [null,undefined,false,0,{},[],
  {...xRequest(),runtimeOwnerRef:'bad/path'}, {...xRequest(),runtimeSocketRef:''},
  {...xRequest(),runtimeRecoveryRef:'missing ref'}, {...xRequest(),mode:'resume'},
  {...xRequest(),intents:[]},{...xRequest(),isProductionTrusted:true},
  {...xRequest(),kernelResult:{euid:0}}])
  xDenied(xGate.review(v),'request','untrusted-runtime-request-shape',
    '2.6X invalid runtime request denied before any callbacks')
let beforeSocketCalls=xSocketCalls
for(const v of [null,[],{},false,
  {...xOwnerBase,ownerUid:0},{...xOwnerBase,ownerUid:61002},
  {...xOwnerBase,ownerId:'other/path'},{...xOwnerBase,bootNonce:'not a nonce'},
  {...xOwnerBase,bootEpoch:1},{...xOwnerBase,noNewPrivs:false},
  {...xOwnerBase,effectiveCapsZero:false},{...xOwnerBase,boundingCapsZero:false},
  {...xOwnerBase,supplementaryGroupsEmpty:false},{...xOwnerBase,coreDumpsDisabled:false},
  {...xOwnerBase,dumpableDisabled:false},{...xOwnerBase,descriptorLimit:1024},
  {...xOwnerBase,validThrough:'1080'},{...xOwnerBase,production:true}]){
  xOwner=v
  xDenied(xGate.review(xRequest()),'runtime-owner','untrusted-runtime-owner',
    '2.6X non-hardened or invented owner observation rejected')
}
check(xSocketCalls===beforeSocketCalls,'2.6X invalid owner never reads socket authority')
xOwner=xOwnerBase
for(const v of [{...xOwnerBase,observedAt:1051},{...xOwnerBase,observedAt:1044},
  {...xOwnerBase,validThrough:1050},{...xOwnerBase,validThrough:1081}]){
  xOwner=v
  xDenied(xGate.review(xRequest()),'runtime-owner','runtime-owner-stale',
    '2.6X stale owner snapshot denied')
}
xOwner=xOwnerBase
let beforeRecoveryCalls=xRecoveryCalls
for(const v of [null,[],{},false,
  {...xSocketBase,ownerId:'other'},{...xSocketBase,bootNonce:'boot-1'},
  {...xSocketBase,socketInode:0},{...xSocketBase,socketDirMode:493},
  {...xSocketBase,socketMode:438},{...xSocketBase,peerUidMatched:false},
  {...xSocketBase,outsiderDenied:false},{...xSocketBase,staleSocketDenied:false},
  {...xSocketBase,observedAt:1044},{...xSocketBase,verifiedByRoot:true}]){
  xSocket=v
  xDenied(xGate.review(xRequest()),'runtime-socket','untrusted-runtime-socket',
    '2.6X socket owner lifecycle mismatch denied')
}
check(xRecoveryCalls===beforeRecoveryCalls,'2.6X invalid socket never reaches recovery')
xSocket=xSocketBase
for(const v of [null,[],{},false,
  {...xRecoveryBase,ownerId:'other'},{...xRecoveryBase,bootEpoch:1},
  {...xRecoveryBase,previousBootEpoch:0},{...xRecoveryBase,previousSocketInode:2002},
  {...xRecoveryBase,newSocketInode:1001},{...xRecoveryBase,lostAckReconciled:false},
  {...xRecoveryBase,duplicateCommitDenied:false},{...xRecoveryBase,staleLeaderDenied:false},
  {...xRecoveryBase,ownerRunning:false},{...xRecoveryBase,observedAt:1044},
  {...xRecoveryBase,allFailuresSolved:true}]){
  xRecovery=v
  xDenied(xGate.review(xRequest()),'runtime-recovery','untrusted-runtime-recovery',
    '2.6X recovery/boot mismatch denied')
}
xRecovery=xRecoveryBase
const xBlockers=reviewRuntimeHardeningBlockers()
check(xBlockers.allNineGapsOpen&&xBlockers.parentMilestoneOpen&&xBlockers.priorAdapterBlocked,
  '2.6X G1-G9 and parent 2.6 OPEN; adapter BLOCKED')
check(!xBlockers.realKernelEvidenceConsumedInTS&&!xBlockers.productionUidLifecycleVerified&&
  !xBlockers.privilegedRootBypassPrevented&&!xBlockers.compromisedOwnerBypassPrevented&&
  !xBlockers.verifiedServiceManagerHardening&&!xBlockers.distributedAtomicPromotion&&
  !xBlockers.operationalIssuerAclVerified&&!xBlockers.independentNormativeAgui&&
  !xBlockers.mediaDlpApproved&&!xBlockers.enterpriseSecuritySignoff&&!xBlockers.adapterReady,
  '2.6X operational trust and integration boundaries remain BLOCKED')
// Injected snapshots can change before the upstream published gate: fail-closed.
wOwner={...wOwnerBase,ownerUid:0}
xDenied(xGate.review(xRequest()),'uid-owner','cross-uid-owner-untrusted',
  '2.6X published 2.6W UID checks still block bad upstream owner')
wOwner=wOwnerBase
check(xGate.review(xRequest()).status==='planned',
  '2.6X restores published 2.6W through 2.6J pure chain')
console.log(`ASSERTIONS: ${assertions}`)
