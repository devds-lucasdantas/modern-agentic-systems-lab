import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import type {
  Assistant,
  Thread,
} from '../domain'

import {
  useRuntime,
} from './use-runtime'

export type RuntimeLoadStatus =
  | 'loading'
  | 'ready'
  | 'error'

export interface RuntimeOverview {
  readonly status: RuntimeLoadStatus

  readonly assistants:
    readonly Assistant[]

  readonly threads:
    readonly Thread[]

  readonly assistantTotal:
    number | null

  readonly threadTotal:
    number | null

  readonly error:
    Error | null

  readonly refresh:
    () => Promise<void>
}

interface RuntimeOverviewState {
  readonly status: RuntimeLoadStatus

  readonly assistants:
    readonly Assistant[]

  readonly threads:
    readonly Thread[]

  readonly assistantTotal:
    number | null

  readonly threadTotal:
    number | null

  readonly error:
    Error | null
}

interface LoadedRuntimeOverview {
  readonly assistants:
    readonly Assistant[]

  readonly threads:
    readonly Thread[]

  readonly assistantTotal:
    number | null

  readonly threadTotal:
    number | null
}

const initialState:
RuntimeOverviewState = {
  status: 'loading',
  assistants: [],
  threads: [],
  assistantTotal: null,
  threadTotal: null,
  error: null,
}

const asError = (
  value: unknown,
): Error =>
  value instanceof Error
    ? value
    : new Error(String(value))

export function useRuntimeOverview():
RuntimeOverview {
  const { client } =
    useRuntime()

  const [
    state,
    setState,
  ] = useState<RuntimeOverviewState>(
    initialState,
  )

  const requestVersion =
    useRef(0)

  const fetchOverview =
    useCallback(
      async (): Promise<LoadedRuntimeOverview> => {
        const [
          assistants,
          threads,
        ] = await Promise.all([
          client.searchAssistants({
            limit: 20,
          }),

          client.searchThreads({
            limit: 20,
          }),
        ])

        return {
          assistants:
            assistants.items,
          threads:
            threads.items,
          assistantTotal:
            assistants.total,
          threadTotal:
            threads.total,
        }
      },
      [client],
    )

  const commitReady =
    useCallback(
      (
        result: LoadedRuntimeOverview,
      ) => {
        setState({
          status: 'ready',
          assistants:
            result.assistants,
          threads:
            result.threads,
          assistantTotal:
            result.assistantTotal,
          threadTotal:
            result.threadTotal,
          error: null,
        })
      },
      [],
    )

  const commitError =
    useCallback(
      (
        error: unknown,
      ) => {
        setState((current) => ({
          ...current,
          status: 'error',
          error: asError(error),
        }))
      },
      [],
    )

  const refresh =
    useCallback(async () => {
      const version =
        ++requestVersion.current

      setState((current) => ({
        ...current,
        status: 'loading',
        error: null,
      }))

      try {
        const result =
          await fetchOverview()

        if (
          version !==
          requestVersion.current
        ) {
          return
        }

        commitReady(result)
      } catch (error) {
        if (
          version !==
          requestVersion.current
        ) {
          return
        }

        commitError(error)
      }
    }, [
      commitError,
      commitReady,
      fetchOverview,
    ])

  useEffect(() => {
    const version =
      ++requestVersion.current

    void fetchOverview()
      .then((result) => {
        if (
          version !==
          requestVersion.current
        ) {
          return
        }

        commitReady(result)
      })
      .catch((error: unknown) => {
        if (
          version !==
          requestVersion.current
        ) {
          return
        }

        commitError(error)
      })

    return () => {
      requestVersion.current += 1
    }
  }, [
    commitError,
    commitReady,
    fetchOverview,
  ])

  return {
    ...state,
    refresh,
  }
}
