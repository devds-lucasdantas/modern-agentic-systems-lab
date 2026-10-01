# Technology and Architecture Radar

This radar is a living map of technologies, protocols, patterns and production
concerns that may become relevant during the laboratory. Inclusion does not mean
that every item must be adopted. The goal is to know what exists, where it fits,
and what questions must be answered before choosing it.

## 1. Agent Runtime and Orchestration

### LangChain

Role to investigate:

- model abstraction;
- tools and tool schemas;
- structured output;
- middleware;
- agent primitives;
- provider integrations.

Questions:

- What does `create_agent` provide?
- Which responsibilities belong to LangChain rather than LangGraph?
- How portable are tools and models across providers?

### LangGraph

Role to investigate:

- stateful execution;
- graph orchestration;
- durable execution;
- checkpoints;
- threads and runs;
- interrupts;
- streaming;
- stores;
- long-running workflows.

Questions:

- When should application code define a `StateGraph` manually?
- When is a higher-level agent API enough?
- What is persisted in a checkpoint versus a store?

### Deep Agents

Role to investigate:

- opinionated agent harness;
- planning and TODOs;
- filesystem abstraction;
- context management;
- subagents;
- skills;
- memory;
- autonomous long-running work.

Patterns to keep on the radar:

- ReAct / tool-calling loop;
- plan-and-execute;
- router;
- supervisor;
- orchestrator-worker;
- fan-out / fan-in;
- reviewer / critic;
- bounded repair loops;
- deterministic validation around probabilistic steps;
- human approval gates;
- durable asynchronous execution.

## 2. Agent Interoperability Protocols

### Agent Protocol

Investigate standardized concepts such as:

- Agent;
- Thread;
- Run;
- Store;
- background execution;
- run lifecycle;
- client/runtime separation.

Important question:

What belongs to an interoperability contract versus a specific LangGraph SDK?

### Agent Streaming Protocol

Keep on the radar:

- lifecycle events;
- message deltas;
- tool-call events;
- state updates;
- checkpoints;
- interrupts;
- commands;
- nested namespaces;
- reconnect and replay;
- SSE versus WebSocket.

### AG-UI

Agent-to-user-interface protocol concerns:

- run lifecycle;
- text/message streaming;
- tool calls;
- frontend tools;
- activities;
- state synchronization;
- interrupts and approvals;
- subagent events;
- shared agent/frontend state.

We must explicitly compare overlap and boundaries between AG-UI and agent runtime
streaming protocols.

### MCP

Model Context Protocol should be studied as an integration protocol for:

- tools;
- resources;
- prompts;
- servers and clients;
- capability discovery.

MCP does not itself solve authorization, sandbox isolation or every agent-to-agent
communication problem.

### A2A

Agent-to-Agent communication belongs on the radar for independent agents that
need to discover and collaborate with each other. Compare it with MCP rather
than assuming they are competing solutions.

## 3. Knowledge, Retrieval and Grounding

### RAG

Retrieval-Augmented Generation is an architecture/pattern, not an agent
interoperability protocol.

Baseline pipeline:

~~~text
Source data
   |
   v
ingestion
   |
   v
chunking
   |
   v
indexing
   |
   v
retrieval
   |
   v
optional reranking
   |
   v
context construction
   |
   v
model generation
~~~

Retrieval strategies to test:

- dense/vector retrieval;
- sparse/BM25 retrieval;
- hybrid retrieval;
- metadata filtering;
- multi-query retrieval;
- query rewriting;
- contextual compression;
- reranking.

Agentic retrieval patterns:

- Agentic RAG;
- Corrective RAG;
- Adaptive RAG;
- retrieval planning;
- iterative retrieval;
- tool-selected data sources.

Graph approaches:

- GraphRAG;
- knowledge graphs;
- entity/relation extraction;
- graph traversal plus semantic retrieval.

Evaluation questions:

- retrieval recall;
- precision;
- relevance;
- groundedness;
- citation correctness;
- context utilization.

## 4. Context Engineering

Context engineering is broader than prompt writing.

Keep on the radar:

- system instructions;
- message history;
- retrieved knowledge;
- tool outputs;
- state projection;
- memory injection;
- progressive disclosure;
- summarization;
- context offloading;
- token budgeting;
- prompt caching;
- model-specific context limits.

Core distinction:

~~~text
State = operational information controlling execution
Memory = persisted reusable information
RAG = external information retrieved on demand
Context = information actually presented to the model for a turn
~~~

## 5. Memory

Memory forms to study:

- short-term conversation memory;
- long-term memory;
- semantic memory;
- episodic memory;
- procedural memory;
- user/profile memory;
- agent identity/instructions;
- key-value stores;
- vector memory;
- filesystem-like memory.

Operational concerns:

- extraction;
- consolidation;
- deduplication;
- decay and expiration;
- privacy;
- tenancy;
- deletion;
- provenance;
- relevance filtering.

## 6. Tool and Capability Integration

Tool concerns:

- schemas;
- validation;
- structured arguments;
- retries;
- timeouts;
- idempotency;
- permissions;
- rate limits;
- secrets;
- error contracts;
- observability;
- deterministic wrappers around external APIs.

Patterns:

- local Python tools;
- HTTP/API tools;
- MCP tools;
- browser/computer tools;
- database tools;
- filesystem tools;
- code execution tools.

## 7. Structured Outputs and Contracts

Keep on the radar:

- JSON Schema;
- Pydantic;
- typed state;
- discriminated unions;
- schema evolution;
- backward compatibility;
- runtime validation;
- retry/repair on invalid model output.

Agent systems should not rely on natural-language parsing when a stable machine
contract can be used instead.

## 8. Human-in-the-Loop

Study:

- interrupts;
- approval before sensitive tools;
- review/edit/resume;
- escalation;
- configurable policy gates;
- auditable human decisions;
- timeout/cancellation behavior.

Questions:

- What data must be persisted while execution is paused?
- How does a frontend discover an interrupt?
- How is the human decision represented as a command/event?

## 9. Sandboxed Execution

Important distinction:

Filesystem path virtualization is not equivalent to a security sandbox.

Isolation approaches to compare:

- subprocess with restrictions;
- containers;
- microVMs;
- remote sandboxes;
- ephemeral workspaces;
- network-restricted environments;
- per-run credentials.

Concerns:

- filesystem isolation;
- process isolation;
- network egress;
- resource limits;
- secret boundaries;
- cleanup;
- artifact export.

## 10. Security and Guardrails

Threats:

- prompt injection;
- indirect prompt injection;
- tool poisoning;
- malicious MCP servers;
- data exfiltration;
- confused deputy problems;
- unsafe code execution;
- privilege escalation;
- cross-tenant leakage;
- malicious retrieved documents.

Controls:

- least privilege;
- capability allowlists;
- authentication;
- authorization / RBAC / ABAC;
- tenant isolation;
- validation;
- approval gates;
- output filtering where appropriate;
- audit logs;
- secret scoping;
- egress restrictions.

## 11. Observability

Keep on the radar:

- LangSmith;
- OpenTelemetry;
- traces;
- spans;
- model calls;
- tool calls;
- state transitions;
- token usage;
- latency;
- cost;
- errors;
- retries;
- run correlation;
- distributed tracing across agents/tools.

Observability must help answer not only “what failed?” but also “why did the
agent choose this action?”.

## 12. Evaluation

Evaluation layers:

- unit tests around deterministic code;
- integration tests around tools;
- graph tests;
- end-to-end scenarios;
- agent trajectory evaluation;
- final-answer evaluation;
- retrieval evaluation;
- safety evaluation;
- regression suites.

Methods:

- deterministic assertions;
- reference answers;
- rubric-based scoring;
- LLM-as-judge with calibration;
- pairwise comparison;
- offline datasets;
- online feedback.

## 13. Model Strategy

Keep on the radar:

- model abstraction;
- provider portability;
- model routing;
- fallback models;
- main-agent versus subagent models;
- reasoning effort;
- latency/cost/quality trade-offs;
- local models;
- hosted models;
- multimodal models;
- structured-output reliability.

Avoid hard-coding architecture assumptions around a single model vendor.

## 14. Streaming and Asynchronous Execution

Study:

- token streaming;
- event streaming;
- state streaming;
- background runs;
- async tools;
- cancellation;
- backpressure;
- reconnect/replay;
- resumable streams;
- long-running jobs.

The UI contract should distinguish model text deltas from tool events, state
changes and lifecycle events.

## 15. Persistence

Separate persistence categories:

- thread/checkpoint persistence;
- long-term store;
- application database;
- artifact/object storage;
- vector database;
- graph database;
- filesystem/workspace persistence.

Questions:

- What is transactional?
- What is ephemeral?
- What survives across threads?
- What survives deployment restarts?
- How is tenancy represented?

## 16. Generative UI

Keep on the radar:

- AG-UI;
- A2UI;
- MCP-UI;
- Open JSON UI-like patterns;
- artifact interfaces;
- typed UI schemas;
- server-driven UI;
- frontend tool calls.

Important distinction:

AG-UI primarily concerns agent/frontend communication and events. Generative UI
specifications may separately describe how UI itself is represented or generated.

## 17. Deployment and Platform Engineering

Deployment topics:

- local development runtime;
- LangGraph/LangSmith deployment paths;
- containers;
- serverless where appropriate;
- Kubernetes where justified;
- CI/CD;
- environment promotion;
- secret management;
- autoscaling;
- queues;
- worker models;
- persistence services;
- artifact storage;
- health/readiness checks;
- disaster recovery.

Production concerns:

- retries and idempotency;
- concurrency;
- rate limits;
- quotas;
- cost budgets;
- model outages;
- provider failover;
- schema migrations;
- version compatibility.

## 18. Questions We Want to Be Able to Answer

At the end of the learning path we should be able to explain, without relying on
framework marketing language:

1. Where does LangChain end and LangGraph begin?
2. What does Deep Agents add on top of them?
3. What is actually returned by `create_deep_agent`?
4. When should a graph be written manually?
5. What is the difference between Agent, Thread and Run?
6. What belongs in a checkpoint versus a Store?
7. How does streaming travel from runtime to frontend?
8. How do Agent Protocol and AG-UI differ?
9. Where does MCP fit and where does it not fit?
10. When is A2A useful?
11. What is the difference between state, context, memory and RAG?
12. How should RAG quality be evaluated?
13. How do skills use progressive disclosure?
14. How should subagents isolate context?
15. How does HITL pause and resume durable execution?
16. What constitutes a real security sandbox?
17. How can an agent safely modify a Git repository and open a PR?
18. How do we observe and evaluate an agent in production?
19. Which parts of the stack are protocols and which are implementation details?
20. How do we build an agentic system whose behavior can be tested, explained and operated?
