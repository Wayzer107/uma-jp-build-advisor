# Umamusume Reference Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this subsystem task-by-task.

**Goal:** Produce complete, server-separated, versioned Umamusume reference records with exact GameTora mappings from verified game data.

**Architecture:** Extend the existing read-only JP master-data exporter, split its output into addressable records and indexes, and generate a manifest and coverage report. Keep the JP extractor distinct from a separately verified Global source adapter.

**Tech Stack:** Python 3.10+, `sqlite3`, `json`, `hashlib`, existing `scripts/export_catalog.py`; JSON Schema; Git/GitHub.

**Spec:** `docs/superpowers/specs/2026-10-18-uma-jp-build-advisor-design.md`

## Global Constraints

- Public data paths use `data/ja/` and `data/global/`; each record carries its server and source build/version.
- Read installed master data and translation files without modifying the game installation.
- Keep Japanese source strings and translation provenance for each translated field.
- Do not infer Global availability/effects from the JP dataset.
- Do not publish an incomplete catalog as complete; publish unresolved and unavailable fields in its manifest.
- Keep user inventory out of this repository.
- Do not add or run automated tests in this plan; implement the required production coverage report and fail publication when its completeness rules are not met.

## Review Focus

- A card or trainee appears in a source table but not generated output: the coverage report must name the missing record.
- A support hint/event references an unknown skill ID: preserve the raw relationship and mark it unresolved rather than inventing a skill.
- An English translation is absent: retain the Japanese source and mark the translated field unavailable.
- A GameTora ID collision or ambiguous mapping appears: block the mapping from being treated as exact and list it in the manifest.
- A Global record is sourced from JP-only data: reject it from the Global catalog.

---

### Task 1: Bootstrap the public reference repository

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `data/ja/README.md`
- Create: `data/global/README.md`
- Existing: `scripts/export_catalog.py`
- Existing: `references/catalog.json`

**Interfaces:**
- Consumes: current local project folder and authenticated GitHub repository access.
- Produces: a Git checkout with public remote `Wayzer107/uma-jp-build-advisor` and documented server data layout.

- [ ] Initialize Git in the existing folder, preserve current files, and add the public remote without overwriting remote content.
- [ ] Add ignore rules for local game files, private profiles, credentials, build artifacts, and temporary JSON files.
- [ ] Document that only static reference data belongs in the public repo.
- [ ] Commit the existing exporter, current catalog draft, and approved spec as the initial baseline; label the catalog as incomplete in its README.

### Task 2: Map the full Japanese source data

**Files:**
- Create: `docs/reference-source-map.md`
- Create: `docs/reference-coverage.md`
- Read/Modify: `scripts/export_catalog.py`

**Interfaces:**
- Consumes: the installed JP `master.mdb`, installed Hachimi translation bundle, and any required local game data files.
- Produces: a field-to-source map listing each source table/file, key, relationship, localization category, and output record.

- [ ] Inventory tables and file assets in the current JP install and identify the tables/relations for support hints, card events and rewards, trainee skills/events, skill conditions, scenarios, race data, and legacy factors.
- [ ] Document exact source columns and foreign-key-like ID relationships in `docs/reference-source-map.md`.
- [ ] Record which required fields are not in the installed files and which authoritative external source must supply them; keep these fields explicitly unavailable until sourced.

### Task 3: Define the addressable catalog schema

**Files:**
- Create: `schemas/catalog.schema.json`
- Create: `data/ja/manifest.json` (generated)
- Create: `data/global/manifest.json` (generated)
- Create: `data/{server}/indexes/`
- Create: `data/{server}/support-cards/`, `trainees/`, `skills/`, `events/`, `scenarios/`, `races/`, `factors/`

**Interfaces:**
- Consumes: source map from Task 2.
- Produces: JSON Schema version 1, per-record file conventions, and a manifest with `server`, source version/hashes, generated timestamp, entity counts, field coverage, unresolved links, and unavailable fields.

- [ ] Define stable ID and GameTora mapping fields for each entity kind.
- [ ] Use one addressable JSON record per support card, trainee outfit, skill, event, scenario, race/course, and inheritance factor; provide compact indexes by ID and normalized name.
- [ ] Define the manifest field `coverage_status` as `complete`, `incomplete`, or `source_unavailable`; only `complete` can be published as complete.
- [ ] Keep any full-catalog bundle as an optional generated artifact; the MCP reader uses indexes and individual records.

### Task 4: Expand the JP extractor and writer

**Files:**
- Modify: `scripts/export_catalog.py`
- Create: `scripts/catalog_records.py`
- Create: `scripts/write_catalog.py`
- Create/Update: `data/ja/**`

**Interfaces:**
- Preserve: `export_catalog(master_path: Path, translations_path: Path | None) -> dict[str, Any]` as the current extraction entrypoint or provide a compatibility wrapper with that signature.
- Add: `write_catalog(catalog: dict[str, Any], output_root: Path) -> None`.
- Output: addressable record JSON, compact indexes, and source metadata using the schema from Task 3.

- [ ] Extend extraction using the exact source relationships in `docs/reference-source-map.md`; include effects at each level, unique effects, all support hint/event skills and event outcomes, trainee growth/aptitudes/skills/unlocks/career effects, skill conditions and unlock paths, scenario/race mechanics, and inheritance data where present.
- [ ] Preserve raw source IDs and raw values alongside normalized labels when interpretation is uncertain.
- [ ] Preserve Japanese text and select installed English translations only when present; record per-field translation provenance.
- [ ] Derive exact GameTora support/trainee IDs and URLs; mark ambiguous mapping separately from verified mapping.
- [ ] Read source files read-only and write catalog output atomically under `data/ja/`.

### Task 5: Add the production completeness report

**Files:**
- Create: `scripts/validate_catalog.py`
- Create: `docs/reference-coverage.md` (generated or updated)
- Modify: `scripts/export_catalog.py`

**Interfaces:**
- Add: `validate_catalog(catalog_root: Path, server: str) -> dict[str, Any]`.
- CLI: `python scripts/validate_catalog.py --server ja --catalog-root data/ja`.
- Output: counts by entity/field, missing records, unresolved links, unlocalized fields, duplicate IDs, and `coverage_status`.

- [ ] Compare extracted source entity IDs against generated record IDs for the declared scope.
- [ ] Resolve or report every card-to-skill, event-to-reward, trainee-to-skill, and GameTora-ID link.
- [ ] Make catalog publication stop when required source files are missing, parse failures occur, or required relationships are silently dropped.
- [ ] Write the source hashes, source build/version, entity counts, field coverage, and known unavailable fields to each manifest.

### Task 6: Establish the Global source and generate its catalog

**Files:**
- Create: `docs/global-data-source.md`
- Create/Modify: `scripts/import_global_catalog.py`
- Create/Update: `data/global/**`

**Interfaces:**
- Consumes: a verified Global install/export or an authoritative source whose server scope and coverage can be demonstrated.
- Produces: the same catalog schema with `server: "global"` and independent provenance.

- [ ] Inspect candidate verified Global sources and document their provenance and field coverage before importing any records.
- [ ] Use a Global source adapter distinct from `export_catalog.py` when its format differs from JP.
- [ ] Keep Global publication blocked until its manifest meets the declared completeness scope; if no source is available, report the exact missing source rather than borrowing JP rows.

### Task 7: Publish a versioned reference update

**Files:**
- Modify: `README.md`
- Modify: `data/{server}/manifest.json`
- Modify: generated `data/{server}/**`

**Interfaces:**
- Consumes: a completed catalog generation and coverage report.
- Produces: reviewable public-repository commit(s) containing only static reference data and provenance.

- [ ] Run the local extractor against `C:\Steam\steamapps\common\UmamusumePrettyDerby_Jpn` and write to a staging output before replacing tracked files.
- [ ] Review the generated record counts, change summary, source hashes, and coverage report.
- [ ] Publish the reviewed data to the public repo without inventory files or account data.

