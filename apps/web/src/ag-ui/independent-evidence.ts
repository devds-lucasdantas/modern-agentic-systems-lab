/**
 * MASL 2.6I — frozen input cases for independent JSON Schema Draft 2020-12 review.
 * Tests execute in Node; a separate Python jsonschema validator judges pinned
 * AG-UI 1.0 schema bytes. This is not an adapter, SDK, generic conformance suite,
 * media decoder, outbound downgrade or permission to resolve G1/G3/G5/G9.
 */
export type Fixture = Readonly<{
  id:string; definition:string; instance:unknown; strictValid:boolean;
  gap:'G1'|'G3'; note:string;
}>;
const f=(id:string,definition:string,instance:unknown,strictValid:boolean,gap:'G1'|'G3',note:string):Fixture=>
  Object.freeze({id,definition,instance,strictValid,gap,note});

const url=(value:string)=>({type:'url',value});
const file=(value:string)=>({type:'file',value,provider:'openai'});
const data=(mimeType?:string)=>mimeType===undefined?{type:'data',value:'@@not-base64@@'}:{type:'data',value:'@@not-base64@@',mimeType};
const text=(value:string)=>({type:'text',text:value});
const image=(source:unknown)=>({type:'image',source});
const user=(content:unknown)=>({id:'user-1',role:'user',content});
const tool=(content:unknown)=>({id:'tool-1',role:'tool',toolCallId:'call-1',content});
const run=(messages:unknown)=>({threadId:'thread-1',runId:'run-1',messages});

export const FIXTURES:readonly Fixture[]=Object.freeze([
  f('text-valid','TextPart',text('hello'),true,'G3','known text shape'),
  f('text-empty-valid','TextPart',{type:'text',text:'',id:'part-1',metadata:{source:'local'}},true,'G3','optional metadata is object'),
  f('text-missing-text','TextPart',{type:'text'},false,'G3','required text'),
  f('text-number','TextPart',{type:'text',text:42},false,'G3','known invalid value'),
  f('text-extra-key','TextPart',{type:'text',text:'ok',secret:'no'},false,'G3','strict schema closes known part'),
  f('text-null-metadata','TextPart',{type:'text',text:'ok',metadata:null},false,'G3','metadata must be non-null'),
  f('image-url','ImagePart',image(url('any-scheme:opaque')),true,'G3','URL has no schema format requirement'),
  f('image-file','ImagePart',image(file('opaque-provider-handle')),true,'G3','opaque provider handle'),
  f('image-data-annotation','ImagePart',image(data('image/png')),true,'G3','contentEncoding base64 is annotation, not decoding'),
  f('image-data-no-mime','ImagePart',image(data()),false,'G3','inline data requires MIME type'),
  f('image-missing-source','ImagePart',{type:'image'},false,'G3','media source required'),
  f('image-source-wrong-type','ImagePart',image({type:'url',value:7}),false,'G3','source value must be string'),
  f('image-source-extra','ImagePart',image({type:'url',value:'https://example.test',unexpected:true}),false,'G3','strict source closes fields'),
  f('image-file-invalid-provider','ImagePart',image({type:'file',value:'handle',provider:5}),false,'G3','provider identifier must be string'),
  f('image-unknown-source','ImagePart',image({type:'future-source',value:'opaque'}),false,'G1','raw schema rejects; prose compatibility remains unresolved'),
  f('content-text','ContentPart',text('ok'),true,'G3','valid discriminated part'),
  f('content-image','ContentPart',image(url('https://example.test/x.png')),true,'G3','valid discriminated image part'),
  f('content-future','ContentPart',{type:'future-part',value:'x'},false,'G3','raw schema rejects; processing may drop unknown union members'),
  f('user-text','UserMessage',user('hi'),true,'G3','string user content'),
  f('user-parts','UserMessage',user([text('a'),image(file('opaque')),text('b')]),true,'G3','ordered multimodal content'),
  f('user-bad-nested','UserMessage',user([text('valid'),{type:'audio',source:data()}]),false,'G3','recursive validation of nested media'),
  f('user-missing-id','UserMessage',{role:'user',content:'hi'},false,'G3','message identity required'),
  f('user-extra-field','UserMessage',{...user('hi'),invalid:true},false,'G3','closed message object'),
  f('tool-text','ToolMessage',tool('response'),true,'G3','tool text content'),
  f('tool-media','ToolMessage',tool([text('result'),{type:'document',source:url('https://example.test/a.pdf')}]),true,'G3','tool multimodal content'),
  f('tool-missing-call','ToolMessage',{id:'tool-1',role:'tool',content:'ok'},false,'G3','toolCallId required'),
  f('tool-invalid-id','ToolMessage',{id:32,role:'tool',toolCallId:'c',content:'ok'},false,'G3','tool message id must be string'),
  f('run-input-valid','RunAgentInput',run([user([text('hello')]),tool('tool result')]),true,'G3','nested run input'),
  f('run-input-empty','RunAgentInput',run([]),true,'G3','empty messages is allowed'),
  f('run-input-no-messages','RunAgentInput',{threadId:'thread-1',runId:'run-1'},false,'G3','required messages'),
  f('run-input-nested-invalid','RunAgentInput',run([user([{type:'video',source:{type:'data',value:'@@'}}])]),false,'G3','nested source MIME validation'),
  f('run-input-extra','RunAgentInput',{...run([]),unrecognized:'x'},false,'G3','raw schema rejects unrecognized key'),
  f('run-start','RunStartedEvent',{type:'RUN_STARTED',threadId:'t',runId:'r'},true,'G3','run start contract'),
  f('run-start-bad-thread','RunStartedEvent',{type:'RUN_STARTED',threadId:5,runId:'r'},false,'G3','known invalid thread'),
  f('run-start-attributed','RunStartedEvent',{type:'RUN_STARTED',threadId:'t',runId:'r',subagentRunId:'s'},false,'G3','run-scoped property not declared'),
  f('run-finished','RunFinishedEvent',{type:'RUN_FINISHED',threadId:'t',runId:'r'},true,'G3','run boundary valid'),
  f('run-finished-null','RunFinishedEvent',{type:'RUN_FINISHED',threadId:'t',runId:'r',result:null},false,'G3','null result prohibited'),
  f('event-run-start','Event',{type:'RUN_STARTED',threadId:'t',runId:'r'},true,'G3','union of 31 events, selected example'),
  f('event-future-type','Event',{type:'FUTURE_EVENT',hello:'x'},false,'G3','raw union rejects unknown event; processing may drop'),
  f('event-invalid-known','Event',{type:'TEXT_MESSAGE_CONTENT',messageId:'m',delta:3},false,'G3','known malformed event'),
] as const);

export type EvidenceVerdict=Readonly<{status:'insufficient';adapterReady:false;milestone2_6:'OPEN';unresolved:readonly string[];reviewed:string}>;
export const evaluateIndependentEvidence=(schemaOraclePassed:boolean,securityArtifactsVerified:boolean,adapterMappingVerified:boolean):EvidenceVerdict=>{
  // A valid 40-case strict-schema fixture matrix is narrower than G3;
  // missing G1, G5, G7, G8, G9 still block operational readiness.
  void schemaOraclePassed; void securityArtifactsVerified; void adapterMappingVerified;
  return {status:'insufficient',adapterReady:false,milestone2_6:'OPEN',
    unresolved:['G1','G2','G3','G4','G5','G6','G7','G8','G9'],reviewed:'selected-independent-oracle'};
};
