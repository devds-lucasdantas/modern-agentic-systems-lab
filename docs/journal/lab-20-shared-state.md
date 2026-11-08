# Lab 20 — Shared State

## Goal

Establish an explicit, checkpoint-aware boundary between LangGraph Runtime
state and frontend application state.

The frontend must not treat ThreadState as an arbitrary mutable object.

## 2.3A — Runtime shared-state contract discovery

### Pinned Runtime contract

The studied endpoint is:

~~~text
POST /threads/{thread_id}/state
~~~

The pinned OpenAPI request schema is ThreadStateUpdate:

~~~text
values
checkpoint
as_node
~~~

Field semantics:

- `values`: values submitted to the graph's state channels and reducers.
- `checkpoint`: checkpoint configuration identifying a state-update target.
- `as_node`: graph node to which the update is attributed.

The declared HTTP responses include:

~~~text
200 -> ThreadStateUpdateResponse
422 -> ErrorResponse
~~~

The declared response schema contains a `checkpoint` object.

### Experiment A — Graph identity prerequisite

A disposable Thread was created without any assigned graph.

Its initial persisted state was:

~~~text
values = {}
checkpoint = null
next = []
~~~

Attempting an immediate state update produced:

~~~text
HTTP 400

Thread has no assigned graph ID.
~~~

The Runtime explained that the Thread must first be associated with a graph,
either through a previous Run or through explicit Thread metadata.

The successful experiment created a Thread using:

~~~json
{
  "metadata": {
    "graph_id": "deep_agent",
    "lab": "2.3A",
    "purpose": "shared-state-discovery"
  }
}
~~~

No Run or model invocation was necessary.

The observed HTTP 400 semantic prerequisite is not explicitly enumerated
among the response codes declared for the operation in the inspected OpenAPI.

### Experiment B — First persisted state mutation

Initial ThreadState:

~~~text
values = {}
checkpoint = null
next = []
~~~

The state update submitted:

~~~json
{
  "values": {
    "messages": [
      {
        "type": "human",
        "id": "lab-23a-user-001",
        "content": "SHARED_STATE_DISCOVERY_001"
      }
    ]
  },
  "as_node": "__start__"
}
~~~

The Runtime returned:

~~~text
checkpoint
configurable
checkpoint_id
~~~

The latter two fields were present in the observed Runtime response despite
not appearing as declared properties of ThreadStateUpdateResponse.

The subsequent GET ThreadState confirmed:

~~~text
values.messages = [HumanMessage]
metadata.source = update
metadata.step = 0
parent_checkpoint = null
next = [SkillsMiddleware.before_agent]
~~~

The Runtime created a persisted checkpoint without executing the model.

This operation affected both state values and graph execution position.

Consequently:

~~~text
POST ThreadStateUpdate
    !=
generic JSON PATCH
~~~

### Experiment C — Sequential reducer behavior

A reproducible experiment was implemented in:

~~~text
scripts/lab-23a-shared-state.py
~~~

The script:

1. starts an isolated pinned Runtime on a temporary port;
2. creates a disposable Thread associated with `deep_agent`;
3. performs three sequential state updates;
4. verifies reducer semantics;
5. verifies checkpoint ancestry;
6. reads historical checkpoints;
7. verifies that historical reads do not move HEAD;
8. deletes the disposable Thread;
9. terminates the isolated Runtime.

No model call is performed.

#### Update 1 — Add message A

Submitted:

~~~text
id = lab-23a-msg-a
content = STATE_A_V1
~~~

Persisted result:

~~~text
messages = [A v1]
~~~

The Runtime created checkpoint C1.

#### Update 2 — Add message B

Submitted:

~~~text
id = lab-23a-msg-b
content = STATE_B_V1
~~~

Persisted result:

~~~text
messages = [A v1, B v1]
~~~

The Runtime created checkpoint C2.

The new message was added without removing message A.

#### Update 3 — Replace message A by ID

Submitted:

~~~text
id = lab-23a-msg-a
content = STATE_A_V2
~~~

Persisted result:

~~~text
messages = [A v2, B v1]
~~~

The Runtime created checkpoint C3.

The existing message with the same ID was replaced in place.

No additional message was introduced.

### Reducer conclusion

The observed `messages` channel is identity-aware.

~~~text
new Message ID
    -> append

existing Message ID
    -> replace existing message
~~~

This behavior differs from generic array replacement.

It is a property of the graph's message-channel reducer and must not be
generalized to every StateValues channel.

The frontend should not implement its own assumptions about reducer behavior
for arbitrary state fields.

### Checkpoint lineage

All three updates produced distinct checkpoints.

The observed lineage was:

~~~text
C1 (step 0)
    |
    v
C2 (step 1)
    |
    v
C3 (step 2) <- HEAD
~~~

Properties:

~~~text
C1:
    metadata.source = update
    metadata.step = 0
    parent_checkpoint = null

C2:
    metadata.source = update
    metadata.step = 1
    parent_checkpoint = C1

C3:
    metadata.source = update
    metadata.step = 2
    parent_checkpoint = C2
~~~

All three checkpoints reported:

~~~text
next = [SkillsMiddleware.before_agent]
~~~

The experiment explicitly used:

~~~text
as_node = "__start__"
~~~

for every update.

This establishes that node attribution is relevant to the resulting persisted
execution position.

### Historical state preservation

The experiment read historical checkpoints through:

~~~text
GET /threads/{thread_id}/state/{checkpoint_id}
~~~

Historical state C1 contained:

~~~text
[A v1]
~~~

Historical state C2 contained:

~~~text
[A v1, B v1]
~~~

The current HEAD remained C3:

~~~text
[A v2, B v1]
~~~

Therefore historical reads preserved their original message versions and did
not mutate current Thread HEAD.

### State-update response versus persisted state

The state-update response provided checkpoint identification.

It did not provide the complete resulting ThreadState.

The experiment therefore followed:

~~~text
POST /threads/{thread_id}/state
    |
    v
checkpoint reference
    |
    v
GET /threads/{thread_id}/state
    |
    v
persisted values + execution position
~~~

The frontend should continue to treat GET ThreadState as the authoritative
read-side reconciliation operation.

### Validation results

All six semantic assertions passed:

~~~text
PASS: new message IDs append
PASS: existing message ID replaces
PASS: three distinct checkpoints
PASS: linear checkpoint ancestry
PASS: historical snapshots preserved
PASS: historical reads do not move HEAD
~~~

Cleanup also succeeded:

~~~text
PASS: disposable Thread deleted
PASS: isolated Runtime cleanup
~~~

Python syntax validation and Git whitespace checks completed without errors.

### Architectural implications

State updates must respect:

~~~text
Graph identity
State channels
Reducer semantics
Node attribution
Checkpoint identity
Graph execution position
~~~

The frontend should model updates as explicit, graph-aware operations rather
than generic JSON object mutations.

The Runtime owns reducer application and checkpoint creation.

The frontend owns user intent, safe state projection and reconciliation.

Conceptually:

~~~text
UI mutation intent
    |
    v
explicit state-update command
    |
    v
POST ThreadStateUpdate
    |
    v
Runtime reducers
    |
    v
new persisted checkpoint
    |
    v
GET ThreadState
    |
    v
authoritative UI projection
~~~

### Not established by 2.3A

This block does not establish:

~~~text
concurrent mutation safety
compare-and-swap semantics
stale-checkpoint rejection
safe optimistic updates
authorization to mutate state
reducer semantics of every state channel
~~~

A supplied checkpoint selector must not automatically be assumed to be an
optimistic-concurrency precondition. That requires separate validation.

### 2.3A conclusion

The pinned Runtime supports graph-aware persisted state mutations without
requiring a model invocation.

Sequential updates confirmed identity-aware message reduction, distinct
checkpoint creation and preserved historical snapshots.

These behaviors provide the empirical foundation for the frontend shared-state
model.

## 2.3B — Frontend state projection boundary

Pending.

Determine which Runtime state fields can be exposed as stable, typed frontend
projections without leaking graph-internal control state into generic UI stores.

The first implementation should be read-only, deterministic and testable
without HTTP or React.
