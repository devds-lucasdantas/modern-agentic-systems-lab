#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web"
SRC = WEB / "src"


class Gate:
    def __init__(self) -> None:
        self.failed: list[str] = []

    def check(
        self,
        name: str,
        condition: bool,
        detail: str | None = None,
    ) -> None:
        status = "PASS" if condition else "FAIL"

        if detail:
            print(f"{status:4}  {name}: {detail}")
        else:
            print(f"{status:4}  {name}")

        if not condition:
            self.failed.append(name)

    def finish(self) -> None:
        print()

        if self.failed:
            print("FAILED:")
            for name in self.failed:
                print(f"  - {name}")
            raise SystemExit(1)

        print("PASS: frontend baseline architecture")


def text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def ts_files(path: Path) -> list[Path]:
    return sorted([
        *path.rglob("*.ts"),
        *path.rglob("*.tsx"),
    ])


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def source_blob(path: Path) -> str:
    return "\n".join(
        text(file)
        for file in ts_files(path)
    )


gate = Gate()

print("===== REQUIRED STRUCTURE =====")

required = [
    WEB / "package.json",
    WEB / ".env.example",

    SRC / "domain" / "ids.ts",
    SRC / "domain" / "run.ts",
    SRC / "domain" / "state.ts",
    SRC / "domain" / "message.ts",

    SRC / "transport" / "agent-server" / "client.ts",
    SRC / "transport" / "agent-server" / "decode.ts",
    SRC / "transport" / "agent-server" / "mappers.ts",

    SRC / "app" / "config.ts",
    SRC / "app" / "runtime-context.ts",
    SRC / "app" / "runtime-provider.tsx",
    SRC / "app" / "use-runtime.ts",
    SRC / "app" / "use-runtime-overview.ts",

    SRC / "execution" / "message-projector.ts",
    SRC / "execution" / "use-execution.ts",

    SRC / "components" / "AppShell.tsx",
    SRC / "components" / "ExecutionSurface.tsx",
    SRC / "components" / "MessageList.tsx",
]

for path in required:
    gate.check(
        relative(path),
        path.is_file(),
    )


print()
print("===== DEPENDENCY DIRECTION =====")

domain_blob = source_blob(
    SRC / "domain",
)

gate.check(
    "domain has no React dependency",
    not re.search(
        r"""from\s+['"]react(?:/[^'"]*)?['"]""",
        domain_blob,
    ),
)

gate.check(
    "domain has no transport dependency",
    not re.search(
        r"""from\s+['"][^'"]*transport[^'"]*['"]""",
        domain_blob,
    ),
)

gate.check(
    "domain has no application dependency",
    not re.search(
        r"""from\s+['"][^'"]*app[^'"]*['"]""",
        domain_blob,
    ),
)

gate.check(
    "domain has no execution dependency",
    not re.search(
        r"""from\s+['"][^'"]*execution[^'"]*['"]""",
        domain_blob,
    ),
)

gate.check(
    "domain has no browser configuration",
    "import.meta.env" not in domain_blob,
)

gate.check(
    "domain has no fetch",
    re.search(
        r"\bfetch\b",
        domain_blob,
    ) is None,
)


transport_blob = source_blob(
    SRC / "transport",
)

transport_imports = re.findall(
    r"""from\s+['"]([^'"]+)['"]""",
    transport_blob,
)

forbidden_transport_segments = {
    "app",
    "components",
    "execution",
}

transport_cross_layer_imports = [
    specifier
    for specifier in transport_imports
    if forbidden_transport_segments.intersection(
        Path(specifier).parts
    )
]

gate.check(
    "transport does not depend on React app",
    not transport_cross_layer_imports,
    (
        "none"
        if not transport_cross_layer_imports
        else ", ".join(transport_cross_layer_imports)
    ),
)


print()
print("===== IDENTITY INVARIANTS =====")

ids = text(
    SRC / "domain" / "ids.ts",
)

gate.check(
    "ThreadId is branded",
    "Brand<string, 'ThreadId'>" in ids,
)

gate.check(
    "RunId is branded",
    "Brand<string, 'RunId'>" in ids,
)

gate.check(
    "AssistantId is branded",
    "Brand<string, 'AssistantId'>" in ids,
)

gate.check(
    "ThreadId and RunId remain distinct",
    (
        "Brand<string, 'ThreadId'>" in ids
        and "Brand<string, 'RunId'>" in ids
    ),
)


print()
print("===== RUNTIME SEMANTICS =====")

execution = text(
    SRC / "execution" / "use-execution.ts",
)

surface = text(
    SRC / "components" / "ExecutionSurface.tsx",
)

projector = text(
    SRC / "execution" / "message-projector.ts",
)

gate.check(
    "execution creates stateful Run",
    "client.createRun" in execution,
)

gate.check(
    "execution polls Run explicitly",
    "client.getRun" in execution,
)

gate.check(
    "execution refreshes ThreadState separately",
    "client.getThreadState" in execution,
)

gate.check(
    "message projection comes from ThreadState",
    "projectMessagesFromState" in execution,
)

gate.check(
    "message projector handles persisted human",
    "'human'" in projector,
)

gate.check(
    "message projector handles persisted ai",
    "'ai'" in projector,
)

gate.check(
    "UI renders Run status separately",
    "Run status" in surface
    and "run?.status" in surface,
)

gate.check(
    "UI renders graph position separately",
    "Graph next" in surface
    and "state.position.next" in surface,
)

gate.check(
    "UI states Run/graph invariant",
    "Run status ≠ graph position" in surface,
)

gate.check(
    "first execution uses reject multitask policy",
    "'reject'" in execution,
)


print()
print("===== TRANSPORT BOUNDARY =====")

client = text(
    SRC / "transport" / "agent-server" / "client.ts",
)

decoder = text(
    SRC / "transport" / "agent-server" / "decode.ts",
)

gate.check(
    "browser fetch binding is explicit",
    "globalThis.fetch.bind(globalThis)" in client,
)

gate.check(
    "transport accepts unknown payloads",
    "value: unknown" in decoder,
)

gate.check(
    "transport has decode error",
    "AgentServerDecodeError" in decoder,
)

gate.check(
    "REST client exposes ThreadState",
    "getThreadState" in client,
)


print()
print("===== PRE-STREAMING BASELINE =====")

package = json.loads(
    text(WEB / "package.json")
)

dependencies = {
    **package.get("dependencies", {}),
    **package.get("devDependencies", {}),
}

for forbidden in [
    "@langchain/langgraph-sdk",
    "@ag-ui/client",
    "@ag-ui/core",
    "ag-ui",
]:
    gate.check(
        f"dependency absent: {forbidden}",
        forbidden not in dependencies,
    )

all_source = source_blob(SRC)

gate.check(
    "no EventSource implementation yet",
    "new EventSource" not in all_source,
)

gate.check(
    "no WebSocket implementation yet",
    "new WebSocket" not in all_source,
)

gate.check(
    "no Last-Event-ID implementation yet",
    "Last-Event-ID" not in all_source,
)

gate.check(
    "no text/event-stream implementation yet",
    "text/event-stream" not in all_source,
)


print()
print("===== CONFIGURATION =====")

config = text(
    SRC / "app" / "config.ts",
)

env_example = text(
    WEB / ".env.example",
)

gate.check(
    "Runtime URL comes from Vite environment",
    "VITE_AGENT_SERVER_URL" in config,
)

gate.check(
    ".env.example documents Runtime URL",
    "VITE_AGENT_SERVER_URL=" in env_example,
)


print()
print("===== TEMPORARY SOURCE ARTIFACTS =====")

temporary = sorted(
    path
    for path in SRC.glob("__*-check.*")
)

gate.check(
    "no temporary source artifacts",
    not temporary,
    (
        "none"
        if not temporary
        else ", ".join(
            relative(path)
            for path in temporary
        )
    ),
)


gate.finish()
