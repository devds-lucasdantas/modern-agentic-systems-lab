# Lab 13 — Agent Server and Protocol Boundaries

## Objective

Determine which service and interoperability contracts actually exist in the
pinned stack before treating terms such as "Agent Protocol", "Agent Streaming
Protocol", LangGraph API, MCP and A2A as interchangeable concepts.

The central question is:

~~~text
Which contracts belong to the LangGraph Agent Server,
which belong to LangChain,
and which are independent interoperability protocols?
~~~

The investigation starts source-first.

No new Runtime behavior is assumed merely from protocol naming.

---

# 1.5A — Source and package inventory

## Pinned packages

Relevant installed packages include:

~~~text
langchain-protocol       0.0.12
langgraph-api            0.8.1
langgraph-sdk            0.3.13
langgraph-runtime-inmem  0.28.0
langgraph                1.1.9
langchain-core           1.3.3
langchain                1.2.15
deepagents               0.5.3
~~~

## `langchain-protocol`

Distribution metadata describes:

~~~text
langchain-protocol 0.0.12

Python bindings for the LangChain agent streaming protocol
~~~

The package contains:

~~~text
langchain_protocol/
    __init__.py
    protocol.py
    py.typed
~~~

It explicitly describes itself as a source of generated typing primitives.

It does not provide:

~~~text
runtime client
transport
server
helper API
~~~

Its `protocol.py` is generated with `cddl2py`.

## Dependency ownership

The package enters the environment through:

~~~text
deepagents
    |
    v
langchain
    |
    v
langchain-core
    |
    v
langchain-protocol
~~~

`langchain-core` declares:

~~~text
Requires-Dist: langchain-protocol>=0.0.10
~~~

No direct dependency from `langgraph-api` or `langgraph-sdk` was observed.

## LangChain Agent Streaming Protocol command surface

The generated contract defines commands including:

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

Therefore the protocol is broader than token streaming.

It includes:

- execution input;
- subscriptions;
- reconnect;
- agent-tree introspection;
- human-input responses;
- injected input;
- state reads;
- checkpoint listing;
- state forking.

## Event channels

Declared channels include:

~~~text
values
updates
messages
tools
lifecycle
input
checkpoints
tasks
custom
custom:.+
~~~

Declared event families include:

~~~text
lifecycle
messages
tools
input.requested
values
updates
checkpoints
custom
tasks
~~~

Events can contain:

~~~text
event_id
seq
~~~

and reconnect requests can contain:

~~~text
run_id
last_event_id
subscriptions
~~~

The protocol therefore contains explicit replay/reconnect concepts.

## Agent topology

The protocol exposes:

~~~text
agent.getTree
~~~

and models an agent tree using:

~~~text
namespace
status
graph_name
children
metadata
~~~

Agent lifecycle causes can represent:

~~~text
toolCall
send
edge
~~~

This gives the protocol an explicit representation for nested agent /
subagent execution topology.

## Human-in-the-loop

The protocol separates:

~~~text
input.requested
        |
        v
input.respond
~~~

from:

~~~text
input.inject
~~~

An interrupt response and newly injected input are therefore distinct protocol
operations.

## State and time travel

The protocol exposes:

~~~text
state.get
state.listCheckpoints
state.fork
~~~

along with checkpoint references and summaries.

State inspection and execution branching are therefore part of the protocol
surface rather than purely LangGraph-internal concepts.

## Different lifecycle vocabulary

The LangChain protocol defines Agent status values:

~~~text
started
running
completed
failed
interrupted
~~~

The LangGraph SDK defines Run status values:

~~~text
pending
running
error
success
timeout
interrupted
~~~

These schemas are not identical.

Therefore:

~~~text
AgentStatus
    !=
LangGraph RunStatus
~~~

A protocol adapter would require semantic mapping rather than type identity.

## LangGraph SDK contract

`langgraph-sdk` identifies itself as:

~~~text
SDK for interacting with LangGraph API
~~~

and its package documentation describes it as a Python SDK for:

~~~text
LangSmith Deployment REST API
~~~

It defines its own API-resource schemas including:

~~~text
Assistant
Thread
ThreadState
Run
RunCreate
Checkpoint
Store items
~~~

Its client surface exposes resource-specific clients such as:

~~~text
AssistantsClient
ThreadsClient
RunsClient
StoreClient
~~~

This is the client contract for the LangGraph REST API.

It is not identified by the inspected package metadata or source as an
"Agent Protocol client".

## Agent Server contract

`langgraph-api` identifies itself as the implementation of:

~~~text
LangGraph API
~~~

The development Runtime persists and exposes resources such as:

~~~text
assistants
threads
runs
state
store
~~~

The OpenAPI inventory studied in Lab 12 includes resource-oriented REST
surfaces plus native MCP and A2A endpoints.

## `ServerRuntime`

`langgraph_sdk.runtime.ServerRuntime` is a server-side graph-factory context.

Observed access contexts are:

~~~text
threads.create_run
threads.update
threads.read
assistants.read
~~~

It allows graph factories to distinguish:

~~~text
execution
state update
state read
graph/schema introspection
~~~

The introspection path is also used to obtain schemas for:

~~~text
MCP
A2A
other protocol integrations
~~~

`ServerRuntime` therefore supports protocol integrations but is not itself an
interoperability protocol.

## Search for direct LangChain-protocol integration

The pinned Python environment was searched for literal handlers corresponding
to:

~~~text
subscription.subscribe
subscription.unsubscribe
subscription.reconnect
agent.getTree
input.respond
input.inject
state.listCheckpoints
state.fork
run.input
~~~

No implementation hit was found in:

~~~text
langgraph_api
langgraph_runtime_inmem
langgraph_sdk
langchain_core
langchain
deepagents
~~~

A full installed-package search for direct imports of:

~~~text
langchain_protocol
~~~

also returned no hits outside the package itself.

## Transport search

The pinned Agent Server source was searched for WebSocket registration and
WebSocket handlers.

No WebSocket surface was identified.

The Runtime does contain SSE reconnection support based on:

~~~text
Last-Event-ID
~~~

but that belongs to the LangGraph Run streaming implementation already studied
in Lab 12.

No source evidence currently establishes that this SSE surface implements the
`langchain-protocol` command/event contract.

## Source-established boundary

Current evidence supports four separate concepts:

~~~text
1. LangGraph Agent Server / Deployment REST API

2. langgraph-sdk
       Python client and schema bindings for that REST API

3. LangChain Agent Streaming Protocol
       typed command/event/state/reconnect contract
       represented by langchain-protocol

4. MCP and A2A
       independent protocol integrations exposed by the Agent Server
~~~

The following identity is NOT supported by the inspected source:

~~~text
LangGraph REST API
    ==
LangChain Agent Streaming Protocol
~~~

Likewise, no independently versioned generic contract named simply:

~~~text
Agent Protocol
~~~

was identified in the pinned packages.

### Evidence classification

~~~text
[SOURCE VALIDATED]

langchain-protocol:
    belongs to the LangChain dependency side
    generated typing contract
    no runtime client or transport
    broad command/event/state interaction model

langgraph-sdk:
    LangGraph / LangSmith Deployment REST API client
    own Assistant / Thread / Run / State schemas

langgraph-api:
    LangGraph API implementation

pinned Python source:
    no direct langchain_protocol imports found
    no literal protocol-command handlers found
    no WebSocket Agent Server transport found

[INFERENCE]

The pinned LangGraph REST API should not be described as an implementation of
the LangChain Agent Streaming Protocol without additional evidence.

The previous roadmap label "Agent Protocol" was therefore too ambiguous for the
contracts actually present in the pinned stack.
~~~

## 1.5A conclusion

The protocol investigation must distinguish:

~~~text
Runtime-specific service API
        vs
interoperability protocol
        vs
streaming protocol
~~~

The next block will map which already-validated Runtime concepts are
LangGraph-specific and which have equivalents in interoperable protocol
surfaces.

---

# 1.5B — Runtime concepts versus interoperability concepts

## Objective

Compare the already-validated LangGraph Agent Server resource model with the
installed LangChain Agent Streaming Protocol contract.

The goal is not to match names lexically.

The goal is to determine whether each concept is:

~~~text
A — DIRECT ANALOG

    The same essential concept exists on both sides.
    Wire shapes and scoping can differ.


B — SEMANTIC ADAPTATION

    Related concepts exist on both sides, but the models are not
    isomorphic and require semantic translation.


C — AGENT-SERVER-SPECIFIC

    A first-class Agent Server service/resource concept has no first-class
    equivalent in the inspected protocol contract.


D — PROTOCOL-SPECIFIC

    A first-class interaction-protocol abstraction has no equivalent
    resource abstraction in the Agent Server REST model.
~~~

These classifications describe the pinned contracts under study.

They are not claims about every possible agent protocol or deployment system.

## Methodological note — lexical presence is insufficient

A preliminary lexical comparison was useful for discovery but produced both
false positives and false negatives.

For example:

~~~text
protocol "store" = lexical YES
~~~

was a false positive caused by words such as:

~~~text
restored
~~~

No Store resource or Store command exists in the inspected
`langchain-protocol` contract.

Likewise:

~~~text
SDK "state read" = lexical NO
SDK "state fork" = lexical NO
~~~

were false negatives because the LangGraph SDK represents these concepts using
different names and resource-oriented operations such as:

~~~text
ThreadsClient.get_state()
ThreadsClient.get_history()
ThreadsClient.update_state()
checkpoint-based Run creation
~~~

The final mapping therefore uses source structure and semantics rather than
substring presence.

## Identity does not imply a resource contract

Both contracts contain identifiers such as:

~~~text
assistant_id
run_id
thread_id
checkpoint_id
interrupt_id
~~~

but identifier presence does not imply that the corresponding concept is a
first-class resource.

This distinction is especially important for Assistant, Thread and Run.

## Assistant

### LangGraph Agent Server

Assistant is a persisted, configurable and versionable resource.

Its SDK model includes fields such as:

~~~text
assistant_id
graph_id
config
context
metadata
version
name
description
created_at
updated_at
~~~

Service operations include:

~~~text
get
create
update
delete
search
count
get_versions
set_latest
get_graph
get_schemas
get_subgraphs
~~~

### LangChain Agent Streaming Protocol

The protocol contains:

~~~text
assistant_id
~~~

inside:

~~~text
run.input
~~~

where it identifies the deployed graph/agent to execute.

No Assistant CRUD, versioning or management resource is defined.

### Classification

~~~text
Assistant identity
    -> B — SEMANTIC ADAPTATION

Assistant management resource
    -> C — AGENT-SERVER-SPECIFIC
~~~

The protocol uses Assistant identity as an execution target but does not model
the Agent Server's Assistant management lifecycle.

## Thread

### LangGraph Agent Server

Thread is a persisted execution-lineage resource.

Its SDK model includes:

~~~text
thread_id
created_at
updated_at
metadata
status
values
interrupts
~~~

Thread operations include:

~~~text
get
create
update
delete
search
count
copy
prune
get_state
update_state
get_history
join_stream
~~~

### LangChain Agent Streaming Protocol

The protocol does not expose a first-class Thread command or Thread resource.

`thread_id` occurs only in limited contexts such as:

~~~text
message metadata
state.fork result
~~~

This is insufficient to establish a Thread lifecycle contract.

### Classification

~~~text
Thread resource
    -> C — AGENT-SERVER-SPECIFIC

thread_id
    -> incidental protocol identity / result data
~~~

Thread identity must not be mistaken for a portable Thread resource model.

## Run

### LangGraph Agent Server

Run is a persisted execution-attempt resource.

Its SDK shape includes:

~~~text
run_id
thread_id
assistant_id
created_at
updated_at
status
metadata
multitask_strategy
~~~

Runs can also be:

~~~text
created
listed
retrieved
waited on
streamed
joined
cancelled
deleted
batched
~~~

### LangChain Agent Streaming Protocol

The protocol models execution through:

~~~text
run.input
~~~

with:

~~~text
assistant_id
input
config?
metadata?
~~~

and returns:

~~~text
RunResult:
    run_id?
~~~

`run_id` is subsequently used for operations such as reconnect.

The protocol does not expose the full persisted Agent Server Run resource.

### Classification

~~~text
Run execution identity
    -> B — SEMANTIC ADAPTATION

persisted Run management resource
    -> C — AGENT-SERVER-SPECIFIC
~~~

A protocol Run is primarily an execution/interactivity handle.

An Agent Server Run is additionally a persisted service resource.

## Lifecycle

The protocol defines Agent lifecycle states:

~~~text
started
running
completed
failed
interrupted
~~~

The LangGraph Agent Server defines Run statuses:

~~~text
pending
running
error
success
timeout
interrupted
~~~

and separate Thread statuses:

~~~text
idle
busy
interrupted
error
~~~

These vocabularies are not isomorphic.

Examples include:

~~~text
Agent protocol:
    completed

Agent Server:
    success
~~~

and:

~~~text
Agent Server:
    pending
    timeout

Agent protocol:
    no directly identical status
~~~

The Agent Server additionally maintains Thread lifecycle separately from Run
lifecycle.

### Classification

~~~text
execution lifecycle
    -> B — SEMANTIC ADAPTATION

ThreadStatus
    -> C — AGENT-SERVER-SPECIFIC
~~~

A protocol adapter must define lifecycle mapping explicitly rather than reusing
status values as identical enums.

## State

The protocol exposes:

~~~text
state.get
~~~

with namespace-scoped state selection.

The Agent Server exposes Thread state through operations such as:

~~~text
get_state
get_history
update_state
~~~

and returns a richer execution snapshot containing:

~~~text
values
next
checkpoint
parent_checkpoint
tasks
interrupts
metadata
~~~

### Classification

~~~text
state inspection
    -> A — DIRECT ANALOG
~~~

The essential capability exists on both sides, although scope and representation
differ.

A protocol namespace must not automatically be interpreted as a LangGraph Store
namespace.

## Checkpoints

Both contracts represent checkpoint identity and lineage.

The protocol checkpoint model includes:

~~~text
id
parent_id
step
source
~~~

and checkpoint references/summaries.

The LangGraph API uses checkpoint configuration including:

~~~text
thread_id
checkpoint_ns
checkpoint_id
checkpoint_map
~~~

and its ThreadState exposes checkpoint and parent-checkpoint references.

### Classification

~~~text
checkpoint identity / lineage
    -> A — DIRECT ANALOG
~~~

The wire schemas differ, but the essential durable execution-position concept is
shared.

## State fork and time travel

The protocol explicitly exposes:

~~~text
state.fork
~~~

using a checkpoint ID and optional new input/config.

The Agent Server already demonstrated historical checkpoint execution and
branching in the earlier Runtime experiments.

### Classification

~~~text
state fork / execution branching
    -> A — DIRECT ANALOG
~~~

The two systems expose the same essential operation: continue execution from a
historical durable state without destructively replacing the original lineage.

## Human-in-the-loop

The protocol exposes:

~~~text
input.requested
        |
        v
input.respond
~~~

using:

~~~text
interrupt_id
namespace
response
~~~

It separately exposes:

~~~text
input.inject
~~~

The Runtime experiments previously established graph-level interrupts and
resume commands.

### Classification

~~~text
human input request / response
    -> A — DIRECT ANALOG
~~~

The exact command representation differs, but the durable pause/respond/resume
interaction is shared.

`input.inject` is a distinct protocol operation and must not be conflated with
responding to an existing interrupt.

## Reconnect and replay

The protocol exposes:

~~~text
subscription.reconnect
    run_id
    last_event_id?
    subscriptions?
~~~

and event metadata can include:

~~~text
event_id
seq
~~~

The LangGraph Runtime uses SSE and `Last-Event-ID`.

Earlier experiments established that its resumable SSE cursor IDs behave as
cursor groups: multiple semantic events may share one cursor.

### Classification

~~~text
reconnect / replay capability
    -> B — SEMANTIC ADAPTATION
~~~

The underlying goal is shared, but replay and subscription semantics are not
identical.

A protocol adapter must preserve each side's replay guarantees rather than
assuming an event-for-event cursor mapping.

## Agent and subagent topology

The protocol defines:

~~~text
agent.getTree
~~~

and:

~~~text
AgentTreeNode:
    namespace
    status
    graph_name
    children?
    metadata?
~~~

Lifecycle causes can represent:

~~~text
toolCall
send
edge
~~~

The Agent Server REST API exposes graph and subgraph introspection, but the
inspected resource model does not expose an equivalent live AgentTree resource
with the same command and lifecycle semantics.

### Classification

~~~text
live Agent/subagent interaction tree
    -> D — PROTOCOL-SPECIFIC
~~~

This is a protocol-level abstraction over active agent topology rather than an
Agent Server management resource.

## Subscription and channel model

The LangChain Agent Streaming Protocol defines explicit:

~~~text
subscription.subscribe
subscription.unsubscribe
subscription.reconnect
~~~

with channels including:

~~~text
values
updates
messages
tools
lifecycle
input
checkpoints
tasks
custom
~~~

The LangGraph Runtime has streaming modes and SSE attachment surfaces, but it
does not expose this subscription command model in the inspected Agent Server
source.

### Classification

~~~text
subscription command model
    -> D — PROTOCOL-SPECIFIC
~~~

Conceptual streaming overlap does not make the transport contracts identical.

## Store

The LangGraph Agent Server exposes a first-class Store API with operations such
as:

~~~text
put_item
get_item
delete_item
search_items
list_namespaces
~~~

The inspected LangChain Agent Streaming Protocol contains no first-class Store
resource or Store commands.

### Classification

~~~text
Store
    -> C — AGENT-SERVER-SPECIFIC
~~~

Protocol state namespaces must not be treated as Store namespaces.

## Service-management concepts without first-class protocol equivalents

The following concepts are exposed by the Agent Server SDK but have no
first-class equivalent in the inspected protocol contract:

| Agent Server concept | Classification |
| --- | --- |
| Assistant CRUD | C — Agent-Server-specific |
| Assistant versioning | C — Agent-Server-specific |
| Thread CRUD | C — Agent-Server-specific |
| Thread status | C — Agent-Server-specific |
| Thread copy / prune | C — Agent-Server-specific |
| Run list / get / delete / batch | C — Agent-Server-specific |
| Store CRUD / namespace listing | C — Agent-Server-specific |
| Cron | C — Agent-Server-specific |
| `durability=sync/async/exit` | C — Agent-Server-specific |
| multitask strategy | C — Agent-Server-specific |
| `reject` / `enqueue` | C — Agent-Server-specific |
| lifecycle `interrupt` / `rollback` cancellation | C — Agent-Server-specific |
| delayed execution / `after_seconds` | C — Agent-Server-specific |
| webhook | C — Agent-Server-specific |
| stateless `on_completion` policy | C — Agent-Server-specific |
| resource search / count | C — Agent-Server-specific |
| `interrupt_before` / `interrupt_after` breakpoints | C — Agent-Server-specific |

These concepts primarily belong to service operation, persistence policy,
scheduling, resource administration or LangGraph execution control.

Their absence from the protocol does not mean that an application cannot
communicate related information through generic metadata/config/custom fields.

It means that they are not first-class contract concepts in the inspected
protocol version.

## Consolidated mapping

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
    Assistant resource management
    Thread resource
    Thread status
    persisted Run resource management
    Store
    Cron
    durability
    multitask strategies
    cancellation rollback policy
    delayed scheduling
    webhooks
    on-completion policy
    resource search / count / prune
    execution breakpoints

PROTOCOL-SPECIFIC
    subscription command model
    protocol channel model
    live agent/subagent tree
    lifecycle causation model
~~~

## Architectural interpretation

The two contracts optimize for different responsibilities.

~~~text
LangGraph Agent Server REST API
    |
    +-- persistence
    +-- resource management
    +-- scheduling
    +-- concurrency policy
    +-- deployment/runtime operation
    +-- execution inspection


LangChain Agent Streaming Protocol
    |
    +-- execution interaction
    +-- lifecycle observation
    +-- streamed messages/tools/state
    +-- reconnect
    +-- human input
    +-- checkpoint interaction
    +-- agent/subagent topology
~~~

There is meaningful conceptual overlap, but neither contract is a subset-shaped
copy of the other.

An adapter between them would be a semantic translation layer.

It could not be implemented correctly as simple schema renaming.

## Evidence classification

~~~text
[SOURCE VALIDATED]

Agent Server SDK:
    persisted Assistant / Thread / Run resources
    service-management clients
    Store
    Cron
    concurrency and durability controls

LangChain Agent Streaming Protocol:
    run input / run ID
    subscriptions
    lifecycle
    state
    checkpoints
    fork
    HITL input
    agent tree
    reconnect

[SOURCE + PRIOR RUNTIME VALIDATED]

state/checkpoint branching
HITL
SSE reconnect/replay
Runtime lifecycle
Thread lifecycle
multitask strategies
durability

[INFERENCE]

A correct bridge between the Agent Server and the LangChain Agent Streaming
Protocol requires explicit semantic adaptation for lifecycle, identity and
replay behavior.
~~~

## 1.5B conclusion

The Agent Server REST API is primarily a stateful service/resource-management
contract.

The LangChain Agent Streaming Protocol is primarily an agent-interaction and
event contract.

Their overlap is real but selective.

The next investigation should identify where the Agent Server deliberately
exposes independent protocol integrations and how those integrations obtain
graph schemas and execution context without collapsing their contracts into the
REST resource model.

---

# 1.5C — Agent Server protocol-integration boundary

## Objective

Determine how the pinned Agent Server exposes independent interoperability
protocols without replacing its internal Assistant / Thread / Run execution
model.

The source investigation focuses on A2A and MCP only as integration boundaries.

Detailed protocol behavior remains reserved for the dedicated later labs.

## Shared adapter architecture

Both protocol integrations are first-class protected Agent Server routes.

Both use a local LangGraph SDK client:

~~~python
get_client(url=None)
~~~

to access existing Agent Server resources.

The resulting architecture is:

~~~text
External protocol
        |
        v
protocol adapter
        |
        v
LangGraphClient
        |
        +-- Assistants
        +-- Threads
        +-- Runs
        |
        v
Agent Server Runtime
        |
        v
LangGraph
~~~

The interoperability protocols therefore do not replace the Agent Server
Runtime.

They project different external semantics over the same execution substrate.

## Route composition and feature gates

The Agent Server route collection includes:

~~~text
assistants_routes
runs_routes
threads_routes
store_routes
ui_routes
mcp_routes
a2a_routes
~~~

MCP and A2A can be disabled independently through HTTP configuration.

Their OpenAPI paths are likewise removed when the corresponding integration is
disabled.

This establishes MCP and A2A as optional protocol adapters around the Runtime
rather than mandatory parts of the core resource API.

# A2A adapter

## Transport

The pinned A2A implementation supports:

~~~text
A2A protocol
JSON-RPC 2.0
HTTP
SSE for streaming
~~~

Push notifications are not implemented.

## Identity mapping

A2A uses:

~~~text
contextId
~~~

as the LangGraph:

~~~text
thread_id
~~~

A2A Task identity is synthesized as:

~~~text
"{contextId}:{run_id}"
~~~

The task ID can therefore be decomposed back into:

~~~text
Thread identity
+
Run identity
~~~

An A2A Task is not merely an alias for a LangGraph Run resource.

## `SendMessage`

The source path is:

~~~text
A2A SendMessage
        |
        v
message / command translation
        |
        v
runs.create(
    thread_id=contextId,
    assistant_id=assistantId,
    ...
)
        |
        v
runs.join(...)
        |
        v
A2A Task
~~~

If no `contextId` is provided, the adapter generates one and passes it as the
Thread ID with `if_not_exists="create"`.

A2A execution is therefore stateful at the protocol boundary.

## Human-in-the-loop continuation

The adapter inspects whether an existing Thread is interrupted and can promote
incoming A2A message parts into a LangGraph `Command`.

This permits A2A interaction to resume an interrupted graph through the same
Run execution substrate.

The protocol adapter translates rather than bypasses LangGraph HITL semantics.

## `GetTask`

A2A task inspection reads:

~~~text
runs.get(...)
threads.get(...)
threads.get_history(...)
~~~

The adapter combines Run and Thread information to construct the A2A Task.

This is necessary because the two lifecycle models are not isomorphic.

For example:

~~~text
LangGraph Run
    status = success

LangGraph Thread
    status = interrupted

A2A Task
    state = input-required
~~~

This reproduces an earlier Runtime finding:

~~~text
Run success
    !=
graph END
~~~

The protocol adapter therefore requires semantic lifecycle translation.

## Lifecycle mapping

The basic Run-to-A2A state map is:

~~~text
pending
    -> submitted

running
    -> working

success
    -> completed

interrupted
    -> input-required

error
timeout
    -> failed
~~~

Contextual Thread state can refine that basic mapping.

## `CancelTask`

A2A cancellation maps to:

~~~text
runs.cancel(
    wait=True,
    action="interrupt"
)
~~~

The adapter does not use rollback for A2A task cancellation.

It also implements the protocol's expected cancellation idempotency: an already
terminal LangGraph Run may still be represented as an acknowledged canceled
A2A Task.

## History

A2A Task history is reconstructed from LangGraph Thread checkpoint history.

The adapter queries history filtered by Run metadata and extracts the relevant
message state.

A2A history is therefore a protocol projection over persisted LangGraph
checkpoint state.

## Streaming

A2A `SendStreamingMessage` uses:

~~~text
client.runs.stream(...)
~~~

The resulting LangGraph stream items are converted into A2A messages and
status-update events before being emitted through SSE.

Therefore:

~~~text
LangGraph semantic stream
        !=
A2A event stream
~~~

even though the latter is powered by the former.

## Agent Card

The A2A Agent Card is generated from:

~~~text
Assistant
+
Assistant graph schemas
~~~

The adapter calls:

~~~text
assistants.get(...)
assistants.get_schemas(...)
~~~

and transforms the results into an A2A representation including:

~~~text
name
description
URL
protocol binding
protocol version
capabilities
skills
input modes
output modes
~~~

An Agent Card is therefore an interoperability projection of an Assistant, not
a serialization of the Assistant resource.

# MCP adapter

## Implementation structure

The MCP implementation is organized as:

~~~text
langgraph_api/api/mcp/
    __init__.py
    _constants.py
    _handlers.py
    _models.py
    _routes.py
    _sanitizers.py
~~~

The module describes itself as an MCP server using Streamable HTTP.

The pinned implementation supports protocol versions:

~~~text
2024-11-05
2025-03-26
2025-06-18
2025-11-25
~~~

## MCP projection model

The module explicitly states:

~~~text
each LangGraph Assistant
    ->
one MCP Tool
~~~

This is substantially different from the A2A projection.

MCP does not expose the Assistant as an agent-management resource.

It exposes its callable behavior as a Tool.

## Stateless boundary

The MCP implementation is explicitly stateless.

It maintains no persistent MCP session.

Its HTTP route accepts:

~~~text
POST
GET
DELETE
~~~

but in the pinned implementation:

~~~text
POST
    -> JSON-RPC requests

GET
    -> 405
       streaming/session resumption not implemented

DELETE
    -> 404
       no persistent session to terminate
~~~

MCP streaming is therefore not implemented in this pinned server version.

## Supported MCP methods

The JSON-RPC dispatcher supports:

~~~text
initialize
ping
tools/list
tools/call
~~~

No first-class handlers were observed for:

~~~text
resources/list
resources/read
prompts/list
prompts/get
~~~

The pinned implementation is therefore primarily an MCP Tool server.

## Protocol negotiation

`initialize` negotiates the requested protocol version against the supported
versions and returns:

~~~text
protocolVersion
capabilities.tools
serverInfo
~~~

The server advertises Tool capability with:

~~~text
listChanged = false
~~~

## `tools/list`

The implementation calls:

~~~text
assistants.search(...)
~~~

and represents available Assistants as MCP Tools.

For each Assistant it calls:

~~~text
assistants.get_schemas(...)
~~~

and converts the Assistant input schema into MCP `inputSchema`.

Tool names are normalized to MCP naming constraints.

Duplicate normalized names are suppressed.

Assistants whose schemas cannot be converted are omitted from the Tool list.

## Schema adaptation

LangGraph / LangChain message-heavy schemas are simplified before being exposed
to MCP clients.

Properties that reference LangChain message types can be reduced to a portable
string input such as:

~~~text
"The user message to send to the agent."
~~~

This establishes explicit schema adaptation rather than schema passthrough.

## `tools/call`

The MCP Tool name is resolved back to the matching Assistant.

Execution then uses:

~~~text
client.runs.wait(
    thread_id=None,
    assistant_id=<resolved assistant>,
    input=<tool arguments>,
    context=<MCP context>,
    raise_error=False
)
~~~

Therefore the protocol-level operation:

~~~text
MCP tools/call
~~~

maps to:

~~~text
stateless LangGraph Run
        |
        v
Runtime-managed Thread
        |
        v
wait consumption mode
~~~

`thread_id=None` hides Thread identity from the MCP contract but does not remove
the Runtime's internal Thread machinery.

## MCP error boundary

Protocol/request problems such as:

~~~text
unknown tool
ambiguous normalized tool name
invalid parameters
unknown method
~~~

are represented as JSON-RPC errors.

A graph execution failure returned as:

~~~text
{"__error__": ...}
~~~

is instead converted to an MCP Tool result:

~~~text
isError = true
content = [...]
~~~

Transport/protocol failure and Tool execution failure are therefore distinct
error classes at the adapter boundary.

# A2A versus MCP

The same Runtime is projected differently by each integration.

| Concern | A2A | MCP |
| --- | --- | --- |
| External abstraction | Agent / Task | Tool |
| Assistant | Agent identity / card | Tool definition |
| Thread | `contextId` | hidden |
| Run | Task execution component | Tool invocation |
| Protocol state model | stateful | stateless |
| History | Thread/checkpoint history | not exposed |
| HITL | mapped through interruption/resume | not first-class |
| Cancellation | mapped to Run interrupt | not first-class |
| Streaming | Run stream translated to A2A SSE | not implemented |
| Schema use | Agent Card / capabilities | Tool `inputSchema` |
| Execution primitive | Run create/join/stream | Run wait |
| Error mapping | A2A JSON-RPC lifecycle/errors | JSON-RPC + Tool `isError` |

## Architectural consequence

Protocol adapters decide how much of the internal Runtime model is visible.

A2A preserves a large portion of stateful execution semantics:

~~~text
Assistant
Thread
Run
history
interrupts
streaming
~~~

MCP deliberately flattens the model:

~~~text
Assistant
    -> Tool

Assistant schema
    -> Tool inputSchema

Tool invocation
    -> stateless Run

Run result
    -> Tool content
~~~

The protocol boundary is therefore a semantic projection layer.

It is not a one-to-one exposure of Agent Server resources.

## Ownership boundary

The Agent Server remains responsible for:

~~~text
Assistant persistence
Thread creation / persistence
Run scheduling and execution
checkpoints
history
cancellation
authentication
execution errors
~~~

The adapters are responsible for:

~~~text
protocol transport
protocol identity mapping
schema adaptation
message conversion
lifecycle translation
protocol-specific error representation
capability advertisement
~~~

## Evidence classification

~~~text
[SOURCE VALIDATED]

A2A:
    first-class Agent Server adapter
    local LangGraphClient
    Assistant / Thread / Run reuse
    contextId -> Thread
    Task -> Thread + Run
    SendMessage -> Run create/join
    GetTask -> Run + Thread + history
    CancelTask -> Run interrupt
    streaming -> Run stream + A2A SSE translation
    Agent Card -> Assistant + schemas

MCP:
    first-class Agent Server adapter
    Streamable HTTP / JSON-RPC
    stateless
    each Assistant exposed as a Tool
    tools/list -> Assistant search + schemas
    tools/call -> stateless Run wait
    no persistent MCP session
    no pinned MCP streaming
    schema sanitization
    protocol errors distinct from Tool execution errors

[INFERENCE FROM VALIDATED RUNTIME MODEL]

Because both adapters invoke the existing Runs surface, execution continues to
use the Agent Server's existing scheduler, graph execution and persistence
substrate.

The adapters change the external contract, not the underlying execution
engine.
~~~

## 1.5C conclusion

A2A and MCP demonstrate two different interoperability projections over the
same Agent Server Runtime.

A2A preserves stateful agent/task semantics.

MCP exposes Assistants as stateless callable Tools.

This confirms that the Agent Server should be understood as a core execution
service surrounded by protocol-specific semantic adapters.
