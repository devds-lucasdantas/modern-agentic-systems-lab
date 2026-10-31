# Current Work

## Current phase

Phase 1 — Agent Runtime & Protocols

Current block:

~~~text
1.6 LangChain Agent Streaming Protocol
    -> 1.6C State, HITL and agent-topology semantics
    -> namespace-scoped state and checkpoint interaction
    -> interrupt request / response / injection semantics
    -> nested agent lifecycle, causation and tree reconstruction
~~~

## Completed

### Phase 0 — Deep Agents

Phase 0 is complete.

The repository has validated:

- Deep Agents harness architecture;
- planning and filesystem;
- tools;
- StateBackend, FilesystemBackend, StoreBackend and CompositeBackend;
- subagents;
- human-in-the-loop;
- long-term memory;
- AGENTS.md instruction memory;
- SkillsMiddleware and progressive disclosure;
- LangGraph Runtime and Studio integration.

### Phase 1 — Runtime foundations

The following Lab 12 blocks are complete:

~~~text
1.1 Runtime API contracts
1.2 Run lifecycle and streaming execution
1.3 Run concurrency and multitask strategies
1.4 Run execution modes and background execution
~~~

Those blocks collectively cover:

- Agent, Assistant, Thread and Run;
- State and checkpoints;
- Store and persistence;
- streaming and resumable streaming;
- cancellation and rollback;
- concurrency and multitask strategies;
- scheduler behavior.

## Established Runtime model

### Resources

~~~text
Deployment
    |
    v
registered Graph
    |
    v
Assistant
    |
    v
Run
~~~

Stateful execution additionally uses a caller-owned Thread.

Stateless execution still uses a Thread internally, but its lifecycle is managed
by the Runtime.

### Run lifecycle

Run is the execution-attempt resource.

Observed statuses include:

~~~text
pending
running
success
interrupted
error
timeout
~~~

Run lifecycle and persisted graph execution position are separate dimensions.

In particular:

~~~text
Run.status = success
~~~

does not imply:

~~~text
graph reached END
~~~

A successful Run can leave:

~~~text
Thread.status = interrupted
ThreadState.next != []
~~~

when execution stops at a configured breakpoint.

### State and checkpoints

Thread state contains both application state and graph execution-control state.

Important fields include:

~~~text
values
next
tasks
checkpoint
parent_checkpoint
interrupts
~~~

Checkpoint history forms a lineage/DAG that supports:

- historical inspection;
- branching;
- time travel;
- resume;
- direct state mutation.

A lookup through:

~~~text
GET /threads/{thread_id}/state/{checkpoint_id}
~~~

must not be used as an existence check.

Missing checkpoint selectors can return HTTP 200 with a synthetic empty
ThreadState.

### Store

Store is independent from Thread checkpoint persistence.

Conceptually:

~~~text
Checkpointer
    -> execution persistence

Store
    -> cross-thread application / memory persistence
~~~

StoreBackend can resolve the Runtime-owned Store.

### Streaming

A Run can be consumed through SSE without changing the underlying execution
primitive.

Validated semantic stream modes include:

~~~text
updates
values
messages
checkpoints
~~~

Resumable streams use persisted cursor IDs.

Multiple semantic events may share one cursor ID, so a cursor must be treated as
a group boundary rather than as a unique event identifier.

### Cancellation

`interrupt` and `rollback` have distinct persistence semantics.

~~~text
interrupt
    -> terminate execution
    -> preserve already-materialized Thread state

rollback
    -> terminate execution
    -> delete the superseded Run
    -> delete its checkpoint lineage
    -> restore prior Thread state
~~~

A pinned Runtime bug was identified for explicit rollback of a delayed pending
Run with an existing queue:

~~~text
pending
+ delayed
+ queued
+ explicit action=rollback
    ->
Run becomes interrupted before scheduler admission
    ->
worker rollback path is never reached
    ->
Run remains persisted
~~~

Normal active rollback works correctly.

### Multitask strategies

Public stateful Run creation supports:

~~~text
reject
enqueue
interrupt
rollback
~~~

Observed semantics:

~~~text
reject
    -> HTTP 409
    -> conflicting Run is not persisted

enqueue
    -> persist as pending
    -> scheduled per-Thread serialized execution

interrupt
    -> supersede old Run
    -> old Run remains interrupted
    -> partial state survives
    -> new Run continues from that partial state

rollback
    -> supersede old Run
    -> old Run is removed
    -> old Run state/checkpoints are removed
    -> new Run starts from the pre-old-Run state
~~~

The public HTTP default is:

~~~text
enqueue
~~~

### Thread status caveat

Thread.status is a denormalized lifecycle projection and is not authoritative
for in-flight Run existence.

A validated state was:

~~~text
Thread.status = idle
Run.status    = pending
~~~

Multitask conflict detection still correctly rejected another Run.

Clients must not use `Thread.status == idle` as the sole execution-availability
test.

### Scheduler

The pinned in-memory scheduler:

1. selects Runs whose status is `pending`;
2. requires `created_at < now`;
3. orders eligible Runs by ascending `created_at`;
4. prevents simultaneous `running` Runs on the same Thread.

Delayed Run creation assigns approximately:

~~~text
created_at =
    submission time + after_seconds
~~~

Therefore enqueue ordering is scheduled eligibility ordering, not strict HTTP
submission FIFO.

Runtime validation confirmed:

~~~text
submission:
    A -> B -> C

scheduled:
    B -> C -> A

execution:
    B -> C -> A

persisted message order:
    B -> C -> A
~~~

## Completed block — Run execution modes and background execution

The Runtime execution-mode contract is established.

Public execution surfaces:

~~~text
POST /runs
    -> stateless background Run
    -> Runtime-managed Thread lifecycle

POST /threads/{thread_id}/runs
    -> stateful background Run

POST /threads/{thread_id}/runs/wait
    -> blocking output consumption

POST /threads/{thread_id}/runs/stream
    -> SSE output consumption

GET /threads/{thread_id}/runs/{run_id}/stream
    -> attach to existing Run stream
~~~

These are different consumption surfaces over the same underlying Run
execution model.

Delayed execution and scheduling are also established:

~~~text
after_seconds
    -> shifts effective created_at
    -> controls scheduler eligibility

enqueue
    -> pending Run
    -> eligible-created_at ordering
    -> per-Thread serialization
~~~

Durability semantics are established as:

~~~text
sync
    -> incremental checkpoint persistence
    -> persistence awaited before next superstep

async
    -> incremental checkpoint persistence
    -> persistence overlaps subsequent execution
    -> writes remain ordered
    -> outstanding persistence drained on exit

exit
    -> no ordinary incremental checkpoint persistence
    -> final checkpoint and pending writes flushed at execution exit
~~~

Runtime validation with an execution stopped before `model` produced:

~~~text
sync
    history steps = [3, 2, 1, 0, -1]

async
    history steps = [3, 2, 1, 0, -1]

exit
    history steps = [3]
~~~

All three modes preserved:

~~~text
Run.status    = success
Thread.status = interrupted
next          = ["model"]
~~~

The experiment also identified a pinned Runtime/OpenAPI observability quirk:

~~~text
OpenAPI GET /history default limit = 10

pinned in-memory State.list default = 1
~~~

An explicit history `limit` must therefore be used when checkpoint cardinality
matters to an experiment.

The legacy `checkpoint_during` compatibility adapter is asymmetric in the
durability-aware Runtime path and must not be modeled as a bidirectional
equivalence.

## Current block — Agent Server API boundary and interoperability mapping

The source inventory established that the pinned stack contains distinct
LangGraph REST/SDK and LangChain Agent Streaming Protocol contracts.

The next objective is to map Runtime-specific execution concepts against
portable interoperability concepts without treating those contracts as
identical.

The 1.5A source inventory established:

1. `langgraph-api` implements the LangGraph Agent Server REST API;
2. `langgraph-sdk` provides client and schema bindings for that API;
3. `langchain-protocol` provides generated bindings for the LangChain Agent
   Streaming Protocol;
4. no direct implementation link between the pinned Agent Server REST API and
   `langchain-protocol` was identified in the inspected Python source;
5. MCP and A2A are separate protocol integrations exposed by the Agent Server.

## Completed sub-block — 1.5B Runtime concepts vs interoperability concepts

The source comparison established four mapping classes:

~~~text
DIRECT ANALOG
    state inspection
    checkpoints
    state fork / branching
    HITL request / response

SEMANTIC ADAPTATION
    Assistant execution identity
    Run execution identity
    execution lifecycle
    replay / reconnect

AGENT-SERVER-SPECIFIC
    persisted service resources
    Thread lifecycle
    Store
    Cron
    scheduling
    concurrency policy
    durability
    operational management

PROTOCOL-SPECIFIC
    subscription commands
    protocol channels
    live agent/subagent tree
    lifecycle causation
~~~

The Agent Server REST API is primarily a stateful service/resource-management
contract.

The LangChain Agent Streaming Protocol is primarily an agent-interaction and
event contract.

A bridge between them would therefore require semantic translation rather than
simple schema renaming.

## Completed sub-block — 1.5C Agent Server protocol-integration boundary

The source investigation established that MCP and A2A are first-class optional
protocol adapters over the same Agent Server Runtime.

A2A preserves stateful execution semantics:

~~~text
Assistant
    -> A2A Agent

Thread
    -> contextId

Thread + Run
    -> A2A Task

Run stream
    -> translated A2A SSE
~~~

MCP deliberately exposes a flatter stateless contract:

~~~text
Assistant
    -> MCP Tool

Assistant schema
    -> Tool inputSchema

tools/call
    -> stateless Run wait
~~~

Both adapters use the local LangGraph SDK client and existing Agent Server
resources rather than independent graph executors.

Protocol adapters own semantic translation while the Agent Server retains
execution, persistence, scheduling and authentication responsibilities.

## Completed block — 1.5 Agent Server API boundary and interoperability mapping

Section 1.5 established the final service/protocol boundary:

~~~text
Agent Server
    -> core execution, persistence and resource-management service

langgraph-sdk
    -> typed client for the Agent Server REST API

A2A
    -> stateful protocol adapter over Assistant / Thread / Run

MCP
    -> stateless Assistant-as-Tool adapter over Assistant / Run

langchain-protocol
    -> separate LangChain Agent Streaming Protocol contract
~~~

Protocol adapters reuse the Agent Server Runtime while translating identity,
schemas, lifecycle, messages and errors into protocol-specific semantics.

The Agent Server REST resource model and interoperability contracts must not be
treated as identical APIs.

## Completed sub-block — 1.6A Pinned protocol grammar inventory

The pinned `langchain-protocol 0.0.12` binding defines a distinct command /
response / event grammar.

~~~text
Command
    -> 10 command variants

Message
    -> CommandResponse
     | ErrorResponse
     | Event

Event
    -> lifecycle
     | messages
     | tools
     | input.requested
     | values
     | updates
     | checkpoints
     | custom
     | tasks
~~~

The grammar includes subscription filters, namespace paths, nested agent
topology, HITL commands, state/checkpoint interaction, fine-grained message
content and tool-execution events.

Two cursor coordinate families are visible:

~~~text
sequence:
    seq
    since
    applied_through_seq

reconnection:
    event_id
    last_event_id
~~~

The generated Python event envelopes use `dict[str, Any]` for `params` even
though richer payload structures are separately defined. The next block must
determine whether this is a generated-binding limitation or part of the
source protocol grammar.

## Completed sub-block — 1.6B Subscription, replay and ordering semantics

The historical CDDL corresponding to the pinned binding was recovered through
the Agent Protocol PR #72 migration.

The migrated Python binding is byte-identical to the installed
`langchain-protocol 0.0.12` binding.

The CDDL establishes:

~~~text
Thread
    -> durable routing identity

SSE
    -> connection-scoped subscription
    -> since / seq replay

WebSocket
    -> in-band logical subscriptions
    -> reconnect / lastEventId recovery

eventId
    -> reconnection identity

seq
    -> monotonic ordering coordinate
~~~

The CDDL strongly types event payloads even though the generated Python binding
collapses event `params` to `dict[str, Any]`.

Replay uses an ephemeral event buffer, while durable recovery is available
through state/checkpoint operations.

The historical specification does not define exactly-once, at-least-once,
duplicate suppression, buffer capacity or retention duration.

## Current sub-block — 1.6C State, HITL and agent-topology semantics

Questions:

1. How does namespace-scoped state relate to Thread state?
2. What exactly does `state.get` return for root and nested namespaces?
3. How are checkpoint IDs, namespace references and fork targets related?
4. What execution semantics does `state.fork` imply?
5. How does `input.requested` correlate with `input.respond`?
6. How does `input.inject` differ semantically from interrupt resume?
7. How is the live agent tree reconstructed from lifecycle events?
8. What does each lifecycle cause (`toolCall`, `send`, `edge`) represent?
9. How does `agent.getTree` relate to lifecycle-derived topology?
10. Which of these semantics belong to the portable protocol rather than
    LangGraph-specific implementation behavior?

## Reference environment

Pinned workshop:

~~~text
.reference/interrupt26-deepagents
commit:
3d3287cf1e51250934c11aff182d90ccfaf0e66d
~~~

The reference clone intentionally contains local uncommitted patches and must
not be reset or committed.

Runtime development server:

~~~text
http://127.0.0.1:2024
~~~

Pinned Runtime-related packages include:

~~~text
deepagents              0.5.3
langchain               1.2.15
langchain-core          1.3.3
langgraph               1.1.9
langgraph-cli           0.4.24
langgraph-sdk           0.3.13
langgraph-runtime-inmem 0.28.0
~~~
