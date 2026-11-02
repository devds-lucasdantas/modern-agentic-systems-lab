import {
  useCallback,
  useState,
} from 'react'

import {
  assistantId,
  type AssistantId,
  type Message,
  type Run,
  type RunId,
  type StateValues,
  type ThreadId,
  type ThreadState,
} from '../domain'

import {
  useRuntime,
} from '../app/use-runtime'

import {
  AgentServerDecodeError,
  AgentServerHttpError,
} from '../transport/agent-server'

import {
  projectMessagesFromState,
} from './message-projector'

import {
  emptyLiveStreamProjection,
  projectStreamEvent,
} from './stream-projector'


export type ExecutionPhase =
  | 'idle'
  | 'loading-state'
  | 'creating-thread'
  | 'creating-run'
  | 'streaming'
  | 'reconnecting-stream'
  | 'reconciling-run'
  | 'refreshing-state'
  | 'completed'
  | 'failed'


export interface ExecutionSnapshot {
  readonly phase:
    ExecutionPhase

  /**
   * Runtime Run identity.
   *
   * It may be available immediately from the HTTP Location
   * header or, in a cross-origin browser where Location is not
   * exposed by CORS, after the first metadata.run_id event.
   *
   * It exists before the final Run resource is reconciled.
   */
  readonly runId:
    RunId | null

  readonly run:
    Run | null

  readonly state:
    ThreadState | null

  /**
   * Latest provisional complete values snapshot
   * observed from the live SSE stream.
   *
   * Final persisted authority remains ThreadState.
   */
  readonly liveValues:
    StateValues | null

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
  liveValues: null,
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


const reconnectDelaysMs =
  [
    250,
    500,
    1_000,
    2_000,
  ] as const


const asError = (
  value: unknown,
): Error =>
  value instanceof Error
    ? value
    : new Error(
        String(value),
      )


const waitForReconnectDelay = (
  milliseconds: number,
): Promise<void> =>
  new Promise(
    (resolve) => {
      globalThis.setTimeout(
        resolve,
        milliseconds,
      )
    },
  )


const waitForBrowserOnline =
  async (): Promise<void> => {
    if (
      typeof navigator ===
        'undefined' ||
      navigator.onLine
    ) {
      return
    }

    await new Promise<void>(
      (resolve) => {
        globalThis.addEventListener(
          'online',
          () => {
            resolve()
          },
          {
            once: true,
          },
        )
      },
    )
  }


const isReconnectableStreamError = (
  value: unknown,
): boolean => {
  /*
   * Decode failures are protocol/contract failures.
   * Retrying the same stream cannot repair them.
   */
  if (
    value instanceof
      AgentServerDecodeError
  ) {
    return false
  }

  /*
   * Retry only HTTP failures that can reasonably be transient.
   */
  if (
    value instanceof
      AgentServerHttpError
  ) {
    return (
      value.status === 408 ||
      value.status === 429 ||
      value.status >= 500
    )
  }

  /*
   * Browser fetch and ReadableStream network failures normally
   * surface as TypeError.
   */
  if (
    value instanceof TypeError
  ) {
    return true
  }

  if (
    typeof DOMException !==
      'undefined' &&
    value instanceof DOMException
  ) {
    return (
      value.name ===
      'NetworkError'
    )
  }

  return false
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
          liveValues: null,
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
            liveValues: null,
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

          setSnapshot(
            (current) => ({
              ...current,
              phase: 'failed',
              error: normalized,
            }),
          )

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
          if (
            activeThread === null
          ) {
            setSnapshot({
              phase:
                'creating-thread',
              runId: null,
              run: null,
              state: null,
              liveValues: null,
              messages: [],
              error: null,
            })

            const createdThread =
              await client.createThread()

            activeThread =
              createdThread.id
          }


          setSnapshot(
            (current) => ({
              ...current,
              phase:
                'creating-run',
              runId: null,
              run: null,
              liveValues: null,
              error: null,
            }),
          )


          let liveProjection = {
            ...emptyLiveStreamProjection,

            /*
             * Preserve already reconciled history for an
             * existing Thread until the first complete values
             * snapshot arrives.
             */
            messages:
              selectedThreadId ===
              null
                ? []
                : snapshot.messages,
          }


          const session =
            await client.openRunStream(
              activeThread,
              {
                assistantId:
                  assistantId(
                    selectedAssistantId,
                  ),

                input: {
                  messages: [
                    {
                      role:
                        'human',

                      content:
                        trimmed,

                      id:
                        crypto.randomUUID(),
                    },
                  ],
                },

                /*
                 * Preserve the single-active-execution policy
                 * from the REST baseline.
                 */
                multitaskStrategy:
                  'reject',

                /*
                 * These complementary stream views feed the
                 * 2.2D provisional projection.
                 */
                streamMode: [
                  'updates',
                  'values',
                  'messages',
                  'checkpoints',
                ],

                streamResumable:
                  true,

                /*
                 * Losing browser transport must not implicitly
                 * cancel Runtime execution.
                 */
                onDisconnect:
                  'continue',
              },
            )


          /*
           * When Location is CORS-visible this is already
           * populated.
           *
           * Otherwise it remains null until metadata.run_id is
           * decoded by RunStreamSession.events().
           */
          let observedRunId:
            RunId | null =
              session.runId


          setSnapshot(
            (current) => ({
              ...current,
              phase:
                'streaming',
              runId:
                observedRunId,
            }),
          )


          /*
           * Counts consecutive reconnect attempts.
           *
           * Observing any event on a resumed connection proves
           * progress and resets the retry budget.
           */
          let reconnectAttempt =
            0


          streamConsumption:
          while (true) {
            try {
              for await (
                const event
                of session.events()
              ) {
                reconnectAttempt =
                  0

                /*
                 * metadata.run_id is interpreted inside the
                 * transport session.
                 *
                 * Reading the property after each event handles
                 * the browser CORS fallback without duplicating
                 * metadata parsing in React.
                 */
                const nextRunId =
                  session.runId

                const runIdChanged =
                  nextRunId !== null &&
                  nextRunId !==
                    observedRunId

                if (
                  nextRunId !== null
                ) {
                  observedRunId =
                    nextRunId
                }


                const nextProjection =
                  projectStreamEvent(
                    liveProjection,
                    event,
                  )

                const projectionChanged =
                  nextProjection !==
                  liveProjection

                liveProjection =
                  nextProjection


                if (
                  runIdChanged ||
                  projectionChanged
                ) {
                  setSnapshot(
                    (current) => ({
                      ...current,
                      phase:
                        'streaming',

                      runId:
                        observedRunId,

                      messages:
                        projectionChanged
                          ? liveProjection.messages
                          : current.messages,

                      liveValues:
                        projectionChanged
                          ? liveProjection.values
                          : current.liveValues,
                    }),
                  )
                }
              }


              /*
               * Natural EOF means this connection was fully
               * consumed. RunStreamSession also commits the
               * final SSE-ID group at this point.
               */
              break streamConsumption
            } catch (
              streamError
            ) {
              if (
                !isReconnectableStreamError(
                  streamError,
                )
              ) {
                throw streamError
              }


              let lastReconnectError:
                unknown =
                  streamError

              let reconnected =
                false


              setSnapshot(
                (current) => ({
                  ...current,
                  phase:
                    'reconnecting-stream',

                  runId:
                    session.runId ??
                    observedRunId,
                }),
              )


              while (
                reconnectAttempt <
                reconnectDelaysMs.length
              ) {
                /*
                 * Do not consume retry budget while the browser
                 * explicitly reports that it is offline.
                 *
                 * Chrome DevTools Offline and real browser
                 * connectivity loss both surface through this
                 * boundary.
                 */
                await waitForBrowserOnline()


                const delayMs =
                  reconnectDelaysMs[
                    reconnectAttempt
                  ]

                reconnectAttempt +=
                  1


                await waitForReconnectDelay(
                  delayMs,
                )


                try {
                  /*
                   * reconnect() issues GET against the original
                   * Run stream and supplies the last safe
                   * Last-Event-ID when one exists.
                   *
                   * It NEVER creates another Run.
                   */
                  await session.reconnect()

                  reconnected =
                    true

                  observedRunId =
                    session.runId ??
                    observedRunId

                  setSnapshot(
                    (current) => ({
                      ...current,
                      phase:
                        'streaming',

                      runId:
                        observedRunId,
                    }),
                  )

                  break
                } catch (
                  reconnectError
                ) {
                  lastReconnectError =
                    reconnectError

                  if (
                    !isReconnectableStreamError(
                      reconnectError,
                    )
                  ) {
                    throw reconnectError
                  }
                }
              }


              if (!reconnected) {
                throw asError(
                  lastReconnectError,
                )
              }


              /*
               * Resume consumption.
               *
               * We intentionally do NOT generically deduplicate
               * replayed SSE events:
               *
               * - messages/partial replaces by Message ID;
               * - values replaces the complete live snapshot;
               * - updates are not semantically projected.
               */
              continue streamConsumption
            }
          }


          const finalRunId =
            session.runId ??
            observedRunId


          if (
            finalRunId === null
          ) {
            throw new Error(
              'Run stream completed without recoverable Runtime identity',
            )
          }


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
            phase:
              'completed',

            runId:
              finalRunId,

            run:
              reconciledRun,

            state,

            liveValues:
              null,

            messages:
              projectMessagesFromState(
                state,
              ),

            error:
              null,
          })


          return activeThread
        } catch (error) {
          const normalized =
            asError(error)

          setSnapshot(
            (current) => ({
              ...current,
              phase:
                'failed',

              error:
                normalized,
            }),
          )

          throw normalized
        }
      },
      [
        client,
        snapshot.messages,
      ],
    )


  return {
    ...snapshot,
    execute,
    loadThreadState,
    reset,
  }
}
