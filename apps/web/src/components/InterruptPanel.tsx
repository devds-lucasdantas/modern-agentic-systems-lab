import { useRef, useState, type FormEvent } from 'react'
import type { Run, ThreadId, ThreadState } from '../domain'
import { useRuntime } from '../app/use-runtime'
import { projectPersistedInterrupts } from '../execution/interrupt-projection'
import { inspectHitlAction, sameObservedHitlAction } from '../execution/hitl-action'
import type { ProjectionAuthority } from '../execution/use-execution'

interface InterruptPanelProps {
  readonly threadId: ThreadId | null
  readonly state: ThreadState | null
  readonly authority: ProjectionAuthority
  readonly busy: boolean
  readonly onBusyChange: (value: boolean) => void
  readonly onReadState: (id: ThreadId) => Promise<ThreadState>
  readonly onRuntimeChanged: () => Promise<void>
}

type Stage =
  | 'idle' | 'checking' | 'posting' | 'polling' | 'reading'
  | 'confirmed' | 'stale' | 'unreconciled'

type ResponseValue = '' | 'APPROVE_24D' | 'REJECT_24D'

const wait = (ms: number): Promise<void> =>
  new Promise(resolve => { globalThis.setTimeout(resolve, ms) })

/** Read-only Run polling. No additional state-changing POSTs. */
const awaitTerminalRun = async (
  getRun: () => Promise<Run>,
): Promise<Run> => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const run = await getRun()
    if (run.status !== 'pending' && run.status !== 'running') return run
    await wait(250)
  }
  throw new Error('Run has not reached a terminal status; reload to inspect it.')
}

/** Restricted deterministic HITL laboratory UI, not a general approval console. */
export function InterruptPanel({
  threadId, state, authority, busy, onBusyChange, onReadState, onRuntimeChanged,
}: InterruptPanelProps) {
  const { client } = useRuntime()
  const [response, setResponse] = useState<ResponseValue>('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [report, setReport] = useState<string | null>(null)
  const inFlight = useRef(false)

  const validState = threadId !== null && state !== null &&
    state.threadId === threadId && authority === 'persisted'
  const projection = validState && state !== null
    ? projectPersistedInterrupts(state, null) : null
  const action = inspectHitlAction(state, authority, threadId)
  const working = ['checking', 'posting', 'polling', 'reading'].includes(stage)
  const requiresReload = stage === 'stale' || stage === 'unreconciled'
  const canRespond = action.allowed && !busy && !working && !requiresReload &&
    (response === 'APPROVE_24D' || response === 'REJECT_24D') && acknowledged

  const reload = async () => {
    if (threadId === null || busy || inFlight.current) return
    inFlight.current = true
    onBusyChange(true)
    setStage('reading')
    try {
      await onReadState(threadId)
      setStage('idle')
      setReport(null)
      setResponse('')
      setAcknowledged(false)
      await onRuntimeChanged()
    } catch (error) {
      setStage('unreconciled')
      setReport(error instanceof Error ? error.message : String(error))
    } finally {
      inFlight.current = false
      onBusyChange(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canRespond || threadId === null || state === null || inFlight.current) return
    inFlight.current = true
    onBusyChange(true)
    setStage('checking')
    setReport(null)
    const observed = state
    const selectedResponse = response
    let postAttempted = false
    try {
      // The initial probe is a single-Run lab case. Refuse ambiguous ancestry.
      const runs = await client.listRuns(threadId, { limit: 20 })
      if (runs.length !== 1 || runs[0]?.status !== 'success' ||
          runs[0].threadId !== threadId) {
        throw new Error('Expected exactly one successful initial Run for this probe.')
      }
      const canonicalAssistantId = runs[0].assistantId
      const assistant = await client.getAssistant(canonicalAssistantId)
      if (assistant.id !== canonicalAssistantId || assistant.graphId !== 'masl_24a_hitl') {
        throw new Error('The canonical Assistant does not belong to the reviewed HITL graph.')
      }

      // Best-effort TOCTOU check, not an atomic checkpoint-conditional resume.
      const current = await client.getThreadState(threadId)
      if (!sameObservedHitlAction(observed, current)) {
        setStage('stale')
        setReport('The persisted checkpoint or interrupt changed. No resume POST was sent.')
        setAcknowledged(false)
        return
      }

      setStage('posting')
      postAttempted = true
      const created = await client.createResumeRun(threadId, {
        assistantId: canonicalAssistantId,
        resumeValue: selectedResponse,
      })
      setStage('polling')
      const terminal = await awaitTerminalRun(() => client.getRun(threadId, created.id))
      if (terminal.status !== 'success' || terminal.threadId !== threadId ||
          terminal.assistantId !== canonicalAssistantId) {
        throw new Error(`Resume Run did not complete successfully (${terminal.status}).`)
      }

      setStage('reading')
      const persisted = await onReadState(threadId)
      if (persisted.threadId !== threadId || persisted.checkpoint === null ||
          persisted.interrupts.length !== 0 || persisted.position.next.length !== 0) {
        throw new Error('Run completed, but persisted ThreadState has not confirmed graph END.')
      }
      await onRuntimeChanged()
      setStage('confirmed')
      setReport(`Run ${created.id} finished; independent persisted state confirms END.`)
      setResponse('')
      setAcknowledged(false)
    } catch (error) {
      // Even lost responses can hide a committed POST. Never retry automatically.
      setStage(postAttempted ? 'unreconciled' : 'stale')
      setReport(error instanceof Error ? error.message : String(error))
      setAcknowledged(false)
    } finally {
      inFlight.current = false
      onBusyChange(false)
    }
  }

  return (
    <section className="hitl-panel" role="region" aria-label="Human-in-the-loop laboratory">
      <div className="hitl-header">
        <div>
          <span className="eyebrow">2.4D · Human-in-the-loop</span>
          <h3>Persisted interrupt</h3>
        </div>
        <button type="button" onClick={() => { void reload() }}
          disabled={threadId === null || busy || working}>
          Reload persisted state
        </button>
      </div>
      <p className="hitl-muted">A paused Run is not necessarily awaiting a human decision.
        Only the reviewed deterministic probe can be resumed here.</p>
      <dl className="hitl-facts">
        <div><dt>Situation</dt><dd data-hitl-situation>{projection?.situation ?? 'not loaded'}</dd></div>
        <div><dt>Checkpoint</dt><dd>{projection?.checkpointId ?? '—'}</dd></div>
        <div><dt>Interrupts</dt><dd>{projection?.interruptCount ?? '—'}</dd></div>
      </dl>
      {action.allowed && action.question !== null ? (
        <>
          <p className="hitl-question">{action.question}</p>
          <form className="hitl-form" onSubmit={(event) => { void submit(event) }}>
            <label htmlFor="hitl-response">Human response</label>
            <select id="hitl-response" aria-label="Human response" value={response}
              onChange={event => { setResponse(event.target.value as ResponseValue) }}
              disabled={busy || working || requiresReload}>
              <option value="">Choose deliberately…</option>
              <option value="APPROVE_24D">Approve deterministic probe</option>
              <option value="REJECT_24D">Reject deterministic probe</option>
            </select>
            <label className="hitl-confirm">
              <input type="checkbox" checked={acknowledged}
                onChange={event => { setAcknowledged(event.target.checked) }}
                disabled={busy || working || requiresReload}/>
              I understand that submitting creates a new Run and is not an atomic or authorized approval.
            </label>
            <button type="submit" className="execute-button" disabled={!canRespond}>
              {working ? 'Processing…' : 'Resume reviewed probe'}
            </button>
          </form>
        </>
      ) : (
        <p className="hitl-muted" data-hitl-blocked>{action.reason}</p>
      )}
      {report !== null && <p className="hitl-result" data-hitl-stage={stage} role="status">{report}</p>}
      {stage === 'stale' &&
        <p className="hitl-warning">No resume POST was sent. Reload the persisted state before retrying.</p>}
      {stage === 'unreconciled' &&
        <p className="hitl-warning">The POST may have persisted. Reload and inspect before any further action; no automatic retry is performed.</p>}
    </section>
  )
}
