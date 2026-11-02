import {
  useCallback,
  useState,
} from 'react'

import {
  assistantId,
  type AssistantId,
  type Message,
  type Run,
  type ThreadId,
  type ThreadState,
} from '../domain'

import {
  useRuntime,
} from '../app/use-runtime'

import {
  projectMessagesFromState,
} from './message-projector'

export type ExecutionPhase =
  | 'idle'
  | 'loading-state'
  | 'creating-thread'
  | 'creating-run'
  | 'polling'
  | 'refreshing-state'
  | 'completed'
  | 'failed'

export interface ExecutionSnapshot {
  readonly phase: ExecutionPhase

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

const sleep = (
  milliseconds: number,
): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(
      resolve,
      milliseconds,
    )
  })

const asError = (
  value: unknown,
): Error =>
  value instanceof Error
    ? value
    : new Error(String(value))

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
            error: null,
          }))

          const createdRun =
            await client.createRun(
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

                // The first UI surface allows one
                // active execution per selected Thread.
                multitaskStrategy:
                  'reject',
              },
            )

          setSnapshot((current) => ({
            ...current,
            phase: 'polling',
            run: createdRun,
          }))

          let currentRun =
            createdRun

          const maxPolls = 240

          for (
            let attempt = 0;
            attempt < maxPolls;
            attempt += 1
          ) {
            if (
              terminalStatuses.has(
                currentRun.status,
              )
            ) {
              break
            }

            await sleep(500)

            currentRun =
              await client.getRun(
                activeThread,
                currentRun.id,
              )

            setSnapshot(
              (current) => ({
                ...current,
                phase: 'polling',
                run: currentRun,
              }),
            )
          }

          if (
            !terminalStatuses.has(
              currentRun.status,
            )
          ) {
            throw new Error(
              'Run polling exceeded 120 seconds',
            )
          }

          setSnapshot(
            (current) => ({
              ...current,
              phase:
                'refreshing-state',
              run: currentRun,
            }),
          )

          const state =
            await client.getThreadState(
              activeThread,
            )

          setSnapshot({
            phase: 'completed',
            run: currentRun,
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
