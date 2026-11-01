import type { IsoTimestamp, Metadata } from './common'
import type { CheckpointId, ThreadId } from './ids'

export interface CheckpointRef {
  readonly threadId: ThreadId
  readonly checkpointId: CheckpointId
  readonly namespace: string
  readonly checkpointMap: Readonly<Record<string, string>>
}

export interface CheckpointSummary {
  readonly ref: CheckpointRef
  readonly parent: CheckpointRef | null
  readonly metadata: Metadata
  readonly createdAt: IsoTimestamp | null
}
