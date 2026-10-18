# Lab 03 — Custom Tools

## 0.5A — Explicit Custom Tool Invocation

### Objective

Understand how an application-defined Python function becomes a tool available
to a Deep Agent and validate the complete tool-calling path.

### Tool definition

A deterministic local tool was defined:

~~~python
@tool
def calculate_short_code_capacity(
    alphabet_size: int,
    code_length: int,
) -> int:
    """Calculate how many unique codes are possible."""
    return alphabet_size ** code_length
~~~

The LangChain `@tool` decorator converted the Python function into a:

~~~text
StructuredTool
~~~

with:

- a tool name;
- a natural-language description;
- a JSON argument schema;
- the underlying callable.

The argument schema was derived from Python type hints and the docstring.

### Deep Agent registration

Passing the custom tool through:

~~~python
create_deep_agent(
    model=model,
    tools=[calculate_short_code_capacity],
)
~~~

registered it in the same LangGraph `ToolNode` as the Deep Agents built-in
tools.

The resulting tool set contained the nine built-in tools plus:

~~~text
calculate_short_code_capacity
~~~

### Execution

The user explicitly requested use of the custom tool with:

~~~text
alphabet_size = 62
code_length   = 7
~~~

The model emitted:

~~~text
calculate_short_code_capacity(
    alphabet_size=62,
    code_length=7
)
~~~

The Python function returned:

~~~text
3521614606208
~~~

The result was represented in the conversation as a `ToolMessage`, after which
the model produced the final answer.

Observed execution:

~~~text
HumanMessage
     |
     v
AIMessage
tool_call
     |
     v
LangGraph ToolNode
     |
     v
LangChain StructuredTool
     |
     v
Python function
     |
     v
ToolMessage
     |
     v
AIMessage
final response
~~~

### Tool result versus agent state

The final result contained only:

~~~text
messages
~~~

Unlike filesystem and planning experiments, there were no:

~~~text
files
todos
~~~

This demonstrates:

~~~text
tool result
    !=
state mutation
~~~

A normal custom tool can return an observation through `ToolMessage` without
introducing an additional field into graph state.

### Serialization boundary

The Python implementation returned an integer.

The observation presented to the agent appeared as textual
`ToolMessage.content`.

Conceptually:

~~~text
Python value
   |
   v
tool runtime
   |
   v
ToolMessage
   |
   v
model context
~~~

### Usage

Observed usage:

~~~text
model calls:       2
tool calls:        1

input tokens:      10755
cached input:       5353
output tokens:        45
raw total tokens:  10800
reasoning tokens:      0
~~~

The second model call reused almost the entire stable prefix through prompt
caching.

### Conclusion

The experiment validated the complete application-defined tool path:

~~~text
Python function
     |
     | @tool
     v
StructuredTool
     |
     v
create_deep_agent
     |
     v
LangGraph ToolNode
     |
     v
model-selected invocation
     |
     v
Python execution
     |
     v
ToolMessage
     |
     v
final model response
~~~
