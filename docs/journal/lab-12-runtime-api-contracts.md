# Lab 12 — Runtime API Contracts

## Goal

Move from the internal execution model validated during Phase 0 to the external
API contracts exposed by the LangGraph Runtime.

Phase 0 established experimentally:

- Assistant identity;
- Thread identity;
- Runs;
- checkpoint persistence;
- historical state;
- checkpoint branching;
- state updates;
- Runtime Store ownership;
- cross-thread Store-backed memory.

Phase 1 will not repeat those experiments.

Instead, this lab will map the Runtime as a service boundary.

## Questions

1. What are the top-level Runtime resources?
2. Which endpoints create, read, update, search, or delete each resource?
3. Which operations are synchronous versus streaming?
4. Which schemas represent Agent/Assistant, Thread, Run, State and Checkpoint?
5. How are configuration and context passed into Runs?
6. How are interrupts represented through the API?
7. How is Run lifecycle/status represented?
8. Which operations are stateful versus stateless?
9. Which Runtime APIs belong to LangGraph-specific semantics?
10. Which concepts later map naturally to Agent Protocol or other interoperability
    protocols?

## Starting hypothesis

The API can be understood as several related resource families:

~~~text
Assistant
    -> graph/configuration identity

Thread
    -> persistent execution-state identity

Run
    -> execution lifecycle

State / Checkpoint
    -> versioned Thread execution state

Store
    -> cross-Thread application data
~~~

This model will be validated against the actual OpenAPI contract exposed by the
pinned Runtime.

## Evidence policy

Claims in this lab will be classified as:

- `OPENAPI` — directly established from the Runtime API schema;
- `RUNTIME` — directly observed through API execution;
- `SOURCE` — verified in pinned source code;
- `INFERENCE` — architectural interpretation that still requires validation.

## 1.1A — Runtime API surface inventory

### Objective

Inventory the complete HTTP API and classify endpoints by resource family
before performing further Runtime experiments.
