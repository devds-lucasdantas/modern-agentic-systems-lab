/** MASL 2.6F deterministic, model-free, synthetic checks. No fetch, SDK or Run. */
import {flattenSelectedText, reviewSelectedContent, reviewSelectedOwnership} from './content-ownership';

let count=0;
const ok=(value:boolean,label:string)=>{
  if(!value)throw new Error(`FAIL: ${label}`);
  count++;
  console.log(`PASS: ${label}`);
};
const accepted=(x:unknown)=>reviewSelectedContent(x).kind==='accepted';
const rejected=(x:unknown)=>reviewSelectedContent(x).kind==='rejected';
const source=(type:string,extra:Record<string,unknown>={})=>({type,value:'not-fetched',...extra});
const part=(type:string,src:unknown)=>({type,source:src});
const text=(value:string)=>({type:'text',text:value});
const image=(src:unknown)=>part('image',src);
const owner=(s:string)=>({subagentRunId:s});
const run=(events:readonly unknown[])=>reviewSelectedOwnership(events);
const has=(events:readonly unknown[],code:string)=>run(events).issues.some(x=>x.code===code);

ok(accepted('plain text'),'string content');
ok(accepted(''),'empty string content');
ok(accepted([]),'empty ordered content list');
ok(accepted([text('hello')]),'text part');
ok(accepted([text('')]),'empty text part');
ok(accepted([text('x'),text('y')]),'multiple text parts');
ok(accepted([{type:'text',text:'x',id:'',metadata:{source:'unit'}}]),'text optional fields');
ok(accepted([{type:'text',text:'x',metadata:[1,true,null]}]),'metadata arbitrary JSON array');
ok(accepted([{type:'text',text:'x',metadata:'scalar'}]),'metadata non-object scalar');
ok(accepted([{type:'text',text:'x',metadata:false}]),'metadata boolean');
ok(rejected(null),'null content fatal');
ok(rejected(5),'number content fatal');
ok(rejected({type:'text',text:'x'}),'single object not list fatal');
ok(rejected([null]),'null content part fatal');
ok(rejected([3]),'non-object content part fatal');
ok(rejected([{}]),'missing part discriminator fatal');
ok(rejected([{type:null,text:'x'}]),'known part discriminator null fatal');
ok(rejected([{type:'text'}]),'missing text fatal');
ok(rejected([{type:'text',text:1}]),'numeric text fatal');
ok(rejected([{type:'text',text:'x',id:4}]),'numeric id fatal');
ok(rejected([{type:'text',text:'x',metadata:null}]),'null metadata fatal');
ok(rejected([{type:'text',text:'x',metadata:undefined}]),'undefined metadata fatal');
for(const media of ['image','audio','video','document']){
  ok(accepted([part(media,source('url'))]),`${media} URL source`);
  ok(accepted([part(media,source('file',{provider:'openai'}))]),`${media} opaque file handle`);
  ok(accepted([part(media,source('data',{mimeType:'application/octet-stream'}))]),`${media} inline data`);
  ok(rejected([part(media,{type:'data',value:'raw'})]),`${media} missing inline MIME fatal`);
  ok(rejected([part(media,{type:'file'})]),`${media} missing file handle fatal`);
  ok(rejected([part(media,{type:'url',value:7})]),`${media} nonstring URL fatal`);
  ok(rejected([part(media,undefined)]),`${media} missing source fatal`);
  ok(rejected([part(media,null)]),`${media} null source fatal`);
}
const mixed=reviewSelectedContent([text('A'),image(source('file',{provider:'anthropic'})),{type:'future-part',value:8},text('B')]);
ok(mixed.kind==='accepted'&&mixed.dropped===1,'unknown part dropped from array');
ok(mixed.kind==='accepted'&&Array.isArray(mixed.content)&&mixed.content.length===3,'unknown part does not invalidate siblings');
const mixedFlat=flattenSelectedText(mixed);
ok(mixedFlat.ok&&mixedFlat.text==='AB','flatten text in order with no placeholder');
ok(mixedFlat.ok&&mixedFlat.lossy,'flatten reports media loss');
ok(mixedFlat.ok&&mixedFlat.warnings.some(x=>x.code==='lossy-text-only-projection'),'flatten warning present');
const txt=flattenSelectedText(reviewSelectedContent('raw'));
ok(txt.ok&&txt.text==='raw'&&!txt.lossy,'raw string not lossy');
const allMedia=flattenSelectedText(reviewSelectedContent([image(source('url'))]));
ok(allMedia.ok&&allMedia.text===''&&allMedia.lossy,'media-only flatten is empty string with warning');
ok(reviewSelectedContent([{type:'future-part',value:{a:1}}]).kind==='accepted','unknown only part is tolerated');
ok(reviewSelectedContent([{type:'future-part',value:{a:1}}]).kind==='accepted'&&
   (reviewSelectedContent([{type:'future-part'}]) as {dropped:number}).dropped===1,'unknown part counted');
const unknownSource=reviewSelectedContent([image(source('future'))]);
ok(unknownSource.kind==='unresolved-source','unknown source is explicitly unresolved');
ok(unknownSource.kind==='unresolved-source'&&unknownSource.code==='unknown-source-policy-conflict','source prose conflict is named');
ok(rejected([image({type:4,value:'x'})]),'malformed known source discriminator fatal');
ok(rejected([image({type:'file',value:'x',provider:7})]),'bad provider type fatal');
ok(rejected([image({type:'url',value:'x',mimeType:4})]),'bad MIME type fatal');
ok(rejected([image({type:'data',value:'x',mimeType:null})]),'null inline MIME fatal');
ok(rejected([image({type:'data',value:'not strict base64',mimeType:'x/y'})])===false,
  'base64 contentEncoding is annotation, not syntactic validation');
const extras=reviewSelectedContent([{
 type:'image',id:'img1',source:{type:'url',value:'url',vendorOption:1},unknownPartField:true,
 metadata:{a:null,nested:[1,2]},
}]);
ok(extras.kind==='accepted'&&extras.stripped===2,'known media nested unknown fields stripped');
ok(extras.kind==='accepted'&&extras.warnings.length===2,'nested stripping warnings');
ok(extras.kind==='accepted'&&JSON.stringify(extras.content).includes('"a":null'),'open metadata preserved');
ok(extras.kind==='accepted'&&!JSON.stringify(extras.content).includes('vendorOption'),'source extra not exposed');
ok(extras.kind==='accepted'&&!JSON.stringify(extras.content).includes('unknownPartField'),'part extra not exposed');
const unmodified={type:'text',text:'kept',unexpected:'remains on input'};
const before=JSON.stringify(unmodified);
reviewSelectedContent([unmodified]);
ok(JSON.stringify(unmodified)===before,'content review does not mutate caller');
const cyclic:Record<string,unknown>={};cyclic.self=cyclic;
ok(rejected([{type:'text',text:'x',metadata:cyclic}]),'cyclic metadata fails without mutation');
const badLater=reviewSelectedContent([text('safe'),{type:'image',source:{type:'url',value:9}}]);
ok(badLater.kind==='rejected','known invalid later part does not return partial accepted value');
ok(flattenSelectedText(badLater).ok===false,'flatten refuses rejected content');

const start=(messageId:string,who?:string)=>({type:'TEXT_MESSAGE_START',messageId,...(who?owner(who):{})});
const next=(messageId:string,who?:string)=>({type:'TEXT_MESSAGE_CONTENT',messageId,delta:'fragment',...(who?owner(who):{})});
const end=(messageId:string,who?:string)=>({type:'TEXT_MESSAGE_END',messageId,...(who?owner(who):{})});
const reasoningStart=(messageId:string,who?:string)=>({type:'REASONING_MESSAGE_START',messageId,role:'reasoning',...(who?owner(who):{})});
const reasoningNext=(messageId:string,who?:string)=>({type:'REASONING_MESSAGE_CONTENT',messageId,delta:'x',...(who?owner(who):{})});
const reasoningEnd=(messageId:string,who?:string)=>({type:'REASONING_MESSAGE_END',messageId,...(who?owner(who):{})});
const toolStart=(toolCallId:string,who?:string,parentMessageId?:string)=>({type:'TOOL_CALL_START',toolCallId,toolCallName:'f',...(parentMessageId?{parentMessageId}:{}),...(who?owner(who):{})});
const args=(toolCallId:string,who?:string)=>({type:'TOOL_CALL_ARGS',toolCallId,delta:'{}',...(who?owner(who):{})});
const toolEnd=(toolCallId:string,who?:string)=>({type:'TOOL_CALL_END',toolCallId,...(who?owner(who):{})});
const toolResult=(toolCallId:string,who?:string)=>({type:'TOOL_CALL_RESULT',toolCallId,messageId:'result',content:'ok',...(who?owner(who):{})});
const activity=(messageId:string,who?:string)=>({type:'ACTIVITY_SNAPSHOT',messageId,activityType:'progress',content:{},...(who?owner(who):{})});
const activityDelta=(messageId:string,who?:string)=>({type:'ACTIVITY_DELTA',messageId,activityType:'progress',patch:[],...(who?owner(who):{})});
const step=(type:'STEP_STARTED'|'STEP_FINISHED',stepName:string,who?:string)=>({type,stepName,...(who?owner(who):{})});

ok(run([start('m','a'),next('m'),end('m')]).ok,'untagged message continuation inherits opener owner');
ok(run([start('m','a'),next('m','a'),end('m','a')]).ok,'matching attributed message continuation');
ok(has([start('m','a'),next('m','b')],'owner-mismatch'),'cross-owner text continuation rejected');
ok(has([start('m','a'),end('m','b')],'owner-mismatch'),'cross-owner text end rejected');
ok(run([start('a','one'),start('b','two'),next('b'),next('a'),end('a'),end('b')]).ok,
 'interleaved owners independent');
ok(has([next('m')],'no-selected-opener'),'missing message opener found');
ok(has([start('m'),start('m')],'duplicate-selected-opener'),'duplicate opener found');
ok(has([start('m'),next('m','b')],'owner-mismatch'),'parent message rejects explicitly tagged child continuation');
ok(run([reasoningStart('r','a'),reasoningNext('r'),reasoningEnd('r')]).ok,
 'reasoning owner inherited');
ok(has([reasoningStart('r','a'),reasoningNext('r','b')],'owner-mismatch'),
 'reasoning mismatch rejected');
ok(has([reasoningStart('r','a'),reasoningEnd('r','b')],'owner-mismatch'),
 'reasoning end mismatch rejected');
ok(run([toolStart('c','a'),args('c'),toolEnd('c')]).ok,'tool arguments inherited owner');
ok(has([toolStart('c','a'),args('c','b')],'owner-mismatch'),'tool arguments mismatch rejected');
ok(has([toolStart('c','a'),toolEnd('c','b')],'owner-mismatch'),'tool end mismatch rejected');
ok(run([start('m','a'),toolStart('c',undefined,'m'),args('c','a'),toolEnd('c')]).ok,
 'tool call inherits parent message without explicit tag');
ok(has([start('m','a'),toolStart('c','b','m')],'parent-message-owner-mismatch'),
 'tool-call parent message mismatch rejected');
ok(run([start('m','a'),toolStart('c','a','m'),toolEnd('c','a'),toolResult('c','a')]).ok,
 'result after TOOL_CALL_END retains owner lineage');
ok(has([toolStart('c','a'),toolEnd('c'),toolResult('c','b')],'owner-mismatch'),
 'cross-owner tool result after end rejected');
ok(run([toolResult('unknown','a')]).ok,'unpaired tool result is not forbidden in scoped ownership review');
ok(run([activity('a','s'),activityDelta('a'),activity('a')]).ok,'activity continuation inherits');
ok(has([activity('a','s'),activityDelta('a','t')],'owner-mismatch'),
 'activity delta mismatch rejected');
ok(has([activity('a','s'),activity('a','t')],'owner-mismatch'),
 'activity snapshot mismatch rejected');
ok(run([step('STEP_STARTED','plan','a'),step('STEP_STARTED','plan','b'),
 step('STEP_FINISHED','plan','b'),step('STEP_FINISHED','plan','a')]).ok,
 'same named step can coexist per owner');
ok(has([step('STEP_STARTED','plan','a'),step('STEP_FINISHED','plan')],'step-not-open-for-owner'),
 'step owner omission cannot close child step');
ok(has([step('STEP_STARTED','plan','a'),step('STEP_STARTED','plan','a')],'duplicate-owner-step'),
 'duplicate step for same owner rejected');
ok(has([step('STEP_FINISHED','plan','a')],'step-not-open-for-owner'),
 'step closed without opener rejected');
for(const type of ['RUN_STARTED','RUN_FINISHED','RUN_ERROR','MESSAGES_SNAPSHOT']){
 ok(run([{type,subagentRunId:'x'}]).ok&&
    run([{type,subagentRunId:'x'}]).warnings.some(x=>x.code==='run-scoped-attribute-ignored'),
    `${type} unknown attribute diagnosed nonfatally`);
 ok(run([{type}]).ok,`${type} allows no attribution`);
}
ok(run([{type:'STATE_DELTA',delta:[],subagentRunId:'a'},
 {type:'STATE_SNAPSHOT',snapshot:{},subagentRunId:'b'}]).ok,
 'state attribution is provenance, not private state');
ok(has([{type:'STATE_DELTA',delta:[],subagentRunId:null}],'invalid-attribution'),
 'explicit null attribution rejected');
ok(run([start('m','a'),end('m', 'b')]).issues.length===1,'bounded single mismatch issue');
ok(run([{type:'future-event'}]).ok,'unknown event not claimed by selected review');
ok(run([{type:'future-event'}]).checked===0,'unknown event omitted from selected check count');
ok(run([start('m','a'),next('m'),end('m')]).checked===3,'checked-count reflects selected events');
ok(run([start('m','a'),next('m','b')]).issues[0].index===1,'diagnostic index stable');
ok(has([{type:'TEXT_MESSAGE_START',messageId:'m',subagentRunId:3}],'invalid-attribution'),
 'numeric attribution rejected');
ok(has([{type:'TEXT_MESSAGE_START',messageId:3}],'invalid-messageId'),
 'numeric message id rejected');
ok(run([toolStart('c','a'),toolEnd('c'),start('b','b'),next('b')]).ok,
 'separate owners do not close one another');

console.log(`${count} 2.6F selected content/ownership assertions passed`);
