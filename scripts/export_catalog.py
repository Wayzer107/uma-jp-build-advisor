#!/usr/bin/env python3
"""Generate the Japanese Umamusume reference catalog from a local game install."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from catalog_records import DEFAULT_GAME_ROOT, default_source_paths, export_catalog as _export_catalog
from gametora_support_data import (
    fetch_character_card_data,
    fetch_support_data,
    load_character_card_data,
    load_support_data,
)
from write_catalog import write_catalog, _write_json


def export_catalog(master_path: Path, translations_path: Path | None) -> dict[str, Any]:
    """Compatibility entry point retained for earlier callers."""
    story_assets = master_path.parents[3] / "hachimi" / "localized_data_1" / "assets" / "story" / "data"
    return _export_catalog(master_path, translations_path, story_assets)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--game-root",
        type=Path,
        default=Path(os.environ.get("UMAMUSUME_GAME_ROOT", str(DEFAULT_GAME_ROOT))),
    )
    parser.add_argument("--master-db", type=Path)
    parser.add_argument("--translations", type=Path)
    parser.add_argument("--story-assets", type=Path)
    parser.add_argument("--gametora-support-data", type=Path, help="Previously refreshed GameTora support-cards JSON snapshot.")
    parser.add_argument("--gametora-source-metadata", type=Path, help="Source metadata saved with a GameTora JSON snapshot.")
    parser.add_argument("--gametora-character-card-data", type=Path, help="Previously refreshed GameTora character-cards JSON snapshot.")
    parser.add_argument("--gametora-character-source-metadata", type=Path, help="Source metadata saved with a GameTora character-cards snapshot.")
    parser.add_argument("--refresh-gametora", action="store_true", help="Fetch GameTora's current versioned support and trainee indexes before extraction.")
    parser.add_argument(
        "--gametora-snapshot-root",
        type=Path,
        default=Path(__file__).resolve().parents[1] / ".staging" / "gametora",
        help="Where --refresh-gametora stores the source snapshot and provenance.",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "ja",
        help="Catalog root. Use a staging directory to review changes before replacing published records.",
    )
    parser.add_argument("--bundle", type=Path, help="Optional compatibility bundle JSON path.")
    args = parser.parse_args()

    if args.refresh_gametora and (args.gametora_support_data or args.gametora_character_card_data):
        parser.error("Use either --refresh-gametora or individual GameTora feed snapshots, not both")

    default_master, default_translations, default_stories = default_source_paths(args.game_root)
    master_path = args.master_db or default_master
    translations_path = args.translations or default_translations
    story_assets = args.story_assets or default_stories
    gametora_rows: list[dict[str, Any]] | None = None
    gametora_source: dict[str, Any] | None = None
    gametora_character_rows: list[dict[str, Any]] | None = None
    gametora_character_source: dict[str, Any] | None = None
    if args.refresh_gametora:
        gametora_rows, gametora_source = fetch_support_data()
        gametora_character_rows, gametora_character_source = fetch_character_card_data()
        _write_json(args.gametora_snapshot_root / "support-cards.json", gametora_rows)
        _write_json(args.gametora_snapshot_root / "support-cards.source.json", gametora_source)
        _write_json(args.gametora_snapshot_root / "character-cards.json", gametora_character_rows)
        _write_json(args.gametora_snapshot_root / "character-cards.source.json", gametora_character_source)
    if args.gametora_support_data:
        gametora_rows, gametora_source = load_support_data(args.gametora_support_data, args.gametora_source_metadata)
    if args.gametora_character_card_data:
        gametora_character_rows, gametora_character_source = load_character_card_data(
            args.gametora_character_card_data,
            args.gametora_character_source_metadata,
        )
    catalog = _export_catalog(
        master_path,
        translations_path,
        story_assets,
        gametora_rows,
        gametora_source,
        gametora_character_rows,
        gametora_character_source,
    )
    manifest = write_catalog(catalog, args.output_root)

    if args.bundle:
        args.bundle.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.bundle.with_suffix(args.bundle.suffix + ".tmp")
        temporary.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(args.bundle)

    print(
        json.dumps(
            {
                "output_root": str(args.output_root.resolve()),
                "server": manifest["server"],
                "coverage_status": manifest["coverage_status"],
                "counts": manifest["counts"],
                "unresolved_hint_cards": len(catalog["unresolved_links"]["support_hint_skills"]),
                "missing_story_asset_ids": catalog["unresolved_links"]["missing_story_assets"]["count"],
                "gametora_reconciliation": catalog["gametora_reconciliation"],
                "master_sha256": manifest["source"]["master_sha256"],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
