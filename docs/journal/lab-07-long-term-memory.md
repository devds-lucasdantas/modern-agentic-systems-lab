# Lab 07 — Long-Term Memory

## Goal

Understand how Deep Agents builds cross-thread agent memory on top of LangGraph
BaseStore and filesystem-style backend abstractions.

This lab distinguishes:

- graph/thread state;
- checkpoints;
- BaseStore;
- StoreBackend;
- memory namespaces;
- filesystem-style memory;
- cross-thread retrieval;
- process lifetime versus durable persistence.

## 0.9A — Static Architecture

### Workshop memory model

The workshop implements long-term memory using a CompositeBackend:

~~~text
/memories/*       -> StoreBackend
everything else   -> StateBackend
~~~

The model is therefore:

~~~text
filesystem tools
      |
      v
CompositeBackend
      |
      +-- /memories/* -> StoreBackend -> BaseStore
      |
      +-- everything -> StateBackend -> graph state
~~~

Long-term memory is not a separate hidden model capability.

It is an agent behavior built from:

~~~text
persistent/cross-thread storage
+
filesystem abstraction
+
path convention
+
agent instructions
~~~

### Relation to Lab 0.6

Lab 0.6 answered:

~~~text
Where and how is data stored?
~~~

Lab 0.9 asks:

~~~text
How does an agent write, discover, retrieve, and reuse that data across
independent executions?
~~~

### Store resolution

StoreBackend can receive a BaseStore directly:

~~~python
StoreBackend(store=my_store)
~~~

or obtain the store dynamically from LangGraph runtime context:

~~~text
get_store()
~~~

The latter requires the graph to have been compiled with a store.

Deep Agents wires this through:

~~~python
create_deep_agent(
    ...,
    store=store,
)
~~~

### File representation

StoreBackend maps filesystem operations onto BaseStore items.

Conceptually:

~~~text
write_file(path, content)
        |
        v
store.put(namespace, path, value)

read_file(path)
        |
        v
store.get(namespace, path)
~~~

The v2 file representation stores plain string content and encoding metadata.

### Namespace

The current implementation supports an explicit namespace factory:

~~~python
StoreBackend(
    namespace=lambda runtime: (...)
)
~~~

The older implicit namespace behavior defaults to:

~~~text
("filesystem",)
~~~

and may prepend an assistant identifier.

That legacy namespace resolution is deprecated.

This lab therefore uses explicit namespaces.

### Why namespaces matter

A namespace controls visibility.

Conceptually:

~~~text
same store
|
+-- ("user-a", "memories")
|
+-- ("user-b", "memories")
~~~

allows one storage system to isolate memories belonging to different users,
agents, or applications.

### Discovery

StoreBackend supports filesystem-style discovery through:

~~~text
ls
glob
grep
read
~~~

over items in its namespace.

Therefore an agent does not necessarily need to know the exact memory key in
advance.

### Persistence precision

The workshop uses InMemoryStore.

This provides:

~~~text
cross-thread visibility       yes
same-process reuse            yes
survive process restart       no
~~~

Therefore the current experiment validates cross-thread long-term memory
semantics, not durable production storage.

### Store versus Checkpointer

~~~text
Checkpointer
    -> execution/thread state
    -> pause/resume
    -> conversation continuity

BaseStore
    -> application data outside one thread
    -> reusable across independent threads
~~~

The next experiment deliberately avoids relying on shared conversation history
to prove that memory retrieval comes from BaseStore.
