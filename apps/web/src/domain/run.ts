import type { IsoTimestamp, Metadata } from './common'
import type { AssistantId, RunId, ThreadId } from './ids'

export const RUN_STATUSES = [
  'pending',
  'running',
  'error',
  'success',
  'timeout',
  'interrupted',
] as const

export type RunStatus = (typeof RUN_STATUSES)[number]

export interface Run {
  readonly id: RunId
  readonly assistantId: AssistantId
  readonly threadId: ThreadId | null
  readonly status: RunStatus
  readonly metadata: Metadata
  readonly error: string | null
  readonly createdAt: IsoTimestamp | null
  readonly updatedAt: IsoTimestamp | null
}
