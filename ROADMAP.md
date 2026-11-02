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

- [x] 1.5 Agent Server API boundary and interoperability mapping
  - [x] 1.5A Source and package inventory
  - [x] 1.5B Runtime concepts vs interoperability concepts
  - [x] 1.5C Agent Server protocol-integration boundary
  - [x] 1.5D Final service/API boundary
- [x] 1.6 LangChain Agent Streaming Protocol
  - [x] 1.6A Pinned protocol grammar inventory
  - [x] 1.6B Subscription, replay and ordering semantics
  - [x] 1.6C State, HITL and agent-topology semantics
  - [x] 1.6D Transport, implementation boundary and protocol evolution
- [x] 1.7 MCP
  - [x] 1.7A Protocol and capability inventory
  - [x] 1.7B Assistant-as-Tool projection and transport behavior
  - [x] 1.7C Runtime execution and persistence semantics
  - [x] 1.7D Error projection, edge cases and final boundary
- [x] 1.8 A2A
  - [x] 1.8A Protocol, adapter and projection inventory
  - [x] 1.8B Agent Card, versioning and compatibility behavior
  - [x] 1.8C Task lifecycle, HITL and persistence semantics
  - [x] 1.8D Streaming and final A2A boundary

### Phase review

- [x] 1.9 Runtime and protocols review

## Phase 2 — Agent ↔ UI

- [x] 2.1 Frontend application
  - [x] 2.1A Frontend stack and scaffold
  - [x] 2.1B Runtime domain model
  - [x] 2.1C Agent Server REST client baseline
  - [x] 2.1D Application shell
  - [x] 2.1E First execution surface
  - [x] 2.1F Frontend baseline review

- [ ] 2.2 Event streaming
  - [x] 2.2A Pinned streaming contract discovery
  - [x] 2.2B SSE transport client
  - [x] 2.2C Live Run streaming integration
  - [x] 2.2D Message and state projection
  - [ ] 2.2E Disconnect, reconnect and replay
  - [ ] 2.2F Persisted-state reconciliation
  - [ ] 2.2G Streaming baseline review
- [ ] 2.3 Shared state
- [ ] 2.4 Interrupts
- [ ] 2.5 Frontend tools
- [ ] 2.6 AG-UI
- [ ] 2.7 Generative UI patterns

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
