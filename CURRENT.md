# Current Work

## Current phase

Phase 1 — Agent Runtime & Protocols

Current block:

~~~text
1.4 Run execution modes and background execution
    -> durability
    -> persistence guarantees
~~~

## Completed

### Phase 0 — Deep Agents

Phase 0 is complete.

The repository has validated:

- Deep Agents harness architecture;
- planning and filesystem;
- tools;
- StateBackend, FilesystemBackend, StoreBackend and CompositeBackend;
- subagents;
- human-in-the-loop;
- long-term memory;
- AGENTS.md instruction memory;
- SkillsMiddleware and progressive disclosure;
- LangGraph Runtime and Studio integration.

### Phase 1 — Runtime foundations

The following Lab 12 blocks are complete:

~~~text
1.1 Runtime API contracts
1.2 Run lifecycle and streaming execution
1.3 Run concurrency and multitask strategies
~~~

Those blocks collectively cover:

- Agent, Assistant, Thread and Run;
- State and checkpoints;
- Store and persistence;
- streaming and resumable streaming;
- cancellation and rollback;
- concurrency and multitask strategies;
- scheduler behavior.

## Established Runtime model

### Resources

~~~text
Deployment
    |
    v
registered Graph
    |
    v
Assistant
    |
    v
Run
~~~

Stateful execution additionally uses a caller-owned Thread.

Stateless execution still uses a Thread internally, but its lifecycle is managed
by the Runtime.

### Run lifecycle

Run is the execution-attempt resource.

Observed statuses include:

~~~text
pending
running
success
interrupted
error
timeout
~~~

Run lifecycle and persisted graph execution position are separate dimensions.

In particular:

~~~text
Run.status = success
~~~

does not imply:

~~~text
graph reached END
~~~

A successful Run can leave:

~~~text
Thread.status = interrupted
ThreadState.next != []
~~~

when execution stops at a configured breakpoint.

### State and checkpoints

Thread state contains both application state and graph execution-control state.

Important fields include:

~~~text
values
next
tasks
checkpoint
parent_checkpoint
interrupts
~~~

Checkpoint history forms a lineage/DAG that supports:

- historical inspection;
- branching;
- time travel;
- resume;
- direct state mutation.

A lookup through:

~~~text
GET /threads/{thread_id}/state/{checkpoint_id}
~~~

must not be used as an existence check.

Missing checkpoint selectors can return HTTP 200 with a synthetic empty
ThreadState.

### Store

Store is independent from Thread checkpoint persistence.

Conceptually:

~~~text
Checkpointer
    -> execution persistence

Store
    -> cross-thread application / memory persistence
~~~

StoreBackend can resolve the Runtime-owned Store.

### Streaming

A Run can be consumed through SSE without changing the underlying execution
primitive.

Validated semantic stream modes include:

~~~text
updates
values
messages
checkpoints
~~~

Resumable streams use persisted cursor IDs.

Multiple semantic events may share one cursor ID, so a cursor must be treated as
a group boundary rather than as a unique event identifier.

### Cancellation

`interrupt` and `rollback` have distinct persistence semantics.

~~~text
interrupt
    -> terminate execution
    -> preserve already-materialized Thread state

rollback
    -> terminate execution
    -> delete the superseded Run
    -> delete its checkpoint lineage
    -> restore prior Thread state
~~~

A pinned Runtime bug was identified for explicit rollback of a delayed pending
Run with an existing queue:

~~~text
pending
+ delayed
+ queued
+ explicit action=rollback
    ->
Run becomes interrupted before scheduler admission
    ->
worker rollback path is never reached
    ->
Run remains persisted
~~~

Normal active rollback works correctly.

### Multitask strategies

Public stateful Run creation supports:

~~~text
reject
enqueue
interrupt
rollback
~~~

Observed semantics:

~~~text
reject
    -> HTTP 409
    -> conflicting Run is not persisted

enqueue
    -> persist as pending
    -> scheduled per-Thread serialized execution

interrupt
    -> supersede old Run
    -> old Run remains interrupted
    -> partial state survives
    -> new Run continues from that partial state

rollback
    -> supersede old Run
    -> old Run is removed
    -> old Run state/checkpoints are removed
    -> new Run starts from the pre-old-Run state
~~~

The public HTTP default is:

~~~text
enqueue
~~~

### Thread status caveat

Thread.status is a denormalized lifecycle projection and is not authoritative
for in-flight Run existence.

A validated state was:

~~~text
Thread.status = idle
Run.status    = pending
~~~

Multitask conflict detection still correctly rejected another Run.

Clients must not use `Thread.status == idle` as the sole execution-availability
test.

### Scheduler

The pinned in-memory scheduler:

1. selects Runs whose status is `pending`;
2. requires `created_at < now`;
3. orders eligible Runs by ascending `created_at`;
4. prevents simultaneous `running` Runs on the same Thread.

Delayed Run creation assigns approximately:

~~~text
created_at =
    submission time + after_seconds
~~~

Therefore enqueue ordering is scheduled eligibility ordering, not strict HTTP
submission FIFO.

Runtime validation confirmed:

~~~text
submission:
    A -> B -> C

scheduled:
    B -> C -> A

execution:
    B -> C -> A

persisted message order:
    B -> C -> A
~~~

## Current block — Background runs

Existing evidence already establishes:

~~~text
POST /runs
    -> stateless background Run

POST /threads/{thread_id}/runs
    -> stateful background Run

POST /threads/{thread_id}/runs/wait
    -> create Run and wait for output

POST /threads/{thread_id}/runs/stream
    -> create Run and consume through SSE

GET /threads/{thread_id}/runs/{run_id}/stream
    -> join an existing Run stream
~~~

`after_seconds` schedules future worker eligibility.

The remaining major contract is durability.

## Durability source findings

LangGraph defines:

~~~text
sync
async
exit
~~~

The pinned Runtime also contains compatibility translation between the current
`durability` option and the older `checkpoint_during` boolean.

Observed source mapping includes:

~~~text
checkpoint_during = true
    -> durability = async

checkpoint_during = false
    -> durability = exit

durability = async
    -> checkpoint_during = true

durability = exit
    -> checkpoint_during = false
~~~

`sync` has no equivalent representation in the legacy boolean bridge.

The exact persistence guarantees of:

~~~text
sync
async
exit
~~~

still need to be established from pinned LangGraph source and Runtime evidence.

## Next step

Inspect the LangGraph durability definition and checkpoint write path.

Then validate the three durability modes with minimal execution experiments.

After durability is complete:

~~~text
1.4 Run execution modes and background execution -> complete
~~~

and proceed to:

~~~text
Agent Protocol
Agent Streaming Protocol
MCP
A2A
~~~

## Reference environment

Pinned workshop:

~~~text
.reference/interrupt26-deepagents
commit:
3d3287cf1e51250934c11aff182d90ccfaf0e66d
~~~

The reference clone intentionally contains local uncommitted patches and must
not be reset or committed.

Runtime development server:

~~~text
http://127.0.0.1:2024
~~~

Pinned Runtime-related packages include:

~~~text
deepagents              0.5.3
langchain               1.2.15
langchain-core          1.3.3
langgraph               1.1.9
langgraph-cli           0.4.24
langgraph-sdk           0.3.13
langgraph-runtime-inmem 0.28.0
~~~
