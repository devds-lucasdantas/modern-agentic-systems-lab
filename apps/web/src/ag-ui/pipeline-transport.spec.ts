import {reviewSelectedAgUiWire,type PipelineVerdict} from './pipeline-transport'
import type {HttpReviewInput} from './stream-boundary'

let count=0
const check=(yes:boolean,label:string):void=>{
  if(!yes)throw new Error('FAIL: '+label)
  count++;console.log('PASS: '+label)
}
const text=(s:string):Uint8Array=>new TextEncoder().encode(s)
const wire=(events:readonly unknown[]):string=>events.map(v=>`data: ${JSON.stringify(v)}\n\n`).join('')
const http:HttpReviewInput={requestMethod:'POST',requestContentType:'application/json',
  requestAccept:'text/event-stream',responseStatus:200,
  responseContentType:'text/event-stream',lastEventIdSent:false}
const started={type:'RUN_STARTED',threadId:'t',runId:'r',protocolVersion:'1.0'}
const msgStart={type:'TEXT_MESSAGE_START',messageId:'m',role:'assistant'}
const msgBody={type:'TEXT_MESSAGE_CONTENT',messageId:'m',delta:'Olá'}
const msgEnd={type:'TEXT_MESSAGE_END',messageId:'m'}
const finished={type:'RUN_FINISHED',threadId:'t',runId:'r'}
const complete=[started,msgStart,msgBody,msgEnd,finished]
const run=(s:string,h:HttpReviewInput=http):PipelineVerdict=>reviewSelectedAgUiWire([text(s)],h)
const accepted=(v:PipelineVerdict,label:string):void=>check(v.status==='accepted',label)
const blocked=(v:PipelineVerdict,code:string,label:string):void=>{
  check(v.status==='blocked'&&v.code.includes(code),label)
  check(v.status==='blocked'&&v.exposedCount===0,`${label}: no partial application exposure`)
}

const ok=run(wire(complete));accepted(ok,'complete run wire accepted')
if(ok.status==='accepted'){
  check(ok.framed===5,'five complete JSON/SSE frames')
  check(ok.events.length===5,'five canonical events delivered only after verification')
  check(ok.events[2]!.type==='TEXT_MESSAGE_CONTENT','message content survives selected pipeline')
  check(ok.events[2]!.delta==='Olá','UTF-8 message survives byte decoder')
  check(ok.runCount===1,'one terminal run counted')
  check(ok.dropped===0&&ok.stripped===0,'no field removal in baseline')
  check(ok.coverage==='selected-json-sse-pipeline','coverage explicitly scoped')
  check(ok.observations.map(s=>s.stage).join(',')===
    'http-binding,sse-framing,json-decoding,compatibility,middleware-observe,enforcement,chunk-expansion,verification,application-boundary',
    'canonical selected pipeline order recorded')
  check(ok.observations.at(-1)?.count===5,'application boundary only after all verification')
}
const multi=wire(complete)
const bytes=text(multi)
for(const size of [1,2,3,5,7,16,31,64,127,256,1024]){
  const chunks:Uint8Array[]=[]
  for(let i=0;i<bytes.length;i+=size)chunks.push(bytes.slice(i,i+size))
  const result=reviewSelectedAgUiWire(chunks,http)
  accepted(result,`byte fragmentation ${size} preserves message frames`)
  if(result.status==='accepted'){
    check(result.events.length===5,`byte fragmentation ${size} preserves event count`)
    check(result.events[2]!.delta==='Olá',`byte fragmentation ${size} preserves UTF-8`)
  }
}
// JSON may be distributed over multiple SSE data lines, joined with LF.
const multiline=wire([started])+'data: {"type":"TEXT_MESSAGE_START",\n'+
  'data: "messageId":"m","role":"assistant"}\n\n'+
  wire([msgBody,msgEnd,finished])
accepted(run(multiline),'multiline data joined as JSON whitespace')
const withComments=': keep-alive\n\n'+wire([started])+
  'event: arbitrary\nid: unexpected\nretry: 5000\n: comment\n'+wire([msgStart,msgBody,msgEnd,finished])
const noisy=run(withComments);accepted(noisy,'ignore SSE event id retry and comments')
if(noisy.status==='accepted')check(noisy.events.length===5,'SSE metadata does not add protocol events')
accepted(run(multi.replaceAll('\n','\r\n')),'CRLF consumer tolerance')
const prefixUnknown=wire([started,{type:'FUTURE_EVENT',payload:'later'},...complete.slice(1)])
const unknown=run(prefixUnknown);accepted(unknown,'unrecognized event dropped before application')
if(unknown.status==='accepted'){
  check(unknown.dropped===1,'unknown event counted as dropped')
  check(!unknown.events.some(e=>e.type==='FUTURE_EVENT'),'unknown event never reaches application')
}
const unrecognizedProperty=run(wire([{...started,futureProperty:'x'},...complete.slice(1)]))
accepted(unrecognizedProperty,'unknown event property stripped')
if(unrecognizedProperty.status==='accepted'){
  check(unrecognizedProperty.stripped===1,'stripped property counted')
  check(!Object.hasOwn(unrecognizedProperty.events[0]!,'futureProperty'),'stripped property never reaches application')
}
for(const [code,cases] of [
  ['malformed-json','data: {\n\n'],
  ['event-not-object','data: null\n\n'],
  ['event-not-object','data: []\n\n'],
  ['malformed-json','data: \n\n'],
  ['unterminated-event-frame','data: {"type":"RUN_STARTED"}'],
  ['unterminated-event-frame',wire(complete)+'data: {"type":"RUN_STARTED"}'],
  ['unterminated-event-frame','data: {"type":"RUN_STARTED"}\n'],
  ['carriage-return-only-unsupported','data: {"type":"RUN_STARTED"}\rdata: {}\n\n'],
  ['line-limit','a'.repeat(131_073)],
  ['event-payload-limit','data: '+('a'.repeat(80_000))+'\ndata: '+('b'.repeat(80_000))+'\n\n'],
] as const){blocked(run(cases),code,`malformed SSE negative ${code} ${cases.length}`)}
const badUtf8=reviewSelectedAgUiWire([new Uint8Array([0xc3,0x28])],http)
blocked(badUtf8,'invalid-utf8','invalid UTF-8 rejects before processing')
const invalidChunk=reviewSelectedAgUiWire([null as unknown as Uint8Array],http)
blocked(invalidChunk,'invalid-byte-chunk','nonbyte chunk fails without exposure')
const tooMany=reviewSelectedAgUiWire(Array.from({length:4097},()=>new Uint8Array()),http)
blocked(tooMany,'chunk-limit','chunk count resource budget')
const tooBig=reviewSelectedAgUiWire([new Uint8Array(1_048_577)],http)
blocked(tooBig,'byte-limit','byte count resource budget')
const tooManyEvents=run(wire(Array.from({length:501},()=>({type:'FUTURE_EVENT'}))))
blocked(tooManyEvents,'event-limit','event frame resource budget')
for(const [badHttp,code] of [
  [{...http,requestMethod:'GET'},'request-not-post'],
  [{...http,requestContentType:'text/plain'},'request-not-json'],
  [{...http,requestAccept:'application/json'},'accept-missing-event-stream'],
  [{...http,responseContentType:'application/json'},'response-not-event-stream'],
  [{...http,responseStatus:401},'http-rejected-before-run-not-stream-error'],
  [{...http,lastEventIdSent:true},'ag-ui-http-sse-has-no-resume'],
] as const){blocked(run(multi,badHttp),code,`HTTP/SSE binding rejects ${code}`)}
blocked(reviewSelectedAgUiWire([bytes],http,false),'stream-not-ended','open connection cannot expose run')
blocked(run(''),'no-run','empty response cannot be marked success')
blocked(run(': heartbeat\n\n'),'no-run','heartbeat-only response cannot be marked success')
blocked(run(wire([started,msgStart,msgBody])),'truncated','open message and no terminal is not success')
blocked(run(wire([started,msgStart,msgBody,msgEnd])),'truncated','EOF without terminal is not success')
blocked(run(wire([started,finished,{type:'TEXT_MESSAGE_START',messageId:'later',role:'assistant'}])),
  'lifecycle','events after terminal fail closed')
blocked(run(wire([started,{type:'TEXT_MESSAGE_CONTENT',messageId:'m',delta:'x'},finished])),
  'lifecycle','content before opener fails closed')
blocked(run(wire([started,{type:'TEXT_MESSAGE_START',messageId:'m',role:55},finished])),
  'known-field-invalid','malformed known role rejected, not stripped')
blocked(run(wire([started,finished,{type:'RUN_STARTED',threadId:'t2',runId:'r2'}])),
  'truncated','sequential replay run without terminal remains truncated')
const lateError=run(wire([started,finished,{type:'RUN_ERROR',message:'late failure'}]))
accepted(lateError,'late RUN_ERROR is a terminal failure, not silent success')
if(lateError.status==='accepted')check(lateError.events.at(-1)?.type==='RUN_ERROR','late run error remains observable')
// Real 2.6D chunk expansion is exercised: not merely a stage trace.
const chunks=run(wire([started,{type:'TEXT_MESSAGE_CHUNK',messageId:'m',role:'assistant',delta:'hi'},finished]))
accepted(chunks,'2.6D real chunk expansion composes with SSE framing')
if(chunks.status==='accepted'){
  check(chunks.framed===3,'three wire frames before expansion')
  check(chunks.events.some(e=>e.type==='TEXT_MESSAGE_START'),'chunk expansion produces start')
  check(chunks.events.some(e=>e.type==='TEXT_MESSAGE_CONTENT'),'chunk expansion produces content')
  check(chunks.events.some(e=>e.type==='TEXT_MESSAGE_END'),'chunk expansion produces end')
}
check(ok.status==='accepted' && ok.observations.every(t=>!('data' in t)),
  'observations carry stage/count only, no input body')
console.log(`${count} 2.6J selected executable pipeline/transport assertions passed`)
