export interface SseEvent {
  /**
   * Effective SSE last-event ID at dispatch time.
   *
   * SSE id fields update a connection-level buffer, so an event
   * without its own id field can inherit the previous value.
   */
  readonly id: string | null

  /**
   * Explicit SSE event field.
   *
   * null means that no event field was supplied.
   */
  readonly event: string | null

  /**
   * All data fields joined with LF as required by SSE framing.
   */
  readonly data: string

  /**
   * A valid retry field observed in this event block.
   *
   * Connection retry policy is intentionally not implemented here.
   */
  readonly retry: number | null
}

interface PendingSseEvent {
  event: string | null
  dataLines: string[]
  retry: number | null
}

const newPendingEvent = (): PendingSseEvent => ({
  event: null,
  dataLines: [],
  retry: null,
})

interface LineResult {
  readonly line: string
  readonly rest: string
}

const takeLine = (
  buffer: string,
  eof: boolean,
): LineResult | null => {
  for (
    let index = 0;
    index < buffer.length;
    index += 1
  ) {
    const character =
      buffer[index]

    if (character === '\n') {
      return {
        line:
          buffer.slice(
            0,
            index,
          ),

        rest:
          buffer.slice(
            index + 1,
          ),
      }
    }

    if (character !== '\r') {
      continue
    }

    if (
      index + 1 >= buffer.length
    ) {
      if (!eof) {
        return null
      }

      return {
        line:
          buffer.slice(
            0,
            index,
          ),

        rest: '',
      }
    }

    const next =
      buffer[index + 1]

    const width =
      next === '\n'
        ? 2
        : 1

    return {
      line:
        buffer.slice(
          0,
          index,
        ),

      rest:
        buffer.slice(
          index + width,
        ),
    }
  }

  if (
    eof &&
    buffer.length > 0
  ) {
    return {
      line: buffer,
      rest: '',
    }
  }

  return null
}

const fieldAndValue = (
  line: string,
): readonly [
  field: string,
  value: string,
] => {
  const separator =
    line.indexOf(':')

  if (separator < 0) {
    return [
      line,
      '',
    ]
  }

  const field =
    line.slice(
      0,
      separator,
    )

  let value =
    line.slice(
      separator + 1,
    )

  if (
    value.startsWith(' ')
  ) {
    value =
      value.slice(1)
  }

  return [
    field,
    value,
  ]
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent, void, undefined> {
  const reader =
    stream.getReader()

  const decoder =
    new TextDecoder()

  let textBuffer = ''
  let pending =
    newPendingEvent()

  let lastEventId:
    string | null = null

  const consumeLine = (
    line: string,
  ): SseEvent | null => {
    if (line === '') {
      if (
        pending.dataLines.length === 0
      ) {
        pending =
          newPendingEvent()

        return null
      }

      const event: SseEvent = {
        id: lastEventId,
        event: pending.event,
        data:
          pending.dataLines.join(
            '\n',
          ),
        retry: pending.retry,
      }

      pending =
        newPendingEvent()

      return event
    }

    // SSE comments / heartbeat lines.
    if (
      line.startsWith(':')
    ) {
      return null
    }

    const [
      field,
      value,
    ] = fieldAndValue(line)

    switch (field) {
      case 'event':
        pending.event = value
        break

      case 'data':
        pending.dataLines.push(
          value,
        )
        break

      case 'id':
        // The SSE specification ignores IDs containing U+0000.
        if (
          !value.includes('\0')
        ) {
          lastEventId = value
        }
        break

      case 'retry':
        if (
          /^[0-9]+$/.test(value)
        ) {
          pending.retry =
            Number(value)
        }
        break

      default:
        // Unknown SSE fields are ignored at the framing layer.
        break
    }

    return null
  }

  const drainLines = (
    eof: boolean,
  ): SseEvent[] => {
    const output:
      SseEvent[] = []

    while (true) {
      const result =
        takeLine(
          textBuffer,
          eof,
        )

      if (result === null) {
        break
      }

      textBuffer =
        result.rest

      const event =
        consumeLine(
          result.line,
        )

      if (event !== null) {
        output.push(event)
      }

      if (
        eof &&
        textBuffer.length === 0
      ) {
        break
      }
    }

    return output
  }

  try {
    while (true) {
      const {
        done,
        value,
      } = await reader.read()

      if (done) {
        break
      }

      textBuffer +=
        decoder.decode(
          value,
          {
            stream: true,
          },
        )

      for (
        const event
        of drainLines(false)
      ) {
        yield event
      }
    }

    textBuffer +=
      decoder.decode()

    for (
      const event
      of drainLines(true)
    ) {
      yield event
    }

    /*
     * Robust fetch-stream behavior:
     *
     * If EOF arrives after a complete data field but without the
     * protocol's usual final blank line, emit the pending record.
     *
     * This is an explicit client policy rather than reliance on
     * EventSource browser behavior.
     */
    if (
      pending.dataLines.length > 0
    ) {
      yield {
        id: lastEventId,
        event: pending.event,
        data:
          pending.dataLines.join(
            '\n',
          ),
        retry: pending.retry,
      }
    }
  } finally {
    reader.releaseLock()
  }
}
