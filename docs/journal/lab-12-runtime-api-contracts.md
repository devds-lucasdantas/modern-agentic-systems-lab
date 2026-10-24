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
