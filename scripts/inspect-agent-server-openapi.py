#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path
from typing import Any


HTTP_METHODS = {
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "options",
    "head",
}

RESOURCE_TERMS = (
    "/assistants",
    "/threads",
    "/runs",
)

SKIP_TERMS = (
    "/stream",
    "/join",
)


def schema_ref_name(ref: str) -> str | None:
    prefix = "#/components/schemas/"
    if ref.startswith(prefix):
        return ref[len(prefix):]
    return None


def collect_refs(value: Any) -> set[str]:
    refs: set[str] = set()

    if isinstance(value, dict):
        ref = value.get("$ref")

        if isinstance(ref, str):
            name = schema_ref_name(ref)

            if name:
                refs.add(name)

        for child in value.values():
            refs.update(collect_refs(child))

    elif isinstance(value, list):
        for child in value:
            refs.update(collect_refs(child))

    return refs


def display_schema(schema: Any) -> str:
    if not isinstance(schema, dict):
        return "-"

    if "$ref" in schema:
        return schema["$ref"]

    if "type" in schema:
        value = str(schema["type"])

        if schema.get("nullable"):
            value += " | null"

        return value

    if "oneOf" in schema:
        return "oneOf"

    if "anyOf" in schema:
        return "anyOf"

    if "allOf" in schema:
        return "allOf"

    return "inline"


def print_operation(path: str, method: str, op: dict[str, Any]) -> set[str]:
    refs: set[str] = set()

    print()
    print(f"{method.upper():6} {path}")
    print(f"  operationId: {op.get('operationId', '-')}")

    parameters = op.get("parameters", [])

    if parameters:
        print("  parameters:")

        for parameter in parameters:
            schema = parameter.get("schema", {})
            location = parameter.get("in", "?")
            required = parameter.get("required", False)
            name = parameter.get("name", "?")

            print(
                f"    - {name}: "
                f"in={location} "
                f"required={required} "
                f"schema={display_schema(schema)}"
            )

            refs.update(collect_refs(schema))

    body = op.get("requestBody")

    if isinstance(body, dict):
        print("  request:")

        for media_type, media in body.get("content", {}).items():
            schema = media.get("schema", {})

            print(
                f"    - {media_type}: "
                f"{display_schema(schema)}"
            )

            refs.update(collect_refs(schema))

    responses = op.get("responses", {})

    if responses:
        print("  responses:")

        for status, response in responses.items():
            content = response.get("content", {})

            if not content:
                print(f"    - {status}: no body")
                continue

            for media_type, media in content.items():
                schema = media.get("schema", {})

                print(
                    f"    - {status} {media_type}: "
                    f"{display_schema(schema)}"
                )

                refs.update(collect_refs(schema))

    return refs


def print_schema(name: str, schema: dict[str, Any]) -> set[str]:
    print()
    print(f"### {name}")

    schema_type = schema.get("type")
    required = set(schema.get("required", []))
    properties = schema.get("properties", {})

    if schema_type:
        print(f"type: {schema_type}")

    if schema.get("description"):
        description = " ".join(
            str(schema["description"]).split()
        )
        print(f"description: {description[:220]}")

    if properties:
        print("properties:")

        for prop_name, prop in properties.items():
            marker = "required" if prop_name in required else "optional"

            print(
                f"  - {prop_name}: "
                f"{display_schema(prop)} "
                f"[{marker}]"
            )

    if "oneOf" in schema:
        print("oneOf:")
        for option in schema["oneOf"]:
            print(f"  - {display_schema(option)}")

    if "anyOf" in schema:
        print("anyOf:")
        for option in schema["anyOf"]:
            print(f"  - {display_schema(option)}")

    if "allOf" in schema:
        print("allOf:")
        for option in schema["allOf"]:
            print(f"  - {display_schema(option)}")

    return collect_refs(schema)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("openapi", type=Path)
    args = parser.parse_args()

    doc = json.loads(args.openapi.read_text(encoding="utf-8"))

    paths = doc.get("paths", {})
    schemas = doc.get("components", {}).get("schemas", {})

    print("===== RELEVANT REST OPERATIONS =====")

    initial_refs: set[str] = set()
    operation_count = 0

    for path in sorted(paths):
        if not any(term in path for term in RESOURCE_TERMS):
            continue

        if any(term in path for term in SKIP_TERMS):
            continue

        path_item = paths[path]

        for method in HTTP_METHODS:
            op = path_item.get(method)

            if not isinstance(op, dict):
                continue

            operation_count += 1
            initial_refs.update(
                print_operation(path, method, op)
            )

    print()
    print(
        f"Relevant non-stream operations: "
        f"{operation_count}"
    )

    print()
    print("===== REFERENCED SCHEMA GRAPH =====")

    queue = deque(sorted(initial_refs))
    visited: set[str] = set()

    while queue:
        name = queue.popleft()

        if name in visited:
            continue

        visited.add(name)

        schema = schemas.get(name)

        if not isinstance(schema, dict):
            print()
            print(f"### {name}")
            print("MISSING FROM components.schemas")
            continue

        refs = print_schema(name, schema)

        for ref in sorted(refs):
            if ref not in visited:
                queue.append(ref)

    print()
    print("===== SUMMARY =====")
    print(f"Initial referenced schemas : {len(initial_refs)}")
    print(f"Transitive schemas         : {len(visited)}")


if __name__ == "__main__":
    main()
