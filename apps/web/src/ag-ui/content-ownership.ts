/**
 * MASL 2.6F — isolated, selected AG-UI 1.0 ContentPart/ownership review.
 * This is NOT an SDK, AG-UI adapter, recursive schema validator, media decoder,
 * confidentiality filter, URL fetcher, or production event consumer.
 * Official schema pin: ag-ui-protocol/ag-ui@2330368a2a74573902858867072406638ba3073d
 */

type Dict = Record<string, unknown>;
export type Warning = Readonly<{path: string; code: string}>;
export type ContentResult =
  | Readonly<{kind:'accepted'; content: string|readonly Dict[]; dropped: number; stripped: number; warnings:readonly Warning[]}>
  | Readonly<{kind:'rejected'|'unresolved-source'; path:string; code:string; warnings:readonly Warning[]}>;

const record = (v:unknown):v is Dict =>
  v!==null && typeof v==='object' && !Array.isArray(v);
const has = (v:Dict,k:string):boolean => Object.hasOwn(v,k);
const string=(x:unknown):x is string=>typeof x==='string';
const PARTS = ['text','image','audio','video','document'] as const;
const SOURCES=['data','url','file'] as const;
const dataKinds=new Set<string>(PARTS);
const sourceKinds=new Set<string>(SOURCES);
const ownCopy=(obj:Dict, allowed:readonly string[]):{value:Dict;removed:number}=>{
  const v:Dict=Object.create(null) as Dict;
  let n=0;
  for(const [key,value] of Object.entries(obj)){
    if(allowed.includes(key)) Object.defineProperty(v,key,{value,enumerable:true,writable:true,configurable:true});
    else n++;
  }
  return {value:v,removed:n};
};
// Deliberately validate JSON's shape before copying opaque metadata or payloads.
const jsonValue=(v:unknown,depth=0,seen=new Set<object>()):boolean=>{
  if(depth>64)return false;
  if(v===null || string(v) || typeof v==='boolean')return true;
  if(typeof v==='number')return Number.isFinite(v);
  if(!record(v) && !Array.isArray(v))return false;
  if(seen.has(v as object))return false;
  seen.add(v as object);
  const values=Array.isArray(v)?v:Object.values(v);
  const ok=values.every(x=>jsonValue(x,depth+1,seen));
  seen.delete(v as object);
  return ok;
};
const cloned=(v:unknown):unknown=>JSON.parse(JSON.stringify(v)) as unknown;
const warn=(warnings:Warning[],path:string,code:string)=>{
  if(warnings.length<64)warnings.push({path,code});
};

/** Structural selection only. No media is decoded, fetched, rendered or uploaded. */
export const reviewSelectedContent=(input:unknown):ContentResult=>{
  const warnings:Warning[]=[];
  const fail=(path:string,code:string,kind:'rejected'|'unresolved-source'='rejected'):ContentResult=>
    ({kind,path,code,warnings});
  if(string(input))return {kind:'accepted',content:input,dropped:0,stripped:0,warnings};
  if(!Array.isArray(input))return fail('content','content-not-string-or-array');
  const content:Dict[]=[];
  let dropped=0,stripped=0;
  for(let i=0;i<input.length;i++){
    const p=`content/${i}`;
    const raw:unknown=input[i];
    if(!record(raw))return fail(p,'part-not-object');
    if(!string(raw.type))return fail(`${p}/type`,'part-type-invalid');
    if(!dataKinds.has(raw.type)){
      dropped++;
      warn(warnings,`${p}/type`,'unknown-part-dropped');
      continue;
    }
    const text=raw.type==='text';
    const allowed=text?['type','id','text','metadata']:['type','id','source','metadata'];
    if((has(raw,'id')&&!string(raw.id)) || (has(raw,'metadata') && (raw.metadata===null||!jsonValue(raw.metadata))))
      return fail(p,'known-part-optional-invalid');
    if(text){
      if(!string(raw.text))return fail(`${p}/text`,'text-required-string');
      const x=ownCopy(raw,allowed);
      stripped+=x.removed;
      if(x.removed)warn(warnings,p,'part-properties-stripped');
      content.push(cloned(x.value) as Dict);
      continue;
    }
    if(!record(raw.source))return fail(`${p}/source`,'source-required-object');
    const s=raw.source;
    if(!string(s.type))return fail(`${p}/source/type`,'source-type-invalid');
    if(!sourceKinds.has(s.type)){
      // Pin conflict: processing.mdx says unknown required nested member drops its
      // containing part; run-input.mdx says PartSource is a closed set and an
      // unknown source type fails validation. Do NOT make a normative verdict.
      return fail(`${p}/source/type`,'unknown-source-policy-conflict','unresolved-source');
    }
    if(!string(s.value))return fail(`${p}/source/value`,'source-value-required-string');
    if(s.type==='data' && !string(s.mimeType))return fail(`${p}/source/mimeType`,'data-mime-required-string');
    if(has(s,'mimeType')&&!string(s.mimeType))return fail(`${p}/source/mimeType`,'mime-invalid');
    if(has(s,'provider') && (s.type!=='file'||!string(s.provider)))
      return fail(`${p}/source/provider`,'provider-invalid');
    const skeys=s.type==='file'?['type','value','provider','mimeType']:['type','value','mimeType'];
    const sc=ownCopy(s,skeys);
    const pc=ownCopy(raw,allowed);
    stripped+=sc.removed+pc.removed;
    if(sc.removed)warn(warnings,`${p}/source`,'source-properties-stripped');
    if(pc.removed)warn(warnings,p,'part-properties-stripped');
    pc.value.source=sc.value;
    // JSON Schema contentEncoding=base64 is an annotation, not validation;
    // even syntactically malformed base64 passes this structural check.
    content.push(cloned(pc.value) as Dict);
  }
  return {kind:'accepted',content,dropped,stripped,warnings};
};

/** A deliberately lossy text-only view, not a UI security projection. */
export const flattenSelectedText=(result:ContentResult):
  Readonly<{ok:true;text:string;lossy:boolean;warnings:readonly Warning[]}>|
  Readonly<{ok:false;code:string}>=>{
  if(result.kind!=='accepted')return {ok:false,code:result.code};
  if(string(result.content))return {ok:true,text:result.content,lossy:false,warnings:result.warnings};
  const parts=result.content;
  const text=parts.filter(p=>p.type==='text').map(p=>p.text as string).join('');
  const nontext=parts.length-parts.filter(p=>p.type==='text').length;
  const lossy=result.dropped>0 || nontext>0 || result.stripped>0;
  const extra:Warning[]=lossy?[{path:'content',code:'lossy-text-only-projection'}]:[];
  return {ok:true,text,lossy,warnings:[...result.warnings,...extra]};
};

export type OwnerIssue=Readonly<{index:number;code:string;entity?:string}>;
export type OwnershipResult=Readonly<{ok:boolean;issues:readonly OwnerIssue[];warnings:readonly OwnerIssue[];checked:number}>;
type Track=Readonly<{owner:string;start:number}>;
const PARENT='@parent';

/** Selected chronological ownership invariants; no JSON Schema or Run validation. */
export const reviewSelectedOwnership=(events:readonly unknown[]):OwnershipResult=>{
  const textOwners=new Map<string,Track>();
  const reasoningOwners=new Map<string,Track>();
  const toolOwners=new Map<string,Track>();
  const completedToolOwners=new Map<string,Track>();
  const activityOwners=new Map<string,Track>();
  const openSteps=new Set<string>();
  const issues:OwnerIssue[]=[];
  const warnings:OwnerIssue[]=[];
  let checked=0;
  const issue=(index:number,code:string,entity?:string)=>{issues.push({index,code,entity});};
  const tag=(e:Dict,index:number):string|null=>{
    if(!has(e,'subagentRunId'))return PARENT;
    if(!string(e.subagentRunId)){issue(index,'invalid-attribution');return null;}
    return e.subagentRunId;
  };
  const field=(e:Dict,key:string,index:number):string|null=>{
    if(!string(e[key])){issue(index,`invalid-${key}`);return null;}
    return e[key] as string;
  };
  const checkContinuation=(e:Dict,index:number,map:Map<string,Track>,key:string,close=false)=>{
    const id=field(e,key,index),t=tag(e,index);
    if(id===null||t===null)return;
    const opener=map.get(id);
    if(!opener){issue(index,'no-selected-opener',id);return;}
    if(has(e,'subagentRunId')&&opener.owner!==t){issue(index,'owner-mismatch',id);return;}
    if(close)map.delete(id);
  };
  const runScoped=new Set(['RUN_STARTED','RUN_FINISHED','RUN_ERROR','MESSAGES_SNAPSHOT']);
  for(let i=0;i<events.length;i++){
    const event=events[i];
    if(!record(event)||!string(event.type)){issue(i,'invalid-event');continue;}
    const type=event.type;
    if(runScoped.has(type)){
      checked++;
      // An unrecognized property on a closed run-scoped event is stripped at
      // enforcement (processing.mdx), not itself a fatal ownership conflict.
      if(has(event,'subagentRunId'))warnings.push({index:i,code:'run-scoped-attribute-ignored',entity:type});
      continue;
    }
    if(type==='TEXT_MESSAGE_START'||type==='REASONING_MESSAGE_START'){
      checked++;
      const map=type==='TEXT_MESSAGE_START'?textOwners:reasoningOwners;
      const id=field(event,'messageId',i),owner=tag(event,i);
      if(id===null||owner===null)continue;
      if(map.has(id)){issue(i,'duplicate-selected-opener',id);continue;}
      map.set(id,{owner,start:i});
    }else if(type==='TEXT_MESSAGE_CONTENT'||type==='TEXT_MESSAGE_END'||
             type==='REASONING_MESSAGE_CONTENT'||type==='REASONING_MESSAGE_END'){
      checked++;
      const reasoning=type.startsWith('REASONING_');
      checkContinuation(event,i,reasoning?reasoningOwners:textOwners,'messageId',type.endsWith('_END'));
    }else if(type==='TOOL_CALL_START'){
      checked++;
      const id=field(event,'toolCallId',i),own=tag(event,i);
      if(id===null||own===null)continue;
      if(toolOwners.has(id)){issue(i,'duplicate-selected-opener',id);continue;}
      let inherited=own;
      if(has(event,'parentMessageId')){
        const parent=field(event,'parentMessageId',i);
        if(parent===null)continue;
        const tracked=textOwners.get(parent);
        if(tracked){
          if(has(event,'subagentRunId')&&own!==tracked.owner){issue(i,'parent-message-owner-mismatch',id);continue;}
          if(!has(event,'subagentRunId'))inherited=tracked.owner;
        }
      }
      toolOwners.set(id,{owner:inherited,start:i});
    }else if(type==='TOOL_CALL_ARGS'||type==='TOOL_CALL_END'){
      checked++;
      const id=string(event.toolCallId)?event.toolCallId:null;
      const original=id===null?undefined:toolOwners.get(id);
      const issueCount=issues.length;
      checkContinuation(event,i,toolOwners,'toolCallId',type==='TOOL_CALL_END');
      if(type==='TOOL_CALL_END'&&id!==null&&original&&issues.length===issueCount)
        completedToolOwners.set(id,original);
    }else if(type==='TOOL_CALL_RESULT'){
      checked++;
      // A result need not be paired with an opener in the same run; 2.6C
      // already reviews tool lifecycle. Here check ownership only if known.
      const id=field(event,'toolCallId',i),own=tag(event,i);
      if(id===null||own===null)continue;
      const opened=toolOwners.get(id)??completedToolOwners.get(id);
      if(opened&&has(event,'subagentRunId')&&opened.owner!==own)
        issue(i,'owner-mismatch',id);
    }else if(type==='ACTIVITY_SNAPSHOT'){
      checked++;
      const id=field(event,'messageId',i),own=tag(event,i);
      if(id===null||own===null)continue;
      const existing=activityOwners.get(id);
      if(existing){
        if(has(event,'subagentRunId')&&own!==existing.owner)issue(i,'owner-mismatch',id);
      }else activityOwners.set(id,{owner:own,start:i});
    }else if(type==='ACTIVITY_DELTA'){
      checked++;
      checkContinuation(event,i,activityOwners,'messageId');
    }else if(type==='STEP_STARTED'||type==='STEP_FINISHED'){
      checked++;
      const name=field(event,'stepName',i),own=tag(event,i);
      if(name===null||own===null)continue;
      const key=JSON.stringify([own,name]);
      if(type==='STEP_STARTED'){
        if(openSteps.has(key))issue(i,'duplicate-owner-step',name);
        else openSteps.add(key);
      }else if(!openSteps.delete(key))issue(i,'step-not-open-for-owner',name);
    }else if(type==='STATE_SNAPSHOT'||type==='STATE_DELTA'){
      checked++;
      tag(event,i); // provenance only: state remains Run-scoped
    }
  }
  return {ok:issues.length===0,issues,warnings,checked};
};
