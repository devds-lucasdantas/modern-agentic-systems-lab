# Lab 16 — A2A interoperability

## Objective

Study A2A as a stateful interoperability projection over the pinned Agent
Server.

The analysis distinguishes:

~~~text
portable A2A protocol semantics
LangGraph A2A adapter policy
Agent Server Runtime semantics
~~~

The pinned implementation is `langgraph-api 0.8.1`.

## 1.8A — Protocol, adapter and projection inventory

The A2A adapter is implemented directly in:

~~~text
langgraph_api/api/a2a.py
~~~

The source contains approximately 2686 lines and uses the LangGraph SDK and
Agent Server APIs directly rather than delegating execution to a separate A2A
runtime.

### Protocol generation

The adapter declares:

~~~text
A2A_PROTOCOL_VERSION = "1.0"
~~~

Agent Cards advertise a JSON-RPC interface with:

~~~text
protocolVersion = 1.0
~~~

The current A2A specification release is 1.0.1, whose wire compatibility
version remains 1.0.

The adapter therefore targets A2A 1.0 rather than a pre-1.0 protocol.

### v0.x compatibility bridge

The canonical handlers use the v1.0 operation names:

~~~text
SendMessage
SendStreamingMessage
GetTask
CancelTask
ListTasks
GetExtendedAgentCard
~~~

The adapter additionally accepts legacy slash-style names:

~~~text
message/send
message/stream
tasks/get
tasks/cancel
~~~

and maps them onto the canonical handlers.

Legacy requests also activate response conversion from the internal prefixed
enum values into the older lowercase values.

### Agent projection

Each LangGraph Assistant becomes an individual A2A Agent.

Agent Card generation uses Assistant metadata and Assistant schemas.

Each card advertises one primary skill derived from the Assistant and includes:

~~~text
supportedInterfaces
    jsonrpc / 1.0

capabilities
    streaming = true
    pushNotifications = false
    stateTransitionHistory = false
~~~

The skill metadata records the Assistant input properties and whether a
`messages` input is supported.

### Runtime identity projection

A2A identity maps directly onto Agent Server execution identity:

~~~text
A2A contextId
    <-> LangGraph thread_id

A2A Task
    <-> LangGraph Run
~~~

The adapter encodes Task IDs as:

~~~text
{context_id}:{run_id}
~~~

This compound encoding is LangGraph adapter policy.

### SendMessage

When no contextId is supplied, the adapter generates one and passes it as the
Agent Server thread_id.

The execution path is:

~~~text
SendMessage
    -> runs.create(thread_id=contextId)
    -> runs.join()
    -> A2A Task
~~~

Unlike MCP, this execution is not based on a temporary Thread.

The current source always joins the created Run, making the observed
SendMessage path blocking.

### Task lifecycle

GetTask combines both Run and Thread state.

The basic projection is:

~~~text
pending      -> TASK_STATE_SUBMITTED
running      -> TASK_STATE_WORKING
success      -> TASK_STATE_COMPLETED
interrupted  -> TASK_STATE_INPUT_REQUIRED
error        -> TASK_STATE_FAILED
timeout      -> TASK_STATE_FAILED
~~~

A successful Run is projected as INPUT_REQUIRED when the current Thread state
is interrupted.

Task history is reconstructed from Thread checkpoint history filtered by the
Run ID.

CancelTask maps pending/running tasks to:

~~~text
runs.cancel(
    action="interrupt",
    wait=True
)
~~~

ListTasks is computed from Threads and Runs rather than stored as an independent
Task resource.

### HITL

LangGraph interrupts are projected as:

~~~text
Thread interrupted
    -> TASK_STATE_INPUT_REQUIRED
    -> Interrupt Artifact
~~~

A subsequent A2A message can provide resume content which the adapter promotes
to a LangGraph Run Command.

### Streaming

SendStreamingMessage uses SSE and translates LangGraph stream items into A2A
task/status/artifact updates.

### Partial v1.0 compatibility

The adapter advertises A2A 1.0 but still contains legacy wire-format behavior.

Notable source findings:

~~~text
A2A-Version header negotiation
    not observed

Part and stream-event serialization
    still emits legacy `kind` fields

TaskStatusUpdateEvent
    still carries `final`
~~~

Current A2A 1.0 removed `kind` discrimination from Parts and stream events and
removed the `final` field from TaskStatusUpdateEvent.

The adapter is therefore best described as an A2A-1.0-targeting compatibility
implementation rather than assumed fully conformant v1.0.

## 1.8B — Agent Card, versioning and compatibility behavior

### Live Agent Card

The registered `deep_agent` exposes a per-Assistant Agent Card whose primary
interface advertises:

~~~text
protocolBinding = jsonrpc
protocolVersion = 1.0
~~~

Its capabilities are:

~~~text
streaming = true
pushNotifications = false
stateTransitionHistory = false
~~~

The generated Skill is derived from the Assistant metadata and input schema.
For this graph it reports the `files` and `messages` properties and
`supportsA2A = true`.

The legacy per-Assistant discovery path:

~~~text
/a2a/{assistant_id}/.well-known/agent.json
~~~

returned a Card identical to the modern:

~~~text
/a2a/{assistant_id}/.well-known/agent-card.json
~~~

### Extended Agent Card

`GetExtendedAgentCard` returned the same Agent Card as public discovery.

Runtime logs showed that Agent Card generation only reads the Assistant and
its schemas. It does not create a Thread or Run.

### Protocol-version negotiation

Live tests sent `GetExtendedAgentCard` using:

~~~text
A2A-Version: 1.0
A2A-Version: 9.9
no A2A-Version header
~~~

All three requests succeeded with HTTP 200 and equivalent behavior.

The current A2A 1.0 specification requires clients to identify the requested
Major.Minor protocol version and requires servers to return
`VersionNotSupportedError` for unsupported versions. An empty version is
interpreted as protocol 0.3.

The pinned adapter therefore advertises A2A 1.0 but does not implement
A2A-Version negotiation.

This is a confirmed interoperability gap rather than only a source-level
hypothesis.

### Binding identifier

The generated Agent Card advertises the binding identifier as lowercase
`jsonrpc`.

The A2A 1.0 specification names the standard core binding `JSONRPC`.
Because the field is open-form, this is currently recorded as a non-canonical
identifier and a potential strict-client interoperability issue rather than a
confirmed protocol failure.

### Canonical versus legacy SendMessage

Live execution confirmed that both protocol surfaces use the same Agent Server
execution architecture.

The canonical request used:

~~~text
SendMessage
ROLE_USER
member-based text Part
A2A-Version: 1.0
~~~

and returned the A2A 1.0 response envelope:

~~~text
result
    task
        status.state = TASK_STATE_COMPLETED
~~~

The legacy request used:

~~~text
message/send
user
kind = text
no A2A-Version
~~~

and returned:

~~~text
result
    Task directly
        status.state = completed
~~~

This validates the explicit v0.x compatibility transformation.

### Input versus output compatibility

The canonical request proved that the adapter accepts A2A 1.0 member-based
Text Parts:

~~~json
{"text":"..."}
~~~

The legacy request also accepts:

~~~json
{"kind":"text","text":"..."}
~~~

However, canonical responses still emit legacy `kind` discriminator fields on
Task, Message and Part objects.

The canonical path is therefore hybrid:

~~~text
v1 operation name
v1 role enum
v1 state enum
v1 SendMessageResponse wrapper
v1 member-based request Part

but

legacy kind fields remain in nested output objects
~~~

This is a more precise description than classifying the whole adapter as either
v0.x or v1.0.

### Persistent execution

Both canonical and legacy SendMessage calls created persistent Agent Server
Threads and Runs.

The Thread inventory changed from 29 to 31, and the two new thread IDs exactly
matched the A2A contextIds returned in the Tasks.

Both Runs were created with:

~~~text
temporary = false
~~~

and both followed:

~~~text
runs.create
    -> Runtime queue
    -> Graph execution
    -> model
    -> runs.join
    -> A2A response
~~~

A2A compatibility changes the wire representation but not the underlying
execution model.

### Blocking behavior

Observed SendMessage requests remained open until their Runs completed.

The source path and live logs both show:

~~~text
runs.create
    -> runs.join
~~~

The current adapter therefore behaves synchronously for the tested
SendMessage path.

A2A 1.0 defines `configuration.returnImmediately` to allow immediate Task
return. Support for that control remains to be tested in the lifecycle
sub-block.

### GetTask and ListTasks projections

Live retrieval confirmed that A2A Tasks are computed projections rather than
independently stored resources.

For a completed Task:

~~~text
GetTask
    -> Run lookup
    -> Thread lookup
    -> checkpoint history
    -> reconstructed A2A Task
~~~

The returned composite Task ID, contextId and two-message history matched the
original SendMessage result.

ListTasks filtered by contextId similarly reconstructed the Task from the
persistent Run and Thread history.

~~~text
Thread + Run + checkpoints
    -> A2A Task
~~~

### ListTasks artifact projection gap

The original SendMessage Task contained an `Assistant Response` Artifact.

A subsequent:

~~~text
ListTasks(
    contextId = ...,
    includeArtifacts = true
)
~~~

returned the same Task and history but did not include its Artifact.

A2A 1.0 requires actual Task artifacts to be included when
`includeArtifacts=true`.

The pinned adapter therefore loses Artifact output when reconstructing Tasks
through ListTasks.

### CancelTask on a terminal Task

A completed Runtime Run had:

~~~text
status = success
~~~

CancelTask returned:

~~~text
TASK_STATE_CANCELED
"Task cancel acknowledged (was: success)"
~~~

but did not mutate the Runtime Run.

A direct Runtime lookup before and after cancellation remained:

~~~text
success -> success
~~~

and a subsequent GetTask returned:

~~~text
TASK_STATE_COMPLETED
~~~

The CancelTask response is therefore a synthetic protocol acknowledgement, not
a persisted lifecycle transition.

Current A2A 1.0 semantics specify `TaskNotCancelableError` for a Task that has
already reached a terminal state. Cancel operations are idempotent, but that
does not mean an already-completed Task should be projected as newly canceled.

The adapter behavior is therefore a confirmed protocol-compliance gap.

### historyLength zero semantics

Live testing exposed inconsistent zero-history handling.

GetTask with:

~~~text
historyLength = 0
~~~

returned the complete two-message Task history.

This violates the A2A 1.0 history limit semantics: zero requests no history and
the server must not return more messages than the requested limit.

The source explains the failure:

~~~python
messages[-history_length:]
~~~

For zero, Python evaluates `-0` as `0`, so the slice becomes the complete list.

ListTasks behaves differently for the same value:

~~~text
historyLength = 0
    -> history = []
~~~

The message-count constraint is respected there, although the A2A specification
recommends omitting the history field entirely for zero.

The two retrieval operations therefore have inconsistent zero-history
semantics.

### ListTasks field-omission semantics

ListTasks with:

~~~text
includeArtifacts = false
~~~

returned:

~~~json
"artifacts": []
~~~

A2A 1.0 requires the artifacts field to be omitted entirely when artifacts are
not requested.

Combined with the previous `includeArtifacts=true` test, the adapter has two
distinct Artifact projection problems:

~~~text
includeArtifacts = true
    -> previously produced Artifact is lost

includeArtifacts = false
    -> empty artifacts field is emitted instead of omitted
~~~

### returnImmediately compatibility gap

A canonical SendMessage request was executed with:

~~~text
configuration.returnImmediately = true
~~~

The HTTP request still remained open for approximately 2.57 seconds.

Runtime logs showed the unchanged blocking path:

~~~text
runs.create
    -> Runtime queue
    -> model execution
    -> runs.join
    -> A2A response
~~~

The response already contained:

~~~text
TASK_STATE_COMPLETED
history = 2 messages
artifacts = 1
~~~

and the persistent Runtime Run was already `success`.

A2A 1.0 requires `returnImmediately=true` to return after Task creation while
processing may continue asynchronously.

The pinned adapter therefore accepts but silently ignores
`configuration.returnImmediately`.

### Human-in-the-loop projection

A deterministic temporary graph was used to validate A2A pause/resume without
depending on model behavior.

The graph called LangGraph `interrupt()` with:

~~~text
kind     = a2a_hitl_probe
prompt   = Provide the deterministic resume value.
expected = A2A_RESUME_OK
~~~

The initial canonical SendMessage returned:

~~~text
TASK_STATE_INPUT_REQUIRED
~~~

and an A2A `Interrupt` Artifact containing the LangGraph interrupt ID and value
inside a Data Part.

### Runtime state during dynamic interrupt

The underlying Runtime state was:

~~~text
Thread.status = interrupted
Run.status    = success
~~~

This confirms that a dynamic graph interrupt is represented primarily by
Thread/checkpoint state rather than necessarily by an interrupted Run status.

The A2A adapter compensates by combining Run and current Thread state:

~~~text
Run success
+
Thread interrupted
    -> TASK_STATE_INPUT_REQUIRED
~~~

### Resume through A2A

A second SendMessage referenced the same:

~~~text
taskId
contextId
~~~

and supplied:

~~~json
{
  "data": {
    "resume": "A2A_RESUME_OK"
  }
}
~~~

The adapter recognized that the Thread was interrupted and promoted the Data
Part into a LangGraph resume command.

Execution resumed successfully and produced:

~~~text
A2A_RESUMED:A2A_RESUME_OK
~~~

The A2A response preserved both the original logical Task ID and the same
contextId.

The observed logical model is therefore:

~~~text
A2A Task
    |
    +-- initial execution
    |       -> interrupt
    |
    +-- resume
            -> same Context
            -> same A2A Task identity
            -> completed
~~~

The next experiment determines how this single logical A2A Task maps onto the
multiple Runtime Runs required by pause/resume.

### Task identity after HITL resume

A resumed A2A Task required a second persistent Runtime Run.

The Runtime contained:

~~~text
Run A
    input = initial user message
    command = null
    status = success

Run B
    input = {}
    command.resume = A2A_RESUME_OK
    status = success
~~~

Both Runs belong to the same persistent Thread.

After resume the Thread returned to `idle`, its interrupt set became empty and
its state contained the final assistant message.

### Logical Task versus physical Runs

The SendMessage resume response deliberately preserved the original A2A Task
identity:

~~~text
Task ID = contextId:Run-A
~~~

while executing internally through Run B.

This models the intended logical lifecycle:

~~~text
Task A
    -> INPUT_REQUIRED
    -> resume
    -> COMPLETED
~~~

A2A 1.0 defines a message carrying an existing taskId as continuation of that
Task, particularly for INPUT_REQUIRED continuation.

### GetTask retrieval inconsistency

After successful resume, GetTask for the original Task A returned:

~~~text
TASK_STATE_COMPLETED
~~~

but its reconstructed history contained only the initial user message.

The final resumed assistant message and final Artifact were absent.

Therefore the Task returned immediately by SendMessage and the same Task later
retrieved through GetTask do not have equivalent representations.

### ListTasks identity split

ListTasks for the same context returned two Tasks:

~~~text
contextId:Run-B
    COMPLETED
    history = initial user + resumed assistant output

contextId:Run-A
    COMPLETED
    history = initial user only
~~~

The second Runtime Run was therefore exposed as a new A2A Task even though the
resume request explicitly continued the original Task and SendMessage preserved
the original taskId.

The adapter has no persistent mapping expressing:

~~~text
Run B continues Task A
~~~

and ListTasks derives one Task identity per Runtime Run.

This creates a mismatch between:

~~~text
A2A logical lifecycle
    one Task across INPUT_REQUIRED and resume

Runtime execution lifecycle
    multiple Runs inside one Thread

retrieval projection
    one synthesized Task per Run
~~~

This is a protocol-level identity projection gap, not merely an internal
implementation detail.

ListTasks also again failed to reconstruct Artifacts even with
`includeArtifacts=true`.

### Phantom continuation Task

A final retrieval probe queried the Task identity derived from the physical
resume Run:

~~~text
contextId:Run-B
~~~

even though the A2A SendMessage resume response had explicitly preserved the
original logical identity:

~~~text
contextId:Run-A
~~~

GetTask accepted the derived Run-B identity as a normal Task and returned:

~~~text
TASK_STATE_COMPLETED

history:
    initial user message
    resumed assistant output
~~~

The original Task A remained independently addressable and returned:

~~~text
TASK_STATE_COMPLETED

history:
    initial user message only
~~~

The adapter therefore exposes two independently retrievable A2A Task
identities for one logical INPUT_REQUIRED -> resume lifecycle.

~~~text
logical A2A lifecycle

Task A
    -> INPUT_REQUIRED
    -> resume Task A
    -> COMPLETED


physical Runtime lifecycle

Thread
    -> Run A
    -> Run B


retrieval projection

Task(contextId:Run-A)
Task(contextId:Run-B)
~~~

The second identity is called a `phantom continuation Task` in this lab.

It was never returned by the resume SendMessage operation as a newly created
Task. It exists because GetTask/ListTasks independently synthesize Task
identity from each physical Runtime Run.

This confirms that the adapter preserves logical Task identity transiently
during SendMessage resume but does not persist the Run-to-logical-Task
relationship required to reconstruct that identity later.

### Active CancelTask lifecycle split

A deterministic slow graph was used to validate cancellation while a Runtime
Run was genuinely active.

Immediately before cancellation:

~~~text
Runtime Run = running
GetTask     = TASK_STATE_WORKING
~~~

CancelTask then returned:

~~~text
TASK_STATE_CANCELED
"Task was canceled"
~~~

The underlying Runtime cancellation uses:

~~~text
runs.cancel(
    action="interrupt",
    wait=True
)
~~~

After cancellation the persistent Runtime state was:

~~~text
Run.status       = interrupted
Thread.status    = interrupted
Thread.error     = UserInterrupt
Thread.interrupts = {}
~~~

The original blocking SendMessage concurrently returned:

~~~text
TASK_STATE_FAILED
"Error executing assistant: UserInterrupt"
~~~

while a subsequent GetTask returned:

~~~text
TASK_STATE_INPUT_REQUIRED
~~~

The same cancellation therefore has three incompatible A2A projections:

~~~text
CancelTask
    -> CANCELED

blocking SendMessage
    -> FAILED

persistent GetTask
    -> INPUT_REQUIRED
~~~

The source explains the split.

CancelTask synthesizes a CANCELED response after Runtime cancellation.

The blocking SendMessage sees the Runtime UserInterrupt as an execution error
and projects it as FAILED.

GetTask independently maps every Runtime `interrupted` Run to
TASK_STATE_INPUT_REQUIRED.

### Lifecycle interrupt versus graph interrupt

The post-cancel Thread had:

~~~text
status     = interrupted
interrupts = {}
error      = UserInterrupt
~~~

This differs fundamentally from the earlier dynamic LangGraph interrupt:

~~~text
status     = interrupted
interrupts = {actual resumable interrupt data}
~~~

Therefore Runtime lifecycle cancellation and resumable graph interruption must
not share the same A2A projection.

`TASK_STATE_INPUT_REQUIRED` is appropriate for a resumable graph/HITL
interrupt, but the canceled Run has no pending interrupt and no input to
provide.

A2A 1.0 models a successful cancellation as TASK_STATE_CANCELED. The pinned
adapter loses that durable semantic because Runtime `interrupt` is reused as
the cancellation mechanism without preserving A2A cancellation intent for
later retrieval.

### 1.8C conclusion

The lifecycle experiments established that A2A Tasks are projections rather
than independent persistent resources.

The projection works for basic execution but breaks down around lifecycle
semantics that do not map one-to-one onto Runtime Runs and Threads:

~~~text
returnImmediately
    accepted but ignored

terminal cancellation
    synthetic CANCELED response
    Runtime remains success

active cancellation
    CANCELED / FAILED / INPUT_REQUIRED split

dynamic HITL interrupt
    correctly projected to INPUT_REQUIRED + Interrupt Artifact

resume
    same logical A2A Task
    second physical Runtime Run

post-resume retrieval
    phantom continuation Task

GetTask historyLength=0
    returns complete history

ListTasks artifacts
    incomplete projection
~~~

The central architectural lesson is that:

~~~text
A2A Task
    !=
Runtime Run
~~~

A correct adapter requires a durable logical Task layer capable of relating
multiple Runtime Runs and preserving protocol-specific lifecycle state.

## 1.8D — Streaming and final A2A boundary

### Canonical SendStreamingMessage happy path

A deterministic graph was streamed through canonical `SendStreamingMessage`.

The HTTP response used:

~~~text
200 OK
Content-Type: text/event-stream
Transfer-Encoding: chunked
~~~

and the persistent Runtime Run used:

~~~text
stream_mode = ["messages", "values"]
temporary   = false
status      = success
~~~

The observed SSE sequence contained three JSON-RPC responses:

~~~text
0. initial Task
   TASK_STATE_SUBMITTED

1. status update
   TASK_STATE_WORKING
   message = A2A_STREAM_OK
   final = false

2. status update
   TASK_STATE_COMPLETED
   final = true

stream closed
~~~

The first event correctly establishes the Task before update events.

### Hybrid v1/v0.3 streaming wire shape

The canonical stream is not consistently A2A 1.0-shaped.

Its initial response uses the newer StreamResponse-style wrapper:

~~~json
{
  "result": {
    "task": { "...": "..." }
  }
}
~~~

However subsequent events use the legacy direct-event shape:

~~~json
{
  "result": {
    "kind": "status-update",
    "taskId": "...",
    "contextId": "...",
    "status": { "...": "..." },
    "final": false
  }
}
~~~

A2A 1.0 removed the streaming `kind` discriminator and `final` boolean in
favor of member-based event discrimination and stream closure.

The canonical adapter therefore combines:

~~~text
v1 operation name
v1 TaskState enums
v1 initial StreamResponse wrapper

with

legacy status-update kind discriminator
legacy final boolean
legacy nested kind fields
~~~

### Output delivery

The assistant output `A2A_STREAM_OK` appeared as the message attached to the
WORKING status update.

The terminal COMPLETED update did not repeat that message and no Artifact event
was emitted.

This reflects the adapter translating LangGraph `messages` stream events into
A2A status messages rather than materializing ordinary graph output as an A2A
Artifact update.

### Canonical versus legacy streaming

The same deterministic graph was then executed through the legacy
`message/stream` alias.

Both canonical and legacy paths emitted three SSE events and used the same
underlying Runtime streaming execution.

The wire representations differed as follows:

~~~text
canonical event 0
    wrapped Task
    TASK_STATE_SUBMITTED
    ROLE_USER
    member-based input Part

legacy event 0
    direct Task
    submitted
    user
    kind=text Part

canonical event 1
    direct status-update
    TASK_STATE_WORKING
    ROLE_AGENT
    final=false

legacy event 1
    direct status-update
    working
    agent
    final=false

canonical event 2
    direct status-update
    TASK_STATE_COMPLETED
    final=true

legacy event 2
    direct status-update
    completed
    final=true
~~~

The canonical path is therefore hybrid:

~~~text
v1 operation name
v1 prefixed enum values
v1-style wrapper for the initial Task

plus

legacy direct status-update events
legacy kind discriminator
legacy final boolean
~~~

The legacy alias applies `_to_spec_format()` to every SSE payload. That
transformation unwraps the initial Task and converts roles/states to lowercase,
while retaining the legacy `kind` and `final` representation.

The legacy path is therefore more internally consistent with the v0.x wire
model than the canonical path is with A2A 1.0.

A2A 1.0 StreamResponse instead discriminates events through exactly one of:

~~~text
task
message
statusUpdate
artifactUpdate
~~~

rather than direct `kind=status-update` / `kind=artifact-update` objects.

### Streaming dynamic interrupt

A deterministic graph using LangGraph `interrupt()` was executed through
canonical `SendStreamingMessage`.

The SSE connection completed normally in approximately 0.82 seconds rather
than remaining open waiting for the resume message.

The observed sequence was:

~~~text
0. initial Task
   TASK_STATE_SUBMITTED

1. artifact-update
   Artifact name = Interrupt
   Data Part contains interrupt id and value

2. status-update
   TASK_STATE_INPUT_REQUIRED
   final = true

stream closed
~~~

No WORKING event was emitted for this short interrupted execution.

The interrupt Artifact was delivered before the INPUT_REQUIRED status update,
matching the ordering implemented by the pinned adapter.

The underlying Runtime state was:

~~~text
Run.status     = success
Thread.status  = interrupted
Thread.error   = None
Thread.interrupts = populated with the resumable LangGraph interrupt
~~~

This contrasts with lifecycle cancellation, where Runtime interruption carries
`UserInterrupt`, no resumable interrupt data and should not represent
INPUT_REQUIRED.

### Stream closure at INPUT_REQUIRED

The adapter closes the SSE connection after emitting INPUT_REQUIRED and marks
the legacy streaming event with:

~~~text
final = true
~~~

A2A 1.0 removed the `final` field from TaskStatusUpdateEvent.

The current v1.0.1 specification also contains a wording tension: the
SendStreamingMessage operation description states that a task lifecycle stream
closes at a terminal state, while the REST streaming binding describes closure
at a terminal or interrupted state.

The pinned behavior matches the REST-binding interpretation for
INPUT_REQUIRED.

### Streaming resume and Task identity

The interrupted streaming Task was resumed through canonical
`SendStreamingMessage` using the same:

~~~text
taskId
contextId
~~~

and a Data Part containing:

~~~json
{
  "resume": "A2A_STREAM_RESUME_OK"
}
~~~

The resume stream emitted:

~~~text
0. initial Task
   TASK_STATE_SUBMITTED

1. status-update
   TASK_STATE_WORKING
   message = A2A_STREAM_RESUMED:A2A_STREAM_RESUME_OK
   final = false

2. status-update
   TASK_STATE_COMPLETED
   final = true
~~~

Every SSE event preserved the original logical Task ID.

### Logical identity versus physical resume Run

Despite preserving the original Task identity on the wire, the Runtime created
a second persistent Run:

~~~text
Run A
    initial input
    command = null
    status = success

Run B
    input = {}
    command.resume = A2A_STREAM_RESUME_OK
    status = success
~~~

After Run B completed, the Thread returned to:

~~~text
status     = idle
interrupts = {}
error      = None
~~~

and contained the final resumed assistant message.

Streaming execution therefore correctly models one logical A2A Task across
multiple Runtime Runs while the request is in progress.

### Streaming phantom continuation Task

Persistent retrieval lost that logical relationship exactly as in the blocking
resume experiment.

GetTask for the original Task returned:

~~~text
TASK_STATE_COMPLETED
history = initial user message only
~~~

GetTask for the identity synthesized from Run B returned:

~~~text
TASK_STATE_COMPLETED
history =
    initial user message
    resumed assistant message
~~~

ListTasks returned both identities as independent Tasks.

Therefore the phantom continuation Task is not specific to blocking
SendMessage. It is caused by the persistent Run-to-Task projection shared by
both execution modes.

~~~text
execution-time streaming projection

Task A
    -> Run A
    -> INPUT_REQUIRED
    -> Run B resume
    -> COMPLETED as Task A


persistent retrieval projection

Run A -> Task A
Run B -> phantom Task B
~~~

### 1.8D conclusion

The streaming experiments established:

~~~text
canonical happy path
    Task SUBMITTED
    -> WORKING
    -> COMPLETED

canonical wire
    hybrid A2A 1.0 envelope/enums
    plus legacy kind/final streaming events

legacy message/stream
    comparatively coherent v0.x representation

dynamic HITL
    Task SUBMITTED
    -> Interrupt Artifact
    -> INPUT_REQUIRED
    -> stream closes

streaming resume
    preserves original logical Task identity
    while creating a second Runtime Run

post-resume retrieval
    again exposes a phantom continuation Task
~~~

Streaming therefore does not create a separate architectural model.

Both blocking and streaming A2A operations ultimately project the same
persistent Agent Server Runtime objects, and both inherit the same loss of
logical Task identity during later retrieval.

## Final conclusion

The pinned LangGraph API 0.8.1 A2A adapter is best understood as a projection
layer over Agent Server rather than an independent A2A task engine.

Its core mapping is:

~~~text
LangGraph Assistant -> A2A Agent
LangGraph Thread    -> A2A Context
LangGraph Run       -> initial approximation of A2A Task
~~~

That approximation is sufficient for simple one-Run executions but becomes
lossy whenever A2A semantics do not map one-to-one onto Runtime Runs.

The experiments demonstrated four distinct boundaries.

### Discovery and compatibility

The adapter advertises A2A protocol 1.0 and supports canonical v1 operation
names while maintaining explicit aliases for v0.x clients.

However:

~~~text
A2A-Version
    is not enforced

canonical output
    still contains legacy fields

canonical streaming
    mixes v1 wrappers/enums with v0.x event shapes

legacy aliases
    often produce a more internally coherent v0.x representation
~~~

### Execution and persistence

SendMessage and SendStreamingMessage both create persistent Agent Server
Threads and Runs.

The A2A adapter does not maintain a separate durable Task store.

Consequently:

~~~text
A2A Task
    is reconstructed from Runtime state

rather than

A2A Task
    being an independently persisted protocol resource
~~~

### Lifecycle semantic gaps

Several A2A lifecycle concepts are richer than the underlying Runtime status
mapping.

Observed examples include:

~~~text
returnImmediately
    accepted but ignored

terminal CancelTask
    synthetic CANCELED acknowledgement
    while Runtime remains success

active CancelTask
    CancelTask  -> CANCELED
    SendMessage -> FAILED(UserInterrupt)
    GetTask     -> INPUT_REQUIRED

graph interrupt()
    correctly becomes INPUT_REQUIRED
    with a resumable Interrupt Artifact
~~~

Runtime lifecycle interruption and graph/HITL interruption therefore cannot be
treated as the same protocol state merely because both use the Runtime
`interrupted` status.

### Task identity gap

The most important architectural mismatch appears during resume.

A logical A2A lifecycle is:

~~~text
Task A
    -> INPUT_REQUIRED
    -> resume Task A
    -> COMPLETED
~~~

The Runtime needs multiple physical Runs:

~~~text
Thread
    -> Run A
    -> Run B(resume)
~~~

During both blocking and streaming execution, the adapter correctly preserves
Task A.

Persistent retrieval does not preserve that relationship:

~~~text
GetTask/ListTasks

Run A -> Task A
Run B -> phantom continuation Task B
~~~

The original Task then has incomplete history while the synthesized Task B
contains the resumed result.

### Final architectural boundary

The practical boundary is:

~~~text
Agent Server
    owns
        execution
        Runs
        Threads
        checkpoints
        Runtime lifecycle
        persistence

A2A adapter
    projects
        Agent discovery
        Context identity
        Task lifecycle
        HITL
        streaming
        protocol compatibility

but does not own
        durable logical Task identity
        protocol-specific lifecycle state
~~~

A lossless A2A implementation over Agent Server therefore requires an
additional durable protocol-level Task layer capable of relating multiple Runs
to one logical Task and retaining A2A-specific lifecycle intent.

Without that layer:

~~~text
Run != Task
Thread != complete A2A Context semantics
Runtime interrupted != one unique A2A state
~~~

This completes section 1.8 A2A.
