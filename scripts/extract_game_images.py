#!/usr/bin/env python3
"""Extract reviewed JP game artwork into private, optimized runtime derivatives.

This Windows-only helper reads the installed game's master database, encrypted
asset index and local cache. It never downloads or modifies game data. UnityPy,
Pillow and the encrypted SQLite reader are installed separately under
%LOCALAPPDATA% by setup_game_image_extractor.ps1.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

import UnityPy
from PIL import Image, ImageOps

DEFAULT_GAME_ROOT = Path(r"C:\Steam\steamapps\common\UmamusumePrettyDerby_Jpn")
ASSET_BUNDLE_BASE_KEY = bytes.fromhex("532b4631e4a7b9473e7cfb")
SCHEMA_VERSION = 1
MAX_SOURCE_BUNDLE_BYTES = 64 * 1024 * 1024
MAX_SOURCE_DIMENSION = 4096
DERIVATIVE_SPECS = {
    ("support_card", "thumbnail"): {"max_edge": 320, "quality": 82, "method": 6, "profile": "square-icon-v1"},
    ("support_card", "card"): {"max_edge": 320, "quality": 84, "method": 6, "profile": "framed-square-v1"},
    ("support_card", "portrait"): {"max_edge": 512, "quality": 84, "method": 6, "profile": "full-art-source-aspect-v2"},
    ("trainee", "icon"): {"max_edge": 128, "quality": 80, "method": 6},
    ("trainee", "portrait"): {"max_edge": 512, "quality": 84, "method": 6},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", choices=("ja", "global"), default="ja")
    parser.add_argument("--game-root", type=Path, default=DEFAULT_GAME_ROOT)
    parser.add_argument("--output-root", type=Path, default=None)
    parser.add_argument("--all", action="store_true", help="Review and incrementally extract every catalog ID for --server")
    parser.add_argument("--candidate", action="store_true", help="Extract only the explicitly selected IDs")
    parser.add_argument("--support-id", action="append", default=[], help="Exact support_card_data.id; repeat as needed")
    parser.add_argument("--trainee-id", action="append", default=[], help="Exact card_data.id outfit; repeat as needed")
    parser.add_argument("--dry-run", action="store_true", help="Resolve exact mappings and availability without decoding or writing")
    parser.add_argument("--node", default="node", help="Node.js executable used to read the encrypted metadata index")
    parser.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 1), help="Parallel decoder processes (1-8; default 8 or fewer on small hosts)")
    args = parser.parse_args()
    if args.all and args.candidate:
        parser.error("Use --all or --candidate, not both")
    if args.all and (args.support_id or args.trainee_id):
        parser.error("Do not pass selected IDs with --all")
    if args.candidate and not (args.support_id or args.trainee_id):
        parser.error("--candidate requires at least one --support-id or --trainee-id")
    if not args.all and not args.candidate:
        parser.error("Choose --all or --candidate")
    if args.output_root is None:
        local_app_data = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        args.output_root = local_app_data / "UmaBuildAdvisor" / "assets"
    if not 1 <= args.workers <= 8:
        parser.error("--workers must be between 1 and 8")
    if args.server == "global" and (args.support_id or args.trainee_id):
        # The IDs remain useful as unresolved, explicitly unavailable placeholders.
        pass
    return args


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def atomic_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(data, stream, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def asset_index(args: argparse.Namespace) -> dict[str, Any]:
    helper = Path(__file__).with_name("read_game_asset_index.cjs")
    command = [args.node, str(helper), "--server", args.server, "--game-root", str(args.game_root)]
    if args.all:
        command.append("--all")
    else:
        for item in args.support_id:
            command.extend(("--support-id", str(item)))
        for item in args.trainee_id:
            command.extend(("--trainee-id", str(item)))
    environment = os.environ.copy()
    default_modules = Path(environment.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "UmaBuildAdvisor" / "meta-reader" / "node_modules"
    environment.setdefault("UMABUILD_META_NODE_MODULES", str(default_modules))
    completed = subprocess.run(command, check=False, capture_output=True, text=True, encoding="utf-8", env=environment)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or f"Asset index reader exited with status {completed.returncode}")
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("Asset index reader returned invalid JSON") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("entries"), list):
        raise RuntimeError("Asset index reader returned an invalid record set")
    return payload


def bundle_decryption_key(encryption_key: str) -> bytes:
    value = int(encryption_key)
    try:
        key_bytes = value.to_bytes(8, byteorder="little", signed=True)
    except OverflowError as error:
        raise ValueError("Asset encryption key is outside the game's signed 64-bit format") from error
    return bytes(base_byte ^ key_byte for base_byte in ASSET_BUNDLE_BASE_KEY for key_byte in key_bytes)


def decode_bundle(path: Path, record: dict[str, Any]) -> tuple[Any, str]:
    size = path.stat().st_size
    if size <= 0 or size > MAX_SOURCE_BUNDLE_BYTES:
        raise ValueError(f"source bundle size {size} is outside the allowed range")
    raw = bytearray(path.read_bytes())
    encryption_key = int(record.get("encryption_key", "0"))
    if encryption_key:
        key = bundle_decryption_key(str(encryption_key))
        for offset in range(256, len(raw)):
            raw[offset] ^= key[offset % len(key)]
    decoded = bytes(raw)
    if not decoded.startswith((b"UnityFS\x00", b"UnityWeb\x00", b"UnityRaw\x00")):
        raise ValueError("decrypted data does not have a recognized Unity bundle signature")
    environment = UnityPy.load(decoded)
    engine_version = getattr(environment.file, "version_engine", None)
    if not isinstance(engine_version, str) or not engine_version:
        engine_version = "unknown"
    return environment, engine_version


def texture_image(environment: Any, expected_name: str) -> Image.Image:
    candidates: list[tuple[int, Any]] = []
    for obj in environment.objects:
        kind = getattr(getattr(obj, "type", None), "name", "")
        if kind not in {"Sprite", "Texture2D"}:
            continue
        data = obj.read()
        name = getattr(data, "m_Name", "")
        # Some exact catalog bundles capitalize the Texture2D name differently.
        if name.casefold() == expected_name.casefold():
            candidates.append((0 if kind == "Sprite" else 1, data))
    if not candidates:
        raise ValueError(f"bundle does not contain the exact expected Sprite/Texture2D {expected_name!r}")
    candidates.sort(key=lambda item: item[0])
    best_priority = candidates[0][0]
    best = [data for priority, data in candidates if priority == best_priority]
    if len(best) != 1:
        raise ValueError(f"bundle contains {len(best)} equally ranked exact texture objects named {expected_name!r}")
    image = best[0].image
    if image is None:
        raise ValueError(f"UnityPy could not decode {expected_name!r}")
    image = ImageOps.exif_transpose(image).convert("RGBA")
    width, height = image.size
    if width < 1 or height < 1 or width > MAX_SOURCE_DIMENSION or height > MAX_SOURCE_DIMENSION:
        raise ValueError(f"decoded image dimensions {width}x{height} exceed the allowed range")
    return image.copy()


def derivative_relative_path(record: dict[str, Any]) -> PurePosixPath:
    kind_dir = "support-cards" if record["kind"] == "support_card" else "trainees"
    return PurePosixPath("ja", kind_dir, record["catalog_id"], f"{record['variant']}.webp")


def write_derivative(image: Image.Image, relative_path: PurePosixPath, output_root: Path, record: dict[str, Any]) -> dict[str, Any]:
    spec = DERIVATIVE_SPECS[(record["kind"], record["variant"])]
    # Bound derivative dimensions while preserving the source artwork aspect ratio.
    optimized = ImageOps.contain(image, (spec["max_edge"], spec["max_edge"]), method=Image.Resampling.LANCZOS)
    output_path = output_root.joinpath(*relative_path.parts)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{output_path.stem}.", suffix=".webp.tmp", dir=output_path.parent)
    os.close(fd)
    try:
        optimized.save(temporary, format="WEBP", quality=spec["quality"], method=spec["method"], lossless=False, exact=True)
        with Image.open(temporary) as check:
            check.verify()
        os.replace(temporary, output_path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise
    encoded = output_path.read_bytes()
    with Image.open(io.BytesIO(encoded)) as decoded:
        dimensions = decoded.size
        if optimized.getextrema()[3][0] < 255 and decoded.mode not in {"RGBA", "LA"}:
            raise ValueError("WebP derivative lost its alpha channel")
    return {
        "derivative_profile": spec.get("profile", "contain-v1"),
        "relative_path": relative_path.as_posix(),
        "mime_type": "image/webp",
        "width": dimensions[0],
        "height": dimensions[1],
        "bytes": len(encoded),
        "sha256": sha256_bytes(encoded),
    }


def existing_derivative_matches(output_root: Path, old: dict[str, Any], source_sha256: str) -> bool:
    if old.get("status") != "available" or old.get("source_bundle_sha256") != source_sha256:
        return False
    relative = old.get("relative_path")
    if not isinstance(relative, str):
        return False
    path = output_root.joinpath(*PurePosixPath(relative).parts)
    if not path.is_file():
        return False
    return path.stat().st_size == old.get("bytes") and sha256_file(path) == old.get("sha256")


def process_available_record(
    record: dict[str, Any],
    persistent_root: str,
    output_root_text: str,
    old: dict[str, Any],
    build_hash: str | None,
    meta_hash: str | None,
) -> tuple[dict[str, Any], bool, bool]:
    output_root = Path(output_root_text)
    entry: dict[str, Any] = {
        "key": record["key"],
        "server": record["server"],
        "kind": record["kind"],
        "catalog_id": str(record["catalog_id"]),
        "variant": record["variant"],
        "status": "available",
        "derivative_profile": DERIVATIVE_SPECS[(record["kind"], record["variant"])].get("profile", "contain-v1"),
        "source_build_hash": build_hash,
        "source_metadata_index_sha256": meta_hash,
        "source_mapping": record.get("source_mapping"),
    }
    cache_relative = PurePosixPath(record["cache_relative_path"])
    if cache_relative.is_absolute() or ".." in cache_relative.parts:
        raise ValueError(f"Unsafe game cache path supplied by index: {cache_relative}")
    source_path = Path(persistent_root).joinpath(*cache_relative.parts)
    if not source_path.is_file():
        entry.update({"status": "missing", "reason": "indexed bundle disappeared from the local cache"})
        return entry, False, False

    source_sha256 = sha256_file(source_path)
    if old.get("derivative_profile", "contain-v1") == DERIVATIVE_SPECS[(record["kind"], record["variant"])].get("profile", "contain-v1") and existing_derivative_matches(output_root, old, source_sha256):
        for field in ("relative_path", "mime_type", "width", "height", "bytes", "sha256", "source_engine_version"):
            entry[field] = old[field]
        entry["source_bundle_sha256"] = source_sha256
        return entry, True, False

    try:
        environment, engine_version = decode_bundle(source_path, record)
        expected_name = str(record["source_mapping"]["asset_name"]).rsplit("/", 1)[-1]
        image = texture_image(environment, expected_name)
        derivative = write_derivative(image, derivative_relative_path(record), output_root, record)
        entry.update(derivative)
        entry.update({"source_bundle_sha256": source_sha256, "source_engine_version": engine_version})
        return entry, False, True
    except Exception as error:
        entry.update({"status": "unresolved", "reason": f"decoder/mapping failure: {type(error).__name__}: {error}", "source_bundle_sha256": source_sha256})
        return entry, False, False


def summarize(entries: dict[str, dict[str, Any]], elapsed: float, newly_extracted: int, reused: int) -> dict[str, Any]:
    status_counts = Counter(item.get("status", "unresolved") for item in entries.values())
    derivative_bytes = sum(int(item.get("bytes", 0)) for item in entries.values() if item.get("status") == "available")
    return {
        "entries": len(entries),
        "statuses": dict(sorted(status_counts.items())),
        "newly_extracted": newly_extracted,
        "reused": reused,
        "derivative_bytes": derivative_bytes,
        "elapsed_seconds": round(elapsed, 3),
    }


def main() -> int:
    started = time.perf_counter()
    args = parse_args()
    if sys.platform != "win32":
        raise RuntimeError("Image extraction is Windows-only; run this helper beside the installed Japanese game.")
    if not args.game_root.is_dir():
        raise FileNotFoundError(f"Game root not found: {args.game_root}")
    index = asset_index(args)
    raw_entries = index["entries"]
    if args.dry_run:
        counts = Counter(entry.get("status", "unresolved") for entry in raw_entries)
        print(json.dumps({"server": args.server, "candidate_count": len(raw_entries), "statuses": dict(sorted(counts.items())), "dry_run": True}, indent=2))
        return 0

    output_root = args.output_root.resolve()
    manifest_path = output_root / "manifest.json"
    if manifest_path.is_file():
        try:
            old_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Existing manifest could not be read safely: {error}") from error
    else:
        old_manifest = {"schema_version": SCHEMA_VERSION, "assets": {}}
    if old_manifest.get("schema_version") != SCHEMA_VERSION or not isinstance(old_manifest.get("assets"), dict):
        raise RuntimeError("Existing image manifest has an unsupported schema")

    assets: dict[str, dict[str, Any]] = dict(old_manifest["assets"])
    incoming_keys = {entry["key"] for entry in raw_entries}
    if args.all:
        assets = {key: value for key, value in assets.items() if value.get("server") != args.server}
    else:
        assets = {key: value for key, value in assets.items() if key not in incoming_keys}

    persistent = args.game_root / "UmamusumePrettyDerby_Jpn_Data" / "Persistent"
    build_hash = (index.get("source") or {}).get("source_build_hash")
    meta_hash = (index.get("source") or {}).get("metadata_index_sha256")
    newly_extracted = 0
    reused = 0
    available = []
    for record in raw_entries:
        if record["status"] == "available":
            available.append(record)
        else:
            entry = {
                "key": record["key"],
                "server": record["server"],
                "kind": record["kind"],
                "catalog_id": str(record["catalog_id"]),
                "variant": record["variant"],
                "status": record["status"],
                "reason": record.get("reason"),
                "derivative_profile": DERIVATIVE_SPECS[(record["kind"], record["variant"])].get("profile", "contain-v1"),
        "source_build_hash": build_hash,
                "source_metadata_index_sha256": meta_hash,
                "source_mapping": record.get("source_mapping"),
            }
            assets[record["key"]] = {name: value for name, value in entry.items() if value is not None}

    jobs = []
    if args.workers == 1:
        for record in available:
            entry, was_reused, was_extracted = process_available_record(
                record, str(persistent), str(output_root), old_manifest["assets"].get(record["key"], {}), build_hash, meta_hash
            )
            assets[entry["key"]] = entry
            reused += int(was_reused)
            newly_extracted += int(was_extracted)
            if (reused + newly_extracted) % 50 == 0:
                print(f"Processed {reused + newly_extracted}/{len(available)} available image mappings", file=sys.stderr, flush=True)
    else:
        with ProcessPoolExecutor(max_workers=args.workers) as executor:
            for record in available:
                future = executor.submit(
                    process_available_record,
                    record,
                    str(persistent),
                    str(output_root),
                    old_manifest["assets"].get(record["key"], {}),
                    build_hash,
                    meta_hash,
                )
                jobs.append(future)
            for position, future in enumerate(as_completed(jobs), start=1):
                entry, was_reused, was_extracted = future.result()
                assets[entry["key"]] = entry
                reused += int(was_reused)
                newly_extracted += int(was_extracted)
                if position % 50 == 0 or position == len(jobs):
                    print(f"Processed {position}/{len(jobs)} available image mappings", file=sys.stderr, flush=True)

    status_summary = summarize(assets, time.perf_counter() - started, newly_extracted, reused)
    total_for_server = {key: value for key, value in assets.items() if value.get("server") == args.server}
    server_summary = summarize(total_for_server, time.perf_counter() - started, newly_extracted, reused)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "generated_at_utc": utc_now(),
        "source": index.get("source", {"game": "Global source unavailable", "read_only": True}),
        "coverage": server_summary,
        "assets": assets,
    }
    atomic_json(manifest_path, manifest)
    print(json.dumps({"manifest": str(manifest_path), "coverage": server_summary, "all_servers": status_summary}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
