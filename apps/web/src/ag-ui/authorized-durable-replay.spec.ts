import {reviewSelectedAuthorizedDurablePlan,reviewDurableAuthorizationGates,
  type SyntheticServerContext,type CheckpointProjection,type ReplayIntent,
  type DurableContractVerdict} from './authorized-durable-replay';
import type {RecoveryAttempt} from './replay-recovery';
import type {HttpReviewInput} from './stream-boundary';

let count=0;
const check=(ok:boolean,label:string):void=>{if(!ok)throw new Error('FAIL: '+label);
  count++;console.log('PASS: '+label)};
const encode=(s:string):Uint8Array=>new TextEncoder().encode(s);
const http:HttpReviewInput={requestMethod:'POST',requestContentType:'application/json',
  requestAccept:'text/event-stream',responseStatus:200,responseContentType:'text/event-stream',
  lastEventIdSent:false};
const events=(thread='thread-A',run='run-A')=>[
  {type:'RUN_STARTED',threadId:thread,runId:run,protocolVersion:'1.0'},
  {type:'RUN_FINISHED',threadId:thread,runId:run},
];
const wire=(thread='thread-A',run='run-A'):readonly Uint8Array[]=>[
  encode(events(thread,run).map(v=>'data: '+JSON.stringify(v)+'\n\n').join('')),
];
const attempt=(thread='thread-A',run='run-A'):RecoveryAttempt=>({
  tenantRef:'tenant-A',threadId:thread,runId:run,attemptId:'attempt-'+run,
  ordinal:1,mode:'full-restart',wire:wire(thread,run),http,connectionEnded:true,
});
const context:SyntheticServerContext={origin:'synthetic-server-boundary',
  principalId:'principal-A',tenantId:'tenant-A',allowedThreadIds:['thread-A','thread-B'],
  policyEpoch:7};
const seed:CheckpointProjection={tenantId:'tenant-A',policyEpoch:7,revision:0,receipts:[]};
const signature='a'.repeat(64);
const intent=(props:Partial<ReplayIntent>={}):ReplayIntent=>({operation:'commit',
  tenantRef:'tenant-A',threadId:'thread-A',runId:'run-A',
  idempotencyKey:'idem-A',declaredCommitment:signature,expectedRevision:0,
  attempts:[attempt()],...props});
const evaluate=(items:unknown=[intent()],ctx:unknown=context,snapshot:unknown=seed)=>
  reviewSelectedAuthorizedDurablePlan(ctx,snapshot,items);
const blocked=(verdict:DurableContractVerdict,code:string,label:string):void=>{
  check(verdict.status==='blocked'&&verdict.code===code,label);
  check(verdict.exposedEventCount===0,label+': no event exposure');
  check(!verdict.adapterReady&&!verdict.authenticationVerified&&!verdict.persistenceVerified&&
    !verdict.casAtomicityVerified&&!verdict.commitmentVerified,label+': no trust promotion');
};
const allow=(verdict:DurableContractVerdict,label:string):void=>
  check(verdict.status==='planned',label);

const initial=evaluate();allow(initial,'selected 2.6K recovery composes with authorization and CAS plan');
if(initial.status==='planned'){
  check(initial.commits===1,'one synthetic new receipt planned');
  check(initial.next.revision===1,'revision increments after first plan');
  check(initial.next.receipts.length===1,'one receipt proposed');
  check(initial.next.receipts[0]?.commitRevision===1,'receipt revision is monotonic');
  check(initial.next.receipts[0]?.principalId==='principal-A','server-context principal projected');
  check(initial.next.receipts[0]?.tenantId==='tenant-A','tenant scope retained in receipt');
  check(initial.next.receipts[0]?.idempotencyKey==='idem-A','idempotency key is scoped');
  check(initial.next.receipts[0]?.declaredCommitment===signature,'unverified declaration retained as string only');
  check(initial.duplicates===0&&initial.replayChecks===0,'no duplicate in first commit');
  check(initial.coverage==='synthetic-authorization-and-cas-only','coverage is explicitly synthetic');
  check(initial.exposedEventCount===0&&!('events' in initial),'no events exposed through plan');
  check(!initial.persistenceVerified&&!initial.casAtomicityVerified,'no durable/CAS proof claimed');
  check(!initial.authenticationVerified&&!initial.commitmentVerified,'no external auth or hash verification');
  check(seed.revision===0&&seed.receipts.length===0,'original checkpoint projection not mutated');
}
const double=evaluate([intent(),intent({operation:'replay-check'})]);
allow(double,'commit then same-key replay check yields one projected receipt');
if(double.status==='planned'){
  check(double.commits===1&&double.replayChecks===1,'replay-check does not increment revision');
  check(double.next.revision===1&&double.next.receipts.length===1,'replay-check produces no extra receipt');
}
const duplicate=evaluate([intent(),intent()]);
allow(duplicate,'same-key complete duplicate is suppressed in synthetic plan');
if(duplicate.status==='planned'){
  check(duplicate.commits===1&&duplicate.duplicates===1,'duplicate count increments without new commit');
  check(duplicate.next.revision===1,'duplicate does not increment CAS revision');
}
const prior=initial.status==='planned'?initial.next:seed;
const replayPrior=evaluate([intent({operation:'replay-check',expectedRevision:0})],context,prior);
allow(replayPrior,'stale expected revision allowed only for exact existing receipt replay-check');
if(replayPrior.status==='planned'){
  check(replayPrior.commits===0&&replayPrior.replayChecks===1,'stored receipt replay-check is read-only');
  check(replayPrior.next.revision===1,'stored receipt replay-check does not advance revision');
}
const sameCommit=evaluate([intent({expectedRevision:0})],context,prior);
allow(sameCommit,'same-key repeat commit is idempotent in synthetic snapshot');
if(sameCommit.status==='planned')check(sameCommit.duplicates===1,'duplicate exact key/commitment recorded');
const second=intent({threadId:'thread-B',runId:'run-B',idempotencyKey:'idem-B',
  expectedRevision:1,attempts:[attempt('thread-B','run-B')]});
allow(evaluate([second],context,prior),'second thread with correct revision can plan separate receipt');
const competing=intent({threadId:'thread-B',runId:'run-B',idempotencyKey:'idem-B',
  attempts:[attempt('thread-B','run-B')]});
const clientA=evaluate([intent()]);
const clientB=evaluate([competing]);
check(clientA.status==='planned'&&clientB.status==='planned',
  'two independent planners can race from identical revision: NOT actual CAS proof');
if(clientA.status==='planned'){
  blocked(evaluate([competing],context,clientA.next),'cas-revision-conflict',
    'only a reloaded state can reject stale competing revision in pure simulation');
}

const ordered=evaluate([intent(),second]);allow(ordered,'multi-request serial CAS proposal succeeds');
if(ordered.status==='planned'){
  check(ordered.commits===2&&ordered.next.revision===2,'two serial commits advance revision twice');
  check(ordered.next.receipts[1]?.threadId==='thread-B','second thread remains scoped');
}

for(const value of [null,undefined,false,42,[],{},'spoofed'])
  blocked(reviewSelectedAuthorizedDurablePlan(value,seed,[intent()]),'synthetic-boundary-invalid',`missing/bogus synthetic server context ${String(value)}`);
for(const [field,value] of [
  ['origin','from-client'],['principalId',''],['principalId','a b'],
  ['tenantId',''],['tenantId','tenant/other'],['allowedThreadIds',[]],
  ['allowedThreadIds',['thread-A','thread-A']],['allowedThreadIds',['thread A']],
  ['policyEpoch',-1],['policyEpoch',1.5],['policyEpoch','7'],
] as const)blocked(evaluate([intent()],{...context,[field]:value}),
  'synthetic-boundary-invalid',`untrusted server context field ${field} ${JSON.stringify(value)}`);
for(const field of ['secret','jwt','authority','clientAuthenticated','verified','aclSigned'])
  blocked(evaluate([intent()],{...context,[field]:true}),
    'synthetic-boundary-invalid',`extra trust evidence claim ${field} is refused`);
for(const bad of [null,false,{},'snapshot',[],0])
  blocked(reviewSelectedAuthorizedDurablePlan(context,bad,[intent()]),'checkpoint-projection-invalid',
    `invalid checkpoint projection ${JSON.stringify(bad)}`);
for(const [field,value,code] of [
  ['tenantId','tenant-B','checkpoint-projection-invalid'],
  ['policyEpoch',8,'policy-epoch-stale'],
  ['policyEpoch',-1,'checkpoint-projection-invalid'],
  ['revision',1,'checkpoint-revision-inconsistent'],
  ['revision',-1,'checkpoint-projection-invalid'],
  ['receipts',null,'checkpoint-projection-invalid'],
] as const)blocked(evaluate([intent()],context,{...seed,[field]:value}),code,
  `invalid/stale checkpoint ${field}=${String(value)}`);
for(const name of ['signature','verified','rootHash','trustedStore'])
  blocked(evaluate([intent()],context,{...seed,[name]:true}),
    'checkpoint-projection-invalid',`checkpoint self-attestation cannot add ${name}`);
const stored=prior.receipts[0]!;
for(const [field,value] of [
  ['tenantId','tenant-B'],['threadId','bad thread'],['runId',null],
  ['principalId',''],['idempotencyKey','bad/key'],
  ['declaredCommitment','BAD'],['commitRevision',2],
] as const)blocked(evaluate([intent()],context,{...prior,receipts:[{...stored,[field]:value}]}),
  'checkpoint-receipt-invalid',`corrupted checkpoint receipt ${field}`);
blocked(evaluate([intent()],context,{...prior,receipts:[{...stored,extra:true}]}),
  'checkpoint-receipt-invalid','checkpoint receipts cannot assert extra authority');
blocked(evaluate([intent()],context,{...prior,revision:2,
  receipts:[stored,{...stored,commitRevision:2}]}),
  'checkpoint-duplicate-receipt','stored duplicate receipt rejected');

for(const bad of [null,{},false,'intents',[],Array.from({length:17},()=>intent())])
  blocked(evaluate(bad),'intent-count-limit',`invalid intent batch ${Array.isArray(bad)?bad.length:typeof bad}`);
for(const bad of [null,3,false,'text',[]])
  blocked(evaluate([bad]),'intent-fields-untrusted',`non-object intent ${String(bad)}`);
for(const privileged of ['principalId','verifiedBy','tenantPolicyOverride','securityApproved',
  'idToken','sessionToken','serverIssuedResumeToken','casSucceeded','isAdmin','adapterReady',
  'persisted','trustedCheckpoint','authenticated','acl'])
  blocked(evaluate([{...intent(),[privileged]:true}]),'intent-fields-untrusted',
    `client-supplied authority ${privileged} refused`);
for(const missing of ['operation','tenantRef','threadId','runId','idempotencyKey',
  'declaredCommitment','expectedRevision','attempts']){
  const value:Record<string,unknown>={...intent()};delete value[missing];
  blocked(evaluate([value]),'intent-fields-untrusted',`missing intent field ${missing}`);
}
for(const operation of ['partial-resume','last-event-id',null,42,'replay','admin-commit'])
  blocked(evaluate([intent({operation:operation as ReplayIntent['operation']})]),
    'unsupported-operation',`unknown operation ${String(operation)}`);
for(const [field,value] of [
  ['tenantRef',''],['threadId','bad thread'],['runId','bad/run'],
  ['idempotencyKey',''],['idempotencyKey','?token'],
  ['declaredCommitment','0'.repeat(63)],['declaredCommitment','A'.repeat(64)],
  ['declaredCommitment','g'.repeat(64)],['expectedRevision',-1],
  ['expectedRevision',1.5],['expectedRevision','0'],['attempts',null],
] as const)blocked(evaluate([intent({[field]:value})]),'intent-shape-invalid',
  `invalid intent field ${field} ${String(value).slice(0,12)}`);
blocked(evaluate([intent({tenantRef:'tenant-B'})]),'tenant-boundary-denied',
  'untrusted tenant reference cannot override synthetic server tenant');
blocked(evaluate([intent({threadId:'thread-C'})]),'thread-authorization-denied',
  'synthetic thread allow-list enforced before replay');
blocked(evaluate([intent({operation:'resume'})]),'resume-credential-not-established',
  'no operational resume credentials in 2.6L');
blocked(evaluate([intent({operation:'replay-check'})]),'replay-receipt-missing',
  'replay-check requires a checkpoint receipt');
blocked(evaluate([intent({expectedRevision:1})]),'cas-revision-conflict',
  'stale/incorrect optimistic revision blocked for new commit');
blocked(evaluate([intent(),second,intent({idempotencyKey:'idem-B'})]),
  'idempotency-scope-conflict',
  'cross-scope reused idempotency key in batch fails closed');
blocked(evaluate([intent(),intent({declaredCommitment:'b'.repeat(64)})]),
  'declared-commitment-conflict','conflicting declared commitment fails closed');
blocked(evaluate([intent(),intent({idempotencyKey:'alternate'})]),
  'run-already-committed','same selected run cannot be committed twice under different keys');
blocked(evaluate([intent(),second,{...intent(),declaredCommitment:'b'.repeat(64)}]),
  'declared-commitment-conflict','failed final operation exposes no partial plan');
blocked(evaluate([intent({attempts:[]})]),'selected-recovery-proof-missing',
  'missing 2.6K proof blocks CAS plan');
blocked(evaluate([intent({attempts:[attempt('thread-B','run-B')]})]),
  'selected-recovery-proof-missing','selected 2.6K decoded identities must match intent');
blocked(evaluate([intent({attempts:[{...attempt(),tenantRef:'tenant-B'}]})]),
  'selected-recovery-proof-missing','2.6K declared tenant must match authorized plan');
blocked(evaluate([intent({attempts:[{...attempt(),connectionEnded:false}]})]),
  'selected-recovery-proof-missing','truncated candidate cannot enter CAS simulation');
const differentContext={...context,principalId:'principal-B'};
blocked(evaluate([intent()],differentContext,prior), 'idempotency-scope-conflict',
  'same receipt cannot be replayed by a different principal');
blocked(evaluate([intent({idempotencyKey:'new',expectedRevision:1})],context,prior),
  'run-already-committed','already completed run cannot be rekeyed');
const gates=reviewDurableAuthorizationGates();
check(gates.priorAllNineOpen,'prior 2.6K gap register still nine OPEN');
check(gates.priorAdapterBlocked,'prior readiness gate still BLOCKED');
check(gates.requiredGaps.join(',')==='G1,G3,G5,G7,G8,G9',
  'normative, validation, pipeline, security, state and adapter gates retained');
for(const field of ['authenticatedPrincipalVerified','externalThreadAclVerified',
  'persistedSnapshotAuthenticated','durableAtomicCasVerified',
  'crossProcessIdempotencyVerified','commitmentHashVerified',
  'transportReplayVerified','securityReviewApproved','adapterReady'] as const)
  check(gates[field]===false,`${field} remains false without independent evidence`);
check(gates.parent2_6Open,'2.6 parent milestone stays OPEN');
check(gates.scope==='synthetic-contract-evidence-only','2.6L contract scope explicit');
check(Object.isFrozen(gates)&&Object.isFrozen(gates.requiredGaps),
  'security prerequisite inventory immutable');
console.log(`${count} 2.6L selected authorization/durable replay contract assertions passed`);
