# Lab 15 — MCP interoperability

## Objective

Study MCP as an interoperability projection over the pinned Agent Server.

This lab distinguishes:

~~~text
MCP specification semantics
LangGraph MCP adapter semantics
Agent Server Runtime semantics
~~~

The pinned implementation is `langgraph-api 0.8.1`.

## 1.7A — Protocol and capability inventory

The pinned MCP adapter is implemented as a small package under:

~~~text
langgraph_api.api.mcp
~~~

with six Python modules and approximately 595 lines.

It supports the handshake-era protocol versions:

~~~text
2024-11-05
2025-03-26
2025-06-18
2025-11-25
~~~

and negotiates unsupported requested versions to the latest supported value,
`2025-11-25`.

The implemented JSON-RPC request methods are:

~~~text
initialize
ping
tools/list
tools/call
~~~

The initialize response advertises only the MCP `tools` capability with
`listChanged = false`.

Resources and Prompts are not implemented.

The adapter is feature-gated by the Agent Server `disable_mcp` configuration.

## Transport model

The `/mcp` route accepts:

~~~text
POST
GET
DELETE
~~~

but only POST performs useful protocol work.

~~~text
POST
    -> JSON-RPC request/response

GET
    -> 405
    -> event-stream resumption unsupported

DELETE
    -> 404
    -> no MCP session exists
~~~

The implementation is stateless and does not use `Mcp-Session-Id`.

`Accept: text/event-stream` passes request validation but does not select an SSE
response: the server still returns `application/json`.

JSON-RPC notifications such as `notifications/initialized` are transport-
accepted with HTTP 202 but do not have method-specific semantic handling.

## 1.7B — Assistant-as-Tool projection

`tools/list` maps Agent Server Assistants into MCP Tools.

The observed discovery path is:

~~~text
POST /mcp
    |
    v
POST /assistants/search
    |
    v
GET /assistants/{assistant_id}/schemas
    |
    v
schema adaptation
    |
    v
MCP Tool
~~~

The adapter normalizes Assistant names into MCP-compatible tool names and keeps
the original Assistant name as the tool title.

LangChain message definitions are removed from the native Graph input schema.
Message-array inputs are simplified into an LLM-friendly string field.

Application-specific definitions such as `FileData` remain available.

The live `deep_agent` projection exposes:

~~~text
name
    deep_agent

messages
    string

files
    optional structured mapping
~~~

The Tool annotations do not promise read-only, destructive, or idempotent
behavior and set `openWorldHint = true`.

## 1.7C — Runtime execution and persistence semantics

`tools/call` performs the inverse projection.

~~~text
MCP Tool name
    |
    v
Assistants.search
    |
    v
normalized-name resolution
    |
    v
assistant_id
    |
    v
runs.wait(
    thread_id=None,
    assistant_id=...,
    input=...
)
~~~

Live execution proves that `thread_id=None` does not mean execution without a
Thread.

The Runtime creates a real temporary Thread and a real temporary Run.

~~~text
MCP tools/call
    |
    v
temporary Thread
    |
    v
temporary Run
    |
    v
Runtime queue
    |
    v
Graph
    |
    v
model
~~~

The Run is marked `temporary=True`.

A before/after Thread search remained at 29 persistent Threads with no added
Thread after completion.

The stateless MCP interface is therefore implemented over temporary stateful
Runtime primitives.

The execution uses the normal Agent Server queue and background worker.

The observed request executed the registered `deep_agent`, performed one model
call, and completed successfully.

## Result projection

The MCP adapter does not return only the assistant text.

The Graph final value is converted with:

~~~text
repr(value)
~~~

and placed into one MCP text content item.

For the test request whose model answer was:

~~~text
MCP_OK
~~~

the MCP result instead contained the serialized representation of the complete
final Graph state, including both Human and AI messages and model metadata.

The adapter therefore performs lossy adaptation in both directions:

~~~text
native Graph input schema
    -> simplified MCP input schema

native Graph output value
    -> repr(value)
    -> MCP TextContent
~~~

## Error layers identified from source

The adapter separates:

~~~text
HTTP / transport validation errors
JSON-RPC protocol errors
MCP Tool execution errors
~~~

Transport validation errors use HTTP errors and a simple JSON error body.

Unknown JSON-RPC methods use `-32601`.

Invalid Tool identifiers use `-32602`.

Runtime execution failures are projected as a successful JSON-RPC result whose
MCP Tool result contains `isError = true`.

The runtime-failure path was also tested empirically.

A valid `tools/call` using the registered `deep_agent` but supplying:

~~~json
{"messages": 123}
~~~

passed MCP dispatch and Assistant resolution.

The Runtime then created a temporary Thread and temporary Run, queued the Run,
and failed during initial LangGraph message coercion before reaching the model
node.

The underlying failure was:

~~~text
NotImplementedError
Unsupported message type: <class 'int'>
MESSAGE_COERCION_FAILURE
~~~

No model request was made.

Despite the failed Run:

~~~text
POST /runs/wait
    -> HTTP 200

POST /mcp
    -> HTTP 200
~~~

The MCP response was:

~~~text
result
    isError = true
    content
        text = "NotImplementedError"
~~~

This confirms the third error layer:

~~~text
transport failure
    -> HTTP error

JSON-RPC / adapter failure
    -> JSON-RPC error

Tool / Runtime failure
    -> successful JSON-RPC response
    -> MCP Tool result with isError = true
~~~

The error projection is lossy: detailed Runtime exception information remains
in server logs while the MCP Tool result exposes only a short textual error.

Temporary execution cleanup also occurs on failure. A before/after Thread
inventory remained at 29 persistent Threads with no new Thread retained.

## 1.7D — Error projection, identity edge cases and protocol evolution

### Three error layers

Live tests confirmed three distinct failure layers:

~~~text
transport validation failure
    -> HTTP 400
    -> simple JSON error body

JSON-RPC / adapter failure
    -> HTTP 200
    -> JSON-RPC error

Tool / Runtime execution failure
    -> HTTP 200
    -> JSON-RPC result
    -> MCP Tool result with isError = true
~~~

An unknown Tool name returned JSON-RPC `-32602` without creating a Run.

Malformed JSON and an unsupported Accept header failed at the HTTP transport
layer with HTTP 400.

A valid `deep_agent` Tool invocation with `messages = 123` created a temporary
Thread and Run, then failed during LangGraph message coercion before the model
node.

The Run failure was projected as:

~~~text
result.isError = true
content[0].text = "NotImplementedError"
~~~

The server logs retained the detailed MESSAGE_COERCION_FAILURE while the MCP
response exposed only the exception class, so error projection is lossy.

The failed temporary execution was cleaned up and did not leave a persistent
Thread.

### Empty normalized Tool name

A temporary Assistant named:

~~~text
🔥🔥🔥
~~~

normalized to the empty string.

`tools/list` nevertheless advertised:

~~~text
name  = ""
title = "🔥🔥🔥"
~~~

but `tools/call` with an empty name returned JSON-RPC `-32602`.

The discovery surface can therefore expose a Tool that the invocation surface
cannot address.

### Normalized-name collision

Two temporary Assistants named:

~~~text
MCP Collision
MCP   Collision
~~~

both normalized to:

~~~text
MCP_Collision
~~~

`tools/list` detected the duplicate normalized name, logged a warning and
published only one Tool.

`tools/call` used a different resolution policy: it searched all Assistants,
found both normalized matches and returned:

~~~text
-32602
Multiple tools found with the same name.
~~~

Discovery therefore silently deduplicates while invocation rejects ambiguity.

No Thread or Run was created for either identity edge case.

All temporary Assistant fixtures were deleted after the experiment.

### Pinned MCP versus the modern protocol

The pinned adapter targets the handshake-era MCP revisions:

~~~text
2024-11-05
2025-03-26
2025-06-18
2025-11-25
~~~

The current MCP specification revision is `2026-07-28`.

The modern revision introduces a stateless protocol core.

Major lifecycle changes include:

~~~text
2025 era
    initialize / initialized
    optional protocol sessions
    Mcp-Session-Id
    capabilities negotiated at initialization

2026-07-28
    no initialize handshake
    no protocol-level session
    no Mcp-Session-Id
    optional server/discover
    protocol/client metadata carried per request
~~~

Modern Streamable HTTP also introduces request-routing headers such as
`Mcp-Method` and `Mcp-Name`.

Multi Round-Trip Requests replace interaction patterns that depended on
long-lived bidirectional request flows.

List responses gain explicit cache semantics.

Tasks move from an experimental core capability into an extension.

Tool schemas move to full JSON Schema 2020-12 semantics.

The pinned LangGraph adapter was already stateless by implementation policy even
though it belongs to the older handshake-era protocol. The modern protocol
makes statelessness a property of the core wire contract itself.

### Protocol semantics versus adapter policy

Portable MCP concepts include:

~~~text
JSON-RPC
Tools
tools/list
tools/call
Tool schemas
Tool results
isError
protocol lifecycle and transport rules
~~~

LangGraph-specific projection policy includes:

~~~text
Assistant -> Tool
Assistant name normalization
LangChain message-schema simplification
Assistants.search for discovery
Assistants.search for invocation resolution
runs.wait(thread_id=None)
temporary Runtime Thread and Run
repr(final_graph_value) -> MCP TextContent
Runtime exception -> simplified MCP error text
normalized-name deduplication and ambiguity policy
~~~

The MCP adapter is therefore best modeled as a projection over the Agent Server
service boundary, not as a second execution architecture.

## Current conclusion

The pinned Agent Server MCP surface is a stateless, Tools-only interoperability
projection over Assistants and Runs, not an alternate execution engine.

~~~text
MCP consumer
    -> Tool abstraction

MCP adapter
    -> Assistant + Run projection

Agent Server Runtime
    -> temporary Thread + Run + queue + Graph execution
~~~

Section 1.7 is complete.

The next Phase 1 block is section 1.8 — A2A.
