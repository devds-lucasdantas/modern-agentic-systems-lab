# Lab 04 — Backends

## 0.6A — Backend Architecture

### Objective

Inspect the backend abstractions provided by the pinned Deep Agents version and
understand how filesystem tools are decoupled from storage implementation.

### Backend hierarchy

The inspected backend implementations are:

~~~text
BackendProtocol
├── StateBackend
├── FilesystemBackend
├── StoreBackend
└── CompositeBackend
~~~

All four concrete backends implement the common backend protocol rather than
inheriting storage behavior from one another.

### StateBackend

`StateBackend` stores files in LangGraph agent state.

Conceptually:

~~~text
filesystem tool
      |
      v
StateBackend
      |
      v
LangGraph files channel
~~~

Its documentation describes this storage as ephemeral and scoped to
conversation/thread state rather than persistent across independent threads.

### FilesystemBackend

`FilesystemBackend` reads and writes directly to the operating-system
filesystem.

This means filesystem mutations are real and persistent outside graph state.

The backend documentation explicitly warns that agents may:

- read accessible secrets;
- modify real files;
- permanently alter data;
- combine filesystem access with network capabilities to exfiltrate data.

### virtual_mode

`virtual_mode=True` provides virtual path semantics and path-based guardrails.

It can prevent path traversal such as:

~~~text
..
~
absolute paths outside root_dir
~~~

It does not provide:

~~~text
process isolation
OS sandboxing
security isolation
~~~

The workshop source describes its filesystem backend as "sandboxed via
virtual_mode=True", but the backend's own documentation explicitly states that
virtual mode is not a sandbox.

### StoreBackend

`StoreBackend` stores files in LangGraph's `BaseStore`.

Its documented semantics are persistent, cross-conversation storage organized
through namespaces.

Conceptually:

~~~text
StateBackend
    -> graph/thread state

StoreBackend
    -> BaseStore
    -> cross-thread storage
~~~

Long-term memory as an agent concept will be studied separately.

### CompositeBackend

`CompositeBackend` routes filesystem operations according to path prefixes.

~~~text
path
 |
 +--> longest matching route --> routed backend
 |
 +--> no route -------------> default backend
~~~

The workshop configures:

~~~text
default:
  FilesystemBackend(
      root_dir=AGENT_DIR,
      virtual_mode=True
  )

route:
  /memories/ -> StoreBackend
~~~

Therefore ordinary files use the real workshop filesystem while paths under
`/memories/` are routed to LangGraph Store storage.

### Shared filesystem interface

StateBackend, FilesystemBackend and StoreBackend all provide the core
filesystem operations required by the agent abstraction:

~~~text
read
write
edit
ls
glob
grep
upload
download
~~~

The language model therefore interacts with stable filesystem tools while the
backend controls the storage semantics.

### Execute capability

The inspected classes produced an interesting result:

~~~text
StateBackend       execute: missing
FilesystemBackend  execute: missing
StoreBackend       execute: missing
CompositeBackend   execute: present
~~~

This does not prove that shell execution is available through the workshop
backend.

The implementation of `CompositeBackend.execute` must be inspected before
drawing that conclusion.

### Main lesson

~~~text
filesystem tool
      !=
storage implementation
~~~

The same model-visible operation can have different persistence, isolation and
security semantics depending on the configured backend.

## 0.6B — Same Tool, Different Backend

### Objective

Isolate the effect of backend selection while keeping all other relevant
variables constant.

Both experiments used the same:

~~~text
model
prompt
filesystem tool
virtual path
content
~~~

The only changed variable was the backend implementation.

### Common operation

Both agents emitted:

~~~text
write_file(
    file_path="/backend-demo.txt",
    content="same tool, different backend"
)
~~~

and both received:

~~~text
Updated file /backend-demo.txt
~~~

### StateBackend result

With:

~~~text
StateBackend
~~~

the final agent result contained:

~~~text
files
messages
~~~

The virtual file existed at:

~~~text
/backend-demo.txt
~~~

inside graph state.

The corresponding host path:

~~~text
/tmp/deepagents-backend-lab/backend-demo.txt
~~~

did not exist.

Therefore:

~~~text
write_file
   |
   v
StateBackend
   |
   v
LangGraph files state
~~~

### FilesystemBackend result

With:

~~~text
FilesystemBackend(
    root_dir="/tmp/deepagents-backend-lab",
    virtual_mode=True
)
~~~

the final result contained only:

~~~text
messages
~~~

The virtual path:

~~~text
/backend-demo.txt
~~~

resolved to the physical path:

~~~text
/tmp/deepagents-backend-lab/backend-demo.txt
~~~

and the file existed on the host with the expected content.

Therefore:

~~~text
write_file
   |
   v
FilesystemBackend
   |
   v
operating-system filesystem
~~~

### Comparison

All experiment assertions passed:

~~~text
StateBackend stored virtual file in state            PASS
StateBackend content correct                         PASS
FilesystemBackend did not add files state            PASS
FilesystemBackend created physical file              PASS
FilesystemBackend physical content correct           PASS
~~~

This demonstrates:

~~~text
same tool call
+
different backend
=
different storage semantics
~~~

### Graph state versus external side effect

The experiment also reinforces:

~~~text
StateBackend
    -> graph-state mutation

FilesystemBackend
    -> external side effect
~~~

An external filesystem mutation does not require a corresponding `files` field
in the agent graph state.

### Tool abstraction

The model-visible result was effectively identical in both cases:

~~~text
Updated file /backend-demo.txt
~~~

The backend therefore hides the concrete storage implementation behind a stable
filesystem-tool interface.

### Main lesson

~~~text
write_file(path, content)
        !=
a specific storage technology
~~~

The filesystem tool defines an operation. The backend defines its persistence,
location and isolation semantics.

## 0.6B2 — Backend Lifetime Across Fresh Agents and Processes

### Objective

Compare the lifetime of data stored through `StateBackend` and
`FilesystemBackend` after the original Python process and agent instance have
already terminated.

### Existing physical artifact

The previous FilesystemBackend experiment created:

~~~text
/tmp/deepagents-backend-lab/backend-demo.txt
~~~

with:

~~~text
same tool, different backend
~~~

A new Python process confirmed that the host artifact still existed before
creating either new agent.

### Fresh StateBackend

A completely new agent using:

~~~text
StateBackend()
~~~

called:

~~~text
read_file("/backend-demo.txt")
~~~

and received:

~~~text
Error: File '/backend-demo.txt' not found
~~~

The new StateBackend did not automatically inherit the virtual `files` state
created by the earlier graph execution.

### Fresh FilesystemBackend

A completely new agent using:

~~~text
FilesystemBackend(
    root_dir="/tmp/deepagents-backend-lab",
    virtual_mode=True
)
~~~

called the same:

~~~text
read_file("/backend-demo.txt")
~~~

and successfully read:

~~~text
same tool, different backend
~~~

The storage survived both:

~~~text
a new backend object
a new agent instance
a new Python process
~~~

because the source of truth was the external operating-system filesystem.

### Comparison

All assertions passed:

~~~text
Host artifact survived previous Python process             PASS
Fresh StateBackend used read_file                          PASS
Fresh StateBackend could not see prior virtual state       PASS
Fresh FilesystemBackend used read_file                     PASS
Fresh FilesystemBackend saw prior physical file            PASS
~~~

### Scope

This experiment does not imply that StateBackend state can never persist
between invocations.

StateBackend participates in LangGraph state semantics, and persisted graph
state may be resumed when an appropriate checkpoint/thread mechanism is used.

The result established only that a fresh StateBackend does not independently
discover state from an unrelated previous graph execution.

### Main lesson

~~~text
storage location
        +
persistence mechanism
        =
backend lifetime semantics
~~~

StateBackend lifetime follows graph-state persistence.

FilesystemBackend lifetime follows the external filesystem.

## 0.6C — CompositeBackend Routing

### Objective

Validate whether `CompositeBackend` presents a single virtual filesystem
namespace while routing different path prefixes to independent storage
backends.

Two physical FilesystemBackends were used to isolate routing behavior without
introducing LangGraph Store semantics yet.

### Configuration

The experiment used:

~~~text
CompositeBackend
├── default
│   └── FilesystemBackend
│       root: /tmp/deepagents-composite-lab/default
│
└── /memories/
    └── FilesystemBackend
        root: /tmp/deepagents-composite-lab/memories
~~~

### Default routing

Writing:

~~~text
/ordinary.txt
~~~

produced the physical file:

~~~text
/tmp/deepagents-composite-lab/default/ordinary.txt
~~~

### Routed path

Writing:

~~~text
/memories/profile.txt
~~~

produced:

~~~text
/tmp/deepagents-composite-lab/memories/profile.txt
~~~

It did not produce:

~~~text
/tmp/deepagents-composite-lab/default/memories/profile.txt
~~~

or:

~~~text
/tmp/deepagents-composite-lab/memories/memories/profile.txt
~~~

This demonstrates that the route prefix is removed before delegation.

Conceptually:

~~~text
/memories/profile.txt
        |
        | route /memories/
        v
/profile.txt
        |
        v
routed backend
~~~

### Path remapping

Although the routed backend operates on the stripped path:

~~~text
/profile.txt
~~~

the CompositeBackend exposes it again as:

~~~text
/memories/profile.txt
~~~

Results are therefore remapped back into the composite virtual namespace.

### Root listing

Listing:

~~~text
/
~~~

returned:

~~~text
/memories/
/ordinary.txt
~~~

The `/memories/` directory is a logical route exposed by CompositeBackend. It
does not need to physically exist inside the default backend.

### Routed listing

Listing:

~~~text
/memories/
~~~

returned:

~~~text
/memories/profile.txt
~~~

even though the routed backend itself stores the file under its local root as:

~~~text
/profile.txt
~~~

### Cross-backend glob

Running a glob from the composite root returned:

~~~text
/memories/profile.txt
/ordinary.txt
~~~

The files physically lived in separate backend roots.

This demonstrates that some global filesystem operations fan out across
multiple backends and merge results into the virtual namespace.

### Assertions

All routing assertions passed:

~~~text
ordinary file stored in default backend          PASS
ordinary content correct                         PASS
routed file not stored below default root        PASS
route prefix stripped before delegation          PASS
route prefix not duplicated                      PASS
routed content correct                           PASS
~~~

### Main lesson

CompositeBackend behaves conceptually like a virtual mount table:

~~~text
/             -> default backend
/memories/    -> routed backend
~~~

Multiple physical storage implementations can therefore appear to the agent as
one coherent filesystem namespace.

## 0.6D2 — Store Provisioning in create_deep_agent

### Objective

Determine whether `create_deep_agent` automatically provisions a LangGraph
Store or Checkpointer when a backend contains `StoreBackend`.

### create_deep_agent contract

The inspected signature exposes independent optional parameters:

~~~text
checkpointer = None
store        = None
~~~

Its documentation explicitly states that `store` is required when the backend
uses `StoreBackend`.

The function does not implicitly create either dependency.

Instead, it passes both parameters directly to LangChain's `create_agent`:

~~~python
return create_agent(
    ...
    checkpointer=checkpointer,
    store=store,
    ...
)
~~~

### Workshop configuration

The workshop creates:

~~~text
CompositeBackend
└── /memories/ -> StoreBackend()
~~~

but calls `create_deep_agent` without either:

~~~text
store=
checkpointer=
~~~

### Compiled graph

Runtime introspection of the workshop's compiled graph showed:

~~~text
store:        None
checkpointer: None
~~~

The compiled graph therefore has no configured BaseStore and no configured
checkpointer.

### Unused imports

The workshop imports:

~~~text
InMemoryStore
MemorySaver
~~~

but neither is connected to the compiled agent in the inspected assembly.

### Architectural distinction

~~~text
Store
    -> application/cross-thread data
    -> consumed by StoreBackend via get_store()

Checkpointer
    -> graph execution state
    -> thread checkpoints and recovery
~~~

They are independent mechanisms.

A checkpointer does not satisfy StoreBackend's requirement for a BaseStore.

### Current hypothesis

The workshop's `/memories/` route is structurally configured but likely not
operational because:

~~~text
StoreBackend()
     |
     v
get_store()
     |
     v
compiled graph store
     |
     v
None
~~~

This will be validated by an execution experiment before modifying the sample.

## 0.6D3 — StoreBackend Runtime Provisioning

### Objective

Validate how `StoreBackend()` obtains its BaseStore from a LangGraph execution
context and determine the actual lifetime semantics of `InMemoryStore`.

### Graph without a Store

A minimal LangGraph graph was compiled without:

~~~text
store=
~~~

A node called:

~~~python
StoreBackend().write(...)
~~~

The operation failed with:

~~~text
AttributeError:
'NoneType' object has no attribute 'get'
~~~

The expected defensive RuntimeError did not occur.

### Why the error occurred

`StoreBackend._get_store()` attempts to obtain the runtime store using:

~~~text
get_store()
~~~

and handles RuntimeError or KeyError.

In this graph execution, however, `get_store()` returned:

~~~text
None
~~~

rather than raising one of those exceptions.

The returned `None` was then used by `StoreBackend.write()` as if it were a
BaseStore:

~~~text
None.get(...)
~~~

which produced the AttributeError.

For the pinned dependency combination, this demonstrates a defensive edge case:

~~~text
missing runtime store
        |
        v
get_store() -> None
        |
        v
StoreBackend receives None
        |
        v
later AttributeError
~~~

The architectural conclusion is unchanged: StoreBackend requires an actual
BaseStore.

### Graph with InMemoryStore

The same graph was then compiled with:

~~~python
store = InMemoryStore()

graph = builder.compile(store=store)
~~~

The exact same `StoreBackend()` successfully wrote:

~~~text
/profile.txt
~~~

under namespace:

~~~text
("backend-lab",)
~~~

### Stored representation

The resulting BaseStore item contained:

~~~text
namespace: ("backend-lab",)
key:       /profile.txt
~~~

and a value containing:

~~~text
content
encoding
created_at
modified_at
~~~

This confirms that StoreBackend represents filesystem files as BaseStore
namespace/key/value entries.

### Backend lifetime versus Store lifetime

A completely new `StoreBackend` instance given the same InMemoryStore could
read the previously written file.

Therefore:

~~~text
StoreBackend object lifetime
        !=
stored-data lifetime
~~~

The BaseStore instance is the source of truth.

### Fresh InMemoryStore

A new InMemoryStore instance with the same:

~~~text
namespace
key
process
~~~

could not see the previous item.

Therefore:

~~~text
same namespace
+
same key
+
different InMemoryStore
=
different storage
~~~

### Assertions

All storage assertions passed:

~~~text
configured graph has InMemoryStore               PASS
graph wrote expected item                        PASS
stored key correct                               PASS
stored content correct                           PASS
fresh backend with same store can read           PASS
fresh InMemoryStore cannot see old data          PASS
~~~

### Persistence semantics

`StoreBackend` provides BaseStore-backed cross-execution storage semantics, but
the actual durability depends on the concrete BaseStore implementation.

For:

~~~text
StoreBackend + InMemoryStore
~~~

the data lifetime is tied to that in-memory Store instance/process.

This is not equivalent to durable persistence across process restarts.
