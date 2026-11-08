#!/usr/bin/env python3
"""Lab 2.3A: graph-aware updates, reducers and checkpoint lineage."""

import json
import os
import signal
import socket
import subprocess
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / ".reference/interrupt26-deepagents"
LOG = Path("/tmp/masl-23a-shared-state.log")

GRAPH_ID = "deep_agent"
MESSAGE_A = "lab-23a-msg-a"
MESSAGE_B = "lab-23a-msg-b"

with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    PORT = sock.getsockname()[1]

BASE = f"http://127.0.0.1:{PORT}"


def api(method, path, payload=None):
    data = (
        json.dumps(payload).encode("utf-8")
        if payload is not None
        else None
    )

    req = Request(
        BASE + path,
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(req, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except HTTPError as error:
        detail = error.read().decode(
            "utf-8", errors="replace"
        )
        raise RuntimeError(
            f"{method} {path}: HTTP {error.code}\n{detail}"
        ) from error


def print_json(label, value):
    print(f"\n===== {label} =====", flush=True)
    print(json.dumps(value, indent=2), flush=True)


def checkpoint_id(state):
    checkpoint = state.get("checkpoint")
    assert isinstance(checkpoint, dict), (
        "Missing checkpoint"
    )

    value = checkpoint.get("checkpoint_id")
    assert isinstance(value, str) and value
    return value


def messages_of(state):
    values = state.get("values")
    assert isinstance(values, dict)

    messages = values.get("messages")
    assert isinstance(messages, list)

    return messages


def assert_messages(state, expected):
    messages = messages_of(state)

    actual = [
        (message.get("id"), message.get("content"))
        for message in messages
    ]

    assert actual == expected, (
        f"Expected {expected}; got {actual}"
    )


def summarize(state):
    metadata = state.get("metadata") or {}
    parent = state.get("parent_checkpoint") or {}

    return {
        "checkpoint_id": checkpoint_id(state),
        "parent_checkpoint_id": parent.get("checkpoint_id"),
        "source": metadata.get("source"),
        "step": metadata.get("step"),
        "next": state.get("next"),
        "messages": [
            {
                "id": message.get("id"),
                "content": message.get("content"),
            }
            for message in messages_of(state)
        ],
    }


print(
    f"ISOLATED RUNTIME: {BASE}",
    flush=True,
)

process = None
thread_id = None

try:
    with LOG.open("wb") as log:
        process = subprocess.Popen(
            [
                "uv", "run", "--locked",
                "langgraph", "dev",
                "--config", "langgraph.json",
                "--host", "127.0.0.1",
                "--port", str(PORT),
                "--no-browser",
                "--no-reload",
                "--server-log-level", "warning",
            ],
            cwd=REFERENCE,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )

    for _ in range(120):
        if process.poll() is not None:
            raise RuntimeError(
                f"Runtime exited; inspect {LOG}"
            )

        try:
            api("GET", "/openapi.json")
            break
        except Exception:
            time.sleep(0.5)
    else:
        raise RuntimeError(
            f"Runtime readiness failed; inspect {LOG}"
        )

    print("PASS: Runtime ready", flush=True)

    created = api(
        "POST",
        "/threads",
        {
            "metadata": {
                "graph_id": GRAPH_ID,
                "lab": "2.3A",
                "purpose": "reducer-and-checkpoint-lineage",
            }
        },
    )

    thread_id = created["thread_id"]
    state_path = f"/threads/{quote(thread_id, safe='')}/state"

    initial = api("GET", state_path)

    print_json(
        "INITIAL STATE",
        {
            "thread_id": thread_id,
            "values": initial.get("values"),
            "checkpoint": initial.get("checkpoint"),
        },
    )

    assert initial["checkpoint"] is None

    def update(message_id, content):
        payload = {
            "values": {
                "messages": [
                    {
                        "type": "human",
                        "id": message_id,
                        "content": content,
                    }
                ]
            },
            "as_node": "__start__",
        }

        response = api(
            "POST",
            state_path,
            payload,
        )

        state = api(
            "GET",
            state_path,
        )

        assert (
            response["checkpoint"]["checkpoint_id"]
            == checkpoint_id(state)
        ), "Update response and Thread HEAD disagree"

        return response, state

    # Update 1: add the first message.
    response1, state1 = update(
        MESSAGE_A,
        "STATE_A_V1",
    )

    assert_messages(
        state1,
        [(MESSAGE_A, "STATE_A_V1")],
    )

    cp1 = checkpoint_id(state1)

    print_json(
        "UPDATE 1 RESPONSE",
        response1,
    )
    print_json(
        "STATE 1",
        summarize(state1),
    )

    # Update 2: add a message with a different ID.
    response2, state2 = update(
        MESSAGE_B,
        "STATE_B_V1",
    )

    assert_messages(
        state2,
        [
            (MESSAGE_A, "STATE_A_V1"),
            (MESSAGE_B, "STATE_B_V1"),
        ],
    )

    cp2 = checkpoint_id(state2)

    print_json(
        "UPDATE 2 RESPONSE",
        response2,
    )
    print_json(
        "STATE 2",
        summarize(state2),
    )

    # Update 3: revise the first message using the same ID.
    response3, state3 = update(
        MESSAGE_A,
        "STATE_A_V2",
    )

    assert_messages(
        state3,
        [
            (MESSAGE_A, "STATE_A_V2"),
            (MESSAGE_B, "STATE_B_V1"),
        ],
    )

    cp3 = checkpoint_id(state3)

    print_json(
        "UPDATE 3 RESPONSE",
        response3,
    )
    print_json(
        "STATE 3",
        summarize(state3),
    )

    # Every update should materialize a distinct checkpoint.
    assert len({cp1, cp2, cp3}) == 3

    parent2 = (
        state2.get("parent_checkpoint") or {}
    ).get("checkpoint_id")

    parent3 = (
        state3.get("parent_checkpoint") or {}
    ).get("checkpoint_id")

    print_json(
        "CHECKPOINT LINEAGE",
        {
            "checkpoint_1": cp1,
            "checkpoint_2": cp2,
            "checkpoint_3": cp3,
            "parent_of_2": parent2,
            "parent_of_3": parent3,
            "linear_lineage": (
                parent2 == cp1
                and parent3 == cp2
            ),
        },
    )

    assert parent2 == cp1
    assert parent3 == cp2

    # Historical reads must not mutate the current HEAD.
    history1 = api(
        "GET",
        f"{state_path}/{quote(cp1, safe='')}",
    )

    history2 = api(
        "GET",
        f"{state_path}/{quote(cp2, safe='')}",
    )

    assert_messages(
        history1,
        [(MESSAGE_A, "STATE_A_V1")],
    )

    assert_messages(
        history2,
        [
            (MESSAGE_A, "STATE_A_V1"),
            (MESSAGE_B, "STATE_B_V1"),
        ],
    )

    latest = api("GET", state_path)

    assert checkpoint_id(latest) == cp3
    assert_messages(
        latest,
        [
            (MESSAGE_A, "STATE_A_V2"),
            (MESSAGE_B, "STATE_B_V1"),
        ],
    )

    print_json(
        "HISTORICAL CHECKPOINT 1",
        summarize(history1),
    )
    print_json(
        "HISTORICAL CHECKPOINT 2",
        summarize(history2),
    )
    print_json(
        "FINAL THREAD HEAD",
        summarize(latest),
    )

    print(
        "\nPASS: new message IDs append",
        flush=True,
    )
    print(
        "PASS: existing message ID replaces",
        flush=True,
    )
    print(
        "PASS: three distinct checkpoints",
        flush=True,
    )
    print(
        "PASS: linear checkpoint ancestry",
        flush=True,
    )
    print(
        "PASS: historical snapshots preserved",
        flush=True,
    )
    print(
        "PASS: historical reads do not move HEAD",
        flush=True,
    )

finally:
    if (
        thread_id is not None
        and process is not None
        and process.poll() is None
    ):
        try:
            api(
                "DELETE",
                f"/threads/{quote(thread_id, safe='')}",
            )
            print(
                "PASS: disposable Thread deleted",
                flush=True,
            )
        except Exception as error:
            print(
                f"WARN: Thread cleanup: {error}",
                flush=True,
            )

    if process is not None and process.poll() is None:
        os.killpg(
            process.pid,
            signal.SIGTERM,
        )

        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            os.killpg(
                process.pid,
                signal.SIGKILL,
            )
            process.wait()

    print(
        "PASS: isolated Runtime cleanup",
        flush=True,
    )
