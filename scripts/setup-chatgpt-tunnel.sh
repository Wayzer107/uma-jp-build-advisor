#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <tunnel_id> [tunnel-client-path]" >&2
  exit 2
}

[[ $# -ge 1 && $# -le 2 ]] || usage
tunnel_id="$1"
tunnel_client="${2:-tunnel-client}"
profile_name="uma-build-advisor"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mcp_entry="$repo_root/plugin-package/uma-build-advisor/mcp-server/dist/index.js"

[[ "$tunnel_id" =~ ^tunnel_[a-z0-9_]+$ ]] || { echo "Invalid tunnel ID format." >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required on this host." >&2; exit 1; }
command -v "$tunnel_client" >/dev/null 2>&1 || { echo "Could not find tunnel-client at '$tunnel_client'." >&2; exit 1; }
[[ -f "$mcp_entry" ]] || { echo "Bundled MCP server not found: $mcp_entry" >&2; exit 1; }
[[ "$repo_root" != *[[:space:]]* ]] || { echo "Move the checkout to a path without spaces before creating the stdio profile." >&2; exit 1; }

mcp_command="node $mcp_entry"
"$tunnel_client" init \
  --sample sample_mcp_stdio_local \
  --profile "$profile_name" \
  --tunnel-id "$tunnel_id" \
  --mcp-command "$mcp_command"

echo "Created tunnel-client profile '$profile_name'."
echo "Create the remote ChatGPT plugin package with: python3 '$repo_root/scripts/package_chatgpt_web_plugin.py' --tunnel-id '$tunnel_id'"
echo "Start it with: bash '$repo_root/scripts/start-chatgpt-tunnel.sh'"
