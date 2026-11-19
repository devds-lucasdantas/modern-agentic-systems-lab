/**
 * MASL 2.6U — isolated mandatory-fencing and crash-recovery *readiness* contract.
 * All callbacks are synthetic, NOT operational storage/identity/cryptographic evidence.
 * The separate Python experiment uses a confined SQLite broker and durable intent
 * journal; a same-UID arbitrary file writer can bypass it. No general mandatory
 * fencing, cross-store atomicity, consensus or security approval is established.
 * Composes the published 2.6T -> 2.6J pure gates without exposing event bytes.
 */
import {makeSelectedExternalFencingGate,reviewExternalFencingBlockers,
  type FencingFixtureAdapters,type FencingVerdict} from './external-fencing-consistency'

type Rec=Record<string,unknown>
const obj=(v:unknown):v is Rec=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Rec,k:readonly string[])=>Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x))
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v)
const sec=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2_000_000_000
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)
const B=['kind','brokerId','storageId','enforcement','scope','observedAt','validThrough'] as const
const J=['kind','authorityId','phase','leaderId','leaderEpoch','receiptSha256',
  'operationId','observedAt'] as const
export type FixtureBroker=Readonly<{
  kind:'fixture-sqlite-writer-broker';brokerId:string;storageId:string;
  enforcement:'connection-authorizer-only';scope:'test-broker-connections-only';
  observedAt:number;validThrough:number
}>
export type FixtureJournal=Readonly<{
  kind:'fixture-promotion-journal';authorityId:'fixture-fencing-authority';
  phase:'stable'|'prepared'|'replica-applied'|'recovery-blocked';
  leaderId:string;leaderEpoch:number;receiptSha256:string;
  operationId:string;observedAt:number
}>
export interface MandatoryFencingFixtureAdapters extends FencingFixtureAdapters {
  readonly readBrokerFixture:(ref:string)=>unknown
  readonly readPromotionJournalFixture:(ref:string)=>unknown
}
export type MandatoryVerdict=
 | Readonly<{status:'planned'|'reconciled';scope:'isolated-broker-and-journal-readiness-only';
   producerId:string;tenantId:string;leaderEpoch:number;plannedCommits:number;
   receiptReconciled:boolean;exposedEvents:0;
   externalFencingVerified:false;replicatedConsistencyVerified:false;
   authoritativeServiceVerified:false;staleWriterProductionBlocked:false;
   universalStorageFencingVerified:false;crashAtomicPromotionVerified:false;
   independentStorageAuthorityVerified:false;adapterReady:false}>
 | Readonly<{status:'blocked';stage:'request'|'broker'|'journal'|'published-2.6T'|
     'authority'|'ticket'|'replicas'|'published-2.6S';code:string;
   exposedEvents:0;externalFencingVerified:false;replicatedConsistencyVerified:false;
   authoritativeServiceVerified:false;staleWriterProductionBlocked:false;
   universalStorageFencingVerified:false;crashAtomicPromotionVerified:false;
   independentStorageAuthorityVerified:false;adapterReady:false}>
export function makeSelectedMandatoryFencingGate(adapters:MandatoryFencingFixtureAdapters){
  const deny=(stage:Extract<MandatoryVerdict,{status:'blocked'}>['stage'],code:string):MandatoryVerdict=>
    ({status:'blocked',stage,code,exposedEvents:0,externalFencingVerified:false,
      replicatedConsistencyVerified:false,authoritativeServiceVerified:false,
      staleWriterProductionBlocked:false,universalStorageFencingVerified:false,
      crashAtomicPromotionVerified:false,independentStorageAuthorityVerified:false,
      adapterReady:false})
  return Object.freeze({review:(request:unknown):MandatoryVerdict=>{
    const fields=['channelRef','mode','credentialRef','intents','producerRef','nodeRef',
      'rootRef','replicaSetRef','authorityRef','fencingRef','brokerRef','journalRef']
    if(!obj(request)||!exact(request,fields)||
       !fields.filter(f=>f!=='intents'&&f!=='mode').every(f=>id(request[f]))||
       (request.mode!=='propose'&&request.mode!=='reconcile')||
       !Array.isArray(request.intents)||request.intents.length!==1||
       !obj(request.intents[0])||!id(request.intents[0].threadId)||!id(request.intents[0].runId))
      return deny('request','untrusted-broker-request-shape')
    let b:unknown,j:unknown,now:unknown
    try{now=adapters.clockSeconds();b=adapters.readBrokerFixture(request.brokerRef as string)}
    catch{return deny('broker','fixture-broker-unavailable')}
    if(!sec(now))return deny('broker','fixture-clock-invalid')
    if(!obj(b)||!exact(b,B)||b.kind!=='fixture-sqlite-writer-broker'||
       !id(b.brokerId)||!id(b.storageId)||
       b.enforcement!=='connection-authorizer-only'||
       b.scope!=='test-broker-connections-only'||
       !sec(b.observedAt)||!sec(b.validThrough))
      return deny('broker','fixture-broker-untrusted')
    if(b.observedAt>now||now-b.observedAt>5||b.validThrough<=now||
       b.validThrough-b.observedAt>30)
      return deny('broker','fixture-broker-stale')
    try{j=adapters.readPromotionJournalFixture(request.journalRef as string)}
    catch{return deny('journal','fixture-journal-unavailable')}
    if(!obj(j)||!exact(j,J)||j.kind!=='fixture-promotion-journal'||
       j.authorityId!=='fixture-fencing-authority'||!id(j.leaderId)||
       !sec(j.leaderEpoch)||j.leaderEpoch<1||!hex(j.receiptSha256)||
       !id(j.operationId)||!sec(j.observedAt)||j.observedAt>now||
       now-j.observedAt>5||
       !['stable','prepared','replica-applied','recovery-blocked'].includes(String(j.phase)))
      return deny('journal','fixture-journal-invalid')
    if(j.phase!=='stable')return deny('journal','fixture-promotion-pending-fail-closed')
    // A stable journal observation remains a fixture. Every published 2.6T
    // authority/ticket/replica and producer/issuer gate must independently pass.
    const {brokerRef:_broker,journalRef:_journal,...priorInput}=request
    void _broker;void _journal
    let prior:FencingVerdict
    try{prior=makeSelectedExternalFencingGate(adapters).review(priorInput)}
    catch{return deny('published-2.6T','fixture-published-gate-unavailable')}
    if(prior.status==='blocked')return deny(prior.stage,prior.code)
    if(prior.leaderEpoch!==j.leaderEpoch||prior.leaderEpoch<1)
      return deny('journal','fixture-journal-epoch-conflict')
    return {status:prior.status,scope:'isolated-broker-and-journal-readiness-only',
      producerId:prior.producerId,tenantId:prior.tenantId,
      leaderEpoch:prior.leaderEpoch,plannedCommits:prior.plannedCommits,
      receiptReconciled:prior.receiptReconciled,exposedEvents:0,
      externalFencingVerified:false,replicatedConsistencyVerified:false,
      authoritativeServiceVerified:false,staleWriterProductionBlocked:false,
      universalStorageFencingVerified:false,crashAtomicPromotionVerified:false,
      independentStorageAuthorityVerified:false,adapterReady:false}
  }})
}
export function reviewMandatoryFencingBlockers(){
  const prior=reviewExternalFencingBlockers()
  return Object.freeze({allNineGapsOpen:prior.allNineGapsOpen,
    parentMilestoneOpen:prior.parentMilestoneOpen,priorAdapterBlocked:prior.priorAdapterBlocked,
    mandatoryStorageWriterEnforcement:false as const,
    sameUidBypassPrevented:false as const,
    productionCrashAtomicPromotion:false as const,
    independentExternalAuthority:false as const,
    quorumOrConsensusVerified:false as const,
    crossHostDurabilityVerified:false as const,
    enterpriseProducerTrustVerified:false as const,
    mediaDlpReviewed:false as const,
    fullAguiConformanceVerified:false as const,
    adapterReady:false as const,
    scope:'confined-broker-authorizer-and-local-promotion-journal-fixture-only' as const})
}
