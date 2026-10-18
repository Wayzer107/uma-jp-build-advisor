#!/usr/bin/env python3
"""Extract addressable Umamusume JP reference records from read-only game data."""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

DEFAULT_GAME_ROOT = Path(r"C:\Steam\steamapps\common\UmamusumePrettyDerby_Jpn")
RARITIES = {1: "R", 2: "SR", 3: "SSR"}
LEVEL_COLUMN_TO_LEVEL = {
    "init": 1,
    "limit_lv5": 5,
    "limit_lv10": 10,
    "limit_lv15": 15,
    "limit_lv20": 20,
    "limit_lv25": 25,
    "limit_lv30": 30,
    "limit_lv35": 35,
    "limit_lv40": 40,
    "limit_lv45": 45,
    "limit_lv50": 50,
}
MAX_LEVEL_BY_RARITY = {1: 40, 2: 45, 3: 50}

TEXT_CATEGORIES = {
    4, 5, 6, 47, 48, 75, 76, 77, 78, 88, 150, 151, 154, 155, 181, 182,
}
SUPPORT_TYPES = {
    101: "Speed",
    102: "Power",
    103: "Guts",
    105: "Stamina",
    106: "Wit",
}
EVENT_ASSET_RE = re.compile(r"storytimeline_(\d+)\.json$", re.IGNORECASE)
VERIFIED_GAMETORA_SUPPORT_SLUGS = {
    10001: "special-week",
    10021: "tazuna-hayakawa",
}
VERIFIED_GAMETORA_CHARACTER_SLUGS = {
    1001: "special-week",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def open_master_read_only(path: Path) -> sqlite3.Connection:
    uri = path.resolve().as_uri() + "?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def timestamp_jst_date(timestamp: int) -> str | None:
    if timestamp <= 0:
        return None
    try:
        return datetime.fromtimestamp(timestamp + 9 * 60 * 60, timezone.utc).date().isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def _rows(connection: sqlite3.Connection, table: str, where: str = "", params: Iterable[Any] = ()) -> list[dict[str, Any]]:
    query = f'SELECT * FROM "{table}"'
    if where:
        query += f" WHERE {where}"
    return [dict(row) for row in connection.execute(query, tuple(params))]


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def normalize_name(value: str | None) -> str | None:
    if not value:
        return None
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = re.sub(r"[^\w\u3040-\u30ff\u3400-\u9fff]+", " ", normalized)
    return " ".join(normalized.split()) or None


def build_slug(value: str | None) -> str | None:
    if not value:
        return None
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value.lower()).strip("-")
    return slug[:80] or None


def _text_lookup(connection: sqlite3.Connection) -> dict[tuple[int, int], str]:
    categories = sorted(TEXT_CATEGORIES)
    placeholders = ",".join("?" for _ in categories)
    return {
        (_int(row["category"]), _int(row["index"])): str(row["text"])
        for row in connection.execute(
            f'SELECT category, "index", text FROM text_data WHERE category IN ({placeholders})',
            categories,
        )
    }


def _translation_bundle(path: Path | None) -> tuple[dict[str, dict[str, str]], dict[str, Any]]:
    if path is None or not path.is_file():
        return {}, {"filename": None, "sha256": None, "available": False}
    payload = json.loads(path.read_text(encoding="utf-8"))
    translations: dict[str, dict[str, str]] = {}
    if isinstance(payload, dict):
        for category, entries in payload.items():
            if isinstance(entries, dict):
                translations[str(category)] = {
                    str(key): str(value)
                    for key, value in entries.items()
                    if isinstance(value, (str, int, float)) and str(value).strip()
                }
    return translations, {
        "filename": path.name,
        "sha256": sha256_file(path),
        "available": True,
        "bundle": "localized_data_1/text_data_dict.json",
    }


def _localized(
    category: int,
    index: int,
    db_text: dict[tuple[int, int], str],
    translations: dict[str, dict[str, str]],
) -> dict[str, Any]:
    ja = db_text.get((category, index))
    en = translations.get(str(category), {}).get(str(index))
    return {
        "ja": ja,
        "en": en,
        "en_status": "translated" if en else "unavailable",
        "en_source": (
            {"kind": "hachimi", "bundle": "localized_data_1", "category": category, "index": index}
            if en
            else None
        ),
    }


def _skill_set_skills(skill_set: int, skill_sets: dict[int, dict[str, Any]]) -> list[dict[str, int]]:
    row = skill_sets.get(skill_set)
    if not row:
        return []
    skills: list[dict[str, int]] = []
    for slot in range(1, 21):
        skill_id = _int(row.get(f"skill_id{slot}"))
        if skill_id:
            skills.append(
                {
                    "slot": slot,
                    "skill_id": skill_id,
                    "skill_level": _int(row.get(f"skill_level{slot}")),
                }
            )
    return skills


def _asset_index(root: Path | None) -> dict[int, Path]:
    if root is None or not root.is_dir():
        return {}
    result: dict[int, Path] = {}
    for path in root.rglob("storytimeline_*.json"):
        match = EVENT_ASSET_RE.search(path.name)
        if match:
            result.setdefault(int(match.group(1)), path)
    return result


def _raw_row_source(table: str, row: dict[str, Any], key: str | None = None) -> dict[str, Any]:
    source: dict[str, Any] = {"table": table}
    if key and key in row:
        source["row_id"] = row[key]
    return source


def _name_indexes(items: list[dict[str, Any]], id_key: str) -> dict[str, Any]:
    by_id: dict[str, str] = {}
    by_name: dict[str, list[str]] = defaultdict(list)
    for item in items:
        item_id = str(item[id_key])
        by_id[item_id] = f"{item['kind_path']}/{item_id}.json"
        names = item.get("search_names", [])
        for name in names:
            normalized = normalize_name(name)
            if normalized and item_id not in by_name[normalized]:
                by_name[normalized].append(item_id)
    return {"by_id": by_id, "by_name": dict(sorted(by_name.items()))}


def export_catalog(
    master_path: Path,
    translations_path: Path | None,
    story_assets_root: Path | None = None,
    gametora_support_rows: list[dict[str, Any]] | None = None,
    gametora_source: dict[str, Any] | None = None,
    gametora_character_rows: list[dict[str, Any]] | None = None,
    gametora_character_source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a server-scoped catalog bundle; all source files are opened read-only."""
    if not master_path.is_file():
        raise FileNotFoundError(f"Master database not found: {master_path}")

    translations, translation_source = _translation_bundle(translations_path)
    assets = _asset_index(story_assets_root)
    asset_hashes: dict[int, str] = {}
    gametora_by_id: dict[int, dict[str, Any]] = {}
    gametora_duplicate_ids: list[int] = []
    for row in gametora_support_rows or []:
        support_id = _int(row.get("support_id"), -1)
        if support_id < 0:
            continue
        if support_id in gametora_by_id:
            gametora_duplicate_ids.append(support_id)
        else:
            gametora_by_id[support_id] = row
    gametora_character_by_id: dict[int, dict[str, Any]] = {}
    gametora_character_duplicate_ids: list[int] = []
    for row in gametora_character_rows or []:
        card_id = _int(row.get("card_id"), -1)
        if card_id < 0:
            continue
        if card_id in gametora_character_by_id:
            gametora_character_duplicate_ids.append(card_id)
        else:
            gametora_character_by_id[card_id] = row
    connection = open_master_read_only(master_path)
    try:
        db_text = _text_lookup(connection)

        effect_rows: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in _rows(connection, "support_card_effect_table"):
            effect_rows[_int(row["id"])].append(row)

        unique_rows: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in _rows(connection, "support_card_unique_effect"):
            unique_rows[_int(row["id"])].append(row)

        hint_rows: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in _rows(connection, "single_mode_hint_gain"):
            support_id = _int(row.get("support_card_id"))
            if support_id:
                hint_rows[support_id].append(row)

        story_roots: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in _rows(connection, "single_mode_story_root"):
            story_roots[_int(row.get("story_id"))].append(row)
        story_conditions: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in _rows(connection, "single_mode_story_condition_set"):
            story_conditions[_int(row.get("story_id"))].append(row)

        skill_sets = {_int(row["id"]): row for row in _rows(connection, "skill_set")}
        skill_rows = _rows(connection, "skill_data")
        skills: list[dict[str, Any]] = []
        skill_by_id: dict[int, dict[str, Any]] = {}
        for row in skill_rows:
            skill_id = _int(row["id"])
            name = _localized(47, skill_id, db_text, translations)
            description = _localized(48, skill_id, db_text, translations)
            skill = {
                "id": skill_id,
                "kind": "skill",
                "kind_path": "skills",
                "name": name["en"] or name["ja"] or f"Skill {skill_id}",
                "name_text": name,
                "description_text": description,
                "rarity": _int(row.get("rarity")),
                "category_code": _int(row.get("skill_category")),
                "group_id": _int(row.get("group_id")),
                "grade_value_raw": row.get("grade_value"),
                "display_order": _int(row.get("disp_order")),
                "activation": {
                    "precondition_1": row.get("precondition_1"),
                    "condition_1": row.get("condition_1"),
                    "precondition_2": row.get("precondition_2"),
                    "condition_2": row.get("condition_2"),
                },
                "effect_components_raw": {
                    key: value
                    for key, value in row.items()
                    if key.startswith(("float_ability", "ability_", "additional_activate", "target_", "popularity_add"))
                },
                "related_ids": {
                    "unique_skill_id_1": row.get("unique_skill_id_1"),
                    "unique_skill_id_2": row.get("unique_skill_id_2"),
                    "tag_id": row.get("tag_id"),
                },
                "raw_game_row": row,
                "source": _raw_row_source("skill_data", row, "id"),
                "search_names": [name["ja"], name["en"]],
            }
            skills.append(skill)
            skill_by_id[skill_id] = skill

        supports: list[dict[str, Any]] = []
        support_rows = _rows(connection, "support_card_data", "1=1 ORDER BY id")
        local_support_ids = {_int(row["id"]) for row in support_rows}
        gametora_support_ids = set(gametora_by_id)
        missing_gametora_ids = sorted(local_support_ids - gametora_support_ids)
        extra_gametora_ids = sorted(gametora_support_ids - local_support_ids)
        gametora_set_matches = (
            bool(gametora_support_rows)
            and not gametora_duplicate_ids
            and not missing_gametora_ids
            and not extra_gametora_ids
        )
        if gametora_set_matches:
            gametora_mapping_status = "verified_full_id_set"
        elif gametora_support_rows:
            gametora_mapping_status = "incomplete_id_set"
        else:
            gametora_mapping_status = "sampled_only"
        for row in support_rows:
            support_id = _int(row["id"])
            chara_id = _int(row["chara_id"])
            display = _localized(75, support_id, db_text, translations)
            title = _localized(76, support_id, db_text, translations)
            character = _localized(6, chara_id, db_text, translations)
            if not character["ja"] and not character["en"]:
                character = _localized(182, chara_id, db_text, translations)
            rarity = _int(row.get("rarity"))
            max_level = MAX_LEVEL_BY_RARITY.get(rarity, 50)

            effects: list[dict[str, Any]] = []
            for effect in sorted(effect_rows.get(_int(row.get("effect_table_id")), []), key=lambda item: _int(item.get("type"))):
                type_code = _int(effect.get("type"))
                values: dict[str, int] = {}
                for column, level in LEVEL_COLUMN_TO_LEVEL.items():
                    value = _int(effect.get(column), -1)
                    if value != -1:
                        values[str(level)] = value
                available = [(int(level), value) for level, value in values.items() if int(level) <= max_level]
                effects.append(
                    {
                        "type_code": type_code,
                        "name_text": _localized(151, type_code, db_text, translations),
                        "description_text": _localized(154, type_code, db_text, translations),
                        "unit_hint": None,
                        "interpretation_status": "raw values preserved; unit decoder not yet verified",
                        "values_by_level": values,
                        "value_at_rarity_cap": available[-1][1] if available else None,
                        "value_level": available[-1][0] if available else None,
                        "raw_game_row": effect,
                    }
                )

            unique_id = _int(row.get("unique_effect_id"))
            unique_effect = []
            for effect in unique_rows.get(unique_id, []):
                unique_effect.append(
                    {
                        "level_requirement_raw": _int(effect.get("lv")),
                        "name_text": _localized(150, unique_id, db_text, translations),
                        "description_text": _localized(155, unique_id, db_text, translations),
                        "components": [
                            {
                                "slot": slot,
                                "type_code": _int(effect.get(f"type_{slot}")),
                                "values": [effect.get(f"value_{slot}{suffix}") for suffix in ("", "_1", "_2", "_3", "_4")],
                            }
                            for slot in (0, 1)
                            if _int(effect.get(f"type_{slot}")) != 0
                        ],
                        "idle_mode_sub_rate_raw": effect.get("idle_mode_sub_rate"),
                        "raw_game_row": effect,
                    }
                )

            hints: list[dict[str, Any]] = []
            unresolved_hint_skill_ids: list[int] = []
            for hint in sorted(hint_rows.get(support_id, []), key=lambda item: (_int(item.get("hint_group")), _int(item.get("id")))):
                hint_type = _int(hint.get("hint_gain_type"))
                skill_id = _int(hint.get("hint_value_1")) if hint_type == 0 else 0
                linked_skill = skill_by_id.get(skill_id)
                if skill_id and not linked_skill:
                    unresolved_hint_skill_ids.append(skill_id)
                hints.append(
                    {
                        "hint_row_id": _int(hint.get("id")),
                        "hint_id": _int(hint.get("hint_id")),
                        "hint_group": _int(hint.get("hint_group")),
                        "hint_gain_type_raw": hint_type,
                        "skill_id": skill_id or None,
                        "skill_name": linked_skill["name"] if linked_skill else None,
                        "skill_ref_status": "resolved" if linked_skill else ("not_a_skill_hint" if hint_type != 0 else "unresolved"),
                        "hint_value_1_raw": hint.get("hint_value_1"),
                        "hint_value_2_raw": hint.get("hint_value_2"),
                        "group_id": _int(hint.get("group_id")),
                        "condition_set_id": _int(hint.get("condition_set_id")),
                        "priority": _int(hint.get("priority")),
                        "raw_game_row": hint,
                    }
                )

            group_members = _rows(connection, "support_card_group", "support_card_id=?", [support_id])
            release_date = timestamp_jst_date(_int(row.get("start_date")))
            gametora_row = gametora_by_id.get(support_id)
            verified_url_name = gametora_row.get("url_name") if gametora_row else None
            character_slug = VERIFIED_GAMETORA_SUPPORT_SLUGS.get(support_id)
            candidate_slug = build_slug(character["en"])
            local_hint_ids = sorted({hint["skill_id"] for hint in hints if hint.get("skill_id")})
            remote_hints = (gametora_row or {}).get("hints") or {}
            remote_hint_ids = sorted({_int(skill_id) for skill_id in remote_hints.get("hint_skills", []) if _int(skill_id)})
            remote_event_skill_ids = sorted({_int(skill_id) for skill_id in (gametora_row or {}).get("event_skills", []) if _int(skill_id)})
            remote_event_skill_links = [
                {
                    "skill_id": skill_id,
                    "skill_name": skill_by_id[skill_id]["name"] if skill_id in skill_by_id else None,
                    "ref_status": "resolved" if skill_id in skill_by_id else "unresolved",
                }
                for skill_id in remote_event_skill_ids
            ]
            hints_match = bool(gametora_row) and local_hint_ids == remote_hint_ids
            supports.append(
                {
                    "id": support_id,
                    "kind": "support_card",
                    "kind_path": "support-cards",
                    "server": "ja",
                    "name": display["en"] or display["ja"] or f"Support card {support_id}",
                    "name_text": display,
                    "title_text": title,
                    "character_id": chara_id,
                    "character_name_text": character,
                    "rarity": rarity,
                    "rarity_label": RARITIES.get(rarity, f"Rarity {rarity}"),
                    "support_type": SUPPORT_TYPES.get(_int(row.get("command_id")), "Pal" if _int(row.get("support_card_type")) == 2 else ("Group" if _int(row.get("support_card_type")) == 3 else None)),
                    "support_type_raw": {"command_id": row.get("command_id"), "support_card_type": row.get("support_card_type")},
                    "release_date_jst": release_date,
                    "effect_table_id": _int(row.get("effect_table_id")),
                    "effects": effects,
                    "unique_effect_id": unique_id,
                    "unique_effect_rows": unique_effect,
                    "hint_id": _int(row.get("skill_set_id")),
                    "hints_and_rewards": hints,
                    "unresolved_hint_skill_ids": sorted(set(unresolved_hint_skill_ids)),
                    "event_skill_ids_gametora": remote_event_skill_ids,
                    "event_skill_links_gametora": remote_event_skill_links,
                    "gametora_hint_crosscheck": {
                        "status": "exact_id_match" if hints_match else ("different" if gametora_row else "unavailable"),
                        "local_hint_skill_ids": local_hint_ids,
                        "gametora_hint_skill_ids": remote_hint_ids,
                        "gametora_only_skill_ids": sorted(set(remote_hint_ids) - set(local_hint_ids)),
                        "local_only_skill_ids": sorted(set(local_hint_ids) - set(remote_hint_ids)),
                    },
                    "group_members": [
                        {"character_id": _int(member.get("chara_id")), "outing_max": _int(member.get("outing_max")), "source_row_id": _int(member.get("id"))}
                        for member in group_members
                    ],
                    "gametora": {
                        "id": support_id,
                        "url": f"https://gametora.com/umamusume/supports/{verified_url_name}" if verified_url_name else (f"https://gametora.com/umamusume/supports/{support_id}-{character_slug}" if character_slug else None),
                        "url_candidate": f"https://gametora.com/umamusume/supports/{support_id}-{candidate_slug}" if candidate_slug else None,
                        "url_name": verified_url_name,
                        "mapping_status": gametora_mapping_status,
                        "source_data_version": (gametora_source or {}).get("data_version_hash"),
                        "reconciliation_note": "The complete local support ID set was compared with the versioned GameTora support-cards feed." if gametora_set_matches else "Only sampled numeric route patterns are available; full ID-set reconciliation is incomplete.",
                    },
                    "source": {
                        **_raw_row_source("support_card_data", row, "id"),
                        "effect_table": "support_card_effect_table",
                        "unique_effect_table": "support_card_unique_effect",
                        "hints_table": "single_mode_hint_gain",
                        "text_categories": [75, 76, 6, 182, 151, 154, 150, 155],
                        "gametora_event_skills": "GameTora support-cards feed; source details are recorded in the catalog manifest.",
                    },
                    "raw_game_row": row,
                    "search_names": [display["ja"], display["en"], title["ja"], title["en"], character["ja"], character["en"]],
                }
            )

        trainee_rows = _rows(connection, "card_data", "default_rarity > 0 ORDER BY id")
        local_trainee_ids = {_int(row["id"]) for row in trainee_rows}
        gametora_trainee_ids = set(gametora_character_by_id)
        missing_gametora_trainees = sorted(local_trainee_ids - gametora_trainee_ids)
        extra_gametora_trainees = sorted(gametora_trainee_ids - local_trainee_ids)
        gametora_trainee_set_matches = (
            bool(gametora_character_rows)
            and not gametora_character_duplicate_ids
            and not missing_gametora_trainees
            and not extra_gametora_trainees
        )
        gametora_trainee_mapping_status = (
            "verified_full_id_set"
            if gametora_trainee_set_matches
            else "incomplete_id_set"
            if gametora_character_rows
            else "unverified"
        )
        rarities_by_card: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for rarity in _rows(connection, "card_rarity_data"):
            rarities_by_card[_int(rarity.get("card_id"))].append(rarity)

        available_by_set: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for available in _rows(connection, "available_skill_set"):
            available_by_set[_int(available.get("available_skill_set_id"))].append(available)
        skill_upgrade_by_card: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for upgrade in _rows(connection, "skill_upgrade_succession_skill"):
            skill_upgrade_by_card[_int(upgrade.get("card_id"))].append(upgrade)

        trainees: list[dict[str, Any]] = []
        for row in trainee_rows:
            outfit_id = _int(row["id"])
            chara_id = _int(row["chara_id"])
            outfit_name = _localized(4, outfit_id, db_text, translations)
            outfit_title = _localized(5, outfit_id, db_text, translations)
            character = _localized(6, chara_id, db_text, translations)
            if not character["ja"] and not character["en"]:
                character = _localized(182, chara_id, db_text, translations)

            available_skills: list[dict[str, Any]] = []
            unresolved_available_skill_ids: list[int] = []
            for available in available_by_set.get(_int(row.get("available_skill_set_id")), []):
                skill_id = _int(available.get("skill_id"))
                linked = skill_by_id.get(skill_id)
                if skill_id and not linked:
                    unresolved_available_skill_ids.append(skill_id)
                available_skills.append(
                    {
                        "skill_id": skill_id,
                        "skill_name": linked["name"] if linked else None,
                        "need_rank": _int(available.get("need_rank")),
                        "source_row_id": _int(available.get("id")),
                        "ref_status": "resolved" if linked else "unresolved",
                    }
                )

            rarity_records: list[dict[str, Any]] = []
            for rarity in sorted(rarities_by_card.get(outfit_id, []), key=lambda item: _int(item.get("rarity"))):
                skill_set_id = _int(rarity.get("skill_set"))
                rarity_skill_rows = _skill_set_skills(skill_set_id, skill_sets)
                for skill in rarity_skill_rows:
                    linked = skill_by_id.get(skill["skill_id"])
                    skill["skill_name"] = linked["name"] if linked else None
                    skill["ref_status"] = "resolved" if linked else "unresolved"
                rarity_records.append(
                    {
                        "rarity": _int(rarity.get("rarity")),
                        "base_stats": {name: _int(rarity.get(field)) for name, field in (("speed", "speed"), ("stamina", "stamina"), ("power", "pow"), ("guts", "guts"), ("wit", "wiz"))},
                        "max_stats": {name: _int(rarity.get(field)) for name, field in (("speed", "max_speed"), ("stamina", "max_stamina"), ("power", "max_pow"), ("guts", "max_guts"), ("wit", "max_wiz"))},
                        "aptitudes_raw": {key: value for key, value in rarity.items() if key.startswith("proper_")},
                        "race_dress_id": _int(rarity.get("race_dress_id")),
                        "costume_ids": [_int(rarity.get("get_dress_id_1")), _int(rarity.get("get_dress_id_2"))],
                        "skill_set_id": skill_set_id,
                        "skills": rarity_skill_rows,
                        "raw_game_row": rarity,
                    }
                )

            gametora_row = gametora_character_by_id.get(outfit_id)
            verified_url_name = gametora_row.get("url_name") if gametora_row else None
            character_slug = VERIFIED_GAMETORA_CHARACTER_SLUGS.get(chara_id)
            candidate_slug = build_slug(character["en"])
            trainees.append(
                {
                    "id": outfit_id,
                    "kind": "trainee_outfit",
                    "kind_path": "trainees",
                    "server": "ja",
                    "chara_id": chara_id,
                    "name": outfit_name["en"] or outfit_name["ja"] or f"Trainee outfit {outfit_id}",
                    "name_text": outfit_name,
                    "title_text": outfit_title,
                    "character_name_text": character,
                    "rarity": _int(row.get("default_rarity")),
                    "limited": bool(_int(row.get("limited_chara"))),
                    "growth_rates": {name: _int(row.get(field)) for name, field in (("speed", "talent_speed"), ("stamina", "talent_stamina"), ("power", "talent_pow"), ("guts", "talent_guts"), ("wit", "talent_wiz"))},
                    "running_style_code_raw": row.get("running_style"),
                    "available_skill_set_id": _int(row.get("available_skill_set_id")),
                    "available_skills": available_skills,
                    "rarity_data": rarity_records,
                    "unresolved_available_skill_ids": sorted(set(unresolved_available_skill_ids)),
                    "special_skill_upgrades": [
                        {
                            "base_skill_id": _int(upgrade.get("base_skill_id")),
                            "replacement_skill_id": _int(upgrade.get("skill_id")),
                            "start_date_jst": timestamp_jst_date(_int(upgrade.get("start_date"))),
                            "source_row_id": _int(upgrade.get("id")),
                        }
                        for upgrade in skill_upgrade_by_card.get(outfit_id, [])
                    ],
                    "gametora": {
                        "id": outfit_id if gametora_row else None,
                        "character_id": _int(gametora_row.get("char_id")) if gametora_row else None,
                        "trainee_tid": str(gametora_row.get("tid")) if gametora_row and gametora_row.get("tid") is not None else None,
                        "url": f"https://gametora.com/umamusume/characters/{verified_url_name}" if verified_url_name else None,
                        "url_name": verified_url_name,
                        "source_data_version": (gametora_character_source or {}).get("data_version_hash"),
                        "mapping_status": gametora_trainee_mapping_status,
                        "character_url": f"https://gametora.com/umamusume/characters/{character_slug}" if character_slug else None,
                        "character_url_candidate": f"https://gametora.com/umamusume/characters/{candidate_slug}" if candidate_slug else None,
                        "note": "GameTora's versioned character-cards feed was reconciled against the full installed card_data outfit ID set." if gametora_trainee_set_matches else "The exact GameTora character-card mapping could not be verified against the full installed card_data outfit ID set.",
                    },
                    "source": {
                        **_raw_row_source("card_data", row, "id"),
                        "rarity_table": "card_rarity_data",
                        "available_skills_table": "available_skill_set",
                        "skill_set_table": "skill_set",
                        "text_categories": [4, 5, 6, 182],
                    },
                    "raw_game_row": row,
                    "search_names": [outfit_name["ja"], outfit_name["en"], outfit_title["ja"], outfit_title["en"], character["ja"], character["en"]],
                }
            )

        story_rows = _rows(
            connection,
            "single_mode_story_data",
            "support_card_id > 0 OR support_chara_id > 0 OR card_id > 0 OR card_chara_id > 0 ORDER BY id",
        )
        events: list[dict[str, Any]] = []
        for row in story_rows:
            event_id = _int(row["id"])
            story_id = _int(row["story_id"])
            title = _localized(181, story_id, db_text, translations)
            asset_path = assets.get(story_id)
            if asset_path and story_id not in asset_hashes:
                asset_hashes[story_id] = sha256_file(asset_path)
            events.append(
                {
                    "id": event_id,
                    "kind": "training_event",
                    "kind_path": "events",
                    "server": "ja",
                    "story_id": story_id,
                    "title_text": title,
                    "support_card_id": _int(row.get("support_card_id")) or None,
                    "support_chara_id": _int(row.get("support_chara_id")) or None,
                    "trainee_outfit_id": _int(row.get("card_id")) or None,
                    "trainee_chara_id": _int(row.get("card_chara_id")) or None,
                    "event_category_raw": row.get("event_category"),
                    "gallery_flag": _int(row.get("gallery_flag")),
                    "chain": {
                        "progress_1_raw": row.get("show_progress_1"),
                        "progress_2_raw": row.get("show_progress_2"),
                        "progress_3_raw": row.get("show_progress_3"),
                    },
                    "branch_conditions": {
                        "root": story_roots.get(story_id, []),
                        "condition_sets": story_conditions.get(story_id, []),
                    },
                    "story_asset": {
                        "status": "available" if asset_path else "not_in_extracted_assets",
                        "relative_path": asset_path.relative_to(story_assets_root).as_posix() if asset_path and story_assets_root else None,
                        "sha256": asset_hashes.get(story_id),
                        "dialogue_copied": False,
                    },
                    "outcomes": {
                        "status": "unavailable_from_installed_master",
                        "choices": None,
                        "rewards": None,
                        "required_source": "Reviewed structured JP event dataset or verified structured rewards extracted from matching installed story data.",
                    },
                    "source": {
                        **_raw_row_source("single_mode_story_data", row, "id"),
                        "title_text_category": 181,
                        "branch_tables": ["single_mode_story_root", "single_mode_story_condition_set"],
                    },
                    "raw_game_row": row,
                    "search_names": [title["ja"], title["en"]],
                }
            )

        events_by_support: dict[int, list[int]] = defaultdict(list)
        events_by_trainee: dict[int, list[int]] = defaultdict(list)
        events_by_character: dict[int, list[int]] = defaultdict(list)
        for event in events:
            if event["support_card_id"]:
                events_by_support[event["support_card_id"]].append(event["id"])
            if event["trainee_outfit_id"]:
                events_by_trainee[event["trainee_outfit_id"]].append(event["id"])
            if event["support_chara_id"] or event["trainee_chara_id"]:
                events_by_character[event["support_chara_id"] or event["trainee_chara_id"]].append(event["id"])
        for support in supports:
            support["training_event_ids"] = sorted(events_by_support.get(support["id"], []))
            support["character_event_ids"] = sorted(events_by_character.get(support["character_id"], []))
        for trainee in trainees:
            trainee["training_event_ids"] = sorted(events_by_trainee.get(trainee["id"], []))
            trainee["character_event_ids"] = sorted(events_by_character.get(trainee["chara_id"], []))

        skill_sources: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for support in supports:
            for hint in support["hints_and_rewards"]:
                skill_id = hint.get("skill_id")
                if skill_id and hint["skill_ref_status"] == "resolved":
                    skill_sources[skill_id].append({"kind": "support_card_hint", "id": support["id"], "hint_group": hint["hint_group"]})
        for trainee in trainees:
            for available in trainee["available_skills"]:
                if available["ref_status"] == "resolved":
                    skill_sources[available["skill_id"]].append({"kind": "trainee_unlock", "id": trainee["id"], "need_rank": available["need_rank"]})
            for rarity in trainee["rarity_data"]:
                for entry in rarity["skills"]:
                    if entry["ref_status"] == "resolved":
                        skill_sources[entry["skill_id"]].append({"kind": "trainee_rarity_skill_set", "id": trainee["id"], "rarity": rarity["rarity"], "skill_level": entry["skill_level"]})
        for skill in skills:
            skill["acquisition_sources"] = skill_sources.get(skill["id"], [])

        scenario_rows = _rows(connection, "single_mode_scenario", "1=1 ORDER BY id")
        scenario_groups: dict[int, list[int]] = defaultdict(list)
        for row in _rows(connection, "single_mode_scenario_group"):
            scenario_groups[_int(row.get("scenario_id"))].append(_int(row.get("group_id")))
        scenario_skill_upgrades: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for upgrade in _rows(connection, "skill_upgrade_speciality"):
            scenario_skill_upgrades[_int(upgrade.get("scenario_id"))].append(upgrade)
        scenarios = [
            {
                "id": _int(row["id"]),
                "kind": "scenario",
                "kind_path": "scenarios",
                "server": "ja",
                "scenario_group_ids": sorted(scenario_groups.get(_int(row["id"]), [])),
                "start_date_jst": timestamp_jst_date(_int(row.get("start_date"))),
                "end_date_jst": timestamp_jst_date(_int(row.get("end_date"))),
                "skill_upgrade_num": _int(row.get("skill_upgrade_num")),
                "max_skill_point": _int(row.get("max_skill_point")),
                "support_num": _int(row.get("support_num")),
                "special_skill_upgrades": [
                    {
                        "base_skill_id": _int(upgrade.get("base_skill_id")),
                        "replacement_skill_id": _int(upgrade.get("skill_id")),
                        "start_date_jst": timestamp_jst_date(_int(upgrade.get("start_date"))),
                        "source_row_id": _int(upgrade.get("id")),
                    }
                    for upgrade in scenario_skill_upgrades.get(_int(row["id"]), [])
                ],
                "raw_parameters": row,
                "source": _raw_row_source("single_mode_scenario", row, "id"),
                "search_names": [],
            }
            for row in scenario_rows
        ]

        course_rows = _rows(connection, "race_course_set", "1=1 ORDER BY id")
        track_by_id = {_int(row["id"]): row for row in _rows(connection, "race_track")}
        courses: list[dict[str, Any]] = []
        for row in course_rows:
            course_id = _int(row["id"])
            track_id = _int(row.get("race_track_id"))
            courses.append(
                {
                    "id": course_id,
                    "kind": "race_course",
                    "kind_path": "races/courses",
                    "server": "ja",
                    "track_id": track_id,
                    "track_data_raw": track_by_id.get(track_id),
                    "distance_m": _int(row.get("distance")),
                    "ground_code_raw": row.get("ground"),
                    "direction_code_raw": row.get("inout"),
                    "turn_code_raw": row.get("turn"),
                    "course_parameters_raw": row,
                    "source": _raw_row_source("race_course_set", row, "id"),
                    "search_names": [],
                }
            )
        course_by_id = {_int(row["id"]): row for row in courses}
        instances_by_race: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in _rows(connection, "race_instance"):
            instances_by_race[_int(row.get("race_id"))].append(row)
        races: list[dict[str, Any]] = []
        for row in _rows(connection, "race", "1=1 ORDER BY id"):
            race_id = _int(row["id"])
            course_id = _int(row.get("course_set"))
            races.append(
                {
                    "id": race_id,
                    "kind": "race",
                    "kind_path": "races",
                    "server": "ja",
                    "course_set_id": course_id,
                    "course": course_by_id.get(course_id),
                    "instances": sorted(instances_by_race.get(race_id, []), key=lambda item: _int(item.get("id"))),
                    "race_group_raw": row.get("group"),
                    "grade_raw": row.get("grade"),
                    "start_date_jst": timestamp_jst_date(_int(row.get("start_date"))),
                    "raw_game_row": row,
                    "source": _raw_row_source("race", row, "id"),
                    "search_names": [],
                }
            )
        race_conditions = [
            {
                "id": _int(row["id"]),
                "kind": "race_condition",
                "kind_path": "races/conditions",
                "server": "ja",
                "raw_game_row": row,
                "source": _raw_row_source("race_condition", row, "id"),
                "search_names": [],
            }
            for row in _rows(connection, "race_condition", "1=1 ORDER BY id")
        ]

        factor_effects: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in _rows(connection, "succession_factor_effect"):
            factor_effects[_int(row.get("factor_group_id"))].append(row)
        factors: list[dict[str, Any]] = []
        for row in _rows(connection, "succession_factor", "1=1 ORDER BY factor_id"):
            factor_id = _int(row["factor_id"])
            group_id = _int(row.get("factor_group_id"))
            factors.append(
                {
                    "id": factor_id,
                    "kind": "inheritance_factor",
                    "kind_path": "factors",
                    "server": "ja",
                    "factor_group_id": group_id,
                    "factor_type_raw": row.get("factor_type"),
                    "rarity": _int(row.get("rarity")),
                    "grade": _int(row.get("grade")),
                    "effect_group_id": _int(row.get("effect_group_id")),
                    "hidden": bool(_int(row.get("succession_search_hidden"))),
                    "start_date_jst": timestamp_jst_date(_int(row.get("start_date"))),
                    "end_date_jst": timestamp_jst_date(_int(row.get("end_date"))),
                    "effects_raw": factor_effects.get(group_id, []),
                    "raw_game_row": row,
                    "source": _raw_row_source("succession_factor", row, "factor_id"),
                    "search_names": [],
                }
            )

        source_tables = {
            name: _int(connection.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0])
            for name in (
                "support_card_data", "support_card_effect_table", "support_card_unique_effect",
                "single_mode_hint_gain", "single_mode_story_data", "card_data", "card_rarity_data",
                "available_skill_set", "skill_set", "skill_data", "single_mode_scenario",
                "single_mode_scenario_group", "race", "race_instance", "race_course_set",
                "race_condition", "succession_factor", "succession_factor_effect",
            )
        }
        unresolved_hints = [
            {"support_card_id": card["id"], "skill_ids": card["unresolved_hint_skill_ids"]}
            for card in supports if card["unresolved_hint_skill_ids"]
        ]
        unresolved_trainee_skills = [
            {"trainee_outfit_id": trainee["id"], "skill_ids": trainee["unresolved_available_skill_ids"]}
            for trainee in trainees if trainee["unresolved_available_skill_ids"]
        ]
        timeline_missing = sorted({event["story_id"] for event in events if event["story_asset"]["status"] != "available"})

        counts = {
            "support_cards": len(supports),
            "trainee_outfits": len(trainees),
            "skills": len(skills),
            "events": len(events),
            "scenarios": len(scenarios),
            "races": len(races),
            "race_courses": len(courses),
            "race_conditions": len(race_conditions),
            "factors": len(factors),
        }
        gametora_reconciliation = {
            "status": "verified_full_id_set" if gametora_set_matches else gametora_mapping_status,
            "support_cards": {
                "status": "verified_full_id_set" if gametora_set_matches else gametora_mapping_status,
                "local_ids": len(local_support_ids),
                "gametora_ids": len(gametora_support_ids),
                "missing_in_gametora": missing_gametora_ids,
                "extra_in_gametora": extra_gametora_ids,
                "duplicate_gametora_ids": sorted(set(gametora_duplicate_ids)),
                "data_version_hash": (gametora_source or {}).get("data_version_hash"),
                "source_url": (gametora_source or {}).get("data_url"),
            },
            "trainee_outfits": {
                "status": gametora_trainee_mapping_status,
                "local_ids": len(local_trainee_ids),
                "gametora_ids": len(gametora_trainee_ids),
                "missing_in_gametora": missing_gametora_trainees,
                "extra_in_gametora": extra_gametora_trainees,
                "duplicate_gametora_ids": sorted(set(gametora_character_duplicate_ids)),
                "data_version_hash": (gametora_character_source or {}).get("data_version_hash"),
                "source_url": (gametora_character_source or {}).get("data_url"),
            },
            "local_support_ids": len(local_support_ids),
            "gametora_support_ids": len(gametora_support_ids),
            "missing_in_gametora": missing_gametora_ids,
            "extra_in_gametora": extra_gametora_ids,
            "duplicate_gametora_ids": sorted(set(gametora_duplicate_ids)),
            "data_version_hash": (gametora_source or {}).get("data_version_hash"),
            "source_url": (gametora_source or {}).get("data_url"),
        }
        scope_counts = {
            "support_cards": len(support_rows),
            "trainee_outfits": len(trainee_rows),
            "skills": len(skill_rows),
            "events": len(story_rows),
            "scenarios": len(scenario_rows),
            "races": source_tables["race"],
            "race_courses": source_tables["race_course_set"],
            "race_conditions": source_tables["race_condition"],
            "factors": source_tables["succession_factor"],
        }
        translation_coverage = {
            str(category): {
                "master_text_rows": sum(1 for key in db_text if key[0] == category),
                "translated_keys": len(translations.get(str(category), {})),
            }
            for category in sorted(TEXT_CATEGORIES)
            if any(key[0] == category for key in db_text)
        }
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        return {
            "schema_version": 1,
            "server": "ja",
            "generated_at_utc": now,
            "source": {
                "game": "Umamusume Pretty Derby Japanese server",
                "master_filename": master_path.name,
                "master_sha256": sha256_file(master_path),
                "master_bytes": master_path.stat().st_size,
                "translation": translation_source,
                "gametora_support_data": gametora_source,
                "gametora_character_card_data": gametora_character_source,
                "story_assets": {
                    "available": bool(story_assets_root and story_assets_root.is_dir()),
                    "pattern": "assets/story/data/**/storytimeline_{story_id}.json",
                },
                "read_only": True,
                "inventory_included": False,
            },
            "counts": counts,
            "source_counts": source_tables,
            "scope_counts": scope_counts,
            "gametora_reconciliation": gametora_reconciliation,
            "translation_coverage": translation_coverage,
            "unresolved_links": {
                "support_hint_skills": unresolved_hints,
                "trainee_available_skills": unresolved_trainee_skills,
                "missing_story_assets": {
                    "count": len(timeline_missing),
                    "sample_story_ids": timeline_missing[:25],
                },
            },
            "unavailable_fields": [
                {"entity": "training_event", "fields": ["choices", "rewards"], "reason": "No keyed outcome payload was found in the inspected installed master tables; matching extracted story assets are incomplete and do not by themselves provide structured rewards."},
                {"entity": "interpreted_codes", "fields": ["skill effects", "aptitudes", "race conditions", "inheritance effect labels"], "reason": "Raw source codes are retained until a decoder is independently reviewed."},
            ],
            "coverage_status": "incomplete",
            "support_cards": supports,
            "trainee_outfits": trainees,
            "skills": skills,
            "events": events,
            "scenarios": scenarios,
            "races": races,
            "race_courses": courses,
            "race_conditions": race_conditions,
            "factors": factors,
        }
    finally:
        connection.close()


def default_source_paths(game_root: Path = DEFAULT_GAME_ROOT) -> tuple[Path, Path, Path]:
    master = game_root / "UmamusumePrettyDerby_Jpn_Data" / "Persistent" / "master" / "master.mdb"
    localization = game_root / "hachimi" / "localized_data_1" / "text_data_dict.json"
    stories = game_root / "hachimi" / "localized_data_1" / "assets" / "story" / "data"
    return master, localization, stories
