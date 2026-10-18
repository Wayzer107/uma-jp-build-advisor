#!/usr/bin/env bash
set -euo pipefail

profile_name="${1:-uma-build-advisor}"
tunnel_client="${TUNNEL_CLIENT:-tunnel-client}"
asked_for_key=0

command -v "$tunnel_client" >/dev/null 2>&1 || { echo "Could not find tunnel-client at '$tunnel_client'." >&2; exit 1; }

if [[ -z "${CONTROL_PLANE_API_KEY:-}" ]]; then
  read -r -s -p 'OpenAI Platform runtime API key (hidden; not saved): ' CONTROL_PLANE_API_KEY
  echo
  [[ -n "$CONTROL_PLANE_API_KEY" ]] || { echo "A runtime API key is required." >&2; exit 1; }
  export CONTROL_PLANE_API_KEY
  asked_for_key=1
fi

cleanup() {
  if [[ "$asked_for_key" -eq 1 ]]; then
    unset CONTROL_PLANE_API_KEY
  fi
}
trap cleanup EXIT HUP INT TERM

if ! "$tunnel_client" doctor --profile "$profile_name" --explain; then
  echo "tunnel-client doctor failed. Check the profile, tunnel permissions, and runtime key." >&2
  exit 1
fi

echo "Starting Secure MCP Tunnel. Keep this shell and the Raspberry Pi online while using the advisor in ChatGPT web. Press Ctrl+C to stop it."
"$tunnel_client" run --profile "$profile_name"
