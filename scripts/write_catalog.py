#!/usr/bin/env python3
"""Write an extracted catalog as addressable records, indexes, and a manifest."""
from __future__ import annotations

import json
import os
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

ENTITY_LAYOUT = {
    "support_cards": ("support-cards", "id"),
    "trainee_outfits": ("trainees", "id"),
    "skills": ("skills", "id"),
    "events": ("events", "id"),
    "scenarios": ("scenarios", "id"),
    "races": ("races", "id"),
    "race_courses": ("races/courses", "id"),
    "race_conditions": ("races/conditions", "id"),
    "factors": ("factors", "id"),
}


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _safe_generated_path(root: Path, relative: str) -> Path | None:
    candidate = Path(relative)
    if candidate.is_absolute() or ".." in candidate.parts:
        return None
    resolved_root = root.resolve()
    resolved = (root / candidate).resolve()
    try:
        resolved.relative_to(resolved_root)
    except ValueError:
        return None
    return resolved


def write_catalog(catalog: dict[str, Any], output_root: Path) -> dict[str, Any]:
    """Atomically write each JSON file and remove only stale files listed by the old manifest."""
    output_root.mkdir(parents=True, exist_ok=True)
    previous_manifest_path = output_root / "manifest.json"
    previous_generated: set[str] = set()
    if previous_manifest_path.is_file():
        try:
            previous = json.loads(previous_manifest_path.read_text(encoding="utf-8"))
            previous_generated = {str(item) for item in previous.get("generated_files", [])}
        except (OSError, json.JSONDecodeError, AttributeError):
            previous_generated = set()

    new_generated: set[str] = set()
    entity_indexes: dict[str, dict[str, Any]] = {}

    for entity_name, (folder, id_key) in ENTITY_LAYOUT.items():
        records = catalog.get(entity_name, [])
        by_id: dict[str, str] = {}
        by_name: dict[str, list[str]] = defaultdict(list)
        seen: set[str] = set()
        for record in records:
            record_id = str(record[id_key])
            if record_id in seen:
                raise ValueError(f"Duplicate {entity_name} ID in catalog bundle: {record_id}")
            seen.add(record_id)
            relative = f"{folder}/{record_id}.json"
            _write_json(output_root / relative, record)
            new_generated.add(relative)
            by_id[record_id] = relative
            for name in record.get("search_names", []):
                if not isinstance(name, str) or not name.strip():
                    continue
                normalized = unicodedata.normalize("NFKC", name).casefold()
                normalized = " ".join(re.sub(r"[^\w]+", " ", normalized, flags=re.UNICODE).split())
                if not normalized:
                    continue
                ids = by_name[normalized]
                if record_id not in ids:
                    ids.append(record_id)

        entity_indexes[entity_name] = {"by_id": by_id, "by_name": dict(sorted(by_name.items()))}

    for entity_name, index in entity_indexes.items():
        relative = f"indexes/{entity_name}.json"
        _write_json(output_root / relative, index)
        new_generated.add(relative)

    counts = catalog.get("counts", {})
    source_counts = catalog.get("source_counts", {})
    field_coverage = {
        entity_name: {
            "generated_records": counts.get(entity_name, 0),
            "source_rows": catalog.get("scope_counts", {}).get(entity_name, source_counts.get({
                "support_cards": "support_card_data",
                "trainee_outfits": "card_data",
                "skills": "skill_data",
                "events": "single_mode_story_data",
                "scenarios": "single_mode_scenario",
                "races": "race",
                "race_courses": "race_course_set",
                "race_conditions": "race_condition",
                "factors": "succession_factor",
            }.get(entity_name, ""))),
        }
        for entity_name in ENTITY_LAYOUT
    }
    manifest = {
        "schema_version": catalog.get("schema_version", 1),
        "server": catalog.get("server", "ja"),
        "generated_at_utc": catalog.get("generated_at_utc"),
        "coverage_status": catalog.get("coverage_status", "incomplete"),
        "source": catalog.get("source", {}),
        "counts": counts,
        "source_counts": source_counts,
        "field_coverage": field_coverage,
        "translation_coverage": catalog.get("translation_coverage", {}),
        "gametora_reconciliation": catalog.get("gametora_reconciliation", {}),
        "unresolved_links": catalog.get("unresolved_links", {}),
        "unavailable_fields": catalog.get("unavailable_fields", []),
        "indexes": {name: f"indexes/{name}.json" for name in entity_indexes},
        "generated_files": sorted(new_generated),
    }

    for stale in sorted(previous_generated - new_generated):
        stale_path = _safe_generated_path(output_root, stale)
        if stale_path and stale_path.is_file():
            stale_path.unlink()

    _write_json(previous_manifest_path, manifest)
    return manifest
