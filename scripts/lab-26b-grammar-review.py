#!/usr/bin/env python3
"""MASL 2.6B: pinned AG-UI 1.0 structural envelope + local trace review.

Never imports AG-UI into the existing Agent Server frontend, sends no Run,
uses no models and does not infer real tool side effects. Runtime validator
intentionally checks the event *envelope*, not all nested JSON Schema defs.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha1, sha256
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/web'
HEAD = '140fdfbb25f14d1305bf51a7c1b990723ed5045f'
REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
SCHEMA_SHA = '4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a'
SCHEMA_BLOB = 'c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
SCHEMA_ID = 'https://ag-ui.com/spec/1.0/schema.json'
SCHEMA_COMMIT = '2330368a2a74573902858867072406638ba3073d'
SRC = 'apps/web/src/ag-ui/event-grammar.ts'
TEST = 'apps/web/src/ag-ui/event-grammar.spec.ts'
RUNNER = 'scripts/lab-26b-grammar-review.py'
EXPECTED_UNTRACKED = sorted([SRC, TEST, RUNNER])
BLOBS = {
    'ROADMAP.md': '0119ef903c6c0dbdc12c3093e7d280850c9ded5c',
    'CURRENT.md': 'd1fca9725106d2dbabacbc85c981693c681bad4a',
    'docs/journal/lab-23-ag-ui.md': '1ae04017abc58d6b8ede878a0e35c44f753f0c26',
    'scripts/lab-26a-agui-contracts.py': 'ae6b08b000b83fa7c88682d37879ad991062199d',
    'apps/web/package.json': '08e11bfa09e78c00fb907b92cd14c486f429dfc4',
    'apps/web/src/transport/agent-server/stream-events.ts': '28d5d831d7d89d064fa48619b00a50800c76e42b',
}
TS_HASHES = {  # Installed payload hashes, frozen during package assembly.
    SRC: '987b8e64e87d8b551ae80e6d085d4c30a6d781f7f7ae7a08a25c8211e2147ff3',
    TEST: '45fdc034dee8199fb2b2bc3c91d3ee5592d778ce36050a57d522941726ad3450',
}
REF_KIND = {
    'TextMessageRole': 'text-role',
    'JsonPatch': 'json-patch',
    'State': 'state',
    'RunAgentInput': 'run-input',
    'RunFinishedOutcome': 'run-outcome',
    'SubagentFinishedOutcome': 'subagent-outcome',
    'ReasoningEncryptedValueSubtype': 'reasoning-subtype',
    'SubagentRunId': 'subagent-id',
}
BASE_FIELDS = {'type', 'timestamp', 'rawEvent', 'metadata'}


def require(ok: bool, reason: str) -> None:
    if not ok:
        raise RuntimeError(reason)


def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.check_output(['git', *args], cwd=cwd, text=True,
                                   stderr=subprocess.STDOUT).strip()


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def preflight() -> None:
    require(git('rev-parse', 'HEAD') == HEAD and git('rev-parse', 'origin/main') == HEAD,
            'baseline Git HEAD/origin changed')
    require(not git('diff', '--name-only') and not git('diff', '--cached', '--name-only'),
            'tracked or staged changes detected')
    actual = sorted(git('ls-files', '--others', '--exclude-standard').splitlines())
    require(actual == EXPECTED_UNTRACKED,
            f'unexpected untracked files: {actual!r}')
    for path, blob in BLOBS.items():
        require(git('rev-parse', 'HEAD:' + path) == blob and git('hash-object', path) == blob,
                'published Git blob mismatch: ' + path)
    for path, expected in TS_HASHES.items():
        require(digest(ROOT / path) == expected, 'changed 2.6B payload: ' + path)
    require(git('rev-parse', 'HEAD', cwd=ROOT/'.reference/interrupt26-deepagents') == REFERENCE,
            'pinned workshop reference changed')
    require((ROOT/'ROADMAP.md').read_text(encoding='utf8').count(
        '  - [ ] 2.6B Typed AG-UI event grammar and validation') == 1,
        'reviewed 2.6B roadmap boundary missing')
    print('PASS: 140fdfb HEAD/origin, six Git blobs, pinned reference, exact 2.6B payloads and scope', flush=True)


def kind(prop: dict) -> str:
    if 'const' in prop:
        val = prop['const']
        if isinstance(val, str):
            return 'string'
        if isinstance(val, bool):
            return 'boolean'
        raise RuntimeError('unsupported schema const kind')
    if '$ref' in prop:
        target = prop['$ref'].split('/')[-1]
        require(target in REF_KIND, 'unsupported AG-UI field ref: ' + target)
        return REF_KIND[target]
    typ = prop.get('type')
    if typ in ('string', 'integer', 'array', 'object', 'boolean'):
        return typ
    if prop.get('not', {}).get('type') == 'null':
        return 'not-null-json'
    choices = prop.get('oneOf')
    if isinstance(choices, list):
        if {p.get('type') for p in choices} == {'string', 'array'}:
            return 'string-or-array'
    if not any(k in prop for k in ('type', '$ref', 'oneOf', 'const', 'not')):
        return 'any-json'
    raise RuntimeError('unsupported primary field shape: ' + repr(prop)[:180])


def parse_ts_specs(source: str) -> dict:
    # Conservative parser for intentionally one-line, literal, source-derived manifest.
    pattern = re.compile(
        r'^  ([A-Z][A-Z_]+): \{ required: \[(.*?)\], fields: \{ (.*?) \}, attributable: (true|false) \},?$',
        re.MULTILINE)
    specs: dict[str, dict] = {}
    for m in pattern.finditer(source):
        name, required_raw, fields_raw, attrib = m.groups()
        require(name not in specs, 'duplicate TS manifest key: ' + name)
        required = re.findall(r"'([^']+)'", required_raw)
        fields = {a: b for a,b in re.findall(r"(\w+): '([^']+)'", fields_raw)}
        require(len(fields) == fields_raw.count(": '"), 'unparsed TS field(s): ' + name)
        specs[name] = {'required':required, 'fields':fields, 'attributable':attrib=='true'}
    require(len(specs) == 31, f'parsed {len(specs)} TS manifest entries rather than 31')
    return specs


def check_schema(path: Path) -> tuple[dict, dict]:
    require(path.is_file(), 'pinned 2.6A schema evidence missing: '+str(path))
    raw = path.read_bytes()
    require(len(raw) < 160_000, 'pinned schema exceeds 160KB budget')
    require(sha256(raw).hexdigest() == SCHEMA_SHA, 'pinned schema SHA-256 mismatch')
    blob = sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()
    require(blob == SCHEMA_BLOB, 'pinned schema Git blob mismatch')
    schema = json.loads(raw)
    defs = schema['$defs']
    types = defs['EventType']['enum']
    union = [x['$ref'].split('/')[-1] for x in defs['Event']['oneOf']]
    require(schema.get('$id') == SCHEMA_ID and schema.get('$ref') == '#/$defs/Event',
            'schema ID or root changed')
    require(len(types) == 31 and len(set(types)) == 31 and len(union) == 31,
            'schema discriminator/union cardinality differs from pinned 2.6A')
    require(set(defs['BaseEvent']['properties']) == BASE_FIELDS, 'BaseEvent fields unexpectedly changed')
    require(set(defs['Attributable']['properties']) == {'subagentRunId'},
            'Attributable fields unexpectedly changed')
    specs = parse_ts_specs((ROOT/SRC).read_text(encoding='utf8'))
    require(set(specs) == set(types), 'TS discriminator set mismatches pinned schema')
    for definition in union:
        d = defs[definition]
        const = d['properties']['type'].get('const')
        require(const in specs, 'union member without TS event spec: ' + definition)
        spec = specs[const]
        require(set(spec['required']) == set(d['required']) - {'type'},
                'required-field mismatch for ' + const)
        require(set(spec['fields']) == set(d['properties'])-{'type'},
                'property set mismatch for ' + const)
        for name, value in d['properties'].items():
            if name == 'type':
                continue
            actual = spec['fields'][name]
            expected = kind(value)
            require(actual == expected,
                    f'field type mismatch {const}.{name}: {actual} vs {expected}')
        allof = {ref['$ref'].split('/')[-1] for ref in d.get('allOf', [])}
        require('BaseEvent' in allof, 'event does not compose BaseEvent: '+const)
        require(spec['attributable'] == ('Attributable' in allof),
                'subagent attribution mismatch for '+const)
    require(defs['RunAgentInput']['required'] == ['threadId','runId','messages'],
            'RunAgentInput required field contract changed')
    print('PASS: pinned schema SHA, Git blob and 31 event variant/field/required/attribution definitions', flush=True)
    return schema, {'schema_sha256':SCHEMA_SHA, 'git_blob':SCHEMA_BLOB, 'members':len(union),
                    'run_agent_input_required':defs['RunAgentInput']['required']}


def command(label: str, args: list[str], cwd: Path, logfile: Path) -> str:
    with logfile.open('w', encoding='utf8') as stream:
        proc = subprocess.run(args, cwd=cwd, text=True, stdout=stream, stderr=subprocess.STDOUT,
                              timeout=180)
    raw = logfile.read_text(encoding='utf8')
    require(proc.returncode == 0, f'{label} failed; inspect {logfile}')
    require(not re.search(r'^\s*(?:FAIL:|ERROR:|Traceback \(most recent|error TS\d+:)', raw,
                          re.IGNORECASE|re.MULTILINE), f'{label} failure marker')
    if label == 'pure grammar':
        m = re.search(r'^(\d+) 2\.6B structural grammar and local trace diagnostics passed$', raw,
                      re.MULTILINE)
        require(m is not None and int(m.group(1)) >= 175,
                'expected >=175 explicit 2.6B grammar/trace checks')
    d = digest(logfile)
    print(f'PASS: {label} SHA256 {d}', flush=True)
    return d


def run(args: argparse.Namespace) -> None:
    preflight()
    schema_path = args.schema.resolve()
    _, contract = check_schema(schema_path)
    out = args.output_dir.resolve()
    require(out != ROOT and ROOT not in out.parents,
            'evidence must not be written inside the repository')
    require(not out.exists() or not any(out.iterdir()),
            'output-dir is not empty; choose a fresh evidence directory')
    out.mkdir(parents=True, exist_ok=True)
    hashes: dict[str,str] = {}
    hashes['lint.log'] = command('lint', ['pnpm','lint'], WEB, out/'lint.log')
    hashes['build.log'] = command('build', ['pnpm','build'], WEB, out/'build.log')
    ssr = out/'ssr'
    hashes['compile.log'] = command('grammar test compilation', [
        'pnpm','exec','vite','build','--ssr','src/ag-ui/event-grammar.spec.ts',
        '--outDir',str(ssr),'--emptyOutDir'], WEB, out/'compile.log')
    (ssr/'package.json').write_text('{"type":"module"}\n', encoding='utf8')
    hashes['pure.log'] = command('pure grammar', [
        'node',str(ssr/'event-grammar.spec.js')], WEB, out/'pure.log')
    review = {
        'lab':'2.6B', 'status':'PASS',
        'baseline':HEAD, 'pinned_reference':REFERENCE,
        'upstream_commit':SCHEMA_COMMIT,
        'schema':contract, 'source_sha256':{name:digest(ROOT/name) for name in TS_HASHES},
        'gates_sha256':hashes,
        'test_count':int(re.search(r'^(\d+) 2\.6B',
            (out/'pure.log').read_text(encoding='utf8'), re.MULTILINE).group(1)),
        'review_scope':{
            'all_31_event_envelopes_primary_shapes':True,
            'full_json_schema_nested_validation':False,
            'trace_diagnostics_are_local_review_policy_not_normative':True,
            'agent_server_sse_adapter':False,
            'runtime_or_model_calls':False,
            'tool_content_or_args_forwarded':False,
            'existing_frontend_changed':False,
            'production_authorization_or_exactly_once':False,
        },
        'generated_utc':datetime.now(timezone.utc).isoformat(),
    }
    (out/'review.json').write_text(json.dumps(review,indent=2,sort_keys=True)+'\n',encoding='utf8')
    md = [
        '# Lab 2.6B — Typed AG-UI 1.0 envelope review', '',
        f'- Baseline: `{HEAD}`',
        f'- Official schema commit: `{SCHEMA_COMMIT}`',
        f'- Official schema SHA-256: `{SCHEMA_SHA}`',
        '- Manifest verified against **31 / 31** event discriminators, exact required fields,',
        '  property names, primary field kinds, BaseEvent and subagent attribution.',
        f"- Pure grammar / trace checks: **{review['test_count']}**", '',
        '## Gates', '',
    ]
    md.extend(f'- {name}: `{hash_value}`' for name, hash_value in hashes.items())
    md += ['', '## Explicit limits', '',
        '- This is **envelope** validation, not full Draft 2020-12 JSON Schema conformance.',
        '- Recursive message content, media parts, JSON Patch operations, outcome variants',
        '  and RunAgentInput are not validated in full by the TypeScript envelope checker.',
        '- Trace diagnostics use a local single-run policy, not normative AG-UI ordering',
        '  or evidence that tools ran, side effects happened, or runs persisted.',
        '- No Agent Server SSE translation, frontend wiring, Run requests, models, auth,',
        '  multi-client locks, idempotency or exactly-once guarantee was tested.',
    ]
    (out/'review.md').write_text('\n'.join(md)+'\n', encoding='utf8')
    print('REVIEW STATUS: PASS — scoped 2.6B envelope grammar; 2.6 remains OPEN', flush=True)
    print('EVIDENCE DIRECTORY:',out,flush=True)
    for name in ['review.json','review.md']:
        print('EVIDENCE:',name,'SHA256',digest(out/name),flush=True)
    require(not git('diff','--name-only') and not git('diff','--cached','--name-only'),
            'postflight tracked Git state changed')
    print('PASS: baseline tracked Git worktree unchanged; no AG-UI adapter or model calls',flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--preflight',action='store_true')
    group.add_argument('--run',action='store_true')
    parser.add_argument('--schema', type=Path,
        default=Path.home()/'masl-evidence/masl-26a-agui-f2b2594/schema-1.0-pinned.json')
    parser.add_argument('--output-dir',type=Path,
        default=Path.home()/'masl-evidence/masl-26b-agui-140fdfb')
    args=parser.parse_args()
    try:
        if args.preflight:
            preflight()
            check_schema(args.schema)
            print('PASS: read-only preflight; no Git, source, Runtime, network or model writes')
        else:
            run(args)
    except Exception as exc:
        print('BLOCKED:',exc,file=sys.stderr)
        sys.exit(1)

if __name__=='__main__':
    main()
