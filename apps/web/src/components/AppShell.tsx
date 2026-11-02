import type {
  Assistant,
  Thread,
} from '../domain'

import {
  useRuntime,
} from '../app/use-runtime'

import {
  useRuntimeOverview,
} from '../app/use-runtime-overview'

import {
  ExecutionSurface,
} from './ExecutionSurface'

const shortId = (
  value: string,
): string =>
  value.length <= 16
    ? value
    : `${value.slice(0, 8)}…${value.slice(-6)}`

const formatTimestamp = (
  value: string | null,
): string => {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    },
  ).format(date)
}

function AssistantRow({
  assistant,
}: {
  readonly assistant: Assistant
}) {
  return (
    <article className="resource-row">
      <div>
        <strong>
          {assistant.name ??
            'Unnamed assistant'}
        </strong>

        <span className="resource-id">
          {shortId(assistant.id)}
        </span>
      </div>

      <div className="resource-meta">
        <span>
          graph {assistant.graphId}
        </span>

        <span>
          updated{' '}
          {formatTimestamp(
            assistant.updatedAt,
          )}
        </span>
      </div>
    </article>
  )
}

function ThreadRow({
  thread,
}: {
  readonly thread: Thread
}) {
  return (
    <article className="resource-row">
      <div>
        <strong>
          {shortId(thread.id)}
        </strong>

        <span
          className="status-pill"
          data-status={thread.status}
        >
          {thread.status}
        </span>
      </div>

      <div className="resource-meta">
        <span>
          updated{' '}
          {formatTimestamp(
            thread.updatedAt,
          )}
        </span>
      </div>
    </article>
  )
}

export function AppShell() {
  const { config } =
    useRuntime()

  const {
    status,
    assistants,
    threads,
    assistantTotal,
    threadTotal,
    error,
    refresh,
  } = useRuntimeOverview()

  const connected =
    status === 'ready'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            MAS
          </div>

          <div>
            <strong>
              Agentic Systems
            </strong>

            <span>
              Runtime Lab
            </span>
          </div>
        </div>

        <nav
          className="navigation"
          aria-label="Primary"
        >
          <a
            className="nav-item active"
            href="#overview"
          >
            Overview
          </a>

          <a
            className="nav-item"
            href="#assistants"
          >
            Assistants
          </a>

          <a
            className="nav-item"
            href="#threads"
          >
            Threads
          </a>

          <a
            className="nav-item"
            href="#execution"
          >
            Execution
          </a>

          <span
            className="nav-item disabled"
            aria-disabled="true"
          >
            Streaming
            <small>
              2.2
            </small>
          </span>
        </nav>

        <div className="phase-card">
          <span className="eyebrow">
            Current phase
          </span>

          <strong>
            2.2D
          </strong>

          <span>
            Message and state projection
          </span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">
              Phase 2 · Agent ↔ UI
            </span>

            <h1>
              Runtime overview
            </h1>

            <p>
              Observe Runtime resources
              without collapsing them into
              chat state.
            </p>
          </div>

          <div className="topbar-actions">
            <span
              className="connection-status"
              data-connected={connected}
            >
              <span
                className="connection-dot"
              />

              {status === 'loading'
                ? 'Connecting'
                : connected
                  ? 'Connected'
                  : 'Unavailable'}
            </span>

            <button
              type="button"
              className="refresh-button"
              onClick={() => {
                void refresh()
              }}
              disabled={
                status === 'loading'
              }
            >
              Refresh
            </button>
          </div>
        </header>

        <section
          id="overview"
          className="runtime-endpoint"
        >
          <span className="eyebrow">
            Agent Server
          </span>

          <code>
            {config.agentServerUrl}
          </code>
        </section>

        {error !== null && (
          <section
            className="error-banner"
            role="alert"
          >
            <strong>
              Runtime request failed
            </strong>

            <span>
              {error.message}
            </span>
          </section>
        )}

        <section
          className="summary-grid"
          aria-live="polite"
        >
          <article className="summary-card">
            <span>
              Assistants
            </span>

            <strong>
              {assistantTotal ??
                assistants.length}
            </strong>

            <small>
              configured graph identities
            </small>
          </article>

          <article className="summary-card">
            <span>
              Threads
            </span>

            <strong>
              {threadTotal ??
                threads.length}
            </strong>

            <small>
              persistent execution contexts
            </small>
          </article>

          <article className="summary-card">
            <span>
              Loaded
            </span>

            <strong>
              {threads.length}
            </strong>

            <small>
              Threads in current projection
            </small>
          </article>

          <article className="summary-card">
            <span>
              Transport
            </span>

            <strong className="transport-name">
              REST + SSE
            </strong>

            <small>
              REST resources + SSE execution
            </small>
          </article>
        </section>

        <div className="resource-grid">
          <section
            id="assistants"
            className="resource-panel"
          >
            <header>
              <div>
                <span className="eyebrow">
                  Runtime resource
                </span>

                <h2>
                  Assistants
                </h2>
              </div>

              <span className="count-badge">
                {assistants.length}
              </span>
            </header>

            <div className="resource-list">
              {status === 'loading' &&
              assistants.length === 0 ? (
                <div className="empty-state">
                  Loading assistants…
                </div>
              ) : assistants.length === 0 ? (
                <div className="empty-state">
                  No assistants found.
                </div>
              ) : (
                assistants.map(
                  (assistant) => (
                    <AssistantRow
                      key={assistant.id}
                      assistant={
                        assistant
                      }
                    />
                  ),
                )
              )}
            </div>
          </section>

          <section
            id="threads"
            className="resource-panel"
          >
            <header>
              <div>
                <span className="eyebrow">
                  Runtime resource
                </span>

                <h2>
                  Threads
                </h2>
              </div>

              <span className="count-badge">
                {threads.length}
              </span>
            </header>

            <div className="resource-list">
              {status === 'loading' &&
              threads.length === 0 ? (
                <div className="empty-state">
                  Loading threads…
                </div>
              ) : threads.length === 0 ? (
                <div className="empty-state">
                  No threads found.
                </div>
              ) : (
                threads.map(
                  (thread) => (
                    <ThreadRow
                      key={thread.id}
                      thread={thread}
                    />
                  ),
                )
              )}
            </div>
          </section>
        </div>

        <ExecutionSurface
          assistants={assistants}
          threads={threads}
          onRuntimeChanged={refresh}
        />
      </main>
    </div>
  )
}
