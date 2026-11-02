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

---

# 2.1C — Agent Server REST client baseline

## Objective

Introduce the first browser-to-Runtime transport boundary while preserving the
transport-independent frontend domain established in section 2.1B.

The target architecture is:

~~~text
Agent Server REST
      |
      v
unknown JSON
      |
      v
tolerant decoder
      |
      v
wire DTO
      |
      v
mapper
      |
      v
frontend domain
~~~

The pinned Runtime remains the source of truth.

The modern LangGraph JavaScript SDK is intentionally not used in this baseline.

---

## OpenAPI inspection

The pinned Agent Server exposed:

~~~text
OpenAPI 3.1.0
47 paths
49 component schemas
~~~

The repository now contains:

~~~text
scripts/inspect-agent-server-openapi.py
~~~

which inspects the relevant Assistant, Thread, Run and state REST operations and
walks their transitively referenced OpenAPI schemas.

The inspector found 42 relevant non-stream operations before the frontend
surface was intentionally reduced to a smaller baseline.

---

## Minimal REST surface

Section 2.1C does not attempt to wrap the entire Agent Server API.

The initial client supports:

~~~text
Assistant
    searchAssistants
    getAssistant

Thread
    createThread
    searchThreads
    getThread
    deleteThread

Run
    createRun
    listRuns
    getRun

State
    getThreadState
~~~

Streaming, join, wait, history, state mutation, cancellation, rollback, cron and
protocol-specific functionality remain outside this baseline.

They belong to later Phase 2 experiments.

---

## Live contract inspection

The OpenAPI contract was compared with payloads returned by the running pinned
Agent Server.

The live probe used no model execution.

It:

~~~text
searched Assistants
searched Threads
inspected an existing Run
created an empty temporary Thread
retrieved the Thread
retrieved its ThreadState
deleted the temporary Thread
tested a missing-Thread 404
~~~

The temporary Thread was deleted successfully.

---

## OpenAPI drift

The live Runtime exposed meaningful differences from its OpenAPI schema.

### ThreadState nullability

OpenAPI describes several ThreadState properties as required:

~~~text
checkpoint
metadata
created_at
~~~

and gives them non-null object/string representations.

A valid empty Thread returned:

~~~text
checkpoint = null
metadata = null
created_at = null
~~~

The transport layer therefore models these observed values as nullable.

---

## Undocumented ThreadState fields

The live empty ThreadState also returned:

~~~text
checkpoint_id
parent_checkpoint_id
~~~

These fields are not represented in the pinned ThreadState OpenAPI schema.

The wire DTO tolerates and records them explicitly as observed Runtime fields.

They are not promoted directly into the frontend domain unless they can form a
valid CheckpointRef.

---

## Thread drift

A live Thread search result included:

~~~text
error = null
~~~

although `error` is absent from the pinned OpenAPI Thread schema.

The transport DTO therefore tolerates:

~~~text
ThreadDto.error?: unknown
~~~

without promoting the field into the stable Thread domain model.

---

## Run error semantics

The pinned Run OpenAPI schema and observed Run payload contain no top-level:

~~~text
error
~~~

field.

The frontend domain can still represent:

~~~text
Run.error
~~~

as a semantic capability, but the pinned transport cannot currently populate
it.

The mapper therefore sets:

~~~text
Run.error = null
~~~

rather than pretending that the value came from the server.

---

## ThreadState identity

The wire ThreadState contains no required Thread ID.

The request itself provides that identity:

~~~text
GET /threads/{thread_id}/state
~~~

The mapper therefore combines:

~~~text
request ThreadId
    +
ThreadStateDto
    ↓
ThreadState
~~~

to produce:

~~~text
ThreadState.threadId
~~~

This is an explicit example of why wire DTO and frontend domain are not the
same abstraction.

---

## State values

The pinned OpenAPI allows ThreadState values to be either:

~~~text
object

or

array of objects
~~~

The frontend domain was refined accordingly:

~~~text
StateRecord

StateValues =
    StateRecord
    |
    readonly StateRecord[]
~~~

This change reflects the actual server contract rather than a UI-specific
assumption.

---

## Checkpoint normalization

CheckpointConfig has no required fields in the wire schema.

A frontend CheckpointRef, however, represents an identifiable checkpoint.

The mapper therefore creates a domain CheckpointRef only when:

~~~text
checkpoint_id
~~~

is present.

If no checkpoint ID exists:

~~~text
CheckpointRef = null
~~~

The request ThreadId is used as a fallback when a valid checkpoint lacks an
explicit wire `thread_id`.

---

## Tolerant decoding

The client does not cast raw JSON directly to TypeScript interfaces.

Responses enter the system as:

~~~text
unknown
~~~

and are decoded explicitly.

The decoders validate the fields required by the frontend while tolerating
known Runtime/OpenAPI drift.

This is deliberately different from blind generated-schema validation.

For the pinned stack:

~~~text
strict OpenAPI-derived validation
    could reject valid Runtime payloads

tolerant observed-contract decoding
    accepts validated Runtime behavior
~~~

No runtime-validation dependency such as Zod was required for this baseline.

---

## Error model

Non-success HTTP responses are converted into:

~~~text
AgentServerHttpError
~~~

which preserves:

~~~text
HTTP status
method
request path
human-readable detail
raw response body
~~~

A live missing Thread request returned HTTP 404 and was successfully converted
to AgentServerHttpError with the Runtime-provided detail message.

Malformed successful payloads use a separate:

~~~text
AgentServerDecodeError
~~~

so transport failures and contract failures remain distinct.

---

## Pagination

Search responses use the payload body for items and the Agent Server header:

~~~text
x-pagination-total
~~~

for total-count information.

The frontend represents this as:

~~~text
SearchPage<T>
    items
    total
~~~

The absence or invalidity of the header produces:

~~~text
total = null
~~~

rather than inventing a total from page length.

---

## CORS

The pinned Agent Server accepted development-browser origins for both:

~~~text
http://localhost:5173

http://127.0.0.1:5173
~~~

The preflight response allowed the required methods and content-type header.

The actual response also exposed pagination and content-location headers.

Therefore the 2.1C baseline does not require a Vite reverse proxy.

The Agent Server base URL remains configuration supplied to the client rather
than being embedded in the domain layer.

---

## Dependency direction

The source tree now follows:

~~~text
transport
    |
    v
domain
~~~

The domain contains no dependency on:

~~~text
fetch
Request
Response
Agent Server
LangGraph SDK
AG-UI
A2A
MCP
~~~

The transport layer is allowed to depend on the domain because its purpose is
to normalize wire representations into frontend concepts.

The reverse dependency is forbidden.

---

## TypeScript 7 harness observation

An initial temporary CommonJS validation harness used:

~~~text
moduleResolution = Node
~~~

TypeScript 7 resolves this to the removed legacy Node10 mode and reported
TS5108.

Because the temporary compiler invocation still emitted JavaScript, the
subsequent live execution succeeded despite the compiler error.

That result was not accepted as the final gate.

The harness was replaced by a temporary Vite SSR build using the same frontend
toolchain as the application.

The corrected harness enforces:

~~~text
build failure
    -> no execution
~~~

and removes its temporary source after validation.

---

## Live client validation

The corrected client validation exercises the actual transport implementation
against the pinned Runtime.

Validated behavior includes:

~~~text
searchAssistants
getAssistant

searchThreads

listRuns
getRun

createThread
getThread
deleteThread

getThreadState

404 -> AgentServerHttpError
~~~

For an empty Thread, the mapped domain state correctly produced:

~~~text
position.next = []

checkpoint = null

parentCheckpoint = null

interrupts = []

tasks = []

createdAt = null
~~~

and its domain ThreadId was supplied from request context.

---

## Schema-drift gate

An explicit structural gate verifies that:

~~~text
ThreadState checkpoint is nullable
ThreadState metadata is nullable
ThreadState created_at is nullable

checkpoint_id is tolerated
parent_checkpoint_id is tolerated

Thread error is tolerated

Run error is not invented in RunDto

ThreadState ThreadId comes from request context

nullable metadata is normalized

null created_at is accepted
~~~

This prevents future cleanup work from accidentally making the client stricter
than the observed pinned Runtime.

---

## 2.1C conclusion

The frontend now has its first validated Runtime transport boundary.

The complete flow is:

~~~text
Agent Server REST
        |
        v
unknown JSON
        |
        v
explicit tolerant decoder
        |
        v
wire DTO
        |
        v
mapper
        |
        v
transport-independent domain
~~~

The baseline has been validated against the running pinned Agent Server without
requiring the modern LangGraph JavaScript SDK.

The next section is:

~~~text
2.1D — Application shell
~~~

where these domain and transport primitives can finally be composed into a
React-facing application architecture.

---

# 2.1D — Application shell

## Objective

Compose the transport-independent domain and validated Agent Server REST client
into the first React-facing application boundary.

The purpose of this section is not yet to build a chat interface.

It establishes:

~~~text
application configuration
AgentServerClient ownership
Runtime context
remote-resource projection
loading and error states
navigation shell
live Runtime overview
~~~

The resulting application must expose Runtime concepts directly rather than
collapsing execution into generic chat state.

---

## Composition root

The frontend composition root now follows:

~~~text
VITE_AGENT_SERVER_URL
        |
        v
    AppConfig
        |
        v
 RuntimeProvider
        |
        v
 AgentServerClient
        |
        v
 React application
~~~

The application layer owns transport construction.

The domain layer remains independent from:

~~~text
import.meta.env
fetch
Request
Response
AgentServerClient
React context
~~~

---

## Application configuration

The Agent Server location is supplied through:

~~~text
VITE_AGENT_SERVER_URL
~~~

The repository provides:

~~~text
apps/web/.env.example
~~~

with the development baseline:

~~~text
VITE_AGENT_SERVER_URL=http://127.0.0.1:2024
~~~

Local configuration uses:

~~~text
.env.local
~~~

which remains ignored by Git.

The configuration parser validates:

~~~text
URL exists
URL is syntactically valid
protocol is http or https
trailing slash normalization
~~~

Missing or unsupported configuration produces a distinct AppConfigError before
the Runtime client is created.

---

## Runtime client ownership

RuntimeProvider owns one AgentServerClient instance for the current Agent Server
URL.

The client is recreated only when:

~~~text
config.agentServerUrl
~~~

changes.

The dependency direction is:

~~~text
React application
        |
        v
AgentServerClient
        |
        v
transport
        |
        v
domain
~~~

The domain does not import the application or transport layers.

---

## Runtime context split

The Runtime React boundary is separated into:

~~~text
runtime-context.ts
runtime-provider.tsx
use-runtime.ts
~~~

This split keeps:

~~~text
Context declaration
Provider component
consumer hook
~~~

as separate responsibilities.

It also satisfies the React Fast Refresh constraint that component modules
should not unnecessarily mix component and non-component exports.

---

## Runtime overview projection

The shell introduces:

~~~text
useRuntimeOverview
~~~

which reads the Runtime through AgentServerClient and projects:

~~~text
Assistants
Threads
Assistant total
Thread total
loading status
transport errors
refresh action
~~~

The Agent Server remains the source of truth.

The hook does not create a separate persistent client-side database for Runtime
resources.

---

## I/O and state transitions

The initial hook implementation caused the React lint rule:

~~~text
react(set-state-in-effect)
~~~

because the effect invoked a function that synchronously initiated a React state
transition.

The implementation was refined to separate:

~~~text
fetchOverview
    -> external I/O only

commitReady
    -> React state transition

commitError
    -> React state transition

refresh
    -> explicit user-triggered reload
~~~

The final application passes the React lint rules with zero warnings.

---

## Browser fetch receiver bug

The first real-browser execution exposed a bug that did not appear in the Node
or Vite SSR validation harness.

The AgentServerClient stored the native fetch function and invoked it as a class
member.

Conceptually:

~~~text
this.#fetch = global fetch

this.#fetch(...)
~~~

In Chrome this changed the receiver of the native Window fetch function and
produced:

~~~text
Failed to execute 'fetch' on 'Window':
Illegal invocation
~~~

The default fetch implementation was therefore changed to:

~~~text
globalThis.fetch.bind(globalThis)
~~~

while preserving injected fetch implementations for tests.

This is an important browser-specific validation result.

---

## Runtime availability diagnosis

After the fetch receiver fix, the browser reported:

~~~text
Failed to fetch
~~~

This initially suggested a possible browser-to-WSL networking boundary.

A direct Runtime probe showed instead:

~~~text
curl 127.0.0.1:2024
    -> connection failed

listener :2024
    -> absent
~~~

The Agent Server was simply no longer running.

After restarting the pinned Runtime:

~~~text
langgraph-api          0.8.1
langgraph-runtime-inmem 0.28.0

http://127.0.0.1:2024
~~~

the browser connected successfully.

Therefore:

~~~text
Windows browser
        |
        v
127.0.0.1:2024
        |
        v
Agent Server in WSL
~~~

works in the current development environment.

No Vite reverse proxy is required by the 2.1D baseline.

---

## Live browser validation

The real browser successfully displayed:

~~~text
Connection
    Connected

Assistants
    1

Threads
    21

Loaded
    20

Transport
    REST
~~~

The current Assistant was displayed as:

~~~text
deep_agent
~~~

and the Thread list showed real Runtime thread identities and lifecycle states.

The Agent Server logs simultaneously recorded successful requests such as:

~~~text
POST /assistants/search -> 200
POST /threads/search    -> 200
~~~

This validates the full browser path:

~~~text
React
  |
  v
RuntimeProvider
  |
  v
AgentServerClient
  |
  v
browser fetch
  |
  v
CORS
  |
  v
Agent Server
  |
  v
Runtime resources
~~~

---

## Pagination semantics in the UI

The live browser exposed an important distinction:

~~~text
Threads = 21
Loaded  = 20
~~~

The first value originates from the Agent Server pagination total.

The second represents the current page loaded by the shell.

The UI therefore does not confuse:

~~~text
total Runtime resource count
        !=
current client projection size
~~~

This validates the SearchPage<T> boundary introduced in section 2.1C.

---

## Failure states

The shell distinguishes two failure classes.

### Configuration failure

Occurs before Runtime client creation, for example:

~~~text
missing VITE_AGENT_SERVER_URL
invalid URL
unsupported protocol
~~~

This is surfaced as an application configuration screen.

### Runtime transport failure

Occurs after valid application configuration when the Runtime cannot be reached.

This is surfaced inside the shell as:

~~~text
Unavailable
Runtime request failed
~~~

The shell therefore preserves:

~~~text
application configuration failure
        !=
Runtime transport failure
~~~

---

## Development StrictMode observation

React StrictMode is enabled for the development application.

Development logs showed repeated Assistant and Thread search requests during
some mount and refresh cycles.

This is consistent with development-time StrictMode behavior designed to expose
unsafe side effects.

The search operations used by the shell are idempotent projections.

No production architecture change is made solely to suppress development
StrictMode diagnostics.

Future execution operations must not assume that the same tolerance is safe for
non-idempotent side effects.

---

## Application shell structure

The shell currently exposes:

~~~text
Overview
Assistants
Threads
Runs       -> reserved for 2.1E
Streaming  -> reserved for 2.2
~~~

The current screen is a Runtime overview rather than a chat interface.

This is deliberate.

The user can already see that the application is connected to a resource-based
execution Runtime composed of:

~~~text
Assistants
Threads
Runs
State
~~~

before message execution is introduced.

---

## Styling baseline

The original Vite demonstration assets were removed.

The shell now provides:

~~~text
responsive sidebar
Runtime connection indicator
resource summary cards
Assistant projection
Thread projection
loading state
transport error state
configuration error state
responsive layout
~~~

No external component library or styling dependency was introduced.

---

## Validation

The final application shell passed:

~~~text
pnpm lint
    -> 0 warnings
    -> 0 errors

pnpm build
    -> TypeScript PASS
    -> Vite production build PASS
~~~

The application configuration harness also validated:

~~~text
valid Runtime URL
missing configuration
unsupported protocol
~~~

The real browser completed the live Runtime connection successfully.

---

## Architectural model

The frontend architecture now becomes:

~~~text
                        Browser
                           |
                           v
                    React AppShell
                           |
                 +---------+---------+
                 |                   |
                 v                   v
             AppConfig       Runtime overview
                 |                   |
                 v                   |
          RuntimeProvider            |
                 |                   |
                 +---------+---------+
                           |
                           v
                  AgentServerClient
                           |
                           v
                tolerant transport
                           |
                           v
                     frontend domain
                           |
                           v
                    Runtime concepts
~~~

The shell owns application composition.

The Agent Server remains the resource source of truth.

---

## 2.1D conclusion

The frontend is now a functioning Runtime-aware React application.

It can:

~~~text
load validated configuration
construct the Runtime client
connect directly to the pinned Agent Server
search Assistants
search Threads
represent pagination totals
surface loading state
surface Runtime transport failures
refresh remote projections
render real Runtime resources
~~~

without introducing:

~~~text
global state library
chat abstraction
streaming abstraction
AG-UI
LangGraph JavaScript SDK
~~~

The next section is:

~~~text
2.1E — First execution surface
~~~

That section can now introduce Run creation and execution while preserving the
resource model established by the previous frontend foundations.
