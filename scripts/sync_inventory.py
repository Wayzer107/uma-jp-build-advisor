#!/usr/bin/env python3
"""Store a reviewed inventory profile only in the configured private repository."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PRIVATE_REMOTE = "Wayzer107/uma-jp-build-advisor-private"


def _git(repo_root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(["git", *args], cwd=repo_root, text=True, capture_output=True, check=False)
    if check and result.returncode:
        message = result.stderr.strip() or result.stdout.strip() or f"git {' '.join(args)} failed"
        raise RuntimeError(message)
    return result


def _is_expected_remote(value: str) -> bool:
    normalized = value.strip().removesuffix(".git")
    return normalized.casefold() in {
        f"https://github.com/{PRIVATE_REMOTE}".casefold(),
        f"git@github.com:{PRIVATE_REMOTE}".casefold(),
        f"ssh://git@github.com/{PRIVATE_REMOTE}".casefold(),
    }


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _preserve_omitted_sections(profile: dict[str, Any], current_path: Path) -> dict[str, Any]:
    """Carry forward sections omitted by a partial export; only explicit empty maps clear ownership."""
    if not current_path.is_file():
        return profile
    try:
        current = json.loads(current_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raise RuntimeError("Existing private profile is unreadable; refusing to replace it")
    if not isinstance(current, dict) or current.get("server") != profile.get("server"):
        raise RuntimeError("Existing private profile has the wrong server or shape; refusing to replace it")

    old_partial = set(current.get("partial_sections") or [])
    new_partial = set(profile.get("partial_sections") or [])
    section_kinds = {"supports": {"support"}, "trainees": {"trainee"}, "veterans": {"veteran_trainee"}}
    for section in list(new_partial):
        old_value = current.get(section)
        if old_value is not None:
            profile[section] = old_value
            if section in old_partial:
                new_partial.add(section)
            else:
                new_partial.discard(section)
            retained = [item for item in current.get("unresolved_ids", []) if item.get("kind") in section_kinds[section]]
            incoming = [item for item in profile.get("unresolved_ids", []) if item.get("kind") in section_kinds[section]]
            other = [item for item in profile.get("unresolved_ids", []) if item.get("kind") not in section_kinds[section]]
            profile["unresolved_ids"] = other + incoming + retained
    profile["partial_sections"] = sorted(new_partial)
    return profile


def sync_private_profile(
    profile_path: Path,
    server: str,
    private_repo_root: Path,
    push: bool = True,
) -> dict[str, Any]:
    if server not in ("ja", "global"):
        raise ValueError("server must be 'ja' or 'global'")
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    if not isinstance(profile, dict) or profile.get("schema_version") != 1:
        raise ValueError("Profile is not a supported inventory profile")
    if profile.get("server") != server:
        raise ValueError(f"Profile server is {profile.get('server')!r}, not requested {server!r}")

    repo_root = private_repo_root.resolve()
    actual_root = Path(_git(repo_root, "rev-parse", "--show-toplevel").stdout.strip()).resolve()
    if actual_root != repo_root:
        raise ValueError("The configured private profile path must be the Git repository root")
    remote = _git(repo_root, "remote", "get-url", "origin").stdout.strip()
    if not _is_expected_remote(remote):
        raise ValueError("Configured origin does not match the authorized private inventory repository")

    git_path = f"profiles/{server}"
    if _git(repo_root, "status", "--porcelain", "--", git_path).stdout.strip():
        raise RuntimeError(f"{git_path} already has local changes; resolve or back them up before syncing")

    branch = _git(repo_root, "branch", "--show-current").stdout.strip()
    if not branch:
        raise RuntimeError("Private profile repository has no checked-out branch")
    _git(repo_root, "fetch", "origin")
    remote_ref = f"origin/{branch}"
    remote_ref_exists = _git(repo_root, "rev-parse", "--verify", remote_ref, check=False).returncode == 0
    if remote_ref_exists:
        local_head = _git(repo_root, "rev-parse", "HEAD").stdout.strip()
        remote_head = _git(repo_root, "rev-parse", remote_ref).stdout.strip()
        if local_head != remote_head:
            local_is_ancestor = _git(repo_root, "merge-base", "--is-ancestor", "HEAD", remote_ref, check=False).returncode == 0
            remote_is_ancestor = _git(repo_root, "merge-base", "--is-ancestor", remote_ref, "HEAD", check=False).returncode == 0
            if local_is_ancestor:
                _git(repo_root, "merge", "--ff-only", remote_ref)
            elif not remote_is_ancestor:
                raise RuntimeError("Private repository has diverged; local profile was not overwritten or pushed")

    raw_reference = profile.get("raw_source_reference") or {}
    raw_name = raw_reference.get("file") if isinstance(raw_reference, dict) else None
    raw_candidate = (profile_path.parent / str(raw_name)).resolve() if raw_name else None
    if raw_candidate is not None:
        try:
            raw_candidate.relative_to(profile_path.parent.resolve())
        except ValueError as error:
            raise ValueError("Raw source reference must stay beside or below the candidate profile") from error
    raw_bytes = raw_candidate.read_bytes() if raw_candidate and raw_candidate.is_file() else None
    raw_hash = hashlib.sha256(raw_bytes).hexdigest() if raw_bytes is not None else None
    imported_at = str(profile.get("imported_at_utc") or datetime.now(timezone.utc).isoformat(timespec="seconds"))
    safe_stamp = re.sub(r"[^0-9A-Za-zT_-]", "-", imported_at)
    profile_hash = hashlib.sha256(profile_path.read_bytes()).hexdigest()
    private_dir = repo_root / git_path
    current_path = private_dir / "current.json"
    history_path = private_dir / "history" / f"{safe_stamp}-{profile_hash[:8]}.json"
    profile_to_store = _preserve_omitted_sections(dict(profile), current_path)
    files_to_commit = [f"{git_path}/current.json", f"{git_path}/history/{history_path.name}"]

    if raw_bytes is not None:
        raw_rel = Path("raw-imports") / f"{safe_stamp}-{raw_hash[:12]}.json"
        raw_path = private_dir / raw_rel
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        raw_tmp = raw_path.with_name(raw_path.name + ".tmp")
        raw_tmp.write_bytes(raw_bytes)
        os.replace(raw_tmp, raw_path)
        profile_to_store["raw_source_reference"] = {
            "file": raw_rel.as_posix(),
            "sha256": raw_hash,
            "preserved": True,
        }
        files_to_commit.append(f"{git_path}/{raw_rel.as_posix()}")
    else:
        profile_to_store["raw_source_reference"] = {
            "file": None,
            "sha256": raw_reference.get("sha256") if isinstance(raw_reference, dict) else None,
            "preserved": False,
        }

    _write_json_atomic(current_path, profile_to_store)
    _write_json_atomic(history_path, profile_to_store)
    _git(repo_root, "add", "--", *files_to_commit)
    message = f"Update {server} inventory profile"
    _git(repo_root, "commit", "--only", "-m", message, "--", *files_to_commit)
    commit = _git(repo_root, "rev-parse", "HEAD").stdout.strip()

    pushed = False
    push_error = None
    if push:
        result = _git(repo_root, "push", "origin", branch, check=False)
        pushed = result.returncode == 0
        if not pushed:
            push_error = result.stderr.strip() or result.stdout.strip() or "Private repository push failed"

    return {
        "server": server,
        "repository": PRIVATE_REMOTE,
        "profile_path": f"profiles/{server}/current.json",
        "history_path": f"profiles/{server}/history/{history_path.name}",
        "commit": commit,
        "pushed": pushed,
        "push_error": push_error,
        "local_snapshot_retained": True,
        "raw_source_preserved": raw_bytes is not None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True, choices=("ja", "global"))
    parser.add_argument("--profile", type=Path, required=True, help="Reviewed normalized profile candidate.")
    parser.add_argument("--private-repo", type=Path, required=True, help="Local checkout of the authorized private inventory repository.")
    parser.add_argument("--no-push", action="store_true", help="Commit a local private snapshot without pushing it.")
    args = parser.parse_args()
    summary = sync_private_profile(args.profile, args.server, args.private_repo, push=not args.no_push)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not summary["push_error"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
