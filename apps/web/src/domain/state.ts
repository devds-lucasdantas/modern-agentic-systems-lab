import type {
  IsoTimestamp,
  Metadata,
  StateValues,
} from './common'
import type { CheckpointRef } from './checkpoint'
import type { GraphInterrupt } from './interrupt'
import type { ThreadId } from './ids'

export interface GraphPosition {
  readonly next: readonly string[]
}

export interface RuntimeTaskSummary {
  readonly id: string | null
  readonly name: string | null
  readonly error: string | null
}

export interface ThreadState {
  readonly threadId: ThreadId
  readonly values: StateValues
  readonly position: GraphPosition
  readonly checkpoint: CheckpointRef | null
  readonly parentCheckpoint: CheckpointRef | null
  readonly metadata: Metadata
  readonly tasks: readonly RuntimeTaskSummary[]
  readonly interrupts: readonly GraphInterrupt[]
  readonly createdAt: IsoTimestamp | null
}
