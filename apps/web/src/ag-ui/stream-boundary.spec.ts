/** Deterministic and model-free AG-UI HTTP/SSE boundary review tests. */
import { inspectAgUiSseFrame, reviewAgUiHttpSseBinding, reviewAgUiSseFrames,
  type SseWireFrame } from './stream-boundary'
import { parseSseStream } from '../transport/agent-server/sse'

let passed = 0
function check(condition: boolean, label: string): void {
  if (!condition) throw Error(`FAIL: ${label}`)
  passed++
  console.log(`PASS: ${label}`)
}
const frame = (obj: Record<string, unknown>, extras: Partial<SseWireFrame> = {}): SseWireFrame =>
  ({ data: JSON.stringify(obj), event: null, id: null, retry: null, ...extras })
const start = (runId = 'r1') => frame({ type: 'RUN_STARTED', threadId: 't1', runId, protocolVersion: '1.0' })
const finish = (runId = 'r1') => frame({ type: 'RUN_FINISHED', threadId: 't1', runId })
const error = () => frame({ type: 'RUN_ERROR', message: 'PRIVATE_ERROR_MESSAGE' })
const issues = (events: SseWireFrame[], eof = true): string[] =>
  reviewAgUiSseFrames(events, eof).issues.map(x => x.code)
const clean = [start(), frame({ type: 'TEXT_MESSAGE_START', messageId: 'm1' }),
  frame({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'SECRET_TEXT' }),
  frame({ type: 'TEXT_MESSAGE_END', messageId: 'm1' }), finish()]
check(issues(clean).length === 0, 'explicit text triad closes before terminal')
check(reviewAgUiSseFrames(clean, true).runs[0]?.status === 'finished', 'RUN_FINISHED produces finished')
check(reviewAgUiSseFrames([start(), error()], true).runs[0]?.status === 'failed', 'RUN_ERROR produces failed')
check(reviewAgUiSseFrames([error()], true).runs[0]?.status === 'failed', 'initial RUN_ERROR permitted')
check(reviewAgUiSseFrames([start()], true).runs[0]?.status === 'truncated', 'EOF without terminal is truncated')
check(issues([start()], true).includes('truncated-run-no-terminal'), 'truncation diagnostic explicit')
check(!issues([start()], false).includes('truncated-run-no-terminal'), 'live open stream not called truncated')
check(issues([start()], false).includes('stream-still-open'), 'open stream has nonterminal diagnostic')
check(reviewAgUiSseFrames([start(), finish(), error()], true).runs[0]?.status === 'failed',
  'late RUN_ERROR replaces prior success')
check(issues([start(), error(), error()]).includes('event-after-run-error'),
  'RUN_ERROR repeated after failure rejected')
check(issues([start(), finish(), frame({ type: 'CUSTOM', name: 'n', value: null })])
  .includes('event-after-terminal'), 'postterminal non-Run event flagged')
check(issues([frame({ type: 'CUSTOM', name: 'n', value: null }), start(), finish()])
  .includes('event-before-run'), 'stream must start with RUN_STARTED or RUN_ERROR')
check(issues([start(), start(), finish()]).includes('nested-run-start'), 'nested run opening rejected')
check(issues([start(), finish('other')]).includes('run-identity-conflict'), 'terminal run ID must match')
check(issues([start(), frame({ type: 'RUN_FINISHED', threadId:'other', runId:'r1' })])
  .includes('run-identity-conflict'), 'terminal thread identity must match')
check(reviewAgUiSseFrames([start(), finish(), start('r2'), finish('r2')], true).runCount === 2,
  'sequential runs on one stream supported')
check(issues([start(), frame({ type: 'TEXT_MESSAGE_START', messageId:'m' }), finish()])
  .includes('open-items-at-run-finish'), 'open message blocks clean terminal')
check(issues([start(), frame({ type:'TOOL_CALL_START', toolCallId:'c', toolCallName:'tool' }), finish()])
  .includes('open-items-at-run-finish'), 'open tool call blocks clean terminal')
check(issues([start(), frame({ type:'STEP_STARTED', stepName:'work' }), finish()])
  .includes('open-items-at-run-finish'), 'open step blocks clean terminal')
check(issues([start(), frame({type:'STEP_FINISHED',stepName:'work'}), finish()])
  .includes('step-end-without-open'), 'unmatched step ending flagged')
check(issues([start(), frame({type:'STEP_STARTED',stepName:'s'}), frame({type:'STEP_STARTED',stepName:'s'}),
  frame({type:'STEP_FINISHED',stepName:'s'}), finish()]).includes('step-already-open'),
  'overlapping same-name step rejected')
const tool = [start(), frame({type:'TOOL_CALL_START',toolCallId:'c',toolCallName:'lookup'}),
  frame({type:'TOOL_CALL_ARGS',toolCallId:'c',delta:'SECRET_ARGS'}),
  frame({type:'TOOL_CALL_END',toolCallId:'c'}), finish()]
check(issues(tool).length === 0, 'complete tool argument triad not execution proof')
check(issues([start(), frame({type:'TOOL_CALL_ARGS',toolCallId:'missing',delta:'x'}),finish()])
  .includes('tool-args-without-open'), 'tool args cannot invent call opening')
check(issues([start(), frame({type:'TOOL_CALL_END',toolCallId:'missing'}),finish()])
  .includes('tool-end-without-open'), 'tool end cannot invent call opening')
check(issues([start(), frame({type:'TEXT_MESSAGE_CONTENT',messageId:'m',delta:'x'}),finish()])
  .includes('message-content-without-open'), 'unmatched message content rejected')
check(issues([start(), frame({type:'TEXT_MESSAGE_END',messageId:'m'}),finish()])
  .includes('message-end-without-open'), 'unmatched message ending rejected')
check(issues([start(), frame({type:'REASONING_MESSAGE_START',messageId:'r',role:'reasoning'}),
  frame({type:'REASONING_MESSAGE_END',messageId:'r'}),finish()]).length === 0,
  'explicit reasoning message closes')
check(issues([start(), frame({type:'TEXT_MESSAGE_CHUNK',messageId:'m'}),finish()])
  .includes('unreviewed-chunk-or-subagent'), 'chunk expansion explicitly not implemented')
check(!reviewAgUiSseFrames([start(),frame({type:'TEXT_MESSAGE_CHUNK',messageId:'m'}),finish()],true)
  .scopeComplete, 'unexpanded chunk prevents complete review claim')
check(issues([start(),frame({type:'SUBAGENT_STARTED',subagentRunId:'s',name:'agent'}),finish()])
  .includes('unreviewed-chunk-or-subagent'), 'subagent lifecycle requires separate review')
check(inspectAgUiSseFrame(frame({type:'CUSTOM',name:'x',value:null},{event:'messages/complete',id:'99',retry:5})).kind
  === 'accepted', 'Agent Server SSE event field is ignored by AG-UI data decoder')
check(inspectAgUiSseFrame(frame({type:'messages/complete'})).kind === 'unrecognized-type',
  'Agent Server SSE event name is not AG-UI discriminator')
check(inspectAgUiSseFrame(frame({type:'FUTURE_EVENT'})).kind === 'unrecognized-type',
  'future AG-UI event ignored rather than marked invalid')
check(reviewAgUiSseFrames([frame({type:'FUTURE_EVENT'}),start(),finish()],true).ignoredUnknownCount === 1,
  'unknown event does not abort known Run')
check(inspectAgUiSseFrame(frame({type:'RUN_STARTED',threadId:'t',runId:'r',newerField:'x'})).kind
  === 'deferred-extension', 'unrecognized property defers enforcement not claimed fatal')
check(inspectAgUiSseFrame(frame({type:'RUN_STARTED',threadId:2,runId:'r'})).kind === 'invalid',
  'malformed known identity rejected')
check(inspectAgUiSseFrame({data:'{not-json',event:null,id:null,retry:null}).kind === 'invalid',
  'malformed JSON rejected')
check(inspectAgUiSseFrame({data:'[]',event:null,id:null,retry:null}).kind === 'invalid',
  'non-object event rejected')
const secretReview = reviewAgUiSseFrames(clean, true)
check(!JSON.stringify(secretReview).includes('SECRET_TEXT'), 'review contains no raw message content')
check(!JSON.stringify(reviewAgUiSseFrames([error()],true)).includes('PRIVATE_ERROR_MESSAGE'),
  'review contains no raw failure content')
check(reviewAgUiSseFrames([start(), finish()],true).runs[0]?.reportedOutcome === 'implicit-success',
  'missing outcome reports implicit success but not external tool success')
check(reviewAgUiSseFrames([start(),frame({type:'RUN_FINISHED',threadId:'t1',runId:'r1',
  outcome:{type:'cancelled'}})],true).runs[0]?.reportedOutcome === 'cancelled',
  'cancelled Run remains explicitly distinguished from success')
check(reviewAgUiSseFrames([start(),frame({type:'RUN_FINISHED',threadId:'t1',runId:'r1',
  outcome:{type:'interrupt',interrupts:[{id:'i',value:'x'}]}})],true).runs[0]?.reportedOutcome === 'interrupt',
  'interrupt outcome remains distinct from success')
check(issues([start(),frame({type:'RUN_FINISHED',threadId:'t1',runId:'r1',
  outcome:{type:'UNKNOWN_26C'}})],true).includes('outcome-needs-recursive-verification'),
  'unverified outcome never gets a conformance claim')
check(issues([start(), finish()]).length === 0, 'minimal run closes')
check(issues([start(), finish(), start('r2'), error()]).length === 0,
  'second replayed Run can fail after first closes')
check(issues([start(), frame({type:'CUSTOM',name:'n',value:null}),finish()]).length === 0,
  'standalone CUSTOM is allowed during run')
check(issues([start(), frame({type:'RUN_STARTED',threadId:'t1',runId:'r2',protocolVersion:'1.0'}),finish()])
  .includes('nested-run-start'), 'new Run requires old terminal')
check(reviewAgUiHttpSseBinding({requestMethod:'POST',requestContentType:'application/json',
  requestAccept:'text/event-stream',responseStatus:200,responseContentType:'text/event-stream',
  lastEventIdSent:false}).length === 0, 'canonical HTTP binding accepted')
const http = (changes: Record<string, unknown> = {}) => ({ requestMethod:'POST',
  requestContentType:'application/json',requestAccept:'text/event-stream',responseStatus:200,
  responseContentType:'text/event-stream',lastEventIdSent:false,...changes })
check(reviewAgUiHttpSseBinding(http({requestMethod:'GET'})).includes('request-not-post'), 'GET not AG-UI run binding')
check(reviewAgUiHttpSseBinding(http({requestContentType:'text/plain'})).includes('request-not-json'),
  'request JSON media type required')
check(reviewAgUiHttpSseBinding(http({requestAccept:'application/json'}))
  .includes('accept-missing-event-stream'), 'request Accept event-stream required')
check(reviewAgUiHttpSseBinding(http({responseContentType:'application/json'}))
  .includes('response-not-event-stream'), '200 response must be SSE')
check(reviewAgUiHttpSseBinding(http({responseStatus:403,responseContentType:null}))
  .includes('http-rejected-before-run-not-stream-error'), 'pre-run auth rejection is HTTP error')
check(reviewAgUiHttpSseBinding(http({lastEventIdSent:true}))
  .includes('ag-ui-http-sse-has-no-resume'), 'Last-Event-ID does not resume AG-UI')
check(issues([start(),finish()]).length === 0, 'HTTP 200 is not required to infer Run success')
// Reuse ONLY the existing generic SSE framing parser, not its Agent Server
// event decoder. Check arbitrary byte chunks, comments, multiline data and CRLF.
const testFraming = async (): Promise<void> => {
const body = ': keep-alive\r\n' +
  'id: 99\r\nevent: messages/complete\r\nretry: 1000\r\n' +
  'data: {"type":"RUN_STARTED",\r\n' +
  'data: "threadId":"t1","runId":"r1","protocolVersion":"1.0"}\r\n\r\n' +
  'data: {"type":"RUN_FINISHED","threadId":"t1","runId":"r1"}\n\n'
const bytes = new TextEncoder().encode(body)
const actual = new ReadableStream<Uint8Array>({ start(controller) {
  for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i,i + 3))
  controller.close()
} })
const parsed: SseWireFrame[] = []
for await (const item of parseSseStream(actual)) parsed.push(item)
check(parsed.length === 2, 'generic parser assembles two SSE frames across 3-byte chunks')
check(parsed[0]?.id === '99' && parsed[0]?.event === 'messages/complete',
  'SSE metadata retained by framing parser but not AG-UI authority')
check(issues(parsed).length === 0, 'AG-UI data events decoded from multiline/CRLF SSE without event-name conflation')
check(reviewAgUiSseFrames(parsed,true).runs[0]?.status === 'finished',
  'framed stream has explicit terminal Run')
}
testFraming().then(() => console.log(`\n${passed} 2.6C HTTP/SSE and lifecycle assertions passed`)).catch(error => { throw error })
