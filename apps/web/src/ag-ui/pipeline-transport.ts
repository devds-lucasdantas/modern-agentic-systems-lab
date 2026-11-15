/**
 * MASL 2.6J — isolated, bounded JSON/SSE byte-to-AG-UI selected pipeline.
 * Frozen upstream ag-ui-protocol/ag-ui@2330368a2a74573902858867072406638ba3073d.
 * No HTTP request, Agent Server adapter, frontend import, generic compatibility
 * registry, custom middleware executor, recursive validation or security claim.
 * A decoded batch becomes visible to a *pure* return value only on success.
 */
import {enforceAndExpandAgUiStream, type ConsumerResult} from './chunk-enforcement'
import {reviewAgUiHttpSseBinding, type HttpReviewInput} from './stream-boundary'

type EventValue=Record<string,unknown>
export type PipelineStage = 'http-binding'|'sse-framing'|'json-decoding'|'compatibility'|
  'middleware-observe'|'enforcement'|'chunk-expansion'|'verification'|'application-boundary'
export type PipelineObservation=Readonly<{stage:PipelineStage;count:number}>
export type PipelineVerdict=
  | Readonly<{status:'accepted';events:readonly EventValue[];warnings:readonly string[];
      observations:readonly PipelineObservation[];framed:number;dropped:number;stripped:number;
      runCount:number;coverage:'selected-json-sse-pipeline'}>
  | Readonly<{status:'blocked';code:string;stage:PipelineStage;exposedCount:0;
      observations:readonly PipelineObservation[]}>

const MAX_BYTES=1_048_576
const MAX_EVENTS=500
const MAX_LINE=131_072
const MAX_CHUNKS=4_096

/**
 * Input represents an already captured, synthetic HTTP/SSE body. No network is
 * performed, and a client may not interpret HTTP 200 as run success alone.
 * Run completion and selected lifecycle checks are mandatory before exposure.
 * SSE's event/id/retry fields are ignored for AG-UI protocol semantics.
 */
export function reviewSelectedAgUiWire(
  bytes:readonly Uint8Array[], http:HttpReviewInput, connectionEnded=true,
):PipelineVerdict{
  const observations:PipelineObservation[]=[]
  const observe=(stage:PipelineStage,count:number):void=>{observations.push({stage,count})}
  const blocked=(stage:PipelineStage,code:string):PipelineVerdict=>
    ({status:'blocked',code,stage,exposedCount:0,observations})
  observe('http-binding',0)
  const issues=reviewAgUiHttpSseBinding(http)
  if(issues.length)return blocked('http-binding',`binding:${issues[0]}`)
  if(!connectionEnded)return blocked('sse-framing','stream-not-ended')
  if(bytes.length>MAX_CHUNKS)return blocked('sse-framing','chunk-limit')
  let total=0
  const frames:string[]=[]
  let buffer='', dataLines:string[]=[], frameBytes=0
  const decoder=new TextDecoder('utf-8',{fatal:true})
  const line=(rawLine:string):string|null=>{
    const text=rawLine.endsWith('\r')?rawLine.slice(0,-1):rawLine
    if(text.includes('\r'))return 'carriage-return-only-unsupported'
    if(text===''){
      if(dataLines.length){
        if(frames.length>=MAX_EVENTS)return 'event-limit'
        frames.push(dataLines.join('\n'))
        dataLines=[];frameBytes=0
      }
      return null
    }
    if(text.startsWith(':'))return null
    const sep=text.indexOf(':')
    const key=sep>=0?text.slice(0,sep):text
    const raw=sep<0?'':text.slice(sep+1)
    const value=raw.startsWith(' ')?raw.slice(1):raw
    if(key==='data'){
      dataLines.push(value)
      frameBytes+=value.length
      if(frameBytes>MAX_LINE)return 'event-payload-limit'
    }
    // All other SSE fields, including id, retry and event, are ignored.
    return null
  }
  const consume=(str:string):string|null=>{
    buffer+=str
    for(;;){
      const pos=buffer.indexOf('\n')
      if(pos<0)break
      const current=buffer.slice(0,pos)
      buffer=buffer.slice(pos+1)
      const error=line(current)
      if(error)return error
    }
    if(buffer.length>MAX_LINE)return 'line-limit'
    return null
  }
  try{
    for(const chunk of bytes){
      if(!(chunk instanceof Uint8Array))return blocked('sse-framing','invalid-byte-chunk')
      total+=chunk.byteLength
      if(total>MAX_BYTES)return blocked('sse-framing','byte-limit')
      const err=consume(decoder.decode(chunk,{stream:true}))
      if(err)return blocked('sse-framing',err)
    }
    const tail=consume(decoder.decode())
    if(tail)return blocked('sse-framing',tail)
  }catch{return blocked('sse-framing','invalid-utf8')}
  if(buffer.length||dataLines.length)return blocked('sse-framing','unterminated-event-frame')
  observe('sse-framing',frames.length)
  const decoded:unknown[]=[]
  for(const data of frames){
    let item:unknown
    try{item=JSON.parse(data)}catch{return blocked('json-decoding','malformed-json')}
    if(item===null||typeof item!=='object'||Array.isArray(item))
      return blocked('json-decoding','event-not-object')
    decoded.push(item)
  }
  observe('json-decoding',decoded.length)
  if(!decoded.length)return blocked('verification','no-run')
  // The lab has no actual retired-shape registry. Compatibility is identity.
  // Middleware is a read-only observation. No input mutation or repair.
  observe('compatibility',decoded.length)
  observe('middleware-observe',decoded.length)
  const result:ConsumerResult=enforceAndExpandAgUiStream(decoded,true)
  observe('enforcement',decoded.length)
  if(result.status==='fatal')return blocked('enforcement',`selected-consumer:${result.issues.at(-1)?.code??'fatal'}`)
  observe('chunk-expansion',result.events.length)
  observe('verification',result.lifecycle.runCount)
  // 2.6C can accept truncated runs as a diagnostic; fail closed at our app
  // boundary. A late RUN_ERROR is still terminal failure, never 200 success.
  if(!result.lifecycle.runs.length)return blocked('verification','no-terminal-run')
  if(result.lifecycle.runs.some(r=>!r.terminal||r.status==='truncated'))
    return blocked('verification','truncated-run-no-terminal')
  if(result.lifecycle.issues.some(i=>i.code==='no-terminal-run-observed'))
    return blocked('verification','no-terminal-run')
  // A selected 2.6C review may warn about unsupported semantics. Do not label
  // this accepted batch production-safe or fully protocol-conformant.
  observe('application-boundary',result.events.length)
  return {status:'accepted',events:result.events,framed:frames.length,
    warnings:result.issues.map(i=>i.code).concat(result.lifecycle.issues.map(i=>i.code)),
    observations,dropped:result.droppedCount,stripped:result.strippedCount,
    runCount:result.lifecycle.runCount,coverage:'selected-json-sse-pipeline'}
}
