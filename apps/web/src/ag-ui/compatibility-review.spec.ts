/** MASL 2.6G pure synthetic contract tests; no Runtime or IO. */
import {
  parseVersion, reviewPeerVersion, reviewSyntheticPipeline,
  downgradeSelectedMessages, CONFORMANCE_GAPS,
} from './compatibility-review';

let assertions=0;
const check=(truth:unknown,description:string):void=>{
  if(truth!==true)throw new Error('FAIL: '+description);
  assertions++;
  console.log('PASS: '+description);
};
const eq=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

// Version grammar and numeric comparisons. Never lexicographic.
for(const [value,expected] of [
  ['0.0',{major:0,minor:0}],['1.0',{major:1,minor:0}],
  ['1.9',{major:1,minor:9}],['1.10',{major:1,minor:10}],
  ['11.12',{major:11,minor:12}],['12.300',{major:12,minor:300}],
  ['999.999',{major:999,minor:999}],
] as const)check(eq(parseVersion(value),expected),'version valid '+value);
for(const bad of ['1','v1.0','1.0.0','1.-1','01.0','1.01','1.0x','1 0',' 1.0','1.0 ','1.',
  '',null,1,{},[],true,'999999999999999999.1','1.999999999999999999','NaN.0'])
  check(parseVersion(bad)===null,'version invalid '+JSON.stringify(bad));
const expectVersion=(local:string,peer:unknown,decision:string,warning:boolean)=>{
  const x=reviewPeerVersion(local,peer);
  check(x.decision===decision && x.warning===warning && x.proceed,
    'version comparison '+local+' <-> '+JSON.stringify(peer)+' = '+decision);
};
expectVersion('1.0','1.0','same-version',false);
expectVersion('1.9','1.10','newer-minor',true);
expectVersion('1.10','1.9','older-minor',false);
expectVersion('1.0','2.0','unsupported-major-policy',true);
expectVersion('1.0','0.9','unsupported-major-policy',true);
expectVersion('1.0','garbled','uninterpretable',true);
expectVersion('1.0','1.0.0','uninterpretable',true);
expectVersion('1.0',undefined,'legacy-absent',false);
expectVersion('1.0',null,'uninterpretable',true);
try{reviewPeerVersion('foo','1.0');throw Error('not rejected');}
catch(e){check((e as Error).message==='invalid local version','invalid local version fails');}

const start={type:'RUN_STARTED',threadId:'t',runId:'r'};
const finish={type:'RUN_FINISHED',threadId:'t',runId:'r'};
const textStart={type:'TEXT_MESSAGE_START',messageId:'m'};
const textPart={type:'TEXT_MESSAGE_CONTENT',messageId:'m',delta:'hello'};
const textEnd={type:'TEXT_MESSAGE_END',messageId:'m'};
const accepted=reviewSyntheticPipeline([start,textStart,textPart,textEnd,finish]);
check(accepted.status==='accepted','canonical known sample accepted');
if(accepted.status!=='accepted')throw Error('unreachable');
check(accepted.events.length===5,'canonical output count');
check(accepted.trace.length===30,'six stages for each accepted event');
for(let i=0;i<5;i++)check(eq(accepted.trace.slice(i*6,i*6+6).map(x=>x.stage),
  ['compatibility','middleware','enforcement','expansion','verification','application']),
  'canonical stage ordering for item '+i);
const extension=reviewSyntheticPipeline([
  {...start,newFutureProperty:'secret-independent',metadata:{keep:true}},
  {type:'FUTURE_EVENT',name:'forward'},
  {type:'toString',name:'prototype-not-known'},
  {...finish,unexpected:22},
]);
check(extension.status==='accepted','unknown event/properties are survivable');
if(extension.status==='accepted'){
  check(extension.dropped===2,'unknown events dropped including prototype name');
  check(extension.stripped===2,'unknown closed-event properties stripped');
  check(extension.events.length===2,'application never receives unknown event');
  check(!('newFutureProperty' in extension.events[0]!),'future field not leaked');
  check(!('unexpected' in extension.events[1]!),'future final field not leaked');
  check(eq(extension.events[0]!.metadata,{keep:true}),'open metadata preserved');
  check(extension.warnings.some(w=>w.code==='unknown-event-dropped'),'unknown event warning');
  check(extension.warnings.filter(w=>w.code==='unknown-property-stripped').length===2,
    'unknown field path warnings');
}
const synthetic=reviewSyntheticPipeline([{type:'LAB_ONLY_RETIRED_CUSTOM',name:'test',value:0}]);
check(synthetic.status==='accepted','LAB-ONLY retired shape translated before enforcement');
if(synthetic.status==='accepted'){
  check(synthetic.events[0]!.type==='CUSTOM','lab fixture becomes described CUSTOM');
  check(synthetic.trace[0]!.kind==='LAB_ONLY_RETIRED_CUSTOM','compatibility sees retired lab event');
  check(synthetic.trace[1]!.kind==='CUSTOM','middleware sees translated event');
  check(synthetic.trace[2]!.kind==='CUSTOM','enforcement sees translated event');
  check(synthetic.warnings.some(x=>x.code==='lab-only-retired-translated'),'lab mapping marked synthetic');
}
for(const bad of [
  {type:'RUN_STARTED',threadId:55,runId:'r'},
  {type:'RUN_STARTED',threadId:'t'},
  {type:'TEXT_MESSAGE_CONTENT',messageId:'m',delta:42},
  {type:'TEXT_MESSAGE_CONTENT',messageId:'m'},
  {type:'TEXT_MESSAGE_START',messageId:false},
  {type:'RUN_FINISHED',threadId:'t',runId:'r',result:null},
  {type:'CUSTOM',name:'a'},
  {type:'CUSTOM',name:2,value:0},
  {type:'TEXT_MESSAGE_START',messageId:'m',subagentRunId:null},
  {type:'LAB_ONLY_RETIRED_CUSTOM',name:'x'},
  {type:'LAB_ONLY_RETIRED_CUSTOM',name:1,value:1},
  {...start,metadata:null},
  {...start,timestamp:'now'},
  {...start,rawEvent:null},
]){
  const v=reviewSyntheticPipeline([start,bad,finish]);
  check(v.status==='fatal' && v.emittedCount===0,
    'known malformed is fatal without partial output: '+JSON.stringify(bad));
}
for(const invalid of [null,12,'string',{},[{type:22}],Array.from({length:401},()=>start)]){
  const v=reviewSyntheticPipeline(invalid instanceof Array?invalid:[invalid]);
  check(v.status==='fatal','invalid shape / bounded input fails');
}
const warningTrace=reviewSyntheticPipeline([{...start,unmapped:'mystery'}]);
if(warningTrace.status==='accepted'){
  check(warningTrace.trace[1]!.stage==='middleware' && warningTrace.trace[2]!.stage==='enforcement',
    'middleware observes before enforcement strips');
  check(warningTrace.warnings[0]!.detail==='unmapped','warning records removed field name');
}

const message={id:'u1',role:'user',subagentRunId:'sub1',content:'hello'};
const lossless=downgradeSelectedMessages([message]);
check(lossless.status==='accepted' && !lossless.lossy,'attribution removal is lossless in scoped projection');
if(lossless.status==='accepted'){
  check(!('subagentRunId' in lossless.messages[0]!),'legacy projection strips attribution');
  check(lossless.messages[0]!.content==='hello','text content intact');
  check(lossless.warnings.length===0,'lossless projection may be silent');
}
const multi=downgradeSelectedMessages([
  {id:'u1',role:'user',content:[{type:'text',text:'A'},{type:'image',source:{type:'url',value:'https://invalid.test/a'}},{type:'text',text:'B'}]},
  {id:'t1',role:'tool',toolCallId:'c',content:[{type:'document',source:{type:'file',value:'opaque'}}]},
]);
check(multi.status==='accepted','text+media selected downgrade supported');
if(multi.status==='accepted'){
  check(multi.lossy,'dropping media is lossy');
  check(multi.messages[0]!.content==='AB','text parts concatenated in original order');
  check(multi.messages[1]!.content==='','media-only result becomes empty string');
  check(multi.messages[1]!.toolCallId==='c','toolCallId preserved');
  check(multi.messages[0]!.id==='u1' && multi.messages[1]!.id==='t1','message IDs/order preserved');
  check(multi.warnings.length===2,'lossy media warning per dropped part');
}
for(const part of ['image','audio','video','document']){
  const x=downgradeSelectedMessages([{id:'u',role:'user',content:[{type:part,source:{type:'url',value:'x'}}]}]);
  check(x.status==='accepted' && x.lossy,'known media lossy projection '+part);
}
for(const part of [
  {type:'text',text:12},{type:'image'},{type:'image',source:{type:'data',value:'a'}},
  {type:'image',source:{type:'url',value:11}},null,4,{},
]){
  const x=downgradeSelectedMessages([{id:'u',role:'user',content:[{type:'text',text:'ok'},part]}]);
  check(x.status==='fatal','known malformed part rejects entire result '+JSON.stringify(part));
}
const conflict=downgradeSelectedMessages([{id:'u',role:'user',content:[
  {type:'image',source:{type:'future-source',value:'opaque'}},
]}]);
check(conflict.status==='unresolved-source','unrecognized PartSource kept unresolved');
for(const entry of [
  {role:'user',content:'x'},
  {id:'x',role:'assistant',content:'x'},
  {id:'x',role:'tool',content:'x'},
  {id:'x',role:'user',content:42},
]){
  const x=downgradeSelectedMessages([message,entry]);
  check(x.status==='fatal','malformed message rejects entire batch');
}
for(const part of ['new-type','future-search-hit','nonstandard-form']){
  const x=downgradeSelectedMessages([{id:'u',role:'user',content:[{type:'text',text:'Hi'},{type:part,payload:5}]}]);
  check(x.status==='accepted' && x.lossy && x.messages[0]!.content==='Hi',
    'unknown ContentPart dropped with warning '+part);
}
const untouched={id:'u',role:'user',content:[{type:'text',text:'X'},{type:'image',source:{type:'url',value:'url'}}]};
const before=JSON.stringify(untouched);
downgradeSelectedMessages([untouched]);
check(JSON.stringify(untouched)===before,'downgrade does not mutate incoming message');
const more=downgradeSelectedMessages(Array.from({length:201},(_,i)=>({id:String(i),role:'user',content:''})));
check(more.status==='fatal','bounded message projection');
check(CONFORMANCE_GAPS.length===9,'nine explicitly open conformance gaps');
for(const x of CONFORMANCE_GAPS)check(x.status==='open','gap '+x.id+' remains open');

console.log(`${assertions} 2.6G selected processing/compatibility assertions passed`);
