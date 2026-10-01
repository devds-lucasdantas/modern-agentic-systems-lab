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

Status: complete.

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

## Results — 00B Environment preflight

The execution environment was inspected before installing any agent framework.

### Operating system

- Ubuntu 24.04.5 LTS;
- WSL2;
- kernel: `6.18.33.2-microsoft-standard-WSL2`.

### Compute visible inside WSL

- logical CPUs: 24;
- cores reported by Linux: 12;
- threads per core: 2;
- memory: 47 GiB;
- swap: 16 GiB.

### Development tools

- Git: 2.43.0;
- Python: 3.12.3;
- uv: 0.12.19;
- Node.js: 24.15.0;
- pnpm: 10.6.2;
- Docker CLI: 29.8.1.

### Storage

Approximately 607 GiB were available in the WSL filesystem during the preflight.

### Repository state

The learning repository was clean before starting the environment inspection.

## Concepts learned — 00B

### Runtime environment

The agent frameworks execute on top of a normal Python runtime and Linux
environment.

A useful debugging model distinguishes failures between:

1. operating environment;
2. Python runtime;
3. package/dependency resolution;
4. agent framework;
5. model provider;
6. tools and external services.

### Docker CLI versus Docker runtime

The presence of the Docker command only confirms that the client is installed.
It does not by itself prove that a Docker daemon is available or that containers
can be executed successfully.

Docker functionality will be validated later when sandboxing or deployment
requires it.

## Environment conclusion

No blocking environment issue was identified for beginning the Deep Agents
workshop.
