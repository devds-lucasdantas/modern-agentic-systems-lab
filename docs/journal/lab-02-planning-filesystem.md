# Lab 02 — Planning and Filesystem

## 0.4A — Autonomous Planning

### Objective

Observe whether a Deep Agent naturally chooses to use explicit planning and
filesystem tools when given a multi-step task without being instructed which
tools to call.

### Task

The agent was asked to create an architecture package for a URL shortening
service under `/project` containing:

- `requirements.md`
- `architecture.md`
- `summary.md`

It was also asked to verify that the three documents existed and were
internally consistent.

The prompt explicitly prevented:

- subagent delegation;
- shell execution.

It did not instruct the agent to use `write_todos`, `ls`, `read_file`,
`write_file`, `glob`, `grep`, or `edit_file`.

### Result state

The final graph state contained:

~~~text
files
messages
todos
~~~

This differs from the minimal Deep Agent experiment, whose state contained only:

~~~text
files
messages
~~~

The TODO capability therefore became visible in the final state when it was
actually used.

### Natural planning behavior

The agent's first action was to create a TODO list:

~~~text
1. Inspect /project for existing files and conventions
   status: in_progress

2. Create requirements, architecture, and summary documents
   status: pending

3. Review consistency and verify all three files exist
   status: pending
~~~

This was not explicitly requested by the user.

The behavior is consistent with the `write_todos` tool policy inspected in
Deep Agents 0.5.3, which recommends planning for tasks involving three or more
distinct steps.

### Plan evolution

The agent maintained the plan during execution instead of treating it as
static documentation.

Initial state:

~~~text
inspect   in_progress
create    pending
review    pending
~~~

After inspecting `/project`:

~~~text
inspect   completed
create    in_progress
review    pending
~~~

After creating the documents:

~~~text
inspect   completed
create    completed
review    in_progress
~~~

Final state:

~~~text
inspect   completed
create    completed
review    completed
~~~

This demonstrates the pattern:

~~~text
PLAN
 |
 v
ACT
 |
 v
UPDATE PLAN
 |
 v
ACT
 |
 v
UPDATE PLAN
 |
 v
VERIFY
 |
 v
COMPLETE PLAN
~~~

### Filesystem execution

The observed tool sequence was:

~~~text
write_todos
    |
    v
ls /project
    |
    v
write_todos
    |
    v
write_file requirements.md
    |
    v
write_file architecture.md
    |
    v
write_file summary.md
    |
    v
write_todos
    |
    +--> ls /project
    +--> read_file requirements.md
    +--> read_file architecture.md
    +--> read_file summary.md
    |
    v
write_todos
    |
    v
final response
~~~

The agent used multiple tool calls in one model turn during verification.

This demonstrates that:

~~~text
one model decision
    |
    +--> tool call
    +--> tool call
    +--> tool call
    +--> tool call
~~~

is possible.

The experiment does not by itself prove that those calls were executed
concurrently at the runtime level.

### Tool selection

The agent did not use:

~~~text
glob
grep
edit_file
execute
task
~~~

This was appropriate.

`ls` was sufficient to verify the known files existed, and `read_file` was
sufficient to inspect their contents.

No inconsistency was found, so `edit_file` was unnecessary.

This demonstrates an important distinction:

~~~text
capability available
        !=
capability used
~~~

The agent selects tools according to the task and tool instructions.

### StateBackend validation

The final state contained:

~~~text
/project/architecture.md
/project/requirements.md
/project/summary.md
~~~

while the corresponding host paths did not exist.

Therefore the experiment independently reconfirmed:

~~~text
agent filesystem
      |
      v
StateBackend
      |
      v
LangGraph state

not host disk
~~~

### Token usage

Observed aggregate usage:

~~~text
input tokens:       64796
cached input:       56499
output tokens:       1436
raw total tokens:   66232
~~~

Approximately 87% of the input tokens reported during the run were cache reads.

The execution required ten model calls and twelve tool calls:

~~~text
model calls: 10

tool calls:
  write_todos  4
  ls           2
  write_file   3
  read_file    3
~~~

The experiment demonstrates the cost characteristics of agentic execution:

~~~text
more autonomous steps
        |
        v
more model turns
        |
        v
repeated context
        |
        v
higher token usage and latency
~~~

Prompt caching mitigates repeated-prefix processing but does not eliminate the
cost of additional agent turns.

### Reasoning configuration

All observed model calls reported:

~~~text
reasoning tokens: 0
~~~

The task therefore demonstrated planning and multi-step tool orchestration
while using:

~~~text
reasoning_effort=none
~~~

### Conclusion

The autonomous planning experiment succeeded.

Deep Agents naturally selected explicit TODO-based planning for a sufficiently
complex task, maintained the plan as execution progressed, used filesystem
tools selectively, and preserved all files in `StateBackend`.

The next experiment will deliberately exercise filesystem capabilities that
were not naturally required here:

- `glob`
- `grep`
- `edit_file`

## 0.4B — Directed Filesystem Coverage

### Objective

Deliberately exercise filesystem capabilities that were available but not
naturally required by the autonomous planning experiment.

The targeted capabilities were:

- `glob`
- `grep`
- `read_file`
- `edit_file`

The task continued to prohibit:

- subagent delegation;
- shell execution.

### Execution

The observed tool sequence was:

~~~text
 1. write_todos
 2. ls
 3. write_file
 4. write_file
 5. write_file
 6. write_todos
 7. glob
 8. grep
 9. write_todos
10. read_file
11. edit_file
12. read_file
13. grep
14. glob
15. write_todos
~~~

Tool counts:

~~~text
edit_file     1
glob          2
grep          2
ls            1
read_file     2
write_file    3
write_todos   4
~~~

### Path discovery versus content search

The agent used:

~~~text
glob("*.md", path="/workspace")
~~~

to discover Markdown paths and:

~~~text
grep(
    pattern="PLACEHOLDER",
    path="/workspace",
    glob="*.md"
)
~~~

to locate content inside those files.

The results demonstrate distinct responsibilities:

~~~text
glob
  -> path discovery

grep
  -> content discovery
~~~

### Read-before-edit policy

After `grep` identified `/workspace/README.md`, the agent first called:

~~~text
read_file("/workspace/README.md")
~~~

and only then:

~~~text
edit_file(
    file_path="/workspace/README.md",
    old_string="PLACEHOLDER",
    new_string="Mappings are stored durably by short code."
)
~~~

The edit succeeded.

This demonstrates that the model followed the filesystem tool policy requiring
a file to be read before editing.

This experiment does not yet prove whether the runtime itself enforces that
precondition when a model attempts to violate it.

### Post-mutation verification

After editing the file, one model turn requested:

~~~text
read_file README.md
grep PLACEHOLDER
glob *.md
~~~

The resulting observations independently established that:

1. the new README content was present;
2. `PLACEHOLDER` no longer existed;
3. all three required Markdown files still existed.

This demonstrates the pattern:

~~~text
discover
   |
   v
inspect
   |
   v
mutate
   |
   v
verify desired state
   |
   v
verify absence of old state
   |
   v
verify surrounding structure
~~~

### StateBackend

The final graph state contained:

~~~text
/workspace/README.md
/workspace/api.md
/workspace/storage.md
~~~

while none of the corresponding paths existed on the host filesystem.

The experiment therefore reconfirmed the virtual filesystem semantics of
`StateBackend`.

### Token usage

Observed aggregate usage:

~~~text
input tokens:       82020
cached input:       80011
output tokens:        994
raw total tokens:   83014
~~~

Approximately 97.55% of the reported input tokens were cache reads.

The execution used:

~~~text
13 model calls
15 tool calls
~~~

Some model turns emitted multiple tool calls, including:

~~~text
glob + grep
~~~

and:

~~~text
read_file + grep + glob
~~~

This demonstrates batched tool-call generation within one model turn. The
experiment does not by itself establish whether the runtime executed those
calls concurrently.

### Context engineering observation

Filesystem search provides a useful context-reduction strategy:

~~~text
ls
 |
 v
glob / grep
 |
 v
small candidate set
 |
 v
read_file
 |
 v
edit_file if necessary
~~~

Searching before reading can reduce irrelevant content entering the model
context.

### Conclusion

Directed filesystem coverage succeeded.

The experiment validated:

- explicit planning;
- directory inspection;
- file creation;
- path discovery;
- content search;
- read-before-edit behavior;
- exact-string editing;
- post-edit verification;
- virtual filesystem state.

The remaining filesystem question is whether the read-before-edit rule is
merely model guidance or is also enforced at runtime.

## 0.4C — Soft Tool Policy versus Runtime Enforcement

### Question

The `edit_file` tool description states that a file must be read before it is
edited and claims that an edit without a prior read will fail.

The experiment investigated whether this rule is:

1. guidance communicated to the model;
2. a runtime-enforced precondition;
3. both.

### FilesystemMiddleware inspection

The synchronous `edit_file` wrapper:

1. resolves the configured backend;
2. validates the path;
3. directly calls `backend.edit(...)`;
4. returns the backend result.

It does not track whether `read_file` was previously called.

The asynchronous implementation follows the same pattern.

`FilesystemMiddleware.wrap_tool_call` also does not enforce a prior-read rule.
Its responsibility here is interception of large tool results for filesystem
offloading.

### StateBackend inspection

`StateBackend.edit(...)`:

1. reads the current `files` state channel;
2. finds the requested file;
3. fails if the file does not exist;
4. performs the requested exact-string replacement;
5. queues the updated file into LangGraph state.

It does not inspect or maintain any history of user-visible `read_file` tool
calls.

`StateBackend.__init__` also contains no state such as:

~~~text
files_already_read
read_history
files_seen
~~~

### Important distinction

`StateBackend._read_files()` is an internal operation that retrieves the
LangGraph `files` state channel.

It is not equivalent to the agent calling the public `read_file` tool.

Therefore:

~~~text
backend._read_files()
        !=
agent tool call read_file()
~~~

### Finding

For the inspected `deepagents 0.5.3` + `StateBackend` implementation:

~~~text
"read before edit"

tool/model guidance:       YES
runtime enforcement:       NO
~~~

The model followed the guidance naturally in experiment 0.4B, but the
filesystem backend itself does not require evidence of a previous `read_file`
call.

### Security lesson

A behavioral instruction is not equivalent to an enforced policy.

~~~text
tool description / prompt
        |
        v
soft policy

middleware / authorization / runtime gate
        |
        v
hard policy
~~~

Security-sensitive invariants should therefore not rely solely on model
instructions.

This distinction will be revisited when studying permissions, human-in-the-loop
approval, sandboxing and tool authorization.
