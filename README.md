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
- Agent Protocol and streaming protocols;
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

<!-- current-status:start -->

## Current status

The project is currently in **Phase 1 — Agent Runtime & Protocols**.

### Runtime foundations

Completed:

- ✅ Agent, Thread and Run
- ✅ State and checkpoints
- ✅ Store and persistence
- ✅ Streaming
- ✅ Run cancellation and rollback semantics
- ✅ Multitask strategies and supersession
- ✅ Per-Thread scheduling and serialization
- ✅ Background Runs and durability

In progress:

- 🚧 Agent Protocol

Next:

- ⬜ Agent Streaming Protocol
- ⬜ MCP
- ⬜ A2A

### Runtime model validated so far

```text
registered Graph
      |
      v
  Assistant
      |
      v
     Run
      |
      +----------------------+
      |                      |
      v                      v
   Thread                stream / wait
      |
      v
State / Checkpoints

Store
  |
  +-- independent cross-thread persistence
```

Key findings include:

- stateful and stateless Runs share the same underlying Run execution model;
- stateless Runs still use Runtime-managed Threads;
- Run lifecycle and persisted graph execution position are separate dimensions;
- `Run.status=success` does not necessarily mean the graph reached `END`;
- checkpoint history supports resume, time travel and branching;
- Store persistence is independent from checkpoint persistence;
- resumable SSE streams use cursor groups rather than unique event IDs;
- `interrupt` preserves partial state while `rollback` restores prior state;
- `enqueue` is scheduled per-Thread serialized execution, ordered by eligible
  `created_at`, not strict HTTP submission FIFO;
- `Thread.status` is a denormalized lifecycle projection and must not be treated
  as an authoritative in-flight Run index.

The current experiment block is:

```text
Agent Protocol
    -> protocol contract
    -> Runtime mapping
    -> interoperability boundary
```

See [`CURRENT.md`](CURRENT.md) for the exact continuation point and
[`ROADMAP.md`](ROADMAP.md) for the full learning path.

<!-- current-status:end -->
