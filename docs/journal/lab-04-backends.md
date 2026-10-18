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
