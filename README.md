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

## Current starting point

The initial repository intentionally contains documentation only. No agent
framework has been installed or implemented yet.

See:

- `ROADMAP.md` for the learning sequence;
- `docs/radar.md` for the technology and architecture radar;
- `docs/adr/` for architecture decisions;
- `docs/journal/` for experiment records;
- `references/README.md` for pinned external material.
