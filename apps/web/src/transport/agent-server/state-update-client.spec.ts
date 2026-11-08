import {
  checkpointId,
  threadId,
} from '../../domain'
import { AgentServerClient } from './client'
import {
  AgentServerDecodeError,
  AgentServerHttpError,
} from './errors'

let passed = 0

const check = (condition: boolean, description: string): void => {
  if (!condition) {
    throw new Error(`FAIL: ${description}`)
  }
  passed += 1
  console.log(`PASS: ${description}`)
}

const target = threadId('thread/with spaces')
const requests: Array<{ url: string; init?: RequestInit }> = []

let responseBody: unknown = {
  checkpoint: {
    thread_id: target,
    checkpoint_id: 'checkpoint-new',
    checkpoint_ns: 'namespace',
    checkpoint_map: { child: 'checkpoint-child' },
  },
  configurable: { checkpoint_id: 'checkpoint-new' },
  checkpoint_id: 'checkpoint-new',
}
let responseStatus = 200

const fetchImpl: typeof fetch = async (input, init) => {
  requests.push({ url: String(input), init })
  return new Response(JSON.stringify(responseBody), {
    status: responseStatus,
    headers: { 'content-type': 'application/json' },
  })
}

const client = new AgentServerClient({
  baseUrl: 'http://runtime.example/',
  credentials: 'same-origin',
  fetchImpl,
})

const originalCheckpoint = {
  threadId: target,
  checkpointId: checkpointId('checkpoint-old'),
  namespace: 'namespace',
  checkpointMap: { child: 'checkpoint-old-child' },
}

const result = await client.updateThreadState(target, {
  values: { messages: [{ type: 'human', id: 'm-1', content: 'A' }] },
  checkpoint: originalCheckpoint,
  asNode: '__start__',
})

check(requests.length === 1, 'exactly one HTTP request')
check(
  requests[0]?.url === 'http://runtime.example/threads/thread%2Fwith%20spaces/state',
  'Thread ID is encoded in state URL',
)
check(requests[0]?.init?.method === 'POST', 'request is POST, not Run creation')
check(
  requests[0]?.init?.credentials === 'same-origin',
  'injected credential policy is preserved',
)

const headers = new Headers(requests[0]?.init?.headers)
check(
  headers.get('accept') === 'application/json' &&
  headers.get('content-type') === 'application/json',
  'JSON content negotiation headers are preserved',
)

const body = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>
const checkpointWire = body.checkpoint as Record<string, unknown>
check(
  Array.isArray((body.values as { messages: unknown[] }).messages) &&
  body.as_node === '__start__',
  'values and as_node are serialized',
)
check(
  checkpointWire.thread_id === target &&
  checkpointWire.checkpoint_id === 'checkpoint-old' &&
  checkpointWire.checkpoint_ns === 'namespace',
  'CheckpointRef identity is converted to wire format',
)
check(
  (checkpointWire.checkpoint_map as Record<string, unknown>).child ===
    'checkpoint-old-child',
  'checkpoint_map is serialized',
)
check(
  result.checkpoint.threadId === target &&
  result.checkpoint.checkpointId === 'checkpoint-new' &&
  result.checkpoint.namespace === 'namespace' &&
  result.checkpoint.checkpointMap.child === 'checkpoint-child',
  'checkpoint result is typed and mapped',
)
check(
  !Object.hasOwn(result, 'values') &&
  !Object.hasOwn(result, 'position'),
  'POST result does not pretend to be reconciled persisted state',
)

requests.length = 0
await client.updateThreadState(target, {})
const emptyBody = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>
check(
  Object.keys(emptyBody).length === 0,
  'undefined optional fields are omitted',
)
check(requests.length === 1, 'no implicit GET ThreadState')

requests.length = 0
await client.updateThreadState(target, { values: null })
const nullBody = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>
check(
  Object.hasOwn(nullBody, 'values') && nullBody.values === null,
  'explicit null values are not silently omitted',
)

requests.length = 0
let wrongInput: unknown
try {
  await client.updateThreadState(target, {
    checkpoint: { ...originalCheckpoint, threadId: threadId('another-thread') },
  })
} catch (error) {
  wrongInput = error
}
check(
  wrongInput instanceof TypeError && requests.length === 0,
  'checkpoint from another Thread is rejected pre-HTTP',
)

responseStatus = 400
responseBody = { detail: 'Graph ID is required' }
let httpError: unknown
try {
  await client.updateThreadState(target, {})
} catch (error) {
  httpError = error
}
check(
  httpError instanceof AgentServerHttpError &&
  httpError.status === 400 &&
  httpError.method === 'POST' &&
  httpError.detail === 'Graph ID is required',
  'HTTP 400 is preserved as AgentServerHttpError',
)

responseStatus = 200
responseBody = { checkpoint: { thread_id: target } }
let missingId: unknown
try {
  await client.updateThreadState(target, {})
} catch (error) {
  missingId = error
}
check(
  missingId instanceof AgentServerDecodeError &&
  missingId.path === 'ThreadStateUpdateResponse.checkpoint.checkpoint_id',
  'checkpoint ID is required on HTTP 200',
)

responseBody = { checkpoint: { checkpoint_id: '   ' } }
let blankId: unknown
try {
  await client.updateThreadState(target, {})
} catch (error) {
  blankId = error
}
check(
  blankId instanceof AgentServerDecodeError,
  'whitespace-only checkpoint ID is rejected',
)

responseBody = {
  checkpoint: {
    thread_id: 'another-thread',
    checkpoint_id: 'checkpoint-x',
  },
}
let wrongResponseThread: unknown
try {
  await client.updateThreadState(target, {})
} catch (error) {
  wrongResponseThread = error
}
check(
  wrongResponseThread instanceof AgentServerDecodeError &&
  wrongResponseThread.path === 'ThreadStateUpdateResponse.checkpoint.thread_id',
  'response checkpoint cannot identify another Thread',
)

responseBody = {
  checkpoint: {
    checkpoint_id: 'checkpoint-with-fallback',
  },
}
const fallback = await client.updateThreadState(target, {})
check(
  fallback.checkpoint.threadId === target &&
  fallback.checkpoint.checkpointId === 'checkpoint-with-fallback',
  'omitted response thread ID falls back to request Thread',
)

responseBody = { checkpoint: null }
let malformed: unknown
try {
  await client.updateThreadState(target, {})
} catch (error) {
  malformed = error
}
check(
  malformed instanceof AgentServerDecodeError,
  'non-object checkpoint is rejected',
)

console.log(`\n${passed} state-update client assertions passed`)
