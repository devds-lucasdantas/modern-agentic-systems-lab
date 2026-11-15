/**
 * MASL Lab 2.6G — selected AG-UI 1.0 processing / compatibility lab.
 * Pinned ag-ui-protocol/ag-ui@2330368a2a74573902858867072406638ba3073d.
 * Entirely synthetic, isolated and model-free. NOT a protocol adapter, SDK,
 * conformance validator, active middleware, Runtime transport or UI renderer.
 * No network, media decoding, tool execution, logging of payload contents,
 * authorization or other external effects.
 */

type Obj = Record<string, unknown>;
const record = (x: unknown): x is Obj => x !== null && typeof x === 'object' && !Array.isArray(x);
const owns = (x: Obj, k: string): boolean => Object.hasOwn(x, k);
const json = (v: unknown): boolean => {
  try { return JSON.stringify(v) !== undefined; } catch { return false; }
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export type Version = Readonly<{ major: number; minor: number }>;
export const parseVersion = (x: unknown): Version | null => {
  if (typeof x !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(x)) return null;
  const [major, minor] = x.split('.').map(Number);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor)) return null;
  return { major, minor };
};
export type VersionReview = Readonly<{
  decision: 'same-version' | 'older-minor' | 'newer-minor' |
    'unsupported-major-policy' | 'uninterpretable' | 'legacy-absent';
  proceed: boolean;
  warning: boolean;
}>;
/** 'unsupported-major-policy' remains proceedable: rejection is MAY, not MUST. */
export const reviewPeerVersion = (local: string, peer: unknown): VersionReview => {
  const current = parseVersion(local);
  if (!current) throw new Error('invalid local version');
  if (peer === undefined) return {decision:'legacy-absent',proceed:true,warning:false};
  const other = parseVersion(peer);
  if (!other) return {decision:'uninterpretable',proceed:true,warning:true};
  if (other.major !== current.major)
    return {decision:'unsupported-major-policy',proceed:true,warning:true};
  if (other.minor === current.minor)
    return {decision:'same-version',proceed:true,warning:false};
  if (other.minor > current.minor)
    return {decision:'newer-minor',proceed:true,warning:true};
  return {decision:'older-minor',proceed:true,warning:false};
};

export type Warning = Readonly<{code:string;at:number;detail?:string}>;
export type Stage = 'compatibility'|'middleware'|'enforcement'|'expansion'|'verification'|'application';
export type StageTrace = Readonly<{stage:Stage;index:number;kind:string}>;
export type PipelineReview =
  | Readonly<{status:'accepted';events:readonly Obj[];warnings:readonly Warning[];
      trace:readonly StageTrace[];coverage:'selected-synthetic';dropped:number;stripped:number}>
  | Readonly<{status:'fatal';at:number;code:string;emittedCount:0;trace:readonly StageTrace[]}>;

// This is the small subset tested here, not the AG-UI schema's 31-event union.
const shape: Readonly<Record<string, Readonly<{required:readonly string[]; optional:readonly string[]}>>> = {
  RUN_STARTED: {required:['type','threadId','runId'],optional:['protocolVersion']},
  RUN_FINISHED: {required:['type','threadId','runId'],optional:['result']},
  TEXT_MESSAGE_START: {required:['type','messageId'],optional:['role','subagentRunId']},
  TEXT_MESSAGE_CONTENT: {required:['type','messageId','delta'],optional:['subagentRunId']},
  TEXT_MESSAGE_END: {required:['type','messageId'],optional:['subagentRunId']},
  CUSTOM: {required:['type','name','value'],optional:['subagentRunId']},
};
const stringFields = new Set(['type','threadId','runId','messageId','delta','role','name','subagentRunId','protocolVersion']);
/** Synthetic local 2.6G checks, deliberately narrower than AG-UI schema. */
const validateKnown = (v:Obj): boolean => {
  if (typeof v.type !== 'string' || !owns(shape, v.type)) return false;
  const spec=shape[v.type];
  for (const k of spec.required) if (!owns(v,k)) return false;
  for (const k of [...spec.required,...spec.optional]) {
    if (!owns(v,k)) continue;
    if (stringFields.has(k) && typeof v[k] !== 'string') return false;
    if (k==='result' && (v[k]===null || !json(v[k]))) return false;
    if (k==='value' && !json(v[k])) return false;
    if (k==='metadata' && !record(v[k])) return false;
    if (k==='rawEvent' && (v[k]===null || !json(v[k]))) return false;
    if (k==='timestamp' && !(typeof v[k]==='number' && Number.isSafeInteger(v[k]))) return false;
  }
  return true;
};
// LAB_LEGACY_CUSTOM is an invented fixture, NOT a claimed retired AG-UI event.
const LAB_LEGACY = 'LAB_ONLY_RETIRED_CUSTOM';
/**
 * Demonstrates the ordering invariant and all-or-nothing local output policy.
 * Middleware here is an identity observer. No arbitrary patching is performed.
 * A named lab-only shape is converted before enforcement to demonstrate why
 * compatibility precedes it; no real retired-shape registry is implemented.
 */
export const reviewSyntheticPipeline=(source: readonly unknown[]):PipelineReview=>{
  const trace:StageTrace[]=[], warnings:Warning[]=[], events:Obj[]=[];
  let dropped=0,stripped=0;
  const traceStage=(stage:Stage,index:number,kind:string)=>trace.push({stage,index,kind});
  const fatal=(at:number,code:string):PipelineReview=>({status:'fatal',at,code,emittedCount:0,trace});
  if (source.length>400)return fatal(400,'local-input-limit');
  for(let i=0;i<source.length;i++){
    let item=source[i];
    if(!record(item) || typeof item.type!=='string')return fatal(i,'not-an-event-object');
    // Compatibility: only invented fixture translation, not a normative mapping.
    traceStage('compatibility',i,item.type);
    if(item.type===LAB_LEGACY){
      if(typeof item.name!=='string' || !owns(item,'value') || !json(item.value))
        return fatal(i,'malformed-lab-legacy');
      item={type:'CUSTOM',name:item.name,value:clone(item.value)};
      warnings.push({code:'lab-only-retired-translated',at:i});
    }
    if(!record(item))return fatal(i,'not-an-event-object');
    // Middleware observes the shape *before* enforcement, never repairs values.
    traceStage('middleware',i,item.type as string);
    traceStage('enforcement',i,item.type as string);
    if(!owns(shape, item.type as string)){
      dropped++;
      warnings.push({code:'unknown-event-dropped',at:i});
      continue;
    }
    const permitted=shape[item.type as string];
    if(!validateKnown(item)) return fatal(i,'malformed-known-field');
    const out:Obj=Object.create(null) as Obj;
    const allowed=new Set([...permitted.required,...permitted.optional,'metadata','rawEvent','timestamp']);
    for(const [k,v] of Object.entries(item)){
      if(allowed.has(k)) {
        if ((k==='metadata' && !record(v)) || (k==='rawEvent' && (v===null || !json(v))) ||
          (k==='timestamp' && !(typeof v==='number' && Number.isSafeInteger(v))) || v===undefined)
          return fatal(i,'malformed-known-base-field');
        out[k]=clone(v);
      }
      else {stripped++;warnings.push({code:'unknown-property-stripped',at:i,detail:k});}
    }
    traceStage('expansion',i,item.type as string); // no chunks in this selected suite
    traceStage('verification',i,item.type as string); // no complete lifecycle claims
    events.push(out);
    traceStage('application',i,item.type as string);
  }
  return {status:'accepted',events,warnings,trace,coverage:'selected-synthetic',dropped,stripped};
};

export type DowngradeReview =
 | Readonly<{status:'accepted';messages:readonly Obj[];warnings:readonly Warning[];
     lossy:boolean;coverage:'selected-message-projection'}>
 | Readonly<{status:'fatal'|'unresolved-source';code:string;at:number}>;
/**
 * Selected outgoing downgrade of user/tool messages for a text-only older peer.
 * Lossless removal of attribution; media drop is lossy and warned.
 * Does not change message ids, tool call ids, roles or order. Not a generic shim.
 */
export const downgradeSelectedMessages=(messages: readonly unknown[]):DowngradeReview=>{
  const projected:Obj[]=[],warnings:Warning[]=[];
  if(messages.length>200)return {status:'fatal',code:'local-message-limit',at:200};
  let lossy=false;
  for(let i=0;i<messages.length;i++){
    const m=messages[i];
    if(!record(m)|| typeof m.id!=='string'||!['user','tool'].includes(String(m.role)))
      return {status:'fatal',code:'unsupported-selected-message',at:i};
    if(m.role==='tool'&&typeof m.toolCallId!=='string')
      return {status:'fatal',code:'missing-tool-call-id',at:i};
    if(typeof m.content!=='string' && !Array.isArray(m.content))
      return {status:'fatal',code:'invalid-content',at:i};
    let content:string;
    if(typeof m.content==='string')content=m.content;
    else {
      let text='';
      for(const part of m.content){
        if(!record(part)||typeof part.type!=='string')return {status:'fatal',code:'malformed-part',at:i};
        if(part.type==='text'){
          if(typeof part.text!=='string')return {status:'fatal',code:'malformed-known-text',at:i};
          text+=part.text;
        } else if(['image','audio','video','document'].includes(part.type)){
          if(!record(part.source)||typeof part.source.type!=='string')
            return {status:'fatal',code:'malformed-known-media',at:i};
          if(!['data','url','file'].includes(part.source.type))
            return {status:'unresolved-source',code:'pinned-source-policy-conflict',at:i};
          if(typeof part.source.value!=='string'||
            (part.source.type==='data' && typeof part.source.mimeType!=='string'))
            return {status:'fatal',code:'malformed-known-media',at:i};
          lossy=true;
          warnings.push({code:'lossy-media-part-dropped',at:i,detail:part.type});
        } else {
          // Unknown ContentPart is an extension, but content removal is lossy.
          lossy=true;
          warnings.push({code:'unknown-part-dropped',at:i});
        }
      }
      content=text;
    }
    const out:Obj={id:m.id,role:m.role,content};
    if(m.role==='tool')out.toolCallId=m.toolCallId;
    // Unknown metadata and attribution omitted for this selected peer; no
    // outputting values not specified by the input (except empty text on loss).
    projected.push(out);
  }
  return {status:'accepted',messages:projected,warnings,lossy,coverage:'selected-message-projection'};
};

export const CONFORMANCE_GAPS = Object.freeze([
  {id:'G1',status:'open',topic:'Unknown PartSource tension: processing.mdx vs run-input.mdx'},
  {id:'G2',status:'open',topic:'Actual retired-shape registry and real compatibility middleware'},
  {id:'G3',status:'open',topic:'Complete recursive AG-UI 1.0 schema/event conformance'},
  {id:'G4',status:'open',topic:'Multiple transport bindings and protobuf presence semantics'},
  {id:'G5',status:'open',topic:'End-to-end middleware, enforcement, chunk expansion and verification'},
  {id:'G6',status:'open',topic:'Complete version negotiation and downgrade by peer capability'},
  {id:'G7',status:'open',topic:'Media fetch/decoder, URL safety, provider handles and DLP'},
  {id:'G8',status:'open',topic:'Authorization, persistence, CAS, idempotency and multi-client isolation'},
  {id:'G9',status:'open',topic:'Agent Server REST/SSE to AG-UI adapter and frontend integration'},
] as const);
