/**
 * MASL 2.6W — pure cross-UID storage-mediation *fixture observation*.
 * There is no direct TypeScript access to OS credentials, Linux DAC, sockets,
 * or SQLite. A separately privileged, temporary Python fixture MUST prove
 * actual non-root cross-UID denial; injected TS observations never authorize
 * production use. Preserves published 2.6V -> 2.6J chain and G1-G9 OPEN.
 */
import {makeSelectedStorageIsolationGate,reviewStorageIsolationBlockers,
  type StorageIsolationFixtureAdapters,type StorageIsolationVerdict} from './storage-isolation-failstop'

type Rec=Record<string,unknown>
const obj=(v:unknown):v is Rec=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Rec,fields:readonly string[]):boolean=>
  Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k))
const ident=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v)
const stamp=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2_000_000_000
const uid=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1000&&v<=200000
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const OWNER=['kind','ownerId','storageId','ownerUid','ownerGid','dataDirMode','dbFileMode','identityScope','observedAt','validThrough'] as const
const CLIENT=['kind','ownerId','clientId','clientUid','clientGid','directReadDenied','directWriteDenied','socketRpcAllowed','observedAt'] as const
const SOCKET=['kind','ownerId','ownerUid','allowedUid','socketMode','socketDirMode','peerCredUidMatched','otherUidDenied','observedAt'] as const
const RESTART=['kind','ownerId','phase','leaderEpoch','receiptHeadSha256','receiptReconciled','staleWriterDenied','observedAt'] as const
const REQUEST=['channelRef','mode','credentialRef','intents','producerRef','nodeRef','rootRef','replicaSetRef',
  'authorityRef','fencingRef','brokerRef','journalRef','ownerRef','clientRef','failStopRef',
  'uidOwnerRef','uidClientRef','uidSocketRef','uidRestartRef'] as const

export type CrossUidOwnerFixture=Readonly<{kind:'fixture-cross-uid-owner';ownerId:string;storageId:string;
  ownerUid:number;ownerGid:number;dataDirMode:448;dbFileMode:384;
  identityScope:'separate-unprivileged-linux-uids-in-isolated-test';observedAt:number;validThrough:number}>
export type CrossUidClientFixture=Readonly<{kind:'fixture-cross-uid-client';ownerId:string;clientId:string;
  clientUid:number;clientGid:number;directReadDenied:true;directWriteDenied:true;
  socketRpcAllowed:true;observedAt:number}>
export type CrossUidSocketFixture=Readonly<{kind:'fixture-so-peercred-socket';ownerId:string;
  ownerUid:number;allowedUid:number;socketMode:432;socketDirMode:457;
  peerCredUidMatched:true;otherUidDenied:true;observedAt:number}>
export type CrossUidRestartFixture=Readonly<{kind:'fixture-cross-uid-restart';ownerId:string;
  phase:'running'|'crashed'|'reconciling';leaderEpoch:number;receiptHeadSha256:string;
  receiptReconciled:true;staleWriterDenied:true;observedAt:number}>
export interface CrossUidFixtureAdapters extends StorageIsolationFixtureAdapters{
  readonly readUidOwnerFixture:(ref:string)=>unknown
  readonly readUidClientFixture:(ref:string)=>unknown
  readonly readUidSocketFixture:(ref:string)=>unknown
  readonly readUidRestartFixture:(ref:string)=>unknown
}
const FALSE={exposedEvents:0 as const,externalFencingVerified:false as const,
  replicatedConsistencyVerified:false as const,authoritativeServiceVerified:false as const,
  staleWriterProductionBlocked:false as const,universalStorageFencingVerified:false as const,
  crashAtomicPromotionVerified:false as const,independentStorageAuthorityVerified:false as const,
  mandatoryUidIsolationVerified:false as const,unconfinedWriterBlocked:false as const,
  failStopDurabilityProductionVerified:false as const,actualCrossUidOsVerifiedInTS:false as const,
  rootOrOwnerCompromiseProtected:false as const,adapterReady:false as const}
export type CrossUidVerdict=
 | Readonly<{status:'planned'|'reconciled';scope:'cross-uid-fixture-observations-only';
    producerId:string;tenantId:string;leaderEpoch:number;plannedCommits:number;receiptReconciled:boolean}&typeof FALSE>
 | Readonly<{status:'blocked';stage:'request'|'uid-owner'|'uid-client'|'uid-socket'|'uid-restart'|
      Extract<StorageIsolationVerdict,{status:'blocked'}>['stage'];code:string}&typeof FALSE>
export function makeSelectedCrossUidMediationGate(adapters:CrossUidFixtureAdapters){
  const deny=(stage:Extract<CrossUidVerdict,{status:'blocked'}>['stage'],code:string):CrossUidVerdict=>
    ({status:'blocked',stage,code,...FALSE})
  return Object.freeze({review:(request:unknown):CrossUidVerdict=>{
    if(!obj(request)||!exact(request,REQUEST)||
       !REQUEST.filter(k=>k!=='mode'&&k!=='intents').every(k=>ident(request[k]))||
       (request.mode!=='propose'&&request.mode!=='reconcile')||
       !Array.isArray(request.intents)||request.intents.length!==1||
       !obj(request.intents[0])||!ident(request.intents[0].threadId)||!ident(request.intents[0].runId))
      return deny('request','untrusted-cross-uid-request-shape')
    let now:unknown,own:unknown,client:unknown,sock:unknown,restart:unknown
    try{now=adapters.clockSeconds();own=adapters.readUidOwnerFixture(request.uidOwnerRef as string)}
    catch{return deny('uid-owner','cross-uid-owner-unavailable')}
    if(!stamp(now))return deny('uid-owner','cross-uid-clock-invalid')
    if(!obj(own)||!exact(own,OWNER)||own.kind!=='fixture-cross-uid-owner'||
       !ident(own.ownerId)||!ident(own.storageId)||!uid(own.ownerUid)||!uid(own.ownerGid)||
       own.dataDirMode!==448||own.dbFileMode!==384||
       own.identityScope!=='separate-unprivileged-linux-uids-in-isolated-test'||
       !stamp(own.observedAt)||!stamp(own.validThrough))
      return deny('uid-owner','cross-uid-owner-untrusted')
    if(own.observedAt>now||now-own.observedAt>5||own.validThrough<=now||
       own.validThrough-own.observedAt>30)return deny('uid-owner','cross-uid-owner-stale')
    try{client=adapters.readUidClientFixture(request.uidClientRef as string)}
    catch{return deny('uid-client','cross-uid-client-unavailable')}
    if(!obj(client)||!exact(client,CLIENT)||client.kind!=='fixture-cross-uid-client'||
       client.ownerId!==own.ownerId||!ident(client.clientId)||
       !uid(client.clientUid)||!uid(client.clientGid)||
       client.clientUid===own.ownerUid||client.clientGid===own.ownerGid||
       client.directReadDenied!==true||client.directWriteDenied!==true||
       client.socketRpcAllowed!==true||!stamp(client.observedAt)||
       client.observedAt>now||now-client.observedAt>5)
      return deny('uid-client','cross-uid-client-untrusted')
    try{sock=adapters.readUidSocketFixture(request.uidSocketRef as string)}
    catch{return deny('uid-socket','cross-uid-socket-unavailable')}
    if(!obj(sock)||!exact(sock,SOCKET)||sock.kind!=='fixture-so-peercred-socket'||
       sock.ownerId!==own.ownerId||sock.ownerUid!==own.ownerUid||
       sock.allowedUid!==client.clientUid||sock.socketMode!==432||
       sock.socketDirMode!==457||sock.peerCredUidMatched!==true||
       sock.otherUidDenied!==true||!stamp(sock.observedAt)||
       sock.observedAt>now||now-sock.observedAt>5)
      return deny('uid-socket','cross-uid-socket-untrusted')
    try{restart=adapters.readUidRestartFixture(request.uidRestartRef as string)}
    catch{return deny('uid-restart','cross-uid-restart-unavailable')}
    if(!obj(restart)||!exact(restart,RESTART)||restart.kind!=='fixture-cross-uid-restart'||
       restart.ownerId!==own.ownerId||!stamp(restart.leaderEpoch)||
       restart.leaderEpoch<1||!hex(restart.receiptHeadSha256)||
       restart.receiptReconciled!==true||restart.staleWriterDenied!==true||
       !stamp(restart.observedAt)||restart.observedAt>now||now-restart.observedAt>5||
       !['running','crashed','reconciling'].includes(String(restart.phase)))
      return deny('uid-restart','cross-uid-restart-untrusted')
    if(restart.phase!=='running')return deny('uid-restart','cross-uid-owner-not-running')
    const {uidOwnerRef:_a,uidClientRef:_b,uidSocketRef:_c,uidRestartRef:_d,...prior}=request
    void _a;void _b;void _c;void _d
    let result:StorageIsolationVerdict
    try{result=makeSelectedStorageIsolationGate(adapters).review(prior)}
    catch{return deny('owner','published-2.6V-unavailable')}
    if(result.status==='blocked')return deny(result.stage,result.code)
    if(restart.leaderEpoch!==result.leaderEpoch)
      return deny('uid-restart','cross-uid-epoch-conflict')
    return {status:result.status,scope:'cross-uid-fixture-observations-only',
      producerId:result.producerId,tenantId:result.tenantId,leaderEpoch:result.leaderEpoch,
      plannedCommits:result.plannedCommits,receiptReconciled:result.receiptReconciled,...FALSE}
  }})
}
export function reviewCrossUidMediationBlockers(){
  const prior=reviewStorageIsolationBlockers()
  return Object.freeze({allNineGapsOpen:prior.allNineGapsOpen,
    parentMilestoneOpen:prior.parentMilestoneOpen,priorAdapterBlocked:prior.priorAdapterBlocked,
    crossUidKernelEvidenceConsumedInTS:false as const,
    productionMandatoryFencingVerified:false as const,
    productionOsOwnershipConfigured:false as const,
    productionSocketAclVerified:false as const,
    privilegedRootBypassPrevented:false as const,
    compromisedOwnerBypassPrevented:false as const,
    distributedAtomicPromotionVerified:false as const,
    fullAguiConformanceVerified:false as const,
    enterpriseSecuritySignoff:false as const,adapterReady:false as const,
    scope:'separate-real-root-helper-uid-fixture-and-untrusted-typescript-observations-only' as const})
}
