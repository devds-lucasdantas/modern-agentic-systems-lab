import type { MessageId } from './ids'

export type MessageRole =
  | 'user'
  | 'assistant'
  | 'system'
  | 'tool'

export interface TextMessageBlock {
  readonly kind: 'text'
  readonly text: string
}

export interface DataMessageBlock {
  readonly kind: 'data'
  readonly data: unknown
}

export type MessageContentBlock =
  | TextMessageBlock
  | DataMessageBlock

export interface Message {
  readonly id: MessageId | null
  readonly role: MessageRole
  readonly content: readonly MessageContentBlock[]
  readonly name: string | null
}
