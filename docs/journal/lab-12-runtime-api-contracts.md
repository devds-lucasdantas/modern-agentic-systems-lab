# Lab 12 — Runtime API Contracts

## Goal

Move from the internal execution model validated during Phase 0 to the external
API contracts exposed by the LangGraph Runtime.

Phase 0 established experimentally:

- Assistant identity;
- Thread identity;
- Runs;
- checkpoint persistence;
- historical state;
- checkpoint branching;
- state updates;
- Runtime Store ownership;
- cross-thread Store-backed memory.

Phase 1 will not repeat those experiments.

Instead, this lab will map the Runtime as a service boundary.

## Questions

1. What are the top-level Runtime resources?
2. Which endpoints create, read, update, search, or delete each resource?
3. Which operations are synchronous versus streaming?
4. Which schemas represent Agent/Assistant, Thread, Run, State and Checkpoint?
5. How are configuration and context passed into Runs?
6. How are interrupts represented through the API?
7. How is Run lifecycle/status represented?
8. Which operations are stateful versus stateless?
9. Which Runtime APIs belong to LangGraph-specific semantics?
10. Which concepts later map naturally to Agent Protocol or other interoperability
    protocols?

## Starting hypothesis

The API can be understood as several related resource families:

~~~text
Assistant
    -> graph/configuration identity

Thread
    -> persistent execution-state identity

Run
    -> execution lifecycle

State / Checkpoint
    -> versioned Thread execution state

Store
    -> cross-Thread application data
~~~

This model will be validated against the actual OpenAPI contract exposed by the
pinned Runtime.

## Evidence policy

Claims in this lab will be classified as:

- `OPENAPI` — directly established from the Runtime API schema;
- `RUNTIME` — directly observed through API execution;
- `SOURCE` — verified in pinned source code;
- `INFERENCE` — architectural interpretation that still requires validation.

## 1.1A — Runtime API surface inventory

### Objective

Inventory the complete HTTP API and classify endpoints by resource family
before performing further Runtime experiments.

### Result

The pinned Runtime exposes an OpenAPI document with:

~~~text
title:      LangSmith Deployment
version:    0.1.0
paths:      47
operations: 60
~~~

The OpenAPI `info.version` value describes the API document and should not be
confused with the installed `langgraph-api` package version.

### Resource families

The initial path-based inventory produced:

~~~text
Assistant    12 operations
Thread        9 operations
Run          20 operations
State         6 operations
Store         5 operations
System        2 operations
Other         6 operations
~~~

The `Other` category contains operational and interoperability surfaces rather
than one coherent resource family:

~~~text
A2A
MCP
docs
metrics
~~~

### Assistant surface

The Assistant API includes more than CRUD operations.

Observed capabilities include:

~~~text
create
count
search
get
patch
delete
graph inspection
schema inspection
subgraph discovery
version listing
latest-version selection
~~~

This means Assistant should initially be modeled as a configured and versioned
graph-execution identity rather than merely an identifier for a graph.

The exact relationship between graph ID, Assistant ID and Assistant version
still requires contract inspection.

### Thread surface

Thread operations include:

~~~text
create
count
search
get
patch
delete
copy
prune
stream/join
~~~

State and Run operations are nested under Thread paths but are treated as
separate architectural capability families.

### Run surface

Run is the largest API family in the current inventory.

The contract exposes both stateless and Thread-bound execution:

~~~text
POST /runs
POST /threads/{thread_id}/runs
~~~

Additional Run capabilities include:

~~~text
batch
wait
stream
join
cancel
delete
cron scheduling
cron search
cron mutation
~~~

This suggests that Run is both an execution request and a lifecycle-managed
Runtime resource.

The exact lifecycle and status model still requires schema inspection.

### State and checkpoint surface

State operations are scoped under Thread:

~~~text
GET  /threads/{thread_id}/state
POST /threads/{thread_id}/state

GET  /threads/{thread_id}/state/{checkpoint_id}

GET  /threads/{thread_id}/history
POST /threads/{thread_id}/history

POST /threads/{thread_id}/state/checkpoint
~~~

There is no top-level checkpoint resource in the observed API.

This is consistent with the Phase 0 model in which checkpoints represent
versioned execution state inside a Thread lineage.

### Store surface

The Store API is independent of Thread paths:

~~~text
PUT     /store/items
GET     /store/items
DELETE  /store/items
POST    /store/items/search
POST    /store/namespaces
~~~

No Store endpoint embeds a Thread ID, Run ID or Assistant ID in its path.

This reinforces the distinction validated in Phase 0:

~~~text
Thread / Checkpoint
    -> execution persistence

Store
    -> namespace/key/value application data
~~~

### Streaming surface

Streaming is not represented by one isolated resource.

Streaming-related endpoints appear at several levels:

~~~text
POST /runs/stream

POST /threads/{thread_id}/runs/stream

GET  /threads/{thread_id}/runs/{run_id}/stream

GET  /threads/{thread_id}/stream
~~~

Therefore endpoint resource family and behavioral capability should be modeled
separately.

### Scheduled and background execution

The Runtime exposes Cron operations directly under the Run API:

~~~text
POST   /runs/crons
POST   /runs/crons/count
POST   /runs/crons/search
PATCH  /runs/crons/{cron_id}
DELETE /runs/crons/{cron_id}

POST   /threads/{thread_id}/runs/crons
~~~

Background execution is therefore already visible in the Runtime contract and
will later be studied as part of the Run lifecycle rather than as an unrelated
feature.

### Interoperability surfaces

The pinned Runtime also exposes:

~~~text
POST /a2a/{assistant_id}

POST   /mcp/
GET    /mcp/
DELETE /mcp/
~~~

The existence of these endpoints is established by OpenAPI inspection.

Their semantics have not yet been validated.

They will be studied later in Phase 1 rather than inferred from endpoint names.

### Operational endpoints

Observed operational endpoints include:

~~~text
GET /ok
GET /info
GET /metrics
GET /docs
~~~

These belong to server operation rather than agent execution resources.

### Classification refinement

A simple one-dimensional endpoint classification is insufficient.

The next model will distinguish two axes.

Resource:

~~~text
Assistant
Thread
Run
State / Checkpoint
Store
Cron
~~~

Capability:

~~~text
CRUD
discovery
execution
state management
streaming
scheduling
persistence
interoperability
operations
~~~

For example:

~~~text
GET /threads/{thread_id}/stream

resource:
    Thread

capability:
    streaming
~~~

### Observed contract quirks

Two generated operation identifiers appear inconsistent with their HTTP
method/path names:

~~~text
POST /assistants/{assistant_id}/versions

POST /threads/{thread_id}/state/checkpoint
~~~

No semantic conclusion is drawn from these names yet.

Request and response schema inspection will determine the actual contract.

### Main lesson

The Runtime API is broader than the original Phase 1 resource hypothesis.

A better starting model is:

~~~text
                         Runtime
                            |
        +-------------------+-------------------+
        |                   |                   |
        v                   v                   v
    Resources           Capabilities       Interoperability
        |                   |                   |
        |                   +-- execution       +-- MCP
        |                   +-- streaming       +-- A2A
        |                   +-- scheduling
        |                   +-- persistence
        |
        +-- Assistant
        +-- Thread
        +-- Run
        +-- State / Checkpoint
        +-- Store
        +-- Cron
~~~

The next experiment will inspect request parameters, request-body schemas and
response schemas rather than inferring semantics from endpoint names.

## 1.1B — Runtime resource contracts

### Objective

Map the schemas that define Assistant, Thread, Run, State and Store operations
and determine the exact identifiers, lifecycle fields and relationships exposed
by the pinned Runtime API.

### 1.1B results — Core resource schemas

OpenAPI component inspection established the concrete resource relationships
behind the endpoint inventory.

### Graph and Assistant

`AssistantCreate` requires `graph_id`.

In the studied deployment the allowed graph ID is:

~~~text
deep_agent
~~~

`assistant_id` is a separate optional UUID that is generated automatically when
not supplied.

An Assistant can also contain:

~~~text
config
context
metadata
name
description
version
~~~

Therefore Graph and Assistant are distinct concepts:

~~~text
registered Graph
      |
      | graph_id
      v
Assistant
      |
      +-- assistant_id
      +-- config
      +-- context
      +-- metadata
      +-- version
~~~

The Graph is the executable definition registered by the deployment.

The Assistant is a configured and versioned execution identity created from
that Graph.

### Run target resolution

Both `RunCreateStateless` and `RunCreateStateful` require a field named
`assistant_id`.

Despite its name, the field accepts either:

~~~text
Assistant UUID

or

Graph name
~~~

When a Graph name is supplied, the contract states that the first Assistant
created from that Graph is selected.

The field therefore behaves semantically as an execution-target selector rather
than strictly as an Assistant UUID.

### Stateless execution still uses a Thread

`RunCreateStateless` contains:

~~~text
on_completion:
    delete
    keep
~~~

with `delete` as the default.

The contract explicitly describes this as controlling the lifetime of the
Thread created for a stateless Run.

Therefore:

~~~text
stateless Run
    !=
Run without a Thread
~~~

The observed model is:

~~~text
POST /runs
    |
    v
Runtime-created temporary Thread
    |
    v
Run
    |
    v
on_completion
    |
    +-- delete
    |
    +-- keep
~~~

Stateless execution means that the caller does not need to supply and manage a
pre-existing persistent Thread.

### Run resource

The persisted `Run` schema requires:

~~~text
run_id
thread_id
assistant_id
created_at
updated_at
status
metadata
kwargs
multitask_strategy
~~~

Run status is explicitly modeled as:

~~~text
pending
running
error
success
timeout
interrupted
~~~

A Run is therefore both an execution request and a lifecycle-managed Runtime
resource.

### Thread resource

The Thread schema requires:

~~~text
thread_id
created_at
updated_at
metadata
status
~~~

Thread status is:

~~~text
idle
busy
interrupted
error
~~~

Additional Thread fields can include:

~~~text
state_updated_at
config
values
interrupts
ttl
extracted
~~~

Thread lifecycle and Run lifecycle are therefore related but distinct.

### Stateful versus stateless Run creation

Both Run creation contracts share capabilities including:

~~~text
assistant_id
input
command
metadata
config
context
webhook
stream_mode
stream_subgraphs
stream_resumable
feedback_keys
after_seconds
durability
~~~

Stateful Run creation additionally exposes:

~~~text
checkpoint
interrupt_before
interrupt_after
multitask_strategy
if_not_exists
~~~

Stateless Run creation instead exposes `on_completion` to control the temporary
Thread lifetime.

### Concurrency

Stateful Run creation exposes the following `multitask_strategy` values:

~~~text
reject
rollback
interrupt
enqueue
~~~

The selected strategy is also a required property of the persisted Run object.

Concurrency behavior on a shared Thread is therefore part of the core Runtime
contract.

The exact semantics of each strategy remain to be validated experimentally.

### Durability

Both Run creation contracts expose:

~~~text
durability:
    sync
    async
    exit
~~~

with `async` as the default.

The older `checkpoint_during` field is marked deprecated in favor of
`durability`.

Checkpoint persistence timing is therefore an explicit execution policy.

### Streaming configuration

Run creation exposes semantic stream modes:

~~~text
values
messages
messages-tuple
tasks
checkpoints
updates
events
debug
custom
~~~

Additional controls include:

~~~text
stream_subgraphs
stream_resumable
~~~

Transport-level streaming and semantic stream mode must therefore be treated as
different layers.

### Delayed execution

Both stateful and stateless Run creation expose:

~~~text
after_seconds
~~~

for future execution.

This establishes a distinction between:

~~~text
one-shot delayed execution
    -> after_seconds

recurring/scheduled execution
    -> Cron resources
~~~

### ThreadState

The formal Thread state contract contains:

~~~text
values
next
tasks
checkpoint
metadata
created_at
parent_checkpoint
interrupts
~~~

This confirms that persisted state contains both application state and execution
control information.

### ThreadStateUpdate

The update contract contains:

~~~text
values
checkpoint
as_node
~~~

`as_node` is explicitly described as updating state as if the selected node had
just executed.

This formally confirms the state-surgery behavior previously validated
empirically in Phase 0.

### Store

`StorePutRequest` requires:

~~~text
namespace
key
value
~~~

and optionally supports:

~~~text
index
ttl
~~~

A returned Store `Item` contains:

~~~text
namespace
key
value
created_at
updated_at
~~~

The OpenAPI description explicitly identifies Store Items as a mechanism for
cross-Thread memories.

This reinforces the architecture:

~~~text
ThreadState / Checkpoints
    -> execution persistence

Store
    -> cross-Thread data persistence
~~~

### Formal resource model

The resulting Phase 1 resource model is:

~~~text
                    Deployment
                        |
                        v
                registered Graph
                        |
                        | graph_id
                        v
                    Assistant
                        |
                        | assistant_id
                        v
                       Run
                    /       \
                   /         \
                  v           v
           Stateless       Stateful
              |               |
              v               v
      temporary Thread      Thread
        delete / keep         |
                              +------+
                              |      |
                              v      v
                             Runs  State
                                     |
                                     v
                                Checkpoint DAG


                    Store
                      |
              namespace + key
                      |
                      v
                    Item

             cross-Thread persistence
~~~

### Main lesson

The Runtime does not divide cleanly into stateless and stateful execution
engines.

Thread is a foundational execution concept in both modes.

The difference is primarily whether Thread lifecycle is explicitly controlled
by the caller or implicitly managed by the stateless Run API.

## 1.1C — Checkpoint and execution-control contracts

### Objective

Inspect the schemas that define checkpoint identity, resume commands,
interrupts and execution-control behavior before performing new Runtime
experiments.

### 1.1C results — Checkpoint and execution-control contracts

The execution-control model is composed from four primary schemas:

~~~text
CheckpointConfig
Command
Interrupt
Send
~~~

### CheckpointConfig

`CheckpointConfig` exposes the following optional coordinates:

~~~text
thread_id
checkpoint_ns
checkpoint_id
checkpoint_map
~~~

The schema itself requires none of them.

This means OpenAPI structural validation does not determine which combinations
constitute a valid Runtime checkpoint reference.

That question belongs to Runtime semantics rather than schema syntax.

`checkpoint_ns` establishes checkpoint namespacing as part of the public
contract, but its relationship to subgraph namespaces is not inferred here.

### Command

`Command` contains:

~~~text
update
resume
goto
~~~

with no required property.

Their contract-level responsibilities are:

~~~text
update
    -> update execution state

resume
    -> provide a value to interrupted execution

goto
    -> explicitly select subsequent node execution
~~~

`goto` accepts:

~~~text
node name
node-name list
Send
Send list
null
~~~

Command is therefore a general execution-control abstraction rather than only
a human-in-the-loop resume mechanism.

### Send

`Send` requires:

~~~text
node
input
~~~

and represents an explicit node target together with the value supplied to that
node.

Conceptually:

~~~text
Command.goto = "node"
    -> route to node

Command.goto = Send(node, input)
    -> route to node with explicit input
~~~

### Interrupt

The public Interrupt schema is intentionally small:

~~~text
id       optional string | null
value    required object
~~~

The schema does not expose checkpoint identity, namespace, node identity or a
resumable flag.

Those relationships must not be inferred from the Interrupt object alone.

### Interrupt versus resume

Interrupt and Command.resume represent opposite sides of paused execution:

~~~text
execution
    |
    v
Interrupt
    -> persisted as observable Thread state

later

Command.resume
    -> supplies a value back to interrupted execution
~~~

Checkpoint selection and interrupt resumption are distinct operations:

~~~text
CheckpointConfig
    -> where persisted execution continues from

Command.resume
    -> value supplied to interrupted execution
~~~

### Transitive schema usage

Execution-control schemas are referenced transitively through higher-level
Runtime request and response schemas.

Command and Send are used by:

~~~text
POST /runs
POST /runs/batch
POST /runs/stream
POST /runs/wait

POST /threads/{thread_id}/runs
POST /threads/{thread_id}/runs/stream
POST /threads/{thread_id}/runs/wait
~~~

CheckpointConfig is additionally part of stateful Run creation and ThreadState
contracts.

Interrupt appears in persisted ThreadState returned by state and history
operations.

This establishes an architectural separation:

~~~text
Run request
    -> Command

persisted paused execution
    -> Interrupt
~~~

### Thread creation with supersteps

An unexpected transitive reference from `POST /threads` to Command was traced
to:

~~~text
ThreadCreate
    |
    v
supersteps[]
    |
    v
updates[]
    |
    v
ThreadSuperstepUpdate
    |
    +-- values
    +-- command
    +-- as_node
~~~

`as_node` is required for every `ThreadSuperstepUpdate`.

The contract therefore allows Thread creation to include structured superstep
updates associated with specific nodes.

This demonstrates that Thread creation is richer than creating an empty
container.

Whether supplied supersteps reproduce persisted checkpoint history exactly like
normal graph execution remains a Runtime question and is not inferred from the
schema alone.

### Historical checkpoint lookup contracts

The Runtime exposes two checkpoint-state lookup forms.

Simple lookup:

~~~text
GET /threads/{thread_id}/state/{checkpoint_id}
~~~

Rich lookup:

~~~text
POST /threads/{thread_id}/state/checkpoint
~~~

The POST form requires:

~~~text
ThreadStateCheckpointRequest
    |
    +-- checkpoint: CheckpointConfig
    +-- subgraphs: boolean
~~~

The body-based form therefore supports the richer composite checkpoint selector
defined by `CheckpointConfig`, whereas the GET form exposes a checkpoint ID
directly in the URL.

The use of POST here should not itself be interpreted as state mutation.

### Consolidated execution-control model

~~~text
                          Thread
                            |
                            v
                     Checkpoint DAG
                            |
                            v
                   CheckpointConfig
                            |
                            v
                           Run
                            |
                         Command
                     /      |      \
                    v       v       v
                 update   resume   goto
                                   |
                             +-----+-----+
                             |           |
                             v           v
                           node         Send
                                      /    \
                                     v      v
                                   node    input


execution pause
      |
      v
 Interrupt
      |
      v
ThreadState.interrupts[]
~~~

### Main lesson

Runtime execution control is not represented by one monolithic resume
operation.

The public contract separates:

~~~text
checkpoint selection
state mutation
interrupt observation
interrupt resumption
explicit routing
node-targeted input
~~~

These primitives can be composed but retain distinct responsibilities.

## 1.2 — Run lifecycle and execution modes

### Goal

Move from static API-contract inspection to empirical Runtime behavior.

The next experiments will validate:

- Run lifecycle transitions;
- Thread lifecycle transitions;
- stateful execution;
- stateless execution;
- wait semantics;
- delayed execution;
- streaming execution;
- cancellation and interruption behavior.

The Phase 0 experiments already established checkpoint persistence and
historical branching, so those behaviors will not be repeated unless needed to
explain a Run lifecycle result.

## 1.2A — Stateful Run lifecycle baseline

### Objective

Observe the lifecycle of one delayed stateful Run from creation to terminal
status while correlating Run status with Thread status.

### 1.2A results — Stateful Run lifecycle baseline

A delayed stateful Run was created against a newly created Thread using:

~~~text
assistant selector:
    deep_agent

after_seconds:
    3

multitask_strategy:
    enqueue

durability:
    async
~~~

The observed lifecycle was:

~~~text
0.01s
    Run    = pending
    Thread = busy

4.20s
    Run    = running
    Thread = busy

8.22s
    Run    = success
    Thread = idle
~~~

### Run lifecycle

The experiment directly observed:

~~~text
pending
    |
    v
running
    |
    v
success
~~~

This validates that delayed execution creates a Run resource before graph
execution begins.

`after_seconds` therefore does not merely delay creation of the Run resource.

The Run exists in `pending` state before execution enters `running`.

### Thread occupation begins while the Run is pending

The most important observation was:

~~~text
Run = pending
Thread = busy
~~~

The Thread became busy before the delayed Run transitioned to running.

For the tested combination:

~~~text
stateful Run
multitask_strategy = enqueue
after_seconds = 3
~~~

Thread occupation therefore begins when the Run is accepted into its execution
lifecycle, not only when graph execution is actively running.

This observation is specific to the tested Runtime behavior and is not yet
generalized to every multitask strategy.

### Graph-name Assistant resolution

The Run was created using:

~~~text
assistant_id = "deep_agent"
~~~

The persisted Run contained the concrete Assistant UUID:

~~~text
47c35ef5-979e-5ab8-8dce-a69ded2244ab
~~~

This empirically validates the OpenAPI statement that a graph name can be used
as the Run execution selector and resolved to an Assistant.

### Run and Thread lifecycle are correlated but distinct

The terminal Run state was:

~~~text
Run.status = success
~~~

while the terminal Thread state was:

~~~text
Thread.status = idle
~~~

Run and Thread therefore have separate lifecycle state machines, but their
transitions are operationally correlated.

The observed state can be summarized as:

~~~text
create delayed Run
        |
        v
Run=pending
Thread=busy
        |
        v
Run=running
Thread=busy
        |
        v
Run=success
Thread=idle
~~~

### Terminal execution state

The final ThreadState contained:

~~~text
next  = []
tasks = []
~~~

and a final checkpoint whose message history ended with the exact marker
requested by the Run.

This establishes consistency between:

~~~text
Run terminal status
Thread terminal status
graph execution completion
checkpointed state
~~~

### Timestamp observation

For this execution, the final:

~~~text
Run.updated_at
Thread.updated_at
Thread.state_updated_at
~~~

were identical.

This is recorded as an observation only.

The experiment does not establish that these timestamps are guaranteed to be
transactionally identical for all executions.

### Evidence

~~~text
[RUNTIME VALIDATED]

Run:
    pending -> running -> success

Thread:
    busy while Run pending
    busy while Run running
    idle after Run success

Graph-name selector:
    deep_agent -> concrete Assistant UUID

Final state:
    next=[]
    tasks=[]
    output marker persisted
~~~

## 1.2B — Stateless Run Thread lifecycle

### Objective

Validate what "stateless" means operationally by observing the temporary Thread
created for a stateless Run and comparing:

- `on_completion = keep`;
- `on_completion = delete`.

The experiment will determine whether the temporary Thread is externally
observable and whether the configured completion policy actually controls its
persistence.

### 1.2B results — Stateless Run Thread lifecycle

Two stateless Runs were executed using:

~~~text
POST /runs
~~~

with identical execution behavior but different Thread completion policies:

~~~text
on_completion = keep
on_completion = delete
~~~

### Stateless Run response

Although the inspected OpenAPI document does not declare a response schema for
the successful `POST /runs` response, the Runtime returned a Run-shaped object
containing:

~~~text
run_id
thread_id
assistant_id
metadata
status
kwargs
multitask_strategy
created_at
updated_at
~~~

Both stateless Runs were initially returned with:

~~~text
status = pending
~~~

This is recorded as an observed contract difference between the OpenAPI schema
and executable Runtime behavior.

### Stateless execution creates a real Thread

Both Run responses contained distinct Thread IDs.

Therefore:

~~~text
POST /runs
    |
    v
Runtime-created Thread
    |
    v
Run associated with that Thread
~~~

Stateless execution does not mean execution without a Thread.

### `on_completion = keep`

The keep Run reached:

~~~text
status = success
~~~

After completion:

~~~text
GET /threads/{thread_id}
    -> HTTP 200
~~~

The retained Thread was:

~~~text
status = idle
~~~

and its persisted values contained the input message, AI response and middleware
state.

Therefore `on_completion=keep` converts the automatically created Thread into a
persisting Runtime resource.

### `on_completion = delete`

The delete Run was successfully created with its own Thread ID.

After execution completed, both:

~~~text
GET /threads/{thread_id}/runs/{run_id}
~~~

and:

~~~text
GET /threads/{thread_id}
~~~

could no longer retrieve the Thread-scoped execution resource.

The Thread lookup returned:

~~~text
404
Thread with ID ... not found
~~~

This validates that `on_completion=delete` performs Thread cleanup after the
stateless execution completes.

Because the public API exposes Run retrieval through its Thread path rather than
a global `GET /runs/{run_id}`, this experiment establishes that the Run becomes
unavailable through the Thread-scoped API after Thread deletion.

It does not establish whether some internal Runtime record exists elsewhere.

### Runtime `temporary` flag

The executable Run representation exposed an additional value inside execution
kwargs.

For the keep policy:

~~~text
temporary = false
~~~

For the delete policy:

~~~text
temporary = true
~~~

This suggests that the Runtime internally represents the completion policy as
temporary versus persistent Thread lifecycle.

This field was observed in Runtime output and is not treated as a guaranteed
public API field unless separately established by the OpenAPI contract.

### Formal meaning of stateless execution

The combined OpenAPI and Runtime evidence establishes:

~~~text
stateless
    != no Thread

stateless
    != no state

stateless
    != no checkpointing

stateless
    = Runtime-managed Thread lifecycle
~~~

The difference between the two execution modes is therefore primarily ownership
of Thread lifecycle.

Stateful:

~~~text
caller identifies Thread
    |
    v
Thread exists independently of one Run
~~~

Stateless:

~~~text
Runtime creates Thread
    |
    v
Run executes
    |
    v
on_completion
    |
    +-- keep
    |     -> Thread persists
    |
    +-- delete
          -> Thread removed
~~~

### Evidence

~~~text
[RUNTIME VALIDATED]

POST /runs returns Run-shaped runtime data.

Both stateless Runs received concrete Thread IDs.

on_completion=keep:
    Run -> success
    Thread -> HTTP 200
    Thread -> idle
    state preserved

on_completion=delete:
    Thread created
    execution completed
    Thread -> HTTP 404

Runtime kwargs:
    keep   -> temporary=false
    delete -> temporary=true
~~~

## 1.2C — Wait execution semantics

### Objective

Determine what the `/runs/wait` execution mode returns and how it relates to the
persisted Run lifecycle.

The experiment will compare:

- request blocking behavior;
- returned response body;
- resulting persisted Run;
- resulting Thread state.

### 1.2C results — Wait execution semantics

A stateful Run was executed through:

~~~text
POST /threads/{thread_id}/runs/wait
~~~

The HTTP request completed successfully after approximately:

~~~text
2.418 seconds
~~~

### Wait blocks until execution completion

The request remained open while the graph executed.

When the HTTP response was returned, subsequent inspection showed:

~~~text
Run.status    = success
Thread.status = idle
~~~

and the final Thread state contained:

~~~text
next  = []
tasks = []
~~~

The wait endpoint therefore provides blocking consumption of a Run execution.

### Wait returns execution output, not the Run resource

The HTTP response body was a graph-result object containing the final message
state.

It did not contain Run resource fields such as:

~~~text
run_id
thread_id
status
created_at
updated_at
~~~

This contrasts with the immediate Run-creation endpoint.

Conceptually:

~~~text
POST /threads/{thread_id}/runs
    -> returns Run resource immediately

POST /threads/{thread_id}/runs/wait
    -> waits
    -> returns graph execution result
~~~

### Wait still creates a persisted Run

After the wait request completed:

~~~text
GET /threads/{thread_id}/runs
~~~

returned exactly one Run.

That Run contained:

~~~text
status = success
~~~

with its own:

~~~text
run_id
thread_id
assistant_id
created_at
updated_at
~~~

Therefore `/runs/wait` is not a separate execution primitive.

It is a different consumption mode over the same underlying Run model.

### Persistence at response time

At the time the wait call returned:

~~~text
Run     = success
Thread  = idle
next    = []
tasks   = []
~~~

and the final checkpoint already contained the exact output marker.

The final:

~~~text
Run.updated_at
Thread.updated_at
Thread.state_updated_at
~~~

were identical in this experiment.

As in the previous lifecycle experiment, timestamp equality is recorded as an
observation rather than a platform guarantee.

### Execution versus consumption

The resulting model is:

~~~text
                     Run
                      |
           +----------+----------+
           |                     |
           v                     v
    immediate create            wait
           |                     |
           v                     v
    return Run resource    block until terminal
                                 |
                                 v
                         return graph result

           both create the same
           persisted Run resource
~~~

This establishes an important distinction:

~~~text
Run
    -> execution resource

wait
    -> execution-consumption mode
~~~

## 1.2D — Streaming execution baseline

### Objective

Determine how the streaming endpoint exposes an executing Run.

The experiment will inspect:

- HTTP content type;
- time to response headers;
- time to first event;
- stream framing;
- semantic stream event names;
- Run identity exposed by the stream;
- persisted Run after stream completion;
- final Thread and checkpoint state.

### 1.2D results — Streaming execution baseline

A stateful Run was executed through:

~~~text
POST /threads/{thread_id}/runs/stream
~~~

using:

~~~text
stream_mode = ["updates"]
~~~

### Transport

The endpoint responded with:

~~~text
Content-Type:
text/event-stream; charset=utf-8
~~~

The measured timing was approximately:

~~~text
time to HTTP headers:
    0.009 s

time to first SSE event:
    0.527 s

total stream duration:
    1.729 s
~~~

The HTTP/SSE connection is therefore established before semantic execution
events become available.

### First event

The first observed SSE event was:

~~~text
event: metadata
~~~

with data containing:

~~~text
run_id
attempt
~~~

The emitted Run ID exactly matched the Run later retrieved from the Thread Run
API.

The stream therefore provides early correlation between the live transport and
the persisted Runtime execution resource.

### `updates` semantics

After metadata, the stream emitted update events associated with graph nodes and
middleware stages.

Observed update sources included:

~~~text
SkillsMiddleware.before_agent
PatchToolCallsMiddleware.before_agent
MemoryMiddleware.before_agent
model
TodoListMiddleware.after_model
~~~

This establishes that `stream_mode=updates` represents incremental graph-state
updates attributed to execution nodes or middleware.

It should not be interpreted as token streaming.

### Persisted Run

After the stream closed:

~~~text
GET /threads/{thread_id}/runs
~~~

returned exactly one persisted Run with the same Run ID emitted by the metadata
event.

Its terminal state was:

~~~text
status = success
~~~

### Terminal Thread and state

At stream completion:

~~~text
Thread.status = idle
next          = []
tasks         = []
~~~

and the final checkpoint contained the exact output marker generated by the
Run.

Therefore, in this baseline, stream closure correlated with:

~~~text
Run terminal
Thread idle
final checkpoint persisted
~~~

### Execution versus transport versus semantic mode

The experiment establishes three distinct layers:

~~~text
Run
    -> execution resource

SSE
    -> transport and framing

stream_mode
    -> semantic content carried by the stream
~~~

The currently validated execution-consumption model is:

~~~text
                         Run
                          |
          +---------------+---------------+
          |               |               |
          v               v               v
     immediate           wait           stream
          |               |               |
          v               v               v
     return Run      block until       open SSE
     resource          terminal           |
                                         v
                                  metadata + events
~~~

All three modes operate over the same underlying persisted Run abstraction.

## 1.2E — Semantic stream modes

### Objective

Compare multiple semantic stream modes within a single execution.

The experiment will request:

- `updates`;
- `values`;
- `messages`;
- `checkpoints`.

This avoids repeating model execution unnecessarily while revealing the shape
and purpose of each semantic stream channel.

### 1.2E results — Semantic stream modes

One stateful Run was streamed while requesting four semantic modes
simultaneously:

~~~text
updates
values
messages
checkpoints
~~~

This allowed the modes to be compared within the same execution.

### Event counts

The observed SSE event counts were:

~~~text
metadata             1

updates              5
values               3
checkpoints           7

messages/metadata    1
messages/partial    13
~~~

### `updates`

Update events were keyed by the graph node or middleware stage that produced
the change.

Observed sources included:

~~~text
SkillsMiddleware.before_agent
PatchToolCallsMiddleware.before_agent
MemoryMiddleware.before_agent
model
TodoListMiddleware.after_model
~~~

`updates` therefore represents incremental graph-state changes attributed to
execution nodes or middleware.

It is a delta-oriented stream mode.

### `values`

Value events contained the accumulated graph state.

The first observed value event already contained the input human message.

Compared with `updates`:

~~~text
updates
    -> incremental delta

values
    -> accumulated state snapshot
~~~

Multiple updates can occur between value snapshots.

### `checkpoints`

Checkpoint events contained a richer execution snapshot including:

~~~text
config
parent_config
values
metadata
next
tasks
~~~

The first checkpoint had:

~~~text
metadata.source = input
metadata.step   = -1

next:
    __start__

tasks:
    __start__
~~~

Checkpoint streaming therefore exposes both application state and durable
execution-control information.

A checkpoint event should not be modeled as merely a value snapshot plus a
checkpoint ID.

### `messages`

Requesting the `messages` semantic mode did not produce one generic `messages`
event type.

The observed wire-level event types were:

~~~text
messages/metadata
messages/partial
~~~

### `messages/metadata`

One metadata event was emitted for the model invocation.

Its payload correlated the model execution with data including:

~~~text
run_id
thread_id
graph_id
assistant_id
langgraph_step
langgraph_node
checkpoint_ns
model provider
model name
~~~

This provides execution context for subsequent message chunks.

### `messages/partial`

The model response was emitted incrementally through multiple
`messages/partial` events.

The first partial event contained an AI message with empty content.

Therefore one `messages/partial` event must not be equated with one model token.

The safe interpretation is:

~~~text
messages/partial
    -> incremental model-message chunk
~~~

Chunk boundaries are transport/model/provider behavior and are not treated as
token boundaries.

### Event ordering

The observed execution interleaved multiple semantic channels.

A simplified representation is:

~~~text
metadata

checkpoint
values

checkpoint
updates

checkpoint
updates
values

checkpoint
updates
checkpoint

messages/metadata
messages/partial
messages/partial
...

updates(model)
values
checkpoint

updates(after_model)
checkpoint
~~~

This demonstrates that checkpoint persistence and state observation occur
throughout graph execution rather than only after the final model output.

The experiment does not claim that every checkpoint maps one-to-one to one
graph node.

### Semantic mode responsibilities

The validated model is:

~~~text
updates
    -> node/middleware state deltas

values
    -> accumulated state snapshots

messages
    -> incremental message/model output

checkpoints
    -> durable execution snapshots
       including control-flow information
~~~

These modes expose different layers of the Runtime rather than alternate
serializations of identical information.

### Client implications

A chat-oriented client can naturally consume:

~~~text
metadata
messages/metadata
messages/partial
~~~

for Run correlation and progressive output rendering.

Execution-oriented clients can additionally consume:

~~~text
updates
values
checkpoints
~~~

for progress visualization, state synchronization and execution inspection.

### Final persistence

After the stream closed:

~~~text
Run.status = success

ThreadState.next  = []
ThreadState.tasks = []
~~~

and the final checkpoint contained the exact output marker.

The semantic streams therefore remained correlated with the same persisted Run
and Thread state established by previous experiments.

## 1.2F — Resumable streaming contract

### Objective

Study the contract behind resumable streaming before executing it.

The next step will inspect:

- `stream_resumable`;
- the persisted stream endpoint;
- reconnect parameters;
- whether replay is Run-scoped;
- how a client identifies the point from which to resume.

Other stream modes such as `tasks`, `events`, `debug`, `custom` and
`messages-tuple` are intentionally deferred until a concrete architectural use
case requires them.

### 1.2F contract — Resumable streaming

The Runtime exposes a dedicated join endpoint:

~~~text
GET /threads/{thread_id}/runs/{run_id}/stream
~~~

Its purpose is to join an existing Run stream.

### Resumable stream gate

The join contract supports:

~~~text
Last-Event-ID
~~~

but the API explicitly requires the Run to have been created with:

~~~text
stream_resumable = true
~~~

for stream resumption.

This establishes a persistence mechanism distinct from graph checkpoint
persistence:

~~~text
checkpoint persistence
    -> graph execution state

resumable stream persistence
    -> emitted stream events
~~~

### Event cursor

The reconnect cursor uses the SSE `Last-Event-ID` convention.

The contract states:

~~~text
Last-Event-ID: <event-id>
    -> resume after the last event received

Last-Event-ID: -1
    -> stream all events
~~~

### Content-Location

The streaming Run-creation endpoint returns a `Content-Location` response
header.

The contract describes it as the URL of the created Run that can later be used
to join its stream.

Conceptually:

~~~text
POST /threads/{thread_id}/runs/stream
        |
        +-- SSE
        |
        +-- Content-Location
                |
                v
        existing Run resource
~~~

### Disconnect policies

Streaming Run creation extends the normal stateful Run contract with:

~~~text
on_disconnect:
    continue
    cancel
~~~

with `continue` as the default.

The later join endpoint independently exposes:

~~~text
cancel_on_disconnect: boolean
~~~

with `false` as the default.

These controls occur at different stream attachment points and are not treated
as interchangeable.

### Resume hypothesis

The next Runtime experiment will validate:

~~~text
create resumable stream
        |
        v
receive events with IDs
        |
        X disconnect
        |
        v
Run continues
        |
        v
reconnect with Last-Event-ID
        |
        v
receive remaining persisted events
~~~

A second replay using:

~~~text
Last-Event-ID: -1
~~~

will test whether the complete persisted stream can be replayed after Run
completion.

### 1.2F1 results — Disconnect, resume and full replay

A stateful Run was created with:

~~~text
stream_resumable = true
on_disconnect    = continue
stream_mode      = updates
~~~

The initial streaming response returned:

~~~text
Content-Location:
/threads/{thread_id}/runs/{run_id}
~~~

The Run ID in this location exactly matched the Run ID emitted by the initial
`metadata` SSE event.

### Disconnect does not cancel with `on_disconnect=continue`

The client intentionally closed the initial SSE connection after receiving the
first three events.

After disconnect, the Run was observed transitioning:

~~~text
running
    |
    v
success
~~~

Therefore, for the tested policy:

~~~text
client disconnect
    != Run cancellation
~~~

### Resume with `Last-Event-ID`

The last event ID observed before disconnect was:

~~~text
1792879233990-0
~~~

Joining:

~~~text
GET /threads/{thread_id}/runs/{run_id}/stream
Last-Event-ID: 1792879233990-0
~~~

returned subsequent persisted events beginning with a later event ID.

This validates the documented resume mechanism.

### Full replay

Joining the completed Run with:

~~~text
Last-Event-ID: -1
~~~

returned the complete persisted semantic stream for the requested `updates`
mode.

Replay remained available after:

~~~text
Run.status = success
~~~

### Initial metadata is not part of persisted replay

The live stream began with:

~~~text
event: metadata
~~~

containing:

~~~text
run_id
attempt
~~~

That event had an SSE ID but did not appear in the full historical replay.

The full replay began with semantic `updates` events instead.

Therefore the initial connection metadata appears to be connection/bootstrap
metadata rather than part of the persisted semantic stream history.

This distinction is recorded from Runtime behavior rather than inferred from
the OpenAPI schema.

### Semantic replay completeness

The original comparison:

~~~text
initial + resumed == full replay
~~~

returned false because the initial sequence included the non-replayed metadata
event.

When that connection-level metadata event is excluded, the semantic event
sequence observed before disconnect plus the resumed sequence exactly matches
the full persisted replay in this experiment.

Conceptually:

~~~text
initial semantic events
        +
resumed semantic events
        =
full persisted semantic replay
~~~

for the tested disconnect position.

### Duplicate SSE event IDs

A significant additional observation was that multiple distinct semantic events
can share the same SSE event ID.

Observed examples included:

~~~text
id = 1792879233990-0
    SkillsMiddleware.before_agent
    PatchToolCallsMiddleware.before_agent

id = 1792879235627-0
    model
    TodoListMiddleware.after_model
~~~

Therefore:

~~~text
SSE event ID
    != proven unique semantic-event identity
~~~

The ID may represent a persistence cursor or grouped stream position rather than
one unique SSE event.

The exact implementation is not inferred here.

### Open question

The current experiment disconnected only after all observed events sharing the
last event ID had already been received.

A remaining edge case is:

~~~text
event A
    id = N
    received

event B
    id = N
    not yet received

disconnect

resume:
    Last-Event-ID = N
~~~

It remains to be determined whether event B is replayed or skipped.

This behavior is operationally important for exactly-once-like client stream
consumption and will be validated before resumable streaming is considered
complete.

## 1.2F2 — Duplicate-ID resume cursor granularity

### Objective

Disconnect after the first semantic event of the initial stream and compare the
resumed sequence with a later full replay.

If multiple persisted events share that event's ID, determine whether resuming
from that ID reproduces unseen events with the same ID or begins strictly after
the entire ID group.

### 1.2F2 results — First-event disconnect

A second resumable Run disconnected immediately after the first semantic event.

The cursor event was:

~~~text
id = 1792879322666-0
event = updates
source = SkillsMiddleware.before_agent
~~~

After disconnect the Run continued:

~~~text
running
    |
    v
success
~~~

Joining with:

~~~text
Last-Event-ID: 1792879322666-0
~~~

started with the next persisted event:

~~~text
1792879322667-0
PatchToolCallsMiddleware.before_agent
~~~

The cursor event itself was not replayed.

### Duplicate-ID edge case was not triggered at the disconnect position

For the selected cursor ID:

~~~text
events observed before disconnect with ID:
    1

events in full replay with ID:
    1
~~~

Therefore no unseen same-ID event existed at that particular disconnect
position.

The original duplicate-ID question remained unresolved by this cursor.

### However, the same Run produced a later duplicate ID

The full replay contained:

~~~text
1792879324747-0
    model

1792879324747-0
    TodoListMiddleware.after_model
~~~

The completed Run therefore already contains a persisted duplicate-ID group
that can be used to test cursor semantics without another model execution.

## 1.2F3 — Duplicate-ID cursor semantics

### Objective

Use the existing completed Run and join from an SSE ID shared by two persisted
events.

Determine whether:

~~~text
Last-Event-ID = duplicated ID
~~~

replays any event carrying that same ID or advances past the complete group.

### 1.2F3 results — Duplicate-ID cursor semantics

The previously completed resumable Run contained a persisted duplicate-ID
group:

~~~text
1792879324747-0
    model

1792879324747-0
    TodoListMiddleware.after_model
~~~

A join was then performed using:

~~~text
Last-Event-ID: 1792879324747-0
~~~

The response contained:

~~~text
0 events
~~~

and no event carrying that same ID was replayed.

### Confirmed cursor semantics

This establishes that, for the tested Runtime:

~~~text
SSE ID
    != unique semantic-event identifier
~~~

and:

~~~text
Last-Event-ID
    -> advances beyond all persisted events
       sharing that cursor ID
~~~

The ID therefore behaves as a persisted stream cursor or cursor-group identity,
not as a unique identity for each SSE frame.

### Client gap risk

Consider a persisted group:

~~~text
ID = B
    event 1
    event 2
~~~

If a client:

~~~text
receives event 1
persists Last-Event-ID = B
disconnects before event 2
~~~

and later reconnects using:

~~~text
Last-Event-ID: B
~~~

the Runtime advances beyond the complete B group.

The unseen second event is therefore not replayed.

Persisting every received SSE ID immediately is not a safe resumable-stream
strategy for this Runtime.

### Safe cursor strategy

A robust client should distinguish:

~~~text
committed cursor
    -> last completely observed ID group

current cursor
    -> ID group currently being consumed
~~~

For a stream:

~~~text
A event 1
A event 2
B event 3
~~~

the transition from A to B proves that the A group is complete.

Only then should A become the durable reconnect cursor.

Conceptually:

~~~text
receive A
    -> current=A

receive A
    -> still current=A

receive B
    -> commit A
    -> current=B
~~~

If the connection fails while B is being consumed, reconnect from A.

This may replay already observed members of group B, but avoids skipping unseen
members of that group.

The resulting delivery strategy is closer to:

~~~text
at-least-once group replay
    +
idempotent or buffered client processing
~~~

than to exactly-once event delivery.

### Clean stream completion

When a stream closes normally, the final current cursor group can be treated as
complete.

For durable side effects, clients should otherwise avoid acknowledging the
current cursor group before either:

- observing the next distinct cursor ID; or
- observing normal stream completion.

### Bootstrap metadata

The initial `metadata` SSE event was previously shown not to participate in full
historical replay.

It should therefore be treated as live connection/bootstrap metadata rather
than as a durable semantic-stream cursor unless additional Runtime behavior
establishes otherwise.

### Resumable-stream model

~~~text
Run
 |
 +-- stream_resumable=true
         |
         v
 persisted semantic stream
         |
         +-- cursor A
         |    +-- event
         |    +-- event
         |
         +-- cursor B
              +-- event
              +-- event


Last-Event-ID = A
        |
        v
skip complete A group
        |
        v
replay B onward
~~~

### Evidence status

~~~text
[RUNTIME VALIDATED]

Content-Location identifies the created Run.

on_disconnect=continue:
    disconnect does not cancel Run.

Last-Event-ID:
    resumes persisted semantic stream.

Last-Event-ID=-1:
    replays persisted semantic history.

bootstrap metadata:
    not included in full replay.

SSE IDs:
    may be shared by multiple events.

duplicate cursor:
    resumes strictly after the complete cursor group.
~~~

## 1.2G — Disconnect cancellation

### Objective

Validate the opposite disconnect policy:

~~~text
on_disconnect = cancel
~~~

The experiment will disconnect a streaming request before delayed execution
begins and determine:

- whether the Run is cancelled;
- what terminal Run status represents cancellation;
- whether the Thread returns to idle;
- whether graph/model execution is avoided;
- what state remains persisted after cancellation.

### 1.2G results — Disconnect cancellation

A delayed streaming Run was created with:

~~~text
after_seconds      = 5
stream_resumable   = true
on_disconnect      = cancel
durability         = async
~~~

The client received the initial metadata event and then intentionally closed
the streaming connection.

### Cancellation lifecycle status

After disconnect, the Run transitioned to:

~~~text
Run.status = interrupted
~~~

The Runtime therefore represents this cancellation mechanism through the
existing `interrupted` Run lifecycle state rather than through a separate
`cancelled` status.

### Thread also becomes interrupted

The Thread did not return to `idle`.

Its final lifecycle state was:

~~~text
Thread.status = interrupted
~~~

The observed model is therefore:

~~~text
stream disconnect
        |
on_disconnect=cancel
        |
        v
Run interrupted
        |
        v
Thread interrupted
~~~

Cancellation preserves an interrupted execution context rather than restoring
the Thread to an idle empty state.

### Run and Thread transitions are not observationally atomic

Polling immediately after disconnect observed:

~~~text
0.009s
    Run    = interrupted
    Thread = busy

0.262s
    Run    = interrupted
    Thread = interrupted
~~~

This demonstrates that Run and Thread lifecycle transitions can have a visible
intermediate period.

A client must not assume that observing a terminal Run status implies that the
Thread lifecycle has already reached its corresponding final state.

This also qualifies earlier observations where final Run and Thread update
timestamps were equal: equal final timestamps do not establish atomic lifecycle
visibility.

### Execution-control state is preserved

The final ThreadState contained:

~~~text
next:
    SkillsMiddleware.before_agent

tasks:
    SkillsMiddleware.before_agent
~~~

This differs from successful completion, where previous experiments observed:

~~~text
next  = []
tasks = []
~~~

The cancellation therefore retained a checkpointed execution position and
pending graph task.

The experiment does not yet establish that this execution position can be
continued by another Run.

It establishes only that cancellation preserves execution-control state.

### Model execution was avoided

The final Thread state contained only the original human message.

No assistant output containing the marker was present:

~~~text
assistant_marker_found = false
~~~

The next graph node remained:

~~~text
SkillsMiddleware.before_agent
~~~

This provides strong evidence that cancellation occurred before model
inference.

### Lifecycle interruption versus graph Interrupt

The `interrupted` lifecycle status must not be conflated with the graph-level
`Interrupt` schema studied earlier.

The current experiment establishes:

~~~text
Run.status    = interrupted
Thread.status = interrupted
~~~

as a result of transport-triggered cancellation.

It does not establish that `ThreadState.interrupts` contains a graph-level
Interrupt object.

The concepts remain distinct:

~~~text
Run / Thread interrupted status
    -> lifecycle condition

ThreadState.interrupts
    -> graph-level interrupt payload
~~~

### Successful versus cancelled terminal state

The currently validated contrast is:

~~~text
successful execution:

    Run    = success
    Thread = idle
    next   = []
    tasks  = []


disconnect cancellation:

    Run    = interrupted
    Thread = interrupted
    next   = pending node
    tasks  = pending task
~~~

### Evidence

~~~text
[RUNTIME VALIDATED]

on_disconnect=cancel:
    Run -> interrupted
    Thread -> interrupted

temporary lifecycle window:
    Run=interrupted
    Thread=busy

checkpoint after cancellation:
    next and tasks preserved

model execution:
    not observed
~~~

## 1.2H — Join-stream disconnect cancellation

### Objective

Validate the independent cancellation mechanism exposed by the Run join
endpoint:

~~~text
GET /threads/{thread_id}/runs/{run_id}/stream
    ?cancel_on_disconnect=true
~~~

The experiment will keep the original creating stream attached with:

~~~text
on_disconnect=continue
~~~

while a second client joins the same active Run with:

~~~text
cancel_on_disconnect=true
~~~

The second client will disconnect after observing a persisted semantic event.

This will determine whether disconnecting a joined stream can cancel the shared
underlying Run independently of the original creator stream.

### 1.2H results — Join-stream disconnect cancellation

A Run was created through a streaming request configured with:

~~~text
on_disconnect = continue
stream_resumable = true
~~~

The original creator stream remained connected.

A second client then joined the same active Run through:

~~~text
GET /threads/{thread_id}/runs/{run_id}/stream
~~~

using:

~~~text
cancel_on_disconnect = true
~~~

The joined client received one persisted semantic event and then intentionally
closed only its own connection.

### A joined stream can cancel the shared Run

Immediately after the joined client disconnected, the shared execution was
observed as:

~~~text
0.003s
    Run    = interrupted
    Thread = busy

0.208s
    Run    = interrupted
    Thread = interrupted
~~~

The original creator stream was still connected during this transition.

Therefore:

~~~text
joined stream disconnect
        +
cancel_on_disconnect=true
        |
        v
shared Run interrupted
~~~

The cancellation behavior is global to the underlying Run rather than local to
the joined stream attachment.

### Creator attachment does not prevent cancellation

The original creator stream used:

~~~text
on_disconnect = continue
~~~

and remained open.

Nevertheless, disconnecting the joined stream configured with
`cancel_on_disconnect=true` interrupted the Run.

This rules out a model in which cancellation occurs only after all stream
consumers disconnect.

A stream attachment configured for cancellation can control the lifecycle of
the shared execution independently of other active attachments.

### Disconnect cancellation mechanisms converge

The Runtime now has two empirically validated disconnect controls:

~~~text
creator stream:

    on_disconnect=cancel


joined stream:

    cancel_on_disconnect=true
~~~

Both produced:

~~~text
Run.status    = interrupted
Thread.status = interrupted
~~~

They act at different stream attachment points but converge on the same
observable Run and Thread lifecycle outcome.

### Lifecycle interruption is distinct from graph Interrupt

The final ThreadState explicitly contained:

~~~text
interrupts = []
~~~

while:

~~~text
Run.status    = interrupted
Thread.status = interrupted
~~~

This directly validates that the lifecycle status `interrupted` does not imply
the existence of a graph-level `Interrupt` object.

The concepts are therefore distinct:

~~~text
Run / Thread status = interrupted
    -> execution lifecycle condition

ThreadState.interrupts
    -> graph-level interrupt payloads
~~~

### Execution position remained persisted

The final state contained:

~~~text
next:
    MemoryMiddleware.before_agent

tasks:
    MemoryMiddleware.before_agent
~~~

The previous disconnect-cancellation experiment stopped earlier at:

~~~text
SkillsMiddleware.before_agent
~~~

This demonstrates that cancellation preserves the execution position actually
reached by the graph rather than restoring a fixed initial state.

### Model execution was avoided

The final Thread contained only the original human message.

No assistant output marker was present:

~~~text
assistant_marker_found = false
~~~

The graph had not yet reached model execution.

### Non-atomic Run and Thread lifecycle visibility

As in the creator-disconnect cancellation experiment, there was an observable
period where:

~~~text
Run    = interrupted
Thread = busy
~~~

before the Thread became:

~~~text
interrupted
~~~

The repeated observation across two independent cancellation mechanisms
strengthens the conclusion that Run and Thread lifecycle transitions are not
necessarily atomically visible to polling clients.

### Client implication

`cancel_on_disconnect=true` should be treated as a Run lifecycle capability,
not merely as a transport preference.

For passive observers or secondary clients:

~~~text
cancel_on_disconnect = false
~~~

avoids allowing disappearance of that observer to terminate shared execution.

A client should enable cancellation on disconnect only when it intentionally
owns that lifecycle policy.

## 1.2I — Explicit Run cancellation

### Objective

Inspect and validate the explicit Run cancellation endpoint.

The goal is to compare explicit API cancellation with the two already validated
transport-triggered mechanisms:

- creator `on_disconnect=cancel`;
- joined-stream `cancel_on_disconnect=true`.

The experiment will determine:

- the request contract;
- the resulting Run status;
- the resulting Thread status;
- whether execution position is preserved;
- whether graph-level interrupts remain absent;
- whether explicit cancellation behaves like disconnect cancellation.

### 1.2I contract — Explicit Run cancellation

The Runtime exposes an explicit Thread-scoped cancellation endpoint:

~~~text
POST /threads/{thread_id}/runs/{run_id}/cancel
~~~

It accepts two query controls.

### Cancellation action

~~~text
action:
    interrupt
    rollback
~~~

with:

~~~text
interrupt
~~~

as the default.

The OpenAPI contract describes the actions as:

~~~text
interrupt
    -> cancel the Run

rollback
    -> cancel the Run
    -> delete the Run
    -> delete associated checkpoints
~~~

Cancellation therefore has at least two distinct persistence semantics.

### Wait behavior

The endpoint also exposes:

~~~text
wait: boolean
~~~

with:

~~~text
false
~~~

as the default.

The contract does not by itself establish whether `wait=true` waits only for
Run cancellation or for complete Thread lifecycle reconciliation.

That behavior will be validated empirically.

### Bulk cancellation

A second endpoint exists:

~~~text
POST /runs/cancel
~~~

It supports the same:

~~~text
action:
    interrupt
    rollback
~~~

and accepts a `RunsCancel` body.

The body supports one of two selectors:

~~~text
status:
    pending
    running
    all
~~~

or:

~~~text
thread_id
run_ids[]
~~~

The bulk endpoint therefore provides administrative cancellation over sets of
Runs, while the Thread-scoped endpoint targets one concrete execution.

Bulk cancellation is deferred until a concrete operational use case requires
it.

## 1.2I1 — Explicit interrupt cancellation

### Objective

Create a delayed stateful Run and explicitly cancel it before model execution
using:

~~~text
action=interrupt
wait=true
~~~

Then compare the result with the already validated disconnect-triggered
cancellation mechanisms.

The experiment will determine:

- the cancel endpoint response body;
- whether `wait=true` waits for Thread reconciliation;
- final Run status;
- final Thread status;
- preserved execution position;
- graph-level interrupt state;
- whether model inference was avoided.

### 1.2I1 results — Explicit interrupt cancellation

A delayed stateful Run was created with:

~~~text
after_seconds = 5
~~~

and was explicitly cancelled while still pending through:

~~~text
POST /threads/{thread_id}/runs/{run_id}/cancel
    ?action=interrupt
    &wait=true
~~~

The endpoint returned:

~~~text
HTTP 200
body = {}
~~~

after approximately:

~~~text
0.502 seconds
~~~

### Run lifecycle

The cancelled Run reached:

~~~text
Run.status = interrupted
~~~

Explicit `action=interrupt` therefore uses the same Run lifecycle status observed
for disconnect-triggered cancellation.

### Thread outcome differs by execution phase

Unlike the previous disconnect-cancellation experiments, the Thread did not end
in `interrupted`.

Immediately after the cancel request returned:

~~~text
Run.status    = interrupted
Thread.status = idle
~~~

The final Thread state remained idle.

The key difference is that this Run was still delayed and pending when
cancellation occurred.

### No execution state had been materialized

The final ThreadState contained:

~~~text
checkpoint = None
next       = []
tasks      = []
interrupts = []
messages   = []
~~~

Even the input human message had not entered persisted graph state.

This establishes that Run creation and Thread reservation can occur before graph
state materialization.

The observed execution phases are therefore:

~~~text
Run resource creation
        |
        v
pending / Thread busy
        |
        v
execution-state materialization
        |
        +-- input persisted
        +-- checkpoint created
        |
        v
graph execution
~~~

The explicit cancellation occurred before execution-state materialization.

### Cancellation is phase-sensitive

The combined Runtime evidence now distinguishes at least two cancellation
outcomes.

Cancellation before execution-state materialization:

~~~text
Run    = interrupted
Thread = idle

checkpoint = None
next       = []
tasks      = []
messages   = []
~~~

Cancellation after graph execution has begun:

~~~text
Run    = interrupted
Thread = interrupted

checkpoint retained
next/tasks retained
execution position retained
~~~

The terminal effect of cancellation therefore depends on the execution phase,
not solely on which cancellation API triggered it.

### `wait=true`

For this delayed pending Run, the explicit cancellation call returned only after:

~~~text
Run    = interrupted
Thread = idle
~~~

The immediate Thread lookup after the cancel response was already reconciled.

Therefore, in this tested case:

~~~text
wait=true
    -> behaved as a cancellation/reconciliation barrier
~~~

No claim is yet made about the exact contrast with `wait=false`, which has not
been isolated experimentally.

### Lifecycle interruption versus graph Interrupt

The final state contained:

~~~text
interrupts = []
~~~

while the Run lifecycle was:

~~~text
interrupted
~~~

This further confirms that Run lifecycle interruption and graph-level Interrupt
objects are independent concepts.

### Delayed Run timestamp anomaly

The delayed Run exposed:

~~~text
Thread.created_at:
    2026-10-24T22:11:12.382100+00:00

Run.created_at:
    2026-10-24T22:11:17.385556+00:00

Run.updated_at:
    2026-10-24T22:11:12.386947+00:00
~~~

The Run `created_at` timestamp is approximately five seconds after submission,
matching:

~~~text
after_seconds = 5
~~~

while cancellation updated the Run before that timestamp.

Therefore:

~~~text
Run.updated_at < Run.created_at
~~~

is possible for a delayed Run in the studied Runtime.

Combined with the previous delayed-Run experiment, this strongly suggests that
`Run.created_at` for delayed execution behaves as a scheduled execution
timestamp rather than a simple persistence-insertion timestamp.

This differs from the plain-language OpenAPI description:

~~~text
"The time the run was created."
~~~

The finding is recorded as an OpenAPI/Runtime semantic mismatch pending source
inspection.

### Evidence

~~~text
[RUNTIME VALIDATED]

explicit action=interrupt:
    Run -> interrupted

pending delayed cancellation:
    Thread -> idle

state:
    no checkpoint
    no messages
    no tasks
    no graph Interrupt

wait=true:
    response observed after Thread reconciliation

model inference:
    avoided
~~~

## 1.2I2 — Rollback cancellation baseline

### Objective

Validate `action=rollback` first against a delayed pending Run.

The experiment will determine whether rollback:

- removes the Run resource;
- removes it from Thread Run history;
- leaves the Thread idle;
- leaves no checkpoint or graph state;
- differs observably from `action=interrupt` for a Run that has not yet
  materialized execution state.

A later experiment can isolate rollback after checkpoint materialization if
needed.

### 1.2I2 results — Rollback of a pending delayed Run

A delayed stateful Run was created with:

~~~text
after_seconds = 5
~~~

while the Thread initially had:

~~~text
checkpoint = None
history    = []
~~~

The pending Run was cancelled through:

~~~text
POST /threads/{thread_id}/runs/{run_id}/cancel
    ?action=rollback
    &wait=true
~~~

The endpoint returned:

~~~text
HTTP 200
body = {}
~~~

after approximately:

~~~text
0.501 seconds
~~~

### Thread state was restored to baseline

After rollback:

~~~text
Thread.status = idle

checkpoint = None
next        = []
tasks       = []
interrupts  = []
messages    = []
history     = []
~~~

The Thread therefore returned to the same observable execution-state baseline
that existed before Run creation.

### The Run was not deleted

Contrary to the OpenAPI description of the rollback action, the Run remained
retrievable:

~~~text
GET /threads/{thread_id}/runs/{run_id}
    -> HTTP 200
~~~

and remained present in:

~~~text
GET /threads/{thread_id}/runs
~~~

with:

~~~text
status = interrupted
~~~

The observed checks were:

~~~text
run_deleted:
    false

run_absent_from_list:
    false

thread_idle:
    true

checkpoint_absent:
    true

history_restored_to_baseline:
    true
~~~

The OpenAPI description states that rollback deletes the Run and associated
checkpoints.

The current Runtime observation does not match the Run-deletion portion of that
description.

This is recorded as a provisional OpenAPI/Runtime semantic mismatch until
delayed cleanup and the pinned implementation are inspected.

### Pending interrupt versus pending rollback

The previous `action=interrupt` experiment and the current rollback experiment
both occurred before execution-state materialization.

Both produced:

~~~text
Run.status    = interrupted
Thread.status = idle

checkpoint = None
messages   = []
history    = []
~~~

Therefore pending cancellation does not yet expose the strongest semantic
difference between `interrupt` and `rollback`.

There were no execution checkpoints for rollback to remove.

A checkpoint-materialized Run is required to validate rollback semantics
properly.

### `wait=true`

As with explicit interrupt cancellation, the rollback request returned only
after the Thread was already reconciled to:

~~~text
idle
~~~

This strengthens the evidence that `wait=true` behaves as a cancellation
completion barrier for pending delayed Runs.

### Delayed timestamp behavior repeated

The Run exposed:

~~~text
created_at:
    2026-10-24T22:13:34.211910+00:00

updated_at:
    2026-10-24T22:13:29.213247+00:00
~~~

Again:

~~~text
updated_at < created_at
~~~

by approximately the configured:

~~~text
after_seconds = 5
~~~

This repeats the previously observed delayed-Run timestamp behavior and further
supports the interpretation that `created_at` functions as a scheduled
execution timestamp for delayed Runs in the studied Runtime.

## 1.2I2B — Rollback cleanup and implementation audit

### Objective

Before exercising rollback against materialized checkpoint history:

1. determine whether the pending rollback Run is deleted asynchronously later;
2. inspect the pinned Runtime implementation for `interrupt` versus `rollback`;
3. distinguish documented behavior from implementation behavior.

No additional model execution is required.
