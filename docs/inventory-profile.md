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
