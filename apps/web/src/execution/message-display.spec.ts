import { messageId, type Message } from '../domain'
import { decodeAgentServerStreamEvent } from '../transport/agent-server/stream-events'
import { emptyLiveStreamProjection, projectStreamEvent } from './stream-projector'
import { projectMessageForDisplay, projectMessagesForDisplay } from './message-display'

let passed = 0
const check = (ok: boolean, reason: string): void => {
  if (!ok) throw new Error(`FAIL: ${reason}`)
  passed += 1
  console.log(`PASS: ${reason}`)
}

const tool: Message = {
  id: messageId('tool-25d'), role: 'tool', name: 'SECRET_TOOL_NAME_25D',
  content: [{ kind: 'text', text: 'SECRET_TOOL_RESULT_25D' },
    { kind: 'data', data: { args: 'SECRET_ARGUMENT_25D' } }],
}
const original = JSON.stringify(tool)
const hidden = projectMessageForDisplay(tool)
const json = JSON.stringify(hidden)
check(hidden.role === 'tool', 'tool role preserved')
check(hidden.id === tool.id, 'stable message identity retained')
check(hidden.blocks.length === 1, 'tool content replaced by one placeholder')
check(hidden.blocks[0]?.redacted === true, 'tool content explicitly redacted')
check(hidden.blocks[0]?.text.includes('Tool result content hidden') === true,
  'tool placeholder communicates withheld information')
check(!json.includes('SECRET_TOOL_RESULT_25D'), 'tool result string not forwarded')
check(!json.includes('SECRET_ARGUMENT_25D'), 'tool data not forwarded')
check(!json.includes('SECRET_TOOL_NAME_25D'), 'tool name not forwarded')
check(JSON.stringify(tool) === original, 'original ToolMessage not mutated')

const assistant: Message = {
  id: messageId('ai-25d'), role: 'assistant', name: 'raw-agent-name',
  content: [
    { kind: 'text', text: 'PUBLIC_ASSISTANT_TEXT_25D' },
    { kind: 'data', data: { tool_call: { args: { token: 'SECRET_TOOL_ARGS_25D' } } } },
    { kind: 'text', text: 'A second ordinary text block' },
  ],
}
const safeAssistant = projectMessageForDisplay(assistant)
check(safeAssistant.blocks.length === 3, 'non-tool block order preserved')
check(safeAssistant.blocks[0]?.text === 'PUBLIC_ASSISTANT_TEXT_25D',
  'ordinary assistant text preserved')
check(safeAssistant.blocks[0]?.redacted === false, 'text not misclassified as structured')
check(safeAssistant.blocks[1]?.redacted === true, 'assistant structured block hidden')
check(!JSON.stringify(safeAssistant).includes('SECRET_TOOL_ARGS_25D'),
  'structured tool-call arguments not forwarded')
check(!JSON.stringify(safeAssistant).includes('raw-agent-name'),
  'unvalidated message names not forwarded')
check(safeAssistant.blocks[2]?.text === 'A second ordinary text block',
  'text after redaction still preserved')

for (const role of ['user', 'system'] as const) {
  const safe = projectMessageForDisplay({
    id: null, role, name: null,
    content: [{ kind: 'text', text: `PUBLIC_${role}` },
      { kind: 'data', data: { secret: `SECRET_${role}` } }],
  })
  check(safe.blocks[0]?.text === `PUBLIC_${role}`, `${role} text preserved`)
  check(safe.blocks[1]?.redacted === true, `${role} structured data hidden`)
  check(!JSON.stringify(safe).includes(`SECRET_${role}`), `${role} opaque content excluded`)
}
const emptyTool = projectMessageForDisplay({ ...tool, content: [] })
check(emptyTool.blocks.length === 1, 'empty ToolMessage still withheld')
const list = projectMessagesForDisplay([assistant, tool])
check(list.length === 2, 'display projection preserves message count')
check(list[0]?.role === 'assistant' && list[1]?.role === 'tool',
  'display projection preserves message order')
check(!JSON.stringify(list).includes('SECRET_TOOL_RESULT_25D'),
  'aggregate view excludes raw tool result')

const completed = decodeAgentServerStreamEvent({
  event: 'messages/complete', id: 'id-25d', retry: null,
  data: JSON.stringify([{ type: 'tool', content: 'SECRET_COMPLETE_EVENT_25D' }]),
})
check(completed.kind === 'known' && completed.event === 'messages/complete',
  'observed messages/complete explicitly recognized by decoder')
check(projectStreamEvent(emptyLiveStreamProjection, completed) === emptyLiveStreamProjection,
  'messages/complete cannot become live or persisted message authority')
const unknown = decodeAgentServerStreamEvent({
  event: 'tools/tool-started', id: 'id-25d2', retry: null,
  data: JSON.stringify({ args: 'SECRET_UNKNOWN_EVENT_25D' }),
})
check(unknown.kind === 'unknown', 'unobserved tools event remains unknown')
check(projectStreamEvent(emptyLiveStreamProjection, unknown) === emptyLiveStreamProjection,
  'unknown event cannot update message projection')
const malformed = decodeAgentServerStreamEvent({
  event: 'messages/complete', id: null, retry: null, data: '{broken',
})
check(malformed.kind === 'malformed-json', 'malformed complete event fails closed')
check(projectStreamEvent(emptyLiveStreamProjection, malformed) === emptyLiveStreamProjection,
  'malformed event cannot mutate live projection')
const explicitComplete = { ...completed, event: 'messages/complete' as const }
const previous = { values: { messages: [{ role: 'human', content: 'PUBLIC_VALUE_25D' }] },
  messages: [{ ...assistant, id: messageId('existing-25d') }] }
check(projectStreamEvent(previous, explicitComplete) === previous,
  'complete event cannot replace a prior live projection')

console.log(`\n${passed} 2.5D display and streaming-boundary assertions passed`)
