# Umamusume ChatGPT Build Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task. The three subsystem plans linked below are separate deliverables with explicit interfaces.

**Goal:** Build a private ChatGPT plugin and MCP App that gives sourced, inventory-aware Umamusume build advice from complete server-separated repository data.

**Architecture:** Python refresh and import tools maintain a public static reference catalog and a separate private progress repository. A TypeScript MCP server reads those repositories, serves recommendation tools and the in-chat build view, and invokes local maintenance tools when available. OpenAI Secure MCP Tunnel connects ChatGPT Web to the local server without exposing the server or inventory publicly. The same prebuilt server bundle runs on Windows and 64-bit Raspberry Pi Linux. No separate user-facing site or hosted data backend is introduced.

**Tech Stack:** Existing Python catalog exporter and SQLite/JSON tools; TypeScript with `@modelcontextprotocol/server`, `@modelcontextprotocol/ext-apps`, and `@openai/mcp-extensions`; ChatGPT Plugin Creator package format; Git/GitHub MCP for repository synchronization.

**Spec:** `docs/superpowers/specs/2026-10-18-uma-jp-build-advisor-design.md`

## Global Constraints

- The public repository is canonical for static game facts; the private repository is canonical for user inventory and progress.
- Keep `ja` and `global` data separate in both repositories.
- The plugin reads game facts from repository records; live web search supplies current strategy evidence, not missing catalog facts.
- Do not use account save databases or send inventory to the public repository.
- Do not claim catalog completeness unless the source coverage manifest is complete for its declared scope.
- Use the currently installed Japanese game files as the first reference-data source; establish a verified Global source before claiming Global completeness.
- Use Secure MCP Tunnel for ChatGPT Web chat and local `stdio` only for compatible local hosts. The tunnel host must remain online during use. Verify ChatGPT account/workspace support for custom MCP connections; full MCP write access is plan and workspace dependent.
- Support Windows and 64-bit Raspberry Pi Linux for serving the prebuilt MCP bundle. Keep Japanese catalog refresh on a Windows host with the installed game data; publish to the repository and pull the update on the Pi.
- Hachimi Edge is an exporter candidate. Keep GameTora Everything JSON as the supported import/export route even if Hachimi cannot capture every section.
- Do not add or run automated tests in this plan. Catalog coverage reports, import summaries, and setup diagnostics are product features required by the spec.

## Review Focus

- Missing support hint/event-to-skill links: catalog publication must report unresolved relationships and the advisor must not invent the affected facts. Owner: Reference Catalog plan.
- Japanese/Global crossover: records and inventory updates must retain source-server identity and never infer Global availability from JP data. Owners: Reference Catalog and Inventory Sync plans.
- Partial or unknown GameTora JSON fields: imports must preserve source JSON and report unsupported or missing sections instead of silently discarding them. Owner: Inventory Sync plan.
- Partial Hachimi export or game-version mismatch: disable automatic sync until coverage is established and keep GameTora import available. Owner: Inventory Sync plan.
- Private repository access failure or concurrent update: never redirect inventory to the public repo; report auth/conflict state and preserve the local snapshot. Owners: Inventory Sync and ChatGPT Plugin plans.

---

## Current Workspace and Decisions

The working folder is `C:\Users\Jamie\Documents\Codex\uma-jp-build-advisor-public`. It contains `scripts/export_catalog.py`, `references/catalog.json`, and the approved spec. It is not currently a Git checkout. The current catalog contains 563 support-card rows and 271 trainee-outfit rows, but it lacks connected support hint and event skill data and is not complete. No Global source has been established in this workspace.

The intended public repository is `Wayzer107/uma-jp-build-advisor`; the private profile repository is `Wayzer107/uma-jp-build-advisor-private`. Confirm the existing private repository and authenticated GitHub access during bootstrap. If repository names or access differ, update the plan before creating remotes.

## Plan Split and Order

1. [Reference Catalog plan](2026-10-18-uma-reference-catalog-plan.md): bootstrap the public repository, define the complete catalog schema, extract and validate JP data, establish the Global source, and publish versioned data.
2. [Inventory Sync plan](2026-10-18-uma-inventory-sync-plan.md): define private profiles, import/export GameTora Everything JSON, evaluate Hachimi/other local exporters, and configure private-only sync.
3. [ChatGPT Plugin and App plan](2026-10-18-uma-chatgpt-plugin-app-plan.md): build the repository-backed MCP server, ChatGPT skill, structured build UI, private plugin package, and Secure MCP Tunnel connection guide.

The catalog schema and profile schema must be agreed before implementing their MCP readers. The build recommendation schema must be shared by the advice tool and app UI. Build the data-maintenance pieces first, then the read tools, then the view and plugin package.

## Host and Repository Gates

1. Confirm that the ChatGPT Web account/workspace can create a custom MCP app and select a Secure MCP Tunnel. ChatGPT Web uses the tunnel connection; uploading a `stdio` package alone does not connect the local process. Retain ordinary text answers if the embedded app view is unsupported.
2. Confirm the tunnel client can reach the local MCP server, the correct ChatGPT workspace is associated with the tunnel, and the required tunnel permissions are available. Keep the service host online during use.
3. Initialize the public local folder as a Git repository and connect the intended public remote. Clone/configure the private repo separately with the user’s existing authenticated GitHub access. Do not place credentials in project files.
4. Determine whether the plugin package can use the existing GitHub MCP/app connection directly. Prefer the verified connection. If it cannot be invoked by a local server, use the user-authenticated local Git credential helper for sync; keep the repository split and permissions explicit.

## Implementation Order

1. Complete the Reference Catalog subplan, including a coverage manifest and the Global source decision.
2. Complete the Inventory Sync subplan against the shared catalog IDs and private profile paths.
3. Complete the ChatGPT Plugin and App subplan against the catalog/profile interfaces.
4. Package and save the plugin privately through Plugin Creator after its manifest, MCP configuration, skill, and UI resources are complete.
5. Report any remaining data coverage or host limitations before claiming the JP/Global advisor is complete.

