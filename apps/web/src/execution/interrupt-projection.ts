import type {
  CheckpointId,
  InterruptId,
  Thread,
  ThreadId,
  ThreadState,
  ThreadStatus,
} from '../domain'

export type InterruptSituation =
  | 'uninitialized'
  | 'graph-interrupt'
  | 'interrupted-without-payload'
  | 'position-pending'
  | 'end'
  | 'indeterminate'

export type InterruptViewKind = 'known-24a-probe' | 'opaque'

/** A display-only summary, never a resume command or authorization decision. */
export interface InterruptView {
  readonly id: InterruptId | null
  readonly kind: InterruptViewKind
  readonly question: string | null
}

export interface PersistedInterruptProjection {
  readonly authority: 'persisted'
  readonly threadId: ThreadId
  readonly checkpointId: CheckpointId | null
  readonly threadStatus: ThreadStatus | null
  readonly situation: InterruptSituation
  readonly pendingNodeCount: number
  readonly interruptCount: number
  readonly hiddenInterruptCount: number
  readonly interrupts: readonly InterruptView[]
}

const MAX_VISIBLE_INTERRUPTS = 20
const MAX_QUESTION_LENGTH = 240

/**
 * Only the deterministic 2.4A test payload is recognized in this block.
 * Future approval schemas need their own explicit, tested allowlist.
 * Never propagate arbitrary Interrupt.value into the UI projection.
 */
const allowlistedQuestion = (value: unknown): string | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  if (record.kind !== 'masl_24a_hitl' || typeof record.question !== 'string') {
    return null
  }
  const question = record.question.trim()
  // Equivalent to rejecting U+0000–U+001F and U+007F, without a
  // control-character regex that triggers Oxlint's no-control-regex rule.
  const hasControlCharacter = Array.from(question).some((character) => {
    const point = character.codePointAt(0)
    return point !== undefined && (point <= 0x1f || point === 0x7f)
  })
  if (question.length === 0 || question.length > MAX_QUESTION_LENGTH ||
      hasControlCharacter) {
    return null
  }
  return question
}

/**
 * Project only independently persisted ThreadState.
 * Thread.status is a separate, potentially stale observation, not proof of HITL.
 * A pending node without an interrupt payload is NOT automatically a breakpoint.
 * Checkpoint ID is only a display correlation; full checkpoint identity stays in
 * the source ThreadState for future preflight/resume work.
 */
export const projectPersistedInterrupts = (
  state: ThreadState,
  thread: Pick<Thread, 'id' | 'status'> | null,
): PersistedInterruptProjection => {
  if (thread !== null && thread.id !== state.threadId) {
    throw new Error('Interrupt projection belongs to a different Thread')
  }

  const threadStatus = thread?.status ?? null
  const checkpointId = state.checkpoint?.checkpointId ?? null
  const interruptCount = state.interrupts.length
  const pendingNodeCount = state.position.next.length

  // Fail closed on incomplete or contradictory checkpoint evidence.
  const indeterminate = checkpointId === null &&
    (interruptCount > 0 || pendingNodeCount > 0 || threadStatus === 'interrupted')

  const situation: InterruptSituation = indeterminate
    ? 'indeterminate'
    : checkpointId === null
      ? 'uninitialized'
      : interruptCount > 0
        ? 'graph-interrupt'
        : threadStatus === 'interrupted'
          ? 'interrupted-without-payload'
          : pendingNodeCount > 0
            ? 'position-pending'
            : 'end'

  const interrupts: InterruptView[] = indeterminate ? [] : state.interrupts
    .slice(0, MAX_VISIBLE_INTERRUPTS)
    .map((interrupt) => {
      const question = allowlistedQuestion(interrupt.value)
      return {
        id: interrupt.id,
        kind: question === null ? 'opaque' : 'known-24a-probe',
        question,
      }
    })

  return {
    authority: 'persisted',
    threadId: state.threadId,
    checkpointId,
    threadStatus,
    situation,
    pendingNodeCount,
    interruptCount,
    hiddenInterruptCount: interruptCount - interrupts.length,
    interrupts,
  }
}
