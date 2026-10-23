# Lab 10 — LangGraph Runtime and Studio

## Goal

Move below the Deep Agents harness and inspect the underlying LangGraph runtime
model:

- compiled graphs;
- graph registration;
- nodes and channels;
- threads;
- runs;
- checkpoints;
- stores;
- streaming;
- runtime context;
- local API server;
- Studio.

## 0.12A — Runtime Entrypoint and Compiled Graph

### langgraph.json

The workshop declares:

~~~json
{
  "dependencies": ["."],
  "graphs": {
    "deep_agent": "./agent/agent.py:deep_agent"
  },
  "env": ".env"
}
~~~

Therefore the runtime graph registration chain is:

~~~text
langgraph.json
    |
    v
graph id: deep_agent
    |
    v
agent/agent.py
    |
    v
attribute: deep_agent
~~~

### Exported object

The exported object is:

~~~text
langgraph.graph.state.CompiledStateGraph
~~~

It is already compiled rather than being a graph factory.

The object exposes runtime operations including:

~~~text
invoke
ainvoke
stream
astream
get_state
get_state_history
update_state
~~~

### Deep Agents as a LangGraph harness

`create_deep_agent()` ultimately produces a LangGraph compiled state graph.

Observed nodes include:

~~~text
__start__
model
tools
TodoListMiddleware.after_model
SkillsMiddleware.before_agent
PatchToolCallsMiddleware.before_agent
MemoryMiddleware.before_agent
~~~

This provides a concrete boundary:

~~~text
Deep Agents configuration
        |
        v
middleware + tools + state
        |
        v
LangGraph graph construction
        |
        v
CompiledStateGraph
~~~

### Middleware and graph nodes

Not every middleware component necessarily appears as a dedicated graph node.

Lifecycle hooks such as `before_agent` and `after_model` can materialize graph
nodes.

Other middleware behavior can instead operate through:

- model-call wrapping;
- request transformation;
- tool injection;
- shared tool execution nodes.

Therefore absence of a middleware name from the node map does not imply that
the middleware is inactive.

### State channels

Observed channels include:

~~~text
messages
jump_to
structured_response
memory_contents
todos
skills_metadata
files
_summarization_event
~~~

This independently confirms that private middleware state such as:

~~~text
memory_contents
skills_metadata
~~~

is materialized as LangGraph state channels.

This is consistent with previous experiments where both values survived
checkpoint persistence.

### Channel behavior

Observed channel implementations include:

~~~text
messages
    -> BinaryOperatorAggregate

files
    -> BinaryOperatorAggregate

memory_contents
    -> LastValue

skills_metadata
    -> LastValue

todos
    -> LastValue
~~~

Different graph state fields therefore have different update/reducer semantics.

### Store and checkpointer

The exported graph reports:

~~~text
checkpointer: None

store:
    InMemoryStore
~~~

The application explicitly constructs the store and supplies it to
`create_deep_agent()`.

No graph-level checkpointer is supplied in `agent/agent.py`.

### Store versus checkpointer

These remain distinct concerns:

~~~text
Store
    -> cross-run application data
    -> used by /memories/*

Checkpointer
    -> execution/thread state
    -> messages
    -> middleware state
    -> graph checkpoints
~~~

The presence of an InMemoryStore therefore does not itself establish thread
checkpoint persistence.

### Open runtime questions

Static graph introspection does not yet establish how `langgraph dev` manages
runtime persistence.

The next experiments need to determine:

1. whether the local runtime supplies checkpoint persistence when the exported
   graph has `checkpointer=None`;
2. how threads and runs are represented through the API;
3. whether the graph's embedded InMemoryStore is used directly or runtime
   infrastructure supplies a different store;
4. which state channels are exposed through runtime APIs;
5. how streaming events map to graph execution;
6. what survives a local runtime process restart.

## 0.12B1 — Runtime-Owned Persistence Boundary

### First server startup

The local development server successfully initialized:

~~~text
langgraph-api
    -> local_dev

langgraph-runtime-inmem
    -> active

development persistence flush loop
    -> active
~~~

However, graph registration failed.

### Failure

The exported `deep_agent` contained:

~~~text
store = InMemoryStore()
~~~

inside its compiled graph.

LangGraph API rejected the graph and reported that persistence for registered
graphs is managed by the platform/runtime.

The graph therefore failed during registration rather than during model
execution.

### Consequence

A graph definition suitable for direct Python execution is not necessarily a
valid LangGraph API deployment definition.

The original standalone arrangement was:

~~~text
CompiledStateGraph
    |
    +-- custom InMemoryStore
~~~

The Runtime contract requires:

~~~text
CompiledStateGraph
    |
    +-- store = None
    |
    v
LangGraph API Runtime
    |
    +-- runtime-managed persistence/store
~~~

### Split execution modes

The workshop agent was therefore separated into two modes.

Runtime/deployment:

~~~text
deep_agent
    -> no custom Store
    -> no custom Checkpointer
    -> persistence supplied by LangGraph API
~~~

Standalone Python:

~~~text
create_standalone_agent()
    |
    v
InMemoryStore
    -> process-local long-term memory
~~~

Both modes share the same tools, filesystem backend, memory route, AGENTS.md,
skills, and model configuration.

### Main lesson

Persistence ownership is part of the deployment contract.

Application code should not embed development-only persistence implementations
into a graph intended to be managed by LangGraph API.
