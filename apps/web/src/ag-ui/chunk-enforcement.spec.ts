/** MASL 2.6D — deterministic, model-free consumer-boundary tests. */
import { enforceAgUiEventEnvelope, enforceAndExpandAgUiStream } from './chunk-enforcement'
import { checkAgUiEnvelope } from './event-grammar'

let passed = 0
const check = (ok: boolean, reason: string): void => {
  if (!ok) throw Error(`FAIL: ${reason}`)
  passed += 1
  console.log(`PASS: ${reason}`)
}
const run = (id = 'run-26d') => ({ type: 'RUN_STARTED', threadId: 'thread-26d', runId: id, protocolVersion:'1.0' })
const finish = (id = 'run-26d') => ({ type: 'RUN_FINISHED', threadId: 'thread-26d', runId: id })
const toolChunk = (extras: Record<string, unknown> = {}) => ({
  type:'TOOL_CALL_CHUNK',toolCallId:'call1',toolCallName:'lookup', delta:'{"code":"ALPHA"}',...extras,
})
const textChunk = (extras: Record<string, unknown> = {}) => ({
  type:'TEXT_MESSAGE_CHUNK',messageId:'m1',role:'assistant',delta:'hello',...extras,
})
const reasonChunk = (extras: Record<string, unknown> = {}) => ({
  type:'REASONING_MESSAGE_CHUNK',messageId:'why1',delta:'reason',...extras,
})
const stream = (...events: Record<string, unknown>[]) => enforceAndExpandAgUiStream([run(), ...events, finish()])
const accepted = (value: ReturnType<typeof enforceAndExpandAgUiStream>) => {
  if (value.status !== 'accepted') throw Error('FAIL: expected accepted, got fatal: '+JSON.stringify(value.issues))
  return value
}
const fatal = (value: ReturnType<typeof enforceAndExpandAgUiStream>, code: string) => {
  check(value.status === 'fatal' && value.issues.some(e => e.code === code), `fatal protocol violation: ${code}`)
  check(value.status === 'fatal' && value.emittedCount === 0 && !('events' in value), `fatal ${code} returns no data events`)
}
const types = (value: ReturnType<typeof enforceAndExpandAgUiStream>): string[] =>
  accepted(value).events.map(e => String(e.type))
const pattern = (name: string, input: Record<string, unknown>, expected: string[]) => {
  const result = stream(input)
  check(JSON.stringify(types(result)) === JSON.stringify(['RUN_STARTED',...expected,'RUN_FINISHED']), `${name} expanded in order`)
  const review = accepted(result).lifecycle
  check(review.runCount === 1 && review.runs[0]?.status === 'finished', `${name} successful explicit lifecycle`)
  check(!review.issues.some(e=>e.code==='open-items-at-run-finish'), `${name} no unclosed explicit items`)
}

pattern('text chunk',textChunk(),['TEXT_MESSAGE_START','TEXT_MESSAGE_CONTENT','TEXT_MESSAGE_END'])
pattern('tool chunk',toolChunk(),['TOOL_CALL_START','TOOL_CALL_ARGS','TOOL_CALL_END'])
pattern('reasoning chunk',reasonChunk(),['REASONING_MESSAGE_START','REASONING_MESSAGE_CONTENT','REASONING_MESSAGE_END'])
for(const [tag, chunk, contentType, idName] of [
  ['text',textChunk(),'TEXT_MESSAGE_CONTENT','messageId'],
  ['tool',toolChunk(),'TOOL_CALL_ARGS','toolCallId'],
  ['reasoning',reasonChunk(),'REASONING_MESSAGE_CONTENT','messageId'],
] as const){
  const result=accepted(stream(chunk))
  check(result.events.some(e=>e.type===contentType && e.delta===chunk.delta), `${tag} delta preserved verbatim`)
  check(result.events.filter(e=>e.type===contentType).every(e=>e[idName]===(chunk as Record<string, unknown>)[idName]), `${tag} identity preserved across fragments`)
  check(result.events.every(e=>checkAgUiEnvelope(e).valid), `${tag} synthetic envelopes accepted by 2.6B grammar`)
}

const unknown=enforceAgUiEventEnvelope({type:'UNRECOGNIZED_26D', rawEvent:'secret'})
check(unknown.kind==='dropped' && unknown.code==='unknown-event', 'unknown future event dropped, not fatal')
const stripped=enforceAgUiEventEnvelope({type:'RUN_STARTED',threadId:'t',runId:'r',newProp:'secret',metadata:{open_key:'keep'}})
check(stripped.kind==='accepted' && !Object.hasOwn(stripped.event,'newProp'), 'unknown top-level closed property stripped')
check(stripped.kind==='accepted' && (stripped.event.metadata as Record<string,string>).open_key==='keep', 'open metadata object preserved')
check(stripped.kind==='accepted' && stripped.stripped.join(',')==='newProp','stripped path identified by key only')
const mask=accepted(stream(textChunk({externalPayload:'SECRET_ARG_26D',metadata:{provider:'SECRET_META_26D'}})))
check(mask.strippedCount===1,'unknown property counted')
check(mask.issues.some(e=>e.code==='stripped:externalPayload'), 'unknown property causes bounded warning')
check(!JSON.stringify(mask.issues).includes('SECRET'), 'warning does not leak payload')
check(mask.events.some(e=>e.type==='TEXT_MESSAGE_START' && (e.metadata as Record<string,string>).provider==='SECRET_META_26D'), 'known metadata retained in isolated output')
const newer=accepted(enforceAndExpandAgUiStream([run(), {type:'FUTURE_VENDOR_EVENT',x:'secret'},finish()]))
check(newer.droppedCount===1 && newer.lifecycle.runs[0]?.status==='finished','unknown event does not abort run')
check(newer.issues.some(e=>e.code==='unknown-event'),'unknown event warning is explicit')
check(!newer.events.some(e=>e.type==='FUTURE_VENDOR_EVENT'),'unknown event never reaches validated output')

fatal(stream(textChunk({delta:123})), 'known-field-invalid')
fatal(stream(textChunk({messageId:12})), 'known-field-invalid')
fatal(stream(toolChunk({toolCallName:null})), 'known-field-invalid')
fatal(stream({type:'RUN_FINISHED',threadId:'t',runId:11}), 'known-field-invalid')
fatal(stream({type:'RUN_ERROR',message:5}), 'known-field-invalid')
fatal(stream({type:'STATE_SNAPSHOT',snapshot:()=>2}), 'known-field-invalid')
fatal(stream({type:'TOOL_CALL_RESULT',toolCallId:'a',messageId:'b',content:'x',role:'assistant'}), 'known-field-invalid')
fatal(enforceAndExpandAgUiStream([null]), 'invalid-json-object')
fatal(enforceAndExpandAgUiStream([{type:5}]), 'missing-type')
check(enforceAgUiEventEnvelope({type:'TEXT_MESSAGE_START',messageId:'m',role:'not-yet-defined'}).kind==='accepted', 'unrecognized optional enum member stripped for compatibility')
check(enforceAgUiEventEnvelope({type:'REASONING_ENCRYPTED_VALUE',subtype:'future-kind',entityId:'a',encryptedValue:'opaque'}).kind==='dropped', 'unrecognized required enum drops containing event')
check(enforceAgUiEventEnvelope({type:'TEXT_MESSAGE_START',messageId:'m',role:8}).kind==='fatal', 'malformed known enum type remains fatal')
check(enforceAgUiEventEnvelope({type:'REASONING_MESSAGE_START',messageId:'m',role:'new-reasoning-role'}).kind==='dropped', 'unknown required reasoning role drops event')
check(enforceAgUiEventEnvelope({type:'REASONING_MESSAGE_START',messageId:'m',role:99}).kind==='fatal', 'invalid required reasoning role type is fatal')
const optional=accepted(stream(textChunk({role:'future-role'})))
check(optional.events.some(e=>e.type==='TEXT_MESSAGE_START' && e.role==='assistant'), 'unknown optional first-chunk role falls back to normal assistant default')
check(optional.issues.some(e=>e.code==='stripped:role'),'optional unknown role removal warned')

fatal(stream({type:'TEXT_MESSAGE_CHUNK',delta:'x'}), 'chunk-ambiguous-or-unopened')
fatal(stream({type:'TOOL_CALL_CHUNK',toolCallId:'t',delta:'x'}), 'chunk-first-tool-name-missing')
fatal(stream({type:'REASONING_MESSAGE_CHUNK',delta:'x'}), 'chunk-ambiguous-or-unopened')
const noDelta = accepted(stream({type:'TEXT_MESSAGE_CHUNK',messageId:'m1'}))
check(types(noDelta).includes('TEXT_MESSAGE_END'), 'first chunk without delta may still close')
check(!types(noDelta).includes('TEXT_MESSAGE_CONTENT'), 'first chunk without delta does not invent text')
const metaOnly = accepted(stream(textChunk(),{type:'TEXT_MESSAGE_CHUNK',metadata:{last:true}}))
check(metaOnly.events.filter(e=>e.type==='TEXT_MESSAGE_CONTENT').length===2,'metadata-only continuation emits synthetic empty content')
check(metaOnly.events.some(e=>e.type==='TEXT_MESSAGE_CONTENT' && e.delta==='' &&
  (e.metadata as Record<string,boolean> | undefined)?.last===true),'metadata-only content retains metadata')
check(metaOnly.events.some(e=>e.type==='TEXT_MESSAGE_START' && !Object.hasOwn(e,'timestamp')), 'synthetic start does not invent chunk timestamp')
const repeat=accepted(stream(textChunk(),{type:'TEXT_MESSAGE_CHUNK',delta:' world'}))
check(repeat.events.filter(e=>e.type==='TEXT_MESSAGE_CONTENT').length===2,'identifier-free continuation of parent lane')
check(repeat.events.some(e=>e.type==='TEXT_MESSAGE_CONTENT' && e.delta===' world'),'continuation delta preserved')
const repeated=accepted(stream(toolChunk(),{type:'TOOL_CALL_CHUNK',toolCallName:'lookup',delta:'more'}))
check(repeated.events.filter(e=>e.type==='TOOL_CALL_ARGS').length===2,'tool opener name repeated consistently')

fatal(stream(textChunk({role:undefined}),{type:'TEXT_MESSAGE_CHUNK',role:'user',delta:'x'}), 'known-field-invalid')
fatal(stream({type:'TEXT_MESSAGE_CHUNK',messageId:'m1',delta:'a'},
  {type:'TEXT_MESSAGE_CHUNK',role:'user',delta:'b'}), 'chunk-opener-conflict')
fatal(stream(textChunk({name:'speaker1'}),{type:'TEXT_MESSAGE_CHUNK',name:'speaker2',delta:'x'}),'chunk-opener-conflict')
fatal(stream(toolChunk(),{type:'TOOL_CALL_CHUNK',toolCallName:'other',delta:'x'}),'chunk-opener-conflict')
fatal(stream(toolChunk({parentMessageId:'msg1'}),{type:'TOOL_CALL_CHUNK',parentMessageId:'msg2',delta:'x'}),'chunk-opener-conflict')
const changing=accepted(stream(textChunk(),textChunk({messageId:'m2',delta:'next'})))
check(changing.events.filter(e=>e.type==='TEXT_MESSAGE_START').length===2,'new id opens second text stream')
check(changing.events.filter(e=>e.type==='TEXT_MESSAGE_END').length===2,'different item closes previous stream first')
check(types(changing).join('|').includes('TEXT_MESSAGE_END|TEXT_MESSAGE_START'),'old chunk ends before new item opens')
const swapped=accepted(stream(textChunk(),toolChunk()))
check(types(swapped).join('|').includes('TEXT_MESSAGE_END|TOOL_CALL_START'),'different chunk kind closes preceding same-lane chunk')
const reopened=accepted(stream(textChunk(),textChunk({messageId:'m2'}),textChunk({messageId:'m1',delta:'again'})))
check(reopened.events.filter(e=>e.type==='TEXT_MESSAGE_START').length===3,'consistent prior id may reopen as a new segment')
fatal(stream(textChunk(),textChunk({messageId:'m2'}),textChunk({messageId:'m1',role:'user'})), 'chunk-reopen-field-conflict')
const standalone=accepted(stream(textChunk(),{type:'RAW',event:{provider:'P'}},
  {type:'ACTIVITY_SNAPSHOT',messageId:'act',activityType:'note',content:{}},
  {type:'REASONING_ENCRYPTED_VALUE',subtype:'message',entityId:'m',encryptedValue:'opaque'},
  {type:'TEXT_MESSAGE_CHUNK',delta:' continued'}))
check(standalone.events.filter(e=>e.type==='TEXT_MESSAGE_CONTENT').length===2,
  'RAW, ACTIVITY and encrypted value do not interrupt the chunk lane')
check(types(standalone).indexOf('TEXT_MESSAGE_END')>types(standalone).indexOf('REASONING_ENCRYPTED_VALUE'),
  'special standalone events precede eventual chunk closure')
const plain=accepted(stream(textChunk(),{type:'CUSTOM',name:'boundary',value:42}))
check(types(plain).join('|').includes('TEXT_MESSAGE_END|CUSTOM'), 'CUSTOM closes open chunk lane')
const snapshot=accepted(stream(textChunk(),{type:'MESSAGES_SNAPSHOT',messages:[]}))
check(types(snapshot).join('|').includes('TEXT_MESSAGE_END|MESSAGES_SNAPSHOT'), 'run-wide snapshot closes lanes')

const subA={type:'SUBAGENT_STARTED',subagentRunId:'subA',name:'worker'}
const subB={type:'SUBAGENT_STARTED',subagentRunId:'subB',name:'worker'}
const subText = (owner:string,id:string,delta='a')=>({type:'TEXT_MESSAGE_CHUNK',messageId:id,subagentRunId:owner,delta})
const multiple=accepted(stream(subA,subB,subText('subA','mA'),subText('subB','mB'),
  {type:'TEXT_MESSAGE_CHUNK',subagentRunId:'subA',delta:'x'},
  {type:'SUBAGENT_FINISHED',subagentRunId:'subA'},
  {type:'TEXT_MESSAGE_CHUNK',subagentRunId:'subB',delta:'y'},
  {type:'SUBAGENT_FINISHED',subagentRunId:'subB'}))
check(multiple.events.filter(e=>e.type==='TEXT_MESSAGE_END').length===2,'each subagent lane closes independently')
check(multiple.events.some(e=>e.type==='TEXT_MESSAGE_CONTENT'&&e.subagentRunId==='subB'&&e.delta==='y'),
  'other subagent continues after peer finishes')
const singleSub=accepted(stream(subA,subText('subA','mA'),{type:'TEXT_MESSAGE_CHUNK',delta:'same subagent'},
  {type:'SUBAGENT_FINISHED',subagentRunId:'subA'}))
check(singleSub.events.some(e=>e.type==='TEXT_MESSAGE_CONTENT' && e.subagentRunId==='subA' && e.delta==='same subagent'),
  'single active subagent can resolve untagged identifier-free continuation')
fatal(stream(subA,subB,subText('subA','mA'),subText('subB','mB'),
  {type:'TEXT_MESSAGE_CHUNK',delta:'ambiguous'}),'chunk-ambiguous-or-unopened')
fatal(stream(subA,subText('subA','mA'),{type:'TEXT_MESSAGE_CHUNK',messageId:'mA',subagentRunId:'subB',delta:'hijack'}),'chunk-owner-conflict')
const parentPreferred=accepted(stream(subA,subText('subA','mA'),textChunk(),{type:'TEXT_MESSAGE_CHUNK',delta:'parent'},
  {type:'SUBAGENT_FINISHED',subagentRunId:'subA'}))
check(parentPreferred.events.some(e=>e.type==='TEXT_MESSAGE_CONTENT'&&e.delta==='parent'&&!e.subagentRunId),
  'parent lane takes precedence for identifier-free continuation')
const late=accepted(enforceAndExpandAgUiStream([run(),textChunk()],true))
check(late.lifecycle.runs.some(r=>r.status==='truncated'&&!r.terminal),'EOF without terminal is truncated')
check(late.events.every(e=>e.type!=='TEXT_MESSAGE_END'),'EOF does not synthesize a closing chunk event')
const err=accepted(enforceAndExpandAgUiStream([run(),textChunk(),{type:'RUN_ERROR',message:'failed'}],true))
check(types(err).join('|').includes('TEXT_MESSAGE_END|RUN_ERROR'),'run error closes pending shorthand before terminal')
check(err.lifecycle.runs[0]?.status==='failed','run error not mistaken for success')
const many=accepted(enforceAndExpandAgUiStream([run('r1'),textChunk(),finish('r1'),run('r2'),toolChunk(),finish('r2')]))
check(many.lifecycle.runCount===2 && many.lifecycle.runs.every(x=>x.status==='finished'),'two sequential runs preserved')
check(many.events.filter(e=>e.type==='RUN_STARTED').length===2,'no synthetic run start introduced')
fatal(enforceAndExpandAgUiStream(Array.from({length:1001},()=>({type:'CUSTOM',name:'x',value:null}))), 'local-event-limit')


// The canonical stream is checked against the explicit 2.6C lifecycle before
// it could be passed to application code; no partial events escape failures.
fatal(enforceAndExpandAgUiStream([{type:'TEXT_MESSAGE_START',messageId:'m'}]), 'lifecycle:event-before-run')
fatal(enforceAndExpandAgUiStream([run(),run('nested'),finish()]), 'lifecycle:nested-run-start')
fatal(enforceAndExpandAgUiStream([run(),{type:'TEXT_MESSAGE_CONTENT',messageId:'orphan',delta:'x'},finish()]), 'lifecycle:message-content-without-open')
fatal(enforceAndExpandAgUiStream([run(),{type:'TOOL_CALL_END',toolCallId:'orphan'},finish()]), 'lifecycle:tool-end-without-open')
fatal(enforceAndExpandAgUiStream([run(),finish('other')]), 'lifecycle:run-identity-conflict')
fatal(enforceAndExpandAgUiStream([run(),finish(),{type:'CUSTOM',name:'after',value:3}]), 'lifecycle:event-after-terminal')


// A closed chunk may reopen in the same run only under its original owner.
fatal(stream(subA,subB,subText('subA','mX'),{type:'SUBAGENT_FINISHED',subagentRunId:'subA'},
  subText('subB','mX')), 'chunk-reopen-field-conflict')
const separateRuns=accepted(enforceAndExpandAgUiStream([
  run('r1'),textChunk(),finish('r1'),run('r2'),textChunk({role:'user',delta:'second run'}),finish('r2'),
]))
check(separateRuns.lifecycle.runCount===2,'replayed streams may open new Run with same message id')
check(separateRuns.events.some(e=>e.type==='TEXT_MESSAGE_START' && e.role==='user'),
  'cross-run local opener comparison is reset; protocol producer retains its own duty')


// Empty-string subagent invocation handles are structurally valid opaque IDs;
// they must never collide with the untagged parent lane.
const emptySub=accepted(stream(
  {type:'SUBAGENT_STARTED',subagentRunId:'',name:'worker'},
  subText('','sub-empty'),textChunk(),
  {type:'TEXT_MESSAGE_CHUNK',messageId:'sub-empty',subagentRunId:'',delta:'on empty subagent'},
  {type:'SUBAGENT_FINISHED',subagentRunId:''},
))
check(emptySub.events.some(e=>e.type==='TEXT_MESSAGE_CONTENT' && e.subagentRunId==='' &&
  e.delta==='on empty subagent'), 'empty-string subagent ID remains distinct from parent')
check(emptySub.events.filter(e=>e.type==='TEXT_MESSAGE_END').length===2,
  'empty-string subagent and parent lanes close independently')

console.log(`\n${passed} 2.6D consumer enforcement + chunk expansion assertions passed`)
