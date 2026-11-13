# Lab 22 — Frontend tools

## 2.5A — Pinned ToolNode and SSE discovery

A deterministic, synthetic `AIMessage` emitted exactly one tool call, which a
real LangGraph `ToolNode` executed. A persisted `ToolMessage` carried the same
`tool_call_id`. Independent REST readback confirmed one successful Run,
`Thread.status=idle`, a checkpoint and graph END (`next=[]`). This demonstrates
tool execution and persistence, **not** model-selected tool invocation or
external side-effect safety. No external model calls occurred.

Observed pinned Agent Server SSE: `messages/complete=2`,
`messages/metadata=2`, `metadata=1`, `updates=2`, `values=3` (10 records).
No separate `tools` lifecycle event family was observed in this case.
`messages/complete` is currently classified as unknown in the existing
frontend stream-event decoder; it is not evidence of a separate `tools` channel.

Original observation: `/tmp/masl-25a-tools-observations-933.json` (SHA-256 `ce9446be9408f694f5d8b1bb5fa3fd2d1408280e849f1136d03c386315b08a0c`).
Original Runtime log: `/tmp/masl-25a-tools-runtime-933.log` (SHA-256 `940a67eb13550448dd282d3960523debd1b73837f9b43aa7abdf7d7cb0c03910`).
Experiment: `scripts/lab-25a-tool-contracts.py` (requires its original clean
pre-2.5B/2.5C worktree; not rerun during this review).

## 2.5B — Read-only persisted projection

`apps/web/src/execution/tool-projection.ts` reads the original persisted
`ThreadState` and correlates assistant `tool_calls` to `ToolMessage`s by ID.
The display summary includes only validated tool names, IDs, status and
bounded counts; it does **not** forward tool arguments, result content, or
arbitrary Thread metadata. Duplicated calls/results, orphan responses,
unknown formats and missing checkpoint are explicitly incomplete/unavailable.
The pure suite passed **42/42** assertions. The observation cross-check
reconstructed a structural `ThreadState` fixture using the verified 2.5A JSON,
without claiming that this fixture is a live Runtime integration.

## 2.5C — Read-only Chromium UI

`ToolObservationsPanel` is mounted separately in `ExecutionSurface` and
renders only selected-Thread persisted authority. It provides no buttons or
tool execution commands. In the isolated pinned Runtime, **3/3** Chromium
cases passed: one real correlated call/result, Thread switching without stale
tool data or Run POST, and orphan-result incompleteness without payload display.
Oxlint and production TypeScript/Vite build also passed.

## Reproducible evidence capture

The baseline remains Git HEAD `e1acf37eb34c9b3068d94eb1424d065d05537703` and pinned reference `3d3287cf1e51250934c11aff182d90ccfaf0e66d`.
The finalization runner checks the exact 10 2.5A-C implementation file hashes
and runs the following from the still-uncommitted worktree:

~~~bash
bash ~/masl-25abc-finalization/capture-25abc.sh "$PWD" \
  /tmp/masl-25a-tools-observations-933.json
~~~

Evidence log SHA-256 values:

| Gate | SHA-256 |
|---|---|
| `build.log` | `300bb8e8e1eaaa9491e645cc3ad4846242b40b5d551e5c4614bd62c115cd21f1` |
| `chromium.log` | `0b1675c2fdbcf837d93ae00ede892bca35a2fdab534f39b7a64a9784381b3c72` |
| `crosscheck.log` | `8ff8de91044cdf79622f22b74858244ce28383289f100bbb9fd7116d59b7a765` |
| `lint.log` | `0fb6479d09a6b979754ddfb4028bf89cc30bb2732645f056ef9a7de9ab3f0251` |
| `projector-compile.log` | `9f6afe6d7c73bc684264b4dfb49ff75347dd58a9643e0ce28830b8a331247630` |
| `pure-compile.log` | `a017e48bac9e8304cf49e56536858fc13f571e087c228c4e9c2e5916bd3b0935` |
| `pure.log` | `2ba271f0645ee11131fbc22ed5da2197116fc23ac36c539121cc4841c62821d3` |

2.5C Runtime log: `/tmp/masl-25c-runtime-15405.log` (SHA-256 `315f2f44c342d04bf82e3b0d3132ff345c02f90300ae684ea0fc90711861bc8e`).

## Explicit boundaries and next block

- The new tool panel is sanitized; **the existing `MessageList` still renders
  raw tool-message content**. No application-wide confidentiality guarantee.
- A matching `ToolMessage` is not proof of external effect, authorization,
  idempotency, exact-once execution or an atomic transaction.
- A successful Run does not by itself prove graph END; 2.5A used persisted state.
- The pinned dev Runtime uses `auth=noop` and `langgraph-api 0.8.1` is EOL.
- `messages/complete` and any future tool-lifecycle events must be treated
  according to their observed, versioned wire contracts; do not silently
  conflate agent-server SSE with another streaming protocol.
- 2.5A-C used deterministic, model-free gates. The broader model-dependent
  2.2/2.3 test suites were not included.

**2.5A–2.5C complete within the scoped gates. The parent 2.5 remains open.**
Next: **2.5D — Streaming and confidentiality boundaries**; then 2.5E baseline review.
