import { assistantId, threadId } from '../../domain'
import { AgentServerClient } from './client'
import { AgentServerDecodeError, AgentServerHttpError } from './errors'

let passed = 0
const check = (condition: boolean, description: string): void => {
  if (!condition) throw new Error(`FAIL: ${description}`)
  passed += 1
  console.log(`PASS: ${description}`)
}

const tid = threadId('thread/with spaces')
const aid = assistantId('masl_24c_hitl')
const requests: Array<{ url: string; init?: RequestInit }> = []
let status = 200
let shouldLoseResponse = false
const goodRunResponse = {
  run_id: 'run-new', thread_id: tid, assistant_id: aid,
  created_at: '2026-11-08T00:00:00Z', updated_at: '2026-11-08T00:00:00Z',
  status: 'pending', metadata: {}, kwargs: {}, multitask_strategy: 'reject',
}
let responseBody: unknown = goodRunResponse
const fetchImpl: typeof fetch = async (input, init) => {
  requests.push({ url: String(input), init })
  if (shouldLoseResponse) throw new TypeError('Simulated lost POST response')
  return new Response(JSON.stringify(responseBody), {
    status, headers: { 'content-type': 'application/json' },
  })
}
const client = new AgentServerClient({
  baseUrl: 'http://runtime.example/',
  fetchImpl,
  credentials: 'same-origin',
})

const run = await client.createResumeRun(tid, {
  assistantId: aid,
  resumeValue: { approved: true, selections: [1, 'two', null] },
  metadata: { laboratory: '2.4C' },
})
check(requests.length === 1, 'exactly one POST; no implicit GET or retry')
check(requests[0]?.url === 'http://runtime.example/threads/thread%2Fwith%20spaces/runs',
  'Thread ID encoded in stateful Run endpoint')
check(requests[0]?.init?.method === 'POST', 'resume creates a Run, not a state update')
check(requests[0]?.init?.credentials === 'same-origin', 'credentials policy respected')
const headers = new Headers(requests[0]?.init?.headers)
check(headers.get('accept') === 'application/json' &&
  headers.get('content-type') === 'application/json', 'JSON headers preserved')
const body = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>
const command = body.command as Record<string, unknown>
check(body.assistant_id === aid && body.multitask_strategy === 'reject',
  'Assistant and reject multitask policy are explicit')
check(JSON.stringify(body.input) === '{}', 'resume Run sends empty input, not new user input')
check(JSON.stringify(command.resume) === '{"approved":true,"selections":[1,"two",null]}',
  'structured Command.resume serialized without mutation')
check(Object.keys(command).length === 1 && !Object.hasOwn(body, 'checkpoint'),
  'only Command.resume: no checkpoint, goto or update')
check((body.metadata as { laboratory: string }).laboratory === '2.4C',
  'optional metadata is serialized')
check(run.id === 'run-new' && run.threadId === tid && run.assistantId === aid &&
  run.status === 'pending', 'response is a typed Run, not a completed ThreadState')
check(!Object.hasOwn(run, 'values') && !Object.hasOwn(run, 'interrupts'),
  'Run response does not pretend to reconcile persisted state')

requests.length = 0
await client.createResumeRun(tid, { assistantId: aid, resumeValue: null })
const nullBody = JSON.parse(String(requests[0]?.init?.body)) as {
  command: { resume: unknown }; metadata?: unknown
}
check(Object.hasOwn(nullBody.command, 'resume') && nullBody.command.resume === null,
  'explicit JSON null is preserved as a resume value')
check(!Object.hasOwn(nullBody, 'metadata'), 'undefined optional metadata omitted')

const rejected = async (value: unknown): Promise<boolean> => {
  requests.length = 0
  try {
    await client.createResumeRun(tid, { assistantId: aid, resumeValue: value as string })
    return false
  } catch (error) {
    return error instanceof TypeError && requests.length === 0
  }
}
check(await rejected(undefined), 'undefined resume is rejected pre-HTTP')
check(await rejected(Number.NaN), 'NaN resume is rejected pre-HTTP')
check(await rejected(Number.POSITIVE_INFINITY), 'Infinity resume is rejected pre-HTTP')
check(await rejected(BigInt(1)), 'BigInt resume is rejected pre-HTTP')
check(await rejected({ x: undefined }), 'undefined nested field is rejected pre-HTTP')
const sparseArray: unknown[] = [1, 2]
sparseArray.length = 3
check(await rejected(sparseArray), 'sparse array is rejected pre-HTTP')
const cyclic: { self?: unknown } = {}
cyclic.self = cyclic
check(await rejected(cyclic), 'cyclic object is rejected pre-HTTP')
check(await rejected({ get x() { return 'accessor' } }),
  'getter is rejected without invocation')
check(await rejected(new Date()), 'non-JSON object is rejected pre-HTTP')
const arrayWithExtra = Object.assign([1, 2], { extra: 'must not disappear' })
check(await rejected(arrayWithExtra), 'array extra keys cannot disappear in JSON')
const objectWithSymbol = { x: 'ok', [Symbol('hidden')]: 'not-json' }
check(await rejected(objectWithSymbol), 'symbol keys cannot disappear in JSON')

requests.length = 0
status = 409
responseBody = { detail: 'Thread is busy' }
let httpError: unknown
try {
  await client.createResumeRun(tid, { assistantId: aid, resumeValue: 'CONTINUE' })
} catch (error) { httpError = error }
check(httpError instanceof AgentServerHttpError && httpError.status === 409 &&
  httpError.method === 'POST' && httpError.detail === 'Thread is busy',
  'HTTP conflict remains a typed error')
check(requests.length === 1, 'HTTP conflict is not retried')

status = 200
responseBody = { run_id: 'incomplete' }
let decodeError: unknown
try {
  await client.createResumeRun(tid, { assistantId: aid, resumeValue: 'CONTINUE' })
} catch (error) { decodeError = error }
check(decodeError instanceof AgentServerDecodeError,
  'malformed Run response fails closed')

responseBody = { ...goodRunResponse, run_id: 'run-other', thread_id: 'another-thread' }
let wrongThread: unknown
try {
  await client.createResumeRun(tid, { assistantId: aid, resumeValue: 'CONTINUE' })
} catch (error) { wrongThread = error }
check(wrongThread instanceof AgentServerDecodeError &&
  wrongThread.path === 'Run.thread_id', 'wrong response Thread is rejected')

responseBody = { ...goodRunResponse, assistant_id: 'another-assistant' }
let wrongAssistant: unknown
try {
  await client.createResumeRun(tid, { assistantId: aid, resumeValue: 'CONTINUE' })
} catch (error) { wrongAssistant = error }
check(wrongAssistant instanceof AgentServerDecodeError &&
  wrongAssistant.path === 'Run.assistant_id', 'wrong response Assistant is rejected')

shouldLoseResponse = true
requests.length = 0
let lostResponse: unknown
try {
  await client.createResumeRun(tid, { assistantId: aid, resumeValue: 'CONTINUE' })
} catch (error) { lostResponse = error }
check(lostResponse instanceof TypeError && requests.length === 1,
  'lost POST response remains ambiguous; no automatic retry')

console.log(`\n${passed} resume-run transport assertions passed`)
