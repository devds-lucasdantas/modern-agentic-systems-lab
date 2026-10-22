# Lab 06 — Human-in-the-Loop

## Goal

Understand and validate how Deep Agents and LangGraph implement human approval
boundaries around tool execution.

This lab focuses on:

- `HumanInTheLoopMiddleware`;
- `interrupt_on`;
- `HITLRequest`;
- approve / edit / reject decisions;
- LangGraph `interrupt()`;
- `Command(resume=...)`;
- checkpointers;
- thread identity;
- pause/resume semantics.

## 0.8A — Static Architecture

### Middleware position

`HumanInTheLoopMiddleware` operates after the model has produced an AIMessage
containing tool calls and before gated tool calls are allowed to execute.

Conceptually:

~~~text
model
  |
  v
AIMessage(tool_calls)
  |
  v
HumanInTheLoopMiddleware.after_model()
  |
  +-- auto-approved tool
  |
  +-- gated tool -> interrupt
~~~

### interrupt_on

The middleware receives a mapping:

~~~text
tool name -> policy
~~~

A tool absent from the mapping is automatically approved.

A boolean value of:

~~~text
True
~~~

expands to:

~~~text
approve
edit
reject
~~~

while:

~~~text
False
~~~

means the tool is not interrupted.

An explicit `InterruptOnConfig` can limit the allowed decisions.

### HITL request

Interrupted tool calls are represented as a `HITLRequest` containing:

~~~text
action_requests[]
review_configs[]
~~~

Each action request includes:

~~~text
name
args
description
~~~

Each review configuration includes:

~~~text
action_name
allowed_decisions
~~~

Multiple gated tool calls from one model response are collected into one HITL
request.

### Pause

The middleware calls:

~~~text
interrupt(hitl_request)
~~~

On the first invocation, LangGraph raises a resumable graph interrupt and
surfaces the request to the caller.

The graph execution stops at this point.

### Checkpointer requirement

LangGraph interrupts require a checkpointer.

The checkpointer preserves execution state so that a later invocation can
continue the same interrupted thread.

Therefore:

~~~text
Store
    !=
Checkpointer
~~~

A Store represents application-oriented persistent data.

A Checkpointer represents graph/thread execution state and enables pause/resume.

### Thread identity

The initial invocation and the resume invocation must reference the same
execution thread, normally through:

~~~text
configurable.thread_id
~~~

Conceptually:

~~~text
thread A
  |
  +-- invoke
  |     |
  |     +-- interrupt
  |
  +-- Command(resume=...)
        |
        +-- continue thread A
~~~

### Resume

Execution resumes by invoking the graph with:

~~~python
Command(
    resume={
        "decisions": [...]
    }
)
~~~

For HumanInTheLoopMiddleware, one decision is required for every interrupted
tool call.

### Decision types

The built-in decision types are:

~~~text
approve
edit
reject
~~~

Approve preserves the original tool call.

Edit replaces the requested tool name and/or arguments while preserving its
tool-call identity.

Reject supplies an artificial error ToolMessage representing the human
rejection.

The exact runtime behavior of all three branches will be validated
experimentally rather than inferred solely from source.

### Node re-execution

LangGraph `interrupt()` has an important execution property.

When resumed, the containing node starts executing again from the beginning.

Conceptually:

~~~text
node
  |
  +-- code before interrupt
  |
  +-- interrupt()
        |
        +-- pause

resume
  |
  v
node starts again
~~~

The matching interrupt call then returns the supplied resume value.

This means side effects performed before an interrupt in a custom node may run
again during resume and should therefore be designed carefully.

### Deep Agents wiring

`create_deep_agent()`:

- installs HumanInTheLoopMiddleware when `interrupt_on` is provided;
- passes the configured checkpointer into the underlying agent graph;
- applies top-level `interrupt_on` to the main agent;
- allows declarative synchronous subagents to inherit the parent policy;
- lets declarative subagents override it;
- does not automatically inject the policy into precompiled or remote
  subagents.

## Next

The next experiments validate real pause/resume behavior using a deterministic
custom tool:

~~~text
0.8B1 approve
0.8B2 edit
0.8B3 reject
~~~

The first experiment must prove that a gated tool has not executed when the
interrupt is surfaced, executes only after approval, and executes exactly once.
