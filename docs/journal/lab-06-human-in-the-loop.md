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

## 0.8B1 — Approve

### Objective

Validate a real Human-in-the-Loop pause/resume cycle and prove that a gated
tool does not execute before human approval.

### Setup

A deterministic custom tool was created:

~~~text
gated_probe(value)
~~~

The tool records every real execution in an external Python list and returns:

~~~text
GATED_RESULT=<value * 3>
~~~

The agent was configured with:

~~~text
interrupt_on = {
    "gated_probe": {
        "allowed_decisions": [
            "approve",
            "edit",
            "reject",
        ]
    }
}
~~~

and an InMemorySaver checkpointer.

### Initial invocation

The model proposed:

~~~text
gated_probe(value=17)
~~~

The graph returned:

~~~text
__interrupt__
messages
~~~

rather than executing the tool.

The surfaced HITL request contained one action request:

~~~text
name: gated_probe
args:
  value: 17
~~~

with:

~~~text
approve
edit
reject
~~~

as allowed decisions.

### Tool execution boundary

Immediately after the interrupt:

~~~text
tool events: 0
~~~

Therefore the gated operation had not executed.

The parent message state at the pause contained only:

~~~text
HumanMessage
AIMessage(tool_call=gated_probe)
~~~

There was no ToolMessage yet.

### Resume

The same thread was resumed with:

~~~python
Command(
    resume={
        "decisions": [
            {"type": "approve"}
        ]
    }
)
~~~

Only after the resume did the external instrumentation record:

~~~text
gated_probe(value=17)
-> GATED_RESULT=51
~~~

exactly once.

### Final message trace

After approval:

~~~text
HumanMessage
    |
    v
AIMessage
    |
    +-- gated_probe(value=17)
    |
    v
ToolMessage
    |
    +-- GATED_RESULT=51
    |
    v
AIMessage
    |
    +-- GATED_RESULT=51
~~~

### Main lesson

Human-in-the-loop approval gates tool execution before the tool side effect
occurs.

~~~text
tool proposal
    |
    v
interrupt
    |
    v
human approval
    |
    v
actual tool execution
~~~

The checkpointer and thread identity make it possible to pause and later resume
the same graph execution.

### Instrumentation note

The original experiment printed the pre-approval event count correctly as zero,
but one final assertion reused the post-resume event list and therefore had an
imprecise label.

Future experiments snapshot event counts before and after resume explicitly.

## 0.8B2 — Edit

### Objective

Validate that a human reviewer can modify a pending tool call before execution
and that only the edited action is executed.

### Initial model proposal

The model proposed:

~~~text
gated_probe(value=17)
~~~

The graph paused before tool execution.

At that point:

~~~text
tool events: 0
~~~

### Human edit

The graph was resumed with an edit decision replacing:

~~~text
value=17
~~~

with:

~~~text
value=23
~~~

Conceptually:

~~~text
model proposal
    |
    +-- gated_probe(17)
    |
    v
HITL
    |
    +-- edit
    |
    v
gated_probe(23)
~~~

### Executed action

External instrumentation recorded exactly one real execution:

~~~text
gated_probe(value=23)
-> GATED_RESULT=69
~~~

The original value `17` was never executed.

### Tool-call identity

The original tool call had an ID similar to:

~~~text
call_vlqfVhlSQ6hLQ2wPgHwcNDwI
~~~

After editing, the tool call still used the same ID.

The ToolMessage produced by the tool also referenced the same ID.

Therefore the edit changes the action payload while preserving tool-call
identity.

### Final message trace

The final graph message history contained:

~~~text
HumanMessage
    |
    v
AIMessage
    |
    +-- gated_probe(value=23)
    |
    v
ToolMessage
    |
    +-- GATED_RESULT=69
    |
    v
AIMessage
    |
    +-- GATED_RESULT=69
~~~

The final AIMessage stored in state therefore reflects the edited action rather
than the model's original arguments.

### Assertions

All assertions passed:

~~~text
initial invocation interrupted                             PASS
original requested value was 17                            PASS
tool did not execute before edit decision                  PASS
tool executed exactly once after resume                    PASS
original value 17 never executed                           PASS
edited value 23 executed                                   PASS
edited execution returned expected result                  PASS
final AI tool call now contains edited args                PASS
tool call id preserved across edit                         PASS
ToolMessage references same tool call id                   PASS
final answer contains edited result                        PASS
~~~

### Auditability implication

Because the final graph message state reflects the edited tool call, an
application that must preserve both:

~~~text
original model proposal
human modification
~~~

should record the review event separately in an audit or observability system.

The final message history alone represents the authorized/executed action.

### Main lesson

Human-in-the-loop editing is not merely approval with commentary.

It can transform the executable action before any side effect occurs:

~~~text
model intent
    |
    v
human edit
    |
    v
authorized action
    |
    v
tool execution
~~~
