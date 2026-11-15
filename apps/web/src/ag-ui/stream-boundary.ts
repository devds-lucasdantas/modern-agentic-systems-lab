/**
 * MASL 2.6C — isolated, read-only AG-UI 1.0 SSE / lifecycle review.
 * Pin: ag-ui-protocol/ag-ui@2330368a2a74573902858867072406638ba3073d.
 * Sources: docs/spec/1.0/basic/transports/{index,http-sse},
 * docs/spec/1.0/events/lifecycle, docs/spec/1.0/basic/{processing,patterns/streaming}.
 *
 * NOT an AG-UI consumer, adapter, schema validator, or an assertion of tool
 * execution. The checker accepts only already-recognised 2.6B envelopes;
 * unsupported chunk / nested behaviour is reported as uncovered.
 */
import { checkAgUiEnvelope, type AgUiEventType } from './event-grammar'

export interface SseWireFrame {
  readonly data: string
  readonly event: string | null
  readonly id: string | null
  readonly retry: number | null
}

export type FrameReview =
  | Readonly<{ kind: 'accepted'; type: AgUiEventType; value: Record<string, unknown> }>
  | Readonly<{ kind: 'unrecognized-type' }>
  | Readonly<{ kind: 'deferred-extension' }>
  | Readonly<{ kind: 'invalid'; code: 'json' | 'shape' | 'known-field' }>

/** Do not use SSE `event`, `id`, `retry`, or Last-Event-ID as AG-UI authority. */
export const inspectAgUiSseFrame = (frame: SseWireFrame): FrameReview => {
  let value: unknown
  try { value = JSON.parse(frame.data) } catch { return { kind: 'invalid', code: 'json' } }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { kind: 'invalid', code: 'shape' }
  }
  const event = value as Record<string, unknown>
  if (typeof event.type !== 'string') return { kind: 'invalid', code: 'shape' }
  const checked = checkAgUiEnvelope(event)
  if (!checked.valid) {
    // AG-UI receivers MUST tolerate additions. 2.6B's closed-schema checker
    // cannot determine whether unknown properties are safe additions, so
    // decline to assert semantics rather than reclassifying as a fatal error.
    if (checked.reason === 'unknown-type') return { kind: 'unrecognized-type' }
    if (checked.reason === 'unexpected-property') return { kind: 'deferred-extension' }
    return { kind: 'invalid', code: 'known-field' }
  }
  return { kind: 'accepted', type: checked.type, value: event }
}

export type ReviewIssue = Readonly<{ index: number; code: string }>
export type ReviewedRun = Readonly<{
  status: 'finished' | 'failed' | 'truncated'
  terminal: boolean
  /** Reported discriminator only. 2.6B does not recursively verify outcome bodies. */
  reportedOutcome: 'implicit-success' | 'success' | 'interrupt' | 'cancelled' | 'unverified' | null
}>
export interface StreamReview {
  readonly runCount: number
  readonly runs: readonly ReviewedRun[]
  readonly issues: readonly ReviewIssue[]
  readonly acceptedEventCount: number
  readonly ignoredUnknownCount: number
  readonly scopeComplete: boolean
}

type ActiveRun = {
  runId: string
  threadId: string
  openMessages: Set<string>
  openTools: Set<string>
  openReasoning: Set<string>
  openSteps: Set<string>
}
const text = (value: unknown): string => typeof value === 'string' ? value : ''
const open = (map: Set<string>, key: string): boolean => {
  if (map.has(key)) return false
  map.add(key)
  return true
}
const close = (map: Set<string>, key: string): boolean => map.delete(key)

/**
 * Bounded single-response review. This handles multiple sequential runs,
 * explicit triads, steps and late RUN_ERROR. It intentionally does NOT expand
 * CHUNK events, apply state, act on tools, or claim full AG-UI conformance.
 * EOF without a terminal is truncation, not success or cancellation.
 */
export const reviewAgUiSseFrames = (
  frames: readonly SseWireFrame[],
  connectionEnded: boolean,
): StreamReview => {
  const issues: ReviewIssue[] = []
  const runs: ReviewedRun[] = []
  let active: ActiveRun | null = null
  let lastTerminal: 'finished' | 'failed' | null = null
  let acceptedEventCount = 0
  let ignoredUnknownCount = 0
  let scopeComplete = true
  const limit = Math.min(frames.length, 2_000)
  const note = (index: number, code: string): void => { issues.push({ index, code }) }
  for (let index = 0; index < limit; index += 1) {
    const parsed = inspectAgUiSseFrame(frames[index]!)
    if (parsed.kind === 'unrecognized-type') { ignoredUnknownCount += 1; continue }
    if (parsed.kind === 'deferred-extension') {
      scopeComplete = false
      note(index, 'extension-needs-enforcement')
      continue
    }
    if (parsed.kind === 'invalid') { note(index, `invalid-${parsed.code}`); continue }
    acceptedEventCount += 1
    const e = parsed.value
    const t = parsed.type
    if (t === 'RUN_STARTED') {
      if (active !== null) {
        note(index, 'nested-run-start')
        continue
      }
      active = { runId: text(e.runId), threadId: text(e.threadId),
        openMessages: new Set(), openTools: new Set(),
        openReasoning: new Set(), openSteps: new Set() }
      lastTerminal = null
      if (e.protocolVersion !== '1.0') note(index, 'version-declaration-review')
      continue
    }
    if (t === 'RUN_ERROR') {
      if (active === null && lastTerminal === 'failed') {
        note(index, 'event-after-run-error')
      } else if (active === null && lastTerminal === 'finished') {
        // Pinned AG-UI permits a late RUN_ERROR after RUN_FINISHED.
        const previous = runs[runs.length - 1]
        if (previous?.status === 'finished') runs[runs.length - 1] = { status: 'failed', terminal: true, reportedOutcome: null }
        lastTerminal = 'failed'
      } else {
        runs.push({ status: 'failed', terminal: true, reportedOutcome: null })
        active = null
        lastTerminal = 'failed'
      }
      continue
    }
    if (active === null) {
      note(index, lastTerminal === null ? 'event-before-run' : 'event-after-terminal')
      continue
    }
    if (t === 'RUN_FINISHED') {
      if (text(e.runId) !== active.runId || text(e.threadId) !== active.threadId) {
        note(index, 'run-identity-conflict')
        continue
      }
      if (active.openMessages.size || active.openTools.size || active.openReasoning.size || active.openSteps.size) {
        note(index, 'open-items-at-run-finish')
        continue
      }
      // Absence means success in AG-UI 1.0. Present outcome values remain
      // *reported*, not nested-schema-verified, at this limited review layer.
      let reportedOutcome: ReviewedRun['reportedOutcome'] = 'implicit-success'
      if (Object.hasOwn(e, 'outcome')) {
        const outcome = e.outcome
        if (outcome !== null && typeof outcome === 'object' && !Array.isArray(outcome) &&
            'type' in outcome &&
            (outcome.type === 'success' || outcome.type === 'interrupt' || outcome.type === 'cancelled')) {
          reportedOutcome = outcome.type
        } else {
          reportedOutcome = 'unverified'
          scopeComplete = false
          note(index, 'outcome-needs-recursive-verification')
        }
      }
      runs.push({ status: 'finished', terminal: true, reportedOutcome })
      active = null
      lastTerminal = 'finished'
      continue
    }
    if (t.endsWith('_CHUNK') || t.startsWith('SUBAGENT_')) {
      // Chunk expansion is normative but not implemented in this scoped lab.
      scopeComplete = false
      note(index, 'unreviewed-chunk-or-subagent')
      continue
    }
    const msgId = text(e.messageId)
    const callId = text(e.toolCallId)
    const step = text(e.stepName)
    switch (t) {
      case 'TEXT_MESSAGE_START':
        if (!open(active.openMessages, msgId)) note(index, 'message-already-open')
        break
      case 'TEXT_MESSAGE_CONTENT':
        if (!active.openMessages.has(msgId)) note(index, 'message-content-without-open')
        break
      case 'TEXT_MESSAGE_END':
        if (!close(active.openMessages, msgId)) note(index, 'message-end-without-open')
        break
      case 'TOOL_CALL_START':
        if (!open(active.openTools, callId)) note(index, 'tool-already-open')
        break
      case 'TOOL_CALL_ARGS':
        if (!active.openTools.has(callId)) note(index, 'tool-args-without-open')
        break
      case 'TOOL_CALL_END':
        if (!close(active.openTools, callId)) note(index, 'tool-end-without-open')
        break
      case 'STEP_STARTED':
        if (!open(active.openSteps, step)) note(index, 'step-already-open')
        break
      case 'STEP_FINISHED':
        if (!close(active.openSteps, step)) note(index, 'step-end-without-open')
        break
      case 'REASONING_MESSAGE_START':
        if (!open(active.openReasoning, msgId)) note(index, 'reasoning-already-open')
        break
      case 'REASONING_MESSAGE_CONTENT':
        if (!active.openReasoning.has(msgId)) note(index, 'reasoning-content-without-open')
        break
      case 'REASONING_MESSAGE_END':
        if (!close(active.openReasoning, msgId)) note(index, 'reasoning-end-without-open')
        break
      default:
        // Standalone events carry no implied run end/agent-side effect.
        break
    }
  }
  if (frames.length > limit) { note(limit, 'review-frame-cap'); scopeComplete = false }
  if (connectionEnded && active !== null) {
    runs.push({ status: 'truncated', terminal: false, reportedOutcome: null })
    note(limit, 'truncated-run-no-terminal')
  }
  if (connectionEnded && runs.length === 0) note(limit, 'no-terminal-run-observed')
  if (!connectionEnded && active !== null) { scopeComplete = false; note(limit, 'stream-still-open') }
  return { runCount: runs.length, runs, issues, acceptedEventCount, ignoredUnknownCount, scopeComplete }
}

export interface HttpReviewInput {
  readonly requestMethod: string
  readonly requestContentType: string
  readonly requestAccept: string
  readonly responseStatus: number
  readonly responseContentType: string | null
  readonly lastEventIdSent: boolean
}
export const reviewAgUiHttpSseBinding = (input: HttpReviewInput): readonly string[] => {
  const issues: string[] = []
  if (input.requestMethod.toUpperCase() !== 'POST') issues.push('request-not-post')
  if (!/^application\/json(?:\s*;|$)/i.test(input.requestContentType)) issues.push('request-not-json')
  if (!input.requestAccept.split(',').some(v => v.trim().toLowerCase().startsWith('text/event-stream'))) {
    issues.push('accept-missing-event-stream')
  }
  if (input.responseStatus === 200) {
    if (input.responseContentType === null ||
        !/^text\/event-stream(?:\s*;|$)/i.test(input.responseContentType)) issues.push('response-not-event-stream')
  } else if (input.responseStatus >= 400) issues.push('http-rejected-before-run-not-stream-error')
  else issues.push('unexpected-http-status')
  if (input.lastEventIdSent) issues.push('ag-ui-http-sse-has-no-resume')
  return issues
}
