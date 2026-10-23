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

## 0.12B5 — Checkpoint Lineage Across Run Boundaries

### Objective

Verify whether checkpoint lineage itself crosses the boundary between separate
runs on the same thread.

The previous experiment had already demonstrated behavioral and state
continuity. This experiment reconstructs the checkpoint parent relationships
directly.

### Run 1

The first run produced checkpoints from:

~~~text
step -1
~~~

through:

~~~text
step 5
~~~

Its final checkpoint was:

~~~text
1f1ce7cc-c568-61ea-8005-0abc595ebd5b
~~~

### Run 2

The second run began with:

~~~text
step: 6
source: input
next: [__start__]
~~~

Its first checkpoint was:

~~~text
1f1ce7dc-56b0-6aea-8006-df45400bbc36
~~~

and its parent was:

~~~text
1f1ce7cc-c568-61ea-8005-0abc595ebd5b
~~~

which is exactly the final checkpoint from Run 1.

### Assertions

All assertions passed:

~~~text
different run ids                                PASS
run1 final checkpoint exists                     PASS
run2 first checkpoint exists                     PASS
run2 first parent is run1 final                  PASS
~~~

### Cross-run lineage

The resulting lineage is therefore:

~~~text
Run 1

C0 -> C1 -> C2 -> C3 -> C4 -> C5 -> C6
                                    |
                                    v
Run 2

                                    C7 -> C8 -> ... -> C13
~~~

The Runtime does not create an independent checkpoint chain for each run.

Instead, a new run on an existing thread extends the previous persisted
checkpoint lineage.

### Input checkpoint

The first checkpoint of Run 2 has:

~~~text
source = input
next = [__start__]
~~~

This shows that the new run input is applied to the previously persisted thread
state and itself becomes a new checkpoint before normal graph execution
continues.

Conceptually:

~~~text
previous thread state
        |
        v
new run input
        |
        v
checkpoint(source=input)
        |
        v
__start__
        |
        v
graph execution
~~~

### Step continuity

The observed step sequence did not restart between runs:

~~~text
Run 1: -1, 0, 1, 2, 3, 4, 5
Run 2:  6, 7, 8, 9, 10, 11, 12
~~~

For this linear thread execution, `metadata.step` therefore behaves as a
continuous state-transition sequence rather than a run-local counter.

This observation should not yet be generalized to branched/time-travel
execution, which will be tested separately.

### Main lesson

Thread continuity exists at the checkpoint-lineage level, not merely at the
conversation-message level.

A new run extends the existing persisted execution history:

~~~text
Run 1 final checkpoint
        |
        v
Run 2 input checkpoint
~~~

## 0.12B6 — Historical State by Checkpoint ID

### Objective

Verify that an earlier Runtime checkpoint remains directly addressable after
later runs have extended the same thread.

This is the read-only half of checkpoint time travel.

### Historical checkpoint

The final checkpoint from Run 1 was:

~~~text
1f1ce7cc-c568-61ea-8005-0abc595ebd5b
~~~

The Runtime endpoint:

~~~text
GET /threads/{thread_id}/state/{checkpoint_id}
~~~

returned the state associated with that exact checkpoint.

### Historical state

The Run 1 checkpoint contained two messages:

~~~text
Human:
Return exactly RUNTIME_CHECKPOINT_7319 and nothing else.

AI:
RUNTIME_CHECKPOINT_7319
~~~

It did not contain the later Run 2 request.

### Current state

The current thread state, after Run 2, contained four messages:

~~~text
Human  Run 1 request
AI     Run 1 response
Human  Run 2 request
AI     Run 2 response
~~~

Therefore retrieving an old checkpoint does not simply return the current
thread state.

It reconstructs the earlier persisted graph snapshot.

### Assertions

All assertions passed:

~~~text
historical state has two messages                              PASS
current state has four messages                                PASS
historical state contains original token                       PASS
historical state excludes run-2 request                        PASS
current state contains run-2 request                           PASS
historical checkpoint differs from current                     PASS
historical metadata retains middleware state                   PASS
~~~

### Historical middleware state

The historical checkpoint also retained:

~~~text
skills_metadata
memory_contents
~~~

Therefore historical state is not limited to conversation messages.

It contains the graph channels that were persisted at that execution point.

### Read-only time travel

The Runtime now demonstrates:

~~~text
Thread
 |
 +-- current state
 |
 +-- historical checkpoint C1
 |
 +-- historical checkpoint C2
 |
 +-- ...
 |
 +-- historical checkpoint CN
~~~

Each persisted checkpoint can be addressed directly by checkpoint ID.

This establishes read-only time travel:

~~~text
checkpoint ID
    |
    v
historical graph snapshot
~~~

No branching or execution from a historical checkpoint has yet been performed.

### Main lesson

Later runs extend the thread without destroying earlier snapshots.

Runtime checkpoint history is therefore versioned execution state, not merely
an audit list of identifiers.

## 0.12B7 — Historical Run Contract

### OpenAPI inspection

The pinned Runtime exposes historical checkpoint selection directly in the
stateful run creation schema.

`RunCreateStateful` contains:

~~~text
checkpoint: CheckpointConfig
~~~

described by the API as:

~~~text
The checkpoint to resume from.
~~~

`CheckpointConfig` exposes:

~~~text
thread_id
checkpoint_ns
checkpoint_id
checkpoint_map
~~~

Therefore historical execution is part of the normal stateful run contract.

### Distinct checkpoint operations

The API exposes three separate checkpoint-oriented operations.

Run creation:

~~~text
RunCreateStateful.checkpoint
    -> checkpoint to resume execution from
~~~

State mutation:

~~~text
ThreadStateUpdate.checkpoint
    -> checkpoint whose state should be updated
~~~

Historical state retrieval:

~~~text
ThreadStateCheckpointRequest.checkpoint
    -> checkpoint whose state should be returned
~~~

Therefore checkpoint selection, state mutation, and historical state retrieval
are distinct Runtime operations.

### Time-travel execution model

The expected execution model is:

~~~text
historical checkpoint
        |
        v
RunCreateStateful.checkpoint
        |
        + new input
        |
        v
new execution lineage
~~~

The next experiment will resume the existing thread from the final checkpoint
of Run 1, while the original Run 2 lineage already exists.

## 0.12B8 — Executable Time Travel and Checkpoint Branching

### Objective

Resume execution from the final checkpoint of Run 1 after Run 2 had already
extended the same thread.

The experiment tests whether historical execution creates an alternate
checkpoint lineage rather than destructively rolling back the existing thread
history.

### Historical execution request

The new run explicitly selected the final Run 1 checkpoint:

~~~text
checkpoint_id:
1f1ce7cc-c568-61ea-8005-0abc595ebd5b
~~~

and supplied a new input containing:

~~~text
BRANCH_FROM_RUN1_4827
~~~

The request did not include the original Run 2 messages.

### Branch state

The resulting state contained exactly four messages:

~~~text
Human  Run 1 request
AI     RUNTIME_CHECKPOINT_7319
Human  branch request
AI     BRANCH_FROM_RUN1_4827
~~~

The original Run 2 request was absent.

Therefore the historical checkpoint was used as the actual execution base.

### Checkpoint fork

The first checkpoint generated by the branch had:

~~~text
step: 6
source: input
parent_checkpoint_id:
    1f1ce7cc-c568-61ea-8005-0abc595ebd5b
~~~

The parent is exactly the final checkpoint of Run 1.

The checkpoint graph therefore forked:

~~~text
                 Run 1 final
                    C6
                   /  \
                  /    \
                 v      v
                C7      B7
                 |       |
                ...     ...
                 |       |
                 v       v
               C13      B13
~~~

### Original branch preservation

The original Run 2 final checkpoint remained directly retrievable after the
branch was created.

It still contained the original Run 2 conversation.

Therefore historical execution is non-destructive:

~~~text
branching
    != rollback that deletes later history

branching
    = alternate descendant lineage
~~~

### Thread HEAD

After the historical run completed, the ordinary current-state endpoint
returned the branch tip.

Therefore, in the observed pinned Runtime behavior, executing a historical
branch on the same thread advances the thread's current HEAD to the new branch
tip while preserving the previous branch as historical state.

### Step semantics

Both descendants of the Run 1 final checkpoint used the same step sequence:

~~~text
Original Run 2:
6, 7, 8, 9, 10, 11, 12

Historical branch:
6, 7, 8, 9, 10, 11, 12
~~~

Therefore `metadata.step` is not a globally unique monotonically increasing
thread counter.

For the observed execution it behaves as a logical position within a
checkpoint lineage.

Different branches can contain different checkpoints with the same step.

Unique identity must therefore come from checkpoint identity, not `step`.

### Assertions

All assertions passed:

~~~text
branch request selects Run-1 checkpoint                              PASS
branch result returns branch token                                   PASS
branch state has four messages                                       PASS
branch preserves Run-1 token                                         PASS
branch contains new branch input                                     PASS
branch contains new branch response                                  PASS
branch excludes original Run-2 request                               PASS
branch first checkpoint parent is Run-1 final                        PASS
branch final differs from original Run-2 final                       PASS
original Run-2 checkpoint remains retrievable                        PASS
original Run-2 historical state still has its request                PASS
current thread head is branch tip                                    PASS
~~~

### Main lesson

LangGraph Runtime checkpoint history is a branching execution DAG.

A stateful run can resume from an earlier checkpoint and create a new
descendant lineage without destroying already-existing descendants.

## 0.12B9 — Thread State Update Contract

### OpenAPI contract

The pinned Runtime exposes:

~~~text
POST /threads/{thread_id}/state
~~~

with a `ThreadStateUpdate` payload containing:

~~~text
values
checkpoint
as_node
~~~

The API describes these fields as:

~~~text
values
    -> The values to update the state with.

checkpoint
    -> The checkpoint to update the state of.

as_node
    -> Update the state as if this node had just executed.
~~~

The response contains a checkpoint object.

### Conceptual distinction

Historical run execution:

~~~text
checkpoint + Run
    -> resume graph execution
    -> execute nodes/model
    -> create natural descendant lineage
~~~

Manual state update:

~~~text
checkpoint + values + as_node
    -> directly modify graph state
    -> create a derived checkpoint
    -> no model execution required
~~~

The next experiment will update the historical final checkpoint of Run 1 and
compare the resulting lineage with the two already-existing descendants.

## 0.12B9 — Historical State Surgery with `update_state`

### Objective

Create a third descendant of the final Run 1 checkpoint through explicit state
mutation rather than graph execution.

Run 1 final already had two execution descendants:

~~~text
                 C6
                /  \
               /    \
              C7    B7
           Run 2   historical run branch
~~~

The experiment adds a third descendant using:

~~~text
POST /threads/{thread_id}/state
~~~

### Manual update

The update targeted C6 and supplied only:

~~~text
messages:
    Human("MANUAL_STATE_UPDATE_9134")

as_node:
    __start__
~~~

No model execution was requested.

The Runtime returned a new checkpoint:

~~~text
1f1ce80a-6e9c-6213-8006-d05110082cf7
~~~

whose parent was C6.

### State reducer behavior

The resulting `messages` channel contained:

~~~text
Human  Run 1 request
AI     RUNTIME_CHECKPOINT_7319
Human  MANUAL_STATE_UPDATE_9134
~~~

The update therefore did not replace the channel.

The graph's messages reducer combined the existing state with the supplied
update.

Conceptually:

~~~text
existing channel state
        +
update_state values
        |
        v
channel reducer
        |
        v
new persisted state
~~~

`update_state` therefore follows graph channel/reducer semantics rather than
behaving like a plain dictionary replacement.

### Update checkpoint metadata

The generated checkpoint had:

~~~text
source: update
step: 6
parent: C6
~~~

This distinguishes an explicit state mutation from ordinary Runtime
transitions:

~~~text
source=input
    -> run input checkpoint

source=loop
    -> normal graph transition

source=update
    -> explicit state update
~~~

### `as_node` and execution position

The request used:

~~~text
as_node = "__start__"
~~~

The resulting checkpoint reported:

~~~text
next:
    SkillsMiddleware.before_agent
~~~

with a pending task for the same node.

Therefore `as_node` is not merely descriptive metadata.

It affects the graph execution position by telling the Runtime to apply the
state update as though the specified node had just executed.

Conceptually:

~~~text
manual state values
        +
as_node="__start__"
        |
        v
new checkpoint
        |
        v
graph successor calculation
        |
        v
SkillsMiddleware.before_agent
~~~

The Runtime state update therefore modifies both data state and control-flow
position.

### Third descendant

C6 now has three independently created children:

~~~text
                         C6 step=5
                       /     |     \
                      /      |      \
                     v       v       v
                  C7         B7       U7
                Run 2      Run      update_state
                step=6     step=6    step=6
~~~

This further confirms that `metadata.step` is not a globally unique or
wall-clock-ordered thread sequence.

Different branches can contain distinct checkpoints at the same logical step.

### Thread HEAD

Before the manual update, the current thread HEAD was the historical execution
branch tip.

After the update, the current HEAD became the new update checkpoint.

Therefore, in the pinned Runtime:

~~~text
update_state(historical checkpoint)
    -> create alternate descendant
    -> move current thread HEAD to that descendant
~~~

Older branches remain preserved in checkpoint history.

### Pending execution

Unlike the completed run checkpoints, the manual update checkpoint has a
non-empty `next` field:

~~~text
next:
    SkillsMiddleware.before_agent
~~~

It therefore represents a persisted graph state that is ready to continue
execution rather than a completed workflow state.

### Assertions

All assertions passed:

~~~text
request targets Run-1 historical checkpoint                        PASS
update checkpoint differs from Run-1 base                          PASS
update checkpoint parent is Run-1 final                            PASS
updated state has three messages                                   PASS
updated state preserves Run-1 human message                        PASS
updated state preserves Run-1 AI response                          PASS
updated state contains manual human message                        PASS
updated state excludes original Run-2 request                      PASS
updated state excludes previous execution branch                   PASS
~~~

### Main lesson

`update_state` is graph-aware state surgery.

It can:

~~~text
select a historical checkpoint
apply reducer-aware state changes
attribute the change to a graph node
create a new checkpoint branch
position graph execution for continuation
move the thread HEAD
~~~

without executing the model.

## 0.12B10 — Three Direct Descendants of One Checkpoint

### Objective

Inspect the checkpoint DAG after creating three different descendants of the
same historical checkpoint through two mechanisms:

1. normal stateful runs;
2. explicit `update_state`.

### Direct children

The final Run 1 checkpoint has exactly three direct children:

~~~text
C6 step=5
|
+-- C7
|   source=input
|   step=6
|   run_id=<original Run 2>
|
+-- B7
|   source=input
|   step=6
|   run_id=<historical branch run>
|
+-- U7
    source=update
    step=6
    run_id=None
~~~

All assertions passed:

~~~text
C6 has exactly three direct children                 PASS
all three children are logical step 6                PASS
two children came from run input                     PASS
one child came from update_state                     PASS
manual update is one direct child                    PASS
~~~

### Run checkpoints versus update checkpoints

The two run-created children have:

~~~text
source = input
run_id = <run identifier>
next = [__start__]
~~~

The state-surgery child has:

~~~text
source = update
run_id = None
next = [SkillsMiddleware.before_agent]
~~~

This confirms that `update_state` creates persisted graph state without
creating a Run.

### `as_node` and control-flow position

The manual update used:

~~~text
as_node = "__start__"
~~~

Its resulting checkpoint therefore starts after `__start__`:

~~~text
next = [SkillsMiddleware.before_agent]
~~~

By comparison, a normal new Run first creates an input checkpoint whose next
node is still:

~~~text
__start__
~~~

The difference can be represented as:

~~~text
Run input:

new input
   |
   v
checkpoint(source=input)
   |
   v
__start__
   |
   v
SkillsMiddleware


update_state(as_node="__start__"):

manual values
   |
   v
checkpoint(source=update)
   |
   v
SkillsMiddleware
~~~

### Step semantics

All three children have:

~~~text
step = 6
~~~

despite being created at different wall-clock times and through different
mechanisms.

Therefore `metadata.step` is best interpreted, for the behavior observed in
this pinned Runtime, as logical lineage position rather than a globally unique
thread sequence.

### Main lesson

A Runtime thread checkpoint history is a true execution DAG.

The same parent state can have multiple independently created descendants,
including descendants created without a Run.

## 0.12B11 — Resume After Historical State Surgery

### Objective

Resume the checkpoint created by `update_state` without supplying any new
input.

The update checkpoint had:

~~~text
source: update
step: 6
run_id: None
next:
    SkillsMiddleware.before_agent
~~~

and contained the manually inserted HumanMessage:

~~~text
MANUAL_STATE_UPDATE_9134
~~~

### Resume request

The new stateful run selected the update checkpoint but supplied no `input`.

Conceptually:

~~~text
RunCreateStateful
    assistant_id
    checkpoint = U7
    no input
~~~

### Execution continuation

The Runtime did not create a new `source=input` checkpoint.

Instead, execution continued directly from the pending node stored in U7.

The observed sequence was:

~~~text
U7
step=6
next=SkillsMiddleware.before_agent
    |
    v
step=7
source=loop
next=PatchToolCallsMiddleware.before_agent
    |
    v
step=8
next=MemoryMiddleware.before_agent
    |
    v
step=9
next=model
    |
    v
step=10
next=TodoListMiddleware.after_model
    |
    v
step=11
next=[]
~~~

The first descendant of U7 was therefore a normal loop checkpoint rather than
a new input checkpoint.

### Resume versus new input

The experiments now distinguish two stateful-run behaviors.

New input:

~~~text
previous checkpoint
    |
    v
checkpoint(source=input)
    |
    v
__start__
    |
    v
graph execution
~~~

Resume with no input:

~~~text
pending checkpoint
    |
    v
execute checkpoint.next
    |
    v
checkpoint(source=loop)
    |
    v
graph execution continues
~~~

### `as_node` end-to-end behavior

The previous `update_state` used:

~~~text
as_node="__start__"
~~~

and produced:

~~~text
next=SkillsMiddleware.before_agent
~~~

The resume experiment confirmed that this stored control-flow position is
executable.

The Runtime resumed by executing `SkillsMiddleware.before_agent`, then advanced
through the subsequent graph nodes.

Therefore `as_node` affects actual continuation semantics, not merely
checkpoint metadata.

### State surgery and Runs

The update checkpoint itself had:

~~~text
run_id=None
~~~

Resuming that checkpoint created a new Runtime Run.

Therefore:

~~~text
update_state
    -> create graph state
    -> no Run required

resume
    -> execute graph from that state
    -> create Run
~~~

### Model consumption of manually mutated state

Before resume, the messages channel contained:

~~~text
Human  original request
AI     original response
Human  MANUAL_STATE_UPDATE_9134
~~~

No new HumanMessage was supplied during resume.

After execution, the state contained:

~~~text
Human  original request
AI     original response
Human  MANUAL_STATE_UPDATE_9134
AI     MANUAL_STATE_UPDATE_9134
~~~

Therefore the model consumed the HumanMessage introduced through
`update_state`.

This demonstrates an end-to-end state-surgery flow:

~~~text
manual state mutation
        |
        v
persisted graph checkpoint
        |
        v
resume
        |
        v
model consumes repaired state
        |
        v
normal graph completion
~~~

### Assertions

All assertions passed:

~~~text
resume request contains no input                           PASS
resume request targets U7                                  PASS
U7 was pending before resume                               PASS
manual marker existed before resume                        PASS
manual marker survives resume                              PASS
resume did not add another human message                   PASS
resume produced a new checkpoint                           PASS
resume created a Run                                       PASS
resume Run exists in history                               PASS
U7 has a descendant after resume                           PASS
~~~

### Main lesson

A Runtime checkpoint is not only a historical snapshot.

When it contains pending `next` nodes, it is an executable continuation point.

`update_state` plus `as_node` can therefore be used to perform graph-aware
state surgery and subsequently resume normal agent execution from the repaired
state.

## 0.12B12 — Runtime Store API Contract

### Objective

Inspect the Store API exposed by the pinned LangGraph Runtime before testing
Deep Agents `StoreBackend` integration.

### Store item model

The Runtime Store represents an item as:

~~~text
namespace: string[]
key: string
value: object
created_at: datetime
updated_at: datetime
~~~

The OpenAPI description explicitly identifies Store items as documents or data
entries used for cross-thread memories.

### Store operations

The Runtime exposes:

~~~text
GET    /store/items
PUT    /store/items
DELETE /store/items

POST   /store/items/search
POST   /store/namespaces
~~~

A PUT requires:

~~~text
namespace
key
value
~~~

and optionally supports:

~~~text
index
ttl
~~~

### Search

`POST /store/items/search` supports two modes.

Without `query`:

~~~text
list items ordered by updated time
~~~

With `query`:

~~~text
natural-language search over Store contents
~~~

It also supports:

~~~text
namespace_prefix
filter
limit
offset
refresh_ttl
~~~

### Namespaces

Namespaces are hierarchical arrays of strings.

They can be listed using:

~~~text
prefix
suffix
max_depth
limit
offset
~~~

### Runtime persistence model

The API now exposes two distinct persistence domains:

~~~text
Thread / Checkpoint persistence
    -> per-thread execution state and history

Store persistence
    -> namespace/key/value data intended for cross-thread memory
~~~

The next experiment validates Store behavior directly before connecting it to
Deep Agents `StoreBackend`.
