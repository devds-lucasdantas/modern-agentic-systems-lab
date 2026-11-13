/** Demonstrate lost-HTTP-response ambiguity with the real compiled typed client. */
import { pathToFileURL } from 'node:url'

const [base, entry, threadId, assistantId] = process.argv.slice(2)
if (!base || !entry || !threadId || !assistantId) {
  throw new Error('Usage: node lab-24e-failure-client.mjs BASE CLIENT THREAD ASSISTANT')
}
const { AgentServerClient } = await import(pathToFileURL(entry).href)
let postAttempts = 0
let acceptedByTransport = false
const fetchImpl = async (url, init) => {
  const pathname = new URL(String(url)).pathname
  if (init?.method === 'POST' && pathname === `/threads/${encodeURIComponent(threadId)}/runs`) {
    postAttempts += 1
    const response = await fetch(url, init)
    if (!response.ok) return response
    // Here the server has accepted and replied, but the caller does not see it.
    // This simulates lost client visibility, NOT an actual network partition.
    acceptedByTransport = true
    throw new TypeError('SIMULATED_LOST_RESPONSE_AFTER_ACCEPTANCE')
  }
  return fetch(url, init)
}
const client = new AgentServerClient({ baseUrl: base, fetchImpl })
let caughtTypeError = false
try {
  await client.createResumeRun(threadId, {
    assistantId, resumeValue: 'LOST_RESPONSE_24E',
  })
  throw new Error('Unexpected successful client response')
} catch (error) {
  caughtTypeError = error instanceof TypeError &&
    error.message === 'SIMULATED_LOST_RESPONSE_AFTER_ACCEPTANCE'
  if (!caughtTypeError) throw error
}
if (!acceptedByTransport || postAttempts !== 1) {
  throw new Error('Expected exactly one accepted POST with simulated response loss')
}
let state
let runs
for (let i = 0; i < 150; i += 1) {
  state = await client.getThreadState(threadId)
  runs = await client.listRuns(threadId)
  if (state.values?.result === 'RESUMED:LOST_RESPONSE_24E' &&
      runs.length === 2 && runs.every(run => run.status === 'success')) break
  await new Promise(resolve => setTimeout(resolve, 200))
}
if (!state || !runs || state.values?.result !== 'RESUMED:LOST_RESPONSE_24E') {
  throw new Error('Could not confirm independently persisted result after simulated loss')
}
// Last line is machine-readable; never leak raw state data in evidence.
process.stdout.write(JSON.stringify({
  postAttempts,
  caughtTypeError,
  acceptedByTransport,
  runCount: runs.length,
  statuses: runs.map(run => run.status),
  finalResult: state.values.result,
  interruptCount: state.interrupts.length,
  next: state.position.next,
}) + '\n')
