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

## 0.9B — Cross-Thread Agent Memory

### Objective

Demonstrate real agent memory reuse across independent invocations without
relying on conversation history or checkpoint state.

The experiment uses:

~~~text
CompositeBackend
    default -> StateBackend
    /memories/ -> StoreBackend

BaseStore
    -> InMemoryStore
~~~

No checkpointer is configured.

### Thread A — Memory Write

The first invocation received:

~~~text
Remember that my preferred deployment target is staging.
~~~

The agent first inspected:

~~~text
/memories
~~~

and then wrote:

~~~text
/memories/preferences.md
~~~

with content containing:

~~~text
Preferred deployment target: staging.
~~~

### Backend routing

The final graph result contained only:

~~~text
messages
~~~

and StateBackend contained no memory files.

The BaseStore contained:

~~~text
namespace:
    ("memory-lab",)

key:
    /preferences.md

content:
    # Preferences
    - Preferred deployment target: staging.
~~~

This validates the route:

~~~text
agent path
/memories/preferences.md
        |
        v
CompositeBackend route
/memories/
        |
        v
StoreBackend key
/preferences.md
        |
        v
BaseStore namespace
("memory-lab",)
~~~

### Thread B — Memory Retrieval

A second invocation received only:

~~~text
What deployment target do I prefer?
Answer from long-term memory, not by guessing.
~~~

It did not receive Thread A's conversation history.

The agent independently performed:

~~~text
ls("/memories/")
        |
        v
/memories/preferences.md
        |
        v
read_file("/memories/preferences.md")
        |
        v
Preferred deployment target: staging
~~~

and answered:

~~~text
Your preferred deployment target is staging.
~~~

### Conversation isolation

The original Thread A instruction was absent from Thread B's messages.

No checkpointer was configured.

Therefore the second invocation could not obtain the preference through
checkpoint-based conversation continuity.

The relevant information came from BaseStore-backed memory.

### Assertions

All assertions passed:

~~~text
Thread A used a filesystem write capability                    PASS
memory exists in BaseStore                                     PASS
memory key is routed without /memories prefix                  PASS
stored memory contains staging                                 PASS
Thread A memory is not in StateBackend files                   PASS
Thread B started without Thread A instruction                  PASS
Thread B consulted filesystem memory                           PASS
Thread B memory is not inherited StateBackend state            PASS
Thread B answered staging                                      PASS
~~~

### Memory lifecycle

The experiment demonstrates two distinct agent policies.

Memory write:

~~~text
user information
      |
      v
agent identifies durable fact
      |
      v
write_file("/memories/...")
      |
      v
BaseStore
~~~

Memory retrieval:

~~~text
new independent request
      |
      v
agent recognizes memory may be relevant
      |
      v
discover / retrieve memory
      |
      v
use memory in answer
~~~

Persistent storage alone does not guarantee useful agent memory.

The agent must also make appropriate decisions about:

- what to save;
- where to save it;
- when to retrieve it;
- which memory is relevant;
- when stored information should be updated.

### Persistence precision

The current BaseStore implementation is InMemoryStore.

It proves:

~~~text
cross-invocation visibility     yes
cross-thread visibility         yes
same-process reuse              yes
survive Python process restart  no
~~~

The term "long-term" here therefore refers to lifetime beyond a conversation
thread, not durable production storage.
