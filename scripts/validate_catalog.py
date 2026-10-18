#!/usr/bin/env python3
"""Report source-to-record coverage and unresolved reference links for publication."""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from catalog_records import DEFAULT_GAME_ROOT, default_source_paths, open_master_read_only, sha256_file
from write_catalog import ENTITY_LAYOUT, _write_json


def _record_files(root: Path, folder: str) -> list[Path]:
    path = root / folder
    return sorted(path.glob("*.json")) if path.is_dir() else []


def _ids_from_source(connection: sqlite3.Connection) -> dict[str, set[str]]:
    queries = {
        "support_cards": ("SELECT id FROM support_card_data", "id"),
        "trainee_outfits": ("SELECT id FROM card_data WHERE default_rarity > 0", "id"),
        "skills": ("SELECT id FROM skill_data", "id"),
        "events": ("SELECT id FROM single_mode_story_data WHERE support_card_id > 0 OR support_chara_id > 0 OR card_id > 0 OR card_chara_id > 0", "id"),
        "scenarios": ("SELECT id FROM single_mode_scenario", "id"),
        "races": ("SELECT id FROM race", "id"),
        "race_courses": ("SELECT id FROM race_course_set", "id"),
        "race_conditions": ("SELECT id FROM race_condition", "id"),
        "factors": ("SELECT factor_id AS id FROM succession_factor", "id"),
    }
    result = {}
    for entity, (query, _) in queries.items():
        result[entity] = {str(row[0]) for row in connection.execute(query)}
    return result


def validate_catalog(
    catalog_root: Path,
    server: str,
    master_path: Path | None = None,
) -> dict[str, Any]:
    """Compare the addressable catalog with source IDs and summarize required link gaps."""
    if server not in {"ja", "global"}:
        raise ValueError("server must be 'ja' or 'global'")
    manifest_path = catalog_root / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Catalog manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("server") != server:
        raise ValueError(f"Manifest server is {manifest.get('server')!r}; requested {server!r}")

    if server == "global":
        report = {
            "schema_version": 1,
            "server": server,
            "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "coverage_status": "source_unavailable" if manifest.get("coverage_status") == "source_unavailable" else "incomplete",
            "source_comparison": "not_run_no_verified_global_source",
            "entity_coverage": {},
            "unresolved_links": {},
            "blocking_issues": ["No independently verified Global source is available; no JP rows were used."],
            "unavailable_fields": manifest.get("unavailable_fields", []),
        }
        _write_json(catalog_root / "coverage-report.json", report)
        manifest["validation"] = {"coverage_status": report["coverage_status"], "report": "coverage-report.json"}
        generated = set(manifest.get("generated_files", []))
        generated.add("coverage-report.json")
        manifest["generated_files"] = sorted(generated)
        _write_json(manifest_path, manifest)
        return report

    if master_path is None:
        master_path, _, _ = default_source_paths(DEFAULT_GAME_ROOT)
    if not master_path.is_file():
        raise FileNotFoundError(f"Japanese master database not found: {master_path}")
    connection = open_master_read_only(master_path)
    try:
        expected = _ids_from_source(connection)
    finally:
        connection.close()

    entity_coverage: dict[str, Any] = {}
    records_by_entity: dict[str, dict[str, dict[str, Any]]] = {}
    blocking_issues: list[str] = []
    for entity, (folder, id_key) in ENTITY_LAYOUT.items():
        files = _record_files(catalog_root, folder)
        actual_ids: list[str] = []
        records: dict[str, dict[str, Any]] = {}
        malformed: list[str] = []
        for file_path in files:
            try:
                record = json.loads(file_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                malformed.append(f"{file_path.relative_to(catalog_root).as_posix()}: {error}")
                continue
            record_id = str(record.get(id_key, ""))
            filename_id = file_path.stem
            actual_ids.append(filename_id)
            if record_id != filename_id:
                malformed.append(f"{file_path.relative_to(catalog_root).as_posix()}: record ID {record_id!r} differs from filename")
            if filename_id in records:
                malformed.append(f"duplicate {entity} ID {filename_id}")
            else:
                records[filename_id] = record

        actual_set = set(actual_ids)
        expected_set = expected.get(entity, set())
        missing = sorted(expected_set - actual_set)
        unexpected = sorted(actual_set - expected_set)
        entity_coverage[entity] = {
            "source_ids": len(expected_set),
            "generated_ids": len(actual_set),
            "missing_ids": missing,
            "unexpected_ids": unexpected,
            "malformed_records": malformed,
        }
        records_by_entity[entity] = records
        if missing or unexpected or malformed:
            blocking_issues.append(f"{entity}: {len(missing)} missing, {len(unexpected)} unexpected, {len(malformed)} malformed")

    support_records = records_by_entity["support_cards"]
    trainee_records = records_by_entity["trainee_outfits"]
    skill_records = records_by_entity["skills"]
    unresolved: dict[str, list[dict[str, Any]]] = {
        "support_hint_skills": [],
        "trainee_available_skills": [],
        "trainee_rarity_skills": [],
    }
    for support_id, support in support_records.items():
        for hint in support.get("hints_and_rewards", []):
            skill_id = hint.get("skill_id")
            if skill_id and str(skill_id) not in skill_records:
                unresolved["support_hint_skills"].append({"support_card_id": support_id, "skill_id": skill_id})
    for trainee_id, trainee in trainee_records.items():
        for entry in trainee.get("available_skills", []):
            skill_id = entry.get("skill_id")
            if skill_id and str(skill_id) not in skill_records:
                unresolved["trainee_available_skills"].append({"trainee_outfit_id": trainee_id, "skill_id": skill_id})
        for rarity in trainee.get("rarity_data", []):
            for entry in rarity.get("skills", []):
                skill_id = entry.get("skill_id")
                if skill_id and str(skill_id) not in skill_records:
                    unresolved["trainee_rarity_skills"].append({"trainee_outfit_id": trainee_id, "rarity": rarity.get("rarity"), "skill_id": skill_id})
    for kind, entries in unresolved.items():
        if entries:
            blocking_issues.append(f"{kind}: {len(entries)} unresolved skill links")

    gametora_mismatches: list[dict[str, Any]] = []
    gametora_ids: Counter[str] = Counter()
    mapping_status_counts: Counter[str] = Counter()
    for support_id, support in support_records.items():
        mapping = support.get("gametora", {})
        gametora_id = mapping.get("id")
        mapping_status_counts[str(mapping.get("mapping_status", "missing"))] += 1
        if gametora_id is not None:
            gametora_ids[str(gametora_id)] += 1
        if str(gametora_id) != support_id:
            gametora_mismatches.append({"support_card_id": support_id, "gametora_id": gametora_id})
    collisions = sorted(gametora_id for gametora_id, count in gametora_ids.items() if count > 1)
    if gametora_mismatches:
        blocking_issues.append(f"GameTora ID mismatch: {len(gametora_mismatches)} support cards")
    if collisions:
        blocking_issues.append(f"GameTora ID collision: {len(collisions)} IDs")
    if mapping_status_counts.get("verified_full_id_set", 0) != len(support_records):
        blocking_issues.append("Full GameTora support ID set reconciliation has not been completed")

    trainee_gametora_mismatches: list[dict[str, Any]] = []
    trainee_gametora_ids: Counter[str] = Counter()
    trainee_tids: Counter[str] = Counter()
    trainee_mapping_status_counts: Counter[str] = Counter()
    for trainee_id, trainee in trainee_records.items():
        mapping = trainee.get("gametora", {})
        gametora_id = mapping.get("id")
        trainee_mapping_status_counts[str(mapping.get("mapping_status", "missing"))] += 1
        if gametora_id is not None:
            trainee_gametora_ids[str(gametora_id)] += 1
        trainee_tid = mapping.get("trainee_tid")
        if trainee_tid is not None:
            trainee_tids[str(trainee_tid)] += 1
        if str(gametora_id) != trainee_id:
            trainee_gametora_mismatches.append({"trainee_outfit_id": trainee_id, "gametora_id": gametora_id})
    trainee_collisions = sorted(gametora_id for gametora_id, count in trainee_gametora_ids.items() if count > 1)
    trainee_tid_collisions = sorted(tid for tid, count in trainee_tids.items() if count > 1)
    if trainee_gametora_mismatches:
        blocking_issues.append(f"GameTora trainee outfit ID mismatch: {len(trainee_gametora_mismatches)} records")
    if trainee_collisions:
        blocking_issues.append(f"GameTora trainee outfit ID collision: {len(trainee_collisions)} IDs")
    if len(trainee_tids) != len(trainee_records) or trainee_tid_collisions:
        blocking_issues.append("GameTora trainee tid mapping is missing or duplicated")
    if trainee_mapping_status_counts.get("verified_full_id_set", 0) != len(trainee_records):
        blocking_issues.append("Full GameTora trainee outfit ID set reconciliation has not been completed")

    master_sha256 = sha256_file(master_path)
    manifest_hash_matches = master_sha256 == manifest.get("source", {}).get("master_sha256")
    if not manifest_hash_matches:
        blocking_issues.append("Catalog source master hash differs from the installed Japanese master database")

    events = records_by_entity["events"]
    events_without_outcomes = [event_id for event_id, event in events.items() if not event.get("outcomes", {}).get("rewards")]
    if events_without_outcomes:
        blocking_issues.append(f"Event choice/reward data unavailable for {len(events_without_outcomes)} event records")

    untranslated: Counter[str] = Counter()
    for entity_records in records_by_entity.values():
        for record in entity_records.values():
            def visit(value: Any, field_path: str = "") -> None:
                if isinstance(value, dict):
                    if {"ja", "en", "en_status", "en_source"}.issubset(value):
                        if value.get("ja") and not value.get("en"):
                            untranslated[field_path or "localized_field"] += 1
                        return
                    for key, child in value.items():
                        visit(child, f"{field_path}.{key}" if field_path else key)
                elif isinstance(value, list):
                    for child in value:
                        visit(child, field_path)
            visit(record)

    report = {
        "schema_version": 1,
        "server": server,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "coverage_status": "complete" if not blocking_issues else "incomplete",
        "source_comparison": {
            "master_filename": master_path.name,
            "master_sha256": master_sha256,
            "manifest_master_sha256_matches": manifest_hash_matches,
        },
        "entity_coverage": entity_coverage,
        "unresolved_links": unresolved,
        "gametora_mapping": {
            "status": manifest.get("gametora_reconciliation", {}).get("status", "unverified"),
            "status_counts": dict(mapping_status_counts),
            "mapped_support_records": len(gametora_ids),
            "total_support_records": len(support_records),
            "support_id_mismatches": gametora_mismatches,
            "duplicate_gametora_ids": collisions,
            "full_remote_id_set_reconciliation": manifest.get("gametora_reconciliation", {}).get("status", "not_available"),
            "feed_version_hash": manifest.get("gametora_reconciliation", {}).get("data_version_hash"),
        },
        "gametora_trainee_mapping": {
            "status": manifest.get("gametora_reconciliation", {}).get("trainee_outfits", {}).get("status", "unverified"),
            "status_counts": dict(trainee_mapping_status_counts),
            "mapped_trainee_records": len(trainee_gametora_ids),
            "total_trainee_records": len(trainee_records),
            "trainee_id_mismatches": trainee_gametora_mismatches,
            "duplicate_gametora_ids": trainee_collisions,
            "trainee_tid_count": len(trainee_tids),
            "duplicate_trainee_tids": trainee_tid_collisions,
            "full_remote_id_set_reconciliation": manifest.get("gametora_reconciliation", {}).get("trainee_outfits", {}).get("status", "not_available"),
            "feed_version_hash": manifest.get("gametora_reconciliation", {}).get("trainee_outfits", {}).get("data_version_hash"),
        },
        "unavailable_event_outcomes": {
            "count": len(events_without_outcomes),
            "sample_event_ids": events_without_outcomes[:25],
        },
        "untranslated_fields_by_path": dict(sorted(untranslated.items())),
        "blocking_issues": blocking_issues,
        "unavailable_fields": manifest.get("unavailable_fields", []),
    }
    _write_json(catalog_root / "coverage-report.json", report)
    manifest["coverage_status"] = report["coverage_status"]
    manifest["validation"] = {
        "coverage_status": report["coverage_status"],
        "report": "coverage-report.json",
        "generated_at_utc": report["generated_at_utc"],
        "blocking_issue_count": len(blocking_issues),
    }
    generated = set(manifest.get("generated_files", []))
    generated.add("coverage-report.json")
    manifest["generated_files"] = sorted(generated)
    _write_json(manifest_path, manifest)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True, choices=("ja", "global"))
    parser.add_argument("--catalog-root", type=Path, required=True)
    parser.add_argument("--master-db", type=Path)
    parser.add_argument("--game-root", type=Path, default=DEFAULT_GAME_ROOT)
    args = parser.parse_args()
    master_path = args.master_db or default_source_paths(args.game_root)[0]
    report = validate_catalog(args.catalog_root, args.server, master_path)
    summary = {
        "server": report["server"],
        "coverage_status": report["coverage_status"],
        "source_comparison": report["source_comparison"],
        "entity_coverage": {
            name: {
                "source_ids": entry.get("source_ids"),
                "generated_ids": entry.get("generated_ids"),
                "missing": len(entry.get("missing_ids", [])),
                "unexpected": len(entry.get("unexpected_ids", [])),
                "malformed": len(entry.get("malformed_records", [])),
            }
            for name, entry in report.get("entity_coverage", {}).items()
        },
        "gametora_mapping": report.get("gametora_mapping"),
        "gametora_trainee_mapping": report.get("gametora_trainee_mapping"),
        "unavailable_event_outcomes": report.get("unavailable_event_outcomes"),
        "blocking_issues": report.get("blocking_issues"),
        "report_path": str((args.catalog_root / "coverage-report.json").resolve()),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if report["coverage_status"] == "complete" else 2


if __name__ == "__main__":
    raise SystemExit(main())
