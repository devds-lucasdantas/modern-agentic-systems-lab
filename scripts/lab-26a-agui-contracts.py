#!/usr/bin/env python3
"""MASL Lab 2.6A: frozen upstream AG-UI 1.0 event schema inventory.

Read-only repository preflight; fetch a pinned upstream schema (or accept the
exact same schema from a local file); emit evidence ONLY outside the repo.
This is a contract discovery, not an Agent Server-to-AG-UI bridge.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha1, sha256
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASELINE = 'f2b2594d57b4819c93bb833aff2e666d63fe8a72'
REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
UPSTREAM_REPO = 'https://github.com/ag-ui-protocol/ag-ui'
UPSTREAM_COMMIT = '2330368a2a74573902858867072406638ba3073d'
UPSTREAM_SCHEMA_PATH = 'spec/1.0/schema.json'
UPSTREAM_SCHEMA_BLOB = 'c2ce3c18036b6bb2afe583a9b916959e7dcd9b78'
UPSTREAM_URL = (
    'https://raw.githubusercontent.com/ag-ui-protocol/ag-ui/'
    f'{UPSTREAM_COMMIT}/{UPSTREAM_SCHEMA_PATH}'
)
SCHEMA_ID = 'https://ag-ui.com/spec/1.0/schema.json'
SCRIPT = 'scripts/lab-26a-agui-contracts.py'

# Known published 2.5 closure contract boundaries. These are Git *blob* IDs.
BLOBS = {
    'ROADMAP.md': 'f88bb7cdd31e36f5bc8496d7cb046aa6a5313082',
    'CURRENT.md': '9abfd81dc284ab279b07f1560bc0ab05bf8a2a27',
    'docs/journal/lab-22-frontend-tools.md': '69fbfc68692d3c032f9fc6bb1ca3969ad1b65ac9',
    'apps/web/package.json': '08e11bfa09e78c00fb907b92cd14c486f429dfc4',
    'apps/web/src/transport/agent-server/stream-events.ts': '28d5d831d7d89d064fa48619b00a50800c76e42b',
    'apps/web/src/execution/stream-projector.ts': 'f91dd411c810744615a5bf6918342a03a91cf82d',
}
GROUPS = {
    'run_and_step': ('RUN_STARTED', 'RUN_FINISHED', 'RUN_ERROR', 'STEP_STARTED', 'STEP_FINISHED'),
    'text': ('TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END', 'TEXT_MESSAGE_CHUNK'),
    'tool': ('TOOL_CALL_START', 'TOOL_CALL_ARGS', 'TOOL_CALL_END', 'TOOL_CALL_CHUNK', 'TOOL_CALL_RESULT'),
    'state': ('STATE_SNAPSHOT', 'STATE_DELTA', 'MESSAGES_SNAPSHOT'),
    'activity': ('ACTIVITY_SNAPSHOT', 'ACTIVITY_DELTA'),
    'reasoning': ('REASONING_START', 'REASONING_MESSAGE_START', 'REASONING_MESSAGE_CONTENT',
                  'REASONING_MESSAGE_END', 'REASONING_MESSAGE_CHUNK', 'REASONING_END',
                  'REASONING_ENCRYPTED_VALUE'),
    'subagent': ('SUBAGENT_STARTED', 'SUBAGENT_FINISHED', 'SUBAGENT_ERROR'),
    'passthrough': ('RAW', 'CUSTOM'),
}
REQUIRED_EXAMPLES = {
    'RUN_STARTED': ('type', 'threadId', 'runId'),
    'TOOL_CALL_START': ('type', 'toolCallId', 'toolCallName'),
    'TOOL_CALL_ARGS': ('type', 'toolCallId', 'delta'),
    'TOOL_CALL_END': ('type', 'toolCallId'),
    'TOOL_CALL_RESULT': ('type', 'messageId', 'toolCallId', 'content'),
    'STATE_SNAPSHOT': ('type', 'snapshot'),
    'STATE_DELTA': ('type', 'delta'),
}
# Observed on the pinned Agent Server in the independently reviewed 2.5A.
AGENT_SERVER_OBSERVED = {
    'messages/complete': 2,
    'messages/metadata': 2,
    'metadata': 1,
    'updates': 2,
    'values': 3,
}
# This is NOT a semantic translation table. Each mapping is explicitly unproven.
CROSSWALK = [
    {'agent_server': 'metadata', 'ag_ui': 'RUN_STARTED', 'status': 'not_equivalent',
     'reason': 'An SSE metadata record is not an AG-UI typed run lifecycle event.'},
    {'agent_server': 'values', 'ag_ui': 'STATE_SNAPSHOT', 'status': 'not_equivalent',
     'reason': 'Agent Server graph values and AG-UI agent state have different ownership.'},
    {'agent_server': 'updates', 'ag_ui': 'STATE_DELTA', 'status': 'not_equivalent',
     'reason': 'Node updates are not RFC 6902 JSON Patch instructions.'},
    {'agent_server': 'messages/complete', 'ag_ui': 'TEXT_MESSAGE_END', 'status': 'not_equivalent',
     'reason': 'The event is not a typed AG-UI message lifecycle boundary.'},
    {'agent_server': 'messages/partial', 'ag_ui': 'TEXT_MESSAGE_CONTENT', 'status': 'not_equivalent',
     'reason': 'Agent Server partial message structures are not AG-UI text deltas.'},
    {'agent_server': 'ThreadState.values.messages.tool_calls', 'ag_ui': 'TOOL_CALL_START',
     'status': 'candidate_adapter_only',
     'reason': 'Persisted ToolCall identity may be adapted only with a reviewed lifecycle policy.'},
    {'agent_server': 'ThreadState.values.messages.ToolMessage', 'ag_ui': 'TOOL_CALL_RESULT',
     'status': 'candidate_adapter_only',
     'reason': 'Persisted result correlation does not prove tool start/end or authorization.'},
    {'agent_server': 'Run.status + ThreadState.next', 'ag_ui': 'RUN_FINISHED',
     'status': 'candidate_adapter_only',
     'reason': 'Run lifecycle and graph END are independent; status translation requires a policy.'},
]


def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.check_output(['git', *args], cwd=cwd, text=True,
                                   stderr=subprocess.STDOUT).strip()


def check(ok: bool, message: str) -> None:
    if not ok:
        raise RuntimeError(message)


def preflight() -> None:
    check(git('rev-parse', 'HEAD') == BASELINE, 'HEAD differs from published 2.5 closure')
    check(git('rev-parse', 'origin/main') == BASELINE, 'origin/main differs from reviewed HEAD')
    check(not git('diff', '--name-only'), 'tracked worktree changed')
    check(not git('diff', '--cached', '--name-only'), 'staged changes present')
    check(git('ls-files', '--others', '--exclude-standard').splitlines() == [SCRIPT],
          'unexpected untracked files (expected only 2.6A discovery)')
    check((ROOT/'ROADMAP.md').read_text(encoding='utf8').splitlines().count('- [ ] 2.6 AG-UI') == 1,
          '2.6 roadmap boundary missing')
    for path, expected in BLOBS.items():
        check(git('rev-parse', f'HEAD:{path}') == expected, 'wrong Git blob: ' + path)
        check(git('hash-object', path) == expected, 'worktree blob changed: ' + path)
    check(git('rev-parse', 'HEAD', cwd=ROOT/'.reference/interrupt26-deepagents') == REFERENCE,
          'pinned reference commit differs')
    check((ROOT/'.reference/interrupt26-deepagents/.venv/bin/langgraph').is_file(),
          'pinned reference Runtime CLI missing')
    print('PASS: f2b2594 HEAD/origin, six original blobs, pinned reference and scoped worktree', flush=True)
    print('PASS: preflight read-only; AG-UI adapter and network not invoked', flush=True)


def verified_bytes(raw: bytes) -> dict:
    check(0 < len(raw) <= 300_000, 'schema size out of bounds')
    blob = sha1(b'blob ' + str(len(raw)).encode('ascii') + b'\x00' + raw).hexdigest()
    check(blob == UPSTREAM_SCHEMA_BLOB, 'upstream schema Git blob mismatch; fail closed')
    try:
        schema = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as ex:
        raise RuntimeError('upstream schema JSON malformed') from ex
    check(isinstance(schema, dict) and schema.get('$id') == SCHEMA_ID,
          'unexpected schema identity')
    check(schema.get('$schema') == 'https://json-schema.org/draft/2020-12/schema',
          'unexpected JSON Schema dialect')
    check(schema.get('$ref') == '#/$defs/Event', 'root does not refer to Event')
    return schema


def schema_bytes(filename: Path | None) -> bytes:
    if filename is not None:
        check(filename.is_file(), 'schema file unavailable: ' + str(filename))
        data = filename.read_bytes()
        check(len(data) <= 300_000, 'schema local file too large')
        return data
    req = Request(UPSTREAM_URL, headers={'User-Agent': 'MASL-2.6A-versioned-schema-discovery',
                                          'Accept': 'application/json'})
    try:
        with urlopen(req, timeout=25) as response:
            check(response.status == 200, 'upstream HTTP not 200')
            data = response.read(300_001)
    except Exception as exc:
        raise RuntimeError('network fetch unavailable; pass --schema-file with the exact pinned schema: '
                           + type(exc).__name__) from exc
    check(len(data) <= 300_000, 'upstream response too large')
    return data


def inventory(schema: dict) -> dict:
    defs = schema.get('$defs')
    check(isinstance(defs, dict), 'missing definitions')
    enum = defs.get('EventType', {}).get('enum')
    check(isinstance(enum, list) and len(enum) == 31 and len(set(enum)) == 31,
          'AG-UI 1.0 event enumeration drifted')
    expected = set(value for values in GROUPS.values() for value in values)
    check(len(expected) == 31 and set(enum) == expected, 'event family inventory mismatch')
    members = defs.get('Event', {}).get('oneOf')
    check(isinstance(members, list) and len(members) == len(enum), 'Event union differs')
    found = {}
    for member in members:
        check(isinstance(member, dict), 'invalid Event union member')
        ref = member.get('$ref')
        check(isinstance(ref, str) and ref.startswith('#/$defs/'), 'bad Event definition ref')
        name = ref.removeprefix('#/$defs/')
        defn = defs.get(name)
        check(isinstance(defn, dict), 'referenced event definition missing')
        type_ = defn.get('properties', {}).get('type', {}).get('const')
        check(isinstance(type_, str) and type_ in expected, 'unrecognized event discriminator')
        check(type_ not in found, 'duplicate event discriminator')
        required = defn.get('required', [])
        check(isinstance(required, list) and 'type' in required, 'missing required type field')
        found[type_] = {'definition': name, 'required': required}
    check(set(found) == set(enum), 'Event union and enum not bijective')
    for event, required in REQUIRED_EXAMPLES.items():
        check(set(required) <= set(found[event]['required']),
              'important contract requirement changed: ' + event)
    inp = defs.get('RunAgentInput', {})
    check(set(('threadId', 'runId', 'messages')) <= set(inp.get('required', [])),
          'RunAgentInput required fields changed')
    check('protocolVersion' in inp.get('properties', {}), 'RunAgentInput version missing')
    check('protocolVersion' in defs['RunStartedEvent'].get('properties', {}),
          'RunStartedEvent protocolVersion missing')
    check(set(AGENT_SERVER_OBSERVED) == {'messages/complete', 'messages/metadata',
          'metadata', 'updates', 'values'}, 'observed pinned SSE inventory drifted')
    check(sum(AGENT_SERVER_OBSERVED.values()) == 10, '2.5A SSE count mismatch')
    check(all(x['status'] != 'equivalent' for x in CROSSWALK),
          'unreviewed direct protocol equivalence')
    return {
        'event_count': len(enum),
        'families': {group: list(events) for group, events in GROUPS.items()},
        'event_definitions': found,
        'run_agent_input_required': inp.get('required'),
        'agent_server_observed_25a': AGENT_SERVER_OBSERVED,
        'comparison': CROSSWALK,
    }


def report(raw: bytes, data: dict, directory: Path, source: str) -> None:
    directory.mkdir(parents=True, exist_ok=False)
    schema_file = directory/'schema-1.0-pinned.json'
    schema_file.write_bytes(raw)
    metadata = {
        'lab': '2.6A', 'status': 'PASS', 'date_utc': datetime.now(timezone.utc).isoformat(),
        'baseline': BASELINE, 'pinned_reference': REFERENCE,
        'official_spec': '1.0', 'upstream_repo': UPSTREAM_REPO,
        'upstream_commit': UPSTREAM_COMMIT, 'upstream_schema_git_blob': UPSTREAM_SCHEMA_BLOB,
        'source': source, 'schema_sha256': sha256(raw).hexdigest(),
        **data,
        'boundaries': {
            'no_agui_runtime_or_sdk_installed': True,
            'no_agent_server_adapter_or_network_mutation': True,
            'no_production_authorization_claim': True,
            'no_sse_semantic_equivalence_claim': True,
            'no_tool_argument_or_result_forwarding': True,
            'historical_25a_logs_not_revalidated': True,
        }
    }
    dest = directory/'inventory.json'
    dest.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
    lines = [
        '# Lab 2.6A — AG-UI 1.0 pinned contract discovery', '',
        f'Baseline: `{BASELINE}`; upstream commit: `{UPSTREAM_COMMIT}`.',
        f'Schema Git blob: `{UPSTREAM_SCHEMA_BLOB}`. Schema SHA-256: `{metadata["schema_sha256"]}`.',
        '', f'Schema event definitions: **{data["event_count"]}**, in {len(GROUPS)} families.',
        'The upstream schema is the structural source; the behavioural specification must also be reviewed.',
        '', '## Event families', '',
        '| Group | Count | Members |', '|---|---:|---|',
    ]
    for group, members in data['families'].items():
        lines.append(f'| {group} | {len(members)} | {", ".join("`"+x+"`" for x in members)} |')
    lines += ['', '## Comparison — no automatic translation', '',
              '| Agent Server observation | AG-UI event | Status | Reason |', '|---|---|---|---|']
    for item in CROSSWALK:
        lines.append(f'| `{item["agent_server"]}` | `{item["ag_ui"]}` | {item["status"]} | {item["reason"]} |')
    lines += ['', '## Trust boundaries', '',
              '- Runtime Agent Server SSE is not an AG-UI stream without an explicit, tested adapter.',
              '- `messages/complete` is not `TOOL_CALL_END`, nor graph END, nor Run success.',
              '- `updates` is not necessarily an RFC 6902 `STATE_DELTA`.',
              '- Persisted tool correlation is not real-time tool lifecycle or proof of side effects.',
              '- AG-UI tool argument chunks, `rawEvent` and result content require explicit redaction rules.',
              '- This discovery does not execute models, tools or a new Agent Server Run.',
              '- 2.5A historic logs were not revalidated here; the event counts are historical facts.',
              '- No production authentication, idempotency, checkpoint CAS or DLP guarantee.',
              '', '## Next', '',
              '2.6B: typed, read-only AG-UI event grammar and identity/ordering validation,',
              'separate from the existing Agent Server REST/SSE transport.',
              '', '## Primary sources', '',
              f'- {UPSTREAM_REPO}/tree/{UPSTREAM_COMMIT}/spec/1.0',
              '- https://ag-ui.com/spec/1.0/schema.json',
              '- Local MASL docs/journal/lab-22-frontend-tools.md', '']
    (directory/'inventory.md').write_text('\n'.join(lines), encoding='utf8')
    print('PASS: upstream AG-UI 1.0 schema Git blob verified', flush=True)
    print('PASS: 31 event discriminators, 8 families, 31 union members and required fields', flush=True)
    print('PASS: observed 2.5A SSE kept distinct from AG-UI tool lifecycle', flush=True)
    print('PASS: no adapter, Run POST, model calls or repository writes', flush=True)
    print('EVIDENCE DIRECTORY: ' + str(directory), flush=True)
    for name in ('schema-1.0-pinned.json', 'inventory.json', 'inventory.md'):
        f = directory/name
        print(f'EVIDENCE: {name} SHA256 {sha256(f.read_bytes()).hexdigest()}', flush=True)
    print('LAB STATUS: PASS — scoped AG-UI 1.0 contract discovery; 2.6 remains OPEN', flush=True)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    modes = p.add_mutually_exclusive_group(required=True)
    modes.add_argument('--preflight', action='store_true')
    modes.add_argument('--run', action='store_true')
    p.add_argument('--schema-file', type=Path, help='offline exact pinned schema (Git blob verified)')
    p.add_argument('--output-dir', type=Path, help='evidence output dir, outside repository')
    a = p.parse_args()
    try:
        preflight()
        if a.preflight:
            return
        raw = schema_bytes(a.schema_file.expanduser() if a.schema_file else None)
        schema = verified_bytes(raw)
        facts = inventory(schema)
        out = (a.output_dir.expanduser().resolve() if a.output_dir else
               Path(tempfile.mkdtemp(prefix='masl-26a-agui-')).resolve())
        # mkdtemp returns an existing directory. Explicit output must not already exist.
        check(ROOT != out and ROOT not in out.parents, 'output must not be under repository')
        if a.output_dir:
            report(raw, facts, out, 'offline-exact-blob' if a.schema_file else 'pinned-upstream-network')
        else:
            out.rmdir()
            report(raw, facts, out, 'offline-exact-blob' if a.schema_file else 'pinned-upstream-network')
    except Exception as error:
        print('BLOCKED: '+str(error), file=sys.stderr, flush=True)
        raise SystemExit(2) from None


if __name__ == '__main__':
    main()
