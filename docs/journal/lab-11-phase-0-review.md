# Lab 11 — Phase 0 Review

## Goal

Consolidate the experimentally validated architecture developed throughout
Phase 0 into a reusable mental model for modern agentic systems built with
Deep Agents, LangChain, and LangGraph.

This review is not a chronological summary of previous labs.

It reorganizes the evidence by architectural responsibility and distinguishes
between:

- behavior validated by experiments;
- behavior verified directly in the pinned source code;
- implementation quirks observed in the pinned versions;
- production concerns intentionally deferred to later phases.

## Evidence classification

The following labels are used throughout this review.

### VALIDATED

Behavior directly demonstrated by a laboratory experiment.

### SOURCE-VERIFIED

Behavior confirmed by inspection of the pinned implementation.

### OBSERVED QUIRK

Behavior observed in the pinned environment that should not automatically be
generalized to other versions.

### PRODUCTION GAP

A capability that works in the laboratory but still requires additional work
before being considered production-ready.

### DEFERRED

A topic intentionally assigned to a later learning phase.

---

# 1. Phase 0 scope

Phase 0 studied Deep Agents as a high-level harness for building agentic
applications while progressively exposing the LangChain and LangGraph layers
underneath it.

The completed sequence covered:

~~~text
0.1  repository and environment
0.2  workshop exploration
0.3  minimal Deep Agent
0.4  planning and filesystem
0.5  custom tools
0.6  backends
0.7  subagents
0.8  human-in-the-loop
0.9  long-term memory
0.10 AGENTS.md
0.11 Skills
0.12 LangGraph Runtime and Studio
~~~

The main reference was the Interrupt 2026 Deep Agents workshop pinned to an
exact upstream commit.

The learning repository remained independent from the workshop clone so that
experiments, patches, architecture notes, and commits describe the learning
process rather than modifying upstream history.

---

# 2. Framework boundaries

## 2.1 LangChain

[SOURCE-VERIFIED]

LangChain provides important application-facing primitives used underneath the
Deep Agents harness.

Observed responsibilities include:

- model initialization through `init_chat_model`;
- model-provider abstraction;
- tool declaration through `@tool`;
- agent construction primitives used internally by Deep Agents;
- middleware composition infrastructure.

The workshop application does not need to manually construct these lower-level
pieces when using `create_deep_agent`.

## 2.2 LangGraph

[SOURCE-VERIFIED] [VALIDATED]

LangGraph provides the execution substrate.

Observed responsibilities include:

- graph state;
- channels and reducers;
- compiled graph execution;
- runtime context;
- checkpoints;
- thread state;
- interrupts;
- state history;
- Stores;
- runtime execution resources;
- resumable execution.

The workshop application does not manually create a `StateGraph`.

`create_deep_agent()` ultimately produces a compiled LangGraph object.

## 2.3 Deep Agents

[SOURCE-VERIFIED] [VALIDATED]

Deep Agents acts as the high-level agent harness.

It combines:

- model;
- tools;
- system prompt;
- middleware;
- planning;
- filesystem tools;
- backends;
- long-term memory routes;
- AGENTS.md instruction memory;
- Skills;
- subagents;
- HITL integration.

The resulting relationship is best modeled as:

~~~text
Application
    |
    v
Deep Agents
    |
    v
LangChain agent / model / tool / middleware abstractions
    |
    v
LangGraph execution substrate
~~~

Deep Agents therefore does not replace LangChain or LangGraph.

It composes them into a higher-level agent development model.

---

# 3. Agent construction model

## 3.1 `create_deep_agent`

[SOURCE-VERIFIED]

`create_deep_agent()` is the primary composition point used by the workshop.

Conceptually:

~~~text
model
tools
system prompt
memory sources
skills
backend
subagents
middleware configuration
        |
        v
create_deep_agent(...)
        |
        v
CompiledStateGraph
~~~

The final object is executable through LangGraph-style APIs such as:

~~~text
invoke
ainvoke
stream
astream
get_state
get_state_history
update_state
~~~

## 3.2 Agent versus workflow

[VALIDATED]

A Deep Agent is not equivalent to a deterministic workflow.

The framework exposes capabilities, but the model can decide dynamically:

- whether to use a tool;
- whether to create a TODO plan;
- whether to delegate to a subagent;
- which specialist to use;
- whether to inspect a Skill;
- how many tool calls are required.

Therefore:

~~~text
capability available
    !=
capability necessarily used
~~~

This distinction appeared repeatedly throughout the experiments.

---

# 4. State and execution model

## 4.1 Graph state

[VALIDATED]

Agent execution produces structured graph state rather than only a final text
response.

Observed state fields included:

- messages;
- todos;
- files;
- memory contents;
- skill metadata;
- structured-response-related state.

Middleware can add its own state channels.

## 4.2 Channels and reducers

[VALIDATED]

State fields are not all updated through simple assignment.

Channels can define reducer semantics.

The clearest Runtime example was the messages channel.

An `update_state` request supplying one new HumanMessage against a historical
checkpoint preserved the existing messages and appended the new message.

Conceptually:

~~~text
existing channel value
        +
incoming update
        |
        v
channel reducer
        |
        v
new channel value
~~~

Therefore LangGraph state updates must be understood in terms of channel
semantics rather than plain dictionary mutation.

## 4.3 Thread

[VALIDATED]

A Thread is the persistent identity for an execution lineage.

Multiple Runs can operate on the same Thread while sharing accumulated graph
state.

A Thread can also contain multiple checkpoint branches.

## 4.4 Run

[VALIDATED]

A Run is one execution request against a graph and optionally a Thread.

A Run can:

- provide new input;
- resume from a checkpoint;
- continue pending graph execution.

A Run is not the persistent conversation itself.

The Thread is the longer-lived execution identity.

## 4.5 Checkpoint

[VALIDATED]

A Checkpoint is a persisted graph-state snapshot.

A single Run can produce multiple checkpoints as graph nodes execute.

Observed checkpoint data includes:

- checkpoint ID;
- parent checkpoint;
- state values;
- next nodes;
- pending tasks;
- metadata;
- source;
- logical step;
- Run ID when applicable.

## 4.6 Checkpoint lineage

[VALIDATED]

Checkpoint history is not merely a flat sequence.

The Runtime experiments demonstrated a real branching DAG.

A historical checkpoint can have several direct descendants.

Conceptually:

~~~text
             checkpoint
             /   |   \
            /    |    \
           v     v     v
        branch  branch  state update
~~~

Checkpoint IDs uniquely identify snapshots.

`metadata.step` does not uniquely identify checkpoints.

Different branches can contain distinct checkpoints at the same logical step.

---

# 5. Planning and built-in capabilities

## 5.1 TODO planning

[VALIDATED]

Deep Agents can expose planning through TODO-related middleware and tools.

Planning is model-selected rather than mandatory.

Complex tasks caused the model to create and update plans autonomously.

Simpler tasks could complete without a TODO list.

## 5.2 Filesystem tools

[VALIDATED]

Filesystem operations are exposed through a common tool abstraction.

Observed operations include:

- listing;
- reading;
- writing;
- editing;
- globbing;
- grep-style content search;
- upload/download support at backend level.

The user-facing filesystem tool does not determine physical persistence.

The configured backend does.

---

# 6. Custom tools

## 6.1 Tool declaration

[VALIDATED]

Application tools can be exposed to the model using LangChain tool
abstractions.

The Tavily wrapper demonstrated:

~~~text
Python function
    |
    v
structured LangChain tool
    |
    v
agent tool surface
~~~

## 6.2 Structured arguments

[VALIDATED]

Tool schemas constrain model-generated arguments.

Experiments demonstrated:

- valid structured calls;
- argument coercion behavior;
- missing-required-field failures;
- invalid-type failures.

This is stronger than natural-language tool policy but is not a complete
security boundary.

## 6.3 Tool availability versus selection

[VALIDATED]

Registering a tool does not force its use.

The model performs capability selection based on context and instructions.

---

# 7. Backend model

## 7.1 Shared interface

[SOURCE-VERIFIED]

Deep Agents filesystem capabilities are separated from persistence through a
backend interface.

This enables the same logical operation to target different storage systems.

## 7.2 StateBackend

[VALIDATED]

`StateBackend` stores files inside graph state.

Properties observed:

- files are part of agent state;
- they can flow through graph execution;
- lifetime depends on state/checkpoint persistence;
- a fresh unrelated state does not automatically contain old files.

This is state-backed filesystem behavior, not physical disk persistence.

## 7.3 FilesystemBackend

[VALIDATED]

`FilesystemBackend` operates against the operating-system filesystem.

Properties observed:

- side effects exist independently of graph state;
- a fresh agent/backend can observe previously written physical files;
- persistence follows filesystem lifetime.

## 7.4 `virtual_mode`

[SOURCE-VERIFIED]

`virtual_mode=True` provides path virtualization.

It is not a security sandbox.

~~~text
path virtualization
    !=
process isolation
    !=
container sandbox
~~~

Sandboxed execution remains deferred.

## 7.5 StoreBackend

[VALIDATED] [SOURCE-VERIFIED]

`StoreBackend` maps file-like operations to LangGraph `BaseStore`.

When constructed without an explicit Store:

~~~text
StoreBackend(store=None)
        |
        v
get_store()
        |
        v
current LangGraph execution context
~~~

This allows a Runtime-managed Store to be supplied dynamically.

## 7.6 CompositeBackend

[VALIDATED] [SOURCE-VERIFIED]

`CompositeBackend` routes file paths by longest matching prefix.

The workshop configuration uses:

~~~text
default
    -> FilesystemBackend

/memories/
    -> StoreBackend
~~~

A routed path is normalized before delegation.

For example:

~~~text
/memories/runtime-proof.txt
    |
    v
/runtime-proof.txt
~~~

is passed to `StoreBackend`.

The virtual route is restored when results are returned through the composite
filesystem interface.

---

# 8. Subagents

## 8.1 Delegation contract

[VALIDATED] [SOURCE-VERIFIED]

Deep Agents exposes subagent delegation through a task-oriented interface.

A subagent can be:

- the built-in general-purpose subagent;
- declaratively configured;
- independently compiled.

## 8.2 Context isolation

[VALIDATED]

A child agent does not receive the complete parent conversation verbatim.

The framework constructs child state and returns a compressed result to the
parent.

This reduces parent-context growth and creates a delegation boundary.

## 8.3 State boundary

[SOURCE-VERIFIED] [VALIDATED]

Some parent state is intentionally excluded from the child.

Observed exclusions included:

- parent messages;
- todos;
- structured response state;
- skill metadata;
- instruction-memory contents.

Backend-related state can behave differently depending on storage semantics.

## 8.4 Capability isolation

[VALIDATED]

Custom subagents can expose capabilities that the parent does not directly
possess.

A child-only tool was successfully executed by the delegated subagent while
remaining unavailable to the parent capability surface.

## 8.5 Autonomous routing

[VALIDATED]

The parent model can autonomously decide:

- whether delegation is useful;
- which specialist should receive a task.

Delegation policy therefore combines framework capability with model behavior.

---

# 9. Human-in-the-loop

## 9.1 Interrupt boundary

[VALIDATED] [SOURCE-VERIFIED]

HITL can interrupt execution before selected actions are executed.

This creates a control boundary between:

~~~text
model proposes action
        |
        v
interrupt
        |
        v
human decision
        |
        v
execution or rejection
~~~

## 9.2 Decisions

[VALIDATED]

The studied implementation supported:

- approve;
- edit;
- reject.

Approve executes the proposed action.

Edit changes the action before execution.

Reject prevents the real action and provides synthetic feedback to the model.

## 9.3 Batched review

[VALIDATED]

Multiple proposed actions can be surfaced in one interrupt and resolved with
positional decisions.

## 9.4 Subagents

[VALIDATED]

HITL behavior can propagate through nested subagent execution.

The parent receives the nested interrupt rather than silently bypassing the
human boundary.

## 9.5 Persistence requirement

[VALIDATED]

Resumable HITL requires persisted graph state.

A checkpointer is therefore part of the execution contract for pause/resume
behavior.

---

# 10. Long-term memory

## 10.1 Store versus checkpoint

[VALIDATED]

Two persistence mechanisms serve different purposes.

~~~text
Checkpointer
    -> execution state
    -> thread history
    -> resume / interrupts / time travel

Store
    -> application or agent data
    -> namespaces
    -> cross-thread information
~~~

These mechanisms must not be treated as interchangeable.

## 10.2 Cross-thread memory

[VALIDATED]

Memory written through `StoreBackend` was successfully retrieved from another
Thread when both executions resolved to the same Store namespace.

Conversation state remained isolated while Store-backed memory was shared.

## 10.3 Namespace isolation

[VALIDATED]

A namespace factory can derive Store namespaces from Runtime context.

This enabled:

~~~text
User A
    -> namespace A

User B
    -> namespace B
~~~

on top of the same physical Store infrastructure.

## 10.4 Security precision

[VALIDATED]

Prompt instructions were unable to change the structurally selected namespace
when only the routed filesystem interface was available.

However:

~~~text
namespace isolation
    !=
complete authorization system
~~~

Direct access to unrestricted Store tools or application bugs could still
cross the intended boundary.

Authorization remains a production concern.

## 10.5 Update semantics

[VALIDATED]

Using a canonical memory key allows current semantic memory to be replaced as
preferences change.

This supports current-state memory.

It does not automatically provide event sourcing or historical memory
versioning.

---

# 11. AGENTS.md and instruction memory

## 11.1 Instruction mechanisms

[SOURCE-VERIFIED]

The Phase 0 architecture distinguishes:

~~~text
system_prompt
    -> always supplied by application construction

AGENTS.md / memory sources
    -> persistent instruction files
    -> injected into model context

Skills
    -> metadata catalog always available
    -> full instructions disclosed on demand
~~~

These are different context-engineering mechanisms.

## 11.2 Implicit loading

[VALIDATED]

AGENTS.md content becomes visible to the model without requiring the model to
explicitly call `read_file`.

## 11.3 Snapshot semantics

[VALIDATED]

Instruction memory is loaded into middleware state.

Editing the backing AGENTS.md file during an existing invocation does not
automatically invalidate the already-loaded snapshot.

## 11.4 Checkpoint interaction

[VALIDATED]

Instruction-memory middleware state can itself be checkpointed.

Therefore:

~~~text
private middleware state
    !=
ephemeral state
~~~

A resumed Thread can retain an older instruction-memory snapshot even after the
physical source file changes.

A new Thread can observe the newer source.

## 11.5 Multiple sources

[VALIDATED]

Multiple instruction-memory sources can be composed in configured order.

The framework does not establish semantic conflict resolution beyond how the
resulting instructions are presented to the model.

---

# 12. Skills and progressive disclosure

## 12.1 Skill catalog

[SOURCE-VERIFIED]

Skills are discovered from configured directories containing `SKILL.md`.

Metadata is parsed from frontmatter and assembled into a catalog.

## 12.2 Progressive disclosure

[VALIDATED]

The important boundary is model context, not filesystem I/O.

The middleware must read `SKILL.md` files to discover metadata.

However, the full skill body is not necessarily sent to the model.

Conceptually:

~~~text
middleware discovery
    -> metadata catalog

model selects relevant skill
    -> explicit file read
    -> full skill instructions
~~~

## 12.3 Relevant versus irrelevant skill

[VALIDATED]

The model read the relevant skill body while an irrelevant skill body remained
undisclosed to the model.

## 12.4 Source precedence

[VALIDATED]

Duplicate Skill names from multiple configured sources followed the observed
source precedence behavior.

Later configured sources replaced earlier metadata for the duplicate name.

## 12.5 Checkpointed catalog

[VALIDATED]

Skill metadata can persist in checkpointed middleware state.

Therefore a Thread can retain an older catalog even when an explicit file read
sees newer Skill content.

A new Thread can discover the new catalog.

## 12.6 Subagents

[VALIDATED]

Skill scope differs by subagent type.

Observed behavior included:

- custom child without Skills did not receive them;
- custom child with explicitly configured Skills received them;
- general-purpose child inherited the top-level Skills configuration.

Skill context did not automatically leak back into parent state.

---

# 13. LangGraph Runtime

## 13.1 Registered graph

[VALIDATED]

`langgraph.json` registers the compiled graph:

~~~text
deep_agent
    ->
./agent/agent.py:deep_agent
~~~

The exported object is a `CompiledStateGraph`.

## 13.2 Runtime-owned persistence

[VALIDATED]

A registered graph must not embed unsupported custom persistence objects when
the LangGraph API Runtime owns those responsibilities.

The workshop was split into two construction modes.

Runtime export:

~~~text
custom Store = None
custom Checkpointer = None
~~~

Standalone execution:

~~~text
explicit process-local Store when required
~~~

## 13.3 Assistant

[VALIDATED]

An Assistant represents a configured graph execution identity.

The Runtime created a default Assistant associated with the registered
`deep_agent` graph.

## 13.4 Thread

[VALIDATED]

Threads are Runtime resources representing persistent execution lineages.

## 13.5 Runtime-managed checkpoints

[VALIDATED]

Although the exported graph reported:

~~~text
graph.checkpointer = None
~~~

Runtime executions still produced persisted checkpoints.

Therefore:

~~~text
graph has no embedded custom Checkpointer
    !=
Runtime has no checkpoint persistence
~~~

## 13.6 Cross-run continuity

[VALIDATED]

A second Run on the same Thread observed state produced by the first Run.

The accumulated message history confirmed continuity independently of provider
prompt caching.

## 13.7 Historical state

[VALIDATED]

Historical state can be retrieved directly by checkpoint ID.

The retrieved state represents that exact historical graph snapshot rather
than the current Thread HEAD.

## 13.8 Executable time travel

[VALIDATED]

A stateful Run can select an earlier checkpoint and create a new descendant
lineage.

The previous descendant remains addressable.

Therefore historical execution behaves as branching rather than destructive
rollback.

## 13.9 Thread HEAD

[VALIDATED]

Running from a historical checkpoint moves the current Thread HEAD to the new
branch tip while preserving other historical descendants.

## 13.10 State surgery

[VALIDATED]

`update_state` can create a new checkpoint from a historical checkpoint without
executing the model.

The operation can:

- apply reducer-aware state changes;
- select a historical base;
- create a new descendant;
- identify the logical node through `as_node`;
- establish the next execution position;
- move Thread HEAD.

## 13.11 Resume after state surgery

[VALIDATED]

A checkpoint with pending `next` nodes is an executable continuation point.

The experiment:

~~~text
historical checkpoint
    |
    v
update_state
    |
    v
manual HumanMessage
    |
    v
pending middleware node
    |
    v
resume with no new input
    |
    v
normal graph execution
    |
    v
model consumes modified state
~~~

completed successfully.

## 13.12 Runtime Store

[VALIDATED]

The Runtime exposes namespace/key/value Store operations independently of
Thread checkpoint state.

The Store supports:

- put;
- search/list;
- namespace listing;
- delete;
- optional indexing controls;
- TTL fields in the API contract.

## 13.13 Runtime StoreBackend integration

[VALIDATED]

The end-to-end experiment demonstrated:

~~~text
Writer Thread
    |
    v
write_file("/memories/...")
    |
    v
CompositeBackend
    |
    v
StoreBackend
    |
    v
get_store()
    |
    v
Runtime Store
~~~

A second empty Thread running the same Assistant then read the same memory.

This proves that the Runtime supplied the Store required by `StoreBackend`.

---

# 14. Consolidated architecture

The final Phase 0 system model is:

~~~text
                         APPLICATION
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

Filesystem persistence is separately routed through backend abstractions:

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

Context engineering overlays the execution architecture:

~~~text
system_prompt
      +
AGENTS.md
      +
Skill metadata
      +
on-demand Skill bodies
      +
conversation / graph state
      |
      v
model request context
~~~

---

# 15. Validated invariants

The following statements were repeatedly supported by Phase 0 experiments.

1. Deep Agents compiles to LangGraph rather than replacing LangGraph.

2. Application code can use Deep Agents without manually creating a
   `StateGraph`.

3. Tool availability does not imply tool invocation.

4. Backend choice determines filesystem persistence semantics.

5. Store and Checkpointer solve different persistence problems.

6. Thread and Run are different lifecycle concepts.

7. One Run can generate multiple checkpoints.

8. Checkpoint history can branch.

9. Historical checkpoint execution is not destructive rollback.

10. Reducers affect `update_state` semantics.

11. `as_node` affects executable control-flow positioning.

12. Pending checkpoints can be resumed without new input.

13. Private middleware state can still be checkpointed.

14. Store-backed memory can cross Thread boundaries.

15. Store namespaces can provide structural memory isolation.

16. AGENTS.md is always-loaded instruction memory, not a Skill.

17. Skills use progressive disclosure at the model-context boundary.

18. Subagents create capability and context boundaries.

19. HITL controls action execution rather than merely asking the model for a
    second opinion.

20. Runtime-owned persistence can exist even when the exported graph embeds no
    Store or Checkpointer object.

---

# 16. Observed quirks in the pinned stack

## 16.1 LangGraph API version

[OBSERVED QUIRK] [PRODUCTION GAP]

The workshop's pinned Runtime uses an old `langgraph-api` generation.

The development server reported the installed API version as end-of-life.

The workshop remains pinned for reproducibility rather than upgraded in place.

A current-version migration must be performed separately.

## 16.2 Store point GET

[OBSERVED QUIRK]

The OpenAPI-described point lookup returned `null` for the attempted repeated
query-parameter namespace encoding even though Store search proved the item
existed.

Exact query serialization remains unresolved for the pinned API.

## 16.3 Namespace response shape

[OBSERVED QUIRK]

The observed namespace-list response was wrapped as:

~~~json
{
  "namespaces": [...]
}
~~~

while the inspected OpenAPI schema described an array response directly.

## 16.4 StoreBackend namespace behavior

[OBSERVED QUIRK] [PRODUCTION GAP]

The workshop currently relies on legacy `assistant_id` namespace detection in
`StoreBackend`.

The pinned source marks this mechanism as deprecated.

Production code should use an explicit namespace factory.

## 16.5 StoreBackend format documentation

[OBSERVED QUIRK]

The executable constructor defaults to V2 file representation while the pinned
docstring still refers to V1 as the default.

## 16.6 Serializer warning

[OBSERVED QUIRK]

The pinned environment emits a LangChain pending-deprecation warning regarding
the future default of `allowed_objects`.

The warning was non-blocking during Phase 0.

---

# 17. Production gaps

Phase 0 demonstrates architecture and behavior.

It does not claim production readiness.

## 17.1 Persistent production infrastructure

[PRODUCTION GAP]

The development Runtime uses in-memory infrastructure.

Production persistence requires durable implementations and operational
configuration.

## 17.2 Authentication and authorization

[DEFERRED] [PRODUCTION GAP]

Memory namespaces provide structural isolation but are not a complete
authorization model.

Authentication, RBAC, tenancy, and identity propagation belong to Phase 4.

## 17.3 Durable Store namespace design

[PRODUCTION GAP]

Production systems should use an explicit namespace factory based on trusted
runtime identity rather than deprecated assistant metadata inference.

## 17.4 Concurrency

[PRODUCTION GAP]

The memory update experiments did not establish a concurrency-control strategy
for simultaneous writes to the same semantic memory.

## 17.5 Sandbox

[DEFERRED]

Filesystem virtualization is not secure execution isolation.

Sandbox architecture remains a later phase topic.

## 17.6 Observability

[DEFERRED]

The laboratory inspected execution state and provider metadata but has not yet
designed production tracing, metrics, alerting, or SLOs.

## 17.7 Evaluations

[DEFERRED]

No complete evaluation harness has yet been established for:

- quality;
- tool correctness;
- retrieval quality;
- regression testing;
- agent policy behavior.

## 17.8 Resilience

[DEFERRED]

Retry policy, idempotency, partial failure handling, backpressure, and recovery
remain production topics.

## 17.9 Security hardening

[DEFERRED]

The laboratory demonstrated important trust boundaries but has not yet
performed a comprehensive agent-security review.

---

# 18. Historical questions

## 18.1 Resolved during Phase 0

The initial questions that were resolved include:

- where LangChain ends and LangGraph begins in the workshop;
- what Deep Agents adds;
- how the Deep Agent is constructed;
- how tools reach the model;
- how AGENTS.md is loaded;
- how Skills are discovered;
- how Store and Checkpointer differ;
- how memory crosses Threads;
- how subagents isolate context and capabilities;
- how HITL pauses and resumes execution;
- how Runtime Threads, Runs, and checkpoints interact.

The AGENTS.md runtime questions were answered through the later 0.10
experiments.

The Skills runtime questions were answered through the later 0.11 experiments.

## 18.2 Deferred questions

The following initial questions intentionally remain for later phases:

~~~text
Agent Protocol
    -> Phase 1

Agent Streaming Protocol
    -> Phase 1

MCP
    -> Phase 1

A2A
    -> Phase 1

AG-UI
    -> Phase 2
~~~

These are not unresolved Phase 0 failures.

They are explicit roadmap boundaries.

---

# 19. Phase 1 handoff

Phase 0 established the internal architecture of a modern agent harness.

Phase 1 should move outward from the agent internals toward runtime contracts
and interoperability.

The planned topics are:

~~~text
Agent, Thread and Run
State and checkpoints
Store and persistence
Streaming
Background runs
Agent Protocol
Agent Streaming Protocol
MCP
A2A
~~~

Some of these concepts were already encountered experimentally in Phase 0,
especially:

- Assistant;
- Thread;
- Run;
- checkpoints;
- Store.

Phase 1 should not simply repeat those experiments.

Instead, it should formalize their API contracts, lifecycle semantics,
streaming behavior, interoperability boundaries, and production-shaped usage.

The transition can therefore be summarized as:

~~~text
Phase 0
    "How does the agent harness work internally?"

Phase 1
    "How is that agent exposed, executed, streamed, and connected as a runtime
     service?"
~~~

---

# 20. Phase 0 conclusion

Phase 0 demonstrated that a modern agentic application is not merely:

~~~text
LLM + tools
~~~

The validated system is closer to:

~~~text
model
+ tools
+ structured state
+ middleware
+ planning
+ context engineering
+ delegated agents
+ HITL
+ checkpoint persistence
+ long-term Store
+ runtime execution semantics
+ explicit trust boundaries
~~~

Deep Agents provides a productive high-level harness for composing those
capabilities.

LangChain supplies important agent, model, tool, and middleware abstractions.

LangGraph supplies the underlying stateful execution and persistence model.

Understanding where each responsibility lives is more important than the
specific convenience API used to create the agent.

That architectural boundary is the primary outcome of Phase 0.
