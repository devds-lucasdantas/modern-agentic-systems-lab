import type { ThreadId, ThreadState } from '../domain'
import type { ProjectionAuthority } from '../execution/use-execution'
import { projectPersistedTools } from '../execution/tool-projection'

interface ToolObservationsPanelProps {
  readonly threadId: ThreadId | null
  readonly state: ThreadState | null
  readonly authority: ProjectionAuthority
}

const situationLabel = {
  unavailable: 'Unavailable or not initialized',
  'no-tool-calls': 'No tool calls in persisted messages',
  observed: 'Persisted tool calls observed',
  incomplete: 'Incomplete or ambiguous observations',
} as const

const statusLabel = {
  'result-observed': 'Matching ToolMessage observed',
  'error-observed': 'Explicit ToolMessage error observed',
  'no-result-observed': 'No matching ToolMessage observed',
  'duplicate-call-id': 'Duplicate tool call ID — ambiguous',
  'multiple-results': 'Multiple ToolMessages — ambiguous',
} as const

/** Purely read-only UI. Never gives tool-call controls or forwards raw payloads. */
export function ToolObservationsPanel({
  threadId, state, authority,
}: ToolObservationsPanelProps) {
  // A live or unreconciled SSE snapshot is not persisted ThreadState authority.
  const isPersisted = threadId !== null && state !== null &&
    state.threadId === threadId && authority === 'persisted'
  const view = isPersisted && state !== null ? projectPersistedTools(state) : null

  return (
    <section className="tool-observations-panel" role="region" aria-label="Tool observations">
      <header className="tool-observations-header">
        <div>
          <span className="eyebrow">2.5C · Frontend tools</span>
          <h3>Persisted tool observations</h3>
        </div>
        <span className="tool-observations-authority" data-tool-authority={view?.authority ?? 'unavailable'}>
          {view?.authority ?? 'not persisted'}
        </span>
      </header>
      <p className="tool-observations-muted">
        Read-only correlation of persisted AI tool calls and ToolMessages.
        It does not execute tools, authorize actions, or infer external side effects.
      </p>
      <dl className="tool-observations-facts">
        <div><dt>Situation</dt><dd data-tool-situation={view?.situation ?? 'unavailable'}>
          {view === null ? 'Not loaded from persisted state' : situationLabel[view.situation]}
        </dd></div>
        <div><dt>Checkpoint</dt><dd data-tool-checkpoint>
          {view?.checkpointId ?? '—'}
        </dd></div>
        <div><dt>Graph position</dt><dd data-tool-graph-position>
          {view === null ? 'Unknown' : view.graphAtEnd ? 'END' : 'Not END'}
        </dd></div>
        <div><dt>Calls / results</dt><dd data-tool-counts>
          {view === null ? '—' : `${view.callCount} / ${view.resultCount}`}
        </dd></div>
      </dl>
      {view !== null && (view.opaqueCount > 0 || view.orphanResultCount > 0 ||
        view.hiddenCallCount > 0) && (
        <p className="tool-observations-caution" data-tool-incomplete>
          Additional evidence excluded: {view.opaqueCount} opaque entries,{' '}
          {view.orphanResultCount} orphan results, {view.hiddenCallCount} hidden calls.
          No identity or outcome is inferred for excluded entries.
        </p>
      )}
      {view !== null && view.calls.length > 0 ? (
        <ol className="tool-observations-list" aria-label="Persisted tool calls">
          {view.calls.map((call, index) => (
            <li key={`${index}:${call.callId}`} className="tool-observations-call"
              data-tool-call-id={call.callId} data-tool-status={call.status}>
              <strong className="tool-observations-name">{call.name}</strong>
              <code className="tool-observations-id">{call.callId}</code>
              <span className="tool-observations-status">{statusLabel[call.status]}</span>
              <span className="tool-observations-muted">
                {call.matchingResultCount} correlated result(s)
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="tool-observations-muted" data-tool-empty>
          No displayable tool calls for this persisted observation.
        </p>
      )}
      <p className="tool-observations-footnote">
        Identifiers and tool names are validated and bounded. Arguments, tool output,
        arbitrary metadata and malformed entries are not shown in this panel.
        A matching result is not proof of authorization or exactly-once execution.
      </p>
    </section>
  )
}
