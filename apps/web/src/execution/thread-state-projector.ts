import type {
  CheckpointId,
  Message,
  ThreadId,
  ThreadState,
} from '../domain'

import {
  projectMessagesFromState,
} from './message-projector'


export type GraphReadStatus =
  | 'uninitialized'
  | 'pending'
  | 'end'


export interface GraphReadProjection {
  readonly status:
    GraphReadStatus

  readonly next:
    readonly string[]

  readonly checkpointId:
    CheckpointId | null

  readonly parentCheckpointId:
    CheckpointId | null

  readonly taskCount:
    number

  readonly interruptCount:
    number
}


export interface PersistedThreadProjection {
  readonly authority:
    'persisted'

  readonly threadId:
    ThreadId

  readonly messages:
    readonly Message[]

  readonly graph:
    GraphReadProjection
}


/**
 * Project persisted Runtime state into an explicit read-only UI view.
 *
 * Deliberately excludes:
 * - arbitrary StateValues channels;
 * - raw metadata;
 * - raw tasks and interrupt payloads;
 * - checkpoint configuration internals.
 *
 * This function performs no IO and does not mutate Runtime state.
 */
export const projectThreadState = (
  state: ThreadState,
): PersistedThreadProjection => {
  const hasCheckpoint =
    state.checkpoint !== null

  const status: GraphReadStatus =
    !hasCheckpoint
      ? 'uninitialized'
      : state.position.next.length === 0
        ? 'end'
        : 'pending'

  return {
    authority: 'persisted',

    threadId:
      state.threadId,

    messages:
      projectMessagesFromState(
        state,
      ),

    graph: {
      status,

      next: [
        ...state.position.next,
      ],

      checkpointId:
        state.checkpoint
          ?.checkpointId ?? null,

      parentCheckpointId:
        state.parentCheckpoint
          ?.checkpointId ?? null,

      taskCount:
        state.tasks.length,

      interruptCount:
        state.interrupts.length,
    },
  }
}
