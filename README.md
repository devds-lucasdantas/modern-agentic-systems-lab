# Modern Agentic Systems Lab

Incremental, reproducible and versioned laboratory for learning modern agentic
architectures through direct experimentation.

The repository is designed to work simultaneously as:

1. an executable learning laboratory;
2. a long-term technical reference;
3. an architecture notebook;
4. a portfolio repository;
5. the foundation for an increasingly production-shaped full-stack agentic application.

## Learning goals

The laboratory will progressively study and reproduce:

- LangChain;
- LangGraph;
- Deep Agents;
- tools and middleware;
- state, threads, runs, checkpoints and stores;
- streaming and asynchronous execution;
- context engineering;
- filesystem and backend abstractions;
- subagents and skills;
- human-in-the-loop;
- short- and long-term memory;
- Agent Server API boundaries and agent streaming protocols;
- AG-UI and agent/frontend interaction;
- MCP and A2A;
- RAG, Agentic RAG, hybrid retrieval, reranking and GraphRAG;
- sandboxing and code execution;
- observability and evaluations;
- authentication, authorization and security;
- deployment and production readiness.

## Learning method

Each experiment follows this cycle:

~~~text
Hypothesis
   |
   v
Execution
   |
   v
Observation
   |
   v
Explanation
   |
   v
Reproduction
   |
   v
Modification
   |
   v
Documentation
   |
   v
Commit
~~~

The goal is not merely to make examples run. Each checkpoint should leave an
explainable mental model and a reproducible Git snapshot.

## Repository philosophy

External workshops and reference implementations are kept outside the tracked
history whenever practical. Their exact upstream commit is recorded so the
learning path remains reproducible without mixing upstream history with our own.

The repository should grow incrementally. Directories and abstractions are added
when the laboratory introduces them, rather than being scaffolded prematurely.

## Repository map

- [`CURRENT.md`](CURRENT.md) — exact continuation point and established working model;
- [`ROADMAP.md`](ROADMAP.md) — incremental learning path and completion status;
- [`docs/architecture.md`](docs/architecture.md) — consolidated architecture snapshots;
- [`docs/radar.md`](docs/radar.md) — technology, protocol and production-concern radar;
- [`docs/adr/`](docs/adr/) — architectural decisions;
- [`docs/journal/`](docs/journal/) — experiment evidence and learning journals;
- [`references/README.md`](references/README.md) — pinned external references;
- [`patches/`](patches/) — local adaptations applied to external references;
- [`scripts/`](scripts/) — reproducibility and bootstrap helpers.

<!-- current-status:start -->

## Current status

The project has completed **Phase 1 — Agent Runtime & Protocols** and is entering
**Phase 2 — Agent ↔ UI**.

### Phase 1 completed

Validated and consolidated:

- ✅ Runtime API contracts;
- ✅ Agent, Thread and Run resource model;
- ✅ State, checkpoints and Store persistence;
- ✅ Run lifecycle and execution-control semantics;
- ✅ SSE streaming, replay and disconnect behavior;
- ✅ multitask strategies and per-Thread scheduling;
- ✅ background execution and durability;
- ✅ Agent Server API boundary;
- ✅ LangChain Agent Streaming Protocol boundary;
- ✅ MCP interoperability;
- ✅ A2A interoperability;
- ✅ Phase 1 architectural review.

The consolidated architecture distinguishes:

~~~text
Agent Server REST
    -> persistent resource and execution service

Agent Streaming Protocol
    -> Thread-centric command/event interaction contract

MCP
    -> stateless capability projection over Runtime execution

A2A
    -> persistent Agent/Context/Task interoperability projection
~~~

Key invariants carried forward include:

- stateless Runs still execute through Runtime-managed Threads;
- Run lifecycle status is distinct from persisted graph execution position;
- `Run.status=success` does not necessarily mean graph `END`;
- `Checkpointer != Store`;
- `Thread.status` is not an authoritative concurrency lock;
- Runtime lifecycle interruption is distinct from graph/HITL interruption;
- Agent Server REST is not the Agent Streaming Protocol;
- MCP and A2A are protocol projections, not alternate graph executors;
- `A2A Task != Runtime Run`.

### Current phase — Agent ↔ UI

The next roadmap block is:

~~~text
Phase 2 — Agent ↔ UI
    -> Frontend application
    -> Event streaming
    -> Shared state
    -> Interrupts
    -> Frontend tools
    -> AG-UI
    -> Generative UI patterns
~~~

The central next question is:

~~~text
How should a frontend observe, represent and control the Runtime model
validated during Phase 1?
~~~

See [`CURRENT.md`](CURRENT.md) for the exact continuation point and
[`ROADMAP.md`](ROADMAP.md) for the full learning path.

<!-- current-status:end -->
