import {
  assistantId, checkpointId, interruptId, runId, threadId,
  type Run, type Thread, type ThreadState,
} from '../domain'
import {
  classifyResumePostFailure, classifyResumeRecovery,
  RESUME_ATTEMPT_KEY, type ResumeRecoveryReadback,
} from './resume-recovery'

let passed = 0
const check = (condition: boolean, label: string) => {
  if (!condition) throw new Error(`FAIL: ${label}`)
  passed += 1
  console.log(`PASS: ${label}`)
}
const tid = threadId('recover-thread')
const aid = assistantId('canonical-assistant')
const first = runId('original')
const resumed = runId('resumed')
const ref = { threadId: tid, checkpointId: checkpointId('c1'),
  namespace: '', checkpointMap: {} }
const before: ThreadState = {
  threadId: tid, values: { secret: 'NEVER_LEAK' },
  position: { next: ['approval'] }, checkpoint: ref, parentCheckpoint: null,
  metadata: {}, tasks: [], interrupts: [{ kind: 'graph-interrupt',
    id: interruptId('i1'), value: { raw: 'PRIVATE' }, resumable: true }],
  createdAt: null,
}
const ended: ThreadState = {
  ...before, checkpoint: { ...ref, checkpointId: checkpointId('c2') },
  position: { next: [] }, interrupts: [],
}
const idle: Thread = {
  id: tid, status: 'idle', metadata: {}, createdAt: null, updatedAt: null,
}
const original: Run = {
  id: first, threadId: tid, assistantId: aid, status: 'success', metadata: {},
  error: null, createdAt: null, updatedAt: null,
}
const linked: Run = {
  ...original, id: resumed, metadata: { [RESUME_ATTEMPT_KEY]: 'attempt-123' },
}
const attempted = {
  threadId: tid, canonicalAssistantId: aid, initialRunId: first,
  attemptId: 'attempt-123', before,
}
const readback: ResumeRecoveryReadback = {
  thread: idle, state: ended, runs: [linked, original], runsListComplete: true,
}
const classify = (overrides: Partial<ResumeRecoveryReadback> = {}) =>
  classifyResumeRecovery(attempted, { ...readback, ...overrides })
const is = (expected: string, overrides: Partial<ResumeRecoveryReadback>, label: string) => {
  const result = classify(overrides)
  check(result.outcome === expected && !result.safeToRetry, label)
}

const confirmed = classify()
check(confirmed.outcome === 'confirmed-end', 'correlated successful Run and END confirmed')
check(confirmed.confirmedGraphEnd, 'END confirmation is explicit')
check(confirmed.hasCorrelatedRun && confirmed.correlatedRunId === resumed,
  'only the matching attempt marker can correlate a Run')
check(confirmed.safeToRetry === false, 'even confirmed END forbids automatic retry')
check(!JSON.stringify(confirmed).includes('NEVER_LEAK'), 'decision does not expose Thread values')
check(!JSON.stringify(confirmed).includes('PRIVATE'), 'decision does not expose raw interrupt')
is('not-observed', { state: before, runs: [original] },
  'missing new Run with unchanged HEAD remains uncertain')
is('head-diverged', { runs: [original] },
  'HEAD advanced without matching Run cannot be attributed')
is('foreign-activity', { runs: [{ ...linked, metadata: {} }, original] },
  'foreign Run cannot be misattributed when END is reached')
is('foreign-activity', { runs: [{ ...linked, metadata: { [RESUME_ATTEMPT_KEY]: 'other' } }, original] },
  'different marker cannot be misattributed')
is('incomplete-readback', { runsListComplete: false },
  'partial pagination cannot decide recovery')
is('incomplete-readback', { runs: [linked] },
  'missing baseline Run cannot decide recovery')
is('identity-conflict', { thread: { ...idle, id: threadId('other') } },
  'wrong Thread resource blocks recovery')
is('identity-conflict', { state: { ...ended, threadId: threadId('other') } },
  'wrong persisted state Thread blocks recovery')
is('identity-conflict', { runs: [linked, original, original] },
  'duplicate Run IDs are rejected')
is('identity-conflict', { runs: [{ ...linked, threadId: threadId('other') }, original] },
  'cross-Thread Run rejected')
is('identity-conflict', { runs: [{ ...linked, assistantId: assistantId('wrong') }, original] },
  'matching marker with wrong Assistant rejected')
is('identity-conflict', { runs: [linked, { ...linked, id: runId('extra'), metadata: {} }, original] },
  'unrelated post-baseline Run precludes unique attribution')
is('duplicate-attempt', { runs: [linked, { ...linked, id: runId('copy') }, original] },
  'two Runs with the same attempt marker are unsafe')
is('run-in-flight', { state: before, runs: [{ ...linked, status: 'running' }, original], thread: { ...idle, status: 'busy' } },
  'running Run does not imply END')
is('run-in-flight', { state: before, runs: [{ ...linked, status: 'pending' }, original] },
  'pending Run is still in flight')
is('run-terminal-without-end', { runs: [{ ...linked, status: 'error' }, original] },
  'terminal error blocks completion')
is('run-terminal-without-end', { runs: [{ ...linked, status: 'timeout' }, original] },
  'terminal timeout blocks completion')
is('run-terminal-without-end', { runs: [{ ...linked, status: 'interrupted' }, original] },
  'terminal interruption blocks completion')
is('run-success-unreconciled', { state: before },
  'Run success without checkpoint advancement is inconclusive')
is('run-success-unreconciled', { state: { ...ended, position: { next: ['more'] } } },
  'pending graph position blocks END even if Run succeeded')
is('run-success-unreconciled', { thread: { ...idle, status: 'busy' } },
  'non-idle Thread blocks END even if Run succeeded')
is('follow-up-interrupt', { state: { ...ended, position: { next: ['gate2'] },
  interrupts: before.interrupts } },
  'successful Run that created another interrupt is not END')
check(classifyResumePostFailure(409) === 'conflict', 'HTTP 409 classified as conflict')
check(classifyResumePostFailure(null) === 'ambiguous', 'lost response remains ambiguous')
check(classifyResumePostFailure(500) === 'ambiguous', 'HTTP 500 does not authorize retry')
console.log(`\n${passed} 2.4E read-only recovery-policy assertions passed`)
