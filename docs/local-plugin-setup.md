# ChatGPT Web and local setup

The intended online workflow is to use the advisor in a ChatGPT Web conversation through OpenAI Secure MCP Tunnel. The MCP server and repository checkouts stay on a host you control; that host can be Windows or a 64-bit Raspberry Pi Linux server. The installed Japanese game remains on Windows for catalog refreshes. The tunnel client opens an outbound connection to OpenAI and forwards tool calls to the local MCP process; it does not require a public MCP endpoint or inbound firewall rule.

The package's `mcp.json` also declares a local `stdio` server for compatible local hosts. That declaration alone does not connect a server to ChatGPT Web. Connect the Web app to the same local server through a Secure MCP Tunnel.

ChatGPT custom MCP connections are currently available on ChatGPT Web for Business and Enterprise/Edu workspaces. Pro accounts can connect custom MCP servers with read/fetch permissions. In read/fetch-only access, catalog and inventory lookup plus build presentation remain available, while GameTora import, catalog-refresh staging, inventory sync, and catalog publication are write actions and require an account and workspace that allow write tools. Workspace policy can also limit who creates or uses custom servers. Custom MCP connections are not supported on ChatGPT mobile. Check your current ChatGPT account and workspace access before relying on write actions.

## Requirements

- Windows 10 or newer for local Japanese game-data refresh, or 64-bit ARM Linux for a persistent MCP/tunnel host
- Node.js 22 or newer, available as `node`
- Python 3.10 or newer, available as `python` on Windows or `python3` on Linux
- Git available as `git`
- A local clone of `Wayzer107/uma-jp-build-advisor`
- A local clone of the private `Wayzer107/uma-jp-build-advisor-private` repository when inventory sync is desired
- An OpenAI Platform tunnel associated with the ChatGPT workspace, plus a runtime API key with Tunnels Read and Use permissions
- The official `tunnel-client` binary from Platform tunnel settings or the latest OpenAI release

## Prepare the local repositories

1. Clone the public repository to `%USERPROFILE%\Documents\Codex\uma-jp-build-advisor-public` and the private repository to `%USERPROFILE%\Documents\Codex\uma-jp-build-advisor-private`, or set the corresponding paths in `%LOCALAPPDATA%\UmaBuildAdvisor\config.json`.
2. Build the server bundle from the public repository's `mcp-server` directory:

   ```powershell
   corepack pnpm install --frozen-lockfile
   corepack pnpm build
   ```

3. Install the plugin package folder at `C:\UmaBuildAdvisorPlugin` by copying `plugin-package\uma-build-advisor` there. This path avoids spaces in the tunnel's `stdio` command. From the public repository root, run:

   ```powershell
   Copy-Item -LiteralPath .\plugin-package\uma-build-advisor -Destination C:\UmaBuildAdvisorPlugin -Recurse -Force
   ```

   The package contains a prebuilt server bundle; when building a fresh package from source, copy the current `mcp-server\dist\` output into the package before the copy.
4. Configure the data and game roots in `%LOCALAPPDATA%\UmaBuildAdvisor\config.json` if the defaults do not match your machine:

   ```json
   {
     "publicRepoRoot": "C:\\Users\\Jamie\\Documents\\Codex\\uma-jp-build-advisor-public",
     "privateRepoRoot": "C:\\Users\\Jamie\\Documents\\Codex\\uma-jp-build-advisor-private",
     "gameRoot": "C:\\Steam\\steamapps\\common\\UmamusumePrettyDerby_Jpn",
     "pythonPath": "python",
     "autoSyncInventory": false
   }
   ```

   Environment variables `UMABUILD_PUBLIC_REPO_ROOT`, `UMABUILD_PRIVATE_REPO_ROOT`, `UMAMUSUME_GAME_ROOT`, `UMABUILD_PYTHON`, and `UMABUILD_AUTO_SYNC_INVENTORY` override the file. The local config is not included in the public repository or plugin package.

## Connect ChatGPT Web

1. In OpenAI Platform, create or reuse a Secure MCP Tunnel and associate it with the ChatGPT workspace you use. Creating or editing a tunnel requires Tunnels Read and Manage. Running the tunnel client and selecting the tunnel in ChatGPT requires Tunnels Read and Use.
2. Download the official latest `tunnel-client` release and make `tunnel-client.exe` available on `PATH`.
3. In PowerShell, create a local tunnel profile. Replace the ID with the tunnel ID shown by Platform:

   ```powershell
   .\scripts\setup-chatgpt-tunnel.ps1 -TunnelId "tunnel_..."
   ```

   The script points the profile at `C:\UmaBuildAdvisorPlugin\mcp-server\dist\index.js`. If the package is installed elsewhere, pass `-InstallRoot` with a path that has no spaces.
4. Generate the ChatGPT Web plugin ZIP with the same tunnel ID:

   ```powershell
   python .\scripts\package_chatgpt_web_plugin.py --tunnel-id "tunnel_..."
   ```

   The default archive is `%LOCALAPPDATA%\UmaBuildAdvisor\uma-build-advisor-chatgpt-web.zip`. It contains the plugin instructions and a tunnel-ID binding, but no catalog, inventory, runtime key, or MCP server executable. Keep the ZIP private because the tunnel ID identifies your private connection.
5. Start the tunnel from the public repository clone:

   ```powershell
   .\scripts\start-chatgpt-tunnel.ps1
   ```

   The script asks for the runtime API key using a hidden prompt, makes it available to `tunnel-client` only for that process session, runs `tunnel-client doctor`, and starts the foreground tunnel. It does not write the key to the repo, profile, or ChatGPT. Keep the PowerShell session and the computer online while using the advisor.
6. Save the generated archive as a private plugin with Plugin Creator, or add the custom MCP server directly in ChatGPT Web using **Plugins → + → Add custom MCP server → Tunnel** and select the same tunnel. Wait for tool discovery while `tunnel-client` is running. Review the tools and risk prompt before creating the app.
7. Start a ChatGPT Web conversation and select or mention the Umamusume Build Advisor app. Ask for a Japanese-server build; it reads the versioned catalog, checks the matching private inventory, performs fresh strategy research, and returns the full recommendation in chat with the embedded build view when supported.

OpenAI's Secure MCP Tunnel documentation gives the current Platform screens, permissions, key setup, and client options: <https://developers.openai.com/api/docs/guides/secure-mcp-tunnels>. The current ChatGPT connection and plan requirements are documented at <https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt>.

## Raspberry Pi host (64-bit Linux)

The MCP server and tunnel also run on a Raspberry Pi with 64-bit ARM Linux. The repository's bundled server is JavaScript and runs on Node.js 22 ARM64; the official OpenAI `tunnel-client` release includes Linux ARM64 builds. Use Raspberry Pi OS 64-bit or another Debian-based ARM64 distribution. A 32-bit OS is outside the supported setup.

1. Install Node.js 22 ARM64, Python 3.10 or newer, Git, and the official Linux ARM64 `tunnel-client` release. Verify `node --version`, `python3 --version`, and `tunnel-client --version`.
2. Clone the public repository to `~/uma-jp-build-advisor-public` and the private repository to `~/uma-jp-build-advisor-private`. Configure Git SSH access to the private repo using a key with the required repo permissions; keep the key outside both checkouts.
3. The public repository includes a prebuilt `plugin-package/uma-build-advisor/mcp-server/dist/` bundle. Pull updates to the public repository to update the server. To build from source on the Pi instead, run `corepack pnpm install --frozen-lockfile` and `corepack pnpm build` from `mcp-server/`, then copy `mcp-server/dist/` to `plugin-package/uma-build-advisor/mcp-server/dist/`.
4. The config defaults point at `~/uma-jp-build-advisor-public` and `~/uma-jp-build-advisor-private`. If you use other locations, create `~/.config/uma-build-advisor/config.json` (replace `/home/pi` if the Pi account has a different name):

   ```json
   {
     "publicRepoRoot": "/home/pi/uma-jp-build-advisor-public",
     "privateRepoRoot": "/home/pi/uma-jp-build-advisor-private",
     "pythonPath": "python3",
     "autoSyncInventory": false
   }
   ```

   Leave `gameRoot` unset on the Pi. It can read the current published catalogs and private profile, but it cannot refresh catalog records from a Windows game installation. `maintenance.preview_catalog_refresh` reports that the game source is unavailable on this host; run that operation from Windows, publish the reviewed data to the public repo, then pull it on the Pi.
5. Create the tunnel profile, generate the online plugin ZIP, and start the client from the public clone:

   ```bash
   bash scripts/setup-chatgpt-tunnel.sh tunnel_...
   python3 scripts/package_chatgpt_web_plugin.py --tunnel-id tunnel_...
   bash scripts/start-chatgpt-tunnel.sh
   ```

   The ZIP is written to `~/.local/state/UmaBuildAdvisor/uma-build-advisor-chatgpt-web.zip`; use Plugin Creator to save it privately or create the custom MCP app directly from the ChatGPT Web tunnel picker. `setup-chatgpt-tunnel.sh` requires a checkout path without spaces because `tunnel-client` stores the MCP stdio command in its local profile. `start-chatgpt-tunnel.sh` securely prompts for the runtime API key if it is not already set in the process environment. Keep the process active; use a service manager such as `systemd` only after confirming your secret is supplied through a protected environment file or secret store rather than a project file.

For a persistent Pi host, use `deploy/uma-build-advisor-tunnel.service.example` as the systemd unit template. Replace the example `pi` user, home, repository path, and `tunnel-client` binary path with the actual values. Put `CONTROL_PLANE_API_KEY=<runtime-key>` in `/etc/uma-build-advisor/tunnel.env`, create that file locally with `sudoedit`, and set it to root-only permissions (`sudo chmod 600 /etc/uma-build-advisor/tunnel.env`). Then copy the edited unit to `/etc/systemd/system/uma-build-advisor-tunnel.service`, run `sudo systemctl daemon-reload`, `sudo systemctl enable --now uma-build-advisor-tunnel.service`, and check `sudo systemctl status uma-build-advisor-tunnel.service`. The key file is local to the Pi and must never be committed to either repository.

The supported architecture boundary is the bundled Node.js MCP server plus `tunnel-client` on 64-bit ARM Linux. The game-data extractor remains Windows-side because the configured local source is the installed Windows Japanese game. Inventory/profile Git sync is portable, subject to GitHub SSH permissions and local repository availability.

## Local package setup

For a compatible local MCP host that supports `stdio`, add the bundled `mcp.json` configuration and point it at `node ${PLUGIN_ROOT}/mcp-server/dist/index.js`. This local configuration is useful for local development and is not required when the Web connection is established through Secure MCP Tunnel.

## Inventory

Use GameTora Collection Tracker's **Everything** export for the matching server. Import it with `inventory.import_gametora`; verify sections, unresolved IDs, and warnings. Review the candidate before `inventory.sync_profile` writes its profile, raw source, and history only to the private repo. Partial imports preserve sections omitted from the export. `autoSyncInventory` defaults to false.

Do not add or commit `profiles/`, local export files, credentials, game files, or runtime config to the public repository. The package does not read the game's account save database and no complete Hachimi inventory exporter is included.

## Updating Japanese game data

Call `maintenance.preview_catalog_refresh` for `ja` to extract the installed Japanese game data and current GameTora identifier feed into a staging candidate. Review the candidate and coverage. `maintenance.publish_catalog_update` copies only the selected catalog and pushes it to the configured public origin. It refuses Global publication until a separate Global source is verified.

Strategy advice still requires fresh web research on each recommendation. The local catalog supplies game facts; web sources supply current strategy context. If the MCP App view is unavailable, the tool still returns a full text summary in chat.
