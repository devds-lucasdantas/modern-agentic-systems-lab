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

## 0.9C — Memory Isolation by Namespace

### Objective

Validate BaseStore namespace isolation using one shared Store and identical
logical memory paths.

The experiment deliberately held constant:

~~~text
BaseStore instance
memory filename
memory backend behavior
~~~

while varying only the namespace.

### Setup

Two memory agents shared one InMemoryStore.

User A used:

~~~text
("user-a", "memories")
~~~

User B used:

~~~text
("user-b", "memories")
~~~

Both wrote to the same logical path:

~~~text
/memories/preferences.md
~~~

### Stored values

The resulting BaseStore contained:

~~~text
namespace=("user-a", "memories")
key=/preferences.md
value=Preferred deployment target: staging.
~~~

and independently:

~~~text
namespace=("user-b", "memories")
key=/preferences.md
value=Preferred deployment target: production.
~~~

The identical key therefore refers to different items when used under different
namespaces.

### Retrieval

User A retrieved:

~~~text
staging
~~~

while User B retrieved:

~~~text
production
~~~

Neither agent observed the other namespace's preference.

### Assertions

All assertions passed:

~~~text
User A has one memory item                                 PASS
User B has one memory item                                 PASS
both namespaces may use same file key                      PASS
User A store contains staging                              PASS
User A store does not contain production                   PASS
User B store contains production                           PASS
User B store does not contain staging                      PASS
User A agent answers staging                               PASS
User A agent does not answer production                    PASS
User B agent answers production                            PASS
User B agent does not answer staging                       PASS
~~~

### Identity model

A Store item is effectively identified by:

~~~text
namespace + key
~~~

not by key alone.

Conceptually:

~~~text
BaseStore
|
+-- ("user-a", "memories")
|     |
|     +-- /preferences.md -> staging
|
+-- ("user-b", "memories")
      |
      +-- /preferences.md -> production
~~~

### Security boundary precision

Namespaces provide logical data separation inside the Store API.

They are not, by themselves, an authentication mechanism.

A production namespace should be derived from trusted authenticated runtime
identity rather than arbitrary user-controlled prompt content.

Conceptually:

~~~text
authenticated request
        |
        v
trusted user identity
        |
        v
memory namespace
        |
        v
StoreBackend
~~~

## 0.9D1 — Run-Scoped Identity Context

### Objective

Determine the supported mechanism for deriving a memory namespace dynamically
from request-scoped identity.

### Runtime context

LangGraph Runtime exposes:

~~~text
context
store
stream_writer
previous
execution_info
server_info
~~~

`context` is run-scoped information defined by the graph's `context_schema`.

It is distinct from:

~~~text
RunnableConfig
graph state
messages
BaseStore
~~~

### Deep Agents integration

`create_deep_agent()` accepts:

~~~python
context_schema=...
~~~

and forwards it to the underlying LangChain agent graph.

The compiled graph invocation API accepts:

~~~python
agent.invoke(
    input,
    context=...
)
~~~

as a dedicated keyword argument.

The same context mechanism is available through synchronous, asynchronous, and
streaming graph APIs.

### Identity boundary

User identity should not be inferred from prompt text.

A production-shaped flow is:

~~~text
authenticated request
        |
        v
trusted identity
        |
        v
invoke(..., context={user_id: ...})
        |
        v
Runtime.context
        |
        v
StoreBackend namespace
~~~

The context therefore represents a suitable boundary for deriving per-user
memory namespaces.

### Context versus config

~~~text
context
    -> run-scoped application identity/data

config
    -> execution configuration such as thread metadata

state
    -> mutable graph state

store
    -> cross-run application data
~~~

This distinction becomes important when authentication, multi-tenancy, and
memory are combined.

## 0.9D2 — Dynamic Per-User Memory Namespace

### Objective

Validate a production-shaped memory architecture in which one compiled agent
and one shared BaseStore serve multiple users while deriving memory isolation
from trusted run-scoped context.

### Setup

The experiment used:

~~~text
one compiled Deep Agent
one InMemoryStore
one CompositeBackend
one StoreBackend
one logical memory path
~~~

The only variable between requests was:

~~~text
Runtime.context.user_id
~~~

### Namespace factory

The StoreBackend namespace was derived dynamically:

~~~python
def memory_namespace(runtime):
    user_id = runtime.context["user_id"]

    return (
        user_id,
        "memories",
    )
~~~

Therefore the same StoreBackend instance resolved different namespaces for
different invocations.

### User A

A request with:

~~~text
context.user_id = user-a
~~~

stored:

~~~text
/memories/preferences.md
~~~

under:

~~~text
("user-a", "memories")
~~~

with the preference:

~~~text
staging
~~~

### User B

A request through the same compiled agent with:

~~~text
context.user_id = user-b
~~~

stored the same logical file:

~~~text
/memories/preferences.md
~~~

under:

~~~text
("user-b", "memories")
~~~

with:

~~~text
production
~~~

### Shared infrastructure

The final Store contained:

~~~text
BaseStore
|
+-- ("user-a", "memories")
|     |
|     +-- /preferences.md -> staging
|
+-- ("user-b", "memories")
      |
      +-- /preferences.md -> production
~~~

Both namespaces were created through the same:

~~~text
agent
store
backend
logical filename
~~~

### Retrieval

Using the same compiled agent:

~~~text
context=user-a -> staging
context=user-b -> production
~~~

Neither retrieval exposed the other user's value.

### Namespace factory invocation behavior

Instrumentation showed that the namespace factory can be evaluated multiple
times during one agent invocation.

This is expected because filesystem operations independently resolve their
Store namespace.

Therefore a namespace factory should normally be:

~~~text
pure
cheap
deterministic
side-effect free
~~~

It should not generate random namespace components or perform unnecessary
external work.

### Architecture

~~~text
authenticated request
        |
        v
Runtime.context.user_id
        |
        v
namespace factory
        |
        +---------------------------+
        |                           |
        v                           v
("user-a", "memories")   ("user-b", "memories")
        |                           |
        +-------------+-------------+
                      |
                      v
                shared BaseStore
~~~

### Assertions

All functional isolation assertions passed.

The experimental check:

~~~python
id(agent) == id(agent)
~~~

is tautological and should not itself be treated as evidence.

The actual evidence that one compiled agent served both users is the experiment
structure: `create_deep_agent()` was called once and that same `agent` object was
used for all requests.

### Main lesson

Per-user long-term memory does not require a separate agent instance per user.

A shared agent can safely select a logical memory partition from trusted
run-scoped identity:

~~~text
one agent
+
one store
+
runtime identity
+
namespace isolation
~~~
