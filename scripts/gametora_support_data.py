#!/usr/bin/env python3
"""Fetch GameTora's public, versioned support and trainee indexes."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from typing import Any

BASE_URL = "https://gametora.com"
MANIFEST_URL = f"{BASE_URL}/data/manifests/umamusume.json"


def _fetch_json(url: str, timeout: int = 30) -> tuple[Any, bytes]:
    request = Request(url, headers={"User-Agent": "uma-jp-build-advisor-catalog-updater/1.0"})
    with urlopen(request, timeout=timeout) as response:
        raw = response.read()
    return json.loads(raw.decode("utf-8")), raw


def _fetch_versioned_feed(
    manifest_key: str,
    filename: str,
    id_field: str,
    source: str,
    scope_note: str,
    timeout: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    manifest, manifest_bytes = _fetch_json(MANIFEST_URL, timeout)
    version_hash = manifest.get(manifest_key) if isinstance(manifest, dict) else None
    if not isinstance(version_hash, str) or not version_hash:
        raise ValueError(f"GameTora manifest has no {manifest_key!r} data version")

    data_url = f"{BASE_URL}/data/umamusume/{filename}.{version_hash}.json"
    payload, data_bytes = _fetch_json(data_url, timeout)
    if not isinstance(payload, list):
        raise ValueError(f"GameTora {filename} feed is not a JSON array")
    if any(not isinstance(row, dict) or id_field not in row for row in payload):
        raise ValueError(f"GameTora {filename} feed contains a row without {id_field}")

    metadata = {
        "source": source,
        "manifest_url": MANIFEST_URL,
        "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "data_url": data_url,
        "data_version_hash": version_hash,
        "data_sha256": hashlib.sha256(data_bytes).hexdigest(),
        "data_bytes": len(data_bytes),
        "row_count": len(payload),
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "server_scope_note": scope_note,
    }
    return payload, metadata


def fetch_support_data(timeout: int = 30) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return _fetch_versioned_feed(
        "support-cards",
        "support-cards",
        "support_id",
        "gametora_public_support_cards_feed",
        "Used for exact GameTora support ID/URL reconciliation and event-skill and hint cross-checks; local JP game data remains canonical for game facts.",
        timeout,
    )


def fetch_character_card_data(timeout: int = 30) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return _fetch_versioned_feed(
        "character-cards",
        "character-cards",
        "card_id",
        "gametora_public_character_cards_feed",
        "Used for exact GameTora trainee-outfit ID/URL reconciliation; local JP game data remains canonical for game facts.",
        timeout,
    )


def _load_feed(
    path: Path,
    metadata_path: Path | None,
    id_field: str,
    filename: str,
    source: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or any(not isinstance(row, dict) or id_field not in row for row in payload):
        raise ValueError(f"Invalid GameTora {filename} data file: {path}")
    metadata: dict[str, Any] = {
        "source": source,
        "data_file": path.name,
        "data_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "row_count": len(payload),
    }
    if metadata_path and metadata_path.is_file():
        supplied = json.loads(metadata_path.read_text(encoding="utf-8"))
        if isinstance(supplied, dict):
            metadata.update(supplied)
    return payload, metadata


def load_support_data(path: Path, metadata_path: Path | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return _load_feed(
        path,
        metadata_path,
        "support_id",
        "support-card",
        "gametora_public_support_cards_feed_snapshot",
    )


def load_character_card_data(path: Path, metadata_path: Path | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return _load_feed(
        path,
        metadata_path,
        "card_id",
        "character-card",
        "gametora_public_character_cards_feed_snapshot",
    )
