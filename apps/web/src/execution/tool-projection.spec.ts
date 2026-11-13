import { checkpointId, threadId, type ThreadState } from '../domain'
import { MAX_VISIBLE_TOOL_CALLS, projectPersistedTools } from './tool-projection'

let passed = 0
const check = (condition: boolean, label: string) => {
  if (!condition) throw new Error(`FAIL: ${label}`)
  passed += 1
  console.log(`PASS: ${label}`)
}
const tid = threadId('t-25b')
const checkpoint = { threadId: tid, checkpointId: checkpointId('c1'), namespace: '', checkpointMap: {} }
const call = (id = 'call-1', name = 'deterministic_lookup_25a', args: unknown = { code: 'SECRET_ARGS' }) =>
  ({ id, name, args, type: 'tool_call' })
const ai = (...tool_calls: unknown[]) => ({ type: 'ai', id: 'ai-1', content: '', tool_calls })
const tool = (id = 'call-1', content = 'SECRET_RETURN', status?: string) =>
  ({ type: 'tool', id: 'tool-1', content, tool_call_id: id, status })
const make = (messages: unknown[], overrides: Partial<ThreadState> = {}): ThreadState => ({
  threadId: tid, values: { messages }, position: { next: [] },
  checkpoint, parentCheckpoint: null, metadata: { SECRET_METADATA: 'HIDDEN' },
  interrupts: [], tasks: [], createdAt: null, ...overrides,
})
const base = projectPersistedTools(make([ai(call()), tool()]))
check(base.authority === 'persisted', 'read-only persisted authority')
check(base.threadId === tid, 'same Thread identity')
check(base.checkpointId === 'c1', 'checkpoint correlation')
check(base.graphAtEnd, 'END represented independently of tool result')
check(base.situation === 'observed', 'single correlated call projects')
check(base.callCount === 1 && base.resultCount === 1, 'one call and result')
check(base.calls.length === 1, 'one visible summary')
check(base.calls[0]?.callId === 'call-1', 'ToolCall ID retained')
check(base.calls[0]?.name === 'deterministic_lookup_25a', 'validated tool name retained')
check(base.calls[0]?.status === 'result-observed', 'ToolMessage correlation observed')
check(base.calls[0]?.matchingResultCount === 1, 'one matching result')
check(!JSON.stringify(base).includes('SECRET_ARGS'), 'tool arguments are never displayed')
check(!JSON.stringify(base).includes('SECRET_RETURN'), 'tool output is never displayed')
check(!JSON.stringify(base).includes('SECRET_METADATA'), 'Thread metadata never displayed')
check(!JSON.stringify(base).includes('HIDDEN'), 'secret value never displayed')
check(projectPersistedTools(make([ai(call())])).calls[0]?.status === 'no-result-observed', 'missing result not invented')
check(projectPersistedTools(make([ai(call()), tool('call-1', 'oops', 'error')])).calls[0]?.status === 'error-observed', 'explicit ToolMessage error recognized')
check(projectPersistedTools(make([ai(call()), tool(), tool()])).calls[0]?.status === 'multiple-results', 'duplicate ToolMessages fail closed')
check(projectPersistedTools(make([ai(call(), call()), tool()])).calls.every(s => s.status === 'duplicate-call-id'), 'duplicate call identity fails closed')
check(projectPersistedTools(make([ai(call()), tool('other')])).orphanResultCount === 1, 'orphan result detected')
check(projectPersistedTools(make([ai(call()), tool('other')])).situation === 'incomplete', 'orphan result flags incomplete projection')
check(projectPersistedTools(make([ai(call('bad id')), tool()])).opaqueCount === 1, 'invalid call ID hidden')
check(projectPersistedTools(make([ai(call('call-1', '<script>')), tool()])).opaqueCount === 1, 'unsafe tool name hidden')
check(projectPersistedTools(make([ai({ id: 'call-1', name: 'valid_tool' })])).opaqueCount === 1, 'missing args object treated as opaque')
check(projectPersistedTools(make([ai({ id: 'call-1', name: 'valid_tool', args: {}, type: 'invalid' })])).opaqueCount === 1, 'unexpected tool-call kind rejected')
check(projectPersistedTools(make([ai('not-object')])).opaqueCount === 1, 'malformed call hidden')
check(projectPersistedTools(make([{type:'other', content:'',tool_calls:[call()]}])).opaqueCount === 1, 'non-assistant tool_calls rejected')
check(projectPersistedTools(make([tool('invalid space')])).opaqueCount === 1, 'invalid ToolMessage identifier hidden')
check(projectPersistedTools(make([tool('orphan')])).orphanResultCount === 1, 'tool-only state cannot invent a call')
check(projectPersistedTools(make([])).situation === 'no-tool-calls', 'empty persisted messages supported')
check(projectPersistedTools(make([], { checkpoint: null })).situation === 'unavailable', 'missing checkpoint blocks projection')
check(!projectPersistedTools(make([ai(call()),tool()], {position:{next:['tools']}})).graphAtEnd, 'pending graph position is not END')
check(!projectPersistedTools(make([ai(call()),tool()], {interrupts:[{kind:'graph-interrupt',id:null,resumable:true,value:{}}]})).graphAtEnd, 'interrupt is not END')
check(projectPersistedTools(make([], {values:{not_messages:[]}})).situation === 'unavailable', 'missing messages channel fails closed')
check(projectPersistedTools(make([], {values:{messages:'invalid'}})).situation === 'unavailable', 'malformed messages channel fails closed')
check(projectPersistedTools(make([], {values:[]})).situation === 'unavailable', 'state array not assumed to carry messages')
const many = projectPersistedTools(make([ai(...Array.from({length:MAX_VISIBLE_TOOL_CALLS+4}, (_,i)=>call(`id-${i}`)))]))
check(many.callCount === MAX_VISIBLE_TOOL_CALLS+4, 'full call count preserved')
check(many.calls.length === MAX_VISIBLE_TOOL_CALLS, 'display list capped')
check(many.hiddenCallCount === 4 && many.situation === 'incomplete', 'hidden calls signaled')
check(projectPersistedTools(make(Array.from({length:1001},()=>({type:'human',content:'x'})))).situation === 'unavailable', 'excessive message count rejected')
check(projectPersistedTools(make([ai({id:'call-1', name:'lookup', args:{}, type:'tool_call'}),tool('call-1','y','success')])).calls[0]?.status === 'result-observed', 'explicit success is only an observed result')
check(projectPersistedTools(make([ai(call()),tool()], {metadata:{EXTRA:'DO_NOT_LEAK'}})).calls[0]?.status === 'result-observed', 'metadata does not affect correlation')
console.log(`\n${passed} 2.5B persisted-tool-projection assertions passed`)
