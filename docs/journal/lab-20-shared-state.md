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

### Objective

Introduce a deterministic, explicit, read-only projection of persisted
ThreadState for frontend consumption.

The implementation must not expose arbitrary Runtime values or treat graph
execution state as a generic frontend store.

### Existing baseline

Before 2.3B, persisted messages were projected through:

~~~text
projectMessagesFromState
~~~

However, ExecutionSurface still accessed:

~~~text
state.position.next
state.checkpoint
~~~

directly.

The new projection centralizes these read-side transformations.

### Projection contract

Implemented in:

~~~text
apps/web/src/execution/thread-state-projector.ts
~~~

Public API:

~~~text
projectThreadState(ThreadState)
    -> PersistedThreadProjection
~~~

The projection includes:

~~~text
authority = persisted
threadId
messages
graph
    status
    next
    checkpointId
    parentCheckpointId
    taskCount
    interruptCount
~~~

Only explicitly selected fields cross the read boundary.

The projection does not copy:

~~~text
arbitrary StateValues channels
raw Runtime metadata
raw tasks
interrupt payloads
checkpoint configuration internals
~~~

This is an allowlist boundary, not a general-purpose data sanitizer.

### Graph read status

The graph summary distinguishes:

~~~text
uninitialized
    -> checkpoint is absent

pending
    -> checkpoint exists
    -> next is non-empty

end
    -> checkpoint exists
    -> next is empty
~~~

An empty Thread must not be rendered as END merely because next is empty.

The status `end` describes persisted execution position. It does not establish
business-level success and is not a substitute for Run lifecycle state.

### Message projection reuse

The new projector delegates message normalization to the existing
message-projector.

~~~text
ThreadState
    -> projectMessagesFromState
    -> normalized Message[]
~~~

No second message decoder was introduced.

### Frontend integration

The persisted-state reconciliation paths in useExecution now obtain messages
through:

~~~text
projectThreadState(state).messages
~~~

ExecutionSurface obtains graph position and checkpoint information from:

~~~text
projectThreadState(state).graph
~~~

The SSE transport, reconnect algorithm and Runtime lifecycle reconciliation
were not modified.

### Read-side immutability

The projection uses readonly TypeScript interfaces.

The graph next array is copied rather than aliased to the input array.

The tests verified that mutating the original next array does not change an
already created projection.

Readonly typing alone does not establish deep runtime immutability, complete
payload isolation or authorization.

### Pure projection tests

The test source is:

~~~text
apps/web/src/execution/thread-state-projector.spec.ts
~~~

It runs independently of React rendering, HTTP requests and the Runtime.

The test suite validated:

~~~text
1. empty Thread is uninitialized, not END
2. projection exposes persisted provenance
3. pending graph position is projected
4. checkpoint identities are projected
5. control data is summarized by counts
6. supported messages channel is normalized
7. internal Runtime payloads are not exposed
8. projection is an explicit allowlist
9. projected next array is detached from Runtime input
10. source array mutation does not change projection
11. persisted checkpoint with empty next is END
12. unprojected values remain outside the UI boundary
~~~

Result:

~~~text
12 pure projection assertions passed
~~~

### Browser regression

The existing Playwright suite was executed after the projection integration.

Validated cases:

~~~text
interrupted-reconciliation.spec.ts
persisted-reconciliation.spec.ts
reconciliation-failure.spec.ts
resumable-stream.spec.ts
~~~

Result:

~~~text
4 passed
~~~

Static validation also passed:

~~~text
oxlint: 0 warnings, 0 errors
TypeScript and Vite production build: PASS
git diff --check: PASS
~~~

### Reproduction

From apps/web:

~~~bash
pnpm lint
pnpm build

pnpm exec vite build \
  --ssr src/execution/thread-state-projector.spec.ts \
  --outDir /tmp/masl-23b-projection \
  --emptyOutDir

printf '%s\n' '{"type":"module"}' \
  > /tmp/masl-23b-projection/package.json

node /tmp/masl-23b-projection/thread-state-projector.spec.js

pnpm exec playwright test --project=chromium
~~~

The browser suite uses the real pinned Runtime and may execute model calls.
The pure projection suite does not require a Runtime or model.

### Architectural conclusion

The read-side boundary is now:

~~~text
Runtime ThreadState
    |
    v
projectThreadState
    |
    +-- normalized messages
    |
    +-- summarized graph control state
    |
    v
readonly frontend projection
~~~

Graph persistence, reducers, execution positioning and checkpoint creation
remain Runtime responsibilities.

### Not established by 2.3B

The following remain outside this sub-block:

~~~text
state-update REST client
mutation authorization
stale-write detection
compare-and-swap semantics
optimistic update policy
concurrent update handling
~~~

## 2.3C — Explicit state-update client

### Objective and boundary

Add a typed explicit REST write operation for a graph-bound Thread, separate
from persisted state reads and separate from Run execution or SSE. Do not add
state-editing controls to React, modify useExecution or install dependencies.

### Transport contract

The public AgentServerClient API now includes:

~~~ts
interface UpdateThreadStateInput {
  readonly values?: StateValues | null
  readonly checkpoint?: CheckpointRef
  readonly asNode?: string
}

interface UpdateThreadStateResult {
  readonly checkpoint: CheckpointRef
}

updateThreadState(threadId, input): Promise<UpdateThreadStateResult>
~~~

The method posts to:

~~~text
POST /threads/{encodeURIComponent(threadId)}/state
~~~

The wire payload carries values, checkpoint and as_node (mapped from asNode).
CheckpointRef is serialized to thread_id, checkpoint_id, checkpoint_ns and
checkpoint_map. Undefined optional fields are omitted by JSON.stringify;
explicit null values remain present.

The method reuses the AgentServerClient request pipeline, including injectable
fetchImpl, credential policy, JSON headers and AgentServerHttpError. A supplied
checkpoint referring to another target Thread is rejected before HTTP. This
is a consistency check, not an authorization boundary.

### Response decoding and mapping

The response decoder requires a checkpoint object with a non-empty,
non-whitespace checkpoint_id. The mapper reuses the existing CheckpointRef
normalization and rejects an explicitly mismatched checkpoint.thread_id;
when that field is absent, the request Thread is used. Invalid HTTP 200
payloads raise AgentServerDecodeError. Extra fields observed in the pinned
Runtime, including configurable and checkpoint_id, are tolerated without
becoming part of the public typed result.

A successful POST returns only the new checkpoint reference; it neither
creates a Run nor implicitly performs GET ThreadState or marks frontend
projection authority as reconciled. A separate GET ThreadState is required
to inspect the persisted graph values and execution position.

Implementation:

~~~text
apps/web/src/transport/agent-server/dto.ts
apps/web/src/transport/agent-server/decode.ts
apps/web/src/transport/agent-server/mappers.ts
apps/web/src/transport/agent-server/client.ts
apps/web/src/transport/agent-server/index.ts
apps/web/src/transport/agent-server/state-update-client.spec.ts
scripts/lab-23c-state-update.mjs
scripts/lab-23c-state-update.py
~~~

### Deterministic validation (HTTP mock)

From apps/web:

~~~bash
pnpm lint
pnpm build

pnpm exec vite build \
  --ssr src/transport/agent-server/state-update-client.spec.ts \
  --outDir /tmp/masl-23c-state-update \
  --emptyOutDir

printf '%s\n' '{"type":"module"}' \
  > /tmp/masl-23c-state-update/package.json

node /tmp/masl-23c-state-update/state-update-client.spec.js
~~~

Observed results:

~~~text
oxlint: 0 warnings and 0 errors (41 files, 116 rules)
TypeScript + Vite production build: PASS
SSR test bundle: PASS
20 state-update client assertions passed
~~~

The 20 passing assertions covered one POST, encoded Thread URL, method and
credentials, JSON headers, values/as_node, checkpoint wire identity and map,
returned typed checkpoint, absence of false reconciliation, optional field
omission and explicit null, pre-HTTP Thread mismatch, HTTP 400 propagation,
missing/blank checkpoint ID rejection, mismatched response Thread ID,
request-Thread fallback, invalid checkpoint object rejection and no implicit
GET. The fixture also included tolerated extra Runtime response fields.

### Pinned Runtime integration without model execution

From the repository root:

~~~bash
python3 scripts/lab-23c-state-update.py
~~~

The harness compiled the real TypeScript client as an SSR bundle, booted the
pinned Agent Server on an isolated ephemeral loopback port, created a
throwaway Thread associated with graph_id=deep_agent, performed a typed state
update and independently fetched the persisted ThreadState.

Observed PASS lines:

~~~text
isolated pinned Runtime ready
throwaway graph-bound Thread created
typed update returned a checkpoint
separate GET confirmed persisted checkpoint, message and graph position
no Run or model invocation in this experiment
throwaway Thread deleted
isolated Runtime process cleaned up
~~~

The temporary runtime used port 58181 in the recorded run. This port is an
observation, not a fixed requirement for reproduction.

### Architectural conclusion and limits

~~~text
write operation
    -> POST Thread state update
    -> returned CheckpointRef (mutation result)

read operation
    -> GET ThreadState
    -> authoritative persisted state/position
~~~

This block proves a functional typed write boundary with independent readback.
It does NOT prove optimistic concurrency, compare-and-swap, automatic stale
write rejection, multiuser authorization, or specific branch semantics for
checkpoint-selected writes. Those are future investigations in 2.3D/2.3F.

No UI mutation controls, streaming changes or Run creation were introduced.
The existing browser E2E suite was not rerun for this transport-only change;
no new browser-test result is claimed here.

## 2.3D — Checkpoint-aware mutation

### Objective and scope

Determine empirically whether `checkpoint` on `POST /threads/{thread_id}/state`
selects historical state, how that affects checkpoint ancestry and the Thread
HEAD, and what the frontend must do to reconcile a mutation. Do not assume CAS
or implement multiwriter protection in this stage.

### Reproducible pinned Runtime experiment

Run from the repository root:

~~~bash
python3 scripts/lab-23d-checkpoint-aware.py
~~~

The Python harness compiles the actual frontend AgentServerClient with Vite,
starts the pinned graph Runtime on an isolated ephemeral port, and runs the
Node experiment. No Run or model is invoked. It deletes the disposable Thread
and terminates the Runtime process in cleanup.

The Node script uses the typed updateThreadState() from 2.3C, explicit
getThreadState() HEAD reads, and direct HTTP historical state queries. It
verifies checkpoint identity on historical reads because the pinned Runtime
can return a synthetic empty HTTP 200 for missing historical selectors.

### Observed checkpoint graph

~~~text
C1: messages = [A]                     parent = none
 |-- C2: messages = [A, B]              parent = C1
 |    `-- C4: messages = [A, B, D]      parent = C2
 `-- C3: messages = [A, C]             parent = C1
~~~

Execution order: C1 -> C2 -> C3 (selected C1) -> C4 (selected C2).
The drawing above is ancestry, not chronological creation order.

C1 and C2 were first created sequentially. After HEAD became C2, a POST
selecting C1 returned a new C3. The separate HEAD read returned C3, not C2.
C3 contained A and C but not B, and identified C1 as its parent.

After HEAD became C3, a POST selecting historical C2 returned a new C4. The
separate HEAD read returned C4. C4 contained A, B and D but not C, and
identified C2 as its parent.

Historical reads after both branch writes continued to return the original C1,
C2 and C3 snapshots. Four distinct checkpoint IDs were observed. No Run was
created, no model was called, and disposable resources were cleaned up.

The saved experiment result was:

~~~text
/tmp/masl-23d-observations-910.json
~~~

That path is an ephemeral local observation artifact; checkpoint IDs and port
numbers must not be hard-coded in clients or test expectations.

### Ten observed semantic checks

~~~text
c1SelectedWriteAcceptedAfterC2: true
c2SelectedWriteAcceptedAfterC1Branch: true
c1SelectedWriteParentIsC1: true
c2SelectedWriteParentIsC2: true
c1SelectedWriteContainsAAndCNotB: true
c2SelectedWriteContainsABAndDNotC: true
headAfterFirstBranchMatchesResult: true
headAfterSecondBranchMatchesResult: true
c1C2AndFirstBranchHistoryPreserved: true
noRunsCreated: true
~~~

### Explicit frontend mutation and readback policy

1. Treat `checkpoint` as a historical branching selector, **not** a version
   precondition. A stale historical selector was accepted sequentially.
2. Preserve the POST's returned CheckpointRef as the mutation result; do not
   treat it as a full ThreadState or mark projection authority `persisted`.
3. Issue a separate GET ThreadState to observe the then-current HEAD and graph
   position; compare its checkpoint identity against the POST result.
4. If those checkpoint IDs differ, report HEAD divergence instead of silently
   discarding the mutation result or presenting the current HEAD as that write's
   verified snapshot. A different writer or branch may have advanced HEAD.
5. Historical readback of a particular checkpoint must verify the returned
   checkpoint ID even on HTTP 200; a synthetic missing-state response is not
   proof that the requested checkpoint exists.
6. An explicit branch selection must be deliberate in the future UI. Avoid
   generic automatic retries that reapply state updates at a historical source.

This is a readback policy and a boundary statement, not a concurrency-control
implementation. The existing 2.3C write method remains POST-only; its caller
must explicitly initiate any reconciliation read.

### Boundaries and limitations

- Only sequential selected writes were tested; no simultaneous writers or race
  windows were exercised.
- A successful branch operation is not evidence of compare-and-swap, optimistic
  locking, or stale-write rejection.
- The local Thread identity consistency check is not multiuser authorization.
- No mutation controls, React changes, streaming changes, SDK updates or new
  dependencies are introduced by this discovery.
- Proper concurrency/stale-state policy is reserved for 2.3F; 2.3E can build a
  deliberately limited shared-state UI that does not claim those guarantees.

### Architectural conclusion

The pinned implementation behaved as a checkpoint DAG with branch-selected
writes that advanced the visible HEAD. Historical state did not disappear.
Checkpoint lineage, mutation result, current HEAD and persisted readback are
separate concepts. The frontend must preserve those distinctions.

## 2.3E — Shared-state UI

### Objective and architecture

Expose persisted shared state and deliberate graph-state editing in the existing
Phase 2 frontend without collapsing a Thread into Run lifecycle or streaming
messages. Build on the 2.3B allowlisted read projection, the 2.3C typed POST
client and the historical branching behavior demonstrated in 2.3D.

The SharedStatePanel is mounted from the existing ExecutionSurface and works
with its selected Thread, without modifying the Run/SSE execution protocol. It
renders a bounded persisted-state inspection view instead of exposing arbitrary
Runtime channels, tasks, metadata or checkpoint internals. The new action is
intentionally restricted to adding a human message to the graph messages
channel and requires deliberate source selection and acknowledgement.

Source choices include the server's then-current HEAD (no historical selector)
and explicit previously observed checkpoint or parent checkpoint. Selection of
an old checkpoint may create a new branch and move HEAD. None of these choices
is an expected-HEAD CAS precondition. A button state or local acknowledgement
is not an authorization boundary.

### Mutation, readback and failure semantics

~~~text
UI action (explicit acknowledgement)
    -> POST /threads/{id}/state via typed AgentServerClient
    -> mutation result = CheckpointRef (not persisted ThreadState)
    -> independent GET /threads/{id}/state
    -> compare result checkpoint against observed HEAD checkpoint
    -> matching / diverged / unreconciled projection
~~~

`state-update-readback.ts` provides a pure comparison helper. A matching
checkpoint confirms only that the independent GET observed that checkpoint as
HEAD at read time. A different HEAD does not undo or necessarily invalidate the
POST. Missing or cross-Thread readbacks cannot be reported as confirmed.

A GET failure after a successful POST is explicitly unreconciled. The panel
must not falsely claim success, silently resubmit the update or permit another
write until an explicit reload. The in-flight guard remains in the event path;
React render reads component state instead of `ref.current`, satisfying the
React lint rule. The Thread selector received `aria-label="Thread"` to
provide a stable and testable accessible control name.

### Files changed

~~~text
apps/web/src/components/SharedStatePanel.tsx
apps/web/src/components/ExecutionSurface.tsx
apps/web/src/App.css
apps/web/src/execution/state-update-readback.ts
apps/web/src/execution/state-update-readback.spec.ts
apps/web/e2e/shared-state-ui.spec.ts
~~~

### Deterministic gates (observed)

From `apps/web`:

~~~bash
pnpm lint
pnpm build

pnpm exec vite build \
  --ssr src/execution/state-update-readback.spec.ts \
  --outDir /tmp/masl-23e-readback --emptyOutDir
printf '%s\n' '{"type":"module"}' \
  > /tmp/masl-23e-readback/package.json
node /tmp/masl-23e-readback/state-update-readback.spec.js
~~~

Recorded result:

~~~text
oxlint: 0 warnings, 0 errors (45 files, 116 rules)
TypeScript / Vite: PASS (43 production modules)
6 state-update readback assertions passed
~~~

The pure tests cover matching POST/readback checkpoint, observed HEAD identity,
divergent HEAD without false confirmation, independence of POST identity,
missing checkpoint and rejection of cross-Thread readback.

### Browser E2E against the pinned Runtime (observed)

~~~bash
cd apps/web
CI=1 pnpm exec playwright test \
  e2e/shared-state-ui.spec.ts \
  --project=chromium --reporter=list
~~~

Recorded result:

~~~text
2 passed (6.9s)
  - explicit parent-checkpoint edit branches, then independently reconciles
  - failed GET after state POST is visibly unreconciled and requires reload
~~~

The pinned Agent Server ran at `127.0.0.1:2024` with LangGraph API 0.8.1.
No dependency upgrade was performed; the upstream EOL warning is not a failure
of these scoped tests. The earlier E2E run failed because the test's exact
accessible Thread locator did not match the control. The stable `aria-label`
fix allowed the two scenarios to pass. An earlier lint iteration generated 11
React refs warnings, subsequently resolved to zero warnings. The existing
2.2 browser regression suite was not rerun for this sub-block.

### Architectural boundary and remaining risks

- A successful POST is not authoritative state; GET is a separate observation.
- A matching GET proves only the HEAD observed at read time, not atomicity.
- Historical selection is branching, not CAS or automatic stale-write rejection.
- No Run/model invocation is required for these focused tests.
- No multiuser authorization, distributed locks, idempotency keys or concurrent
  race mitigation is implemented by this UI baseline.
- Race windows (pre-POST, in-flight and POST-to-GET) remain for 2.3F.

The 2.3E UI baseline is complete against its scoped gates. The broader shared
state milestone remains open for 2.3F and the 2.3G review.

## 2.3F — Concurrency and stale-state protection

### Scope and non-goals

Determine actual multiwriter and ambiguous-write behavior of the pinned
Runtime, then implement an honest frontend best-effort safeguard. This lab does
not introduce atomic compare-and-swap, server-side expected-version headers,
locks, idempotency keys, or multiuser authorization.

### 2.3F-A — Controlled concurrent-writer experiment

Reproduce from the repository root:

~~~bash
python3 scripts/lab-23f-concurrency.py
~~~

The Python harness compiles the real frontend TypeScript client with Vite,
starts the pinned graph Runtime on an isolated loopback port, executes four
scenarios through the compiled client and shuts down the server. All test
Threads are disposable. No Run or model invocation occurs.

Observed results from the pinned runtime:

~~~json
{
  "concurrentOutcomes": [
    { "writer": "concurrent-A", "status": "fulfilled" },
    { "writer": "concurrent-B", "status": "fulfilled" }
  ],
  "staleWriteAccepted": true,
  "postCommittedButHeadDifferent": true,
  "persistedAfterLostResponse": true,
  "noRunPosts": true
}
~~~

1. Simultaneously dispatched selected-checkpoint updates from two clients:
   both returned fulfilled; final HEAD belonged to a successful write.
2. A stale selected checkpoint was accepted after another client moved HEAD.
3. POST A committed, then writer B advanced HEAD before A's independent GET;
   the resulting observed HEAD differed from A's returned checkpoint.
4. A simulated client network failure concealed a persisted POST. The harness
   deliberately performed no automatic retry.

This proves a lack of verified CAS behavior in the tested interaction and the
risk of accepting stale write sources; it does not determine server-internal
transaction scheduling or establish behavior under all races. The experiment
wrote `/tmp/masl-23f-observations-20056.json` (ephemeral) and successfully
cleaned up the pinned Runtime and all disposable Threads. The observed
upstream EOL warning is not an experiment failure.

### 2.3F-B — UI preflight and readback interlocks

The existing `SharedStatePanel` gained a pre-POST GET and a pure comparator:

~~~text
persisted UI observation
    -> explicit acknowledgement and submit
    -> GET current HEAD
    -> compare complete CheckpointRef identity
       - different/unknown/error: block POST and request reload
       - matching: allow POST (best-effort only)
    -> POST state update
    -> independent GET ThreadState
       - matching POST checkpoint: observed readback
       - different HEAD: diverged; block next write until reload
       - GET error / POST ambiguity: unreconciled; no automatic retry
    -> manual reload resets selector and acknowledgement
~~~

`classifyHeadPreflight()` checks Thread identity, checkpoint ID, namespace and
checkpointMap. The `head` source mode (no checkpoint selector) still performs
preflight: omitting the selector is not a stale-observation escape hatch. The
panel tracks separate stages for checking, posting, reading, stale, diverged,
unreconciled and failed outcomes. It uses the existing typed client and does
not modify Run streaming or the pinned reference.

Changed and added files:

~~~text
apps/web/src/components/SharedStatePanel.tsx
apps/web/e2e/shared-state-ui.spec.ts
apps/web/src/execution/state-mutation-preflight.ts
apps/web/src/execution/state-mutation-preflight.spec.ts
scripts/lab-23f-concurrency.py
scripts/lab-23f-concurrency.mjs
~~~

### Reproducible gates and observed results

From `apps/web`:

~~~bash
pnpm lint
pnpm build
pnpm exec vite build \
  --ssr src/execution/state-mutation-preflight.spec.ts \
  --outDir /tmp/masl-23f-preflight --emptyOutDir
printf '%s\n' '{"type":"module"}' > /tmp/masl-23f-preflight/package.json
node /tmp/masl-23f-preflight/state-mutation-preflight.spec.js
CI=1 pnpm exec playwright test \
  e2e/shared-state-ui.spec.ts --project=chromium --reporter=list
~~~

Observed on WSL with the pinned Runtime:

~~~text
oxlint: 0 warnings, 0 errors (47 files, 116 rules)
TypeScript + Vite build: PASS (44 modules)
11 head-preflight pure assertions passed
4 Chromium E2E scenarios passed (9.7 s)
~~~

The 11 pure checks cover matching/empty checkpoint, current/displayed identity,
HEAD drift, initially absent/present transitions, cross-Thread mismatch,
namespace drift and checkpointMap drift. The four browser tests cover the
previous 2.3E branch/reconciliation and GET failure cases as well as the new
stale-before-POST and divergent-after-POST cases. Two new E2E assertions were
initially incorrect: `.toBeVisible()` inspected an empty idle status div, which
Playwright rightly reported as hidden. They were replaced with
`.toHaveAttribute('data-mutation-stage', 'idle')`; both new tests then passed.

### Concurrency guarantee boundary

**Best-effort only**: a check immediately before POST is subject to TOCTOU.
A second writer can change HEAD after GET and before POST. A successful
subsequent GET records only a momentary HEAD snapshot, not a CAS transaction.
The frontend cannot enforce cross-client isolation, atomicity, authorization,
exactly-once execution or reliable rollback using this existing endpoint.
A lost response is ambiguous and must not trigger automatic POST retry.
A new trusted server-side write contract is required for stronger guarantees.

The 2.3F scope is complete against its stated gates. The 2.3G baseline review,
including consideration of broader regression coverage, remains pending.
