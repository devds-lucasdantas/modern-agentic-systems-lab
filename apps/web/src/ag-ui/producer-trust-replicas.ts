/**
 * MASL 2.6S — selected producer-root and two-INDEPENDENT-store replica gate.
 * Frozen AG-UI 1.0 @2330368a2a74573902858867072406638ba3073d.
 * All inputs come from injected TEST HARNESS callbacks, NOT verified crypto,
 * production identity, a consensus protocol, durable replication or AG-UI runtime.
 * Composes published 2.6R pure producer-failover gate without bypass.
 * Separate Python fixture checks offline RS256 roots and physically separate SQLite.
 */
import {makeSelectedProducerFailoverGate,reviewProducerFailoverBlockers,
  type ProducerFailoverFixtureAdapters} from './producer-failover-evidence'

type Rec=Record<string,unknown>
const rec=(v:unknown):v is Rec=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Rec,fields:readonly string[]):boolean=>
  Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k))
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v)
const num=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2_000_000_000
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const ROOT=['kind','rootId','producerId','keyId','generation','revocationEpoch','active',
  'observedAt','validThrough'] as const
const REPLICA=['kind','replicaId','storageId','producerId','tenantId','threadId','runId',
  'sequence','revision','revocationEpoch','leaderEpoch','receiptSha256','observedAt'] as const
const SET=['kind','primary','standby','leaderEpoch','observedAt'] as const

export type FixtureProducerRoot=Readonly<{kind:'fixture-producer-root-snapshot';rootId:string;
  producerId:string;keyId:string;generation:number;revocationEpoch:number;
  active:boolean;observedAt:number;validThrough:number}>
export type FixtureReplica=Readonly<{kind:'fixture-independent-sqlite-replica';replicaId:string;
  storageId:string;producerId:string;tenantId:string;threadId:string;runId:string;
  sequence:number;revision:number;revocationEpoch:number;leaderEpoch:number;
  receiptSha256:string;observedAt:number}>
export type FixtureReplicaSet=Readonly<{kind:'fixture-replica-set';primary:FixtureReplica;
  standby:FixtureReplica;leaderEpoch:number;observedAt:number}>
export interface ProducerTrustReplicaAdapters extends ProducerFailoverFixtureAdapters{
  readonly readProducerRootFixture:(ref:string)=>unknown
  readonly readReplicaSetFixture:(ref:string,thread:string,run:string)=>unknown
}
export type ReplicaGateVerdict=Readonly<{
  status:'planned'|'reconciled';scope:'offline-independent-replica-fixture-only';
  producerId:string;tenantId:string;threadId:string;runId:string;
  replicaCount:2;leaderEpoch:number;plannedCommits:number;receiptReconciled:boolean;
  exposedEvents:0;externalRootAuthenticated:false;replicationProtocolProven:false;
  consensusOrQuorumProven:false;productionDurabilityProven:false;
  realProducerVerified:false;adapterReady:false
}>|Readonly<{
  status:'blocked';stage:'request'|'trust-root'|'replicas'|'published-2.6R';code:string;
  exposedEvents:0;externalRootAuthenticated:false;replicationProtocolProven:false;
  consensusOrQuorumProven:false;productionDurabilityProven:false;
  realProducerVerified:false;adapterReady:false
}>

/** Require two independent, in-sync, fresh fixture snapshots BEFORE invoking R.
 * Neither a matching receipt nor a signatureRef is a production attestation.
 */
export function makeSelectedProducerReplicaGate(adapters:ProducerTrustReplicaAdapters){
  const blocked=(stage:Extract<ReplicaGateVerdict,{status:'blocked'}>['stage'],code:string):ReplicaGateVerdict=>
    ({status:'blocked',stage,code,exposedEvents:0,externalRootAuthenticated:false,
      replicationProtocolProven:false,consensusOrQuorumProven:false,
      productionDurabilityProven:false,realProducerVerified:false,adapterReady:false})
  return Object.freeze({review:(input:unknown):ReplicaGateVerdict=>{
    if(!rec(input)||!exact(input,['channelRef','mode','credentialRef','intents',
      'producerRef','nodeRef','rootRef','replicaSetRef'])||
      !id(input.channelRef)||!id(input.credentialRef)||!id(input.producerRef)||
      !id(input.nodeRef)||!id(input.rootRef)||!id(input.replicaSetRef)||
      (input.mode!=='propose'&&input.mode!=='reconcile')||!Array.isArray(input.intents)||
      input.intents.length!==1||!rec(input.intents[0])||
      !id(input.intents[0].threadId)||!id(input.intents[0].runId))
      return blocked('request','untrusted-replica-request-shape')
    const intent=input.intents[0]
    let now:unknown,rawRoot:unknown
    try{now=adapters.clockSeconds();rawRoot=adapters.readProducerRootFixture(input.rootRef)}
    catch{return blocked('trust-root','fixture-trust-root-unavailable')}
    if(!num(now))return blocked('trust-root','fixture-time-invalid')
    if(!rec(rawRoot)||!exact(rawRoot,ROOT)||rawRoot.kind!=='fixture-producer-root-snapshot'||
       rawRoot.rootId!=='fixture-independent-pinned-root'||!id(rawRoot.producerId)||
       !id(rawRoot.keyId)||!num(rawRoot.generation)||rawRoot.generation<1||
       !num(rawRoot.revocationEpoch)||rawRoot.active!==true||
       !num(rawRoot.observedAt)||!num(rawRoot.validThrough))
      return blocked('trust-root','fixture-producer-root-invalid')
    const root=rawRoot as FixtureProducerRoot
    const t=now as number
    if(root.observedAt>t||t-root.observedAt>10||root.validThrough<=t||
       root.validThrough-root.observedAt>60)
      return blocked('trust-root','fixture-producer-root-stale')
    let rawSet:unknown
    try{rawSet=adapters.readReplicaSetFixture(input.replicaSetRef,intent.threadId as string,
      intent.runId as string)}
    catch{return blocked('replicas','fixture-replica-service-unavailable')}
    if(!rec(rawSet)||!exact(rawSet,SET)||rawSet.kind!=='fixture-replica-set'||
       !num(rawSet.leaderEpoch)||rawSet.leaderEpoch<1||rawSet.observedAt!==t||
       !rec(rawSet.primary)||!rec(rawSet.standby))
      return blocked('replicas','fixture-replica-set-invalid')
    const entries=[rawSet.primary,rawSet.standby]
    for(const r of entries){
      if(!rec(r)||!exact(r,REPLICA)||r.kind!=='fixture-independent-sqlite-replica'||
         !id(r.replicaId)||!id(r.storageId)||r.producerId!==root.producerId||
         !id(r.tenantId)||r.threadId!==intent.threadId||r.runId!==intent.runId||
         !num(r.sequence)||!num(r.revision)||r.revocationEpoch!==root.revocationEpoch||
         r.leaderEpoch!==rawSet.leaderEpoch||!hex(r.receiptSha256)||r.observedAt!==t)
        return blocked('replicas','fixture-replica-record-untrusted')
    }
    const primary=entries[0] as FixtureReplica,standby=entries[1] as FixtureReplica
    if(primary.replicaId===standby.replicaId||primary.storageId===standby.storageId)
      return blocked('replicas','fixture-not-independent-stores')
    if(primary.tenantId!==standby.tenantId||primary.sequence!==standby.sequence||
       primary.revision!==standby.revision||primary.receiptSha256!==standby.receiptSha256)
      return blocked('replicas','fixture-replica-divergence')
    // The published R gate still validates producer registry, envelope, node and
    // the entire Q/P/O/N/M/L/K/J fixture contract chain.
    const prior=makeSelectedProducerFailoverGate(adapters).review({
      channelRef:input.channelRef,mode:input.mode,credentialRef:input.credentialRef,
      intents:input.intents,producerRef:input.producerRef,nodeRef:input.nodeRef,
    })
    if(prior.status==='blocked')
      return blocked('published-2.6R','published-2.6R:'+prior.code)
    if(prior.producerId!==root.producerId||prior.tenantId!==primary.tenantId||
       prior.threadId!==primary.threadId||prior.runId!==primary.runId)
      return blocked('published-2.6R','fixture-producer-or-tenant-unbound')
    if(input.mode==='reconcile'&&prior.status!=='reconciled')
      return blocked('published-2.6R','reconciliation-not-confirmed-by-prior-gate')
    return {status:prior.status,scope:'offline-independent-replica-fixture-only',
      producerId:prior.producerId,tenantId:prior.tenantId,threadId:prior.threadId,
      runId:prior.runId,replicaCount:2,leaderEpoch:rawSet.leaderEpoch as number,
      plannedCommits:prior.plannedCommits,receiptReconciled:prior.receiptReconciled,
      exposedEvents:0,externalRootAuthenticated:false,replicationProtocolProven:false,
      consensusOrQuorumProven:false,productionDurabilityProven:false,
      realProducerVerified:false,adapterReady:false}
  }})
}

export function reviewProducerReplicaBlockers(){
  const prior=reviewProducerFailoverBlockers()
  return Object.freeze({
    allNineGapsOpen:prior.allNineGapsOpen,parentMilestoneOpen:prior.parentMilestoneOpen,
    priorAdapterBlocked:prior.priorAdapterBlocked,
    independentOperationalRootVerified:false as const,
    producerEnrollmentOrRotationVerified:false as const,
    distributedReplicationVerified:false as const,
    authenticatedReplicaNetworkVerified:false as const,
    splitBrainFencingProductionVerified:false as const,
    externalRevocationSlaVerified:false as const,
    independentMediaDlpReview:false as const,
    endToEndAguiConformanceVerified:false as const,
    independentSecurityApproval:false as const,
    adapterReady:false as const,
    scope:'pure-TS-fixtures-and-separate-two-sqlite-local-process-experiment' as const,
  })
}
