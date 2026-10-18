#!/usr/bin/env python3
"""Export the locally installed JP master database into the public catalog format.

The database is opened read-only. Account saves are never accessed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_GAME_ROOT = Path(r"C:\Steam\steamapps\common\UmamusumePrettyDerby_Jpn")
STAT_TYPES = {
    101: "Speed",
    102: "Stamina",
    103: "Guts",
    105: "Power",
    106: "Wit",
}
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
VALUE_UNITS = {
    1: "percent",
    2: "percent",
    3: "flat stat points",
    4: "flat stat points",
    5: "flat stat points",
    6: "flat stat points",
    7: "flat stat points",
    8: "percent",
    9: "flat stat points",
    10: "flat stat points",
    11: "flat stat points",
    12: "flat stat points",
    13: "flat stat points",
    14: "friendship gauge points",
    15: "percent",
    16: "percent",
    17: "hint levels",
    18: "percent",
    19: "priority points",
    25: "percent",
    26: "percent",
    27: "percent",
    28: "percent",
    30: "flat skill points",
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


def load_translations(path: Path | None) -> dict[str, dict[str, str]]:
    if path is None or not path.is_file():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    result: dict[str, dict[str, str]] = {}
    if isinstance(payload, dict):
        for category, entries in payload.items():
            if isinstance(entries, dict):
                result[str(category)] = {str(key): str(value) for key, value in entries.items()}
    return result


def build_slug(name: str, card_id: int) -> str:
    value = name.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:72] or f"card-{card_id}"


def timestamp_jst_date(timestamp: int) -> str | None:
    if timestamp <= 0:
        return None
    try:
        # Game start dates are Japan-local epoch values; adding JST preserves the game date.
        return datetime.fromtimestamp(timestamp + 9 * 60 * 60, timezone.utc).date().isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def export_catalog(master_path: Path, translations_path: Path | None) -> dict[str, Any]:
    if not master_path.is_file():
        raise FileNotFoundError(f"Master database not found: {master_path}")

    translations = load_translations(translations_path)

    def tx(category: int, index: int, db_text: dict[tuple[int, int], str]) -> str | None:
        translated = translations.get(str(category), {}).get(str(index))
        if translated:
            return translated
        return db_text.get((category, index))

    connection = open_master_read_only(master_path)
    try:
        text_categories = (4, 5, 6, 75, 76, 77, 78, 151, 154, 150, 155)
        placeholders = ",".join("?" for _ in text_categories)
        db_text = {
            (int(row["category"]), int(row["index"])): str(row["text"])
            for row in connection.execute(
                f'SELECT category, "index", text FROM text_data WHERE category IN ({placeholders})',
                text_categories,
            )
        }

        effect_tables: dict[int, list[sqlite3.Row]] = {}
        for row in connection.execute("SELECT * FROM support_card_effect_table ORDER BY id, type"):
            effect_tables.setdefault(int(row["id"]), []).append(row)

        unique_effects = {
            int(row["id"]): dict(row)
            for row in connection.execute("SELECT * FROM support_card_unique_effect")
        }

        today = datetime.now(timezone.utc).date().isoformat()
        support_cards: list[dict[str, Any]] = []
        for raw in connection.execute("SELECT * FROM support_card_data ORDER BY id"):
            card_id = int(raw["id"])
            rarity = int(raw["rarity"])
            command_id = int(raw["command_id"])
            category_code = int(raw["support_card_type"])
            name_ja = db_text.get((75, card_id))
            character_ja = db_text.get((77, card_id))
            title_ja = db_text.get((76, card_id))
            name_en = tx(75, card_id, db_text)
            character_en = tx(77, card_id, db_text)
            title_en = tx(76, card_id, db_text)
            display_name = name_en or name_ja or f"Support card {card_id}"

            if command_id in STAT_TYPES:
                support_type = STAT_TYPES[command_id]
            elif category_code == 2:
                support_type = "Pal/Group"
            else:
                support_type = "Unclassified"

            max_level = MAX_LEVEL_BY_RARITY.get(rarity, 50)
            effects: list[dict[str, Any]] = []
            for effect in effect_tables.get(int(raw["effect_table_id"]), []):
                type_code = int(effect["type"])
                values: dict[str, int] = {}
                for column, level in LEVEL_COLUMN_TO_LEVEL.items():
                    value = int(effect[column])
                    if value != -1:
                        values[str(level)] = value
                available_at_cap = [
                    (int(level), value)
                    for level, value in values.items()
                    if int(level) <= max_level
                ]
                effect_name = tx(151, type_code, db_text) or f"Effect type {type_code}"
                effect_description = tx(154, type_code, db_text)
                effects.append(
                    {
                        "type_code": type_code,
                        "name": effect_name,
                        "description": effect_description,
                        "unit": VALUE_UNITS.get(type_code, "raw value; meaning not independently confirmed"),
                        "values_by_level": values,
                        "value_at_rarity_cap": (
                            available_at_cap[-1][1] if available_at_cap else None
                        ),
                        "value_level": (
                            available_at_cap[-1][0] if available_at_cap else None
                        ),
                    }
                )

            unique_id = int(raw["unique_effect_id"])
            unique_raw = unique_effects.get(unique_id)
            unique_effect = None
            if unique_raw:
                unique_effect = {
                    "id": unique_id,
                    "name": tx(150, unique_id, db_text),
                    "description": tx(155, unique_id, db_text),
                    "level_requirement_raw": int(unique_raw["lv"]),
                    "components": [
                        {
                            "slot": slot,
                            "type_code": int(unique_raw[f"type_{slot}"]),
                            "values": [
                                int(unique_raw[f"value_{slot}{suffix}"])
                                for suffix in ("", "_1", "_2", "_3", "_4")
                            ],
                        }
                        for slot in (0, 1)
                        if int(unique_raw[f"type_{slot}"]) != 0
                    ],
                    "idle_mode_sub_rate_raw": int(unique_raw["idle_mode_sub_rate"]),
                }

            release_date = timestamp_jst_date(int(raw["start_date"]))
            support_cards.append(
                {
                    "id": card_id,
                    "gametora_id": card_id,
                    "name": display_name,
                    "name_en": name_en,
                    "name_ja": name_ja,
                    "title_en": title_en,
                    "title_ja": title_ja,
                    "character_en": character_en,
                    "character_ja": character_ja,
                    "rarity": rarity,
                    "rarity_label": RARITIES.get(rarity, f"Rarity {rarity}"),
                    "support_type": support_type,
                    "command_id": command_id,
                    "support_category_code": category_code,
                    "release_date_jst": release_date,
                    "upcoming_at_export": bool(release_date and release_date > today),
                    "max_level_at_full_uncap": max_level,
                    "effects": effects,
                    "unique_effect": unique_effect,
                    "gametora_url": (
                        f"https://gametora.com/umamusume/supports/{card_id}-"
                        f"{build_slug(display_name, card_id)}"
                    ),
                }
            )

        trainees: list[dict[str, Any]] = []
        for raw in connection.execute(
            "SELECT * FROM card_data WHERE default_rarity > 0 ORDER BY id"
        ):
            card_id = int(raw["id"])
            chara_id = int(raw["chara_id"])
            card_name_ja = db_text.get((4, card_id))
            card_title_ja = db_text.get((5, card_id))
            character_ja = db_text.get((6, chara_id))
            card_name_en = tx(4, card_id, db_text)
            card_title_en = tx(5, card_id, db_text)
            character_en = tx(6, chara_id, db_text)
            trainees.append(
                {
                    "card_id": card_id,
                    "chara_id": chara_id,
                    "name": card_name_en or card_name_ja or f"Trainee card {card_id}",
                    "name_en": card_name_en,
                    "name_ja": card_name_ja,
                    "title_en": card_title_en,
                    "title_ja": card_title_ja,
                    "character_en": character_en,
                    "character_ja": character_ja,
                    "rarity": int(raw["default_rarity"]),
                    "limited": bool(int(raw["limited_chara"])),
                    "growth_rates": {
                        "speed": int(raw["talent_speed"]),
                        "stamina": int(raw["talent_stamina"]),
                        "power": int(raw["talent_pow"]),
                        "guts": int(raw["talent_guts"]),
                        "wit": int(raw["talent_wiz"]),
                    },
                    "running_style_code": int(raw["running_style"]),
                }
            )

        translation_hash = (
            sha256_file(translations_path)
            if translations_path is not None and translations_path.is_file()
            else None
        )
        return {
            "schema_version": 1,
            "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": {
                "game": "Umamusume Pretty Derby Japanese server",
                "master_filename": master_path.name,
                "master_sha256": sha256_file(master_path),
                "translation_filename": (
                    translations_path.name
                    if translations_path is not None and translations_path.is_file()
                    else None
                ),
                "translation_sha256": translation_hash,
                "translations": "Installed Hachimi text bundle where available; Japanese master text fallback.",
                "inventory_included": False,
            },
            "counts": {
                "support_cards": len(support_cards),
                "trainee_outfits": len(trainees),
                "support_upcoming_at_export": sum(
                    card["upcoming_at_export"] for card in support_cards
                ),
            },
            "support_cards": support_cards,
            "trainees": trainees,
            "limitations": [
                "Support card IDs are copied from support_card_data.id and used as GameTora IDs.",
                "Support hint and event skill lists are not linked by the installed master tables used here; use the linked GameTora card page for those details.",
                "The master database can contain cards scheduled for future release; upcoming_at_export is based on its Japan-local start date.",
                "running_style_code is preserved as a raw game code; no style label is inferred.",
                "Trainee outfit release timing is not included because card_data has no per-outfit start date.",
            ],
        }
    finally:
        connection.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--game-root",
        type=Path,
        default=Path(__import__("os").environ.get("UMAMUSUME_GAME_ROOT", str(DEFAULT_GAME_ROOT))),
    )
    parser.add_argument("--master-db", type=Path)
    parser.add_argument("--translations", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "references" / "catalog.json",
    )
    args = parser.parse_args()

    master_path = args.master_db or args.game_root / "UmamusumePrettyDerby_Jpn_Data" / "Persistent" / "master" / "master.mdb"
    translations_path = args.translations or args.game_root / "hachimi" / "localized_data_1" / "text_data_dict.json"
    catalog = export_catalog(master_path, translations_path)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temp_path = args.output.with_suffix(args.output.suffix + ".tmp")
    temp_path.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temp_path.replace(args.output)
    print(
        json.dumps(
            {
                "output": str(args.output.resolve()),
                "support_cards": catalog["counts"]["support_cards"],
                "trainee_outfits": catalog["counts"]["trainee_outfits"],
                "upcoming_support_cards": catalog["counts"]["support_upcoming_at_export"],
                "master_sha256": catalog["source"]["master_sha256"],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())