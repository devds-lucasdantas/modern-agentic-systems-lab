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

## 0.7C — Child-Only Tool and Context Compression

### Objective

Demonstrate empirically that a subagent can execute internal tool calls that are
not exposed to the parent agent and that those internal messages do not enter
the parent's message history.

### Child-only tool

A deterministic custom tool was created:

~~~text
child_probe(value)
~~~

It multiplied the supplied value by seven and also appended an event to an
external Python list for instrumentation.

The tool was provided only to a specialized:

~~~text
calculator
~~~

subagent.

### Parent capability surface

Before invocation, the parent ToolNode contained:

~~~text
edit_file
execute
glob
grep
ls
read_file
task
write_file
write_todos
~~~

It did not contain:

~~~text
child_probe
~~~

Therefore the parent could not invoke the experimental tool directly.

### Delegation

The parent delegated the request through:

~~~text
task(
    subagent_type="calculator",
    description=...
)
~~~

The calculator subagent was instructed to use its child-only tool.

### External instrumentation

During execution, the Python-side probe recorded:

~~~text
child_probe(value=23)
-> 161
~~~

exactly once.

This independently proves that the child tool executed.

### Parent-visible history

The parent observed only:

~~~text
HumanMessage
    |
    v
AIMessage
    |
    +-- task(...)
    |
    v
ToolMessage
    |
    +-- CHILD_TOOL_RESULT=161
    |
    v
AIMessage
    |
    +-- CHILD_TOOL_RESULT=161
~~~

No parent-visible AIMessage called `child_probe`, and no ToolMessage named
`child_probe` appeared in the parent message history.

### Tool-call counting nuance

The instrumentation list of parent-visible tool names contained:

~~~text
["task", "task"]
~~~

This represents:

~~~text
one AIMessage task tool call
+
one ToolMessage containing the task result
~~~

and does not represent two task invocations.

### Assertions

All assertions passed:

~~~text
parent does not directly expose child_probe          PASS
child_probe executed exactly once                    PASS
child_probe received expected value                  PASS
child_probe produced expected result                 PASS
parent-visible history contains task                 PASS
parent-visible history hides child_probe             PASS
parent received exactly one task result              PASS
task result contains child output                    PASS
final response contains expected result              PASS
~~~

### Main lesson

Subagents can provide capability isolation in addition to message-context
isolation.

Conceptually:

~~~text
Parent
    |
    | task(...)
    v
Child
    |
    +-- child-only model/tool loop
    |
    +-- internal AIMessage
    +-- internal tool call
    +-- internal ToolMessage
    +-- internal AIMessage
    |
    v
single final result
    |
    v
Parent ToolMessage
~~~

The parent benefits from the child's specialized capability without exposing
the child's tool or intermediate execution trace in the parent context.

This experimentally demonstrates:

~~~text
tool capability isolation
+
message-history isolation
+
result compression
~~~

## 0.7D — Autonomous Delegation Policy

### Objective

Observe whether the parent model chooses synchronous subagent delegation
without being explicitly instructed to use `task`.

The agent retained the default general-purpose subagent and received only a
neutral instruction to use available capabilities when they materially improve
the answer.

### Task

The user requested independent evaluation of three rollout strategies:

~~~text
A. big-bang migration
B. phased migration
C. voluntary adoption through champions
~~~

Each strategy had to be evaluated across four dimensions and then compared.

The prompt did not mention:

~~~text
task
subagent
delegation
~~~

### Result

The parent produced the complete answer directly.

Observed delegation metrics:

~~~text
task calls:        0
task ToolMessages: 0
~~~

The parent-visible trace was simply:

~~~text
HumanMessage
    |
    v
AIMessage
    |
    v
final analysis
~~~

### Interpretation

The availability of `task()` does not force delegation.

The task tool description and system-prompt guidance influence model policy,
but they are not runtime enforcement.

For this particular prompt, model, and configuration, the parent considered
direct execution preferable to introducing a subagent.

### Important scope

This result does not establish that the model generally avoids autonomous
delegation.

It establishes only:

~~~text
GPT-6 Luna
+
this task
+
this system prompt
+
default general-purpose subagent
=
direct execution selected
~~~

A different task, specialist description, capability requirement, or context
size may produce different routing behavior.

### Orchestration layers

This experiment separates three concerns:

~~~text
Capability
    task() exists

Routing policy
    should the model use task()?

Execution
    what happens after task() is selected?
~~~

Previous experiments validated capability and execution.

This experiment observed the routing policy selecting direct execution.

### Main lesson

~~~text
available capability
        !=
selected capability
~~~

A production orchestrator must reason not only about whether a task can be
delegated, but whether delegation is worth its latency, token, coordination,
and context overhead.

## 0.7E — Autonomous Specialist Routing

### Objective

Test whether the parent can autonomously discover and route a request to a
specialized subagent when the required capability is unavailable directly to
the parent.

Unlike previous experiments, the parent was not instructed to:

~~~text
use task
delegate
use a subagent
select lab-decoder
~~~

### Specialized capability

A private deterministic tool was created:

~~~text
decode_probe(code)
~~~

The tool existed only inside the:

~~~text
lab-decoder
~~~

subagent.

The parent ToolNode did not expose `decode_probe`.

### User request

The user requested:

~~~text
Decode experimental lab code 29 and give me only the authoritative decoded
value.
~~~

The private decoding transformation was not present in the user prompt or in
the parent's direct tools.

### Autonomous routing

The parent independently generated:

~~~text
task(
    subagent_type="lab-decoder",
    description=(
        "Decode experimental lab code 29 using authoritative decoding "
        "capability. Return only the decoded value, with no explanation."
    )
)
~~~

Therefore the model autonomously performed:

~~~text
capability discovery
        |
        v
specialist selection
        |
        v
task construction
        |
        v
delegation
~~~

### Child capability execution

External instrumentation confirmed exactly one execution:

~~~text
decode_probe(code=29)
-> DECODED-384
~~~

The parent could not invoke this tool directly.

### Parent-visible trace

The visible parent history was:

~~~text
HumanMessage
    |
    v
AIMessage
    |
    +-- task(subagent_type="lab-decoder", ...)
    |
    v
ToolMessage
    |
    +-- DECODED-384
    |
    v
AIMessage
    |
    +-- DECODED-384
~~~

The child-only `decode_probe` invocation remained hidden from the parent
message history.

### Assertions

All checks passed:

~~~text
parent lacks decode_probe                               PASS
parent autonomously used task                           PASS
lab-decoder was selected                                PASS
decode_probe actually executed                          PASS
decode_probe received 29                                PASS
probe generated authoritative value                     PASS
parent final answer contains authoritative value        PASS
~~~

### Comparison with 0.7D

The two autonomous-routing experiments produced different choices:

~~~text
0.7D
parent could perform the analysis directly
-> no delegation

0.7E
required capability existed only in a specialist
-> autonomous delegation
~~~

This does not establish a universal routing policy, but it demonstrates that
tool/subagent metadata can influence capability-aware orchestration rather than
merely triggering delegation whenever work is decomposable.

### Main lesson

~~~text
can delegate
    !=
should delegate

specialized capability boundary
    can influence
routing policy
~~~

A useful orchestrator should account for capability ownership as well as task
complexity when deciding whether and where to delegate.

## 0.7F1 — StateBackend Files Across the Subagent Boundary

### Objective

Validate experimentally that the `files` graph-state field can cross the
parent/subagent boundary when using StateBackend.

Static inspection previously established that:

~~~text
files
~~~

is not included in `_EXCLUDED_STATE_KEYS`.

This experiment tested the resulting runtime behavior.

### Initial parent state

The parent invocation began with:

~~~text
/shared.txt

owner=PARENT
status=before
~~~

stored in the StateBackend `files` state.

### Delegation

The parent delegated exactly once to:

~~~text
file-worker
~~~

The child was instructed to:

~~~text
read_file("/shared.txt")
edit_file(...)
read_file("/shared.txt")
~~~

and return:

~~~text
FILE_CHILD_DONE
~~~

after verifying the change.

### Parent-visible message history

The parent observed only:

~~~text
HumanMessage
    |
    v
AIMessage
    |
    +-- task(file-worker)
    |
    v
ToolMessage
    |
    +-- FILE_CHILD_DONE
    |
    v
AIMessage
    |
    +-- FILE_CHILD_DONE
~~~

The child-internal filesystem calls were not visible in the parent message
history.

In particular:

~~~text
read_file    hidden
edit_file    hidden
~~~

### Returned graph state

The final parent result contained:

~~~text
files
messages
~~~

The returned `/shared.txt` state was:

~~~text
owner=PARENT
status=after-child
~~~

The original parent content was therefore visible to the child, modified by the
child, and propagated back to the parent graph state.

### Assertions

All assertions passed:

~~~text
parent delegated exactly once                          PASS
file-worker selected                                   PASS
parent received one task result                        PASS
child reported successful completion                   PASS
files state returned to parent                         PASS
shared file still exists                               PASS
child edit propagated to parent files                  PASS
original owner line preserved                          PASS
parent-visible history hides read_file                 PASS
parent-visible history hides edit_file                 PASS
final parent response contains child result            PASS
~~~

### State-flow model

The behavior is best modeled as:

~~~text
parent graph state
        |
        | copy/filter into child invocation
        v
child graph state
        |
        | filesystem operations mutate child files state
        v
child result
        |
        | task returns Command state update
        v
parent graph state
~~~

This should not be described merely as a shared mutable state object.

The important property is that non-excluded graph-state updates can propagate
across the task boundary.

### Main lesson

~~~text
message-history isolation
        !=
graph-state isolation
~~~

With StateBackend, virtual filesystem contents can cross the subagent boundary
while the child's internal message/tool history remains isolated.

## 0.7F2 — FilesystemBackend Across the Subagent Boundary

### Objective

Contrast FilesystemBackend with the StateBackend behavior validated in 0.7F1.

The child again modified a file through filesystem tools, but this time the
storage mechanism was the operating-system filesystem rather than LangGraph
graph state.

### Initial physical file

The experiment created:

~~~text
/tmp/deepagents-subagent-filesystem-lab/shared.txt
~~~

with:

~~~text
owner=PARENT
status=before
~~~

A FilesystemBackend using that directory as its root was shared by the Deep
Agent harness.

### Delegation

The parent delegated exactly once to:

~~~text
file-worker
~~~

The child internally performed filesystem operations and returned:

~~~text
FILE_CHILD_DONE
~~~

### Parent-visible message history

The parent observed only:

~~~text
HumanMessage
    |
    v
AIMessage
    |
    +-- task(file-worker)
    |
    v
ToolMessage
    |
    +-- FILE_CHILD_DONE
    |
    v
AIMessage
    |
    +-- FILE_CHILD_DONE
~~~

Child-internal `read_file` and `edit_file` calls remained hidden.

### Graph state

Unlike the StateBackend experiment, the final result keys were:

~~~text
messages
~~~

There was no:

~~~text
files
~~~

graph-state field.

### External side effect

Despite the absence of files state, the physical file became:

~~~text
owner=PARENT
status=after-child
~~~

The mutation therefore persisted independently of the parent graph-state
update.

### Fresh backend validation

A newly created FilesystemBackend pointing to the same root directory read the
modified content successfully.

This demonstrates that the source of truth was the external OS filesystem,
rather than state propagated through the task Command.

### Assertions

All assertions passed:

~~~text
parent delegated exactly once                           PASS
file-worker selected                                    PASS
parent received one task result                         PASS
child reported successful completion                    PASS
result does not contain files state                     PASS
physical file still exists                              PASS
child edit reached physical filesystem                  PASS
original owner line preserved                           PASS
fresh backend sees child modification                   PASS
parent-visible history hides read_file                  PASS
parent-visible history hides edit_file                  PASS
final parent response contains child result             PASS
~~~

### Comparison with StateBackend

~~~text
                     StateBackend          FilesystemBackend

storage              graph state           OS filesystem
result["files"]       present               absent
child effect returns  Command state update  external side effect
fresh backend         no automatic state    sees same disk file
message isolation     preserved             preserved
~~~

The same filesystem tools therefore expose different persistence and state
propagation semantics depending on the configured backend.

## 0.7 — Subagents Review

The subagent experiments established the synchronous task architecture from
static source inspection through real executions.

### Delegation contract

The parent exposes:

~~~text
task(
    description: string,
    subagent_type: string
)
~~~

The selected child receives an isolated conversation beginning with:

~~~text
HumanMessage(task_description)
~~~

rather than the parent's conversation history.

### Default and specialized subagents

`create_deep_agent()` automatically supplies a `general-purpose` subagent when
one is not explicitly overridden.

Additional subagents can specialize:

~~~text
model
tools
system prompt
middleware
skills
permissions
interrupt behavior
~~~

### Message isolation

Child-internal:

~~~text
AI messages
tool calls
tool results
intermediate steps
~~~

do not enter the parent message history.

The final child output returns as the `task` ToolMessage.

### Capability isolation

A child can own tools unavailable directly to the parent.

The parent can route work through `task` and benefit from that capability
without adding the specialist tool to its own ToolNode.

This was validated using child-only deterministic tools.

### Autonomous routing

Two different routing decisions were observed.

When the parent could efficiently perform the requested analysis itself:

~~~text
task available
-> direct execution
~~~

When an authoritative capability existed only in a specialist:

~~~text
task available
-> specialist discovered
-> task constructed
-> specialist selected
-> private capability executed
~~~

This demonstrates capability-aware routing behavior for the tested prompts,
without implying that such routing is guaranteed for every task.

### State boundary

The synchronous task implementation excludes:

~~~text
messages
todos
structured_response
skills_metadata
memory_contents
~~~

from normal parent/child state propagation.

Other graph-state fields can cross the boundary.

StateBackend demonstrated this with the `files` state.

### Backend interaction

With StateBackend:

~~~text
parent files state
    |
    v
child files state
    |
    v
child modification
    |
    v
Command state update
    |
    v
parent files state
~~~

With FilesystemBackend:

~~~text
parent
   \
    -> shared external filesystem <- child
~~~

No `files` graph-state propagation was required.

### Final architecture

~~~text
User
 |
 v
Parent Deep Agent
 |
 | decides whether delegation is useful
 |
 +-- direct execution
 |
 +-- task(description, subagent_type)
        |
        v
   SubAgentMiddleware
        |
        +-- selects runnable
        +-- filters parent state
        +-- replaces child messages
        |
        v
   Isolated Child Agent
        |
        +-- own model
        +-- own tools
        +-- own middleware
        +-- own intermediate history
        |
        v
   child result
        |
        +-- final result -> ToolMessage
        +-- allowed state -> Command update
        |
        v
   Parent Deep Agent
        |
        v
   final synthesis
~~~

### Deferred topics

The following are intentionally deferred to later runtime-oriented labs:

~~~text
real concurrency of multiple task calls
AsyncSubAgent
remote/background subagents
runtime scheduling
cross-process execution
distributed agents
~~~

The synchronous subagent fundamentals are now validated.

## 0.7F2 — FilesystemBackend Across the Subagent Boundary

### Objective

Contrast FilesystemBackend with the StateBackend behavior validated in 0.7F1.

The child again modified a file through filesystem tools, but this time the
storage mechanism was the operating-system filesystem rather than LangGraph
graph state.

### Initial physical file

The experiment created:

~~~text
/tmp/deepagents-subagent-filesystem-lab/shared.txt
~~~

with:

~~~text
owner=PARENT
status=before
~~~

A FilesystemBackend using that directory as its root was shared by the Deep
Agent harness.

### Delegation

The parent delegated exactly once to:

~~~text
file-worker
~~~

The child internally performed filesystem operations and returned:

~~~text
FILE_CHILD_DONE
~~~

### Parent-visible message history

The parent observed only:

~~~text
HumanMessage
    |
    v
AIMessage
    |
    +-- task(file-worker)
    |
    v
ToolMessage
    |
    +-- FILE_CHILD_DONE
    |
    v
AIMessage
    |
    +-- FILE_CHILD_DONE
~~~

Child-internal `read_file` and `edit_file` calls remained hidden.

### Graph state

Unlike the StateBackend experiment, the final result keys were:

~~~text
messages
~~~

There was no:

~~~text
files
~~~

graph-state field.

### External side effect

Despite the absence of files state, the physical file became:

~~~text
owner=PARENT
status=after-child
~~~

The mutation therefore persisted independently of the parent graph-state
update.

### Fresh backend validation

A newly created FilesystemBackend pointing to the same root directory read the
modified content successfully.

This demonstrates that the source of truth was the external OS filesystem,
rather than state propagated through the task Command.

### Assertions

All assertions passed:

~~~text
parent delegated exactly once                           PASS
file-worker selected                                    PASS
parent received one task result                         PASS
child reported successful completion                    PASS
result does not contain files state                     PASS
physical file still exists                              PASS
child edit reached physical filesystem                  PASS
original owner line preserved                           PASS
fresh backend sees child modification                   PASS
parent-visible history hides read_file                  PASS
parent-visible history hides edit_file                  PASS
final parent response contains child result             PASS
~~~

### Comparison with StateBackend

~~~text
                     StateBackend          FilesystemBackend

storage              graph state           OS filesystem
result["files"]       present               absent
child effect returns  Command state update  external side effect
fresh backend         no automatic state    sees same disk file
message isolation     preserved             preserved
~~~

The same filesystem tools therefore expose different persistence and state
propagation semantics depending on the configured backend.

## 0.7 — Subagents Review

The subagent experiments established the synchronous task architecture from
static source inspection through real executions.

### Delegation contract

The parent exposes:

~~~text
task(
    description: string,
    subagent_type: string
)
~~~

The selected child receives an isolated conversation beginning with:

~~~text
HumanMessage(task_description)
~~~

rather than the parent's conversation history.

### Default and specialized subagents

`create_deep_agent()` automatically supplies a `general-purpose` subagent when
one is not explicitly overridden.

Additional subagents can specialize:

~~~text
model
tools
system prompt
middleware
skills
permissions
interrupt behavior
~~~

### Message isolation

Child-internal:

~~~text
AI messages
tool calls
tool results
intermediate steps
~~~

do not enter the parent message history.

The final child output returns as the `task` ToolMessage.

### Capability isolation

A child can own tools unavailable directly to the parent.

The parent can route work through `task` and benefit from that capability
without adding the specialist tool to its own ToolNode.

This was validated using child-only deterministic tools.

### Autonomous routing

Two different routing decisions were observed.

When the parent could efficiently perform the requested analysis itself:

~~~text
task available
-> direct execution
~~~

When an authoritative capability existed only in a specialist:

~~~text
task available
-> specialist discovered
-> task constructed
-> specialist selected
-> private capability executed
~~~

This demonstrates capability-aware routing behavior for the tested prompts,
without implying that such routing is guaranteed for every task.

### State boundary

The synchronous task implementation excludes:

~~~text
messages
todos
structured_response
skills_metadata
memory_contents
~~~

from normal parent/child state propagation.

Other graph-state fields can cross the boundary.

StateBackend demonstrated this with the `files` state.

### Backend interaction

With StateBackend:

~~~text
parent files state
    |
    v
child files state
    |
    v
child modification
    |
    v
Command state update
    |
    v
parent files state
~~~

With FilesystemBackend:

~~~text
parent
   \
    -> shared external filesystem <- child
~~~

No `files` graph-state propagation was required.

### Final architecture

~~~text
User
 |
 v
Parent Deep Agent
 |
 | decides whether delegation is useful
 |
 +-- direct execution
 |
 +-- task(description, subagent_type)
        |
        v
   SubAgentMiddleware
        |
        +-- selects runnable
        +-- filters parent state
        +-- replaces child messages
        |
        v
   Isolated Child Agent
        |
        +-- own model
        +-- own tools
        +-- own middleware
        +-- own intermediate history
        |
        v
   child result
        |
        +-- final result -> ToolMessage
        +-- allowed state -> Command update
        |
        v
   Parent Deep Agent
        |
        v
   final synthesis
~~~

### Deferred topics

The following are intentionally deferred to later runtime-oriented labs:

~~~text
real concurrency of multiple task calls
AsyncSubAgent
remote/background subagents
runtime scheduling
cross-process execution
distributed agents
~~~

The synchronous subagent fundamentals are now validated.
