import type {
  Assistant,
  AssistantId,
  CheckpointRef,
  Metadata,
  Run,
  RunId,
  RunStatus,
  StateValues,
  Thread,
  ThreadId,
  ThreadState,
} from '../../domain'
import {
  decodeArray,
  decodeAssistantDto,
  decodeRunDto,
  decodeThreadDto,
  decodeThreadStateDto,
  decodeThreadStateUpdateResponseDto,
  isJsonObject,
} from './decode'
import {
  AgentServerDecodeError,
  AgentServerHttpError,
} from './errors'
import type {
  AgentServerStreamEvent,
} from './stream-events'
import {
  createRunStreamSession,
  type RunStreamSession,
} from './run-stream-session'
import {
  mapAssistant,
  mapRun,
  mapThread,
  mapThreadState,
  mapThreadStateUpdateResponse,
} from './mappers'

export interface SearchPage<T> {
  readonly items: readonly T[]
  readonly total: number | null
}

export interface SearchOptions {
  readonly limit?: number
  readonly offset?: number
}

export interface CreateThreadInput {
  readonly metadata?: Metadata
}

export interface UpdateThreadStateInput {
  readonly values?: StateValues | null
  readonly checkpoint?: CheckpointRef
  readonly asNode?: string
}

export interface UpdateThreadStateResult {
  readonly checkpoint: CheckpointRef
}

export type MultitaskStrategy =
  | 'reject'
  | 'rollback'
  | 'interrupt'
  | 'enqueue'

export type ResumeValue =
  | null
  | string
  | number
  | boolean
  | readonly ResumeValue[]
  | { readonly [key: string]: ResumeValue }

/** Explicit human/runtime response. Does not authorize or preflight resumption. */
export interface CreateResumeRunInput {
  readonly assistantId: AssistantId
  readonly resumeValue: ResumeValue
  readonly metadata?: Metadata
}

export interface CreateRunInput {
  readonly assistantId: AssistantId
  readonly input?: unknown
  readonly metadata?: Metadata
  readonly multitaskStrategy?: MultitaskStrategy
}

export type StreamMode =
  | 'values'
  | 'messages'
  | 'messages-tuple'
  | 'tasks'
  | 'checkpoints'
  | 'updates'
  | 'events'
  | 'debug'
  | 'custom'

export type StreamDisconnectMode =
  | 'cancel'
  | 'continue'

export interface StreamRunInput
  extends CreateRunInput {
  readonly streamMode?:
    | StreamMode
    | readonly StreamMode[]

  readonly streamResumable?: boolean
  readonly streamSubgraphs?: boolean

  readonly onDisconnect?:
    StreamDisconnectMode

  /**
   * Transport cancellation only.
   *
   * This AbortSignal controls the browser/fetch request.
   * Runtime behavior after disconnect remains governed by
   * `onDisconnect`.
   */
  readonly signal?: AbortSignal
}

export interface ListRunsOptions
  extends SearchOptions {
  readonly status?: RunStatus
}

export interface AgentServerClientOptions {
  readonly baseUrl: string
  readonly fetchImpl?: typeof fetch
  readonly credentials?: RequestCredentials
}

const normalizeBaseUrl = (
  value: string,
): string => {
  const normalized = value
    .trim()
    .replace(/\/+$/, '')

  if (!normalized) {
    throw new Error(
      'Agent Server baseUrl must not be empty',
    )
  }

  return normalized
}

const readBody = async (
  response: Response,
): Promise<unknown> => {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

const errorDetail = (
  body: unknown,
): string | null => {
  if (
    isJsonObject(body) &&
    typeof body.detail === 'string'
  ) {
    return body.detail
  }

  return null
}

const paginationTotal = (
  response: Response,
): number | null => {
  const value = response.headers.get(
    'x-pagination-total',
  )

  if (value === null) {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed)
    ? parsed
    : null
}

const queryString = (
  values: Record<
    string,
    string | number | undefined
  >,
): string => {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      params.set(
        key,
        String(value),
      )
    }
  }

  const query = params.toString()

  return query
    ? `?${query}`
    : ''
}

/** Reject values JSON.stringify would silently drop or rewrite. */
const assertResumeJson = (value: unknown): void => {
  const active = new WeakSet<object>()

  const visit = (current: unknown): void => {
    if (current === null || typeof current === 'string' ||
      typeof current === 'boolean') return
    if (typeof current === 'number' && Number.isFinite(current)) return
    if (typeof current !== 'object') {
      throw new TypeError('resumeValue must contain only JSON values')
    }
    if (active.has(current)) {
      throw new TypeError('resumeValue must not contain cycles')
    }
    if (!Array.isArray(current)) {
      const prototype = Object.getPrototypeOf(current) as unknown
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('resumeValue must use plain JSON objects')
      }
    }
    active.add(current)
    if (Array.isArray(current)) {
      for (const key of Reflect.ownKeys(current)) {
        if (key === 'length') continue
        if (typeof key !== 'string' || !Number.isInteger(Number(key)) ||
          Number(key) < 0 || String(Number(key)) !== key ||
          Number(key) >= current.length) {
          throw new TypeError('resumeValue arrays must not contain extra keys')
        }
      }
      for (let i = 0; i < current.length; i += 1) {
        if (!Object.hasOwn(current, i)) {
          throw new TypeError('resumeValue must not contain sparse arrays')
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, String(i))
        if (!descriptor || !('value' in descriptor)) {
          throw new TypeError('resumeValue must not contain accessors')
        }
        visit(descriptor.value)
      }
    } else {
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== 'string') {
          throw new TypeError('resumeValue must not contain symbol keys')
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key)
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          throw new TypeError('resumeValue must contain only enumerable data fields')
        }
        visit(descriptor.value)
      }
    }
    active.delete(current)
  }
  visit(value)
}

export class AgentServerClient {
  readonly #baseUrl: string
  readonly #fetch: typeof fetch
  readonly #credentials: RequestCredentials

  constructor(
    options: AgentServerClientOptions,
  ) {
    this.#baseUrl = normalizeBaseUrl(
      options.baseUrl,
    )

    this.#fetch =
      options.fetchImpl ??
      globalThis.fetch.bind(globalThis)

    this.#credentials =
      options.credentials ?? 'include'
  }

  async #request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(
      init.headers,
    )

    if (!headers.has('accept')) {
      headers.set(
        'accept',
        'application/json',
      )
    }

    if (
      init.body !== undefined &&
      init.body !== null &&
      !headers.has('content-type')
    ) {
      headers.set(
        'content-type',
        'application/json',
      )
    }

    const response = await this.#fetch(
      `${this.#baseUrl}${path}`,
      {
        ...init,
        headers,
        credentials: this.#credentials,
      },
    )

    if (!response.ok) {
      const body = await readBody(
        response,
      )

      throw new AgentServerHttpError({
        status: response.status,
        method:
          init.method?.toUpperCase() ??
          'GET',
        path,
        detail: errorDetail(body),
        body,
      })
    }

    return response
  }

  async #json(
    path: string,
    init: RequestInit = {},
  ): Promise<{
    readonly response: Response
    readonly body: unknown
  }> {
    const response = await this.#request(
      path,
      init,
    )

    return {
      response,
      body: await readBody(response),
    }
  }

  async searchAssistants(
    options: SearchOptions = {},
  ): Promise<SearchPage<Assistant>> {
    const { response, body } =
      await this.#json(
        '/assistants/search',
        {
          method: 'POST',
          body: JSON.stringify({
            limit: options.limit ?? 20,
            offset: options.offset ?? 0,
          }),
        },
      )

    return {
      items: decodeArray(
        body,
        decodeAssistantDto,
        'AssistantSearchResponse',
      ).map(mapAssistant),
      total: paginationTotal(response),
    }
  }

  async getAssistant(
    id: AssistantId,
  ): Promise<Assistant> {
    const { body } = await this.#json(
      `/assistants/${encodeURIComponent(id)}`,
    )

    return mapAssistant(
      decodeAssistantDto(body),
    )
  }

  async createThread(
    input: CreateThreadInput = {},
  ): Promise<Thread> {
    const { body } = await this.#json(
      '/threads',
      {
        method: 'POST',
        body: JSON.stringify({
          metadata: input.metadata,
        }),
      },
    )

    return mapThread(
      decodeThreadDto(body),
    )
  }

  async searchThreads(
    options: SearchOptions = {},
  ): Promise<SearchPage<Thread>> {
    const { response, body } =
      await this.#json(
        '/threads/search',
        {
          method: 'POST',
          body: JSON.stringify({
            limit: options.limit ?? 20,
            offset: options.offset ?? 0,
          }),
        },
      )

    return {
      items: decodeArray(
        body,
        decodeThreadDto,
        'ThreadSearchResponse',
      ).map(mapThread),
      total: paginationTotal(response),
    }
  }

  async getThread(
    id: ThreadId,
  ): Promise<Thread> {
    const { body } = await this.#json(
      `/threads/${encodeURIComponent(id)}`,
    )

    return mapThread(
      decodeThreadDto(body),
    )
  }

  async deleteThread(
    id: ThreadId,
  ): Promise<void> {
    await this.#request(
      `/threads/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
    )
  }

  async createRun(
    id: ThreadId,
    input: CreateRunInput,
  ): Promise<Run> {
    const { body } = await this.#json(
      `/threads/${encodeURIComponent(id)}/runs`,
      {
        method: 'POST',
        body: JSON.stringify({
          assistant_id:
            input.assistantId,
          input: input.input,
          metadata: input.metadata,
          multitask_strategy:
            input.multitaskStrategy,
        }),
      },
    )

    return mapRun(
      decodeRunDto(body),
    )
  }

  /**
   * Creates a distinct stateful Run carrying Command.resume.
   * Does not inspect ThreadState, deduplicate, retry, or confirm graph END.
   * A lost POST response is ambiguous: the caller must reconcile manually.
   */
  async createResumeRun(
    id: ThreadId,
    input: CreateResumeRunInput,
  ): Promise<Run> {
    assertResumeJson(input.resumeValue)

    const { body } = await this.#json(
      `/threads/${encodeURIComponent(id)}/runs`,
      {
        method: 'POST',
        body: JSON.stringify({
          assistant_id: input.assistantId,
          input: {},
          command: { resume: input.resumeValue },
          metadata: input.metadata,
          multitask_strategy: 'reject',
        }),
      },
    )
    const run = mapRun(decodeRunDto(body))
    if (run.threadId !== id) {
      throw new AgentServerDecodeError(
        'Run.thread_id', `matching target Thread ${id}`,
      )
    }
    if (run.assistantId !== input.assistantId) {
      throw new AgentServerDecodeError(
        'Run.assistant_id', 'matching requested Assistant',
      )
    }
    return run
  }

  async openRunStream(
    id: ThreadId,
    input: StreamRunInput,
  ): Promise<RunStreamSession> {
    const path =
      `/threads/${encodeURIComponent(id)}/runs/stream`

    const response =
      await this.#request(
        path,
        {
          method: 'POST',

          headers: {
            accept:
              'text/event-stream',
          },

          body: JSON.stringify({
            assistant_id:
              input.assistantId,

            input:
              input.input,

            metadata:
              input.metadata,

            multitask_strategy:
              input.multitaskStrategy,

            stream_mode:
              input.streamMode,

            stream_resumable:
              input.streamResumable,

            stream_subgraphs:
              input.streamSubgraphs,

            on_disconnect:
              input.onDisconnect,
          }),

          signal:
            input.signal,
        },
      )

    return createRunStreamSession({
      baseUrl:
        this.#baseUrl,

      threadId:
        id,

      response,

      reconnect:
        async ({
          path:
            streamPath,

          lastEventId,

          signal,
        }) => {
          const headers =
            new Headers({
              accept:
                'text/event-stream',
            })

          if (
            lastEventId !== null
          ) {
            headers.set(
              'last-event-id',
              lastEventId,
            )
          }

          return this.#request(
            streamPath,
            {
              method: 'GET',
              headers,
              signal,
            },
          )
        },
    })
  }


  async *streamRun(
    id: ThreadId,
    input: StreamRunInput,
  ): AsyncGenerator<
    AgentServerStreamEvent,
    void,
    undefined
  > {
    const session =
      await this.openRunStream(
        id,
        input,
      )

    yield* session.events()
  }


  async listRuns(
    id: ThreadId,
    options: ListRunsOptions = {},
  ): Promise<readonly Run[]> {
    const query = queryString({
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
      status: options.status,
    })

    const { body } = await this.#json(
      `/threads/${encodeURIComponent(id)}/runs${query}`,
    )

    return decodeArray(
      body,
      decodeRunDto,
      'RunListResponse',
    ).map(mapRun)
  }

  async getRun(
    thread: ThreadId,
    run: RunId,
  ): Promise<Run> {
    const { body } = await this.#json(
      `/threads/${encodeURIComponent(thread)}` +
      `/runs/${encodeURIComponent(run)}`,
    )

    return mapRun(
      decodeRunDto(body),
    )
  }

  async getThreadState(
    id: ThreadId,
  ): Promise<ThreadState> {
    const { body } = await this.#json(
      `/threads/${encodeURIComponent(id)}/state`,
    )

    return mapThreadState(
      decodeThreadStateDto(body),
      id,
    )
  }

  async updateThreadState(
    id: ThreadId,
    input: UpdateThreadStateInput,
  ): Promise<UpdateThreadStateResult> {
    if (
      input.checkpoint !== undefined &&
      input.checkpoint.threadId !== id
    ) {
      throw new TypeError(
        'Checkpoint threadId must match the target Thread',
      )
    }

    const checkpoint = input.checkpoint

    const { body } = await this.#json(
      `/threads/${encodeURIComponent(id)}/state`,
      {
        method: 'POST',
        body: JSON.stringify({
          values: input.values,
          checkpoint: checkpoint === undefined
            ? undefined
            : {
                thread_id: checkpoint.threadId,
                checkpoint_id: checkpoint.checkpointId,
                checkpoint_ns: checkpoint.namespace,
                checkpoint_map: { ...checkpoint.checkpointMap },
              },
          as_node: input.asNode,
        }),
      },
    )

    return mapThreadStateUpdateResponse(
      decodeThreadStateUpdateResponseDto(body),
      id,
    )
  }
}
