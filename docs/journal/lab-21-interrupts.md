# Lab 21 — Interrupts and Human-in-the-Loop

## Goal

Distinguish graph-level human-in-the-loop interruption, execution breakpoints,
and Run lifecycle cancellation before building a resume API or frontend action.
The 2.3 shared-state and SSE baselines remain unchanged.

## 2.4A — Pinned interrupt/resume contract discovery

### Scope and reproducibility

Use a temporary, deterministic LangGraph project executed through the pinned
workshop's installed Agent Server CLI. All graph source, configuration, and
runtime state are temporary; the pinned workshop clone is not modified.
The experiment creates two disposable Threads and invokes no model.

~~~bash
python3 scripts/lab-24a-interrupt-contracts.py
~~~

The verified WSL run saved its observation artifact at:

~~~text
/tmp/masl-24a-observations-19344.json
~~~

This PID-specific path and the observed checkpoint/interrupt UUIDs are
*evidence*, not required stable identifiers for replay. The transient Runtime
server bound to `127.0.0.1:37659` in this run; future runs select another
available local port.

### Public Agent Server contract observed

The pinned OpenAPI exposed `GET /threads/{thread_id}/state` and
`POST /threads/{thread_id}/runs/wait`; the execution-control surface also
included the Run cancellation endpoint.

The `Command` schema includes optional `resume`, `goto`, and `update` fields.
`Interrupt` has a required `value` property, but its `id` is optional.
An interrupt ID therefore must be treated as nullable until concretely
observed and validated. The discovery did not find a schema named literally
`RunCreate`; this does *not* imply Run creation is unsupported, since
stateful Runs were created successfully in both experiments.

### Experiment 1 — Dynamic graph interruption

A deterministic graph contains an `approval` node that calls LangGraph
`interrupt()` with a structured request:

~~~json
{
  "kind": "masl_24a_hitl",
  "question": "Approve the deterministic probe?",
  "request": "INITIAL_24A"
}
~~~

The initial `POST /threads/{thread_id}/runs/wait` returned after the graph
paused. A subsequent read observed:

~~~text
Thread.status = interrupted
Run.status = success
ThreadState.next = [approval]
ThreadState.interrupts = [dynamic interrupt with ID and value]
ThreadState.tasks[approval].interrupts = [matching dynamic interrupt]
ThreadState.checkpoint = present
~~~

The observed interrupt `id` was a nonempty string, and both the top-level
state and task-level representations carried the `kind`, `question`, and
`request` values. That is one observed shape; `id` remains optional in the
OpenAPI schema.

### Explicit resume and persistence

A **second** stateful Run on the same Thread supplied:

~~~json
{
  "assistant_id": "masl_24a_hitl",
  "input": {},
  "command": {"resume": "APPROVE_24A"}
}
~~~

The graph recorded `result = RESUMED:APPROVE_24A`. After resumption:

~~~text
Thread.status = idle
Run statuses = [success, success] (two distinct Runs)
ThreadState.next = [] (END)
ThreadState.interrupts = []
Task-level interrupts = []
Checkpoint = new persisted checkpoint
~~~

A successful Run therefore means that *one execution attempt* completed,
not necessarily that the graph reached END. A logical HITL interaction in
this graph spans an initial successful Run that leaves the Thread interrupted,
and a second successful Run that supplies the resume value.

### Experiment 2 — Execution breakpoint (not HITL)

A separate graph's `checkpoint_only` node was guarded by
`interrupt_before=["checkpoint_only"]`. The observed state was:

~~~text
Thread.status = interrupted
Run.status = success
ThreadState.next = [checkpoint_only]
ThreadState.tasks = [checkpoint_only]
ThreadState.interrupts = []
Task-level interrupts = []
Graph result = not yet produced
~~~

Thus **Thread.status=interrupted does not imply a pending human decision**.
An execution breakpoint is a paused graph position without a dynamic
`interrupt()` payload in this experiment. The experiment did not test
resumption of the breakpoint, and the frontend must not invent an approval
request or require `Command.resume` from the absence of a HITL payload.

### Verified semantic checks and cleanup

~~~text
dynamicHitl.checks.interruptPersisted = true
dynamicHitl.checks.resumeValueReachedGraph = true
dynamicHitl.checks.secondRunCreated = true
dynamicHitl.checks.endReached = true
executionBreakpoint.checks.pausedBeforeNode = true
executionBreakpoint.checks.noDynamicInterruptPayload = true
~~~

Both disposable Threads were removed; the isolated Runtime process was
terminated. The output was obtained with the pinned Runtime, not merely
mocked HTTP responses.

### Architectural boundary for subsequent 2.4 blocks

- Use persisted graph interrupt data to identify possible human input;
  `Thread.status`, `Run.status`, or nonempty `next` alone are insufficient.
- Treat `GraphInterrupt.id` as optional and the untrusted `value` as opaque
  until it crosses a strict, allowlisted projection boundary.
- Distinguish **dynamic graph interruption** from **execution breakpoint**
  and from **Run lifecycle cancellation** (`action=interrupt`), established
  separately in earlier Runtime and streaming investigations.
- Resume is an explicit new Run with a command, not a state-update POST or
  implicit replay of the previous Run.
- Do not assume atomic checkpoint-bound resume, durable authorization,
  cross-writer exclusion, idempotency, or exactly-once human approval.
  Duplicate or stale resume behavior remains untested.
- A safe frontend must reconcile the persisted Thread state and Run lifecycle
  after a resume, and must not infer that the Stream or Run reaching `success`
  means the graph reached END.

### Next planned sub-blocks

- **2.4B:** Classify persisted dynamic HITL vs execution breakpoint and
  project only approved fields, without leaking arbitrary interruption data.
- **2.4C:** Add typed, explicit resume Run transport and validate wire behavior.
- **2.4D:** Provide a deliberate UI with a clear human response action.
- **2.4E:** Investigate stale resume, duplicate submissions, failure recovery,
  and reconcile Run versus Thread state.
- **2.4F:** Review the scoped interrupt/HITL baseline with reproducible gates.

## 2.4B — Persisted interrupt projection and classification

### Scope and source boundary

The 2.4A observation established that a dynamic `interrupt()` may leave
`Thread.status=interrupted`, `Run.status=success`, a pending graph node and a
populated top-level `ThreadState.interrupts` collection. An execution breakpoint
can also leave Thread.status `interrupted` with a pending node but **without**
a dynamic HITL payload. Neither Thread status nor Run status nor next-node
position alone is an approval prompt.

The 2.4B implementation adds only:

~~~text
apps/web/src/execution/interrupt-projection.ts
apps/web/src/execution/interrupt-projection.spec.ts
~~~

The existing transport mapper already decodes top-level `ThreadState.interrupts`
into `GraphInterrupt` with `value: unknown` and nullable `id`. In the current
domain model `RuntimeTaskSummary` contains only id, name and error; this block
does not separately promote nested task interruptions or assume their equality
with top-level interrupts in future runtime versions.

### Classification contract

`projectPersistedInterrupts(state, threadOrNull)` is synchronous, read-only,
and performs no IO. A supplied Thread status must belong to the same Thread ID
as `ThreadState`, otherwise projection throws. It emits exactly one `situation`:

| Situation | Interpretation |
|---|---|
| `uninitialized` | No checkpoint and no conflicting evidence |
| `graph-interrupt` | Persisted checkpoint and at least one top-level graph interrupt |
| `interrupted-without-payload` | Thread status interrupted with checkpoint but no top-level interrupt payload; not automatically HITL |
| `position-pending` | Persisted checkpoint and pending nodes, without dynamic interrupt or a separately observed interrupted status |
| `end` | Persisted checkpoint, no top-level interrupts, no pending nodes, and no separately observed interrupted status |
| `indeterminate` | Missing checkpoint with interrupts, next nodes or interrupted status; fail closed |

The output also includes provenance `authority='persisted'`, Thread ID,
checkpoint ID (display correlation only), separately observed status or null,
number of pending nodes, total interrupt count, displayed interrupt summaries
and count omitted by the cap. This does not represent full checkpoint identity
or a trusted resume precondition.

### Explicit payload allowlist

Interrupt values are untrusted and opaque by default. Only payloads with
`kind='masl_24a_hitl'` and a nonempty string `question`, trimmed to at most
240 characters and free of control characters U+0000–U+001F or U+007F, can
project that question as text. This allows only the known deterministic lab
probe; it does not opt in real-world approval formats. Every other payload
becomes `kind='opaque'`, with `question=null`. Interrupt IDs can be null.
At most 20 projected items are displayed, without publishing raw
`Interrupt.value`, `ThreadState.values`, metadata, task details, checkpoint
namespace, or checkpoint map. These are read-only summaries, not actions.

The original implementation's regular expression for control characters
triggered Oxlint `eslint(no-control-regex)` warning. A targeted patch replaced
it with a semantically equivalent Unicode code-point predicate without
suppressing lint. All test assertions still passed after the change.

### Evidence and validations

Observed on WSL against the exact repository baseline at
`abece5d54645f0a4b839fdf656cc07c4908ae633`:

~~~text
pnpm lint: 0 warnings, 0 errors (49 files, 116 rules)
pnpm build: TypeScript + Vite PASS (44 transformed modules)
SSR test bundling: PASS (7 modules)
node interrupt-projection.spec.js: 30/30 assertions PASS
~~~

Reproduction (from `apps/web`):

~~~bash
pnpm lint && pnpm build
pnpm exec vite build --ssr src/execution/interrupt-projection.spec.ts \
  --outDir /tmp/masl-24b-projection --emptyOutDir
printf '%s\n' '{"type":"module"}' > /tmp/masl-24b-projection/package.json
node /tmp/masl-24b-projection/interrupt-projection.spec.js
~~~

Pure assertions cover six classification states, nullable interrupt identity,
checkpoint/provenance correlation, allowlist behavior, arbitrary data
non-exposure, defensive display cap, malformed shapes and cross-Thread inputs.
The code was typechecked and bundled with the repository's installed toolchain;
no pinned Runtime, model call, run, browser integration or existing source
file was modified. Only the two new TS files are staged for this sub-block.

### Explicit limitations and next gate

- **No automatic approval inference:** `interrupted-without-payload` may be a
  breakpoint or another interruption mechanism; `graph-interrupt` does not
  itself authorize a resume.
- **No arbitrary payload display:** unknown application-specific HITL schemas
  remain opaque until explicitly reviewed and tested.
- **No secure resume precondition:** display checkpoint ID is not a full
  `CheckpointRef`, not an atomic CAS condition and not an authorization check.
- **No task-level expansion:** only the decoded top-level persisted interrupt
  collection is projected in this baseline.
- **No UI integration yet:** this projector remains pure and deliberately
  unused in visual controls until resume transport and guard policy are ready.

**2.4B complete within the scoped, model-free pure projection gate.** Next:
**2.4C — Typed resume Run transport**. The parent milestone 2.4 stays open.

## 2.4C — Typed resume Run transport and Runtime contract validation

### Transport boundary

Files changed in this sub-block:

~~~text
apps/web/src/transport/agent-server/client.ts
apps/web/src/transport/agent-server/index.ts
apps/web/src/transport/agent-server/resume-run-client.spec.ts
scripts/lab-24c-resume-runtime.mjs
scripts/lab-24c-resume-runtime.py
~~~

The new `AgentServerClient.createResumeRun()` accepts a target Thread,
canonical Assistant identity, explicitly supplied `resumeValue`, and optional
metadata. It submits one *new* stateful Run (not `POST /state`) with:

~~~json
{
  "assistant_id": "<canonical Assistant UUID>",
  "input": {},
  "command": {"resume": "APPROVE_24C"},
  "multitask_strategy": "reject"
}
~~~

The request path is `/threads/{thread_id}/runs` with an encoded Thread ID.
`input` remains empty: a resumed LangGraph `interrupt()` value is not a new
message or an explicit state mutation. The response is a Run identity, not a
checkpoint or evidence that the graph has reached END.

The method rejects wrong returned Thread/Assistant identity. Resume JSON is
validated recursively before the HTTP call, including sparse arrays, cycles,
getters/accessors, non-JSON primitives, non-finite numbers, and keys that
`JSON.stringify` could discard. `null` is allowed. No implicit state GET,
retry or automatic next Run exists. HTTP 409 is retained as a typed error;
network errors after a possibly persisted POST remain ambiguous.

### Canonical Assistant resolution correction

The first pinned integration attempt reached the Runtime, persisted dynamic
HITL and one Run, then failed with `AgentServerDecodeError` on
`Run.assistant_id`: the request selected `masl_24c_hitl` (a Graph name), while
the Runtime persisted a concrete Assistant UUID. This resolution behavior had
already been observed and documented in Lab 12; the failure was a mistaken
test-harness assumption, not proof that the POST failed.

The final `.mjs` probe obtains the canonical Assistant UUID from the initial
persisted Run, then provides it to `createResumeRun`. **The strict identity
check in the transport remains enabled.** The targeted Oxlint fix replaces
only the sparse-array test literal with programmatic construction; the
negative case still passes. No graph or pinned Runtime code was changed.

### Verification (model-free WSL execution)

~~~text
Baseline HEAD: 5627b3510edf4cb9b5d7ccbf973cf1f04fe1663e
pnpm lint: 0 warnings, 0 errors (50 files, 116 rules)
pnpm build: PASS (44 Vite modules)
Vite SSR pure test bundle: PASS (13 modules)
Pure transport spec: 31/31 assertions PASS
Real compiled TypeScript client + temporary pinned Runtime: PASS
Semantic integration checks: 12/12 PASS
Physical Runs: 2
Initial persisted dynamic interrupt: present
Resume value in persisted graph: RESUMED:APPROVE_24C
Final Thread: idle; Run: success; graph: END; interrupts: empty
Cleanup: disposable Thread deleted; isolated process stopped
Model calls: none
~~~

Reproduction:

~~~bash
cd apps/web
pnpm lint && pnpm build
pnpm exec vite build --ssr src/transport/agent-server/resume-run-client.spec.ts \
  --outDir /tmp/masl-24c-resume-spec --emptyOutDir
printf '%s\n' '{"type":"module"}' > /tmp/masl-24c-resume-spec/package.json
node /tmp/masl-24c-resume-spec/resume-run-client.spec.js
cd ../..
python3 scripts/lab-24c-resume-runtime.py
~~~

Runtime observations (local ephemeral artifact):

~~~text
/tmp/masl-24c-observations-1890.json
~~~

Observed JSON SHA-256: `67c939e0f6b932ba44c212e464550ef1187a5e5a93ba4a11c7ea1f9bbc5e323f` (local, ephemeral evidence file).

The twelve verified assertions are: `initialInterruptPersisted`,
`oneResumeRunPost`, `commandResumeSerialized`, `canonicalAssistantReused`,
`newRunCreated`, `runSucceeded`, `secondRunObserved`,
`resumeValuePersisted`, `interruptCleared`, `endReached`,
`noImplicitRetry`, and `noModelCalls`. The graph resumed through a **second**
persisted Run, and independent REST reads corroborated the new checkpoint and
final state. PID, UUIDs and assigned local port are observations, not stable
identity contracts to hard-code in the client.

### Deliberate scope boundaries

- `Run.status=success` is not by itself graph completion or authorization;
  independently read `ThreadState.next`, interrupts and Thread status.
- Graph name and concrete Assistant UUID are distinct; the request must use
  a correctly resolved canonical Assistant ID when strict identity is needed.
- This client is a low-level explicit transport, not proof that a user is
  entitled to approve a step. The 2.4D UI must require deliberate action.
- `multitask_strategy='reject'` is not atomic checkpoint compare-and-swap.
  The transport has no stale-resume preflight, durable deduplication, or
  exactly-once execution. The 2.4E safety gate remains open.
- This run was deterministic, temporary and model-free. It does not claim a
  full 2.2 browser/model-dependent regression suite or production deployment.

**2.4C COMPLETE within its scoped transport/integration gates.** Next:
**2.4D — Deliberate HITL interface**. The parent milestone 2.4 remains open.
