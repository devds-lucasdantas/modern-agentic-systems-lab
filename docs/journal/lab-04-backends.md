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
