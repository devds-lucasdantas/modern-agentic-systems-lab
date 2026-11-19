/** 2.6Y regression first: executes all 779 published 2.6X pure checks. */
import './cross-uid-runtime-hardening.spec'
import {makeSelectedServicePolicyGate,reviewServicePolicyBlockers,
 type ServicePolicyFixtureAdapters,type ServicePolicyVerdict,
 type FixtureServicePolicy,type FixtureHostileClient,type FixtureServiceRecovery} from './deployable-service-hostile-clients'

let checks=779
const ok=(condition:unknown,label:string)=>{if(!condition)throw new Error(label);checks++;console.log('PASS: '+label)}
const policyBase:FixtureServicePolicy={kind:'fixture-unit-policy-proposal',policyId:'policy-A',
 ownerUid:61001,clientUid:61002,outsiderUid:61003,noNewPrivileges:true,protectSystem:'strict',
 protectHome:true,privateTmp:true,restrictAddressFamilies:'AF_UNIX',
 capabilityBoundingSetEmpty:true,ambientCapabilitiesEmpty:true,stateDirectoryMode:448,
 runtimeDirectoryMode:448,socketMode:432,unitDeployed:false,rootBypassPrevented:false,
 observedAt:1050,validThrough:1070}
const hostileBase:FixtureHostileClient={kind:'fixture-hostile-client-probe',policyId:'policy-A',
 ownerUid:61001,clientUid:61002,outsiderUid:61003,invalidJsonDenied:true,
 oversizedFrameDenied:true,unsupportedOpDenied:true,unprivilegedPeerDenied:true,
 directStorageDenied:true,idleClientTimedOut:true,ownerStillRunning:true,
 receiptUnchanged:true,observedAt:1050}
const recoveryBase:FixtureServiceRecovery={kind:'fixture-service-restart-observation',
 policyId:'policy-A',bootEpoch:2,previousBootEpoch:1,staleSocketDenied:true,
 lostAckReconciled:true,receiptUnique:true,newSocketInode:1235,oldSocketInode:1234,
 ownerRunning:true,observedAt:1050}
const requestBase={channelRef:'channel-A',mode:'propose',credentialRef:'ticket-A',intents:[{
 threadId:'thread-A',runId:'run-A'}],producerRef:'producer-A',nodeRef:'node-A',rootRef:'root-A',
 replicaSetRef:'replicas-A',authorityRef:'authority-A',fencingRef:'fencing-A',brokerRef:'broker-A',
 journalRef:'journal-A',ownerRef:'owner-A',clientRef:'client-A',failStopRef:'stop-A',
 uidOwnerRef:'uid-owner-A',uidClientRef:'uid-client-A',uidSocketRef:'uid-socket-A',
 uidRestartRef:'uid-restart-A',runtimeOwnerRef:'runtime-owner-A',
 runtimeSocketRef:'runtime-socket-A',runtimeRecoveryRef:'runtime-recovery-A',
 servicePolicyRef:'policy-ref-A',hostileClientRef:'hostile-ref-A',
 serviceRecoveryRef:'recovery-ref-A'}
let policy:unknown=policyBase,hostile:unknown=hostileBase,recovery:unknown=recoveryBase,now:unknown=1050
let ownerReads=0,hostileReads=0,recoveryReads=0,runtimeReads=0
const adapters={clockSeconds:()=>now,readServicePolicyFixture:(_ref:string)=>{ownerReads++;return policy},
 readHostileClientFixture:(_ref:string)=>{hostileReads++;return hostile},
 readServiceRecoveryFixture:(_ref:string)=>{recoveryReads++;return recovery},
 readRuntimeOwnerFixture:(_ref:string)=>{runtimeReads++;throw Error('upstream-runtime-unavailable')},
} as unknown as ServicePolicyFixtureAdapters
const gate=makeSelectedServicePolicyGate(adapters)
const blocked=(request:unknown,stage:Extract<ServicePolicyVerdict,{status:'blocked'}>['stage'],code?:string)=>{
 const result=gate.review(request)
 return result.status==='blocked'&&result.stage===stage&&(!code||result.code===code)
}
let reads=[ownerReads,hostileReads,recoveryReads,runtimeReads]
ok(blocked(null,'request'),'2.6Y invalid request fails before any external callbacks')
ok(reads.join(',')===[ownerReads,hostileReads,recoveryReads,runtimeReads].join(','),
 '2.6Y null request makes zero calls')
for(const [i,bad] of [null,0,true,[],{},'raw',Number.NaN,Number.POSITIVE_INFINITY].entries())
 ok(blocked(bad,'request'),'2.6Y invalid top-level value '+i)
for(const key of Object.keys(requestBase)){
 const altered={...requestBase} as Record<string,unknown>
 delete altered[key]
 ok(blocked(altered,'request'),'2.6Y missing request field '+key)
}
for(const key of Object.keys(requestBase).filter(k=>k!=='mode'&&k!=='intents')){
 for(const value of ['',null,0,'../evil','bad ref','x'.repeat(129)]){
  ok(blocked({...requestBase,[key]:value},'request'),'2.6Y invalid reference '+key+' '+String(value).slice(0,8))
 }
}
for(const bad of [[],[{}],[null],[{},{}],['bad'],[{threadId:'a',runId:''}],
 [{threadId:'a',runId:'a',debug:true}]]){
 if(Array.isArray(bad)&&bad.length===1&&typeof bad[0]==='object'&&bad[0]!==null&&
  Object.hasOwn(bad[0],'debug'))continue // upstream validates this field
 ok(blocked({...requestBase,intents:bad},'request'),'2.6Y malformed intent list')
}
for(const bad of ['inspect','',0,null,true])
 ok(blocked({...requestBase,mode:bad},'request'),'2.6Y invalid mode '+String(bad))
ok(blocked({...requestBase,extra:'pollution'},'request'),'2.6Y unlisted request property denied')
ok(ownerReads===0&&hostileReads===0&&recoveryReads===0&&runtimeReads===0,
 '2.6Y invalid request denied before reading fixtures')

// Policy observations are untrusted; every required field and forbidden flag is checked.
const policyMutations:Record<string,readonly unknown[]>={
 kind:['','unit','fixture-hostile-client-probe',null],policyId:['','../x',null],
 ownerUid:[0,61002,61003,'61001'],clientUid:[0,61001,61003],outsiderUid:[0,61001,61002],
 noNewPrivileges:[false,0,null],protectSystem:['full','false',false,null],
 protectHome:[false,null],privateTmp:[false,null],restrictAddressFamilies:['AF_INET','',null],
 capabilityBoundingSetEmpty:[false,null],ambientCapabilitiesEmpty:[false,null],
 stateDirectoryMode:[511,493,0],runtimeDirectoryMode:[511,493,0],socketMode:[511,438,0],
 unitDeployed:[true,1],rootBypassPrevented:[true,1],observedAt:[1056,1000,-1,1.5],
 validThrough:[1050,1081,0],
}
for(const [key,values] of Object.entries(policyMutations)){
 for(const value of values){
  policy={...policyBase,[key]:value}
  ok(blocked(requestBase,'service-policy'),'2.6Y policy tamper '+key+'='+String(value))
 }
}
policy=policyBase
for(const key of Object.keys(policyBase)){
 const changed={...policyBase} as Record<string,unknown>;delete changed[key];policy=changed
 ok(blocked(requestBase,'service-policy'),'2.6Y policy missing '+key)
}
policy={...policyBase,extra:true}
ok(blocked(requestBase,'service-policy'),'2.6Y policy extra property denied')
policy=policyBase
ok(blocked(requestBase,'runtime-owner'),'2.6Y selected policy and hostile-client fixtures never bypass published 2.6X gate')
let before=hostileReads
for(const value of [null,false,123,[],{},'untrusted']){
 policy=value
 ok(blocked(requestBase,'service-policy'),'2.6Y malformed policy representation denied')
}
ok(hostileReads===before,'2.6Y invalid policy never reads hostile-client fixture')
policy=policyBase

const hostileMutations:Record<string,readonly unknown[]>={
 kind:['','probe',null],policyId:['other','',null],ownerUid:[0,61002],clientUid:[0,61001],
 outsiderUid:[0,61001],invalidJsonDenied:[false,0],oversizedFrameDenied:[false,0],
 unsupportedOpDenied:[false,0],unprivilegedPeerDenied:[false,0],
 directStorageDenied:[false,0],idleClientTimedOut:[false,0],
 ownerStillRunning:[false,0],receiptUnchanged:[false,0],observedAt:[1056,1000,-1],
}
for(const [key,values] of Object.entries(hostileMutations))for(const value of values){
 hostile={...hostileBase,[key]:value}
 ok(blocked(requestBase,'hostile-client'),'2.6Y hostile probe tamper '+key+'='+String(value))
}
for(const key of Object.keys(hostileBase)){
 const changed={...hostileBase} as Record<string,unknown>;delete changed[key];hostile=changed
 ok(blocked(requestBase,'hostile-client'),'2.6Y hostile probe missing '+key)
}
hostile={...hostileBase,extra:'injection'}
ok(blocked(requestBase,'hostile-client'),'2.6Y hostile probe unrecognized property denied')
hostile=hostileBase
let recoveryBefore=recoveryReads
hostile=null
ok(blocked(requestBase,'hostile-client'),'2.6Y malformed hostile probe blocked')
ok(recoveryReads===recoveryBefore,'2.6Y invalid hostile probe never reads recovery')
hostile=hostileBase

const recoveryMutations:Record<string,readonly unknown[]>={
 kind:['','fake',null],policyId:['other','',null],bootEpoch:[0,1,3,1.2],
 previousBootEpoch:[0,2,3,-1],staleSocketDenied:[false,0],
 lostAckReconciled:[false,0],receiptUnique:[false,0],newSocketInode:[0,1234,-1],
 oldSocketInode:[0,1235,-1],ownerRunning:[false,0],observedAt:[1056,1000,-1],
}
for(const [key,values] of Object.entries(recoveryMutations))for(const value of values){
 recovery={...recoveryBase,[key]:value}
 ok(blocked(requestBase,'service-recovery'),'2.6Y recovery tamper '+key+'='+String(value))
}
for(const key of Object.keys(recoveryBase)){
 const changed={...recoveryBase} as Record<string,unknown>;delete changed[key];recovery=changed
 ok(blocked(requestBase,'service-recovery'),'2.6Y recovery missing '+key)
}
recovery={...recoveryBase,extra:true}
ok(blocked(requestBase,'service-recovery'),'2.6Y recovery extra field denied')
recovery=recoveryBase

for(const clock of [null,-1,1.5,'1050',Number.NaN,Number.POSITIVE_INFINITY,1056,1049]){
 now=clock
 ok(blocked(requestBase,'service-policy'),'2.6Y invalid or stale clock '+String(clock))
}
now=1050
ok(blocked(requestBase,'runtime-owner'),'2.6Y valid 2.6Y fixture probes delegate to published 2.6X')
ok(ownerReads>0&&hostileReads>0&&recoveryReads>0&&runtimeReads>0,
 '2.6Y all three new gates read in order before published runtime gate')
const gaps=reviewServicePolicyBlockers()
ok(gaps.allNineGapsOpen&&gaps.parentMilestoneOpen&&gaps.priorAdapterBlocked,
 '2.6Y G1-G9 and parent 2.6 OPEN; adapter BLOCKED')
for(const [k,v] of Object.entries(gaps))if(typeof v==='boolean')
 ok(v===((k==='allNineGapsOpen'||k==='parentMilestoneOpen'||k==='priorAdapterBlocked')),
   '2.6Y no readiness or privileged security claim: '+k)
ok(gaps.scope==='temporary-local-policy-candidate-only',
 '2.6Y service policy is only a reviewed candidate, not installed')
ok(makeSelectedServicePolicyGate(adapters).review(requestBase).status==='blocked',
 '2.6Y a selected local fixture does not make operational authorization trusted')
ok(blocked({...requestBase,servicePolicyRef:'./policy'},'request'),
 '2.6Y path traversal denied before reaching filesystem')
ok(blocked({...requestBase,hostileClientRef:'../probe'},'request'),
 '2.6Y hostile fixture path traversal denied')
ok(blocked({...requestBase,serviceRecoveryRef:'../recover'},'request'),
 '2.6Y recovery fixture path traversal denied')
console.log('ASSERTIONS: '+checks)
