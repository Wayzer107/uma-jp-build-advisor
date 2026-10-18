#!/usr/bin/env python3
"""Preview and normalize a GameTora Everything collection export."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from gametora_schema import normalize_gametora, parse_everything


def load_catalog(catalog_root: Path, server: str) -> dict[str, Any]:
    manifest_path = catalog_root / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Catalog manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("server") != server:
        raise ValueError(f"Catalog server is {manifest.get('server')!r}, not requested {server!r}")
    supports = _load_records(catalog_root / "support-cards")
    trainees = _load_records(catalog_root / "trainees")
    return {"manifest": manifest, "supports": supports, "trainees": trainees}


def _load_records(folder: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    if not folder.is_dir():
        return result
    for path in folder.glob("*.json"):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(record, dict):
            result[path.stem] = record
    return result


def _write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def import_file(input_path: Path, server: str, catalog_root: Path, output_path: Path) -> dict[str, Any]:
    raw_bytes = input_path.read_bytes()
    payload = json.loads(raw_bytes.decode("utf-8-sig"))
    parsed = parse_everything(payload)
    raw_output = output_path.with_name(f"{output_path.stem}.source.json")
    raw_reference = {
        "file": raw_output.name,
        "sha256": hashlib.sha256(raw_bytes).hexdigest(),
        "preserved": True,
    }
    catalog = load_catalog(catalog_root, server)
    profile = normalize_gametora(parsed, server, catalog, raw_reference)
    _write_json_atomic(raw_output, payload)
    _write_json_atomic(output_path, profile)
    return {
        "server": server,
        "source_server_key": profile["source_server_key"],
        "source_version": profile["source_version"],
        "source_timestamp": profile["source_timestamp"],
        "supports": len(profile["supports"] or []),
        "trainees": len(profile["trainees"] or []),
        "veterans": len(profile["veterans"] or []),
        "partial_sections": profile["partial_sections"],
        "unresolved_ids": len(profile["unresolved_ids"]),
        "warnings": profile["warnings"],
        "profile_path": str(output_path.resolve()),
        "raw_source_path": str(raw_output.resolve()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True, choices=("ja", "global"), help="Explicit collection server; the importer will not guess from names.")
    parser.add_argument("--input", type=Path, required=True, help="GameTora Everything JSON export file.")
    parser.add_argument("--catalog-root", type=Path, required=True, help="Matching server's public catalog root.")
    parser.add_argument("--output", type=Path, required=True, help="Private candidate profile output path.")
    args = parser.parse_args()
    summary = import_file(args.input, args.server, args.catalog_root, args.output)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
