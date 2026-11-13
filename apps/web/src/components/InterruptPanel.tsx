import { useRef, useState, type FormEvent } from 'react'
import type { Run, ThreadId, ThreadState } from '../domain'
import { AgentServerHttpError } from '../transport/agent-server'
import {
  classifyResumeRecovery, classifyResumePostFailure, RESUME_ATTEMPT_KEY,
  type ResumeAttemptObservation, type ResumeRecoveryDecision,
} from '../execution/resume-recovery'
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
  | 'recovering' | 'confirmed' | 'stale' | 'unreconciled'
  | 'ambiguous' | 'conflict' | 'in-flight' | 'follow-up'

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
  // A submitted attempt stays interlocked for this mounted Thread component.
  // Its marker correlates readbacks, but does not provide server idempotency.
  const [attempt, setAttempt] = useState<ResumeAttemptObservation | null>(null)
  const inFlight = useRef(false)

  const validState = threadId !== null && state !== null &&
    state.threadId === threadId && authority === 'persisted'
  const projection = validState && state !== null
    ? projectPersistedInterrupts(state, null) : null
  const action = inspectHitlAction(state, authority, threadId)
  const working = ['checking', 'posting', 'polling', 'reading', 'recovering'].includes(stage)
  const requiresReload = stage === 'stale' || stage === 'unreconciled' ||
    stage === 'ambiguous' || stage === 'conflict' ||
    stage === 'in-flight' || stage === 'follow-up'
  const canRespond = attempt === null && action.allowed && !busy && !working && !requiresReload &&
    (response === 'APPROVE_24D' || response === 'REJECT_24D') && acknowledged

  /** Two independent, bounded REST pages. Any incomplete list fails closed. */
  const readRecovery = async (
    record: ResumeAttemptObservation,
  ): Promise<ResumeRecoveryDecision> => {
    const [thread, state, firstPage, secondPage] = await Promise.all([
      client.getThread(record.threadId),
      onReadState(record.threadId),
      client.listRuns(record.threadId, { limit: 100, offset: 0 }),
      client.listRuns(record.threadId, { limit: 100, offset: 100 }),
    ])
    const decision = classifyResumeRecovery(record, {
      thread,
      state,
      runs: firstPage,
      runsListComplete: firstPage.length < 100 && secondPage.length === 0,
    })
    // Failure to refresh the sidebar cannot invalidate an independently
    // reconciled graph. This is presentation-only, not proof of END.
    void onRuntimeChanged().catch(() => {})
    if (decision.outcome === 'confirmed-end') {
      setStage('confirmed')
      setReport(`Correlated Run ${decision.correlatedRunId} finished; independent persisted state confirms END. No retry was sent.`)
    } else if (decision.outcome === 'follow-up-interrupt') {
      setStage('follow-up')
      setReport('Correlated Run finished but another interrupt remains. A different human decision may be required; no retry was sent.')
    } else if (decision.outcome === 'run-in-flight') {
      setStage('in-flight')
      setReport('The correlated Run is still pending or running. Inspect again using GET only; no retry was sent.')
    } else {
      setStage('unreconciled')
      setReport(`Read-only recovery: ${decision.outcome}. This does not authorize a new resume POST.`)
    }
    return decision
  }

  /** Reload cannot erase a submitted attempt or re-enable its POST. */
  const reload = async () => {
    if (threadId === null || busy || inFlight.current) return
    inFlight.current = true
    onBusyChange(true)
    setStage(attempt === null ? 'reading' : 'recovering')
    try {
      if (attempt !== null) {
        await readRecovery(attempt)
      } else {
        await onReadState(threadId)
        setStage('idle')
        setReport(null)
        setResponse('')
        setAcknowledged(false)
        await onRuntimeChanged()
      }
    } catch (error) {
      setStage(attempt === null ? 'unreconciled' : 'ambiguous')
      setReport(`Read-only inspection failed: ${error instanceof Error ? error.message : String(error)}. No additional resume POST was issued during inspection.`)
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
      // The deterministic probe starts with exactly one successful Run.
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

      // Best-effort TOCTOU guard, NOT an atomic checkpoint condition.
      const current = await client.getThreadState(threadId)
      if (!sameObservedHitlAction(observed, current)) {
        setStage('stale')
        setReport('The persisted checkpoint or interrupt changed. No resume POST was sent.')
        setAcknowledged(false)
        return
      }

      const record: ResumeAttemptObservation = {
        threadId,
        canonicalAssistantId,
        initialRunId: runs[0].id,
        before: observed,
        attemptId: crypto.randomUUID(),
      }
      // Install the interlock before the first potentially committed POST.
      setAttempt(record)
      setStage('posting')
      postAttempted = true
      const created = await client.createResumeRun(threadId, {
        assistantId: canonicalAssistantId,
        resumeValue: selectedResponse,
        metadata: { [RESUME_ATTEMPT_KEY]: record.attemptId },
      })
      setStage('polling')
      // Polls are GET only. A terminal Run status cannot by itself prove END.
      await awaitTerminalRun(() => client.getRun(threadId, created.id))
      setStage('recovering')
      await readRecovery(record)
      setResponse('')
      setAcknowledged(false)
    } catch (error) {
      if (postAttempted) {
        const status = error instanceof AgentServerHttpError ? error.status : null
        const failure = classifyResumePostFailure(status)
        setStage(failure === 'conflict' ? 'conflict' : 'ambiguous')
        setReport(failure === 'conflict'
          ? 'The server returned HTTP 409. No automatic retry. Inspect the submitted attempt using GET before deciding what happened.'
          : 'The resume POST may have committed, or reconciliation failed. No automatic retry. Inspect the submitted attempt using GET only.')
      } else {
        setStage('stale')
        setReport(error instanceof Error ? error.message : String(error))
      }
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
          <span className="eyebrow">2.4E · Human-in-the-loop</span>
          <h3>Persisted interrupt</h3>
        </div>
        <button type="button" onClick={() => { void reload() }}
          disabled={threadId === null || busy || working}>
          {attempt === null ? 'Reload persisted state' : 'Inspect submitted attempt (read only)'}
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
      {attempt !== null &&
        <p className="hitl-warning" data-hitl-interlock>Attempt recorded in this panel. Further resume POSTs are locked, even after inspection. No server-backed idempotency is claimed.</p>}
      {report !== null && <p className="hitl-result" data-hitl-stage={stage} role="status">{report}</p>}
      {stage === 'stale' &&
        <p className="hitl-warning">No resume POST was sent. Reload the persisted state before retrying.</p>}
      {['unreconciled', 'ambiguous', 'conflict', 'in-flight', 'follow-up'].includes(stage) && attempt !== null &&
        <p className="hitl-warning">Inspect again using read-only GET operations. This attempt cannot be retried from the current panel.</p>}
    </section>
  )
}
