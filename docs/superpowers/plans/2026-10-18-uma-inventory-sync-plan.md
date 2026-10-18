# Umamusume Inventory Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this subsystem task-by-task.

**Goal:** Maintain separate private Japan and Global inventory profiles from GameTora exports and, where reliable, automatic local exports.

**Architecture:** Normalize all supported exports into a versioned private profile schema keyed by canonical catalog IDs. GameTora Everything JSON is the first full interchange route; a Hachimi Edge or alternate local exporter is added only after its coverage is established. Configured sync writes only to the private repository.

**Tech Stack:** Python 3.10+ and JSON for import/export; TypeScript MCP maintenance tools; authenticated Git/GitHub connection without stored credentials.

**Spec:** `docs/superpowers/specs/2026-10-18-uma-jp-build-advisor-design.md`

## Global Constraints

- Store progress only under `profiles/ja/` or `profiles/global/` in the private repository.
- Never write inventory to the public catalog repository.
- Preserve the raw export and unknown fields so format changes do not silently lose data.
- Never use the JP install to infer Global ownership.
- Do not read account save databases; local exporters must be user-configured and documented.
- Automatic sync is opt-in, private-repo-only, pausable, and recoverable from versioned snapshots.
- Do not add or run automated tests in this plan; import summaries and sync status are product behavior.

## Review Focus

- Server missing or conflicting in an export: reject automatic profile replacement and request a server choice.
- Unrecognized GameTora section or field: preserve raw data and report it; do not discard it.
- Unknown card/trainee ID: keep it unresolved and visible rather than map by fuzzy name.
- Exporter version misses supports, trainees, or veterans: mark the profile partial and keep the GameTora route available.
- Private push fails or conflicts: keep the local normalized snapshot and report the remote revision; never fall back to the public repo.

---

### Task 1: Define the private profile schema and layout

**Files:**
- Create: `schemas/inventory-profile.schema.json`
- Create: `docs/inventory-profile.md`
- Create in private repo: `profiles/ja/` and `profiles/global/`

**Interfaces:**
- `Server = "ja" | "global"`.
- `InventoryProfile` includes `schema_version`, `server`, `source_format`, `imported_at`, `source_version`, `supports`, `trainees`, `veterans`, `unresolved_ids`, and `raw_source_reference`.
- Profile snapshots are versioned and remain separate by server.

- [ ] Define support ownership with exact catalog ID, owned limit break, owned level, and optional display metadata.
- [ ] Define owned trainee/outfit IDs and veteran/legacy records with factors, sparks, acquired skills, and source fields when present.
- [ ] Define a `partial_sections` field so omitted sections cannot be mistaken for empty ownership.
- [ ] Document snapshot replacement/merge behavior and recovery path.

### Task 2: Import and normalize GameTora Everything JSON

**Files:**
- Create: `scripts/import_gametora.py`
- Create: `scripts/gametora_schema.py`
- Modify: `docs/inventory-profile.md`

**Interfaces:**
- Add: `parse_everything(payload: dict[str, Any]) -> ParsedGameToraExport`.
- Add: `normalize_gametora(parsed: ParsedGameToraExport, server: Server, catalog: CatalogIndex) -> InventoryProfile`.
- Preserve: `raw_payload` and unknown fields in the import record.

- [ ] Capture and inspect populated Everything and per-section exports to determine actual server and section keys; do not assume key names until confirmed from the exported format.
- [ ] Map supports, trainee cards (`charCards` where present), and veterans through the catalog’s canonical ID maps.
- [ ] Preserve unknown fields, field order where practical, and every unresolved ID in the normalized snapshot.
- [ ] Report detected server, section counts, missing sections, schema version, and unresolved IDs before profile sync.

### Task 3: Export private profiles back to GameTora format

**Files:**
- Create: `scripts/export_gametora.py`
- Modify: `docs/inventory-profile.md`

**Interfaces:**
- Add: `export_everything(profile: InventoryProfile, server: Server) -> dict[str, Any]`.
- CLI: `python scripts/export_gametora.py --server ja --profile <path> --output <path>`.
- Output: one GameTora Everything JSON per server profile.

- [ ] Emit the exact GameTora section and ID format established in Task 2.
- [ ] Keep unsupported inventory detail in the private profile even when GameTora cannot represent it.
- [ ] Include an export summary listing exported, omitted, and unresolved entries.

### Task 4: Add a normalized local-export adapter

**Files:**
- Create: `scripts/import_local_export.py`
- Create: `docs/local-inventory-export.md`
- Conditional: `integrations/hachimi-edge-inventory/` if Hachimi Edge proves suitable.

**Interfaces:**
- Add: `import_local_export(path: Path, server: Server, catalog: CatalogIndex) -> InventoryProfile`.
- Adapter output: the schema from Task 1, with source tool/version and capture time.

- [ ] Compare available local exporters, including Hachimi Edge plugins, against the required supports, trainees, veterans, limit-break, and level fields.
- [ ] Prefer a read-only adapter using exposed game/runtime data and local files; do not read account save databases.
- [ ] If an exporter can capture all sections reliably, document installation, opt-in auto-export cadence, version matching, local output path, and how to disable it.
- [ ] If no Hachimi plugin can meet coverage, keep the GameTora Everything route as the supported path and add only a verified alternative converter.

### Task 5: Configure private-only profile sync

**Files:**
- Create: `scripts/sync_inventory.py`
- Create: `mcp-server/src/tools/inventory-maintenance.ts` (consumed by the ChatGPT Plugin plan)
- Create: `%LOCALAPPDATA%/UmaBuildAdvisor/config.json` at runtime; do not commit it.
- Modify in private repo: `profiles/{server}/**`

**Interfaces:**
- Add: `sync_private_profile(profile: InventoryProfile, server: Server, destination: PrivateRepoConfig) -> SyncResult`.
- `SyncResult` reports destination repo/path, prior and new revision, changed profile, and conflict/error state.

- [ ] Store repo paths and sync preferences in the user config, never access tokens or credentials.
- [ ] Use the authenticated GitHub MCP/app connection when it can perform scoped private-repo operations; otherwise use the local Git credential helper after confirming the private remote.
- [ ] Update only the matching `profiles/{server}/` path and retain a recoverable history snapshot.
- [ ] Support configured auto-sync, manual sync, pause/disable, and a local-only import mode.
- [ ] On auth failure or conflict, keep the local snapshot, do not write anywhere public, and expose the action needed to resume.

