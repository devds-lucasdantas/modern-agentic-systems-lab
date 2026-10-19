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

## 0.7A2 — Exact task() Invocation Semantics

### Task implementation

The built-in `task` capability is implemented as a module-level StructuredTool
created by `_build_task_tool`.

The model-visible schema contains only:

~~~text
description: string
subagent_type: string
~~~

The underlying Python function additionally receives a `ToolRuntime`, which is
injected by the agent runtime rather than supplied by the language model.

### Subagent routing

The middleware normalizes subagents into a mapping conceptually equivalent to:

~~~text
subagent name -> runnable
~~~

`subagent_type` selects the runnable by name.

Unknown subagent types are rejected with an error describing the allowed
agent types.

### Child state preparation

Before invoking the selected subagent, the implementation copies parent runtime
state fields except those listed in `_EXCLUDED_STATE_KEYS`.

It then explicitly replaces the `messages` field with:

~~~text
[HumanMessage(task_description)]
~~~

Therefore the parent's conversation history is not copied into the child
conversation.

This establishes strong message-context isolation:

~~~text
parent message history
        X
        |
task description
        |
        v
child HumanMessage
~~~

### Important state nuance

Message isolation does not necessarily imply complete graph-state isolation.

The implementation first copies non-excluded keys from:

~~~text
runtime.state
~~~

before replacing `messages`.

The exact list of `_EXCLUDED_STATE_KEYS` still needs to be inspected to
determine which state fields can cross the parent/subagent boundary.

### Execution

The synchronous task path invokes:

~~~text
subagent.invoke(subagent_state)
~~~

The async path equivalently uses:

~~~text
await subagent.ainvoke(subagent_state)
~~~

### Return path

The task tool does not merely return a string.

The child result is converted into a LangGraph `Command`.

The implementation:

1. requires a `messages` key in the child result;
2. extracts non-excluded child state fields;
3. uses `structured_response` when present, otherwise the final child message;
4. converts that output into a `ToolMessage`;
5. returns a `Command` updating the parent graph state.

Conceptually:

~~~text
child result
        |
        +--> final child message -> ToolMessage
        |
        +--> allowed child state -> state update
        |
        v
Command
        |
        v
parent graph
~~~

### Context-compression precision

The workshop statement that "only the final summary returns" is accurate for
the child message history.

Intermediate child model messages and tool calls do not enter the parent's
message history.

However, non-excluded graph-state fields may also be propagated through the
returned Command.

Therefore:

~~~text
message-history isolation
        !=
necessarily complete graph-state isolation
~~~

### Declarative and compiled subagents

Both declarative `SubAgent` and `CompiledSubAgent` definitions are normalized to
a common internal structure:

~~~text
name
description
runnable
~~~

Declarative subagents are compiled internally with `create_agent`.

Compiled subagents provide the runnable directly.

After normalization, the task tool invokes both through the same routing and
return mechanism.

## 0.7A3 — Parent/Child State Boundary

### Excluded state keys

The pinned implementation defines:

~~~text
messages
todos
structured_response
skills_metadata
memory_contents
~~~

as `_EXCLUDED_STATE_KEYS`.

The same exclusion set participates in both directions of synchronous task
delegation.

### Parent to child

The child state is initially built by copying parent runtime state except for
the excluded keys.

The child `messages` field is then explicitly replaced with:

~~~text
[HumanMessage(task_description)]
~~~

Therefore parent conversation history does not enter the child conversation.

### Child to parent

When the subagent finishes, its result is filtered using the same exclusion
set before producing the parent state update.

The final child message is separately converted into a ToolMessage.

### Message isolation versus state isolation

The resulting boundary is:

~~~text
messages             isolated
todos                isolated
skills_metadata      isolated
memory_contents      isolated
structured_response  not merged as state

other state keys     potentially propagated
~~~

Therefore synchronous Deep Agent subagents provide conversation isolation, not
necessarily complete graph-state isolation.

### Files are not excluded

The `files` state key is not part of `_EXCLUDED_STATE_KEYS`.

This is particularly important when using StateBackend, where virtual files are
stored inside graph state.

Conceptually:

~~~text
parent files state
      |
      v
child files state
      |
      v
child modifications
      |
      v
Command state update
      |
      v
parent files state
~~~

This behavior will be validated separately rather than inferred solely from the
source.

### Todos are intentionally local

The implementation comments explain that child `todos` are excluded from state
merging.

This allows:

~~~text
parent planning
    !=
child planning
~~~

so a delegated task can maintain its own local plan without overwriting the
orchestrator's todo state.

### Skills and memory context

`skills_metadata` and `memory_contents` are explicitly filtered to prevent
parent-loaded skill and memory context from leaking into child agents.

Subagents can therefore load their own SkillsMiddleware and MemoryMiddleware
context.

### Structured responses

`structured_response` is excluded from the returned graph-state update.

However, when present, `_return_command_with_state_update` serializes the
structured response and uses it as the content of the task ToolMessage.

Therefore:

~~~text
child structured_response
        |
        +--X--> parent structured_response state
        |
        +-----> parent ToolMessage content
~~~

### Final boundary model

~~~text
parent state
    |
    | filter private/local keys
    v
child state
    |
    | isolated messages + local agent loop
    v
child result
    |
    | filter private/local keys
    +------> allowed state updates
    |
    +------> final result as ToolMessage
    v
parent state
~~~

## 0.7B — First Real Synchronous Delegation

### Objective

Execute the smallest possible real subagent delegation and observe the message
boundary visible to the parent agent.

The experiment deliberately avoided:

~~~text
Tavily
filesystem operations
Store
checkpointer
custom tools
~~~

to isolate only the synchronous `task()` mechanism.

### Request

The parent was explicitly instructed to delegate exactly once to:

~~~text
general-purpose
~~~

The delegated task was a deterministic arithmetic operation:

~~~text
37 * 41
~~~

with the child required to return:

~~~text
CHILD_RESULT=<number>
~~~

### Parent-visible trace

The resulting parent message history was:

~~~text
HumanMessage
    |
    v
AIMessage
    |
    +-- task(
          subagent_type="general-purpose",
          description="Calculate 37 * 41 ..."
        )
    |
    v
ToolMessage
    |
    +-- CHILD_RESULT=1517
    |
    v
AIMessage
    |
    +-- CHILD_RESULT=1517
~~~

### Delegation

The parent invoked `task` exactly once and selected:

~~~text
general-purpose
~~~

The task description created by the parent was:

~~~text
Calculate 37 * 41 and return exactly CHILD_RESULT=<number>.
No other text.
~~~

This demonstrates that the parent acts as a context-engineering boundary.

The child does not receive the original user message history. It receives the
self-contained task description constructed by the parent.

### Return boundary

The child result visible to the parent was a single:

~~~text
ToolMessage
~~~

containing:

~~~text
CHILD_RESULT=1517
~~~

No child-internal AI messages or tool calls appeared in the parent's
`result["messages"]`.

### Assertions

All assertions passed:

~~~text
parent called task exactly once                  PASS
parent selected general-purpose                  PASS
task description asked for sentinel              PASS
parent received one task ToolMessage             PASS
subagent returned expected arithmetic            PASS
final parent response used expected result       PASS
~~~

### What this experiment does not prove

The absence of child messages from the parent trace does not imply that the
child executed only one model call.

The child may run its own internal agent loop.

The experiment proves only that those intermediate child messages are not
propagated into the parent's message history.

### Main lesson

Synchronous subagents create a real context boundary:

~~~text
user context
     |
     v
parent orchestrator
     |
     | creates self-contained task description
     v
isolated child agent execution
     |
     | returns final result only
     v
parent ToolMessage
     |
     v
parent synthesis
~~~
