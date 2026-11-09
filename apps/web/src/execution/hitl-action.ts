import type { ThreadId, ThreadState } from '../domain'
import { projectPersistedInterrupts } from './interrupt-projection'
import { classifyHeadPreflight } from './state-mutation-preflight'
import type { ProjectionAuthority } from './use-execution'

export interface HitlActionGate {
  readonly allowed: boolean
  readonly reason: string
  readonly question: string | null
  readonly interruptId: string | null
  readonly checkpointId: string | null
}

const blocked = (reason: string): HitlActionGate => ({
  allowed: false,
  reason,
  question: null,
  interruptId: null,
  checkpointId: null,
})

/**
 * Lab-only action eligibility. Not server authorization and not atomic CAS.
 * Require one identified, known 2.4A probe at its expected graph position.
 */
export const inspectHitlAction = (
  state: ThreadState | null,
  authority: ProjectionAuthority,
  activeThreadId: ThreadId | null,
): HitlActionGate => {
  if (activeThreadId === null || state === null ||
      authority !== 'persisted' || state.threadId !== activeThreadId) {
    return blocked('Load a persisted state for the selected Thread before responding.')
  }
  const projection = projectPersistedInterrupts(state, null)
  if (projection.situation !== 'graph-interrupt' ||
      projection.interruptCount !== 1 || projection.hiddenInterruptCount !== 0 ||
      state.position.next.length !== 1 || state.position.next[0] !== 'approval') {
    return blocked('No single, reviewed dynamic HITL probe is awaiting a response.')
  }
  const interrupt = projection.interrupts[0]
  if (interrupt?.kind !== 'known-24a-probe' ||
      interrupt.id === null || !interrupt.question ||
      projection.checkpointId === null) {
    return blocked('The pending request has an unknown or incomplete identity.')
  }
  return {
    allowed: true,
    reason: 'Review the probe and explicitly choose a response.',
    question: interrupt.question,
    interruptId: interrupt.id,
    checkpointId: projection.checkpointId,
  }
}

/** Best-effort pre-POST GET: compare full checkpoint identity and reviewed prompt. */
export const sameObservedHitlAction = (
  displayed: ThreadState,
  current: ThreadState,
): boolean => {
  if (classifyHeadPreflight(displayed, current).kind !== 'matching') return false
  const a = inspectHitlAction(displayed, 'persisted', displayed.threadId)
  const b = inspectHitlAction(current, 'persisted', displayed.threadId)
  return a.allowed && b.allowed && a.question === b.question &&
    a.interruptId === b.interruptId && a.checkpointId === b.checkpointId
}
