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

---

# 2.2B — SSE transport client

## Objective

Implement the browser-facing Agent Server SSE transport without integrating it
into React execution state.

The implementation preserves the layering established in 2.2A:

~~~text
network bytes
    |
    v
SSE framing
    |
    v
Agent Server stream event
    |
    v
future semantic projection
~~~

The transport layer does not create frontend Message, Run or ThreadState domain
objects from streaming events.

## SSE framing layer

The generic SSE parser is implemented in:

~~~text
apps/web/src/transport/agent-server/sse.ts
~~~

Its output contract is:

~~~text
SseEvent
    id
    event
    data
    retry
~~~

The parser has no Agent Server, LangGraph or React dependency.

## Byte-stream model

The parser consumes:

~~~text
ReadableStream<Uint8Array>
~~~

through:

~~~text
reader.read()
    |
    v
TextDecoder.decode(..., stream=true)
    |
    v
text accumulator
    |
    v
line parser
    |
    v
SSE field accumulator
    |
    v
blank-line dispatch
~~~

Streaming TextDecoder mode is required because UTF-8 code points may be split
across arbitrary network chunks.

## SSE line endings and chunk boundaries

The parser explicitly accepts:

~~~text
LF
CRLF
CR
~~~

Network chunks do not need to align with lines.

The deterministic torture test delivered one byte per stream chunk, forcing
boundaries inside:

~~~text
field names
field values
line endings
UTF-8 multibyte sequences
~~~

## SSE data fields

Multiple SSE data fields are joined with LF.

Observed deterministic example:

~~~text
data: first
data: segundo 🙂

    ->

first
segundo 🙂
~~~

This happens before Agent Server JSON decoding.

## Comments and unknown SSE fields

Lines beginning with:

~~~text
:
~~~

are treated as SSE comments and ignored.

Unknown framing fields are also ignored.

These are generic SSE behaviors rather than Agent Server semantics.

## SSE event ID state

The parser maintains the SSE last-event-ID buffer across events.

An event without an explicit `id` can therefore inherit the previous effective
ID.

The deterministic test validated:

~~~text
event alpha
id = 42

event beta
no explicit id
effective id = 42
~~~

An ID containing U+0000 is ignored.

An explicit empty ID:

~~~text
id:
~~~

updates the effective ID to the empty string.

These semantics will matter in the later replay experiments.

## Retry fields

A numeric SSE retry field is parsed and exposed on SseEvent.

Invalid retry values are ignored.

The parser deliberately does not implement reconnect timing.

Reconnect policy belongs to a higher layer.

## EOF policy

The fetch-based parser implements an explicit robustness policy:

~~~text
EOF
+
pending data fields
+
no final blank line

    -> dispatch pending event
~~~

This is a client policy for the custom fetch-based transport.

It must not be confused with assumptions about native browser EventSource
behavior.

## Agent Server stream-event layer

Agent Server event decoding is implemented separately in:

~~~text
apps/web/src/transport/agent-server/stream-events.ts
~~~

The decoder receives an already-framed:

~~~text
SseEvent
~~~

and attempts to decode its data as JSON.

Its output distinguishes:

~~~text
known
unknown
malformed-json
~~~

## Known event families

The initial known set is based on direct pinned-Runtime observation:

~~~text
metadata
checkpoints
values
updates
messages/metadata
messages/partial
~~~

This list is intentionally not treated as exhaustive for future Agent Server
versions or additional stream modes.

## Unknown event preservation

Unknown Agent Server event families do not fail the stream.

Validated example:

~~~text
event: future/event
data: {"future":1}
~~~

is preserved as:

~~~text
kind = unknown
event = future/event
~~~

with its parsed JSON data.

This preserves forward compatibility.

## Malformed JSON preservation

JSON decoding failure does not destroy SSE framing or terminate the connection.

Validated example:

~~~text
event: updates
data: {not-json}
~~~

becomes:

~~~text
kind = malformed-json
event = updates
rawData = {not-json}
~~~

This establishes:

~~~text
valid SSE framing
    !=
valid Agent Server JSON
~~~

## Type narrowing

Known event names are narrowed through:

~~~text
isKnownAgentServerStreamEvent(...)
~~~

instead of a manual type assertion inside the returned object.

An initial line-broken `as` assertion exposed a Vite/Rolldown syntax failure.

The type guard removes that ambiguity and makes the narrowing explicit.

## AgentServerClient integration

The existing AgentServerClient now exposes:

~~~text
streamRun(...)
~~~

The method reuses the same private HTTP request machinery as the REST client.

Streaming therefore inherits:

~~~text
base URL normalization
fetch injection
credentials
JSON request behavior
HTTP status validation
AgentServerHttpError
~~~

No parallel HTTP client was introduced.

## Stream request contract

The client sends:

~~~text
POST /threads/{thread_id}/runs/stream
~~~

with:

~~~text
Accept: text/event-stream
Content-Type: application/json
~~~

Frontend names are mapped to the wire boundary:

~~~text
assistantId
    -> assistant_id

multitaskStrategy
    -> multitask_strategy

streamMode
    -> stream_mode

streamResumable
    -> stream_resumable

streamSubgraphs
    -> stream_subgraphs

onDisconnect
    -> on_disconnect
~~~

Snake-case wire names therefore remain outside the frontend domain.

## AbortSignal boundary

StreamRunInput accepts:

~~~text
signal?: AbortSignal
~~~

The signal is passed directly to fetch and is not serialized into JSON.

Two independent controls therefore exist:

~~~text
AbortSignal
    = local transport/request cancellation

on_disconnect
    = Runtime behavior after connection loss
~~~

These concepts must not be collapsed.

## Successful-response validation

After normal HTTP status validation, streamRun verifies:

~~~text
Content-Type starts with text/event-stream
~~~

and:

~~~text
Response.body != null
~~~

An invalid successful-response envelope becomes:

~~~text
AgentServerDecodeError
~~~

rather than AgentServerHttpError.

## HTTP versus decoding errors

The deterministic envelope test established:

~~~text
HTTP 500
    -> AgentServerHttpError

HTTP 200
Content-Type: application/json
    -> AgentServerDecodeError
       path = RunStream.response.content-type
~~~

Failures therefore remain classified according to the layer that detected them.

## AsyncGenerator surface

The public transport exposes:

~~~text
AsyncGenerator<AgentServerStreamEvent>
~~~

Conceptually:

~~~text
for await (event of client.streamRun(...))
~~~

Each yielded object is an Agent Server transport event.

It is not yet a frontend semantic event.

## Deterministic client validation

A fake-fetch harness validated:

~~~text
URL encoding
POST method
credentials propagation
AbortSignal propagation
Accept header
Content-Type header
assistant_id mapping
multitask_strategy mapping
stream_mode mapping
stream_resumable mapping
stream_subgraphs mapping
on_disconnect mapping
known event decoding
unknown event preservation
~~~

The validated URL was:

~~~text
http://runtime.test/threads/thread%2Ftest/runs/stream
~~~

## Framing torture test

The parser validation exercised:

~~~text
one byte per network chunk
UTF-8 multibyte splitting
LF
CRLF
CR
comments
unknown SSE fields
multi-line data
valid retry
invalid retry
last-event-ID inheritance
NUL-containing ID
empty ID
known Agent Server event
unknown Agent Server event
malformed JSON
EOF without final blank line
~~~

Observed result:

~~~text
events: 9
multiline: "first\nsegundo 🙂"
utf8: true
inherited id: 42
unknown family: unknown future/event
malformed JSON: malformed-json
EOF flush: final

PASS: SSE transport framing
~~~

## Live Runtime validation

The new transport was also validated directly against the pinned Agent Server.

A new Thread and stateful streaming Run were created through AgentServerClient.

The live stream produced:

~~~text
checkpoints          7
messages/metadata    1
messages/partial     7
metadata             1
updates              5
values               3
~~~

The metadata event supplied the Runtime Run ID.

The final persisted ThreadState contained:

~~~text
graph next = []

checkpoint = present

values keys:
    memory_contents
    messages
    skills_metadata
~~~

The stream client therefore consumed the real pinned Runtime wire and could
subsequently reconcile persisted state through the existing REST surface.

## Partial-message count is not stable

The 2.2A Run produced:

~~~text
messages/partial = 6
~~~

The independent 2.2B smoke test produced:

~~~text
messages/partial = 7
~~~

Both represented a very small model answer.

Therefore:

~~~text
number of messages/partial events
    != stable protocol contract
~~~

The frontend must never depend on a fixed number of partial snapshots.

## Architecture validation

After adding streaming transport, searches confirmed no streaming dependency in:

~~~text
src/domain
src/app
src/components
src/execution
~~~

The architecture therefore remains:

~~~text
React / execution
      |
      | still REST polling
      v
AgentServerClient
      |
      +---- REST resources
      |
      +---- SSE transport
                |
                v
        Agent Server stream
~~~

The capability now exists, but the UI has not adopted it.

## Quality gates

The implementation passes:

~~~text
oxlint
    0 warnings
    0 errors

TypeScript
    PASS

Vite production build
    PASS
~~~

## 2.2B conclusion

A robust SSE transport client now exists independently from React and semantic
frontend projection.

The implemented pipeline is:

~~~text
fetch POST
    |
    v
ReadableStream<Uint8Array>
    |
    v
TextDecoder
    |
    v
SSE framing parser
    |
    v
SseEvent
    |
    v
Agent Server event decoder
    |
    v
AgentServerStreamEvent
~~~

The following invariants remain preserved:

~~~text
SSE framing != Agent Server semantics

Agent Server stream event != frontend domain entity

unknown events do not break the stream

malformed JSON does not break SSE framing

HTTP failure != successful-response decode failure

AbortSignal != Runtime on_disconnect policy

stream observation != persisted state
~~~

The next sub-block is:

~~~text
2.2C — Live Run streaming integration
~~~

That step will replace REST polling as the primary live Run observation
mechanism while retaining explicit final Run and ThreadState reconciliation.
