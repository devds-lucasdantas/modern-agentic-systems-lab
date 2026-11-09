import {
  checkpointId,
  interruptId,
  threadId,
  type ThreadState,
} from '../domain'

import {
  projectPersistedInterrupts,
} from './interrupt-projection'

let passed = 0
const check = (condition: boolean, label: string): void => {
  if (!condition) throw new Error(`FAIL: ${label}`)
  passed += 1
  console.log(`PASS: ${label}`)
}

const tid = threadId('lab-24b-thread')
const state: ThreadState = {
  threadId: tid,
  values: { secret: 'RAW_STATE_SENTINEL' },
  position: { next: [] },
  checkpoint: null,
  parentCheckpoint: null,
  metadata: { secret: 'RAW_METADATA_SENTINEL' },
  tasks: [],
  interrupts: [],
  createdAt: null,
}
const cp = {
  threadId: tid,
  checkpointId: checkpointId('cp-24b-1'),
  namespace: 'internal-namespace-sentinel',
  checkpointMap: { subgraph: 'RAW_CHECKPOINT_MAP_SENTINEL' },
}
const dynamic = {
  ...state,
  checkpoint: cp,
  position: { next: ['approval'] },
  interrupts: [{
    kind: 'graph-interrupt' as const,
    id: interruptId('interrupt-24b'),
    resumable: true as const,
    value: {
      kind: 'masl_24a_hitl',
      question: '  Approve the deterministic probe?  ',
      request: 'RAW_REQUEST_SENTINEL',
      private: { detail: 'RAW_VALUE_SENTINEL' },
    },
  }],
}
const interruptedThread = { id: tid, status: 'interrupted' as const }

const empty = projectPersistedInterrupts(state, null)
check(empty.situation === 'uninitialized', 'empty Thread is uninitialized')
check(empty.checkpointId === null, 'empty Thread has no checkpoint identity')
check(empty.threadStatus === null, 'thread status can be unknown')

const end = projectPersistedInterrupts({ ...state, checkpoint: cp }, { id: tid, status: 'idle' })
check(end.situation === 'end', 'persisted checkpoint with no next nodes is END')
const pending = projectPersistedInterrupts({ ...state, checkpoint: cp, position: { next: ['node'] } }, null)
check(pending.situation === 'position-pending', 'nonempty next without status is position-pending, not HITL')
const breakpoint = projectPersistedInterrupts({ ...state, checkpoint: cp, position: { next: ['checkpoint_only'] } }, interruptedThread)
check(breakpoint.situation === 'interrupted-without-payload', 'breakpoint observation has no dynamic interrupt payload')
check(breakpoint.interruptCount === 0, 'breakpoint is not promoted to a human request')
const lifecycle = projectPersistedInterrupts({ ...state, checkpoint: cp }, interruptedThread)
check(lifecycle.situation === 'interrupted-without-payload', 'an interrupted Thread alone does not imply a graph interrupt')

const hitl = projectPersistedInterrupts(dynamic, interruptedThread)
check(hitl.situation === 'graph-interrupt', '2.4A dynamic graph interrupt is classified from persisted payload')
check(hitl.checkpointId === cp.checkpointId, 'checkpoint ID is preserved for correlation')
check(hitl.interruptCount === 1 && hitl.hiddenInterruptCount === 0, 'interrupt count is preserved')
check(hitl.interrupts[0]?.id === interruptId('interrupt-24b'), 'dynamic interrupt ID is preserved')
check(hitl.interrupts[0]?.kind === 'known-24a-probe', 'only known 2.4A schema is recognized')
check(hitl.interrupts[0]?.question === 'Approve the deterministic probe?', 'only allowlisted question is projected')
check(hitl.threadStatus === 'interrupted', 'Thread status remains an explicitly separate observation')

const forbidden = ['RAW_REQUEST_SENTINEL', 'RAW_VALUE_SENTINEL', 'RAW_STATE_SENTINEL',
  'RAW_METADATA_SENTINEL', 'RAW_CHECKPOINT_MAP_SENTINEL', 'internal-namespace-sentinel']
check(forbidden.every((item) => !JSON.stringify(hitl).includes(item)), 'raw payload, state, metadata and checkpoint map never leak')
check(!Object.hasOwn(hitl, 'values') && !Object.hasOwn(hitl, 'checkpoint') &&
  !Object.hasOwn(hitl.interrupts[0]!, 'value'), 'projection exposes no raw state or interrupt value')
check(!Object.is(hitl.interrupts[0], dynamic.interrupts[0]), 'interrupt item is detached from Runtime value')

const opaque = projectPersistedInterrupts({ ...dynamic, interrupts: [{
  ...dynamic.interrupts[0]!, id: null, value: { kind: 'other_schema', question: 'RAW_UNKNOWN_SENTINEL' },
}] }, interruptedThread)
check(opaque.situation === 'graph-interrupt', 'unknown schema still represents a graph-level interrupt')
check(opaque.interrupts[0]?.kind === 'opaque' && opaque.interrupts[0]?.question === null,
  'unknown schema is not rendered as a prompt')
check(opaque.interrupts[0]?.id === null, 'optional interrupt ID stays nullable')
check(!JSON.stringify(opaque).includes('RAW_UNKNOWN_SENTINEL'), 'unknown payload does not leak')

const malformed = projectPersistedInterrupts({ ...dynamic, interrupts: [{
  ...dynamic.interrupts[0]!, value: { kind: 'masl_24a_hitl', question: ['not a string'] },
}] }, interruptedThread)
check(malformed.interrupts[0]?.kind === 'opaque', 'malformed known schema is rejected')
const long = projectPersistedInterrupts({ ...dynamic, interrupts: [{
  ...dynamic.interrupts[0]!, value: { kind: 'masl_24a_hitl', question: 'X'.repeat(241) },
}] }, interruptedThread)
check(long.interrupts[0]?.question === null, 'overlong prompt is hidden')
const controls = projectPersistedInterrupts({ ...dynamic, interrupts: [{
  ...dynamic.interrupts[0]!, value: { kind: 'masl_24a_hitl', question: 'Unsafe\nnewline' },
}] }, interruptedThread)
check(controls.interrupts[0]?.question === null, 'control characters in prompt are rejected')

const suspicious = projectPersistedInterrupts({ ...dynamic, checkpoint: null }, interruptedThread)
check(suspicious.situation === 'indeterminate' && suspicious.interrupts.length === 0,
  'interrupt without persisted checkpoint fails closed')
const inconsistent = projectPersistedInterrupts({ ...state, position: { next: ['unknown'] } }, null)
check(inconsistent.situation === 'indeterminate', 'next without a persisted checkpoint is indeterminate')

const many = projectPersistedInterrupts({ ...dynamic, interrupts: Array.from({ length: 25 }, (_, i) => ({
  ...dynamic.interrupts[0]!, id: interruptId(`interrupt-${i}`),
})) }, interruptedThread)
check(many.interruptCount === 25 && many.interrupts.length === 20 && many.hiddenInterruptCount === 5,
  'unbounded interrupt collection is capped for display')
const noThreadStatus = projectPersistedInterrupts(dynamic, null)
check(noThreadStatus.situation === 'graph-interrupt' && noThreadStatus.threadStatus === null,
  'persisted dynamic interrupt is recognized without Thread status')

let rejectedCrossThread = false
try {
  projectPersistedInterrupts(dynamic, { id: threadId('other-thread'), status: 'interrupted' })
} catch (error) {
  rejectedCrossThread = error instanceof Error && error.message.includes('different Thread')
}
check(rejectedCrossThread, 'cross-Thread status input is rejected')

console.log(`\n${passed} interrupt-projection assertions passed`)
