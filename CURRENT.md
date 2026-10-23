# Current checkpoint

## Repository

Repository:

~~~text
modern-agentic-systems-lab
~~~

The repository is an incremental, reproducible and versioned laboratory for
modern agentic-system architecture.

The primary external reference for Phase 0 is the Interrupt 2026 Deep Agents
workshop pinned to:

~~~text
3d3287cf1e51250934c11aff182d90ccfaf0e66d
~~~

The reference clone lives under:

~~~text
.reference/interrupt26-deepagents
~~~

and remains outside the learning repository history.

## Current phase

Phase 0 — Deep Agents is functionally complete.

Completed roadmap items:

~~~text
0.1  Repository and environment setup
0.2  Explore the Interrupt 2026 workshop
0.3  Minimal Deep Agent
0.4  Planning and filesystem
0.5  Custom tools
0.6  Backends
0.7  Subagents
0.8  Human-in-the-loop
0.9  Long-term memory
0.10 AGENTS.md
0.11 Skills
0.12 LangGraph Runtime and Studio
~~~

Current item:

~~~text
0.13 Phase review
~~~

The Phase 0 synthesis has already been written.

Remaining work is the final repository consistency review and formal closure of
0.13.

## Current architecture

The current architecture is documented in:

~~~text
docs/architecture.md
~~~

The current architecture version is:

~~~text
Version 0.3 — Phase 0 consolidated architecture
~~~

The detailed evidence and synthesis are documented in:

~~~text
docs/journal/lab-11-phase-0-review.md
~~~

## Phase 0 architecture established

The validated framework relationship is:

~~~text
Application
    |
    v
Deep Agents
    |
    v
LangChain agent abstractions
    |
    v
LangGraph execution substrate
~~~

`create_deep_agent()` produces a compiled LangGraph.

The Phase 0 experiments established the following execution model:

~~~text
Assistant
    |
    v
Thread
    |
    +-- Run
    |    |
    |    +-- checkpoint
    |    +-- checkpoint
    |
    +-- Run
         |
         +-- checkpoint

Checkpoint history can branch into a DAG.
~~~

Historical checkpoints can be:

- inspected;
- used as the base of new Runs;
- branched without destroying existing descendants;
- modified through `update_state`;
- resumed when pending execution remains.

## Persistence model

Checkpoint persistence and Store persistence have distinct responsibilities.

~~~text
Checkpointer
    -> execution state
    -> Thread history
    -> pause/resume
    -> branching and time travel

Store
    -> namespace/key/value data
    -> long-term application memory
    -> cross-Thread persistence
~~~

The Runtime deployment graph intentionally embeds neither a custom Store nor a
custom Checkpointer.

LangGraph Runtime owns checkpoint persistence and supplies the execution-context
Store.

## Backend model

The workshop filesystem architecture is:

~~~text
Agent filesystem tools
        |
        v
CompositeBackend
     /       \
    /         \
default       /memories/
  |               |
  v               v
Filesystem      StoreBackend
Backend             |
  |                 v
  v             LangGraph Store
disk
~~~

`/memories/*` is therefore a virtual file interface over Store-backed memory.

The Runtime experiment validated cross-Thread memory end to end.

## Context engineering

Phase 0 distinguished three primary instruction/context mechanisms:

~~~text
system_prompt
    -> application-defined base instructions

AGENTS.md
    -> always-loaded instruction memory

Skills
    -> metadata catalog
    -> full instructions loaded on demand
~~~

AGENTS.md and Skill catalog data can become checkpointed middleware state,
which means resumed Threads may observe snapshots older than their current
backing files.

## Delegation and control

Subagents provide:

- context isolation;
- capability isolation;
- specialist routing;
- configurable Skill scope.

Human-in-the-loop provides an execution boundary supporting:

- approve;
- edit;
- reject;
- batched decisions;
- nested subagent interrupts.

## Preserved workshop patches

The learning repository preserves the workshop changes required by the
experiments:

~~~text
patches/interrupt26-gpt-6-luna.patch
patches/interrupt26-store-wiring.patch
patches/interrupt26-runtime-store-ownership.patch
~~~

These patches preserve reproducibility without committing modifications inside
the external reference clone.

## Known pinned-stack quirks

The Phase 0 review records several compatibility observations:

- the pinned LangGraph API generation is end-of-life;
- Runtime development persistence is in-memory;
- Store point-GET namespace serialization remains unresolved;
- the observed namespace-list response differs from the inspected OpenAPI
  response schema;
- legacy StoreBackend assistant-ID namespace detection is deprecated;
- StoreBackend documentation disagrees with its executable V1/V2 default;
- the environment emits a non-blocking LangChain serializer deprecation
  warning.

These are intentionally preserved as findings rather than patched away inside
the pinned workshop.

## Production gaps

Phase 0 does not claim production readiness.

Deferred areas include:

- durable Runtime persistence;
- explicit production Store namespace design;
- authentication;
- authorization and RBAC;
- sandboxing;
- observability;
- evaluations;
- resilience and retries;
- concurrency policy;
- security hardening.

These topics are handled by later phases of the roadmap.

## Environment restoration

Restore the pinned workshop reference with:

~~~bash
./scripts/bootstrap-reference.sh
cd .reference/interrupt26-deepagents
uv sync --locked
~~~

Use the locked workshop Python environment through:

~~~bash
uv run --locked python
~~~

Do not use the system Python for workshop dependency inspection.

`.env`, `.venv`, credentials and machine-specific runtime state are intentionally
excluded from repository history.

## Next

Complete **0.13 Phase review** by performing a final consistency audit across:

- `README.md`;
- `CURRENT.md`;
- `ROADMAP.md`;
- `docs/architecture.md`;
- `docs/journal/lab-11-phase-0-review.md`;
- preserved patches and references.

Then:

1. mark `0.13 Phase review` as complete in `ROADMAP.md`;
2. commit the Phase 0 completion checkpoint;
3. begin Phase 1 — Agent Runtime & Protocols.

Phase 1 should reuse rather than repeat the Runtime knowledge already validated
during Phase 0.

Its goal is to move from:

~~~text
How does the agent harness work internally?
~~~

to:

~~~text
How is the agent exposed, operated, streamed and connected as a runtime
service?
~~~
