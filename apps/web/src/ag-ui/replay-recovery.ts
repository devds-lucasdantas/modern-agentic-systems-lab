/**
 * MASL Lab 2.6K — local, deterministic replay/failure-recovery decision gate.
 * Frozen AG-UI reference ag-ui-protocol/ag-ui@2330368a2a74573902858867072406638ba3073d.
 * Reuses the published 2.6J pure selected JSON/SSE -> 2.6D/2.6C pipeline.
 * NOT resumable HTTP, an idempotency store, authorization, DLP, CAS, durable
 * persistence, an Agent Server adapter, or a multi-client security guarantee.
 * A temporary in-call ledger is NOT a trusted checkpoint; no content or run
 * state is written, emitted, persisted or logged by this module.
 */
import {reviewSelectedAgUiWire} from './pipeline-transport';
import type {HttpReviewInput} from './stream-boundary';
import {GAP_REGISTER, evaluateAdapterReadiness} from './gap-readiness';

type Rec = Record<string, unknown>;
const isRecord=(v:unknown):v is Rec=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(v:Rec,k:string):boolean=>Object.hasOwn(v,k);
const validId=(v:unknown):v is string=>
  typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v);
const scopeKey=(t:string,h:string,r:string):string=>JSON.stringify([t,h,r]);
const crossTenantKey=(h:string,r:string):string=>JSON.stringify([h,r]);

export type RecoveryMode='aborted-observation'|'full-restart'|'resume-request';
export type RecoveryAttempt=Readonly<{
  tenantRef:string; threadId:string; runId:string; attemptId:string;
  ordinal:number; mode:RecoveryMode;
  wire:readonly Uint8Array[]; http:HttpReviewInput; connectionEnded:boolean;
}>;
export type RecoveryVerdict=
  | Readonly<{status:'accepted';committed:readonly Readonly<{
      tenantRef:string;threadId:string;runId:string;attemptId:string;
    }>[];duplicatesSuppressed:number;abortedObserved:number;
    coverage:'selected-volatile-local-replay';authorizationVerified:false;
    persistenceVerified:false;adapterReady:false;noApplicationSink:true}>
  | Readonly<{status:'blocked';code:string;at:number;exposedCount:0;
      authorizationVerified:false;persistenceVerified:false;adapterReady:false}>;

/**
 * A selected **bounded** sequence of synthetic attempts, validated atomically.
 * An incomplete observation may precede a complete full restart in the SAME
 * declared scope. It never releases event bytes. Actual partial recovery,
 * Last-Event-ID and a resume token are deliberately unsupported.
 */
export const reviewSelectedRecovery=(input:unknown):RecoveryVerdict=>{
  const block=(code:string,at:number):RecoveryVerdict=>({status:'blocked',code,at,
    exposedCount:0,authorizationVerified:false,persistenceVerified:false,adapterReady:false});
  if(!Array.isArray(input)||input.length<1||input.length>24)
    return block('attempt-count-limit',-1);
  const committed: {tenantRef:string;threadId:string;runId:string;attemptId:string}[]=[];
  const seen=new Map<string,{ordinal:number;fingerprint:string}>();
  const usedAttempts=new Set<string>();
  const crossTenants=new Map<string,string>();
  let pending:{key:string;ordinal:number}|null=null;
  let duplicateCount=0,abortedCount=0;
  for(let at=0;at<input.length;at++){
    const x:unknown=input[at];
    if(!isRecord(x))return block('attempt-object-required',at);
    const fields=['tenantRef','threadId','runId','attemptId','ordinal','mode',
      'wire','http','connectionEnded'];
    if(Object.keys(x).some(k=>!fields.includes(k))||fields.some(k=>!own(x,k)))
      return block('untrusted-attempt-fields',at);
    if(!validId(x.tenantRef)||!validId(x.threadId)||!validId(x.runId)||!validId(x.attemptId))
      return block('invalid-declared-identity',at);
    if(!Number.isSafeInteger(x.ordinal)||!(Number(x.ordinal)>0&&Number(x.ordinal)<=1024))
      return block('invalid-ordinal',at);
    if(!['aborted-observation','full-restart','resume-request'].includes(String(x.mode)))
      return block('unknown-recovery-mode',at);
    if(!Array.isArray(x.wire)||x.wire.some(chunk=>!(chunk instanceof Uint8Array))||
       !isRecord(x.http)||typeof x.connectionEnded!=='boolean')
      return block('invalid-wire-metadata',at);
    const v=x as unknown as RecoveryAttempt;
    const key=scopeKey(v.tenantRef,v.threadId,v.runId);
    const identity=crossTenantKey(v.threadId,v.runId);
    const otherTenant=crossTenants.get(identity);
    if(otherTenant!==undefined&&otherTenant!==v.tenantRef)
      return block('cross-tenant-identity-collision',at);
    crossTenants.set(identity,v.tenantRef);
    if(usedAttempts.has(v.attemptId))return block('attempt-id-reused',at);
    usedAttempts.add(v.attemptId);
    if(v.mode==='resume-request')return block('resume-not-verified',at);
    if(pending!==null&&pending.key!==key)return block('recovery-scope-mismatch',at);
    const previous=seen.get(key);
    const lastOrdinal:number=pending?.key===key?pending.ordinal:(previous?.ordinal??0);
    if(v.ordinal!==lastOrdinal+1)return block('ordinal-not-contiguous',at);
    if(v.http.lastEventIdSent)return block('sse-event-id-not-resume-authority',at);
    const pipeline=reviewSelectedAgUiWire(v.wire,v.http,v.connectionEnded);
    if(v.mode==='aborted-observation'){
      if(pending!==null)return block('nested-abort-without-restart',at);
      if(previous!==undefined)return block('abort-after-committed',at);
      if(pipeline.status!=='blocked'||pipeline.exposedCount!==0||
         !(['stream-not-ended','unterminated-event-frame','truncated-run-no-terminal']
           .some(reason=>pipeline.code.includes(reason))))
        return block('not-an-allowed-incomplete-observation',at);
      pending={key,ordinal:v.ordinal};abortedCount++;
      continue;
    }
    if(pipeline.status!=='accepted')return block('full-restart-'+pipeline.code,at);
    // 2.6J has selected rather than complete lifecycle semantics. Restrict
    // the recovery review further to a single unambiguous successful run.
    if(pipeline.runCount!==1||pipeline.warnings.length!==0)
      return block('unreviewed-selected-lifecycle',at);
    const started=pipeline.events.filter(e=>e.type==='RUN_STARTED');
    const finished=pipeline.events.filter(e=>e.type==='RUN_FINISHED');
    if(started.length!==1||finished.length!==1||
       pipeline.events.some(e=>e.type==='RUN_ERROR'))
      return block('not-single-successful-run',at);
    for(const e of [started[0]!,finished[0]!]){
      if(e.threadId!==v.threadId||e.runId!==v.runId)
        return block('declared-run-identity-mismatch',at);
    }
    // Local equality sentinel only; not a cryptographic digest, secure
    // deduplication key or durable fingerprint. Conservative about key order.
    const fingerprint=JSON.stringify(pipeline.events);
    if(fingerprint.length>262_144)return block('local-fingerprint-limit',at);
    if(previous!==undefined){
      if(previous.fingerprint!==fingerprint)return block('replayed-payload-conflict',at);
      seen.set(key,{ordinal:v.ordinal,fingerprint});duplicateCount++;
    }else{
      seen.set(key,{ordinal:v.ordinal,fingerprint});
      committed.push({tenantRef:v.tenantRef,threadId:v.threadId,
        runId:v.runId,attemptId:v.attemptId});
    }
    pending=null;
  }
  if(pending!==null)return block('incomplete-without-full-restart',input.length-1);
  if(!committed.length)return block('no-complete-run',input.length-1);
  return {status:'accepted',committed,duplicatesSuppressed:duplicateCount,
    abortedObserved:abortedCount,coverage:'selected-volatile-local-replay',
    authorizationVerified:false,persistenceVerified:false,adapterReady:false,
    noApplicationSink:true};
};

/** Pure, non-approving summary of normative and security gates. */
export const reviewRecoverySecurityGates=()=>{
  const readiness=evaluateAdapterReadiness(GAP_REGISTER,[]);
  return Object.freeze({
    requiredGaps:Object.freeze(['G1','G3','G5','G7','G8','G9'] as const),
    allNineOpen:GAP_REGISTER.length===9&&GAP_REGISTER.every(g=>g.milestoneOpen),
    upstreamPartSourceResolved:false as const,
    independentAuthzReview:false as const,
    tenantIsolationProven:false as const,
    durableCheckpointProven:false as const,
    crossClientCASProven:false as const,
    idempotencyAcrossProcessesProven:false as const,
    mediaDlpReviewProven:false as const,
    adapterReady:false as const,
    parentMilestoneOpen:true as const,
    underlyingReadinessBlocked:readiness.status==='blocked',
    scope:'planning-and-selected-volatile-tests-only' as const,
  });
};
