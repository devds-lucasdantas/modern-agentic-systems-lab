# Current Work

## Current phase

Phase 2 — Agent ↔ UI

Current sub-block:

~~~text
2.4E Stale-resume and failure safety
    -> investigate duplicate, stale and concurrent resume attempts
    -> distinguish lost POST response from a definitively rejected Run
    -> validate stronger server-side guarantees before enabling general HITL
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

## Completed sub-block — 2.2E Disconnect, reconnect and replay

The frontend now models resumable Run transport explicitly.

~~~text
RunStreamSession
    threadId
    runId
    streamUrl
    committedLastEventId
    currentEventId
    events()
    reconnect()
~~~

Validated Runtime semantics include:

~~~text
on_disconnect=continue
    -> original Run survives transport loss

on_disconnect=cancel
    -> original Run becomes interrupted

Location
    -> resumable stream identity when CORS-visible

metadata.run_id
    -> browser fallback identity and consistency check

Last-Event-ID
    -> replay after last safely completed SSE-ID group

replay
    -> at-least-once
    -> no generic event deduplication
~~~

Browser CORS hides Location in the current local cross-origin setup, so the
session supports deferred identity through metadata.run_id.

`useExecution` now owns reconnect policy and exposes:

~~~text
reconnecting-stream
~~~

as a first-class execution phase.

Browser offline state does not consume reconnect retry budget.

Playwright was added as the permanent browser E2E harness.

The resumable-stream E2E test proves:

~~~text
one POST creates one Run
    -> partial live output
    -> controlled SSE body failure
    -> reconnecting-stream
    -> GET same Run stream
    -> Last-Event-ID present
    -> replay
    -> one Assistant card
    -> success / END
~~~

The test passes in both headless and headed Chromium.

Detailed evidence is recorded in:

~~~text
docs/journal/lab-19-event-streaming.md
~~~

## Completed sub-block — 2.2F Persisted-state reconciliation

The frontend now distinguishes provisional stream observation from persisted
Runtime authority explicitly.

Empirical Runtime discovery established:

~~~text
last live values:
    keys = messages

final persisted ThreadState:
    keys =
        memory_contents
        messages
        skills_metadata
~~~

For the successful experiment:

~~~text
live messages == persisted messages

but

live values != complete persisted state
~~~

Therefore live values cannot replace GET ThreadState as the final graph-state
authority.

A streamed AI partial also does not imply persistence.

An interrupted Run demonstrated:

~~~text
Assistant partial visible in browser
    -> Run lifecycle interrupted
    -> model node had not committed AIMessage
    -> persisted AI messages = 0
    -> persisted reconciliation removed provisional card
~~~

The frontend now models message provenance through:

~~~text
ProjectionAuthority
    none
    live
    persisted
    unreconciled
~~~

Normal authority transition:

~~~text
none
    -> live
    -> persisted
~~~

Persisted-state retrieval failure:

~~~text
live
    -> unreconciled
~~~

This permits:

~~~text
Run.status = success
phase = failed
projectionAuthority = unreconciled
~~~

without discarding useful provisional output.

It also permits:

~~~text
Run.status = interrupted
phase = completed
projectionAuthority = persisted
~~~

when persisted Runtime reconciliation succeeds.

The browser UI exposes Message authority explicitly.

The current Phase 2 streaming E2E suite validates:

~~~text
resumable transport + replay
successful persisted reconciliation
interrupted persisted reconciliation
persisted-state reconciliation failure
~~~

All four Playwright tests pass together.

Detailed evidence is recorded in:

~~~text
docs/journal/lab-19-event-streaming.md
~~~

## Completed block — 2.2 Event streaming

The browser streaming baseline is complete.

The final architecture separates:

~~~text
SSE framing
    -> parseSseStream

Agent Server event decoding
    -> semantic stream events

Runtime resumability
    -> RunStreamSession

provisional projection
    -> stream projector

execution orchestration
    -> useExecution

presentation
    -> ExecutionSurface
~~~

Validated behavior includes:

~~~text
POST Run streaming
live values
cumulative messages/partial
stable Message-ID replacement
Run identity
CORS metadata fallback
safe replay cursor
Last-Event-ID
same-Run reconnect
at-least-once replay
online-aware retry
lifecycle reconciliation
persisted-state reconciliation
projection authority
interrupted provisional-state replacement
unreconciled failure state
~~~

The frontend exposes two independent state dimensions:

~~~text
ExecutionPhase
ProjectionAuthority
~~~

Projection authority is:

~~~text
none
live
persisted
unreconciled
~~~

Persisted ThreadState remains authoritative whenever reconciliation succeeds.

The browser E2E baseline consists of four Playwright scenarios:

~~~text
resumable stream
successful persisted reconciliation
interrupted persisted reconciliation
persisted-state reconciliation failure
~~~

Known limitations are recorded in:

~~~text
docs/architecture.md
docs/journal/lab-19-event-streaming.md
~~~

They include:

~~~text
pre-metadata reconnect when Location is hidden by CORS
direct Runtime error lifecycle coverage
independent reconciliation retry policy
large cumulative partial-message payloads
~~~

These are not blockers for the Phase 2.2 baseline.

## Completed sub-block — 2.3A Runtime shared-state contract discovery

Graph-aware state mutation was validated against the pinned Runtime without
executing any model.

Observed prerequisites and semantics:

~~~text
Thread metadata.graph_id = deep_agent

POST ThreadStateUpdate
    -> reducer-aware values
    -> as_node execution positioning
    -> new persisted checkpoint

GET ThreadState
    -> authoritative resulting state
~~~

An unassigned Thread returned HTTP 400 when updated before graph identity
was established.

The update response included:

~~~text
checkpoint
configurable
checkpoint_id
~~~

Sequential state updates established:

~~~text
new message ID
    -> append

existing message ID
    -> replace

three sequential updates
    -> C1 -> C2 -> C3
~~~

Historical checkpoint reads preserved the original messages and did not
move the Thread HEAD.

Six semantic assertions passed using the reproducible harness:

~~~text
scripts/lab-23a-shared-state.py
~~~

Detailed results:

~~~text
docs/journal/lab-20-shared-state.md
~~~

This does not establish stale-write protection or concurrency guarantees.

## Completed sub-block — 2.3B Frontend state projection boundary

A pure read-side projection now separates selected persisted Runtime state
from arbitrary internal graph values.

Implementation:

~~~text
apps/web/src/execution/thread-state-projector.ts
~~~

The projection exposes:

~~~text
PersistedThreadProjection
    authority
    threadId
    messages
    graph
        status
        next
        checkpointId
        parentCheckpointId
        taskCount
        interruptCount
~~~

Graph read status:

~~~text
uninitialized
pending
end
~~~

An empty Thread without a checkpoint is not represented as END.

The projection reuses existing message normalization and deliberately excludes
unselected graph values and raw Runtime control payloads.

The execution hook and presentation layer now consume this projection for
persisted messages and graph summaries.

Validation:

~~~text
12 pure projection assertions passed
4 browser E2E tests passed
lint passed
production build passed
~~~

Detailed evidence:

~~~text
docs/journal/lab-20-shared-state.md
~~~

## Completed sub-block — 2.3C Explicit state-update client

The transport layer now provides a typed, explicit write operation:

~~~text
AgentServerClient.updateThreadState(threadId, input)
    -> POST /threads/{thread_id}/state
    -> decode ThreadStateUpdateResponse
    -> map returned CheckpointRef
~~~

The input supports values, a selected CheckpointRef and asNode (wire as_node).
The client validates the supplied checkpoint Thread identity before HTTP,
preserves the existing fetch/credential/error behavior and decodes a non-empty
checkpoint ID. The POST result is a checkpoint reference, not a full persisted
ThreadState projection. An independent GET remains authoritative for state.

Validated against the pinned frontend and Runtime:

~~~text
oxlint: 0 warnings, 0 errors
TypeScript + Vite production build: PASS
mock HTTP assertions: 20 passed
real TypeScript client SSR bundle: PASS
isolated pinned Runtime: ready
throwaway graph-bound Thread: created
POST: typed checkpoint returned
independent GET: checkpoint, message and graph position confirmed
Run/model invocation: none
throwaway Thread and isolated Runtime process: cleaned up
~~~

Files:

~~~text
apps/web/src/transport/agent-server/{dto,decode,mappers,client,index}.ts
apps/web/src/transport/agent-server/state-update-client.spec.ts
scripts/lab-23c-state-update.{mjs,py}
~~~

Full reproducible evidence is recorded in docs/journal/lab-20-shared-state.md.
No React/SSE/useExecution/UI mutation controls were added in this sub-block.

## Completed sub-block — 2.3D Checkpoint-aware mutation

The pinned Runtime accepted historical-checkpoint-selected updates after HEAD
had already moved. Starting from C1 (message A), an ordinary update created C2
(A+B). Selecting C1 then created C3 (A+C), with parent C1. Selecting C2 after
C3 then created C4 (A+B+D), with parent C2. The observed lineage was:

~~~text
    C1 (A)
    |-- C2 (A+B)
    |    `-- C4 (A+B+D)   <- observed final HEAD
    `-- C3 (A+C)
~~~

After each selected write, a separate GET ThreadState returned that write's
checkpoint as HEAD. All earlier checkpoints remained readable and unchanged.
Four distinct checkpoints were observed; no Runs or model calls were created.
The disposable Thread and isolated pinned Runtime process were cleaned up.

### Readback and mutation policy

- A supplied CheckpointRef is a branching source selector, not a concurrency
  precondition or expected-HEAD compare-and-swap token.
- updateThreadState() returns the created CheckpointRef only. It does not return
  the complete persisted state or an authoritative frontend projection.
- After a write, GET ThreadState independently to observe the then-current HEAD.
  Compare the returned checkpoint ID with the mutation result; when they differ,
  do not falsely claim that the mutation failed or that its state is the HEAD.
- When reading a historical checkpoint by ID, verify that the actual returned
  checkpoint ID matches the requested ID. The pinned Runtime can return a
  synthetic empty HTTP 200 result for missing checkpoint selectors.
- Explicit historical selection may replace the visible HEAD with a different
  branch. A UI must make that choice deliberate and must not silently replay a
  stale selector as if it guarded concurrent updates.

This was a sequential experiment, NOT a simultaneous-writer test. It did not
prove stale-write rejection, CAS, locking or multiuser authorization. Those
policies and race tests remain in 2.3F.

Reproducible scripts:

~~~text
scripts/lab-23d-checkpoint-aware.py
scripts/lab-23d-checkpoint-aware.mjs
~~~

The initial experiment recorded ten true semantic observations in
/tmp/masl-23d-observations-910.json. The path and checkpoint IDs were ephemeral
and are not requirements for reproducing the experiment.

Full results and architectural interpretation are recorded in:

~~~text
docs/journal/lab-20-shared-state.md
~~~

## Completed sub-block — 2.3E Shared-state UI

The existing ExecutionSurface now renders a dedicated SharedStatePanel for the
selected Thread while preserving the established Run/SSE execution surface.
The panel presents an allowlisted persisted graph projection (checkpoint HEAD,
parent, next graph position and related summaries) rather than arbitrary
Runtime state channels. A user can deliberately append a human message to the
graph messages channel using HEAD, observed checkpoint or parent checkpoint as
the branch source. Checkpoint-aware edits require an explicit acknowledgement.

Write and readback are separate operations:

~~~text
explicit UI action
    -> AgentServerClient.updateThreadState(ThreadId, values/checkpoint/asNode)
    -> returned mutation CheckpointRef
    -> independent GET ThreadState (authoritative observed HEAD)
    -> compare returned checkpoint with observed HEAD
    -> present confirmed / diverged / unreconciled outcome
~~~

A failed or ambiguous post-mutation GET is shown as unreconciled, not as a
verified success or a safe automatic retry. The panel requires an explicit
reload before further writes after such a failure. The component retains a
handler-level in-flight guard; rendering uses React state, not ref.current.
ExecutionSurface assigns an explicit accessible name to its Thread selector.

Implementation:

~~~text
apps/web/src/components/SharedStatePanel.tsx
apps/web/src/components/ExecutionSurface.tsx
apps/web/src/App.css
apps/web/src/execution/state-update-readback.ts
apps/web/src/execution/state-update-readback.spec.ts
apps/web/e2e/shared-state-ui.spec.ts
~~~

Observed validation on the user's pinned WSL environment:

~~~text
oxlint: 0 warnings, 0 errors (45 files, 116 rules)
TypeScript + Vite production build: PASS (43 modules)
state-update readback unit assertions: 6 passed
Playwright Chromium with CI=1 and pinned Runtime: 2 passed (6.9 s)
    - historical parent-checkpoint branch and independent reconciliation
    - failed GET after POST -> visibly unreconciled -> explicit reload
~~~

The pre-fix lint run reported 11 react(refs) warnings, resolved by removing
ref.current from render expressions. Earlier E2E failures were caused by the
Thread control's missing exact accessible label, resolved with aria-label.
No new dependencies, model calls or changes to the pinned reference were
required for the focused 2.3E validation. Earlier 2.2 browser tests were not
rerun in this block; no full-suite claim is made.

The UI does not provide authorization, CAS, cross-writer locking, automatic
stale-write rejection or multiuser conflict resolution. These concerns remain
explicitly outside 2.3E. Reproducible tests and architecture decisions are
recorded in docs/journal/lab-20-shared-state.md.

## Completed sub-block — 2.3F Concurrency and stale-state protection

### 2.3F-A — Pinned Runtime concurrency discovery

With the real compiled TypeScript AgentServerClient and an isolated pinned
Runtime, four experiments observed: (1) two simultaneously dispatched writes
from separate clients both returned success (2/2); (2) a selected historical
checkpoint was accepted after HEAD had advanced; (3) a POST persisted but
another writer advanced HEAD before the first writer's separate GET; and
(4) a simulated lost POST response produced a client network error even though
that mutation had persisted. No Runs were created and disposable Threads were
cleaned up. The controlled simultaneous dispatch does not prove the Runtime's
internal transaction overlap or provide a general atomicity guarantee.

Reproduction:

~~~bash
python3 scripts/lab-23f-concurrency.py
~~~

The observed JSON was written to an ephemeral path:

~~~text
/tmp/masl-23f-observations-20056.json
~~~

### 2.3F-B — Best-effort frontend stale-state protection

SharedStatePanel now checks the complete observed checkpoint identity against
an independent current-HEAD GET before attempting a POST. This comparison
includes thread ID, checkpoint ID, namespace and checkpoint map; a mismatch
or preflight read failure blocks the attempted mutation. The UI makes no POST
when an already-stale HEAD is detected, clears acknowledgement and requires
explicit reload. After POST, a different observed HEAD is reported as diverged
and blocks further writes until explicit reload. A possible committed POST
with a lost response is never automatically retried. Manual reload resets the
confirmation and selector to current HEAD.

The guard is best-effort TOCTOU detection only. A concurrent writer can still
advance HEAD between preflight GET and POST. Neither the frontend nor the
pinned Runtime provides verified CAS, locks, multiuser authorization or an
idempotency-key contract for this endpoint.

Files:

~~~text
apps/web/src/components/SharedStatePanel.tsx
apps/web/src/execution/state-mutation-preflight.ts
apps/web/src/execution/state-mutation-preflight.spec.ts
apps/web/e2e/shared-state-ui.spec.ts
scripts/lab-23f-concurrency.py
scripts/lab-23f-concurrency.mjs
~~~

Observed validation:

~~~text
oxlint: 0 warnings and 0 errors (47 files, 116 rules)
TypeScript and Vite production build: PASS (44 modules)
11 state-mutation-preflight assertions passed
Playwright Chromium with pinned Runtime: 4 passed (9.7 s)
  - explicit historical parent branch and independent readback
  - failed GET after POST requires explicit reload
  - stale UI observation before preflight blocks POST
  - post-POST HEAD divergence blocks next write until reload
~~~

Two new browser tests initially failed because they called toBeVisible() on
an empty idle status container. The assertions were corrected to verify its
`data-mutation-stage=idle` attribute; the rerun passed 4/4. No blanket 2.2
browser regression run is claimed. The pinned upstream's EOL warning was not
resolved by upgrading packages; references remain reproducible.

The detailed evidence and limitations are in
`docs/journal/lab-20-shared-state.md`. The baseline review remains 2.3G.

## Completed sub-block — 2.3G Shared-state baseline review

The integrated review of 2.3A–2.3F passed on the pinned WSL Runtime without
model calls. It confirmed projection allowlisting, explicit state-update
transport, checkpoint ancestry and branching, POST/readback separation,
concurrency observations, and best-effort UI interlocks. Evidence was retained
in a timestamp-independent ephemeral report directory with gate logs and
archived 2.3D/2.3F JSON observations.

~~~text
11 selected gates passed:
  - oxlint: 0 warnings / 0 errors (47 files, 116 rules)
  - TypeScript + Vite production build: PASS (44 modules)
  - pure projection, typed client, readback, preflight: 49 assertions
  - Runtime probes: 2.3A, 2.3C, 2.3D, 2.3F
  - Chromium shared-state UI: 4 E2E scenarios
  - 2.2 model-dependent streaming E2E: SKIPPED (explicit opt-in)
~~~

Reproduction:

~~~bash
bash scripts/lab-23g-review.sh
~~~

The reviewer verifies that HEAD descends from the 2.3F baseline and that the
reviewed application and experiment sources match the recorded baseline, so
it can still be run after this documentation/runner commit. The 2.3F Python
harness itself also accepts descendants of its original starting commit.

### Architectural decision and open limits

The successful frontend preflight GET is a stale-observation safeguard, not
atomic compare-and-swap. Concurrent Runtime writers can still move HEAD
between GET and POST or after POST. Historical checkpoint selection is a
branch source, not a stale-version rejection condition. The readback comparator
checks checkpoint ID and Thread identity, while the preflight comparator checks
complete CheckpointRef identity including namespace and map; the two are not
interchangeable. Mutations with lost POST responses remain ambiguous and must
not be retried automatically.

No server-side CAS, distributed lock, trusted per-user authorization,
idempotency keys, exactly-once execution, or multiuser conflict resolution was
implemented or established. 2.2 model-dependent browser regressions were not
run in this baseline review; no full-suite claim is made. The local pinned
Runtime's upstream EOL warning was not addressed by changing dependencies.

The review journal and preserved gate logs describe the tested baseline. The
2.3 milestone is complete within these documented scope and evidence limits.

## Current sub-block — 2.4 Interrupts

Begin interrupt/HITL contract discovery against the pinned Runtime. Identify
interrupt identity, persistence, resume boundaries, and lifecycle semantics
before implementing any frontend controls. Preserve the completed shared-state
and SSE behavior; do not assume future authorization or concurrency contracts.

## Completed sub-block — 2.4A Pinned interrupt and resume discovery

A model-free, temporary LangGraph project exercised the pinned Runtime using
`interrupt()` and `Command.resume`, plus a separate `interrupt_before` graph
breakpoint. The project and server were created in temporary directories;
no changes were made to the pinned workshop reference or production graph.

Observed dynamic graph/HITL pause:

~~~text
Thread.status             interrupted
initial Run.status        success
ThreadState.next          [approval]
ThreadState.interrupts    populated with kind=masl_24a_hitl
ThreadState.tasks         approval with matching interrupt payload
checkpoint               present
~~~

Explicit resume through a second stateful Run with `command.resume=APPROVE_24A`
was accepted. The graph stored `RESUMED:APPROVE_24A`, cleared the interrupts,
reached END (`next=[]`), and left the Thread `idle`. Two distinct successful
Runs were observed for one logical pause/resume workflow.

The independent `interrupt_before=[checkpoint_only]` experiment observed
`Thread.status=interrupted`, a successful Run, a persisted checkpoint and
`next=[checkpoint_only]`, but **no** dynamic interrupt payload. Thus neither
a successful Run nor a Thread's `interrupted` status alone identifies an
approval request.

OpenAPI includes `Command.resume`, and the `Interrupt` schema requires
`value` but does not require `id`. The exact named schema `RunCreate` was
absent in the discovery output; this does not imply Run creation is absent,
since the stateful `runs/wait` request succeeded in the same experiment.

Reproduction:

~~~bash
python3 scripts/lab-24a-interrupt-contracts.py
~~~

Initial verified observation (ephemeral local artifact):

~~~text
/tmp/masl-24a-observations-19344.json
~~~

The six recorded semantic checks were true: four for HITL persistence/resume
and two for breakpoint positioning/no HITL payload. Both disposable Threads
were deleted, and the isolated Runtime process was terminated. No model calls
were involved; no frontend resume UI or client transport was added here.

Details, experimental boundaries and next-layer design requirements are in
`docs/journal/lab-21-interrupts.md`.

## Completed sub-block — 2.4B Persisted interrupt projection and classification

A new pure TypeScript boundary (`interrupt-projection.ts`) projects an
explicit read-only summary from decoded, persisted `ThreadState`. A separate
optional Thread.status is observed only after same-Thread identity is checked;
it is not proof of HITL or of an atomic current snapshot. A dynamic graph
interrupt requires a persisted checkpoint and nonempty top-level
`ThreadState.interrupts`. A paused Thread with no dynamic payload is classified
as `interrupted-without-payload`, not assumed to require human approval.
Unknown Thread status with `next` nodes is `position-pending`; missing or
contradictory checkpoint evidence is `indeterminate`. A checkpoint without next nodes or interrupts is
`end` only when no separate interrupted Thread status was observed.

The allowlist recognizes **only** the deterministic 2.4A experiment's
`kind=masl_24a_hitl` and valid string `question` (trimmed, <=240 characters,
control characters rejected). Unknown or malformed interrupt values remain
`opaque`, and optional IDs remain nullable. Only 20 interrupt summaries are
shown, with excess count reported. Raw payloads, state channels, metadata,
checkpoint namespace/map and task details are not forwarded. The output holds
only the checkpoint ID for display correlation; the full CheckpointRef remains
in the source ThreadState for future guarded resume design.

The implementation is a pure, **unwired** projection: there is no UI control,
resume transport, new Run, model call or runtime mutation in 2.4B. Existing
domain/transport mappers and shared-state UI were intentionally unchanged.
Task-level nested interrupts are not separately decoded into this projection;
only the top-level interrupt collection is classified. Unknown payloads are
not presented as approval instructions or authorization decisions.

Verified on WSL after the targeted Oxlint fix:

~~~text
Oxlint: 0 warnings, 0 errors (49 files, 116 rules)
TypeScript + Vite production build: PASS (44 modules)
Vite SSR pure test bundle: PASS (7 modules)
30 interrupt-projection assertions passed
~~~

The test suite covers empty/END/pending/breakpoint situations, dynamic HITL
and nullable IDs, checkpoint correlation, known-schema sanitization,
unknown/malformed/long/control-character payloads, raw-data non-leakage,
20-item display cap, inconsistent checkpoint evidence and cross-Thread
identity rejection. No Playwright or model-dependent 2.2 regression was run in
this sub-block. See `docs/journal/lab-21-interrupts.md` for the full contract.

## Completed sub-block — 2.4C Typed resume Run transport

`AgentServerClient.createResumeRun(threadId, { assistantId, resumeValue,
metadata? })` sends one explicit `POST /threads/{thread_id}/runs` containing
`input={}`, `command={resume: resumeValue}` and
`multitask_strategy='reject'`. The response is decoded as a typed Run, not as
persisted ThreadState. The client rejects a Run associated with another Thread
or with another canonical Assistant ID; it does not fetch ThreadState, retry,
authorize resume or claim that a successful POST has completed the graph.

`ResumeValue` is a recursively JSON-compatible type, with a runtime validator
that rejects undefined/non-finite/BigInt/function/symbol values, cycles,
non-plain objects, sparse arrays, getters/accessors and non-enumerable or
symbol keys that JSON.stringify could discard. Null is a valid response. An
HTTP conflict remains a typed `AgentServerHttpError`; malformed or mismatched
Run responses fail closed; an ambiguous lost POST response is never retried.

The pinned Runtime accepts graph names as assistant selectors, but the returned
Run may carry a concrete Assistant UUID. An initial 2.4C integration attempt
correctly rejected that mismatch. The probe was fixed to read the original
Run's canonical `assistantId` and use it for the resume request; the transport
keeps its strict identity check. A separate targeted change replaced a sparse
array literal in the test fixture to satisfy Oxlint without dropping coverage.

Observed on WSL at baseline `5627b35`:

~~~text
Oxlint: 0 warnings, 0 errors (50 files, 116 rules)
TypeScript + Vite production build: PASS (44 modules)
SSR pure test bundle: PASS (13 modules)
31 pure resume-transport assertions: PASS
Pinned isolated Runtime + real compiled TS client: 12/12 semantic checks PASS
Two distinct persisted Runs; new checkpoint at END; Thread idle
Zero model calls; disposable Thread deleted; isolated Runtime stopped
~~~

Experiment: `python3 scripts/lab-24c-resume-runtime.py`.
Evidence: `/tmp/masl-24c-observations-1890.json` (ephemeral PID-based path).
The experiment first persisted dynamic `interrupt()` data, then created a new
stateful Run using `Command.resume` and independently read the final Run,
Thread and ThreadState to confirm `RESUMED:APPROVE_24C`, no remaining interrupt,
`next=[]`, and a different checkpoint. No silent second POST was observed.

This block is **transport validation**, not a UI implementation or an
atomic/conflict-proof approval protocol. There is no checkpoint-conditional
CAS, per-user authorization, server-side idempotency or exactly-once approval;
no model-dependent streaming/browser regression is claimed. The frontend
must not infer authorized human action merely from a graph interrupt.

## Completed sub-block — 2.4D Deliberate HITL interface

The 2.4D frontend integrates the read-only 2.4B interrupt projection with the
explicit 2.4C `createResumeRun` client. The new `InterruptPanel` is mounted
once per selected Thread with unique React sibling keys for the HITL and
shared-state panels. It shows only the reviewed `masl_24a_hitl` question; an
unknown graph interrupt or a breakpoint never becomes an approval action.

To resume the single deterministic lab interrupt, the user must deliberately
choose `APPROVE_24D` or `REJECT_24D` and acknowledge the absence of atomic
approval/authorization semantics. The panel checks that exactly one prior
successful Run belongs to the Thread, resolves its canonical Assistant UUID,
verifies the reviewed graph ID and performs a best-effort persisted HEAD
preflight. A mismatched checkpoint, interrupt identity or question blocks the
POST. One explicit typed Run POST uses `Command.resume` and
`multitask_strategy=reject`; the UI polls the new Run via GET and independently
reads persisted ThreadState to confirm graph END and no remaining interrupts.
No automatic POST retry is performed; stale or ambiguous outcomes require
explicit inspection and reload.

WSL validation against commit `16a0e07`:

~~~text
Oxlint: 0 warnings, 0 errors (55 files, 116 rules)
TypeScript + Vite production build: PASS (47 transformed modules)
Pure HITL action guard: 26/26 assertions PASS
Model-free Chromium E2E: 3/3 PASS, one worker
Pinned deterministic Runtime: launched and cleaned up
~~~

The scoped Chromium scenarios validated: (1) deliberate response creates one
resume Run and independently observes END; (2) execution breakpoint does not
offer HITL action; (3) HEAD advancement in preflight blocks resume without a
POST. The 2.4D build required targeted Vite CLI invocation, unambiguous
Playwright locators, unique React sibling keys and a stage-specific stale
result assertion. These fixes are included in the verified nine source files.
The exact browser gate log is recorded in the Lab 21 journal.

This is a **deterministic, model-free development test**, not a production
approval system or a full 2.2 model-dependent browser regression. The
preflight GET is not atomic with the POST; the Runtime's local dev auth is
noop. No backend authorization, cross-writer lock, idempotency token,
exactly-once guarantee, or generic HITL approval schema was implemented.

## Current sub-block — 2.4E Stale-resume and failure safety

Establish the real duplicate/stale POST behavior of the pinned Runtime, test
ambiguous lost responses and concurrent writers, and distinguish best-effort
frontend interlocks from server-enforced guarantees. Do not claim robust
multiuser approval until those boundaries are actually validated.

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
