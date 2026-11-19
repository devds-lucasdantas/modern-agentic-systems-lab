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

## 2.6D — Chunk expansion and top-level enforcement (scoped completion)

On exact MASL baseline `aafea9da50c8b062b2f349aeb22489d24aa65575`, the model-free 2.6D review checked the
canonical consumer processing boundary of the pinned official AG-UI 1.0
specification. The isolated `chunk-enforcement.ts` recognizes and expands
`TEXT_MESSAGE_CHUNK`, `TOOL_CALL_CHUNK`, `REASONING_MESSAGE_CHUNK` into explicit
open/content/close event sequences; reviews lane ownership, identifiers and
conflicting repeats; and distinguishes unknown protocol additions from known
malformed fields. It rejects selected verified explicit lifecycle violations
without returning a partial accepted stream. It never imports the module into
the existing Agent Server frontend or creates Runs, tool calls or model traffic.

### Review evidence and provenance

- **123/123** pure checks, lint, production build, and SSR test compilation: PASS.
- Official AG-UI commit: `2330368a2a74573902858867072406638ba3073d`, schema Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78`, schema
  SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`; 31 normative event variants.
- Nine published baseline Git blobs and pinned LangGraph reference `3d3287cf1e51250934c11aff182d90ccfaf0e66d`
  unchanged. Source tree remained clean apart from exactly three untracked 2.6D
  payloads during review.
- Evidence retained outside Git in `~/masl-evidence/masl-26d-agui-aafea9d`
  (WSL path: `/home/delta/masl-evidence/masl-26d-agui-aafea9d`). Report hashes were recorded during the passing run.

| Evidence | SHA-256 |
|---|---|
| `review.json` | `12f3cc43c95bc6e360f4c7a6e3ee0c5aede60978498a6c1af13e8a0f12681f1a` |
| `review.md` | `103e2ade8f4bbcb26aa52bdbbb9c2dd73cd00b2633b76783c1ddd8114047f787` |
| `lint.log` | `0b913046bc397a598d2deed2c53228f38ddffcfc8471518fe2729b75d60b965d` |
| `build.log` | `3be8e935d84ff221d62d64e743a1c751c1dcc4aa30f839eafef7f515428af65c` |
| `compile.log` | `c7e0aefe07a40a8fdfd4096c99767db3396bf45fd1ee438091fa665cfd9f1c03` |
| `pure.log` | `187c916dbd32ca6dc24dbbb2a5c16f11692a47410685eb51b11815b11a318e5f` |

Final source/test/reviewer payload SHA-256 values:

| File | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/chunk-enforcement.ts` | `7e5050c9c4483228e4895fd221f3762be419b7a3ac7c627c6d044c52c75fab67` |
| `apps/web/src/ag-ui/chunk-enforcement.spec.ts` | `d28233167f075b4a68ffc05868655ac3680d034823bb942f8bd88a013f403718` |
| `scripts/lab-26d-chunk-review.py` | `67762c56fab39501035f3ee508de94a089743ed16dfaab7bbb61ed26d2c8e3c8` |

Normative upstream AG-UI 1.0 prose, pinned at the same commit:

| Source | Git blob |
|---|---|
| `docs/spec/1.0/basic/processing.mdx` | `22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47` |
| `docs/spec/1.0/basic/patterns/streaming.mdx` | `f0c2c4c2a30b473c446cfc3ddd91945dfe171a3d` |
| `docs/spec/1.0/events/text-messages.mdx` | `28a917958cf102d5aff63b586a4f82e31696ca9c` |
| `docs/spec/1.0/events/tool-calls.mdx` | `62e550f96bcc7699edf62cbb9bd4fc194c49044e` |
| `docs/spec/1.0/events/reasoning.mdx` | `c43eb098993ee633a1447e2079347efa1e38dfec` |
| `docs/spec/1.0/events/subagents.mdx` | `eafcbcc93d11c7bcc1ea5e5ee16cea3e24056a3a` |
| `docs/spec/1.0/events/lifecycle.mdx` | `20c1adf5b98da77349c10f5218b1c80be91448e5` |

### Boundaries not established

The checker implements **top-level envelope enforcement only**, not full
recursive JSON Schema compliance. It does not completely enforce subagent
lifecycle or attribution, recursively validate `RunAgentInput`, outcomes,
ContentPart/media, or apply RFC 6902 JSON Patch and application state. Its
canonical ordering is scoped: there is no generic middleware, compatibility
or downgrade pipeline. Passing synthetic events do not establish auth,
persistence, real tool execution, side effects, idempotency, exactly-once,
multi-client locks or application-wide DLP. No AG-UI adapter, HTTP exchange,
model call, runtime integration or frontend import was made. The existing
Agent Server REST/SSE implementation remains untouched. There is no
unverified conversion from Agent Server `messages/complete` to AG-UI tool
lifecycle, and truncation is never presented as successful completion.

**2.6D PASSED the scoped evidence gate; parent 2.6 remains OPEN.** Next:
**2.6E — AG-UI nested schemas, state and subagent lifecycle discovery**.

## 2.6E — Nested schemas, state and subagent lifecycle (scoped completion)

On exact published MASL baseline `f8f6a1a5618c4d9155c16b10e4b3294baa9956a9`, the isolated, model-free
2.6E checker reviewed **selected** nested AG-UI 1.0 definitions and
synthetic state/subagent behavior. It neither imported AG-UI into the
Agent Server frontend nor issued an HTTP Run or tool operation.

### Frozen contract and scope

- Official AG-UI 1.0 upstream commit: `2330368a2a74573902858867072406638ba3073d`.
- Pinned `spec/1.0/schema.json`: Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78`;
  SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`; 31 event variants across 8 inventoried families.
- Selected `RunFinishedOutcome`: success, interruption and cancellation,
  with known-invalid forms rejected and unknown future variants handled
  conservatively (never assumed to mean success).
- Selected `SubagentFinishedOutcome`: success and suspension, with
  structural and execution-identifier constraints in reviewed cases.
- Selected `RunAgentInput`: required and optional nested fields and
  malformed combinations. This is not full recursive schema conformance.
- RFC 6902 JSON Patch: `add`, `remove`, `replace`, `move`, `copy`, `test`;
  reviewed path/JSON Pointer and allowed-operation structure.
- `STATE_SNAPSHOT` replaces the complete current synthetic state, rather
  than merging a partial object. `STATE_DELTA` applies a patch to state.
- Subagent announcements, nesting, invocation identity, suspension,
  termination and selected sequence relations. Subagents share the Run
  state; private, independently isolated state was **not** established.

### JSON Patch failure atomicity and negative cases

The in-memory patch helper distinguishes malformed patch structure,
well-formed operations whose application fails, and fully applied patches.
If an operation fails, the preceding complete state must remain intact;
the checker must not expose partially mutated state. A later complete
snapshot can recover after a rejected delta. These are synthetic, local
state semantics, **not** a durability or multi-client transaction proof.

Negative coverage includes malformed nested outcomes/inputs, invalid
JSON Pointer paths or patch operation shapes, failed `test`/application,
state-transition errors and selected subagent identity/sequence errors.
Unknown outcome variants are not silently coerced to success.

### Reviewed implementation and evidence

- **130/130** model-free pure assertions: PASS.
- Four gates: Oxlint, TypeScript/Vite production build, SSR test compile,
  pure test execution: PASS. Evidence was produced in WSL and is checked
  here through the WSL-reproduced artifacts, not a new execution.
- Nine published baseline Git blobs, three exact new source hashes and
  pinned workshop commit were checked by the rerun 2.6E reviewer.
- This closeout uses the **2026-11-15 18:50:57 UTC rerun**, because the
  first 2.6E audit artifacts reported in the handoff were unavailable.
  The historical files/hashes were **not reverified** or overwritten.
- Reproduced evidence directory (outside Git):
  `~/masl-evidence/masl-26e-agui-f8f6a1a-rerun-20261115T185057Z`.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `681173f8180db33a98b5bb4f504df33899ecf5f4b8da829489a5ed7036ca2f5e` |
| `review.md` | `44196cb2f4d5566bcc665ff4a7879954648c3265742eb2b608656743fa558442` |
| `lint.log` | `32c9899abf50f2507105b1d9bb9c5343b9229e0c43995073bee5a99a55ccde1e` |
| `build.log` | `3be8e935d84ff221d62d64e743a1c751c1dcc4aa30f839eafef7f515428af65c` |
| `compile.log` | `3f9f40ec86b59952ccb900508c0d5ea96ffa97c5f53169cb19be27431b846ef2` |
| `pure.log` | `1d6906671ac3279f1687d0c3a3c5b92e0f94102efefead5280fe956ca91afea1` |

| 2.6E source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/nested-state.ts` | `e449efcfceddd3eb698947343e6f93cd5660d66c27b6e246000787e809f3f6be` |
| `apps/web/src/ag-ui/nested-state.spec.ts` | `2217f8defa0311c32bb6c2ba3bd830401ced2b3d53c4b6a293dbbc6f558c4562` |
| `scripts/lab-26e-nested-review.py` | `cd5a89bd93ecc964ce295f9d931ad38c4c14bfe91f50b6bd355b5be37b2c83de` |

Seven previously source-verified AG-UI 1.0 normative prose pins:

| Pinned upstream source | Git blob |
|---|---|
| `docs/spec/1.0/basic/processing.mdx` | `22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47` |
| `docs/spec/1.0/basic/patterns/streaming.mdx` | `f0c2c4c2a30b473c446cfc3ddd91945dfe171a3d` |
| `docs/spec/1.0/events/text-messages.mdx` | `28a917958cf102d5aff63b586a4f82e31696ca9c` |
| `docs/spec/1.0/events/tool-calls.mdx` | `62e550f96bcc7699edf62cbb9bd4fc194c49044e` |
| `docs/spec/1.0/events/reasoning.mdx` | `c43eb098993ee633a1447e2079347efa1e38dfec` |
| `docs/spec/1.0/events/subagents.mdx` | `eafcbcc93d11c7bcc1ea5e5ee16cea3e24056a3a` |
| `docs/spec/1.0/events/lifecycle.mdx` | `20c1adf5b98da77349c10f5218b1c80be91448e5` |

### Limits and next boundary

This is **scoped** nested/state/subagent review, not full AG-UI 1.0
conformance. Full `ContentPart`/multimodal/media recursion, all ownership
rules, all outcome variants, persistence, authorization, distributed
transactions, multi-client isolation, exactly-once/idempotency, tool
execution, external effects, and generic middleware/downgrade behavior
were not verified. No Agent Server AG-UI adapter or operational transport
was implemented. The existing REST/SSE frontend remains unchanged.

**2.6E PASSED the scoped evidence gate; parent 2.6 AG-UI remains OPEN.**
Next proposed review: **2.6F — ContentPart/media and ownership boundary**
discovery, with negative/extension tests before any transport adapter.

## 2.6F — ContentPart/media and ownership boundary discovery (scoped completion)

At published MASL baseline `0f2c3456beab1c99933b6ff7b1b417b449fa022c`, the isolated 2.6F pure review
checked selected structures from official AG-UI 1.0, without integrating
the existing Agent Server REST/SSE frontend or executing a Run, model or
real tool. The lab is a **scoped synthetic contract review**, not a full
validator, media parser, consumer, adapter, or production security control.

### Frozen specification and inspected contracts

- Upstream AG-UI commit: `2330368a2a74573902858867072406638ba3073d`.
- `spec/1.0/schema.json`: Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78`, SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`.
- Pinned unions: five `ContentPart` variants (`text`, `image`, `audio`,
  `video`, `document`) and three `PartSource` variants (`data`, `url`, `file`);
  still 31 event variants in the broader 1.0 union.
- Selected content checks cover known required/optional fields, closed
  object properties, malformed known types, and future unknown part
  members: unrecognized parts may be dropped while known malformed
  parts are fatal, without returning partially accepted content.
- `data` needs `mimeType`; the JSON Schema `contentEncoding=base64` is
  **an annotation**, not proof that bytes were decoded or valid base64.
- `file` source values are **opaque provider handles**, not general URLs;
  the reviewer never attempts to parse, resolve, fetch, or log media.
- A text-only projection concatenates `text` parts in order; dropping
  media/content is lossy and signaled, and media-only becomes empty text
  with a warning. This is not a confidentiality/DLP projection.
- Selected ownership checks cover text/reasoning message continuation,
  tool args and results, activities, steps, parent/child attribution,
  and interleaving. Missing attribution on a continuation is not an
  owner conflict; explicit contradictory tags are rejected.
- A tool call inherits its containing assistant message attribution;
  run-scoped events do not define a subagent owner. Unknown tags on
  run-scoped closed events are warned/stripped at enforcement, not
  automatically treated as fatal ownership violations.
- `STATE_SNAPSHOT` and `STATE_DELTA` attribution means provenance:
  the state remains shared across the Run, not privately per subagent.

### Known ambiguity and negative coverage

- **Unrecognized `PartSource.type` remains explicitly unresolved**:
  pinned `basic/processing.mdx` describes dropping a required nested
  unrecognized member with its containing part, while pinned
  `basic/run-input.mdx` treats `PartSource` as a closed set whose unknown
  arm fails validation. The lab reports `unresolved-source` rather
  than silently deciding that conflict or claiming conformance.
- Negative cases include malformed media parts, unknown future parts,
  source/provider shapes, cross-owner continuations and tool results
  (including after a tool end), and invalid later parts that prevent
  exposure of partially validated earlier content.
- This lab does not prove URL safety, media capability negotiation,
  generic middleware/downgrade semantics or real execution lifecycle.

### WSL audit evidence (original 2.6F run, not a replay)

- **123/123** model-free pure assertions passed.
- Four gates PASS: Oxlint, Vite/TypeScript production build, SSR test
  compilation and pure Node execution.
- The 2.6F reviewer verified the 2.6E published baseline, nine Git
  blobs, the pinned workshop and all three isolated 2.6F sources.
- Audit directory outside Git: `~/masl-evidence/masl-26f-agui-0f2c345-20261115T192348Z`.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `10264f82579cab3aa113fb27c13cb42ca0dd23f6b003c2cb8e34fcc9ac1050f7` |
| `review.md` | `0db3b5e11171d88068f332f25c8b0427027add34919097375343c2b992b151de` |
| `lint.log` | `fdcaf31267779ec9d19d8d20bfc976fcdbc86fe385441e8d6398fe81929124f7` |
| `build.log` | `30c5850a3308fa8cd4e650960ed90118df5f9a7340698e8e28655fdd24dec226` |
| `compile.log` | `fbc765edc63eb5627f585744866b30ff82bcfe9031dce08c5946f84c330c007e` |
| `pure.log` | `b2e6ad9005e34fc13157fdf8b0893a9440d4a0e058647064df22d968c36d30e7` |

| 2.6F source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/content-ownership.ts` | `06da18a4b8fc8ec8617e15d0a904e2abb9babe5f85eefc576e9b3541bf54ede0` |
| `apps/web/src/ag-ui/content-ownership.spec.ts` | `05aa7c59d8cae1ad179b3190ff17bf6e1af6ba2d9ef77325c480f5308fd711a6` |
| `scripts/lab-26f-content-review.py` | `49f490e3e313eeb5cf04df8e3e38b8bdb07c1c9c2423a51db6bba260b1d12dc3` |

Pinned upstream normative documents (Git blobs):

| Document | Git blob |
|---|---|
| `docs/spec/1.0/basic/processing.mdx` | `22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47` |
| `docs/spec/1.0/basic/run-input.mdx` | `96dabc92854f8bffa423450edff54f83585c4cbf` |
| `docs/spec/1.0/events/subagents.mdx` | `eafcbcc93d11c7bcc1ea5e5ee16cea3e24056a3a` |
| `docs/spec/1.0/events/tool-calls.mdx` | `62e550f96bcc7699edf62cbb9bd4fc194c49044e` |

### Explicit limits and next review

Not proven: full recursive AG-UI conformance, safe media processing,
authorization, DLP, persistence, client isolation, exactly-once,
real model/tool interactions, operational transport, end-to-end
middleware or Agent Server → AG-UI translation. The existing Agent Server
frontend and workshop reference were not changed.

**2.6F PASS in its selected scope; parent 2.6 AG-UI remains OPEN.**
Next proposed scoped block: **2.6G AG-UI compatibility, processing and remaining conformance-gap review** — review the remaining
processing/versioning/middleware boundaries and unresolved policies
before considering a transport adapter or milestone closure.

## 2.6G — Compatibility, processing and remaining conformance-gap review (scoped completion)

On published baseline `ff14c7e9f254a92c92ac6b1b6cf956732d2ebb4b`, the 2.6G isolated pure test suite
reviewed selected processing order, protocol version classification,
forward extensions and user/tool text-only downgrade examples against
the frozen AG-UI 1.0 schema and prose. **This is not a deployed pipeline**
or an AG-UI/Agent Server adapter.

### Frozen contracts and limited demonstrations

- AG-UI upstream commit: `2330368a2a74573902858867072406638ba3073d`.
- Pinned 1.0 schema SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`; Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78`;
  31 event variants, five `ContentPart` variants, three `PartSource` variants.
- Versions are compared numerically as `MAJOR.MINOR` in selected cases,
  including newer minor, absent legacy declaration, unknown declaration,
  and an explicitly **noncommittal** unsupported-major policy.
- Synthetic trace demonstrates: compatibility -> middleware ->
  enforcement -> expansion -> verification -> application.
  The middleware is an observer, and expansion/verification are traces:
  there is no generic end-to-end executable pipeline.
- `LAB_ONLY_RETIRED_CUSTOM` is a **fictional lab fixture**, not an actual
  retired AG-UI event. Its transformation shows precedence, not a real
  deprecation registry or compatibility binding.
- Unknown events/properties are dropped/stripped as selected examples;
  malformed known fields are fatal with no partially accepted output.
- Text-only downgrade of selected user/tool message parts is lossy
  when media or unknown parts are omitted, and carries warnings.
  The demonstration preserves IDs/order; it is not a generic shim.
- Unrecognized `PartSource` remains an explicit **unresolved-source**
  policy conflict between pinned `processing.mdx` and `run-input.mdx`.

### Open conformance gaps (source inventory, not implemented)

| ID | Outstanding gap |
|---|---|
| G1 | Unknown `PartSource` tension: processing vs run-input |
| G2 | Actual retired-shape registry and real compatibility middleware |
| G3 | Complete recursive AG-UI 1.0 schema/event conformance |
| G4 | Multiple transport bindings and protobuf presence semantics |
| G5 | End-to-end middleware/enforcement/chunk expansion/verification |
| G6 | Complete peer version negotiation and capability-based downgrade |
| G7 | Media decoding, URL safety, provider handles and DLP |
| G8 | Authorization, persistence, CAS, idempotency, multi-client isolation |
| G9 | Agent Server REST/SSE to AG-UI adapter and frontend integration |

### Original 2.6G WSL audit and source provenance

- **124/124** model-free pure assertions PASS, four gates PASS:
  lint, production build, SSR compile and pure Node execution.
- Original audit directory outside the repo:
  `~/masl-evidence/masl-26g-agui-ff14c7e-20261115T195427Z`.
- The finalizer verifies the exact six evidence hashes, their internal
  review.json report, nine published Git blobs, exact three payloads,
  pinned workshop and the official AG-UI schema.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `faba30e45856bbb10cbd05ec10f79b151d4e346e5cf1a8e910663a5927892d0f` |
| `review.md` | `72a3ad3ee84f33feff7ea49ade547d1618043891cdc7316a6205f6cca5771235` |
| `lint.log` | `adb2d5a2661ddb3e3dc4dfe96a5f2ab7cbb68092ec570333cecf627a7e09bf7d` |
| `build.log` | `a8c2fe771dfaa78af40f7dcb774792b6be118792ca5eb816f2674e8e6aa8fbaa` |
| `compile.log` | `db75d63ab9a61040d4780063fc96362e05050c1639c83444327783bb690268cd` |
| `pure.log` | `2dbff456d3a68496d64af814b40145b540ac5b1b61c9ee10c1a2cf08f7fc420b` |

| 2.6G source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/compatibility-review.ts` | `ab5b59b04f35b83027b2a0da0b448276eb551916ccd40bb26e40ced8fd4ec09a` |
| `apps/web/src/ag-ui/compatibility-review.spec.ts` | `ffbf640b32123cd4e128c1c783ddfb6175014b9528ffabcb49100b5590153c03` |
| `scripts/lab-26g-compat-review.py` | `3714482154388ce7afd2c843864a9a8b0865a18f6b636ec06be8cd835dabced0` |

Pinned upstream normative prose Git blobs:

| Document | Git blob |
|---|---|
| `docs/spec/1.0/basic/processing.mdx` | `22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47` |
| `docs/spec/1.0/basic/versioning.mdx` | `860f82956864d5fcf29cb7d1e2993e315f03ff59` |
| `docs/spec/1.0/basic/run-input.mdx` | `96dabc92854f8bffa423450edff54f83585c4cbf` |
| `docs/spec/1.0/events/subagents.mdx` | `eafcbcc93d11c7bcc1ea5e5ee16cea3e24056a3a` |

### Limits and next review

No complete AG-UI conformance, production middleware, actual retired
shape translation, transport binding, provider media access, DLP,
authorization, persistence, concurrency controls, model/tool calls or
Agent Server adapter was built or verified in 2.6G. The pinned workshop
and existing REST/SSE frontend remain unchanged.

**2.6G PASS in its selected scope; parent 2.6 AG-UI remains OPEN.**
Next proposed sub-block: **2.6H AG-UI normative gap decisions and adapter-readiness review** — resolve normative
decision gates and plan evidence for G1-G9, not integrate by default.

## 2.6H — Normative gap decisions and adapter-readiness review (scoped completion)

On published 2.6G baseline `caf79c88ddb1d04e3814a74e22d1f2ad9d060e9a`, this model-free lab verified
a strictly bounded, deterministic **decision/evidence register** for
G1–G9. It did not validate external artifacts, resolve the gaps,
implement an AG-UI adapter or authorize deployment.

### Frozen reference and explicit decisions

- AG-UI 1.0 upstream commit: `2330368a2a74573902858867072406638ba3073d`.
- Official schema SHA-256: `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`; Git blob: `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78`.
- **G1**: escalate unknown `PartSource.type` normative conflict to AG-UI
  maintainers; `processing.mdx` and `run-input.mdx` differ. No local
  authoritative decision or conforming source parser is asserted.
- **G4**: any *future* transport experiment may scope to JSON/SSE;
  that is not a claim of an implemented JSON/SSE adapter, protobuf
  compatibility, presence fidelity or transport equivalence.
- **G2/G3/G5/G6**: defer until independently executed conformance,
  middleware ordering, version handling and downgrade evidence exists.
- **G7/G8**: require independent security and state/concurrency evidence.
- **G9**: require a separate adapter ADR, mapping matrix and independent
  end-to-end gates; no Agent Server integration exists in this lab.
- Every record defines an owner *role*, acceptance criteria, upstream
  reference paths and dependency IDs. No reviewer, approval or remediation
  is claimed to have been assigned or completed by those role names.

### Gap-by-gap dispositions (all remain OPEN)

| Gap | 2.6H decision | Evidence or gate still required |
|---|---|---|
| G1 | Escalate normative conflict | Authoritative written ruling; paired extension/malformed tests |
| G2 | Defer | Real registry and executable retirement translation tests |
| G3 | Defer | Standards-aware recursive validator over all 31 events and nested definitions |
| G4 | Scope future work to JSON/SSE only | Later differential proof for protobuf or multiple bindings |
| G5 | Defer | Executable compatibility/middleware/enforcement/expansion/verification pipeline |
| G6 | Defer | Peer negotiation, downgrade warning and invariant end-to-end tests |
| G7 | Independent security review | Safe media/URL/provider-handle/DLP security evidence |
| G8 | Independent security review | Auth, durability, retries/CAS, concurrent mutation and isolation evidence |
| G9 | Separate adapter design | Approved mapping ADR plus tool/stream/auth/integration e2e gates |

### Evidence and confidence boundary

- **198/198 pure model-free assertions PASS**, all four WSL gates PASS
  (lint, production build, SSR compile, pure execution).
- Seven pinned critical cases prove that a declared SHA-256 or a
  syntactically valid evidence claim is **metadata, not independent proof**.
- The review asserts `planning_only=true`, `production_ready=false`,
  `adapter_implemented=false`, and `parent_2_6_open=true`.
- No code in 2.6H reads externally claimed evidence bytes, validates a
  real middleware, invokes Agent Server, or resolves G1–G9.
- Original WSL evidence directory: `~/masl-evidence/masl-26h-agui-caf79c8-20261115T201857Z`.
- Its six artifacts and their SHA-256 digests are pinned below.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `5be91a9fce038e16bbb4a8e65cb3a5ed032da13d354fb6336525634d4b0d1e3f` |
| `review.md` | `5efef58b1d86dadaa143261a41c62ea0ca3748bde5a76a6afb3b10ac59ae3b7f` |
| `lint.log` | `4cdfb1da09cfedf00306f8a52cfc70b011c16b3b4094bd235538801e86e31bd0` |
| `build.log` | `112dc953682081c398e1b2fc33ad9ff6a918e99b900924a911004ca39b465dba` |
| `compile.log` | `2adb283450ab454760542f27c9a6faa48cea4d3a6cb225f7e5d13048fa59b49a` |
| `pure.log` | `a8ba5a998a8c638e07244c265eda2ea5e16a198b502f6d3a24363dc10a55c58e` |

| 2.6H source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/gap-readiness.ts` | `c860b7d8616bd542bc0f4d27eaba82532b16cc7881c75169fc08109043a59da6` |
| `apps/web/src/ag-ui/gap-readiness.spec.ts` | `7e3a7734827b72db4288eece48229e0f3eed672615bee001ab2fbf56e90ef1e8` |
| `scripts/lab-26h-readiness-review.py` | `2cbde26a221137ea3ecd452065a1cd68c6ae7cc50cf122a93d6396b85753c04d` |

Previously source-reviewed AG-UI 1.0 normative prose pins:

| Upstream document | Git blob |
|---|---|
| `docs/spec/1.0/basic/processing.mdx` | `22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47` |
| `docs/spec/1.0/basic/versioning.mdx` | `860f82956864d5fcf29cb7d1e2993e315f03ff59` |
| `docs/spec/1.0/basic/run-input.mdx` | `96dabc92854f8bffa423450edff54f83585c4cbf` |
| `docs/spec/1.0/basic/transports/http-sse.mdx` | `993b465d9e6a849fa3a616eb599c16671fccafcb` |

### Limits and next evidence milestone

2.6H is a *decision-register review*, not an actual protocol conformance
suite, security attestation, recursive validator, execution pipeline,
transport adapter, production authorization, or evidence of gap closure.
The existing Agent Server REST/SSE frontend and pinned workshop were
not changed. The independent evidence demands above remain unmet.

**2.6H scoped PASS; G1–G9 OPEN, adapter BLOCKED, parent 2.6 OPEN.**
Next proposed review: **2.6I AG-UI independent conformance evidence and adapter decision gates** — independently verify the first
executable contracts and explicit adapter decision gates before any
production or milestone-closeout claim.

## 2.6I — Independent strict schema oracle and adapter decision gates (scoped completion)

On published baseline `6d31049241736aad0724872511e053e9161f50ac`, 2.6I executed **40 selected fixtures**
against the exact official AG-UI 1.0 Draft 2020-12 JSON Schema with an
independent Python `jsonschema==4.25.1` validation engine. All **40/40**
strict-schema decisions matched the fixture expectations. This is
**selected executable schema evidence**, not complete AG-UI 1.0 protocol
or compatibility conformance, and no standard was amended.

### Frozen inputs and scope

- MASL baseline `6d31049241736aad0724872511e053e9161f50ac`; pinned workshop `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.
- Official AG-UI upstream `2330368a2a74573902858867072406638ba3073d`; schema SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`
  and Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78`.
- `python-jsonschema` 4.25.1 ran in a separate process using a wrapper
  in an isolated external virtual environment. The runner pin remains
  unmodified; the wrapper avoids `Path.resolve()` escaping its virtualenv.
- The 40 fixture objects were exported from the TypeScript test bundle
  and independently evaluated against actual frozen schema bytes.
- This verifies **raw strict JSON Schema acceptance/rejection only**.
  In particular, a future `PartSource.type` rejected by the schema does
  not settle G1: `processing.mdx` and `run-input.mdx` retain incompatible
  compatibility guidance; no normative ruling was obtained.
- The `contentEncoding: base64` schema annotation does not prove byte
  decoding, URL safety, media rendering or provider-handle validity.
- The suite does **not** cover all 31 event branches or all 98 `$defs`,
  nor operational middleware, replay, reconnect, protobuf or security.

### WSL audit: physical evidence and scope boundaries

- Original audit directory outside Git:
  `~/masl-evidence/masl-26i-agui-6d31049-20261115T205152Z`.
- **175/175** TypeScript pure assertions PASS and all four local web
  gates PASS: lint, production build, SSR compile, pure execution.
- Independent Python Draft 2020-12 schema oracle: **40/40** fixtures PASS.
- The eight artifacts below were produced by the original WSL run;
  this finalizer rehashes them, inspects the report and fixtures, and
  does **not** rerun the oracle or a production runtime.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `7be12f4e643cbaee2401c57c57fd19040842bd2f9e142dfde79a8d855b07e9e4` |
| `review.md` | `7d68d578662a16c07f1ee69c7afc70a46662232b34ef0e3c277e8484ef7e5ffe` |
| `lint.log` | `87e14ae1c508b68d2d6254e8cd66d58dfec3ac02e969cb459965a3b6ca5cc8fb` |
| `build.log` | `1a9b228922f028b2f191f54cb40d42ef5232c4f1cb1b2466f169af2818a42bd2` |
| `compile.log` | `2b99213b7faee2de97d70542a153f88f41395e3f34ffd1099b0bf1af1a5832f3` |
| `pure.log` | `a9d4ce3a483ece3070d5e5539a575f5257420b345bcd01a4e0180a641b5bf7c8` |
| `schema-oracle.log` | `90b48138770af307e63ca60769d54d39a2858e985192a9483b93b758befc9802` |
| `fixtures.json` | `95ec6129e2c290d0779bd6d6c5cc27d92b3efc689bac35082ebff9fd3a74292d` |

| 2.6I source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/independent-evidence.ts` | `9156483fc7dff287a80bc82155f3d49250f2ac6484cca983287c90beeb482d26` |
| `apps/web/src/ag-ui/independent-evidence.spec.ts` | `bd7c518d0f9213bbfa330a24e3910ae95a8ea2a85bd56cd2cbc3d4379c6a59c5` |
| `scripts/lab-26i-independent-review.py` | `89e2004f00feb96bdc0b45896a7321b8273f802b9315b54399c22acd6aa34b3a` |

Source-reviewed official AG-UI 1.0 prose pins:

| Upstream document | Git blob |
|---|---|
| `docs/spec/1.0/basic/processing.mdx` | `22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47` |
| `docs/spec/1.0/basic/run-input.mdx` | `96dabc92854f8bffa423450edff54f83585c4cbf` |
| `docs/spec/1.0/basic/versioning.mdx` | `860f82956864d5fcf29cb7d1e2993e315f03ff59` |
| `docs/spec/1.0/basic/transports/http-sse.mdx` | `993b465d9e6a849fa3a616eb599c16671fccafcb` |

### Gap disposition and next gate

| Area | 2.6I result | Remaining requirement |
|---|---|---|
| G1 | Strict schema examples only | Upstream authoritative `PartSource` ruling |
| G3 | Selected 40 fixtures independently verified | Complete recursive 31-event / 98-definition coverage |
| G5 | No pipeline executable | Integration-grade ordered middleware/enforcement/expansion/verification tests |
| G9 | Adapter not implemented, not ready | Separate mapping ADR and independently gated Agent Server E2E |
| G7/G8 | Not independently reviewed | Security/media and durable/concurrent state review |
| Other G2/G4/G6 | Unchanged OPEN | Registry, transport equivalence and versioning/downgrade evidence |

G1–G9 remain **OPEN**; the Agent Server → AG-UI adapter remains
**BLOCKED**, and parent milestone **2.6 AG-UI remains OPEN**. The
existing Agent Server REST/SSE frontend and pinned workshop reference
were unchanged. No network run, model, tool, transport bridge,
independent security assessment or deployment was performed.

**2.6I selected oracle PASS; G1–G9 OPEN, adapter BLOCKED, parent 2.6 OPEN.**
Next proposed sub-block: **2.6J AG-UI executable pipeline and transport boundary evidence** — develop scoped executable
pipeline/transport evidence with negative cases, not an operational
adapter or milestone closure by assertion.

## 2.6J — Executable pipeline and JSON/SSE transport boundary (scoped completion)

On published 2.6I baseline `46cc13b7bf4a76203e3a670297ade6b032a50240`, the selected model-free test composed
JSON/SSE UTF-8 byte framing with the existing 2.6D envelope enforcement and
chunk expansion plus 2.6C lifecycle review. **121/121** pure assertions and
four WSL gates passed (lint, production build, SSR compilation, pure execution).
This is a local pure pipeline, **not** an HTTP transport, Agent Server adapter,
recursive AG-UI conformance validator or operational frontend connection.

### Executable scope and negative evidence

- Selected HTTP POST/JSON + SSE response header checks use synthetic metadata,
  with **no real HTTP request**, authorization, networking or resumption.
- Input arrives as UTF-8 byte chunks; JSON/SSE framing covers fragmentation,
  multi-`data:` lines, CRLF, comments, ignored SSE event/id/retry fields,
  bounded sizes and event counts, and deliberately rejects truncated frames.
- Compatibility is **identity**. Middleware is **read-only observation**;
  no retired-shape registry, arbitrary middleware or value-repair code exists.
- Actual code imports 2.6D `enforceAndExpandAgUiStream` and delegates lifecycle
  checks to 2.6C. The lab tests selected `TEXT_MESSAGE_CHUNK` expansion,
  dropping unknown events, stripping unknown properties and fatal known fields.
- Application exposure is a pure all-or-nothing **return value**, never an
  application callback or real sink. No half-accepted batch is published.
- Malformed JSON/UTF-8, open/unclosed event frames, illegal HTTP headers,
  lifecycle violations, post-terminal data, open connections and terminal-free
  runs are tested against the scoped policy.
- The selected consumer may accept a late `RUN_ERROR` as a terminal failure;
  this is **not** a successful execution. Other unreviewed lifecycle warnings
  remain warnings: an accepted selected batch is **not** full conformance.
- No end-to-end replay, reconnection, protobuf/multiple bindings, media access,
  confidentiality/DLP, persistent state, multi-client isolation, model/tools,
  real Agent Server transport or security sign-off was performed.

### Original WSL audit and corrected runner pin

- Original audit: `~/masl-evidence/masl-26j-agui-46cc13b-20261115T222923Z` (outside Git).
- **121/121** selected pure assertions, four WSL gates PASS, nine critical
  test labels present. The initial auditor falsely blocked on a reversed
  label string; the one-line correction changes **only** the runner's required
  label, not TypeScript source or the pure test output. The corrected SHA-256
  is recorded below and required by this finalizer.
- Frozen upstream AG-UI commit `2330368a2a74573902858867072406638ba3073d`; schema SHA-256
  `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`; schema Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78`; 31 event branches.
- Pinned workshop HEAD `3d3287cf1e51250934c11aff182d90ccfaf0e66d` (local changes retained).

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `d0e0cf2e1e6777c6293f52cb4443f02bd1fafc81f9ea73deb620b3c5a7dbbd99` |
| `review.md` | `acab9f36d83146582353d330c9feab4bd5cedc2dace16a324278d572dca0ca0f` |
| `lint.log` | `9616b6f759371ad3d78101a6e389d3cb380c007973f7e13d3c0330b48621d265` |
| `build.log` | `cb7f3757b079c2c6baeabe4402e11ff4a5e95c09f8873e6788dd14f2a7604bbc` |
| `compile.log` | `8fddd12b327d5b23d30ed19c3e90e2bc6d1bfa3ca863dc98c8b21e16fdbac21b` |
| `pure.log` | `ab3b4ec16d197feef11d533484c42dbb1a3199cdd884ac45d962243248f01fe3` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/pipeline-transport.ts` | `6236eec1d191b0c6b6b531a54593b7e9047f5780e43918877e49b78595c4a296` |
| `apps/web/src/ag-ui/pipeline-transport.spec.ts` | `85a06c11194c0f5b055d5ec5e6004c10951a4424f5de83a31f4a4893097a3618` |
| `scripts/lab-26j-pipeline-review.py` | `cb05fab602809d3f6cd91b33033e575234e16498eaa47c9c51795c1a397e5671` |

Previously source-reviewed upstream normative Git blobs:

| Upstream document | Git blob |
|---|---|
| `docs/spec/1.0/basic/processing.mdx` | `22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47` |
| `docs/spec/1.0/basic/transports/http-sse.mdx` | `993b465d9e6a849fa3a616eb599c16671fccafcb` |
| `docs/spec/1.0/events/lifecycle.mdx` | `20c1adf5b98da77349c10f5218b1c80be91448e5` |

### Remaining gaps and next laboratory

G1–G9 remain **OPEN**. In particular, G1 unknown `PartSource` is normatively
unresolved; G3 lacks complete recursive schema coverage; G5 lacks a full
compatibility/middleware implementation and independent operational replay;
G7/G8 require independent media/security/state validation; G9 requires a
separate Agent Server adapter ADR, semantics mapping and e2e authorization.
The selected executable pipeline cannot close any of these gates by itself.

**2.6J selected pipeline PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
Next proposed sub-block: **2.6K AG-UI replay, failure recovery and adapter security gates** — explore scoped replay,
failure/recovery decisions and remaining adapter-security prerequisites,
without changing the existing REST/SSE frontend or authorizing production.

## 2.6K — Selected volatile replay/failure-recovery and adapter security gates (scoped completion)

Against published 2.6J baseline `6a3d89c1b87b9024f2205209650f5f0d5a5d395a`, the selected no-network
in-call replay/recovery review composes the published 2.6J JSON/SSE pipeline.
**248/248** pure TypeScript assertions and four WSL gates (lint, production
build, SSR compile and pure execution) PASS; ten critical labels were present.
This is **volatile, selected test evidence**. It is not a resumable HTTP
transport, authenticated adapter, persistent idempotency or a security audit.

### What was executed and what remains unproven

- Bounded synthetic attempts declare tenant/thread/run/attempt identifiers,
  contiguous ordinals and exactly one complete success per selected run.
  These references are **untrusted strings**, not authenticated principals.
- An aborted, incomplete observation is discarded and can be followed by
  a complete **full restart** in the same declared scope. There is **no
  partial resume** or use of `Last-Event-ID` as a trusted resume credential.
- Locally identical batches are suppressed by an **in-call JSON-string
  equality sentinel**, not a cryptographic fingerprint, durable checkpoint,
  distributed deduplication key or cross-process idempotency store.
- In-call conflicts, duplicated attempt IDs, skipped ordinals, late
  `RUN_ERROR`, malformed known data, cross-declared-tenant collisions and
  unreviewed selected lifecycle cases are negative tests. The test refusing
  a late `RUN_ERROR` was corrected to expect the **actual blocking code**
  `not-single-successful-run`, without changing `replay-recovery.ts`.
- The review returns identifiers only on a successful **pure atomic batch**;
  neither event bytes nor a real application callback/sink are released.
  This does not prove any atomic database transaction or actual delivery.
- G1–G9, the parent 2.6 milestone and Agent Server adapter still require
  independent normative/conformance decisions, authenticated authorization,
  tenant isolation, durable checkpoints/CAS and a separate security review.
  G7/G8/G9 remain **OPEN**: no DLP, media, persistence or deployment proof.
- Existing workshop files, real Agent Server REST/SSE frontend, Runtime,
  tools/models, network and production integrations were not modified or run.

### Original WSL audit (outside Git) and corrected payload pins

- Passed audit: `~/masl-evidence/masl-26k-agui-6a3d89c-20261115T230412Z`. The failed earlier
  attempt is not a passing artifact. This finalizer verifies the physical
  six-file evidence hashes and audit metadata rather than rerunning tests.
- The earlier test expected `unreviewed-selected-lifecycle`, while the
  published pipeline produced `not-single-successful-run`. The correction
  updates **only** that test expectation and its SHA constant in the runner.
  The original `replay-recovery.ts` bytes remain unchanged.
- Pinned AG-UI upstream `2330368a2a74573902858867072406638ba3073d`, schema SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`,
  schema Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78`; 31 event variants. Workshop pin `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `a7d2b9c995666dd8b353bc4784f846098262eb30cef7cb3c19af95fa3699d872` |
| `review.md` | `c788c7f7d8362e01c590cdc65d6035cde8d3571dd8cc6479206cca2543a39d03` |
| `lint.log` | `d0da49794c2b78a31a123487b0f32bfb145935a360559d4bc78a1aeb278c57a0` |
| `build.log` | `1a9b228922f028b2f191f54cb40d42ef5232c4f1cb1b2466f169af2818a42bd2` |
| `compile.log` | `d8b7084e1b537a1719ac45af5c29d978b48c5877e2e9d926f7a180d72f615b18` |
| `pure.log` | `0d4480d12bb3d64aa91e25ace4bed3878ed8c61f8ca7b5e3c81004a895731c5c` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/replay-recovery.ts` | `2e85493df530076637902da6d242bf1e10601f5a4e5985c45e725e1e2f677c39` |
| `apps/web/src/ag-ui/replay-recovery.spec.ts` | `6e9cdb81eeef2b465779b001dec89f13e2193426c6d35fad414cf62538b64734` |
| `scripts/lab-26k-recovery-review.py` | `bb6f2f1bc795d744b4f98fc0d074bde909d00a5f404b6e7f58297d6520b824c7` |

Previously source-reviewed official AG-UI prose Git blobs:

| Upstream document | Git blob |
|---|---|
| `docs/spec/1.0/basic/processing.mdx` | `22fbb70dd6bbe9c3849e76b2f4685c793fbe3e47` |
| `docs/spec/1.0/basic/transports/http-sse.mdx` | `993b465d9e6a849fa3a616eb599c16671fccafcb` |
| `docs/spec/1.0/events/lifecycle.mdx` | `20c1adf5b98da77349c10f5218b1c80be91448e5` |

### Remaining gates and next sub-block

**2.6K selected replay/recovery PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
The result documents selected local behavior and security prerequisites;
it cannot authorize the Agent Server → AG-UI adapter or production deployment.
Next proposed: **2.6L AG-UI authorization and durable replay contract evidence** — verify scoped authorization and
persistence/replay contract requirements, with negative evidence and separate
review gates, before considering a real adapter.

## 2.6L — Synthetic authorization and durable replay contract evidence (scoped completion)

On published 2.6K baseline `cc12712dea7ac92d121137a8f781419cdb32b531`, the local isolated verifier composes
2.6L planning decisions with the existing 2.6K recovery contract. In the WSL
original run, **394/394** pure TypeScript assertions and four gates (lint,
production build, SSR compile, pure execution) PASS. **13/13** critical test
markers were present. This is deliberately **synthetic contract evidence**:
no authenticated user, database, transport resumption or real transaction.

### Selected executable review and explicit limits

- A **synthetic test context**, not a verified identity, declares principal ID,
  tenant ID, thread allow-list and policy epoch. User-declared tenant references,
  unexpected privilege fields and forbidden threads are rejected by the local
  reviewer; this is **not** an external ACL lookup, authentication, tenant
  isolation proof, or production authorization decision.
- Each synthetic replay intent is checked against the already published 2.6K
  pure recovery contract before a checkpoint plan can be returned. Incomplete
  attempts, unsupported partial resume and mismatched run identities fail
  closed. The 2.6K review remains volatile, selected, non-operational.
- In-memory checkpoint **projections** contain tenant/epoch/revision and
  receipt metadata. Duplicate keys, changed principal, changed declared
  commitments and stale revisions are negative tests. Commit and replay-check
  return *proposals*, not persisted effects. A caller-supplied 64-hex
  commitment is structurally checked but **not calculated or verified** from
  event bytes, so it is not trustworthy cryptographic evidence.
- Two independent planners can both propose the same next revision against
  an identical snapshot. Only a truly transactional backend with CAS and
  an authenticated reload can arbitrate that race. **Neither CAS atomicity nor
  idempotency across processes is implemented or proven here.**
- All-or-nothing applies solely to a **pure return value**; no database,
  application sink, actual HTTP request, token exchange, secrets, media/DLP
  handling, multi-client deployment, Agent Server bridge, runtime/model/tool
  invocation or independent security sign-off occurred.
- Open dependencies: G1 unknown `PartSource` interpretation remains unresolved;
  G3 full recursive schema, G5 compatibility/middleware, G7 media/security,
  G8 durable shared state and G9 adapter interoperability remain unverified.
  The parent 2.6 milestone and **all G1–G9 remain OPEN**. Adapter **BLOCKED**.

### Original WSL audit evidence (outside Git)

- Passed WSL audit: `~/masl-evidence/masl-26l-agui-cc12712-20261115T232741Z`. The finalizer verifies
  the physical six-file SHA-256 and metadata; it **does not rerun the audit**.
- Frozen upstream `2330368a2a74573902858867072406638ba3073d`, AG-UI 1.0 schema SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`,
  Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78`, and reference workshop `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.
- There were no 2.6L post-install code patches: the source and runner hashes
  below are the original pinned package payload hashes, verified in the WSL.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `764c7faf1d1bcb5449145b401d4e854d4ac936c4bb80635db1684d4988daf621` |
| `review.md` | `60bb76458e9f835fad98a89ad129ffb028dcd5f8c2158e11e5f7fa890758891f` |
| `lint.log` | `bb4711b9e654f68d54172e1603721659a5ccab06a8dd8e8804e04eeb32744221` |
| `build.log` | `1fe9cf5d891666e89a9e940c5597f8a1ca2252c006c753fe7eded97f1c78f4ae` |
| `compile.log` | `ee4a6973f2196130b170ed27f44530539c0a51af888c27d0c569090fddbadcc4` |
| `pure.log` | `52bf6a4d4c18d0c5e4d57d7fb859a3a603052d12dfdf70adc582f6ce3febbdcb` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/authorized-durable-replay.ts` | `55456eeea1d3919aafca051f31af799c3db4321761fca4a046cfc132ca7f28be` |
| `apps/web/src/ag-ui/authorized-durable-replay.spec.ts` | `01eeeee752cac2dd2abb132dc93cbfa21b55a34496016202492ceb908ce30466` |
| `scripts/lab-26l-authorized-replay-review.py` | `33ba710f417b86e2fc3bfd9baae1c623994256af86a1c3772b640ad3ba36e6b1` |

### Remaining decisions and next scope

**2.6L selected synthetic contracts PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
This sub-block does not grant authorization, production, persistence or AG-UI
protocol-conformance readiness. Next proposed: **2.6M AG-UI trusted identity and transactional replay boundary design** — plan
an isolated, independently verified trusted identity source and transactional
checkpoint boundary while retaining the existing Agent Server frontend and
normative/security blockers until separately resolved.

## 2.6M — Trusted identity boundary design and isolated transactional SQLite evidence (scoped completion)

Against the published 2.6L baseline `873398d87816be79a7e51c4e08924ff81011ba00`, the selected offline WSL
review executed **152/152** pure TypeScript assertions, **25/25** SQLite
file-backed CAS/ACL fixture assertions and **five/five** gates (lint,
production build, SSR compilation, pure execution, SQLite). All **10/10**
critical TypeScript test markers were present. Audit evidence is immutable by
SHA-256 and stored separately from the Git checkout. This is **limited
experimental evidence**, not a production auth or Agent Server integration.

### Selected implementation and trust boundaries

- The TypeScript 2.6M boundary composes the published 2.6L authorization/CAS
  *proposal*. Its principal/thread context is injected through test-harness
  callbacks; the request body cannot self-assert privileged identity fields.
  An injected fixture is not an OIDC/JWT, trusted issuer, live session or
  independently verified thread ACL.
- TypeScript's selected pipeline, 2.6L and 2.6K checks remain **pure**; the
  TS return value is not a database transaction and cannot grant real access.
- The separate Python SQLite fixture uses an offline session-reference lookup
  in a test table (not authentication), computed **SHA-256 of fixture bytes**,
  unique receipts and actual `BEGIN IMMEDIATE` transactions with revision CAS.
- Two independent OS processes contested the same checkpoint. In the isolated
  SQLite experiment, **exactly one committed** and **one was rejected as
  stale**, with the resulting revision equal to one; the file's `integrity_check`
  passed. This is local SQLite behavior, not cross-deployment durability,
  distributed consensus, enterprise store semantics, or operational replay.
- The physical `sqlite-proof.sqlite3` artifact is pinned below with SHA-256;
  this finalizer performs **read-only** integrity/receipt checks without
  changing or rerunning the original SQLite fixture.
- No external identity provider, token verification, real RBAC/ABAC policy,
  authenticated producer, cross-service authorization, production database,
  resilience test, HTTP resume, client-facing sink, media/DLP or independent
  security approval has been tested. No Agent Server/frontend code was changed.
- G1 unknown `PartSource` remains normatively unresolved; G3 recursive schema,
  G5 compatibility/middleware, G7 security/media, G8 shared-state durability
  and G9 adapter interoperability remain **OPEN**, as do all nine gaps and the
  parent 2.6 milestone. Agent Server → AG-UI adapter stays **BLOCKED**.

### Original WSL audit and frozen references

- Approved audit folder: `~/masl-evidence/masl-26m-agui-873398d-20261116T011109Z`; its **eight**
  physical artifacts are SHA-256 checked by this finalizer, which reruns
  neither tests nor database transactions.
- Frozen AG-UI upstream `2330368a2a74573902858867072406638ba3073d`; official Draft 2020-12 schema SHA-256
  `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`, Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78` (31 event variants).
- Workshop reference HEAD `3d3287cf1e51250934c11aff182d90ccfaf0e66d`; local uncommitted changes preserved.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `d94b3a93109e7f9d97738c8bce78bfb125907a4e8b15e86103de592c635e294d` |
| `review.md` | `248e449d1cf6a05135efea937889c5b168c9e5f9110d614dbe5db8ee4619135a` |
| `lint.log` | `9357e9c54131df7b896ef79450dd1db5c1065a034913dbc5b6b63e9f85891718` |
| `build.log` | `3be8e935d84ff221d62d64e743a1c751c1dcc4aa30f839eafef7f515428af65c` |
| `compile.log` | `c49ae8a2c58e2a49fd2efda55a93bcc73c06d22af5f007cf7801dfcc89b107ad` |
| `pure.log` | `faef4f762415fdb044e4cfc2a2336464dde2b7b394e9a53599e0877ff1b017f2` |
| `sqlite.log` | `148942b889c1966d73fa72e1a4ccb16779563783f8a271ed434f05217b2497ba` |
| `sqlite-proof.sqlite3` | `9555bda765e55e8bf47f175e9a084bd8ff48a1e8c1a5815749dee9bc9890449f` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/trusted-transaction-boundary.ts` | `ab2ae9b77b260d2d99286d7aa793e22e0cce2ed289b8999181b6ca23c1c64592` |
| `apps/web/src/ag-ui/trusted-transaction-boundary.spec.ts` | `07ec28b09cc957a75246de4cca12796536f940b4de62643e65ed9aca5db3f188` |
| `scripts/lab-26m-transaction-review.py` | `7b5c39dda0e85a86ed1673247505c0fb37100f6f28fb487ac9e2cf2e3a66a58f` |

### Remaining gates and next sub-block

**2.6M selected boundary and SQLite CAS PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
No independent authentication/security review, distributed idempotency,
production persistence, HTTP transport resume or integrated adapter was proven.
Next proposed: **2.6N AG-UI external identity and durable-store interoperability gates** — determine and independently test the
external identity and durable-store interoperability requirements before any
Agent Server → AG-UI implementation is authorized.

## 2.6N — External identity and durable-store interoperability gates (scoped fixture completion)

On published baseline `c890ea464856fcc5bb8771f14bdda5a99a79531c`, the WSL audit passed **241/241** pure
TypeScript assertions, **37/37** fixture HMAC-JWT/SQLite assertions, all **five
local gates** (lint, production build, SSR compilation, pure execution, fixture),
and all **11/11** critical TypeScript labels. Its eight external artifacts are
SHA-256 pinned below. This demonstrates only selected offline interoperability
contracts, not a deployed identity-provider or transactional Agent Server bridge.

### Tested boundaries and important exclusions

- The TypeScript path composes the existing 2.6M/2.6L/2.6K selected reviews
  through callbacks, with negative cases for untrusted principal/tenant/thread,
  privilege fields, expired synthetic credentials and failed fixture lookups.
  Callback-origin identity remains a **test-harness assertion**, not an OIDC
  session or a separately verified external issuer.
- A **separate Python** fixture verifies HS256 HMAC signatures using an embedded,
  disposable test key; it checks issuer, audience, `kid`, time claims and
  malformed/duplicate claims. It does **not** implement OIDC/JWKS, TLS, key
  rotation with trusted issuers, `jti` revocation or production token handling.
- The fixture combines validated synthetic JWT claims with a physical local
  SQLite file, ACL checks, SHA-256 of synthetic event bytes, receipt uniqueness
  and `BEGIN IMMEDIATE` CAS. A two-process race produced **one commit and one
  stale revision rejection**. These checks are local SQLite properties, not an
  enterprise database, distributed guarantee, cross-service transaction or
  operational HTTP/SSE resume implementation.
- The TypeScript review and Python fixture are **separate experiments**. Their
  results do not establish a single atomic trust pipeline; no real Agent Server
  frontend, network, Runtime, model/tool, deployment, media/DLP or independent
  security sign-off was involved.
- Full AG-UI recursive conformance, normative `PartSource`, compatibility,
  media security, shared-state durability and adapter interoperability retain
  unresolved gates. **All G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**

### WSL evidence and pins (outside Git)

- Approved run: `~/masl-evidence/masl-26n-agui-c890ea4-20261116T014749Z`. The finalizer checks the eight
  physical hashes and SQLite contents in read-only mode, without rerunning tests.
- Frozen upstream `2330368a2a74573902858867072406638ba3073d`, official schema SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a` and Git
  blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78` (31 event variants); workshop reference `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.

| Evidence file | SHA-256 |
|---|---|
| `review.json` | `548acbf3c3df4a940e82046a30d80b6c71bff559d92af58e58094a6912591aba` |
| `review.md` | `c61af3af40884b84ce59f5eaea353a021b4763e4e6b746d7cc6d24cd8ac40f7e` |
| `lint.log` | `d222280c126c06a7f414f058f5193e5dd629aaef951a282094483781faa920f9` |
| `build.log` | `d2142a2e8ec66fda2de6f67c22f5b6f9dd4146dd1eb51b1139f229e7f17da7c6` |
| `compile.log` | `a30e376664b49ef0b150c18db4e5e1a529ab2ff845b1dd664cecff6ac22cbd36` |
| `pure.log` | `bf9deca036cdeb8bc0b9b239dc16070e52fa5e59699fb09be72e62390a431ed1` |
| `fixture.log` | `5c9f086de4dbc10d076c2bd291058004fce149bdab1ac7d0b893b1f656ffc893` |
| `interop-proof.sqlite3` | `d8465941328401c81c01ffb1cdd2a62b03ea305307da580e0a01aac374bd7c6c` |

| Source file | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/external-interop-gates.ts` | `19df525c556ed63176d56eeb9267426e28a3f4a79e7b8bcc97d108789a0b807a` |
| `apps/web/src/ag-ui/external-interop-gates.spec.ts` | `d9c59e94568fd44776165269cd4ac77531b416c25cf39926374471d90d0b3f3c` |
| `scripts/lab-26n-external-interop-review.py` | `565a383e18ff28072176d1f85538c8b720f8c865800037bc78e164fee6c87178` |

### Next boundary and remaining gates

**2.6N selected fixture interop PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
Next proposed: **2.6O AG-UI external issuer, revocation and transactional store failure gates** — investigate trusted issuer/JWKS and revocation
requirements, and isolated durable-store failure injection, before any real
Agent Server → AG-UI adapter or milestone closure is considered.

## 2.6O — Local RS256 issuer/revocation and transactional fault gates (scoped completion)

Against the published 2.6N baseline `fc68c8163fd204eab68a8b84de9dbc6ae6629b9d`, the WSL audit passed
**329/329** TypeScript contract assertions, **51/51** separate OpenSSL/SQLite
fixture assertions, **12/12** critical TypeScript markers and five gates
(lint, production build, SSR compilation, pure execution, RS256/SQLite fixture).
Eight original external artifacts are SHA-256 pinned below, including the
physical SQLite file. This is **selected offline evidence**, not a production
issuer, deployed Agent Server or full AG-UI 1.0 protocol conformance.

### Executed evidence and trust limits

- The isolated TypeScript 2.6O gate composes the published 2.6N/2.6M/2.6L/2.6K
  selected pure checks via injected identity, key-state, revocation and checkpoint
  *test-harness callbacks*. Callbacks and provenance tags are not authenticated
  external issuer credentials, network JWKS or authoritative live ACL sources.
- A separate Python fixture generates ephemeral RSA private/public key pairs and
  uses **OpenSSL RS256** to verify signatures. It exercises active/retired `kid`,
  key-substitution, malformed header/claims, issuer, audience, time and algorithm
  confusion negatives. Local public PEM snapshots are **not fetched via OIDC/JWKS**,
  and private test keys are not retained in the audit evidence.
- A physical local SQLite fixture executes `BEGIN IMMEDIATE` CAS, records hashes
  of **synthetic event bytes**, tests `jti` revocation, pre-transaction outage,
  rollback after CAS and receipt insertion, and post-COMMIT acknowledgment-loss
  reconciliation. The latter **simulates an ambiguous response**, not an actual
  crash, power cut, network partition or distributed failure.
- Separate operating-system processes race the same SQLite checkpoint: **one
  committed, one rejected for a stale revision**; exactly one race receipt was
  stored. This proves selected SQLite-local behavior only, not enterprise store
  availability, revocation propagation or cross-service atomicity.
- The Python RS256/SQLite fixture and the TypeScript callback experiment remain
  **separate**; their results do not establish a connected trust chain, authenticated
  event producer, operational HTTP/SSE replay or Agent Server adapter.
- No production OIDC/JWKS issuer, token distribution/revocation SLA, cross-region
  consistency, media/DLP review, real frontend/runtime integration or independent
  security sign-off occurred. All G1–G9, including unresolved normative/schema,
  media-security, persistent-state and adapter gates, remain **OPEN**; 2.6 **OPEN**;
  adapter **BLOCKED**.

### Original approved WSL evidence (outside Git)

- Audit directory: `~/masl-evidence/masl-26o-agui-fc68c81-20261116T021858Z`. This finalizer verifies the
  eight physical SHA-256 pins, metadata, 12 critical pure markers and SQLite
  integrity/receipt/revocation records **read-only**. It does not rerun tests.
- Frozen AG-UI upstream `2330368a2a74573902858867072406638ba3073d`; official 1.0 schema SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`,
  schema Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78` (31 variants); workshop HEAD `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `e9e6fe1cfdcc5e82e2bf2ee0d778902dc35acf5f71a55efd8c9b84303d5df2d0` |
| `review.md` | `a3ad624d20441e1b307a7899773136f2f3bf821f9b40fec0c4e70e3ad9edbae4` |
| `lint.log` | `7f3feb83aa5c3692210dbc873d5233dd73f46490e06e9fae2774484510c7e0d0` |
| `build.log` | `00b5d725f25ddcc496d665a33818b0eeeb6709a7c6707a9c3af6393aabe76d35` |
| `compile.log` | `e8d4c25d9ea5cece66cf852e4fee98fca124504c6a8a8ba04e271ff5169747f5` |
| `pure.log` | `2d94aef8bac5993381abbe5cb741ca74a117ac41177cc32dd3e03eaabaa1d2da` |
| `fixture.log` | `89e8ab696fb89c2db70589e5965aafdd5d56e6dc85457fcfcaf77daaac7bbdb4` |
| `issuer-proof.sqlite3` | `2c3e87edbfc0facdd4221422a97a7c65fefcd97fbc8a3c3a7bfe3f0c48222ca8` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/issuer-revocation-failures.ts` | `369c3167403e772b0a5bdd24b631b2b4b6d3630c4900343bdc60f6889cfcc5de` |
| `apps/web/src/ag-ui/issuer-revocation-failures.spec.ts` | `8032ce7e262f4f0689fca91421a117c4f95db0ddf4549db25ee3bbb8a9915da5` |
| `scripts/lab-26o-issuer-failure-review.py` | `789dac3b4f10ab8864d108f8d905a6847ca310bf51a7add41557ade7dfc66eb8` |

### Remaining gates and next step

**2.6O selected RS256/revocation/store-failure PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
No independent issuer trust, distributed revocation/durability or production
interoperability was established. Next proposed: **2.6P AG-UI cross-service issuer trust and recovery integration gates** —
investigate real provider metadata, revocation freshness and authenticated
transaction/retry composition behind separate security and protocol gates.

## 2.6P — Signed cross-service metadata and isolated receipt recovery gates (scoped completion)

Against the published 2.6O baseline `42310c8a184215b270709c5c42caf16757351fb8`, the approved WSL v2 review
passed **329/329** pure TypeScript contract assertions, **37/37** local signed
metadata/OS-process/SQLite fixture assertions, **13/13** critical TypeScript
cases and all **five WSL gates** (lint, production build, SSR compilation,
pure execution and fixture). The original eight physical evidence artifacts,
including a SQLite database, are pinned to exact SHA-256 values below.

### Verified scope and explicitly unverified security boundaries

- The TypeScript 2.6P gate composes the published 2.6O/2.6N/2.6M/2.6L/2.6K
  *pure* contracts through injected callback metadata, revocation state,
  credential and checkpoint fixtures. These callbacks are not authenticated
  remote identity providers, issuer verification or a transactional data sink.
- The separate Python fixture reused the **published 2.6O OpenSSL RS256**
  verification helpers. A local disposable RSA root signed issuer metadata,
  while a second local test key signed JWTs. The root public PEM was supplied
  by the harness and was **not** obtained from real OIDC/JWKS or enterprise PKI.
- The signed metadata freshness, active `kid` and revocation epoch were checked
  against a local SQLite `revocation_state` inside a transaction. A stale signed
  watermark was rejected after an independent local update; a newly signed
  watermark then observed the revoked `jti`. This does **not** prove external
  revocation consistency, availability, TLS or a distributed propagation SLA.
- Receipt reconciliation after simulated loss of the commit acknowledgment
  returned `receipt-reconciled-no-write` for the matching persisted digest.
  Mismatched bytes and absent receipts were rejected; precommit fault injection
  rolled back writes. This is **local SQLite behavior**, not operational HTTP
  resume, power-loss testing, network partition or distributed atomicity.
- Two separate OS workers ran the fixture verifier and store call against the
  same SQLite file; one won the race and the other received a stale CAS result.
  These workers did **not** authenticate each other over a network transport.
  The TypeScript and Python fixtures are **separate**, not an end-to-end proof.
- The v1 installation's failed `pnpm build` was followed by the exact v2 fix:
  an unused TypeScript type import was removed and its source hash updated in
  the runner. The successful WSL audit is from the **v2** evidence directory;
  the incomplete v1 output is not counted as a passing gate.
- No real network service, OAuth/OIDC discovery, operational JWKS validation,
  production token distribution, authenticated AG-UI event producer, enterprise
  persistence, security sign-off, media/DLP or Agent Server/frontend integration
  was exercised. G1–G9 remain **OPEN**, parent milestone 2.6 **OPEN**, and the
  AG-UI adapter **BLOCKED**.

### Original approved WSL v2 audit evidence (outside Git)

- Approved run: `~/masl-evidence/masl-26p-agui-42310c8-20261116T025133Z`. The finalizer validates all
  eight artifact hashes, report metadata, 13 critical TypeScript labels and the
  original SQLite file **read-only**, without rerunning cryptographic tests.
- Frozen upstream AG-UI 1.0 commit `2330368a2a74573902858867072406638ba3073d`, schema SHA-256
  `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`, schema Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78` (31 events), workshop
  reference `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `527870f61af68d1b5095973e2a3ca9d57dcb6911582f73de3c4c0d568baa8ffc` |
| `review.md` | `7002c0090d41833f21fc2a23fd7e0d5a1515991c8b4e2f65e8a9658304fee617` |
| `lint.log` | `356261321331c56cf1fe0f58c3edf2be4e93a4d5547d9d66ac34f293db6e63f6` |
| `build.log` | `1d48cbe30c79bfc8f5366440e23df1982a1f912d1f80b0ee75383e5be8d65152` |
| `compile.log` | `f8e7e084b179cf850de187209d73a9a319a52d81a3861204da95065484dda128` |
| `pure.log` | `0721fe3065551e2837f3d115fd8a870ecaaa77c0c6ee90c74dbc02b07e22f3f2` |
| `fixture.log` | `a086b75530aaffccc1fc43baccd2286cb29bb39385ac3dedb6bfabbaf3d97ab7` |
| `service-proof.sqlite3` | `c68c60bc61671a5ff65f1804255e9f98ad18c83e75a244c1bc236d8ebae6ac72` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/cross-service-recovery.ts` | `80061b9a1a2ee54d5000ffaff403b8e1cf53518ffd6687dec4ce9a534c1276c9` |
| `apps/web/src/ag-ui/cross-service-recovery.spec.ts` | `6b40c1cf70220a40e80ba21d63539d6f0fd33e80f6729a7ac2e819027903f49a` |
| `scripts/lab-26p-cross-service-review.py` | `12b0d035f1f144e010820cd8c508c46de6527a19c6a8d3d8e45e9bceae6d4288` |

### Remaining gates and next step

**2.6P selected cross-service fixture PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
No real mutually authenticated service channel, network issuer trust, distributed
revocation/persistence, full AG-UI conformance or Agent Server integration was
established. Next proposed: **2.6Q AG-UI authenticated transport and recovery readiness gates** — define independent transport,
issuer/ACL, recovery and producer-authenticity evidence before considering an
adapter or milestone closure.

## 2.6Q — Local mTLS authenticated transport and receipt recovery evidence (scoped completion)

Against the published 2.6P baseline `c017a9d7a8126a3a4074663509732ff860439ca9`, the WSL audit passed
**269/269** selected TypeScript assertions, **30/30** loopback mTLS/SQLite
fixture checks, **11/11** critical TypeScript cases and all **five** gates
(lint, build, SSR compilation, pure execution and TLS/SQLite fixture).
Eight original external SHA-256-pinned artifacts, including the physical SQLite
file, are recorded below.

### Verified behavior, exclusions and trust boundaries

- TypeScript 2.6Q composes the published pure review contracts from 2.6P through
  2.6J via *injected fixtures*, without consuming Python TLS identities or a
  database connection. Its verdicts never claim operational readiness.
- A separate Python fixture established a **real mutually authenticated TLS
  channel on 127.0.0.1**, using a local disposable CA, server certificate and
  client certificates. It rejected clients with no certificate, an untrusted
  CA, an incorrect server hostname and a same-CA peer whose CN was unauthorized.
  The selected CN check is a fixture ACL, **not** a corporate identity model.
- A server receiving **caller-provided synthetic bytes** computed SHA-256 and
  stored receipts through local SQLite `BEGIN IMMEDIATE` and revision CAS.
  No authenticated upstream AG-UI event producer, signed event envelope,
  trusted enterprise PKI, federated identity or production protocol was involved.
- The test server deliberately withheld the response **after COMMIT**. A new
  authenticated TLS connection reconciled the exact durable receipt without
  writing again. This is not an actual crash, power failure, deployed network
  partition, full AG-UI resume or distributed transaction guarantee.
- Two independent TLS client connections contested the same SQLite checkpoint:
  **one committed, one received a stale revision conflict**. The final database
  contains **three** receipts, `thread-A` revision 2 and `race-thread` revision
  1. This verifies one local file-backed SQLite store, not multi-node durability.
- The pinned workshop and existing Agent Server REST/SSE frontend are unchanged.
  No operational issuer, SPIFFE/mTLS deployment, remote JWKS, enterprise ACL,
  media/DLP security sign-off, independent protocol conformance or authenticated
  AG-UI producer was demonstrated. All G1–G9 **OPEN**, parent 2.6 **OPEN**,
  adapter **BLOCKED**.

### Approved WSL evidence and pinned references (outside Git)

- Audit directory: `~/masl-evidence/masl-26q-agui-c017a9d-20261116T031821Z`. The finalizer reads all
  eight artifact hashes and checks SQLite contents **read-only** without
  rerunning cryptography, live sockets or test transactions.
- Pinned AG-UI upstream `2330368a2a74573902858867072406638ba3073d`, official schema SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`,
  schema Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78` (31 event variants), and workshop
  reference `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `74289cd26f99d737bae9257681aeff49aa941af77363be970eb5f75552016424` |
| `review.md` | `497815a629e90a3e4d52178c9407b37f717a1f0d0ec558b1259e3079a9352d8b` |
| `lint.log` | `d9b65b142fd53ca27f305d6bb0023fe913b5a60602a830b447961b410538a34c` |
| `build.log` | `07424b56af7a6ffbc750a282d1de2bd9c10db4b6f3832bb885e8c9810e89ad5f` |
| `compile.log` | `96a0952d6f969876f12d22dd467924864de280a029706a0eea40cebb7ec517ef` |
| `pure.log` | `49488a3a52ae5b7bb7cddd492aa2968d0e273372b4e427719b93243069ca92da` |
| `fixture.log` | `565857395010697fd6fe17ceb44eb3c6ce4914104682878a743f1fbf5a92d03b` |
| `transport-proof.sqlite3` | `94a8bbda3f630ef8599cb90655da194c8fd97d8c89e6095b0ff5b13bc74484a4` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/authenticated-transport-readiness.ts` | `f65f90205277c04f1fc48b7e427cc6a68ca231b0c16750c0adf61c7911698aca` |
| `apps/web/src/ag-ui/authenticated-transport-readiness.spec.ts` | `fdb7b8b42af66e49cfc68806993c0692fd9eeb8bb14b9bc859601c0cf717730a` |
| `scripts/lab-26q-transport-review.py` | `17e9c19b03c1cccdc02f850dac713c4db187181361501f853a80a37d585ecc66` |

### Remaining gates and next laboratory

**2.6Q selected loopback mTLS/recovery PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
Real enterprise identity, independent authenticated AG-UI event provenance,
network-separated or multi-node recovery, full AG-UI 1.0 schema compliance and
independent security review remain unproven. Next proposed: **2.6R AG-UI producer authenticity and distributed recovery evidence gates** —
require externally grounded producer identities and failure/replay evidence
before any real adapter or milestone closure.

## 2.6R — Signed producer events and two-node shared SQLite recovery gates (scoped completion)

Against the published 2.6Q baseline `b98f63ac9364c7cf6b8a52ccd03c5188f72a9cc4`, the WSL audit passed
**380/380** selected TypeScript assertions, **48/48** local RS256/mTLS/SQLite
fixture checks, **13/13** critical TypeScript markers, and all **five** gates
(lint, production build, SSR compilation, pure execution, network fixture).
The eight original SHA-256-pinned evidence artifacts remain outside Git.

### Verified experimental behavior and limits

- TypeScript 2.6R composes the published *pure* 2.6Q through 2.6J review
  contracts using injected fixture metadata; callbacks do not authenticate
  transport peers, RSA signatures, real event sources or SQLite connections.
- The separate Python fixture used an ephemeral RSA producer private key to
  sign a canonical event envelope (producer ID, tenant, thread, run, sequence,
  revision, revocation epoch and SHA-256 of event bytes). It verified the RS256
  signature with an independently supplied **local test public key** over
  actual loopback mTLS, and refused modified signed fields, tampered payload,
  untrusted signing key and duplicate JSON keys. This is **not proof of a real
  authenticated AG-UI producer** or an enterprise-backed signing authority.
- Two distinct local OS TLS server processes were started on `127.0.0.1`, with
  disposable local CA/certificates and gateway CN test ACL. They used **one
  shared SQLite file**: this demonstrates coordination across local processes,
  **not replicated/distributed persistence, quorum, network-separated failover,
  consensus or multi-node durability**.
- A test primary committed a signed event but intentionally withheld its ack.
  The primary process was terminated, and the standby reconciled the same
  persisted receipt without an additional write. This does **not** establish
  recovery from power loss, storage outage or a real network partition.
- A signed CAS race between two loopback server processes resulted in exactly
  one accepted producer sequence update and one stale loser. The final database
  records **five** receipts, four `thread-A` revisions and one `race-thread`
  revision, with receipt labels from both local processes. Primary producer
  sequence reached 4; its revocation epoch reached 3 and its key was disabled.
- No operational Agent Server integration, corporate PKI, online JWKS/OIDC,
  authoritative producer registration, external revocation SLA, media/DLP,
  independent AG-UI 1.0 conformance or security sign-off was demonstrated.
  **G1–G9 OPEN; parent 2.6 OPEN; adapter BLOCKED**.

### Approved WSL evidence (outside Git)

- Approved run: `~/masl-evidence/masl-26r-agui-b98f63a-20261119T101244Z`. The finalizer verifies each
  original evidence digest, report metadata, assertion markers, and the
  physical SQLite state **read-only**, without rerunning network tests.
- Frozen AG-UI upstream `2330368a2a74573902858867072406638ba3073d`, official 1.0 schema SHA-256
  `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`, Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78` (31 event variants), pinned workshop
  reference `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `ee2154e3e75426f149217d97154a7c9a19914c86942e04531e4c3bbf9fbff535` |
| `review.md` | `6137d610f92da2b06be38055415bf24d5cdd4284a6ab2e110fa09446fe439579` |
| `lint.log` | `925503f9ced519bca7b00b41a08fff676f25a5c55131a72cbe1265cd44b5aacf` |
| `build.log` | `2e4411af3df4f0f9a8e8b478d6abc10007252a54f7bad2b30fd923f19f9ef98e` |
| `compile.log` | `7099a88232e1257ddb0424caee5ccd7a4d8134cc6226e2d72e0db7e94e764f4f` |
| `pure.log` | `70085afafc091023585429de9b2f83045dded1ff6be3d4342573ebf036294ee0` |
| `fixture.log` | `328124cca2c1eb5dcf779b4584dd6eae0807592e98c277d5a82139de75912d24` |
| `producer-proof.sqlite3` | `ea839e3de7aecdc1a5b9a218c324a5835c7b0d3051ac28521d0c9a383dfd6490` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/producer-failover-evidence.ts` | `8a86e5cfc60c74b3d968fbeea839eb0716c8f54c6243c7df4efaae836c1122ce` |
| `apps/web/src/ag-ui/producer-failover-evidence.spec.ts` | `b1b30aa73b9fa60c0d0e9e448b88a6c44c7819be3f6b8ab3609a07f6a4c2c7de` |
| `scripts/lab-26r-producer-failover-review.py` | `c3dd1c6efd2b713fbbe7d5cdb55900fe04e0f103198ada5281e52ec2cf855ee1` |

### Remaining gates and next step

**2.6R isolated signed producer/local failover PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
The authenticated producer and two-node recovery experiments were local and
used disposable credentials plus one file-backed SQLite database. Next proposed:
**2.6S AG-UI producer trust anchors and replicated recovery gates** — investigate independently established producer trust roots,
network-separated replicas, revocation continuity and receipt reconciliation
before any real adapter or milestone closure.

## 2.6S — Independent producer root and two SQLite replica recovery gates (scoped completion)

Against the published 2.6R baseline `2732f7c7d82deaf1f95db337720d1c22a03309a7`, the WSL review passed
**269/269** pure TypeScript assertions, **49/49** RS256/two-independent-SQLite
fixture checks, **12/12** critical markers, and all **five** gates (lint,
production build, SSR compilation, pure execution and fixture). The eight
original SHA-256-pinned evidence artifacts remain outside Git.

### Verified experimental evidence and unresolved safety boundaries

- TypeScript 2.6S composes the published 2.6R through 2.6J *pure* gates by
  injected fixture data, not real issuer credentials, physical replica sessions,
  signed trust anchors or Agent Server runtime calls. No AG-UI events escape.
- A separate Python fixture generated independent, ephemeral RSA root and
  producer keys, signed a producer registry and canonical event envelopes, and
  verified SHA-256 event bytes and RS256 signatures. The root public key was
  **locally supplied by the harness**, not externally authenticated via PKI,
  OIDC/JWKS, an enterprise trust registry or authenticated provider discovery.
- Two **separately created SQLite files on ONE host** stored distinct checkpoints,
  receipts, producer revocation state and leadership epochs. Replication required
  explicit root-attested event replay. A stale, missing or divergent receipt
  blocked standby promotion, and replay restored convergence before a simulated
  signed-root promotion. This is not network replication, consensus or quorum.
- The test primary committed and intentionally lost its acknowledgment. The
  unsynchronized standby correctly refused to confirm the receipt, while a
  synchronized standby reconciled without a new write. A separate OS worker
  exercised signed replay. No live production storage or multi-host outage ran.
- **Important unresolved split-brain gap:** after standby promotion, the
  isolated former primary **still accepted a second write** because there was
  no effective external fencing or consensus. The fixture intentionally recorded
  that divergence, then manually retired the old primary. This finding must
  remain OPEN; the harness root simulates a control-plane decision, not a
  deployed fencing authority.
- The archived `replica-proof.tar` contains exactly two self-contained SQLite
  snapshots with two matching receipts (`run-A`/`run-B`), thread-A revision 2,
  and a distinct leader epoch on the promoted standby (1 versus 2). Both DBs
  were checkpointed out of WAL before archiving. Private test keys are excluded.
- No externally trusted producer, distributed durability, quorum, automatic
  split-brain protection, independent AG-UI 1.0 conformance, media/DLP review,
  corporate identity/ACL, real Agent Server integration or independent security
  sign-off was demonstrated. **G1–G9 OPEN; parent milestone 2.6 OPEN;
  adapter BLOCKED.**

### Approved WSL evidence and pinned references (outside Git)

- Approved run: `~/masl-evidence/masl-26s-agui-2732f7c-20261119T121959Z`. The finalizer verifies all
  eight physical artifact SHA-256 pins and inspects **both archived SQLite
  databases in memory**, without modifying evidence or replaying test events.
- Frozen upstream AG-UI 1.0 `2330368a2a74573902858867072406638ba3073d`, schema SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`, schema
  Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78` (31 event variants), pinned workshop `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `633828a5dbd4a82bf4535941140eadd63f69aa3c8a437758622e26cda3e39cb5` |
| `review.md` | `bb06b99255f627f4eb06c194d4b642684284a6136bd880d05d38a77bb6186a73` |
| `lint.log` | `192b83f69ccaa416cc82e75e184a67af6d955b1979bbb9404e236c44071eb55f` |
| `build.log` | `df895321469fc4ac5a7e0f2467ae9e0390a2b88dac7604c0da7cadc47846a892` |
| `compile.log` | `7ebcbba33f901efef5cdcab2e5237a828f8816d1a9bba9f46a4703c3f70eb041` |
| `pure.log` | `0b67e2a72a7a04ce85aa6bcbbcb55a761a8fefb6d313e4673d28d6f732bb03e2` |
| `fixture.log` | `9bf27c4cfe35d2638c31d3a9260903cb9b8baa1658d4ca7ce35358ee147649c0` |
| `replica-proof.tar` | `4b8c004e7555bb50d014132aafacf429c845cfdfa654c3a55c260aa6ad76537f` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/producer-trust-replicas.ts` | `e91bc7567f32c2151bd5b6fee9c52c159fc96ce3c3a2f78d5eaad67ec4cfb2d2` |
| `apps/web/src/ag-ui/producer-trust-replicas.spec.ts` | `084e08ace649ef44102a33ca637fed0c49bc4517cdbaaf9759bb36f65d3a30d9` |
| `scripts/lab-26s-replica-review.py` | `ab828f523fa2e80594ffa43863c10db0b49d7d7004faf1cbe6dd4732974740c7` |

### Remaining gates and next laboratory

**2.6S selected root/two SQLite replicas PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
The former primary can still write while isolated, so quorum, distributed
storage correctness, trusted external fencing and production readiness are NOT
proven. Next proposed: **2.6T AG-UI external fencing and replica-consistency evidence gates** — investigate external fencing,
replica-consistency controls, authoritative epochs and independent failover
integrity evidence before any adapter or milestone closure.

## 2.6T — Local external SQLite writer authority and independent replica consistency gates (scoped completion)

Against published 2.6S baseline `32e129bd72a111cab3c0d36f2dd152071880219c`, the WSL audit passed
**250/250** selected TypeScript assertions, **43/43** local RS256/SQLite
fixture checks, **11/11** critical TypeScript cases and **five** gates (lint,
production build, SSR compilation, pure execution and isolated fixture).
The original eight physical evidence artifacts are SHA-256 pinned below.

### Verified behavior and unresolved security boundaries

- The TypeScript 2.6T layer composes the published 2.6S through 2.6J pure
  contracts via injected callbacks. Its simulated authority/ticket/replica
  snapshots are **not** cryptographic, TLS or operational authorization proofs.
- The separate Python fixture used ephemeral local RSA keys for a signed
  fencing grant and signed producer envelopes. No enterprise trust anchor,
  external identity provider, online JWKS or real AG-UI event producer was used.
- A **third separate local SQLite file** acted as a writer authority for two
  independently stored SQLite replicas, all on **ONE host**. A selected writer
  held its authority `BEGIN IMMEDIATE` transaction during local commit;
  simulated promotion serialized on the same authority lock. Obsolete ticket,
  wrong node, stale epoch, failed authority and stale revocation were denied.
- After promotion to node-B epoch 2, isolated node-A still reported its own
  local leader role (epoch 1), but the *fenced test API* refused its writes.
  Two independent processes contending for authority produced exactly one
  accepted new commit and one rejected stale writer.
- Crucial unsolved bypass: a writer that accesses the replica SQLite directly
  still writes without consulting authority. The fixture demonstrated this on
  a disposable **unarchived copy**, without contaminating archived evidence.
  No mandatory writer enforcement or protection against all split-brain writers
  has been demonstrated.
- The simulated promotion modifies separate SQLite files in **sequential
  transactions**, not one crash-atomic transaction across databases. There is
  no quorum, consensus, cross-host durability, replicated leadership authority
  or production-grade fencing SLA. The local authority is a single failure point.
- The `fencing-proof.tar` contains exactly three independent, WAL-checkpointed,
  self-contained SQLite databases (`authority.sqlite3`, `node-A.sqlite3`,
  `node-B.sqlite3`). Authority points to node-B, epoch 2; node-A has one receipt
  (revision 1, old leader), node-B three receipts (revision 3, new leader).
  Divergence is recorded, **not** falsely claimed to be resolved.
- No operational Agent Server or web adapter integration, real producer
  identity, enterprise ACL, independent normative AG-UI 1.0 conformance,
  media/DLP assessment or security sign-off occurred. **G1–G9 OPEN;
  parent 2.6 OPEN; adapter BLOCKED.**

### Approved WSL evidence and pinned references (outside Git)

- Approved run: `~/masl-evidence/masl-26t-agui-32e129b-20261119T140730Z`. This finalizer checks all
  eight physical SHA-256 pins, original report metadata, 11 critical TS cases,
  and **all three SQLite databases in memory** without writing evidence or
  rerunning the network/cryptographic tests.
- Frozen upstream AG-UI 1.0 `2330368a2a74573902858867072406638ba3073d`, official schema SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`,
  schema Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78` (31 event variants), workshop `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `77db51fd1ed193007d758bdc39d0fdf0ca9bfe8fbb98d3045988e67ac08237eb` |
| `review.md` | `1148053675feb1b727fe3709c65c9e9be61600e2514f7728b7dece5a06ac22b7` |
| `lint.log` | `f5be8ee6e853d68feadadedfcd95f3fe473cb8c62a378456e5b7135355b8ab4a` |
| `build.log` | `1fe9cf5d891666e89a9e940c5597f8a1ca2252c006c753fe7eded97f1c78f4ae` |
| `compile.log` | `3f3d33ce6ba087857f91f976f064179e1d117a2b8c8cf2074db5ae8444cc67e6` |
| `pure.log` | `19ad0fbd81a28d4a2d4606fe40d67fec0d5c506fcad93ff34d56aa0be63df6b6` |
| `fixture.log` | `ee2f2fd5cba3f3154ee77836e5b9e02c2216dffc1119123910d2f40be29677d2` |
| `fencing-proof.tar` | `9d73b3ecd9292e5dbeb0ff8b4132127674f75799cde16c375468d7aef4a49114` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/external-fencing-consistency.ts` | `4c24fdc9eee353f021d097265fe0081167b34bf75f9fd56f8a650a1f5b7d83e5` |
| `apps/web/src/ag-ui/external-fencing-consistency.spec.ts` | `6aaff939a0c3907e00e11c4b0a0f4c555be7d61f4d1b721f982a8b13f7510f3a` |
| `scripts/lab-26t-fencing-review.py` | `c5fa7fb6813d67c02cc9bc37fd964d151f16c528d559a00bcc56dc884e4c30b3` |

### Remaining gaps and next sub-block

**2.6T local fencing API PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
The authority serialized *selected* writes and promotions, but direct writes
still bypassed it and promotion was not crash-atomic across stores. Next proposed:
**2.6U AG-UI mandatory fencing enforcement and crash-consistent promotion gates** — investigate mandatory enforcement at the storage boundary,
writer-token expiry and crash-recovery consistency before considering an
operational AG-UI adapter or milestone closure.

## 2.6U — Guarded SQLite broker and local crash-recovery promotion journal (scoped completion)

Against published 2.6T baseline `ace5da75a78c1dee1af32fdde7d6fa1f4ee3cc13`, the WSL audit passed **348/348**
selected TypeScript assertions, **39/39** local broker/SQLite/RS256 checks,
**13/13** critical TypeScript cases and all **five** gates (lint, production build,
SSR compilation, pure execution and isolated crash-recovery fixture). The eight
original physical evidence files remain outside Git, pinned by SHA-256 below.

### Proven experimental behavior and explicit limits

- The TypeScript 2.6U contract composes the published 2.6T through 2.6J pure
  gates using injected broker/journal observations. Those callbacks are not
  authenticated event producers, actual SQL operations or an Agent Server adapter.
- The Python fixture uses a **test RSA root**, signed producer envelopes and
  signed fencing grants. The three independently persisted SQLite databases
  (authority, node-A and node-B) run on **ONE host**. No deployed identity
  provider, network-separated authority, quorum, consensus or enterprise PKI.
- A Python SQLite `set_authorizer` rejects unadmitted writes **only on the
  connection opened by the controlled broker**. The experiment deliberately
  confirms that a same-UID writer opening a replica SQLite file directly can
  bypass the authorizer. Thus **mandatory universal fencing remains OPEN**.
- The local authority maintains a durable promotion intent journal with
  `prepared`, `replica-applied` and `stable` phases. Real child OS processes
  terminated with `os._exit` after the first two phases; a separate recovery
  run reconciled the persisted journal, authority and replica receipt state.
  These selected scenarios passed, but independent store commits are **not**
  crash-atomic, and this is not proof of arbitrary fault tolerance.
- Selected broker commits fail closed while promotion is pending, with missing
  authority, bad signed ticket, stale leader or conflicting registered sequence.
  Corrupted replica receipt/registry state or unknown journal phase blocks
  recovery rather than silently publishing an inconsistent leader.
- The archived `mandatory-proof.tar` has exactly three self-contained SQLite
  snapshots: authority with stable journal and node-B leader in epoch 2;
  node-A with one receipt at revision 1 and a stale local leader role;
  node-B with two receipts at revision 2. No cross-store atomicity or
  automated production fencing guarantee can be inferred.
- No real AG-UI event producer, operational Agent Server adapter, enterprise
  ACL/security/DLP review, independent normative AG-UI 1.0 conformance or
  cross-host durability was demonstrated. **G1–G9 OPEN; parent 2.6 OPEN;
  adapter BLOCKED**.

### Approved WSL evidence and frozen references (outside Git)

- Run: `~/masl-evidence/masl-26u-agui-ace5da7-20261119T144459Z`. The finalizer checks all eight
  original SHA-256 hashes, report and assertions, and inspects the three
  immutable SQLite snapshots **in memory**, without extracting or writing them.
- Frozen AG-UI upstream `2330368a2a74573902858867072406638ba3073d`, official 1.0 schema SHA-256 `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`,
  Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78` (31 event variants), workshop `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `86be41a9caff8aae6092c97d4b7e560bc8c2890196d64e4dad1a8ab3e9ff6202` |
| `review.md` | `0f1a6950add01217bf1bca152e4d2f3e1dddec8f894d81de6eebade373f5e311` |
| `lint.log` | `668201fc10285d3415841ad35755b32e13fcb087b26f3b2e43bf542f09b18495` |
| `build.log` | `3be8e935d84ff221d62d64e743a1c751c1dcc4aa30f839eafef7f515428af65c` |
| `compile.log` | `0284c54531cf714b5864d629ba6cc053819301f1da5e8a99b184691a266853fd` |
| `pure.log` | `802fbb31bbc98d6ff9c90f6d177759588345a035749508352f77053b672ca025` |
| `fixture.log` | `1ac2d6e21a020a648034a4d02f560bd5a808902dfe48f1bb47a88b9fffc244a2` |
| `mandatory-proof.tar` | `00ca33ed071d2c2210f1775b4b0c422c32a3dd176ae3a784fee802aba2a1ac0e` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/mandatory-fencing-promotion.ts` | `028d9df28c815dddd77343e79b1f3df59e25ee568612275ac635ac359ce5497f` |
| `apps/web/src/ag-ui/mandatory-fencing-promotion.spec.ts` | `a471c65c48864a7174b0bb31a2acfb16ff3b41030d31083bcc6a2afffa677d9b` |
| `scripts/lab-26u-mandatory-review.py` | `f74296d81f5fb9166002899818baa25b62329e65558c521c6483b7f423f863c4` |

### Remaining gates and next laboratory

**2.6U selected broker/journal crash-recovery PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
The SQLite connection authorizer cannot enforce protection against direct
file access by the same identity; recovery was selected local crash replay,
not an atomic distributed transaction. Next proposed: **2.6V AG-UI storage-isolation and fail-stop writer enforcement gates** —
investigate actual OS-level storage isolation, exclusively mediated write
identities, failure-safe promotion and recovery across independently persisted
stores before any operational adapter or milestone closure.

## 2.6V — Local UNIX socket owner, voluntary seccomp and fail-stop recovery (scoped completion)

On published 2.6U baseline `55080d65044fb14da37d8c8f432c377fc3fad0e1`, the WSL review passed **487/487**
selected TypeScript assertions, **72/72** local owner/SQLite/Python assertions
(39 published 2.6U regressions and 33 new checks), **14/14** critical TypeScript
markers and all **five** gates (lint, production build, SSR compilation,
pure execution, and isolated owner/socket/crash fixture). Eight immutable
SHA-256-pinned physical evidence artifacts remain outside Git.

### Verified behavior and explicitly unresolved isolation boundary

- The 2.6V TypeScript pure review composes published 2.6U through 2.6J
  via injected fixture observations. It does not consume the actual SQLite
  files, socket credentials, Linux seccomp status or real AG-UI producer events.
- The separate Python fixture ran a SQLite-owning OS process with a local
  UNIX socket endpoint and restrictive DAC modes (`0700` owner directory;
  `0600` files/socket). The owner mediated selected commit/reconcile calls.
  This is **same-UID** process separation, not identity separation by Linux UID.
- A test client voluntarily installed Linux `seccomp` restrictions when the
  kernel allowed it. In that selected mode, opening the SQLite file was
  blocked for the confined client while the UNIX RPC remained usable.
  Whether this was available on the selected WSL run is retained in the
  `review.json` and `fixture.log`; **no enforcement is claimed if unavailable**.
- A disposable unsandboxed **same-UID** connection directly modified SQLite
  without consulting the owning broker. Because `seccomp` is opt-in and
  discretionary modes do not isolate same-UID processes, universal
  mandatory fencing **remains unproven**. The bypass did not contaminate the
  three archived databases.
- The owner committed a receipt and intentionally terminated its process
  after COMMIT without returning the ack. A restarted owner reconciled the
  exact receipt without duplicating the write. A second real child process
  terminated after durable `prepared` promotion; while pending, the broker
  denied commits. Selected recovery checked receipt prefix and published
  node-B epoch 2 after reconciling the standby.
- The three independently stored SQLite files share **ONE host**: authority
  journal stable at node-B epoch 2; node-A at revision 2 with two receipts;
  node-B at revision 3 with three receipts. The prefix agrees, but node-A
  remains lagging. This is not cross-host durability, quorum, consensus or
  crash-atomic promotion across independent storage transactions.
- The test did **not** establish cross-UID storage isolation, reliable kernel
  policy deployment, operational external trust/ACL, authenticated production
  AG-UI event provenance, normative conformance, media/DLP approval,
  independent security sign-off or a real Agent Server adapter.
  **G1–G9 OPEN; parent 2.6 OPEN; adapter BLOCKED.**

### Approved audit and frozen references (outside Git)

- WSL review directory: `~/masl-evidence/masl-26v-agui-55080d6-20261119T152349Z`. The finalizer
  checks all eight original physical SHA-256 pins, report metadata, all
  selected assertion labels, and the three SQLite snapshots **read-only in
  memory**. It does not rerun seccomp, subprocess fault injection or Git writes.
- Pinned official AG-UI upstream `2330368a2a74573902858867072406638ba3073d`, 1.0 schema SHA-256
  `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`, Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78` (31 event variants), workshop
  reference `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `8e65e63f0bdb484e9ace6436c4b922a2c476c8620b6257cb110e25497f51eff4` |
| `review.md` | `a73750f74d322e1a2596d102c4a6685596b4bf7d7a06dd2b6b6afb2dbd0b1b09` |
| `lint.log` | `1be64f526b076b5a9c516291c1c4378423095b4eb9d105487bf0f9f14ebc5745` |
| `build.log` | `df895321469fc4ac5a7e0f2467ae9e0390a2b88dac7604c0da7cadc47846a892` |
| `compile.log` | `a39c92caba0bad42a67d0465c0b8111940a147619bda78f52e3c05af0adc2688` |
| `pure.log` | `168b1d5b137f38edc7b009e002227db20ed20bad6bec982b6e0ba36fac6b2181` |
| `fixture.log` | `8bd8064f52338aeadc40f7a6400bfdf09b7ebcd0a31f198d7341a5f527466137` |
| `storage-isolation-proof.tar` | `1a44e05236624659a6c5581d8131ccef855ab04440df3d54846bc79b0ef0d434` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/storage-isolation-failstop.ts` | `129f50288e80de013f97f073becc97b6bc94671bcb36287f694c28a9da080f38` |
| `apps/web/src/ag-ui/storage-isolation-failstop.spec.ts` | `e053b19505fed76a5142f456d4b3782e782aede6b0a0a922600c7cd3742b59a6` |
| `scripts/lab-26v-storage-review.py` | `3e36c42aeca3625ccc625a5545af55c79b0cb1168b7e31bc5c3143bb1d8302fe` |

### Remaining gates and next laboratory

**2.6V selected owner/socket/seccomp-rehearsal PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
The local same-UID direct-file bypass remains possible; selected restart and
promotion recovery do not prove arbitrary distributed fault tolerance.
Next proposed: **2.6W AG-UI cross-UID storage ownership and enforced mediation gates** — examine distinct OS principal ownership,
file/socket ACL, non-bypassable writer mediation and safe recovery before any
real adapter or milestone closure.

## 2.6W — Real cross-UID Linux DAC and owner-mediated UNIX socket recovery (scoped completion)

Against the published 2.6V baseline `e005fc7d5a67612124b13cda048fc3f5c8b86d11`, the selected WSL audit passed
**639/639** pure TypeScript assertions, **106/106** Python assertions
(72 published 2.6V regressions and 34 new cross-UID checks), **12/12**
critical cases and all **five** gates (lint, production build, SSR compilation,
pure execution and isolated Linux kernel/SQLite fixture). Eight original
physical evidence artifacts remain outside Git, pinned by SHA-256 below.

### Selected OS-enforced evidence and security limitations

- The 2.6W TypeScript pure contract composes published 2.6V through 2.6J
  using injected observations, not direct access to Linux UIDs, file ACLs,
  socket credentials or real AG-UI event provenance.
- The separate Linux Python fixture, explicitly authorized with `sudo -v`,
  used a privileged helper to launch an unprivileged **owner UID 61001**,
  **authorized client UID 61002** and **outsider UID 61003**, without creating
  persistent Linux accounts. The helper itself can override discretionary
  access controls and is not protected by this experiment.
- Linux DAC enforced owner-only access to the SQLite storage directory (`0700`)
  and its three SQLite files (`0600`). The different-UID authorized client was
  denied direct read/write/create/open operations while its UNIX RPC through
  the owner remained usable. This evidence is kernel-enforced for the selected
  unprivileged client, unlike the voluntarily installed seccomp of 2.6V.
- The UNIX socket had owner UID 61001 and client group 61002 with mode `0660`.
  An unrelated third UID was denied socket connection by DAC. Even after the
  test made socket permissions temporarily permissive, the owner's `SO_PEERCRED`
  check rejected the outsider. No network PKI/OIDC or production service identity
  was involved.
- The owner intentionally exited after durable COMMIT without returning an
  acknowledgment; an independent restarted process under UID 61001 reconciled
  exactly the existing receipt without an extra write. While the owner was
  unavailable, selected requests failed closed. The owner subsequently promoted
  node-B to epoch 2 and rejected obsolete node-A and stale-epoch writes.
- The archived `crossuid-proof.tar` contains **three independently stored**
  SQLite files and `uid-proof.json`. The authority ended stable at node-B epoch 2,
  node-A retained one receipt (revision 1, epoch 1), and node-B had two receipts
  (revision 2, epoch 2). The matched receipt prefix does **not** establish
  complete replica convergence or atomic multi-store failover.
- The three databases and socket ran on **ONE host**, in disposable `/tmp`
  storage. Root, owner compromise, arbitrary privilege-escalation attacks,
  operational deployment ACL, namespace escapes, quorum, distributed durability,
  cross-store crash atomicity, independently authenticated AG-UI production
  events, media/DLP and security sign-off were **not** proven.
  **G1–G9 OPEN; parent 2.6 OPEN; adapter BLOCKED**.

### Approved WSL evidence and pinned references (outside Git)

- Approved run: `~/masl-evidence/masl-26w-agui-e005fc7-20261119T162840Z`. The finalizer validates
  all eight physical hashes and immutable `uid-proof.json`/three SQLite
  snapshots **in memory**. It does not rerun `sudo`, mutate evidence, or
  change the security configuration of the executing machine.
- Frozen AG-UI upstream `2330368a2a74573902858867072406638ba3073d`, official 1.0 schema SHA-256
  `4b5c93226838a0e72d88e6c5df20633c686c49fcb75d9be2815c6cbf9e48e71a`, Git blob `c2ce3c18036b6bb2afe583a9b916959e7dcd9b78` (31 event variants), workshop
  `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.

| Evidence artifact | SHA-256 |
|---|---|
| `review.json` | `d50230100af7bec4766bd4d7ea80a1432abc8cfd6c2df82d894dc789bb8e8c3b` |
| `review.md` | `de9bcbcc211611ecf17aee955999efcc3620c9c5f035be006fdee03fef5a5db1` |
| `lint.log` | `31abdcf9c2cc52b11b997b4c2c1fe691ea63194b5922c20a0563dc755cf32c18` |
| `build.log` | `9f64e8dcd78889004af40e765bc214d8f5d378a640a46c3ffdf2de31d9f154e8` |
| `compile.log` | `ef375f481292c9fc746b89a27155b76cc39c416b7b4f9e908f19bef7945c4290` |
| `pure.log` | `35395e2f2f7c3ed7d2e985bd35dd9b1e468fcbadc2bb68cf93a15929d13ab3c5` |
| `fixture.log` | `7b5a17b601dea43e673c542f3985a7b538cf151a073890b3b56861c1571dedd8` |
| `crossuid-proof.tar` | `a835becd798b9d99c56219cde054586ec076f1282a1c660e6a72b49af892609d` |

| Source artifact | SHA-256 |
|---|---|
| `apps/web/src/ag-ui/cross-uid-storage-mediation.ts` | `d89ab3f022121bc9d289f9d00fd216576931cfb3b97b50cee122ee7f018d1477` |
| `apps/web/src/ag-ui/cross-uid-storage-mediation.spec.ts` | `8ace5623aa7722ff536cb7e1981477ea5bb8fe6269724774fed50aca43068a93` |
| `scripts/lab-26w-crossuid-review.py` | `eb575fe0ec11b77cca14fced54d784d578502945ab1927e725aa6287eb018add` |

### Remaining gaps and next laboratory

**2.6W selected cross-UID Linux DAC/SO_PEERCRED PASS; G1–G9 OPEN; adapter BLOCKED; parent 2.6 OPEN.**
A cross-UID client cannot directly access SQLite under the selected Linux
permissions, but root and the owner identity remain trusted, while separate
SQLite authority and replica commits are not distributed-atomic. Next proposed:
**2.6X AG-UI cross-UID runtime hardening and failure-isolation gates** — investigate stronger process identity provisioning,
privilege separation and failure isolation without overstating operational
readiness or advancing a real Agent Server adapter.
