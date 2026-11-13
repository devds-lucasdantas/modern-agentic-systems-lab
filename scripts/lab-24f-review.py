#!/usr/bin/env python3
"""2.4F: read-only scoped interrupt/HITL baseline audit at an exact reviewed commit.

Executes deterministic, model-free 2.4A-2.4E gates; historical 2.4E HEAD guard
is adapted in memory after exact source SHA/Git lineage verification.
Writes evidence to /tmp; does NOT change tracked files, commit, push, or close a milestone.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/web'
BASE = 'c6f676ad4ace1e5cf3f0cdd696aa1783f2836a8f'
PINNED_REFERENCE = '3d3287cf1e51250934c11aff182d90ccfaf0e66d'
SELF = 'scripts/lab-24f-review.py'
HISTORICAL_DISCOVERY = 'scripts/lab-24e-failure-probes.py'
HISTORICAL_DISCOVERY_BLOB = 'c548b34278e2817343b054a1e266f799733ff8b4'
HISTORICAL_DISCOVERY_BASE = '6fb8e0fbcb441a6c736f7227a1e83f7d7294a41a'
# Compatibility-only, in-memory replay of a pre-commit discovery harness.
# The actual checked-out source, Git HEAD and files are never rewritten or spoofed.
HISTORICAL_GUARD = "require(head == BASELINE, f'Expected exact baseline {BASELINE}; got {head}')"
REVIEW_GUARD = (
    "require(subprocess.run(['git', 'merge-base', '--is-ancestor', BASELINE, head], "
    "cwd=ROOT, check=False).returncode == 0, "
    "f'Expected HEAD descendant of historical baseline {BASELINE}; got {head}')"
)
BLOBS = {
    'ROADMAP.md': 'e87a96fbca7e674a2322d5812a7cb3cb22e0e07d',
    'CURRENT.md': '92548e87820b3768bfbc5b5ad79bc4f1d639844f',
    'docs/journal/lab-21-interrupts.md': '841b51c840628292c8d2bc0588467cf96eff11c2',
    'apps/web/src/components/InterruptPanel.tsx': 'e1c96cb7e142a6c6af8e3effb6cc1dfa540e075c',
    'apps/web/src/execution/resume-recovery.ts': 'e6c8aa985bf37902f812a9cca0dc1098c031e1d6',
    'apps/web/src/execution/interrupt-projection.ts': 'eb026708093c127d715f2630384cf98da8e6607e',
    'apps/web/src/execution/hitl-action.ts': 'd5c6db80488690a8ea1c962e9777283e2073d8b2',
    'apps/web/src/transport/agent-server/client.ts': 'a73920060db6e42211e8155d78594ec01f741178',
    HISTORICAL_DISCOVERY: HISTORICAL_DISCOVERY_BLOB,
}
LIMITATIONS = [
    'Pinned local dev Runtime uses auth=noop; no authorization or approver identity is proven.',
    'GET preflight is not atomic with POST. Checkpoint CAS is not implemented.',
    'The resume attempt metadata marker correlates reads; it is not server-side idempotency.',
    'The per-component interlock does not survive a full remount, refresh, or another browser.',
    'A lost POST response may hide a committed Run. No automatic POST retry is permitted.',
    'Run.status=success does not establish graph END; inspect the persisted graph position.',
    'The allowlist covers only the model-free deterministic masl_24a_hitl probe.',
    'The pinned langgraph-api 0.8.1 is EOL; this gate is not a production deployment audit.',
    'The full model-dependent 2.2/2.3 end-to-end test suites are not included in this scope.',
]


def cmd_output(cmd: list[str], cwd: Path = ROOT) -> str:
    return subprocess.check_output(cmd, cwd=cwd, text=True, stderr=subprocess.STDOUT).strip()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ensure(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def preflight() -> None:
    head = cmd_output(['git', 'rev-parse', 'HEAD'])
    ensure(head == BASE, f'Unexpected HEAD {head}; requires {BASE}')
    ensure(cmd_output(['git', 'diff', '--name-only']) == '', 'Modified tracked files detected')
    ensure(cmd_output(['git', 'diff', '--cached', '--name-only']) == '', 'Staged changes detected')
    other = cmd_output(['git', 'ls-files', '--others', '--exclude-standard'])
    ensure(other.splitlines() == [SELF], f'Unexpected untracked files: {other!r}')
    for name, blob in BLOBS.items():
        ensure(cmd_output(['git', 'rev-parse', f'HEAD:{name}']) == blob,
               f'Unexpected HEAD Git blob: {name}')
        ensure(cmd_output(['git', 'hash-object', name]) == blob,
               f'Working file differs from HEAD: {name}')
    roadmap = (ROOT / 'ROADMAP.md').read_text(encoding='utf8')
    ensure('- [ ] 2.4 Interrupts' in roadmap, '2.4 must remain open before the review')
    ensure('  - [ ] 2.4F Interrupts baseline review' in roadmap, '2.4F should remain open')
    for block in 'ABCDE':
        ensure(f'  - [x] 2.4{block} ' in roadmap, f'2.4{block} not marked complete')
    current = (ROOT / 'CURRENT.md').read_text(encoding='utf8')
    ensure('2.4F Interrupts baseline review' in current, 'CURRENT does not point to 2.4F')
    reference = ROOT / '.reference/interrupt26-deepagents'
    ensure((reference / '.venv/bin/langgraph').is_file(), 'Pinned Runtime CLI missing')
    ensure(cmd_output(['git', 'rev-parse', 'HEAD'], cwd=reference) == PINNED_REFERENCE,
           'Workshop reference HEAD drifted from the pinned revision')
    ensure(cmd_output(['git', 'merge-base', '--is-ancestor', HISTORICAL_DISCOVERY_BASE, BASE]) == '',
           'Unusual merge-base output while checking historical lineage')
    print('PASS: exact 2.4E HEAD, nine Git blobs and unmodified tracked worktree')
    print('PASS: 2.4A-E checked; parent 2.4 and 2.4F deliberately still open')
    print('PASS: pinned workshop revision and Runtime CLI; only review runner is untracked')



def replay_historical_24e() -> None:
    """Run the pinned historical script unchanged except for its pre-commit HEAD guard.

    The original 2.4E discovery harness intentionally required the exact
    *pre-publication* HEAD 6fb8e0f. At reviewed post-publication HEAD c6f676a,
    that check is obsolete. Replace exactly this one assertion **in memory**
    with a real Git ancestry check; no fake git status, worktree edits or
    changes to graph/probe/runtime behavior are permitted. The output log and
    final audit report disclose this compatibility adaptation.
    """
    file = ROOT / HISTORICAL_DISCOVERY
    ensure(cmd_output(['git', 'rev-parse', f'HEAD:{HISTORICAL_DISCOVERY}'])
           == HISTORICAL_DISCOVERY_BLOB, 'Historical discovery HEAD blob drifted')
    ensure(cmd_output(['git', 'hash-object', HISTORICAL_DISCOVERY])
           == HISTORICAL_DISCOVERY_BLOB, 'Historical discovery file modified')
    # check_output raises on non-zero ancestry failure.
    cmd_output(['git', 'merge-base', '--is-ancestor', HISTORICAL_DISCOVERY_BASE, BASE])
    source = file.read_text(encoding='utf8')
    ensure(source.count(HISTORICAL_GUARD) == 1,
           'Historical exact-HEAD guard missing, repeated or changed; refusing replay')
    ensure(source.count("BASELINE = '" + HISTORICAL_DISCOVERY_BASE + "'") == 1,
           'Historical baseline declaration unexpected; refusing replay')
    adapted = source.replace(HISTORICAL_GUARD, REVIEW_GUARD)
    print('REPLAY COMPATIBILITY: source Git blob ' + HISTORICAL_DISCOVERY_BLOB, flush=True)
    print('REPLAY COMPATIBILITY: only historical exact-HEAD assertion changed in memory', flush=True)
    print('REPLAY COMPATIBILITY: Git HEAD is real; require historical BASELINE ancestor of HEAD', flush=True)
    print('REPLAY COMPATIBILITY: original 2.4E file and tracked worktree remain unchanged', flush=True)
    # __file__ must point at the original source so its ROOT is correct.
    scope = {'__name__': '__main__', '__file__': str(file), '__package__': None}
    exec(compile(adapted, str(file), 'exec'), scope, scope)


def run_command(cmd: list[str], cwd: Path, log: Path, timeout: int, append: bool = False) -> int:
    with log.open('a' if append else 'w', encoding='utf8') as handle:
        handle.write(f'$ (cd {cwd} && {shlex.join(cmd)})\n')
        handle.flush()
        try:
            result = subprocess.run(cmd, cwd=cwd, stdout=handle,
                                    stderr=subprocess.STDOUT, timeout=timeout, check=False)
            return result.returncode
        except subprocess.TimeoutExpired:
            handle.write(f'\nTIMEOUT after {timeout}s\n')
            return 124


def verify_runtime_logs(contents: str) -> list[dict[str, str]]:
    paths = re.findall(r'^RUNTIME LOG:\s*(/tmp/\S+)', contents, re.MULTILINE)
    ensure(paths, 'Runner did not disclose a Runtime log path')
    result = []
    for name in paths:
        path = Path(name)
        ensure(path.is_file(), f'Runtime log not found: {name}')
        log = path.read_text(encoding='utf8', errors='replace')
        ensure(not re.search(r'Traceback|Application shutdown failed|FileNotFoundError', log),
               f'Runtime shutdown error: {name}')
        result.append({'path': name, 'sha256': sha256(path)})
    return result


def verify_discovery(contents: str) -> dict[str, str]:
    match = re.search(r'PASS: observations recorded at\s+(/tmp/\S+)', contents)
    ensure(match is not None, 'No discovery JSON observation path')
    path = Path(match.group(1))
    obs = json.loads(path.read_text(encoding='utf8'))
    seq = obs['sequentialInterrupt']['checks']
    lost = obs['lostResponse']['checks']
    ensure(all(seq.get(k) is True for k in
               ('twoSuccessfulRuns', 'graphStillInterrupted', 'secondDynamicInterruptPersisted')),
           'Sequential interrupt invariants failed')
    ensure(all(lost.get(k) is True for k in
               ('onePost', 'clientSeesError', 'serverPersistedResume', 'manualReadbackResolvedAmbiguity')),
           'Lost response invariants failed')
    duplicate = obs['duplicateAfterEnd']['duplicateAttempt']
    ensure(duplicate['outcome'] in ('accepted', 'http-error'),
           'Unexpected duplicate observation format')
    attempts = obs['concurrentResume']['attempts']
    ensure(len(attempts) == 2, 'Expected two concurrent observations')
    ensure(all(x['outcome'] in ('accepted', 'http-error') for x in attempts),
           'Unexpected concurrent attempt outcome')
    return {'path': str(path), 'sha256': sha256(path)}


def entry(label: str, log: Path, rc: int, patterns: tuple[str, ...],
          runtime: bool = False, discovery: bool = False) -> dict:
    contents = log.read_text(encoding='utf8', errors='replace')
    missing = [p for p in patterns if re.search(p, contents) is None]
    notes = []
    runtime_logs = []
    observation = None
    ok = rc == 0 and not missing
    if ok and runtime:
        try:
            runtime_logs = verify_runtime_logs(contents)
        except Exception as e:
            notes.append(str(e)); ok = False
    if ok and discovery:
        try:
            observation = verify_discovery(contents)
        except Exception as e:
            notes.append(str(e)); ok = False
    result = {'gate': label, 'pass': ok, 'exit_code': rc, 'log': str(log),
              'sha256': sha256(log), 'missing_patterns': missing, 'notes': notes,
              'runtime_logs': runtime_logs, 'observation': observation}
    print(f'{"PASS" if ok else "FAIL"}: {label} ({log})', flush=True)
    if not ok:
        print('LOG TAIL:\n' + '\n'.join(contents.splitlines()[-35:]), flush=True)
    return result


def gate(label: str, cmd: list[str], cwd: Path, evidence: Path,
         patterns: tuple[str, ...], timeout: int = 240,
         runtime: bool = False, discovery: bool = False) -> dict:
    log = evidence / (re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-') + '.log')
    print(f'===== {label} =====', flush=True)
    rc = run_command(cmd, cwd, log, timeout)
    return entry(label, log, rc, patterns, runtime, discovery)


def pure(label: str, source: str, expect: int, line: str, evidence: Path) -> dict:
    safe = re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-')
    out = evidence / f'{safe}-ssr'
    log = evidence / f'{safe}.log'
    out.mkdir()
    print(f'===== {label} =====', flush=True)
    rc = run_command(['pnpm','exec','vite','build','--ssr',source,
                      '--outDir',str(out),'--emptyOutDir'], WEB, log, 120)
    if rc == 0:
        (out / 'package.json').write_text('{"type":"module"}\n', encoding='utf8')
        rc = run_command(['node',str(out / (Path(source).stem+'.js'))], WEB, log,
                         120, append=True)
    return entry(label, log, rc, (rf'\b{expect}\s+{re.escape(line)}\b',))


def write_report(evidence: Path, checks: list[dict], began: float) -> None:
    passed = len([x for x in checks if x['pass']])
    try:
        postflight_status = cmd_output(['git', 'status', '--porcelain', '--untracked-files=all'])
    except (subprocess.CalledProcessError, OSError) as error:
        postflight_status = f'POSTFLIGHT_GIT_FAILED: {error}'
    postflight_clean = postflight_status.splitlines() == [f'?? {SELF}']
    status = ('PASS — scoped gate complete' if passed == 11 and len(checks) == 11
              and postflight_clean else 'BLOCKED — investigate failed gates or worktree')
    payload = {'lab':'2.4F', 'baseline':BASE, 'status':status,
               'postflight_clean':postflight_clean, 'postflight_git_status':postflight_status,
               'elapsed_seconds':round(time.monotonic()-began,1),
               'checks':checks, 'limitations':LIMITATIONS,
               'historical_discovery_replay': {
                   'source': HISTORICAL_DISCOVERY,
                   'source_git_blob': HISTORICAL_DISCOVERY_BLOB,
                   'historical_head': HISTORICAL_DISCOVERY_BASE,
                   'reviewed_head': BASE,
                   'only_in_memory_change': 'exact HEAD assertion -> Git ancestor assertion',
                   'tracked_files_modified': False,
               },
               'reviewer_note':'Evidence alone does not authorize closing the milestone without review.'}
    json_path = evidence / 'review.json'
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False)+'\n', encoding='utf8')
    lines = [
        '# Lab 2.4F — Scoped Interrupts Baseline Review', '',
        f'**Result:** {status}', '',
        f'**Baseline:** `{BASE}`', '',
        f'**Gates:** {passed}/{len(checks)}', '',
        f'**Postflight worktree:** {"clean except review runner" if postflight_clean else "BLOCKED — unexpected changes"}', '',
        '| Gate | Status | SHA-256 of evidence log |', '|---|---|---|',
    ]
    lines += [f'| {x["gate"]} | {"PASS" if x["pass"] else "FAIL"} | `{x["sha256"]}` |'
              for x in checks]
    lines += ['', '## Historical 2.4E compatibility replay', '',
              'The 2.4E discovery script was originally restricted to its',
              'pre-commit HEAD `6fb8e0f`. For this post-commit review, the',
              'runner verifies the exact historical Git blob and substitutes',
              '**only** that guard in memory with a real Git ancestry check.',
              'It does not spoof HEAD, mutate the tracked script, change any',
              'other discovery probe or assert production guarantees.', '']
    lines += ['', '## Boundaries requiring explicit review', '']
    lines += ['- '+item for item in LIMITATIONS]
    lines += ['', '## Decision', '',
              'This report validates only the reproducible, model-free 2.4A–2.4E',
              'baseline. It does not assert server-backed authorization, checkpoint',
              'CAS, durable deduplication or exactly-once semantics. Do not change',
              'ROADMAP/CURRENT or commit this report automatically.', '',
              f'Observations and logs are under `{evidence}`.', '']
    md_path = evidence / 'review.md'
    md_path.write_text('\n'.join(lines), encoding='utf8')
    print(f'REVIEW STATUS: {status}', flush=True)
    print(f'REVIEW EVIDENCE: {json_path} (SHA256 {sha256(json_path)})', flush=True)
    print(f'REVIEW REPORT: {md_path} (SHA256 {sha256(md_path)})', flush=True)
    print(f'{"PASS" if postflight_clean else "BLOCKED"}: postflight Git working tree has no unexpected changes')
    print('NOTE: no milestone edit, commit, push or model calls are initiated by this runner')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--preflight', action='store_true')
    mode.add_argument('--run', action='store_true')
    mode.add_argument('--replay-24e', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    preflight()
    if args.replay_24e:
        replay_historical_24e()
        return 0
    if args.preflight:
        return 0
    began = time.monotonic()
    evidence = Path(tempfile.mkdtemp(prefix='masl-24f-review-'))
    print('REVIEW DIRECTORY:', evidence, flush=True)
    checks: list[dict] = []
    try:
        def collect(result: dict) -> bool:
            checks.append(result)
            return result['pass']
        # Abort on the first failure; the report is always emitted in finally.
        if not collect(gate('2.4 lint', ['pnpm','lint'], WEB, evidence,
                            (r'Found 0 warnings and 0 errors',), 120)): return 1
        if not collect(gate('2.4 production build', ['pnpm','build'], WEB, evidence,
                            (r'\b(?:built in|build completed)\b',), 180)): return 1
        if not collect(gate('2.4A runtime contracts', ['python3','scripts/lab-24a-interrupt-contracts.py'],
                            ROOT, evidence, (r'PASS: observations saved to',
                                             r'PASS: isolated Runtime process cleaned up'),
                            240, runtime=True)): return 1
        if not collect(pure('2.4B persisted projection',
                            'src/execution/interrupt-projection.spec.ts', 30,
                            'interrupt-projection assertions passed', evidence)): return 1
        if not collect(pure('2.4C resume transport pure',
                            'src/transport/agent-server/resume-run-client.spec.ts', 31,
                            'resume-run transport assertions passed', evidence)): return 1
        if not collect(gate('2.4C runtime transport', ['python3','scripts/lab-24c-resume-runtime.py'],
                            ROOT,evidence,(r'PASS: 12 runtime resume assertions',
                                          r'PASS: pinned Runtime process cleaned up'),
                            240, runtime=True)): return 1
        if not collect(pure('2.4D HITL eligibility',
                            'src/execution/hitl-action.spec.ts', 26,
                            'HITL action-gate assertions passed', evidence)): return 1
        if not collect(gate('2.4D chromium', ['python3','scripts/lab-24d-hitl-browser.py'],
                            ROOT,evidence,(r'\b3 passed\b',r'PASS: 2.4D model-free browser probes',
                                           r'PASS: pinned Runtime cleaned up'),
                            240,runtime=True)): return 1
        if not collect(gate('2.4E concurrency and failure discovery',
                            ['python3',SELF,'--replay-24e'], ROOT,evidence,
                            (r'REPLAY COMPATIBILITY: only historical exact-HEAD assertion changed in memory',
                             r'PASS: 4 probes: 2 validated invariants; 2 descriptive Runtime behaviors',
                             r'PASS: pinned Runtime process cleaned up'),
                            240,runtime=True,discovery=True)): return 1
        if not collect(pure('2.4E recovery policy',
                            'src/execution/resume-recovery.spec.ts',31,
                            '2.4E read-only recovery-policy assertions passed', evidence)): return 1
        if not collect(gate('2.4E chromium recovery',
                            ['python3','scripts/lab-24e-recovery-browser.py'], ROOT,evidence,
                            (r'\b3 passed\b',r'PASS: 2.4E-B model-free recovery browser probes',
                             r'PASS: pinned Runtime cleaned up'),
                            240,runtime=True)): return 1
        ensure(cmd_output(['git', 'status', '--porcelain', '--untracked-files=all']).splitlines()
               == [f'?? {SELF}'], 'Unexpected post-review Git worktree changes')
        return 0
    finally:
        write_report(evidence, checks, began)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (RuntimeError, subprocess.CalledProcessError, OSError, KeyError,
            json.JSONDecodeError) as error:
        print('BLOCKED: '+str(error), file=sys.stderr)
        sys.exit(1)
