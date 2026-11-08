#!/usr/bin/env bash
# Lab 2.3G: replayable pinned shared-state regression evidence, model-free by default.
# Does not reset/clean Git, commit/push, or modify the pinned workshop reference.
set -Eeuo pipefail

ROOT="$(git -C "$(dirname "$(realpath "${BASH_SOURCE[0]}")")/.." rev-parse --show-toplevel)"
WEB="$ROOT/apps/web"
BASELINE_HEAD='6e6865a211988ab2f29feab84b358e13375ceee9'

# Long-lived review harness: future commits may contain the documented review
# without silently changing what the pinned 2.3 baseline actually tested.
if ! git -C "$ROOT" merge-base --is-ancestor "$BASELINE_HEAD" HEAD; then
  printf 'FAIL: HEAD must descend from the reviewed 2.3F baseline: %s\n' "$BASELINE_HEAD" >&2
  exit 1
fi
python3 - "$ROOT" "$BASELINE_HEAD" <<'CHECK_23G_TRACKED'
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
baseline = sys.argv[2]
path = 'scripts/lab-23f-concurrency.py'

# Current working tree may contain only the reviewed ancestry fix before
# finalization. Once committed, a clean working tree is also valid.
if subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=root).returncode:
    raise SystemExit('FAIL: staged Git changes exist')
changed = [p.decode() for p in subprocess.check_output(
    ['git', 'diff', '--name-only', '-z'], cwd=root
).split(b'\0') if p]
if changed not in ([], [path]):
    raise SystemExit(f'FAIL: unexpected tracked changes: {changed!r}')
if subprocess.check_output(['git', 'diff', '--summary', '--', path], cwd=root):
    raise SystemExit('FAIL: file metadata changed unexpectedly')

original = subprocess.check_output(
    ['git', 'show', f'{baseline}:{path}'], cwd=root, text=True
)
old = '''    expected = "dd6d3546c4ca28fa00eed66945cddc16cbb16d3e"
    if head != expected:
        raise RuntimeError(f"Unexpected repository HEAD: {head}. Expected {expected}; inspect before proceeding.")'''
new = '''    baseline = "dd6d3546c4ca28fa00eed66945cddc16cbb16d3e"
    lineage = subprocess.run(
        ["git", "merge-base", "--is-ancestor", baseline, "HEAD"],
        cwd=ROOT,
        check=False,
    )
    if lineage.returncode != 0:
        raise RuntimeError(
            f"Unexpected repository HEAD: {head}. "
            f"Expected a descendant of {baseline}; inspect before proceeding."
        )
    print(f"PASS: repository HEAD descends from 2.3F baseline ({head[:7]})", flush=True)'''
if original.count(old) != 1:
    raise SystemExit('FAIL: unexpected original 2.3F guard in baseline')
actual = (root / path).read_text(encoding='utf-8')
if actual != original.replace(old, new, 1):
    raise SystemExit('FAIL: 2.3F guard differs from reviewed content')

# Freeze the implementation, TypeScript tests, lockfile and model-free Runtime
# probes to the exact 2.3F baseline contents. Documentation and this reviewer
# can evolve while claims about reviewed application source stay fixed.
reviewed_paths = [
    'apps/web',
    'pnpm-lock.yaml',
    'scripts/lab-23a-shared-state.py',
    'scripts/lab-23c-state-update.py',
    'scripts/lab-23c-state-update.mjs',
    'scripts/lab-23d-checkpoint-aware.py',
    'scripts/lab-23d-checkpoint-aware.mjs',
    'scripts/lab-23f-concurrency.mjs',
]
result = subprocess.run(
    ['git', 'diff', '--quiet', baseline, '--', *reviewed_paths],
    cwd=root,
)
if result.returncode != 0:
    raise SystemExit('FAIL: tested 2.3 source differs from recorded baseline')
print('PASS: reviewed 2.3F guard and pinned 2.3 source identity')
CHECK_23G_TRACKED
for command in git pnpm node python3 uv timeout mktemp; do
  if ! command -v "$command" >/dev/null; then
    printf 'FAIL: required command not found: %s\n' "$command" >&2
    exit 1
  fi
done

REPORT="$(mktemp -d /tmp/masl-23g-review-XXXXXXXX)"
TSV="$REPORT/gates.tsv"
printf 'gate\tstatus\tlog\n' > "$TSV"

on_exit() {
  local code=$?
  trap - EXIT
  echo
  echo '===== LAB 2.3G REVIEW SUMMARY ====='
  cat "$TSV"
  echo "EVIDENCE DIRECTORY: $REPORT"
  if (( code != 0 )); then
    printf 'INCOMPLETE: gate failed (exit %s). Do not mark 2.3G complete.\n' "$code"
  else
    echo 'PASS: selected regression gates passed. Review the evidence before documenting 2.3G.'
  fi
}
trap on_exit EXIT

run_gate() {
  local name="$1" workdir="$2"; shift 2
  local logfile="$REPORT/$name.log"
  printf '\n===== %s =====\n' "$name"
  if ( cd "$workdir" && "$@" ) > "$logfile" 2>&1; then
    printf '%s\tPASS\t%s\n' "$name" "$logfile" >> "$TSV"
    tail -n 12 "$logfile"
    echo "PASS: $name"
  else
    local status=$?
    printf '%s\tFAIL\t%s\n' "$name" "$logfile" >> "$TSV"
    echo "FAIL: $name (exit $status). Recent output:" >&2
    tail -n 75 "$logfile" >&2
    return "$status"
  fi
}

pure_spec() {
  local source="$1" expected="$2" slug="$3"
  local outdir="$REPORT/ssr-$slug"
  local filename="$(basename "$source" .ts).js"
  pnpm exec vite build \
    --ssr "$source" \
    --outDir "$outdir" \
    --emptyOutDir
  printf '%s\n' '{"type":"module"}' > "$outdir/package.json"
  node "$outdir/$filename" | tee "$REPORT/pure-$slug-assertions.txt"
  if ! grep -Fq "$expected" "$REPORT/pure-$slug-assertions.txt"; then
    echo "FAIL: required passing assertion summary missing: $expected" >&2
    return 1
  fi
}

capture_observations() {
  local name="$1"
  local logfile="$REPORT/$name.log"
  local source
  source="$(sed -n 's/^OBSERVATIONS: //p' "$logfile" | tail -n 1)"
  if [[ -z "$source" || ! -f "$source" ]]; then
    echo "FAIL: $name did not yield an existing observations JSON file." >&2
    return 1
  fi
  python3 - "$name" "$source" "$REPORT/$name-observations.json" <<'PY'
import json, sys
from pathlib import Path
name = sys.argv[1]
src, dst = map(Path, sys.argv[2:])
payload = json.loads(src.read_text())
if not isinstance(payload, dict):
    raise SystemExit(f'FAIL: {name}: observations JSON is not an object')
if name == 'runtime-23d':
    checks = payload.get('observations')
    valid = (isinstance(checks, dict) and len(checks) >= 10 and
             all(value is True for value in checks.values()))
elif name == 'runtime-23f':
    scenarios = payload.get('scenarios')
    required = (
        ('concurrentWriters', 'dispatchedTogether'),
        ('staleSource', 'staleWriteAccepted'),
        ('readbackDivergence', 'postCommittedButHeadDifferent'),
        ('ambiguousPost', 'persistedAfterLostResponse'),
    )
    valid = (isinstance(scenarios, dict) and
             all(isinstance(scenarios.get(key), dict) and
                 scenarios[key].get(flag) is True for key, flag in required) and
             payload.get('noRunPosts') is True and
             isinstance(payload.get('requestTotals'), dict) and
             payload['requestTotals'].get('runPosts') == 0)
else:
    raise SystemExit(f'FAIL: unsupported observation gate: {name}')
if not valid:
    raise SystemExit(f'FAIL: {name}: missing or unsuccessful required evidence')
dst.write_text(json.dumps(payload, indent=2) + '\n')
print(f'PASS: observations archived: {dst}')
PY
}

echo "BASELINE: $BASELINE_HEAD"
echo "REPORT: $REPORT"
echo 'MODE: model-free shared-state gates; model-calling streaming E2E optional'
git -C "$ROOT" status --short

run_gate lint "$WEB" timeout 120s pnpm lint
if ! grep -Fq 'Found 0 warnings and 0 errors.' "$REPORT/lint.log"; then
  echo 'FAIL: oxlint exited 0 but did not report 0 warnings and 0 errors.' >&2
  exit 1
fi
run_gate production-build "$WEB" timeout 180s pnpm build

run_gate pure-23b-projection "$WEB" pure_spec \
  src/execution/thread-state-projector.spec.ts \
  '12 pure projection assertions passed' projection
run_gate pure-23c-client "$WEB" pure_spec \
  src/transport/agent-server/state-update-client.spec.ts \
  '20 state-update client assertions passed' state-update-client
run_gate pure-23e-readback "$WEB" pure_spec \
  src/execution/state-update-readback.spec.ts \
  '6 state-update readback assertions passed' state-update-readback
run_gate pure-23f-preflight "$WEB" pure_spec \
  src/execution/state-mutation-preflight.spec.ts \
  '11 head-preflight assertions passed' state-mutation-preflight

run_gate runtime-23a "$ROOT" timeout 240s python3 scripts/lab-23a-shared-state.py
run_gate runtime-23c "$ROOT" timeout 240s python3 scripts/lab-23c-state-update.py
run_gate runtime-23d "$ROOT" timeout 240s python3 scripts/lab-23d-checkpoint-aware.py
capture_observations runtime-23d
run_gate runtime-23f "$ROOT" timeout 240s python3 scripts/lab-23f-concurrency.py
capture_observations runtime-23f

run_gate browser-23e-23f "$WEB" timeout 700s env CI=1 pnpm exec playwright test \
  e2e/shared-state-ui.spec.ts --project=chromium --reporter=list
if ! grep -Eq '4 passed \(' "$REPORT/browser-23e-23f.log"; then
  echo 'FAIL: shared-state Playwright output did not report 4 passing tests.' >&2
  exit 1
fi

if [[ "${MASL_RUN_MODEL_E2E:-0}" == '1' ]]; then
  echo 'OPT-IN ENABLED: running four model-dependent 2.2 streaming browser tests.'
  run_gate browser-22-model-dependent "$WEB" timeout 1200s env CI=1 pnpm exec playwright test \
    e2e/interrupted-reconciliation.spec.ts \
    e2e/persisted-reconciliation.spec.ts \
    e2e/reconciliation-failure.spec.ts \
    e2e/resumable-stream.spec.ts \
    --project=chromium --reporter=list
  if ! grep -Eq '4 passed \(' "$REPORT/browser-22-model-dependent.log"; then
    echo 'FAIL: opt-in streaming regression output did not report 4 passing tests.' >&2
    exit 1
  fi
else
  printf '%s\tSKIP (model calls; opt-in)\t%s\n' \
    'browser-22-model-dependent' '-' >> "$TSV"
fi

echo
printf 'PASS: 49 pure assertions (12+20+6+11), four Runtime probes, four model-free Playwright scenarios.\n'
