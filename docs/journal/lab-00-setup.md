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

Status: complete.

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

## Results — 00C Reference workshop

The official Interrupt 2026 Deep Agents workshop was cloned as an external,
ignored reference.

Reference:

- repository: `langchain-samples/interrupt26-deepagents`;
- branch: `main`;
- commit: `3d3287cf1e51250934c11aff182d90ccfaf0e66d`;
- short commit: `3d3287c`;
- upstream commit date: 2026-05-14;
- local path: `.reference/interrupt26-deepagents`.

The upstream working tree was clean immediately after cloning.

No workshop dependencies had been installed at this checkpoint.

### Initial structural hypothesis

Before reading the implementation, the repository structure suggested:

- `deep_agent.ipynb`: incremental workshop material;
- `agent/agent.py`: standalone agent implementation;
- `langgraph.json`: LangGraph runtime configuration;
- `pyproject.toml`: Python project and dependency definition;
- `uv.lock`: reproducible dependency lock;
- `.env.example`: external configuration requirements;
- `env_utils.py`: environment helpers or validation;
- `utils/models.py`: model-related helpers;
- `agent/AGENTS.md`: agent instructions or persistent context;
- `agent/skills/`: reusable agent skills.

These were hypotheses to be confirmed by source inspection.

## Findings — 00C Project contract

Inspection of the workshop metadata confirmed several initial hypotheses.

### Python project

The workshop requires:

- Python `>=3.11,<3.14`;
- Deep Agents as a direct dependency;
- LangChain as a direct dependency;
- LangGraph CLI with the in-memory runtime;
- OpenAI and Anthropic LangChain integrations;
- Tavily for web search.

The local Python 3.12 environment satisfies the workshop requirement.

### LangGraph registration

`langgraph.json` registers the graph:

~~~text
deep_agent
    |
    v
./agent/agent.py:deep_agent
~~~

This establishes an explicit contract between the LangGraph runtime and a
Python object exported by `agent/agent.py`.

The same configuration tells the runtime to:

- load the current Python project as a dependency;
- load environment configuration from `.env`.

### Notebook versus standalone agent

The repository provides two distinct learning/execution paths:

~~~text
deep_agent.ipynb
    |
    v
incremental learning

agent/agent.py
    |
    v
standalone agent
    |
    v
langgraph.json
    |
    v
LangGraph runtime / Studio
~~~

### External services

The default workshop configuration expects:

- OpenAI as the default model provider;
- Tavily for web search;
- LangSmith optionally for tracing and experiment tracking.

Alternative model providers are prepared through optional dependencies and
configuration.

### Important distinction

A Deep Agent is not itself a language model.

The agent composes model capabilities, tools, state and agent behaviors while
the underlying model provider can be replaced.

## Open questions after project metadata inspection

- How is `deep_agent` constructed inside `agent/agent.py`?
- Where exactly does LangChain appear in that construction?
- Does application code directly use LangGraph primitives, or is LangGraph
  mostly provided underneath Deep Agents?
- How are the main model and subagent model selected?
- How are Tavily tools exposed to the model?
- What is loaded from `AGENTS.md`?
- How are skills discovered and loaded?

## Findings — 00C Standalone agent implementation

Inspection of `env_utils.py`, `utils/models.py`, `agent/agent.py` and
`AGENTS.md` clarified the framework boundaries.

### LangChain

Observed directly through:

- `init_chat_model` for model-provider abstraction;
- `@tool` for exposing the Tavily search function as an agent tool.

### Deep Agents

`create_deep_agent` is the application-level composition point.

The standalone agent supplies:

- a model;
- an application tool;
- a system prompt;
- persistent instructions;
- skills;
- a backend.

Deep Agents supplies the higher-level harness around these components.

### LangGraph

The application does not manually construct a `StateGraph`.

LangGraph acts primarily as the underlying runtime and persistence layer and is
also the runtime contract used by `langgraph.json`.

### Backend routing

A `CompositeBackend` maps normal filesystem paths to a `FilesystemBackend` and
`/memories/*` to a `StoreBackend`.

This provides a unified filesystem-like interface over different persistence
mechanisms.

### Context engineering

The workshop demonstrates two different context-loading strategies:

- `AGENTS.md`: always loaded;
- `SKILL.md`: loaded on demand through progressive disclosure.

### Security note

Filesystem path virtualization is not equivalent to operating-system process
isolation or a security sandbox.

### Additional observation

The standalone agent imports `MemorySaver` and `InMemoryStore`, but the inspected
file does not use them directly.

The standalone agent imports only the main `model`; the separate
`sub_agent_model` is intended for the notebook's explicit subagent example.

## Findings — 00C Lockfile, skills and notebook structure

### Manifest versus lockfile

`pyproject.toml` defines acceptable dependency constraints.

`uv.lock` records a concrete dependency resolution.

For example:

~~~text
pyproject.toml
deepagents >= 0.5.3

uv.lock
deepagents == 0.5.3
~~~

The inspected lockfile includes:

- deepagents 0.5.3;
- langchain 1.2.15;
- langchain-core 1.3.3;
- langgraph 1.1.9;
- langgraph-cli 0.4.24;
- langgraph-sdk 0.3.13;
- tavily 1.1.0.

A package appearing in the lockfile does not necessarily mean that it will be
installed in the default environment or used by the application at runtime.

The lockfile also contains packages associated with optional extras.

### LangChain Protocol observation

The lockfile contains `langchain-protocol 0.0.12`.

At this stage this only establishes that the package participates in the locked
dependency resolution.

We have not yet established:

- whether it is installed in the default environment;
- which dependency requires it;
- whether the workshop application uses it directly.

This will be investigated after environment synchronization.

### Skills and progressive disclosure

The inspected LinkedIn skill contains compact discovery metadata:

- name;
- description.

The remainder of `SKILL.md` contains the detailed instructions.

This structure is consistent with progressive disclosure:

~~~text
skill metadata
      |
      v
capability discovery
      |
      | only when relevant
      v
full SKILL.md instructions
~~~

The exact Deep Agents implementation mechanism has not yet been inspected.

### Notebook learning sequence

The workshop notebook is organized as:

1. Setup;
2. First Deep Agent / harness;
3. Custom tools;
4. Backends;
5. Research subagent;
6. Human-in-the-loop;
7. Long-term memory;
8. AGENTS.md and Skills;
9. Wrap-up and next steps.

This sequence will be used as the basis for the Phase 0 guided laboratory.

## Results — 00D Environment synchronization

The workshop environment was synchronized with:

`uv sync --locked`

The existing lockfile was used without modification.

### Virtual environment

uv created:

`.reference/interrupt26-deepagents/.venv`

The environment uses:

- CPython 3.11.14;
- a uv-managed base Python installation;
- an isolated project virtual environment.

The system Python remains separate.

~~~text
WSL
|
+-- system Python 3.12.3
|
+-- uv-managed CPython 3.11.14
      |
      +-- workshop .venv
~~~

### Locked versus installed dependencies

The lockfile resolution contained 189 packages while the default synchronized
environment installed 175 packages.

This demonstrates an important distinction:

~~~text
locked
!=
installed
!=
imported
!=
used at runtime
~~~

For example, `langchain-aws` exists in the locked dependency graph through the
optional Bedrock extra but was not installed in the default environment.

### Installed framework versions

The synchronized environment contains:

- deepagents 0.5.3;
- langchain 1.2.15;
- langchain-core 1.3.3;
- langchain-protocol 0.0.12;
- langgraph 1.1.9;
- langgraph-cli 0.4.24;
- langgraph-sdk 0.3.13;
- tavily 1.1.0.

### Dependency relationship

The installed/locked graph confirms that Deep Agents depends on LangChain and
that LangChain depends on LangGraph.

~~~text
Deep Agents
    |
    v
LangChain
    |
    v
LangGraph
~~~

This dependency relationship supports the framework layering observed earlier,
while not implying that every runtime call follows a strictly linear path.

### LangChain Protocol

`langchain-protocol 0.0.12` is installed as a transitive dependency of
`langchain-core`.

The workshop application does not explicitly import it in the source inspected
so far.

Its relationship with the broader Agent Protocol concepts will be studied
separately later in the learning path.

### Provider dependencies

`langchain-google-genai` is installed in the default environment and appears in
the Deep Agents dependency tree.

`langchain-aws` is present in the lockfile for the optional Bedrock extra but is
not installed in the default environment.

This corrected the earlier assumption that all non-default provider packages
would only be present when explicitly enabling workshop extras.
