#!/usr/bin/env python3
"""Parse and normalize the GameTora Everything collection export format."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


SECTION_NAMES = ("charCards", "supports", "veterans")
SECTION_TO_PROFILE = {"charCards": "trainees", "supports": "supports", "veterans": "veterans"}
SERVER_ALIASES = {
    "ja": "ja",
    "jp": "ja",
    "jpn": "ja",
    "global": "global",
    "en": "global",
    "gl": "global",
}
VETERAN_ARRAY_FIELDS = (
    "schema_version",
    "card_tid",
    "score",
    "note",
    "stats",
    "aptitudes",
    "skills",
    "factors",
    "lineage",
    "selected_races",
    "meta",
)
KNOWN_TOP_LEVEL_FIELDS = {"app", "game", "type", "version", "timestamp", "servers"}


@dataclass
class ParsedGameToraExport:
    payload: dict[str, Any]
    servers: dict[str, dict[str, Any]]
    source_server_keys: dict[str, str]
    warnings: list[str]
    unknown_top_level_fields: dict[str, Any]


def _is_object(value: Any) -> bool:
    return isinstance(value, dict)


def _canonical_server_key(value: str) -> str | None:
    return SERVER_ALIASES.get(value.strip().casefold())


def parse_everything(payload: dict[str, Any]) -> ParsedGameToraExport:
    """Validate the known GameTora envelope while preserving the original object."""
    if not _is_object(payload):
        raise ValueError("GameTora export root must be a JSON object")
    if payload.get("app") not in (None, "gametora"):
        raise ValueError("Unrecognized app marker; this does not look like a GameTora export")
    if payload.get("game") not in (None, "umamusume"):
        raise ValueError("Export game marker is not Umamusume")
    if payload.get("type") not in (None, "collection"):
        raise ValueError("Export type marker is not a collection")

    version = payload.get("version")
    if isinstance(version, str) and version.startswith("s"):
        raise ValueError("This is GameTora share JSON, not a backup export")
    if version in (1, 2):
        raise ValueError(f"GameTora export version {version} is not supported by the current importer")

    warnings: list[str] = []
    if version not in (3, 4):
        warnings.append(f"Unrecognized GameTora export version {version!r}; parsed using the known sections without discarding source fields")
    if payload.get("app") is None or payload.get("game") is None or payload.get("type") is None:
        warnings.append("One or more GameTora format marker fields are absent")

    raw_servers = payload.get("servers")
    if not _is_object(raw_servers):
        raise ValueError("GameTora export is missing its servers object")

    servers: dict[str, dict[str, Any]] = {}
    source_server_keys: dict[str, str] = {}
    for raw_server_key, raw_collection in raw_servers.items():
        if not isinstance(raw_server_key, str) or not _is_object(raw_collection):
            warnings.append(f"Skipped non-object server entry {raw_server_key!r}; it remains preserved in the raw source file")
            continue
        canonical_server = _canonical_server_key(raw_server_key)
        if canonical_server is None:
            warnings.append(f"Unrecognized GameTora server key {raw_server_key!r}; it remains preserved in the raw source file")
            continue
        if canonical_server in servers:
            raise ValueError(f"Multiple GameTora server keys map to {canonical_server!r}; refusing an ambiguous merge")
        sections: dict[str, Any] = {}
        for section in SECTION_NAMES:
            value = raw_collection.get(section)
            if value is None:
                sections[section] = None
            elif _is_object(value):
                sections[section] = value
            else:
                sections[section] = None
                warnings.append(f"Section {section!r} for server {raw_server_key!r} is not an object; it remains preserved in the raw source file")
        sections["unknown_fields"] = {key: value for key, value in raw_collection.items() if key not in SECTION_NAMES}
        servers[canonical_server] = sections
        source_server_keys[canonical_server] = raw_server_key

    return ParsedGameToraExport(
        payload=payload,
        servers=servers,
        source_server_keys=source_server_keys,
        warnings=warnings,
        unknown_top_level_fields={key: value for key, value in payload.items() if key not in KNOWN_TOP_LEVEL_FIELDS},
    )


def _numeric_id(raw_id: Any) -> tuple[str, bool]:
    text = str(raw_id).strip()
    return text, text.isdecimal()


def _optional_number(value: Any, minimum: int | None = None, maximum: int | None = None) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if isinstance(value, float) and value != number:
        return None
    if minimum is not None and number < minimum:
        return None
    if maximum is not None and number > maximum:
        return None
    return number


def _limit_break(raw_value: Any) -> int | None:
    if isinstance(raw_value, dict):
        for key in ("limit_break", "limitBreak", "lb"):
            if key in raw_value:
                return _optional_number(raw_value[key], 0, 4)
        return None
    return _optional_number(raw_value, 0, 4)


def _support_level(raw_value: Any) -> int | None:
    if not isinstance(raw_value, dict):
        return None
    for key in ("level", "lv"):
        if key in raw_value:
            return _optional_number(raw_value[key], 1)
    return None


def _veteran_fields(raw_value: Any) -> dict[str, Any]:
    if isinstance(raw_value, list):
        return {key: raw_value[index] if index < len(raw_value) else None for index, key in enumerate(VETERAN_ARRAY_FIELDS)}
    if isinstance(raw_value, dict):
        return raw_value
    return {}


def _catalog_match(
    records: dict[str, dict[str, Any]],
    record_id: str,
    catalog_available: bool,
) -> dict[str, Any]:
    record = records.get(record_id)
    if record:
        mapping = record.get("gametora") or {}
        return {
            "status": "resolved",
            "record_path": f"{record.get('kind_path', '')}/{record_id}.json",
            "name": record.get("name"),
            "gametora_url": mapping.get("url"),
        }
    return {
        "status": "unresolved" if catalog_available else "source_unavailable",
        "record_path": None,
        "name": None,
        "gametora_url": None,
    }


def normalize_gametora(
    parsed: ParsedGameToraExport,
    server: str,
    catalog: dict[str, Any],
    raw_source_reference: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Convert one explicitly selected GameTora server collection to profile v1."""
    if server not in ("ja", "global"):
        raise ValueError("server must be 'ja' or 'global'")
    collection = parsed.servers.get(server)
    if collection is None:
        available = ", ".join(sorted(parsed.servers)) or "none"
        raise ValueError(f"Export has no recognized {server!r} collection (recognized server sections: {available})")

    manifest = catalog.get("manifest") if _is_object(catalog.get("manifest")) else {}
    catalog_available = bool(manifest) and manifest.get("coverage_status") != "source_unavailable"
    support_records = catalog.get("supports", {}) if _is_object(catalog.get("supports")) else {}
    trainee_records = catalog.get("trainees", {}) if _is_object(catalog.get("trainees")) else {}
    trainee_by_tid = {
        str((record.get("gametora") or {}).get("trainee_tid")): str(record.get("id"))
        for record in trainee_records.values()
        if isinstance(record, dict) and (record.get("gametora") or {}).get("trainee_tid") is not None
    }

    partial_sections: list[str] = []
    supports: list[dict[str, Any]] | None = None
    trainees: list[dict[str, Any]] | None = None
    veterans: list[dict[str, Any]] | None = None
    unresolved_ids: list[dict[str, str]] = []

    raw_supports = collection["supports"]
    if raw_supports is None:
        partial_sections.append("supports")
    else:
        supports = []
        for raw_id, raw_value in raw_supports.items():
            support_id, numeric = _numeric_id(raw_id)
            match = _catalog_match(support_records, support_id, catalog_available) if numeric else {
                "status": "unresolved", "record_path": None, "name": None, "gametora_url": None
            }
            if not numeric or match["status"] != "resolved":
                unresolved_ids.append({"kind": "support", "id": support_id, "reason": "non_numeric_id" if not numeric else match["status"]})
            supports.append({
                "support_id": support_id,
                "owned": True,
                "limit_break": _limit_break(raw_value),
                "level": _support_level(raw_value),
                "raw_value": raw_value,
                "catalog_match": match,
            })

    raw_trainees = collection["charCards"]
    if raw_trainees is None:
        partial_sections.append("trainees")
    else:
        trainees = []
        for raw_id, raw_value in raw_trainees.items():
            trainee_id, numeric = _numeric_id(raw_id)
            match = _catalog_match(trainee_records, trainee_id, catalog_available) if numeric else {
                "status": "unresolved", "record_path": None, "name": None, "gametora_url": None
            }
            if not numeric or match["status"] != "resolved":
                unresolved_ids.append({"kind": "trainee", "id": trainee_id, "reason": "non_numeric_id" if not numeric else match["status"]})
            trainees.append({
                "trainee_outfit_id": trainee_id,
                "owned": True,
                "raw_value": raw_value,
                "catalog_match": match,
            })

    raw_veterans = collection["veterans"]
    if raw_veterans is None:
        partial_sections.append("veterans")
    else:
        veterans = []
        for raw_veteran_id, raw_value in raw_veterans.items():
            veteran_id = str(raw_veteran_id)
            fields = _veteran_fields(raw_value)
            card_tid = str(fields["card_tid"]) if fields.get("card_tid") is not None else None
            trainee_id = trainee_by_tid.get(card_tid) if card_tid is not None else None
            trainee_match = _catalog_match(trainee_records, trainee_id, catalog_available) if trainee_id else {
                "status": "source_unavailable" if not catalog_available else "unresolved",
                "record_path": None,
                "name": None,
                "gametora_url": None,
            }
            if trainee_id is None or trainee_match["status"] != "resolved":
                unresolved_ids.append({
                    "kind": "veteran_trainee",
                    "id": card_tid or veteran_id,
                    "reason": "unknown_or_unmapped_card_tid" if catalog_available else "catalog_source_unavailable",
                })
            veterans.append({
                "veteran_id": veteran_id,
                "card_tid": card_tid,
                "trainee_outfit_id": trainee_id,
                "score": _optional_number(fields.get("score")),
                "stats": fields.get("stats"),
                "aptitudes": fields.get("aptitudes"),
                "skills": fields.get("skills"),
                "factors": fields.get("factors"),
                "lineage": fields.get("lineage"),
                "selected_races": fields.get("selected_races"),
                "note": fields.get("note") if isinstance(fields.get("note"), str) else None,
                "raw_value": raw_value,
                "catalog_match": trainee_match,
            })

    imported_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return {
        "schema_version": 1,
        "server": server,
        "source_format": f"gametora_everything_v{parsed.payload.get('version', 'unknown')}",
        "imported_at_utc": imported_at,
        "source_timestamp": parsed.payload.get("timestamp") if isinstance(parsed.payload.get("timestamp"), str) else None,
        "source_version": parsed.payload.get("version") if isinstance(parsed.payload.get("version"), (int, str)) else None,
        "source_server_key": parsed.source_server_keys[server],
        "catalog_generated_at_utc": manifest.get("generated_at_utc"),
        "supports": supports,
        "trainees": trainees,
        "veterans": veterans,
        "partial_sections": partial_sections,
        "unresolved_ids": unresolved_ids,
        "source_unknown_fields": parsed.unknown_top_level_fields,
        "unknown_server_fields": collection["unknown_fields"],
        "warnings": list(parsed.warnings),
        "raw_source_reference": raw_source_reference or {"file": None, "sha256": None, "preserved": False},
    }
