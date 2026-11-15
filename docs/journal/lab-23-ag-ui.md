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
