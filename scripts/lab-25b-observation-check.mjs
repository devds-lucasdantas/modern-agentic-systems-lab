/** Cross-check the pure 2.5B projector with the redacted, real 2.5A observation. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [compiledProjector, observationPath] = process.argv.slice(2)
if (!compiledProjector || !observationPath) {
  throw new Error('Usage: node scripts/lab-25b-observation-check.mjs COMPILED_PROJECTOR.JS OBSERVATION.JSON')
}
const { projectPersistedTools } = await import(pathToFileURL(resolve(compiledProjector)).href)
const observation = JSON.parse(readFileSync(observationPath, 'utf8'))
const requireTrue = (value, reason) => { if (!value) throw new Error(`BLOCKED: ${reason}`) }
requireTrue(observation.lab === '2.5A', 'not a 2.5A observation')
requireTrue(observation.baseline === 'e1acf37eb34c9b3068d94eb1424d065d05537703', 'wrong observed baseline')
requireTrue(observation.reference === '3d3287cf1e51250934c11aff182d90ccfaf0e66d', 'wrong pinned reference')
requireTrue(observation.run_status === 'success' && observation.thread_status === 'idle', 'Run/Thread not successful')
requireTrue(observation.checkpoint_present === true && Array.isArray(observation.graph_next) && observation.graph_next.length === 0, 'no persisted END evidence')
for (const key of ['oneCallPersisted', 'oneToolMessagePersisted', 'callIdCorrelated',
  'deterministicResultPersisted', 'runSucceeded', 'graphReachedEnd', 'sseObserved', 'noModelCalls']) {
  requireTrue(observation.checks?.[key] === true, `missing discovery invariant ${key}`)
}
const { tool_call: call, tool_result: result } = observation
requireTrue(call?.id === 'masl-call-25a-1' && call?.name === 'deterministic_lookup_25a', 'unexpected persisted call')
requireTrue(call?.args?.code === 'ALPHA_25A', 'unexpected deterministic argument')
requireTrue(result?.tool_call_id === call.id && result?.content === 'RESULT_25A:ALPHA_25A', 'uncorrelated ToolMessage')
const sse = observation.sse?.by_event
requireTrue(sse && sse['messages/complete'] === 2 && sse.values === 3, 'unexpected pinned SSE profile')
const state = {
  threadId: observation.thread_id,
  values: { messages: [
    { type: 'ai', id: 'synthetic-ai', content: '', tool_calls: [{ ...call, type: 'tool_call' }] },
    { type: 'tool', id: 'synthetic-tool', ...result },
  ] },
  checkpoint: { threadId: observation.thread_id, checkpointId: 'persisted-confirmed', checkpointMap: {}, namespace: '' },
  position: { next: observation.graph_next }, interrupts: [],
  metadata: { secret: 'MUST_NOT_LEAK' }, tasks: [], createdAt: null, parentCheckpoint: null,
}
const view = projectPersistedTools(state)
requireTrue(view.situation === 'observed' && view.graphAtEnd, 'projected tool/END mismatch')
requireTrue(view.calls.length === 1 && view.calls[0].status === 'result-observed', 'projected ToolMessage correlation mismatch')
requireTrue(view.calls[0].callId === call.id && view.calls[0].name === call.name, 'projected identifiers mismatch')
requireTrue(!JSON.stringify(view).includes('RESULT_25A:') && !JSON.stringify(view).includes('ALPHA_25A') && !JSON.stringify(view).includes('MUST_NOT_LEAK'), 'projection disclosed raw arguments/content/metadata')
console.log('PASS: real 2.5A observation validated: one ToolNode call, correlated result, END')
console.log('PASS: projected summary excludes tool args, result content, arbitrary Thread metadata')
console.log('PASS: messages/complete remains a discovered SSE family, not implied to be a tools lifecycle channel')
console.log('PASS: cross-check only reconstructed a structural ThreadState fixture from redacted observation')
