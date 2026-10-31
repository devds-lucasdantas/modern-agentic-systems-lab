# Agentic Systems Architecture Notes

This document evolves as the laboratory introduces new architectural layers.

## Version 0.2 — Interrupt 2026 Deep Agent composition

The first inspected standalone Deep Agent demonstrates three distinct framework
layers.

~~~text
Application
    |
    v
Deep Agents
    |
    | create_deep_agent
    v
LangChain
    |
    | create_agent / models / tools / middleware
    v
LangGraph
    |
    | state / runtime / checkpoints / streaming / interrupts
    v
Execution
~~~

### LangChain responsibilities observed

The workshop directly uses LangChain for:

- model initialization through `init_chat_model`;
- tool definition through `@tool`.

### Deep Agents responsibilities observed

The workshop directly uses Deep Agents for:

- `create_deep_agent`;
- filesystem backend abstraction;
- composite backend routing;
- persistent memory routing;
- always-loaded memory files;
- on-demand skills.

The Deep Agents harness also provides capabilities not explicitly declared as
application tools, such as planning/TODO behavior and filesystem capabilities.

### LangGraph responsibilities observed

Application code does not manually construct a `StateGraph`.

LangGraph appears through:

- the runtime registered in `langgraph.json`;
- underlying execution of the compiled agent;
- checkpoint/store abstractions;
- runtime state and persistence capabilities.

This demonstrates that using Deep Agents does not require application code to
manually define a LangGraph graph.

### Storage architecture

~~~text
Agent filesystem interface
          |
          v
   CompositeBackend
      /         \
     /           \
default         /memories/
   |                |
   v                v
Filesystem       StoreBackend
Backend              |
   |                  v
   v             LangGraph Store
local files
~~~

### Memory versus skills

`AGENTS.md` is configured as always-loaded agent memory/instructions.

Skills under `skills/` use progressive disclosure and are loaded on demand.

### Important security distinction

`FilesystemBackend(..., virtual_mode=True)` should not be treated as an
operating-system security sandbox.

Path virtualization and filesystem abstraction are distinct from isolated code
execution using containers, VMs or dedicated sandbox runtimes.

---

## Version 0.3 — Phase 0 consolidated architecture

Phase 0 established a broader model of a modern stateful agent application.

Detailed evidence is preserved in:

~~~text
docs/journal/lab-11-phase-0-review.md
~~~

### System model

~~~text
                         Application
                              |
                              v
                     Deep Agents harness
                              |
          +-------------------+-------------------+
          |                   |                   |
          v                   v                   v
        Tools              Middleware          Subagents
          |                   |                   |
          +-------------------+-------------------+
                              |
                              v
                    LangChain agent layer
                              |
                              v
                     Compiled LangGraph
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
       Execution state                    Runtime context
             |                                 |
             v                                 v
        Checkpointer                         Store
             |                                 |
             v                                 v
      Thread checkpoint DAG          cross-thread documents
                                               |
                                               v
                                      StoreBackend memory
~~~

### Framework boundaries

Deep Agents is the high-level harness used by the application.

It composes:

- models;
- tools;
- middleware;
- planning;
- filesystem capabilities;
- backends;
- subagents;
- human-in-the-loop;
- AGENTS.md instruction memory;
- Skills.

LangChain supplies important agent-facing abstractions including:

- model initialization;
- provider abstraction;
- structured tools;
- agent construction primitives;
- middleware infrastructure.

LangGraph provides the stateful execution substrate:

- graph state;
- channels and reducers;
- compiled execution;
- Runtime context;
- Threads;
- Runs;
- checkpoints;
- interrupts;
- Stores;
- state history;
- resumable execution.

The application does not manually construct a `StateGraph`.

`create_deep_agent()` ultimately produces a `CompiledStateGraph`.

### Runtime lifecycle

The validated Runtime model distinguishes:

~~~text
Assistant
    configured graph execution identity

Thread
    persistent execution lineage

Run
    one execution request

Checkpoint
    persisted graph-state snapshot
~~~

One Thread can contain multiple Runs.

One Run can generate multiple checkpoints.

Checkpoint history can branch:

~~~text
             checkpoint
             /   |   \
            /    |    \
           v     v     v
        branch  branch  update
~~~

Checkpoint ID identifies the snapshot.

Logical step numbers are not globally unique because different branches may
contain checkpoints at the same step.

### Historical execution

Historical checkpoints are executable.

~~~text
historical checkpoint
        |
        v
new Run
        |
        v
alternate descendant
~~~

This creates a new branch rather than destructively rolling the Thread back.

Historical state can also be modified through `update_state`.

~~~text
historical checkpoint
        |
        v
update_state
        |
        +-- reducer-aware values
        +-- as_node
        |
        v
new checkpoint
~~~

`as_node` determines the logical graph position of the update.

If the resulting checkpoint has pending `next` nodes, execution can resume
without introducing new input.

### Persistence model

Checkpoint persistence and Store persistence solve different problems.

~~~text
Checkpointer
    |
    v
execution state
    |
    v
Thread checkpoint DAG
~~~

Checkpoints enable:

- state continuity;
- human-in-the-loop pause and resume;
- historical inspection;
- branching;
- executable time travel;
- state surgery.

Store persistence has a different role:

~~~text
namespace
    +
key
    |
    v
value
~~~

The Store holds application or agent data that can cross Thread boundaries.

Therefore:

~~~text
Checkpointer
    -> execution persistence

Store
    -> application and agent data persistence
~~~

### Backend architecture

Filesystem tools are separated from physical persistence through backend
abstractions.

~~~text
Agent filesystem tools
        |
        v
CompositeBackend
     /       \
    /         \
default       /memories/
  |               |
  v               v
Filesystem      StoreBackend
Backend             |
  |                 v
  v             LangGraph Store
disk
~~~

`StateBackend` stores files in graph state.

`FilesystemBackend` stores files on the operating-system filesystem.

`StoreBackend` maps file operations to LangGraph Store entries.

`CompositeBackend` routes paths by prefix.

For the workshop memory route:

~~~text
/memories/note.txt
        |
        v
CompositeBackend
        |
        v
StoreBackend("/note.txt")
~~~

### Runtime-owned persistence

The registered Runtime graph intentionally embeds neither a custom Store nor a
custom Checkpointer.

~~~text
registered graph
    |
    +-- custom Store = None
    |
    +-- custom Checkpointer = None
    |
    v
LangGraph Runtime
    |
    +-- manages checkpoints
    |
    +-- supplies execution-context Store
~~~

`StoreBackend(store=None)` resolves the active Store through LangGraph
`get_store()` during execution.

Therefore the absence of an embedded persistence object does not mean that
Runtime persistence is absent.

Persistence ownership belongs to the Runtime.

### Long-term memory

The workshop routes `/memories/*` through `StoreBackend`.

The validated end-to-end path is:

~~~text
write_file("/memories/note.txt")
        |
        v
CompositeBackend
        |
        v
StoreBackend("/note.txt")
        |
        v
get_store()
        |
        v
Runtime Store
~~~

In the pinned workshop implementation, the legacy default namespace is:

~~~text
(
    assistant_id,
    "filesystem"
)
~~~

Thread ID is not part of that namespace.

Different Threads running the same Assistant can therefore access the same
Store-backed memory.

Production systems should replace this deprecated legacy inference with an
explicit namespace factory based on trusted Runtime identity.

### Context engineering

Different mechanisms contribute different context.

~~~text
system_prompt
      +
AGENTS.md
      +
Skill metadata
      +
on-demand Skill bodies
      +
conversation and graph state
      |
      v
model context
~~~

`AGENTS.md` acts as always-loaded instruction memory.

Its loaded snapshot can become part of checkpointed middleware state.

Skills use progressive disclosure:

~~~text
SKILL.md
    |
    +-- metadata -> catalog
    |
    +-- body -----> loaded on demand
~~~

The progressive-disclosure boundary is model context, not middleware
filesystem access.

### Subagents

Subagents provide delegation and isolation boundaries.

~~~text
Parent
   |
   | task(...)
   v
Child agent
   |
   +-- child context
   +-- child capabilities
   +-- optional specialist tools
   |
   v
compressed result
   |
   v
Parent
~~~

Observed boundaries include:

- message isolation;
- TODO isolation;
- capability isolation;
- configurable Skill scope;
- backend-dependent state behavior.

A specialist child can possess capabilities unavailable directly to the
parent.

### Human-in-the-loop

HITL creates an execution boundary before selected actions occur.

~~~text
model proposes action
        |
        v
interrupt
        |
        v
human decision
   /      |      \
approve  edit   reject
   |      |       |
   +------+-------+
          |
          v
graph continuation
~~~

Nested subagent execution can propagate interrupts into the parent Runtime
flow.

Resumable HITL depends on persisted graph state.

### Security boundaries

Several mechanisms improve isolation but are not complete security systems.

~~~text
virtual_mode
    !=
security sandbox

Store namespace
    !=
authorization

structured tool schema
    !=
runtime policy enforcement
~~~

Authentication, authorization, sandboxing, and broader security hardening
remain later-phase concerns.

### Known production gaps

Phase 0 validates architecture and behavior but does not establish production
readiness.

Remaining gaps include:

- migration away from the pinned end-of-life LangGraph API generation;
- durable production checkpoint infrastructure;
- durable production Store infrastructure;
- explicit Store namespace design;
- authentication and authorization;
- concurrency semantics;
- sandboxed execution;
- observability;
- evaluations;
- retries and resilience;
- security hardening.

Pinned-stack compatibility observations also include:

- unresolved Store point-GET namespace serialization;
- namespace response shape differing from inspected OpenAPI;
- deprecated legacy StoreBackend namespace inference;
- StoreBackend V1/V2 documentation mismatch;
- non-blocking LangChain serializer deprecation warning.

### Phase boundary

Phase 0 answered:

~~~text
How does the agent harness work internally?
~~~

Phase 1 shifts toward:

~~~text
How is the agent exposed, operated, streamed, and connected as a runtime
service?
~~~

The next subjects are:

- Agent, Thread and Run contracts;
- State and checkpoints;
- Store and persistence;
- streaming;
- background runs;
- Agent Protocol;
- Agent Streaming Protocol;
- MCP;
- A2A.

Concepts already encountered during Phase 0 should now be formalized at the
runtime API and interoperability layers rather than relearned from scratch.
---

## Version 0.4 — Phase 1 Runtime architecture

Phase 1 sections 1.1 through 1.4 formalized the service-facing execution model
that sits outside the Deep Agents harness studied during Phase 0.

Detailed Runtime evidence is preserved in:

~~~text
docs/journal/lab-12-runtime-api-contracts.md
~~~

### Runtime resource hierarchy

The validated service model is:

~~~text
Deployment
    |
    v
registered Graph
    |
    v
Assistant
    |
    v
Run
~~~

An Assistant is a configured and versionable execution identity associated with
a registered graph.

A Run is one execution attempt.

Stateful Runs execute against a caller-owned Thread.

Stateless Runs still execute through a Thread internally, but that Thread is
created and managed by the Runtime.

~~~text
stateful
    caller-owned Thread
        |
        v
       Run

stateless
    Runtime-managed Thread
        |
        v
       Run
~~~

Stateless execution therefore means Runtime-managed Thread lifecycle rather than
execution without a Thread.

### Run lifecycle versus graph execution position

Run lifecycle and persisted graph position are separate dimensions.

Observed Run statuses include:

~~~text
pending
running
success
interrupted
error
timeout
~~~

A successful Run does not necessarily mean that the graph reached `END`.

For example:

~~~text
Run.status    = success
Thread.status = interrupted
Thread.next   = ["model"]
~~~

is valid when execution reaches a configured breakpoint such as
`interrupt_before=["model"]`.

Clients that need workflow-completion semantics must inspect persisted execution
position rather than relying on Run status alone.

### Thread state and checkpoint lineage

Thread state combines application state with graph execution-control state.

Important fields include:

~~~text
values
next
tasks
checkpoint
parent_checkpoint
interrupts
~~~

Checkpoint history forms a lineage that supports:

- resume;
- historical inspection;
- time travel;
- branching;
- direct state updates.

A Thread can contain multiple Runs.

A Run can produce multiple checkpoints.

Logical step numbers do not uniquely identify historical state because branches
can contain checkpoints at the same step.

Checkpoint identity is therefore checkpoint-ID based rather than step-number
based.

### Checkpointer versus Store

Phase 1 reinforces the Phase 0 persistence boundary:

~~~text
Checkpointer
    -> execution persistence
    -> Thread state
    -> checkpoint lineage

Store
    -> application / agent persistence
    -> cross-Thread data
    -> long-term memory
~~~

The registered Runtime graph should not embed its own production Store or
Checkpointer.

Persistence ownership belongs to the Runtime.

A backend such as `StoreBackend(store=None)` can resolve the active
Runtime-supplied Store during execution.

### Run execution and consumption surfaces

The Runtime exposes several HTTP surfaces over the same underlying Run
execution primitive.

~~~text
POST /runs
    -> background stateless Run

POST /threads/{thread_id}/runs
    -> background stateful Run

POST /threads/{thread_id}/runs/wait
    -> create Run and synchronously wait for output

POST /threads/{thread_id}/runs/stream
    -> create Run and consume output through SSE

GET /threads/{thread_id}/runs/{run_id}/stream
    -> attach to an existing Run stream
~~~

These are execution-submission and consumption choices, not distinct workflow
engines.

### Streaming model

SSE streaming exposes semantic execution information including:

~~~text
updates
values
messages
checkpoints
~~~

Resumable streaming uses cursor IDs.

Multiple semantic events may share the same cursor ID.

Therefore the cursor should be treated as a replay-group boundary rather than as
a globally unique event identifier.

A safe consumer must tolerate group replay and process events idempotently.

Disconnect behavior also matters.

A streaming consumer can detach while execution continues, or cancellation can
terminate the shared Run depending on the configured disconnect behavior.

### Cancellation and rollback

Lifecycle interruption and rollback are different persistence operations.

~~~text
interrupt
    -> stop execution
    -> preserve already-materialized state
    -> Run remains as interrupted

rollback
    -> stop execution
    -> remove the superseded Run
    -> remove its checkpoint lineage
    -> restore the prior Thread state
~~~

Three distinct concepts named "interrupt" must not be conflated:

1. execution breakpoints such as `interrupt_before` / `interrupt_after`;
2. lifecycle cancellation using `action=interrupt`;
3. graph-level human-in-the-loop interrupts.

They affect Run status and persisted graph position differently.

### Multitask strategies

Stateful Run creation supports:

~~~text
reject
enqueue
interrupt
rollback
~~~

Validated behavior is:

~~~text
reject
    -> HTTP 409
    -> conflicting new Run is not persisted

enqueue
    -> new Run persists as pending
    -> execution is scheduled and serialized per Thread

interrupt
    -> supersede active/pending prior execution
    -> preserve already-materialized state
    -> new execution continues from that partial state

rollback
    -> supersede prior execution
    -> remove prior Run and its state lineage
    -> new execution continues from the pre-superseded state
~~~

The public default multitask strategy is:

~~~text
enqueue
~~~

### Thread status is not an authoritative lock

`Thread.status` is a denormalized lifecycle projection.

A validated state was:

~~~text
Thread.status = idle
Run.status    = pending
~~~

while multitask conflict detection still correctly recognized the pending Run.

Therefore:

~~~text
Thread.status == idle
~~~

must not be used as the sole test for execution availability.

### Scheduler model

The pinned in-memory scheduler:

1. considers Runs whose status is `pending`;
2. requires `created_at < now`;
3. orders eligible Runs by ascending `created_at`;
4. prevents concurrent `running` Runs on the same Thread.

`after_seconds` shifts effective eligibility by shifting the Run's effective
`created_at`.

The resulting model is therefore:

~~~text
scheduled per-Thread serialized execution
~~~

rather than strict HTTP submission FIFO.

A validated example was:

~~~text
HTTP submission:
    A -> B -> C

scheduled eligibility:
    B -> C -> A

execution:
    B -> C -> A

persisted state order:
    B -> C -> A
~~~

Queued Runs inherit state according to actual execution order.

### Durability

Durability is orthogonal to the Run consumption surface.

The supported policies are:

~~~text
sync
async
exit
~~~

#### sync

`sync` persists checkpoints incrementally.

Checkpoint persistence is awaited before the next graph superstep begins.

~~~text
step N
    |
    v
checkpoint N
    |
    v
wait for persistence
    |
    v
step N+1
~~~

#### async

`async` also persists incrementally, but persistence can overlap subsequent
graph execution.

Checkpoint persistence remains ordered.

Outstanding background persistence work is drained when the execution context
exits.

~~~text
step N
    |
    +------------------+
    |                  |
    v                  v
checkpoint N        step N+1
persistence
    |
    v
ordered persistence pipeline
~~~

#### exit

`exit` suppresses ordinary incremental checkpoint persistence.

Intermediate execution state remains in-process until the execution boundary,
where the current checkpoint and pending writes are flushed.

~~~text
intermediate execution
        |
        v
in-process state
        |
        v
execution exit
        |
        v
final durable checkpoint
~~~

Runtime validation produced:

~~~text
sync:
    history steps = [3, 2, 1, 0, -1]

async:
    history steps = [3, 2, 1, 0, -1]

exit:
    history steps = [3]
~~~

All three modes preserved the final configured interruption boundary.

The difference between `sync` and `async` is primarily temporal.

The difference between incremental durability and `exit` is also visible in the
persisted checkpoint lineage.

### Known pinned Runtime observations

Several implementation-specific observations must remain distinct from general
LangGraph contracts.

#### Explicit delayed pending rollback

A pinned in-memory Runtime bug was observed for:

~~~text
pending Run
+ delayed scheduling
+ existing queue
+ explicit action=rollback
~~~

The Run can become `interrupted` before scheduler admission, preventing the
worker rollback path from deleting it.

This is recorded as a pinned Runtime bug rather than a general rollback
contract.

#### History default drift

The OpenAPI surface describes:

~~~text
GET /threads/{thread_id}/history
limit default = 10
~~~

while the pinned in-memory Runtime implementation has an internal state-list
default of:

~~~text
limit = 1
~~~

Experiments that depend on checkpoint cardinality must therefore provide an
explicit history limit.

#### Legacy durability compatibility

The pinned durability-aware adapter is asymmetric.

~~~text
checkpoint_during=true
    -> durability=async

checkpoint_during=false
    -> no explicit durability value is produced by that branch
~~~

Older compatibility paths can map:

~~~text
durability=async
    -> checkpoint_during=true

durability=exit
    -> checkpoint_during=false
~~~

`sync` has no complete representation in the legacy boolean contract.

### Updated production gaps

The following Phase 0 gaps are now partially or fully resolved at the
architectural-learning level:

~~~text
concurrency semantics
    -> validated for the pinned Runtime

background execution
    -> validated

durability semantics
    -> validated

stream reconnect / replay
    -> validated
~~~

They are not therefore unknown architectural concepts anymore.

Production implementation gaps still include:

- production-grade checkpoint infrastructure;
- production-grade Store infrastructure;
- authentication and authorization;
- tenant isolation;
- idempotent external side effects;
- durable queue infrastructure;
- distributed worker failure semantics;
- production retry policies;
- observability and evaluations;
- sandboxed execution;
- security hardening;
- schema and deployment migration strategy;
- disaster recovery.

### Phase 1 boundary after section 1.4

Sections 1.1 through 1.4 answer:

~~~text
How does the Runtime represent, schedule, persist, interrupt, stream and expose
agent execution?
~~~

The next boundary is interoperability:

~~~text
Agent Server API boundary and interoperability mapping
LangChain Agent Streaming Protocol
MCP
A2A
~~~

The architectural question now shifts from Runtime implementation semantics to:

~~~text
Which of these Runtime concepts belong to reusable protocol contracts, and which
are LangGraph-specific implementation details?
~~~

### Version 0.4 — Agent Server protocol boundary

Phase 1 section 1.5 established the boundary between the Agent Server service
contract and interoperability protocols.

~~~text
                         external clients
                               |
              +----------------+----------------+
              |                                 |
              v                                 v
      LangGraph service                   protocol adapters
              |                                 |
              v                         +-------+-------+
        langgraph-sdk                    |               |
              |                          v               v
              v                         A2A             MCP
        Agent Server                     |               |
              +---------------+----------+---------------+
                              |
                              v
                      Runtime execution
~~~

The Agent Server owns:

- Assistant, Thread and Run resources;
- state and checkpoints;
- Store and Cron resources;
- scheduling and concurrency policy;
- durability;
- cancellation and rollback;
- persistence and authentication.

`langgraph-sdk` is the typed client for that service API.

A2A and MCP are semantic adapters over the same execution substrate:

~~~text
A2A
    Assistant -> Agent / Agent Card
    Thread -> contextId
    Thread + Run -> Task
    Run stream -> translated A2A SSE

MCP
    Assistant -> Tool
    Assistant schema -> inputSchema
    tools/call -> stateless Run wait
~~~

The adapters own protocol-facing translation of identity, schemas, messages,
lifecycle and errors.

The installed LangChain Agent Streaming Protocol remains a separate
command/event contract represented by `langchain-protocol`; the inspected
pinned source does not establish the Agent Server REST API as a direct
implementation of that contract.

This boundary is the handoff from Runtime/service architecture to the
protocol-specific remainder of Phase 1.
