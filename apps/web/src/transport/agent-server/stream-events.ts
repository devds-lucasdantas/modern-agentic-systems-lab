import type {
  SseEvent,
} from './sse'

export type KnownAgentServerStreamEvent =
  | 'metadata'
  | 'checkpoints'
  | 'values'
  | 'updates'
  | 'messages/metadata'
  | 'messages/partial'

const knownEvents:
ReadonlySet<string> =
  new Set<KnownAgentServerStreamEvent>([
    'metadata',
    'checkpoints',
    'values',
    'updates',
    'messages/metadata',
    'messages/partial',
  ])

const isKnownAgentServerStreamEvent = (
  value: string,
): value is KnownAgentServerStreamEvent =>
  knownEvents.has(value)

interface StreamEventBase {
  readonly id: string | null
  readonly retry: number | null
  readonly rawData: string
}

export interface KnownStreamEvent
  extends StreamEventBase {
  readonly kind: 'known'
  readonly event:
    KnownAgentServerStreamEvent
  readonly data: unknown
}

export interface UnknownStreamEvent
  extends StreamEventBase {
  readonly kind: 'unknown'
  readonly event: string | null
  readonly data: unknown
}

export interface MalformedStreamEvent
  extends StreamEventBase {
  readonly kind: 'malformed-json'
  readonly event: string | null
  readonly error: string
}

export type AgentServerStreamEvent =
  | KnownStreamEvent
  | UnknownStreamEvent
  | MalformedStreamEvent

const errorMessage = (
  value: unknown,
): string =>
  value instanceof Error
    ? value.message
    : String(value)

export const decodeAgentServerStreamEvent = (
  frame: SseEvent,
): AgentServerStreamEvent => {
  let data: unknown

  try {
    data =
      JSON.parse(
        frame.data,
      )
  } catch (error) {
    return {
      kind:
        'malformed-json',

      event:
        frame.event,

      id:
        frame.id,

      retry:
        frame.retry,

      rawData:
        frame.data,

      error:
        errorMessage(error),
    }
  }

  if (
    frame.event !== null &&
    isKnownAgentServerStreamEvent(
      frame.event,
    )
  ) {
    return {
      kind: 'known',

      event:
        frame.event,

      id:
        frame.id,

      retry:
        frame.retry,

      rawData:
        frame.data,

      data,
    }
  }

  return {
    kind: 'unknown',

    event:
      frame.event,

    id:
      frame.id,

    retry:
      frame.retry,

    rawData:
      frame.data,

    data,
  }
}
