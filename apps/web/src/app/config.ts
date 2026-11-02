export interface AppConfig {
  readonly agentServerUrl: string
}

export interface AppEnvironment {
  readonly VITE_AGENT_SERVER_URL?: string
}

export class AppConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppConfigError'
  }
}

const normalizeAgentServerUrl = (
  value: string,
): string => {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new AppConfigError(
      'VITE_AGENT_SERVER_URL must be a valid URL',
    )
  }

  if (
    url.protocol !== 'http:' &&
    url.protocol !== 'https:'
  ) {
    throw new AppConfigError(
      'VITE_AGENT_SERVER_URL must use http or https',
    )
  }

  return url
    .toString()
    .replace(/\/+$/, '')
}

const viteEnvironment =
  (): AppEnvironment => ({
    VITE_AGENT_SERVER_URL:
      import.meta.env
        .VITE_AGENT_SERVER_URL,
  })

export const readAppConfig = (
  env: AppEnvironment =
    viteEnvironment(),
): AppConfig => {
  const raw =
    env.VITE_AGENT_SERVER_URL?.trim()

  if (!raw) {
    throw new AppConfigError(
      'VITE_AGENT_SERVER_URL is required',
    )
  }

  return {
    agentServerUrl:
      normalizeAgentServerUrl(raw),
  }
}
