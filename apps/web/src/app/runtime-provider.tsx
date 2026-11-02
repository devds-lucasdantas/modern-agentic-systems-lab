import {
  useMemo,
  type ReactNode,
} from 'react'

import {
  AgentServerClient,
} from '../transport/agent-server'

import type {
  AppConfig,
} from './config'

import {
  RuntimeContext,
} from './runtime-context'

export interface RuntimeProviderProps {
  readonly config: AppConfig
  readonly children: ReactNode
}

export function RuntimeProvider({
  config,
  children,
}: RuntimeProviderProps) {
  const client = useMemo(
    () =>
      new AgentServerClient({
        baseUrl:
          config.agentServerUrl,
      }),
    [config.agentServerUrl],
  )

  const value = useMemo(
    () => ({
      config,
      client,
    }),
    [
      config,
      client,
    ],
  )

  return (
    <RuntimeContext.Provider
      value={value}
    >
      {children}
    </RuntimeContext.Provider>
  )
}
