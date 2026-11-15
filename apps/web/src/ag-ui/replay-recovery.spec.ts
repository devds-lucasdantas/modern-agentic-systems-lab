import {reviewSelectedRecovery,reviewRecoverySecurityGates,type RecoveryAttempt} from './replay-recovery';
import type {HttpReviewInput} from './stream-boundary';
import {reviewSelectedAgUiWire} from './pipeline-transport';

let checks=0;
const check=(condition:boolean,label:string):void=>{
  if(!condition)throw Error('FAIL: '+label);
  checks++;console.log('PASS: '+label);
};
const enc=(s:string):Uint8Array=>new TextEncoder().encode(s);
const wire=(events:readonly unknown[]):Uint8Array[]=>[enc(events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join(''))];
const http:HttpReviewInput={requestMethod:'POST',requestContentType:'application/json',
  requestAccept:'text/event-stream',responseStatus:200,responseContentType:'text/event-stream',
  lastEventIdSent:false};
const started={type:'RUN_STARTED',threadId:'thread-A',runId:'run-A',protocolVersion:'1.0'};
const finished={type:'RUN_FINISHED',threadId:'thread-A',runId:'run-A'};
const messageStart={type:'TEXT_MESSAGE_START',messageId:'m',role:'assistant'};
const messageContent={type:'TEXT_MESSAGE_CONTENT',messageId:'m',delta:'Olá'};
const messageEnd={type:'TEXT_MESSAGE_END',messageId:'m'};
const events=[started,messageStart,messageContent,messageEnd,finished];
const candidate=(patch:Partial<RecoveryAttempt>={}):RecoveryAttempt=>({
  tenantRef:'tenant-A',threadId:'thread-A',runId:'run-A',attemptId:'attempt-1',
  ordinal:1,mode:'full-restart',wire:wire(events),http,connectionEnded:true,...patch,
});
const blocked=(x:unknown,code:string,label:string):void=>{
  const result=reviewSelectedRecovery(x);
  check(result.status==='blocked'&&result.code.includes(code),label);
  check(result.status==='blocked'&&result.exposedCount===0,
    `${label}: no partial output emitted`);
  check(result.authorizationVerified===false&&result.persistenceVerified===false&&
    result.adapterReady===false,`${label}: no implicit trust escalation`);
};
const accepted=(items:RecoveryAttempt[],label:string):void=>{
  const res=reviewSelectedRecovery(items);
  check(res.status==='accepted',label);
  if(res.status==='accepted'){
    check(res.authorizationVerified===false&&res.persistenceVerified===false,
      `${label}: selected volatile review never claims auth or durability`);
    check(!res.adapterReady&&res.noApplicationSink,
      `${label}: neither adapter nor real sink enabled`);
    check(res.coverage==='selected-volatile-local-replay',
      `${label}: coverage explicitly limited`);
  }
};

const p=reviewSelectedAgUiWire(wire(events),http,true);
check(p.status==='accepted','2.6J published pipeline selected complete run accepted');
const first=reviewSelectedRecovery([candidate()]);
check(first.status==='accepted','single complete full-restart review accepted');
if(first.status==='accepted'){
  check(first.committed.length===1,'one selected run committed only as a pure result');
  check(first.duplicatesSuppressed===0,'no duplicate in first complete attempt');
  check(first.abortedObserved===0,'no aborted observations in first attempt');
  check(first.committed[0]!.tenantRef==='tenant-A','declared tenant reference retained without authorization claim');
  check(first.committed[0]!.runId==='run-A','run identifier retained');
  check(first.committed[0]!.attemptId==='attempt-1','first completion attempt recorded');
  check(!('events' in first),'no raw event payload returned by recovery review');
  check(!('fingerprint' in first),'no replay equality sentinel exposed');
}
accepted([candidate()],'single complete batch acceptance metadata');
const dup=reviewSelectedRecovery([candidate(),candidate({ordinal:2,attemptId:'attempt-2'})]);
check(dup.status==='accepted','exact repeated local batch is suppressed');
if(dup.status==='accepted'){
  check(dup.committed.length===1,'exact duplicate does not create second completion');
  check(dup.duplicatesSuppressed===1,'duplicate suppression recorded');
  check(dup.committed[0]!.attemptId==='attempt-1','original completed attempt wins');
}
const abort=candidate({mode:'aborted-observation',wire:wire(events.slice(0,-1)),
  attemptId:'attempt-abort'});
const aborted=reviewSelectedAgUiWire(abort.wire,abort.http,true);
check(aborted.status==='blocked','2.6J rejects truncated observation without terminal');
const recovery=reviewSelectedRecovery([
  abort,candidate({ordinal:2,attemptId:'attempt-restart'}),
]);
check(recovery.status==='accepted','discard incomplete observation then accept full restart');
if(recovery.status==='accepted'){
  check(recovery.abortedObserved===1,'observed aborted attempt counted without exposure');
  check(recovery.committed.length===1,'full restart commits exactly one selected completion');
  check(recovery.committed[0]!.attemptId==='attempt-restart','restart rather than abort is observable');
}
const abortNotEnded=candidate({mode:'aborted-observation',wire:wire(events.slice(0,-1)),
  connectionEnded:false,attemptId:'unfinished'});
accepted([abortNotEnded,candidate({ordinal:2,attemptId:'restart'})],
  'open stream observed then full restart accepted without resume');
const badFrame=candidate({mode:'aborted-observation',
  wire:[enc('data: {"type":"RUN_STARTED"}')],attemptId:'incomplete-frame'});
accepted([badFrame,candidate({ordinal:2,attemptId:'full-after-frame'})],
  'unterminated frame discarded before complete restart');
const secondRun=[{...started,runId:'run-B'}, {...finished,runId:'run-B'}];
const independent=candidate({runId:'run-B',attemptId:'attempt-B',wire:wire(secondRun)});
accepted([candidate(),independent], 'independent declared run allowed in same synthetic tenant');
const two=reviewSelectedRecovery([candidate(),independent]);
check(two.status==='accepted' && two.committed.length===2,'two distinct completed run references returned');

blocked([], 'attempt-count-limit','empty attempts fail closed');
blocked(null,'attempt-count-limit','non-array attempts fail closed');
blocked([candidate(),...Array.from({length:24},(_,i)=>candidate({attemptId:`extra-${i}`}))],
  'attempt-count-limit','25 segments exceed local bound');
for(const value of [null,1,'text',false,[]])
  blocked([value],'attempt-object-required',`malformed attempt object ${JSON.stringify(value)}`);
blocked([{}],'untrusted-attempt-fields','empty object has no required fields');
for(const [field,value] of [
  ['tenantRef',''],['tenantRef','tenant space'],['tenantRef','x'.repeat(129)],
  ['threadId',undefined],['runId',null],['attemptId','a/b'],['attemptId',''],
] as const){
  blocked([{...candidate(),[field]:value}],'invalid-declared-identity',
    `invalid scope/attempt identity ${field} ${String(value).slice(0,20)}`);
}
for(const ordinal of [0,-1,1.5,1025,Infinity,NaN,'1',null])
  blocked([candidate({ordinal:ordinal as number})],'invalid-ordinal',
    `invalid ordinal ${String(ordinal)}`);
for(const mode of ['unknown','last-event-id',null,42,'resume' ])
  blocked([candidate({mode:mode as RecoveryAttempt['mode']})],'unknown-recovery-mode',
    `unknown recovery request ${String(mode)}`);
for(const [field,value] of [
  ['wire',null],['wire',[]],['wire',[new Uint8Array(),null]],
  ['http',null],['connectionEnded','true'],
] as const){
  const bad={...candidate(),[field]:value};
  if(field==='wire'&&Array.isArray(value)&&value.length===0){
    // Empty but well-typed wire is parsed and rejected by the existing 2.6J pipeline.
    blocked([bad],'full-restart-no-run','empty wire rejected by selected pipeline');
  }else blocked([bad],'invalid-wire-metadata',`malformed wire metadata ${field}`);
}
for(const field of ['authorizationVerified','durableCheckpoint','serverResumptionToken',
  'securityApproved','id','secretToken','adapterReady','producerSignature'])
  blocked([{...candidate(),[field]:true}],'untrusted-attempt-fields',
    `self-attested privileged field ${field} cannot authorize resume`);
const removed={...candidate()} as Record<string,unknown>;delete removed.mode;
blocked([removed],'untrusted-attempt-fields','missing recovery mode fails closed');
const retry={...candidate(),mode:'resume-request' as const};
blocked([retry],'resume-not-verified','resume request rejected without trusted checkpoint');
blocked([abort,{...retry,ordinal:2,attemptId:'resume-attempt'}],
  'resume-not-verified','resume after truncated wire remains blocked');
blocked([candidate({http:{...http,lastEventIdSent:true}})],
  'sse-event-id-not-resume-authority','Last-Event-ID is not an AG-UI recovery credential');
blocked([candidate(),candidate({ordinal:2,attemptId:'attempt-1'})],
  'attempt-id-reused','same attempt identifier cannot be reissued');
blocked([candidate(),candidate({ordinal:3,attemptId:'attempt-2'})],
  'ordinal-not-contiguous','skip in local replay ordinal fails');
blocked([candidate(),candidate({ordinal:1,attemptId:'attempt-2'})],
  'ordinal-not-contiguous','ordinal rewind in same declared run fails');
blocked([abort,candidate({ordinal:3,attemptId:'skipped-after-abort'})],
  'ordinal-not-contiguous','skipped ordinal after aborted observation fails');
blocked([abort,candidate({ordinal:2,runId:'run-B',attemptId:'wrong-restart'})],
  'recovery-scope-mismatch','attempt cannot recover different run');
blocked([abort,candidate({ordinal:2,tenantRef:'tenant-B',attemptId:'wrong-tenant'})],
  'cross-tenant-identity-collision','cross-tenant identity collision rejected');
blocked([candidate(),candidate({tenantRef:'tenant-B',attemptId:'attempt-2'})],
  'cross-tenant-identity-collision','declared same run across tenants rejected');
blocked([abort],'incomplete-without-full-restart','truncated attempt without full restart never commits');
blocked([abort,candidate({mode:'aborted-observation',ordinal:2,attemptId:'aborted-again'})],
  'nested-abort-without-restart','multiple abort observations cannot imply progress');
blocked([candidate(),candidate({mode:'aborted-observation',ordinal:2,attemptId:'abort-after'})],
  'abort-after-committed','cannot report abort after complete batch');
blocked([candidate({mode:'aborted-observation',wire:wire(events)})],
  'not-an-allowed-incomplete-observation','complete wire cannot be disguised as aborted');
blocked([candidate({mode:'aborted-observation',wire:wire([started,{type:'TEXT_MESSAGE_START',messageId:'m',role:42}])})],
  'not-an-allowed-incomplete-observation','malformed known field is not recoverable truncation');
const mutatedBody=[started,messageStart,{...messageContent,delta:'DIFFERENT'},messageEnd,finished];
blocked([candidate(),candidate({ordinal:2,attemptId:'attempt-2',wire:wire(mutatedBody)})],
  'replayed-payload-conflict','same declared run with different data is not a duplicate');
blocked([candidate({threadId:'wrong-thread'})],
  'declared-run-identity-mismatch','attested thread must match decoded run');
blocked([candidate({runId:'wrong-run'})],
  'declared-run-identity-mismatch','attested run must match decoded run');
const runError=[started,finished,{type:'RUN_ERROR',message:'late error'}];
blocked([candidate({wire:wire(runError)})],
  'not-single-successful-run','late RUN_ERROR never becomes successful replay');
const twoRuns=[started,finished,{...started,runId:'r2'},{...finished,runId:'r2'}];
blocked([candidate({wire:wire(twoRuns)})],
  'unreviewed-selected-lifecycle','multiple completed runs not proof of single recovery scope');
blocked([candidate({wire:wire(events.slice(0,-1))})],
  'full-restart-','truncated full restart never commits');
blocked([candidate({connectionEnded:false})],
  'full-restart-stream-not-ended','still-open stream cannot be called complete');
blocked([candidate(),candidate({ordinal:2,attemptId:'attempt-2',wire:wire(mutatedBody)}),independent],
  'replayed-payload-conflict','atomic review cannot expose prior completed batch after conflict');
const gates=reviewRecoverySecurityGates();
check(gates.allNineOpen,'all nine normative/conformance gaps remain open');
check(gates.requiredGaps.join(',')==='G1,G3,G5,G7,G8,G9',
  'normative/validation/pipeline/security/adapter blockers retained');
for(const [key,value] of [
  ['upstreamPartSourceResolved',gates.upstreamPartSourceResolved],
  ['independentAuthzReview',gates.independentAuthzReview],
  ['tenantIsolationProven',gates.tenantIsolationProven],
  ['durableCheckpointProven',gates.durableCheckpointProven],
  ['crossClientCASProven',gates.crossClientCASProven],
  ['idempotencyAcrossProcessesProven',gates.idempotencyAcrossProcessesProven],
  ['mediaDlpReviewProven',gates.mediaDlpReviewProven],
  ['adapterReady',gates.adapterReady],
] as const)check(value===false,`${key}: no independent evidence, still blocked`);
check(gates.parentMilestoneOpen,'parent AG-UI 2.6 stays OPEN');
check(gates.underlyingReadinessBlocked,'2.6H published readiness gate remains blocked');
check(gates.scope==='planning-and-selected-volatile-tests-only','security gate scope is explicit');
check(Object.isFrozen(gates)&&Object.isFrozen(gates.requiredGaps),
  'security prerequisite inventory is immutable in review');
console.log(`${checks} 2.6K selected replay/recovery/security assertions passed`);
