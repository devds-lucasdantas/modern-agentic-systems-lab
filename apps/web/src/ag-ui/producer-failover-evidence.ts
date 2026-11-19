/**
 * MASL 2.6R — selected producer authenticity and failover evidence CONTRACT.
 * Frozen AG-UI 1.0 @2330368a2a74573902858867072406638ba3073d.
 * Composes published 2.6Q (and its 2.6P/O/N/M/L/K/J pure review) using
 * callbacks supplied by a local TEST HARNESS. These are not cryptographic
 * signature checks, trusted producer identities, live distributed stores,
 * or an Agent Server adapter. Independent RS256/mTLS/SQLite experiments are
 * executed in Python and NEVER authorize a TypeScript callback.
 */
import {makeSelectedTransportReadinessGate,reviewTransportReadinessBlockers,
  type TransportReadinessFixtureAdapters} from './authenticated-transport-readiness'

type Rec=Record<string,unknown>
const rec=(x:unknown):x is Rec=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const exact=(x:Rec,k:readonly string[]):boolean=>
  Object.keys(x).length===k.length&&k.every(n=>Object.hasOwn(x,n))
const id=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(x)
const secs=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=2_000_000_000
const digest=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)
const PRODUCER=['kind','producerId','keyId','tenantId','threadId','runId','sequence',
  'payloadSha256','issuedAt','expiresAt','signatureRef'] as const
const REGISTRY=['kind','producerId','keyId','tenantId','allowedThreadIds','revocationEpoch',
  'active','lastCommittedSequence'] as const
const NODE=['kind','nodeId','region','storageId','observedAt','revocationEpoch','sharedCheckpoint'] as const
const RECEIPT=['kind','producerId','keyId','tenantId','threadId','runId','sequence',
  'payloadSha256','nodeId','storageId','committedRevision','observedAt'] as const

export type ProducerFixtureEnvelope=Readonly<{
  kind:'fixture-signed-envelope';producerId:string;keyId:string;tenantId:string;
  threadId:string;runId:string;sequence:number;payloadSha256:string;
  issuedAt:number;expiresAt:number;signatureRef:string
}>
export type ProducerFixtureRegistry=Readonly<{
  kind:'fixture-producer-registry';producerId:string;keyId:string;tenantId:string;
  allowedThreadIds:readonly string[];revocationEpoch:number;active:boolean;
  lastCommittedSequence:number
}>
export type FailoverFixtureNode=Readonly<{
  kind:'fixture-shared-sqlite-node';nodeId:string;region:'loopback-test-only';
  storageId:string;observedAt:number;revocationEpoch:number;sharedCheckpoint:true
}>
export type FailoverFixtureReceipt=Readonly<{
  kind:'fixture-failover-receipt';producerId:string;keyId:string;tenantId:string;
  threadId:string;runId:string;sequence:number;payloadSha256:string;
  nodeId:string;storageId:string;committedRevision:number;observedAt:number
}>
export interface ProducerFailoverFixtureAdapters extends TransportReadinessFixtureAdapters{
  readonly signedProducerEnvelopeFixture:(producerRef:string,threadId:string,runId:string)=>unknown
  readonly producerRegistryFixture:(producerId:string)=>unknown
  readonly failoverNodeFixture:(nodeRef:string)=>unknown
  readonly failoverReceiptFixture:(tenantId:string,threadId:string,runId:string)=>unknown
}
export type FailoverVerdict=
  | Readonly<{status:'planned'|'reconciled';scope:'offline-signed-producer-shared-sqlite-fixture-only';
      producerId:string;nodeId:string;tenantId:string;threadId:string;runId:string;
      receiptReconciled:boolean;plannedCommits:number;exposedEvents:0;
      realProducerSignatureVerified:false;realNodeIdentityVerified:false;
      distributedStorageVerified:false;operationalFailoverVerified:false;
      independentSecurityReview:false;adapterReady:false}>
  | Readonly<{status:'blocked';stage:'request'|'producer'|'registry'|'node'|'published-2.6Q'|'receipt';
      code:string;exposedEvents:0;realProducerSignatureVerified:false;
      realNodeIdentityVerified:false;distributedStorageVerified:false;
      operationalFailoverVerified:false;independentSecurityReview:false;adapterReady:false}>

/** The request chooses only opaque locators, not authority, keys, producer, or receipts. */
export function makeSelectedProducerFailoverGate(adapters:ProducerFailoverFixtureAdapters){
  const blocked=(stage:Extract<FailoverVerdict,{status:'blocked'}>['stage'],code:string):FailoverVerdict=>({
    status:'blocked',stage,code,exposedEvents:0,realProducerSignatureVerified:false,
    realNodeIdentityVerified:false,distributedStorageVerified:false,
    operationalFailoverVerified:false,independentSecurityReview:false,adapterReady:false,
  })
  return Object.freeze({review:(input:unknown):FailoverVerdict=>{
    if(!rec(input)||!exact(input,['channelRef','mode','credentialRef','intents','producerRef','nodeRef'])||
       !id(input.channelRef)||!id(input.credentialRef)||!id(input.producerRef)||!id(input.nodeRef)||
       (input.mode!=='propose'&&input.mode!=='reconcile')||!Array.isArray(input.intents)||
       input.intents.length!==1||!rec(input.intents[0])||
       !id(input.intents[0].threadId)||!id(input.intents[0].runId))
      return blocked('request','untrusted-failover-request-shape')
    const intent=input.intents[0]
    let envelope:unknown,now:unknown
    try { now=adapters.clockSeconds()
      envelope=adapters.signedProducerEnvelopeFixture(input.producerRef,intent.threadId as string,intent.runId as string)
    } catch{return blocked('producer','producer-proof-service-unavailable')}
    if(!secs(now))return blocked('producer','invalid-fixture-clock')
    if(!rec(envelope)||!exact(envelope,PRODUCER)||envelope.kind!=='fixture-signed-envelope'||
       !id(envelope.producerId)||!id(envelope.keyId)||!id(envelope.tenantId)||
       envelope.threadId!==intent.threadId||envelope.runId!==intent.runId||
       !secs(envelope.sequence)||envelope.sequence===0||!digest(envelope.payloadSha256)||
       !secs(envelope.issuedAt)||!secs(envelope.expiresAt)||!id(envelope.signatureRef))
      return blocked('producer','fixture-producer-envelope-unverifiable')
    const signed=envelope as ProducerFixtureEnvelope
    if(signed.issuedAt>(now as number)||signed.expiresAt<=(now as number)||
       signed.expiresAt<=signed.issuedAt||signed.expiresAt-signed.issuedAt>120)
      return blocked('producer','fixture-producer-envelope-expired')
    let registry:unknown
    try{registry=adapters.producerRegistryFixture(signed.producerId)}
    catch{return blocked('registry','producer-registry-unavailable')}
    if(!rec(registry)||!exact(registry,REGISTRY)||registry.kind!=='fixture-producer-registry'||
       registry.producerId!==signed.producerId||registry.keyId!==signed.keyId||
       registry.tenantId!==signed.tenantId||registry.active!==true||
       !Array.isArray(registry.allowedThreadIds)||registry.allowedThreadIds.length<1||
       registry.allowedThreadIds.length>16||!registry.allowedThreadIds.every(id)||
       new Set(registry.allowedThreadIds).size!==registry.allowedThreadIds.length||
       !secs(registry.revocationEpoch)||!secs(registry.lastCommittedSequence)||
       !registry.allowedThreadIds.includes(signed.threadId))
      return blocked('registry','fixture-producer-registry-denied')
    const registered=registry as ProducerFixtureRegistry
    if(signed.sequence<registered.lastCommittedSequence||
       (input.mode==='propose'&&signed.sequence<=registered.lastCommittedSequence))
      return blocked('registry','producer-sequence-stale')
    let node:unknown
    try{node=adapters.failoverNodeFixture(input.nodeRef)}
    catch{return blocked('node','fixture-node-unavailable')}
    if(!rec(node)||!exact(node,NODE)||node.kind!=='fixture-shared-sqlite-node'||
       !id(node.nodeId)||node.region!=='loopback-test-only'||!id(node.storageId)||
       !secs(node.observedAt)||node.observedAt!==now||
       node.revocationEpoch!==registered.revocationEpoch||node.sharedCheckpoint!==true)
      return blocked('node','fixture-node-state-untrusted')
    const target=node as FailoverFixtureNode
    // Reuse the published 2.6Q contract; no direct bypass of its fixture guards.
    const previous=makeSelectedTransportReadinessGate(adapters).review({
      channelRef:input.channelRef,mode:input.mode,credentialRef:input.credentialRef,
      intents:input.intents,
    })
    if(previous.status==='blocked')return blocked('published-2.6Q','published-2.6Q:'+previous.code)
    if(previous.tenantId!==signed.tenantId)
      return blocked('published-2.6Q','producer-tenant-not-bound-to-published-principal')
    if(input.mode==='reconcile'){
      if(previous.status!=='reconciled')return blocked('receipt','published-replay-not-reconciled')
      let receipt:unknown
      try{receipt=adapters.failoverReceiptFixture(signed.tenantId,signed.threadId,signed.runId)}
      catch{return blocked('receipt','fixture-failover-receipt-unavailable')}
      if(!rec(receipt)||!exact(receipt,RECEIPT)||receipt.kind!=='fixture-failover-receipt'||
         receipt.producerId!==signed.producerId||receipt.keyId!==signed.keyId||
         receipt.tenantId!==signed.tenantId||receipt.threadId!==signed.threadId||
         receipt.runId!==signed.runId||receipt.sequence!==signed.sequence||
         receipt.payloadSha256!==signed.payloadSha256||
         !id(receipt.nodeId)||receipt.storageId!==target.storageId||
         !secs(receipt.committedRevision)||receipt.committedRevision<1||receipt.observedAt!==now)
        return blocked('receipt','fixture-failover-receipt-unbound')
      return {status:'reconciled',scope:'offline-signed-producer-shared-sqlite-fixture-only',
        producerId:signed.producerId,nodeId:target.nodeId,tenantId:signed.tenantId,
        threadId:signed.threadId,runId:signed.runId,receiptReconciled:true,plannedCommits:0,
        exposedEvents:0,realProducerSignatureVerified:false,realNodeIdentityVerified:false,
        distributedStorageVerified:false,operationalFailoverVerified:false,
        independentSecurityReview:false,adapterReady:false}
    }
    return {status:'planned',scope:'offline-signed-producer-shared-sqlite-fixture-only',
      producerId:signed.producerId,nodeId:target.nodeId,tenantId:signed.tenantId,
      threadId:signed.threadId,runId:signed.runId,receiptReconciled:false,
      plannedCommits:previous.plannedCommits,exposedEvents:0,
      realProducerSignatureVerified:false,realNodeIdentityVerified:false,
      distributedStorageVerified:false,operationalFailoverVerified:false,
      independentSecurityReview:false,adapterReady:false}
  }})
}

export function reviewProducerFailoverBlockers(){
  const old=reviewTransportReadinessBlockers()
  return Object.freeze({
    allNineGapsOpen:old.allNineGapsOpen,parentMilestoneOpen:old.parentMilestoneOpen,
    priorAdapterBlocked:old.priorAdapterBlocked,
    actualProducerIdentityVerifiedInTS:false as const,
    verifiedEventSignatureInTS:false as const,
    realProducerPolicyEnforced:false as const,
    independentNodeAttestationVerified:false as const,
    distributedCheckpointReplicated:false as const,
    failoverAfterActualNodeCrashVerified:false as const,
    externalRevocationFreshnessVerified:false as const,
    aguiEndToEndConformanceVerified:false as const,
    independentSecurityReview:false as const,adapterReady:false as const,
    scope:'pure-fixture-composition-plus-separate-mtls-rs256-shared-sqlite-experiment' as const,
  })
}
