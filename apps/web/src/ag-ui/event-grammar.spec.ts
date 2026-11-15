/** Model-free, dependency-free 2.6B structural grammar and review-policy tests. */
import { AG_UI_EVENT_TYPES, AG_UI_EVENT_SPECS, checkAgUiEnvelope, reviewAgUiTrace,
  type AgUiEventType, type AgUiFieldType } from './event-grammar'

let passed = 0
const check = (ok: boolean, label: string): void => {
  if (!ok) throw Error(`FAIL: ${label}`)
  passed += 1
  console.log(`PASS: ${label}`)
}

const valueFor = (kind: AgUiFieldType): unknown => {
  switch (kind) {
    case 'string': case 'subagent-id': return 'valid-id'
    case 'integer': return 42
    case 'boolean': return false
    case 'array': case 'json-patch': return []
    case 'object': case 'run-input': case 'run-outcome': case 'subagent-outcome': return {}
    case 'text-role': return 'assistant'
    case 'reasoning-subtype': return 'message'
    case 'string-or-array': return 'redacted-tool-data'
    case 'not-null-json': return 'value'
    case 'state': case 'any-json': return null
  }
}

const make = (type: AgUiEventType): Record<string, unknown> => {
  const spec = AG_UI_EVENT_SPECS[type]
  const event: Record<string, unknown> = { type }
  for (const key of spec.required) event[key] = valueFor(spec.fields[key]!)
  if (type === 'REASONING_MESSAGE_START') event.role = 'reasoning'
  return event
}

check(AG_UI_EVENT_TYPES.length === 31, 'all 31 event discriminators represented')
check(new Set(AG_UI_EVENT_TYPES).size === 31, 'no duplicate event type')
check(Object.keys(AG_UI_EVENT_SPECS).length === 31, 'all 31 event specs are present')

for (const type of AG_UI_EVENT_TYPES) {
  const event = make(type)
  const accepted = checkAgUiEnvelope(event)
  check(accepted.valid && accepted.type === type, `${type}: baseline envelope accepted`)
  const spec = AG_UI_EVENT_SPECS[type]
  if (spec.required.length) {
    const missing = { ...event }
    delete missing[spec.required[0]!]
    const rejected = checkAgUiEnvelope(missing)
    check(!rejected.valid && rejected.reason === 'missing-required', `${type}: missing first required field rejected`)
  }
  const extras = checkAgUiEnvelope({ ...event, invented_26b_field: true })
  check(!extras.valid && extras.reason === 'unexpected-property', `${type}: unexpected event property rejected`)
  check(checkAgUiEnvelope({ ...event, timestamp: 1700000000000 }).valid, `${type}: optional timestamp allowed`)
  if (spec.attributable) {
    check(checkAgUiEnvelope({ ...event, subagentRunId: 'sa-26b' }).valid, `${type}: attribution allowed`)
  } else if (!Object.hasOwn(spec.fields, 'subagentRunId')) {
    check(!checkAgUiEnvelope({ ...event, subagentRunId: 'sa-26b' }).valid,
      `${type}: unscoped attribution not fabricated`)
  }
}

check(!checkAgUiEnvelope(null).valid, 'null is not an event')
check(!checkAgUiEnvelope([]).valid, 'array is not an event')
check(!checkAgUiEnvelope({ type: 'messages/complete' }).valid, 'Agent Server SSE name not AG-UI type')
check(!checkAgUiEnvelope({ type: 'tools/tool-started' }).valid, 'unobserved tool event not AG-UI type')
check(!checkAgUiEnvelope({ type: 'RUN_STARTED', threadId: 8, runId: 'r' }).valid, 'run id property type checked')
check(!checkAgUiEnvelope({ type: 'RUN_STARTED', threadId: 't', runId: 'r', timestamp: 3.14 }).valid,
  'timestamp must be an integer')
check(!checkAgUiEnvelope({ type: 'RUN_STARTED', threadId: 't', runId: 'r', timestamp: Infinity }).valid,
  'timestamp must be bounded finite')
check(!checkAgUiEnvelope({ type: 'ACTIVITY_SNAPSHOT', messageId:'m', activityType:'t', content:{}, replace:'yes' }).valid,
  'optional replace validates boolean')
check(!checkAgUiEnvelope({ type: 'TOOL_CALL_RESULT', toolCallId: 't', messageId: 'm', content: 'secret', role: 'assistant' }).valid,
  'tool result role constant checked')
check(!checkAgUiEnvelope({ type:'REASONING_MESSAGE_START', messageId:'m', role:'assistant' }).valid,
  'reasoning role constant checked')
check(!checkAgUiEnvelope({ type:'TEXT_MESSAGE_START', messageId:'m', role:'tool' }).valid,
  'tool not a streamed text role')
check(!checkAgUiEnvelope({ type:'REASONING_ENCRYPTED_VALUE', subtype:'bad', entityId:'e', encryptedValue:'s' }).valid,
  'reasoning subtype enum checked')
check(checkAgUiEnvelope({ type:'STATE_SNAPSHOT', snapshot: null }).valid,
  'state may be JSON null')
check(!checkAgUiEnvelope({ type:'STATE_DELTA', delta: {} }).valid,
  'JSON Patch envelope must carry array')
check(!checkAgUiEnvelope({ type:'RUN_FINISHED', threadId:'t', runId:'r', result:null }).valid,
  'present run result may not be null')
check(checkAgUiEnvelope({ type:'SUBAGENT_FINISHED', subagentRunId:'sa' }).valid,
  'subagent result may be absent')
check(checkAgUiEnvelope({ type:'SUBAGENT_FINISHED', subagentRunId:'sa', result: { ok: true } }).valid,
  'present subagent result accepts non-null JSON')
check(!checkAgUiEnvelope({ type:'SUBAGENT_FINISHED', subagentRunId:'sa', result: null }).valid,
  'present subagent result rejects null')
check(!checkAgUiEnvelope({ type:'RAW', event: ()=> 'not-json' }).valid,
  'provider rawEvent type cannot be function')
const result = checkAgUiEnvelope({ type:'TOOL_CALL_RESULT', toolCallId:'call1', messageId:'msg1',
  content:'SECRET_RESULT_26B', metadata:{ private_token:'SECRET_META_26B' } })
check(result.valid && result.identifiers.toolCallId === 'call1', 'only stable tool identity projected')
check(!JSON.stringify(result).includes('SECRET_'), 'envelope summary contains no result or metadata')
const chunk = checkAgUiEnvelope({ type:'TEXT_MESSAGE_CHUNK' })
check(chunk.valid, 'chunk fields remain optional exactly as schema')
check(checkAgUiEnvelope({ type:'TOOL_CALL_CHUNK' }).valid, 'tool chunk fields remain optional')

const sequence = [
  { type: 'RUN_STARTED', threadId: 'thread-1', runId: 'run-1' },
  { type: 'TOOL_CALL_START', toolCallId: 'tool-1', toolCallName: 'lookup' },
  { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-1', delta: '{"code":"ALPHA"}' },
  { type: 'TOOL_CALL_END', toolCallId: 'tool-1' },
  { type: 'TOOL_CALL_RESULT', toolCallId: 'tool-1', messageId: 'msg-1', content: 'SECRET' },
  { type: 'RUN_FINISHED', threadId: 'thread-1', runId: 'run-1' },
]
check(reviewAgUiTrace(sequence).length === 0, 'single-run example has no local ordering diagnostics')
check(reviewAgUiTrace([{ type:'RUN_FINISHED', threadId:'t', runId:'r' }])
  .some(d => d.code === 'terminal-without-start'), 'terminal without opened run flagged')
check(reviewAgUiTrace([{ type:'RUN_STARTED', threadId:'t', runId:'r' },
  { type:'RUN_FINISHED', threadId:'t', runId:'other' }])
  .some(d => d.code === 'run-id-conflict'), 'run identity mismatch flagged')
check(reviewAgUiTrace([{ type:'TOOL_CALL_END', toolCallId:'unseen' }])
  .some(d => d.code === 'tool-call-not-observed'), 'unseen tool call flagged without inventing start')
check(reviewAgUiTrace([{ type:'RUN_STARTED', threadId:'t', runId:'r' },
  { type:'RUN_FINISHED', threadId:'t', runId:'r' },
  { type:'TOOL_CALL_START', toolCallId:'c', toolCallName:'t' }])
  .some(d => d.code === 'event-after-terminal'), 'post-terminal event flagged')
check(reviewAgUiTrace([{ type:'RUN_STARTED', threadId:'t', runId:'r' },
  { type:'TOOL_CALL_START', toolCallId:'c', toolCallName:'t' },
  { type:'TOOL_CALL_START', toolCallId:'c', toolCallName:'t' }])
  .some(d => d.code === 'duplicate-tool-call-id'), 'duplicate tool identity flagged')
check(reviewAgUiTrace([{ type:'RUN_STARTED', threadId:'t', runId:'r' }])
  .some(d => d.code === 'no-terminal-observed'), 'open run reported as incomplete observation')
check(reviewAgUiTrace([{ type:'RUN_STARTED', threadId:'t', runId:'r' },
  { type:'TOOL_CALL_RESULT', toolCallId:'never', messageId:'m', content:'x' },
  { type:'RUN_FINISHED', threadId:'t', runId:'r' }])
  .some(d => d.code === 'tool-call-not-observed'), 'result does not create missing call')
check(reviewAgUiTrace(Array.from({length:1001},()=>({type:'CUSTOM', name:'test',value:null})))
  .some(d => d.code === 'trace-limit-exceeded'), 'trace review cap enforced')

console.log(`\n${passed} 2.6B structural grammar and local trace diagnostics passed`)
