# Lab 01 — Minimal Deep Agent

## Objective

Execute the smallest useful Deep Agent experiment and observe the actual
agent/tool/state loop.

## Hypothesis

Calling:

~~~python
create_deep_agent(model=model)
~~~

without explicitly providing a backend should use the Deep Agents default
`StateBackend`.

Therefore a file created by the agent should exist in graph state rather than
on the host filesystem.

Expected execution:

~~~text
User
 |
 v
LLM
 |
 | write_file
 v
StateBackend
 |
 v
LLM
 |
 | read_file
 v
StateBackend
 |
 v
LLM
 |
 v
final response
~~~

## Experiment

The user request was:

~~~text
Write a file called notes.md with 'Hello from Deep Agents!' then read it back.
~~~

The agent was created with only:

~~~python
agent = create_deep_agent(
    model=model,
)
~~~

No application tools, filesystem backend, TODO list or subagent configuration
were supplied explicitly.

## Result

The returned object type was previously confirmed as:

~~~text
langgraph.graph.state.CompiledStateGraph
~~~

The execution produced six messages:

1. `HumanMessage`
2. `AIMessage` requesting `write_file`
3. `ToolMessage` from `write_file`
4. `AIMessage` requesting `read_file`
5. `ToolMessage` from `read_file`
6. final `AIMessage`

The tool calls were:

~~~text
write_file(
    file_path="/notes.md",
    content="Hello from Deep Agents!"
)

read_file(
    file_path="/notes.md"
)
~~~

The final answer confirmed the file contents.

## StateBackend validation

Before execution:

~~~text
notes.md on host filesystem: False
~~~

After execution:

~~~text
notes.md on host filesystem: False
~~~

However, the returned graph state contained:

~~~text
files:
  /notes.md:
    content: Hello from Deep Agents!
    encoding: utf-8
~~~

This confirms the expected behavior:

~~~text
/notes.md
   |
   v
StateBackend
   |
   v
LangGraph state

NOT

host filesystem
~~~

## Result state

The final result exposed:

~~~text
files
messages
~~~

No TODO list was created:

~~~text
todos: None
~~~

This demonstrates that a capability being available through middleware does not
mean the model must use it.

## Agent loop

The experiment directly demonstrated the agentic tool loop:

~~~text
goal
 |
 v
model decision
 |
 v
tool call
 |
 v
tool result / observation
 |
 v
model decision
 |
 v
next tool call
 |
 v
tool result / observation
 |
 v
final answer
~~~

The application did not manually implement this control loop.

## Token usage

Three model calls were made.

### Call 1

~~~text
input tokens:      5279
output tokens:       28
cache read:           0
reasoning tokens:     0
~~~

### Call 2

~~~text
input tokens:      5323
output tokens:       20
cache read:        5276
reasoning tokens:     0
~~~

### Call 3

~~~text
input tokens:      5363
output tokens:       20
cache read:        5320
reasoning tokens:     0
~~~

Aggregated counts reported by the experiment:

~~~text
input tokens:  15965
output tokens:    68
total tokens:  16033
~~~

The large input size relative to the very small user request demonstrates the
overhead introduced by an agent harness: system instructions, tool schemas,
middleware instructions and previous observations are part of the model
context.

The second and third calls reused almost the entire stable context through
prompt caching.

Reasoning tokens remained zero, confirming the low-cost
`reasoning_effort=none` configuration.

## Concepts learned

### Agent versus deterministic workflow

A deterministic workflow explicitly specifies operations:

~~~text
write_file()
read_file()
~~~

The agent receives a goal and decides which tools to call:

~~~text
goal
 |
 v
LLM
 |
 v
tool selection
~~~

### Capability versus usage

Deep Agents exposes capabilities such as planning and filesystem tools.

The model may choose not to use a capability when it is unnecessary.

### Virtual filesystem

Filesystem semantics do not imply physical disk storage.

`StateBackend` exposes a filesystem-like interface backed by LangGraph state.

### Agentic overhead

Even a trivial task can require a substantial prompt because the model receives
the agent harness, tool definitions and accumulated execution history.

Prompt caching can significantly reduce repeated-prefix processing in later
iterations of the same agent run.

## Conclusion

The minimal Deep Agent experiment succeeded.

The following stack was validated end-to-end:

~~~text
GPT-6 Luna
     |
     v
Deep Agents harness
     |
     v
LangChain agent
     |
     v
LangGraph CompiledStateGraph
     |
     v
StateBackend
~~~

The next experiment will investigate planning and filesystem behavior in a task
complex enough to encourage use of `write_todos` and multiple filesystem tools.
