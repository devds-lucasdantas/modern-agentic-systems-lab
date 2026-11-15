#!/usr/bin/env python3
"""MASL 2.6I: selected independent Draft 2020-12 schema oracle gate.

A separate Python jsonschema validator checks genuine frozen official AG-UI
schema bytes against 40 immutable TS fixtures. This is an independently
implemented schema engine, not a full AG-UI protocol conformance certification.
--preflight reads only; --run writes evidence exclusively outside repository.
No Agent Server, Runtime, HTTP, model, tool, security, Git writes or frontend hook.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha1, sha256
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/web'
HEAD = '6d31049241736aad0724872511e053e9161f50ac'
REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
AGUI_COMMIT = '2330368a2a74573902858867072406638ba3073d'
SCHEMA_SHA = '4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB = 'c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
SCHEMA = Path.home() / 'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json'
SRC = 'apps/web/src/ag-ui/independent-evidence.ts'
TEST = 'apps/web/src/ag-ui/independent-evidence.spec.ts'
RUNNER = 'scripts/lab-26i-independent-review.py'
# Filled at package creation, immutable after installing.
SRC_SHA = '9156483fc7dff287a80bc82155f3d49250f2ac6484cca983287c90beeb482d26'
TEST_SHA = 'bd7c518d0f9213bbfa330a24e3910ae95a8ea2a85bd56cd2cbc3d4379c6a59c5'
ASSERTIONS = 175
FIXTURES = 40
EXPECTED_UNTRACKED = sorted((SRC, TEST, RUNNER))
BLOBS = {
    'ROADMAP.md': '5b4bb947fa10fc52efa622ae604651c4f4d2acaf',
    'CURRENT.md': 'ad05051d3cbb97625d9483f5c2d45e1c3553e472',
    'docs/journal/lab-23-ag-ui.md': 'eed9843f717994be11b834e17334e8723e694e51',
    'apps/web/src/ag-ui/gap-readiness.ts': '2a1a7c24c82ad8a22652986594a60938083e6bfa',
    'apps/web/src/ag-ui/gap-readiness.spec.ts': 'a9445b7a6929292702e96b021afb4320d1c8a419',
    'scripts/lab-26h-readiness-review.py': 'fd474d1a43f37a4a91b0e7c20844c5e665a0006f',
    'apps/web/src/ag-ui/compatibility-review.ts': '36fd07559dca60a8fd1da1401d71816647ddae2b',
    'apps/web/src/ag-ui/content-ownership.ts': '0caef8c958ea7cb186bbedb3aecac6f6587f2e3c',
    'apps/web/src/transport/agent-server/sse.ts': '85b0e8d6abf10068b10fd8bfb3ef0f2414686572',
}
PROSE_BLOBS = {
    'docs/spec/1.0/basic/processing.mdx': '22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47',
    'docs/spec/1.0/basic/run-input.mdx': '96dabc92854f8bffa423450edff54f83585c4cbf',
    'docs/spec/1.0/basic/versioning.mdx': '860f82956864d5fcf29cb7d1e2993e315f03ff59',
    'docs/spec/1.0/basic/transports/http-sse.mdx': '993b465d9e6a849fa3a616eb599c16671fccafcb',
}


def need(ok: bool, message: str) -> None:
    if not ok: raise RuntimeError('BLOCKED: ' + message)


def sha(raw: bytes) -> str: return sha256(raw).hexdigest()


def blob(raw: bytes) -> str:
    return sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.check_output(['git', *args], cwd=cwd, text=True,
                                   stderr=subprocess.STDOUT).strip()


def schema_gate(path: Path) -> dict:
    need(path.is_file() and not path.is_symlink(), 'official schema absent, nonregular or symlink: ' + str(path))
    raw = path.read_bytes()
    need(sha(raw) == SCHEMA_SHA and blob(raw) == SCHEMA_BLOB, 'official schema hash/blob drift')
    data = json.loads(raw)
    defs = data['$defs']
    need(data['$schema'] == 'https://json-schema.org/draft/2020-12/schema', 'not Draft 2020-12 schema')
    need(len(defs['Event']['oneOf']) == 31, '31-event union mismatch')
    need([x['$ref'].split('/')[-1] for x in defs['ContentPart']['oneOf']] ==
         ['TextPart','ImagePart','AudioPart','VideoPart','DocumentPart'], 'ContentPart drift')
    need([x['$ref'].split('/')[-1] for x in defs['PartSource']['oneOf']] ==
         ['DataSource','UrlSource','FileSource'], 'PartSource drift')
    print('PASS: official frozen Draft 2020-12 AG-UI schema hash/blob and selected definitions', flush=True)
    return data


# Validator discovery must not add packages, run a package manager or hit network.
# Intentionally records the installed library version rather than assuming one.
PROBE = '''import jsonschema, importlib.metadata as m
from jsonschema import Draft202012Validator
v=m.version("jsonschema")
major,minor,patch=map(int,v.split("."))
assert (4,18,0) <= (major,minor,patch) < (5,0,0)
print(v)
'''


def validator_python(explicit: Path | None) -> tuple[Path,str]:
    candidates = [explicit] if explicit is not None else [
        Path(sys.executable),
        ROOT/'.reference/interrupt26-deepagents/.venv/bin/python',
        ROOT/'.venv/bin/python',
        WEB/'.venv/bin/python',
    ]
    examined = set()
    for path in candidates:
        if path is None or not path.is_file(): continue
        path = path.resolve()
        if str(path) in examined: continue
        examined.add(str(path))
        try:
            p = subprocess.run([str(path),'-c',PROBE], capture_output=True, text=True,
                               env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'}, timeout=15, check=False)
            if p.returncode == 0 and re.fullmatch(r'\d+\.\d+\.\d+',p.stdout.strip()):
                return path, p.stdout.strip()
        except (OSError,subprocess.TimeoutExpired): pass
    raise RuntimeError('BLOCKED: independent Python jsonschema Draft 2020-12 validator >=4.18,<5 missing. '
                       'Use --validator-python /path/to/python (with jsonschema installed); '
                       'no packages were installed or downloaded.')


def preflight(schema: Path, python: Path | None) -> tuple[Path,str]:
    need(git('symbolic-ref','--quiet','--short','HEAD') == 'main','expected main branch')
    need(git('rev-parse','HEAD') == HEAD,'Git HEAD is not published 2.6H baseline')
    need(git('rev-parse','origin/main') == HEAD,'origin/main differs from published baseline')
    need(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
         'tracked or staged Git modifications')
    need(sorted(git('ls-files','--others','--exclude-standard').splitlines()) == EXPECTED_UNTRACKED,
         'unexpected untracked files')
    need(git('rev-parse','HEAD',cwd=ROOT/'.reference/interrupt26-deepagents') == REFERENCE,
         'workshop HEAD drift')
    for rel, expected in BLOBS.items():
        need(git('rev-parse','HEAD:'+rel)==expected and git('hash-object',rel)==expected,
             'baseline Git blob mismatch: '+rel)
    for rel,expected in ((SRC,SRC_SHA),(TEST,TEST_SHA)):
        path=ROOT/rel
        need(path.is_file() and not path.is_symlink() and sha(path.read_bytes())==expected,
             'source payload missing/hash drift: '+rel)
    runner=ROOT/RUNNER
    need(runner.is_file() and not runner.is_symlink(), 'runner missing/unsafe')
    # Runner integrity is bound by the installer and untracked source state; the
    # standalone runner may not hash its own bytes without a recursive fixed point.
    schema_gate(schema)
    roadmap=(ROOT/'ROADMAP.md').read_text(encoding='utf-8').splitlines()
    need(roadmap.count('- [ ] 2.6 AG-UI')==1 and
         roadmap.count('  - [ ] 2.6I AG-UI independent conformance evidence and adapter decision gates')==1,
         '2.6I or parent milestone unexpectedly changed')
    vpython,version=validator_python(python)
    print('PASS: independent jsonschema Draft 2020-12 validator version '+version+' via '+str(vpython),flush=True)
    print('PASS: exact 6d31049 HEAD/origin, nine blobs, reference, three isolated 2.6I files',flush=True)
    print('PASS: read-only preflight; no Git writes, network, Runtime/model/tool or Agent Server',flush=True)
    return vpython,version


def gate(name: str, command:list[str], cwd:Path, dest:Path) -> None:
    with dest.open('w',encoding='utf-8') as file:
        try:
            p=subprocess.run(command,cwd=cwd,stdout=file,stderr=subprocess.STDOUT,
                             timeout=240,check=False,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
        except subprocess.TimeoutExpired:
            raise RuntimeError('BLOCKED: gate timeout '+name+'; '+str(dest)) from None
    need(p.returncode == 0, 'gate '+name+' failed: '+str(dest))
    print('PASS: '+name+' SHA256 '+sha(dest.read_bytes()),flush=True)


# The oracle operates in an entirely separate Python process/runtime, with
# jsonschema's official Draft 2020-12 implementation; no TS module is imported.
# It checks actual pinned schema $defs, including recursive nested references.
ORACLE = r'''import json,sys,importlib.metadata
from jsonschema import Draft202012Validator
src=json.load(open(sys.argv[1],encoding="utf-8"))
fixtures=json.load(open(sys.argv[2],encoding="utf-8"))
Draft202012Validator.check_schema(src)
assert len(fixtures)==40, 'fixture count drift'
ids=set()
for case in fixtures:
  assert set(case)=={'id','definition','instance','strictValid','gap','note'}, 'fixture shape'
  assert isinstance(case['id'],str) and case['id'] not in ids, 'duplicate fixture'
  ids.add(case['id'])
  definition=case['definition']
  assert definition in src['$defs'], 'unknown schema definition'
  assert isinstance(case['strictValid'],bool), 'invalid expected verdict'
  # JSON Schema raw strict result, before processing rules, is all we judge.
  root=dict(src)
  root['$ref']='#/$defs/'+definition
  errors=list(Draft202012Validator(root).iter_errors(case['instance']))
  passed=(len(errors)==0)
  if passed != case['strictValid']:
    print('BLOCKED: oracle mismatch '+case['id']+' expected='+str(case['strictValid'])+
          ' observed='+str(passed)+' rules='+','.join(sorted(set(e.validator for e in errors))))
    sys.exit(2)
  print('PASS: '+case['id']+' strict-schema='+str(passed))
print(str(len(fixtures))+' 2.6I independent Draft 2020-12 oracle fixtures passed')
'''


def run(schema:Path, out:Path, explicit_python:Path|None)->None:
    vpython,version=preflight(schema,explicit_python)
    repo=ROOT.resolve()
    resolved=out.resolve()
    need(resolved!=repo and repo not in resolved.parents, 'evidence path inside Git repo')
    need(not out.exists(), 'evidence path exists; refusing overwrite '+str(out))
    out.mkdir(parents=True)
    gate('lint.log',['pnpm','lint'],WEB,out/'lint.log')
    gate('build.log',['pnpm','build'],WEB,out/'build.log')
    ssr=out/'ssr'
    gate('compile.log',['pnpm','exec','vite','build','--ssr',
        'src/ag-ui/independent-evidence.spec.ts','--outDir',str(ssr),'--emptyOutDir'],WEB,out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    js=str(ssr/'independent-evidence.spec.js')
    gate('pure.log',['node',js],WEB,out/'pure.log')
    pure=(out/'pure.log').read_text(encoding='utf-8')
    found=re.search(r'(?m)^(\d+) 2\.6I selected independent-evidence assertions passed\s*$',pure)
    need(found is not None and int(found.group(1))==ASSERTIONS,
         'expected 175 pure TS assertions')
    need(pure.count('PASS: ')==ASSERTIONS,'pure log PASS count mismatch')
    for name in ('raw schema rejection is not normative compatibility resolution',
                 'base64 contentEncoding annotation not a decoder assertion',
                 'nine gaps remain OPEN true,true,true'):
        need(name in pure,'critical TS test not present: '+name)
    proc=subprocess.run(['node',js,'--export-fixtures'],cwd=WEB,capture_output=True,text=True,
                        timeout=30,check=False)
    need(proc.returncode==0 and not proc.stderr.strip(),'failed clean fixture export')
    fixtures=json.loads(proc.stdout)
    need(isinstance(fixtures,list) and len(fixtures)==FIXTURES,'exact 40 fixture JSON export missing')
    (out/'fixtures.json').write_text(json.dumps(fixtures,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')
    # Validator is run independently; no TypeScript testing assertion can
    # fake a passing Python schema result if the frozen contract disagrees.
    gate('schema-oracle.log',[str(vpython),'-c',ORACLE,str(schema),str(out/'fixtures.json')],
         WEB,out/'schema-oracle.log')
    oracle=(out/'schema-oracle.log').read_text(encoding='utf-8')
    need(oracle.count('PASS: ')==FIXTURES and
         f'{FIXTURES} 2.6I independent Draft 2020-12 oracle fixtures passed' in oracle,
         'independent oracle did not verify exactly 40 fixtures')
    preflight(schema,explicit_python)
    log_hashes={name:sha((out/name).read_bytes()) for name in
                ('lint.log','build.log','compile.log','pure.log','schema-oracle.log','fixtures.json')}
    report={
       'lab':'2.6I','status':'PASS','scope':'40 selected strict schema fixtures via independent Python Draft 2020-12 engine',
       'published_baseline':HEAD,'upstream_commit':AGUI_COMMIT,
       'schema_sha256':SCHEMA_SHA,'schema_git_blob':SCHEMA_BLOB,
       'reference_commit':REFERENCE,'schema_validator_name':'python-jsonschema',
       'schema_validator_version':version,'validator_python':str(vpython),
       'fixtures':FIXTURES,'typescript_assertions':ASSERTIONS,'four_web_gates_passed':True,
       'independent_oracle_passed':True,'evidence_hashes':log_hashes,
       'source_sha256':{rel:sha((ROOT/rel).read_bytes()) for rel in (SRC,TEST,RUNNER)},
       'prose_git_blobs_source_reviewed':PROSE_BLOBS,
       'normative_partsource_resolved':False,'gaps_open':['G'+str(i) for i in range(1,10)],
       'adapter_implemented':False,'adapter_ready':False,'parent_2_6_open':True,
       'limits':[
         '40 selected oracle cases do not exercise all 31 Event branches or all 98 definitions',
         'The schema validator proves strict schema decisions, not processing compatibility semantics',
         'Unknown PartSource ambiguity between pinned prose remains unresolved',
         'No executable full pipeline, middleware, SSE/protobuf transport differential, reconnection, or client state',
         'No independent authorization, media safety, persistence or multi-client isolation evidence',
         'No Agent Server adapter, network, Runtime, model or tool call and no authorization to deploy',
       ],
       'timestamp_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    lines=['# MASL 2.6I — selected independent strict schema oracle','',
       f'Baseline `{HEAD}`; official schema `{SCHEMA_SHA}`.',
       f'Independent `python-jsonschema` {version}, Draft 2020-12, {FIXTURES} fixtures PASS.',
       f'TypeScript {ASSERTIONS}/{ASSERTIONS} model-free assertions, four web gates PASS.','',
       '## Physical evidence','', '| Artifact | SHA-256 |','|---|---|',
       *[f'| `{key}` | `{val}` |' for key,val in log_hashes.items()],
       '', '## Unproven boundaries','', *[f'- {line}' for line in report['limits']],
       '', '**G1-G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**','']
    (out/'review.md').write_text('\n'.join(lines),encoding='utf-8')
    print('REVIEW STATUS: PASS — selected 2.6I independent strict schema cases; adapter BLOCKED, 2.6 OPEN',flush=True)
    print('EVIDENCE DIRECTORY: '+str(out),flush=True)
    for name in ('review.json','review.md'):
        print('EVIDENCE: '+name+' SHA256 '+sha((out/name).read_bytes()),flush=True)


def main()->None:
    p=argparse.ArgumentParser(description=__doc__)
    group=p.add_mutually_exclusive_group(required=True)
    group.add_argument('--preflight',action='store_true')
    group.add_argument('--run',action='store_true')
    p.add_argument('--schema',type=Path,default=SCHEMA)
    p.add_argument('--output-dir',type=Path)
    p.add_argument('--validator-python',type=Path,help='explicit Python with jsonschema installed; no install is performed')
    a=p.parse_args()
    try:
        if a.preflight: preflight(a.schema.absolute(),a.validator_python)
        else:
            need(a.output_dir is not None,'--run requires --output-dir')
            run(a.schema.absolute(),a.output_dir.absolute(),a.validator_python)
    except (RuntimeError,ValueError,KeyError,TypeError,FileNotFoundError,OSError,
            subprocess.CalledProcessError,subprocess.TimeoutExpired) as exc:
        msg=str(exc)
        print(msg if msg.startswith('BLOCKED:') else 'BLOCKED: '+msg,file=sys.stderr)
        raise SystemExit(2) from None

if __name__=='__main__': main()
