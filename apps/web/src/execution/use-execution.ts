import {
  useCallback,
  useState,
} from 'react'

import {
  assistantId,
  runId,
  type AssistantId,
  type Message,
  type Run,
  type RunId,
  type ThreadId,
  type ThreadState,
} from '../domain'

import {
  useRuntime,
} from '../app/use-runtime'

import type {
  AgentServerStreamEvent,
} from '../transport/agent-server'

import {
  projectMessagesFromState,
} from './message-projector'

export type ExecutionPhase =
  | 'idle'
  | 'loading-state'
  | 'creating-thread'
  | 'creating-run'
  | 'streaming'
  | 'reconciling-run'
  | 'refreshing-state'
  | 'completed'
  | 'failed'

export interface ExecutionSnapshot {
  readonly phase: ExecutionPhase

  /**
   * Runtime Run identity observed from SSE metadata.
   *
   * It can exist before the final Run resource is reconciled.
   */
  readonly runId:
    RunId | null

  readonly run:
    Run | null

  readonly state:
    ThreadState | null

  readonly messages:
    readonly Message[]

  readonly error:
    Error | null
}

export interface ExecuteInput {
  readonly assistantId:
    AssistantId

  readonly threadId:
    ThreadId | null

  readonly text:
    string
}

const initialSnapshot:
  ExecutionSnapshot = {
  phase: 'idle',
  runId: null,
  run: null,
  state: null,
  messages: [],
  error: null,
}

const terminalStatuses =
  new Set([
    'error',
    'success',
    'timeout',
    'interrupted',
  ])

const asError = (
  value: unknown,
): Error =>
  value instanceof Error
    ? value
    : new Error(String(value))

const isObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value)

const runIdFromStreamEvent = (
  event: AgentServerStreamEvent,
): RunId | null => {
  if (
    event.kind !== 'known' ||
    event.event !== 'metadata' ||
    !isObject(event.data) ||
    typeof event.data.run_id !== 'string'
  ) {
    return null
  }

  return runId(
    event.data.run_id,
  )
}

export function useExecution() {
  const { client } =
    useRuntime()

  const [
    snapshot,
    setSnapshot,
  ] = useState<ExecutionSnapshot>(
    initialSnapshot,
  )

  const loadThreadState =
    useCallback(
      async (
        thread: ThreadId,
      ): Promise<ThreadState> => {
        setSnapshot((current) => ({
          ...current,
          phase: 'loading-state',
          runId: null,
          run: null,
          error: null,
        }))

        try {
          const state =
            await client.getThreadState(
              thread,
            )

          setSnapshot({
            phase: 'idle',
            runId: null,
            run: null,
            state,
            messages:
              projectMessagesFromState(
                state,
              ),
            error: null,
          })

          return state
        } catch (error) {
          const normalized =
            asError(error)

          setSnapshot((current) => ({
            ...current,
            phase: 'failed',
            error: normalized,
          }))

          throw normalized
        }
      },
      [client],
    )

  const reset =
    useCallback(() => {
      setSnapshot(
        initialSnapshot,
      )
    }, [])

  const execute =
    useCallback(
      async ({
        assistantId:
          selectedAssistantId,
        threadId:
          selectedThreadId,
        text,
      }: ExecuteInput):
      Promise<ThreadId> => {
        const trimmed =
          text.trim()

        if (!trimmed) {
          throw new Error(
            'Message must not be empty',
          )
        }

        let activeThread =
          selectedThreadId

        try {
          if (activeThread === null) {
            setSnapshot({
              phase:
                'creating-thread',
              runId: null,
              run: null,
              state: null,
              messages: [],
              error: null,
            })

            const createdThread =
              await client.createThread()

            activeThread =
              createdThread.id
          }

          setSnapshot((current) => ({
            ...current,
            phase: 'creating-run',
            runId: null,
            run: null,
            error: null,
          }))

          let observedRunId:
            RunId | null = null

          let streamStarted =
            false

          for await (
            const event
            of client.streamRun(
              activeThread,
              {
                assistantId:
                  assistantId(
                    selectedAssistantId,
                  ),

                input: {
                  messages: [
                    {
                      role: 'human',
                      content: trimmed,
                      id:
                        crypto.randomUUID(),
                    },
                  ],
                },

                // Preserve the single-active-execution
                // policy from the REST baseline.
                multitaskStrategy:
                  'reject',

                // 2.2C observes the stream but deliberately
                // does not project partial messages yet.
                streamMode: [
                  'updates',
                  'values',
                  'messages',
                  'checkpoints',
                ],

                streamResumable:
                  true,

                // Transport loss must not implicitly
                // cancel Runtime execution.
                onDisconnect:
                  'continue',
              },
            )
          ) {
            const metadataRunId =
              runIdFromStreamEvent(
                event,
              )

            if (
              metadataRunId !== null
            ) {
              if (
                observedRunId !== null &&
                observedRunId !==
                  metadataRunId
              ) {
                throw new Error(
                  'Run stream changed run_id during one execution',
                )
              }

              observedRunId =
                metadataRunId
            }

            if (
              !streamStarted ||
              metadataRunId !== null
            ) {
              setSnapshot(
                (current) => ({
                  ...current,
                  phase:
                    'streaming',
                  runId:
                    observedRunId,
                }),
              )
            }

            streamStarted = true
          }

          if (
            observedRunId === null
          ) {
            throw new Error(
              'Run stream completed without metadata run_id',
            )
          }

          const finalRunId =
            observedRunId

          setSnapshot(
            (current) => ({
              ...current,
              phase:
                'reconciling-run',
              runId:
                finalRunId,
            }),
          )

          const reconciledRun =
            await client.getRun(
              activeThread,
              finalRunId,
            )

          setSnapshot(
            (current) => ({
              ...current,
              phase:
                'reconciling-run',
              runId:
                finalRunId,
              run:
                reconciledRun,
            }),
          )

          if (
            !terminalStatuses.has(
              reconciledRun.status,
            )
          ) {
            throw new Error(
              'Run stream closed before terminal lifecycle status: ' +
              reconciledRun.status,
            )
          }

          setSnapshot(
            (current) => ({
              ...current,
              phase:
                'refreshing-state',
              runId:
                finalRunId,
              run:
                reconciledRun,
            }),
          )

          const state =
            await client.getThreadState(
              activeThread,
            )

          setSnapshot({
            phase: 'completed',
            runId:
              finalRunId,
            run:
              reconciledRun,
            state,
            messages:
              projectMessagesFromState(
                state,
              ),
            error: null,
          })

          return activeThread
        } catch (error) {
          const normalized =
            asError(error)

          setSnapshot((current) => ({
            ...current,
            phase: 'failed',
            error: normalized,
          }))

          throw normalized
        }
      },
      [client],
    )

  return {
    ...snapshot,
    execute,
    loadThreadState,
    reset,
  }
}
