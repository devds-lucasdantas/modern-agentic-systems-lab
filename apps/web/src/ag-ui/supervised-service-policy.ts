/** MASL 2.6Z: pure, fail-closed observations of a disposable systemd transient
 * unit. Assertions are NOT kernel/DB attestations. A separate Python runner
 * must prove effective host state. No operational AG-UI adapter is enabled. */
import {makeSelectedServicePolicyGate,reviewServicePolicyBlockers,
 type ServicePolicyFixtureAdapters,type ServicePolicyVerdict} from './deployable-service-hostile-clients'
type Rec=Record<string,unknown>
const obj=(x:unknown):x is Rec=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const eq=(x:Rec,keys:readonly string[])=>Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k))
const ident=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(x)
const n=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=2_000_000_000
const U=['kind','unitId','serviceManager','ownerUid','clientUid','outsiderUid',
 'noNewPrivileges','protectSystem','protectHome','privateTmp','capabilityBoundingSetEmpty',
 'ambientCapabilitiesEmpty','active','mainPid','observedAt','unitInstalledPersistently',
 'rootBypassPrevented'] as const
const C=['kind','unitId','directStorageDenied','unauthorizedPeerDenied','invalidJsonDenied',
 'oversizedFrameDenied','idleClientDenied','ownerSurvived','receiptUnchanged','observedAt'] as const
const B=['kind','unitId','previousBootEpoch','bootEpoch','previousMainPid','currentMainPid',
 'socketInodeBefore','socketInodeAfter','lostAckReconciled','promotionRecovered',
 'staleEpochDenied','oldSocketDenied','ownerActive','observedAt'] as const
const Q=['channelRef','mode','credentialRef','intents','producerRef','nodeRef','rootRef',
 'replicaSetRef','authorityRef','fencingRef','brokerRef','journalRef','ownerRef',
 'clientRef','failStopRef','uidOwnerRef','uidClientRef','uidSocketRef','uidRestartRef',
 'runtimeOwnerRef','runtimeSocketRef','runtimeRecoveryRef','servicePolicyRef',
 'hostileClientRef','serviceRecoveryRef','unitStatusRef','hostileServiceRef','supervisorRestartRef'] as const
export interface SupervisedFixtureAdapters extends ServicePolicyFixtureAdapters {
 readUnitStatusFixture:(ref:string)=>unknown
 readHostileServiceFixture:(ref:string)=>unknown
 readSupervisorRestartFixture:(ref:string)=>unknown
}
export type FixtureUnit=Readonly<{kind:'fixture-systemd-transient-unit';unitId:string;
 serviceManager:'systemd-system';ownerUid:61001;clientUid:61002;outsiderUid:61003;
 noNewPrivileges:true;protectSystem:'strict';protectHome:true;privateTmp:true;
 capabilityBoundingSetEmpty:true;ambientCapabilitiesEmpty:true;active:true;
 mainPid:number;observedAt:number;unitInstalledPersistently:false;rootBypassPrevented:false}>
export type FixtureServiceHostile=Readonly<{kind:'fixture-systemd-hostile-client';unitId:string;
 directStorageDenied:true;unauthorizedPeerDenied:true;invalidJsonDenied:true;
 oversizedFrameDenied:true;idleClientDenied:true;ownerSurvived:true;
 receiptUnchanged:true;observedAt:number}>
export type FixtureSupervisorRestart=Readonly<{kind:'fixture-systemd-restart';unitId:string;
 previousBootEpoch:number;bootEpoch:number;previousMainPid:number;currentMainPid:number;
 socketInodeBefore:number;socketInodeAfter:number;lostAckReconciled:true;
 promotionRecovered:true;staleEpochDenied:true;oldSocketDenied:true;
 ownerActive:true;observedAt:number}>
const FALSE={kernelAttestedByTs:false as const,unitInstalledPersistently:false as const,
 operationalServiceDeployed:false as const,rootBypassPrevented:false as const,
 compromisedOwnerPrevented:false as const,distributedAtomicPromotion:false as const,
 enterpriseIssuerAclVerified:false as const,normativeAguiVerified:false as const,
 securitySignoff:false as const,parentMilestoneClosed:false as const,adapterReady:false as const}
export type SupervisedVerdict=Readonly<{status:'planned'|'reconciled';
 scope:'ephemeral-systemd-fixture-observations-only';tenantId:string;producerId:string;
 leaderEpoch:number;plannedCommits:number;receiptReconciled:boolean}&typeof FALSE> |
 Readonly<{status:'blocked';stage:string;code:string}&typeof FALSE>
export function makeSelectedSupervisedGate(adapters:SupervisedFixtureAdapters){
 const deny=(stage:string,code:string):SupervisedVerdict=>({status:'blocked',stage,code,...FALSE})
 return Object.freeze({review:(request:unknown):SupervisedVerdict=>{
   if(!obj(request)||!eq(request,Q)||!Q.filter(k=>!['mode','intents'].includes(k)).every(k=>ident(request[k]))||
    !['propose','reconcile'].includes(request.mode as string)||!Array.isArray(request.intents)||
    request.intents.length!==1||!obj(request.intents[0])||
    !ident(request.intents[0].threadId)||!ident(request.intents[0].runId))
     return deny('request','invalid-supervised-request')
   let now:unknown,unit:unknown,hostile:unknown,restart:unknown
   try{now=adapters.clockSeconds();unit=adapters.readUnitStatusFixture(request.unitStatusRef as string)}
   catch{return deny('systemd-unit','systemd-unit-unavailable')}
   if(!n(now))return deny('systemd-unit','invalid-clock')
   if(!obj(unit)||!eq(unit,U)||unit.kind!=='fixture-systemd-transient-unit'||!ident(unit.unitId)||
    unit.serviceManager!=='systemd-system'||unit.ownerUid!==61001||unit.clientUid!==61002||
    unit.outsiderUid!==61003||unit.noNewPrivileges!==true||unit.protectSystem!=='strict'||
    unit.protectHome!==true||unit.privateTmp!==true||unit.capabilityBoundingSetEmpty!==true||
    unit.ambientCapabilitiesEmpty!==true||unit.active!==true||!n(unit.mainPid)||unit.mainPid<2||
    unit.unitInstalledPersistently!==false||unit.rootBypassPrevented!==false||
    !n(unit.observedAt)||unit.observedAt>now||now-unit.observedAt>5)
      return deny('systemd-unit','invalid-systemd-unit-observation')
   try{hostile=adapters.readHostileServiceFixture(request.hostileServiceRef as string)}
   catch{return deny('hostile-client','hostile-client-unavailable')}
   if(!obj(hostile)||!eq(hostile,C)||hostile.kind!=='fixture-systemd-hostile-client'||
    hostile.unitId!==unit.unitId||!C.filter(k=>k.endsWith('Denied')||k==='ownerSurvived'||k==='receiptUnchanged')
      .every(k=>hostile[k]===true)||!n(hostile.observedAt)||hostile.observedAt>now||now-hostile.observedAt>5)
      return deny('hostile-client','invalid-hostile-service-observation')
   try{restart=adapters.readSupervisorRestartFixture(request.supervisorRestartRef as string)}
   catch{return deny('supervisor-restart','supervisor-restart-unavailable')}
   if(!obj(restart)||!eq(restart,B)||restart.kind!=='fixture-systemd-restart'||
    restart.unitId!==unit.unitId||!n(restart.previousBootEpoch)||!n(restart.bootEpoch)||
    restart.previousBootEpoch<1||restart.bootEpoch<3||restart.bootEpoch<=restart.previousBootEpoch||
    !n(restart.previousMainPid)||restart.previousMainPid<2||!n(restart.currentMainPid)||
    restart.currentMainPid<2||restart.previousMainPid===restart.currentMainPid||
    restart.currentMainPid!==unit.mainPid||!n(restart.socketInodeBefore)||
    !n(restart.socketInodeAfter)||restart.socketInodeBefore===restart.socketInodeAfter||
    restart.socketInodeBefore<1||restart.socketInodeAfter<1||
    !B.filter(k=>['lostAckReconciled','promotionRecovered','staleEpochDenied',
      'oldSocketDenied','ownerActive'].includes(k)).every(k=>restart[k]===true)||
    !n(restart.observedAt)||restart.observedAt>now||now-restart.observedAt>5)
      return deny('supervisor-restart','invalid-supervisor-recovery')
   const {unitStatusRef:_u,hostileServiceRef:_h,supervisorRestartRef:_r,...prior}=request
   void _u;void _h;void _r
   let upstream:ServicePolicyVerdict
   try{upstream=makeSelectedServicePolicyGate(adapters).review(prior)}
   catch{return deny('service-policy','published-2.6Y-unavailable')}
   if(upstream.status==='blocked')return deny(upstream.stage,upstream.code)
   return {status:upstream.status,scope:'ephemeral-systemd-fixture-observations-only',
     tenantId:upstream.tenantId,producerId:upstream.producerId,leaderEpoch:upstream.leaderEpoch,
     plannedCommits:upstream.plannedCommits,receiptReconciled:upstream.receiptReconciled,...FALSE}
 }})
}
export function reviewSupervisedBlockers(){
 const p=reviewServicePolicyBlockers()
 return Object.freeze({allNineGapsOpen:p.allNineGapsOpen,parentMilestoneOpen:p.parentMilestoneOpen,
 priorAdapterBlocked:p.priorAdapterBlocked,...FALSE,
 transientUnitNotProduction:true as const,rootTrusted:true as const,
 independentAguiConformanceMissing:true as const,scope:'isolated-transient-service-only' as const})
}
