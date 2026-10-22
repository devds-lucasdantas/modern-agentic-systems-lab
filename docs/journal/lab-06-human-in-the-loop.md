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

## 0.8B3 — Reject

### Objective

Validate that rejecting a pending tool call prevents real tool execution while
still providing a protocol-compatible result to the agent loop.

### Initial proposal

The model proposed:

~~~text
gated_probe(value=17)
~~~

The graph paused before execution.

At the pause boundary:

~~~text
tool events: 0
~~~

### Human rejection

The thread was resumed with:

~~~text
type: reject
message: Rejected by reviewer: operation not authorized.
~~~

### No real execution

External instrumentation remained:

~~~text
before resume: 0
after resume:  0
~~~

Therefore the gated tool never executed.

### Synthetic ToolMessage

Instead of executing the tool, HumanInTheLoopMiddleware inserted an error
ToolMessage:

~~~text
name: gated_probe
status: error
tool_call_id: <original tool-call id>
content: Rejected by reviewer: operation not authorized.
~~~

The ToolMessage preserved the original tool-call identity.

### Model continuation

The model then received the rejection through the normal tool-result channel
and responded:

~~~text
The gated operation was rejected because it was not authorized.
~~~

### Assertions

All assertions passed:

~~~text
initial invocation interrupted                             PASS
original tool call requested value 17                      PASS
tool had not executed before rejection                     PASS
tool still did not execute after rejection                 PASS
no real tool executions occurred                           PASS
rejection produced error ToolMessage                       PASS
rejection ToolMessage contains reviewer message            PASS
rejection ToolMessage preserves call id                    PASS
final answer acknowledges rejection                        PASS
~~~

### Protocol model

Reject does not simply remove a pending tool call.

Instead:

~~~text
AIMessage(tool_call)
        |
        v
human rejection
        |
        v
synthetic ToolMessage(status="error")
        |
        v
model continuation
~~~

This preserves the normal tool-call / tool-result protocol without performing
the real side effect.

### Human feedback as model context

The optional rejection message becomes ToolMessage content.

Therefore human feedback can influence the next model step rather than serving
only as external approval metadata.

### Three decision semantics

~~~text
APPROVE
proposal
  -> execute original action
  -> real ToolMessage

EDIT
proposal
  -> human modifies action
  -> execute modified action
  -> real ToolMessage

REJECT
proposal
  -> no execution
  -> synthetic error ToolMessage
~~~

## 0.8C — Batched Human Review

### Objective

Validate how HumanInTheLoopMiddleware handles multiple gated tool calls emitted
in the same AIMessage.

The experiment also tested mixed human decisions within one review batch.

### Model proposal

The model emitted exactly two tool calls in the same AIMessage:

~~~text
gated_probe_a(value=10)
gated_probe_b(value=20)
~~~

Neither tool executed immediately.

### One interrupt, multiple actions

The graph surfaced one interrupt containing:

~~~text
action_requests[0] -> gated_probe_a(value=10)
action_requests[1] -> gated_probe_b(value=20)

review_configs[0] -> policy for A
review_configs[1] -> policy for B
~~~

This confirms that multiple gated calls from one model step can be grouped into
one HITL request.

### Positional decisions

The graph was resumed with:

~~~text
decisions[0] = approve
decisions[1] = reject
~~~

The decisions corresponded positionally to the interrupted actions.

### Mixed outcome

External instrumentation recorded exactly one real execution:

~~~text
gated_probe_a(value=10)
-> A_RESULT=110
~~~

`gated_probe_b` never executed.

Instead, B produced:

~~~text
ToolMessage
status=error
content=Reviewer rejected operation B.
~~~

### Assertions

All assertions passed:

~~~text
one graph interrupt surfaced                               PASS
model emitted exactly two tool calls                       PASS
both calls were in the same AIMessage                      PASS
HITL request contains two actions                          PASS
HITL request contains two review configs                   PASS
first action is probe A                                    PASS
second action is probe B                                   PASS
nothing executed before review                             PASS
exactly one real tool executed                             PASS
probe A executed                                           PASS
probe B did not execute                                    PASS
probe A produced real ToolMessage                          PASS
probe B produced rejection ToolMessage                     PASS
probe B rejection text propagated                          PASS
~~~

### ToolMessage ordering nuance

The original model call order was:

~~~text
A
B
~~~

but the resulting ToolMessages appeared as:

~~~text
B rejection
A success
~~~

This is consistent with the HITL execution flow.

A rejected call can be converted immediately into a synthetic error ToolMessage
during middleware processing, while an approved call must continue to the
actual tool-execution node before its ToolMessage exists.

Therefore:

~~~text
action request order
    !=
necessarily final ToolMessage order
~~~

Systems should correlate actions and results using stable identifiers such as:

~~~text
tool_call_id
~~~

rather than relying on message-array position.

### Batch model

~~~text
AIMessage
  |
  +-- gated action A
  |
  +-- gated action B
          |
          v
     one HITLRequest
          |
     human decisions
       /        \
 approve A    reject B
    |             |
execute A     synthetic error
    |             |
real result      /
       \         /
        v       v
       model continuation
~~~

### Main lesson

Human review operates on a batch of gated actions while preserving an
individual decision for each action.

Mixed approval outcomes can therefore be processed in a single pause/resume
cycle.
