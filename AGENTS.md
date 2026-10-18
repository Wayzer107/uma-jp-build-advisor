# Agent guide

## Mission

Maintain Umamusume Build Advisor as a ChatGPT-first reference and build-advice project. The public repository owns versioned server catalogs and executable code. The private repository owns the user's Japan and Global inventories, veteran/legacy data, raw imports, and history. Recommendations combine those sources with fresh, server-specific community research.

## Source of truth and server boundaries

- Treat data/ja/ and data/global/ as separate catalogs. Every request, import, query, and recommendation selects exactly one server.
- Japanese game facts must come from the verified Japanese catalog generated from the installed Japanese game and its documented supplemental sources.
- Global facts require a separately verified Global source. Never copy a Japanese record, release date, availability, balance value, or strategy into Global.
- Read the catalog records for support effects, hints, event-skill links, trainee stats and aptitudes, skills, races, scenarios, and inheritance factors. A GameTora ID mapping is an identifier link, not a substitute for catalog facts.
- Respect each manifest's coverage state and field-level gaps. The current Japanese catalog is incomplete for event-choice/reward outcomes; the current Global source may be unavailable.
- For every build recommendation, research current strategy evidence for the selected server. Prefer current JP community guides and discussion for Japan, including Japanese-language material, relevant Reddit discussion, and UmaGuide content only when it covers the Japanese server. Treat individual social posts as anecdotal. Use Game8 or another commercial guide only with independent corroboration. Cite sources and dates.
- If the selected catalog lacks a fact, report the gap. Do not silently fill it from a live guide or the other server.

## Private data and credentials

- Never add an actual inventory, GameTora export, veteran note, account identifier, game database, local config, API token, SSH private key, or tunnel credential to this public repository.
- Keep profiles/ja/ and profiles/global/ in the private repo. Keep Japanese and Global exports and histories separate.
- A missing profile is unknown ownership, not an empty collection.
- Inventory imports should remain reviewable candidates before a deliberate private sync. Preserve omitted sections and do not merge servers.
- Runtime credentials belong in a secret manager or a permission-restricted local file, never in source, command output, handoff docs, or the GPT instruction text.
- The optional Actions REST API is read-only and requires a strong bearer token on every catalog or inventory route. Keep its default bind on loopback and expose it only behind HTTPS.

## Architecture

- `mcp-server/src/` contains the TypeScript MCP server, reference/inventory/maintenance tools, embedded Build View, and optional GPT Actions REST adapter.
- `mcp-server/openapi/uma-build-advisor-actions.yaml` describes a separate read-only GPT Actions integration; it is not required for the ChatGPT web plugin.
- The primary ChatGPT experience is a private remote MCP plugin. Configure its remote server through the web Plugins flow and OpenAI Secure MCP Tunnel, then package the plugin with the verified tunnel binding. The Plugin Creator ZIP requirements explicitly support `tunnelId` for remote MCP servers and prohibit combining it with `url` or `server_url`.
- The Build View uses the standard MCP Apps UI bridge and responsive layout. The MCP tools also return a complete text result. Keep the source folder's local `stdio` config for compatible local hosts; do not use it as the account plugin's online configuration.
- Keep mobile claims precise: OpenAI's developer UI guides document mobile layouts, but the current Help Center says custom MCP apps are web-only. Do not claim that the native ChatGPT mobile app can use this connection or render the Build View until verified on the target account and client. The optional GPT Actions route may provide text access through a Custom GPT when available; verify mobile Action execution separately.
- The configured Raspberry Pi is the intended persistent runtime host. The target public checkout path is ~/Sources/uma; the private checkout should be separate at ~/Sources/uma-private. The installed Japanese game and catalog refresh remain on Windows.
- Use Tailscale Funnel or an equivalent authenticated HTTPS ingress only if GPT Actions are deployed. Funnel is public internet exposure; API bearer authentication must remain enabled.
- The MCP tunnel and Actions API are different transports. Do not assume a Secure MCP Tunnel endpoint can serve the REST Action schema. Local `stdio` plugin execution is for compatible local hosts; the account plugin uses the generated remote tunnel binding.

## Updating data

### Japanese catalog

1. Run maintenance.preview_catalog_refresh on the Windows host with the installed Japanese game.
2. Review the staged candidate, source hashes, coverage report, unresolved references, and unavailable fields.
3. Publish only the reviewed ja candidate with the maintenance publish path.
4. Pull the public repository on the Pi so its MCP service and optional Actions service read the new catalog.
5. Do not publish Global from a Japanese source.

### Inventory

1. Export GameTora's Everything JSON separately for Japan and Global.
2. Import the matching file with explicit server selection.
3. Review support, trainee, and veteran counts, partial sections, unresolved IDs, and warnings.
4. Sync only the reviewed candidate to the private repository; verify the remote is Wayzer107/uma-jp-build-advisor-private.
5. Never commit a profile to the public repository.

## Build and setup

From mcp-server/:

~~~sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
~~~

The build runs TypeScript checks and produces the single-file Build View and bundled MCP/optional Actions server output. For local development, use the repository's documented `stdio` or Secure MCP Tunnel workflow. For the Pi, keep the source at ~/Sources/uma, point the config at the separate private checkout, and use the service examples in deploy/.

Read before changing behavior:

- README.md
- docs/local-plugin-setup.md
- docs/inventory-profile.md
- docs/reference-coverage.md
- docs/mobile-chatgpt-setup.md
- docs/mobile-gpt-instructions.md
- docs/handoff/current-status.md

## Change and verification practice

- Preserve the existing public/private repository boundary and server separation in every change.
- Prefer the existing catalog readers, profile reader, and import/export scripts instead of creating a second interpretation of game or inventory data.
- Avoid unrelated dependencies. Keep the Pi runtime compatible with Node.js 22 on 64-bit ARM Linux.
- Do not add tests unless the user asks. For behavior changes, run the relevant build/typecheck or direct smoke check and state exactly what it proves.
- Before claiming an operation is live, verify it at that layer: built code is not a running service; a running service is not a connected plugin; a connected plugin is not a verified mobile MCP App.
- After deployment, verify catalog and private-profile reads against both server keys, health status, the Secure MCP Tunnel connection, and the connected MCP App in ChatGPT web. Separately check the target mobile client and report whether the MCP connection and UI are available there. Test Action bearer authentication only if that optional API is deployed.
- Keep the handoff files current when stopping work so another agent can resume without relying on conversation history.

## Current known limitations

- OpenAI's developer MCP App docs provide mobile layout and display-mode guidance. The current Help Center says custom MCP apps are web-only; the directory requirement for desktop/mobile applies to public directory submissions, not this private tunnel plugin. Keep the view responsive, but treat native mobile access as unresolved until directly checked.
- GPT Actions require a Custom GPT and account/workspace support. The project's REST Action route is optional, text-only, and a possible mobile fallback if the target ChatGPT mobile client cannot use the custom MCP app.
- The Actions API is read-only. Use the MCP plugin for catalog publication and GameTora inventory import/sync.
- Global catalog completeness, inventory contents, Pi deployment, and native mobile client support must each be verified independently before claiming support. Tailscale Funnel and a configured Custom GPT are needed only for the optional Actions API route.
