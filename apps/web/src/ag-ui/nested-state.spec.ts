/** MASL 2.6E: no model, no network, no Runtime, no persistence. */
import { checkRunOutcome, checkSubagentOutcome, checkSelectedRunInput,
  checkPatch, checkSelectedNestedEvent, applySyntheticPatch,
  replaySyntheticState, reviewSubagents } from './nested-state'
let passed=0
const ok=(yes:boolean,label:string)=>{
  if(!yes) throw Error('FAIL: '+label)
  passed++
  console.log('PASS: '+label)
}
const finish=(outcome?:unknown):Record<string,unknown>=>
  outcome===undefined?{type:'RUN_FINISHED',threadId:'t',runId:'r'}:
  {type:'RUN_FINISHED',threadId:'t',runId:'r',outcome}
const started={type:'RUN_STARTED',threadId:'t',runId:'r'}
const end=finish()
const sub=(id:string,parent?:string):Record<string,unknown>=>({type:'SUBAGENT_STARTED',subagentRunId:id,name:'synthetic',
  ...(parent!==undefined?{parentSubagentRunId:parent}:{})})
const done=(id:string):Record<string,unknown>=>({type:'SUBAGENT_FINISHED',subagentRunId:id})
const err=(id:string):Record<string,unknown>=>({type:'SUBAGENT_ERROR',subagentRunId:id,message:'synthetic'})
const snapshot=(value:unknown,owner?:string):Record<string,unknown>=>({type:'STATE_SNAPSHOT',snapshot:value,
  ...(owner?{subagentRunId:owner}:{})})
const delta=(value:unknown,owner?:string):Record<string,unknown>=>({type:'STATE_DELTA',delta:value,
  ...(owner?{subagentRunId:owner}:{})})
const has=(codes:readonly {code:string}[],code:string)=>codes.some(x=>x.code===code)

// The official 1.0 schema defines these closed nested outcome arms.
ok(checkRunOutcome({type:'success'}), 'run success outcome')
ok(checkRunOutcome({type:'success',pendingToolCallIds:['call-1']}), 'success can name pending frontend calls')
ok(checkRunOutcome({type:'success',pendingToolCallIds:[]}), 'empty pending calls allowed')
ok(!checkRunOutcome({type:'success',pendingToolCallIds:[2]}), 'pending call IDs typed')
ok(!checkRunOutcome({type:'success',interrupts:[]}), 'success may not invent interrupts')
ok(checkRunOutcome({type:'cancelled'}), 'cancelled is a distinct terminal outcome')
ok(!checkRunOutcome({type:'cancelled',pendingToolCallIds:[]}), 'cancelled does not permit pending calls')
ok(checkRunOutcome({type:'interrupt',interrupts:[{id:'i',reason:'approval'}]}), 'interrupt has required id and reason')
ok(checkRunOutcome({type:'interrupt',interrupts:[{id:'i',reason:'approval',responseSchema:{type:'boolean'},expiresAt:'opaque'}]}), 'interrupt response schema opaque object')
ok(!checkRunOutcome({type:'interrupt',interrupts:[]}), 'empty interrupts rejected')
ok(!checkRunOutcome({type:'interrupt',interrupts:[{id:'i'}]}), 'missing interrupt reason rejected')
ok(!checkRunOutcome({type:'interrupt',interrupts:[{id:'i',reason:0}]}), 'malformed interrupt reason rejected')
ok(!checkRunOutcome({type:'interrupt',interrupts:[{id:'i',reason:'r',responseSchema:true}]}), 'boolean responseSchema rejected by pinned schema')
ok(!checkRunOutcome({type:'interrupt',interrupts:[{id:'i',reason:'r',metadata:{secret:null}}],extra:true}), 'closed run outcome rejects extra')
ok(!checkRunOutcome({type:'interrupt',interrupts:[{id:'i',reason:'r',extra:true}]}), 'closed interrupt rejects extra')
ok(!checkRunOutcome({type:'interrupt',interrupts:[{id:'i',reason:'r'},{id:'i',reason:'r2'}]}), 'local interrupt id uniqueness enforced')
ok(!checkRunOutcome({type:'paused'}), 'unknown run outcome not treated as success')
ok(!checkRunOutcome(null), 'null outcome rejected')
ok(!checkRunOutcome([]), 'array outcome rejected')
ok(checkSubagentOutcome({type:'success'}), 'subagent success closed arm')
ok(checkSubagentOutcome({type:'suspended'}), 'subagent suspended outcome without interrupt ids')
ok(checkSubagentOutcome({type:'suspended',interruptIds:[]}), 'subagent suspended may have no own interrupts')
ok(checkSubagentOutcome({type:'suspended',interruptIds:['i']}), 'subagent suspended own interrupt IDs')
ok(!checkSubagentOutcome({type:'suspended',interruptIds:[1]}), 'subagent interrupt IDs typed')
ok(!checkSubagentOutcome({type:'success',interruptIds:['i']}), 'subagent success cannot carry interrupt IDs')
ok(!checkSubagentOutcome({type:'cancelled'}), 'subagent cancelled unsupported by pinned schema')
ok(!checkSubagentOutcome({type:'suspended',another:true}), 'subagent outcome closed arm')

// Selected RunAgentInput shapes, without pretending messages/ContentPart are checked.
const input={threadId:'t',runId:'r',messages:[]}
ok(checkSelectedRunInput(input), 'minimal run input')
ok(checkSelectedRunInput({...input,protocolVersion:'1.0',state:{root:null},forwardedProps:[null],tools:[],context:[],resume:[]}), 'optional nested run input')
ok(!checkSelectedRunInput({...input,state:null}), 'optional whole-state null rejected')
ok(!checkSelectedRunInput({...input,forwardedProps:null}), 'optional forwardedProps null rejected')
ok(!checkSelectedRunInput({...input,messages:'bad'}), 'messages must be array')
ok(!checkSelectedRunInput({runId:'r',messages:[]}), 'missing thread identity rejected')
ok(!checkSelectedRunInput({...input,tools:[{name:'lookup'}]}), 'tool description required')
ok(checkSelectedRunInput({...input,tools:[{name:'lookup',description:'synthetic',parameters:{},metadata:{flag:null}}]}), 'tool named parameters opaque')
ok(!checkSelectedRunInput({...input,context:[{description:'d',value:5}]}), 'context string value required')
ok(checkSelectedRunInput({...input,context:[{description:'d',value:'s'}]}), 'context pair accepted')
ok(!checkSelectedRunInput({...input,resume:[{interruptId:'i',status:'oops'}]}), 'resume status enum checked')
ok(checkSelectedRunInput({...input,resume:[{interruptId:'i',status:'resolved',payload:0}]}), 'resume payload JSON accepted')
ok(!checkSelectedRunInput({...input,resume:[{interruptId:'i',status:'resolved',payload:null}]}), 'optional whole resume payload null rejected')
ok(!checkSelectedRunInput({...input,newMember:1}), 'selected input is closed (not extension-normalization)')
ok(checkSelectedNestedEvent({type:'RUN_STARTED',threadId:'t',runId:'r',input}).valid, 'nested RUN_STARTED.input checked')
ok(!checkSelectedNestedEvent({type:'RUN_STARTED',threadId:'t',runId:'r',input:{}}).valid, 'bad nested RunAgentInput rejected')
ok(!checkSelectedNestedEvent(finish({type:'interrupt',interrupts:[]})).valid, 'invalid nested RUN_FINISHED outcome rejected')
const futureOutcome=checkSelectedNestedEvent(finish({type:'future-added-outcome'}))
ok(futureOutcome.valid && futureOutcome.coverage==='not-reviewed', 'future run outcome deferred rather than rejected')
const futureSubOutcome=checkSelectedNestedEvent({type:'SUBAGENT_FINISHED',subagentRunId:'s',outcome:{type:'future-added-outcome'}})
ok(futureSubOutcome.valid && futureSubOutcome.coverage==='not-reviewed', 'future subagent outcome deferred rather than rejected')
ok(checkSelectedNestedEvent(end).valid, 'absent outcome is success without invention')
ok(checkSelectedNestedEvent({type:'SUBAGENT_FINISHED',subagentRunId:'s',outcome:{type:'suspended'}}).valid, 'nested subagent outcome accepted')
ok(!checkSelectedNestedEvent({type:'SUBAGENT_FINISHED',subagentRunId:'s',outcome:{type:'suspended',interruptIds:[2]}}).valid, 'malformed known subagent outcome rejected')
const outside=checkSelectedNestedEvent({type:'TOOL_CALL_RESULT',toolCallId:'c',messageId:'m',content:[{type:'new-media-part'}]})
ok(outside.valid && outside.coverage==='not-reviewed', 'ContentPart explicitly not fully verified')

// Schema-derived RFC 6902 operations remain OPEN to unknown properties.
for(const op of ['add','remove','replace','move','copy','test']) {
  const value={op,path:'/a',...(['move','copy'].includes(op)?{from:'/b'}:{}),
    ...(['add','replace','test'].includes(op)?{value:null}:{})}
  ok(checkPatch([value]).valid, `${op}: required patch operation shape accepted`)
  ok(checkPatch([{...value,providerExtra:23}]).valid, `${op}: extra operation member preserved`)
  ok(!checkPatch([{...value,path:'broken'}]).valid, `${op}: invalid JSON Pointer rejected`)
}
ok(checkPatch([]).valid, 'empty JSON Patch is valid no-op')
ok(!checkPatch({}).valid, 'JSON Patch requires array')
ok(!checkPatch([{op:'add',path:'/a'}]).valid, 'add requires value')
ok(!checkPatch([{op:'test',path:'/a'}]).valid, 'test requires value')
ok(!checkPatch([{op:'copy',path:'/a'}]).valid, 'copy requires from')
ok(!checkPatch([{op:'move',path:'/a'}]).valid, 'move requires from')
ok(checkPatch([{op:'replace',path:'/a',value:1.2,from:3}]).valid, 'RFC6902 allows unknown extra operation members')
ok(!checkPatch([{op:'replace',path:'/a',value:()=>7}]).valid, 'non-JSON operation payload rejected')
ok(!checkPatch([{op:'remove',path:'/a~3b'}]).valid, 'invalid JSON Pointer tilde rejected')
ok(checkPatch([{op:'future-op',anything:'unrecognized'}]).valid, 'unknown future patch op is extension')
const unknown=checkPatch([{op:'future-op'},{op:'add',path:'/x',value:1}])
ok(unknown.valid && unknown.ignoredUnknownOps===1, 'unknown patch op counted without fatal error')
ok(!checkSelectedNestedEvent({type:'STATE_DELTA',delta:{}}).valid, 'nested patch shape cannot be object')
ok(!checkSelectedNestedEvent({type:'ACTIVITY_DELTA',messageId:'m',activityType:'x',patch:[{op:'add',path:'bad',value:1}]}).valid, 'activity nested patch invalid')

// Atomic RFC6902 subset: synthetic state only, never caller-owned mutation.
const base={items:[1,2],doc:{a:1},'a/b':{ '~x':true }}
const original=JSON.stringify(base)
let result=applySyntheticPatch(base,[{op:'add',path:'/items/-',value:3},{op:'replace',path:'/doc/a',value:9}])
ok(result.status==='applied' && (result.value as typeof base).items.join(',')==='1,2,3', 'atomic add to array')
ok((result.value as typeof base).doc.a===9, 'replace nested object member')
ok(JSON.stringify(base)===original, 'source never mutated')
ok(applySyntheticPatch(base,[{op:'remove',path:'/items/0'}]).status==='applied', 'remove existing array index')
ok(applySyntheticPatch(base,[{op:'add',path:'/items/0',value:0}]).status==='applied', 'insert array index')
ok(applySyntheticPatch(base,[{op:'add',path:'/extra',value:null}]).status==='applied', 'add null value')
ok(applySyntheticPatch(base,[{op:'copy',from:'/doc',path:'/copy'}]).status==='applied', 'copy operation')
result=applySyntheticPatch(base,[{op:'move',from:'/items/0',path:'/items/1'}])
ok(result.status==='applied' && (result.value as typeof base).items.join(',')==='2,1', 'move adjusts array indices after removal')
ok(applySyntheticPatch(base,[{op:'test',path:'/doc',value:{a:1}}]).status==='applied', 'test deep JSON equality ignores key insertion order')
ok(applySyntheticPatch(base,[{op:'test',path:'/doc',value:{a:3}}]).status==='skipped-application', 'failed test is warning and skip')
ok(applySyntheticPatch(base,[{op:'replace',path:'/missing',value:0}]).status==='skipped-application', 'nonexistent replace is application failure')
ok(applySyntheticPatch(base,[{op:'remove',path:'/missing'}]).status==='skipped-application', 'nonexistent remove is application failure')
ok(applySyntheticPatch(base,[{op:'move',from:'/doc',path:'/doc/deep'}]).status==='skipped-application', 'cannot move into its own descendant')
ok(applySyntheticPatch(base,[{op:'copy',from:'/missing',path:'/x'}]).status==='skipped-application', 'copy source must exist')
ok(applySyntheticPatch(base,[{op:'replace',path:'/items/01',value:0}]).status==='skipped-application', 'noncanonical array index not guessed')
ok(applySyntheticPatch(base,[{op:'add',path:'/items/99',value:0}]).status==='skipped-application', 'out-of-range add does not grow sparse array')
ok(applySyntheticPatch(base,[{op:'remove',path:''}]).status==='skipped-application', 'root removal unsupported explicitly')
ok(applySyntheticPatch(base,[{op:'replace',path:'/bad~3',value:0}]).status==='fatal-structure', 'malformed pointer fatal before application')
result=applySyntheticPatch(base,[{op:'add',path:'/created',value:true},{op:'test',path:'/doc/a',value:999}])
ok(result.status==='skipped-application' && JSON.stringify(result.value)===original, 'failed second operation rolls back first operation')
result=applySyntheticPatch(base,[{op:'future',unknown:1},{op:'add',path:'/x',value:3}])
ok(result.status==='applied' && result.ignoredUnknownOps===1, 'unknown operation skipped, known applies')
result=applySyntheticPatch(base,[{op:'test',path:'/a~1b/~0x',value:true}])
ok(result.status==='applied', 'JSON Pointer escape tokens work')
result=applySyntheticPatch(base,[{op:'add',path:'/__proto__/danger',value:true}])
ok(result.status==='skipped-application' && ({} as Record<string,unknown>).danger===undefined, 'no inherited-object prototype traversals')
result=applySyntheticPatch(base,[{op:'add',path:'/__proto__',value:{safe:true}}])
ok(result.status==='applied' && ({} as Record<string,unknown>).safe===undefined, 'own __proto__ property creation does not pollute prototype')
result=applySyntheticPatch(base,[{op:'replace',path:'',value:[3]}])
ok(result.status==='applied' && Array.isArray(result.value), 'root replace adopts any JSON value')

// State is shared across subagents: snapshot replaces, delta patches, failed
// application preserves baseline and subsequent snapshot resynchronizes.
let state=replaySyntheticState({x:1,y:1},[snapshot({x:2},'sa'),delta([{op:'add',path:'/z',value:3}],'other')])
ok(!state.fatal && JSON.stringify(state.value)==='{"x":2,"z":3}', 'subagent-attributed state applies to shared run scope')
state=replaySyntheticState({a:1},[delta([{op:'add',path:'/x',value:2}]),
  delta([{op:'test',path:'/a',value:99}]),snapshot({fresh:true})])
ok(!state.fatal && JSON.stringify(state.value)==='{"fresh":true}', 'later snapshot resynchronizes after failed patch')
ok(has(state.diagnostics,'patch-skipped'), 'failed patch warning kept without leaking content')
ok(replaySyntheticState({x:1},[delta([{op:'future',value:8}])]).diagnostics.some(x=>x.code==='unknown-patch-op-skipped'), 'unknown patch operation is warned')
ok(replaySyntheticState({x:1},[delta({})]).fatal, 'invalid nested state delta fatal')
ok(replaySyntheticState({x:1},[snapshot(null)]).value===null, 'required snapshot permits null')
ok(replaySyntheticState({x:1},[snapshot({x:2})]).value!==undefined, 'pure state result returned')
ok(replaySyntheticState({x:1},[snapshot({x:2})]).fatal===false, 'snapshot does not require prior delta')
ok(JSON.stringify(base)===original, 'multiple synthetic replays leave initial state unchanged')

// Subagents: announced vs implicit tags, nesting, terminal and shared-state.
let trace=reviewSubagents([started,sub('a'),snapshot({shared:1},'a'),done('a'),end])
ok(trace.issues.length===0 && trace.terminal && trace.activeCount===0, 'announced subagent closes cleanly')
trace=reviewSubagents([started,snapshot({shared:1},'implicit'),end])
ok(trace.issues.length===0, 'unannounced attribution allowed by normative contract')
trace=reviewSubagents([started,sub('parent'),sub('child','parent'),done('child'),done('parent'),end])
ok(trace.issues.length===0, 'nested subagents close child first')
ok(has(reviewSubagents([started,sub('a'),sub('a'),done('a'),end]).issues,'subagent-id-reused'), 'active subagent id cannot be repeated')
ok(has(reviewSubagents([started,sub('a'),done('a'),sub('a'),end]).issues,'subagent-id-reused'), 'closed subagent id cannot be reused in same run')
ok(has(reviewSubagents([started,sub('child','missing'),end]).issues,'unannounced-parent'), 'parent must be active and announced')
ok(has(reviewSubagents([started,sub('a'),sub('b','a'),done('a'),done('b'),end]).issues,'subagent-active-child'), 'cannot close parent with active child')
ok(has(reviewSubagents([started,done('missing'),end]).issues,'subagent-terminal-without-active'), 'orphan terminal rejected')
ok(has(reviewSubagents([started,sub('a'),end]).issues,'active-subagents-at-run-finish'), 'run finish requires subagents closed')
trace=reviewSubagents([started,sub('a'),{type:'RUN_ERROR',message:'failure'}])
ok(trace.issues.length===0 && trace.activeCount===0, 'RUN_ERROR abandons active subagent without separate close')
trace=reviewSubagents([started,sub('a'),err('a'),end])
ok(trace.issues.length===0, 'SUBAGENT_ERROR closes invocation but not parent run')
ok(has(reviewSubagents([started,sub('a'),done('a'),snapshot({x:1},'a'),end]).issues,'event-from-closed-subagent'), 'event attributed to closed announced subagent rejected')
ok(has(reviewSubagents([started,sub('a')]).issues,'run-not-closed'), 'incomplete observation not success')
ok(has(reviewSubagents([sub('a')]).issues,'event-without-open-run'), 'subagent cannot start outside Run')
trace=reviewSubagents([started,sub('a'),done('a'),end,started,sub('a'),done('a'),end])
ok(trace.issues.length===0 && trace.terminal, 'same subagent ID may reappear in later Run')
ok(checkSelectedNestedEvent({type:'SUBAGENT_FINISHED',subagentRunId:'a',outcome:{type:'suspended'}}).valid, 'suspension outcome not flattened into success')

console.log(`\n${passed} 2.6E selected nested/state/subagent assertions passed`)
