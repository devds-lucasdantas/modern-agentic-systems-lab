# Lab 05 — Subagents

## 0.7A — Subagent Architecture and Task Contract

### Objective

Inspect the pinned Deep Agents subagent implementation before invoking a
subagent and understand the contract exposed to the parent model.

### Built-in delegation

`create_deep_agent()` includes subagent delegation through the built-in:

~~~text
task
~~~

tool.

The capability is provided by `SubAgentMiddleware`.

### Default general-purpose subagent

If no subagent named:

~~~text
general-purpose
~~~

is supplied, `create_deep_agent` automatically creates one.

Therefore even:

~~~python
create_deep_agent(model=model)
~~~

contains a synchronous subagent available through `task()`.

The default general-purpose subagent uses the parent model and receives the
standard Deep Agents middleware stack.

### Declarative SubAgent

A declarative subagent requires:

~~~text
name
description
system_prompt
~~~

and can customize:

~~~text
tools
model
middleware
interrupt_on
skills
~~~

When used through `create_deep_agent`, omitted custom tools are inherited from
the parent.

An explicit `tools` value overrides that inheritance.

### Subagent harness

Declarative subagents receive their own middleware stack, including
capabilities such as:

~~~text
TodoListMiddleware
FilesystemMiddleware
SummarizationMiddleware
PatchToolCallsMiddleware
~~~

plus applicable skills, permissions and custom middleware.

A subagent is therefore an agent harness invocation, not merely a raw secondary
model call.

### task tool

The model-visible `task` capability is a LangChain:

~~~text
StructuredTool
~~~

with required arguments:

~~~text
description: string
subagent_type: string
~~~

`description` contains the complete autonomous task.

`subagent_type` selects one of the available agents advertised in the task tool
metadata.

### Default task metadata

With no custom subagents, the available type is:

~~~text
general-purpose
~~~

The tool description recommends delegation for complex, independent and
context-heavy tasks.

### Invocation lifetime

A synchronous task subagent invocation is described as:

~~~text
ephemeral
stateless across invocations
single-result
~~~

The parent cannot continue a conversation with the same task invocation after
it completes.

Therefore the task description must contain the context required for the
subagent to work autonomously.

### Context isolation

The workshop explicitly presents subagents as a context-isolation mechanism.

Conceptually:

~~~text
parent context
    |
    | task(description, subagent_type)
    v
isolated subagent context
    |
    | internal model/tool/model loop
    v
final subagent message
    |
    v
ToolMessage in parent context
~~~

Intermediate subagent tool calls are not returned to the parent context.

For a CompiledSubAgent, the documented contract explicitly extracts the final
message from the subagent's `messages` state and returns it as a ToolMessage.

This makes subagents useful not only for specialization but also for context
compression.

### Supported forms

The pinned implementation supports:

~~~text
SubAgent
    declarative synchronous agent

CompiledSubAgent
    pre-built runnable exposed through task()

AsyncSubAgent
    remote/background agent handled by separate async-subagent middleware
~~~

The current lab focuses only on synchronous `task()` delegation.

### Remaining question

Static inspection has not yet shown the implementation of the module-level:

~~~text
_build_task_tool
~~~

Therefore the exact input state sent to a synchronous subagent still needs to
be inspected before the first real invocation.

In particular:

~~~text
Does the child receive only the task description?

or

Does any parent conversation state enter the child invocation?
~~~
