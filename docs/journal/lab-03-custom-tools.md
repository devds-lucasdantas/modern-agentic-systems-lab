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

## 0.5B — Autonomous Custom Tool Selection

### Objective

Determine whether the model can select an application-defined tool based only
on the user's intent and the tool contract, without the user explicitly
requesting a tool call.

### Setup

The custom tool was:

~~~text
calculate_short_code_capacity
~~~

Its description stated that it calculates the exact capacity of a fixed-length
code space where every position uses the same alphabet.

The user prompt did not:

- mention the tool name;
- instruct the model to use a tool;
- prohibit direct calculation.

The task asked for the exact capacity of identifiers with:

~~~text
alphabet size: 73
code length:   11
~~~

### Result

The model autonomously emitted:

~~~text
calculate_short_code_capacity(
    alphabet_size=73,
    code_length=11
)
~~~

The Python tool returned:

~~~text
313726685568359708377
~~~

The model then reported the result to the user.

Observed tool sequence:

~~~text
calculate_short_code_capacity
~~~

No planning, filesystem, shell or subagent tools were called.

### Finding

The experiment demonstrates autonomous tool selection based on:

~~~text
user intent
     +
tool name
     +
tool description
     +
argument schema
     |
     v
model tool selection
~~~

This is distinct from experiment 0.5A, where the user explicitly requested use
of the custom tool.

### Tool availability versus tool selection

Registering a tool does not force the model to use it.

In this experiment, the model decided that the custom tool matched the task and
selected it without explicit instruction.

Tool design therefore affects agent behavior. Names, descriptions and schemas
are part of the interface presented to the model, not merely developer
documentation.

### State

The final result contained only:

~~~text
messages
~~~

The custom calculation tool returned an observation through a `ToolMessage`
without mutating graph state.

### Conclusion

The custom tool path is now validated in both modes:

~~~text
explicit invocation
        +
autonomous selection
~~~

The next experiment will investigate whether the StructuredTool argument schema
is merely descriptive or is actually enforced by the runtime.

## 0.5C — Structured Tool Schema Enforcement

### Objective

Determine whether a custom tool's argument schema is merely descriptive
metadata for the model or whether it is also enforced at runtime.

### Schema

The custom tool exposed the following logical argument contract:

~~~text
alphabet_size: integer, required
code_length:   integer, required
~~~

The schema was automatically derived from Python type hints and the tool
definition through Pydantic.

### Valid arguments

The following input succeeded:

~~~text
alphabet_size: 62
code_length:   7
~~~

and returned:

~~~text
3521614606208
~~~

### Type coercion

Numeric strings were also accepted:

~~~text
alphabet_size: "62"
code_length:   "7"
~~~

and were coerced into integers before the Python function executed.

Therefore the default behavior is validation with coercion rather than strict
Python-type equality.

Conceptually:

~~~text
"62"
  |
  v
Pydantic validation/coercion
  |
  v
62
~~~

### Missing required argument

Calling the tool without `code_length` raised a Pydantic:

~~~text
ValidationError
~~~

with a `Field required` error.

### Invalid argument type

Supplying:

~~~text
alphabet_size: "not-an-integer"
~~~

also raised:

~~~text
ValidationError
~~~

because the value could not be parsed into an integer.

### Finding

The custom tool argument schema is not only documentation presented to the
model.

It is an enforced runtime boundary:

~~~text
tool invocation
      |
      v
Pydantic args schema
      |
      +--> valid/coercible --> Python function
      |
      +--> invalid ---------> ValidationError
~~~

### Comparison with filesystem policy

This contrasts with the previously inspected filesystem rule:

~~~text
"read before edit"
~~~

which exists as model-facing tool guidance but is not enforced by
`StateBackend`.

Therefore:

~~~text
natural-language tool policy
        |
        v
soft constraint

structured argument schema
        |
        v
runtime validation
~~~

### Scope of this experiment

The experiment invoked the `StructuredTool` directly.

It proves schema enforcement by the tool itself, but does not yet establish how
LangGraph's `ToolNode` represents or handles a validation failure originating
from an LLM-generated tool call.

## 0.5E — Isolated Tavily API Validation

### Objective

Validate the external Tavily dependency independently of OpenAI, Deep Agents
and the LangGraph agent loop.

The tested path was:

~~~text
.env
 |
 v
TAVILY_API_KEY
 |
 v
TavilyClient 1.1.0
 |
 v
Tavily Search API
 |
 v
Python response dictionary
~~~

### SDK

The installed Python distribution is:

~~~text
tavily 1.1.0
~~~

The installed module is also named:

~~~text
tavily
~~~

The search method defaults to:

~~~text
search_depth = "basic"
max_results  = 5
~~~

and accepts additional API parameters through `**kwargs`.

### Request

The smoke test explicitly used:

~~~text
query:        LangGraph durable execution
search_depth: basic
topic:        general
max_results:  3
~~~

No OpenAI model or Deep Agent was involved.

### Response

The request succeeded and returned a Python dictionary with top-level keys:

~~~text
answer
follow_up_questions
images
query
request_id
response_time
results
~~~

Three search results were returned.

Each result contained:

~~~text
content
id
raw_content
score
title
url
~~~

The response reported approximately:

~~~text
response_time: 1.16 seconds
~~~

### Usage metadata

The response did not include a `usage` field.

Therefore the experiment establishes that one real Tavily API request occurred,
but the exact API-credit accounting cannot be derived from this response alone.

### Workshop context shaping

The workshop wrapper does not expose the complete Tavily response to the
language model.

For each result it retains only:

~~~text
title
url
content
~~~

and discards fields such as:

~~~text
id
score
raw_content
~~~

It also discards response-level metadata such as:

~~~text
request_id
response_time
images
follow_up_questions
~~~

This is an explicit context-engineering decision.

### Trust boundary

Unlike the previous deterministic local calculation tool, Tavily introduces
external untrusted content.

Conceptually:

~~~text
model
 |
 v
custom tool
 |
 v
remote search service
 |
 v
third-party web content
 |
 v
ToolMessage
 |
 v
model
~~~

Search retrieval provides relevant information, but does not by itself
establish source authority or factual correctness.

### Conclusion

The external Tavily layer is operational independently of the agent runtime.

The next step is to validate the workshop's `tavily_search` wrapper itself
before allowing a Deep Agent to choose and invoke it autonomously.

## 0.5F — Deterministic Test of the Tavily Wrapper

### Objective

Validate the workshop's application-defined `tavily_search` wrapper separately
from the real Tavily network service and separately from the language model.

A fake Tavily client was injected into the already-defined tool.

### Structured tool contract

The workshop wrapper is a LangChain:

~~~text
StructuredTool
~~~

named:

~~~text
tavily_search
~~~

with the argument schema:

~~~text
query: string, required
~~~

Because the tool uses:

~~~python
@tool(parse_docstring=True)
~~~

the parameter description from the function docstring is also represented in
the generated schema.

### Captured SDK call

Invoking the wrapper with:

~~~text
LangGraph durable execution
~~~

produced exactly one fake SDK call containing:

~~~text
query       = "LangGraph durable execution"
max_results = 3
topic       = "general"
~~~

The wrapper does not explicitly pass `search_depth`.

With the inspected Tavily 1.1.0 SDK, the effective search depth therefore comes
from the SDK default:

~~~text
search_depth = "basic"
~~~

### Output shaping

The fake Tavily response included:

~~~text
id
title
url
content
raw_content
score
request_id
~~~

The formatted wrapper output retained:

~~~text
title
url
content
~~~

and discarded:

~~~text
id
score
raw_content
request_id
~~~

All deterministic assertions passed.

### Finding

The custom wrapper is not merely an API passthrough.

It implements an explicit context-shaping boundary:

~~~text
remote API response
        |
        v
application wrapper
        |
        +--> retain title
        +--> retain URL
        +--> retain content
        |
        +--> discard metadata not needed by the model
        |
        v
compact textual tool result
~~~

### Testing lesson

The Tavily capability has now been validated at two independent layers:

~~~text
real SDK + real external API      PASS
wrapper + fake external service   PASS
~~~

The remaining layer is agent integration:

~~~text
model
 |
 v
tool selection
 |
 v
ToolNode
 |
 v
tavily_search
 |
 v
real Tavily API
 |
 v
ToolMessage
 |
 v
model synthesis
~~~
