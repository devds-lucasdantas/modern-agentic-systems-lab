declare const brand: unique symbol

type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name
}

export type GraphId = Brand<string, 'GraphId'>
export type AssistantId = Brand<string, 'AssistantId'>
export type ThreadId = Brand<string, 'ThreadId'>
export type RunId = Brand<string, 'RunId'>
export type CheckpointId = Brand<string, 'CheckpointId'>
export type InterruptId = Brand<string, 'InterruptId'>
export type MessageId = Brand<string, 'MessageId'>

const branded = <Name extends string>(
  value: string,
): Brand<string, Name> => value as Brand<string, Name>

export const graphId = (value: string): GraphId =>
  branded<'GraphId'>(value)

export const assistantId = (value: string): AssistantId =>
  branded<'AssistantId'>(value)

export const threadId = (value: string): ThreadId =>
  branded<'ThreadId'>(value)

export const runId = (value: string): RunId =>
  branded<'RunId'>(value)

export const checkpointId = (value: string): CheckpointId =>
  branded<'CheckpointId'>(value)

export const interruptId = (value: string): InterruptId =>
  branded<'InterruptId'>(value)

export const messageId = (value: string): MessageId =>
  branded<'MessageId'>(value)
