# Lab 09 — Skills and Progressive Disclosure

## Goal

Understand how Deep Agents discovers, advertises, selects, and loads reusable
skills while minimizing permanent model context.

This lab focuses on:

- SkillsMiddleware;
- SKILL.md;
- skill metadata;
- progressive disclosure;
- runtime skill loading;
- source precedence;
- caching;
- supporting files;
- subagent skill scope.

## 0.11A — Static Architecture

### Skills versus instruction memory

AGENTS.md and Skills solve different context-engineering problems.

~~~text
AGENTS.md
    -> full contents always loaded
    -> general identity and workflow
    -> MemoryMiddleware

SKILL.md
    -> metadata advertised first
    -> full instructions loaded only when relevant
    -> SkillsMiddleware
~~~

### Progressive disclosure

SkillsMiddleware loads metadata for available skills and exposes that metadata
to the model through the system prompt.

The complete SKILL.md body is not injected into the initial skill catalog.

Instead, the generated Skills System prompt instructs the model to load the
full skill using:

~~~text
read_file(skill_path, limit=1000)
~~~

when the task matches the skill.

The runtime model is therefore:

~~~text
SKILL.md
    |
    v
metadata discovery
    |
    v
skills_metadata
    |
    v
small model-visible catalog
    |
    v
model recognizes relevant skill
    |
    v
read_file(SKILL.md)
    |
    v
full instructions
~~~

### Skill metadata

A skill exposes metadata including:

~~~text
path
name
description
license
compatibility
metadata
allowed_tools
~~~

The metadata is intended to make skill selection possible without paying the
context cost of the complete instructions.

### Metadata constraints

The pinned implementation documents constraints including:

~~~text
name
    -> 1-64 characters
    -> lowercase alphanumeric and hyphens
    -> no leading/trailing hyphen
    -> no consecutive double hyphen
    -> must match parent directory name

description
    -> 1-1024 characters

compatibility
    -> up to 500 characters

skill file
    -> maximum size 10 MiB
~~~

Exact invalid-skill parsing and error semantics remain to be inspected.

### Skills state

SkillsMiddleware adds:

~~~text
skills_metadata: list[SkillMetadata]
~~~

as private graph state.

It loads metadata only when `skills_metadata` is absent from state.

Therefore the catalog is cached across the lifetime of that state and may also
interact with checkpoint persistence.

### System prompt

SkillsMiddleware adds a Skills System section containing:

~~~text
configured skill locations
available skill names
descriptions
optional annotations
recommended allowed tools
SKILL.md path
instructions for progressive disclosure
~~~

The model is explicitly instructed to use `read_file` to retrieve the complete
skill.

There is no special skill-activation tool in the inspected middleware.

### Source precedence

Skill sources are processed in configured order.

Skills are merged by their metadata `name`:

~~~text
all_skills[skill["name"]] = skill
~~~

Therefore later sources replace earlier skills with the same name.

~~~text
source 1
    skill-x v1

source 2
    skill-x v2

result
    skill-x v2
~~~

This is a real framework-level last-one-wins rule, unlike AGENTS.md source
composition, which merely concatenates instruction text.

### allowed_tools precision

`allowed_tools` is exposed to the model as skill metadata.

The inspected SkillsMiddleware does not itself demonstrate enforcement of those
tools as a capability boundary.

For now it should be treated as advisory skill metadata rather than equivalent
to permission enforcement.

### Context cost

Progressive disclosure provides a context-engineering tradeoff:

~~~text
many installed skills
    -> metadata cost always present

selected skill
    -> full instruction cost only when read
~~~

This allows a larger capability library without injecting every skill body into
every model request.

### Subagents

The main agent receives SkillsMiddleware when top-level `skills=` is configured.

The automatically-created general-purpose subagent is also wired with the
top-level skills.

For custom declarative subagents, the inspected implementation uses the
subagent's explicit `skills` field when constructing SkillsMiddleware.

Runtime inheritance behavior will be validated separately.

### Open questions

The next experiments need to establish:

1. exact private parsing and validation behavior for SKILL.md frontmatter;
2. whether metadata alone can route the model to the appropriate skill;
3. whether the model actually calls read_file for relevant skills;
4. whether irrelevant skills remain unread;
5. duplicate-name last-source-wins behavior at runtime;
6. skill catalog cache behavior after files change;
7. custom subagent skill inheritance and isolation.

## 0.11A2 — Skill Discovery, Parsing, and Validation

### Discovery structure

A skill source is expected to contain immediate child directories:

~~~text
source/
|
+-- skill-a/
|     +-- SKILL.md
|     +-- optional supporting files
|
+-- skill-b/
      +-- SKILL.md
~~~

SkillsMiddleware lists the immediate directories under each configured source.

For every discovered directory it constructs:

~~~text
<skill-directory>/SKILL.md
~~~

and attempts to download that file.

The discovery algorithm does not perform arbitrary recursive skill discovery.

### Progressive disclosure precision

Skill progressive disclosure operates primarily at the model-context level.

During initial discovery, the middleware downloads the complete SKILL.md files
in order to parse their YAML frontmatter.

It then retains only SkillMetadata in graph state.

Therefore:

~~~text
progressive disclosure of LLM context
    -> yes

progressive disclosure of backend file I/O
    -> no
~~~

The complete body is not placed in the model prompt during discovery, even
though it was read internally by the middleware.

When the model later selects a skill, it explicitly calls `read_file` on the
SKILL.md path to bring the full instructions into the conversation.

### Frontmatter

SKILL.md must begin with YAML frontmatter:

~~~markdown
---
name: example-skill
description: What the skill does and when it should be used.
---

# Full instructions
...
~~~

The middleware extracts the leading frontmatter and parses it using
`yaml.safe_load()`.

### Required metadata

At minimum:

~~~text
name
description
~~~

must be present.

Missing required fields cause the skill to be skipped.

### Skip behavior

Skills are also skipped for conditions including:

~~~text
file larger than 10 MiB
missing valid frontmatter
invalid YAML
frontmatter that is not a mapping
missing name
missing description
SKILL.md download failure
missing file content
UTF-8 decode failure
~~~

Malformed individual skills therefore normally disappear from discovery rather
than failing the complete skills library.

### Skill-name validation

The validator checks:

~~~text
maximum 64 characters
lowercase Unicode alphabetic characters
digits
single hyphens
no leading or trailing hyphen
no consecutive double hyphens
name matches parent directory
~~~

The implementation uses Unicode character predicates, so names such as accented
lowercase words can satisfy the character rule.

Importantly, name-validation failures are currently warnings for backwards
compatibility.

A non-compliant skill name can therefore still be loaded.

### Description and compatibility normalization

Descriptions longer than 1024 characters are truncated.

Compatibility strings longer than 500 characters are also truncated.

The skill is not rejected solely because these fields exceed their metadata
limits.

### allowed-tools

The YAML field is:

~~~yaml
allowed-tools: tool-a tool-b
~~~

A string is split into individual tool names.

Commas are tolerated for compatibility.

A non-string value is ignored and produces an empty allowed-tools list.

The inspected SkillsMiddleware exposes this value as model-facing metadata; no
runtime tool enforcement has been demonstrated.

### Arbitrary metadata

The optional:

~~~yaml
metadata:
  key: value
~~~

field must be a mapping.

Keys and values are normalized to strings.

Non-mapping metadata is ignored.

### Discovery lifecycle

~~~text
backend.ls(source)
        |
        v
immediate skill directories
        |
        v
download all candidate SKILL.md files
        |
        v
decode full contents
        |
        v
parse YAML frontmatter
        |
        v
SkillMetadata
        |
        v
skills_metadata private graph state
        |
        v
small model-visible skill catalog
~~~

### Main lesson

Skills optimize model context through progressive disclosure.

They do not avoid reading SKILL.md from backend storage during metadata
discovery.

The main optimization boundary is therefore:

~~~text
LLM context
~~~

rather than:

~~~text
backend file I/O
~~~

## 0.11B — Runtime Progressive Disclosure

### Objective

Validate that skill metadata is sufficient for the model to select a relevant
skill, while the full SKILL.md body is loaded only after explicit runtime
selection.

### Setup

Two skills were installed:

~~~text
/skills/
|
+-- deployment-advisor/
|     +-- SKILL.md
|
+-- poetry-writer/
      +-- SKILL.md
~~~

Their metadata descriptions targeted unrelated domains.

The deployment skill described deployment architecture, staging, production,
and release targets.

The poetry skill described poems, verses, rhyme, and related creative writing.

### Body-only sentinels

Each full skill body contained a value that was deliberately absent from the
frontmatter description.

~~~text
deployment-advisor
    -> DEPLOY_SKILL_SENTINEL_7319

poetry-writer
    -> POETRY_SKILL_SENTINEL_8426
~~~

Therefore the deployment sentinel could not be recovered from the initial
metadata catalog alone.

### Runtime routing

The request was explicitly a deployment architecture task.

The model selected the relevant skill and invoked:

~~~text
read_file(
    "/skills/deployment-advisor/SKILL.md",
    limit=1000
)
~~~

The ToolMessage returned the complete deployment skill instructions, including:

~~~text
DEPLOY_SKILL_SENTINEL_7319
~~~

The model then returned exactly that value.

### Irrelevant skill

The model never called:

~~~text
read_file(
    "/skills/poetry-writer/SKILL.md"
)
~~~

and the poetry sentinel never appeared in the model-visible conversation or
final response.

### Assertions

All assertions passed:

~~~text
at least one skill read occurred                               PASS
deployment skill was read                                      PASS
poetry skill was not read                                      PASS
final answer is deployment body sentinel                       PASS
poetry body sentinel never reached final answer                PASS
~~~

### Precise progressive-disclosure boundary

Static inspection previously established that SkillsMiddleware internally
downloads candidate SKILL.md files while discovering metadata.

Therefore this experiment does not prove that the irrelevant skill file was
never read by the runtime.

It proves the more important model-context property:

~~~text
irrelevant full skill body
    -> not disclosed to the model conversation
~~~

while:

~~~text
relevant full skill body
    -> explicitly loaded through read_file
~~~

### Runtime architecture

~~~text
all skill metadata
        |
        v
model-visible capability catalog
        |
        v
semantic skill selection by model
        |
        v
read_file(relevant SKILL.md)
        |
        v
full selected instructions
        |
        v
task execution
~~~

### Main lesson

Skills implement real progressive disclosure at the LLM-context layer.

The framework exposes a lightweight capability index, and the model loads the
full instructions only for skills it determines are relevant.

## 0.11C — Duplicate Skill Names and Source Precedence

### Objective

Validate the framework-level precedence rule for skills with the same metadata
name across multiple configured skill sources.

### Setup

Two sources contained a skill named:

~~~text
deployment-advisor
~~~

The configured order was:

~~~python
skills=[
    "/skills/base/",
    "/skills/project/",
]
~~~

The files were:

~~~text
/skills/base/deployment-advisor/SKILL.md
    -> BASE_SKILL_SENTINEL_1111

/skills/project/deployment-advisor/SKILL.md
    -> PROJECT_SKILL_SENTINEL_2222
~~~

Both SKILL.md files declared the same metadata name:

~~~text
deployment-advisor
~~~

### Framework merge

Static source inspection had established that SkillsMiddleware processes sources
in order and stores discovered skills using:

~~~text
all_skills[skill["name"]] = skill
~~~

Therefore a later skill with the same name replaces the earlier metadata entry.

Conceptually:

~~~text
base/deployment-advisor
        |
        v
all_skills["deployment-advisor"] = BASE
        |
        v
project/deployment-advisor
        |
        v
all_skills["deployment-advisor"] = PROJECT
~~~

### Runtime result

The model was instructed to use the installed `deployment-advisor` skill.

It called:

~~~text
read_file(
    "/skills/project/deployment-advisor/SKILL.md",
    limit=1000
)
~~~

It did not read:

~~~text
/skills/base/deployment-advisor/SKILL.md
~~~

The selected project skill returned:

~~~text
PROJECT_SKILL_SENTINEL_2222
~~~

and the model returned that value exactly.

### Assertions

All assertions passed:

~~~text
project override skill was read                              PASS
base shadowed skill was not read                             PASS
answer is project sentinel                                   PASS
base sentinel absent from final answer                       PASS
~~~

### Skills versus AGENTS.md layering

The experiments now demonstrate two different layering models.

AGENTS.md:

~~~text
source A
source B
    |
    v
ordered textual composition
    |
    v
both instructions reach the model
~~~

Skills:

~~~text
source A / skill-x
source B / skill-x
    |
    v
merge by skill name
    |
    v
later source replaces earlier source
    |
    v
only winning skill metadata/path is advertised
~~~

### Main lesson

For duplicate skill names, source precedence is a deterministic framework
behavior:

~~~text
later source wins
~~~

This is different from instruction-memory source ordering, where conflicting
AGENTS.md contents are merely concatenated and conflict resolution is left to
the model.

## 0.11D — Checkpointed Skill Catalog Staleness

### Objective

Determine whether skill discovery metadata is refreshed after the underlying
SKILL.md changes inside a checkpointed thread.

The experiment also separates:

~~~text
capability discovery metadata
~~~

from:

~~~text
current capability instructions
~~~

### Initial discovery

The initial SKILL.md contained metadata with:

~~~text
OLD_CATALOG_3141
~~~

SkillsMiddleware discovered exactly one skill:

~~~text
deployment-advisor
~~~

and checkpoint state contained:

~~~text
skills_metadata = [
    {
        name: deployment-advisor,
        description: ... OLD_CATALOG_3141 ...,
        path: /skills/deployment-advisor/SKILL.md,
        ...
    }
]
~~~

The model, using only its advertised Skills System catalog, returned:

~~~text
OLD_CATALOG_3141
~~~

### Updating the skill file

The same checkpointed thread edited the SKILL.md frontmatter description:

~~~text
OLD_CATALOG_3141
    ->
NEW_CATALOG_9265
~~~

The backend file successfully changed.

However, checkpointed `skills_metadata` remained:

~~~text
OLD_CATALOG_3141
~~~

### Same-thread catalog

A later invocation in the same thread was instructed to use only the
advertised Skills System catalog.

It returned:

~~~text
OLD_CATALOG_3141
~~~

The checkpoint also still contained OLD metadata.

Therefore the skill catalog was not automatically rediscovered after the file
edit.

### Same-thread explicit file read

The agent then explicitly called:

~~~text
read_file(
    "/skills/deployment-advisor/SKILL.md"
)
~~~

The tool returned the current file contents containing:

~~~text
NEW_CATALOG_9265
~~~

The model therefore returned NEW.

However, checkpointed `skills_metadata` remained OLD.

Thus:

~~~text
read_file(SKILL.md)
    !=
refresh skills_metadata
~~~

### New thread

A new thread started without cached `skills_metadata`.

SkillsMiddleware performed discovery again and loaded:

~~~text
NEW_CATALOG_9265
~~~

The new thread's catalog-only response also returned NEW.

### Assertions

All assertions passed:

~~~text
initial catalog has exactly one skill                                PASS
initial catalog contains OLD                                         PASS
initial catalog does not contain NEW                                 PASS
initial model catalog answer is OLD                                  PASS
edit_file was used                                                   PASS
backend file contains NEW                                            PASS
backend file no longer contains OLD                                  PASS
same-thread catalog remains OLD after edit                           PASS
same-thread catalog-only model answer is OLD                         PASS
same-thread metadata remains OLD                                     PASS
current SKILL.md was explicitly read                                 PASS
current file tool output contains NEW                                PASS
current-file model answer is NEW                                     PASS
catalog still OLD after reading current file                         PASS
new-thread catalog contains NEW                                      PASS
new-thread catalog-only answer is NEW                                PASS
~~~

### Two independent lifecycles

The experiment establishes two different capability lifecycles:

~~~text
DISCOVERY

SKILL.md
    |
    v
SkillsMiddleware discovery
    |
    v
skills_metadata
    |
    v
checkpointed catalog


EXECUTION

current SKILL.md
    |
    v
read_file
    |
    v
current full instructions
~~~

The discovery catalog can therefore become stale while the current skill
artifact is already updated.

### Operational consequence

Updating the body of an already-known skill can affect an explicit future
`read_file` immediately.

Updating metadata used for skill routing, especially `description`, may not
affect an existing checkpointed thread until the metadata cache is invalidated
or discovery occurs in fresh state.

This matters because semantic skill selection is based on the advertised
catalog.

### Private state persistence

`skills_metadata` is declared using `PrivateStateAttr`, yet the experiment
shows that it survives checkpoint persistence.

Combined with the AGENTS.md experiments:

~~~text
PrivateStateAttr
    !=
ephemeral state
~~~

for the pinned framework version.

### Main lesson

Capability discovery and capability execution have independent lifecycles.

At the same moment a thread can legitimately contain:

~~~text
skills_metadata catalog
    -> OLD

backend SKILL.md
    -> NEW

explicit read_file result
    -> NEW
~~~

### Fixture pitfall — YAML plain scalars

An earlier version of this experiment used:

~~~yaml
description: Deployment architecture skill. Catalog marker: OLD_CATALOG_3141.
~~~

The embedded `: ` sequence made the unquoted YAML scalar invalid.

The parser correctly skipped the skill and produced an empty metadata catalog.

The fixture was corrected to:

~~~yaml
description: "Deployment architecture skill. Catalog marker: OLD_CATALOG_3141."
~~~

This also provided an incidental confirmation that invalid YAML causes an
individual skill to be skipped rather than crashing the entire agent.

## 0.11E — Skill Scope Across Subagents

### Objective

Determine how top-level skill sources interact with:

- custom declarative subagents without `skills`;
- custom declarative subagents with explicit `skills`;
- the automatically-created general-purpose subagent.

The experiment also prevents the parent from leaking the test marker through
the `task` description.

### Test skill

The parent was configured with:

~~~python
skills=["/skills/"]
~~~

The advertised deployment skill description contained:

~~~text
CHILD_CATALOG_5731
~~~

The marker existed only in the Skills System catalog generated from the skill
metadata.

### Custom child without skills

The first custom declarative subagent did not declare a `skills` field.

The parent delegated using:

~~~text
subagent_type = custom-no-skills
~~~

The task description did not contain the marker.

The child returned:

~~~text
NO_SKILLS_ADVERTISED
~~~

Therefore the child did not receive the parent's skill catalog through either
the task arguments or its own automatic SkillsMiddleware.

### Custom child with explicit skills

The second custom declarative subagent declared:

~~~python
skills=["/skills/"]
~~~

Again, the task description did not contain the marker.

The child returned:

~~~text
CHILD_CATALOG_5731
~~~

Therefore its explicitly configured SkillsMiddleware loaded and advertised the
skill metadata in the child's own model context.

### Default general-purpose subagent

The automatically-created `general-purpose` subagent also returned:

~~~text
CHILD_CATALOG_5731
~~~

without receiving the marker through the task arguments.

This confirms the static wiring previously observed: the automatically-created
general-purpose subagent is explicitly constructed using the top-level skill
sources.

### Assertions

All assertions passed:

~~~text
no-skills case delegated correctly                                     PASS
explicit-skills case delegated correctly                               PASS
general-purpose case delegated correctly                               PASS
parent did not leak marker into no-skills task args                    PASS
parent did not leak marker into explicit task args                    PASS
parent did not leak marker into general-purpose task args              PASS
custom child without skills sees no advertised skill                   PASS
custom child without skills does not know marker                       PASS
custom child with explicit skills sees marker                          PASS
general-purpose child sees inherited marker                            PASS
~~~

### Skill scope model

~~~text
top-level skills=
        |
        +--------------------> main agent SkillsMiddleware
        |
        +--------------------> automatic general-purpose
        |
        X
        |
        +----> arbitrary custom declarative subagent


custom declarative subagent
        |
        +-- no skills=
        |      -> no skill catalog
        |
        +-- explicit skills=
               -> own SkillsMiddleware
~~~

### State isolation

The subagent experiments previously established that `skills_metadata` is not
propagated from parent graph state into child state.

Therefore a custom declarative child cannot obtain the parent's skill catalog
merely through state inheritance.

Its skills must be wired into the child's middleware configuration.

### Main lesson

Top-level skills are not a universal inheritance mechanism for every
declarative subagent.

The automatic general-purpose subagent is a special case constructed with the
top-level skill configuration.

Custom declarative subagents require explicit skill configuration when those
capabilities should be available in their own context.
