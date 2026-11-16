/**
 * MASL 2.6M — server-owned boundary *design* and test-harness injection.
 * Frozen AG-UI 1.0 reference: ag-ui-protocol/ag-ui@2330368a2a74573902858867072406638ba3073d.
 * Reuses 2.6L's real scoped pure replay/authz/CAS *proposal* code.
 *
 * The isolated authority passed to this factory is a TEST HARNESS SUBSTITUTE,
 * never an identity provider, verified session, ACL database, or operational
 * authorization. A sessionRef is an untrusted lookup key; no bearer authentication
 * or transport protection exists here. The result is server-side metadata only:
 * NOT a storage transaction, cryptographic event digest, or application sink.
 */
import {
  reviewSelectedAuthorizedDurablePlan, reviewDurableAuthorizationGates,
  type SyntheticServerContext, type CheckpointProjection, type ReplayIntent,
} from './authorized-durable-replay'

type JsonRecord = Record<string, unknown>
const isRecord = (x: unknown): x is JsonRecord =>
  x !== null && typeof x === 'object' && !Array.isArray(x)
const exact = (x: JsonRecord, keys: readonly string[]): boolean =>
  Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k))
const ident = (x: unknown): x is string =>
  typeof x === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(x)

/** Never use a caller-supplied principal, tenant or checkpoint. */
export interface HarnessAuthority {
  readonly resolveSessionForTest: (sessionRef: string) => unknown
  readonly readCheckpointForTest: (tenantId: string) => unknown
}
export type BoundaryVerdict =
  | Readonly<{status:'planned'; source:'isolated-harness-only';
      tenantId:string; principalId:string;expectedRevision:number; nextRevision:number;
      plannedCommits:number;duplicateCount:number;receiptCount:number;
      exposure:0;authenticationVerified:false;checkpointPersisted:false;
      atomicCasVerified:false;digestVerified:false;adapterReady:false}>
  | Readonly<{status:'blocked';code:string;exposure:0;
      authenticationVerified:false;checkpointPersisted:false;
      atomicCasVerified:false;digestVerified:false;adapterReady:false}>

/**
 * The factory closes over the test's authority callbacks. Request JSON cannot
 * replace that authority, and the loaded checkpoint cannot come from request.
 * This only demonstrates an interface for future *real* server-owned providers.
 * The callback implementer remains fully trusted by this simulated design.
 */
export function makeIsolatedTrustedBoundaryForTests(authority: HarnessAuthority) {
  const reject = (code:string):BoundaryVerdict => ({status:'blocked', code, exposure:0,
    authenticationVerified:false,checkpointPersisted:false,atomicCasVerified:false,
    digestVerified:false,adapterReady:false})
  return Object.freeze({
    review: (request: unknown): BoundaryVerdict => {
      if(!isRecord(request) || !exact(request,['sessionRef','intents']) ||
         !ident(request.sessionRef) || !Array.isArray(request.intents))
        return reject('untrusted-request-shape')
      // Do not expose the callback to the consumer or take identity from JSON.
      let context:unknown
      try { context=authority.resolveSessionForTest(request.sessionRef) }
      catch {return reject('authority-test-source-error')}
      if(!isRecord(context) || context.origin!=='synthetic-server-boundary' ||
         !ident(context.tenantId) || !ident(context.principalId))
        return reject('authority-test-session-denied')
      let checkpoint:unknown
      try { checkpoint=authority.readCheckpointForTest(context.tenantId) }
      catch {return reject('checkpoint-test-source-error')}
      if(checkpoint===null || checkpoint===undefined)
        return reject('checkpoint-test-source-missing')
      // Prior published 2.6L enforces its *exact* synthetic context/seed shapes,
      // ACL and replay/identity constraints. We do not bypass its policy.
      const planned=reviewSelectedAuthorizedDurablePlan(
        context as unknown as SyntheticServerContext,
        checkpoint as unknown as CheckpointProjection,
        request.intents as readonly ReplayIntent[],
      )
      if(planned.status==='blocked')return reject(`prior-2.6L:${planned.code}`)
      return {status:'planned',source:'isolated-harness-only',
        tenantId:context.tenantId,principalId:context.principalId,
        expectedRevision:(checkpoint as CheckpointProjection).revision,
        nextRevision:planned.next.revision,plannedCommits:planned.commits,
        duplicateCount:planned.duplicates,receiptCount:planned.next.receipts.length,
        exposure:0,authenticationVerified:false,checkpointPersisted:false,
        atomicCasVerified:false,digestVerified:false,adapterReady:false}
    },
  })
}

/** A gate inventory is not evidence of real authentication or storage. */
export const reviewTransactionalIdentityBlockers=()=>{
  const prior=reviewDurableAuthorizationGates()
  return Object.freeze({
    allNineGapsRemainOpen:prior.priorAllNineOpen,
    priorAdapterBlocked:prior.priorAdapterBlocked,
    serverIssuedSessionVerified:false as const,
    externalCredentialVerifierImplemented:false as const,
    aclReadFromTrustedBackend:false as const,
    checkpointAuthenticityVerified:false as const,
    tsTransactionExecuted:false as const,
    atomicDbCasAtTypeScriptBoundary:false as const,
    eventDigestCheckedInTypeScript:false as const,
    independentSecurityReview:false as const,
    agentServerAdapterReady:false as const,
    milestone2_6Open:true as const,
    scope:'harness-injection-design-plus-separate-sqlite-experiment' as const,
  })
}
