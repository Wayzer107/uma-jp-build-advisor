# Umamusume ChatGPT Plugin and App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this subsystem task-by-task.

**Goal:** Provide a private ChatGPT plugin with read-only repository tools, live-researched build advice, and an interactive in-chat build planner.

**Architecture:** A local TypeScript MCP server reads the two repositories and exposes typed reference, inventory, and build-presentation tools. Its MCP App renders the structured recommendation inside the current ChatGPT conversation, while the plugin skill directs the model to use repository facts and current server-specific strategy research. A local `stdio` package avoids a separate hosted website/backend.

**Tech Stack:** TypeScript; `@modelcontextprotocol/server`; `@modelcontextprotocol/ext-apps`; `@openai/mcp-extensions`; React/Vite for the MCP App; Agent Plugins 1.0 package format; Plugin Creator.

**Spec:** `docs/superpowers/specs/2026-10-18-uma-jp-build-advisor-design.md`

## Global Constraints

- The plugin’s static game facts come only from the selected repository catalog; ordinary advice tools are read-only.
- Live research is required for every recommendation and supplies strategy evidence, not missing static game facts.
- Keep server selection explicit and thread-local; never blend JP and Global records or inventories.
- The chat answer remains complete if the app is unavailable.
- Render trainee, six support slots, legacies, alternatives, priorities, ownership labels, and evidence in the app.
- Do not introduce a standalone public website or hosted backend.
- The local `stdio` MCP package is the target for ChatGPT Desktop. If the target host cannot run it, stop and return options rather than silently changing deployment architecture.
- Do not add or run automated tests in this plan; build-time package/data validation is part of the requested product workflow.

## Review Focus

- Catalog or private repo unavailable: show an explicit source status and do not hallucinate a recommendation from a cached assumption.
- User inventory absent: request an export or mark all ownership unknown; never imply an unowned card is owned.
- Rental card in a deck: label it borrowed in both chat and UI.
- Recalculation changes race/scenario/server: fetch matching repository records and perform fresh live research before displaying a new result.
- MCP App unavailable in a client: return the full sourced recommendation as ordinary chat text.

---

### Task 1: Create the local TypeScript MCP server package

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/pnpm-lock.yaml`
- Create: `mcp-server/tsconfig.json`
- Create: `mcp-server/src/index.ts`
- Create: `mcp-server/src/config.ts`

**Interfaces:**
- Server name: `uma-build-advisor`.
- Runtime entrypoint: `mcp-server/dist/index.js`.
- Config reads fixed public/private repository working-copy paths and user sync preferences; no credentials are stored in the plugin package.

- [ ] Use the current OpenAI MCP Extensions TypeScript SDK pattern for a stdio server and MCP App resources.
- [ ] Keep protocol output on stdout and diagnostics on stderr.
- [ ] Scope file access to the configured public catalog and private profile roots; reject paths outside those roots.
- [ ] Add a startup diagnostic that reports missing config/repositories without printing private profile contents.

### Task 2: Implement repository readers and typed MCP tools

**Files:**
- Create: `mcp-server/src/repositories/catalog-reader.ts`
- Create: `mcp-server/src/repositories/profile-reader.ts`
- Create: `mcp-server/src/tools/reference.ts`
- Create: `mcp-server/src/tools/inventory.ts`
- Create: `mcp-server/src/tools/maintenance.ts`
- Modify: `mcp-server/src/index.ts`

**Interfaces:**
- `reference.get_manifest({ server: Server }) -> CatalogManifest`.
- `reference.search_records({ server: Server, kind: RecordKind, query: string, limit?: number }) -> RecordSummary[]`.
- `reference.get_record({ server: Server, kind: RecordKind, id: string }) -> CatalogRecord | MissingRecord`.
- `inventory.get_profile({ server: Server }) -> InventoryProfile | MissingProfile`.
- `maintenance.import_gametora({ server: Server, payload: GameToraPayload, sync?: boolean }) -> ImportSummary`.
- `maintenance.sync_profile({ server: Server }) -> SyncSummary`.
- `maintenance.preview_catalog_refresh({ server: Server }) -> CatalogRefreshSummary`.
- `maintenance.publish_catalog_update({ server: Server, candidate_id: string }) -> CatalogPublishSummary`.

- [ ] Read manifest/index first and fetch only addressable records needed for the user’s request.
- [ ] Return server, source version, and record provenance with every reference result.
- [ ] Return missing/stale/incomplete status explicitly; never fallback to web-derived card facts.
- [ ] Keep advice calls read-only; inventory sync and import remain distinct maintenance operations.
- [ ] Run catalog refresh only against the configured local install and configured public-repository working copy; return a reviewable candidate and coverage delta without publishing it.
- [ ] Publish only a previously reviewed candidate through an explicit user-requested maintenance action; never publish automatically as part of advice or inventory sync.

### Task 3: Define the build recommendation contract

**Files:**
- Create: `schemas/build-recommendation.schema.json`
- Create: `mcp-server/src/types/recommendation.ts`
- Create: `mcp-server/src/tools/build-view.ts`

**Interfaces:**
- `BuildRecommendation` contains `server`, `scenario`, `target`, `generated_at`, `evidence_checked_at`, `trainee`, `deck[6]`, `legacy_candidates`, `stat_priorities`, `skill_priorities`, `alternatives`, `assumptions`, `confidence`, and `sources`.
- Each deck slot includes `support_id`, `owned`, `limit_break`, `effective_level`, `role`, `reason`, `effects`, `skills`, and optional `borrowed_from`.
- Each source includes URL, title, source type (`game_data`, `official`, `community`, or `inference`), date/context, retrieved date, and confidence note.

- [ ] Validate the structured recommendation against the shared schema before returning it to the UI.
- [ ] Preserve repository IDs and source links so cards are clickable through their GameTora mapping.
- [ ] Represent unknown ownership and incomplete catalog fields as unknown/incomplete, never as zero or absent evidence.

### Task 4: Build the MCP App view

**Files:**
- Create: `mcp-server/src/apps/build-view/resource.ts`
- Create: `mcp-server/src/apps/build-view/app.tsx`
- Create: `mcp-server/src/apps/build-view/styles.css`
- Create: `mcp-server/src/apps/build-view/index.html`
- Modify: `mcp-server/src/tools/build-view.ts`

**Interfaces:**
- MCP resource URI: `ui://uma-build-advisor/build-view`.
- Tool: `build.present_recommendation({ recommendation: BuildRecommendation }) -> structuredContent: BuildRecommendation`.
- UI state is sourced from the current tool result and conversation; it is not written to the profile repository.

- [ ] Render build context and recommended trainee first, followed by six support slots, legacy candidates, stat/skill priorities, alternatives, and source panel.
- [ ] Show owned limit break/effective level, rental labels, relevant effects, and hint/event skills in each card detail panel.
- [ ] Add compare and selection controls; relay a selected target or alternative to ChatGPT through the supported model-context/message API so the model can recalculate.
- [ ] Show a pending/researching state until a fresh tool result is returned; never imply a client-side filter is a new recommendation.
- [ ] Use responsive layout, keyboard labels, non-color ownership indicators, and text-first fallbacks when artwork is not authorized.
- [ ] Apply host theme/styles and supported display modes from MCP Extensions; use inline/fullscreen only where the host supports them.

### Task 5: Add the chat skill and plugin manifest

**Files:**
- Create: `plugin-package/uma-build-advisor/plugin.json`
- Create: `plugin-package/uma-build-advisor/mcp.json`
- Create: `plugin-package/uma-build-advisor/skills/uma-build-advisor/SKILL.md`
- Create: `plugin-package/uma-build-advisor/assets/` (only when an authorized icon is available)

**Interfaces:**
- Plugin name: `uma-build-advisor`.
- MCP command: `node ${PLUGIN_ROOT}/mcp-server/dist/index.js` or the exact built runtime path selected for the package.
- Skill instructions cover server separation, repository-only game facts, fresh community research, card-by-card reasoning, app rendering, and the evidence ranking below.

- [ ] Set a private plugin manifest with a concise description and a short description within Plugin Creator’s package length limit.
- [ ] Use the local `stdio` server declaration only after confirming the target ChatGPT Desktop host supports it.
- [ ] In the skill, rank sources explicitly: repository data for static facts; recent, contextualized JP community analysis for JP strategy; Reddit as anecdotal leads requiring corroboration; uma.guide for transferable mechanics rather than current JP meta; and Game8/GameWith only when their claims are reasoned or independently corroborated.
- [ ] Require a fresh search for each recommendation and recalculation, including new relevant sources; record source date, server, scenario/race context, retrieval date, and confidence.
- [ ] Keep credentials, private profile contents, game executables, game database files, and local configuration out of the package.

### Task 6: Create the private plugin and bind its local server

**Files:**
- Create: `dist/uma-build-advisor-plugin.zip`
- Plugin account: private plugin created through Plugin Creator.

**Interfaces:**
- Input: one valid plugin archive containing the manifest, skill, MCP config, and built local server/app resources.
- Output: Plugin Creator private plugin URL and exact plugin/release IDs for future updates.

- [ ] Build the local MCP server and app resources into the package paths used by `mcp.json`.
- [ ] Inspect the archive layout and ensure it contains exactly one plugin root with no secrets or unrelated files.
- [ ] Create the private plugin with `mcp__codex_apps__plugin_creator_create_plugin` after the package is complete.
- [ ] Install/connect the plugin in the target ChatGPT Desktop host and report the desktop-only local-process boundary; do not claim web/mobile tools work unless a separate supported path exists.

