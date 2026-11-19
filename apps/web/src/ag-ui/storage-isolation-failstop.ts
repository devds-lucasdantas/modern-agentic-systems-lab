/**
 * MASL 2.6V — scoped OS-process confinement and fail-stop broker readiness.
 * All TypeScript observations below are untrusted FIxtures; they do NOT prove
 * Linux seccomp, UID/ACL enforcement, enterprise storage authorization or
 * production owner isolation. A separate Python child process attempts real
 * kernel seccomp denial and talks to a local UNIX-socket storage owner.
 * Voluntarily confined same-UID clients are NOT an unbypassable security boundary.
 * Composes the published pure 2.6U -> 2.6J AG-UI gates; no event exposure.
 */
import {makeSelectedMandatoryFencingGate,reviewMandatoryFencingBlockers,
  type MandatoryFencingFixtureAdapters,type MandatoryVerdict} from './mandatory-fencing-promotion'

type Rec=Record<string,unknown>
const object=(v:unknown):v is Rec=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Rec,fields:readonly string[]):boolean=>
  Object.keys(v).length===fields.length&&fields.every(x=>Object.hasOwn(v,x))
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v)
const sec=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2_000_000_000
const OWN=['kind','ownerId','storageId','enforcement','identityScope','observedAt','validThrough'] as const
const CLIENT=['kind','clientId','ownerId','confinement','writeDenied','rpcPermitted','observedAt'] as const
const STOP=['kind','ownerId','phase','journalPhase','leaderEpoch','receiptHeadSha256','observedAt'] as const
const REQUEST=['channelRef','mode','credentialRef','intents','producerRef','nodeRef',
  'rootRef','replicaSetRef','authorityRef','fencingRef','brokerRef','journalRef',
  'ownerRef','clientRef','failStopRef'] as const
export type FixtureStorageOwner=Readonly<{
  kind:'fixture-unix-socket-storage-owner';ownerId:string;storageId:string;
  enforcement:'owner-process-and-self-confined-client';
  identityScope:'single-uid-local-rehearsal-only';observedAt:number;validThrough:number
}>
export type FixtureSandboxClient=Readonly<{
  kind:'fixture-seccomp-client';clientId:string;ownerId:string;
  confinement:'self-installed-open-denial';writeDenied:true;rpcPermitted:true;
  observedAt:number
}>
export type FixtureFailStopOwner=Readonly<{
  kind:'fixture-fail-stop-observation';ownerId:string;
  phase:'running'|'crashed'|'recovering';journalPhase:'stable'|'prepared'|'replica-applied';
  leaderEpoch:number;receiptHeadSha256:string;observedAt:number
}>
export interface StorageIsolationFixtureAdapters extends MandatoryFencingFixtureAdapters{
  readonly readStorageOwnerFixture:(ref:string)=>unknown
  readonly readConstrainedClientFixture:(ref:string)=>unknown
  readonly readFailStopFixture:(ref:string)=>unknown
}
export type StorageIsolationVerdict=
 | Readonly<{status:'planned'|'reconciled';scope:'self-confined-client-and-broker-readiness-only';
     producerId:string;tenantId:string;leaderEpoch:number;plannedCommits:number;
     receiptReconciled:boolean;exposedEvents:0;externalFencingVerified:false;
     replicatedConsistencyVerified:false;authoritativeServiceVerified:false;
     staleWriterProductionBlocked:false;universalStorageFencingVerified:false;
     crashAtomicPromotionVerified:false;independentStorageAuthorityVerified:false;
     mandatoryUidIsolationVerified:false;unconfinedWriterBlocked:false;
     failStopDurabilityProductionVerified:false;adapterReady:false}>
 | Readonly<{status:'blocked';stage:'request'|'owner'|'client'|'fail-stop'|
     Extract<MandatoryVerdict,{status:'blocked'}>['stage'];code:string;exposedEvents:0;
     externalFencingVerified:false;replicatedConsistencyVerified:false;
     authoritativeServiceVerified:false;staleWriterProductionBlocked:false;
     universalStorageFencingVerified:false;crashAtomicPromotionVerified:false;
     independentStorageAuthorityVerified:false;mandatoryUidIsolationVerified:false;
     unconfinedWriterBlocked:false;failStopDurabilityProductionVerified:false;adapterReady:false}>
export function makeSelectedStorageIsolationGate(adapters:StorageIsolationFixtureAdapters){
  const deny=(stage:Extract<StorageIsolationVerdict,{status:'blocked'}>['stage'],code:string):StorageIsolationVerdict=>
    ({status:'blocked',stage,code,exposedEvents:0,externalFencingVerified:false,
      replicatedConsistencyVerified:false,authoritativeServiceVerified:false,
      staleWriterProductionBlocked:false,universalStorageFencingVerified:false,
      crashAtomicPromotionVerified:false,independentStorageAuthorityVerified:false,
      mandatoryUidIsolationVerified:false,unconfinedWriterBlocked:false,
      failStopDurabilityProductionVerified:false,adapterReady:false})
  return Object.freeze({review:(request:unknown):StorageIsolationVerdict=>{
    if(!object(request)||!exact(request,REQUEST)||
       !REQUEST.filter(x=>x!=='mode'&&x!=='intents').every(x=>id(request[x]))||
       (request.mode!=='propose'&&request.mode!=='reconcile')||
       !Array.isArray(request.intents)||request.intents.length!==1||
       !object(request.intents[0])||!id(request.intents[0].threadId)||
       !id(request.intents[0].runId))
      return deny('request','untrusted-broker-request-shape')
    let now:unknown,own:unknown,client:unknown,stop:unknown
    try{now=adapters.clockSeconds();own=adapters.readStorageOwnerFixture(request.ownerRef as string)}
    catch{return deny('owner','fixture-storage-owner-unavailable')}
    if(!sec(now))return deny('owner','fixture-storage-clock-invalid')
    if(!object(own)||!exact(own,OWN)||own.kind!=='fixture-unix-socket-storage-owner'||
       !id(own.ownerId)||!id(own.storageId)||
       own.enforcement!=='owner-process-and-self-confined-client'||
       own.identityScope!=='single-uid-local-rehearsal-only'||
       !sec(own.observedAt)||!sec(own.validThrough))
      return deny('owner','fixture-storage-owner-untrusted')
    if(own.observedAt>now||now-own.observedAt>5||own.validThrough<=now||
       own.validThrough-own.observedAt>30)return deny('owner','fixture-storage-owner-stale')
    try{client=adapters.readConstrainedClientFixture(request.clientRef as string)}
    catch{return deny('client','fixture-client-unavailable')}
    if(!object(client)||!exact(client,CLIENT)||client.kind!=='fixture-seccomp-client'||
       !id(client.clientId)||client.ownerId!==own.ownerId||
       client.confinement!=='self-installed-open-denial'||
       client.writeDenied!==true||client.rpcPermitted!==true||
       !sec(client.observedAt)||client.observedAt>now||now-client.observedAt>5)
      return deny('client','fixture-client-confinement-untrusted')
    try{stop=adapters.readFailStopFixture(request.failStopRef as string)}
    catch{return deny('fail-stop','fixture-owner-liveness-unavailable')}
    if(!object(stop)||!exact(stop,STOP)||stop.kind!=='fixture-fail-stop-observation'||
       stop.ownerId!==own.ownerId||!sec(stop.leaderEpoch)||stop.leaderEpoch<1||
       !/^[a-f0-9]{64}$/.test(String(stop.receiptHeadSha256))||
       !sec(stop.observedAt)||stop.observedAt>now||now-stop.observedAt>5||
       !['running','crashed','recovering'].includes(String(stop.phase))||
       !['stable','prepared','replica-applied'].includes(String(stop.journalPhase)))
      return deny('fail-stop','fixture-owner-journal-invalid')
    if(stop.phase!=='running'||stop.journalPhase!=='stable')
      return deny('fail-stop','fixture-owner-not-write-ready')
    const {ownerRef:_own,clientRef:_client,failStopRef:_stop,...prior}=request
    void _own;void _client;void _stop
    let checked:MandatoryVerdict
    try{checked=makeSelectedMandatoryFencingGate(adapters).review(prior)}
    catch{return deny('published-2.6T','fixture-published-gate-unavailable')}
    if(checked.status==='blocked')return deny(checked.stage,checked.code)
    if(checked.leaderEpoch!==stop.leaderEpoch)
      return deny('fail-stop','fixture-journal-leader-epoch-conflict')
    return {status:checked.status,scope:'self-confined-client-and-broker-readiness-only',
      producerId:checked.producerId,tenantId:checked.tenantId,
      leaderEpoch:checked.leaderEpoch,plannedCommits:checked.plannedCommits,
      receiptReconciled:checked.receiptReconciled,exposedEvents:0,
      externalFencingVerified:false,replicatedConsistencyVerified:false,
      authoritativeServiceVerified:false,staleWriterProductionBlocked:false,
      universalStorageFencingVerified:false,crashAtomicPromotionVerified:false,
      independentStorageAuthorityVerified:false,mandatoryUidIsolationVerified:false,
      unconfinedWriterBlocked:false,failStopDurabilityProductionVerified:false,adapterReady:false}
  }})
}
export function reviewStorageIsolationBlockers(){
  const old=reviewMandatoryFencingBlockers()
  return Object.freeze({allNineGapsOpen:old.allNineGapsOpen,
    parentMilestoneOpen:old.parentMilestoneOpen,priorAdapterBlocked:old.priorAdapterBlocked,
    independentUidOwnershipVerified:false as const,
    OSDiscretionaryAccessControlProven:false as const,
    arbitrarySameUidWriterPrevented:false as const,
    kernelSandboxMandatoryForAllClients:false as const,
    externalTrustedFencingVerified:false as const,
    crossHostRecoveryVerified:false as const,
    distributedAtomicPromotionVerified:false as const,
    normativeAguiConformanceVerified:false as const,
    mediaDlpSecurityApproved:false as const,
    adapterReady:false as const,
    scope:'optional-linux-kernel-seccomp-self-confinement-plus-local-unix-socket-owner-fixture-only' as const})
}
