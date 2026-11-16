import {
  makeIsolatedTrustedBoundaryForTests,reviewTransactionalIdentityBlockers,
  type BoundaryVerdict,
} from './trusted-transaction-boundary'
import type {SyntheticServerContext,CheckpointProjection,ReplayIntent} from './authorized-durable-replay'
import type {RecoveryAttempt} from './replay-recovery'
import type {HttpReviewInput} from './stream-boundary'

let assertions=0
const check=(ok:boolean,label:string):void=>{
  if(!ok)throw new Error('FAIL: '+label)
  assertions++;console.log('PASS: '+label)
}
const enc=(s:string)=>new TextEncoder().encode(s)
const http:HttpReviewInput={requestMethod:'POST',requestContentType:'application/json',
  requestAccept:'text/event-stream',responseStatus:200,responseContentType:'text/event-stream',
  lastEventIdSent:false}
const wire=(thread='thread-A',run='run-A'):readonly Uint8Array[]=>[enc([
  {type:'RUN_STARTED',threadId:thread,runId:run,protocolVersion:'1.0'},
  {type:'RUN_FINISHED',threadId:thread,runId:run},
].map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''))]
const attempt=(thread='thread-A',run='run-A'):RecoveryAttempt=>({
  tenantRef:'tenant-A',threadId:thread,runId:run,attemptId:'attempt-'+run,
  ordinal:1,mode:'full-restart',wire:wire(thread,run),http,connectionEnded:true,
})
const primary:SyntheticServerContext={origin:'synthetic-server-boundary',
  principalId:'principal-A',tenantId:'tenant-A',allowedThreadIds:['thread-A','thread-B'],policyEpoch:3}
const secondary:SyntheticServerContext={...primary,principalId:'principal-B',
  tenantId:'tenant-B',allowedThreadIds:['thread-C']}
const seed:CheckpointProjection={tenantId:'tenant-A',policyEpoch:3,revision:0,receipts:[]}
const sessions:Record<string,unknown>={'ticket-A':primary,'ticket-B':secondary}
let checkpointReads=0, sessionReads=0
const source={
  resolveSessionForTest:(session:string):unknown=>{sessionReads++;return sessions[session]??null},
  readCheckpointForTest:(tenant:string):unknown=>{checkpointReads++;return tenant==='tenant-A'?seed:
    {tenantId:'tenant-B',policyEpoch:3,revision:0,receipts:[]}},
}
const boundary=makeIsolatedTrustedBoundaryForTests(source)
const intent=(patch:Partial<ReplayIntent>={}):ReplayIntent=>({operation:'commit',
  tenantRef:'tenant-A',threadId:'thread-A',runId:'run-A',idempotencyKey:'idem-A',
  declaredCommitment:'a'.repeat(64),expectedRevision:0,attempts:[attempt()],...patch})
const query=(intents:unknown=[intent()],sessionRef='ticket-A'):unknown=>({sessionRef,intents})
const fail=(v:BoundaryVerdict,code:string,label:string)=>{
  check(v.status==='blocked'&&v.code===code,label)
  check(v.exposure===0,`${label}: no partial event exposure`)
  check(!v.authenticationVerified&&!v.checkpointPersisted&&!v.atomicCasVerified&&
    !v.digestVerified&&!v.adapterReady,`${label}: no authority elevation`)
}
const accepted=boundary.review(query())
check(accepted.status==='planned','2.6L published replay/ACL plan composed through injected test authority')
if(accepted.status==='planned'){
  check(accepted.tenantId==='tenant-A','server-owned tenant was selected by test provider')
  check(accepted.principalId==='principal-A','server-owned principal was selected by test provider')
  check(accepted.expectedRevision===0&&accepted.nextRevision===1,'revision change is a pure proposal')
  check(accepted.plannedCommits===1&&accepted.receiptCount===1,'one simulated checkpoint receipt planned')
  check(accepted.source==='isolated-harness-only','trust scope explicitly test-only')
  check(accepted.exposure===0,'event bytes do not escape the review')
  check(!accepted.authenticationVerified&&!accepted.checkpointPersisted&&!accepted.atomicCasVerified&&
    !accepted.digestVerified&&!accepted.adapterReady,'no operational trust proof claimed')
  check(!('events' in accepted)&&!('sessionRef' in accepted),'result excludes raw wire and session key')
}
check(sessionReads===1&&checkpointReads===1,'test authority consulted exactly once per complete request')
const duplicate=boundary.review(query([intent(),intent()]))
check(duplicate.status==='planned','2.6L duplicate suppression remains composed')
if(duplicate.status==='planned')
  check(duplicate.duplicateCount===1&&duplicate.nextRevision===1,'duplicate does not plan second revision')

for(const v of [null,undefined,3,false,'x',{},[],{sessionRef:'ticket-A'},
  {sessionRef:'ticket-A',intents:null},{sessionRef:'?',intents:[intent()]}])
  fail(boundary.review(v),'untrusted-request-shape',`request shape blocked ${String(v).slice(0,24)}`)
for(const claim of ['principalId','tenantId','allowedThreadIds','policyEpoch','checkpoint',
  'isAdmin','authenticated','jwt','verified','sessionToken','serverClaims','scope'])
  fail(boundary.review({...query() as Record<string,unknown>,[claim]:'spoofed'}),
    'untrusted-request-shape',`caller authority injection forbidden ${claim}`)
for(const session of ['no-such-ticket','ticket-Z','', 'bad/token']){
  const expected=session===''||session.includes('/')?'untrusted-request-shape':'authority-test-session-denied'
  fail(boundary.review(query([intent()],session)),expected,`session reference ${session} denied`)
}
fail(boundary.review(query([intent({tenantRef:'tenant-B'})])),
  'prior-2.6L:tenant-boundary-denied','caller cannot override server tenant')
fail(boundary.review(query([intent({threadId:'thread-X'})])),
  'prior-2.6L:thread-authorization-denied','caller cannot access unauthorized thread')
fail(boundary.review(query([intent({expectedRevision:1})])),
  'prior-2.6L:cas-revision-conflict','stale checkpoint revision blocks proposal')
fail(boundary.review(query([intent({operation:'resume'})])),
  'prior-2.6L:resume-credential-not-established','no real resume credential supported')
fail(boundary.review(query([intent({declaredCommitment:'b'.repeat(63)})])),
  'prior-2.6L:intent-shape-invalid','invalid caller declared digest shape rejected')
fail(boundary.review(query([intent({attempts:[]})])),
  'prior-2.6L:selected-recovery-proof-missing','missing published 2.6K recovery blocks plan')
fail(boundary.review(query([intent()], 'ticket-B')),
  'prior-2.6L:tenant-boundary-denied','cross-tenant session denies tenant-A request')

const missingAuthority=makeIsolatedTrustedBoundaryForTests({
  resolveSessionForTest:()=>{throw Error('provider unavailable')},readCheckpointForTest:()=>seed,
})
fail(missingAuthority.review(query()),'authority-test-source-error','provider exception fails closed')
const missingCheckpoint=makeIsolatedTrustedBoundaryForTests({
  resolveSessionForTest:()=>primary,readCheckpointForTest:()=>null,
})
fail(missingCheckpoint.review(query()),'checkpoint-test-source-missing','missing checkpoint fails closed')
const brokenCheckpoint=makeIsolatedTrustedBoundaryForTests({
  resolveSessionForTest:()=>primary,readCheckpointForTest:()=>{throw Error('store unavailable')},
})
fail(brokenCheckpoint.review(query()),'checkpoint-test-source-error','storage exception fails closed')
for(const forged of [null,{},primary===secondary?null:{origin:'synthetic-server-boundary',
   principalId:'bad principal',tenantId:'tenant-A',allowedThreadIds:['thread-A'],policyEpoch:3}]){
  const stub=makeIsolatedTrustedBoundaryForTests({
    resolveSessionForTest:()=>forged,readCheckpointForTest:()=>seed,
  })
  const code=forged===null||!forged||Object.keys(forged).length===0?
    'authority-test-session-denied':'authority-test-session-denied'
  fail(stub.review(query()),code,'invalid identity provider payload rejected')
}
const poisonedContext=makeIsolatedTrustedBoundaryForTests({
  resolveSessionForTest:()=>({...primary,admin:true}),readCheckpointForTest:()=>seed,
})
fail(poisonedContext.review(query()),'prior-2.6L:synthetic-boundary-invalid',
  'test authority may not invent extra privileged context fields')
const staleSnapshot=makeIsolatedTrustedBoundaryForTests({
  resolveSessionForTest:()=>primary,readCheckpointForTest:()=>({...seed,policyEpoch:2}),
})
fail(staleSnapshot.review(query()),'prior-2.6L:policy-epoch-stale',
  'policy epoch drift between identity and checkpoint fails closed')
const wrongTenantSnapshot=makeIsolatedTrustedBoundaryForTests({
  resolveSessionForTest:()=>primary,readCheckpointForTest:()=>({...seed,tenantId:'tenant-B'}),
})
fail(wrongTenantSnapshot.review(query()),'prior-2.6L:checkpoint-projection-invalid',
  'cross-tenant checkpoint cannot be accepted')

const frozen=reviewTransactionalIdentityBlockers()
check(frozen.allNineGapsRemainOpen,'all G1-G9 remain open')
check(frozen.priorAdapterBlocked,'published 2.6L/2.6H adapter gate remains blocked')
for(const [k,v] of [
  ['serverIssuedSessionVerified',frozen.serverIssuedSessionVerified],
  ['externalCredentialVerifierImplemented',frozen.externalCredentialVerifierImplemented],
  ['aclReadFromTrustedBackend',frozen.aclReadFromTrustedBackend],
  ['checkpointAuthenticityVerified',frozen.checkpointAuthenticityVerified],
  ['tsTransactionExecuted',frozen.tsTransactionExecuted],
  ['atomicDbCasAtTypeScriptBoundary',frozen.atomicDbCasAtTypeScriptBoundary],
  ['eventDigestCheckedInTypeScript',frozen.eventDigestCheckedInTypeScript],
  ['independentSecurityReview',frozen.independentSecurityReview],
  ['agentServerAdapterReady',frozen.agentServerAdapterReady],
] as const)check(v===false,`${k} remains explicitly unverified`)
check(frozen.milestone2_6Open,'parent milestone 2.6 remains OPEN')
check(Object.isFrozen(frozen),'security gate inventory is immutable')
check(frozen.scope==='harness-injection-design-plus-separate-sqlite-experiment',
  'pure boundary distinguishes external SQLite experiment')
console.log(`${assertions} 2.6M selected trusted-boundary design assertions passed`)
