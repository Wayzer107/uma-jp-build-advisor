# Current handoff status

Updated: 2026-10-19

## Objective

Deploy the Umamusume Build Advisor to the configured Raspberry Pi under ~/Sources/uma, retain the remote ChatGPT MCP plugin with its embedded UI, and verify it in ChatGPT web. Check mobile support against the current client and account; keep the read-only GPT Actions route as a possible text-only mobile fallback. Leave enough project guidance for another agent to continue.

## Repository

- Public repository: https://github.com/Wayzer107/uma-jp-build-advisor
- Private inventory repository: https://github.com/Wayzer107/uma-jp-build-advisor-private
- Active branch before handoff changes: codex/uma-build-advisor
- Previous pushed baseline: ed061a2c9d866c6e1795752b7533b14e9dad736b
- Mobile plugin documentation, optional Actions integration, and handoff changes after that commit are still local until reviewed and pushed.
- `corepack pnpm build` has been rerun after the mobile instructions changed and passes. The generated MCP server and UI bundles were copied into the ChatGPT plugin package. An earlier local Actions API smoke check passed; the Pi deployment and actual ChatGPT mobile UI remain unverified.

## Confirmed data behavior

- Japanese catalog comes from the installed Japanese game data and documented Hachimi/GameTora sources. It has 563 support cards, 271 trainee outfits, 2,200 skills, and linked events, scenarios, races, courses, and inheritance records.
- JP record ID sets matched the installed source; all 563 support and 271 trainee outfit IDs matched GameTora feeds.
- JP catalog coverage is incomplete for event choice/reward outcomes.
- Global source status is unavailable. Do not copy Japanese records into Global.
- No current inventory ownership should be assumed until a matching GameTora Everything export is imported and synced privately.
- Private profile layout separates profiles/ja/ and profiles/global/.

## Client design

- Primary: MCP App over OpenAI Secure MCP Tunnel, with embedded recommendation view using the MCP Apps UI bridge. The tunnel runs on a host that stays online.
- Web: the remote MCP plugin is configured through ChatGPT's web Plugins flow and should be verified there first.
- Mobile: current OpenAI developer UI docs include responsive mobile guidance, but the Help Center says custom MCP apps are web-only. Native mobile availability remains unverified; do not promise it until the target mobile client has been checked.
- Optional mobile fallback: the read-only Actions REST API and OpenAPI schema in mcp-server/openapi/uma-build-advisor-actions.yaml can provide text through a separate Custom GPT where GPT Actions are supported. GPTs can be used on mobile, but Action execution on the target client still needs verification. This route does not render the MCP Build View.
- The Actions API uses bearer authentication and should be exposed only through HTTPS, preferably Tailscale Funnel after enabling the feature in the user's tailnet.

## Raspberry Pi access evidence

- SSH reached the intended Debian 13 host through the trusted `raspberrypi.local` host alias, but user authentication failed with `Permission denied (publickey,password)`. The default local ED25519 key was attempted and is not authorized. No remote commands changed the Pi.
- Desktop Commander lists only WOOFYPC, offline; it does not offer an alternate Pi shell.
- The remote path ~/Sources/uma has not been inspected or created. Do not overwrite it if it already exists.

## Work remaining

1. Review the entire local diff for correctness, privacy, and public/private boundaries.
2. The latest project build passes. If changing the Actions API, repeat its smoke check: unauthenticated health, unauthorized data rejection, and authenticated Japanese catalog read without printing the token.
3. Check Raspberry Pi setup docs and systemd service paths use the requested `~/Sources/uma` location with the configured Linux username.
4. Commit and push the reviewed work to the public repo.
5. Restore SSH access by adding the Windows public key to the Pi user's authorized_keys or enabling another approved login method. Do not send the private key or password.
6. SSH to raspberrypi.local, inspect the existing target path, clone or fast-forward the public repo at ~/Sources/uma, and configure the separate private checkout if GitHub access is available.
7. Install dependencies and MCP tunnel service, set local-only secrets, and validate the remote plugin connection. Enable Tailscale Funnel only if the optional Actions API is deployed.
8. Connect the remote MCP App on the web, then verify its UI and tools. Separately check whether the connected MCP app is available in the native mobile client. If it is not and mobile chat access is required, configure and verify the optional GPT Action route.

## Credentials and data boundaries

- Never put the Actions bearer token, Secure MCP runtime key, GitHub credential, SSH private key, or inventory export in this repo or these handoff files.
- The Pi needs read access to the public catalog. Private inventory sync requires separate authenticated GitHub access to the private repository.
- The GPT's Action token grants private inventory read access. Keep it secret and rotate it if exposed.
- Funnel makes the endpoint reachable from the public internet. The loopback-only binding, bearer authentication, HTTPS, and no-cache headers are intentional.
