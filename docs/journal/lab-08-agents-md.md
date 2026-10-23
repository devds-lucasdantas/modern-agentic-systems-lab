# Lab 08 — AGENTS.md and Instruction Memory

## Goal

Understand how Deep Agents loads file-based agent instructions through the
`memory=` parameter and distinguish this mechanism from long-term application
memory backed by BaseStore.

This lab focuses on:

- `MemoryMiddleware`;
- `AGENTS.md`;
- system-prompt injection;
- multiple memory sources;
- backend loading;
- state caching;
- agent-editable instructions;
- reload semantics.

## 0.10A — Static Architecture

### Three instruction mechanisms

Deep Agents exposes three related but distinct mechanisms:

~~~text
system_prompt
    -> always present
    -> supplied directly by application code
    -> intended for core identity and immutable rules

memory=["/AGENTS.md"]
    -> file-backed instructions
    -> loaded into model system context
    -> file can potentially be edited through filesystem tools

skills=["/skills/"]
    -> task-specific capabilities
    -> progressive disclosure
    -> full skill content loaded on demand
~~~

### Important terminology

The `memory=` parameter is not the same mechanism as the long-term memory
validated in Lab 07.

~~~text
Lab 07 long-term memory
    -> StoreBackend
    -> BaseStore
    -> /memories/*
    -> cross-thread user/application data

Deep Agents memory=
    -> MemoryMiddleware
    -> AGENTS.md-style files
    -> memory_contents graph state
    -> system-prompt injection
~~~

For clarity, this lab refers to `memory=` as **instruction memory**.

### Middleware wiring

When `memory` is configured, `create_deep_agent()` adds:

~~~text
MemoryMiddleware(
    backend=backend,
    sources=memory,
)
~~~

to the middleware stack.

Therefore `create_deep_agent()` does not itself read AGENTS.md at graph
construction time.

The actual file loading occurs during agent execution.

### Loading phase

Before agent execution, MemoryMiddleware resolves the configured backend and
downloads all configured source files.

Conceptually:

~~~text
memory sources
    |
    v
backend.download_files(...)
    |
    v
memory_contents
    |
    v
graph state
~~~

Missing files are skipped when the backend reports `file_not_found`.

Other backend errors are propagated.

### State cache

MemoryMiddleware checks:

~~~text
memory_contents already present in state?
~~~

If yes, it does not load the files again.

Therefore instruction memory is cached in graph state after loading.

The runtime implications of this cache, especially after editing AGENTS.md,
must be validated experimentally.

### Model-request injection

Before a model call, the middleware reads:

~~~text
state["memory_contents"]
~~~

formats the configured sources, and appends the result to the system message.

Conceptually:

~~~text
base/system prompt
        |
        +
formatted instruction memory
        |
        v
effective model system context
~~~

AGENTS.md therefore influences the model through system context rather than as a
normal user message.

### Multiple sources

Multiple files can be configured:

~~~python
memory=[
    "/global/AGENTS.md",
    "/project/AGENTS.md",
]
~~~

Sources are loaded and formatted in configured order.

Each section includes the source path together with its content.

Exact precedence semantics should not be assumed merely from source order;
conflicting instructions will be tested separately if needed.

### Backend factories

If the Deep Agent backend is a factory, MemoryMiddleware resolves it using a
ToolRuntime-like object containing run-scoped state, context, Store, config,
and stream information.

This makes context-dependent instruction backends possible.

### Open questions

Static inspection leaves several runtime questions:

1. Is AGENTS.md visible to the model without an explicit read_file call?
2. Does editing AGENTS.md affect later model calls in the same invocation?
3. Does a fresh invocation reload an edited file?
4. What happens with a checkpointer when `memory_contents` persists in thread state?
5. How do multiple instruction files compose when they conflict?

These are validated incrementally in the following experiments.

## 0.10A2 — Memory State and Prompt Injection

### Private state

MemoryMiddleware extends agent state with:

~~~text
memory_contents: dict[str, str]
~~~

This field is marked as private state and is therefore intended for internal
middleware use rather than final agent output.

Conceptually:

~~~text
configured memory files
        |
        v
backend.download_files(...)
        |
        v
memory_contents
        |
        v
private graph state
~~~

### Exact system wrapper

Loaded instruction memory is injected using:

~~~text
<agent_memory>
...
</agent_memory>

<memory_guidelines>
...
</memory_guidelines>
~~~

The agent-memory section includes both source paths and file contents.

Therefore the model can distinguish which configured file a section came from.

### Built-in memory policy

MemoryMiddleware injects more than the configured AGENTS.md content.

It also adds built-in memory guidelines that instruct the model to:

- learn from user feedback;
- save durable preferences and reusable information;
- update memory immediately when appropriate;
- avoid storing transient facts;
- avoid storing credentials and secrets;
- use filesystem editing tools to maintain instruction memory.

Therefore `memory=` is not merely a file-include mechanism.

It also activates a self-learning behavioral policy.

### System-message composition

Memory content is appended as an additional text content block to the existing
SystemMessage.

Existing system-message content blocks are preserved.

Conceptually:

~~~text
existing system message
        |
        +
instruction-memory block
        |
        v
effective model request
~~~

### Cached snapshot

MemoryMiddleware stores loaded files in:

~~~text
state["memory_contents"]
~~~

and skips loading when that field already exists.

FilesystemMiddleware contains no logic that updates `memory_contents` when a
memory source file is written or edited.

This strongly suggests:

~~~text
AGENTS.md loaded
      |
      v
memory_contents snapshot
      |
      +---- filesystem edit changes backend file
      |
      +---- cached snapshot may remain unchanged
~~~

The runtime consequences are not assumed yet and will be tested experimentally.

### Open runtime questions

The remaining important questions are:

1. Can AGENTS.md influence a model response without explicit file reads?
2. Does an edit affect a later model call in the same invocation?
3. Does a fresh invocation reload the modified file?
4. How does checkpointed state affect reload behavior?

## 0.10B — Implicit AGENTS.md Loading

### Objective

Prove that an AGENTS.md source configured through `memory=` influences the
model without requiring the model to discover or explicitly read the file.

### Setup

The virtual filesystem contained:

~~~text
/AGENTS.md
~~~

with a deterministic instruction requiring:

~~~text
SENTINEL_AGENT_7319
~~~

The Deep Agent was configured with:

~~~python
memory=["/AGENTS.md"]
~~~

using StateBackend.

### Execution

The user asked which sentinel the agent was required to use.

The complete visible trace was:

~~~text
HumanMessage
    |
    v
AIMessage
    |
    +-- SENTINEL_AGENT_7319
~~~

No filesystem discovery or read operation occurred.

Specifically, the agent did not call:

~~~text
ls
read_file
grep
glob
~~~

### Assertions

All assertions passed:

~~~text
final answer is exact sentinel                                 PASS
no filesystem discovery/read tool was used                     PASS
AGENTS.md remained available in StateBackend                   PASS
~~~

### Main lesson

AGENTS.md configured through `memory=` is not a file that the model must decide
to discover and read.

MemoryMiddleware loads it before model execution and injects its content into
the model's system context.

~~~text
AGENTS.md
    |
    v
MemoryMiddleware
    |
    v
private memory_contents state
    |
    v
system context
    |
    v
model
~~~

Explicit filesystem access to the same file remains a separate capability.

## 0.10C — Editing AGENTS.md During an Invocation

### Objective

Determine whether editing a configured AGENTS.md source immediately updates the
instruction-memory content used by later model calls in the same invocation.

### Initial instruction memory

The agent started with:

~~~text
CURRENT_SENTINEL=OLD_SENTINEL_4182
~~~

configured through:

~~~python
memory=["/AGENTS.md"]
~~~

MemoryMiddleware loaded this content before execution.

### Runtime edit

During the invocation, the model called:

~~~text
edit_file(
    /AGENTS.md,
    OLD_SENTINEL_4182
        ->
    NEW_SENTINEL_9057
)
~~~

The tool succeeded.

The backend file then contained:

~~~text
CURRENT_SENTINEL=NEW_SENTINEL_9057
~~~

and no longer contained the old value.

### Same-invocation model context

After the successful edit, the next model call was instructed to report the
sentinel present in its preloaded instruction-memory context rather than infer
the value from tool-call history.

It returned:

~~~text
OLD_SENTINEL_4182
~~~

Therefore the backend file and active instruction-memory snapshot had diverged:

~~~text
backend file
    -> NEW_SENTINEL_9057

memory_contents snapshot
    -> OLD_SENTINEL_4182
~~~

### No automatic invalidation

The agent did not perform any filesystem reread after editing the file.

Static inspection had already shown that FilesystemMiddleware does not update
`memory_contents`.

The runtime result confirms the consequence:

~~~text
edit AGENTS.md
    !=
invalidate/reload MemoryMiddleware snapshot
~~~

during the same execution.

### Fresh invocation

A second independent invocation was started with the updated backend file.

No filesystem discovery or explicit read tool was called.

MemoryMiddleware loaded the file again and the model returned:

~~~text
NEW_SENTINEL_9057
~~~

### Assertions

All assertions passed:

~~~text
first invocation edited AGENTS.md                                PASS
first invocation did not reread after edit                       PASS
backend file now contains NEW sentinel                           PASS
backend file no longer contains OLD sentinel                     PASS
same invocation reported OLD cached sentinel                     PASS
fresh invocation used no filesystem read tools                   PASS
fresh invocation reported NEW sentinel                           PASS
~~~

### Runtime model

~~~text
Invocation 1
────────────
AGENTS.md v1
    |
    v
memory_contents v1
    |
    v
model call
    |
    +-- edit AGENTS.md -> v2
    |
    v
later model call
    |
    +-- memory_contents still v1


Independent Invocation 2
────────────────────────
AGENTS.md v2
    |
    v
new memory_contents v2
    |
    v
model call
~~~

### Main lesson

File-backed instruction memory and the active model instruction snapshot have
different lifecycles.

Editing AGENTS.md updates the backend immediately but does not automatically
rewrite the MemoryMiddleware snapshot already active in the current execution.

The edit therefore reliably affects a later fresh load, not necessarily the
current run.

## 0.10D — Checkpointed Instruction-Memory Snapshot

### Objective

Determine whether the cached `memory_contents` snapshot survives across
multiple `invoke()` calls when the same LangGraph thread is persisted through a
checkpointer.

### Setup

The agent used:

~~~text
StateBackend
MemoryMiddleware
InMemorySaver checkpointer
same thread_id
~~~

The initial AGENTS.md contained:

~~~text
CURRENT_SENTINEL=CHECKPOINT_OLD_3141
~~~

### First invocation

The first invocation loaded the instruction file and returned:

~~~text
CHECKPOINT_OLD_3141
~~~

Inspection of the checkpoint showed:

~~~text
memory_contents
    -> present
    -> contains CHECKPOINT_OLD_3141
~~~

Therefore the private MemoryMiddleware state was persisted in checkpoint state.

### Private does not mean ephemeral

`memory_contents` is declared using `PrivateStateAttr`.

The experiment demonstrates that, in this version, private state can still be
present in checkpoint channel values.

Therefore:

~~~text
PrivateStateAttr
    !=
ephemeral / non-checkpointed state
~~~

Here, "private" primarily concerns the agent state interface rather than
checkpoint lifetime.

### Editing AGENTS.md

A second invocation in the same thread edited the backend file:

~~~text
CHECKPOINT_OLD_3141
        ->
CHECKPOINT_NEW_9265
~~~

The backend file successfully changed to the NEW value.

However:

~~~text
model response
    -> CHECKPOINT_OLD_3141

checkpoint memory_contents
    -> CHECKPOINT_OLD_3141
~~~

The file edit did not invalidate the cached instruction-memory snapshot.

### Third invocation in the same thread

A later `invoke()` using the same thread_id still returned:

~~~text
CHECKPOINT_OLD_3141
~~~

and checkpoint inspection still showed the OLD snapshot.

The lifecycle was therefore:

~~~text
checkpoint restores memory_contents
        |
        v
MemoryMiddleware.before_agent()
        |
        +-- memory_contents already exists
        |
        v
skip backend reload
~~~

### New thread

A different thread_id started without checkpointed `memory_contents`.

MemoryMiddleware therefore loaded the already-updated backend file.

The model returned:

~~~text
CHECKPOINT_NEW_9265
~~~

and the new thread's checkpoint contained the NEW version.

### Assertions

All assertions passed:

~~~text
initial model sees OLD                                             PASS
memory_contents persisted in checkpoint                            PASS
checkpoint initially contains OLD                                  PASS
backend file changed to NEW                                        PASS
edit invocation still reports OLD                                  PASS
checkpoint remains OLD after file edit                             PASS
same-thread later invocation reports OLD                           PASS
same-thread checkpoint still contains OLD                          PASS
new thread reports NEW                                             PASS
new-thread checkpoint contains NEW                                 PASS
~~~

### Correct cache model

Without checkpoint continuity, a fresh invocation can load the current backend
file.

With checkpoint continuity, the more accurate rule is:

~~~text
new invoke
    !=
fresh instruction-memory load
~~~

A reload occurs when execution state does not already contain
`memory_contents`.

Therefore instruction-memory snapshot lifetime is closer to:

~~~text
graph/thread state lifetime
~~~

than to:

~~~text
single invoke lifetime
~~~

### Operational implication

An agent can edit its AGENTS.md and successfully persist a new instruction
without that instruction becoming active in its current checkpointed thread.

Applications that require immediate adoption of new instruction memory need an
explicit cache invalidation or reload strategy.

### Main lesson

Three different truths can coexist:

~~~text
backend AGENTS.md
    -> NEW

checkpointed memory_contents
    -> OLD

effective model system context
    -> OLD
~~~

File persistence and active instruction context therefore have independent
lifecycles.
