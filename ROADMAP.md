# Learning Roadmap

## Phase 0 — Deep Agents

- [x] 0.1 Repository and environment setup
- [x] 0.2 Explore the Interrupt 2026 workshop
- [x] 0.3 Minimal Deep Agent
- [x] 0.4 Planning and filesystem
- [x] 0.5 Custom tools
- [x] 0.6 Backends
- [x] 0.7 Subagents
- [x] 0.8 Human-in-the-loop
- [x] 0.9 Long-term memory
- [x] 0.10 AGENTS.md
- [x] 0.11 Skills
- [x] 0.12 LangGraph Runtime and Studio
- [x] 0.13 Phase review

## Phase 1 — Agent Runtime & Protocols

### Runtime contracts

- [x] 1.1 Runtime API contracts
  - [x] Agent, Thread and Run resource model
  - [x] Graph vs Assistant
  - [x] Stateful vs stateless Run contracts
  - [x] State and checkpoint contracts
  - [x] Store and persistence contracts
  - [x] Execution-control schemas
  - [x] Streaming surface inventory
  - [x] Runtime interoperability surface inventory

- [x] 1.2 Run lifecycle and streaming execution
  - [x] Stateful Run lifecycle
  - [x] Stateless Runtime-managed Threads
  - [x] Wait execution semantics
  - [x] SSE streaming baseline
  - [x] Semantic stream modes
  - [x] Resumable streams
  - [x] Last-Event-ID replay
  - [x] Duplicate cursor semantics
  - [x] Disconnect continuation and cancellation
  - [x] Explicit interrupt and rollback cancellation
  - [x] Checkpoint preservation and rollback semantics

- [x] 1.3 Run concurrency and multitask strategies
  - [x] Multitask strategy contract
  - [x] reject
  - [x] enqueue
  - [x] interrupt
  - [x] rollback
  - [x] Thread-status drift under pending interruption
  - [x] Active supersession
  - [x] State inheritance
  - [x] Scheduler eligibility and ordering
  - [x] Per-Thread execution serialization

### Background execution

- [x] 1.4 Run execution modes and background execution
  - [x] Background Run creation
  - [x] Stateful background Runs
  - [x] Stateless Runtime-managed Threads
  - [x] Wait consumption mode
  - [x] Stream consumption mode
  - [x] Delayed execution with after_seconds
  - [x] Scheduler eligibility and ordering
  - [x] Per-Thread serialization
  - [x] Durability: sync
  - [x] Durability: async
  - [x] Durability: exit
  - [x] Final execution-mode contract

### Protocols

- [ ] 1.5 Agent Protocol
- [ ] 1.6 Agent Streaming Protocol
- [ ] 1.7 MCP
- [ ] 1.8 A2A

### Phase review

- [ ] 1.9 Runtime and protocols review

## Phase 2 — Agent ↔ UI

- [ ] Frontend application
- [ ] Event streaming
- [ ] Shared state
- [ ] Interrupts
- [ ] Frontend tools
- [ ] AG-UI
- [ ] Generative UI patterns

## Phase 3 — Knowledge & Mini Open SWE

- [ ] RAG fundamentals
- [ ] Hybrid retrieval and reranking
- [ ] Agentic RAG
- [ ] GraphRAG
- [ ] Sandbox
- [ ] GitHub integration
- [ ] Planning
- [ ] Code execution
- [ ] Automated validation
- [ ] Review
- [ ] Human approval
- [ ] Pull request

## Phase 4 — Production

- [ ] Authentication
- [ ] Authorization / RBAC
- [ ] Observability
- [ ] Evaluations
- [ ] Security
- [ ] Resilience and retries
- [ ] Cost controls
- [ ] Deployment
- [ ] Production readiness review
