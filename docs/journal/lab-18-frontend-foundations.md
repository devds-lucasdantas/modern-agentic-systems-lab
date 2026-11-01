# Lab 18 — Frontend Foundations

## Objective

Start Phase 2 — Agent ↔ UI by establishing a reproducible frontend application
baseline before introducing Agent Server clients, streaming SDKs or UI
protocols.

The central architectural constraint inherited from Phase 1 is:

~~~text
frontend
    must represent Runtime concepts

rather than

Runtime
    being collapsed into a generic chat state model
~~~

---

# 2.1A — Frontend stack and scaffold

## Starting state

Phase 2 began with no frontend implementation in either:

~~~text
modern-agentic-systems-lab/
.reference/interrupt26-deepagents/
~~~

The main repository contained no JavaScript package manifest, Vite application,
Angular application, Next.js application or TypeScript frontend source.

The pinned Interrupt 2026 reference also contained no frontend application.

The frontend is therefore greenfield rather than an adaptation of the workshop.

---

## Baseline architecture

The initial repository shape is:

~~~text
modern-agentic-systems-lab/
    apps/
        web/
~~~

The frontend stack is:

~~~text
React
TypeScript
Vite
pnpm
~~~

No LangGraph JavaScript SDK, AG-UI package, state library or component framework
is part of the initial baseline.

This is deliberate.

Phase 1 established that the pinned Agent Server and newer interaction protocols
belong to different generations of the LangGraph stack.

The frontend must therefore first model and consume the validated Runtime
boundary explicitly before protocol-specific abstractions are introduced.

---

## Environment

The scaffold was created and validated with:

~~~text
Node.js     24.15.0
pnpm        10.6.2
~~~

The frontend records these values through:

~~~text
apps/web/.node-version
apps/web/package.json -> packageManager
~~~

The package-manager pin documents the tested baseline without changing the
developer's globally installed pnpm.

---

## Scaffold command

The application was generated with:

~~~text
pnpm create vite@latest apps/web --template react-ts --no-interactive
~~~

The generator reported:

~~~text
create-vite 9.3.3
~~~

---

## Resolved dependencies

The initial production dependencies are:

~~~text
react      19.3.1
react-dom  19.3.1
~~~

The initial development toolchain resolved to:

~~~text
@types/node          24.19.2
@types/react         19.3.0
@types/react-dom     19.3.0
@vitejs/plugin-react 6.1.2
oxlint               1.90.0
typescript           7.0.2
vite                 8.3.5
~~~

The exact dependency graph is captured by:

~~~text
apps/web/pnpm-lock.yaml
~~~

---

## TypeScript baseline

The generated application configuration uses bundler-oriented TypeScript
settings.

Important properties include:

~~~text
target
    es2023

module
    esnext

moduleResolution
    bundler

jsx
    react-jsx

verbatimModuleSyntax
    true

noUnusedLocals
    true

noUnusedParameters
    true

erasableSyntaxOnly
    true

noFallthroughCasesInSwitch
    true
~~~

This provides an appropriately strict baseline for the Runtime domain model that
will be introduced in section 2.1B.

---

## Vite baseline

The generated Vite configuration is intentionally minimal:

~~~text
defineConfig
    -> React plugin
~~~

There is no:

~~~text
Agent Server proxy
SDK configuration
authentication layer
environment-specific API configuration
state-management library
protocol adapter
~~~

yet.

Those boundaries will be introduced incrementally.

---

## Baseline validation

The initial application passed:

~~~text
pnpm lint
    -> 0 warnings
    -> 0 errors

pnpm build
    -> PASS
~~~

The production build generated the normal static Vite output under:

~~~text
apps/web/dist/
~~~

Generated build output and installed dependencies are not repository artifacts.

---

## Toolchain observation

During scaffold creation and dependency installation, Node emitted:

~~~text
DEP0169
url.parse() is deprecated
~~~

The warning originated from the package-management/scaffolding execution path.

It did not appear as an application lint or production-build failure.

It is therefore recorded as a toolchain observation rather than a frontend
application defect.

pnpm also reported a newer major version as available.

The laboratory intentionally retains the tested:

~~~text
pnpm 10.6.2
~~~

baseline for this checkpoint instead of mixing a package-manager migration with
frontend creation.

---

## Architectural boundary

The frontend baseline deliberately has no direct dependency on:

~~~text
@langchain/langgraph-sdk
AG-UI
MCP
A2A
~~~

The Phase 1 execution model remains the source of truth.

The client will first represent concepts such as:

~~~text
Assistant
Thread
Run
ThreadState
Checkpoint
Interrupt
Message
~~~

as separate domain concepts.

Only after that baseline exists will the laboratory evaluate higher-level
streaming and UI protocol abstractions.

---

## 2.1A conclusion

The frontend scaffold is reproducible and operational.

Validated baseline:

~~~text
React 19.3.1
TypeScript 7.0.2
Vite 8.3.5
Node 24.15.0
pnpm 10.6.2
~~~

Both lint and production build pass.

No protocol-specific SDK has been introduced.

The next question is no longer:

~~~text
Can the repository host a modern frontend?
~~~

It is:

~~~text
What Runtime concepts must the browser represent before any chat or streaming
UX is implemented?
~~~

That is section 2.1B — Runtime domain model.

---

# 2.1B — Runtime domain model

## Objective

Define a transport-independent browser-side representation of the Runtime
concepts established during Phase 1.

The frontend domain must preserve distinctions such as:

~~~text
Graph != Assistant

Thread != Run

Run lifecycle
    != graph execution position

graph/HITL interrupt
    != lifecycle cancellation

checkpoint identity
    != logical step number
~~~

The goal is not to reproduce Agent Server wire schemas.

The layering target is:

~~~text
transport DTO
      |
      v
normalization
      |
      v
frontend domain model
~~~

Section 2.1B implements only the domain-model layer.

---

## Domain structure

The initial domain package is:

~~~text
apps/web/src/domain/
    assistant.ts
    checkpoint.ts
    common.ts
    ids.ts
    index.ts
    interrupt.ts
    message.ts
    run.ts
    state.ts
    thread.ts
~~~

The package has no direct dependency on React, Agent Server transport schemas,
the LangGraph JavaScript SDK or an interoperability protocol.

---

## Nominal identity

TypeScript strings are structurally interchangeable by default.

Runtime identities are not.

The frontend therefore introduces branded identifiers:

~~~text
GraphId
AssistantId
ThreadId
RunId
CheckpointId
InterruptId
MessageId
~~~

At runtime these values remain strings.

At compile time they are nominally distinct.

For example:

~~~text
ThreadId
    cannot be assigned to
RunId
~~~

This directly encodes Phase 1 identity boundaries.

---

## Identity validation

A temporary compile-time test attempted:

~~~text
ThreadId -> RunId
~~~

under `@ts-expect-error`.

The TypeScript build passed, proving that the assignment is rejected by the
type system.

The temporary validation file was then deleted and a second TypeScript build
also passed.

The validation artifact is therefore not part of production source.

---

## Assistant

The frontend Assistant domain object contains:

~~~text
id
graphId
name
metadata
createdAt
updatedAt
~~~

Graph identity and Assistant identity remain separate.

The domain does not model an Assistant as the Graph itself.

---

## Thread

The frontend Thread model contains lifecycle identity and metadata:

~~~text
Thread
    id
    status
    metadata
    createdAt
    updatedAt
~~~

Observed Thread statuses represented by the baseline are:

~~~text
idle
busy
interrupted
error
~~~

No field such as:

~~~text
locked
available
canRun
~~~

is derived from Thread status.

Phase 1 established that:

~~~text
Thread.status = idle
~~~

does not prove that no pending Run exists.

---

## Run

The frontend Run model represents one execution attempt.

Observed lifecycle states are:

~~~text
pending
running
error
success
timeout
interrupted
~~~

The Run contains:

~~~text
id
assistantId
threadId
status
metadata
error
createdAt
updatedAt
~~~

The domain deliberately does not expose a synthetic:

~~~text
completed: boolean
~~~

because Phase 1 established:

~~~text
Run.status = success
    !=
graph reached END
~~~

Graph execution position belongs to ThreadState instead.

---

## Checkpoint

Checkpoint identity is modeled through:

~~~text
CheckpointId
CheckpointRef
CheckpointSummary
~~~

A CheckpointRef preserves:

~~~text
threadId
checkpointId
namespace
checkpointMap
~~~

A summary can additionally preserve:

~~~text
parent checkpoint
metadata
createdAt
~~~

Logical step number is not used as checkpoint identity.

Phase 1 demonstrated that checkpoint history is a DAG and multiple branches can
contain the same logical step number.

---

## Interrupt taxonomy

The frontend does not define one generic domain object named `Interrupt`.

Three concepts remain distinct.

### Execution breakpoint

~~~text
ExecutionBreakpoint
    kind = execution-breakpoint
    next = graph nodes
~~~

This represents graph execution position.

### Graph interrupt

~~~text
GraphInterrupt
    kind = graph-interrupt
    id
    value
    resumable = true
~~~

This represents resumable graph/HITL state.

### Lifecycle cancellation

~~~text
LifecycleCancellation
    kind = lifecycle-cancellation
    action =
        interrupt
        rollback
~~~

This represents execution-control intent.

Therefore:

~~~text
execution breakpoint
    !=
graph interrupt
    !=
lifecycle cancellation
~~~

The shared word "interrupt" is not allowed to collapse these concepts in the
domain model.

---

## Message model

The initial frontend Message model is deliberately framework-neutral.

Roles are:

~~~text
user
assistant
system
tool
~~~

Content is represented as frontend-owned blocks:

~~~text
text
data
~~~

The domain does not directly expose:

~~~text
HumanMessage
AIMessage
ToolMessage
BaseMessage

A2A Part

AG-UI event
~~~

Those are transport or framework representations that may later be normalized
into the frontend Message domain.

---

## ThreadState

ThreadState represents persisted execution position independently from Run
lifecycle.

It contains:

~~~text
threadId
values
position
checkpoint
parentCheckpoint
metadata
tasks
interrupts
createdAt
~~~

Graph position is explicitly represented as:

~~~text
GraphPosition
    next[]
~~~

The architecture therefore preserves two independent dimensions:

~~~text
Run
    -> lifecycle status

ThreadState
    -> persisted graph position
~~~

This prevents UI code from treating Run success as equivalent to workflow
completion.

---

## Runtime task summaries

ThreadState can expose Runtime task information without equating Runtime tasks
with Runs.

The baseline uses a small transport-independent projection:

~~~text
RuntimeTaskSummary
    id
    name
    error
~~~

No RunId relationship is invented where Phase 1 did not establish one.

---

## Protocol independence

A source scan confirmed that `src/domain` contains no references to:

~~~text
@langchain/langgraph-sdk
AG-UI
A2A
MCP
Last-Event-ID
JSON-RPC
SSE
~~~

The domain therefore remains independent from:

~~~text
Agent Server wire representation
stream transport
modern LangGraph SDK
interoperability protocols
UI protocols
~~~

---

## Validation

The domain baseline passed:

~~~text
pnpm lint
    -> 0 warnings
    -> 0 errors

pnpm build
    -> TypeScript build PASS
    -> Vite production build PASS
~~~

The structural gate also verified:

~~~text
AssistantId exists
ThreadId exists
RunId exists

Run lifecycle modeled
Thread lifecycle modeled

GraphPosition separate

GraphInterrupt explicit
LifecycleCancellation explicit
rollback explicit

CheckpointId explicit
~~~

---

## Architectural model

The frontend core now has the following conceptual structure:

~~~text
                     frontend domain
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
      Assistant          Thread            Run
          |                |                |
          |                |                v
          |                |            lifecycle
          |                |
          |                v
          |           ThreadState
          |                |
          |        +-------+-------+
          |        |               |
          |        v               v
          |   GraphPosition    Checkpoint
          |        |
          |        v
          |  GraphInterrupt
          |
          +---- identity remains distinct from Graph
~~~

Lifecycle cancellation remains an execution-control concept outside persisted
graph interruption.

---

## 2.1B conclusion

The browser now has a transport-independent Runtime domain model.

The important Phase 1 distinctions are encoded in TypeScript rather than being
left as documentation-only conventions.

Validated invariants include:

~~~text
AssistantId != ThreadId != RunId

RunStatus
    !=
GraphPosition

GraphInterrupt
    !=
LifecycleCancellation

CheckpointId
    !=
logical step number

frontend Message
    !=
framework/protocol message representation
~~~

The next boundary is section 2.1C — Agent Server REST client baseline.

That section will introduce:

~~~text
wire DTOs
normalization
Agent Server client
~~~

without changing the domain model to mirror transport schemas.
