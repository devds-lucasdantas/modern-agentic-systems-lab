import { checkpointId, interruptId, threadId, type ThreadState } from '../domain'
import { inspectHitlAction, sameObservedHitlAction } from './hitl-action'

let passed = 0
const check = (condition: boolean, title: string) => {
  if (!condition) throw new Error(`FAIL: ${title}`)
  passed += 1
  console.log(`PASS: ${title}`)
}
const id = threadId('lab-thread')
const checkpoint = { threadId: id, checkpointId: checkpointId('c1'), namespace: '', checkpointMap: { a: 'c0' } }
const approval = { kind: 'graph-interrupt' as const, id: interruptId('i1'),
  value: { kind: 'masl_24a_hitl', question: 'Approve the deterministic probe?', secret: 'NEVER_EXPOSE' },
  resumable: true as const }
const state: ThreadState = { threadId: id, values: {}, position: { next: ['approval'] },
  checkpoint, parentCheckpoint: null, metadata: {}, tasks: [], interrupts: [approval], createdAt: null }
const gate = inspectHitlAction(state, 'persisted', id)
check(gate.allowed, 'one reviewed probe is eligible')
check(gate.question === 'Approve the deterministic probe?', 'sanitized question only')
check(gate.interruptId === 'i1', 'interrupt ID correlated')
check(gate.checkpointId === 'c1', 'checkpoint identity visible')
check(!JSON.stringify(gate).includes('NEVER_EXPOSE'), 'unknown value fields never projected')
check(!inspectHitlAction(state, 'live', id).allowed, 'live state rejected')
check(!inspectHitlAction(state, 'unreconciled', id).allowed, 'unreconciled state rejected')
check(!inspectHitlAction(state, 'persisted', null).allowed, 'missing Thread selection rejected')
check(!inspectHitlAction(state, 'persisted', threadId('another')).allowed, 'cross-Thread rejected')
check(!inspectHitlAction(null, 'persisted', id).allowed, 'missing state rejected')
check(!inspectHitlAction({ ...state, checkpoint: null }, 'persisted', id).allowed, 'missing checkpoint rejected')
check(!inspectHitlAction({ ...state, position: { next: [] } }, 'persisted', id).allowed, 'END not approved')
check(!inspectHitlAction({ ...state, position: { next: ['other'] } }, 'persisted', id).allowed, 'unrelated node not approved')
check(!inspectHitlAction({ ...state, interrupts: [] }, 'persisted', id).allowed, 'breakpoint not approved')
check(!inspectHitlAction({ ...state, interrupts: [approval, approval] }, 'persisted', id).allowed, 'multiple interrupts rejected')
check(!inspectHitlAction({ ...state, interrupts: [{...approval,id:null}] }, 'persisted', id).allowed, 'missing interrupt ID rejected')
check(!inspectHitlAction({ ...state, interrupts: [{...approval,value:{kind:'other',question:'Bogus'}}] }, 'persisted', id).allowed, 'opaque request rejected')
check(!inspectHitlAction({ ...state, interrupts: [{...approval,value:{kind:'masl_24a_hitl',question:'a\n b'}}] }, 'persisted', id).allowed, 'control-character request rejected')
check(sameObservedHitlAction(state, { ...state, checkpoint: {...checkpoint} }), 'matching HEAD and prompt accepted at preflight')
check(!sameObservedHitlAction(state, { ...state, checkpoint: { ...checkpoint, checkpointId:checkpointId('c2') } }), 'advanced checkpoint blocked')
check(!sameObservedHitlAction(state, { ...state, checkpoint: { ...checkpoint, checkpointMap:{a:'changed'} } }), 'checkpoint map change blocked')
check(!sameObservedHitlAction(state, { ...state, checkpoint: { ...checkpoint, namespace:'other' } }), 'namespace change blocked')
check(!sameObservedHitlAction(state, { ...state, interrupts: [{ ...approval, id: interruptId('i2') }] }), 'interrupt ID change blocked')
check(!sameObservedHitlAction(state, { ...state, interrupts: [{ ...approval, value: {kind:'masl_24a_hitl',question:'Different'} }] }), 'prompt drift blocked')
check(!sameObservedHitlAction(state, { ...state, interrupts: [] }), 'cleared interruption blocked')
check(!sameObservedHitlAction(state, { ...state, position: { next: ['elsewhere'] } }), 'different graph node blocked')
console.log(`\n${passed} HITL action-gate assertions passed`)
