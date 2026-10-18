#!/usr/bin/env python3
"""Initialize empty Global catalog indexes without copying JP records."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from write_catalog import _write_json

ENTITY_NAMES = (
    "support_cards", "trainee_outfits", "skills", "events", "scenarios",
    "races", "race_courses", "race_conditions", "factors",
)


def initialize(output_root: Path) -> dict:
    output_root.mkdir(parents=True, exist_ok=True)
    generated = []
    indexes = {}
    for name in ENTITY_NAMES:
        relative = f"indexes/{name}.json"
        _write_json(output_root / relative, {"by_id": {}, "by_name": {}})
        generated.append(relative)
        indexes[name] = relative

    manifest = {
        "schema_version": 1,
        "server": "global",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "coverage_status": "source_unavailable",
        "source": {
            "status": "source_unavailable",
            "reason": "No independent Global install or verified Global export has been established in this workspace.",
            "jp_data_used": False,
        },
        "counts": {name: 0 for name in ENTITY_NAMES},
        "field_coverage": {},
        "unresolved_links": {},
        "unavailable_fields": [
            {
                "entity": "all_global_catalog_entities",
                "fields": ["support cards", "trainee outfits", "skills", "events", "scenarios", "races", "inheritance factors"],
                "reason": "An independently scoped Global source is required; JP rows are not a substitute.",
            }
        ],
        "indexes": indexes,
        "generated_files": sorted(generated),
    }
    _write_json(output_root / "manifest.json", manifest)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "global")
    args = parser.parse_args()
    manifest = initialize(args.output_root)
    print(json.dumps({"output_root": str(args.output_root.resolve()), "server": manifest["server"], "coverage_status": manifest["coverage_status"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
