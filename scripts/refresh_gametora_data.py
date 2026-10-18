#!/usr/bin/env python3
"""Refresh the versioned GameTora support-card and trainee cross-check snapshots."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from gametora_support_data import fetch_character_card_data, fetch_support_data


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", type=Path, default=Path(__file__).resolve().parents[1] / ".staging" / "gametora")
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()
    support_rows, support_metadata = fetch_support_data(args.timeout)
    trainee_rows, trainee_metadata = fetch_character_card_data(args.timeout)
    write_json(args.output_root / "support-cards.json", support_rows)
    write_json(args.output_root / "support-cards.source.json", support_metadata)
    write_json(args.output_root / "character-cards.json", trainee_rows)
    write_json(args.output_root / "character-cards.source.json", trainee_metadata)
    print(json.dumps({
        "output_root": str(args.output_root.resolve()),
        "support_rows": len(support_rows),
        "support_data_version_hash": support_metadata["data_version_hash"],
        "trainee_rows": len(trainee_rows),
        "trainee_data_version_hash": trainee_metadata["data_version_hash"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
