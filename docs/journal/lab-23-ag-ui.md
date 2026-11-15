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
