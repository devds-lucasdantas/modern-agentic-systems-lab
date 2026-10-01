# Lab 00 — Environment and repository setup

## Objective

Create a reproducible foundation for the modern agentic systems learning path.

## Initial hypothesis

LangChain, LangGraph and Deep Agents solve different problems in the stack.

We also expect production agentic systems to require explicit protocols between
the agent runtime and external clients or user interfaces.

At this point we intentionally have no agent implementation.

## Current architecture

~~~text
Developer
   |
   v
WSL / Linux
   |
   v
Learning repository

No LangChain
No LangGraph
No Deep Agents
No model
No tools
No agent protocol
No frontend protocol
~~~

## Experiments

### 00A — Learning repository

Status: complete.

### 00B — Environment preflight

Status: not started.

### 00C — Reference workshop

Status: not started.

## Concepts learned

To be completed during the laboratory.

## Open questions

- Where does LangChain end and LangGraph begin?
- What does Deep Agents add on top of them?
- What is the difference between an Agent, Thread and Run?
- What should be standardized by Agent Protocol?
- What should be standardized by AG-UI?

## Results — 00A

The initial learning repository was created successfully.

Initial commit:

- type: root commit;
- message: `docs: initialize modern agentic systems learning lab`.

The commit contains the initial documentation structure:

- README;
- learning roadmap;
- technology radar;
- architecture decision records;
- laboratory journal;
- external reference registry.

## Concepts learned — 00A

### Working tree

The files currently present in the local filesystem.

### Staging area / index

The exact versions of files prepared for the next commit.

`git add` updates the staging area. It does not create a commit.

### Commit

A persistent Git object representing a repository snapshot plus metadata such as:

- tree;
- parent commit, when one exists;
- author;
- committer;
- commit message.

The first commit has no parent and is therefore a root commit.

### HEAD

A reference to the currently checked-out commit through the active branch.

### Working tree clean

At the end of the checkpoint, the working tree matches the snapshot referenced
by HEAD and contains no uncommitted changes.
