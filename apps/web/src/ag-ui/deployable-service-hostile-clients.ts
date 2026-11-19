/** MASL 2.6Y — pure proposal gate for static service policy and hostile-client
 * fixture observations. Never interpreted as a deployed systemd unit or as
 * authenticated kernel testimony. The actual kernel probe is Python only. */
import {makeSelectedRuntimeHardeningGate,reviewRuntimeHardeningBlockers,
  type RuntimeHardeningFixtureAdapters,type RuntimeHardeningVerdict} from './cross-uid-runtime-hardening'

type Rec=Record<string,unknown>
const obj=(x:unknown):x is Rec=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const exact=(r:Rec,fields:readonly string[])=>Object.keys(r).length===fields.length&&fields.every(k=>Object.hasOwn(r,k))
const ident=(x:unknown):x is string=>typeof x==='string'&&/^[a-zA-Z0-9._:-]{1,128}$/.test(x)
const integer=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=2_000_000_000
const P=['kind','policyId','ownerUid','clientUid','outsiderUid','noNewPrivileges','protectSystem',
 'protectHome','privateTmp','restrictAddressFamilies','capabilityBoundingSetEmpty',
 'ambientCapabilitiesEmpty','stateDirectoryMode','runtimeDirectoryMode','socketMode',
 'unitDeployed','rootBypassPrevented','observedAt','validThrough'] as const
const H=['kind','policyId','ownerUid','clientUid','outsiderUid','invalidJsonDenied',
 'oversizedFrameDenied','unsupportedOpDenied','unprivilegedPeerDenied',
 'directStorageDenied','idleClientTimedOut','ownerStillRunning','receiptUnchanged',
 'observedAt'] as const
const R=['kind','policyId','bootEpoch','previousBootEpoch','staleSocketDenied',
 'lostAckReconciled','receiptUnique','newSocketInode','oldSocketInode','ownerRunning',
 'observedAt'] as const
const Q=['channelRef','mode','credentialRef','intents','producerRef','nodeRef','rootRef',
 'replicaSetRef','authorityRef','fencingRef','brokerRef','journalRef','ownerRef',
 'clientRef','failStopRef','uidOwnerRef','uidClientRef','uidSocketRef','uidRestartRef',
 'runtimeOwnerRef','runtimeSocketRef','runtimeRecoveryRef','servicePolicyRef',
 'hostileClientRef','serviceRecoveryRef'] as const
export type FixtureServicePolicy=Readonly<{kind:'fixture-unit-policy-proposal';policyId:string;
 ownerUid:61001;clientUid:61002;outsiderUid:61003;noNewPrivileges:true;
 protectSystem:'strict';protectHome:true;privateTmp:true;
 restrictAddressFamilies:'AF_UNIX';capabilityBoundingSetEmpty:true;
 ambientCapabilitiesEmpty:true;stateDirectoryMode:448;runtimeDirectoryMode:448;
 socketMode:432;unitDeployed:false;rootBypassPrevented:false;
 observedAt:number;validThrough:number}>
export type FixtureHostileClient=Readonly<{kind:'fixture-hostile-client-probe';policyId:string;
 ownerUid:61001;clientUid:61002;outsiderUid:61003;invalidJsonDenied:true;
 oversizedFrameDenied:true;unsupportedOpDenied:true;unprivilegedPeerDenied:true;
 directStorageDenied:true;idleClientTimedOut:true;ownerStillRunning:true;
 receiptUnchanged:true;observedAt:number}>
export type FixtureServiceRecovery=Readonly<{kind:'fixture-service-restart-observation';policyId:string;
 bootEpoch:number;previousBootEpoch:number;staleSocketDenied:true;
 lostAckReconciled:true;receiptUnique:true;newSocketInode:number;
 oldSocketInode:number;ownerRunning:true;observedAt:number}>
export interface ServicePolicyFixtureAdapters extends RuntimeHardeningFixtureAdapters{
 readServicePolicyFixture:(ref:string)=>unknown
 readHostileClientFixture:(ref:string)=>unknown
 readServiceRecoveryFixture:(ref:string)=>unknown
}
const FALSE={deployedSystemdUnitVerified:false as const,realKernelAttestedByTS:false as const,
 productionAclVerified:false as const,rootBypassPrevented:false as const,
 compromisedOwnerPrevented:false as const,distributedAtomicPromotion:false as const,
 normativeAguiVerified:false as const,enterpriseSecuritySignoff:false as const,
 parentMilestoneClosed:false as const,adapterReady:false as const}
export type ServicePolicyVerdict=
 | Readonly<{status:'planned'|'reconciled';scope:'local-service-policy-observations-only';
   tenantId:string;producerId:string;leaderEpoch:number;plannedCommits:number;
   receiptReconciled:boolean}&typeof FALSE>
 | Readonly<{status:'blocked';stage:'request'|'service-policy'|'hostile-client'|
   'service-recovery'|Extract<RuntimeHardeningVerdict,{status:'blocked'}>['stage'];
   code:string}&typeof FALSE>
export function makeSelectedServicePolicyGate(adapters:ServicePolicyFixtureAdapters){
 const deny=(stage:Extract<ServicePolicyVerdict,{status:'blocked'}>['stage'],code:string):ServicePolicyVerdict=>
   ({status:'blocked',stage,code,...FALSE})
 return Object.freeze({review:(request:unknown):ServicePolicyVerdict=>{
   if(!obj(request)||!exact(request,Q)||!Q.filter(k=>k!=='mode'&&k!=='intents').every(k=>ident(request[k]))||
      !['propose','reconcile'].includes(request.mode as string)||
      !Array.isArray(request.intents)||request.intents.length!==1||
      !obj(request.intents[0])||!ident(request.intents[0].threadId)||!ident(request.intents[0].runId))
     return deny('request','invalid-service-request')
   let now:unknown,policy:unknown,hostile:unknown,recovery:unknown
   try{now=adapters.clockSeconds();policy=adapters.readServicePolicyFixture(request.servicePolicyRef as string)}
   catch{return deny('service-policy','service-policy-unavailable')}
   if(!integer(now))return deny('service-policy','invalid-clock')
   if(!obj(policy)||!exact(policy,P)||policy.kind!=='fixture-unit-policy-proposal'||
      !ident(policy.policyId)||policy.ownerUid!==61001||policy.clientUid!==61002||
      policy.outsiderUid!==61003||policy.noNewPrivileges!==true||
      policy.protectSystem!=='strict'||policy.protectHome!==true||
      policy.privateTmp!==true||policy.restrictAddressFamilies!=='AF_UNIX'||
      policy.capabilityBoundingSetEmpty!==true||policy.ambientCapabilitiesEmpty!==true||
      policy.stateDirectoryMode!==448||policy.runtimeDirectoryMode!==448||
      policy.socketMode!==432||policy.unitDeployed!==false||
      policy.rootBypassPrevented!==false||!integer(policy.observedAt)||
      !integer(policy.validThrough)||policy.observedAt>now||
      now-policy.observedAt>5||policy.validThrough<=now||
      policy.validThrough-policy.observedAt>30)
     return deny('service-policy','invalid-service-policy')
   try{hostile=adapters.readHostileClientFixture(request.hostileClientRef as string)}
   catch{return deny('hostile-client','hostile-client-unavailable')}
   if(!obj(hostile)||!exact(hostile,H)||hostile.kind!=='fixture-hostile-client-probe'||
      hostile.policyId!==policy.policyId||hostile.ownerUid!==61001||
      hostile.clientUid!==61002||hostile.outsiderUid!==61003||
      hostile.invalidJsonDenied!==true||hostile.oversizedFrameDenied!==true||
      hostile.unsupportedOpDenied!==true||hostile.unprivilegedPeerDenied!==true||
      hostile.directStorageDenied!==true||hostile.idleClientTimedOut!==true||
      hostile.ownerStillRunning!==true||hostile.receiptUnchanged!==true||
      !integer(hostile.observedAt)||hostile.observedAt>now||now-hostile.observedAt>5)
     return deny('hostile-client','invalid-hostile-client-evidence')
   try{recovery=adapters.readServiceRecoveryFixture(request.serviceRecoveryRef as string)}
   catch{return deny('service-recovery','service-recovery-unavailable')}
   if(!obj(recovery)||!exact(recovery,R)||recovery.kind!=='fixture-service-restart-observation'||
      recovery.policyId!==policy.policyId||!integer(recovery.bootEpoch)||
      recovery.bootEpoch<2||!integer(recovery.previousBootEpoch)||
      recovery.previousBootEpoch+1!==recovery.bootEpoch||
      !integer(recovery.oldSocketInode)||!integer(recovery.newSocketInode)||
      recovery.oldSocketInode<1||recovery.newSocketInode<1||
      recovery.oldSocketInode===recovery.newSocketInode||
      recovery.staleSocketDenied!==true||recovery.lostAckReconciled!==true||
      recovery.receiptUnique!==true||recovery.ownerRunning!==true||
      !integer(recovery.observedAt)||recovery.observedAt>now||now-recovery.observedAt>5)
     return deny('service-recovery','invalid-service-recovery')
   const {servicePolicyRef:_p,hostileClientRef:_h,serviceRecoveryRef:_r,...prior}=request
   void _p;void _h;void _r
   let upstream:RuntimeHardeningVerdict
   try{upstream=makeSelectedRuntimeHardeningGate(adapters).review(prior)}
   catch{return deny('runtime-owner','published-2.6X-unavailable')}
   if(upstream.status==='blocked')return deny(upstream.stage,upstream.code)
   return {status:upstream.status,scope:'local-service-policy-observations-only',
     tenantId:upstream.tenantId,producerId:upstream.producerId,
     leaderEpoch:upstream.leaderEpoch,plannedCommits:upstream.plannedCommits,
     receiptReconciled:upstream.receiptReconciled,...FALSE}
 }})
}
export function reviewServicePolicyBlockers(){
 const prior=reviewRuntimeHardeningBlockers()
 return Object.freeze({allNineGapsOpen:prior.allNineGapsOpen,
 parentMilestoneOpen:prior.parentMilestoneOpen,priorAdapterBlocked:prior.priorAdapterBlocked,
 deployedServiceVerified:false as const,hostileClientProofConsumedInTS:false as const,
 rootBypassPrevented:false as const,ownerCompromisePrevented:false as const,
 crossHostDurability:false as const,atomicThreeStorePromotion:false as const,
 operationalIssuerAclVerified:false as const,independentNormativeAgui:false as const,
 mediaDlpApproved:false as const,enterpriseSecuritySignoff:false as const,
 adapterReady:false as const,scope:'temporary-local-policy-candidate-only' as const})
}
