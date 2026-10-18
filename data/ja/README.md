# Japanese reference data

This directory contains the Japanese-server catalog generated from the installed Japanese game's read-only master database and installed Hachimi translation bundle where available. Addressable records live under `support-cards/`, `trainees/`, `skills/`, `events/`, `scenarios/`, `races/`, and `factors/`; `indexes/` contains ID and normalized-name maps.

`manifest.json` records the game-data build hashes, generated time, entity counts, field coverage, unresolved links, and unavailable fields. Do not mark `coverage_status` complete until the production catalog validator reports full coverage for the declared scope.

Generated records retain original game IDs and separately record the reconciled GameTora mapping. Keep Japanese source text and per-field translation provenance. Fields without an installed or reviewed source remain explicitly unavailable. Never put user inventory or account data here.

Refresh with `python scripts/export_catalog.py --refresh-gametora --output-root .staging/ja`. This fetches versioned GameTora support-card and character-card feeds, verifies their complete ID sets against the local Japanese master, and records canonical detail URLs, event-skill IDs, and hint cross-checks. The local game install remains the source of static game facts. Run `python scripts/validate_catalog.py --server ja --catalog-root .staging/ja` and inspect its report before copying a candidate into `data/ja/`.
