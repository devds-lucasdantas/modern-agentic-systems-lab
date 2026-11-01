# Lab 17 — Phase 1 Review

## Goal

Consolidate Phase 1 — Agent Runtime & Protocols into a stable architectural
reference before moving to Phase 2 — Agent ↔ UI.

This review does not introduce a new Runtime experiment.

It reconciles the evidence gathered in:

~~~text
Lab 12 — Runtime API Contracts
Lab 13 — Agent Server and Protocol Boundaries
Lab 14 — LangChain Agent Streaming Protocol
Lab 15 — MCP Interoperability
Lab 16 — A2A Interoperability
~~~

and promotes the resulting architectural decisions into:

~~~text
docs/architecture.md
docs/adr/
~~~

---

## Evidence classification

### VALIDATED

Observed directly through executable experiments against the pinned Runtime.

### SOURCE-VERIFIED

Established through inspection of the pinned implementation or protocol
definitions without requiring a new live experiment.

### OBSERVED QUIRK

Behavior specific to the studied pinned stack that must not be generalized into
a framework or protocol contract.

### PRODUCTION GAP

A capability or hardening requirement intentionally outside the scope of the
laboratory implementation completed so far.

### DECISION

A repository-level architectural choice recorded or promoted into an ADR.

---

# 1. Phase 1 scope

Phase 1 answered:

~~~text
How does the Runtime represent, expose, schedule, stream, persist and control
agent execution?

and

How do interoperability protocols project that execution model?
~~~

The completed roadmap blocks are:

~~~text
1.1 Runtime API contracts
1.2 Run lifecycle and streaming execution
1.3 Run concurrency and multitask strategies
1.4 Run execution modes and background execution
1.5 Agent Server API boundary and interoperability mapping
1.6 LangChain Agent Streaming Protocol
1.7 MCP
1.8 A2A
~~~

Phase 1 deliberately stops before frontend architecture.

---

# 2. Runtime resource model

[VALIDATED]

The service-facing resource hierarchy is:

~~~text
registered Graph
      |
      v
  Assistant
      |
      v
     Run
      |
      +------ stateful ------> caller-owned Thread
      |
      +------ stateless -----> Runtime-managed Thread
~~~

An Assistant is a configured and versionable execution identity associated with
a registered graph.

A Run is one execution attempt.

A Thread is the persistent execution-state identity across Runs.

Important cardinalities:

~~~text
one Thread
    -> many Runs

one Run
    -> many checkpoints

one checkpoint
    -> zero or many descendants
~~~

Therefore:

~~~text
Graph != Assistant
Thread != Run
Run != checkpoint
~~~

---

# 3. Stateful and stateless execution

[VALIDATED]

The Runtime exposes both stateful and stateless submission surfaces.

Stateless execution does not mean execution without a Thread.

The validated model is:

~~~text
stateful Run
    -> caller-owned Thread

stateless Run
    -> Runtime-created Thread
    -> Runtime-managed lifecycle
~~~

Temporary Runtime resources may be deleted after execution according to the
surface and completion policy.

Therefore:

~~~text
stateless API
    !=
execution without stateful Runtime machinery
~~~

---

# 4. Run lifecycle and graph execution position

[VALIDATED]

Observed Run lifecycle states include:

~~~text
pending
running
success
error
timeout
interrupted
~~~

Run lifecycle status and graph execution position are independent dimensions.

For example:

~~~text
Run.status    = success
Thread.status = interrupted
Thread.next   = [...]
~~~

is valid when the graph successfully reaches an execution breakpoint.

Therefore:

~~~text
Run success
    !=
graph END
~~~

Clients requiring workflow completion must inspect persisted graph position,
not only Run lifecycle status.

---

# 5. Thread state and checkpoint lineage

[VALIDATED]

Thread state contains both application values and graph execution-control
information.

Important fields include:

~~~text
values
next
checkpoint
metadata
tasks
interrupts
parent checkpoint
~~~

Checkpoint history forms a DAG rather than a simple linear log.

This supports:

~~~text
historical reads
branching
executable time travel
state surgery
resume
~~~

Checkpoint ID, not logical step number, is the durable historical identity.

Branches can contain checkpoints with the same step number.

---

# 6. Checkpointer versus Store

[VALIDATED]

The persistence mechanisms solve different problems.

~~~text
Checkpointer
    -> Thread execution state
    -> checkpoint lineage
    -> pause / resume
    -> time travel

Store
    -> application and agent data
    -> cross-Thread persistence
    -> long-term memory
~~~

Therefore:

~~~text
Checkpointer != Store
~~~

A Checkpointer does not satisfy StoreBackend's BaseStore requirement.

A Store does not persist graph execution position.

---

# 7. Runtime-owned persistence

[VALIDATED]
[DECISION]

Registered Agent Server graphs do not own production persistence infrastructure.

The registered graph intentionally exposes:

~~~text
graph.checkpointer = None
graph.store        = None
~~~

while Runtime executions still receive:

~~~text
checkpoint persistence
Runtime Store
Thread continuity
resume capability
~~~

Runtime ownership is therefore intentional rather than missing configuration.

Standalone experiments may explicitly inject isolated in-memory Store or
Checkpointer instances.

This decision is recorded in:

~~~text
ADR 0002 — Runtime-owned persistence for registered graphs
~~~

---

# 8. Execution and consumption surfaces

[VALIDATED]

Several HTTP surfaces operate over the same Run execution primitive.

~~~text
background creation
wait
stream
join / attach
~~~

These differ primarily in submission and consumption behavior.

They are not separate workflow engines.

Streaming is therefore a transport and consumption choice layered on Run
execution.

---

# 9. Streaming and replay

[VALIDATED]

The pinned Agent Server exposes SSE Run streaming with semantic stream modes
including:

~~~text
updates
values
checkpoints
messages
metadata
messages/partial
~~~

Resumable streaming uses an event cursor and `Last-Event-ID`.

Observed replay behavior requires care because multiple semantic events can
share the same SSE identifier.

A safe consumer therefore assumes replay can have at-least-once characteristics
at a semantic event group boundary and performs idempotent processing.

Disconnect behavior is independent from semantic stream mode.

Depending on policy, disconnect may:

~~~text
detach the consumer while execution continues

or

cancel the shared Run
~~~

---

# 10. Concurrency and multitask strategies

[VALIDATED]

Stateful Run submission supports:

~~~text
reject
enqueue
interrupt
rollback
~~~

Their semantics differ.

### reject

~~~text
conflict
    -> HTTP 409
    -> new Run not persisted
~~~

### enqueue

~~~text
new Run
    -> pending
    -> serialized execution per Thread
~~~

### interrupt

~~~text
supersede prior execution
    -> preserve already materialized state
    -> continue new execution from partial state
~~~

### rollback

~~~text
supersede prior execution
    -> remove prior Run
    -> remove its checkpoint lineage
    -> restore pre-superseded state
~~~

The public default observed in the pinned stack is:

~~~text
enqueue
~~~

---

# 11. Thread status is not a lock

[VALIDATED]

A Thread can report:

~~~text
Thread.status = idle
~~~

while a pending Run still exists.

Therefore:

~~~text
Thread.status
    !=
authoritative concurrency lock
~~~

Conflict detection must use Run scheduling state rather than only Thread status.

---

# 12. Scheduler model

[VALIDATED]

The pinned in-memory scheduler:

1. selects Runs with `status=pending`;
2. waits until the Run is eligible;
3. orders eligible Runs by ascending effective `created_at`;
4. prevents concurrent running Runs on the same Thread.

`after_seconds` changes execution eligibility by changing the effective
scheduling timestamp.

Therefore submission order is not always execution order.

Observed example:

~~~text
HTTP submission:
    A
    B
    C

scheduled execution:
    B
    C
    A
~~~

Queued Runs inherit state according to actual execution order.

---

# 13. Durability

[VALIDATED]

Durability is orthogonal to Run consumption mode.

The studied policies are:

~~~text
sync
async
exit
~~~

### sync

Persistence completes before execution advances beyond the durability boundary.

### async

Persistence may overlap with computation while retaining ordered completion
during orderly Runtime execution.

### exit

Intermediate checkpoints are not incrementally persisted; the final execution
boundary is persisted when the graph exits.

Observed checkpoint history demonstrated a concrete difference between
incremental durability and `exit`.

---

# 14. Interrupt taxonomy

[VALIDATED]

Three different concepts contain the word `interrupt`.

They must not be conflated.

## 14.1 Execution breakpoint

Examples:

~~~text
interrupt_before
interrupt_after
~~~

Execution pauses at a graph position while the Run can still be considered
successful.

## 14.2 Runtime lifecycle interruption

Example:

~~~text
runs.cancel(action="interrupt")
~~~

This is cancellation / supersession behavior.

It can produce:

~~~text
Run.status = interrupted
Thread.error = UserInterrupt
~~~

without any resumable graph interrupt.

## 14.3 Graph / HITL interrupt

Example:

~~~text
interrupt(...)
~~~

This creates resumable graph state.

Typical persisted state:

~~~text
Run.status      = success
Thread.status   = interrupted
Thread.interrupts = populated
~~~

Therefore:

~~~text
Runtime interrupted
    !=
one unique semantic condition
~~~

---

# 15. Agent Server boundary

[SOURCE-VERIFIED]
[VALIDATED]

Agent Server is the persistent execution and resource service.

It owns:

~~~text
Assistant
Thread
Run
ThreadState
Checkpoint
Store
Cron

scheduling
multitask policy
delayed execution
durability
cancellation
rollback
authentication boundary
persistence
~~~

`langgraph-sdk` is the typed client for this service API.

It is not itself a generic portable Agent Protocol.

---

# 16. Agent Streaming Protocol

[SOURCE-VERIFIED]

The LangChain Agent Streaming Protocol is a separate Thread-centric
command/response/event interaction contract.

Its studied grammar includes:

~~~text
run.input

subscription.subscribe
subscription.unsubscribe
subscription.reconnect

agent.getTree

input.respond
input.inject

state.get
state.listCheckpoints
state.fork
~~~

and event channels for:

~~~text
lifecycle
messages
tools
input requests
values
updates
checkpoints
tasks
custom events
~~~

The pinned environment contains `langchain-protocol 0.0.12`.

The pinned Agent Server REST/SSE implementation did not show direct wiring to
that protocol.

The current implementation inspected during the study has since introduced
direct Agent Streaming Protocol integration.

Architectural invariant:

~~~text
Agent Server REST
    !=
Agent Streaming Protocol
~~~

---

# 17. MCP interoperability

[VALIDATED]
[SOURCE-VERIFIED]

The pinned MCP adapter is a narrow Tools-only interoperability projection.

~~~text
MCP consumer
      |
      v
    Tool
      |
      v
MCP adapter
      |
      v
 Assistant
      |
      v
runs.wait(thread_id=None)
      |
      v
temporary Thread + Run
      |
      v
Runtime execution
~~~

MCP does not introduce a second graph executor.

The adapter is stateless from the MCP client's perspective while still using
stateful Runtime primitives internally.

Result projection is intentionally lossy:

~~~text
graph final value
    -> repr(value)
    -> MCP TextContent
~~~

Three failure layers must remain distinct:

~~~text
HTTP transport
JSON-RPC / adapter
Tool / Runtime execution
~~~

Adapter-specific identity quirks were also observed around Tool-name
normalization.

---

# 18. A2A interoperability

[VALIDATED]
[SOURCE-VERIFIED]

The pinned A2A adapter is a stateful interoperability projection.

The simple mapping is:

~~~text
Assistant -> Agent
Thread    -> Context
Run       -> initial approximation of Task
~~~

Simple one-Run executions map cleanly.

Resumable execution exposes the limitation of that approximation.

---

# 19. A2A Task identity

[VALIDATED]

A logical A2A Task can span more than one Runtime Run.

~~~text
Task A
    |
    +-- Run A
    |      |
    |      +-- INPUT_REQUIRED
    |
    +-- Run B
           |
           +-- resume
           |
           +-- COMPLETED
~~~

During blocking and streaming resume, the adapter preserves the original logical
Task ID.

Persistent retrieval loses the continuation relation:

~~~text
Run A -> Task A
Run B -> phantom continuation Task B
~~~

Therefore:

~~~text
A2A Task != Runtime Run
~~~

A lossless adapter requires durable protocol-level logical Task state capable of
associating multiple Runs with one Task.

---

# 20. A2A lifecycle gaps

[OBSERVED QUIRK]

The pinned adapter exhibits several protocol-projection gaps.

Observed examples:

~~~text
A2A-Version
    advertised but not enforced

returnImmediately
    accepted but ignored

historyLength=0
    inconsistent

ListTasks artifacts
    incomplete

terminal CancelTask
    synthetic CANCELED response

active CancelTask
    CancelTask  -> CANCELED
    SendMessage -> FAILED(UserInterrupt)
    GetTask     -> INPUT_REQUIRED
~~~

These are adapter observations, not general A2A protocol semantics.

---

# 21. A2A streaming compatibility

[OBSERVED QUIRK]

Canonical streaming mixes protocol generations.

Observed canonical stream:

~~~text
initial Task
    -> v1-style result wrapper
    -> v1 enum values

subsequent events
    -> legacy kind discriminator
    -> legacy final boolean
~~~

The legacy `message/stream` alias produced a more internally consistent v0.x
representation.

Dynamic HITL streaming produced:

~~~text
Task SUBMITTED
    -> Interrupt Artifact
    -> INPUT_REQUIRED
    -> stream close
~~~

Streaming resume preserved the original logical Task ID but created a second
physical Runtime Run.

Persistent retrieval then reproduced the phantom continuation Task.

---

# 22. Protocol boundary decision

[DECISION]

The following contracts remain architecturally distinct:

~~~text
Agent Server REST
    -> persistent resource and execution service

Agent Streaming Protocol
    -> Thread-centric command/event interaction contract

MCP
    -> stateless capability projection

A2A
    -> persistent Agent/Context/Task interoperability projection
~~~

Protocol adapters own translation of:

~~~text
identity
schemas
messages
lifecycle
errors
capabilities
~~~

They do not own graph execution.

This decision is recorded in:

~~~text
ADR 0003 — Keep Runtime APIs and interoperability protocols distinct
~~~

---

# 23. Consolidated Phase 1 architecture

The final Phase 1 model is:

~~~text
                         external consumers
                                |
        +-----------------------+-----------------------+
        |                       |                       |
        v                       v                       v
 LangGraph clients       Streaming clients      MCP / A2A clients
        |                       |                       |
        v                       v                       v
  langgraph-sdk        Agent Streaming           protocol adapters
        |                 Protocol                     |
        v                       |                       |
 Agent Server REST              |                       |
        +-----------------------+-----------------------+
                                |
                                v
                         Runtime execution
                                |
             +------------------+------------------+
             |                  |                  |
             v                  v                  v
           Graph             scheduler         persistence
             |                                     |
             v                              +------+------+
            Run                             |             |
             |                              v             v
             v                        Checkpointer       Store
           Thread
~~~

The service model and interoperability model overlap in vocabulary but not in
ownership.

---

# 24. Validated invariants

Phase 1 carries the following invariants forward.

1. `Graph != Assistant`.
2. `Thread != Run`.
3. One Thread can contain multiple Runs.
4. One Run can produce multiple checkpoints.
5. Checkpoint identity is checkpoint-ID based, not step-number based.
6. `Checkpointer != Store`.
7. Runtime-owned persistence can exist while the registered graph embeds neither
   Store nor Checkpointer.
8. Stateless Runtime execution still uses Runtime-managed Thread machinery.
9. Run consumption mode does not define a different execution engine.
10. Run lifecycle status is distinct from graph execution position.
11. Run success does not necessarily mean graph `END`.
12. Thread status is not an authoritative execution lock.
13. Enqueued Runs execute according to scheduler eligibility, not necessarily
    HTTP submission order.
14. Durability is orthogonal to submission and consumption mode.
15. Lifecycle interrupt and rollback have different persistence semantics.
16. Execution breakpoint, lifecycle interruption and graph/HITL interrupt are
    distinct concepts.
17. Agent Server REST is not the Agent Streaming Protocol.
18. MCP is a projection over Runtime execution, not another executor.
19. A2A is a projection over Runtime execution, not another executor.
20. `A2A Task != Runtime Run`.
21. Protocol adapter behavior must not be generalized into protocol semantics.
22. Pinned-stack quirks must remain separate from architectural contracts.

---

# 25. Observed pinned-stack quirks

[OBSERVED QUIRK]

The following observations belong specifically to the studied stack.

## 25.1 Delayed pending rollback

A delayed pending Run under a queued scheduling condition can remain
`interrupted` rather than being deleted by explicit rollback because the
scheduler no longer admits it to the normal rollback worker path.

## 25.2 Historical state lookup

Some nonexistent or removed checkpoint lookups can return a successful HTTP
response with an empty synthesized state.

HTTP 200 is therefore not always proof of historical checkpoint existence in
the pinned implementation.

## 25.3 Thread status drift

A Thread can report `idle` while pending execution still exists.

## 25.4 Durability compatibility

Legacy `checkpoint_during` compatibility does not map symmetrically onto all
modern durability values.

## 25.5 Serializer warning

A non-blocking LangChain serializer deprecation warning remains in the pinned
dependency stack.

## 25.6 MCP identity normalization

Assistant names can normalize to empty or colliding MCP Tool names.

Discovery and invocation do not resolve every collision identically.

## 25.7 A2A compatibility

The pinned A2A adapter mixes v1 concepts with legacy wire-format behavior and
contains lifecycle and identity projection gaps.

---

# 26. Production gaps

[PRODUCTION GAP]

Phase 1 validates architecture, not production readiness.

Remaining production concerns include:

~~~text
production-grade checkpoint infrastructure
production-grade Store infrastructure
durable queue infrastructure

authentication
authorization / RBAC
tenant isolation

sandboxed execution
security hardening

observability
distributed tracing
metrics

evaluation infrastructure

retry policy
resilience
failure recovery

idempotency for external side effects

cost controls

deployment architecture

protocol conformance testing

version migration strategy
~~~

These belong primarily to later production-readiness phases.

---

# 27. ADR review

Phase 1 now has three accepted architectural decisions.

~~~text
ADR 0001
    Dedicated learning repository

ADR 0002
    Runtime-owned persistence for registered graphs

ADR 0003
    Keep Runtime APIs and interoperability protocols distinct
~~~

No ADR is required for:

~~~text
A2A Task != Runtime Run
interrupt taxonomy
~~~

because these are discovered architectural properties rather than repository
choices.

---

# 28. Documentation consistency review

The architectural conclusions are now represented in:

~~~text
docs/architecture.md

Version 0.4
    Phase 1 Runtime architecture

Version 0.5
    Agent Server protocol boundary

Version 0.6
    Agent Streaming Protocol boundary

Version 0.7
    MCP interoperability projection

Version 0.8
    A2A interoperability projection

Version 0.9
    Phase 1 consolidated Runtime and protocol architecture
~~~

Detailed evidence remains in Labs 12 through 16.

This review acts as the Phase 1 index and reconciliation layer rather than
duplicating every experimental trace.

---

# 29. Phase 2 handoff

Phase 1 established the execution substrate.

Phase 2 can now focus on:

~~~text
Frontend application
Event streaming
Shared state
Interrupts
Frontend tools
AG-UI
Generative UI patterns
~~~

The central Phase 2 question is:

~~~text
How should a frontend observe, represent and control the Runtime model validated
during Phase 1?
~~~

Important inherited constraints include:

~~~text
Run status alone is insufficient for workflow completion

Thread.status is not a concurrency lock

stream replay can require idempotent client handling

HITL is persisted execution state, not merely a UI modal

protocol-facing identity can differ from Runtime execution identity

one logical user interaction may span multiple Runtime Runs
~~~

These constraints should shape the frontend state model rather than being
rediscovered during UI implementation.

---

# 30. Phase 1 conclusion

Phase 1 is architecturally complete.

The laboratory now has a validated model for:

~~~text
Runtime resources
Run lifecycle
Thread state
checkpoint lineage
Store persistence
background execution
streaming
replay
cancellation
rollback
concurrency
scheduling
durability

Agent Server
Agent Streaming Protocol
MCP
A2A
~~~

The most important conceptual transition from Phase 0 to Phase 1 is:

~~~text
Phase 0
    How is an agent assembled and how does its graph behave?

Phase 1
    How is that execution exposed, persisted, scheduled and projected through
    service and interoperability contracts?
~~~

The final architectural rule is:

~~~text
execution substrate
    !=
service API
    !=
interaction protocol
    !=
interoperability projection
~~~

Understanding those boundaries prevents implementation details from being
mistaken for portable protocol semantics.

Phase 1 is ready for final repository validation and versioned closure.
