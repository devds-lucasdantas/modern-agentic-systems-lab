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
