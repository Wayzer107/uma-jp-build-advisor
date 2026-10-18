# Japanese reference data

This directory contains the Japanese-server catalog generated from the installed Japanese game's read-only master database and installed Hachimi translation bundle where available.

`manifest.json` records the game-data build hashes, generated time, entity counts, field coverage, unresolved links, and unavailable fields. Do not mark `coverage_status` complete until the production catalog validator reports full coverage for the declared scope.

Generated records must retain their original game IDs and separately record a verified GameTora mapping. Keep Japanese source text and per-field translation provenance. Never put user inventory or account data here.
