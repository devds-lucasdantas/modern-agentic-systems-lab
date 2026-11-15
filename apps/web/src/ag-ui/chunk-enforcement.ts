/**
 * MASL 2.6D — isolated AG-UI 1.0 consumer boundary, no Agent Server adapter.
 * Frozen source: ag-ui-protocol/ag-ui@2330368a2a74573902858867072406638ba3073d
 * Normative prose: spec/1.0/basic/processing and patterns/streaming,
 * events/{text-messages,tool-calls,reasoning,subagents}.
 *
 * Scope: top-level unknown additions vs known malformed fields, three CHUNK
 * spellings, lane/identity conflicts and safe synthetic triads. NOT full
 * recursive JSON Schema, general middleware/compatibility machinery, state
 * application, an AG-UI SDK, a UI integration or external tool execution.
 * This module is deliberately not imported into the production frontend.
 */
import {
  AG_UI_EVENT_SPECS, AG_UI_EVENT_TYPES, checkAgUiEnvelope,
  type AgUiEventType, type AgUiFieldType,
} from './event-grammar'
import { reviewAgUiSseFrames, type StreamReview } from './stream-boundary'

type EventObject = Record<string, unknown>
type ChunkKind = 'text' | 'tool' | 'reasoning'
type ChunkType = 'TEXT_MESSAGE_CHUNK' | 'TOOL_CALL_CHUNK' | 'REASONING_MESSAGE_CHUNK'
type Owner = string | null // null denotes parent; empty subagent IDs remain distinct.
type ChunkState = {
  readonly kind: ChunkKind
  readonly id: string
  readonly owner: Owner
  readonly opener: Readonly<Record<string, string | undefined>>
}
const CHUNKS: Readonly<Record<ChunkType, ChunkKind>> = {
  TEXT_MESSAGE_CHUNK: 'text', TOOL_CALL_CHUNK: 'tool', REASONING_MESSAGE_CHUNK: 'reasoning',
}
const TYPE_SET: ReadonlySet<string> = new Set(AG_UI_EVENT_TYPES)
const TEXT_ROLES: ReadonlySet<string> = new Set(['developer', 'system', 'assistant', 'user'])
const BASE: Readonly<Record<string, AgUiFieldType>> = {
  type: 'string', timestamp: 'integer', rawEvent: 'not-null-json', metadata: 'object',
}
const PARENT: Owner = null
const laneKey = (owner: Owner, kind: ChunkKind): string =>
  owner === null ? `parent:${kind}` : `subagent:${owner.length}:${owner}:${kind}`
const isObject = (value: unknown): value is EventObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const ownString = (e: EventObject, key: string): string | undefined =>
  typeof e[key] === 'string' ? e[key] : undefined
const identifierOf = (kind: ChunkKind, e: EventObject): string | undefined =>
  ownString(e, kind === 'tool' ? 'toolCallId' : 'messageId')

export type EnforcementDecision =
  | Readonly<{ kind: 'accepted'; event: EventObject; stripped: readonly string[] }>
  | Readonly<{ kind: 'dropped'; code: 'unknown-event' | 'unknown-required-union' }>
  | Readonly<{ kind: 'fatal'; code: 'invalid-json-object' | 'missing-type' | 'known-field-invalid' }>

/**
 * Only the top-level closed event envelope is enforced. Unknown event types
 * are dropped; unrecognised top-level properties are stripped BEFORE the
 * canonical expansion. A known malformed property is fatal and is never
 * repaired. Closed enums unknown to this consumer are treated as newer union
 * additions only if they are strings; unknown optional values are stripped,
 * unknown required values drop the containing event. Nonstrings are fatal.
 * This is NOT a recursive schema-enforcement implementation.
 */
export const enforceAgUiEventEnvelope = (input: unknown): EnforcementDecision => {
  if (!isObject(input)) return { kind: 'fatal', code: 'invalid-json-object' }
  if (typeof input.type !== 'string') return { kind: 'fatal', code: 'missing-type' }
  if (!TYPE_SET.has(input.type)) return { kind: 'dropped', code: 'unknown-event' }
  const type = input.type as AgUiEventType
  const spec = AG_UI_EVENT_SPECS[type]
  const known = new Set([
    ...Object.keys(BASE), ...Object.keys(spec.fields),
    ...(spec.attributable ? ['subagentRunId'] : []),
  ])
  const event: EventObject = {}
  const stripped: string[] = []
  for (const [key, value] of Object.entries(input)) {
    if (known.has(key)) event[key] = value
    else stripped.push(key)
  }
  // Unknown named members of open protocol extensions are not malformed
  // known *types*. Distinguish them from a known field holding the wrong kind.
  const enumKey = type === 'TEXT_MESSAGE_START' || type === 'TEXT_MESSAGE_CHUNK'
    ? 'role'
    : type === 'REASONING_MESSAGE_START' ? 'role'
      : type === 'REASONING_ENCRYPTED_VALUE' ? 'subtype' : null
  if (enumKey !== null && Object.hasOwn(event, enumKey)) {
    const value = event[enumKey]
    const recognised = enumKey === 'role'
      ? type === 'REASONING_MESSAGE_START' ? value === 'reasoning'
        : typeof value === 'string' && TEXT_ROLES.has(value)
      : value === 'tool-call' || value === 'message'
    if (!recognised) {
      if (typeof value !== 'string') return { kind: 'fatal', code: 'known-field-invalid' }
      if (spec.required.includes(enumKey)) return { kind: 'dropped', code: 'unknown-required-union' }
      delete event[enumKey]
      stripped.push(enumKey)
    }
  }
  if (!checkAgUiEnvelope(event).valid) return { kind: 'fatal', code: 'known-field-invalid' }
  return { kind: 'accepted', event, stripped }
}

export type ConsumerIssue = Readonly<{ index: number; code: string }>
export type ConsumerResult =
  | Readonly<{ status: 'fatal'; issues: readonly ConsumerIssue[]; emittedCount: 0 }>
  | Readonly<{
      status: 'accepted'
      events: readonly EventObject[]
      issues: readonly ConsumerIssue[]
      strippedCount: number
      droppedCount: number
      /** 2.6C explicit-triad review on the canonicalized event stream. */
      lifecycle: StreamReview
      coverage: 'top-level-and-chunks-only'
    }>

/**
 * Pure, bounded, fail-closed transformation of parsed event objects.
 * Canonical order inside this isolated function: top-level enforcement,
 * then expansion, then 2.6C explicit lifecycle review. No app sink exists.
 * ConsumerResult omits partial payloads completely upon fatal failure.
 */
export const enforceAndExpandAgUiStream = (
  inputs: readonly unknown[], connectionEnded = true,
): ConsumerResult => {
  const issues: ConsumerIssue[] = []
  const emitted: EventObject[] = []
  const streams = new Map<string, ChunkState>()
  const seen = new Map<string, Readonly<{ owner: Owner; opener: Readonly<Record<string, string | undefined>> }>>()
  let strippedCount = 0
  let droppedCount = 0
  const note = (index: number, code: string): void => { issues.push({ index, code }) }
  const fatal = (index: number, code: string): ConsumerResult => {
    note(index, code)
    return { status: 'fatal', issues, emittedCount: 0 }
  }
  if (inputs.length > 1_000) return fatal(1_000, 'local-event-limit')

  const endFor = (s: ChunkState): EventObject => ({
    type: s.kind === 'text' ? 'TEXT_MESSAGE_END' :
      s.kind === 'tool' ? 'TOOL_CALL_END' : 'REASONING_MESSAGE_END',
    [s.kind === 'tool' ? 'toolCallId' : 'messageId']: s.id,
    ...(s.owner !== null ? { subagentRunId: s.owner } : {}),
  })
  const closeWhere = (predicate: (state: ChunkState) => boolean): void => {
    for (const [key, stream] of [...streams]) {
      if (predicate(stream)) { emitted.push(endFor(stream)); streams.delete(key) }
    }
  }
  const chunkKind = (type: string): ChunkKind | null =>
    Object.hasOwn(CHUNKS, type) ? CHUNKS[type as ChunkType] : null
  const ownerFor = (event: EventObject, kind: ChunkKind): Owner | undefined => {
    if (typeof event.subagentRunId === 'string') return event.subagentRunId
    const id = identifierOf(kind, event)
    if (id !== undefined) {
      const matches = [...streams.values()].filter(s => s.kind === kind && s.id === id)
      if (matches.length > 1) return undefined
      return matches.length === 1 ? matches[0]!.owner : PARENT
    }
    // Identifier-free continuation prefers the parent lane, then an
    // unambiguous single subagent lane; never invent an owner.
    if (streams.has(laneKey(PARENT, kind))) return PARENT
    const open = [...streams.values()].filter(s => s.kind === kind)
    return open.length === 1 ? open[0]!.owner : undefined
  }
  const header = (event: EventObject, owner: Owner): EventObject => ({
    ...(owner !== null ? { subagentRunId: owner } : {}),
    ...(Object.hasOwn(event, 'metadata') ? { metadata: event.metadata } : {}),
    ...(Object.hasOwn(event, 'rawEvent') ? { rawEvent: event.rawEvent } : {}),
  })

  for (let index = 0; index < inputs.length; index += 1) {
    const decision = enforceAgUiEventEnvelope(inputs[index])
    if (decision.kind === 'fatal') return fatal(index, decision.code)
    if (decision.kind === 'dropped') {
      droppedCount += 1
      note(index, decision.code)
      continue
    }
    strippedCount += decision.stripped.length
    for (const field of decision.stripped) note(index, `stripped:${field}`)
    const e = decision.event
    const type = e.type as AgUiEventType
    const kind = chunkKind(type)
    if (kind !== null) {
      const owner = ownerFor(e, kind)
      if (owner === undefined) return fatal(index, 'chunk-ambiguous-or-unopened')
      const id = identifierOf(kind, e)
      // A tag that contradicts an already open entity must fail, not reroute.
      if (id !== undefined && [...streams.values()].some(s =>
        s.kind === kind && s.id === id && s.owner !== owner)) {
        return fatal(index, 'chunk-owner-conflict')
      }
      const streamKey = laneKey(owner, kind)
      let active = streams.get(streamKey)
      if (active && id !== undefined && id !== active.id) {
        closeWhere(s => s.owner === owner)
        active = undefined
      }
      // Chunk of a new kind in a lane closes other shorthand items there.
      if (!active) closeWhere(s => s.owner === owner)
      if (!active) {
        if (id === undefined) return fatal(index, 'chunk-first-identifier-missing')
        if (kind === 'tool' && typeof e.toolCallName !== 'string') {
          return fatal(index, 'chunk-first-tool-name-missing')
        }
        const opener: Record<string, string | undefined> = kind === 'text'
          ? { role: ownString(e, 'role') ?? 'assistant', name: ownString(e, 'name') }
          : kind === 'tool'
            ? { toolCallName: ownString(e, 'toolCallName'), parentMessageId: ownString(e, 'parentMessageId') }
            : {}
        const identity = `${kind}:${id.length}:${id}`
        const previous = seen.get(identity)
        if (previous && (previous.owner !== owner ||
          Object.keys(opener).some(k => opener[k] !== previous.opener[k]))) {
          return fatal(index, 'chunk-reopen-field-conflict')
        }
        seen.set(identity, { owner, opener })
        const state: ChunkState = { kind, id, owner, opener }
        streams.set(streamKey, state)
        const startType = kind === 'text' ? 'TEXT_MESSAGE_START' :
          kind === 'tool' ? 'TOOL_CALL_START' : 'REASONING_MESSAGE_START'
        const start: EventObject = { type: startType, ...header(e, owner),
          [kind === 'tool' ? 'toolCallId' : 'messageId']: id }
        if (kind === 'text') {
          start.role = opener.role
          if (opener.name !== undefined) start.name = opener.name
        }
        if (kind === 'tool') {
          start.toolCallName = opener.toolCallName
          if (opener.parentMessageId !== undefined) start.parentMessageId = opener.parentMessageId
        }
        if (kind === 'reasoning') start.role = 'reasoning'
        emitted.push(start)
        active = state
      } else {
        const values: Readonly<Record<string, string | undefined>> = active.opener
        if (kind === 'text' && ((Object.hasOwn(e, 'role') && e.role !== values.role) ||
          (Object.hasOwn(e, 'name') && e.name !== values.name))) {
          return fatal(index, 'chunk-opener-conflict')
        }
        if (kind === 'tool' && ((Object.hasOwn(e, 'toolCallName') && e.toolCallName !== values.toolCallName) ||
          (Object.hasOwn(e, 'parentMessageId') && e.parentMessageId !== values.parentMessageId))) {
          return fatal(index, 'chunk-opener-conflict')
        }
      }
      // Every chunk can carry metadata (including a metadata-only fragment).
      // An empty content event carries that metadata to the downstream reducer.
      if (typeof e.delta === 'string' || Object.hasOwn(e, 'metadata') || Object.hasOwn(e, 'rawEvent')) {
        emitted.push({
          type: kind === 'text' ? 'TEXT_MESSAGE_CONTENT' :
            kind === 'tool' ? 'TOOL_CALL_ARGS' : 'REASONING_MESSAGE_CONTENT',
          ...header(e, owner),
          [kind === 'tool' ? 'toolCallId' : 'messageId']: active.id,
          delta: typeof e.delta === 'string' ? e.delta : '',
        })
      }
      continue
    }
    if (['RUN_STARTED', 'RUN_FINISHED', 'RUN_ERROR', 'MESSAGES_SNAPSHOT'].includes(type)) {
      closeWhere(() => true)
      // A new run can reopen material from a previous run; previous-run
      // owner conflicts are the producer's obligation, not this local gate.
      if (type === 'RUN_STARTED') seen.clear()
    } else if (type === 'SUBAGENT_FINISHED' || type === 'SUBAGENT_ERROR') {
      closeWhere(s => s.owner === e.subagentRunId)
    } else if (!['RAW', 'ACTIVITY_SNAPSHOT', 'ACTIVITY_DELTA',
      'REASONING_ENCRYPTED_VALUE', 'SUBAGENT_STARTED'].includes(type)) {
      const owner: Owner = typeof e.subagentRunId === 'string' ? e.subagentRunId : PARENT
      closeWhere(s => s.owner === owner)
    }
    emitted.push(e)
    if (emitted.length > 3_500) return fatal(index, 'local-output-limit')
  }
  // No terminal event means truncation, NOT a clean synthetic END. Keep
  // stream semantics unaltered and let 2.6C report the open run as truncated.
  const lifecycle = reviewAgUiSseFrames(
    emitted.map(data => ({ data: JSON.stringify(data), event: null, id: null, retry: null })),
    connectionEnded,
  )
  // 2.6C's *verified explicit* lifecycle violations are fatal to this
  // isolated consumer boundary. Its review-only/unsupported diagnostics
  // (notably subagent coverage) must never be misreported as conformance.
  const fatalLifecycleCodes = new Set([
    'nested-run-start', 'event-before-run', 'event-after-terminal',
    'event-after-run-error', 'run-identity-conflict',
    'open-items-at-run-finish', 'message-already-open',
    'message-content-without-open', 'message-end-without-open',
    'tool-already-open', 'tool-args-without-open',
    'tool-end-without-open', 'reasoning-already-open',
    'reasoning-content-without-open', 'reasoning-end-without-open',
    'step-already-open', 'step-end-without-open',
  ])
  const violation = lifecycle.issues.find(issue => fatalLifecycleCodes.has(issue.code))
  if (violation) return fatal(violation.index, `lifecycle:${violation.code}`)
  return { status: 'accepted', events: emitted, issues, strippedCount,
    droppedCount, lifecycle, coverage: 'top-level-and-chunks-only' }
}
