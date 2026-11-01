export class AgentServerDecodeError extends Error {
  readonly path: string

  constructor(
    path: string,
    expected: string,
  ) {
    super(`Invalid Agent Server payload at ${path}: expected ${expected}`)
    this.name = 'AgentServerDecodeError'
    this.path = path
  }
}

export class AgentServerHttpError extends Error {
  readonly status: number
  readonly method: string
  readonly path: string
  readonly detail: string | null
  readonly body: unknown

  constructor(options: {
    status: number
    method: string
    path: string
    detail: string | null
    body: unknown
  }) {
    const detail = options.detail
      ? `: ${options.detail}`
      : ''

    super(
      `Agent Server ${options.method} ${options.path} failed ` +
      `with HTTP ${options.status}${detail}`,
    )

    this.name = 'AgentServerHttpError'
    this.status = options.status
    this.method = options.method
    this.path = options.path
    this.detail = options.detail
    this.body = options.body
  }
}
