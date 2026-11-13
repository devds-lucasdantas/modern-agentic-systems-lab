import type {
  AssistantId,
  Run,
  RunId,
  Thread,
  ThreadId,
  ThreadState,
} from '../domain'
import { classifyHeadPreflight } from './state-mutation-preflight'

/**
 * A client-generated operation token is a correlation hint, not server-backed
 * idempotency or authorization. It MUST be submitted in Run metadata by the
 * future 2.4E UI before this projector can identify its own Run.
 */
export const RESUME_ATTEMPT_KEY = 'masl_resume_attempt_id' as const

export interface ResumeAttemptObservation {
  readonly threadId: ThreadId
  readonly canonicalAssistantId: AssistantId
  readonly initialRunId: RunId
  readonly attemptId: string
  readonly before: ThreadState
}

export interface ResumeRecoveryReadback {
  readonly thread: Thread
  readonly state: ThreadState
  /** Must be the complete Run list for this disposable probe, not a page. */
  readonly runs: readonly Run[]
  readonly runsListComplete: boolean
}

export type ResumeRecoveryOutcome =
  | 'confirmed-end'
  | 'follow-up-interrupt'
  | 'run-in-flight'
  | 'run-terminal-without-end'
  | 'run-success-unreconciled'
  | 'not-observed'
  | 'head-diverged'
  | 'foreign-activity'
  | 'duplicate-attempt'
  | 'incomplete-readback'
  | 'identity-conflict'

export interface ResumeRecoveryDecision {
  readonly outcome: ResumeRecoveryOutcome
  /** All recovered observations remain read-only and disable automatic POST. */
  readonly safeToRetry: false
  readonly hasCorrelatedRun: boolean
  readonly correlatedRunId: RunId | null
  /** Never represents a proof of exactly-once or of authorization. */
  readonly confirmedGraphEnd: boolean
}

const decision = (
  outcome: ResumeRecoveryOutcome,
  correlated: Run | null = null,
): ResumeRecoveryDecision => ({
  outcome,
  safeToRetry: false,
  hasCorrelatedRun: correlated !== null,
  correlatedRunId: correlated?.id ?? null,
  confirmedGraphEnd: outcome === 'confirmed-end',
})

/**
 * Post-submission read-only reconciliation. A missing Run is NEVER evidence
 * that an unknown POST was rejected. A newly observed foreign Run is NEVER
 * attributed to the user's lost request. Without a server-verified token,
 * none of these outcomes permits blind retry or proves causal attribution.
 */
export const classifyResumeRecovery = (
  attempted: ResumeAttemptObservation,
  readback: ResumeRecoveryReadback,
): ResumeRecoveryDecision => {
  if (!attempted.attemptId || attempted.attemptId.length > 128 ||
      attempted.before.threadId !== attempted.threadId ||
      readback.state.threadId !== attempted.threadId ||
      readback.thread.id !== attempted.threadId) {
    return decision('identity-conflict')
  }

  if (!readback.runsListComplete || readback.runs.length === 0) {
    return decision('incomplete-readback')
  }

  const ids = new Set<string>()
  for (const run of readback.runs) {
    if (ids.has(run.id) || run.threadId !== attempted.threadId) {
      return decision('identity-conflict')
    }
    ids.add(run.id)
  }
  if (!ids.has(attempted.initialRunId)) {
    return decision('incomplete-readback')
  }

  const subsequent = readback.runs.filter(run => run.id !== attempted.initialRunId)
  const correlated = subsequent.filter(run =>
    run.metadata[RESUME_ATTEMPT_KEY] === attempted.attemptId)

  if (correlated.length > 1) {
    return decision('duplicate-attempt')
  }
  if (correlated.length === 0) {
    if (subsequent.length > 0) {
      return decision('foreign-activity')
    }
    const sameHead = classifyHeadPreflight(attempted.before, readback.state)
      .kind === 'matching'
    if (!sameHead) {
      return decision('head-diverged')
    }
    return decision('not-observed')
  }

  const found = correlated[0]
  if (found.assistantId !== attempted.canonicalAssistantId ||
      subsequent.length !== 1) {
    return decision('identity-conflict')
  }
  if (found.status === 'pending' || found.status === 'running') {
    return decision('run-in-flight', found)
  }
  if (found.status !== 'success') {
    return decision('run-terminal-without-end', found)
  }

  const moved = classifyHeadPreflight(attempted.before, readback.state)
    .kind === 'stale'
  if (!moved || readback.state.checkpoint === null) {
    return decision('run-success-unreconciled', found)
  }
  if (readback.state.interrupts.length > 0) {
    return decision('follow-up-interrupt', found)
  }
  if (readback.state.position.next.length !== 0 ||
      readback.thread.status !== 'idle') {
    return decision('run-success-unreconciled', found)
  }
  return decision('confirmed-end', found)
}

/** 409 is an observed server conflict, not permission to resend the POST. */
export const classifyResumePostFailure = (
  status: number | null,
): 'conflict' | 'ambiguous' => status === 409 ? 'conflict' : 'ambiguous'
