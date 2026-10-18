# Umamusume Build Advisor Reference Data

This repository is the public, versioned source for static Umamusume game facts used by the private ChatGPT Build Advisor. The advisor keeps user inventory and training progress in a separate private repository.

## Server separation

- Japanese-server records belong under `data/ja/` and must come from verified Japanese game data.
- Global-server records belong under `data/global/` and must come from an independently verified Global source.
- Never copy Japanese availability or balance values into Global records.
- User ownership, veteran/legacy inventory, local game files, credentials, and runtime configuration do not belong here.

## Current state

The Japanese catalog in `data/ja/` was generated from the installed Japanese database and Hachimi translation files. It contains addressable records for 563 support cards, 271 trainee outfits, 2,200 skills, linked story events, scenarios, races, courses, conditions, and inheritance factors. Its manifest is `incomplete`: event choice/reward outcomes remain unavailable from the inspected local source. All declared entity ID sets match the installed master data; the full support and trainee ID sets also match GameTora's versioned public feeds. `references/catalog.json` remains an earlier extraction draft. Global completeness remains unavailable until a separate source and coverage are verified.

Every published catalog version must include a source build/hash, record counts, field coverage, unresolved relationships, and unavailable fields. Static game facts are read from this repository. The advisor must not fill server-specific catalog gaps from a live page; live community sources are checked separately for current strategy advice and cited in each recommendation.

The advisor is designed for ChatGPT Web chat. OpenAI Secure MCP Tunnel connects ChatGPT to the local MCP process without publishing the private inventory or exposing a public server; the local package can also run through `stdio` in compatible hosts. The MCP tools read these catalogs and the private server profile, expose ID/name lookup and maintenance actions, and render a structured build recommendation with six support slots, trainee, legacy candidates, swaps, priorities, assumptions, and evidence. Strategy is researched live for each build; the skill ranks Japanese-server community analysis ahead of generic Global guides and uses commercial guide sites only with corroboration. The same prebuilt MCP bundle can run on Windows or a 64-bit Raspberry Pi Linux host. Run catalog refreshes on Windows where the installed game data is available; the Pi can serve and sync the published catalogs and private inventory. The separately packaged plugin does not contain inventory or the local game database. See [ChatGPT online setup](docs/local-plugin-setup.md), [inventory profile and sync](docs/inventory-profile.md), and [catalog coverage](docs/reference-coverage.md). ChatGPT custom MCP access depends on account and workspace permissions and is currently web-only; the computer running the tunnel must stay online while the tools are used.

## Updating

Use `python scripts/export_catalog.py --refresh-gametora --output-root .staging/ja` against the installed game data, review the generated records and `coverage-report.json`, then promote the accepted catalog into `data/ja/` as an explicit repository update. The refresh saves versioned GameTora support and trainee ID/slug snapshots under the ignored `.staging/gametora/` folder. `python scripts/init_global_catalog.py` initializes the Global source as unavailable; never use it to mirror JP facts. Inventory imports and private synchronization use a different toolchain and a different repository.

See `docs/superpowers/specs/2026-10-18-uma-jp-build-advisor-design.md` and the implementation plans in `docs/superpowers/plans/` for the current architecture and workflow.
