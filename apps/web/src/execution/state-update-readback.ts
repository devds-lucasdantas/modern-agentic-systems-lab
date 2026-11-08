import type {
  CheckpointId,
  ThreadState,
} from '../domain'

import type {
  UpdateThreadStateResult,
} from '../transport/agent-server'

/**
 * POST returns the new checkpoint; GET gives the observed HEAD.
 * Equality is a readback observation, NOT a concurrency guarantee.
 */
export interface StateUpdateReadback {
  readonly kind: 'matching' | 'different'
  readonly writtenCheckpointId: CheckpointId
  readonly observedHeadCheckpointId: CheckpointId | null
}

export const classifyStateUpdateReadback = (
  written: UpdateThreadStateResult,
  observed: ThreadState,
): StateUpdateReadback => {
  if (written.checkpoint.threadId !== observed.threadId) {
    throw new Error('State update readback belongs to a different Thread')
  }

  const observedHeadCheckpointId = observed.checkpoint?.checkpointId ?? null

  return {
    kind: observedHeadCheckpointId === written.checkpoint.checkpointId
      ? 'matching'
      : 'different',
    writtenCheckpointId: written.checkpoint.checkpointId,
    observedHeadCheckpointId,
  }
}
