import {
  checkpointId,
  threadId,
  type CheckpointRef,
  type ThreadState,
} from '../domain'

import { classifyStateUpdateReadback } from './state-update-readback'

const t = threadId('lab-ui-thread')
const cp = (id: string): CheckpointRef => ({
  threadId: t,
  checkpointId: checkpointId(id),
  namespace: '',
  checkpointMap: {},
})

const state: ThreadState = {
  threadId: t,
  values: {},
  position: { next: [] },
  checkpoint: cp('C2'),
  parentCheckpoint: cp('C1'),
  metadata: {},
  tasks: [],
  interrupts: [],
  createdAt: null,
}

const assert = (condition: boolean, name: string) => {
  if (!condition) throw new Error(`FAIL: ${name}`)
  console.log(`PASS: ${name}`)
}

const same = classifyStateUpdateReadback({ checkpoint: cp('C2') }, state)
assert(same.kind === 'matching', 'equal POST checkpoint and GET HEAD are classified as matching')
assert(same.observedHeadCheckpointId === checkpointId('C2'), 'matching readback exposes observed HEAD')

const different = classifyStateUpdateReadback({ checkpoint: cp('C3') }, state)
assert(different.kind === 'different', 'different HEAD is not presented as confirmed')
assert(different.writtenCheckpointId === checkpointId('C3'), 'POST checkpoint remains independent from observed HEAD')

const absent = classifyStateUpdateReadback(
  { checkpoint: cp('C3') }, { ...state, checkpoint: null },
)
assert(absent.kind === 'different' && absent.observedHeadCheckpointId === null, 'missing observed checkpoint is not called matching')

let mismatchRejected = false
try {
  classifyStateUpdateReadback(
    { checkpoint: { ...cp('C3'), threadId: threadId('different-thread') } },
    state,
  )
} catch {
  mismatchRejected = true
}
assert(mismatchRejected, 'cross-Thread readback is rejected')

console.log('\n6 state-update readback assertions passed')
