# Lab 23 — AG-UI contracts and interoperability

## 2.6A — Pinned AG-UI 1.0 schema discovery (completed)

On MASL baseline `f2b2594d57b4819c93bb833aff2e666d63fe8a72` (2.5 Frontend tools already closed),
`scripts/lab-26a-agui-contracts.py` inspected the official machine-readable
AG-UI 1.0 JSON Schema at upstream commit `2330368a2a74573902858867072406638ba3073d`. The downloaded
schema was checked against Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78`; the result is
**31 event types** across **8 groups**, with a 31-member `Event` union and
verified representative required fields. The schema uses JSON Schema
Draft 2020-12. This is an inventory of structural contracts, not a complete
interpretation of behavioural guarantees.

- Upstream: https://github.com/ag-ui-protocol/ag-ui/tree/2330368a2a74573902858867072406638ba3073d/spec/1.0
- Schema ID: https://ag-ui.com/spec/1.0/schema.json
- MASL pinned LangGraph reference: `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.

### Eight event groups

| Group | Events |
|---|---:|
| `run_and_step` | 5 |
| `text` | 4 |
| `tool` | 5 |
| `state` | 3 |
| `activity` | 2 |
| `reasoning` | 7 |
| `subagent` | 3 |
| `passthrough` | 2 |

### Reproducible evidence (stored outside the repository)

The successful run wrote three files under `/home/delta/masl-evidence/masl-26a-agui-f2b2594`. Their content hashes
are recorded here so the schema/inventory can be verified without re-fetching
or depending on `/tmp`:

| File | SHA-256 |
|---|---|
| `schema-1.0-pinned.json` | `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a` |
| `inventory.json` | `6b0868c699cca6f71294d4069ef1e8981a43921c95de339d3b5cabb47e9ccda8` |
| `inventory.md` | `b9bdcd171754d7dc85f5162b4ee5fbc51da4de70a7bcfdbde2ebb4492d38141b` |

The discovery script installed after the one-line roadmap preflight fix has
SHA-256 `ae8e5ff06d7b5554f432ad0cbb2983483027cc94d4146f690f0c3b61057161c1`. The fix corrected indentation assumptions only;
no runtime code or upstream schema was altered. Discovery mode verified the
upstream schema Git blob, enumerated 31 event discriminators, checked required
fields and kept the historical ten 2.5A Agent Server SSE envelopes distinct.

### Agent Server → AG-UI mapping is not established

The pinned Agent Server yielded `metadata`, `updates`, `values`,
`messages/metadata` and `messages/complete` in the 2.5A observation.
Those are Agent Server SSE event families, **not** AG-UI `type` values:

- `messages/complete` does not prove `TOOL_CALL_END`, `TEXT_MESSAGE_END` or graph END.
- `updates` is not necessarily an RFC 6902 `STATE_DELTA`.
- `values` does not automatically become AG-UI `STATE_SNAPSHOT`.
- ToolCall/ToolMessage persistence does not prove `TOOL_CALL_START`, approval,
  actual external effects, idempotency or exactly-once execution.
- AG-UI tool argument deltas, raw event payloads and tool results must not be
  forwarded through the generic message UI without an explicit display policy.

The crosswalk in `inventory.json` marks direct comparisons as
`not_equivalent` or `candidate_adapter_only`; none is verified equivalent.
The legacy Agent Server REST/SSE transport, domain state and ToolObservationsPanel
were unchanged. No AG-UI runtime/SDK, model calls, new Runs, mutation requests
or adapters were used. Historical 2.5A logs were **not** revalidated in 2.6A.

**2.6A PASSED its scoped evidence gate. Parent 2.6 remains OPEN.**
Next: **2.6B — Typed AG-UI event grammar and validation**, pinned to the
same upstream schema, with negative tests and no automatic protocol translation.

## 2.6B — Typed AG-UI 1.0 envelope grammar (scoped completion)

On baseline `140fdfbb25f14d1305bf51a7c1b990723ed5045f`, an isolated read-only TypeScript checker and a
separate local trace diagnostic suite were reviewed using the pinned official
AG-UI 1.0 Draft 2020-12 schema at upstream commit `2330368a2a74573902858867072406638ba3073d`.
The exact upstream Git blob was `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78` (SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`).

The structural manifest matches all **31/31** discriminator variants, their
required fields, property names and primary field kinds, BaseEvent composition
and subagent attribution. The only initial discovery mismatch was fixed before
this passing run: `SUBAGENT_FINISHED.result` may be omitted, but must not be
`null` if present. The source and reviewer were held untracked until this
review completed; prior 2.6A sources were left untouched.

### Verified gates

- Oxlint: PASS.
- Production TypeScript/Vite build: PASS.
- Grammar test SSR compilation: PASS.
- **184/184** pure envelope/trace assertions: PASS.
- Frozen AG-UI schema SHA-256, Git blob, and exact 31-event field manifest: PASS.
- Tracked worktree unchanged during review. No Runtime, model calls or Agent
  Server adapter were used.

The evidence is retained outside the repository under
`~/masl-evidence/masl-26b-agui-140fdfb` (original WSL location `/home/delta/masl-evidence/masl-26b-agui-140fdfb`).
The original report and four gate logs are independently hash-pinned:

| Evidence | SHA-256 |
|---|---|
| `review.json` | `aab979dbe6e8fa9d8faf6429fe9362b278d912fb3500a6d9e9f4dff31e9a17b7` |
| `review.md` | `ba522e4699bdc09d6d68ffbfd4e723947dac354ab4c7c164cec418ac71a31758` |
| `lint.log` | `e7c1e79ef6e35c90265e7911ae9c1632f94d26030aec838bf410b0c33825df72` |
| `build.log` | `9f64e8dcd78889004af40e765bc214d8f5d378a640a46c3ffdf2de31d9f154e8` |
| `compile.log` | `fc07768201bb61f83c40b584affada58068efd9dd42005808743bf81566d15a9` |
| `pure.log` | `d793e6edd5b05255f7df135ab92a32b953b2a8b29b06b357b0df3531f42e86de` |

Final implementation and test payload SHA-256 values:

| Source | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/event-grammar.ts` | `987b8e64e87d8b551ae80e6d085d4c30a6d781f7f7ae7a08a25c8211e2147ff3` |
| `apps/web/src/ag-ui/event-grammar.spec.ts` | `45fdc034dee8199fb2b2bc3c91d3ee5592d778ce36050a57d522941726ad3450` |
| `scripts/lab-26b-grammar-review.py` | `8c0b449e602e1242c5b415dc761a5dee1ecbdde6cab78928d580a5662397ec08` |

### Boundaries that remain unproven

This is **envelope** validation, not full JSON Schema conformance. Recursive
message and media structures, JSON Patch application, nested outcome variants
and RunAgentInput are not fully validated by the TypeScript checker. The local
single-run sequence diagnostics are *not normative AG-UI ordering rules* and
cannot prove tool execution, external effects, persistence or graph END.
No Agent Server SSE-to-AG-UI translation was created. Existing Agent Server
REST/SSE components and message-redaction policy remained untouched. No claims
are made about production authorization, idempotency, exactly-once execution,
side-effect safety, multi-client coordination or application-wide DLP.

**2.6B PASSED its scoped evidence gate. Parent 2.6 remains OPEN.**
Next: **2.6C — AG-UI streaming and lifecycle contract discovery**, using
pinned source contracts before considering an adapter.

## 2.6C — AG-UI HTTP/SSE and explicit lifecycle (scoped completion)

On MASL baseline `b363c24f2163d3ceebad44004074ad2c790841e9`, the isolated, model-free 2.6C review verified
HTTP POST/SSE framing, JSON `type` discriminators independent of SSE `event:`
fields, explicit RUN_STARTED/RUN_FINISHED/RUN_ERROR control, sequential runs,
late RUN_ERROR, truncated EOF, and basic explicit message/tool/step triads.
Run finish `outcome` values (implicit success, success, interrupt, cancelled)
were **reported but not recursively schema-validated**. Tests also exercised
the existing generic Agent Server SSE parser *solely for byte framing*; this
did not convert it into an AG-UI transport or authorize reuse of Agent Server
semantic event names.

### Pinned specification and verified tests

- Official AG-UI 1.0 schema commit: `2330368a2a74573902858867072406638ba3073d`.
- Schema Git blob: `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78`; SHA-256: `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`.
- Six normative specification files pinned by blob SHA (see table below).
- **60/60** pure HTTP/SSE and lifecycle assertions: PASS.
- Oxlint, TypeScript/Vite production build and SSR test compilation: PASS.
- Exact reviewed HEAD and `origin/main`: `b363c24f2163d3ceebad44004074ad2c790841e9`; pinned LangGraph
  reference: `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.
- No changes to tracked sources during review, no AG-UI adapter, HTTP Runtime,
  model calls, Tool Run POST or external side effects.

Evidence directory (outside Git): `~/masl-evidence/masl-26c-agui-b363c24`
(original WSL location `/home/delta/masl-evidence/masl-26c-agui-b363c24`). Logs and reports are SHA-256 pinned:

| Artifact | SHA-256 |
|---|---|
| `review.json` | `b98e0681037e3067e7a5e516205b47a986bbab8b6bd95f2dd10d2fe5ee601c2c` |
| `review.md` | `d9044aa6073b5ed9e4ee7a4258f1e891a95fc68065dfb93196c8de85e8888cad` |
| `lint.log` | `0221a48fbd2d5313032f7469861ac6b75adcf88631bce94685817e8b9d3ec493` |
| `build.log` | `85877c286dd1b89b81d5bfa40b57def79bc2e30698baa3cbf74953c7043f9e06` |
| `compile.log` | `498b1a0b7b340951ab3dac1d7cac90b9e0a29ca32636a6e7b154bd31a19f8493` |
| `pure.log` | `636665170a1d2e66ab9bc236eebbd47fa529d3382a59a2db2d49e414dcc8eaf9` |

Reviewed 2.6C implementation/test payload hashes:

| Source | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/stream-boundary.ts` | `c9b4dbfc8f4bb44ebca95d5a44a6520d260276239899c614211e68bbc8e34db2` |
| `apps/web/src/ag-ui/stream-boundary.spec.ts` | `080d7398fcddf37bd9542a476d1118d1ede5911a794320a8fc832f67e0c6d2e3` |
| `scripts/lab-26c-stream-review.py` | `a9e437f50e3d3279d45f0633739cb237ab569350588fe65cbda2cd26566acf42` |

Pinned normative prose document Git blobs (same AG-UI upstream commit):

| Source | Git blob |
|---|---|
| `docs/spec/1.0/basic/transports/http-sse.mdx` | `993b465d9e6a849fa3a616eb599c16671fccafcb` |
| `docs/spec/1.0/basic/transports/index.mdx` | `99734a94fe3a570d645d30fb07d4a550a80c217e` |
| `docs/spec/1.0/events/lifecycle.mdx` | `20c1adf5b98da77349c10f5218b1c80be91448e5` |
| `docs/spec/1.0/basic/patterns/streaming.mdx` | `f0c2c4c2a30b473c446cfc3ddd91945dfe171a3d` |
| `docs/spec/1.0/basic/processing.mdx` | `22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47` |
| `docs/spec/1.0/basic/versioning.mdx` | `860f82956864d5fcf29cb7d1e2993e315f03ff59` |

### Explicit limitations and next block

This is **partial contract review**, not a production AG-UI consumer or full
protocol conformance. The 2.6C checker does not expand `*_CHUNK`, implement
subagent streams, validate all nested JSON Schema shapes/outcomes, perform
unknown-field enforcement/stripping, carry out actual HTTP network exchange,
map Agent Server SSE to AG-UI, or establish authorization, tool execution,
state persistence, idempotency, exactly-once or multi-client safety. The
current Agent Server REST/SSE frontend stays unchanged. AG-UI HTTP/SSE does
not use `Last-Event-ID` as a protocol resumption guarantee, and a broken Run
without a terminal event is **truncated**, never synthesized as successful.

**2.6C PASSED the scoped review; parent 2.6 remains OPEN.** Next:
**2.6D — AG-UI chunk expansion and consumer enforcement boundaries**.
