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

**2.5A–2.5C complete within the scoped gates.** The 2.5D closure and updated
limitations appear below; the parent milestone remains OPEN for 2.5E.

## 2.5D — Streaming and confidentiality boundaries (scoped completion)

On baseline `f0e9622c803f4890a3a2194610f8d9dfb5210308`, after 2.5A–C had been committed, the existing Agent
Server decoder was extended to recognize the observed `messages/complete`
family. The stream projector intentionally ignores this completion event:
it does **not** replace `values`, imply graph END, create a tool lifecycle
channel, or establish persisted ThreadState authority. Previously unknown
families remain unknown; malformed JSON remains non-authoritative.

The generic `MessageList` now uses a separate **display-only projection**:
- every `ToolMessage` has its raw text/data/name replaced by one explanatory
  placeholder;
- non-text message blocks for other roles are masked;
- ordinary user/assistant/system textual blocks, message identities, counts
  and order are preserved;
- raw domain messages and ThreadState remain unchanged.

This is a presentation-level boundary, **not** application-wide DLP or a
transport/server redaction guarantee. Text free-form output may still echo
secrets, and payloads still exist in memory/Runtime/other consumers. The
sanitized 2.5C tool panel still does not authorize or execute tool actions.

### Verified model-free gates

- Oxlint: zero warnings and zero errors.
- Production TypeScript/Vite build: PASS.
- Pure display/stream boundary assertions: **33/33 PASS**.
- Chromium with pinned disposable LangGraph Runtime: **6/6 PASS**, comprising
  three 2.5D scenarios (persisted `ToolMessage` concealment, injected opaque
  payload/name concealment while preserving ordinary text, and streamed Run
  reconciliation) and the original three 2.5C regression scenarios.
- The first browser attempt failed at a *test locator*, not a confirmed
  functional failure. The helper's ambiguous strict locator was corrected;
  the full **6/6 rerun** passed. Only the test file changed in that hotfix.
- Runtime stopped cleanly before temporary workspace cleanup. No external
  model calls, repository Git writes or pinned reference changes.

Evidence capture directory: `/tmp/masl-25d-final-wQvNRn17`. The Chromium log is copied from the
successful post-fix run; the lint/build and 33 pure tests are rerun by the
2.5D capture helper. Evidence log hashes:

| Gate | SHA-256 |
|---|---|
| `build.log` | `9344ad9a5d19f37c9c11d7735bc2c7ecd1f89723690d7bf53e948f4f213d83a6` |
| `chromium.log` | `f068273b671067087187cea851183438ca3eaa05ee90127699eb2ee915af2305` |
| `lint.log` | `695f3e38d7794e408fcc663c8ee3ad626b64a968a8acba3a51a372182964c0ac` |
| `pure-compile.log` | `519da242d4139adf051a7893e76026c1cefe397b5c21723951d41500d7cf7777` |
| `pure.log` | `2ad066c562889a3d6e7ed93c4460217ac788f47963f5985666bc54f5972bd848` |

Original 2.5D Runtime log: `/tmp/masl-25d-runtime-13440.log` (SHA-256 `64cd1eafbb9196cad13b6a76447b49336512c3486ad2ef038806b69615e122f2`).

Exact eight implementation payload SHA-256 values (including the test-only
Chromium locator fix):

| Path | SHA-256 |
|---|---|
| `apps/web/e2e/tool-boundaries-ui.spec.ts` | `2cd88366ce9ad61ed18b4667f721f8d15a3e6a4905fd8c057591d2a111b0953c` |
| `apps/web/playwright.tool-boundaries.config.ts` | `3bce00fad61536a550b21903a6b5d8b76331a30bc88f71ab7998d50a00cef06c` |
| `apps/web/src/components/MessageList.tsx` | `f83675f8bd50cabbe2bb73c97f3787f0bc7349f6279191d12ec0739c8a9af3d3` |
| `apps/web/src/execution/message-display.spec.ts` | `a5981480b45f823c4c9b5bae6c631afeebede50413d3024d01b04dd6c54ff5cf` |
| `apps/web/src/execution/message-display.ts` | `780dc6440e6e884de0993581423c69ec7068afb966f72dc45d288e7ae630ef27` |
| `apps/web/src/execution/stream-projector.ts` | `d54229d3ee2fc22088efce43c3f53680ddd73d2d5cc7dc7bef5eeffb528cbdd7` |
| `apps/web/src/transport/agent-server/stream-events.ts` | `75d1097358de0fb5d8e464052b250023034243404e8f34d5b8d54d07a211f391` |
| `scripts/lab-25d-tool-browser.py` | `990cb35f6a3c3dd05cde57623855d365606dbb0f4d26c883aaf8bc1736ca41ac` |

### Scope and deferred guarantees

This checkpoint does not establish server authorization, idempotency,
checkpoint CAS, external side-effect success, exactly-once tools, multi-client
locks or a general confidentiality policy. The Runtime is a pinned local dev
instance (`auth=noop`, `langgraph-api 0.8.1` EOL). Broader model-dependent
2.2/2.3 end-to-end suites are not included. Historical runners 2.5A/2.5C/2.5D
retain exact pre-commit guards; executing them after this checkpoint requires
an explicit new review-compatible replay rather than bypassing their guards.

**2.5D complete within the scoped validation.** The 2.5E closure below
supersedes the earlier OPEN status of the parent milestone.

## 2.5E — Frontend tools baseline review (scoped closure)

The nine-gate review on **Git HEAD `8747c78832a74064e1abdf96aa3b8e99bef6a313`** passed. It reran Oxlint and
the TypeScript/Vite production build, **42** pure tool-projection assertions,
**33** display/stream-boundary assertions, cross-checking a reproduced 2.5A
observation, and **6** Chromium cases against the pinned deterministic ToolNode
Runtime (3 original 2.5C cases and 3 additional 2.5D cases). There were no
model calls or repository writes during the review. The 2.5E auditor was the
only untracked file. The independent review reported a clean postflight.

### Evidence and provenance

- Review JSON: `/tmp/masl-25e-review-1saqiw7b/review.json` (SHA-256 `4a067eccb0e8ccdd8e5c8ed2fe0f28b50536f4d33c482cc14acbd90648fe11f9`).
- Review Markdown: `/tmp/masl-25e-review-1saqiw7b/review.md` (SHA-256 `3f6ca9a05c709dd74db1a06d4df1911eeae8e7b09d836bc122586e46926381e6`).
- Reviewed auditor: `scripts/lab-25e-review.py` (SHA-256 `4e791890c7726a59b44d2aa5132d0a480172e49c62f340fb437cf6eb37e4676e`).
- 2.5A historical JSON and Runtime log were **missing**, not restored,
  verified or assigned fabricated hashes. Historical reference values remain
  `ce9446be9408f694f5d8b1bb5fa3fd2d1408280e849f1136d03c386315b08a0c` (JSON) and `940a67eb13550448dd282d3960523debd1b73837f9b43aa7abdf7d7cb0c03910` (Runtime log).
- 2.5A was reproduced from the **tracked original source** with only its old
  worktree preflight replaced **in memory** to match the reviewed HEAD. The
  synthetic `AIMessage` called a real `ToolNode`; one ToolMessage correlated
  at graph END, with ten SSE records and no external model calls.
- Reproduction manifest: `/tmp/masl-25e-25a-replay-18230.json`
  (SHA-256 `4e97bdccb986808078929fd8927272082e098c4be26047d067fb6ca7c9bd993e`). Reproduced observation SHA-256 `a73ccdde2416d244641eac891f9ab367626930f2976f71b65158862e7d9d10e5`;
  reproduced Runtime log SHA-256 `555cc5ca4592a2bf099a08014d26144e07010be22d432640860a9a9d77102766`.
- 2.5E Runtime log: `/tmp/masl-25e-runtime-18947.log` (SHA-256 `e5759398f6f2f06ec09a85e11f5c27bf641d062c51f1b0727a020f23eef6f0b0`).

| Gate | Result | SHA-256 of evidence log |
|---|---|---|
| 2.5 lint | PASS | `7034c1c853feadf78de02a705aab5e138bb1bc5a15c4f37f37b10a961744dfa1` |
| 2.5 production build | PASS | `e0d40d1caf45952106e0cf600b982191e2a11793c923cc23828a2b92e61427d4` |
| 2.5B pure compilation | PASS | `280dd9e109dbd4a74e57a3570f19f06b3f256937f362ff9c3e9b157ef8e308d5` |
| 2.5B 42 pure assertions | PASS | `ffa2a9c3ee46f6fac2a80f65bc09e8e0a91dbfb6a403e6fbe44802aca201850c` |
| 2.5D pure compilation | PASS | `cf51de2028c22667ccee5042eecf107e57c1c3b759da9e660b632be97151d16e` |
| 2.5D 33 pure assertions | PASS | `d7ef30d8c0d3346eaf55149bdbefaac7c864659c74c4771001a597319b1b5c5c` |
| 2.5B projector compilation | PASS | `2e69faa208fba568e0a26d0c93d9dc4c3a7436561a765fada04977014bc5d382` |
| 2.5A observation cross-check | PASS | `cd58df4dbb0c580f85e530266cfac09aa491ed8c65f635287aebf69b10120d0a` |
| 2.5C and 2.5D Chromium | PASS | `01aba59f98e667df15a1fc79262ddcf1a4226c7fa460fc4de853e991fc0bdbbd` |

These machine-local `/tmp` evidence paths are ephemeral; the hashes and
review method are retained here, but the original logs are **not** embedded
in the repository. Historical 2.5A source guards remain unchanged.

### Scope retained after closure

- Tool calls were synthetic and model-free; correlated messages do not prove
  external side effects, user authorization, idempotency or exactly-once tools.
- The generic MessageList now conceals ToolMessages and structured blocks at
  **display time only**; raw state, transport and arbitrary free-form text are
  not application-wide DLP.
- `messages/complete` was observed as Agent Server SSE and is not an AG-UI
  tool lifecycle event, graph END, or authoritative persisted state.
- The pinned dev Runtime uses `auth=noop` and `langgraph-api 0.8.1` EOL.
  Server-side CAS, multi-client locks and production authorization were not
  established. The model-dependent 2.2/2.3 full suites were not rerun.

**2.5A–2.5E passed their explicitly scoped gates; the parent 2.5 Frontend
tools milestone is CLOSED within those boundaries.** Next: **2.6 AG-UI**,
starting with pinned protocol and integration-boundary discovery.
