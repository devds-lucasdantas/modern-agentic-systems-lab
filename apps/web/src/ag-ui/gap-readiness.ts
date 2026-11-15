/**
 * MASL 2.6H — decision/evidence register for selected AG-UI 1.0 gaps.
 * Frozen schema: ag-ui-protocol/ag-ui@2330368a2a74573902858867072406638ba3073d.
 * Intentionally NOT an implementation of AG-UI, an independent evidence
 * verifier, a transport bridge, a protocol conformance certification or an
 * authorization to deploy an Agent Server adapter. No external effects.
 */

export type GapId = 'G1'|'G2'|'G3'|'G4'|'G5'|'G6'|'G7'|'G8'|'G9';
export type GapDomain = 'normative'|'interoperability'|'transport'|'security'|'integration';
export type Disposition =
  | 'escalate-normative-conflict'
  | 'defer-pending-implementation'
  | 'scope-json-sse-only'
  | 'require-independent-security-review'
  | 'require-separate-adapter-design';
export type EvidenceKind = 'normative-decision'|'executable-conformance'|
  'transport-differential'|'integration-test'|'security-review'|'design-review';
export type GapRecord = Readonly<{
  id:GapId;
  domain:GapDomain;
  disposition:Disposition;
  blocker:string;
  ownerRole:string;
  evidenceKind:EvidenceKind;
  acceptanceCriteria:readonly string[];
  upstreamRefs:readonly string[];
  dependencies:readonly GapId[];
  milestoneOpen:true;
}>;

/**
 * Decision record, not proof of compliance. Even a scoped/excluded item is
 * still OPEN until a separate independent gate validates its evidence.
 */
export const GAP_REGISTER:readonly GapRecord[]=Object.freeze(([
  {id:'G1',domain:'normative',disposition:'escalate-normative-conflict',
    blocker:'Unknown PartSource arm: processing.mdx says drop containing part; run-input.mdx calls the source union closed and validation-fatal.',
    ownerRole:'AG-UI specification maintainer',evidenceKind:'normative-decision',
    acceptanceCriteria:['Obtain an authoritative written interpretation for unknown PartSource.type.',
      'Add paired known-malformed versus unknown-extension tests for inbound and outbound paths.'],
    upstreamRefs:['basic/processing.mdx','basic/run-input.mdx'],dependencies:[],milestoneOpen:true},
  {id:'G2',domain:'interoperability',disposition:'defer-pending-implementation',
    blocker:'No real retired-shape registry and translation middleware were verified.',
    ownerRole:'protocol compatibility maintainer',evidenceKind:'executable-conformance',
    acceptanceCriteria:['Identify actual registry entries, expiry and version applicability.',
      'Test lossless/lossy translation before enforcement without malformed-value repair.'],
    upstreamRefs:['basic/versioning.mdx','basic/processing.mdx'],dependencies:['G1'],milestoneOpen:true},
  {id:'G3',domain:'interoperability',disposition:'defer-pending-implementation',
    blocker:'Selected checks are not complete recursive AG-UI 1.0 schema conformance.',
    ownerRole:'protocol validation maintainer',evidenceKind:'executable-conformance',
    acceptanceCriteria:['Exercise 31 events and nested definitions with a pinned standards-aware validator.',
      'Cover unknown optional/required unions and known-invalid fields without partial acceptance.'],
    upstreamRefs:['spec/1.0/schema.json','basic/processing.mdx'],dependencies:['G1'],milestoneOpen:true},
  {id:'G4',domain:'transport',disposition:'scope-json-sse-only',
    blocker:'A future JSON/SSE experiment must not claim protobuf, multi-binding or presence parity.',
    ownerRole:'transport maintainer',evidenceKind:'transport-differential',
    acceptanceCriteria:['State JSON/SSE-only scope in any proposed experiment.',
      'Before claiming multi-binding conformance, prove parity and document protobuf presence limits.'],
    upstreamRefs:['basic/processing.mdx','basic/transports/http-sse.mdx'],dependencies:['G3'],milestoneOpen:true},
  {id:'G5',domain:'interoperability',disposition:'defer-pending-implementation',
    blocker:'Synthetic stage traces do not implement an enforced, replay-safe pipeline.',
    ownerRole:'consumer pipeline maintainer',evidenceKind:'integration-test',
    acceptanceCriteria:['Verify compatibility -> middleware -> enforcement -> expansion -> verification -> application.',
      'Test normal, replay, reconnection and malformed-chunk paths before any app sink.'],
    upstreamRefs:['basic/processing.mdx'],dependencies:['G2','G3'],milestoneOpen:true},
  {id:'G6',domain:'interoperability',disposition:'defer-pending-implementation',
    blocker:'Peer negotiation and actual capability-aware downgrade have not been exercised.',
    ownerRole:'protocol versioning maintainer',evidenceKind:'integration-test',
    acceptanceCriteria:['Test declared, absent, unrecognized and incompatible versions end-to-end.',
      'Verify downgrade warnings, immutable IDs/order/outcomes, and no invalid-value repair.'],
    upstreamRefs:['basic/versioning.mdx','basic/run-input.mdx'],dependencies:['G3','G5'],milestoneOpen:true},
  {id:'G7',domain:'security',disposition:'require-independent-security-review',
    blocker:'Media decoding, URL access, provider handles and confidentiality/DLP are not verified.',
    ownerRole:'security and media owners',evidenceKind:'security-review',
    acceptanceCriteria:['Threat-model SSRF, payload size, MIME confusion and logging exposures.',
      'Test opaque provider handles, capabilities, safe fetch and DLP with independent evidence.'],
    upstreamRefs:['basic/run-input.mdx','basic/processing.mdx'],dependencies:['G1','G3'],milestoneOpen:true},
  {id:'G8',domain:'security',disposition:'require-independent-security-review',
    blocker:'Authorization, persistence, concurrency, idempotency and multi-client isolation remain unproven.',
    ownerRole:'application security and state owners',evidenceKind:'security-review',
    acceptanceCriteria:['Specify and test authorization, tenant boundaries and durable state update rules.',
      'Exercise concurrent mutation, retries, CAS and failure/recovery without lost writes.'],
    upstreamRefs:['basic/processing.mdx'],dependencies:['G3','G5'],milestoneOpen:true},
  {id:'G9',domain:'integration',disposition:'require-separate-adapter-design',
    blocker:'No Agent Server REST/SSE -> AG-UI semantics or frontend adapter exists.',
    ownerRole:'Agent Server/frontend integration owners',evidenceKind:'design-review',
    acceptanceCriteria:['Approve a separate adapter ADR and explicit event-mapping matrix.',
      'Verify tool lifecycle, stream truncation, errors, auth and persistence in independent e2e tests.'],
    upstreamRefs:['basic/processing.mdx','basic/transports/http-sse.mdx'],
    dependencies:['G1','G3','G5','G6','G7','G8'],milestoneOpen:true},
] satisfies GapRecord[]).map(g=>Object.freeze({...g,
  acceptanceCriteria:Object.freeze([...g.acceptanceCriteria]),
  upstreamRefs:Object.freeze([...g.upstreamRefs]),
  dependencies:Object.freeze([...g.dependencies]),
})));

const IDS:readonly GapId[]=Object.freeze(['G1','G2','G3','G4','G5','G6','G7','G8','G9']);
const ID_SET:ReadonlySet<string>=new Set(IDS);
const isRecord=(v:unknown):v is Record<string,unknown>=>
  v!==null && typeof v==='object' && !Array.isArray(v);
const sameArray=(a:readonly unknown[],b:readonly unknown[]):boolean=>
  a.length===b.length && a.every((item,index)=>item===b[index]);
const sameStrings=(a:unknown,b:readonly string[]):boolean=>
  Array.isArray(a)&&sameArray(a,b);

export type LedgerReview=
 | Readonly<{kind:'accepted';openIds:readonly GapId[];normativeEscalations:readonly GapId[];
      scopedOnly:readonly GapId[];evidenceRequired:9;coverage:'decision-record-only'}>
 | Readonly<{kind:'rejected';code:string;index:number;exposedCount:0}>;

/** Strictly verifies the *shape* of our exact nine unchanged decisions.
 * It never treats assertions inside the record as independently verified evidence. */
export const reviewDecisionLedger=(input:unknown):LedgerReview=>{
  const fail=(code:string,index:number):LedgerReview=>
    ({kind:'rejected',code,index,exposedCount:0});
  if(!Array.isArray(input)||input.length!==IDS.length)return fail('exactly-nine-required',-1);
  const seen=new Set<string>();
  for(let i=0;i<input.length;i++){
    const value:unknown=input[i];
    if(!isRecord(value)||typeof value.id!=='string'||!ID_SET.has(value.id))
      return fail('unknown-gap-or-shape',i);
    if(seen.has(value.id))return fail('duplicate-gap',i);
    seen.add(value.id);
    const expected=GAP_REGISTER.find(g=>g.id===value.id)!;
    const allowed=['id','domain','disposition','blocker','ownerRole','evidenceKind',
      'acceptanceCriteria','upstreamRefs','dependencies','milestoneOpen'];
    if(Object.keys(value).some(k=>!allowed.includes(k)))return fail('unexpected-ledger-field',i);
    if(value.domain!==expected.domain||value.disposition!==expected.disposition||
       value.blocker!==expected.blocker||value.ownerRole!==expected.ownerRole||
       value.evidenceKind!==expected.evidenceKind||value.milestoneOpen!==true||
       !sameStrings(value.acceptanceCriteria,expected.acceptanceCriteria)||
       !sameStrings(value.upstreamRefs,expected.upstreamRefs)||
       !sameStrings(value.dependencies,expected.dependencies))return fail('decision-tampered',i);
  }
  return {kind:'accepted',openIds:IDS,normativeEscalations:['G1'],
    scopedOnly:['G4'],evidenceRequired:9,coverage:'decision-record-only'};
};

export type EvidenceClaim=Readonly<{
  gapId:GapId;
  artifactId:string;
  sha256:string;
  verifier:string;
  scope:string;
}>;
export type EvidenceReview=
 | Readonly<{kind:'claims-present-unverified';claims:number;gapIds:readonly GapId[];
      physicalArtifactsVerified:0;isProof:false}>
 | Readonly<{kind:'rejected';index:number;code:string;physicalArtifactsVerified:0}>;

/** Metadata-only checks. NO file IO, no hash recomputation, no trust escalation. */
export const reviewEvidenceClaims=(value:unknown):EvidenceReview=>{
  const fail=(index:number,code:string):EvidenceReview=>
    ({kind:'rejected',index,code,physicalArtifactsVerified:0});
  if(!Array.isArray(value)||value.length>64)return fail(-1,'claims-array-limit');
  const seen=new Set<string>(),ids=new Set<GapId>();
  for(let index=0;index<value.length;index++){
    const v:unknown=value[index];
    if(!isRecord(v))return fail(index,'claim-object-required');
    if(Object.keys(v).some(k=>!['gapId','artifactId','sha256','verifier','scope'].includes(k)))
      return fail(index,'unexpected-claim-field');
    if(typeof v.gapId!=='string'||!ID_SET.has(v.gapId))return fail(index,'claim-gap-invalid');
    for(const field of ['artifactId','verifier','scope']){
      if(typeof v[field]!=='string'||v[field].trim().length===0||v[field].length>250)
        return fail(index,'claim-string-invalid');
    }
    if(typeof v.sha256!=='string'||!/^[0-9a-f]{64}$/.test(v.sha256))
      return fail(index,'claim-sha-invalid');
    const identity=`${v.gapId}\0${v.artifactId}`;
    if(seen.has(identity))return fail(index,'duplicate-claim');
    seen.add(identity);
    ids.add(v.gapId as GapId);
  }
  return {kind:'claims-present-unverified',claims:value.length,
    gapIds:IDS.filter(id=>ids.has(id)),physicalArtifactsVerified:0,isProof:false};
};

export type ReadinessResult =
 | Readonly<{status:'blocked';scope:'planning-only';ledger:'accepted';claims:'unverified';
      requiredEvidence:readonly GapId[];blockedDecisions:readonly string[];
      milestone2_6:'OPEN';adapterImplemented:false;productionReady:false}>
 | Readonly<{status:'rejected';code:string;index:number}>;
/** No claim or user-provided flag can promote this scoped review to readiness. */
export const evaluateAdapterReadiness=(ledger:unknown,claims:unknown):ReadinessResult=>{
  const decisions=reviewDecisionLedger(ledger);
  if(decisions.kind!=='accepted')return {status:'rejected',code:decisions.code,index:decisions.index};
  const evidence=reviewEvidenceClaims(claims);
  if(evidence.kind==='rejected')return {status:'rejected',code:evidence.code,index:evidence.index};
  return {
    status:'blocked',scope:'planning-only',ledger:'accepted',claims:'unverified',
    requiredEvidence:IDS,
    blockedDecisions:['full-AG-UI-conformance','operational-adapter',
      'production-deployment','milestone-2.6-closure'],
    milestone2_6:'OPEN',adapterImplemented:false,productionReady:false,
  };
};

/** Does not choose between the contradictory prose rules for an unknown source. */
export const reviewUnknownPartSource=(sourceType:unknown):
 Readonly<{verdict:'known-shape-only'|'unresolved-source'|'malformed-known-type';
             normativeResolved:false}>=>{
  if(typeof sourceType!=='string')return {verdict:'malformed-known-type',normativeResolved:false};
  if(['data','url','file'].includes(sourceType))return {verdict:'known-shape-only',normativeResolved:false};
  return {verdict:'unresolved-source',normativeResolved:false};
};
