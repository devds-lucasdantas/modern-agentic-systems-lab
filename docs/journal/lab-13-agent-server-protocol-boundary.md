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
