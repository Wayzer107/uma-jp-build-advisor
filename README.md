# Umamusume Build Advisor Reference Data

This repository is the public, versioned source for static Umamusume game facts used by the private ChatGPT Build Advisor. The advisor keeps user inventory and training progress in a separate private repository.

## Server separation

- Japanese-server records belong under `data/ja/` and must come from verified Japanese game data.
- Global-server records belong under `data/global/` and must come from an independently verified Global source.
- Never copy Japanese availability or balance values into Global records.
- User ownership, veteran/legacy inventory, local game files, credentials, and runtime configuration do not belong here.

## Current state

The existing `references/catalog.json` is an incomplete extraction draft, not a complete reference catalog. The current Japanese installation is the first source for building `data/ja/`. Global completeness remains unavailable until a separate source and coverage are verified.

Every published catalog version must include a source build/hash, record counts, field coverage, unresolved relationships, and unavailable fields. A missing fact stays explicitly missing; build advice must not fill catalog gaps with website data.

## Updating

Use the local updater against the installed game data, review its generated records and coverage report, then publish the accepted catalog as an explicit repository update. Inventory imports and private synchronization use a different toolchain and a different repository.

See `docs/superpowers/specs/2026-10-18-uma-jp-build-advisor-design.md` and the implementation plans in `docs/superpowers/plans/` for the current architecture and workflow.
