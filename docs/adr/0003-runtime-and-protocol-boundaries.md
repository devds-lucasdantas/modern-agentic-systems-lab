# ADR 0003 — Keep Runtime APIs and interoperability protocols distinct

Status: Accepted

## Context

Phase 1 studied several surfaces that share concepts such as messages, Threads,
Runs, state, streaming and human-in-the-loop interaction:

- Agent Server REST API;
- LangChain Agent Streaming Protocol;
- MCP;
- A2A.

Shared vocabulary does not make these surfaces aliases.

The experiments showed different identity, lifecycle, persistence, transport
and error contracts for each surface.

Treating them as interchangeable would hide important semantic differences such
as:

~~~text
Agent Server Thread / Run
    !=
Agent Streaming Protocol interaction model

MCP Tool
    !=
Assistant resource

A2A Task
    !=
Runtime Run
~~~

## Decision

Treat Agent Server REST, Agent Streaming Protocol, MCP and A2A as distinct
architectural contracts.

~~~text
Agent Server REST
    -> persistent service/resource and execution contract

Agent Streaming Protocol
    -> Thread-centric command/event interaction contract

MCP
    -> stateless capability projection over Assistants and Runtime execution

A2A
    -> persistent Agent/Context/Task interoperability projection
~~~

Protocol adapters translate identity, schemas, lifecycle, messages, errors and
capabilities onto Agent Server execution primitives.

A protocol adapter is not considered a separate graph executor.

## Consequences

### Positive

- protocol-specific semantics remain explicit;
- Runtime implementation details are not mistaken for portable contracts;
- interoperability gaps can be identified at adapter boundaries;
- clients can choose the surface appropriate to their interaction model;
- future protocol evolution can be evaluated independently from Runtime
  evolution.

### Negative

- similar concepts require explicit mapping between layers;
- additional adapters may need protocol-specific persistent state;
- integration tests must distinguish Runtime behavior from protocol conformance;
- documentation must identify whether a statement describes Agent Server,
  protocol semantics or adapter policy.
