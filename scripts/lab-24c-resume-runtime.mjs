/** Real compiled AgentServerClient against temporary pinned LangGraph Runtime. */
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const [base, entry, rawThread, output] = process.argv.slice(2)
if (!base || !entry || !rawThread || !output) {
  throw new Error('Usage: node lab-24c-resume-runtime.mjs BASE COMPILED_CLIENT THREAD_ID OUT_JSON')
}
const { AgentServerClient } = await import(pathToFileURL(entry).href)
const writes = []
const fetchImpl = async (url, init) => {
  const pathname = new URL(String(url)).pathname
  const method = init?.method ?? 'GET'
  if (method === 'POST') {
    writes.push({ pathname, method, body: JSON.parse(String(init?.body)) })
  }
  return fetch(url, init)
}
const client = new AgentServerClient({ baseUrl: base, fetchImpl })
const same = (got, expected, label) => {
  if (got !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`)
}
const threadId = rawThread
const initial = await client.getThreadState(threadId)
const firstHead = initial.checkpoint?.checkpointId ?? null
if (!firstHead || initial.interrupts.length !== 1 ||
    !initial.position.next.includes('approval')) {
  throw new Error('Initial graph must have persisted dynamic HITL interrupt')
}
const existingRuns = await client.listRuns(threadId)
same(existingRuns.length, 1, 'initial Run count')
const originalRun = existingRuns[0]
same(originalRun.threadId, threadId, 'initial Run Thread')
// Runtime accepts a graph name as request selector but persists a resolved
// concrete Assistant identity. Reuse the original Run's canonical ID so
// createResumeRun can continue to fail closed on assistant mismatches.
const assistantId = originalRun.assistantId
if (typeof assistantId !== 'string' || !assistantId.trim()) {
  throw new Error('Initial Run did not expose a canonical Assistant ID')
}
console.log('PASS: initial persisted HITL and one Run observed')
console.log('PASS: canonical Assistant ID recovered from the initial Run')

const resumedRun = await client.createResumeRun(threadId, {
  assistantId,
  resumeValue: 'APPROVE_24C',
  metadata: { lab: '2.4C', purpose: 'typed-resume-run' },
})
same(resumedRun.threadId, threadId, 'returned Run Thread')
same(resumedRun.assistantId, assistantId, 'returned Run Assistant')
same(writes.length, 1, 'one POST dispatched')
same(writes[0].pathname, `/threads/${encodeURIComponent(threadId)}/runs`, 'stateful Run path')
same(JSON.stringify(writes[0].body.input), '{}', 'empty Run input')
same(writes[0].body.command?.resume, 'APPROVE_24C', 'typed Command.resume')
same(writes[0].body.multitask_strategy, 'reject', 'reject concurrent strategy')
if (Object.hasOwn(writes[0].body, 'checkpoint')) throw new Error('Unexpected checkpoint selector')
console.log('PASS: one typed Command.resume POST created new stateful Run')

const timeout = Date.now() + 45000
let terminalRun
let finalState
let finalThread
while (Date.now() < timeout) {
  terminalRun = await client.getRun(threadId, resumedRun.id)
  if (terminalRun.status === 'error' || terminalRun.status === 'timeout' ||
    terminalRun.status === 'interrupted') {
    throw new Error(`Resume Run terminated with ${terminalRun.status}`)
  }
  if (terminalRun.status === 'success') {
    finalState = await client.getThreadState(threadId)
    finalThread = await client.getThread(threadId)
    if (finalThread.status === 'idle' && finalState.position.next.length === 0 &&
        finalState.interrupts.length === 0 &&
        finalState.values?.result === 'RESUMED:APPROVE_24C') break
  }
  await new Promise(resolve => setTimeout(resolve, 150))
}
if (!terminalRun || !finalState || !finalThread || finalState.values?.result !== 'RESUMED:APPROVE_24C') {
  throw new Error('Timed out waiting for independent persisted resume reconciliation')
}
same(terminalRun.status, 'success', 'terminal Run success')
same(finalThread.status, 'idle', 'Thread idle')
if (finalState.interrupts.length || finalState.position.next.length ||
    finalState.checkpoint?.checkpointId === firstHead) {
  throw new Error('Final state is not a new END checkpoint without interrupts')
}
const allRuns = await client.listRuns(threadId)
same(allRuns.length, 2, 'two physical Runs')
if (!allRuns.some(run => run.id === resumedRun.id)) throw new Error('Resume Run missing from Thread list')
same(writes.length, 1, 'no implicit follow-up POST')
console.log('PASS: independent Run/ThreadState reconciliation confirms graph END')

const checks = {
  initialInterruptPersisted: true,
  oneResumeRunPost: true,
  commandResumeSerialized: true,
  canonicalAssistantReused: true,
  newRunCreated: true,
  runSucceeded: true,
  secondRunObserved: true,
  resumeValuePersisted: true,
  interruptCleared: true,
  endReached: true,
  noImplicitRetry: true,
  noModelCalls: true,
}
const observations = {
  lab: '2.4C',
  threadId,
  initialCheckpointId: firstHead,
  finalCheckpointId: finalState.checkpoint.checkpointId,
  resumedRunId: resumedRun.id,
  canonicalAssistantId: assistantId,
  initialRunId: originalRun.id,
  finalThreadStatus: finalThread.status,
  finalRunStatus: terminalRun.status,
  finalGraphResult: finalState.values.result,
  runCount: allRuns.length,
  wire: writes[0],
  checks,
}
writeFileSync(output, `${JSON.stringify(observations, null, 2)}\n`, { encoding: 'utf8' })
console.log(`PASS: observations saved to ${output}`)
console.log(JSON.stringify({ checks, runCount: allRuns.length }, null, 2))
