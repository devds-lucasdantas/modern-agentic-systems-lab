import type { Message, MessageRole } from '../domain'

/**
 * Display-only contract. The original Message/ThreadState are not mutated.
 * Raw tool outputs and non-text content are never copied to this view.
 * Free-form TEXT from user/assistant/system is intentionally still visible:
 * this is NOT a general DLP mechanism for model-echoed secrets.
 */
export interface DisplayMessageBlock {
  readonly text: string
  readonly redacted: boolean
}

export interface DisplayMessage {
  readonly id: Message['id']
  readonly role: MessageRole
  readonly blocks: readonly DisplayMessageBlock[]
}

const TOOL_PLACEHOLDER =
  'Tool result content hidden. Consult persisted tool observations for correlation.'
const DATA_PLACEHOLDER = 'Non-text message content hidden.'

export const projectMessageForDisplay = (message: Message): DisplayMessage => {
  if (message.role === 'tool') {
    // Do not copy ToolMessage.name, text, data, error, or serialized output.
    return {
      id: message.id,
      role: message.role,
      blocks: [{ text: TOOL_PLACEHOLDER, redacted: true }],
    }
  }

  return {
    id: message.id,
    role: message.role,
    blocks: message.content.map((block): DisplayMessageBlock =>
      block.kind === 'text'
        ? { text: block.text, redacted: false }
        : { text: DATA_PLACEHOLDER, redacted: true }),
  }
}

export const projectMessagesForDisplay = (
  messages: readonly Message[],
): readonly DisplayMessage[] => messages.map(projectMessageForDisplay)
