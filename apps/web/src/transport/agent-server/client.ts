import type {
  Assistant,
  AssistantId,
  Metadata,
  Run,
  RunId,
  RunStatus,
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
  isJsonObject,
} from './decode'
import { AgentServerHttpError } from './errors'
import {
  mapAssistant,
  mapRun,
  mapThread,
  mapThreadState,
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

export type MultitaskStrategy =
  | 'reject'
  | 'rollback'
  | 'interrupt'
  | 'enqueue'

export interface CreateRunInput {
  readonly assistantId: AssistantId
  readonly input?: unknown
  readonly metadata?: Metadata
  readonly multitaskStrategy?: MultitaskStrategy
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
      options.fetchImpl ?? fetch

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
}
