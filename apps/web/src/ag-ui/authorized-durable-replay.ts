/**
 * MASL 2.6L — synthetic authorization and durable replay CONTRACT evidence.
 * Pin ag-ui-protocol/ag-ui@2330368a2a74573902858867072406638ba3073d.
 * Composes the published 2.6K scoped replay checker, but neither authenticates
 * context nor loads/saves checkpoints. This is a bounded, pure, in-call CAS
 * model only. A caller-supplied commitment is NOT verified against event bytes;
 * NEVER use this as an operational idempotency or security decision.
 * No Agent Server/frontend/network/storage/secret/Runtime/model/tool effects.
 */
import {reviewSelectedRecovery, reviewRecoverySecurityGates, type RecoveryAttempt} from './replay-recovery';

const record=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const own=(x:Record<string,unknown>,key:string):boolean=>Object.hasOwn(x,key);
const exact=(x:Record<string,unknown>,fields:readonly string[]):boolean=>
  Object.keys(x).length===fields.length && fields.every(k=>own(x,k));
const id=(x:unknown):x is string=>typeof x==='string' && /^[A-Za-z0-9._:-]{1,128}$/.test(x);
const commitment=(x:unknown):x is string=>typeof x==='string' && /^[a-f0-9]{64}$/.test(x);
const revision=(x:unknown):x is number=>Number.isSafeInteger(x)&&Number(x)>=0&&Number(x)<=100_000;
const key=(...v:string[]):string=>JSON.stringify(v);

export type SyntheticServerContext=Readonly<{
  origin:'synthetic-server-boundary'; principalId:string; tenantId:string;
  allowedThreadIds:readonly string[]; policyEpoch:number;
}>;
export type Receipt=Readonly<{
  tenantId:string;threadId:string;runId:string;principalId:string;
  idempotencyKey:string;declaredCommitment:string;commitRevision:number;
}>;
export type CheckpointProjection=Readonly<{
  tenantId:string;policyEpoch:number;revision:number;receipts:readonly Receipt[];
}>;
export type ReplayIntent=Readonly<{
  operation:'commit'|'replay-check'|'resume';tenantRef:string;threadId:string;
  runId:string;idempotencyKey:string;declaredCommitment:string;
  expectedRevision:number;attempts:readonly RecoveryAttempt[];
}>;
export type DurableContractVerdict=
  | Readonly<{status:'planned';next:CheckpointProjection;commits:number;duplicates:number;
      replayChecks:number;exposedEventCount:0;coverage:'synthetic-authorization-and-cas-only';
      authenticationVerified:false;persistenceVerified:false;casAtomicityVerified:false;
      commitmentVerified:false;adapterReady:false}>
  | Readonly<{status:'blocked';code:string;at:number;exposedEventCount:0;
      authenticationVerified:false;persistenceVerified:false;casAtomicityVerified:false;
      commitmentVerified:false;adapterReady:false}>;

/**
 * Pure proposal: `context` is supplied by a TEST HARNESS. The literal `origin`
 * value does not authenticate anything; a future server must construct the
 * context from independently verified credentials and thread ACLs. `seed` is
 * likewise an unverified persistence projection. Requests may not supply
 * privileged context fields. An all-or-nothing return is NOT a transaction.
 */
export const reviewSelectedAuthorizedDurablePlan=(
  context:unknown,seed:unknown,intents:unknown,
):DurableContractVerdict=>{
  const block=(code:string,at:number):DurableContractVerdict=>({status:'blocked',code,at,
    exposedEventCount:0,authenticationVerified:false,persistenceVerified:false,
    casAtomicityVerified:false,commitmentVerified:false,adapterReady:false});
  const contextFields=['origin','principalId','tenantId','allowedThreadIds','policyEpoch'];
  if(!record(context)||!exact(context,contextFields)||
     context.origin!=='synthetic-server-boundary'||!id(context.principalId)||
     !id(context.tenantId)||!revision(context.policyEpoch)||
     !Array.isArray(context.allowedThreadIds)||context.allowedThreadIds.length<1||
     context.allowedThreadIds.length>16||!context.allowedThreadIds.every(id)||
     new Set(context.allowedThreadIds).size!==context.allowedThreadIds.length)
    return block('synthetic-boundary-invalid',-1);
  const server=context as SyntheticServerContext;
  if(!record(seed)||!exact(seed,['tenantId','policyEpoch','revision','receipts'])||
     seed.tenantId!==server.tenantId||!revision(seed.policyEpoch)||
     !revision(seed.revision)||!Array.isArray(seed.receipts)||seed.receipts.length>48)
    return block('checkpoint-projection-invalid',-1);
  if(seed.policyEpoch!==server.policyEpoch)return block('policy-epoch-stale',-1);
  if(seed.revision!==seed.receipts.length)return block('checkpoint-revision-inconsistent',-1);
  const receipts:Receipt[]=[];
  const byIdempotency=new Map<string,Receipt>();
  const byRun=new Set<string>();
  const receiptFields=['tenantId','threadId','runId','principalId','idempotencyKey',
    'declaredCommitment','commitRevision'];
  for(let i=0;i<seed.receipts.length;i++){
    const raw:unknown=seed.receipts[i];
    if(!record(raw)||!exact(raw,receiptFields)||raw.tenantId!==server.tenantId||
       !id(raw.threadId)||!id(raw.runId)||!id(raw.principalId)||
       !id(raw.idempotencyKey)||!commitment(raw.declaredCommitment)||
       raw.commitRevision!==i+1)
      return block('checkpoint-receipt-invalid',i);
    const receipt=raw as Receipt;
    const k=key(receipt.tenantId,receipt.idempotencyKey);
    const run=key(receipt.tenantId,receipt.threadId,receipt.runId);
    if(byIdempotency.has(k)||byRun.has(run))return block('checkpoint-duplicate-receipt',i);
    receipts.push({...receipt});byIdempotency.set(k,receipt);byRun.add(run);
  }
  if(!Array.isArray(intents)||intents.length<1||intents.length>16)
    return block('intent-count-limit',-1);
  let nextRevision=seed.revision,commits=0,duplicates=0,replayChecks=0;
  const fields=['operation','tenantRef','threadId','runId','idempotencyKey',
    'declaredCommitment','expectedRevision','attempts'];
  for(let i=0;i<intents.length;i++){
    const raw:unknown=intents[i];
    if(!record(raw)||!exact(raw,fields))return block('intent-fields-untrusted',i);
    if(!['commit','replay-check','resume'].includes(String(raw.operation)))
      return block('unsupported-operation',i);
    if(!id(raw.tenantRef)||!id(raw.threadId)||!id(raw.runId)||
       !id(raw.idempotencyKey)||!commitment(raw.declaredCommitment)||
       !revision(raw.expectedRevision)||!Array.isArray(raw.attempts))
      return block('intent-shape-invalid',i);
    if(raw.tenantRef!==server.tenantId)return block('tenant-boundary-denied',i);
    if(!server.allowedThreadIds.includes(raw.threadId))return block('thread-authorization-denied',i);
    if(raw.operation==='resume')return block('resume-credential-not-established',i);
    const item=raw as ReplayIntent;
    // Integrates actual 2.6K selected wire/replay contract and identity check.
    // No body is ever forwarded or returned to this caller.
    const verified=reviewSelectedRecovery(item.attempts);
    if(verified.status!=='accepted'||verified.committed.length!==1||
       verified.committed[0]?.tenantRef!==item.tenantRef||
       verified.committed[0]?.threadId!==item.threadId||
       verified.committed[0]?.runId!==item.runId)
      return block('selected-recovery-proof-missing',i);
    const k=key(server.tenantId,item.idempotencyKey);
    const run=key(server.tenantId,item.threadId,item.runId);
    const old=byIdempotency.get(k);
    if(old!==undefined){
      if(old.threadId!==item.threadId||old.runId!==item.runId||
         old.principalId!==server.principalId)
        return block('idempotency-scope-conflict',i);
      if(old.declaredCommitment!==item.declaredCommitment)
        return block('declared-commitment-conflict',i);
      if(item.operation==='commit')duplicates++;
      else replayChecks++;
      continue;
    }
    if(item.operation==='replay-check')return block('replay-receipt-missing',i);
    if(byRun.has(run))return block('run-already-committed',i);
    // Simulated compare-and-swap precondition: no database transaction occurs.
    if(item.expectedRevision!==nextRevision)return block('cas-revision-conflict',i);
    if(nextRevision>=48)return block('checkpoint-capacity',i);
    const newReceipt:Receipt={tenantId:server.tenantId,threadId:item.threadId,
      runId:item.runId,principalId:server.principalId,idempotencyKey:item.idempotencyKey,
      declaredCommitment:item.declaredCommitment,commitRevision:nextRevision+1};
    receipts.push(newReceipt);byIdempotency.set(k,newReceipt);byRun.add(run);
    nextRevision++;commits++;
  }
  // A proposal is returned only once every gate passed: no DB write/sink.
  return {status:'planned',next:{tenantId:server.tenantId,policyEpoch:server.policyEpoch,
    revision:nextRevision,receipts},commits,duplicates,replayChecks,exposedEventCount:0,
    coverage:'synthetic-authorization-and-cas-only',authenticationVerified:false,
    persistenceVerified:false,casAtomicityVerified:false,commitmentVerified:false,
    adapterReady:false};
};

/** Explicit, non-approving inventory of real prerequisites. */
export const reviewDurableAuthorizationGates=()=>{
  const prior=reviewRecoverySecurityGates();
  return Object.freeze({
    requiredGaps:Object.freeze(['G1','G3','G5','G7','G8','G9'] as const),
    priorAllNineOpen:prior.allNineOpen,
    priorAdapterBlocked:!prior.adapterReady&&prior.underlyingReadinessBlocked,
    authenticatedPrincipalVerified:false as const,
    externalThreadAclVerified:false as const,
    persistedSnapshotAuthenticated:false as const,
    durableAtomicCasVerified:false as const,
    crossProcessIdempotencyVerified:false as const,
    commitmentHashVerified:false as const,
    transportReplayVerified:false as const,
    securityReviewApproved:false as const,
    adapterReady:false as const,
    parent2_6Open:true as const,
    scope:'synthetic-contract-evidence-only' as const,
  });
};
