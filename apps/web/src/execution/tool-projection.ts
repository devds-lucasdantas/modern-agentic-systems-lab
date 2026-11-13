import type { CheckpointId, ThreadId, ThreadState } from '../domain'

export const MAX_VISIBLE_TOOL_CALLS = 20
export const MAX_SCANNED_MESSAGES = 1000

export type PersistedToolCallStatus =
  | 'result-observed'
  | 'error-observed'
  | 'no-result-observed'
  | 'duplicate-call-id'
  | 'multiple-results'

export interface PersistedToolCallSummary {
  readonly callId: string
  readonly name: string
  readonly status: PersistedToolCallStatus
  readonly matchingResultCount: number
}

export interface PersistedToolsProjection {
  readonly authority: 'persisted'
  readonly threadId: ThreadId
  readonly checkpointId: CheckpointId | null
  readonly graphAtEnd: boolean
  readonly situation: 'unavailable' | 'no-tool-calls' | 'observed' | 'incomplete'
  readonly callCount: number
  readonly resultCount: number
  readonly opaqueCount: number
  readonly orphanResultCount: number
  readonly hiddenCallCount: number
  readonly calls: readonly PersistedToolCallSummary[]
}

type JsonRecord = Record<string, unknown>
const record = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Only bounded, display-safe correlation tokens cross this projection boundary.
const callId = (value: unknown): string | null =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)
    ? value : null
const toolName = (value: unknown): string | null =>
  typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/.test(value)
    ? value : null

const role = (message: JsonRecord): 'assistant' | 'tool' | 'other' => {
  const raw = typeof message.type === 'string'
    ? message.type : typeof message.role === 'string' ? message.role : ''
  switch (raw.toLowerCase()) {
    case 'ai': case 'assistant': case 'aimessage': return 'assistant'
    case 'tool': case 'toolmessage': return 'tool'
    default: return 'other'
  }
}

interface ObservedCall { readonly id: string; readonly name: string }
interface ObservedResult { readonly id: string; readonly error: boolean }

/**
 * Read-only projection of persisted ThreadState.values.messages.
 * It never forwards arguments, tool return content, or arbitrary metadata.
 * A matching ToolMessage is an observation, not independent proof of a tool's
 * authorization, successful side effects, exactly-once execution or live status.
 */
export const projectPersistedTools = (state: ThreadState): PersistedToolsProjection => {
  const rawMessages = record(state.values) ? state.values.messages : null
  const available = state.checkpoint !== null &&
    Array.isArray(rawMessages) &&
    rawMessages.length <= MAX_SCANNED_MESSAGES
  const graphAtEnd = state.checkpoint !== null &&
    state.position.next.length === 0 && state.interrupts.length === 0
  const initial = {
    authority: 'persisted' as const,
    threadId: state.threadId,
    checkpointId: state.checkpoint?.checkpointId ?? null,
    graphAtEnd,
  }
  if (!available) {
    return { ...initial, situation: 'unavailable', callCount: 0,
      resultCount: 0, opaqueCount: 0, orphanResultCount: 0,
      hiddenCallCount: 0, calls: [] }
  }

  const messages: readonly unknown[] = rawMessages as readonly unknown[]
  const calls: ObservedCall[] = []
  const results: ObservedResult[] = []
  let opaqueCount = 0
  for (const value of messages) {
    if (!record(value)) { opaqueCount += 1; continue }
    const kind = role(value)
    if (kind === 'assistant' && Object.hasOwn(value, 'tool_calls')) {
      if (!Array.isArray(value.tool_calls)) { opaqueCount += 1; continue }
      for (const raw of value.tool_calls) {
        if (!record(raw)) { opaqueCount += 1; continue }
        const id = callId(raw.id)
        const name = toolName(raw.name)
        if (id === null || name === null ||
            (raw.type !== undefined && raw.type !== 'tool_call') ||
            !record(raw.args)) {
          opaqueCount += 1
          continue
        }
        calls.push({ id, name })
      }
    } else if (kind === 'tool') {
      const id = callId(value.tool_call_id)
      if (id === null) { opaqueCount += 1; continue }
      results.push({ id, error: value.status === 'error' })
    } else if (Object.hasOwn(value, 'tool_calls') ||
               Object.hasOwn(value, 'tool_call_id')) {
      opaqueCount += 1
    }
  }

  const callMultiplicity = new Map<string, number>()
  const resultMultiplicity = new Map<string, ObservedResult[]>()
  for (const call of calls) {
    callMultiplicity.set(call.id, (callMultiplicity.get(call.id) ?? 0) + 1)
  }
  for (const result of results) {
    const prior = resultMultiplicity.get(result.id) ?? []
    prior.push(result)
    resultMultiplicity.set(result.id, prior)
  }

  const summaries: PersistedToolCallSummary[] = calls
    .slice(0, MAX_VISIBLE_TOOL_CALLS).map(call => {
      const matches = resultMultiplicity.get(call.id) ?? []
      const status: PersistedToolCallStatus =
        (callMultiplicity.get(call.id) ?? 0) > 1 ? 'duplicate-call-id'
          : matches.length > 1 ? 'multiple-results'
          : matches.length === 0 ? 'no-result-observed'
          : matches[0].error ? 'error-observed'
          : 'result-observed'
      return { callId: call.id, name: call.name, status,
        matchingResultCount: matches.length }
    })
  const orphanResultCount = results.filter(r => !callMultiplicity.has(r.id)).length
  const hiddenCallCount = Math.max(0, calls.length - summaries.length)
  const incomplete = opaqueCount > 0 || orphanResultCount > 0 || hiddenCallCount > 0 ||
    summaries.some(s => s.status === 'duplicate-call-id' || s.status === 'multiple-results')

  return {
    ...initial,
    situation: incomplete ? 'incomplete' : calls.length === 0 ? 'no-tool-calls' : 'observed',
    callCount: calls.length,
    resultCount: results.length,
    opaqueCount,
    orphanResultCount,
    hiddenCallCount,
    calls: summaries,
  }
}
