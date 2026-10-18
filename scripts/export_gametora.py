#!/usr/bin/env python3
"""Export a normalized private profile as a GameTora Everything backup."""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _support_map(profile: dict[str, Any]) -> dict[str, Any] | None:
    entries = profile.get("supports")
    if entries is None:
        return None
    result: dict[str, Any] = {}
    for entry in entries:
        support_id = str(entry["support_id"])
        value = entry.get("raw_value")
        if value is None and entry.get("limit_break") is not None:
            value = entry["limit_break"]
        result[support_id] = value
    return result


def _trainee_map(profile: dict[str, Any]) -> dict[str, Any] | None:
    entries = profile.get("trainees")
    if entries is None:
        return None
    return {
        str(entry["trainee_outfit_id"]): (entry.get("raw_value") if "raw_value" in entry else True)
        for entry in entries
    }


def _veteran_map(profile: dict[str, Any]) -> dict[str, Any] | None:
    entries = profile.get("veterans")
    if entries is None:
        return None
    result: dict[str, Any] = {}
    for entry in entries:
        raw_value = entry.get("raw_value")
        if raw_value is not None:
            result[str(entry["veteran_id"])] = raw_value
            continue
        result[str(entry["veteran_id"])] = {
            "schema_version": 1,
            "card_tid": entry.get("card_tid"),
            "score": entry.get("score"),
            "note": entry.get("note"),
            "stats": entry.get("stats"),
            "aptitudes": entry.get("aptitudes"),
            "skills": entry.get("skills"),
            "factors": entry.get("factors"),
            "lineage": entry.get("lineage"),
            "selected_races": entry.get("selected_races"),
        }
    return result


def export_everything(profile: dict[str, Any], server: str) -> dict[str, Any]:
    if server not in ("ja", "global"):
        raise ValueError("server must be 'ja' or 'global'")
    if profile.get("schema_version") != 1:
        raise ValueError("Unsupported inventory profile schema version")
    if profile.get("server") != server:
        raise ValueError(f"Profile server is {profile.get('server')!r}, not requested {server!r}")

    source_key = str(profile.get("source_server_key") or "")
    aliases = {"ja": {"ja", "jp", "jpn"}, "global": {"global", "en", "gl"}}
    server_key = source_key if source_key.casefold() in aliases[server] else ("ja" if server == "ja" else "en")
    server_collection: dict[str, Any] = dict(profile.get("unknown_server_fields") or {})
    sections = {
        "charCards": _trainee_map(profile),
        "supports": _support_map(profile),
        "veterans": _veteran_map(profile),
    }
    for key, value in sections.items():
        if value is not None:
            server_collection[key] = value
    if not any(key in server_collection for key in sections):
        raise ValueError("Profile has no imported ownership sections to export")

    result = dict(profile.get("source_unknown_fields") or {})
    result.update({
        "app": "gametora",
        "game": "umamusume",
        "type": "collection",
        "version": 4,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "servers": {server_key: server_collection},
    })
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True, choices=("ja", "global"))
    parser.add_argument("--profile", type=Path, required=True, help="Private normalized inventory profile JSON.")
    parser.add_argument("--output", type=Path, required=True, help="GameTora Everything JSON output path.")
    args = parser.parse_args()
    profile = json.loads(args.profile.read_text(encoding="utf-8"))
    if not isinstance(profile, dict):
        raise ValueError("Inventory profile must be a JSON object")
    export = export_everything(profile, args.server)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_name(args.output.name + ".tmp")
    temporary.write_text(json.dumps(export, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, args.output)
    sections = export["servers"][next(iter(export["servers"]))]
    print(json.dumps({
        "server": args.server,
        "output": str(args.output.resolve()),
        "supports": len(sections.get("supports") or {}),
        "trainees": len(sections.get("charCards") or {}),
        "veterans": len(sections.get("veterans") or {}),
        "omitted_sections": [name for name in ("supports", "charCards", "veterans") if name not in sections],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
