# ADR 0001 — Dedicated learning repository

Status: Accepted

## Context

The learning path will use official workshops, sample applications and production
references that evolve independently over time.

Forking a workshop as the main learning repository would mix upstream project
history with our own experiments, architectural notes and pedagogical commits.

## Decision

Use a dedicated learning repository.

External projects remain references rather than becoming the repository itself.
For every important external reference we record, when possible:

- repository URL;
- branch;
- exact studied commit;
- studied date;
- role in the learning path.

Local clones used only for inspection may live under `.reference/`, which is
excluded from the learning repository history.

## Consequences

### Positive

- clean learning history;
- experiments can diverge freely from upstream;
- concepts appear incrementally in Git;
- easier future consultation;
- exact upstream versions can still be reproduced;
- architecture decisions remain ours rather than being hidden inside a fork.

### Negative

- some example code may be reproduced locally;
- upstream references must be tracked deliberately;
- updates to upstream projects do not arrive automatically.
