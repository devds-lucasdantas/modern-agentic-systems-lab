/**
 * MASL 2.6X — pure supervisor/runtime *fixture-observation* gate.
 * No direct TS kernel access, no cryptographic attestation, no production
 * authorization. The separate isolated Python fixture must prove its own
 * Linux prctl/capability/socket behavior with real UIDs.
 */
import {makeSelectedCrossUidMediationGate,reviewCrossUidMediationBlockers,
  type CrossUidFixtureAdapters,type CrossUidVerdict} from './cross-uid-storage-mediation'

type RecordV=Record<string,unknown>
const obj=(x:unknown):x is RecordV=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const exact=(x:RecordV,keys:readonly string[])=>Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k))
const id=(x:unknown):x is string=>typeof x==='string'&&/^[a-zA-Z0-9._:-]{1,128}$/.test(x)
const n=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=2_000_000_000
const OWNER=['kind','ownerId','ownerUid','bootNonce','bootEpoch','noNewPrivs','effectiveCapsZero',
  'boundingCapsZero','supplementaryGroupsEmpty','coreDumpsDisabled','dumpableDisabled',
  'descriptorLimit','observedAt','validThrough'] as const
const SOCKET=['kind','ownerId','bootNonce','socketInode','socketDirMode','socketMode',
  'peerUidMatched','outsiderDenied','staleSocketDenied','observedAt'] as const
const RECOVERY=['kind','ownerId','bootEpoch','previousBootEpoch','previousSocketInode',
  'newSocketInode','lostAckReconciled','duplicateCommitDenied','staleLeaderDenied',
  'ownerRunning','observedAt'] as const
const REQUEST=['channelRef','mode','credentialRef','intents','producerRef','nodeRef','rootRef',
  'replicaSetRef','authorityRef','fencingRef','brokerRef','journalRef','ownerRef',
  'clientRef','failStopRef','uidOwnerRef','uidClientRef','uidSocketRef','uidRestartRef',
  'runtimeOwnerRef','runtimeSocketRef','runtimeRecoveryRef'] as const

export type RuntimeOwnerFixture=Readonly<{kind:'fixture-hardened-owner';ownerId:string;
  ownerUid:61001;bootNonce:string;bootEpoch:number;noNewPrivs:true;effectiveCapsZero:true;
  boundingCapsZero:true;supplementaryGroupsEmpty:true;coreDumpsDisabled:true;
  dumpableDisabled:true;descriptorLimit:128;observedAt:number;validThrough:number}>
export type RuntimeSocketFixture=Readonly<{kind:'fixture-supervised-socket';ownerId:string;
  bootNonce:string;socketInode:number;socketDirMode:457;socketMode:432;
  peerUidMatched:true;outsiderDenied:true;staleSocketDenied:true;observedAt:number}>
export type RuntimeRecoveryFixture=Readonly<{kind:'fixture-supervisor-recovery';ownerId:string;
  bootEpoch:number;previousBootEpoch:number;previousSocketInode:number;newSocketInode:number;
  lostAckReconciled:true;duplicateCommitDenied:true;staleLeaderDenied:true;
  ownerRunning:true;observedAt:number}>
export interface RuntimeHardeningFixtureAdapters extends CrossUidFixtureAdapters{
  readonly readRuntimeOwnerFixture:(ref:string)=>unknown
  readonly readRuntimeSocketFixture:(ref:string)=>unknown
  readonly readRuntimeRecoveryFixture:(ref:string)=>unknown
}
const FALSE={exposedEvents:0 as const,realRuntimeAttestedInTS:false as const,
  productionUidLifecycleVerified:false as const,privilegedBypassPrevented:false as const,
  compromisedOwnerPrevented:false as const,serviceManagerConfigured:false as const,
  arbitraryCrashConsistencyVerified:false as const,externalFencingVerified:false as const,
  normativeAguiVerified:false as const,enterpriseSecuritySignoff:false as const,
  adapterReady:false as const}
export type RuntimeHardeningVerdict=
 | Readonly<{status:'planned'|'reconciled';scope:'runtime-fixture-observations-only';
      tenantId:string;producerId:string;leaderEpoch:number;plannedCommits:number;
      receiptReconciled:boolean}&typeof FALSE>
 | Readonly<{status:'blocked';stage:'request'|'runtime-owner'|'runtime-socket'|'runtime-recovery'|
      Extract<CrossUidVerdict,{status:'blocked'}>['stage'];code:string}&typeof FALSE>
export function makeSelectedRuntimeHardeningGate(adapters:RuntimeHardeningFixtureAdapters){
  const deny=(stage:Extract<RuntimeHardeningVerdict,{status:'blocked'}>['stage'],code:string):RuntimeHardeningVerdict=>
    ({status:'blocked',stage,code,...FALSE})
  return Object.freeze({review:(request:unknown):RuntimeHardeningVerdict=>{
    if(!obj(request)||!exact(request,REQUEST)||
      !REQUEST.filter(k=>k!=='mode'&&k!=='intents').every(k=>id(request[k]))||
      (request.mode!=='propose'&&request.mode!=='reconcile')||
      !Array.isArray(request.intents)||request.intents.length!==1||
      !obj(request.intents[0])||!id(request.intents[0].runId)||!id(request.intents[0].threadId))
      return deny('request','untrusted-runtime-request-shape')
    let now:unknown, owner:unknown, sock:unknown, recovery:unknown
    try{now=adapters.clockSeconds();owner=adapters.readRuntimeOwnerFixture(request.runtimeOwnerRef as string)}
    catch{return deny('runtime-owner','runtime-owner-unavailable')}
    if(!n(now))return deny('runtime-owner','runtime-clock-invalid')
    if(!obj(owner)||!exact(owner,OWNER)||owner.kind!=='fixture-hardened-owner'||
       !id(owner.ownerId)||owner.ownerUid!==61001||!id(owner.bootNonce)||
       !n(owner.bootEpoch)||owner.bootEpoch<2||owner.noNewPrivs!==true||
       owner.effectiveCapsZero!==true||owner.boundingCapsZero!==true||
       owner.supplementaryGroupsEmpty!==true||owner.coreDumpsDisabled!==true||
       owner.dumpableDisabled!==true||owner.descriptorLimit!==128||
       !n(owner.observedAt)||!n(owner.validThrough))
      return deny('runtime-owner','untrusted-runtime-owner')
    if(owner.observedAt>now||now-owner.observedAt>5||owner.validThrough<=now||
      owner.validThrough-owner.observedAt>30)return deny('runtime-owner','runtime-owner-stale')
    try{sock=adapters.readRuntimeSocketFixture(request.runtimeSocketRef as string)}
    catch{return deny('runtime-socket','runtime-socket-unavailable')}
    if(!obj(sock)||!exact(sock,SOCKET)||sock.kind!=='fixture-supervised-socket'||
       sock.ownerId!==owner.ownerId||sock.bootNonce!==owner.bootNonce||
       !n(sock.socketInode)||sock.socketInode<1||sock.socketDirMode!==457||
       sock.socketMode!==432||sock.peerUidMatched!==true||
       sock.outsiderDenied!==true||sock.staleSocketDenied!==true||
       !n(sock.observedAt)||sock.observedAt>now||now-sock.observedAt>5)
      return deny('runtime-socket','untrusted-runtime-socket')
    try{recovery=adapters.readRuntimeRecoveryFixture(request.runtimeRecoveryRef as string)}
    catch{return deny('runtime-recovery','runtime-recovery-unavailable')}
    if(!obj(recovery)||!exact(recovery,RECOVERY)||
       recovery.kind!=='fixture-supervisor-recovery'||recovery.ownerId!==owner.ownerId||
       recovery.bootEpoch!==owner.bootEpoch||!n(recovery.previousBootEpoch)||
       recovery.previousBootEpoch+1!==recovery.bootEpoch||
       !n(recovery.previousSocketInode)||recovery.previousSocketInode<1||
       recovery.previousSocketInode===recovery.newSocketInode||
       recovery.newSocketInode!==sock.socketInode||
       recovery.lostAckReconciled!==true||recovery.duplicateCommitDenied!==true||
       recovery.staleLeaderDenied!==true||recovery.ownerRunning!==true||
       !n(recovery.observedAt)||recovery.observedAt>now||now-recovery.observedAt>5)
      return deny('runtime-recovery','untrusted-runtime-recovery')
    const {runtimeOwnerRef:_o,runtimeSocketRef:_s,runtimeRecoveryRef:_r,...prior}=request
    void _o;void _s;void _r
    let upstream:CrossUidVerdict
    try{upstream=makeSelectedCrossUidMediationGate(adapters).review(prior)}
    catch{return deny('uid-owner','published-2.6W-unavailable')}
    if(upstream.status==='blocked')return deny(upstream.stage,upstream.code)
    // The fixture does not cryptographically attest boot IDs or OS policy.
    return {status:upstream.status,scope:'runtime-fixture-observations-only',
      tenantId:upstream.tenantId,producerId:upstream.producerId,
      leaderEpoch:upstream.leaderEpoch,plannedCommits:upstream.plannedCommits,
      receiptReconciled:upstream.receiptReconciled,...FALSE}
  }})
}
export function reviewRuntimeHardeningBlockers(){
  const prior=reviewCrossUidMediationBlockers()
  return Object.freeze({allNineGapsOpen:prior.allNineGapsOpen,
    parentMilestoneOpen:prior.parentMilestoneOpen,priorAdapterBlocked:prior.priorAdapterBlocked,
    realKernelEvidenceConsumedInTS:false as const,productionUidLifecycleVerified:false as const,
    privilegedRootBypassPrevented:false as const,compromisedOwnerBypassPrevented:false as const,
    verifiedServiceManagerHardening:false as const,distributedAtomicPromotion:false as const,
    operationalIssuerAclVerified:false as const,independentNormativeAgui:false as const,
    mediaDlpApproved:false as const,enterpriseSecuritySignoff:false as const,
    adapterReady:false as const,scope:'selected-local-runtime-fixture-only' as const})
}
