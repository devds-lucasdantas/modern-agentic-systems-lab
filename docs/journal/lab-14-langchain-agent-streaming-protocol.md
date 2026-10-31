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
