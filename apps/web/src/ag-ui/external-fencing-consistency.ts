/**
 * MASL 2.6T: purely synthetic external fencing-authority gate, composed AFTER
 * published 2.6S -> R/Q/P/O/N/M/L/K/J. No JWT, TLS, RS256 or database access
 * occurs in this module: callback data is test harness, not real authority.
 * A separate Python fixture demonstrates a third SQLite authority file that
 * serializes local writer admission and epoch change across TWO SQLite replicas.
 * This is NOT quorum, network independent coordination, or production fencing.
 */
import {makeSelectedProducerReplicaGate,reviewProducerReplicaBlockers,
  type ProducerTrustReplicaAdapters,type FixtureReplicaSet} from './producer-trust-replicas'

type Rec=Record<string,unknown>
const rec=(v:unknown):v is Rec=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Rec,k:readonly string[]):boolean=>Object.keys(v).length===k.length&&k.every(f=>Object.hasOwn(v,f))
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v)
const sec=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2_000_000_000
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const AUTH=['kind','authorityId','storageId','leaderId','leaderEpoch',
  'revocationEpoch','receiptHeadSha256','observedAt','validThrough'] as const
const TICKET=['kind','authorityId','leaderId','leaderEpoch','tenantId','threadId',
  'runId','fencingId','issuedAt','expiresAt'] as const
const R=['kind','replicaId','storageId','producerId','tenantId','threadId','runId',
  'sequence','revision','revocationEpoch','leaderEpoch','receiptSha256','observedAt'] as const
export type FixtureAuthority=Readonly<{kind:'fixture-third-store-authority';authorityId:string;
  storageId:string;leaderId:string;leaderEpoch:number;revocationEpoch:number;
  receiptHeadSha256:string;observedAt:number;validThrough:number}>
export type FixtureFencingTicket=Readonly<{kind:'fixture-fencing-ticket';authorityId:string;
  leaderId:string;leaderEpoch:number;tenantId:string;threadId:string;runId:string;
  fencingId:string;issuedAt:number;expiresAt:number}>
export interface FencingFixtureAdapters extends ProducerTrustReplicaAdapters{
  readonly readExternalAuthorityFixture:(ref:string)=>unknown
  readonly readFencingTicketFixture:(ref:string)=>unknown
}
export type FencingVerdict=
 | Readonly<{status:'planned'|'reconciled';scope:'offline-third-sqlite-fencing-fixture-only';
     producerId:string;tenantId:string;leaderEpoch:number;plannedCommits:number;
     receiptReconciled:boolean;exposedEvents:0;externalFencingVerified:false;
     replicatedConsistencyVerified:false;authoritativeServiceVerified:false;
     staleWriterProductionBlocked:false;adapterReady:false}>
 | Readonly<{status:'blocked';stage:'request'|'authority'|'ticket'|'replicas'|'published-2.6S';
     code:string;exposedEvents:0;externalFencingVerified:false;
     replicatedConsistencyVerified:false;authoritativeServiceVerified:false;
     staleWriterProductionBlocked:false;adapterReady:false}>

export function makeSelectedExternalFencingGate(adapters:FencingFixtureAdapters){
  const block=(stage:Extract<FencingVerdict,{status:'blocked'}>['stage'],code:string):FencingVerdict=>
    ({status:'blocked',stage,code,exposedEvents:0,externalFencingVerified:false,
      replicatedConsistencyVerified:false,authoritativeServiceVerified:false,
      staleWriterProductionBlocked:false,adapterReady:false})
  return Object.freeze({review:(input:unknown):FencingVerdict=>{
    if(!rec(input)||!exact(input,['channelRef','mode','credentialRef','intents',
        'producerRef','nodeRef','rootRef','replicaSetRef','authorityRef','fencingRef'])||
       !id(input.channelRef)||!id(input.credentialRef)||!id(input.producerRef)||
       !id(input.nodeRef)||!id(input.rootRef)||!id(input.replicaSetRef)||
       !id(input.authorityRef)||!id(input.fencingRef)||
       (input.mode!=='propose'&&input.mode!=='reconcile')||
       !Array.isArray(input.intents)||input.intents.length!==1||
       !rec(input.intents[0])||!id(input.intents[0].threadId)||!id(input.intents[0].runId))
      return block('request','untrusted-fencing-request-shape')
    const intent=input.intents[0]
    let now:unknown,rawAuthority:unknown
    try{now=adapters.clockSeconds();rawAuthority=adapters.readExternalAuthorityFixture(input.authorityRef)}
    catch{return block('authority','fixture-authority-unavailable')}
    if(!sec(now))return block('authority','fixture-authority-clock-invalid')
    if(!rec(rawAuthority)||!exact(rawAuthority,AUTH)||
       rawAuthority.kind!=='fixture-third-store-authority'||
       rawAuthority.authorityId!=='fixture-fencing-authority'||!id(rawAuthority.storageId)||
       !id(rawAuthority.leaderId)||!sec(rawAuthority.leaderEpoch)||rawAuthority.leaderEpoch<1||
       !sec(rawAuthority.revocationEpoch)||!hex(rawAuthority.receiptHeadSha256)||
       !sec(rawAuthority.observedAt)||!sec(rawAuthority.validThrough))
      return block('authority','fixture-authority-untrusted')
    const authority=rawAuthority as FixtureAuthority
    const t=now as number
    if(authority.observedAt>t||t-authority.observedAt>5||
       authority.validThrough<=t||authority.validThrough-authority.observedAt>30)
      return block('authority','fixture-authority-stale')
    let rawTicket:unknown
    try{rawTicket=adapters.readFencingTicketFixture(input.fencingRef)}
    catch{return block('ticket','fixture-fencing-ticket-unavailable')}
    if(!rec(rawTicket)||!exact(rawTicket,TICKET)||
       rawTicket.kind!=='fixture-fencing-ticket'||
       rawTicket.authorityId!==authority.authorityId||
       rawTicket.leaderId!==authority.leaderId||
       rawTicket.leaderEpoch!==authority.leaderEpoch||
       rawTicket.threadId!==intent.threadId||rawTicket.runId!==intent.runId||
       !id(rawTicket.tenantId)||!id(rawTicket.fencingId)||
       !sec(rawTicket.issuedAt)||!sec(rawTicket.expiresAt))
      return block('ticket','fixture-fencing-ticket-misbound')
    const ticket=rawTicket as FixtureFencingTicket
    if(ticket.issuedAt>t||t-ticket.issuedAt>5||ticket.expiresAt<=t||
       ticket.expiresAt<=ticket.issuedAt||ticket.expiresAt-ticket.issuedAt>30)
      return block('ticket','fixture-fencing-ticket-expired')
    let copies:unknown
    try{copies=adapters.readReplicaSetFixture(input.replicaSetRef,intent.threadId as string,
      intent.runId as string)}
    catch{return block('replicas','fixture-replica-read-unavailable')}
    if(!rec(copies)||!rec(copies.primary)||!rec(copies.standby)||
       !exact(copies.primary,R)||!exact(copies.standby,R))
      return block('replicas','fixture-replica-state-invalid')
    const left=copies.primary,right=copies.standby
    if(authority.storageId===left.storageId||authority.storageId===right.storageId||
       authority.leaderId!==left.replicaId||
       authority.leaderEpoch!==copies.leaderEpoch||
       authority.leaderEpoch!==left.leaderEpoch||
       authority.leaderEpoch!==right.leaderEpoch||
       left.tenantId!==ticket.tenantId||right.tenantId!==ticket.tenantId||
       authority.revocationEpoch!==left.revocationEpoch||
       authority.revocationEpoch!==right.revocationEpoch||
       left.receiptSha256!==authority.receiptHeadSha256||
       right.receiptSha256!==authority.receiptHeadSha256)
      return block('replicas','fixture-authority-replica-divergence')
    // The published 2.6S still applies every earlier pure gate; a cached replica
    // snapshot avoids a second, possibly inconsistent callback invocation.
    const prior=makeSelectedProducerReplicaGate({
      ...adapters,readReplicaSetFixture:()=>copies as FixtureReplicaSet,
    }).review({channelRef:input.channelRef,mode:input.mode,
      credentialRef:input.credentialRef,intents:input.intents,
      producerRef:input.producerRef,nodeRef:input.nodeRef,
      rootRef:input.rootRef,replicaSetRef:input.replicaSetRef})
    if(prior.status==='blocked')return block('published-2.6S','published-2.6S:'+prior.code)
    if(prior.tenantId!==ticket.tenantId||prior.leaderEpoch!==authority.leaderEpoch)
      return block('published-2.6S','fixture-prior-authority-conflict')
    return {status:prior.status,scope:'offline-third-sqlite-fencing-fixture-only',
      producerId:prior.producerId,tenantId:prior.tenantId,
      leaderEpoch:prior.leaderEpoch,plannedCommits:prior.plannedCommits,
      receiptReconciled:prior.receiptReconciled,exposedEvents:0,
      externalFencingVerified:false,replicatedConsistencyVerified:false,
      authoritativeServiceVerified:false,staleWriterProductionBlocked:false,adapterReady:false}
  }})
}
export function reviewExternalFencingBlockers(){
  const prior=reviewProducerReplicaBlockers()
  return Object.freeze({
    allNineGapsOpen:prior.allNineGapsOpen,parentMilestoneOpen:prior.parentMilestoneOpen,
    priorAdapterBlocked:prior.priorAdapterBlocked,
    productionFencingAuthorityAuthenticated:false as const,
    quorumOrConsensusProven:false as const,
    crossHostFencingAvailabilityProven:false as const,
    transactionalDistributedPromotionProven:false as const,
    realProducerTrustVerified:false as const,
    revocationDistributionProven:false as const,
    aguiFullConformanceProven:false as const,
    mediaDlpSecuritySignedOff:false as const,
    adapterReady:false as const,
    scope:'separate-offline-third-store-authority-plus-pure-callback-fixture' as const,
  })
}
