import type {
  Message,
  StateValues,
} from '../domain'

import type {
  AgentServerStreamEvent,
} from '../transport/agent-server'

import {
  projectMessage,
  projectMessagesFromValues,
} from './message-projector'


export interface LiveStreamProjection {
  /**
   * Provisional messages observed from the live stream.
   *
   * Final persisted messages are still reconciled from ThreadState.
   */
  readonly messages:
    readonly Message[]

  /**
   * Latest complete `values` stream snapshot.
   *
   * This is provisional live state, not persisted ThreadState.
   */
  readonly values:
    StateValues | null
}


export const emptyLiveStreamProjection:
LiveStreamProjection = {
  messages: [],
  values: null,
}


const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value)


const isStateValues = (
  value: unknown,
): value is StateValues =>
  isRecord(value) ||
  (
    Array.isArray(value) &&
    value.every(isRecord)
  )


const mergeMessageById = (
  messages: readonly Message[],
  incoming: Message,
): readonly Message[] => {
  /*
   * A cumulative streamed message needs stable identity.
   *
   * Without an ID we cannot safely distinguish:
   * - a new logical message
   * - another snapshot of the same logical message
   *
   * The complete `values` snapshot and final ThreadState provide
   * recovery paths, so an unidentified partial is ignored rather
   * than duplicated.
   */
  if (incoming.id === null) {
    return messages
  }

  const index =
    messages.findIndex(
      (message) =>
        message.id === incoming.id,
    )

  if (index === -1) {
    return [
      ...messages,
      incoming,
    ]
  }

  return messages.map(
    (message, currentIndex) =>
      currentIndex === index
        ? incoming
        : message,
  )
}


const projectPartialMessages = (
  current: readonly Message[],
  data: unknown,
): readonly Message[] => {
  if (!Array.isArray(data)) {
    return current
  }

  return data.reduce<
    readonly Message[]
  >(
    (messages, value) => {
      const projected =
        projectMessage(value)

      if (projected === null) {
        return messages
      }

      return mergeMessageById(
        messages,
        projected,
      )
    },
    current,
  )
}


export const projectStreamEvent = (
  current: LiveStreamProjection,
  event: AgentServerStreamEvent,
): LiveStreamProjection => {
  if (event.kind !== 'known') {
    return current
  }

  switch (event.event) {
    case 'messages/partial':
      return {
        ...current,

        messages:
          projectPartialMessages(
            current.messages,
            event.data,
          ),
      }

    case 'values': {
      if (
        !isStateValues(
          event.data,
        )
      ) {
        return current
      }

      /*
       * `values` is a complete live graph-state snapshot.
       *
       * Its message projection therefore replaces the current
       * message list at that instant. Later messages/partial
       * events may progressively replace the same message by ID.
       */
      return {
        values:
          event.data,

        messages:
          projectMessagesFromValues(
            event.data,
          ),
      }
    }

    /*
     * updates is heterogeneous node/middleware output rather
     * than a generic whole-state contract.
     *
     * messages/metadata describes model-run metadata.
     *
     * metadata identifies Runtime execution.
     *
     * checkpoints belongs to checkpoint observation.
     *
     * None of those currently changes semantic live projection.
     */
    case 'updates':
    case 'messages/metadata':
    case 'metadata':
    case 'checkpoints':
      return current
  }
}
