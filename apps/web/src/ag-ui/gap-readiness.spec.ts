/** MASL 2.6H: pure, model-free assertions; NOT independent external evidence. */
import {
  GAP_REGISTER, reviewDecisionLedger, reviewEvidenceClaims,
  evaluateAdapterReadiness, reviewUnknownPartSource,
  type GapId,
} from './gap-readiness';

let count=0;
const check=(value:boolean,label:string):void=>{
  if(!value)throw new Error('FAIL: '+label);
  count++;
  console.log('PASS: '+label);
};
const copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x)) as T;
const ids=GAP_REGISTER.map(g=>g.id);
check(GAP_REGISTER.length===9,'exactly nine pinned 2.6G gaps represented');
check(ids.join(',')==='G1,G2,G3,G4,G5,G6,G7,G8,G9','gap order is stable');
check(new Set(ids).size===9,'gap IDs unique');
check(Object.isFrozen(GAP_REGISTER),'register container frozen');
for(const gap of GAP_REGISTER){
  check(gap.milestoneOpen===true,`${gap.id} remains open`);
  check(gap.ownerRole.length>8,`${gap.id} identifies a responsible role`);
  check(gap.acceptanceCriteria.length>=2,`${gap.id} requires explicit acceptance criteria`);
  check(gap.acceptanceCriteria.every(s=>s.length>15),`${gap.id} acceptance criteria nontrivial`);
  check(gap.upstreamRefs.length>=1,`${gap.id} source anchors declared`);
  check(!gap.dependencies.includes(gap.id),`${gap.id} no self-dependency`);
  check(gap.dependencies.every(d=>ids.includes(d)),`${gap.id} dependencies are known`);
  check(Object.isFrozen(gap)&&Object.isFrozen(gap.acceptanceCriteria)&&
    Object.isFrozen(gap.upstreamRefs)&&Object.isFrozen(gap.dependencies),
    `${gap.id} decision data recursively frozen at enumerated levels`);
}
const by=(id:GapId)=>GAP_REGISTER.find(g=>g.id===id)!;
check(by('G1').disposition==='escalate-normative-conflict','G1 needs upstream clarification');
check(by('G1').upstreamRefs.includes('basic/processing.mdx')&&
  by('G1').upstreamRefs.includes('basic/run-input.mdx'),'G1 records conflicting pinned prose');
check(by('G4').disposition==='scope-json-sse-only','G4 deliberately excludes multi-transport');
check(by('G9').disposition==='require-separate-adapter-design','G9 requires independent adapter design');
check(by('G9').dependencies.includes('G7')&&by('G9').dependencies.includes('G8'),
  'adapter readiness depends on security gating');
check(by('G7').domain==='security'&&by('G8').domain==='security',
  'G7/G8 are explicitly security-sensitive');
check(by('G2').blocker.includes('registry'),'G2 does not claim a real registry');
check(by('G3').blocker.includes('recursive'),'G3 cannot claim full conformance');
check(by('G5').blocker.includes('Synthetic'),'G5 treats trace as non-operational');
check(by('G6').blocker.includes('capability'),'G6 keeps peer negotiation open');
const adjacency=new Set<string>();
for(const gap of GAP_REGISTER){
  for(const prerequisite of gap.dependencies){
    const relation=`${gap.id}:${prerequisite}`;
    check(!adjacency.has(relation),`unique dependency edge ${relation}`);
    adjacency.add(relation);
  }
}
// Stable reachability audit: dependencies cannot form a cycle or dead end.
const visited=new Set<string>(),visiting=new Set<string>();
const dfs=(id:GapId):boolean=>{
  if(visiting.has(id))return false;
  if(visited.has(id))return true;
  visiting.add(id);
  for(const dep of by(id).dependencies)if(!dfs(dep))return false;
  visiting.delete(id);visited.add(id);return true;
};
check(ids.every(id=>dfs(id)),'gap prerequisite graph is acyclic');
check(visited.size===9,'all nine prerequisite graph nodes reachable');

const valid=reviewDecisionLedger(copy(GAP_REGISTER));
check(valid.kind==='accepted','exact complete decision ledger accepted');
if(valid.kind==='accepted'){
  check(valid.openIds.length===9,'ledger retains nine open gaps');
  check(valid.evidenceRequired===9,'each gap needs independent evidence');
  check(valid.normativeEscalations.join(',')==='G1','normative escalation isolated to G1');
  check(valid.scopedOnly.join(',')==='G4','JSON/SSE scope decision isolated to G4');
  check(valid.coverage==='decision-record-only','decision register is not conformance proof');
}
const reversed=reviewDecisionLedger(copy([...GAP_REGISTER].reverse()));
check(reversed.kind==='accepted','ledger input order does not create artificial mismatch');
const native=reviewDecisionLedger(GAP_REGISTER);
check(native.kind==='accepted','frozen original ledger accepted');
for(const bad of [undefined,null,false,{},'G1',[],[{}],copy(GAP_REGISTER).slice(1),
  [...copy(GAP_REGISTER),copy(GAP_REGISTER[0])]]){
  const v=reviewDecisionLedger(bad);
  check(v.kind==='rejected'&&v.exposedCount===0,
    'incomplete or malformed ledger rejected with no partial result');
}
const duplicated=copy(GAP_REGISTER) as unknown as Record<string,unknown>[];duplicated[8]=copy(duplicated[0]);
check(reviewDecisionLedger(duplicated).kind==='rejected','duplicate gap blocks review');
const unknown=copy(GAP_REGISTER) as unknown as Record<string,unknown>[];
unknown[1]={...unknown[1],id:'G10'};
check(reviewDecisionLedger(unknown).kind==='rejected','unknown gap ID blocks review');
const mutatedKeys=['id','domain','disposition','blocker','ownerRole','evidenceKind',
  'acceptanceCriteria','upstreamRefs','dependencies','milestoneOpen'] as const;
for(const key of mutatedKeys){
  const bad=copy(GAP_REGISTER) as unknown as Record<string,unknown>[];
  if(key==='id')bad[0]![key]='G2';
  else if(key==='dependencies')bad[0]![key]=['G9'];
  else if(key==='acceptanceCriteria'||key==='upstreamRefs')bad[0]![key]=[];
  else if(key==='milestoneOpen')bad[0]![key]=false;
  else bad[0]![key]='user-approved';
  const verdict=reviewDecisionLedger(bad);
  check(verdict.kind==='rejected'&&verdict.exposedCount===0,
    `tampering with ${key} cannot promote a gap`);
}
for(const id of ids){
  const bad=copy(GAP_REGISTER) as unknown as Record<string,unknown>[];
  const item=bad.find(x=>x.id===id)!;
  item.claimedResolved=true;
  const verdict=reviewDecisionLedger(bad);
  check(verdict.kind==='rejected',`${id} rejects unverified claimedResolved flag`);
}
const prototype=copy(GAP_REGISTER) as unknown as Record<string,unknown>[];
Object.defineProperty(prototype[0]!,'toString',{value:'future extension',enumerable:true});
check(reviewDecisionLedger(prototype).kind==='rejected','extra prototype-like own field cannot bypass ledger');

check(reviewEvidenceClaims([]).kind==='claims-present-unverified','empty claim list is not proof');
const claim={gapId:'G1',artifactId:'upstream-issue-1',
  sha256:'a'.repeat(64),verifier:'independent-reviewer',scope:'selected prose'};
const one=reviewEvidenceClaims([claim]);
check(one.kind==='claims-present-unverified','syntactically plausible claim accepted only as metadata');
if(one.kind==='claims-present-unverified'){
  check(one.physicalArtifactsVerified===0,'no filesystem evidence verified');
  check(one.isProof===false,'metadata alone never proves conformance');
  check(one.claims===1&&one.gapIds[0]==='G1','claim identity remains visible');
}
const nine=reviewEvidenceClaims(ids.map(id=>({...claim,gapId:id,artifactId:`evidence-${id}`})));
check(nine.kind==='claims-present-unverified','nine self-attested claims never prove nine gaps');
if(nine.kind==='claims-present-unverified'){
  check(nine.physicalArtifactsVerified===0,'all nine proof claims remain unverified');
  check(nine.gapIds.join(',')===ids.join(','),'all nine metadata IDs inventoried');
}
for(const bad of [null,0,false,'claim',{},[null],Array.from({length:65},()=>claim),
  [{...claim,gapId:'G10'}],[{...claim,gapId:42}],
  [{...claim,sha256:'z'.repeat(64)}],[{...claim,sha256:'A'.repeat(64)}],
  [{...claim,sha256:'a'.repeat(63)}],[{...claim,artifactId:''}],
  [{...claim,verifier:'   '}],[{...claim,scope:''}],
  [{...claim,secretToken:'private'}],[claim,claim]]){
  const out=reviewEvidenceClaims(bad);
  check(out.kind==='rejected'&&out.physicalArtifactsVerified===0,
    'malformed or duplicate evidence declaration blocked');
}
for(const value of ['data','url','file']){
  const review=reviewUnknownPartSource(value);
  check(review.verdict==='known-shape-only',`${value} is only a known structural arm`);
  check(review.normativeResolved===false,`${value} does not resolve the disputed policy`);
}
for(const value of ['future-source','future-source-two','','toString','__proto__']){
  const review=reviewUnknownPartSource(value);
  check(review.verdict==='unresolved-source'&&review.normativeResolved===false,
    `unrecognized ${value} is explicitly unresolved`);
}
for(const bad of [undefined,null,42,false,[],{},Symbol('source')]){
  const review=reviewUnknownPartSource(bad);
  check(review.verdict==='malformed-known-type'&&review.normativeResolved===false,
    'nonstrings are malformed; not forward-compatible string extensions');
}
const readiness=evaluateAdapterReadiness(copy(GAP_REGISTER),[]);
check(readiness.status==='blocked','valid ledger is still not adapter-ready');
if(readiness.status==='blocked'){
  check(readiness.scope==='planning-only','review remains planning-only');
  check(readiness.milestone2_6==='OPEN','parent milestone cannot auto-close');
  check(readiness.adapterImplemented===false,'adapter is not implemented');
  check(readiness.productionReady===false,'production readiness not asserted');
  check(readiness.requiredEvidence.join(',')===ids.join(','),'all nine evidence classes required');
  check(readiness.blockedDecisions.length===4,'four protected readiness gates remain blocked');
}
const claimed=evaluateAdapterReadiness(copy(GAP_REGISTER),ids.map(id=>({...claim,gapId:id,artifactId:`evidence-${id}`})));
check(claimed.status==='blocked','nine claimed hashes cannot promote readiness');
const forged=copy(GAP_REGISTER) as unknown as Record<string,unknown>[];
forged[0]!.milestoneOpen=false;
check(evaluateAdapterReadiness(forged,[]).status==='rejected',
  'forged closure fails readiness evaluation');
check(evaluateAdapterReadiness(copy(GAP_REGISTER),[{...claim,verifier:''}]).status==='rejected',
  'invalid claim fails readiness evaluation');
check(GAP_REGISTER.every(g=>g.milestoneOpen),'no test changed frozen status');
console.log(`${count} 2.6H selected readiness/decisions assertions passed`);
