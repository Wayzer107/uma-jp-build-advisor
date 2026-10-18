# ChatGPT online and local setup

The primary online workflow is a remote advisor plugin in ChatGPT web through OpenAI Secure MCP Tunnel. The MCP server and repository checkouts stay on a host you control; that host can be Windows or a 64-bit Raspberry Pi Linux server. The installed Japanese game remains on Windows for catalog refreshes. The tunnel client opens an outbound connection to OpenAI and forwards tool calls to the local MCP process; it does not require a public MCP endpoint or inbound firewall rule. Native ChatGPT mobile availability for custom MCP apps is not promised by this setup; see [mobile and web setup](mobile-chatgpt-setup.md) for the current platform status and optional Actions fallback.

The source package's `mcp.json` declares a local `stdio` server for compatible local hosts. That declaration alone does not connect a server to ChatGPT. The packaging script replaces it with a remote tunnel-bound MCP config for the account plugin.

The MCP App view should remain responsive, and every MCP recommendation must include complete chat text. Current OpenAI documentation is mixed by scope: developer UI guides discuss mobile layouts, but the Help Center says custom MCP apps are web-only. Verify mobile access on the target account and client rather than assuming that the web connection carries over. Write actions such as GameTora import, catalog refresh, inventory sync, and catalog publication also require an account and workspace that allow those tools. See [mobile and web setup](mobile-chatgpt-setup.md) for details and the optional Custom GPT Actions integration.

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
     "publicRepoRoot": "C:\\Users\\<user>\\Documents\\Codex\\uma-jp-build-advisor-public",
     "privateRepoRoot": "C:\\Users\\<user>\\Documents\\Codex\\uma-jp-build-advisor-private",
     "gameRoot": "C:\\Steam\\steamapps\\common\\UmamusumePrettyDerby_Jpn",
     "pythonPath": "python",
     "autoSyncInventory": false
   }
   ```

   Environment variables `UMABUILD_PUBLIC_REPO_ROOT`, `UMABUILD_PRIVATE_REPO_ROOT`, `UMAMUSUME_GAME_ROOT`, `UMABUILD_PYTHON`, and `UMABUILD_AUTO_SYNC_INVENTORY` override the file. The local config is not included in the public repository or plugin package.

## Connect ChatGPT with Secure MCP Tunnel

1. In OpenAI Platform, create or reuse a Secure MCP Tunnel and associate it with the ChatGPT workspace you use. Creating or editing a tunnel requires Tunnels Read and Manage. Running the tunnel client and selecting the tunnel in ChatGPT requires Tunnels Read and Use.
2. Download the official latest `tunnel-client` release and make `tunnel-client.exe` available on `PATH`.
3. In PowerShell, create a local tunnel profile. Replace the ID with the tunnel ID shown by Platform:

   ```powershell
   .\scripts\setup-chatgpt-tunnel.ps1 -TunnelId "tunnel_..."
   ```

   The script points the profile at `C:\UmaBuildAdvisorPlugin\mcp-server\dist\index.js`. If the package is installed elsewhere, pass `-InstallRoot` with a path that has no spaces.
4. Generate the remote ChatGPT plugin ZIP with the same tunnel ID:

   ```powershell
   python .\scripts\package_chatgpt_web_plugin.py --tunnel-id "tunnel_..."
   ```

   The default archive is `%LOCALAPPDATA%\UmaBuildAdvisor\uma-build-advisor-chatgpt-plugin.zip`. Its `mcp.json` uses the remote `streamable-http` transport with a Secure MCP Tunnel ID; it contains plugin instructions and the tunnel binding, but no catalog, inventory, runtime key, or MCP server executable. Keep the ZIP private because the tunnel ID identifies your private connection.
5. Start the tunnel from the public repository clone:

   ```powershell
   .\scripts\start-chatgpt-tunnel.ps1
   ```

   The script asks for the runtime API key using a hidden prompt, makes it available to `tunnel-client` only for that process session, runs `tunnel-client doctor`, and starts the foreground tunnel. It does not write the key to the repo, profile, or ChatGPT. Keep the PowerShell session and the computer online while using the advisor.
6. Save the generated archive as a private plugin with Plugin Creator in the account/workspace associated with that tunnel. Install the plugin and wait for tool discovery while `tunnel-client` is running. Review the tools and risk prompt before enabling it.
7. Use the installed remote plugin in ChatGPT web. Ask for a Japanese-server build; it reads the versioned catalog, checks the matching private inventory, performs fresh strategy research, and returns the recommendation in chat with the embedded build view. Then test native ChatGPT mobile separately. The source folder's local `stdio` config is for compatible local agents; the packaging script substitutes the remote tunnel-bound config for ChatGPT.

OpenAI's Secure MCP Tunnel documentation gives the current Platform screens, permissions, key setup, and client options: <https://developers.openai.com/api/docs/guides/secure-mcp-tunnels>. The current ChatGPT connection and plan requirements are documented at <https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt>.

## Raspberry Pi host (64-bit Linux)

The Pi can host the MCP server and Secure MCP Tunnel client for ChatGPT web. The read-only Actions API is a separate optional route for text-only mobile access through a Custom GPT if the native ChatGPT mobile client does not expose the MCP app. Use 64-bit Raspberry Pi OS or another Debian-based ARM64 distribution. The installed Japanese game and catalog refresh stay on Windows. The requested public checkout path is ~/Sources/uma; keep private inventory in a separate sibling checkout.

1. Install Node.js 22 ARM64, Python 3.10 or newer, Git, and the official Linux ARM64 tunnel-client. Install Tailscale only if you choose to expose the optional Actions API through Funnel. Verify node --version, python3 --version, git --version, and tunnel-client --version.
2. Inspect ~/Sources/uma before writing there. If the directory is absent or empty, clone the public repository from https://github.com/Wayzer107/uma-jp-build-advisor.git into ~/Sources/uma. Clone the private Wayzer107/uma-jp-build-advisor-private repository separately into ~/Sources/uma-private only after configuring private-repository authentication on the Pi. Never put profiles under the public checkout.
3. Linux defaults point to ~/Sources/uma and ~/Sources/uma-private. Set UMABUILD_PUBLIC_REPO_ROOT and UMABUILD_PRIVATE_REPO_ROOT in local service environments if those paths differ. Leave gameRoot unset on the Pi. It can read published catalogs and private profiles, but cannot refresh records from a Windows game install.
4. Build or refresh the server bundle from ~/Sources/uma/mcp-server:

   ~~~sh
   corepack pnpm install --frozen-lockfile
   corepack pnpm build
   ~~~

   The build creates the MCP bundle and the optional Actions API bundle. The MCP package itself remains prebuilt in plugin-package/uma-build-advisor/mcp-server/dist/.
5. Set up ChatGPT web using the Secure MCP Tunnel, then assess native mobile support separately:

   ~~~sh
   cd ~/Sources/uma
   bash scripts/setup-chatgpt-tunnel.sh tunnel_...
   python3 scripts/package_chatgpt_web_plugin.py --tunnel-id tunnel_...
   bash scripts/start-chatgpt-tunnel.sh
   ~~~

   Keep the generated plugin archive private. The packaging script uses the package instructions and writes a tunnel-bound remote MCP config; it does not include the executable or private data. To run the tunnel under systemd, use deploy/uma-build-advisor-tunnel.service.example, adjusting the Linux username and tunnel-client location if they differ. Store CONTROL_PLANE_API_KEY only in a root-owned, mode-600 /etc/uma-build-advisor/tunnel.env file.
6. Test whether the connected MCP plugin is available in the target ChatGPT mobile client. Current Help Center documentation says custom MCP apps are web-only. If mobile access is unavailable and the user wants a mobile chat path, install the optional Actions API service and Tailscale Funnel using docs/mobile-chatgpt-setup.md. The API binds to loopback and requires a private bearer token; do not expose it directly or disable authentication.
7. Update the public catalog after Windows-side review by pulling the approved public commit on the Pi. Inventory sync uses the private checkout and requires its own GitHub authentication.

The generated remote plugin is configured through the web Plugins flow. Its embedded Build View uses the MCP Apps UI bridge and responsive layout. The current Help Center says custom MCP apps are web-only, so do not claim native mobile support before testing. GPT Actions are a distinct REST integration configured in a Custom GPT; they may provide mobile text access where the account, workspace, and mobile client support them. The Action API is read-only and returns the recommendation in chat text.
## Local package setup

For a compatible local MCP host that supports `stdio`, add the bundled `mcp.json` configuration and point it at `node ${PLUGIN_ROOT}/mcp-server/dist/index.js`. This local configuration is useful for local development and is not required when the Web connection is established through Secure MCP Tunnel.

## Inventory

Use GameTora Collection Tracker's **Everything** export for the matching server. Import it with `inventory.import_gametora`; verify sections, unresolved IDs, and warnings. Review the candidate before `inventory.sync_profile` writes its profile, raw source, and history only to the private repo. Partial imports preserve sections omitted from the export. `autoSyncInventory` defaults to false.

Do not add or commit `profiles/`, local export files, credentials, game files, or runtime config to the public repository. The package does not read the game's account save database and no complete Hachimi inventory exporter is included.

## Updating Japanese game data

Call `maintenance.preview_catalog_refresh` for `ja` to extract the installed Japanese game data and current GameTora identifier feed into a staging candidate. Review the candidate and coverage. `maintenance.publish_catalog_update` copies only the selected catalog and pushes it to the configured public origin. It refuses Global publication until a separate Global source is verified.

Strategy advice still requires fresh web research on each recommendation. The local catalog supplies game facts; web sources supply current strategy context. If the MCP App view is unavailable, the tool still returns a full text summary in chat.
