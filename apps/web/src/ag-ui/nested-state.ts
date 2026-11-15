/**
 * MASL 2.6E — selected nested AG-UI 1.0 contracts, atomic synthetic state and
 * subagent lifecycle. Schema pin: ag-ui-protocol/ag-ui@2330368a2a74573902858867072406638ba3073d
 * (blob c2ce3c18036b6bb2afe583a9b916959e7dcd9b78).
 *
 * NOT a complete recursive JSON Schema implementation or an AG-UI adapter.
 * This is a pure, synchronous review utility: no I/O, model, browser, tool,
 * authorization, durable store, or mutation of caller-owned input.
 */
import { checkAgUiEnvelope } from './event-grammar'

type ObjectValue = Record<string, unknown>
const object = (v: unknown): v is ObjectValue =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const own = (v: ObjectValue, k: string): boolean => Object.hasOwn(v, k)
const json = (v: unknown, depth = 0): boolean => {
  if (depth > 28) return false
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true
  if (typeof v === 'number') return Number.isFinite(v)
  if (Array.isArray(v)) return v.length <= 2000 && v.every(x => json(x, depth + 1))
  if (object(v)) {
    const entries = Object.entries(v)
    return entries.length <= 2000 && entries.every(([,x]) => json(x, depth + 1))
  }
  return false
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const fields = (o: ObjectValue, allow: readonly string[], required: readonly string[]): boolean =>
  required.every(k => own(o,k)) && Object.keys(o).every(k => allow.includes(k))
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 2000 && v.every(x => typeof x === 'string')
const validMeta = (v: unknown): boolean => object(v) && json(v)
const optional = (o: ObjectValue, k: string, test: (x: unknown)=>boolean): boolean =>
  !own(o,k) || test(o[k])

export type NestedCheck = Readonly<{ valid: true; coverage: 'selected-nested'|'not-reviewed' }>
  | Readonly<{ valid: false; code: string }>

/** RunFinishedOutcome and SubagentFinishedOutcome are closed discriminated unions. */
export const checkRunOutcome = (v: unknown): boolean => {
  if (!object(v) || typeof v.type !== 'string' || !json(v)) return false
  if (v.type === 'success')
    return fields(v,['type','pendingToolCallIds'],['type']) &&
      optional(v,'pendingToolCallIds',strings)
  if (v.type === 'cancelled') return fields(v,['type'],['type'])
  if (v.type === 'interrupt') {
    if (!fields(v,['type','interrupts'],['type','interrupts']) ||
        !Array.isArray(v.interrupts) || !v.interrupts.length || v.interrupts.length > 256) return false
    const ids = new Set<string>()
    return v.interrupts.every((entry: unknown) => {
      if (!object(entry) || !fields(entry,
        ['id','reason','message','toolCallId','responseSchema','expiresAt','metadata','subagentRunId'],
        ['id','reason']) || typeof entry.id !== 'string' || typeof entry.reason !== 'string' ||
        !optional(entry,'message',x=>typeof x==='string') ||
        !optional(entry,'toolCallId',x=>typeof x==='string') ||
        !optional(entry,'subagentRunId',x=>typeof x==='string') ||
        !optional(entry,'expiresAt',x=>typeof x==='string') ||
        !optional(entry,'responseSchema',object) ||
        !optional(entry,'metadata',validMeta) || ids.has(entry.id)) return false
      ids.add(entry.id); return true
    })
  }
  return false
}
export const checkSubagentOutcome = (v: unknown): boolean =>
  object(v) && json(v) &&
  ((v.type === 'success' && fields(v,['type'],['type'])) ||
   (v.type === 'suspended' && fields(v,['type','interruptIds'],['type']) &&
     optional(v,'interruptIds',strings)))

/** Shallow RunAgentInput subset: messages, media, tools' parameter schema and
 * resume payloads remain opaque beyond the checked top-level members. */
export const checkSelectedRunInput = (v: unknown): boolean => {
  if (!object(v) || !json(v) ||
      !fields(v,['threadId','runId','protocolVersion','parentRunId','state','messages',
        'tools','context','forwardedProps','resume'],['threadId','runId','messages']) ||
      typeof v.threadId !== 'string' || typeof v.runId !== 'string' || !Array.isArray(v.messages)) return false
  return optional(v,'protocolVersion',x=>typeof x==='string') &&
    optional(v,'parentRunId',x=>typeof x==='string') &&
    optional(v,'state',x=>x!==null && json(x)) &&
    optional(v,'forwardedProps',x=>x!==null && json(x)) &&
    optional(v,'tools',x=>Array.isArray(x) && x.every(t=>object(t) &&
      fields(t,['name','description','parameters','metadata'],['name','description']) &&
      typeof t.name==='string' && typeof t.description==='string' &&
      optional(t,'parameters',y=>y!==null && json(y)) && optional(t,'metadata',validMeta))) &&
    optional(v,'context',x=>Array.isArray(x) && x.every(c=>object(c) &&
      fields(c,['description','value'],['description','value']) &&
      typeof c.description==='string' && typeof c.value==='string')) &&
    optional(v,'resume',x=>Array.isArray(x) && x.every(e=>object(e) &&
      fields(e,['interruptId','status','payload','metadata'],['interruptId','status']) &&
      typeof e.interruptId==='string' && (e.status==='resolved'||e.status==='cancelled') &&
      optional(e,'payload',y=>y!==null&&json(y)) && optional(e,'metadata',validMeta)))
}

export type PatchOperation = Readonly<{ op:string; path?:string; from?:string; value?:unknown }>
export type PatchCheck = Readonly<{ valid: true; ignoredUnknownOps: number }> |
  Readonly<{ valid: false; code:'not-array'|'limit'|'invalid-operation'|'invalid-pointer'; index:number }>
const pointerPattern = /^(\/(?:[^/~]|~[01])*)*$/
const pointer = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 4096 && pointerPattern.test(v)
const patchOpNames = ['add','remove','replace','move','copy','test'] as const

/** Open operation objects per RFC 6902: extra members MUST be preserved.
 * Unknown future operations are skipped with a warning, not made fatal. */
export const checkPatch = (v: unknown): PatchCheck => {
  if (!Array.isArray(v)) return {valid:false,code:'not-array',index:0}
  if (v.length > 256) return {valid:false,code:'limit',index:256}
  let unknown = 0
  for (let i=0;i<v.length;i++) {
    const op:unknown = v[i]
    if (!object(op) || typeof op.op!=='string' || !json(op))
      return {valid:false,code:'invalid-operation',index:i}
    if (!patchOpNames.includes(op.op as typeof patchOpNames[number])) {
      unknown++; continue
    }
    if (!pointer(op.path) ||
        ((op.op==='move'||op.op==='copy') && !pointer(op.from)))
      return {valid:false,code:'invalid-pointer',index:i}
    if (['add','replace','test'].includes(op.op) && !own(op,'value'))
      return {valid:false,code:'invalid-operation',index:i}
  }
  return {valid:true,ignoredUnknownOps:unknown}
}

/** Selected nested verifier. Always check the published 2.6B envelope first.
 * 'not-reviewed' MUST NOT be mistaken for recursive schema compliance. */
export const checkSelectedNestedEvent = (v: unknown): NestedCheck => {
  const envelope = checkAgUiEnvelope(v)
  if (!envelope.valid) return { valid:false, code:`envelope-${envelope.reason}` }
  const e = v as ObjectValue
  const t = envelope.type
  if (t === 'RUN_FINISHED' && own(e,'outcome')) {
    if (object(e.outcome) && typeof e.outcome.type === 'string' &&
        !['success','cancelled','interrupt'].includes(e.outcome.type))
      return {valid:true,coverage:'not-reviewed'} // future union arm: drop/warn upstream
    return checkRunOutcome(e.outcome) ? {valid:true,coverage:'selected-nested'} : {valid:false,code:'run-outcome'}
  }
  if (t === 'SUBAGENT_FINISHED' && own(e,'outcome')) {
    if (object(e.outcome) && typeof e.outcome.type === 'string' &&
        !['success','suspended'].includes(e.outcome.type))
      return {valid:true,coverage:'not-reviewed'} // never treat future arm as success
    return checkSubagentOutcome(e.outcome) ? {valid:true,coverage:'selected-nested'} : {valid:false,code:'subagent-outcome'}
  }
  if (t === 'RUN_STARTED' && own(e,'input'))
    return checkSelectedRunInput(e.input) ? {valid:true,coverage:'selected-nested'} : {valid:false,code:'run-input'}
  if (t === 'STATE_DELTA' || t === 'ACTIVITY_DELTA') {
    const p = checkPatch(t==='STATE_DELTA'? e.delta : e.patch)
    return p.valid ? {valid:true,coverage:'selected-nested'} : {valid:false,code:`patch-${p.code}`}
  }
  return {valid:true,coverage:'not-reviewed'}
}

const tokens = (p: string): string[] => p === '' ? [] :
  p.slice(1).split('/').map(x => x.replace(/~1/g,'/').replace(/~0/g,'~'))
const indexOf = (p: string, length: number, insert: boolean): number => {
  if (insert && p==='-') return length
  if (!/^(0|[1-9]\d*)$/.test(p)) throw Error('noncanonical-array-index')
  const n=Number(p)
  if (!Number.isSafeInteger(n) || n < 0 || n >= length+(insert?1:0))
    throw Error('array-index-out-of-range')
  return n
}
const at = (root: unknown, path: string): unknown => {
  let value: unknown=root
  for (const token of tokens(path)) {
    if (Array.isArray(value)) value=value[indexOf(token,value.length,false)]
    else if (object(value) && own(value,token)) value=value[token]
    else throw Error('pointer-target-missing')
  }
  return value
}
const parent = (root: unknown, path: string): {target: ObjectValue|unknown[];key:string} => {
  const ts=tokens(path)
  if (!ts.length) throw Error('root-has-no-parent')
  const key=ts.pop()!
  let cur:unknown=root
  for(const x of ts) {
    if(Array.isArray(cur)) cur=cur[indexOf(x,cur.length,false)]
    else if(object(cur) && own(cur,x)) cur=cur[x]
    else throw Error('pointer-parent-missing')
  }
  if (!object(cur) && !Array.isArray(cur)) throw Error('pointer-parent-not-container')
  return {target:cur,key}
}
const setOwn = (o: ObjectValue,k:string,v:unknown) => {
  Object.defineProperty(o,k,{value:v,configurable:true,enumerable:true,writable:true})
}
const change = (root:unknown, path:string, op:'add'|'replace'|'remove', value?:unknown):unknown => {
  if(path==='') {
    if(op==='remove') throw Error('cannot-remove-root')
    return clone(value)
  }
  const {target,key}=parent(root,path)
  if(Array.isArray(target)) {
    const ix=indexOf(key,target.length,op==='add')
    if(op==='add') target.splice(ix,0,clone(value))
    else if(op==='remove') target.splice(ix,1)
    else target[ix]=clone(value)
  } else {
    if(op!=='add'&&!own(target,key)) throw Error('pointer-target-missing')
    if(op==='remove') delete target[key]
    else setOwn(target,key,clone(value))
  }
  return root
}
const same = (a:unknown,b:unknown):boolean => {
  if(a===b) return true
  if(Array.isArray(a) && Array.isArray(b))
    return a.length===b.length && a.every((v,i)=>same(v,b[i]))
  if(object(a) && object(b)) {
    const aa=Object.keys(a),bb=Object.keys(b)
    return aa.length===bb.length && aa.every(k=>own(b,k)&&same(a[k],b[k]))
  }
  return false
}
export type PatchApplication = Readonly<{
  status:'applied'|'skipped-application'|'fatal-structure';
  value:unknown; ignoredUnknownOps:number; issue:string|null
}>
/** Atomic synthetic patch; no side effect or mutation of caller state. A
 * well-formed but non-applicable patch is warned and skipped as AG-UI 1.0 says. */
export const applySyntheticPatch = (source:unknown, patch:unknown):PatchApplication => {
  if(!json(source)) return {status:'fatal-structure',value:null,ignoredUnknownOps:0,issue:'non-json-baseline'}
  const baseline=clone(source)
  const checked=checkPatch(patch)
  if(!checked.valid) return {status:'fatal-structure',value:baseline,ignoredUnknownOps:0,issue:checked.code}
  let value:unknown=clone(source)
  try {
    for(const candidate of patch as ObjectValue[]) {
      const op=candidate.op
      if(!patchOpNames.includes(op as typeof patchOpNames[number])) continue
      const path=candidate.path as string
      const from=candidate.from as string
      if(op==='add') value=change(value,path,'add',candidate.value)
      else if(op==='remove') value=change(value,path,'remove')
      else if(op==='replace') value=change(value,path,'replace',candidate.value)
      else if(op==='test') { if(!same(at(value,path),candidate.value)) throw Error('json-patch-test-failed') }
      else if(op==='copy') value=change(value,path,'add',at(value,from))
      else if(op==='move') {
        if(path===from) { at(value,from); continue }
        if(path.startsWith(from+'/') || from==='') throw Error('move-into-descendant')
        const moved=clone(at(value,from))
        value=change(value,from,'remove')
        value=change(value,path,'add',moved)
      }
    }
  } catch(e) {
    // Do not leak patch contents, state contents or identifiers in diagnostics.
    return {status:'skipped-application',value:baseline,ignoredUnknownOps:checked.ignoredUnknownOps,
      issue:e instanceof Error?e.message:'patch-application-failed'}
  }
  return {status:'applied',value,ignoredUnknownOps:checked.ignoredUnknownOps,issue:null}
}
export type StateReview = Readonly<{value:unknown; diagnostics:readonly {index:number;code:string}[];fatal:boolean}>
/** State is RUN-SCOPED, even when snapshot/delta bears subagentRunId. */
export const replaySyntheticState = (initial:unknown, events:readonly unknown[]):StateReview => {
  const diagnostics:{index:number;code:string}[]=[]
  if(!json(initial)) return {value:null,diagnostics:[{index:-1,code:'invalid-initial-state'}],fatal:true}
  let value:unknown=clone(initial)
  const max=Math.min(events.length,500)
  for(let i=0;i<max;i++) {
    const e=events[i]
    const checked=checkSelectedNestedEvent(e)
    if(!checked.valid) return {value:clone(initial),diagnostics:[...diagnostics,{index:i,code:checked.code}],fatal:true}
    const item=e as ObjectValue
    if(item.type==='STATE_SNAPSHOT') value=clone(item.snapshot)
    else if(item.type==='STATE_DELTA') {
      const result=applySyntheticPatch(value,item.delta)
      if(result.status==='fatal-structure') return {value:clone(initial),diagnostics:[...diagnostics,{index:i,code:'invalid-patch'}],fatal:true}
      if(result.status==='skipped-application') diagnostics.push({index:i,code:'patch-skipped'})
      if(result.ignoredUnknownOps) diagnostics.push({index:i,code:'unknown-patch-op-skipped'})
      value=result.value
    }
  }
  if(events.length>max) return {value:clone(initial),diagnostics:[...diagnostics,{index:max,code:'event-limit'}],fatal:true}
  return {value,diagnostics,fatal:false}
}
export type SubagentReview = Readonly<{issues:readonly {index:number;code:string}[];activeCount:number;terminal:boolean}>
/** Review only announced subagent lifecycles and attribution boundaries.
 * Tags without announcement are permitted by AG-UI; orphan tags are not
 * by themselves protocol violations. This is NOT the full verifier. */
export const reviewSubagents = (events:readonly unknown[]):SubagentReview => {
  const issues:{index:number;code:string}[]=[]
  const announced=new Map<string,string|null>()
  const active=new Set<string>()
  let inRun=false, terminal=false
  const limit=Math.min(events.length,1000)
  const note=(index:number,code:string)=>issues.push({index,code})
  for(let i=0;i<limit;i++) {
    const checked=checkSelectedNestedEvent(events[i])
    if(!checked.valid) { note(i,checked.code);continue }
    const e=events[i] as ObjectValue, t=e.type
    if(t==='RUN_STARTED') {
      if(inRun) note(i,'nested-run-start')
      else {announced.clear();active.clear();inRun=true;terminal=false}
      continue
    }
    if(t==='RUN_ERROR') { active.clear();inRun=false;terminal=true;continue }
    if(!inRun) { note(i,'event-without-open-run');continue }
    if(t==='SUBAGENT_STARTED') {
      const id=e.subagentRunId as string
      if(announced.has(id)) {note(i,'subagent-id-reused');continue}
      const p=typeof e.parentSubagentRunId==='string'?e.parentSubagentRunId:null
      if(p!==null && !active.has(p)) {note(i,'unannounced-parent');continue}
      announced.set(id,p);active.add(id);continue
    }
    if(t==='SUBAGENT_FINISHED'||t==='SUBAGENT_ERROR') {
      const id=e.subagentRunId as string
      if(!active.has(id)) {note(i,'subagent-terminal-without-active');continue}
      if([...active].some(x=>announced.get(x)===id)) {note(i,'subagent-active-child');continue}
      active.delete(id);continue
    }
    if(t==='RUN_FINISHED') {
      if(active.size) note(i,'active-subagents-at-run-finish')
      active.clear();inRun=false;terminal=true;continue
    }
    const owner=e.subagentRunId
    if(typeof owner==='string' && announced.has(owner) && !active.has(owner))
      note(i,'event-from-closed-subagent')
    // An unannounced owner is legal. Shared state has no owner-scoped copy.
  }
  if(events.length>limit) note(limit,'review-limit')
  if(inRun) note(limit,'run-not-closed')
  return {issues,activeCount:active.size,terminal}
}
