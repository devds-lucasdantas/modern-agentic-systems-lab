import {
  runId,
  type RunId,
  type ThreadId,
} from '../../domain'

import {
  AgentServerDecodeError,
} from './errors'

import {
  decodeAgentServerStreamEvent,
  type AgentServerStreamEvent,
} from './stream-events'

import {
  parseSseStream,
} from './sse'


export interface RunStreamReconnectOptions {
  readonly signal?: AbortSignal
}


export interface RunStreamSession {
  readonly threadId:
    ThreadId

  /**
   * Runtime identity.
   *
   * When Location is visible to JavaScript this is available
   * immediately after the initial POST.
   *
   * Cross-origin browser deployments may hide Location unless
   * the server exposes it through CORS. In that case identity
   * becomes available from the first metadata.run_id event.
   */
  readonly runId:
    RunId | null

  /**
   * Absolute resumable stream URL.
   *
   * Like runId, this can initially be null when the browser
   * cannot read the Location response header.
   */
  readonly streamUrl:
    string | null

  /**
   * Last SSE-ID group proven to have been fully observed.
   */
  readonly committedLastEventId:
    string | null

  /**
   * SSE ID currently being observed but not yet proven complete.
   */
  readonly currentEventId:
    string | null

  events(): AsyncGenerator<
    AgentServerStreamEvent,
    void,
    undefined
  >

  reconnect(
    options?:
      RunStreamReconnectOptions,
  ): Promise<void>
}


interface ReconnectRequest {
  readonly path:
    string

  readonly lastEventId:
    string | null

  readonly signal?:
    AbortSignal
}


interface CreateRunStreamSessionInput {
  readonly baseUrl:
    string

  readonly threadId:
    ThreadId

  readonly response:
    Response

  readonly reconnect:
    (
      request:
        ReconnectRequest,
    ) => Promise<Response>
}


interface StreamIdentity {
  readonly runId:
    RunId

  readonly streamUrl:
    string

  readonly streamPath:
    string
}


const isObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value)


const assertEventStreamResponse = (
  response: Response,
  context: string,
): void => {
  const contentType =
    response.headers.get(
      'content-type',
    )

  if (
    contentType === null ||
    !contentType
      .toLowerCase()
      .startsWith(
        'text/event-stream',
      )
  ) {
    throw new AgentServerDecodeError(
      `${context}.content-type`,
      'text/event-stream',
    )
  }

  if (response.body === null) {
    throw new AgentServerDecodeError(
      `${context}.body`,
      'ReadableStream<Uint8Array>',
    )
  }
}


const streamIdentityFromLocation = (
  baseUrl: string,
  expectedThreadId: ThreadId,
  response: Response,
): StreamIdentity | null => {
  const location =
    response.headers.get(
      'location',
    )

  /*
   * Location is not a CORS-safelisted response header.
   *
   * A cross-origin browser therefore sees null unless the
   * Agent Server explicitly exposes it.
   *
   * This is not a malformed Runtime response. Identity can
   * still be learned from metadata.run_id.
   */
  if (location === null) {
    return null
  }

  let base:
    URL

  let streamUrl:
    URL

  try {
    base =
      new URL(baseUrl)

    streamUrl =
      new URL(
        location,
        `${baseUrl}/`,
      )
  } catch {
    throw new AgentServerDecodeError(
      'RunStream.response.location',
      'valid resumable stream URL',
    )
  }

  if (
    streamUrl.origin !==
    base.origin
  ) {
    throw new AgentServerDecodeError(
      'RunStream.response.location',
      'same-origin resumable stream URL',
    )
  }

  const match =
    streamUrl.pathname.match(
      /\/threads\/([^/]+)\/runs\/([^/]+)\/stream\/?$/,
    )

  if (
    match === null ||
    match[1] === undefined ||
    match[2] === undefined
  ) {
    throw new AgentServerDecodeError(
      'RunStream.response.location',
      '/threads/{thread_id}/runs/{run_id}/stream',
    )
  }

  let locationThreadId:
    string

  let locationRunId:
    string

  try {
    locationThreadId =
      decodeURIComponent(
        match[1],
      )

    locationRunId =
      decodeURIComponent(
        match[2],
      )
  } catch {
    throw new AgentServerDecodeError(
      'RunStream.response.location',
      'percent-decodable Runtime identity',
    )
  }

  if (
    locationThreadId !==
    expectedThreadId
  ) {
    throw new AgentServerDecodeError(
      'RunStream.response.location.thread_id',
      'requested Thread identity',
    )
  }

  return {
    runId:
      runId(
        locationRunId,
      ),

    streamUrl:
      streamUrl.toString(),

    streamPath:
      `${streamUrl.pathname}${streamUrl.search}`,
  }
}


const metadataRunId = (
  event: AgentServerStreamEvent,
): string | null => {
  if (
    event.kind !== 'known' ||
    event.event !== 'metadata' ||
    !isObject(event.data) ||
    typeof event.data.run_id !==
      'string'
  ) {
    return null
  }

  return event.data.run_id
}


class AgentServerRunStreamSession
implements RunStreamSession {
  readonly threadId:
    ThreadId

  readonly #baseUrl:
    string

  readonly #reconnect:
    CreateRunStreamSessionInput[
      'reconnect'
    ]

  #runId:
    RunId | null = null

  #streamUrl:
    string | null = null

  #streamPath:
    string | null = null

  #response:
    Response | null

  #committedLastEventId:
    string | null = null

  #currentEventId:
    string | null = null


  constructor(
    input:
      CreateRunStreamSessionInput,
  ) {
    assertEventStreamResponse(
      input.response,
      'RunStream.response',
    )

    this.threadId =
      input.threadId

    this.#baseUrl =
      input.baseUrl

    this.#reconnect =
      input.reconnect

    this.#response =
      input.response

    const identity =
      streamIdentityFromLocation(
        input.baseUrl,
        input.threadId,
        input.response,
      )

    if (identity !== null) {
      this.#runId =
        identity.runId

      this.#streamUrl =
        identity.streamUrl

      this.#streamPath =
        identity.streamPath
    }
  }


  get runId():
    RunId | null {
    return this.#runId
  }


  get streamUrl():
    string | null {
    return this.#streamUrl
  }


  get committedLastEventId():
    string | null {
    return (
      this.#committedLastEventId
    )
  }


  get currentEventId():
    string | null {
    return this.#currentEventId
  }


  #acceptRunId(
    value: string,
  ): void {
    if (
      this.#runId !== null
    ) {
      if (
        this.#runId !== value
      ) {
        throw new AgentServerDecodeError(
          'RunStream.event.metadata.run_id',
          'Run identity matching HTTP Location or previous metadata',
        )
      }

      return
    }

    const discoveredRunId =
      runId(
        value,
      )

    const streamPath =
      `/threads/${encodeURIComponent(
        this.threadId,
      )}/runs/${encodeURIComponent(
        discoveredRunId,
      )}/stream`

    this.#runId =
      discoveredRunId

    this.#streamPath =
      streamPath

    this.#streamUrl =
      new URL(
        streamPath,
        `${this.#baseUrl}/`,
      ).toString()
  }


  #observeEventId(
    id: string | null,
  ): void {
    if (
      id === null ||
      id === ''
    ) {
      return
    }

    if (
      this.#currentEventId ===
      null
    ) {
      this.#currentEventId =
        id

      return
    }

    if (
      id ===
      this.#currentEventId
    ) {
      return
    }

    /*
     * Seeing a different next ID proves that the previous ID
     * group was completely observed on this connection.
     */
    this.#committedLastEventId =
      this.#currentEventId

    this.#currentEventId =
      id
  }


  async *events(): AsyncGenerator<
    AgentServerStreamEvent,
    void,
    undefined
  > {
    const response =
      this.#response

    if (response === null) {
      throw new Error(
        'Run stream has no active connection; reconnect before consuming events',
      )
    }

    if (response.body === null) {
      throw new AgentServerDecodeError(
        'RunStream.response.body',
        'ReadableStream<Uint8Array>',
      )
    }

    /*
     * A Response body may only be consumed once.
     */
    this.#response = null

    let reachedNaturalEof =
      false

    try {
      for await (
        const frame
        of parseSseStream(
          response.body,
        )
      ) {
        this.#observeEventId(
          frame.id,
        )

        const event =
          decodeAgentServerStreamEvent(
            frame,
          )

        const inBandRunId =
          metadataRunId(
            event,
          )

        if (
          inBandRunId !== null
        ) {
          this.#acceptRunId(
            inBandRunId,
          )
        }

        yield event
      }

      reachedNaturalEof =
        true
    } finally {
      /*
       * Natural EOF proves that the final ID group is complete.
       *
       * Abort, network failure or consumer break does not.
       */
      if (
        reachedNaturalEof &&
        this.#currentEventId !==
          null
      ) {
        this.#committedLastEventId =
          this.#currentEventId
      }
    }
  }


  async reconnect(
    options:
      RunStreamReconnectOptions = {},
  ): Promise<void> {
    if (
      this.#streamPath === null ||
      this.#runId === null
    ) {
      throw new Error(
        'Run stream cannot reconnect before Runtime identity is known; Location was unavailable and metadata.run_id was not observed',
      )
    }

    const response =
      await this.#reconnect({
        path:
          this.#streamPath,

        lastEventId:
          this.#committedLastEventId,

        signal:
          options.signal,
      })

    assertEventStreamResponse(
      response,
      'RunStream.reconnect.response',
    )

    /*
     * An interrupted current group was not trustworthy.
     *
     * Replay starts again after the last committed group.
     */
    this.#currentEventId =
      null

    this.#response =
      response
  }
}


export const createRunStreamSession = (
  input:
    CreateRunStreamSessionInput,
): RunStreamSession =>
  new AgentServerRunStreamSession(
    input,
  )
