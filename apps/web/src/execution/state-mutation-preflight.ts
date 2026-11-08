import type {
  CheckpointId,
  CheckpointRef,
  ThreadState,
} from '../domain'

export interface HeadPreflight {
  readonly kind: 'matching' | 'stale'
  readonly displayedHead: CheckpointId | null
  readonly currentHead: CheckpointId | null
}

const sameCheckpointRef = (
  a: CheckpointRef | null,
  b: CheckpointRef | null,
): boolean => {
  if (a === null || b === null) return a === b
  if (a.threadId !== b.threadId || a.checkpointId !== b.checkpointId ||
    a.namespace !== b.namespace) return false

  const aKeys = Object.keys(a.checkpointMap).sort()
  const bKeys = Object.keys(b.checkpointMap).sort()
  return aKeys.length === bKeys.length && aKeys.every((key, index) =>
    key === bKeys[index] && a.checkpointMap[key] === b.checkpointMap[key])
}

/**
 * Detects an already-stale local observation before a deliberate POST.
 * Compare complete checkpoint identity (including namespace and checkpointMap),
 * not only checkpoint ID. This is NOT atomic with POST and is NOT CAS.
 * The caller must fail closed on mismatches and read errors.
 */
export const classifyHeadPreflight = (
  displayed: Pick<ThreadState, 'threadId' | 'checkpoint'>,
  current: Pick<ThreadState, 'threadId' | 'checkpoint'>,
): HeadPreflight => {
  if (displayed.threadId !== current.threadId) {
    throw new Error('Preflight state belongs to a different Thread')
  }

  const displayedHead = displayed.checkpoint?.checkpointId ?? null
  const currentHead = current.checkpoint?.checkpointId ?? null

  return {
    kind: sameCheckpointRef(displayed.checkpoint, current.checkpoint)
      ? 'matching' : 'stale',
    displayedHead,
    currentHead,
  }
}
