/** Node-only synthetic assertions and reproducible JSON fixture export. */
import {FIXTURES,evaluateIndependentEvidence} from './independent-evidence';

declare const process:{argv:string[];stdout:{write(text:string):void}};
if(process.argv.includes('--export-fixtures')){
  process.stdout.write(JSON.stringify(FIXTURES)+'\n');
}else{
  let count=0;
  const check=(good:boolean,label:string)=>{if(!good)throw new Error('FAIL: '+label); count++;process.stdout.write('PASS: '+label+'\n');};
  check(FIXTURES.length===40,'exact 40 independently judgeable strict schema fixtures');
  check(new Set(FIXTURES.map(f=>f.id)).size===FIXTURES.length,'unique fixture identifiers');
  check(FIXTURES.some(f=>f.gap==='G1'),'PartSource discrepancy represented without policy resolution');
  check(FIXTURES.some(f=>f.gap==='G3'),'recursive validation coverage represented');
  for(const f of FIXTURES){
    check(f.id.length>=4,'fixture has stable identifier '+f.id);
    check(/^[A-Za-z][A-Za-z0-9]*$/.test(f.definition),'definition is pinned safe ref '+f.id);
    check(typeof f.strictValid==='boolean','strict expected verdict explicit '+f.id);
    check(f.note.length>=12,'source reasoning recorded '+f.id);
  }
  const src=FIXTURES.find(f=>f.id==='image-unknown-source');
  check(src?.strictValid===false&&src.gap==='G1','raw schema rejection is not normative compatibility resolution');
  const future=FIXTURES.find(f=>f.id==='content-future');
  check(future?.strictValid===false,'strict unknown ContentPart rejection not conflated with processing');
  const data=FIXTURES.find(f=>f.id==='image-data-annotation');
  check(data?.strictValid===true,'base64 contentEncoding annotation not a decoder assertion');
  for(const booleans of [[false,false,false],[true,false,false],[false,true,true],[true,true,true]]){
    const v=evaluateIndependentEvidence(...booleans as [boolean,boolean,boolean]);
    check(v.status==='insufficient'&&v.adapterReady===false,'unverified gates cannot promote adapter readiness '+booleans);
    check(v.milestone2_6==='OPEN'&&v.unresolved.length===9,'nine gaps remain OPEN '+booleans);
  }
  process.stdout.write(`${count} 2.6I selected independent-evidence assertions passed\n`);
}
