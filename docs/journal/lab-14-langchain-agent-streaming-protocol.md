# Lab 14 — LangChain Agent Streaming Protocol

## Scope

Phase 1 section 1.6 studies the LangChain Agent Streaming Protocol as a contract
independent from the previously validated LangGraph Agent Server REST API.

The pinned reference environment contains:

~~~text
langchain-protocol 0.0.12
~~~

Its Python source was generated with:

~~~text
cddl2py 0.2.2
~~~

The investigation deliberately separates:

~~~text
protocol grammar
protocol semantics
transport
reference implementation
Agent Server integration
current upstream evolution
~~~

so that conclusions from one layer are not silently projected onto another.

# 1.6A — Pinned protocol grammar inventory

## Source artifact

The installed distribution reports:

~~~text
Name: langchain-protocol
Version: 0.0.12
Summary: Python bindings for the LangChain agent streaming protocol
Python: >=3.10,<4
Dependency: typing-extensions
~~~

The generated `protocol.py` contains 556 lines.

## Top-level grammar

The generated binding defines separate command and output-message unions:

~~~text
Command
    -> client command envelope

Message
    -> CommandResponse
     | ErrorResponse
     | Event
~~~

A command and a protocol output message are therefore different top-level
structures.

## Command envelope

Every command variant includes:

~~~text
id: JsUint
method: Literal[...]
params: ...
~~~

The pinned grammar contains ten commands.

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

Grouped structurally:

~~~text
Command
├── Run
│   └── run.input
├── Subscription
│   ├── subscription.subscribe
│   ├── subscription.unsubscribe
│   └── subscription.reconnect
├── Agent
│   └── agent.getTree
├── Input
│   ├── input.respond
│   └── input.inject
└── State
    ├── state.get
    ├── state.listCheckpoints
    └── state.fork
~~~

## Run input

`run.input` accepts:

~~~text
assistant_id
input
config?
metadata?
~~~

The command does not expose first-class Agent Server operational controls such
as:

~~~text
multitask strategy
durability
delayed scheduling
webhook
on-completion policy
~~~

The protocol command model is therefore not a copy of the Agent Server Run
resource API.

## Response envelope

Successful commands return:

~~~text
CommandResponse
    type = "success"
    id
    result
    meta?
~~~

The correct generated type name is `CommandResponse`; there is no
`SuccessResponse` type in the pinned binding.

`ResponseMeta` may contain:

~~~text
applied_through_seq
~~~

Errors use:

~~~text
ErrorResponse
    type = "error"
    id: uint | null
    error
    message
    stacktrace?
    meta?
~~~

The pinned error codes are:

~~~text
invalid_argument
unknown_command
unknown_error
no_such_run
no_such_subscription
no_such_namespace
no_such_interrupt
no_such_checkpoint
permission_denied
not_supported
~~~

## Result grammar

The binding defines:

~~~text
RunResult
    run_id?

SubscribeResult
    subscription_id
    replayed_events?

ReconnectResult
    restored
    missed_events?
    current_namespaces?

AgentResult
    tree

StateGetResult
    values
    checkpoint?

ListCheckpointsResult
    checkpoints

StateForkResult
    run_id
    thread_id

EmptyResult
~~~

`CommandResponse.result` is typed as the broad `ResultData` union rather than a
command-specific result.

The caller must therefore correlate the response `id` with the originating
command to know which result shape is semantically expected.

## Event envelope

Every event has:

~~~text
type = "event"
event_id?
seq?
method
params
~~~

`event_id` is documented as a reconnection identifier that maps to the SSE
`id:` field.

`seq` is documented as a monotonic sequence number for ordering.

The nine event families are:

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

## Event payload typing caveat

The generated Python envelope classes type their payload as:

~~~text
params: dict[str, Any]
~~~

even though the module separately defines richer structures including:

~~~text
LifecycleData
MessagesData
ToolsData
InputRequestedData
UpdatesData
CustomData
~~~

The inspected generated binding does not statically connect those payload
types to the corresponding event envelope classes.

Some channels such as values, checkpoints and tasks also have no dedicated
`*Data` type visible in the generated structural inventory.

This is a binding-level type-safety gap that must be compared with the
source-of-truth CDDL before concluding that the protocol itself is equally
untyped.

## Channels

The channel grammar contains:

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

The last form permits custom channel names matching the custom channel family.

## Namespace model

~~~text
Namespace = list[str]
~~~

Subscriptions support:

~~~text
channels
namespaces?
depth?
~~~

Namespace selection is documented as prefix matching, with optional maximum
depth below the prefix.

The subscription model is therefore multidimensional:

~~~text
channel selection
+
namespace prefix
+
depth
~~~

## Sequence and reconnect coordinates

The schema exposes two different coordinate families.

Sequence-oriented:

~~~text
seq
since
applied_through_seq
~~~

Reconnect-oriented:

~~~text
event_id
last_event_id
~~~

`EventStreamRequest.since` is explicitly documented as replaying events after a
sequence number.

`event_id` is explicitly documented as the reconnection identifier and SSE ID.

The schema therefore must not be simplified into a single generic cursor
without further semantic validation.

## Subscription commands

~~~text
subscription.subscribe
    channels
    namespaces?
    depth?

subscription.unsubscribe
    subscription_id

subscription.reconnect
    run_id
    last_event_id?
    subscriptions?
~~~

Subscribe results may report:

~~~text
subscription_id
replayed_events?
~~~

Reconnect results may report:

~~~text
restored
missed_events?
current_namespaces?
~~~

Exact buffering, retention, duplicate-delivery and replay guarantees are not
established by the grammar alone.

## Agent topology

`agent.getTree` exposes nested agent execution as a first-class protocol
concept.

~~~text
AgentTreeNode
    namespace
    status
    graph_name
    children?
    metadata?
~~~

Agent status values are:

~~~text
started
running
completed
failed
interrupted
~~~

Lifecycle events can include causation:

~~~text
toolCall
    tool_call_id

send
    from_node

edge
    from_node
~~~

This represents live execution topology and causation rather than a persisted
Assistant resource hierarchy.

## Human-in-the-loop grammar

The runtime can emit:

~~~text
input.requested
    interrupt_id
    payload
~~~

The interrupt can be answered with:

~~~text
input.respond
    namespace
    interrupt_id
    response
~~~

The shared `interrupt_id` correlates the request and response.

A separate command exists for message injection:

~~~text
input.inject
    namespace
    message:
        role = user | system
        content
        name?
~~~

`input.respond` and `input.inject` are therefore distinct interaction
operations.

## State grammar

State inspection:

~~~text
state.get
    namespace
    keys?
~~~

Result:

~~~text
values
checkpoint?
~~~

Checkpoint listing:

~~~text
state.listCheckpoints
    namespace?
    limit?
    before?
~~~

Checkpoint summaries include:

~~~text
id
timestamp
step
node_name?
metadata?
~~~

State fork:

~~~text
state.fork
    checkpoint_id
    input?
    config?
~~~

Result:

~~~text
run_id
thread_id
~~~

Notably, state inspection is namespace-oriented while state fork identifies its
target directly by checkpoint ID.

## Checkpoint model

A checkpoint reference contains:

~~~text
id
ns?
~~~

A richer checkpoint structure contains:

~~~text
id
parent_id?
step
source
~~~

Checkpoint sources are:

~~~text
input
loop
update
fork
~~~

## Message streaming grammar

Message streaming has a nested lifecycle:

~~~text
message-start
    |
    v
content-block-start
    |
    v
content-block-delta *
    |
    v
content-block-finish
    |
    v
message-finish
~~~

A message stream can instead emit a message-level error.

Message-start identifies:

~~~text
role
message id
provider/model metadata?
~~~

Message-finish can contain token usage.

## Content blocks

The protocol supports:

~~~text
text
reasoning
non_standard

image
video
audio
file

tool_call
tool_call_chunk
invalid_tool_call

server_tool_call
server_tool_call_chunk
server_tool_result
~~~

Partial content uses `ContentBlock`.

Completed content uses `FinalizedContentBlock`, which excludes incomplete
chunk variants.

The schema therefore distinguishes incremental content from finalized content.

## Tool execution streaming

Tool execution has an event family separate from tool-call content embedded in
messages.

~~~text
tool-started
    tool_call_id
    tool_name
    input?

tool-output-delta
    tool_call_id
    delta

tool-finished
    tool_call_id
    output

tool-error
    tool_call_id
    message
    code?
~~~

This establishes two distinct tool representations:

~~~text
messages channel
    -> model/message representation of tool calls

tools channel
    -> execution lifecycle of tools
~~~

## Grammar boundary

Section 1.6A validates what the pinned binding can represent.

It does not yet establish:

~~~text
buffer retention
replay guarantees
delivery guarantees
duplicate behavior
transport mapping
reference implementation
Agent Server implementation mapping
~~~

Those require semantic and implementation investigation.

## 1.6A conclusion

The pinned LangChain Agent Streaming Protocol is a command / response / event
contract organized around:

~~~text
commands
subscriptions
namespaces
nested agent topology
HITL
state and checkpoints
fine-grained message streaming
tool execution streaming
reconnect coordinates
~~~

It is structurally distinct from the Agent Server REST resource model.

The next investigation must resolve subscription, ordering and replay semantics
and determine whether the event-payload typing gap is a property of the CDDL
contract or only of the generated Python binding.

---

# 1.6B — Subscription, replay and ordering semantics

## Historical source provenance

The `langchain-protocol 0.0.12` wheel and source distribution do not contain
the protocol CDDL.

The published 0.0.12 source distribution contains only the generated Python
binding and packaging files.

The Agent Protocol repository later received the Agent Streaming Protocol in
PR #72.

The PR explicitly migrated:

~~~text
protocol.cddl
generated Python bindings
generated TypeScript bindings
streaming documentation
~~~

into `langchain-ai/agent-protocol`.

The PR head used for the historical comparison was:

~~~text
4df82a5d0c1e20f5699b6146dc274d4d34240f7b
~~~

Its artifacts contain:

~~~text
streaming/protocol.cddl
    1155 lines

streaming/py/langchain_protocol/protocol.py
    556 lines
~~~

The migrated Python binding has SHA-256:

~~~text
24242db47c62d6487bcc61140b0f81b6920e0462e10965a8fd066365909f9652
~~~

The installed `langchain-protocol 0.0.12` binding has the same SHA-256.

A byte comparison returns:

~~~text
IDENTICAL
~~~

Therefore the Python binding shipped as 0.0.12 is byte-identical to the
binding migrated in PR #72.

The migrated CDDL already identifies itself as version 0.0.13, so it is not
described here as a file distributed inside the 0.0.12 package.

Instead, it is treated as the historical source-of-truth corresponding to the
exact grammar of the pinned 0.0.12 Python binding.

## Generation pipeline

The migrated repository defines:

~~~text
protocol.cddl
    |
    v
cddl2py 0.2.2
    |
    v
scripts/fixup.py
    |
    v
py/langchain_protocol/protocol.py
~~~

The same protocol source is also compiled into TypeScript.

The CDDL is validated independently before generation.

## Event payload typing

The CDDL strongly associates each event method with a structured payload.

For example:

~~~text
LifecycleEvent
    method = "lifecycle"

    params
        namespace
        timestamp
        data: LifecycleData
~~~

Likewise:

~~~text
MessagesEvent
    -> MessagesData

ToolsEvent
    -> ToolsData

InputEvent
    -> InputRequestedData

UpdatesEvent
    -> UpdatesData

CheckpointsEvent
    -> Checkpoint

CustomEvent
    -> CustomData
~~~

`ValuesEvent` and `TasksEvent` intentionally allow open runtime data.

The generated Python binding instead represents every event payload as:

~~~text
params: dict[str, Any]
~~~

The event-payload typing gap observed in section 1.6A is therefore a
generated-binding limitation rather than an untyped CDDL wire contract.

## Thread-centric routing model

The protocol identifies Thread as the primary durable routing key for:

~~~text
commands
events
subscriptions
state
checkpoints
run history
~~~

There is no protocol session handshake or durable server-side connection
session.

Threads may be client-generated or server-assigned.

A Thread can be created lazily on the first `run.input`.

The protocol therefore separates:

~~~text
Thread
    -> durable execution identity

connection
    -> ephemeral transport / observation scope
~~~

Multiple connections may observe the same Thread concurrently using independent
filters.

## Transport-specific subscription models

The protocol defines different subscription behavior for SSE/HTTP and
WebSocket.

### SSE / HTTP

A client opens:

~~~text
POST /threads/:thread_id/stream
~~~

with an `EventStreamRequest` containing:

~~~text
channels
namespaces?
depth?
since?
~~~

Each SSE connection is itself a subscription.

Closing the connection unsubscribes.

No logical subscription object is persisted beyond the connection lifetime.

Multiple SSE streams can observe the same Thread concurrently with independent
filters.

### WebSocket

A WebSocket connection uses in-band commands:

~~~text
subscription.subscribe
subscription.unsubscribe
subscription.reconnect
~~~

WebSocket subscriptions can persist across Run boundaries.

They are removed by:

~~~text
subscription.unsubscribe
~~~

or by closing the WebSocket connection.

Therefore the abstract concept of a subscription has transport-specific
realizations.

## Namespace filtering

Subscriptions select events through:

~~~text
channels
+
namespace prefixes
+
optional depth
~~~

Namespaces are hierarchical string paths.

A namespace filter performs prefix matching.

`depth` limits how far below the selected prefix matching may extend.

The filter is therefore structural rather than a simple exact namespace match.

## Event coordinates

The event envelope exposes two independent coordinates.

~~~text
eventId
    -> unique reconnection identity
    -> maps to SSE id

seq
    -> monotonic sequence number
    -> ordering
~~~

The specification does not state that:

~~~text
eventId == str(seq)
~~~

and clients must not assume that relationship.

## SSE replay

For SSE/HTTP, `EventStreamRequest.since` is a sequence number.

The server:

~~~text
1. reads the Thread event ring buffer;
2. selects events after the requested seq;
3. applies the current event filter;
4. replays matching events;
5. transitions to live delivery.
~~~

Thus:

~~~text
since = N
    -> replay matching events after seq N
~~~

Replay and filtering are applied together.

## WebSocket reconnect

WebSocket recovery uses:

~~~text
subscription.reconnect
    runId
    lastEventId?
    subscriptions?
~~~

The result may contain:

~~~text
restored
missedEvents?
currentNamespaces?
~~~

Therefore the two transport recovery coordinates are deliberately different:

~~~text
SSE
    -> seq / since

WebSocket
    -> eventId / lastEventId
~~~

## Event buffer lifecycle

The event buffer is an ephemeral Runtime structure.

When execution has completed and all relevant connections close, ephemeral
state such as:

~~~text
event buffer
run session
~~~

can be dropped.

The Thread and its durable checkpoint/state information remain.

Replay should therefore be understood as short-lived stream recovery rather
than durable event-log storage.

## Replay beyond the retained buffer

The historical streaming documentation states that servers may keep a recent
event ring buffer.

If a requested recovery point is no longer buffered, the server should indicate
that events were missed.

The client can then recover through durable state operations such as:

~~~text
state.get
state.listCheckpoints
~~~

This establishes two recovery layers:

~~~text
event buffer
    -> incremental stream recovery

state/checkpoints
    -> durable resynchronization
~~~

## Ordering guarantees

The CDDL explicitly defines `seq` as a monotonic sequence number used for
ordering.

Additional local ordering constraints exist.

### Message-local ordering

Content blocks within one message must not interleave.

Conceptually:

~~~text
block 0 start
block 0 delta*
block 0 finish

block 1 start
block 1 delta*
block 1 finish
~~~

A later content block cannot begin before the prior block finishes.

### Checkpoint / value correlation

A checkpoint event is emitted on the same superstep as its corresponding
values event.

Consumers can correlate them through:

~~~text
(namespace, step)
~~~

or through adjacent event sequence numbers.

## Delivery guarantees deliberately not established

The historical specification does not define:

~~~text
exactly-once delivery
at-least-once delivery
at-most-once delivery
duplicate suppression
ring-buffer capacity
ring-buffer TTL
global durable event retention
~~~

Therefore section 1.6B does not assign those semantics to the protocol.

This differs from the Agent Server SSE behavior empirically validated earlier
in Phase 1.

The two contracts must not be conflated.

## `appliedThroughSeq`

The historical CDDL defines:

~~~text
ResponseMeta
    appliedThroughSeq?
~~~

but does not attach a semantic comment to the field.

The historical README also shows it in an example response without defining its
precise acknowledgment semantics.

Its exact historical meaning is therefore recorded as:

~~~text
field existence
    -> validated

precise acknowledgment semantics
    -> not explicitly established
~~~

Current upstream documentation later describes the value as the latest event
sequence number applied before the corresponding command response.

That later clarification is useful protocol evolution context but is not
silently projected backward onto the pinned historical snapshot.

## 1.6B conclusion

The pinned protocol's subscription and replay model is:

~~~text
                         Thread
                      durable key
                           |
              +------------+------------+
              |                         |
              v                         v
          SSE / HTTP                WebSocket
              |                         |
 connection = subscription      in-band subscriptions
              |                         |
           since=seq               reconnect
              |                    lastEventId
              +------------+------------+
                           |
                           v
                    filtered event source
                           |
                           v
                    monotonic sequence
                           |
                           v
                      ring buffer
                           |
                 replay -> live delivery
~~~

Replay is explicitly part of the contract, but retention and delivery
guarantees are intentionally not inferred beyond what the historical
specification states.

The next block can focus on state, HITL and agent-topology semantics without
needing further subscription-model investigation.

---

# 1.6C — State, HITL and agent-topology semantics

## Namespace as execution identity

`Namespace` is a hierarchical path identifying a position in the live agent
tree.

Examples from the historical CDDL are:

~~~text
[]
    -> root agent

["agent_1"]
    -> direct child

["agent_1", "researcher"]
    -> nested child
~~~

Namespace is therefore more than a subscription filter.

It is reused as an addressing coordinate for:

~~~text
lifecycle
messages
tools
state
HITL
values
updates
checkpoints
agent topology
~~~

The resulting conceptual model is:

~~~text
Thread
└── Namespace []
    ├── ["researcher"]
    │   └── ["researcher", "critic"]
    └── ["planner"]
~~~

Thread remains the durable execution identity.

Namespace addresses a position inside that execution hierarchy.

## Namespace-scoped state

`state.get` accepts:

~~~text
namespace
keys?
~~~

and returns:

~~~text
values
checkpoint?
~~~

The protocol therefore addresses graph state relative to an execution
namespace.

The contract does not require treating each namespace as an independent storage
system; it defines namespace-scoped state addressing.

## State versus Store

The historical CDDL explicitly excludes cross-thread Store operations from the
streaming protocol.

Operations such as:

~~~text
search
put
~~~

are delegated to the LangGraph REST API.

The boundary remains:

~~~text
streaming protocol
    -> execution state / checkpoints

Agent Server REST API
    -> cross-thread Store
~~~

State and Store are distinct concepts.

## Checkpoint representations

The protocol exposes multiple checkpoint structures for different purposes.

### CheckpointRef

~~~text
id
ns?
~~~

A `CheckpointRef` is a lightweight pointer used by structures such as lifecycle
events.

### CheckpointSummary

`state.listCheckpoints` returns summaries containing:

~~~text
id
timestamp
step
nodeName?
metadata?
~~~

### Checkpoint event envelope

The `checkpoints` channel emits:

~~~text
id
parentId?
step
source
~~~

where:

~~~text
id
    -> fork target

parentId
    -> lineage/tree linkage

step
    -> timeline/superstep coordinate

source
    -> input | loop | update | fork
~~~

These structures are related but are not aliases.

## Namespace representation caveat

Protocol namespace paths use:

~~~text
Namespace = list[str]
~~~

while `CheckpointRef.ns` is:

~~~text
text
~~~

The historical contract does not define a conversion between them.

Clients must not assume that `CheckpointRef.ns` is a direct serialization of the
protocol `Namespace` path.

This difference reflects a boundary between portable protocol addressing and
checkpoint-specific identity.

## Values and checkpoint channels

The `values` channel carries full graph state snapshots.

When a values subscription is established, the first replayed values event is
the current full state and can serve as a baseline for subsequent deltas.

The `checkpoints` channel instead carries lightweight lineage metadata.

Conceptually:

~~~text
values
    -> state plane

checkpoints
    -> history / lineage plane
~~~

Clients interested in both state and time-travel topology can subscribe to both.

## Checkpoint lineage

Checkpoint events contain enough information to reconstruct a branching
timeline without streaming every full state snapshot.

~~~text
checkpoint
    id
    parentId?
    step
    source
~~~

The checkpoint ID is explicitly usable as a `state.fork` target.

`parentId` provides lineage linkage.

## `state.fork`

The State module describes checkpoint forking as time-travel debugging.

The command accepts:

~~~text
checkpointId
input?
config?
~~~

and returns:

~~~text
runId
threadId
~~~

The contract establishes a derived execution from the selected checkpoint.

It does not explicitly require the returned Thread ID to differ from the source
Thread ID.

Therefore the portable semantic conclusion is:

~~~text
state.fork
    -> fork execution from checkpoint
    -> identify resulting Run
    -> identify resulting Thread
~~~

without asserting a mandatory new-Thread policy.

## Three execution-input paths

The historical protocol contains three related but distinct input mechanisms.

### `run.input`

`run.input` is the generic Thread-level execution input.

The Thread execution state determines the behavior:

~~~text
no active Run
    -> start Run

interrupted Run
    -> resume using input as resume value

active Run
    -> inject input into running execution
~~~

It targets an Assistant and accepts arbitrary graph input.

### `input.respond`

`input.respond` is a correlated HITL response.

~~~text
namespace
interruptId
response
~~~

The server emits:

~~~text
input.requested
    namespace
    interruptId
    payload
~~~

and `interruptId` correlates the request with `input.respond`.

### `input.inject`

`input.inject` represents unsolicited namespace-targeted input while execution
is running.

~~~text
namespace

message
    role = user | system
    content
    name?
~~~

The three abstractions are therefore:

~~~text
run.input
    -> generic execution input

input.respond
    -> correlated interrupt response

input.inject
    -> unsolicited namespace-local input
~~~

The CDDL does not define an internal implementation delegation among those
commands.

## LangGraph-derived HITL semantics

The historical Input module explicitly describes itself as wrapping:

~~~text
LangGraph interrupt()
LangGraph Command({ resume })
~~~

into protocol messages.

The wire abstraction is portable, but this historical specification is not
framework-neutral in all of its conceptual vocabulary.

## Agent topology

The protocol models nested execution using two complementary mechanisms.

### Lifecycle stream

The lifecycle channel tracks status for every namespace in the agent tree.

A `started` event can contain an optional `cause` linking the child namespace to
the event or construct that triggered it on the parent.

This allows clients to incrementally reconstruct nested execution topology from
the wire stream.

### `agent.getTree`

The command:

~~~text
agent.getTree
    runId?
~~~

returns a recursive:

~~~text
AgentTreeNode
    namespace
    status
    graphName
    children?
    metadata?
~~~

The lifecycle stream therefore provides incremental topology observation while
`agent.getTree` provides an explicit recursive topology snapshot.

The protocol does not require a particular internal implementation for
materializing that snapshot.

## Lifecycle states

Agent topology uses:

~~~text
started
running
completed
failed
interrupted
~~~

These statuses apply to namespace nodes in the execution tree rather than to
persistent Assistant resources.

## Lifecycle causation

A lifecycle `cause` explains how a parent execution spawned a child namespace.

The historical variants are:

~~~text
toolCall
send
edge
~~~

### `toolCall`

A parent tool call invokes a compiled subgraph.

The cause contains:

~~~text
toolCallId
~~~

which correlates with:

~~~text
tools channel
    tool-started.toolCallId

messages channel
    tool_call.id
~~~

This creates a cross-channel causal relationship:

~~~text
AI message tool call
        |
        v
tool execution
        |
        v
child agent/subgraph
~~~

### `send`

`send` represents LangGraph fan-out via:

~~~text
Send(node, state)
~~~

Each Send creates a parallel Pregel task and may spawn a subgraph execution.

The protocol records:

~~~text
fromNode
~~~

Multiple Sends from the same node in one superstep share this value, so the
historical representation does not uniquely identify each individual Send.

The CDDL notes that a future protocol could add a `sendIndex`.

### `edge`

`edge` represents a static or conditional graph edge entering a node that embeds
a compiled subgraph.

Unlike `Send`, the described edge transition is single-successor and does not
fan out.

It records:

~~~text
fromNode
~~~

## Optional causation

`cause` is optional.

It may be absent for:

~~~text
root graph
unmodelled spawning mechanisms
~~~

A consumer therefore cannot require every child namespace to include a complete
causal edge.

## Implementation coverage of causation

The historical CDDL separates protocol declaration from producer support.

~~~text
toolCall
    -> populated by product-specific transformer
       e.g. DeepAgents SubagentTransformer

send
    -> declared
    -> no transformer in the referenced releases

edge
    -> declared
    -> no transformer in the referenced releases
~~~

The CDDL further states that LangGraph core and `langgraph-api` are
product-agnostic and do not populate the cause field themselves.

The protocol surface is therefore broader than the implementation coverage in
the historical stack.

## Forward compatibility

Lifecycle causes are extensible.

Consumers MUST default-case unknown cause variants to an unknown-cause behavior
rather than fail.

This is a normative forward-compatibility rule.

## Normative-language boundary

The historical CDDL contains very little explicit normative language.

The observed requirements include:

~~~text
SHOULD NOT
    place large nested runtime/debug payloads in message metadata

MUST
    tolerate unknown lifecycle-cause variants

MUST NOT
    interleave content blocks inside one message
~~~

Most State, HITL and topology comments therefore describe protocol semantics
rather than a comprehensive RFC-style conformance regime.

## Portable versus LangGraph-derived semantics

The historical contract combines portable wire abstractions with concepts
derived directly from LangGraph.

Portable protocol abstractions include:

~~~text
hierarchical namespaces
state reads
checkpoint references
execution forks
HITL request/response correlation
unsolicited input injection
lifecycle states
nested execution topology
causal parent-child relationships
~~~

LangGraph-derived vocabulary includes:

~~~text
interrupt()
Command(resume)
Send(node, state)
Pregel tasks and supersteps
CheckpointMetadata.source
configurable.checkpoint_id
LangGraph REST Store boundary
~~~

Product-specific enrichment includes:

~~~text
DeepAgents SubagentTransformer
    -> toolCall lifecycle cause

future transformers
    -> send
    -> edge
~~~

The historical Agent Streaming Protocol should therefore be understood as a
portable wire contract whose execution semantics remain closely aligned with
the LangGraph runtime model.

## 1.6C conclusion

The protocol models a Thread as a durable execution identity containing a
hierarchical namespace tree.

~~~text
                              Thread
                                |
                                v
                         Namespace tree
                                |
              +-----------------+-----------------+
              |                 |                 |
              v                 v                 v
            State              HITL            Lifecycle
              |                 |                 |
        state.get        input.requested      agent status
        checkpoints             |                 |
        state.fork              v                 v
                         input.respond           cause
                         input.inject             |
                                                  v
                                           parent -> child
                                                  |
                                        +---------+--------+
                                        |         |        |
                                    toolCall     send     edge

                                +
                                |
                                v

                          agent.getTree
                     explicit tree snapshot
~~~

This completes the State, HITL and topology contract analysis.

The remaining section 1.6D can focus on transport implementation, mapping to the
pinned Agent Server stack, and protocol evolution.

