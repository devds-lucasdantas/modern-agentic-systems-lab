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
