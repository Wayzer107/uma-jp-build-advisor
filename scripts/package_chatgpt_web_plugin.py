#!/usr/bin/env python3
"""Create a remote ChatGPT plugin ZIP bound to a user's Secure MCP Tunnel."""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any


TUNNEL_ID_RE = re.compile(r"^tunnel_[a-z0-9]{32}$")


def default_output_path() -> Path:
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    else:
        base = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state"))
    return base / "UmaBuildAdvisor" / "uma-build-advisor-chatgpt-plugin.zip"


def build_archive(plugin_root: Path, tunnel_id: str, output_path: Path) -> dict[str, Any]:
    if not TUNNEL_ID_RE.fullmatch(tunnel_id):
        raise ValueError("Tunnel ID must match tunnel_ followed by 32 lowercase letters or digits")
    plugin_json_path = plugin_root / "plugin.json"
    skill_path = plugin_root / "skills" / "uma-build-advisor" / "SKILL.md"
    if not plugin_json_path.is_file() or not skill_path.is_file():
        raise FileNotFoundError("Plugin root must contain plugin.json and skills/uma-build-advisor/SKILL.md")

    plugin_manifest = json.loads(plugin_json_path.read_text(encoding="utf-8"))
    if plugin_manifest.get("name") != "uma-build-advisor":
        raise ValueError("Plugin manifest name must be uma-build-advisor")

    mcp_manifest = {
        "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        "mcpServers": {
            "uma-build-advisor": {
                "type": "streamable-http",
                "extensions": {"com.openai": {"tunnelId": tunnel_id}},
            }
        },
    }

    output_path = output_path.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="uma-build-advisor-plugin-") as temp:
        archive_root = Path(temp) / "uma-build-advisor"
        (archive_root / "skills" / "uma-build-advisor").mkdir(parents=True)
        shutil.copy2(plugin_json_path, archive_root / "plugin.json")
        shutil.copy2(skill_path, archive_root / "skills" / "uma-build-advisor" / "SKILL.md")
        (archive_root / "mcp.json").write_text(json.dumps(mcp_manifest, indent=2) + "\n", encoding="utf-8")
        with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for source in archive_root.rglob("*"):
                if source.is_file():
                    archive.write(source, source.relative_to(Path(temp)))

    return {
        "status": "ready_for_private_plugin_upload",
        "archive": str(output_path),
        "tunnel_id": tunnel_id,
        "included_files": ["plugin.json", "mcp.json", "skills/uma-build-advisor/SKILL.md"],
        "credentials_included": False,
    }


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tunnel-id", required=True, help="Verified OpenAI Secure MCP Tunnel ID")
    parser.add_argument("--plugin-root", type=Path, default=repo_root / "plugin-package" / "uma-build-advisor")
    parser.add_argument("--output", type=Path, default=default_output_path())
    args = parser.parse_args()

    result = build_archive(args.plugin_root.resolve(), args.tunnel_id, args.output)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
