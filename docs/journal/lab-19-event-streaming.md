# Lab 19 — Event Streaming

## Context

Section 2.1 established a complete pre-streaming frontend control
implementation.

The control path is:

~~~text
create stateful Run
    |
    v
poll GET Run every ~500 ms
    |
    v
terminal Run lifecycle
    |
    v
GET ThreadState
    |
    v
persisted reconciliation
~~~

Lab 19 replaces that live-observation mechanism incrementally while preserving
all Runtime identity, lifecycle and persistence semantics established during
Phase 1 and section 2.1.

The pinned Runtime remains:

~~~text
langgraph-api              0.8.1
langgraph-runtime-inmem    0.28.0
langgraph                  1.1.9
~~~

---

# 2.2A — Pinned streaming contract discovery

## Objective

Observe the pinned Agent Server streaming wire contract directly before
introducing a browser streaming client.

The experiment must determine:

~~~text
streaming endpoints
request schema
response media type
SSE framing
event families
event identifiers
message behavior
checkpoint behavior
persistence reconciliation
disconnect controls
~~~

No frontend streaming abstraction is introduced during this discovery step.

---

## Streaming endpoints

The pinned OpenAPI exposes the following relevant streaming and join surfaces:

~~~text
POST /runs/stream

POST /threads/{thread_id}/runs/stream

GET /threads/{thread_id}/runs/{run_id}/join

GET /threads/{thread_id}/runs/{run_id}/stream

GET /threads/{thread_id}/stream
~~~

The first frontend experiment uses:

~~~text
POST /threads/{thread_id}/runs/stream
~~~

because it creates a stateful Run and begins streaming in the same request.

The successful response media type is:

~~~text
text/event-stream
~~~

---

## Stateful streaming request schema

The POST streaming endpoint uses:

~~~text
RunCreateStreamingStateful
~~~

The schema is defined through OpenAPI `allOf` composition:

~~~text
RunCreateStreamingStateful
    =
RunCreateStateful
    +
on_disconnect
~~~

The streaming wrapper itself contains no independent required-field list.

That does not remove inherited constraints.

`RunCreateStateful` still requires:

~~~text
assistant_id
~~~

Therefore `assistant_id` remains effectively required for the composed
streaming request.

---

## Streaming-only request field

The only streaming-specific field discovered in the composed schema is:

~~~text
on_disconnect
~~~

Allowed values:

~~~text
continue
cancel
~~~

Default:

~~~text
continue
~~~

This separates connection lifecycle policy from graph execution semantics.

The initial streaming baseline retains:

~~~text
on_disconnect = continue
~~~

The `cancel` behavior is intentionally deferred to the dedicated disconnect and
reconnect experiment.

---

## Experimental Run

A dedicated Thread was created with metadata:

~~~text
lab = 2.2A
purpose = stream-contract-discovery
~~~

The Run used a deterministic input:

~~~text
Reply with exactly STREAM_OK and nothing else.
Do not call any tools.
~~~

Requested stream modes:

~~~text
updates
values
messages
checkpoints
~~~

and:

~~~text
stream_resumable = true
~~~

The Run completed successfully.

---

## Response headers

The POST streaming request returned HTTP 200 with:

~~~text
content-type:
    text/event-stream; charset=utf-8

cache-control:
    no-store

connection:
    keep-alive

x-accel-buffering:
    no

transfer-encoding:
    chunked
~~~

The response also exposed:

~~~text
location:
    /threads/{thread_id}/runs/{run_id}/stream

content-location:
    /threads/{thread_id}/runs/{run_id}
~~~

The two headers therefore identify different concepts:

~~~text
Location
    -> stream surface

Content-Location
    -> Run resource
~~~

These values will be revisited during reconnect and replay experiments.

---

## SSE framing

The observed stream follows standard field-oriented SSE framing:

~~~text
event: <event type>
data: <JSON payload>
id: <event id>

<blank line>
~~~

All 23 observed events contained an `id`.

The payload was delivered as a chunked HTTP response.

The future browser client must therefore parse:

~~~text
byte stream
    |
    v
UTF-8 text
    |
    v
lines
    |
    v
SSE fields
    |
    v
event records
~~~

before applying any Agent Server semantics.

---

## Observed event families

The first Run produced:

~~~text
metadata              1
checkpoints            7
values                 3
updates                5
messages/metadata      1
messages/partial       6
~~~

Total:

~~~text
23 SSE events
~~~

The stream therefore contains more than graph state or message tokens.

It simultaneously exposes:

~~~text
Run metadata
graph checkpoints
state snapshots
node updates
model metadata
partial model messages
~~~

These must not be collapsed into one generic frontend event type.

---

## Metadata emission

The request did not include `metadata` in `stream_mode`.

Nevertheless, the first SSE event was:

~~~text
event: metadata
~~~

with:

~~~text
run_id
attempt
~~~

Therefore the pinned Runtime emits Run metadata as part of the stream envelope
independently from the explicitly requested graph stream modes.

The client must not assume:

~~~text
requested stream modes
    =
complete set of emitted event types
~~~

Unknown or additional event families must remain tolerable.

---

## Event IDs are not unique event identities

The stream contained:

~~~text
23 events
21 unique SSE IDs
~~~

Two event IDs were reused.

Examples included:

~~~text
same id
    values
    checkpoints

same id
    updates
    checkpoints
~~~

Therefore:

~~~text
SSE id
    !=
unique semantic event identity
~~~

A client must not deduplicate solely by:

~~~text
event.id
~~~

At minimum the event family is also significant.

The reconnect experiments must determine whether even:

~~~text
(id, event type)
~~~

can repeat during replay.

---

## Checkpoint stream events

A checkpoint event contains:

~~~text
config
parent_config
values
metadata
next
tasks
~~~

The configuration includes Runtime identities such as:

~~~text
run_id
thread_id
graph_id
assistant_id
checkpoint_id
checkpoint_ns
~~~

Checkpoint events therefore expose a rich graph execution projection.

They remain streaming observations.

They do not replace the persisted ThreadState authority.

---

## Values events

Observed `values` events expose graph-state snapshots.

The first values event contained the persisted human message.

Later values events contained progressively richer graph state.

The final values event contained both:

~~~text
human message

AI message:
    STREAM_OK
~~~

This is snapshot-style state observation, not a domain-specific message event.

---

## Updates events

Observed `updates` events represented node-level changes such as:

~~~text
SkillsMiddleware.before_agent

PatchToolCallsMiddleware.before_agent

MemoryMiddleware.before_agent

model

TodoListMiddleware.after_model
~~~

An update event may contain message-related state, but its semantics are still:

~~~text
graph update
~~~

rather than:

~~~text
frontend Message
~~~

The client must preserve this distinction.

---

## Message metadata

Before partial model messages, the stream emitted:

~~~text
messages/metadata
~~~

The payload is keyed by the model message / LangChain run identity.

Observed metadata included:

~~~text
graph_id
assistant_id
thread_id
run_id
run_attempt
langgraph_step
langgraph_node
checkpoint namespace
model provider
model name
~~~

This metadata can later help associate live message snapshots with execution
context.

It remains transport-level data until explicitly normalized.

---

## Partial messages are cumulative snapshots

Observed `messages/partial` content evolved approximately as:

~~~text
""

"STREAM"

"STREAM_OK"

"STREAM_OK"

"STREAM_OK"

"STREAM_OK"
~~~

The same AI message ID was retained across the sequence.

Later snapshots progressively added:

~~~text
finish_reason
model_name
service_tier
usage_metadata
~~~

Therefore:

~~~text
messages/partial
    != token delta
~~~

The frontend must not implement:

~~~text
text += event.content
~~~

Instead the event behaves as a progressively enriched snapshot of the same
message identity.

A future live-message projector should replace or merge the latest snapshot for
the same message identity.

---

## Persisted state after streaming

After the SSE connection completed, the Thread persisted:

~~~text
Run status:
    success

ThreadState.next:
    []

checkpoint:
    present

messages:
    human input
    AI STREAM_OK
~~~

The final persisted values therefore converge with the final state observed in
the stream.

---

## Checkpoint reconciliation

The last streamed checkpoint represented:

~~~text
next = []
~~~

and contained the final human and AI messages.

The subsequent persisted ThreadState also contained:

~~~text
next = []

same final conversation state
~~~

This establishes the initial reconciliation model:

~~~text
stream
    = temporary live observation

ThreadState
    = persisted authority
~~~

The frontend must reconcile against persisted state after stream completion,
reconnection or uncertainty.

---

## Stream versus persistence

The architecture therefore must not become:

~~~text
SSE event
    |
    v
setMessages(...)
    |
    v
authoritative state
~~~

Instead:

~~~text
SSE
    |
    v
temporary live projection
    |
    v
user-visible progress

and independently

Agent Server
    |
    v
ThreadState
    |
    v
persisted reconciliation
~~~

---

## Initial transport implication

Because the stateful Run streaming endpoint requires:

~~~text
POST
application/json request body
~~~

the first transport implementation should not use browser EventSource as its
creation primitive.

The expected implementation is:

~~~text
fetch(POST)
    |
    v
Response.body
    |
    v
ReadableStream<Uint8Array>
    |
    v
TextDecoder
    |
    v
SSE framing parser
~~~

This also gives explicit control over:

~~~text
request body
headers
AbortSignal
response status
stream reader lifecycle
future replay headers
~~~

---

## Disconnect baseline

The streaming request schema adds:

~~~text
on_disconnect
~~~

with default:

~~~text
continue
~~~

The baseline therefore means:

~~~text
client disconnect
    != automatically cancel Run
~~~

unless the caller explicitly requests:

~~~text
on_disconnect = cancel
~~~

Disconnect lifecycle behavior will be tested separately rather than assumed.

---

## Resumability

The experiment enabled:

~~~text
stream_resumable = true
~~~

and every observed event carried an SSE ID.

This is sufficient evidence to proceed with replay experiments later.

It is not yet sufficient to define reconnect semantics.

The remaining questions include:

~~~text
which URL is used for replay?

how is Last-Event-ID interpreted?

does replay include metadata?

can the same (id, event) pair be delivered again?

what boundary is inclusive or exclusive?

how does replay behave after Run completion?
~~~

These belong to section 2.2E.

---

## Invariants established by 2.2A

The following are now evidence-backed constraints for the frontend stream
client:

~~~text
SSE framing != Agent Server event semantics

SSE id != unique semantic event identity

metadata can appear outside requested stream modes

messages/partial is cumulative snapshot data

stream observation != persisted ThreadState

checkpoint stream data != persisted checkpoint authority

disconnect policy is explicit

unknown event families must remain tolerable
~~~

---

## 2.2A conclusion

The pinned Agent Server streaming wire contract has been observed directly.

The frontend can now proceed to a transport implementation without guessing
about:

~~~text
HTTP method
media type
SSE framing
event families
message semantics
event IDs
Run identity
checkpoint shape
disconnect control
persisted reconciliation
~~~

The next sub-block is:

~~~text
2.2B — SSE transport client
~~~

Its first responsibility is transport framing only:

~~~text
bytes
    -> text
    -> SSE record
~~~

before any mapping into Agent Server stream-event families.
