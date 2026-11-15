/**
 * MASL 2.6B — AG-UI 1.0 event-envelope structural grammar, NOT full JSON Schema.
 *
 * Contract pinned at ag-ui-protocol/ag-ui@2330368a2a74573902858867072406638ba3073d
 * spec/1.0/schema.json (blob c2ce3c18036b6bb2afe583a9b916959e7dcd9b78).
 *
 * The 2.6B runner checks this manifest against the pinned official JSON Schema.
 * No Runtime/SSE adapter, network operations, event payload forwarding or side effects.
 * Nested definitions (ContentPart, RFC 6902, outcomes, messages, RunAgentInput)
 * are intentionally NOT fully validated by this envelope check. Do not equate
 * an accepted envelope with complete AG-UI event conformance.
 */

export const AG_UI_EVENT_TYPES = [
  'TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END',
  'TEXT_MESSAGE_CHUNK', 'TOOL_CALL_START', 'TOOL_CALL_ARGS',
  'TOOL_CALL_END', 'TOOL_CALL_CHUNK', 'TOOL_CALL_RESULT',
  'STATE_SNAPSHOT', 'STATE_DELTA', 'MESSAGES_SNAPSHOT',
  'ACTIVITY_SNAPSHOT', 'ACTIVITY_DELTA', 'RAW', 'CUSTOM',
  'RUN_STARTED', 'RUN_FINISHED', 'RUN_ERROR',
  'STEP_STARTED', 'STEP_FINISHED',
  'REASONING_START', 'REASONING_MESSAGE_START',
  'REASONING_MESSAGE_CONTENT', 'REASONING_MESSAGE_END',
  'REASONING_MESSAGE_CHUNK', 'REASONING_END',
  'REASONING_ENCRYPTED_VALUE', 'SUBAGENT_STARTED',
  'SUBAGENT_FINISHED', 'SUBAGENT_ERROR',
] as const

export type AgUiEventType = typeof AG_UI_EVENT_TYPES[number]

/** Primary property shape, NOT recursive JSON Schema compliance. */
export type AgUiFieldType =
  | 'string' | 'integer' | 'array' | 'object' | 'boolean' | 'any-json'
  | 'not-null-json' | 'string-or-array' | 'text-role'
  | 'reasoning-subtype' | 'json-patch' | 'state'
  | 'run-input' | 'run-outcome' | 'subagent-outcome'
  | 'subagent-id'

interface AgUiEventSpec {
  readonly required: readonly string[]
  readonly fields: Readonly<Record<string, AgUiFieldType>>
  readonly attributable: boolean
}

// Source-derived primary fields. The schema gate also verifies exact required
// sets, all properties and BaseEvent/Attributable composition for every type.
export const AG_UI_EVENT_SPECS: Readonly<Record<AgUiEventType, AgUiEventSpec>> = {
  TEXT_MESSAGE_START: { required: ['messageId'], fields: { messageId: 'string', role: 'text-role', name: 'string' }, attributable: true },
  TEXT_MESSAGE_CONTENT: { required: ['messageId', 'delta'], fields: { messageId: 'string', delta: 'string' }, attributable: true },
  TEXT_MESSAGE_END: { required: ['messageId'], fields: { messageId: 'string' }, attributable: true },
  TEXT_MESSAGE_CHUNK: { required: [], fields: { messageId: 'string', role: 'text-role', delta: 'string', name: 'string' }, attributable: true },
  TOOL_CALL_START: { required: ['toolCallId', 'toolCallName'], fields: { toolCallId: 'string', toolCallName: 'string', parentMessageId: 'string' }, attributable: true },
  TOOL_CALL_ARGS: { required: ['toolCallId', 'delta'], fields: { toolCallId: 'string', delta: 'string' }, attributable: true },
  TOOL_CALL_END: { required: ['toolCallId'], fields: { toolCallId: 'string' }, attributable: true },
  TOOL_CALL_CHUNK: { required: [], fields: { toolCallId: 'string', toolCallName: 'string', parentMessageId: 'string', delta: 'string' }, attributable: true },
  TOOL_CALL_RESULT: { required: ['messageId', 'toolCallId', 'content'], fields: { messageId: 'string', toolCallId: 'string', content: 'string-or-array', role: 'string' }, attributable: true },
  STATE_SNAPSHOT: { required: ['snapshot'], fields: { snapshot: 'state' }, attributable: true },
  STATE_DELTA: { required: ['delta'], fields: { delta: 'json-patch' }, attributable: true },
  MESSAGES_SNAPSHOT: { required: ['messages'], fields: { messages: 'array' }, attributable: false },
  ACTIVITY_SNAPSHOT: { required: ['messageId', 'activityType', 'content'], fields: { messageId: 'string', activityType: 'string', content: 'object', replace: 'boolean' }, attributable: true },
  ACTIVITY_DELTA: { required: ['messageId', 'activityType', 'patch'], fields: { messageId: 'string', activityType: 'string', patch: 'json-patch' }, attributable: true },
  RAW: { required: ['event'], fields: { event: 'any-json', source: 'string' }, attributable: true },
  CUSTOM: { required: ['name', 'value'], fields: { name: 'string', value: 'any-json' }, attributable: true },
  RUN_STARTED: { required: ['threadId', 'runId'], fields: { threadId: 'string', runId: 'string', protocolVersion: 'string', parentRunId: 'string', input: 'run-input' }, attributable: false },
  RUN_FINISHED: { required: ['threadId', 'runId'], fields: { threadId: 'string', runId: 'string', result: 'not-null-json', outcome: 'run-outcome', usage: 'array' }, attributable: false },
  RUN_ERROR: { required: ['message'], fields: { message: 'string', code: 'string', usage: 'array' }, attributable: false },
  STEP_STARTED: { required: ['stepName'], fields: { stepName: 'string' }, attributable: true },
  STEP_FINISHED: { required: ['stepName'], fields: { stepName: 'string' }, attributable: true },
  REASONING_START: { required: ['messageId'], fields: { messageId: 'string' }, attributable: true },
  REASONING_MESSAGE_START: { required: ['messageId', 'role'], fields: { messageId: 'string', role: 'string' }, attributable: true },
  REASONING_MESSAGE_CONTENT: { required: ['messageId', 'delta'], fields: { messageId: 'string', delta: 'string' }, attributable: true },
  REASONING_MESSAGE_END: { required: ['messageId'], fields: { messageId: 'string' }, attributable: true },
  REASONING_MESSAGE_CHUNK: { required: [], fields: { messageId: 'string', delta: 'string' }, attributable: true },
  REASONING_END: { required: ['messageId'], fields: { messageId: 'string' }, attributable: true },
  REASONING_ENCRYPTED_VALUE: { required: ['subtype', 'entityId', 'encryptedValue'], fields: { subtype: 'reasoning-subtype', entityId: 'string', encryptedValue: 'string' }, attributable: true },
  SUBAGENT_STARTED: { required: ['subagentRunId', 'name'], fields: { subagentRunId: 'subagent-id', name: 'string', description: 'string', parentSubagentRunId: 'subagent-id', parentToolCallId: 'string', parentMessageId: 'string' }, attributable: false },
  SUBAGENT_FINISHED: { required: ['subagentRunId'], fields: { subagentRunId: 'subagent-id', result: 'not-null-json', outcome: 'subagent-outcome' }, attributable: false },
  SUBAGENT_ERROR: { required: ['subagentRunId', 'message'], fields: { subagentRunId: 'subagent-id', message: 'string', code: 'string' }, attributable: false },
}

const BASE_FIELDS: Readonly<Record<string, AgUiFieldType>> = {
  type: 'string', timestamp: 'integer', rawEvent: 'not-null-json', metadata: 'object',
}
const ATTRIBUTION_FIELDS: Readonly<Record<string, AgUiFieldType>> = {
  subagentRunId: 'subagent-id',
}
const KNOWN_TYPES: ReadonlySet<string> = new Set(AG_UI_EVENT_TYPES)
const TEXT_ROLES: ReadonlySet<string> = new Set(['developer', 'system', 'assistant', 'user'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isFiniteJson = (value: unknown, depth = 0): boolean => {
  if (depth > 24) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length <= 10_000 && value.every(v => isFiniteJson(v, depth + 1))
  if (isRecord(value)) {
    const entries = Object.entries(value)
    return entries.length <= 10_000 && entries.every(([, v]) => isFiniteJson(v, depth + 1))
  }
  return false
}

const validField = (kind: AgUiFieldType, value: unknown): boolean => {
  switch (kind) {
    case 'integer': return typeof value === 'number' && Number.isSafeInteger(value)
    case 'boolean': return typeof value === 'boolean'
    case 'string':
    case 'subagent-id': return typeof value === 'string'
    case 'text-role': return typeof value === 'string' && TEXT_ROLES.has(value)
    case 'reasoning-subtype': return value === 'tool-call' || value === 'message'
    case 'array':
    case 'json-patch': return Array.isArray(value) && isFiniteJson(value)
    case 'object':
    case 'run-input':
    case 'run-outcome':
    case 'subagent-outcome': return isRecord(value) && isFiniteJson(value)
    case 'string-or-array': return typeof value === 'string' || (Array.isArray(value) && isFiniteJson(value))
    case 'not-null-json': return value !== null && isFiniteJson(value)
    case 'state':
    case 'any-json': return isFiniteJson(value)
  }
}

export type AgUiEnvelopeCheck =
  | Readonly<{ valid: true; type: AgUiEventType; identifiers: Readonly<Record<string, string>> }>
  | Readonly<{ valid: false; reason: 'not-object' | 'unknown-type' | 'missing-required' |
      'unexpected-property' | 'invalid-field' | 'invalid-constant'; field: string | null }>

/**
 * Pure, bounded, content-free envelope check. Identifiers only; never raw data.
 * Schema coverage is checked by the standalone review gate, NOT this function.
 */
export const checkAgUiEnvelope = (input: unknown): AgUiEnvelopeCheck => {
  if (!isRecord(input)) return { valid: false, reason: 'not-object', field: null }
  const type = input.type
  if (typeof type !== 'string' || !KNOWN_TYPES.has(type)) {
    return { valid: false, reason: 'unknown-type', field: 'type' }
  }
  const eventType = type as AgUiEventType
  const spec = AG_UI_EVENT_SPECS[eventType]
  if (!spec.required.every(k => Object.hasOwn(input, k))) {
    return { valid: false, reason: 'missing-required', field: spec.required.find(k => !Object.hasOwn(input, k)) ?? null }
  }
  const fields: Readonly<Record<string, AgUiFieldType>> = spec.attributable
    ? { ...BASE_FIELDS, ...ATTRIBUTION_FIELDS, ...spec.fields }
    : { ...BASE_FIELDS, ...spec.fields }
  const identities: Record<string, string> = {}
  for (const [key, value] of Object.entries(input)) {
    const kind = fields[key]
    if (kind === undefined) return { valid: false, reason: 'unexpected-property', field: key }
    if (!validField(kind, value)) return { valid: false, reason: 'invalid-field', field: key }
    if ((eventType === 'TOOL_CALL_RESULT' && key === 'role' && value !== 'tool') ||
        (eventType === 'REASONING_MESSAGE_START' && key === 'role' && value !== 'reasoning')) {
      return { valid: false, reason: 'invalid-constant', field: key }
    }
    // Only these stable identity fields can leave this module. No content,
    // deltas, arguments, rawEvent, metadata, results, encrypted values or names.
    if (['threadId', 'runId', 'messageId', 'toolCallId', 'subagentRunId'].includes(key) &&
        typeof value === 'string') {
      identities[key] = value.slice(0, 120)
    }
  }
  return { valid: true, type: eventType, identifiers: identities }
}

export type AgUiTraceDiagnostic = Readonly<{ index: number; code: string }>

/**
 * Local single-run *review policy*, not an AG-UI normative state machine.
 * No inference of graph END, authorization, exactly-once or real tool effects.
 * A completed call's argument lifecycle is not proof a tool ran.
 */
export const reviewAgUiTrace = (events: readonly unknown[]): readonly AgUiTraceDiagnostic[] => {
  const diagnostics: AgUiTraceDiagnostic[] = []
  const tools = new Map<string, 'started' | 'ended'>()
  let openedRun: string | null = null
  let terminal = false
  const max = Math.min(events.length, 1000)
  for (let index = 0; index < max; index += 1) {
    const event = events[index]
    const checked = checkAgUiEnvelope(event)
    if (!checked.valid) {
      diagnostics.push({ index, code: `invalid-envelope:${checked.reason}` })
      continue
    }
    const type = checked.type
    const ids = checked.identifiers
    if (terminal) diagnostics.push({ index, code: 'event-after-terminal' })
    if (type === 'RUN_STARTED') {
      if (openedRun !== null) diagnostics.push({ index, code: 'duplicate-run-start' })
      openedRun = ids.runId ?? ''
    }
    if (type === 'RUN_FINISHED' || type === 'RUN_ERROR') {
      if (openedRun === null) diagnostics.push({ index, code: 'terminal-without-start' })
      if (type === 'RUN_FINISHED' && ids.runId !== openedRun) {
        diagnostics.push({ index, code: 'run-id-conflict' })
      }
      terminal = true
    }
    if (type === 'TOOL_CALL_START') {
      const id = ids.toolCallId ?? ''
      if (tools.has(id)) diagnostics.push({ index, code: 'duplicate-tool-call-id' })
      else tools.set(id, 'started')
    }
    if (type === 'TOOL_CALL_ARGS' || type === 'TOOL_CALL_END' || type === 'TOOL_CALL_RESULT') {
      const id = ids.toolCallId ?? ''
      const state = tools.get(id)
      if (!state) diagnostics.push({ index, code: 'tool-call-not-observed' })
      else if (type === 'TOOL_CALL_END') {
        if (state === 'ended') diagnostics.push({ index, code: 'duplicate-tool-call-end' })
        else tools.set(id, 'ended')
      }
    }
  }
  if (events.length > max) diagnostics.push({ index: max, code: 'trace-limit-exceeded' })
  if (openedRun !== null && !terminal) diagnostics.push({ index: max, code: 'no-terminal-observed' })
  return diagnostics
}
