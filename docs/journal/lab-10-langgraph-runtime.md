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

## 0.12B2 — Assistant and Thread Resources

### Default assistant

After successful graph registration, the Runtime automatically created a
system-owned assistant for the configured graph:

~~~text
graph_id: deep_agent
name: deep_agent
version: 1
~~~

The assistant therefore represents a registered graph/application
configuration that can be selected when creating runs.

### Empty thread

Creating a thread before any run produced:

~~~text
status: idle
values: null
~~~

The thread state endpoint returned:

~~~text
values: {}
next: []
tasks: []
checkpoint: null
parent_checkpoint: null
checkpoint_id: null
parent_checkpoint_id: null
~~~

This establishes a clean baseline before execution.

### Runtime resource model

At this point the API exposes distinct concepts:

~~~text
Assistant
    -> registered graph/configuration

Thread
    -> persistent execution-state identity
~~~

A thread exists independently of a run and initially has no graph checkpoint.

## 0.12B3 — Runtime-Managed Checkpoints

### Objective

Determine whether LangGraph API provides thread/checkpoint persistence even
when the exported CompiledStateGraph has:

~~~text
checkpointer = None
store = None
~~~

### First run

The first thread run received only:

~~~text
Return exactly RUNTIME_CHECKPOINT_7319 and nothing else.
~~~

The model returned:

~~~text
RUNTIME_CHECKPOINT_7319
~~~

### State after the run

The Runtime thread state contained:

~~~text
messages
skills_metadata
memory_contents
~~~

The messages channel contained both the HumanMessage and AIMessage.

SkillsMiddleware metadata was persisted in:

~~~text
skills_metadata
~~~

and the AGENTS.md snapshot was persisted in:

~~~text
memory_contents
~~~

### Runtime-owned checkpoint

The state returned a concrete checkpoint identifier and parent checkpoint:

~~~text
checkpoint_id
parent_checkpoint_id
~~~

This occurred even though:

~~~text
deep_agent.checkpointer is None
~~~

Therefore the pinned LangGraph API Runtime manages checkpoint persistence
outside the exported graph object.

The effective architecture is:

~~~text
CompiledStateGraph
    checkpointer=None
    store=None
        |
        v
LangGraph API Runtime
        |
        +-- threads
        +-- checkpoints
        +-- checkpoint history
        +-- runtime Store
        +-- run lifecycle
~~~

### Assertions

All assertions passed:

~~~text
runtime state contains run-1 token                         PASS
runtime state contains messages channel                    PASS
runtime state contains memory_contents channel             PASS
runtime state contains skills_metadata channel             PASS
~~~

### Private middleware state

The Runtime state API exposed both:

~~~text
memory_contents
skills_metadata
~~~

Although these graph fields use `PrivateStateAttr`, they are persisted as
checkpoint channels and visible through the Runtime thread-state API in the
pinned stack.

Therefore:

~~~text
PrivateStateAttr
    != ephemeral
    != non-checkpointed
    != necessarily hidden from Runtime state inspection
~~~

### Multiple checkpoints per run

Thread history revealed multiple checkpoints during one run.

The execution progressed through states associated with:

~~~text
__start__
SkillsMiddleware.before_agent
PatchToolCallsMiddleware.before_agent
MemoryMiddleware.before_agent
model
...
~~~

Each stage generated state that could be inspected through checkpoint history.

Therefore:

~~~text
run
    != checkpoint
~~~

One run can generate a chain of multiple checkpoints.

### Checkpoint lineage

Checkpoint entries contain:

~~~text
checkpoint_id
parent_checkpoint_id
~~~

forming a parent-linked execution history.

Conceptually:

~~~text
C0
 |
 v
C1
 |
 v
C2
 |
 v
...
 |
 v
CN
~~~

This lineage is the foundation for later experiments involving replay,
time-travel, state updates, branching, and interruption/resume.

### Runtime concepts

The experiments now support the following model:

~~~text
Assistant
    -> graph/configuration to execute

Thread
    -> persistent execution identity

Run
    -> one execution request against a thread

Checkpoint
    -> persisted state snapshot during graph execution
~~~

A single thread can contain multiple runs and each run can generate multiple
checkpoints.

## 0.12B4 — State Continuity Across Runs

### Objective

Verify that separate runs executed against the same Runtime thread continue
from previously persisted graph state.

### Run 1

The first run stored:

~~~text
Human:
Return exactly RUNTIME_CHECKPOINT_7319 and nothing else.

AI:
RUNTIME_CHECKPOINT_7319
~~~

The resulting thread contained two messages.

### Run 2 input

The second request did not contain the token.

It only asked:

~~~text
Return only the exact token I instructed you to return in the previous run.
Do not use tools.
~~~

### Run 2 result

The model returned:

~~~text
RUNTIME_CHECKPOINT_7319
~~~

The resulting thread contained four messages:

~~~text
0 Human   original token instruction
1 AI      RUNTIME_CHECKPOINT_7319
2 Human   reference to the previous run
3 AI      RUNTIME_CHECKPOINT_7319
~~~

Therefore the second run was executed with the conversation state persisted by
the first run.

### Assertions

All assertions passed:

~~~text
run-2 request does not contain token                               PASS
run-2 result recovers token                                        PASS
run-1 state has two messages                                       PASS
run-2 state has four messages                                      PASS
run-2 state preserves original human token request                 PASS
run-2 state preserves original AI token response                   PASS
run-2 state contains new human request                             PASS
run-2 final checkpoint differs from run-1                          PASS
run-2 has a parent checkpoint                                      PASS
~~~

### Runtime continuity model

~~~text
Thread A

Run 1
    |
    +-- graph state
    +-- checkpoints
    |
    v
Runtime persistence
    |
    v
Run 2
    |
    +-- previous messages restored
    +-- new input appended
    +-- new checkpoints generated
~~~

This confirms cross-run thread continuity even though the exported
CompiledStateGraph itself has:

~~~text
checkpointer = None
~~~

### Run versus thread state

The `/runs/wait` response for this experiment returned the accumulated messages
rather than only the new run delta.

The observed result therefore contained:

~~~text
Run 1 messages
+
Run 2 messages
~~~

### Provider prompt caching

The first model request reported approximately:

~~~text
cache_write_tokens: 6809
cached_tokens: 0
~~~

The second reported:

~~~text
cached_tokens: 6809
cache_write_tokens: 37
~~~

This is provider-level prompt caching and is separate from LangGraph thread
persistence.

LangGraph persistence determines what logical state is restored.

Provider prompt caching determines whether a repeated prompt prefix can be
reused efficiently by the model provider.

### Checkpoint-lineage caveat

The final Run 2 checkpoint's immediate parent is another checkpoint generated
during Run 2.

Therefore the current experiment proves cross-run state continuity but does not
yet identify the exact checkpoint edge connecting:

~~~text
Run 1 final checkpoint
    ->
Run 2 initial checkpoint
~~~

That boundary will be inspected directly from checkpoint history next.
