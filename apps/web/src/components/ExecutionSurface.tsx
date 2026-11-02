import {
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'

import {
  assistantId,
  threadId,
  type Assistant,
  type AssistantId,
  type Thread,
  type ThreadId,
} from '../domain'

import {
  useExecution,
} from '../execution/use-execution'

import {
  MessageList,
} from './MessageList'

const shortId = (
  value: string,
): string =>
  value.length <= 18
    ? value
    : `${value.slice(0, 8)}…${value.slice(-6)}`

const busyPhases =
  new Set([
    'creating-thread',
    'creating-run',
    'streaming',
    'reconnecting-stream',
    'reconciling-run',
    'refreshing-state',
  ])

export interface ExecutionSurfaceProps {
  readonly assistants:
    readonly Assistant[]

  readonly threads:
    readonly Thread[]

  readonly onRuntimeChanged:
    () => Promise<void>
}

export function ExecutionSurface({
  assistants,
  threads,
  onRuntimeChanged,
}: ExecutionSurfaceProps) {
  const [
    selectedAssistant,
    setSelectedAssistant,
  ] = useState<
    AssistantId | ''
  >('')

  const [
    selectedThread,
    setSelectedThread,
  ] = useState<
    ThreadId | ''
  >('')

  const [
    text,
    setText,
  ] = useState('')

    const {
      phase,
      runId,
      run,
      state,
      messages,
      error,
      execute,
      loadThreadState,
      reset,
    } = useExecution()

  const effectiveAssistant =
    selectedAssistant ||
    assistants[0]?.id ||
    ''

    const busy =
      busyPhases.has(phase)

    const displayedRunId =
      runId ??
      run?.id ??
      null

  const handleAssistantChange = (
    event:
      ChangeEvent<HTMLSelectElement>,
  ) => {
    setSelectedAssistant(
      assistantId(
        event.target.value,
      ),
    )
  }

  const handleThreadChange =
    async (
      event:
        ChangeEvent<HTMLSelectElement>,
    ) => {
      const value =
        event.target.value

      if (!value) {
        setSelectedThread('')
        reset()
        return
      }

      const id =
        threadId(value)

      setSelectedThread(id)

      try {
        await loadThreadState(id)
      } catch {
        // Error state is already owned by useExecution.
      }
    }

  const handleSubmit =
    async (
      event: FormEvent,
    ) => {
      event.preventDefault()

      if (
        !effectiveAssistant ||
        !text.trim() ||
        busy
      ) {
        return
      }

      try {
        const activeThread =
          await execute({
            assistantId:
              assistantId(
                effectiveAssistant,
              ),

            threadId:
              selectedThread ||
              null,

            text,
          })

        setSelectedThread(
          activeThread,
        )

        setText('')

        await onRuntimeChanged()
      } catch {
        // Error state is already owned by useExecution.
      }
    }

  return (
    <section
      id="execution"
      className="execution-panel"
    >
      <header className="execution-header">
        <div>
          <span className="eyebrow">
            Runtime execution
          </span>

          <h2>
              Streaming execution surface
          </h2>

          <p>
              Runs execute through SSE streaming,
              then reconcile lifecycle and persisted
              Thread state through REST.
          </p>
        </div>

        <span
          className="execution-phase"
          data-phase={phase}
        >
          {phase}
        </span>
      </header>

      <div className="execution-layout">
        <form
          className="execution-controls"
          onSubmit={(event) => {
            void handleSubmit(event)
          }}
        >
          <label>
            <span>
              Assistant
            </span>

            <select
              value={
                effectiveAssistant
              }
              onChange={
                handleAssistantChange
              }
              disabled={
                assistants.length === 0 ||
                busy
              }
            >
              {assistants.map(
                (assistant) => (
                  <option
                    value={assistant.id}
                    key={assistant.id}
                  >
                    {assistant.name ??
                      assistant.id}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>
              Thread
            </span>

            <select
              value={selectedThread}
              onChange={(event) => {
                void handleThreadChange(
                  event,
                )
              }}
              disabled={busy}
            >
              <option value="">
                New Thread on submit
              </option>

              {threads.map(
                (thread) => (
                  <option
                    value={thread.id}
                    key={thread.id}
                  >
                    {shortId(thread.id)}
                    {' · '}
                    {thread.status}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>
              User input
            </span>

            <textarea
              rows={5}
              value={text}
              disabled={busy}
              placeholder="Send one input to the selected Assistant…"
              onChange={(event) => {
                setText(
                  event.target.value,
                )
              }}
            />
          </label>

          <button
            className="execute-button"
            type="submit"
            disabled={
              busy ||
              !effectiveAssistant ||
              !text.trim()
            }
          >
            {busy
              ? 'Executing…'
              : 'Create Run'}
          </button>

          {error !== null && (
            <div
              className="execution-error"
              role="alert"
            >
              <strong>
                Execution failed
              </strong>

              <span>
                {error.message}
              </span>
            </div>
          )}
        </form>

        <div className="execution-state">
          <div className="execution-facts">
            <article>
              <span>
                Run
              </span>

              <strong>
                  {displayedRunId === null
                    ? '—'
                    : shortId(
                        displayedRunId,
                      )}
              </strong>
            </article>

            <article>
              <span>
                Run status
              </span>

              <strong>
                {run?.status ?? '—'}
              </strong>
            </article>

            <article>
              <span>
                Graph next
              </span>

              <strong>
                {state === null
                  ? '—'
                  : state.position.next
                      .length === 0
                    ? 'END'
                    : state.position.next
                        .join(', ')}
              </strong>
            </article>

            <article>
              <span>
                Checkpoint
              </span>

              <strong>
                {state?.checkpoint === null ||
                state === null
                  ? '—'
                  : shortId(
                      state.checkpoint
                        .checkpointId,
                    )}
              </strong>
            </article>
          </div>

          <div className="execution-invariant">
            <span>
              Runtime invariant
            </span>

            <code>
              Run status ≠ graph position
            </code>
          </div>

          <MessageList
            messages={messages}
          />
        </div>
      </div>
    </section>
  )
}
