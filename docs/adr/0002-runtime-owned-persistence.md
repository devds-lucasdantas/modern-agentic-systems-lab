# ADR 0002 — Runtime-owned persistence for registered graphs

Status: Accepted

## Context

The laboratory supports two execution contexts:

1. standalone graph execution used by isolated experiments;
2. graphs registered with Agent Server and executed by the LangGraph Runtime.

Standalone execution may require explicitly supplied in-memory persistence
objects.

Registered Agent Server execution has a different ownership boundary. Live
experiments showed that Runtime executions persist checkpoints and expose the
Runtime Store even when the exported CompiledStateGraph has no embedded custom
Checkpointer or Store.

Embedding application-created persistence objects into the registered graph
would duplicate or conflict with Runtime ownership.

## Decision

Registered Agent Server graphs do not embed production Checkpointer or Store
instances.

The registered graph is constructed so that:

~~~text
graph.checkpointer = None
graph.store        = None
~~~

and Agent Server Runtime owns execution persistence.

Backends that require the active Store should resolve the Runtime-provided Store
from execution context, for example through `StoreBackend(store=None)`.

Standalone test helpers may explicitly inject isolated in-memory persistence
objects when running outside Agent Server.

## Consequences

### Positive

- one clear owner for Runtime persistence;
- registered graphs remain compatible with Agent Server lifecycle management;
- checkpoints, resumability and Thread state use Runtime-managed infrastructure;
- Store-backed application data can use the Runtime-provided Store;
- standalone experiments remain independently executable.

### Negative

- standalone and registered construction paths are intentionally different;
- tests must be explicit about who owns persistence;
- code must not infer missing persistence merely because the compiled graph
  exposes `store=None` or `checkpointer=None`;
- production persistence configuration belongs outside the graph definition.
