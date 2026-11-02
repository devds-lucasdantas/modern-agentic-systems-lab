# Current Work

## Current phase

Phase 1 — Agent Runtime & Protocols

Current block:

~~~text
1.7 MCP
    -> MCP protocol contract and transport model
    -> Assistant-as-Tool projection
    -> pinned Agent Server MCP adapter
    -> schema, execution, error and session semantics
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

## Completed sub-block — 1.6C State, HITL and agent-topology semantics

The protocol uses Namespace as hierarchical execution identity inside a durable
Thread.

State, HITL and lifecycle operations are namespace-addressable.

The State module exposes:

~~~text
state.get
state.listCheckpoints
state.fork
~~~

while cross-thread Store remains outside the streaming protocol.

HITL distinguishes:

~~~text
run.input
    -> generic execution input

input.respond
    -> interrupt-correlated response

input.inject
    -> unsolicited namespace-targeted input
~~~

Nested execution can be observed incrementally through lifecycle events and
queried explicitly with `agent.getTree`.

Lifecycle causation distinguishes:

~~~text
toolCall
send
edge
~~~

but historical implementation coverage is narrower than the protocol surface:
`toolCall` had product-specific transformer support while `send` and `edge`
were declared for future transformer support.

The historical protocol is portable at the wire level while remaining closely
aligned with LangGraph execution concepts.

## Completed block — 1.6 LangChain Agent Streaming Protocol

Section 1.6 established the full protocol and implementation boundary.

~~~text
Agent Streaming Protocol
    -> thread-centric command / response / event contract

Pinned langchain-protocol 0.0.12
    -> generated protocol bindings
    -> historical CDDL recovered through Agent Protocol PR #72

Pinned Agent Server
    -> REST Run / Thread SSE contracts
    -> no direct Agent Streaming Protocol implementation wiring found

Current LangGraph SDK
    -> direct langchain_protocol integration
    -> protocol command dispatch
    -> SSE and WebSocket transports
~~~

The pinned `GET /threads/{thread_id}/stream` was proven to be the legacy
`join_thread_stream` SSE surface using `ThreadStreamMode` and `Last-Event-ID`,
not the Agent Streaming Protocol transport.

The final architecture keeps Agent Server REST and Agent Streaming Protocol as
distinct contracts that can be implemented by the same platform.

## Completed block — 1.7 MCP

The pinned Agent Server MCP surface is a stateless, Tools-only interoperability
projection over Assistants and Runs.

~~~text
MCP Tool
    -> Assistant
    -> runs.wait(thread_id=None)
    -> temporary Thread
    -> temporary Run
    -> normal Agent Server Runtime execution
~~~

Source inspection and live tests validated:

- handshake-era protocol negotiation through `2025-11-25`;
- Tools-only capabilities;
- stateless POST-only useful transport behavior;
- Assistant-to-Tool schema adaptation;
- temporary Thread/Run execution beneath stateless MCP calls;
- lossy success and error result projection;
- transport, JSON-RPC and Tool-runtime error layers;
- normalized-name empty and collision edge cases;
- the boundary between portable MCP semantics and LangGraph adapter policy;
- the architectural difference between the pinned 2025-era adapter and MCP
  `2026-07-28`.

## Completed block — 1.8 A2A

The A2A adapter was analyzed from source and live behavior across:

~~~text
Agent Card discovery
protocol-version behavior
canonical and legacy compatibility
SendMessage
GetTask
ListTasks
CancelTask
returnImmediately
dynamic HITL
resume
SendStreamingMessage
legacy message/stream
streaming HITL
streaming resume
~~~

The central result is:

~~~text
A2A Task != Runtime Run
~~~

Simple one-Run Tasks project cleanly, but lifecycle operations requiring
multiple Runs or protocol-specific intent expose projection gaps.

Most important findings:

~~~text
A2A-Version
    advertised but ignored

returnImmediately
    ignored

historyLength=0
    inconsistent

ListTasks Artifacts
    incomplete

terminal cancellation
    synthetic CANCELED

active cancellation
    CANCELED / FAILED / INPUT_REQUIRED split

HITL
    correctly maps graph interrupt to INPUT_REQUIRED + Artifact

resume
    preserves one logical Task during execution

persistent retrieval after resume
    exposes phantom continuation Task

canonical streaming
    hybrid v1/v0.x wire format

legacy streaming
    comparatively coherent v0.x format
~~~

A lossless adapter would require durable protocol-level Task state relating
multiple Runtime Runs to one A2A Task.

## Completed phase — Phase 1 — Agent Runtime & Protocols

Phase 1 is complete.

The final review is recorded in:

~~~text
docs/journal/lab-17-phase-1-review.md
~~~

The consolidated architecture is recorded in:

~~~text
docs/architecture.md
    Version 0.9 — Phase 1 consolidated Runtime and protocol architecture
~~~

Phase 1 promoted two additional architectural decisions:

~~~text
ADR 0002
    Runtime-owned persistence for registered graphs

ADR 0003
    Keep Runtime APIs and interoperability protocols distinct
~~~

Core invariants carried into the next phase include:

~~~text
Graph != Assistant
Thread != Run
Run success != graph END
Checkpointer != Store
Thread.status != authoritative execution lock

stateless API
    != execution without a Thread

Runtime lifecycle interrupt
    != graph/HITL interrupt

Agent Server REST
    != Agent Streaming Protocol

MCP / A2A adapter
    != execution engine

A2A Task
    != Runtime Run
~~~

## Current phase — Phase 2 — Agent ↔ UI

## Completed sub-block — 2.1A Frontend stack and scaffold

The greenfield frontend baseline is established under:

~~~text
apps/web/
~~~

Validated stack:

~~~text
React       19.3.1
TypeScript  7.0.2
Vite        8.3.5
Node        24.15.0
pnpm        10.6.2
~~~

Both lint and production build pass.

The frontend currently contains no LangGraph SDK, AG-UI integration,
state-management abstraction or Agent Server client.

Detailed evidence is recorded in:

~~~text
docs/journal/lab-18-frontend-foundations.md
~~~

## Completed sub-block — 2.1B Runtime domain model

A transport-independent frontend Runtime domain now exists under:

~~~text
apps/web/src/domain/
~~~

The model preserves the principal Phase 1 boundaries:

~~~text
AssistantId != ThreadId != RunId

RunStatus
    !=
GraphPosition

GraphInterrupt
    !=
LifecycleCancellation

CheckpointId
    !=
logical step number
~~~

Branded identifiers were compile-time validated.

The domain passed:

~~~text
pnpm lint
pnpm build
~~~

and contains no LangGraph SDK, AG-UI, A2A, MCP or wire-transport dependency.

Detailed evidence is recorded in:

~~~text
docs/journal/lab-18-frontend-foundations.md
~~~

## Completed sub-block — 2.1C Agent Server REST client baseline

The frontend now has a validated direct REST boundary to the pinned Agent
Server.

Implemented under:

~~~text
apps/web/src/transport/agent-server/
~~~

The transport pipeline is:

~~~text
unknown JSON
    -> tolerant decoder
    -> DTO
    -> mapper
    -> frontend domain
~~~

The implementation was validated against the live pinned Runtime for:

~~~text
Assistant search/get
Thread search/create/get/delete
Run list/get
ThreadState get
HTTP 404 handling
~~~

Observed Runtime/OpenAPI drift is handled explicitly, including nullable empty
ThreadState fields and fields returned by the Runtime but omitted from its
OpenAPI schema.

CORS permits direct development-browser access from both localhost:5173 and
127.0.0.1:5173, so no Vite proxy is required by this baseline.

The reusable OpenAPI inspection utility is:

~~~text
scripts/inspect-agent-server-openapi.py
~~~

Detailed evidence is recorded in:

~~~text
docs/journal/lab-18-frontend-foundations.md
~~~

## Completed sub-block — 2.1D Application shell

The frontend is now a live Runtime-aware React application.

Composition:

~~~text
AppConfig
    -> RuntimeProvider
    -> AgentServerClient
    -> Runtime overview projection
    -> AppShell
~~~

The shell has been validated in a real browser against the pinned Agent Server.

Observed live state included:

~~~text
Connected
Assistants = 1
Threads total = 21
Threads loaded = 20
Transport = REST
~~~

The Runtime logs confirmed successful browser requests to:

~~~text
POST /assistants/search
POST /threads/search
~~~

The default browser fetch is explicitly bound to globalThis after Chrome exposed
an Illegal invocation error that was not reproduced by the Node/Vite SSR
harness.

Direct Windows-browser-to-WSL localhost access works in the current development
environment, so no Vite reverse proxy is required.

The shell passes:

~~~text
pnpm lint
    -> 0 warnings
    -> 0 errors

pnpm build
    -> PASS
~~~

Detailed evidence is recorded in:

~~~text
docs/journal/lab-18-frontend-foundations.md
~~~

## Completed sub-block — 2.1E First execution surface

The frontend now supports its first complete stateful execution flow.

Validated browser path:

~~~text
select Assistant
    -> create/select Thread
    -> submit human message input
    -> create stateful Run
    -> poll Run lifecycle
    -> read persisted ThreadState
    -> project Runtime messages
    -> render user/assistant conversation
~~~

The first live UI execution reached:

~~~text
Run status = success
Graph next = END
Checkpoint = present
~~~

and persisted:

~~~text
USER
teste

ASSISTANT
O teste foi recebido.
~~~

The UI deliberately displays Run lifecycle and graph position independently.

The message boundary is:

~~~text
Run input wire
    !=
persisted LangChain message
    !=
frontend Message
~~~

The current execution surface uses REST polling. Event streaming remains reserved
for Phase 2.2.

Detailed evidence is recorded in:

~~~text
docs/journal/lab-18-frontend-foundations.md
~~~

## Completed block — 2.1 Frontend application

The complete pre-streaming frontend baseline is closed.

Implemented and validated:

~~~text
2.1A Frontend stack and scaffold
2.1B Runtime domain model
2.1C Agent Server REST client baseline
2.1D Application shell
2.1E First execution surface
2.1F Frontend baseline review
~~~

The final control architecture is:

~~~text
React UI
    -> application / execution orchestration
    -> tolerant Agent Server REST transport
    -> frontend Runtime domain
~~~

The browser can now:

~~~text
observe Assistants
observe Threads
create Threads
create stateful Runs
poll Run lifecycle
retrieve persisted ThreadState
display graph position
display checkpoint identity
project persisted messages
~~~

while preserving:

~~~text
Thread != Run

Run lifecycle != graph position

ThreadState = persisted message authority

wire message != persisted message != frontend Message
~~~

The frontend architecture is consolidated in:

~~~text
docs/architecture.md
    Version 1.0 — Phase 2 frontend baseline
~~~

The reusable closure gate is:

~~~text
scripts/check-frontend-baseline.py
~~~

Detailed experimental evidence is recorded in:

~~~text
docs/journal/lab-18-frontend-foundations.md
~~~

## Completed sub-block — 2.2A Pinned streaming contract discovery

The pinned Agent Server SSE contract has been observed directly.

The stateful creation endpoint is:

~~~text
POST /threads/{thread_id}/runs/stream
~~~

with:

~~~text
Content-Type: application/json
Accept: text/event-stream
~~~

The streaming request schema is:

~~~text
RunCreateStreamingStateful
    =
RunCreateStateful
    +
on_disconnect
~~~

where:

~~~text
on_disconnect = continue | cancel

default = continue
~~~

Observed event families were:

~~~text
metadata
checkpoints
values
updates
messages/metadata
messages/partial
~~~

The first experiment produced:

~~~text
23 events
21 unique SSE IDs
~~~

proving that SSE ID alone is not a unique semantic-event identity.

`messages/partial` was observed to contain cumulative snapshots of one AI
message rather than token deltas.

The final streamed checkpoint/state converged with persisted ThreadState.

The resulting authority model is:

~~~text
stream
    = live observation

ThreadState
    = persisted authority
~~~

Detailed evidence is recorded in:

~~~text
docs/journal/lab-19-event-streaming.md
~~~

## Completed sub-block — 2.2B SSE transport client

A fetch-based browser-compatible SSE transport is implemented.

Generic framing:

~~~text
ReadableStream<Uint8Array>
    -> TextDecoder
    -> SSE line parser
    -> SseEvent
~~~

Agent Server decoding:

~~~text
SseEvent
    -> known
    -> unknown
    -> malformed-json
~~~

The existing AgentServerClient now exposes:

~~~text
streamRun(...)
~~~

using:

~~~text
POST /threads/{thread_id}/runs/stream
~~~

The implementation preserves the existing transport conventions for:

~~~text
base URL normalization
fetch injection
credentials
HTTP status handling
AgentServerHttpError
~~~

and adds explicit validation for:

~~~text
text/event-stream
Response.body
~~~

Successful responses with invalid streaming envelopes become:

~~~text
AgentServerDecodeError
~~~

StreamRunInput also separates:

~~~text
AbortSignal
    = local request cancellation

onDisconnect
    = Runtime policy after connection loss
~~~

Deterministic validation covered:

~~~text
arbitrary byte boundaries
split UTF-8 code points
LF / CRLF / CR
multi-line data
comments
unknown fields
retry parsing
last-event-ID inheritance
NUL-containing IDs
empty IDs
EOF without final blank line
unknown Agent Server events
malformed JSON
request mapping
HTTP/decode error layering
AbortSignal propagation
~~~

A live pinned-Runtime smoke test successfully observed:

~~~text
metadata
updates
values
checkpoints
messages/metadata
messages/partial
~~~

and then reconciled persisted ThreadState through the existing REST client.

The two live experiments also showed that:

~~~text
messages/partial count
    != stable protocol contract
~~~

because one Run produced six partial snapshots and another produced seven.

No streaming dependency has entered:

~~~text
src/domain
src/app
src/components
src/execution
~~~

The React execution path therefore still uses the 2.1 REST-polling control.

Detailed evidence is recorded in:

~~~text
docs/journal/lab-19-event-streaming.md
~~~

## Completed sub-block — 2.2C Live Run streaming integration

The React execution path now uses the validated SSE transport.

Live execution control:

~~~text
streamRun
    -> metadata run_id
    -> streaming observation
    -> stream close
    -> getRun
    -> getThreadState
~~~

The previous polling loop has been removed.

Run identity and final Run resource remain separate:

~~~text
runId
    -> observed from stream metadata

run
    -> reconciled final Runtime resource
~~~

Browser and Runtime validation confirmed:

~~~text
one POST /runs/stream
one final GET /runs/{run_id}
one final GET /state
zero Run polling loop
~~~

The final ThreadState remains authoritative for persisted message projection.

Detailed evidence is recorded in:

~~~text
docs/journal/lab-19-event-streaming.md
~~~

## Completed sub-block — 2.2D Message and state projection

Live SSE payloads now project into provisional frontend state before persisted
Runtime reconciliation.

Empirically validated semantics:

~~~text
messages/partial
    -> cumulative AI Message snapshot
    -> merge/replace by message.id

values
    -> complete provisional graph-state snapshot

updates
    -> heterogeneous event data
    -> not treated as generic whole state
~~~

The pure projector is:

~~~text
apps/web/src/execution/stream-projector.ts
~~~

Browser validation proved that while:

~~~text
phase = streaming
Run ID = known
Run status = —
Graph next = —
Checkpoint = —
~~~

the Assistant message already grows inside one card.

Existing Thread history also remains visible across subsequent executions.

Final reconciliation remains:

~~~text
GET Run
GET ThreadState
~~~

and persisted ThreadState replaces provisional stream projection.

Detailed evidence is recorded in:

~~~text
docs/journal/lab-19-event-streaming.md
~~~

## Current sub-block — 2.2E Disconnect, reconnect and replay

The next experiment validates resumable streaming under transport loss.

Known evidence from 2.2A:

~~~text
stream_resumable = true

content-location
    -> resumable stream location

Last-Event-ID
    -> replay cursor

SSE IDs
    -> not globally unique semantic event identities

same SSE ID may be shared by different event families
~~~

The experiment must determine:

1. how the browser intentionally disconnects an active stream;
2. behavior with `on_disconnect=continue`;
3. behavior with `on_disconnect=cancel`;
4. how reconnect targets the original Run without creating another Run;
5. how Last-Event-ID is supplied by the fetch-based transport;
6. exactly which events are replayed;
7. whether `(id, event)` is sufficient for replay deduplication;
8. whether identical `(id, event)` can still repeat under replay;
9. how provisional message projection remains idempotent;
10. how final persisted reconciliation resolves any replay ambiguity;
11. what happens when disconnect occurs before metadata/run_id observation;
12. what happens after lifecycle completion but before the client consumes EOF.

The implementation must preserve:

~~~text
transport reconnect != new execution

replay = at-least-once observation

stream projection must be idempotent

ThreadState remains final persisted authority
~~~

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
