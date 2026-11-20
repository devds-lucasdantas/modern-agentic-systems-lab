/** MASL 2.6Z regression first: exact published 2.6Y assertions. */
import './deployable-service-hostile-clients.spec'
import {makeSelectedSupervisedGate,reviewSupervisedBlockers,type SupervisedFixtureAdapters,
 type SupervisedVerdict,type FixtureUnit,type FixtureServiceHostile,
 type FixtureSupervisorRestart} from './supervised-service-policy'
let count=1169
const ok=(v:unknown,label:string)=>{if(!v)throw Error(label);count++;console.log('PASS: '+label)}
const unit:FixtureUnit={kind:'fixture-systemd-transient-unit',unitId:'masl26z-test',serviceManager:'systemd-system',
 ownerUid:61001,clientUid:61002,outsiderUid:61003,noNewPrivileges:true,protectSystem:'strict',
 protectHome:true,privateTmp:true,capabilityBoundingSetEmpty:true,ambientCapabilitiesEmpty:true,
 active:true,mainPid:888,observedAt:1050,unitInstalledPersistently:false,rootBypassPrevented:false}
const hostile:FixtureServiceHostile={kind:'fixture-systemd-hostile-client',unitId:'masl26z-test',
 directStorageDenied:true,unauthorizedPeerDenied:true,invalidJsonDenied:true,
 oversizedFrameDenied:true,idleClientDenied:true,ownerSurvived:true,receiptUnchanged:true,observedAt:1050}
const restart:FixtureSupervisorRestart={kind:'fixture-systemd-restart',unitId:'masl26z-test',
 previousBootEpoch:1,bootEpoch:3,previousMainPid:777,currentMainPid:888,
 socketInodeBefore:1111,socketInodeAfter:2222,lostAckReconciled:true,promotionRecovered:true,
 staleEpochDenied:true,oldSocketDenied:true,ownerActive:true,observedAt:1050}
const req={channelRef:'channel-A',mode:'propose',credentialRef:'ticket-A',
 intents:[{threadId:'thread-A',runId:'run-A'}],producerRef:'producer-A',nodeRef:'node-A',
 rootRef:'root-A',replicaSetRef:'replicas-A',authorityRef:'authority-A',fencingRef:'fencing-A',
 brokerRef:'broker-A',journalRef:'journal-A',ownerRef:'owner-A',clientRef:'client-A',
 failStopRef:'stop-A',uidOwnerRef:'uid-owner-A',uidClientRef:'uid-client-A',
 uidSocketRef:'uid-socket-A',uidRestartRef:'uid-restart-A',runtimeOwnerRef:'runtime-owner-A',
 runtimeSocketRef:'runtime-socket-A',runtimeRecoveryRef:'runtime-recovery-A',
 servicePolicyRef:'policy-A',hostileClientRef:'hostile-A',serviceRecoveryRef:'recover-A',
 unitStatusRef:'unit-A',hostileServiceRef:'hostile-supervisor-A',supervisorRestartRef:'restart-A'}
let u:unknown=unit,h:unknown=hostile,r:unknown=restart,clock:unknown=1050
let calls=[0,0,0,0]
const adapters={clockSeconds:()=>clock,
 readUnitStatusFixture:(_ref:string)=>{calls[0]++;return u},
 readHostileServiceFixture:(_ref:string)=>{calls[1]++;return h},
 readSupervisorRestartFixture:(_ref:string)=>{calls[2]++;return r},
 readServicePolicyFixture:(_ref:string)=>{calls[3]++;throw Error('upstream-fixture-unavailable')}
} as unknown as SupervisedFixtureAdapters
const gate=makeSelectedSupervisedGate(adapters)
const deny=(q:unknown,stage:string)=>{const x:SupervisedVerdict=gate.review(q);return x.status==='blocked'&&x.stage===stage}
ok(deny(null,'request'),'2.6Z null request denied before any callback')
ok(calls.every(x=>x===0),'2.6Z malformed request performs zero reads')
for(const [i,value] of [null,0,1.5,false,[],{},'bogus',Number.NaN].entries())
 ok(deny(value,'request'),'2.6Z invalid request '+i)
for(const k of Object.keys(req)){
 const altered={...req} as Record<string,unknown>;delete altered[k]
 ok(deny(altered,'request'),'2.6Z missing field '+k)
}
for(const k of Object.keys(req).filter(k=>k!=='intents'&&k!=='mode'))for(const bad of ['',null,0,'../leak','evil ref', 'x'.repeat(130)])
 ok(deny({...req,[k]:bad},'request'),'2.6Z invalid reference '+k+' '+String(bad).slice(0,6))
ok(deny({...req,extra:'unsafe'},'request'),'2.6Z unknown request field denied')
ok(calls.every(x=>x===0),'2.6Z invalid requests never read fixture observations')
const unitMut:Record<string,readonly unknown[]>={
 kind:['fake',null],unitId:['',null,'../unit'],serviceManager:['supervisord','',null],
 ownerUid:[0,61002],clientUid:[0,61001],outsiderUid:[0,61001],
 noNewPrivileges:[false,0],protectSystem:['full','',null],protectHome:[false,null],
 privateTmp:[false,null],capabilityBoundingSetEmpty:[false,null],ambientCapabilitiesEmpty:[false,null],
 active:[false,null],mainPid:[0,1,'888'],observedAt:[1056,1040,-1,1.5],
 unitInstalledPersistently:[true,1],rootBypassPrevented:[true,1]}
for(const [key,values] of Object.entries(unitMut))for(const value of values){
 u={...unit,[key]:value};ok(deny(req,'systemd-unit'),'2.6Z systemd observation tamper '+key+' '+String(value))
}
for(const k of Object.keys(unit)){
 const x={...unit} as Record<string,unknown>;delete x[k];u=x
 ok(deny(req,'systemd-unit'),'2.6Z missing unit field '+k)
}
u={...unit,undeclared:'escape'}
ok(deny(req,'systemd-unit'),'2.6Z systemd unit extra field denied')
u=unit
const hostileMut:Record<string,readonly unknown[]>={kind:['fake',null],unitId:['other',null],
 directStorageDenied:[false,0],unauthorizedPeerDenied:[false,null],invalidJsonDenied:[false,0],
 oversizedFrameDenied:[false,0],idleClientDenied:[false,0],ownerSurvived:[false,0],
 receiptUnchanged:[false,0],observedAt:[1056,1040,-1]}
for(const [key,values] of Object.entries(hostileMut))for(const value of values){
 h={...hostile,[key]:value};ok(deny(req,'hostile-client'),'2.6Z hostile observation tamper '+key)
}
for(const k of Object.keys(hostile)){
 const x={...hostile} as Record<string,unknown>;delete x[k];h=x
 ok(deny(req,'hostile-client'),'2.6Z missing hostile field '+k)
}
h={...hostile,extra:true};ok(deny(req,'hostile-client'),'2.6Z hostile extra field denied');h=hostile
const restartMut:Record<string,readonly unknown[]>={
 kind:['fake',null],unitId:['other',null],previousBootEpoch:[0,3,-1],bootEpoch:[0,1,2],
 previousMainPid:[0,1,888],currentMainPid:[0,1,777,999],socketInodeBefore:[0,2222],
 socketInodeAfter:[0,1111],lostAckReconciled:[false,0],promotionRecovered:[false,0],
 staleEpochDenied:[false,0],oldSocketDenied:[false,0],ownerActive:[false,0],
 observedAt:[1056,1040,-1]}
for(const [key,values] of Object.entries(restartMut))for(const value of values){
 r={...restart,[key]:value};ok(deny(req,'supervisor-restart'),'2.6Z supervisor observation tamper '+key+' '+String(value))
}
for(const k of Object.keys(restart)){
 const x={...restart} as Record<string,unknown>;delete x[k];r=x
 ok(deny(req,'supervisor-restart'),'2.6Z missing supervisor field '+k)
}
r={...restart,extra:true};ok(deny(req,'supervisor-restart'),'2.6Z supervisor extra field denied');r=restart
for(const v of [null,-1,1.5,'1050',Number.NaN,1056,1049]){
 clock=v;ok(deny(req,'systemd-unit'),'2.6Z invalid clock '+String(v))
}
clock=1050
ok(deny(req,'service-policy'),'2.6Z validated systemd observations still defer to published 2.6Y gate')
ok(calls.every(x=>x>0),'2.6Z all three new observations read before inherited 2.6Y')
const gaps=reviewSupervisedBlockers()
ok(gaps.allNineGapsOpen&&gaps.parentMilestoneOpen&&gaps.priorAdapterBlocked,
 '2.6Z G1-G9 and parent 2.6 OPEN; adapter BLOCKED')
for(const [key,value] of Object.entries(gaps))if(typeof value==='boolean')
 ok(value===['allNineGapsOpen','parentMilestoneOpen','priorAdapterBlocked','transientUnitNotProduction',
   'rootTrusted','independentAguiConformanceMissing'].includes(key),
 '2.6Z no forbidden readiness or root security claim '+key)
ok(gaps.scope==='isolated-transient-service-only','2.6Z transient unit never equated with production deployment')
console.log('ASSERTIONS: '+count)
