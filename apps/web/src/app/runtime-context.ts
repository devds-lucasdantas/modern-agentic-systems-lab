import {
  createContext,
} from 'react'

import type {
  AppConfig,
} from './config'

import type {
  AgentServerClient,
} from '../transport/agent-server'

export interface RuntimeServices {
  readonly config: AppConfig
  readonly client: AgentServerClient
}

export const RuntimeContext =
  createContext<RuntimeServices | null>(
    null,
  )
