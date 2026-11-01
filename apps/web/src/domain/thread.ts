import type { IsoTimestamp, Metadata } from './common'
import type { ThreadId } from './ids'

export const THREAD_STATUSES = [
  'idle',
  'busy',
  'interrupted',
  'error',
] as const

export type ThreadStatus = (typeof THREAD_STATUSES)[number]

export interface Thread {
  readonly id: ThreadId
  readonly status: ThreadStatus
  readonly metadata: Metadata
  readonly createdAt: IsoTimestamp | null
  readonly updatedAt: IsoTimestamp | null
}
