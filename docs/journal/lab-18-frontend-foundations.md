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
