import {
  checkpointId,
  threadId,
} from '../domain'

import {
  classifyHeadPreflight,
} from './state-mutation-preflight'

let passed = 0
const check = (condition: boolean, description: string): void => {
  if (!condition) throw new Error(`FAIL: ${description}`)
  passed += 1
  console.log(`PASS: ${description}`)
}

const tid = threadId('thread-A')
const snapshot = (id: string | null, owner = tid) => ({
  threadId: owner,
  checkpoint: id === null ? null : {
    threadId: owner,
    checkpointId: checkpointId(id),
    namespace: '',
    checkpointMap: {},
  },
})

const same = classifyHeadPreflight(snapshot('C1'), snapshot('C1'))
check(same.kind === 'matching', 'same HEAD permits best-effort preflight')
check(same.displayedHead === checkpointId('C1'), 'displayed HEAD is preserved')
check(same.currentHead === checkpointId('C1'), 'current HEAD is preserved')

check(
  classifyHeadPreflight(snapshot(null), snapshot(null)).kind === 'matching',
  'two uninitialized states compare equal',
)

const newer = classifyHeadPreflight(snapshot('C1'), snapshot('C2'))
check(newer.kind === 'stale', 'advanced HEAD is detected')
check(newer.currentHead === checkpointId('C2'), 'new HEAD identity is reported')

check(
  classifyHeadPreflight(snapshot(null), snapshot('C1')).kind === 'stale',
  'an initially empty state becoming initialized is stale',
)
check(
  classifyHeadPreflight(snapshot('C1'), snapshot(null)).kind === 'stale',
  'a populated state becoming uninitialized is stale',
)

let crossThreadRejected = false
try {
  classifyHeadPreflight(snapshot('C1'), snapshot('C1', threadId('thread-B')))
} catch (error) {
  crossThreadRejected = error instanceof Error &&
    error.message.includes('different Thread')
}
check(crossThreadRejected, 'cross-Thread preflight is rejected')

check(
  classifyHeadPreflight(snapshot('C1'), {
    ...snapshot('C1'),
    checkpoint: { ...snapshot('C1').checkpoint!, namespace: 'subgraph' },
  }).kind === 'stale',
  'checkpoint namespace drift is detected even with the same ID',
)
check(
  classifyHeadPreflight(snapshot('C1'), {
    ...snapshot('C1'),
    checkpoint: { ...snapshot('C1').checkpoint!, checkpointMap: { child: 'different' } },
  }).kind === 'stale',
  'checkpoint map drift is detected even with the same ID',
)


console.log(`\n${passed} head-preflight assertions passed`)
