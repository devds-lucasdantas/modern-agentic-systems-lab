import {
  useRef,
  useState,
  type FormEvent,
} from 'react'

import type {
  CheckpointRef,
  ThreadId,
  ThreadState,
} from '../domain'

import {
  useRuntime,
} from '../app/use-runtime'

import {
  projectThreadState,
} from '../execution/thread-state-projector'

import {
  classifyStateUpdateReadback,
  type StateUpdateReadback,
} from '../execution/state-update-readback'

import {
  classifyHeadPreflight,
} from '../execution/state-mutation-preflight'

import type {
  ProjectionAuthority,
} from '../execution/use-execution'

const shortId = (id: string): string =>
  id.length <= 22 ? id : `${id.slice(0, 10)}…${id.slice(-8)}`

type CheckpointSelection = 'head' | 'observed' | 'parent'
type MutationStage =
  | 'idle' | 'checking-head' | 'posting' | 'reading' | 'ready'
  | 'stale' | 'diverged' | 'unreconciled' | 'failed'

interface MutationReport {
  readonly readback: StateUpdateReadback | null
  readonly writtenCheckpointId: string | null
  readonly error: string | null
}

export interface SharedStatePanelProps {
  readonly threadId: ThreadId | null
  readonly state: ThreadState | null
  readonly authority: ProjectionAuthority
  readonly busy: boolean
  readonly onBusyChange: (busy: boolean) => void
  readonly onReadState: (threadId: ThreadId) => Promise<ThreadState>
  readonly onRuntimeChanged: () => Promise<void>
}

/**
 * Explicit, restricted shared-state lab UI.
 * Not a generic JSON editor: only adds one human message via the messages reducer.
 * Does not provide CAS, authorization, a lock or concurrent-writer safety.
 */
export function SharedStatePanel({
  threadId,
  state,
  authority,
  busy,
  onBusyChange,
  onReadState,
  onRuntimeChanged,
}: SharedStatePanelProps) {
  const { client } = useRuntime()
  const [message, setMessage] = useState('')
  const [selection, setSelection] = useState<CheckpointSelection>('head')
  const [acknowledged, setAcknowledged] = useState(false)
  const [stage, setStage] = useState<MutationStage>('idle')
  const [report, setReport] = useState<MutationReport | null>(null)
  const inFlight = useRef(false)

  const validState = threadId !== null && state?.threadId === threadId && authority === 'persisted'
  const projection = validState && state !== null ? projectThreadState(state) : null
  const selectedCheckpoint: CheckpointRef | undefined =
    selection === 'observed'
      ? state?.checkpoint ?? undefined
      : selection === 'parent'
        ? state?.parentCheckpoint ?? undefined
        : undefined

  // React state determines what may render; ref.current is event-only.
  const working = stage === 'checking-head' || stage === 'posting' || stage === 'reading'
  const needsReload = stage === 'stale' || stage === 'diverged' ||
    stage === 'unreconciled' || stage === 'failed'
  const readyToWrite = validState && !busy && !working && !needsReload &&
    (selection === 'head' || selectedCheckpoint !== undefined) &&
    message.trim().length > 0 && acknowledged

  const read = async () => {
    if (threadId === null || inFlight.current || busy) return
    inFlight.current = true
    onBusyChange(true)
    setStage('reading')
    try {
      await onReadState(threadId)
      // A manual re-read establishes fresh displayed persisted state,
      // but cannot by itself establish a previous POST's outcome.
      setReport(null)
      setAcknowledged(false)
      setSelection('head')
      setStage('idle')
    } catch (error) {
      setReport({
        readback: null,
        writtenCheckpointId: null,
        error: error instanceof Error ? error.message : String(error),
      })
      setStage('unreconciled')
    } finally {
      inFlight.current = false
      onBusyChange(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!readyToWrite || threadId === null || state === null || inFlight.current) return
    const content = message.trim()
    const observedAtSubmit = state
    const chosen = selectedCheckpoint
    inFlight.current = true
    onBusyChange(true)
    setStage('checking-head')
    setReport(null)

    let writtenCheckpointId: string | null = null
    let postAttempted = false
    try {
      // Best-effort TOCTOU check. Not atomic with the following POST.
      // Do not commit a stale view knowingly, even in server-HEAD mode.
      const now = await client.getThreadState(threadId)
      const preflight = classifyHeadPreflight(observedAtSubmit, now)
      if (preflight.kind === 'stale') {
        setReport({
          readback: null,
          writtenCheckpointId: null,
          error: 'Persisted HEAD changed after the displayed observation. No POST was sent',
        })
        setAcknowledged(false)
        setStage('stale')
        return
      }

      setStage('posting')
      postAttempted = true
      const result = await client.updateThreadState(threadId, {
        values: {
          messages: [{
            type: 'human',
            id: `lab-23e-ui-${globalThis.crypto.randomUUID()}`,
            content,
          }],
        },
        asNode: '__start__',
        checkpoint: chosen,
      })
      writtenCheckpointId = result.checkpoint.checkpointId
      setStage('reading')

      // Authoritative GET is separate. Never update UI state from POST alone.
      const observed = await onReadState(threadId)
      const readback = classifyStateUpdateReadback(result, observed)
      setReport({ readback, writtenCheckpointId, error: null })
      // A different HEAD is not a verified state for this write.
      // Require a conscious reread before another mutation.
      setStage(readback.kind === 'matching' ? 'ready' : 'diverged')
      setMessage('')
      setAcknowledged(false)
      // Overview refresh failure must not reclassify an already read-back POST.
      try {
        await onRuntimeChanged()
      } catch {
        // The overview owns its own error state.
      }
    } catch (error) {
      setReport({
        readback: null,
        writtenCheckpointId,
        error: error instanceof Error ? error.message : String(error),
      })
      // If POST was dispatched, even a network error may hide a committed
      // mutation. Never retry it automatically. A preflight failure has no POST.
      setStage(postAttempted ? 'unreconciled' : 'failed')
    } finally {
      inFlight.current = false
      onBusyChange(false)
    }
  }

  return (
    <section className="shared-state-panel" aria-label="Shared state laboratory">
      <header className="shared-state-header">
        <div>
          <span className="eyebrow">Persisted graph state · Lab 2.3F</span>
          <h3>Shared-state inspector</h3>
        </div>
        <button type="button" className="refresh-button" onClick={() => { void read() }}
          disabled={threadId === null || busy || working}>
          Reload persisted state
        </button>
      </header>

      {projection === null ? (
        <p className="shared-state-muted">Select a Thread and load its persisted state before editing.</p>
      ) : (
        <dl className="shared-state-facts">
          <div><dt>Graph position</dt><dd>{projection.graph.status}</dd></div>
          <div><dt>Next nodes</dt><dd>{projection.graph.next.join(', ') || '—'}</dd></div>
          <div><dt>HEAD checkpoint</dt><dd><code title={projection.graph.checkpointId ?? ''}>{projection.graph.checkpointId ?? '—'}</code></dd></div>
          <div><dt>Parent checkpoint</dt><dd><code title={projection.graph.parentCheckpointId ?? ''}>{projection.graph.parentCheckpointId ?? '—'}</code></dd></div>
          <div><dt>Messages</dt><dd>{projection.messages.length}</dd></div>
          <div><dt>Tasks / interrupts</dt><dd>{projection.graph.taskCount} / {projection.graph.interruptCount}</dd></div>
        </dl>
      )}

      <form className="shared-state-form" onSubmit={(event) => { void submit(event) }}>
        <h4>Explicit graph-state mutation</h4>
        <p className="shared-state-warning">
          Experimental: writes can move the Thread HEAD or create a historical branch.
          A checkpoint selector is not compare-and-swap, an authorization check or an execution lock.
          External Runs and writers are not coordinated by this UI.
          A pre-POST HEAD check detects some stale views, but is not atomic with POST.
        </p>
        <label htmlFor="state-update-mode">Checkpoint base</label>
        <select id="state-update-mode" value={selection} disabled={!validState || busy}
          onChange={(event) => {
            setSelection(event.target.value as CheckpointSelection)
            setAcknowledged(false)
          }}>
          <option value="head">Server current HEAD (omit checkpoint)</option>
          <option value="observed" disabled={!state?.checkpoint}>Observed checkpoint (may be stale)</option>
          <option value="parent" disabled={!state?.parentCheckpoint}>Observed parent (explicit branch)</option>
        </select>
        <label htmlFor="state-update-message">New human message</label>
        <textarea id="state-update-message" rows={3} value={message}
          disabled={!validState || busy || needsReload}
          placeholder="Adds one new message ID using the messages reducer"
          onChange={(event) => setMessage(event.target.value)}/>
        <label className="shared-state-confirm">
          <input type="checkbox" checked={acknowledged}
            disabled={!validState || busy || needsReload}
            onChange={(event) => setAcknowledged(event.target.checked)}/>
          <span>I understand this POST may change the HEAD and does not prevent concurrent writes.</span>
        </label>
        <button type="submit" className="execute-button" disabled={!readyToWrite}>
          {stage === 'checking-head' ? 'Checking HEAD…' : stage === 'posting' ? 'Posting…' : stage === 'reading' ? 'Reading…' : 'Append message to graph state'}
        </button>
      </form>

      <div className="shared-state-result" aria-live="polite" data-mutation-stage={stage}>
        {stage === 'checking-head' && <p>Verifying persisted HEAD before POST (best-effort, not CAS)…</p>}
        {stage === 'posting' && <p>POST pending. Persisted state has not been reconciled.</p>}
        {stage === 'reading' && <p>POST returned; reading authoritative ThreadState independently…</p>}
        {report?.readback !== null && report?.readback !== undefined && (
          <p>
            {report.readback.kind === 'matching' ? 'Readback matches POST checkpoint.' : 'Observed HEAD differs from POST checkpoint.'}
            {' '}Written: <code>{shortId(report.readback.writtenCheckpointId)}</code>
            {' '}Observed HEAD: <code>{report.readback.observedHeadCheckpointId === null ? '—' : shortId(report.readback.observedHeadCheckpointId)}</code>
            {' '}This observation is not a concurrency guarantee.
          </p>
        )}
        {stage === 'diverged' && (
          <p role="alert">HEAD diverged after POST. The write may be persisted, but another checkpoint is current. Reload before another edit.</p>
        )}
        {report?.error && (
          <p role="alert">
            {stage === 'stale' ? 'Stale view: ' : stage === 'failed' ? 'Preflight failed before POST: ' : 'Mutation/re-read not confirmed: '}
            {report.error}. Reload persisted state before another write.
          </p>
        )}
      </div>
    </section>
  )
}
