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
