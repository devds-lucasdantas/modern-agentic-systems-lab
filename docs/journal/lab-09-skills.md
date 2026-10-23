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
