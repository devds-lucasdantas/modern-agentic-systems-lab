import {
  StrictMode,
} from 'react'

import {
  createRoot,
} from 'react-dom/client'

import './index.css'

import App from './App'

import {
  AppConfigError,
  readAppConfig,
} from './app/config'

import {
  RuntimeProvider,
} from './app/runtime-provider'

const rootElement =
  document.getElementById('root')

if (rootElement === null) {
  throw new Error(
    'Root element was not found',
  )
}

const root =
  createRoot(rootElement)

try {
  const config =
    readAppConfig()

  root.render(
    <StrictMode>
      <RuntimeProvider
        config={config}
      >
        <App />
      </RuntimeProvider>
    </StrictMode>,
  )
} catch (error) {
  const message =
    error instanceof AppConfigError
      ? error.message
      : 'Unexpected application configuration error'

  root.render(
    <StrictMode>
      <main className="configuration-error">
        <span className="eyebrow">
          Configuration error
        </span>

        <h1>
          Runtime connection is not configured.
        </h1>

        <p>
          {message}
        </p>

        <code>
          VITE_AGENT_SERVER_URL
        </code>
      </main>
    </StrictMode>,
  )
}
