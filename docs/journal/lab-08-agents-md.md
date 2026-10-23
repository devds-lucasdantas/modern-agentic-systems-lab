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
