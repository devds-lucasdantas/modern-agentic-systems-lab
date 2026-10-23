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
