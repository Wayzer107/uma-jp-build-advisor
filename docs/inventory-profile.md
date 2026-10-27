# Private inventory profile

The GameTora Everything backup is the supported collection interchange format. It contains separate trainee, support, and veteran collections in one versioned JSON file. The importer requires a server selection, keeps the original JSON as a private sidecar, maps exact IDs against the corresponding catalog, and reports partial sections and unresolved IDs.

## Export from GameTora

On the matching server's Collection Tracker, open **Backup → Export → Everything → Export**, then choose **Download as a file**. Export Japan and Global separately unless the Everything export explicitly contains both server sections. Keep the downloaded JSON private: it includes your collection and veteran records.

The current client format is an object with `app: "gametora"`, `game: "umamusume"`, `type: "collection"`, `version: 4`, a timestamp, and `servers`. A selected server contains some or all of `charCards`, `supports`, and `veterans`. The importer also accepts version 3; unknown future versions are parsed best-effort with a warning and their raw source is preserved. Versions 1 and 2 and share-link JSON are rejected.

GameTora server keys are normalized only through the explicit aliases in `scripts/gametora_schema.py`: `ja`, `jp`, and `jpn` identify Japan; `global`, `en`, and `gl` identify Global. The caller still supplies `--server`; an export containing only the other server is rejected. Unknown server keys are retained in the raw file and never mapped by character names.

## Import to a private candidate

Use a temporary candidate location outside the public repo. The command writes both a normalized profile and a sibling `.source.json` file containing the original export.

```powershell
python scripts/import_gametora.py `
  --server ja `
  --input "$env:USERPROFILE\Downloads\uma-col-all-2026-10-18.json" `
  --catalog-root data/ja `
  --output "$env:LOCALAPPDATA\UmaBuildAdvisor\imports\ja-current.json"
```

For Global, pass `--server global --catalog-root data/global`. That catalog currently reports `source_unavailable`; imported IDs are retained as unresolved and are not inferred from the Japanese catalog.

Review the summary before syncing. `supports` and `charCards` are keyed by the exact IDs in the selected server collection. The support tracker stores limit break as an integer from 0 through 4; if an unfamiliar value shape appears, it is preserved in `raw_value` and the normalized limit break remains unknown. Trainee ownership is based on membership in the export map. Veteran records keep their raw GameTora value and expose the known fields (`card_tid`, score, stats, aptitudes, skills, factors, lineage, selected races, and note). `card_tid` maps through the catalog's verified GameTora trainee `tid`, not by name.

If a section is absent, its normalized value is `null` and its name is listed in `partial_sections`. A present empty map means the exported collection is explicitly empty. During private sync, omitted sections carry forward from the last profile; an explicitly empty section clears that section. Unknown top-level and selected-server keys remain in the normalized profile, and the complete raw export remains in the sidecar.

## Sync to the private repository

Only the local checkout of `Wayzer107/uma-jp-build-advisor-private` is an allowed sync destination. Configure a local Git credential helper; the scripts store no access token. Sync verifies the `origin` remote before writing, retains a dated profile history and the raw export, fetches the private branch, and refuses a divergent update. A failed push leaves the local private snapshot and reports the error. It never falls back to the public catalog repo.

```powershell
python scripts/sync_inventory.py `
  --server ja `
  --profile "$env:LOCALAPPDATA\UmaBuildAdvisor\imports\ja-current.json" `
  --private-repo "$env:USERPROFILE\Documents\Codex\uma-jp-build-advisor-private"
```

Use `--no-push` for a local-only private commit. This action is separate from import, so an import can be reviewed before synchronization.

## Export back to GameTora

```powershell
python scripts/export_gametora.py `
  --server ja `
  --profile "$env:USERPROFILE\Documents\Codex\uma-jp-build-advisor-private\profiles\ja\current.json" `
  --output "$env:USERPROFILE\Downloads\uma-gametora-ja.json"
```

The exporter emits a GameTora version 4 Everything backup with the selected server and every section present in the profile. It omits sections whose value is `null`, preserves source values for round trips, and reports section counts. GameTora's import preview should be reviewed before applying the backup there.

## Profile layout

The private repo keeps server snapshots separate:

```text
profiles/
  ja/
    current.json
    history/
    raw-imports/
  global/
    current.json
    history/
    raw-imports/
```

Only this private repository stores ownership, veteran/legacy details, and source exports. The public repo contains the profile schema and import/export/sync code, never an actual profile.

For each selected server, `profiles/<server>/current.json` is the sole canonical current inventory/progress record. Import candidates are proposed updates; `history/`, `raw-imports/`, and embedded `raw_value` fields preserve provenance and GameTora round trips. Readers do not merge those archives into the current collection or count them as additional owned records. The MCP projection and its pages are derived reads of `current.json`, not separately maintained profiles.

## MCP response projection

Start with `inventory.get_summary` for profile availability, import time, section status/counts, partial sections, and unresolved-ID count. It returns no owned records. Use `inventory.query_records` to select one section (`supports`, `trainees`, or `veterans`) and fetch relevant records rather than sending the whole collection to ChatGPT.

Queries support exact `ids`, a catalog-name substring `query`, `minimum_limit_break` for supports, and `trainee_outfit_id` for trainees/veterans. Veteran `skill_id` and `factor_id` filters match exact stored IDs in the normalized fields; they do not interpret undocumented codes or search raw import copies. Unknown limit breaks do not pass a minimum filter. Combining filters requires all of them to match. Invalid filter/section combinations return an explicit error.

Query pages default to 20 records and accept `limit` 1–50 plus `offset`. Follow `pagination.next_offset`; `pagination.total` counts filtered matches. Missing sections return `records: null`, `section_status: unknown`, and an unknown total; a known empty section returns an empty array and complete pagination. Veteran summaries include IDs, score, stats, aptitudes, skills, factors, and catalog mapping. Use `detail: full` with selected veteran IDs for lineage, race history, and notes. Raw import copies are omitted in both modes. If `imported_at_utc` changes during inspection, restart paging against the updated collection.

`inventory.get_profile` remains compatible with existing callers. It reads the same stored profile but returns a compact projection for MCP. It omits per-record `raw_value` copies and top-level raw/unknown import fields; the on-disk profile, raw exports, and history are unchanged. Present support and trainee sections retain their normalized ownership data. Missing sections remain `null`, and a missing profile remains unknown ownership.

Veterans default to a page of 25. Use `veteran_offset` and `veteran_limit` (1–100) and follow `pagination.veterans.next_offset` to inspect additional pages. `total`, `returned`, and `complete` distinguish a partial page from the full collection. The server may reduce a page to keep the full text-plus-structured reply below a 900 KiB budget. If even the collection projection exceeds that budget, it returns an explicit unavailable result instead of an oversized reply or an empty inventory.

This bound matters because Secure MCP Tunnel and the SDK have a 10 MiB message ceiling. Returning a large stored profile in both `content` and `structuredContent` can exceed that ceiling even when the file itself is readable. Refresh the registered ChatGPT connection after changes to this tool's schema.

Both query and compatibility pages fit the byte budget using binary search over a contiguous prefix, avoiding repeated removal/serialization of individual veterans. A single record or mandatory metadata that cannot fit returns an explicit unavailable result; the server never silently skips records or returns an empty collection to conceal an oversized response.

Parsed files and compact projections are cached only in process memory. Every file read checks device/inode, size, and nanosecond modification/change times, so private sync, catalog publication, atomic replacement, deletion, and config edits refresh the corresponding cached value. Concurrent reads of the same version share one load. The parsed-file cache is bounded to 256 files and 64 MiB of source bytes (parsed memory can be larger); least-recently-used entries are evicted. No second progress file or database is created.
