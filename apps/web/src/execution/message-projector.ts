import {
  messageId,
  type Message,
  type MessageContentBlock,
  type MessageRole,
  type StateValues,
  type ThreadState,
} from '../domain'

const isObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value)

const messageRole = (
  value: Record<string, unknown>,
): MessageRole | null => {
  const source =
    typeof value.role === 'string'
      ? value.role
      : typeof value.type === 'string'
        ? value.type
        : null

  if (source === null) {
    return null
  }

  switch (source.toLowerCase()) {
    case 'user':
    case 'human':
    case 'humanmessage':
    case 'humanmessagechunk':
      return 'user'

    case 'assistant':
    case 'ai':
    case 'aimessage':
    case 'aimessagechunk':
      return 'assistant'

    case 'system':
    case 'systemmessage':
    case 'systemmessagechunk':
      return 'system'

    case 'tool':
    case 'toolmessage':
    case 'toolmessagechunk':
    case 'function':
    case 'functionmessage':
    case 'functionmessagechunk':
      return 'tool'

    default:
      return null
  }
}

const projectContentItem = (
  value: unknown,
): MessageContentBlock => {
  if (typeof value === 'string') {
    return {
      kind: 'text',
      text: value,
    }
  }

  if (
    isObject(value) &&
    typeof value.text === 'string'
  ) {
    return {
      kind: 'text',
      text: value.text,
    }
  }

  return {
    kind: 'data',
    data: value,
  }
}

const messageContent = (
  value: unknown,
): readonly MessageContentBlock[] => {
  if (Array.isArray(value)) {
    return value.map(
      projectContentItem,
    )
  }

  return [
    projectContentItem(value),
  ]
}

export const projectMessage = (
  value: unknown,
): Message | null => {
  if (!isObject(value)) {
    return null
  }

  const role =
    messageRole(value)

  if (role === null) {
    return null
  }

  if (
    !Object.hasOwn(
      value,
      'content',
    )
  ) {
    return null
  }

  return {
    id:
      typeof value.id === 'string'
        ? messageId(value.id)
        : null,

    role,

    content:
      messageContent(
        value.content,
      ),

    name:
      typeof value.name === 'string'
        ? value.name
        : null,
  }
}

export const projectMessagesFromValues = (
  values: StateValues,
): readonly Message[] => {
  if (!isObject(values)) {
    return []
  }

  const messages =
    values.messages

  if (!Array.isArray(messages)) {
    return []
  }

  return messages.flatMap(
    (value) => {
      const message =
        projectMessage(value)

      return message === null
        ? []
        : [message]
    },
  )
}

export const projectMessagesFromState = (
  state: ThreadState,
): readonly Message[] =>
  projectMessagesFromValues(
    state.values,
  )
